const { NextResponse } = require("next/server");
const { getEva } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const eva = getEva();
  if (!eva.ready) return NextResponse.json({ ready: false, entities: [], error: "EVA service not ready" }, { status: 503 });

  try {
    const dashboard = await eva.get("EnterpriseDashBoard/Dashboard", true);
    return NextResponse.json({ ready: true, dashboard, totalCandidates: eva.results.length, cachedCount: Object.keys(eva.cache).length });
  } catch (err) {
    return NextResponse.json({ error: err.message, totalCandidates: eva.results.length, cachedCount: Object.keys(eva.cache).length }, { status: 500 });
  }
}
module.exports = { GET };