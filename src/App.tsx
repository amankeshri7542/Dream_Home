import { EditorProvider } from "./editor/EditorProvider";
import { AppShell } from "./shell/AppShell";

export default function App() {
  return (
    <EditorProvider>
      <AppShell />
    </EditorProvider>
  );
}
