// Photo and Video, labelled, on the Home screen: round buttons opposite the
// Home score on phones, a pair of pills under the top bar on desktop. (They
// were only in Explore's icons and deep in Share before.)
import { Icon } from "../ui/icons";

export function CaptureButtons({ onPhoto, onVideo }: { onPhoto: () => void; onVideo: () => void }) {
  return (
    <div className="dh-capture" role="group" aria-label="Photo and video" data-chrome="capture">
      <button type="button" className="dh-capture-btn" onClick={onPhoto}>
        <Icon.photo size={20} aria-hidden />
        <span>Photo</span>
      </button>
      <button type="button" className="dh-capture-btn" onClick={onVideo}>
        <Icon.video size={20} aria-hidden />
        <span>Video</span>
      </button>
    </div>
  );
}
