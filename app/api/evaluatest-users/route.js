const { NextResponse } = require("next/server");
const { getSigniaPool, getEva } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const eva = getEva();
  
  if (!eva.ready) return NextResponse.json({ loading: true, users: [], stats: {}, ready: false, status: eva.status || "init", page: 1, pageSize: 20, total: 0, lastPage: 1 }, { status: 202 });

  let evaUsers = [];
  try {
    evaUsers = eva.getUsers();
  } catch (e) {
    return NextResponse.json({ loading: true, users: [], stats: {}, ready: false, status: "error", error: e.message, page: 1, pageSize: 20, total: 0, lastPage: 1 }, { status: 202 });
  }

  if (!evaUsers.length) return NextResponse.json({ loading: true, users: [], stats: {}, ready: true, status: eva.status, page: 1, pageSize: 20, total: 0, lastPage: 1 }, { status: 202 });

  evaUsers = evaUsers.map(u => ({ ...u, nombre: u.N || u.nombre || "", puesto: u.JN || u.puesto || "", correo: u.M || u.correo || "" }));

  const { searchParams } = new URL(req.url);
  const emails = evaUsers.map(u => u.correo);

  const signiaDB = await getSigniaPool();
  let sig = [];
  if (emails.length) {
    sig = (await signiaDB.query(`SELECT id,email,name FROM user WHERE email IN (${emails.map(() => "?").join(",")})`, emails))[0];
  }
  const sigMap = Object.fromEntries(sig.map(r => [r.email, r]));
  evaUsers.forEach(u => {
    const m = sigMap[u.correo];
    u.dbMatch = !!m;
    u.dbId = m?.id || null;
    u.dbName = m?.name || "";
    u.namesMatch = m ? u.nombre === m.name : false;
  });
  
  let list = evaUsers;
  const filter = searchParams.get("filter");
  if (filter === "matched") list = list.filter(u => u.dbMatch);
  if (filter === "unmatched") list = list.filter(u => !u.dbMatch);
  
  const q = (searchParams.get("q") || "").toLowerCase();
  if (q) list = list.filter(u => (u.nombre || "").toLowerCase().includes(q) || (u.puesto || "").toLowerCase().includes(q) || (u.correo || "").toLowerCase().includes(q) || (u.estado || "").toLowerCase().includes(q));
    
  const pag = (a, p, ps) => {
    const tot = a.length, last = Math.max(1, Math.ceil(tot / ps));
    p = Math.max(1, Math.min(p, last));
    return { items: a.slice((p - 1) * ps, (p - 1) * ps + ps), page: p, pageSize: ps, total: tot, lastPage: last };
  };
  
  const { items, page, pageSize, total, lastPage } = pag(list, parseInt(searchParams.get("page") || 1), parseInt(searchParams.get("pageSize") || 20));
  
  const stats = { evaluando: evaUsers.filter(u => u.estado === "Evaluando").length, invitado: evaUsers.filter(u => u.estado === "Invitado").length, postulado: evaUsers.filter(u => u.estado === "Postulado").length, evaluado: evaUsers.filter(u => u.estado === "Evaluado").length };
  
  return NextResponse.json({ users: items, stats, page, pageSize, total, lastPage, ready: true, status: eva.status });
}
module.exports = { GET };