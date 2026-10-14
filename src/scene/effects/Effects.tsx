// Post-processing (lazy chunk, never loaded on the battery tier):
// N8AO ambient occlusion (no accumulation, so idle frames stay idle), bloom
// at night, tilt-shift in showcase, SMAA, and neutral tone mapping last.
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { HalfFloatType } from "three";
import type { QualityTier } from "../../editor/types";

type N8AOPass = { configuration: { transparencyAware: boolean; accumulate: boolean; gammaCorrection: boolean } };

export default function Effects({ tier, night, showcase }: { tier: QualityTier; night: boolean; showcase: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const ao = useRef<N8AOPass>(null);
  const balanced = tier === "balanced";
  useEffect(() => {
    const pass = ao.current;
    if (pass) {
      // Ignore transparent glass/overlays (saves a second scene render).
      pass.configuration.transparencyAware = false;
      pass.configuration.accumulate = false;
    }
    invalidate();
    return () => invalidate();
  }, [invalidate, tier]);
  return (
    <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={HalfFloatType}>
      <N8AO
        ref={ao as never}
        halfRes={balanced}
        quality={balanced ? "performance" : "medium"}
        aoRadius={0.9}
        distanceFalloff={0.6}
        intensity={2.2}
        color="#2b2118"
      />
      {night ? <Bloom mipmapBlur luminanceThreshold={1} intensity={0.6} /> : <></>}
      {showcase && tier === "beautiful" ? <TiltShift2 blur={0.12} taper={0.55} /> : <></>}
      <SMAA />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
