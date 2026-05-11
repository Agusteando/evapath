import { getAllAvailability, jsonResponse, optionsResponse } from "../../../_lib/dictamen.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(req, context) {
  const params = await context.params;
  const result = await getAllAvailability(params.signiaId, req);
  return jsonResponse(result.payload, result.status);
}
