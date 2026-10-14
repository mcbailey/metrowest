/**
 * Readable, crawlable URLs. Data files stay keyed by yrseason ("2026"); URLs use the season label ("2025-26").
 *
 *   /2025-26/boys/6th                  all divisions in a grade
 *   /2025-26/boys/6th/division-1       one division tier, all groups
 *   /2025-26/boys/6th/d1h              one division (league code)
 *   /2025-26/team/44192-parkway-red    team (the number is the id; the rest is decoration)
 *   /2025-26/playoffs/boys/6th         playoff brackets
 *   /towns, /towns/natick              towns
 */

export type Gender = "M" | "F";

export function slugify(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function seasonSlug(yrseason: string): string {
  const y = Number(yrseason);
  return Number.isFinite(y) ? `${y - 1}-${String(y).slice(-2)}` : yrseason;
}

/** "2025-26" -> "2026"; also accepts "2026". */
export function parseSeasonSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const range = /^(\d{4})-(\d{2})$/.exec(slug);
  if (range) return String(Number(range[1]) + 1);
  return /^\d{4}$/.test(slug) ? slug : null;
}

export function genderSlug(gender: Gender): string {
  return gender === "F" ? "girls" : "boys";
}

export function parseGenderSlug(slug: string | undefined): Gender | null {
  if (slug === "boys") return "M";
  if (slug === "girls") return "F";
  return null;
}

export function gradeSlug(grade: number): string {
  const suffix =
    grade % 100 >= 11 && grade % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[grade % 10] ?? "th";
  return `${grade}${suffix}`;
}

export function parseGradeSlug(slug: string | undefined): number | null {
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(slug ?? "");
  return m ? Number(m[1]) : null;
}

type DivisionRef = { divisionno: string; tag?: string | null };

/** Division filter value ("ALL", "TIER-1", or a divisionno) -> URL segment (undefined for ALL). */
export function divisionSlug(value: string, divisions: DivisionRef[] = []): string | undefined {
  if (!value || value === "ALL") return undefined;
  if (value.startsWith("TIER-")) return `division-${value.slice("TIER-".length)}`;
  const d = divisions.find((x) => x.divisionno === value);
  return d?.tag ? slugify(d.tag) : value;
}

/** URL segment -> division filter value. */
export function parseDivisionSlug(slug: string | undefined, divisions: DivisionRef[]): string {
  if (!slug) return "ALL";
  const tier = /^division-(\d+)$/.exec(slug);
  if (tier) return `TIER-${tier[1]}`;
  const byTag = divisions.find((d) => d.tag && slugify(d.tag) === slug);
  if (byTag) return byTag.divisionno;
  const byNo = divisions.find((d) => d.divisionno === slug);
  return byNo ? byNo.divisionno : "ALL";
}

export function rankingsPath(
  yrseason: string,
  gender: Gender,
  grade: number,
  division?: string,
  divisions: DivisionRef[] = []
): string {
  const base = `/${seasonSlug(yrseason)}/${genderSlug(gender)}/${gradeSlug(grade)}`;
  const seg = division ? divisionSlug(division, divisions) : undefined;
  return seg ? `${base}/${seg}` : base;
}

export function teamPath(yrseason: string, teamno: string, name?: string | null): string {
  // Team names start with the division code ("D1J-Parkway (red)"); drop it from the slug.
  const nameSlug = slugify((name ?? "").replace(/^[A-Za-z0-9/]+-/, ""));
  return `/${seasonSlug(yrseason)}/team/${teamno}${nameSlug ? `-${nameSlug}` : ""}`;
}

export function parseTeamSlug(slug: string | undefined): string | null {
  const m = /^(\d+)/.exec(slug ?? "");
  return m ? m[1] : null;
}

export function playoffsPath(yrseason: string, gender: Gender, grade: number): string {
  return `/${seasonSlug(yrseason)}/playoffs/${genderSlug(gender)}/${gradeSlug(grade)}`;
}

export function townPath(slug: string): string {
  return `/towns/${slug}`;
}

export function gymPath(slug: string): string {
  return `/gyms/${slug}`;
}

export function calendarUrl(yrseason: string, teamno: string): string {
  return `/data/${yrseason}/calendar/team-${teamno}.ics`;
}
