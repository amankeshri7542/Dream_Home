// A QR code for the end card, as a grid of dark modules (true = dark).
// Medium error correction survives a phone filming another phone's screen.
import qrcode from "qrcode-generator";

export function qrModules(text: string): boolean[][] {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const n = code.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => code.isDark(row, col)));
}
