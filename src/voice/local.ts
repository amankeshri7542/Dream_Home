// The commonest phrases, answered on the phone without the AI: undo, redo,
// night, day, open a room, explore, the whole home, sunlight and Vastu. In
// English, Hinglish and Devanagari (what hi-IN speech recognition returns).
// It saves the daily allowance and works offline. Anything else goes to the AI.
import type { ContextRoom, VoiceAction } from "./tools";

export type Said = { en: string; hi: string };
export type LocalAnswer = { actions: VoiceAction[]; reply: Said };

const FILLER = new Set(["please", "plz", "pls", "now", "ab", "zara", "jara", "ji", "na", "कृपया", "ज़रा", "जरा", "अब", "जी"]);
const DIGITS = "०१२३४५६७८९";
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[०-९]/g, (d) => String(DIGITS.indexOf(d)))
    .replace(/[.,!?।"“”‘’]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
    .join(" ");
}

const PHRASES: [RegExp, (m: RegExpMatchArray) => LocalAnswer][] = [
  [
    /^(undo( that| it| (the )?last (change|step))?|undo (karo|kar do)|अनडू( करो| कर दो)?|पहले जैसा (करो|कर दो)|pehle jaisa (karo|kar do))$/,
    () => ({ actions: [{ tool: "undo", input: {} }], reply: { en: "Undone.", hi: "पहले जैसा कर दिया।" } }),
  ],
  [
    /^(redo( that| it)?|redo (karo|kar do)|(रीडू|रिडू)( करो| कर दो)?)$/,
    () => ({ actions: [{ tool: "redo", input: {} }], reply: { en: "Done again.", hi: "फिर से कर दिया।" } }),
  ],
  [
    /^((show )?(me )?(the )?(house |home )?(at )?night( time| mode)?|make it night|raat( karo| kar do| dikhao)?|ghar raat (mein|me) dikhao|रात( करो| कर दो| दिखाओ)?|(घर )?रात में दिखाओ|नाइट( मोड)?)$/,
    () => ({ actions: [{ tool: "set_time", input: { hour: 20 } }], reply: { en: "Here's your home at night.", hi: "ये रहा आपका घर रात में।" } }),
  ],
  [
    /^((show )?(me )?(the )?(house |home )?(in the |during the )?day(time|light)?|make it day|din( karo| kar do| dikhao)?|दिन( करो| कर दो| दिखाओ)?|(घर )?दिन में दिखाओ)$/,
    () => ({ actions: [{ tool: "set_time", input: { hour: 10.5 } }], reply: { en: "Back to daytime.", hi: "दिन हो गया।" } }),
  ],
  [
    /^(explore( the (house|home))?|lets explore|let's explore|explore karo|ghar ghumao|ghumao|एक्सप्लोर( करो)?|घर घुमाओ|घुमाओ)$/,
    () => ({ actions: [{ tool: "explore", input: { view: "orbit" } }], reply: { en: "Let's explore!", hi: "चलिए घूमते हैं!" } }),
  ],
  [
    /^(walk (inside|around|through)( the (house|home))?|take me inside|andar chalo|अंदर चलो|घर के अंदर चलो)$/,
    () => ({ actions: [{ tool: "explore", input: { view: "walk" } }], reply: { en: "Let's walk inside.", hi: "चलिए अंदर चलते हैं।" } }),
  ],
  [
    /^((show )?(me )?(the )?vastu( score| tips| check)?|vastu (dikhao|batao)|वास्तु( दिखाओ| बताओ| स्कोर)?)$/,
    () => ({ actions: [{ tool: "show_vastu", input: {} }], reply: { en: "Here's your Home score with Vastu tips.", hi: "ये रहा आपका होम स्कोर और वास्तु सुझाव।" } }),
  ],
  [
    /^((show )?(me )?(the )?(sunlight|sun path|sun)|dhoop (dikhao|batao)|धूप( दिखाओ| बताओ)?)$/,
    () => ({ actions: [{ tool: "show_sunlight", input: {} }], reply: { en: "Here's where the sun reaches.", hi: "देखिए धूप कहाँ आती है।" } }),
  ],
  [
    /^(go (back )?home|back to (the )?(house|home)|(show )?(me )?(the )?whole (house|home)|pura ghar( dikhao)?|पूरा घर( दिखाओ)?)$/,
    () => ({ actions: [{ tool: "go_home", input: {} }], reply: { en: "Here's the whole home.", hi: "ये रहा पूरा घर।" } }),
  ],
];

/** Words for each room, as people say them; matched against what rooms are called and used for. */
const ROOM_WORDS: [RegExp, (r: ContextRoom) => boolean][] = [
  [/^(kitchen|rasoi|रसोई|किचन)$/, (r) => r.kind === "kitchen"],
  [/^(living( room)?|hall|drawing room|baithak|लिविंग( रूम)?|हॉल|बैठक|ड्राइंग रूम)$/, (r) => r.kind === "living"],
  [/^(master|main) (bedroom|bed room)$|^मास्टर बेडरूम$/, (r) => r.kind === "bedroom" && /main|master/i.test(r.name)],
  [/^(bedroom|bed room|बेडरूम|शयन ?कक्ष)$/, (r) => r.kind === "bedroom"],
  [/^(bathroom|toilet|washroom|बाथरूम|टॉयलेट|शौचालय)$/, (r) => r.kind === "bathroom"],
  [/^(dining( room)?|डाइनिंग( रूम)?)$/, (r) => r.kind === "dining"],
  [/^(pooja( room)?|puja( room)?|mandir|पूजा( घर| कक्ष)?|मंदिर)$/, (r) => /pooja|puja|prayer|mandir/i.test(r.name)],
  [/^(study|office|स्टडी)$/, (r) => /study|office/i.test(r.name)],
];
const OPEN = [
  /^(?:open|show(?: me)?|go to|go into|take me to|enter)(?: the)? (.+?)(?: room)?$/,
  /^(.+?) (?:kholo|khol do|dikhao|me chalo|mein chalo)$/,
  /^(.+?) (?:खोलो|खोल दो|दिखाओ|में चलो|में जाओ)$/,
];

/** The room a phrase names: by its own name first, then by what people call that kind of room. */
function findRoom(phrase: string, rooms: readonly ContextRoom[]): ContextRoom[] {
  const bare = (n: string) => normalize(n).replace(/ room$/, "");
  const named = rooms.filter((r) => normalize(r.name) === phrase || bare(r.name) === phrase.replace(/ room$/, ""));
  if (named.length) return named;
  for (const [words, fits] of ROOM_WORDS) if (words.test(phrase)) return rooms.filter(fits);
  return [];
}

/** A phrase the phone can answer itself, or null to ask the AI. */
export function matchLocal(text: string, rooms: readonly ContextRoom[]): LocalAnswer | null {
  const said = normalize(text);
  if (!said) return null;
  for (const [pattern, answer] of PHRASES) {
    const m = said.match(pattern);
    if (m) return answer(m);
  }
  for (const pattern of OPEN) {
    const m = said.match(pattern);
    if (!m) continue;
    const found = findRoom(m[1].trim(), rooms);
    if (found.length === 1)
      return {
        actions: [{ tool: "open_room", input: { room: found[0].ref } }],
        reply: { en: `Opening ${found[0].name}.`, hi: `${found[0].name} खोल रहे हैं।` },
      };
    if (found.length > 1) {
      const names = found.slice(0, 4).map((r) => r.name).join(", ");
      return { actions: [], reply: { en: `Which one? ${names}.`, hi: `कौन सा? ${names}।` } };
    }
  }
  return null;
}

/** Devanagari in what was said, or Hindi chosen: answer in Hindi. */
export const speaksHindi = (text: string, lang: "en" | "hi") => lang === "hi" || /[ऀ-ॿ]/.test(text);
