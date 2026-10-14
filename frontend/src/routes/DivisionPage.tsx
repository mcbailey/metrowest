import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Filters, FilterState } from "../components/Filters";
import { RankingsTable } from "../components/RankingsTable";
import { loadJson, loadJsonCached } from "../data";
import {
  divisionSlug,
  parseDivisionSlug,
  parseGenderSlug,
  parseGradeSlug,
  parseSeasonSlug,
  playoffsPath,
  rankingsPath,
} from "../paths";
import { findSeason, genderLabel, gradeLabel, saveLastView, seasonStatusText } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import { DivisionRankingData, DivisionsData, IndexData, RankingTeam } from "../types";

type DisplayTeam = RankingTeam & {
  division_label?: string;
  subgroup?: string;
};

type DisplayPayload = {
  key: string;
  title: string;
  subtitle: string;
  teams: DisplayTeam[];
  showGroup: boolean;
};

function sortAndRank(teams: DisplayTeam[]): DisplayTeam[] {
  const out = [...teams].sort((a, b) => b.power - a.power || b.sos - a.sos || b.diff - a.diff);
  return out.map((t, idx) => ({ ...t, rank: idx + 1 }));
}

export function DivisionPage() {
  const params = useParams<{ season: string; gender: string; grade: string; division?: string }>();
  const navigate = useNavigate();

  const [index, setIndex] = useState<IndexData | null>(null);
  const [divisions, setDivisions] = useState<DivisionsData | null>(null);
  const [display, setDisplay] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJsonCached<IndexData>("data/index.json")
      .then(setIndex)
      .catch((err) => setError(String(err)));
  }, []);

  const yrseason = parseSeasonSlug(params.season);
  const gender = parseGenderSlug(params.gender);
  const grade = parseGradeSlug(params.grade);
  const seasonEntry = findSeason(index, yrseason);
  const valid = Boolean(seasonEntry && gender && grade !== null && seasonEntry.grades.includes(grade));
  const groupKey = valid ? `${yrseason}/${gender}/${grade}` : null;

  useEffect(() => {
    if (!groupKey) return;
    let active = true;
    setDivisions(null);
    loadJsonCached<DivisionsData>(`data/${groupKey}/divisions.json`)
      .then((data) => {
        if (active) setDivisions(data);
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [groupKey]);

  const divisionValue = divisions && groupKey === `${divisions.yrseason}/${divisions.gender}/${divisions.grade}`
    ? parseDivisionSlug(params.division, divisions.divisions)
    : null;

  const filters: FilterState | null =
    valid && divisionValue !== null
      ? { season: yrseason!, gender: gender!, grade: grade!, divisionno: divisionValue }
      : null;

  useEffect(() => {
    if (!filters) return;
    saveLastView({ season: filters.season, gender: filters.gender, grade: filters.grade, division: filters.divisionno });
  }, [filters?.season, filters?.gender, filters?.grade, filters?.divisionno]);

  useEffect(() => {
    if (!filters || !divisions) return;
    const current = filters;
    const currentDivisions = divisions;
    let active = true;

    async function load() {
      const tier = current.divisionno.startsWith("TIER-") ? current.divisionno.slice("TIER-".length) : null;
      const targetDivisionNos =
        current.divisionno === "ALL"
          ? currentDivisions.divisions.map((d) => d.divisionno)
          : tier !== null
          ? currentDivisions.divisions.filter((d) => (d.divisiontier ?? "") === tier).map((d) => d.divisionno)
          : [current.divisionno];

      const results = await Promise.allSettled(
        targetDivisionNos.map((dno) =>
          loadJson<DivisionRankingData>(`data/${current.season}/${current.gender}/${current.grade}/division-${dno}.json`)
        )
      );
      if (!active) return;

      const datasets = results
        .filter((r): r is PromiseFulfilledResult<DivisionRankingData> => r.status === "fulfilled")
        .map((r) => r.value);
      if (!datasets.length) {
        setDisplay(null);
        setError("No division data available");
        return;
      }

      const aggregate = current.divisionno === "ALL" || tier !== null;
      const merged: DisplayTeam[] = datasets.flatMap((ds) =>
        ds.rankings.map((t) => ({ ...t, division_label: ds.division_name, subgroup: ds.tag ?? undefined }))
      );
      const teams = aggregate ? sortAndRank(merged) : merged;
      const group = `${gradeLabel(current.grade)} ${genderLabel(current.gender)}`;
      const title =
        current.divisionno === "ALL"
          ? `${group} - All Divisions`
          : tier !== null
          ? `${group} - Division ${tier} (all groups)`
          : `${datasets[0].division_name}${datasets[0].tag ? ` (${datasets[0].tag})` : ""}`;

      setError(null);
      setDisplay({
        key: `${current.season}/${current.gender}/${current.grade}/${current.divisionno}`,
        title,
        subtitle: `${seasonStatusText(seasonEntry, datasets[0].snapshot_date)} · ${teams.length} teams`,
        teams,
        showGroup: aggregate,
      });
    }

    void load().catch((err) => {
      if (active) setError(String(err));
    });
    return () => {
      active = false;
    };
  }, [filters?.season, filters?.gender, filters?.grade, filters?.divisionno, divisions, seasonEntry]);

  const seasonOptions = useMemo(
    () => (index?.seasons ?? []).map((s) => ({ value: s.yrseason, label: s.label })),
    [index]
  );
  const genderOptions = [
    { value: "M", label: "Boys" },
    { value: "F", label: "Girls" },
  ];
  const gradeOptions = (seasonEntry?.grades ?? []).map((g) => ({ value: String(g), label: gradeLabel(g) }));

  const divisionOptions = useMemo(() => {
    if (!divisions) return [];
    const tiers = Array.from(
      new Set(divisions.divisions.map((d) => d.divisiontier).filter((t): t is string => Boolean(t)))
    ).sort((a, b) => Number(a) - Number(b));
    const singles = [...divisions.divisions].sort(
      (a, b) =>
        Number(a.divisiontier ?? 0) - Number(b.divisiontier ?? 0) ||
        (a.tag ?? a.divisionno).localeCompare(b.tag ?? b.divisionno)
    );
    return [
      { value: "ALL", label: "All divisions" },
      ...tiers.map((tier) => ({ value: `TIER-${tier}`, label: `Division ${tier} (all groups)` })),
      ...singles.map((d) => ({
        value: d.divisionno,
        label: d.tag ? `${d.tag} (Division ${d.divisiontier ?? "?"})` : d.divisionno,
      })),
    ];
  }, [divisions]);

  const canonicalPath = filters
    ? rankingsPath(filters.season, filters.gender, filters.grade, filters.divisionno, divisions?.divisions)
    : "/";
  const seoTitle = display ? `${display.title}, ${seasonEntry?.label ?? ""} | MWStats` : SEO_SITE_NAME;
  const seoDescription = display
    ? `${display.title} (${seasonEntry?.label}). ${display.teams.length} teams ranked by power rating, strength of schedule, and results.`
    : "Metrowest youth basketball power rankings by grade and division.";
  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    canonicalPath,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: seoTitle,
      description: seoDescription,
      url: `${SEO_SITE_URL}${canonicalPath}`,
      isPartOf: { "@type": "WebSite", name: SEO_SITE_NAME, url: SEO_SITE_URL },
    },
  });

  if (error) return <p className="error">{error}</p>;
  if (!index) return <p>Loading data...</p>;

  if (!valid) {
    // Unknown season/grade in the URL: fall back to the closest valid page instead of an error.
    const season = seasonEntry ?? findSeason(index, index.current) ?? index.seasons[0];
    const g = gender ?? "M";
    const gr = grade !== null && season.grades.includes(grade) ? grade : season.grades[season.grades.length - 1];
    return <Navigate to={rankingsPath(season.yrseason, g, gr)} replace />;
  }
  if (divisions && params.division && divisionValue !== null) {
    // Unknown division -> whole grade; numeric (old-style) division -> its code-based URL.
    const canonicalSeg = divisionSlug(divisionValue, divisions.divisions);
    if (canonicalSeg !== params.division) {
      return <Navigate to={rankingsPath(yrseason!, gender!, grade!, divisionValue, divisions.divisions)} replace />;
    }
  }
  if (!filters || !display) return <p>Loading data...</p>;

  const group = seasonEntry?.groups?.find((x) => x.gender === filters.gender && x.grade === filters.grade);

  return (
    <div className="stack">
      <section className="panel">
        <Filters
          filters={filters}
          seasonOptions={seasonOptions}
          genderOptions={genderOptions}
          gradeOptions={gradeOptions}
          divisionOptions={divisionOptions}
          onChange={(next) => {
            // A season may not have every grade; fall back to one it has.
            const grades = findSeason(index, next.season)?.grades ?? [];
            const nextGrade = grades.includes(next.grade) || !grades.length ? next.grade : grades[grades.length - 1];
            const sameGroup =
              next.season === filters.season && next.gender === filters.gender && nextGrade === filters.grade;
            navigate(
              rankingsPath(next.season, next.gender, nextGrade, sameGroup ? next.divisionno : "ALL", divisions?.divisions)
            );
          }}
        />
      </section>

      <section className="panel">
        <h2>{display.title}</h2>
        <p className="meta">{display.subtitle}</p>
        <p className="meta compact link-row">
          {group?.playoffs ? (
            <Link className="method-link" to={playoffsPath(filters.season, filters.gender, filters.grade)}>
              Playoff brackets
            </Link>
          ) : null}
          <Link className="method-link" to="/glossary">
            Glossary of ranking terms
          </Link>
        </p>
      </section>

      <section className="panel">
        <RankingsTable teams={display.teams} showGroup={display.showGroup} season={filters.season} />
      </section>
    </div>
  );
}

/** Old query-string URLs (/?season=2026&gender=M&grade=6&division=7234) -> path URLs. */
export function legacyRankingsPath(search: URLSearchParams): string | null {
  const season = search.get("season");
  const gender = search.get("gender");
  const grade = Number(search.get("grade"));
  if (!season || (gender !== "M" && gender !== "F") || !Number.isInteger(grade)) return null;
  const division = search.get("division") ?? "ALL";
  // Single divisions are numbers in old URLs; the division page resolves numeric slugs and canonicalizes them.
  return rankingsPath(season, gender, grade, division === "ALL" ? undefined : division);
}
