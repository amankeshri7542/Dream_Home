// Debug bridge exposed for tests and the lab (dev, webdriver or ?debug).
export type DreamHomeBridge = {
  ready: boolean;
  frame: number;
  quality: string;
  kit?: string;
  /** Incremented on every Canvas mount — the shell asserts it stays 1. */
  canvasMounts: number;
  renderer(): { calls: number; triangles: number; geometries: number; textures: number; programs: number };
  camera(): {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    distance: number;
    azimuth: number;
    polar: number;
    focal: [number, number, number];
  };
  modelScreenBounds(): { x: number; y: number; width: number; height: number; coverage: number } | null;
  screenOf(id: string): { x: number; y: number } | null;
  projectToScreen(p: { x: number; z: number; floorId?: string; y?: number }): { x: number; y: number };
  isAnimating(): boolean;
  waitForIdle(): Promise<void>;
  lighting(): { hour: number; sun: [number, number, number]; windowGlow: number };
};

declare global {
  interface Window {
    __dreamHome?: DreamHomeBridge;
  }
}
