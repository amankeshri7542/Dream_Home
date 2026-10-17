// The round "Talk" button: above the Home bar on phones, in the Room Studio's
// header, and in the top bar on desktop. It only opens the talk sheet, which
// (with everything it needs) loads when first used.
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import "./talkButton.css";

export function TalkButton({ place }: { place: "fab" | "header" | "top" }) {
  const { state, dispatch } = useEditor();
  const open = state.overlay === "talk";
  return (
    <button
      type="button"
      className={`dh-talk-btn is-${place}`}
      aria-label="Talk to your home"
      title="Talk to your home"
      aria-pressed={open}
      onClick={() => dispatch({ type: "overlay", overlay: open ? null : "talk" })}
    >
      <Icon.mic size={place === "fab" ? 26 : 20} aria-hidden />
      {place !== "header" && <span>Talk</span>}
    </button>
  );
}
