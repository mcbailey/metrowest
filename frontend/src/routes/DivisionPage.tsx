import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filters, FilterState } from "../components/Filters";
import { RankingsTable } from "../components/RankingsTable";
import { loadJson } from "../data";
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

function gradeLabel(grade: number): string {
  return `${grade}th`;
}

function genderLabel(gender: "M" | "F"): string {
  return gender === "M" ? "Boys" : "Girls";
}

function extractSubgroup(teamName: string): string | undefined {
  const match = /^([A-Za-z0-9]+)-/.exec(teamName);
  return match?.[1];
}

function inferDivisionCode(teams: RankingTeam[]): string | undefined {
  const counts: Record<string, number> = {};
  for (const team of teams) {
    const code = extractSubgroup(team.name);
    if (!code) continue;
    counts[code] = (counts[code] ?? 0) + 1;
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

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
  const [divisionCodeByNo, setDivisionCodeByNo] = useState<Record<string, string>>({});
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
        setDivisionCodeByNo({});

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
    if (!filters || !divisions) return;
    const currentFilters = filters;
    const currentDivisions = divisions;
    let active = true;

    async function loadDivisionCodes() {
      const divisionNos = currentDivisions.divisions.map((d) => d.divisionno);
      if (!divisionNos.length) {
        if (active) setDivisionCodeByNo({});
        return;
      }

      const results = await Promise.allSettled(
        divisionNos.map((dno) =>
          loadJson<DivisionRankingData>(
            `data/${currentFilters.season}/${currentFilters.gender}/${currentFilters.grade}/division-${dno}.json`
          )
        )
      );

      if (!active) return;

      const nextMap: Record<string, string> = {};
      for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        if (result.status !== "fulfilled") continue;

        const inferred = inferDivisionCode(result.value.rankings);
        if (inferred) {
          nextMap[divisionNos[i]] = inferred;
        }
      }

      setDivisionCodeByNo(nextMap);
    }

    void loadDivisionCodes();

    return () => {
      active = false;
    };
  }, [filters?.season, filters?.gender, filters?.grade, divisions]);

  useEffect(() => {
    if (!filters || !divisions || !filters.divisionno) return;

    const currentFilters = filters;
    const currentDivisions = divisions;
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
            subgroup: extractSubgroup(t.name),
          });
        }
      }

      const rankedTeams = aggregate ? sortAndRank(merged) : merged;
      const title =
        currentFilters.divisionno === "ALL"
          ? `${gradeLabel(currentFilters.grade)} ${genderLabel(currentFilters.gender)} - All Divisions`
          : tier !== null
          ? `${gradeLabel(currentFilters.grade)} ${genderLabel(currentFilters.gender)} - Division ${tier} (All Groups)`
          : datasets[0].division_name;

      const subtitle = aggregate
        ? `Snapshot: ${datasets[0].snapshot_date} | ${genderLabel(currentFilters.gender)} ${gradeLabel(currentFilters.grade)} Grade | ${rankedTeams.length} Teams`
        : `Snapshot: ${datasets[0].snapshot_date} | ${genderLabel(datasets[0].gender)} ${gradeLabel(datasets[0].grade)} Grade`;

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
  }, [filters, divisions]);

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
        label: `Division ${tier} (All Groups)`,
      }));

    const singleDivisionOptions = [...divisions.divisions]
      .sort((a, b) => {
        const tierA = Number(a.divisiontier ?? 0);
        const tierB = Number(b.divisiontier ?? 0);
        if (tierA !== tierB) return tierA - tierB;

        const labelA = divisionCodeByNo[a.divisionno] ?? a.divisionno;
        const labelB = divisionCodeByNo[b.divisionno] ?? b.divisionno;
        return labelA.localeCompare(labelB) || a.divisionno.localeCompare(b.divisionno);
      })
      .map((d) => ({
        value: d.divisionno,
        label: divisionCodeByNo[d.divisionno] ?? d.divisionno,
      }));

    return [
      { value: "ALL", label: "All Divisions (Grade/Gender)" },
      ...tierOptions,
      ...singleDivisionOptions,
    ];
  }, [divisions, divisionCodeByNo]);

  const queryString = useMemo(() => {
    if (!filters) return "";
    const params = new URLSearchParams();
    params.set("season", filters.season);
    params.set("gender", filters.gender);
    params.set("grade", String(filters.grade));
    params.set("division", filters.divisionno || "ALL");
    return `?${params.toString()}`;
  }, [filters]);

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
          onChange={setFilters}
        />
      </section>

      <section className="panel">
        <h2>{display.title}</h2>
        <p className="meta">{display.subtitle}</p>
        <p className="meta compact">
          <a className="method-link" href="#ranking-methodology">
            Jump to SoS & Power ranking methodology
          </a>
        </p>
      </section>

      <RankingsTable teams={display.teams} showGroup={display.showGroup} queryString={queryString} />

      <section className="panel" id="ranking-methodology">
        <h3>How SoS and Power Rankings Are Calculated</h3>
        <p className="meta">
          In plain terms: every team starts equal, gains points for wins, and loses points for losses.
          Beating strong teams helps more than beating weak teams, and close games count less than blowouts.
        </p>
        <ul className="method-list">
          <li><strong>Step 1:</strong> Every team starts at 1500.</li>
          <li><strong>Step 2:</strong> After each game, ratings move up or down based on who won and by how much.</li>
          <li><strong>Step 3:</strong> SoS (Strength of Schedule) is the average rating of your opponents.</li>
          <li><strong>Step 4:</strong> Power Rating = 75% your rating + 25% your SoS.</li>
          <li><strong>Final ranking:</strong> Teams are sorted by Power Rating (highest first).</li>
        </ul>
      </section>
    </div>
  );
}
