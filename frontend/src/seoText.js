// Page titles, descriptions and URL aliases for search engines. Plain JS so both the app and
// scripts/postbuild-seo.mjs (which pre-renders every page) use the same wording.

export const HOME_TITLE = "Metrowest Basketball League Standings, Schedules & Rankings | MWStats";
export const HOME_DESCRIPTION =
  "Standings, schedules, scores and power rankings for every Metrowest youth basketball league team, boys and girls in grades 3-8, with town and gym pages.";

// Town names as the league writes them -> the official spelling people search for.
const OFFICIAL_TOWN_NAMES = {
  southboro: "Southborough",
  foxboro: "Foxborough",
  northboro: "Northborough",
  marlboro: "Marlborough",
  boxboro: "Boxborough",
  middleboro: "Middleborough",
};

// Extra /towns/<alias> URLs -> the town page they belong to: official spellings and the member towns
// of combined programs. Only used when the alias isn't a town page of its own.
export const TOWN_ALIASES = {
  southborough: "southboro",
  foxborough: "foxboro",
  northborough: "northboro",
  rehoboth: "dighton-rehoboth",
  dighton: "dighton-rehoboth",
  acushnet: "acushnet-fairhaven",
  fairhaven: "acushnet-fairhaven",
  dover: "dover-sherborn",
  sherborn: "dover-sherborn",
  concord: "concord-carlisle",
  carlisle: "concord-carlisle",
  sudbury: "lincoln-sudbury",
  blackstone: "blackstone-millville",
  millville: "blackstone-millville",
  norfolk: "king-philip",
  plainville: "king-philip",
  wrentham: "king-philip",
};

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
const slug = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const titleCase = (text) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "6th Grade Girls" */
export function gradeGroup(grade, gender) {
  return `${ordinal(grade)} Grade ${gender === "F" ? "Girls" : "Boys"}`;
}

/** "Southboro" -> "Southborough"; other names unchanged. */
export function officialTownName(name) {
  return OFFICIAL_TOWN_NAMES[slug(name)] ?? name;
}

/** "D5Q-Holliston (wing - white)" -> "Holliston Wing White"; "D1-Hanover (hanover  · 6ga)" -> "Hanover". */
export function teamDisplayName(name) {
  const bare = String(name ?? "")
    .replace(/^[A-Za-z0-9/]+-/, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = bare.match(/^(.*?)\s*\((.*)\)$/);
  const base = officialTownName((m ? m[1] : bare).trim());
  const sub = m ? m[2].split("·")[0].replace(/[^A-Za-z0-9/' ]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!sub || slug(sub) === slug(base) || slug(officialTownName(sub)) === slug(base)) return base;
  return `${base} ${titleCase(sub)}`;
}

/** Title for a rankings page: all divisions, one tier ("Division 5"), or one division ("D5Y"). */
export function rankingsTitle({ grade, gender, label, tier, tag }) {
  const group = gradeGroup(grade, gender);
  if (tag) return `${group} Basketball ${tier ? `Division ${tier} ` : ""}(${tag}) Standings, ${label} | MWStats`;
  if (tier) return `${group} Basketball Division ${tier} Standings, ${label} | MWStats`;
  return `${group} Basketball Standings & Rankings, ${label} | MWStats`;
}

export function playoffsTitle(grade, gender, label) {
  return `${gradeGroup(grade, gender)} Basketball Playoffs, ${label} | MWStats`;
}

export function teamTitle(name, grade, gender, label) {
  const group = grade && gender ? ` - ${gradeGroup(grade, gender)} Basketball` : " Basketball";
  return `${teamDisplayName(name)}${group}, ${label} | MWStats`;
}

export function townTitle(name) {
  const official = officialTownName(name);
  return `${official} Youth Basketball${official !== name ? ` (${name})` : ""}: Metrowest League Standings & Schedule | MWStats`;
}

export function townDescription(name) {
  return `${officialTownName(name)} youth basketball teams in the Metrowest league: standings, schedules, scores, power rankings and playoff results for every grade and season.`;
}

/** "31 Oxford Rd, Mansfield, MA 02048" -> "Mansfield". */
export function gymCity(address) {
  const m = String(address ?? "").match(/,\s*([A-Za-z][A-Za-z .'-]*?)\s*(?:[,/]|\s(?:MA|RI|NH|CT)\b|\s\d{5}|$)/i);
  return m ? titleCase(m[1].toLowerCase()) : null;
}

export function gymTitle(name, address) {
  const city = gymCity(address);
  const where = city && !name.toLowerCase().includes(city.toLowerCase()) ? `, ${city}` : "";
  return `${name}${where}: Basketball Game Schedule & Directions | MWStats`;
}

export function gymDescription(name, address) {
  return `${name}${address ? `, ${address}` : ""}: Metrowest youth basketball games at this gym, with times, matchups, scores and directions.`;
}
