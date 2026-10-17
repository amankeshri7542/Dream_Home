// A home's name as anyone may see it (link pages, previews, the link's
// picture): no links, web addresses, phone numbers or e-mail addresses, so a
// shared home never becomes a scam advert on our domain. Shared by the server
// (which stores the cleaned name) and the app (which draws it on the picture).

export const HIDDEN_NAME = "A Dream Home";

export function publicName(name: string, fallback = HIDDEN_NAME): string {
  const cleaned = name
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "")
    .replace(/[\p{L}\p{N}.+_-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]+/gu, "")
    // Anything shaped like a web address ("scam.shop/win", "example.dev").
    .replace(/[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}\b\S*/gu, "")
    // Phone numbers: runs of 8 or more digits in any script (spaces and dashes allowed), not "Plot 12 - 2024".
    .replace(/\+?\p{Nd}[\p{Nd}\s().-]{6,}\p{Nd}/gu, (run) => (run.replace(/\P{Nd}/gu, "").length >= 8 ? "" : run))
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned.length >= 2 ? cleaned : fallback;
}
