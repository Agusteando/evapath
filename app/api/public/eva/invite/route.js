import { optionsResponse, publicEvaInvite } from "../../_lib/eva-public.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(req) {
  return publicEvaInvite(req, { defaultSendEmail: true, auditAction: "PUBLIC_API_EVA_INVITE" });
}
