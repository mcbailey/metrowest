export type SeasonGroup = {
  gender: "M" | "F";
  grade: number;
  divisions: number;
  teams: number;
};

export type SeasonEntry = {
  yrseason: string;
  label: string;
  status?: "final" | "in_progress" | string;
  is_current?: boolean;
  snapshot_date?: string;
  team_count?: number;
  genders: Array<"M" | "F">;
  grades: number[];
  groups?: SeasonGroup[];
};

export type IndexData = {
  generated_at: string | null;
  ranking_profile?: "classic" | "division-aware" | string | null;
  current?: string | null;
  default: { yrseason: string; gender: "M" | "F"; grade: number };
  seasons: SeasonEntry[];
};

export type SearchTeam = {
  teamno: string;
  name: string;
  town?: string | null;
  gender: "M" | "F";
  grade: number;
  divisionno: string;
  division_tag?: string | null;
  divisiontier?: string | null;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
};

export type SearchData = {
  yrseason: string;
  teams: SearchTeam[];
};

export type DivisionsData = {
  yrseason: string;
  gender: "M" | "F";
  grade: number;
  snapshot_date: string;
  divisions: Array<{
    divisionno: string;
    name: string;
    divisiontier?: string | null;
    code?: string | null;
    tag?: string | null;
  }>;
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
  code?: string | null;
  tag?: string | null;
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
    division_tag?: string | null;
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
  forfeit?: boolean;
};
