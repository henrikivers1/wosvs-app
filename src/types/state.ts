export type StateRole =
  | "owner"
  | "rally_caller"
  | "garrison"
  | "member";

export type StateMembership = {
  key: string;
  stateId: string;
  stateName: string;
  wosAccountId: string;
  wosId: string;
  wosNickname: string | null;
  role: StateRole;
  battleId: string | null;
};
