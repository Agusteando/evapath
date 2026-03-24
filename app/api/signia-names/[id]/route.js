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
  
  // Get existing user email for complete audit context
  let userEmail = "";
  try {
    const [rows] = await signiaDB.query("SELECT email FROM user WHERE id=?", [id]);
    if (rows.length) userEmail = rows[0].email;
  } catch(e) {}

  await signiaDB.query(
    "UPDATE user SET nombres=?, apellidoPaterno=?, apellidoMaterno=? WHERE id=?",
    [nombres, apellidoPaterno, apellidoMaterno, id]
  );

  const fullName = `${nombres} ${apellidoPaterno} ${apellidoMaterno}`.trim();
  const targetObj = { id, name: fullName, email: userEmail };

  await logAudit(session.user, "UPDATE_NAMES", targetObj, "SIGNIA", "SUCCESS", { nombres, apellidoPaterno, apellidoMaterno });

  return NextResponse.json({ ok: true });
}

module.exports = { PATCH };