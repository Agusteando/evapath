import { optionsResponse, streamEvaDictamen } from "../../../../_lib/dictamen.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(req, context) {
  const params = await context.params;
  return streamEvaDictamen(params.signiaId, req);
}
