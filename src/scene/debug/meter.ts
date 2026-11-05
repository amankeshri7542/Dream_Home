// A small live readout for real-phone checks, shown only at `?debug=meter`
// (docs/OWNER-P0.md). It reads the debug bridge twice a second and never asks
// for a frame, so an idle scene stays idle. Plain DOM in its own lazy chunk;
// nobody else ever downloads it.
const PERIOD_MS = 500;
/** Moving frames over the last half a minute: enough for "hold the joystick and read the number". */
const KEEP = 60;

function gpuName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = (info && gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) || "unknown GPU";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name);
  } catch {
    return "unknown GPU";
  }
}

export function startMeter() {
  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.setAttribute("aria-label", "Phone meter");
  box.style.cssText =
    "position:fixed;left:8px;top:50%;z-index:2147483000;max-width:min(240px,70vw);padding:8px 10px;border-radius:10px;background:rgb(0 0 0 / 78%);color:#fff;font:calc(12px * var(--dh-text, 1))/1.4 ui-monospace,monospace;pointer-events:none;white-space:pre-wrap";
  document.body.append(box);
  const gpu = gpuName();
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const device = `${navigator.hardwareConcurrency || "?"} cores · ${memory ?? "?"} GB`;
  const moving: number[] = [];
  let frame = window.__dreamHome?.frame ?? 0;
  let at = performance.now();
  window.setInterval(() => {
    const bridge = window.__dreamHome;
    const now = performance.now();
    const next = bridge?.frame ?? frame;
    const rate = ((next - frame) * 1000) / Math.max(1, now - at);
    frame = next;
    at = now;
    if (rate > 0) {
      moving.push(rate);
      if (moving.length > KEEP) moving.shift();
    }
    const sorted = [...moving].sort((a, b) => a - b);
    const median = sorted.length ? sorted[sorted.length >> 1] : 0;
    const low = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
    let calls = "?",
      triangles = "?";
    try {
      const r = bridge?.renderer();
      if (r) {
        calls = String(r.calls);
        triangles = `${Math.round(r.triangles / 1000)}k`;
      }
    } catch {
      // The scene isn't ready yet.
    }
    box.textContent = [
      rate > 0 ? `${Math.round(rate)} frames a second now` : "idle (no frames needed)",
      sorted.length ? `moving: ${Math.round(median)} typical, ${Math.round(low)} worst` : "moving: move to measure",
      `${calls} draw calls · ${triangles} triangles`,
      `quality: ${bridge?.quality ?? "?"}`,
      device,
      gpu,
    ].join("\n");
  }, PERIOD_MS);
}
