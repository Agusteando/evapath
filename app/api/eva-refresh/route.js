const { NextResponse } = require("next/server");
const { resetEva } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

let refreshing = false;

async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  if (refreshing) return NextResponse.json({ ok: false, msg: "Already refreshing" }, { status: 429 });
  refreshing = true;
  try {
    await resetEva();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  } finally {
    refreshing = false;
  }
}

module.exports = { POST };