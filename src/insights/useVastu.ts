// The Vastu score for the Home score, loading the Vastu rules only for homes
// that opted in (most never need them).
import { useEffect, useMemo, useState } from "react";
import type { Project } from "../domain/types";

type VastuModule = typeof import("./vastu");

export function useVastuScore(project: Project): number | null {
  const wanted = !!project.vastu && !!project.plot.compass;
  const [rules, setRules] = useState<VastuModule | null>(null);
  useEffect(() => {
    if (!wanted || rules) return;
    let live = true;
    void import("./vastu").then((m) => live && setRules(() => m));
    return () => {
      live = false;
    };
  }, [wanted, rules]);
  return useMemo(() => (wanted && rules ? (rules.vastuReport(project)?.score ?? null) : null), [wanted, rules, project]);
}
