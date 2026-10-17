// The parts of n8ao's standalone pass the photo renderer uses (the package ships no types).
declare module "n8ao" {
  import type { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
  export class N8AOPass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: Record<string, unknown>;
    renderToScreen: boolean;
    render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget | null, readBuffer: WebGLRenderTarget | null): void;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}
