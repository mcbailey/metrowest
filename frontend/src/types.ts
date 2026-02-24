export type IndexData = {
  generated_at: string | null;
  default: { yrseason: string; gender: "M" | "F"; grade: number };
  seasons: Array<{
    yrseason: string;
    label: string;
    genders: Array<"M" | "F">;
    grades: number[];
  }>;
};

export type DivisionsData = {
  yrseason: string;
  gender: "M" | "F";
  grade: number;
  snapshot_date: string;
  divisions: Array<{ divisionno: string; name: string; divisiontier?: string | null }>;
};

export type RankingTeam = {
  teamno: string;
  name: string;
  town?: string | null;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  diff: number;
  sos: number;
  sos_adj?: number;
  power: number;
  rank: number;
  mw_rating?: number | null;
  mw_points?: number | null;
};

export type DivisionRankingData = {
  yrseason: string;
  snapshot_date: string;
  gender: "M" | "F";
  grade: number;
  divisionno: string;
  division_name: string;
  divisiontier?: string | null;
  rankings: RankingTeam[];
};

export type TeamData = {
  yrseason: string;
  snapshot_date: string;
  teamno: string;
  team_name: string;
  town?: string | null;
  summary: {
    wins: number;
    losses: number;
    ties: number;
    pf: number;
    pa: number;
    diff: number;
    sos: number;
    sos_adj?: number;
    power: number;
    rank: number | null;
    mw_rating?: number | null;
    mw_points?: number | null;
    divisionno: string | null;
    division_name: string | null;
    grade: number | null;
    gender: "M" | "F" | null;
    games_played_total?: number;
    games_scheduled_total?: number;
  };
  past_games: TeamGame[];
  future_games: TeamGame[];
};

export type TeamGame = {
  gameno: string;
  date: string | null;
  dow: string | null;
  starttime: string | null;
  location: string | null;
  divisionno: string | null;
  division_name?: string | null;
  home_teamno: string | null;
  away_teamno: string | null;
  home_score: number | null;
  away_score: number | null;
  team_score?: number | null;
  opponent_score?: number | null;
  status: string;
  is_home: boolean | null;
  opponent_teamno: string | null;
  opponent_name: string | null;
};
