const { NextResponse } = require("next/server");
const { getSigniaPool, logAudit } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { signiaId, source } = body;
    if (!signiaId || !["eva", "path"].includes(source))
      return NextResponse.json({ error: "Params" }, { status: 400 });

    const signiaDB = await getSigniaPool();
    await signiaDB.query(
      `UPDATE user SET ${source === "eva" ? "evaId" : "pathId"}=NULL WHERE id=?`,
      [signiaId]
    );

    await logAudit(session.user, "DISASSOCIATE_USER", signiaId, source.toUpperCase(), "SUCCESS", {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAudit(session?.user, "DISASSOCIATE_USER", null, "SYSTEM", "ERROR", { error: err.message });
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

module.exports = { POST };