export type SeasonGroup = {
  gender: "M" | "F";
  grade: number;
  divisions: number;
  teams: number;
  playoffs?: boolean;
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
  town_slug?: string | null;
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
  town_slug?: string | null;
  class_of?: number | null;
  playoffs?: TeamPlayoffResult[];
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

export type TeamPlayoffResult = {
  groupno: string;
  group_name: string;
  seed: number | null;
  result: string;
};

export type TownTeam = {
  yrseason: string;
  teamno: string;
  name: string;
  gender: "M" | "F";
  grade: number;
  class_of: number;
  division_tag?: string | null;
  divisiontier?: string | null;
  rank: number;
  division_size?: number;
  wins: number;
  losses: number;
  ties: number;
  power: number;
  playoffs: string[];
};

export type TownData = {
  slug: string;
  name: string;
  seasons: string[];
  teams: TownTeam[];
};

export type TownsData = {
  towns: Array<{ slug: string; name: string; seasons: number; latest_season: string; latest_teams: number }>;
};

export type BracketTeam = {
  teamno: string | null;
  name: string | null;
  seed: number | null;
  score: number | null;
  from_game: number | null;
};

export type BracketGame = {
  id: string;
  round: number;
  game: number;
  when: string | null;
  venue: string | null;
  teams: [BracketTeam, BracketTeam];
  winner: string | null;
};

export type PlayoffGroup = {
  groupno: string;
  name: string;
  numteams: number | null;
  rounds: number;
  games: BracketGame[];
};

export type PlayoffsData = {
  yrseason: string;
  gender: "M" | "F";
  grade: number;
  groups: PlayoffGroup[];
};
