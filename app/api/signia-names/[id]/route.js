const { NextResponse } = require("next/server");
const { getSigniaPool, logAudit } = require("../../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../../lib/auth");

async function PATCH(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const params = await context.params;
  const id = parseInt(params.id, 10);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const data = await req.json();
  const { nombres, apellidoPaterno, apellidoMaterno } = data || {};
  if (typeof nombres !== "string" || typeof apellidoPaterno !== "string" || typeof apellidoMaterno !== "string")
    return NextResponse.json({ error: "All fields required" }, { status: 400 });

  const signiaDB = await getSigniaPool();
  await signiaDB.query(
    "UPDATE user SET nombres=?, apellidoPaterno=?, apellidoMaterno=? WHERE id=?",
    [nombres, apellidoPaterno, apellidoMaterno, id]
  );

  await logAudit(session.user, "UPDATE_NAMES", id, "SIGNIA", "SUCCESS", { nombres, apellidoPaterno, apellidoMaterno });

  return NextResponse.json({ ok: true });
}

module.exports = { PATCH };