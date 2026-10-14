import { useRef, useState } from "react";
import { walkInput } from "./walkInput";

/** A thumb joystick for walking on touch screens (also works with a mouse). */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const RADIUS = 48;
  const update = (clientX: number, clientY: number) => {
    const r = base.current!.getBoundingClientRect();
    let x = clientX - (r.left + r.width / 2),
      y = clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > RADIUS) {
      x = (x / len) * RADIUS;
      y = (y / len) * RADIUS;
    }
    setKnob({ x, y });
    const dead = 8;
    walkInput.strafe = Math.abs(x) > dead ? x / RADIUS : 0;
    walkInput.forward = Math.abs(y) > dead ? -y / RADIUS : 0;
    walkInput.run = len > RADIUS * 0.95;
    walkInput.wake?.();
  };
  const release = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    walkInput.forward = 0;
    walkInput.strafe = 0;
    walkInput.run = false;
  };
  return (
    <div
      ref={base}
      className="dh-joystick"
      role="application"
      aria-label="Walk joystick: drag to move. Keyboard: W A S D or arrow keys."
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.pointerId === active.current && update(e.clientX, e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
