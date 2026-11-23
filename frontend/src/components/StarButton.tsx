import { useFavorites } from "../favorites";

/** Adds or removes a team from "My teams". */
export function StarButton({ season, teamno, name }: { season: string; teamno: string; name: string }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(teamno);
  return (
    <button
      type="button"
      className={`star-btn ${on ? "star-on" : ""}`}
      aria-pressed={on}
      onClick={() => toggle({ season, teamno, name })}
    >
      {on ? "★ In My teams" : "☆ Add to My teams"}
    </button>
  );
}
