// "Talk to your home": a chat sheet at the bottom. Speak (the browser turns
// speech into text) or type; the phone answers navigation itself and asks the
// AI for the rest. Each request is one undo step, "Voice: …", with an Undo
// message; removing a room, emptying one, a new look or growing the house asks
// first. Lazy (its own chunk).
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button, IconButton, Segmented } from "../ui/primitives";
import { commandsLeft, sendCommand } from "./api";
import { buildVoiceContext, type RefMap } from "./context";
import { matchLocal, speaksHindi } from "./local";
import { runActions, type ViewIntent } from "./runTools";
import { TEXT_MAX, type VoiceAction } from "./tools";
import "./talk.css";

type Message = { id: number; who: "you" | "home"; text: string; tone?: "error" };
type Pending = { said: string; reply: string; actions: VoiceAction[]; refs: RefMap; ask: string };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionClass = new () => Recognition;

const EXAMPLES = ["Make the kitchen bigger", "Bedroom ko neela karo", "Add a pooja room near the entrance", "Show me the house at night", "Undo"];
const OFF = "Talking to your home isn’t switched on yet. I can still undo, show night or day, open a room, explore and show Vastu.";

function speechClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function TalkSheet({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const { prefs, setPrefs, dispatch } = editor;
  const latest = useRef(editor);
  latest.current = editor;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [credits, setCredits] = useState<{ live: boolean; left: number | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const rec = useRef<Recognition | null>(null);
  const abort = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const Speech = useRef(typeof window === "undefined" ? null : speechClass()).current;

  useEffect(() => {
    let live = true;
    void commandsLeft().then((c) => live && setCredits(c));
    input.current?.focus();
    return () => {
      live = false;
      abort.current?.abort();
      rec.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  const say = (who: Message["who"], text: string, tone?: Message["tone"]) => {
    if (!text) return;
    setMessages((m) => [...m.slice(-30), { id: ++seq.current, who, text, ...(tone ? { tone } : {}) }]);
    if (who === "home" && latest.current.prefs.talkSpeak && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[ऀ-ॿ]/.test(text) ? "hi-IN" : "en-IN";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };

  /** Shows a view the helper asked for; the sheet steps aside for anything that changes the picture. */
  const show = (v: ViewIntent) => {
    const { state } = latest.current;
    switch (v.type) {
      case "open-room":
        return dispatch({ type: "enter-room", floorId: v.floorId, roomId: v.roomId });
      case "home":
        if (state.focus) dispatch({ type: "leave-room" });
        if (state.mode === "explore" || state.mode === "outside") dispatch({ type: "set-mode", mode: "build" });
        return;
      case "outside":
        if (state.focus) dispatch({ type: "leave-room" });
        return dispatch({ type: "set-mode", mode: "outside" });
      case "explore":
        if (state.focus) dispatch({ type: "leave-room" });
        dispatch({ type: "set-mode", mode: "explore" });
        return dispatch({ type: "explore", view: v.view });
      case "hour":
        return dispatch({ type: "hour", hour: v.hour });
      case "sunlight":
        return dispatch({ type: "overlay", overlay: "sunlight" });
      case "vastu":
        if (state.focus) dispatch({ type: "leave-room" });
        // The Home score opens itself (it lives with the checklist ring).
        window.setTimeout(() => window.dispatchEvent(new Event("dh:show-score")), 0);
        return;
      case "photo":
        return dispatch({ type: "overlay", overlay: "photo" });
      case "video":
        return dispatch({ type: "overlay", overlay: "reel" });
    }
  };

  const carryOut = (said: string, actions: VoiceAction[], reply: string, refs: RefMap, confirmed: boolean) => {
    const { project, unit, activeFloor, run, undo, redo } = latest.current;
    const out = runActions(project, actions, refs, { unit, activeFloorId: activeFloor.id, confirmed });
    if (out.confirm) {
      setPending({ said, reply, actions, refs, ask: out.confirm });
      return;
    }
    setPending(null);
    for (const h of out.history) (h === "undo" ? undo : redo)();
    const label = `Voice: ${said.length > 48 ? `${said.slice(0, 47)}…` : said}`;
    if (out.changed) run({ ok: true, project: out.project }, label, { notice: reply || "Done. Undo brings it back.", undoable: true });
    if (out.history.length || out.changed || out.views.length) say("home", reply || (out.changed ? "Done." : ""));
    for (const note of out.notes) say("home", note);
    if (out.failure) say("home", out.failure, "error");
    if (out.views.length) {
      for (const v of out.views) show(v);
      // Anything but a new overlay: close the sheet so the change can be seen,
      // and keep the reply in sight as a message.
      if (!out.views.some((v) => v.type === "sunlight" || v.type === "photo" || v.type === "video")) {
        if (!out.changed && !out.failure && reply) dispatch({ type: "notify", text: reply, tone: "info" });
        onClose();
      }
    }
  };

  const send = async (raw: string) => {
    const said = raw.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
    if (!said || busy) return;
    setDraft("");
    setPending(null);
    say("you", said);
    const { project, unit, state, selected, prefs: p } = latest.current;
    const { context, refs } = buildVoiceContext(project, {
      unit,
      mode: state.mode,
      focus: state.focus,
      selectedRoomId: selected?.target.kind === "room" ? selected.target.id : null,
    });
    const hindi = speaksHindi(said, p.talkLang);
    const local = matchLocal(said, context.rooms);
    if (local) {
      const reply = hindi ? local.reply.hi : local.reply.en;
      if (!local.actions.length) return say("home", reply);
      return carryOut(said, local.actions, reply, refs, false);
    }
    if (credits && !credits.live) return say("home", OFF);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const answer = await sendCommand(said, hindi ? "hi" : "en", context, controller.signal);
    if (controller.signal.aborted) return;
    setBusy(false);
    if (!answer.ok) {
      if (answer.reason === "limit") setCredits((c) => ({ live: c?.live ?? true, left: 0 }));
      if (answer.reason === "offline") setCredits((c) => ({ live: false, left: c?.left ?? null }));
      return say("home", answer.message, "error");
    }
    setCredits((c) => ({ live: c?.live ?? true, left: answer.left }));
    if (!answer.actions.length) return say("home", answer.reply || "Sorry, I didn’t catch that. Try “make the kitchen bigger”.");
    carryOut(said, answer.actions, answer.reply, refs, false);
  };

  const listen = () => {
    if (!Speech) return;
    if (listening) {
      rec.current?.abort();
      setListening(false);
      return;
    }
    if (!prefs.talkNoteSeen) setPrefs({ talkNoteSeen: true });
    const r = new Speech();
    r.lang = prefs.talkLang === "hi" ? "hi-IN" : "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let heard = "";
    r.onresult = (e) => {
      const parts = Array.from(e.results);
      heard = parts.map((x) => x[0].transcript).join(" ");
      setDraft(heard);
      if (parts.every((x) => x.isFinal)) heard = heard.trim();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        say("home", "Allow the microphone to talk, or type instead.", "error");
      else if (e.error !== "aborted" && e.error !== "no-speech") say("home", "I didn’t catch that. Try again, or type it.", "error");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      if (heard.trim()) void send(heard);
    };
    rec.current = r;
    window.speechSynthesis?.cancel();
    try {
      r.start();
      setListening(true);
    } catch {
      say("home", "The microphone isn’t available. Type instead.", "error");
    }
  };

  const left = credits?.live && credits.left !== null ? credits.left : null;
  return (
    <section className="dh-talk" role="dialog" aria-modal="false" aria-labelledby="dh-talk-title" data-inset="auto">
      <header className="dh-talk-head">
        <h2 id="dh-talk-title">Talk to your home</h2>
        <IconButton icon={Icon.close} tone="plain" label="Close talk" onClick={onClose} />
      </header>
      <div className="dh-talk-tools">
        <Segmented
          label="Language"
          value={prefs.talkLang}
          options={[
            { value: "en", label: "English" },
            { value: "hi", label: "हिंदी" },
          ]}
          onChange={(talkLang) => setPrefs({ talkLang })}
        />
        <button
          type="button"
          className="dh-talk-speak"
          aria-pressed={prefs.talkSpeak}
          onClick={() => setPrefs({ talkSpeak: !prefs.talkSpeak })}
        >
          <Icon.sound size={18} aria-hidden />
          Read aloud
        </button>
      </div>
      {!prefs.talkNoteSeen && Speech && (
        <p className="dh-talk-note">
          <Icon.info size={16} aria-hidden />
          <span>
            Your browser turns speech into text (Google or Apple may process the audio). Dream Home receives only the text and doesn’t keep it.
          </span>
          <button type="button" onClick={() => setPrefs({ talkNoteSeen: true })}>
            OK
          </button>
        </p>
      )}
      <ol className="dh-talk-log" ref={list} aria-live="polite" aria-label="Conversation">
        {messages.map((m) => (
          <li key={m.id} className={`is-${m.who} ${m.tone ? `is-${m.tone}` : ""}`}>
            <span className="dh-visually-hidden">{m.who === "you" ? "You said: " : "Home: "}</span>
            {m.text}
          </li>
        ))}
        {busy && (
          <li className="is-home is-busy" aria-busy="true">
            Thinking…
          </li>
        )}
      </ol>
      {pending && (
        <div className="dh-talk-confirm" role="group" aria-label="Confirm the change" aria-live="polite">
          <p>{pending.ask}</p>
          <div>
            <Button variant="primary" onClick={() => carryOut(pending.said, pending.actions, pending.reply, pending.refs, true)}>
              Yes, do it
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPending(null);
                say("home", "OK, nothing changed.");
              }}
            >
              No
            </Button>
          </div>
        </div>
      )}
      {!messages.length && !pending && (
        <div className="dh-talk-examples" role="group" aria-label="Try saying">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => void send(e)}>
              “{e}”
            </button>
          ))}
        </div>
      )}
      <form
        className="dh-talk-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        {Speech && (
          <button
            type="button"
            className={`dh-talk-mic ${listening ? "is-listening" : ""}`}
            aria-label={listening ? "Stop listening" : "Speak"}
            aria-pressed={listening}
            onClick={listen}
          >
            <Icon.mic size={24} aria-hidden />
          </button>
        )}
        <input
          ref={input}
          value={draft}
          maxLength={TEXT_MAX}
          enterKeyHint="send"
          aria-label="What would you like to change?"
          placeholder={listening ? "Listening…" : prefs.talkLang === "hi" ? "बोलिए या लिखिए…" : "Say or type a change…"}
          onChange={(e) => setDraft(e.target.value)}
        />
        <IconButton icon={Icon.send} tone="plain" label="Send" type="submit" disabled={!draft.trim() || busy} />
      </form>
      <p className="dh-talk-foot">
        {!Speech ? "Tip: tap the 🎤 on your keyboard to speak." : listening ? "Listening… tap the microphone to stop." : "Tap the microphone and speak, or type."}
        {left !== null && ` ${left} left today.`}
      </p>
    </section>
  );
}
