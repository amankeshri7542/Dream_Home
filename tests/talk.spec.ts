// M7: talk to your home. /api/command is mocked (tests never call the AI): it
// answers with tool calls for the rooms in the context the app sends. Typed
// requests change the home as one undo step; big changes ask first; the
// phone answers navigation itself; speech is a fake that emits a transcript.
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mobile, noOverflow, seed, stored } from "./support/dreamHome";

const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/talk", { recursive: true });

type Ctx = { rooms: { ref: string; name: string; w: number; d: number }[] };
type Sent = { text: string; lang: string; context: Ctx };

/** The command API, mocked: a few phrases become tool calls for the home described. */
async function mockCommand(page: Page, { live = true, left = 15 } = {}) {
  const sent: Sent[] = [];
  await page.route("**/api/command**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { ok: true, live, left } });
    const body = req.postDataJSON() as Sent;
    sent.push(body);
    const room = (name: string) => body.context.rooms.find((r) => r.name === name)!;
    const t = body.text.toLowerCase();
    if (t.includes("kitchen bigger")) {
      const k = room("Kitchen");
      return route.fulfill({ json: { ok: true, reply: "Making the kitchen 2 ft wider.", actions: [{ tool: "resize_room", input: { room: k.ref, width: k.w - 2 } }], left: left - 1 } });
    }
    if (t.includes("remove bedroom 2"))
      return route.fulfill({ json: { ok: true, reply: "Removing Bedroom 2.", actions: [{ tool: "remove_room", input: { room: room("Bedroom 2").ref } }], left: left - 1 } });
    if (t.includes("neela"))
      return route.fulfill({
        json: { ok: true, reply: "Bedroom 1 ko neela kar rahe hain.", actions: [{ tool: "paint_walls", input: { room: room("Bedroom 1").ref, paint: "dusty-blue" } }], left: left - 1 },
      });
    return route.fulfill({ json: { ok: true, reply: "Sorry, I can't do that yet.", actions: [], left: left - 1 } });
  });
  return sent;
}

/** A pretend microphone: says `transcript` a moment after it starts. */
async function fakeSpeech(page: Page, transcript: string) {
  await page.addInitScript((said) => {
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { __heardLang: string }).__heardLang = this.lang;
        setTimeout(() => {
          this.onresult?.({ results: [Object.assign([{ transcript: said }], { isFinal: true })] });
          this.onend?.();
        }, 150);
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  }, transcript);
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Talk to your home" });
async function say(page: Page, text: string) {
  await sheet(page).getByRole("textbox", { name: "What would you like to change?" }).fill(text);
  await sheet(page).getByRole("button", { name: "Send" }).click();
}
const kitchenWidth = async (page: Page) => (await stored(page)).floors[0].rooms.find((r) => r.name === "Kitchen")!.bounds.w;

test("on a phone: type a change, it happens as one undo step, and Undo brings it back", async ({ page }) => {
  await page.setViewportSize(mobile);
  const sent = await mockCommand(page);
  await seed(page, createPreset("family"));
  await page.getByRole("button", { name: "Talk to your home" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toContainText("Dream Home receives only the text");
  await expect(sheet(page).getByRole("group", { name: "Try saying" })).toContainText("Bedroom ko neela karo");
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/sheet-390.png" });

  const before = await kitchenWidth(page);
  await say(page, "Make the kitchen bigger");
  await expect.poll(() => kitchenWidth(page)).toBeLessThan(before);
  expect(sent).toHaveLength(1);
  expect(sent[0].lang).toBe("en");
  expect(JSON.stringify(sent[0].context)).not.toContain("floor-0-kitchen");
  await expect(sheet(page).getByRole("list", { name: "Conversation" })).toContainText("Making the kitchen 2 ft wider.");
  await expect(sheet(page)).toContainText("14 left today.");
  await expect(page.getByRole("button", { name: "Undo last change" })).toHaveAttribute("title", "Undo: Voice: Make the kitchen bigger");
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => kitchenWidth(page)).toBe(before);

  // Hinglish, answered in kind.
  await say(page, "Bedroom ko neela karo");
  await expect.poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.name === "Bedroom 1")!.wallColor).toBe("dusty-blue");
  await expect(sheet(page)).toContainText("Bedroom 1 ko neela kar rahe hain.");
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/done-390.png" });
  await sheet(page).getByRole("button", { name: "Close talk" }).click();
  await page.getByRole("button", { name: "Talk to your home" }).click();
  await say(page, "open the kitchen");
  const studio = page.getByRole("complementary", { name: "Kitchen studio" });
  await expect(studio.getByRole("button", { name: "Talk to your home" })).toBeVisible();
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/room-390.png" });
});

