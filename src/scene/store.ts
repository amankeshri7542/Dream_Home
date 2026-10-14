// A tiny per-Canvas store (useSyncExternalStore) plus a tween runner.
// `animating` > 0 keeps the demand frameloop invalidating; when it reaches 0
// the scene goes fully idle (zero frames).
import { createContext, useContext, useSyncExternalStore } from "react";

export type SceneState = {
  animating: number;
  cameraMoving: boolean;
  /** Bumped whenever something that affects shadows/visuals changes. */
  sceneVersion: number;
  ready: boolean;
  frame: number;
};

export type Tween = {
  duration: number;
  elapsed: number;
  update: (t: number) => void;
  done?: () => void;
};

export type SceneStore = ReturnType<typeof createSceneStore>;

export function createSceneStore() {
  let state: SceneState = {
    animating: 0,
    cameraMoving: false,
    sceneVersion: 0,
    ready: false,
    frame: 0,
  };
  const listeners = new Set<() => void>();
  const tweens = new Set<Tween>();
  let invalidate: () => void = () => {};
  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<SceneState>) => {
    state = { ...state, ...patch };
    emit();
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set,
    /** Frame counter updates are silent (no React re-render). */
    tickFrame() {
      state.frame++;
    },
    bumpVersion() {
      state = { ...state, sceneVersion: state.sceneVersion + 1 };
      emit();
      invalidate();
    },
    setInvalidate(fn: () => void) {
      invalidate = fn;
    },
    invalidate: () => invalidate(),
    /** Start a tween; duration 0 applies the final state immediately. */
    tween(duration: number, update: (t: number) => void, done?: () => void) {
      if (duration <= 0) {
        update(1);
        done?.();
        invalidate();
        return () => {};
      }
      const tw: Tween = { duration, elapsed: 0, update, done };
      tweens.add(tw);
      state.animating = tweens.size;
      update(0);
      invalidate();
      return () => {
        if (tweens.delete(tw)) state.animating = tweens.size;
      };
    },
    /** Advance tweens; called once per rendered frame. */
    step(delta: number) {
      if (!tweens.size) return false;
      // Clamp huge deltas (tab switches) so tweens still play visibly.
      const dt = Math.min(delta, 1 / 20);
      for (const tw of [...tweens]) {
        tw.elapsed += dt;
        const t = Math.min(1, tw.elapsed / tw.duration);
        tw.update(t);
        if (t >= 1) {
          tweens.delete(tw);
          tw.done?.();
        }
      }
      state.animating = tweens.size;
      return true;
    },
    isAnimating: () => tweens.size > 0,
  };
}

export const SceneStoreContext = createContext<SceneStore | null>(null);
export function useSceneStore(): SceneStore {
  const store = useContext(SceneStoreContext);
  if (!store) throw new Error("SceneStoreContext missing");
  return store;
}
export function useSceneState<T>(select: (s: SceneState) => T): T {
  const store = useSceneStore();
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
