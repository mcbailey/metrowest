import type { IndexData, SeasonEntry } from "./types";

export function gradeLabel(grade: number | null | undefined): string {
  if (grade === null || grade === undefined) return "";
  const suffix = grade % 100 >= 11 && grade % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[grade % 10] ?? "th";
  return `${grade}${suffix}`;
}

export function genderLabel(gender: "M" | "F" | null | undefined): string {
  return gender === "F" ? "Girls" : "Boys";
}

export function findSeason(index: IndexData | null, yrseason: string | null | undefined): SeasonEntry | undefined {
  if (!index) return undefined;
  return index.seasons.find((s) => s.yrseason === yrseason);
}

export function currentSeason(index: IndexData): SeasonEntry | undefined {
  return findSeason(index, index.current ?? index.default.yrseason) ?? index.seasons[0];
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Final standings" for a finished season, otherwise how current the data is. */
export function seasonStatusText(season: SeasonEntry | undefined, asOf?: string | null): string {
  if (!season) return "";
  const date = formatDate(asOf ?? season.snapshot_date);
  if (season.status === "final") {
    return date ? `${season.label} final standings (last game ${date})` : `${season.label} final standings`;
  }
  return date ? `${season.label} season, through games on ${date}` : `${season.label} season`;
}

const LAST_VIEW_KEY = "mwstats:last-view";

export type LastView = { season: string; gender: "M" | "F"; grade: number; division: string };

export function saveLastView(view: LastView): void {
  try {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage can be unavailable (private mode); remembering the view is only a convenience.
  }
}

export function loadLastView(): LastView | null {
  try {
    const raw = localStorage.getItem(LAST_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastView;
    return parsed && parsed.season && parsed.gender && parsed.grade ? parsed : null;
  } catch {
    return null;
  }
}
