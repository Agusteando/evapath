import { getPublicEvaStatus, jsonResponse, optionsResponse } from "../../_lib/eva-public.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const waitForReady = searchParams.get("wait") === "1" || searchParams.get("wait") === "true";
  const result = await getPublicEvaStatus(req, { waitForReady });
  return jsonResponse(result.payload, result.status);
}
