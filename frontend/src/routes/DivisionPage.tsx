import { useEffect, useMemo, useState } from "react";
import { Filters, FilterState } from "../components/Filters";
import { RankingsTable } from "../components/RankingsTable";
import { loadJson } from "../data";
import { DivisionRankingData, DivisionsData, IndexData } from "../types";

export function DivisionPage() {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [divisions, setDivisions] = useState<DivisionsData | null>(null);
  const [divisionData, setDivisionData] = useState<DivisionRankingData | null>(null);
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
          divisionno: "",
        });
      })
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!filters) return;

    loadJson<DivisionsData>(`data/${filters.season}/${filters.gender}/${filters.grade}/divisions.json`)
      .then((data) => {
        setError(null);
        setDivisions(data);
        const firstDivision = data.divisions[0]?.divisionno ?? "";
        const requested = data.divisions.some((d) => d.divisionno === filters.divisionno)
          ? filters.divisionno
          : firstDivision;
        setFilters((prev) => (prev ? { ...prev, divisionno: requested } : prev));
      })
      .catch((err) => {
        setDivisionData(null);
        setError(String(err));
      });
  }, [filters?.season, filters?.gender, filters?.grade]);

  useEffect(() => {
    if (!filters?.divisionno) return;

    const isValidDivision = divisions?.divisions.some((d) => d.divisionno === filters.divisionno) ?? false;
    if (!isValidDivision) return;

    loadJson<DivisionRankingData>(
      `data/${filters.season}/${filters.gender}/${filters.grade}/division-${filters.divisionno}.json`
    )
      .then((data) => {
        setError(null);
        setDivisionData(data);
      })
      .catch((err) => setError(String(err)));
  }, [filters?.season, filters?.gender, filters?.grade, filters?.divisionno, divisions]);

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
        label: `${g}th`,
      })),
    [index, filters?.season]
  );

  const divisionOptions = useMemo(
    () => (divisions?.divisions ?? []).map((d) => ({ value: d.divisionno, label: d.name })),
    [divisions]
  );

  if (error) return <p className="error">{error}</p>;
  if (!filters || !index || !divisions || !divisionData) return <p>Loading data...</p>;

  return (
    <div className="stack">
      <Filters
        filters={filters}
        seasonOptions={seasonOptions}
        genderOptions={genderOptions}
        gradeOptions={gradeOptions}
        divisionOptions={divisionOptions}
        onChange={setFilters}
      />
      <h2>{divisionData.division_name}</h2>
      <p className="meta">
        Snapshot: {divisionData.snapshot_date} | {divisionData.gender === "M" ? "Boys" : "Girls"} {" "}
        {divisionData.grade}th Grade
      </p>
      <RankingsTable teams={divisionData.rankings} />
    </div>
  );
}
