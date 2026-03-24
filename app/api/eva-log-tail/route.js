const { NextResponse } = require("next/server");
const { evaLogTailSingleton } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  return NextResponse.json(await evaLogTailSingleton());
}
module.exports = { GET };