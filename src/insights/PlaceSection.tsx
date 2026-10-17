// The plot sheet's "Where is it?": the city (for the real sun) and which way
// the home faces (true north). Lazy: the city list and pickers load on open.
import { COMPASS_LABEL, homeFacing } from "../domain/compass";
import { setFacing, setLocation } from "../domain/place";
import { useEditor } from "../editor/EditorProvider";
import { CityPicker } from "./CityPicker";
import { FacingPicker } from "./FacingPicker";

export default function PlaceSection() {
  const { project, run } = useEditor();
  return (
    <>
      <CityPicker
        value={project.plot.location}
        onPick={(location) =>
          run(setLocation(project, location), location ? `Set the city to ${location.city}` : "Forget the city", {
            notice: location ? `The sun now rises and sets as it does in ${location.city}.` : undefined,
          })
        }
      />
      <FacingPicker
        value={homeFacing(project)}
        onPick={(facing) =>
          run(setFacing(project, facing), "Set which way the home faces", {
            notice: `Your home faces ${COMPASS_LABEL[facing].toLowerCase()}. North is set.`,
          })
        }
      />
    </>
  );
}
