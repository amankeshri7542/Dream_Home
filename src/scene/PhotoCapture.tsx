// High-resolution photo capture: on each new request id, raise the DPR
// (default ×2, capped by the max texture size), render one frame, grab the
// canvas in the same rAF (afterEffect → toBlob, no preserveDrawingBuffer),
// then restore the DPR. DOM overlays (labels) are naturally excluded.
import { useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";

type Props = { request: { id: number; scale?: number } | null; onPhoto?: (blob: Blob) => void };

export function PhotoCapture({ request, onPhoto }: Props) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const handled = useRef<number | null>(null);
  const onPhotoRef = useRef(onPhoto);
  onPhotoRef.current = onPhoto;
  const latest = useRef({ size, dpr });
  latest.current = { size, dpr };
  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id;
    const previous = latest.current.dpr;
    const maxTex = gl.capabilities.maxTextureSize || 4096;
    const { width, height } = latest.current.size;
    const scale = request.scale ?? 2;
    const cap = Math.min(maxTex / Math.max(1, width), maxTex / Math.max(1, height), 4);
    const target = Math.max(previous, Math.min(scale, cap));
    setDpr(target);
    let frames = 0;
    let unsubscribe: (() => void) | null = null;
    // An invalidate() from inside an after-effect lands while the demand loop
    // is winding down and is dropped; ask for the next frame from a fresh rAF.
    const nextFrame = () => requestAnimationFrame(() => invalidate());
    // Wait one frame for the resize to land, capture right after the next render.
    unsubscribe = addAfterEffect(() => {
      frames++;
      if (frames < 2) {
        nextFrame();
        return;
      }
      unsubscribe?.();
      unsubscribe = null;
      gl.domElement.toBlob((blob) => {
        if (blob) onPhotoRef.current?.(blob);
      }, "image/png");
      setDpr(previous);
      nextFrame();
    });
    invalidate();
    return () => {
      if (unsubscribe) {
        unsubscribe();
        setDpr(previous);
        // Not captured yet (e.g. StrictMode re-run): allow a retry.
        handled.current = null;
      }
    };
  }, [request, gl, setDpr, invalidate]);
  return null;
}
