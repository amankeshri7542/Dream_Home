// Build bucketed geometry in a memo and dispose replaced geometry on change.
import { useEffect, useMemo, type DependencyList } from "react";
import type { BufferGeometry } from "three";
import type { Buckets, QuadBuilder } from "./geometry/QuadBuilder";

export type BuiltBucket<K extends string> = {
  key: K;
  geometry: BufferGeometry;
  /** Owner lookup by triangle (faceIndex). */
  ownerAt: (face: number) => string | null;
};

/** Binary search of owner ranges (sorted by start triangle). */
export function ownerLookup(
  owners: readonly { start: number; id: string | null }[],
  face: number,
): string | null {
  let lo = 0,
    hi = owners.length - 1,
    found: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (owners[mid].start <= face) {
      found = owners[mid].id;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function buildBuckets<K extends string>(buckets: Buckets<K>): BuiltBucket<K>[] {
  return buckets.entries().map(([key, b]: [K, QuadBuilder]) => {
    const owners = b.owners.slice();
    return {
      key,
      geometry: b.build(),
      ownerAt: (face: number) => ownerLookup(owners, face),
    };
  });
}

export function useBuckets<K extends string, X = undefined>(
  build: () => { buckets: Buckets<K>; extra?: X },
  deps: DependencyList,
): { built: BuiltBucket<K>[]; extra: X | undefined } {
  const result = useMemo(() => {
    const r = build();
    return { built: buildBuckets(r.buckets), extra: r.extra };
    // `deps` is the caller's dependency list (same contract as useMemo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => result.built.forEach((b) => b.geometry.dispose()), [result]);
  return result;
}
