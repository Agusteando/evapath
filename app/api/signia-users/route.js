const { NextResponse } = require("next/server");
const { getSigniaPool, getPathPool, getEva, label, pdfURL } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const signiaDB = await getSigniaPool();
    const pathDB = await getPathPool();
    
    const [sigAll] = await signiaDB.query("SELECT id,email,name,evaId,pathId,fechaIngreso FROM user");

    const eva = getEva();
    let evaUsers = [];
    if (eva.ready) {
      try { evaUsers = eva.getUsers(); } catch (e) { console.warn("[signia-users] EVA getUsers failed:", e.message); }
    }
    const evaMap = Object.fromEntries(evaUsers.map(u => [u.correo, u]));
    
    const emails = sigAll.map(u => u.email);
    let cand = [];
    if (emails.length) {
      [cand] = await pathDB.query(`SELECT id,email FROM candidatos WHERE email IN (${emails.map(() => "?").join(",")})`, emails);
    }
    const candIdByEmail = Object.fromEntries(cand.map(c => [c.email, c.id]));
    const ids = cand.map(c => c.id);
    let pruebas = [];
    if (ids.length) {
      const [rows] = await pathDB.query(
        `SELECT candidato_id,id as pid,code,catalogo_id FROM pruebas WHERE candidato_id IN (${ids.map(() => "?").join(",")}) AND code IS NOT NULL AND completada=1 ORDER BY pubdate DESC`,
        ids
      );
      pruebas = rows;
    }
    const linkByEmail = {};
    const emailById = Object.fromEntries(cand.map(c => [c.id, c.email]));
    pruebas.forEach(p => {
      const mail = emailById[p.candidato_id], lab = label(p.catalogo_id);
      const url = pdfURL(p.candidato_id, p.pid, p.code, p.catalogo_id);
      if (!linkByEmail[mail]) linkByEmail[mail] = [];
      if (!linkByEmail[mail].find(x => x.label === lab)) linkByEmail[mail].push({ label: lab, url });
    });
    
    sigAll.forEach(u => {
      const eva = evaMap[u.email];
      u.evaMatch = !!eva;
      u.evaName = eva?.nombre || "";
      u.evaCID = eva?.CID || null;
      u.evaEstado = eva?.estado || null;
      u.namesMatchEva = eva ? u.name === eva.nombre : false;
      u.pathMatch = !!candIdByEmail[u.email];
      u.pathLinks = linkByEmail[u.email] || [];
      u.fechaIngresoISO = u.fechaIngreso ? new Date(u.fechaIngreso).toISOString() : null;
    });
    
    sigAll.sort((a, b) => {
      const tA = a.fechaIngresoISO ? new Date(a.fechaIngresoISO).getTime() : 0;
      const tB = b.fechaIngresoISO ? new Date(b.fechaIngresoISO).getTime() : 0;
      return tB - tA;
    });

    const evaMat = sigAll.filter(u => u.evaId || u.evaMatch).length;
    const pathMat = sigAll.filter(u => u.pathId || u.pathMatch).length;
    const evaPct = sigAll.length ? ((evaMat / sigAll.length) * 100).toFixed(1) : "0.0";
    const pathPct = sigAll.length ? ((pathMat / sigAll.length) * 100).toFixed(1) : "0.0";
    
    let list = sigAll;
    const { searchParams } = new URL(req.url);
    if (searchParams.get("onlyMissing") === "1") list = list.filter(u => !(u.evaId && u.pathId));
    const q = (searchParams.get("q") || "").toLowerCase();
    if (q) list = list.filter(u => (u.name + u.email).toLowerCase().includes(q));
    
    const pag = (a, p, ps) => {
      const tot = a.length, last = Math.max(1, Math.ceil(tot / ps));
      p = Math.max(1, Math.min(p, last));
      return { items: a.slice((p - 1) * ps, (p - 1) * ps + ps), page: p, pageSize: ps, total: tot, lastPage: last };
    };
    const { items, page, pageSize, total, lastPage } = pag(
      list, parseInt(searchParams.get("page") || 1), parseInt(searchParams.get("pageSize") || 20)
    );
    
    return NextResponse.json({
      users: items,
      signiaStats: { evaMatched: evaMat, evaUnmatched: sigAll.length - evaMat, evaPct, pathMatched: pathMat, pathUnmatched: sigAll.length - pathMat, pathPct, total: sigAll.length },
      page, pageSize, total, lastPage, evaReady: eva.ready, evaStatus: eva.status
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, users: [], signiaStats: { evaMatched: 0, evaUnmatched: 0, evaPct: "0.0", pathMatched: 0, pathUnmatched: 0, pathPct: "0.0", total: 0 }, page: 1, pageSize: 20, total: 0, lastPage: 1 }, { status: 500 });
  }
}
module.exports = { GET };