import { describe, expect, it } from "vitest";
import {
  detectTier,
  measuredTier,
  median,
  parseQualityParam,
  resolveTier,
  stepDown,
  tierDpr,
  TIERS,
} from "./quality";

describe("quality tiers", () => {
  it("has the agreed tier table", () => {
    expect(TIERS.battery).toMatchObject({ dprMax: 1.25, shadowMapSize: 1024, envSize: 64, post: "none", textureSize: 256 });
    expect(TIERS.balanced).toMatchObject({ dprMax: 1.5, shadowMapSize: 2048, envSize: 128, post: "balanced", aoStrips: 0.5 });
    expect(TIERS.beautiful).toMatchObject({ dprMax: 2, shadowMapSize: 4096, post: "beautiful", aoStrips: 0, textureSize: 512 });
  });
  it("detects software and weak GPUs as battery", () => {
    expect(detectTier({ renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" })).toBe("battery");
    expect(detectTier({ renderer: "llvmpipe (LLVM 15.0.7, 256 bits)" })).toBe("battery");
    expect(detectTier({ renderer: "Mali-400 MP" })).toBe("battery");
  });
  it("detects phones / low memory as balanced, otherwise beautiful", () => {
    expect(detectTier({ renderer: "Apple GPU", coarsePointer: true })).toBe("balanced");
    expect(detectTier({ renderer: "ANGLE (Apple M4)", deviceMemory: 4 })).toBe("balanced");
    expect(detectTier({ renderer: "ANGLE (Apple M4)", hardwareConcurrency: 4 })).toBe("balanced");
    expect(detectTier({ renderer: "ANGLE (Apple M4)", deviceMemory: 16, hardwareConcurrency: 10 })).toBe("beautiful");
  });
  it("parses the URL override", () => {
    expect(parseQualityParam("?quality=battery")).toBe("battery");
    expect(parseQualityParam("?x=1&quality=beautiful")).toBe("beautiful");
    expect(parseQualityParam("?quality=ultra")).toBeNull();
    expect(parseQualityParam("")).toBeNull();
  });
  it("resolves precedence: prop > URL > stored > detected", () => {
    expect(resolveTier({ setting: "battery", search: "?quality=beautiful", stored: "balanced", detected: "beautiful" })).toEqual({
      tier: "battery",
      source: "prop",
    });
    expect(resolveTier({ setting: "auto", search: "?quality=beautiful", stored: "battery", detected: "balanced" }).tier).toBe("beautiful");
    expect(resolveTier({ setting: "auto", search: "", stored: "battery", detected: "beautiful" })).toEqual({ tier: "battery", source: "stored" });
    expect(resolveTier({ setting: "auto", search: "", stored: null, detected: "balanced" })).toEqual({ tier: "balanced", source: "detected" });
  });
  it("steps down once when the median frame time is slow", () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(measuredTier("beautiful", Array(40).fill(35))).toBe("balanced");
    expect(measuredTier("beautiful", Array(40).fill(16))).toBe("beautiful");
    expect(stepDown("battery")).toBe("battery");
  });
  it("caps DPR by tier", () => {
    expect(tierDpr(TIERS.battery, 3)).toEqual([1, 1.25]);
    expect(tierDpr(TIERS.beautiful, 1)).toEqual([1, 1]);
    expect(tierDpr(TIERS.balanced, 2)).toEqual([1, 1.5]);
  });
});
