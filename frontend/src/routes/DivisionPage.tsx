import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Filters, FilterState } from "../components/Filters";
import { RankingsTable } from "../components/RankingsTable";
import { loadJson } from "../data";
import { findSeason, genderLabel, gradeLabel, saveLastView, seasonStatusText } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import { DivisionRankingData, DivisionsData, IndexData, RankingTeam } from "../types";

type DisplayTeam = RankingTeam & {
  division_label?: string;
  subgroup?: string;
};

type DisplayPayload = {
  title: string;
  subtitle: string;
  snapshot: string;
  teams: DisplayTeam[];
  showGroup: boolean;
};

function sortAndRank(teams: DisplayTeam[]): DisplayTeam[] {
  const out = [...teams].sort((a, b) => b.power - a.power || b.sos - a.sos || b.diff - a.diff);
  return out.map((t, idx) => ({ ...t, rank: idx + 1 }));
}

function coerceFiltersFromQuery(index: IndexData, searchParams: URLSearchParams): FilterState {
  const fallbackSeason = index.default.yrseason;
  const requestedSeason = searchParams.get("season") ?? fallbackSeason;

  const seasonEntry =
    index.seasons.find((s) => s.yrseason === requestedSeason) ||
    index.seasons.find((s) => s.yrseason === fallbackSeason) ||
    index.seasons[0];

  const season = seasonEntry?.yrseason ?? fallbackSeason;
  const genderFromQuery = searchParams.get("gender");
  const gender: "M" | "F" =
    genderFromQuery === "M" || genderFromQuery === "F"
      ? genderFromQuery
      : seasonEntry?.genders.includes(index.default.gender)
      ? index.default.gender
      : (seasonEntry?.genders[0] ?? "M");

  const gradeFromQuery = Number(searchParams.get("grade") ?? "");
  const grade =
    Number.isInteger(gradeFromQuery) && seasonEntry?.grades.includes(gradeFromQuery)
      ? gradeFromQuery
      : seasonEntry?.grades.includes(index.default.grade)
      ? index.default.grade
      : (seasonEntry?.grades[0] ?? 3);

  const divisionno = searchParams.get("division") ?? "ALL";

  return { season, gender, grade, divisionno };
}

