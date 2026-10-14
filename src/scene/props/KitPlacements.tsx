// Generic GLB placement layer: loads a kit, batches the placements per slot and
// falls back to `fallback` while loading or when the kit cannot load.
import { Component, Suspense, use, useEffect, useMemo, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Material } from "three";
import type { AssetKit } from "../assets/assetManifest";
import type { MaterialLibrary } from "../materials/library";
import { buildBatches, disposeBatches, type Placement } from "./batched";
import { loadKit } from "./kit";

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Dream Home: models unavailable, using procedural stand-ins", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = {
  kit: AssetKit;
  placements: Placement[];
  library: MaterialLibrary;
  fallback: ReactNode;
  onPick?: (owner: string, event: ThreeEvent<MouseEvent>) => void;
};

export function KitPlacements(props: Props) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Batches {...props} />
      </Suspense>
    </Boundary>
  );
}

function Batches({ kit: name, placements, library, onPick }: Props) {
  const kit = use(loadKit(name));
  const batches = useMemo(() => {
    const materialFor = (slot: string): Material =>
      slot === "glass" ? library.glass() : (kit.materials.get(slot) ?? library.joinery());
    return buildBatches(kit, placements, materialFor);
  }, [kit, placements, library]);
  useEffect(() => () => disposeBatches(batches), [batches]);
  return (
    <group name={`kit-${name}`}>
      {batches.map((b) => (
        <primitive
          key={b.mesh.uuid}
          object={b.mesh}
          onClick={
            onPick
              ? (e: ThreeEvent<MouseEvent>) => {
                  const id = (e as unknown as { batchId?: number }).batchId;
                  const owner = id != null ? b.owners[id] : undefined;
                  if (owner) onPick(owner, e);
                }
              : undefined
          }
        />
      ))}
    </group>
  );
}
