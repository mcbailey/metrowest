import { useEffect, useState } from "react";

/** Teams a visitor starred ("My teams"). Kept in this browser only; nothing is sent anywhere. */
export type FavoriteTeam = { season: string; teamno: string; name: string };

const KEY = "mwstats:my-teams";
const EVENT = "mwstats:my-teams-changed";

function read(): FavoriteTeam[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as FavoriteTeam[];
    return Array.isArray(parsed) ? parsed.filter((t) => t && t.season && t.teamno) : [];
  } catch {
    return [];
  }
}

function write(teams: FavoriteTeam[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(teams));
  } catch {
    // Storage can be unavailable (private mode); starring then lasts only for this page view.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useFavorites(): {
  favorites: FavoriteTeam[];
  isFavorite: (teamno: string) => boolean;
  toggle: (team: FavoriteTeam) => void;
} {
  const [favorites, setFavorites] = useState<FavoriteTeam[]>(read);

  useEffect(() => {
    const sync = () => setFavorites(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return {
    favorites,
    isFavorite: (teamno) => favorites.some((t) => t.teamno === teamno),
    toggle: (team) => {
      const current = read();
      write(
        current.some((t) => t.teamno === team.teamno)
          ? current.filter((t) => t.teamno !== team.teamno)
          : [...current, team]
      );
    },
  };
}
