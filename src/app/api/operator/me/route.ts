import { requireOperator } from "@/lib/operator";

// Whether the signed-in player may open /operator.
export async function GET() {
  const admin = await requireOperator();
  return Response.json({ operator: !(admin instanceof Response) });
}
