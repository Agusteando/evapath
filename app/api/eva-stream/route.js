const { NextResponse } = require("next/server");

async function GET(_req, _res) {
  return new NextResponse("Not implemented", { status: 501 });
}
module.exports = { GET };