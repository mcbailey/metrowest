import { teamDisplayName } from "../seoText";

/** "D5Y-Southboro (white)" -> "Southborough White" with a small "D5Y" tag (omitted with `tag={false}`). */
export function TeamName({ name, tag = true }: { name: string | null | undefined; tag?: boolean }) {
  const raw = (name ?? "").trim();
  if (!raw) return <>TBD</>;
  const code = /^([A-Za-z0-9/]+)-/.exec(raw)?.[1];
  return (
    <>
      {teamDisplayName(raw)}
      {tag && code ? <span className="code-tag">{code}</span> : null}
    </>
  );
}
