type Gender = "M" | "F";

export const HOME_TITLE: string;
export const HOME_DESCRIPTION: string;
export const TOWN_ALIASES: Record<string, string>;
export function gradeGroup(grade: number, gender: Gender): string;
export function officialTownName(name: string): string;
export function teamDisplayName(name: string): string;
export function rankingsTitle(input: {
  grade: number;
  gender: Gender;
  label: string;
  tier?: string | null;
  tag?: string | null;
}): string;
export function playoffsTitle(grade: number, gender: Gender, label: string): string;
export function teamTitle(name: string, grade: number | null, gender: Gender | null, label: string): string;
export function townTitle(name: string): string;
export function townDescription(name: string): string;
export function gymCity(address: string | null | undefined): string | null;
export function gymTitle(name: string, address: string | null | undefined): string;
export function gymDescription(name: string, address: string | null | undefined): string;
