import { connection } from "next/server";
import { json } from "@/lib/server/http";
import { getStatus } from "@/lib/server/status";

export async function GET() {
  // Tanpa ini, Cache Components akan mem-prerender respons saat build dan env runtime tidak terbaca.
  await connection();
  return json(getStatus());
}
