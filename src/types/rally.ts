export type EnemyLeader = {
  id: number;
  name: string;
  x: number;
  y: number;
  petExpiresAt: number | null;
  wosId: string | null;
  power: number | null;
  allianceAbbr: string | null;
};

// Extra details when a leader was picked from a WOSOracle roster.
export type EnemyLeaderDetails = {
  wosId: string | null;
  power: number | null;
  allianceAbbr: string | null;
};

export type EnemyRally = {
  id: number;
  enemyName: string;
  x: number;
  y: number;
  marchTime: number;
  impactTime: Date;
  petActive: boolean;
};
