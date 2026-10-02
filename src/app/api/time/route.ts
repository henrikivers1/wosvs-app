import { connection } from "next/server";

// Reference clock for battle timing. Clients sample it a few times and use
// the lowest-latency sample to estimate their offset (see lib/serverClock).
export async function GET() {
  await connection();
  return Response.json(
    { now: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