export function DivisionPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [index, setIndex] = useState<IndexData | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [divisions, setDivisions] = useState<DivisionsData | null>(null);
  const [display, setDisplay] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJson<IndexData>("data/index.json")
      .then((data) => {
        setError(null);
        setIndex(data);
        setFilters(coerceFiltersFromQuery(data, searchParams));
      })
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!filters) return;

    const params = new URLSearchParams();
    params.set("season", filters.season);
    params.set("gender", filters.gender);
    params.set("grade", String(filters.grade));
    params.set("division", filters.divisionno || "ALL");

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
  }, [filters, searchParams, setSearchParams]);

  useEffect(() => {
    if (!filters) return;
    let active = true;

    loadJson<DivisionsData>(`data/${filters.season}/${filters.gender}/${filters.grade}/divisions.json`)
      .then((data) => {
        if (!active) return;
        setError(null);
        setDivisions(data);

        const valid = new Set([
          "ALL",
          ...Array.from(new Set(data.divisions.map((d) => `TIER-${d.divisiontier ?? ""}`))),
          ...data.divisions.map((d) => d.divisionno),
        ]);

        const selected = valid.has(filters.divisionno) ? filters.divisionno : "ALL";
        setFilters((prev) => (prev ? { ...prev, divisionno: selected } : prev));
      })
      .catch((err) => {
        if (!active) return;
        setDisplay(null);
        setError(String(err));
      });

    return () => {
      active = false;
    };
  }, [filters?.season, filters?.gender, filters?.grade]);

  useEffect(() => {
    if (!filters) return;
    saveLastView({
      season: filters.season,
      gender: filters.gender,
      grade: filters.grade,
      division: filters.divisionno || "ALL",
    });
  }, [filters]);

  useEffect(() => {
    if (!filters || !divisions || !filters.divisionno) return;

    const currentFilters = filters;
    const currentDivisions = divisions;
    const indexRef = index;
    let active = true;

    async function load() {
      setError(null);

      const allDivisionNos = currentDivisions.divisions.map((d) => d.divisionno);
      const tier = currentFilters.divisionno.startsWith("TIER-")
        ? currentFilters.divisionno.replace("TIER-", "")
        : null;

      const targetDivisionNos =
        currentFilters.divisionno === "ALL"
          ? allDivisionNos
          : tier !== null
          ? currentDivisions.divisions.filter((d) => (d.divisiontier ?? "") === tier).map((d) => d.divisionno)
          : [currentFilters.divisionno];

      if (!targetDivisionNos.length) {
        if (!active) return;
        setDisplay(null);
        return;
      }

      const results = await Promise.allSettled(
        targetDivisionNos.map((dno) =>
          loadJson<DivisionRankingData>(
            `data/${currentFilters.season}/${currentFilters.gender}/${currentFilters.grade}/division-${dno}.json`
          )
        )
      );

      if (!active) return;

      const datasets = results
        .filter((r): r is PromiseFulfilledResult<DivisionRankingData> => r.status === "fulfilled")
        .map((r) => r.value);

      if (!datasets.length) {
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        setDisplay(null);
        setError(firstError ? String(firstError.reason) : "No division data available");
        return;
      }

      const aggregate = currentFilters.divisionno === "ALL" || tier !== null;
      const merged: DisplayTeam[] = [];
      for (const ds of datasets) {
        for (const t of ds.rankings) {
          merged.push({
            ...t,
            division_label: ds.division_name,
            subgroup: ds.tag ?? undefined,
          });
        }
      }

      const rankedTeams = aggregate ? sortAndRank(merged) : merged;
      const title =
        currentFilters.divisionno === "ALL"
          ? `${gradeLabel(currentFilters.grade)} ${genderLabel(currentFilters.gender)} - All Divisions`
          : tier !== null
          ? `${gradeLabel(currentFilters.grade)} ${genderLabel(currentFilters.gender)} - Division ${tier} (all groups)`
          : `${datasets[0].division_name}${datasets[0].tag ? ` (${datasets[0].tag})` : ""}`;

      const seasonEntry = findSeason(indexRef, currentFilters.season);
      const subtitle = `${seasonStatusText(seasonEntry, datasets[0].snapshot_date)} · ${rankedTeams.length} teams`;

      setDisplay({
        title,
        subtitle,
        snapshot: datasets[0].snapshot_date,
        teams: rankedTeams,
        showGroup: aggregate,
      });
    }

    void load().catch((err) => {
      if (!active) return;
      setDisplay(null);
      setError(String(err));
    });

    return () => {
      active = false;
    };
  }, [filters, divisions, index]);

  const seasonOptions = useMemo(
    () => (index?.seasons ?? []).map((s) => ({ value: s.yrseason, label: s.label })),
    [index]
  );

  const genderOptions = useMemo(
    () => [
      { value: "M", label: "Boys" },
      { value: "F", label: "Girls" },
    ],
    []
  );

  const gradeOptions = useMemo(
    () =>
      (index?.seasons.find((s) => s.yrseason === filters?.season)?.grades ?? []).map((g) => ({
        value: String(g),
        label: gradeLabel(g),
      })),
    [index, filters?.season]
  );

  const divisionOptions = useMemo(() => {
    if (!divisions) return [];

    const tierOptions = Array.from(
      new Set(divisions.divisions.map((d) => d.divisiontier).filter((t): t is string => Boolean(t)))
    )
      .sort((a, b) => Number(a) - Number(b))
      .map((tier) => ({
        value: `TIER-${tier}`,
        label: `Division ${tier} (all groups)`,
      }));

    const singleDivisionOptions = [...divisions.divisions]
      .sort((a, b) => {
        const tierA = Number(a.divisiontier ?? 0);
        const tierB = Number(b.divisiontier ?? 0);
        if (tierA !== tierB) return tierA - tierB;

        const labelA = a.tag ?? a.divisionno;
        const labelB = b.tag ?? b.divisionno;
        return labelA.localeCompare(labelB) || a.divisionno.localeCompare(b.divisionno);
      })
      .map((d) => ({
        value: d.divisionno,
        label: d.tag ? `${d.tag} (Division ${d.divisiontier ?? "?"})` : d.divisionno,
      }));

    return [
      { value: "ALL", label: "All divisions" },
      ...tierOptions,
      ...singleDivisionOptions,
    ];
  }, [divisions]);

  const queryString = useMemo(() => {
    if (!filters) return "";
    const params = new URLSearchParams();
    params.set("season", filters.season);
    params.set("gender", filters.gender);
    params.set("grade", String(filters.grade));
    params.set("division", filters.divisionno || "ALL");
    return `?${params.toString()}`;
  }, [filters]);

  const seoTitle = display ? `${display.title} | MWStats` : SEO_SITE_NAME;
  const seoDescription = display
    ? `${display.title}. ${display.teams.length} teams with power ranking, SoS, and game-based metrics. Updated daily.`
    : "Metrowest youth basketball power rankings, division standings, team ratings, and schedule-driven analytics.";
  const canonicalPath = filters ? `/${queryString}` : "/";
  const seoJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: seoTitle,
      description: seoDescription,
      url: `${SEO_SITE_URL}${canonicalPath}`,
      isPartOf: {
        "@type": "WebSite",
        name: SEO_SITE_NAME,
        url: SEO_SITE_URL,
      },
    }),
    [canonicalPath, seoDescription, seoTitle]
  );
  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    canonicalPath,
    jsonLd: seoJsonLd,
  });

  if (error) return <p className="error">{error}</p>;
  if (!filters || !index || !divisions || !display) return <p>Loading data...</p>;


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
            const grade = grades.includes(next.grade) || !grades.length ? next.grade : grades[grades.length - 1];
            setFilters({ ...next, grade });
          }}
        />
      </section>

      <section className="panel">
        <h2>{display.title}</h2>
        <p className="meta">{display.subtitle}</p>
        <p className="meta compact">
          <Link className="method-link" to={`/glossary${queryString}`}>
            Open glossary of ranking terms
          </Link>
        </p>
      </section>

      <section className="panel">
        <RankingsTable teams={display.teams} showGroup={display.showGroup} queryString={queryString} />
      </section>

    </div>
  );
}
