import {
  demoTable,
  newNumericId,
  newUuid,
  nowIso,
  saveDemoTables,
  type Row,
} from "@/lib/demo/store";
import {
  emitDemoMemberNotifications,
  snapshotDemoMembers,
} from "@/lib/demo/notify";

// Direct table writes that should notify, like the database triggers.
const NOTIFYING_TABLES = new Set([
  "state_members",
  "state_member_capabilities",
  "state_member_tags",
  "state_alliance_members",
  "battle_plan_assignments",
  "battles",
]);

export type DemoError = { message: string; code?: string };
export type DemoResult = {
  data: unknown;
  error: DemoError | null;
  count?: number | null;
};

// Tables keyed by a generated bigint id; the rest of the keyed tables use uuids.
const NUMERIC_ID_TABLES = new Set(["notifications", "enemy_leaders", "rallies"]);
const KEYLESS_TABLES = new Set([
  "state_members",
  "state_member_tags",
  "state_member_capabilities",
  "state_alliance_members",
  "state_announcement_recipients",
  "battle_plan_assignments",
  "battle_attendance",
  "battle_intel",
]);

// Embedded relations the app selects, e.g. state_members -> wos_accounts(...).
const RELATIONS: Record<string, Record<string, string>> = {
  state_members: { wos_accounts: "wos_account_id", states: "state_id" },
  battles: { battle_plans: "plan_id" },
};

type Filter = (row: Row) => boolean;

function same(left: unknown, right: unknown) {
  return left === right || String(left) === String(right);
}

function compare(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
  });
}

function embeddedTables(columns: string) {
  return [...columns.matchAll(/([a-z_]+)(?:!inner)?\s*\(/g)].map(
    (match) => match[1],
  );
}

function uniqueViolation(table: string, row: Row, rows: Row[]) {
  const clash = (other: Row) => {
    if (table === "wos_accounts") return same(other.wos_id, row.wos_id);
    if (table === "state_tags") {
      return (
        same(other.state_id, row.state_id) &&
        String(other.name).toLowerCase() === String(row.name).toLowerCase()
      );
    }
    if (table === "state_member_tags") {
      return (
        same(other.tag_id, row.tag_id) &&
        same(other.wos_account_id, row.wos_account_id)
      );
    }
    return false;
  };
  return rows.some((other) => other !== row && clash(other));
}

export class DemoQuery implements PromiseLike<DemoResult> {
  private filters: Filter[] = [];
  private action: "select" | "insert" | "update" | "delete" | "upsert" =
    "select";
  private payload: Row[] = [];
  private changes: Row = {};
  private columns = "*";
  private returning = false;
  private orders: { column: string; ascending: boolean }[] = [];
  private maxRows: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private countOnly = false;

  constructor(private table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.columns = columns;
    if (this.action !== "select") this.returning = true;
    if (options?.head) this.countOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.action = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.action = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(changes: Row) {
    this.action = "update";
    this.changes = changes;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => same(row[column], value));
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => !same(row[column], value));
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.some((value) => same(row[column], value)));
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      this.filters.push((row) => (row[column] ?? null) !== value);
    }
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) > 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) <= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) < 0);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }
  limit(count: number) {
    this.maxRows = count;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  then<TResult1 = DemoResult, TResult2 = never>(
    onfulfilled?: ((value: DemoResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((filter) => filter(row));
  }

  private withDefaults(row: Row): Row {
    const filled: Row = { created_at: nowIso(), ...row };
    if (!KEYLESS_TABLES.has(this.table) && filled.id === undefined) {
      filled.id = NUMERIC_ID_TABLES.has(this.table) ? newNumericId() : newUuid();
    }
    if (this.table === "notifications") filled.read_at ??= null;
    return filled;
  }

  private shape(rows: Row[]) {
    const embeds = embeddedTables(this.columns);
    if (embeds.length === 0) return rows.map((row) => ({ ...row }));
    return rows.map((row) => {
      const shaped: Row = { ...row };
      for (const embed of embeds) {
        const key = RELATIONS[this.table]?.[embed];
        shaped[embed] = key
          ? (demoTable(embed).find((other) => same(other.id, row[key])) ?? null)
          : null;
      }
      return shaped;
    });
  }

  private finish(rows: Row[]): DemoResult {
    let result = rows;
    for (const { column, ascending } of [...this.orders].reverse()) {
      result = [...result].sort(
        (first, second) =>
          compare(first[column], second[column]) * (ascending ? 1 : -1),
      );
    }
    if (this.maxRows !== null) result = result.slice(0, this.maxRows);
    if (this.countOnly) return { data: null, error: null, count: result.length };
    const shaped = this.shape(result);
    if (this.singleMode) {
      if (shaped.length > 1 || (this.singleMode === "single" && !shaped.length)) {
        return {
          data: null,
          error: { message: "Expected exactly one row.", code: "PGRST116" },
        };
      }
      return { data: shaped[0] ?? null, error: null };
    }
    return { data: shaped, error: null, count: shaped.length };
  }

  private execute(): DemoResult {
    if (this.action === "select" || !NOTIFYING_TABLES.has(this.table)) {
      return this.write();
    }
    const before = snapshotDemoMembers();
    const result = this.write();
    if (!result.error) {
      emitDemoMemberNotifications(before);
      saveDemoTables();
    }
    return result;
  }

  private write(): DemoResult {
    const rows = demoTable(this.table);

    if (this.action === "select") {
      return this.finish(rows.filter((row) => this.matches(row)));
    }

    if (this.action === "insert" || this.action === "upsert") {
      const written: Row[] = [];
      for (const raw of this.payload) {
        const row = this.withDefaults(raw);
        if (this.action === "upsert" && row.id !== undefined) {
          const existing = rows.find((other) => same(other.id, row.id));
          if (existing) {
            Object.assign(existing, row);
            written.push(existing);
            continue;
          }
        }
        if (uniqueViolation(this.table, row, rows)) {
          return {
            data: null,
            error: { message: "That already exists.", code: "23505" },
          };
        }
        rows.push(row);
        written.push(row);
      }
      saveDemoTables();
      return this.returning ? this.finish(written) : { data: null, error: null };
    }

    if (this.action === "update") {
      const updated = rows.filter((row) => this.matches(row));
      updated.forEach((row) => Object.assign(row, this.changes));
      saveDemoTables();
      return this.returning ? this.finish(updated) : { data: null, error: null };
    }

    // delete: like row-level security, accounts still in a state stay.
    const removed = rows.filter(
      (row) =>
        this.matches(row) &&
        !(
          this.table === "wos_accounts" &&
          demoTable("state_members").some((member) =>
            same(member.wos_account_id, row.id),
          )
        ),
    );
    const table = demoTable(this.table);
    removed.forEach((row) => table.splice(table.indexOf(row), 1));
    saveDemoTables();
    return this.returning ? this.finish(removed) : { data: null, error: null };
  }
}
