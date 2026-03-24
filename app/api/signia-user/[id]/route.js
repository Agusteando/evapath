const { NextResponse } = require("next/server");
const { getSigniaPool } = require("../../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../../lib/auth");

async function GET(_req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const params = await context.params;
  const signiaDB = await getSigniaPool();
  const [r] = await signiaDB.query("SELECT id,email,name,evaId,pathId FROM user WHERE id=?", [params.id]);
  if (!r.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r[0]);
}

module.exports = { GET };