test("the Talk button is a round button above the Home bar on phones and tablets", async ({ page }) => {
  await mockCommand(page);
  await seed(page, createPreset("family"));
  for (const size of [mobile, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    const talk = page.getByRole("button", { name: "Talk to your home" });
    // The layout switches from desktop a moment after the resize.
    await expect.poll(async () => {
      const b = await talk.boundingBox();
      return b && [Math.round(b.width), Math.round(b.height)];
    }).toEqual([64, 64]);
    const box = (await talk.boundingBox())!;
    const bar = (await page.getByRole("toolbar", { name: "Home actions" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    expect(box.x + box.width).toBeGreaterThan(size.width - 80);
    await noOverflow(page);
    if (shots) await page.screenshot({ path: `docs/screenshots/talk/button-${size.width}.png` });
  }
});

test("removing a room asks first; No changes nothing, Yes removes it", async ({ page }) => {
  await mockCommand(page);
  await seed(page, createPreset("family"));
  await page.getByRole("button", { name: "Talk to your home" }).first().click();
  const count = async () => (await stored(page)).floors.flatMap((f) => f.rooms).length;
  const rooms = await count();
  await say(page, "remove bedroom 2");
  const confirm = sheet(page).getByRole("group", { name: "Confirm the change" });
  await expect(confirm).toContainText("I’ll remove Bedroom 2. OK?");
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/confirm-1440.png" });
  await confirm.getByRole("button", { name: "No" }).click();
  await expect(sheet(page)).toContainText("OK, nothing changed.");
  expect(await count()).toBe(rooms);
  await say(page, "remove bedroom 2");
  await sheet(page).getByRole("button", { name: "Yes, do it" }).click();
  await expect.poll(count).toBe(rooms - 1);
  await expect(page.getByRole("button", { name: "Undo last change" })).toHaveAttribute("title", "Undo: Voice: remove bedroom 2");
});

test("the phone answers navigation itself, in English and Hindi, without the AI", async ({ page }) => {
  const sent = await mockCommand(page);
  await seed(page, createPreset("family"));
  await page.getByRole("button", { name: "Talk to your home" }).first().click();
  await say(page, "Show me the house at night");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Here's your home at night.");
  await expect.poll(() => page.evaluate(() => window.__dreamHome!.lighting().hour)).toBe(20);
  await page.getByRole("button", { name: "Talk to your home" }).first().click();
  await say(page, "किचन खोलो");
  await expect(page.getByRole("heading", { name: "Kitchen", level: 2 })).toBeVisible();
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Kitchen खोल रहे हैं।");
  // In a room on desktop, Talk stays in the top bar.
  await page.getByRole("banner").getByRole("button", { name: "Talk to your home" }).click();
  await say(page, "undo");
  expect(sent).toHaveLength(0);
});

test("speaking: the microphone's words are sent in the chosen language", async ({ page }) => {
  await page.setViewportSize(mobile);
  await fakeSpeech(page, "Bedroom ko neela karo");
  const sent = await mockCommand(page);
  await seed(page, createPreset("family"));
  await page.getByRole("button", { name: "Talk to your home" }).click();
  await sheet(page).getByRole("radio", { name: "हिंदी" }).click();
  await sheet(page).getByRole("button", { name: "Speak" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ text: "Bedroom ko neela karo", lang: "hi" });
  expect(await page.evaluate(() => (window as unknown as { __heardLang: string }).__heardLang)).toBe("hi-IN");
  await expect.poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.name === "Bedroom 1")!.wallColor).toBe("dusty-blue");
  // The privacy note was seen once the microphone was used.
  await expect(sheet(page)).not.toContainText("Dream Home receives only the text");
});

test("without speech or the AI, typing and navigation still work, and it fits at 320 px in Extra large", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => {
    for (const key of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, key, { value: undefined, configurable: true });
  });
  const sent = await mockCommand(page, { live: false });
  await seed(page, createPreset("family"));
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("dream-home.preferences.v1")!);
    localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ ...prefs, textSize: "extra" }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Talk to your home" }).click();
  await expect(sheet(page)).toContainText("Tip: tap the 🎤 on your keyboard to speak.");
  await expect(sheet(page).getByRole("button", { name: "Speak" })).toHaveCount(0);
  await say(page, "Make the kitchen bigger");
  await expect(sheet(page)).toContainText("Talking to your home isn’t switched on yet.");
  expect(sent).toHaveLength(0);
  await noOverflow(page);
  // Nothing crowds the top bar while the sheet is open.
  await expect(page.getByRole("button", { name: "Fit home" })).toBeHidden();
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/offline-320-xl.png" });
  await say(page, "open bedroom 2");
  await expect(page.getByRole("heading", { name: "Bedroom 2", level: 2 })).toBeVisible();
  // The room's name keeps a line of its own beside the studio's buttons.
  expect((await page.getByRole("heading", { name: "Bedroom 2", level: 2 }).boundingBox())!.width).toBeGreaterThan(150);
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/talk/room-320-xl.png" });
});

test("with Extra large text and a microphone, the input stays on screen; हिंदी speaks Hindi", async ({ page }) => {
  await fakeSpeech(page, "रसोई खोलो");
  await mockCommand(page);
  await seed(page, createPreset("family"));
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("dream-home.preferences.v1")!);
    localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ ...prefs, textSize: "extra" }));
  });
  for (const size of [
    { width: 320, height: 640 },
    { width: 390, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    await page.getByRole("button", { name: "Talk to your home" }).click();
    await expect(sheet(page)).toContainText("Dream Home receives only the text"); // the privacy note is showing
    for (const control of [sheet(page).getByRole("button", { name: "Speak" }), sheet(page).getByRole("textbox", { name: "What would you like to change?" })]) {
      const box = (await control.boundingBox())!;
      expect(box.y + box.height, `${size.width}px`).toBeLessThanOrEqual(size.height);
    }
    await noOverflow(page);
    if (shots) await page.screenshot({ path: `docs/screenshots/talk/xl-mic-${size.width}.png` });
    await sheet(page).getByRole("button", { name: "Close talk" }).click();
  }
  await page.getByRole("button", { name: "Talk to your home" }).click();
  await sheet(page).getByRole("radio", { name: "हिंदी" }).click();
  await expect(sheet(page).getByRole("group", { name: "Try saying" })).toContainText("रसोई बड़ी करो");
  await expect(sheet(page)).toContainText("माइक दबाकर बोलिए, या लिखिए।");
  await say(page, "remove bedroom 2");
  await expect(sheet(page).getByRole("group", { name: "Confirm the change" })).toContainText("मैं Bedroom 2 हटा दूँगा। ठीक है?");
  await expect(sheet(page).getByRole("button", { name: "हाँ, कर दो" })).toBeVisible();
});
