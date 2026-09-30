import { GROUP_COLORS, GROUP_COLOR_KEYS } from "../store/look";

/**
 * `--g-<key>` for every group colour, from the domain palette (one source of truth): the darkened tone on
 * the light Day, the base tone on dark surfaces (UX §5). `--g-<key>-side` is always the base tone — the
 * sidebar is dark in every world.
 */
export function groupColorCss(): string {
  const light = GROUP_COLOR_KEYS.map((k) => `--g-${k}:${GROUP_COLORS[k].light};--g-${k}-side:${GROUP_COLORS[k].dark};`).join("");
  const dark = GROUP_COLOR_KEYS.map((k) => `--g-${k}:${GROUP_COLORS[k].dark};`).join("");
  return `:root{${light}}@media (prefers-color-scheme: dark){:root{${dark}}}:root[data-world="meta"]{${dark}}`;
}

export function installGroupColors(doc: Document = document): void {
  if (doc.getElementById("group-colors")) return;
  const style = doc.createElement("style");
  style.id = "group-colors";
  style.textContent = groupColorCss();
  doc.head.appendChild(style);
}
