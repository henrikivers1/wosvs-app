import { OraclePlayerError } from "@/lib/wosOracle";

export function oracleErrorResponse(error: unknown, context: string) {
  if (error instanceof OraclePlayerError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(`[${context}] Unexpected failure:`, error);
  return Response.json({ error: "WOSOracle request failed." }, { status: 500 });
}

export function positiveInteger(value: string | null) {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}
