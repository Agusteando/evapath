const { NextResponse } = require("next/server");
const { getPathPool, label, pdfURL } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const pathDB = await getPathPool();
    const [cand] = await pathDB.query("SELECT id,email,CONCAT_WS(' ',nombres,apellidopaterno,apellidomaterno) AS nombre FROM candidatos");
    const ids = cand.map(c => c.id);
    let pruebas = [];
    if (ids.length) {
      const [pRows] = await pathDB.query(`SELECT candidato_id,id as pid,code,catalogo_id FROM pruebas WHERE candidato_id IN (${ids.map(() => "?").join(",")}) AND code IS NOT NULL AND completada=1 ORDER BY pubdate DESC`, ids);
      pruebas = pRows;
    }
    const links = {};
    pruebas.forEach(p => {
      const lab = label(p.catalogo_id);
      const url = pdfURL(p.candidato_id, p.pid, p.code, p.catalogo_id);
      if (!links[p.candidato_id]) links[p.candidato_id] = [];
      if (!links[p.candidato_id].find(x => x.label === lab)) links[p.candidato_id].push({ label: lab, url });
    });
    cand.forEach(c => (c.pathLinks = links[c.id] || []));
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").toLowerCase();
    let list = cand;
    if (q) list = list.filter(c => (c.nombre + c.email).toLowerCase().includes(q));
    const pag = (a, p, ps) => {
      const tot = a.length, last = Math.max(1, Math.ceil(tot / ps));
      p = Math.max(1, Math.min(p, last));
      return { items: a.slice((p - 1) * ps, (p - 1) * ps + ps), page: p, pageSize: ps, total: tot, lastPage: last };
    };
    const { items, page, pageSize, total, lastPage } = pag(list, parseInt(searchParams.get("page") || 1), parseInt(searchParams.get("pageSize") || 20));
    return NextResponse.json({ users: items, page, pageSize, total, lastPage });
  } catch (err) {
    return NextResponse.json({ error: err.message, users: [], page: 1, pageSize: 20, total: 0, lastPage: 1 }, { status: 500 });
  }
}
module.exports = { GET };