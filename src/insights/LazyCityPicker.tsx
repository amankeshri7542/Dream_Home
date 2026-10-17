// The city picker, loaded when first shown (the AI brief and the start wizard).
import { lazy, Suspense, type ComponentProps } from "react";
import type { CityPicker as Picker } from "./CityPicker";

const CityPicker = lazy(() => import("./CityPicker").then((m) => ({ default: m.CityPicker })));

export function LazyCityPicker(props: ComponentProps<typeof Picker>) {
  return (
    <Suspense fallback={null}>
      <CityPicker {...props} />
    </Suspense>
  );
}
