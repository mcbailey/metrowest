// Season cards: a 1200x630 PNG per team, used as the link preview (og:image) when a team page is shared.
// Rendered from an SVG template with resvg and the bundled Inter font (scripts/fonts, SIL Open Font License).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_FILES = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"].map((f) => path.join(HERE, "fonts", f));

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

let logoDataUri = null;

export async function loadCardAssets(logoPath) {
  const logo = await readFile(logoPath);
  logoDataUri = `data:image/png;base64,${logo.toString("base64")}`;
}

/** Shrink long text: approximate Inter's average glyph width (about 0.56em bold) to fit `maxWidth`. */
function fitSize(text, maxWidth, maxSize, minSize, widthPerEm = 0.56) {
  const size = Math.floor(maxWidth / (Math.max(1, text.length) * widthPerEm));
  return Math.max(minSize, Math.min(maxSize, size));
}

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b1f45"/>
  <rect x="0" y="0" width="1200" height="168" fill="#081631"/>
  <rect x="0" y="618" width="1200" height="12" fill="#d61133"/>
  ${logoDataUri ? `<image x="60" y="48" width="96" height="96" xlink:href="${logoDataUri}"/>` : ""}
  <text x="176" y="88" font-family="Inter" font-weight="800" font-size="24" letter-spacing="3" fill="#8fb4ff">MWSTATS.COM</text>
  <text x="176" y="124" font-family="Inter" font-weight="700" font-size="26" fill="#dbe6ff">Metrowest Youth Basketball</text>
  ${inner}
</svg>`;
}

function stat(x, label, value) {
  return `<text x="${x}" y="470" font-family="Inter" font-weight="700" font-size="22" letter-spacing="2" fill="#8fb4ff">${esc(label)}</text>
  <text x="${x}" y="540" font-family="Inter" font-weight="800" font-size="64" fill="#ffffff">${esc(value)}</text>`;
}

/**
 * team: { name, group, division, town, season, record, rank, divisionSize, playoff } (all display strings).
 */
export function teamCardSvg(team) {
  const nameSize = fitSize(team.name, 1080, 76, 44);
  const playoff = team.playoff
    ? `<rect x="60" y="${330}" rx="22" ry="22" width="${Math.min(1080, 40 + team.playoff.length * 15)}" height="44" fill="#f5c542"/>
  <text x="82" y="${360}" font-family="Inter" font-weight="800" font-size="24" fill="#2a1d00">${esc(team.playoff)}</text>`
    : "";
  return frame(`
  <text x="1140" y="88" text-anchor="end" font-family="Inter" font-weight="700" font-size="26" fill="#dbe6ff">${esc(team.season)} season</text>
  <text x="60" y="240" font-family="Inter" font-weight="800" font-size="${nameSize}" fill="#ffffff">${esc(team.name)}</text>
  <text x="60" y="296" font-family="Inter" font-weight="400" font-size="30" fill="#c9d7f5">${esc(
    [team.group, team.division, team.town].filter(Boolean).join("  ·  ")
  )}</text>
  ${playoff}
  ${stat(60, "RECORD", team.record)}
  ${stat(400, "DIVISION RANK", team.rank ? `#${team.rank}${team.divisionSize ? ` of ${team.divisionSize}` : ""}` : "-")}`);
}

export function defaultCardSvg() {
  return frame(`
  <text x="60" y="300" font-family="Inter" font-weight="800" font-size="76" fill="#ffffff">Power rankings, brackets</text>
  <text x="60" y="390" font-family="Inter" font-weight="800" font-size="76" fill="#ffffff">and team history</text>
  <text x="60" y="470" font-family="Inter" font-weight="400" font-size="32" fill="#c9d7f5">Every grade, division, town and gym in Metrowest youth basketball</text>`);
}

export function renderPng(svg) {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "width", value: 1200 },
  });
  return resvg.render().asPng();
}
