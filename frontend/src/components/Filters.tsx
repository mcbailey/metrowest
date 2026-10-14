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
    const nextValue = key === "grade" ? Number(value) : value;

    onChange({
      ...filters,
      [key]: nextValue,
      // Changing season/gender/grade invalidates the selected division.
      ...(key === "divisionno" ? {} : { divisionno: "" }),
    });
  };

  const pick = (key: "gender" | "grade", value: string) => {
    onChange({ ...filters, [key]: key === "grade" ? Number(value) : value, divisionno: "" });
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
      <div className="chip-group" role="group" aria-label="Gender">
        {genderOptions.map((o) => (
          <button
            type="button"
            key={o.value}
            className={`chip ${filters.gender === o.value ? "chip-active" : ""}`}
            aria-pressed={filters.gender === o.value}
            onClick={() => pick("gender", o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="chip-group" role="group" aria-label="Grade">
        {gradeOptions.map((o) => (
          <button
            type="button"
            key={o.value}
            className={`chip ${String(filters.grade) === o.value ? "chip-active" : ""}`}
            aria-pressed={String(filters.grade) === o.value}
            onClick={() => pick("grade", o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
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
