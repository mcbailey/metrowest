import { ChangeEvent } from "react";

export type FilterState = {
  season: string;
  gender: "M" | "F";
  grade: number;
  divisionno: string;
};

type Option = { value: string; label: string };

type Props = {
  filters: FilterState;
  seasonOptions: Option[];
  genderOptions: Option[];
  gradeOptions: Option[];
  divisionOptions: Option[];
  onChange: (next: FilterState) => void;
};

export function Filters({
  filters,
  seasonOptions,
  genderOptions,
  gradeOptions,
  divisionOptions,
  onChange,
}: Props) {
  const update = (key: keyof FilterState) => (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onChange({
      ...filters,
      [key]: key === "grade" ? Number(value) : value,
    });
  };

  return (
    <div className="filters">
      <label>
        Season
        <select value={filters.season} onChange={update("season")}>
          {seasonOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Gender
        <select value={filters.gender} onChange={update("gender")}>
          {genderOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Grade
        <select value={String(filters.grade)} onChange={update("grade")}>
          {gradeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Division
        <select value={filters.divisionno} onChange={update("divisionno")}>
          {divisionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
