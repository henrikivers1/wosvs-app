export type StateRole = "owner" | "admin" | "member";

export type StateCapability = "rally_caller" | "garrison";

export type StateMembership = {
  key: string;
  stateId: string;
  stateName: string;
  wosAccountId: string;
  wosId: string;
  wosNickname: string | null;
  role: StateRole;
  capabilities: StateCapability[];
  battleId: string | null;
  battleName: string | null;
};
