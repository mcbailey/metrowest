import { useEffect, useMemo, useState } from "react";
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

function sortAndRank(teams: DisplayTeam[]): DisplayTeam[] {
  const out = [...teams].sort((a, b) => b.power - a.power || b.sos - a.sos || b.diff - a.diff);
  return out.map((t, idx) => ({ ...t, rank: idx + 1 }));
}

export function DivisionPage() {
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
        setFilters({
          season: data.default.yrseason,
          gender: data.default.gender,
          grade: data.default.grade,
          divisionno: "ALL",
        });
      })
      .catch((err) => setError(String(err)));
  }, []);

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
        return a.name.localeCompare(b.name) || a.divisionno.localeCompare(b.divisionno);
      })
      .map((d) => ({
        value: d.divisionno,
        label: `${d.name} • ${d.divisionno}`,
      }));

    return [
      { value: "ALL", label: "All Divisions (Grade/Gender)" },
      ...tierOptions,
      ...singleDivisionOptions,
    ];
  }, [divisions]);

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
      </section>

      <RankingsTable teams={display.teams} showGroup={display.showGroup} />
    </div>
  );
}
