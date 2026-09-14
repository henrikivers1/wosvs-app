export type EnemyRally = {
  id: number;
  enemyName: string;
  x: number;
  y: number;
  marchTime: number;
  impactTime: Date;
  petActive: boolean;
};

export type RallyWave = {
  impactSecond: number;
  rallies: EnemyRally[];
};