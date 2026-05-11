const { NextResponse } = require("next/server");
const { getSigniaPool, getPathPool } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

const CURP_ABSOLUTE_ROOT = "https://colaborador.casitaapps.com";

async function extractCurpFields(curpPath) {
  if (!curpPath) return null;
  return null;
}

async function GET(req, context) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const signiaDB = await getSigniaPool();
    const pathDB = await getPathPool();

    const [userRows] = await signiaDB.query(
      `SELECT u.id, u.nombres, u.apellidoPaterno, u.apellidoMaterno, u.name, u.email, u.evaId, u.pathId, u.plantelId, p.name AS plantelName, p.label AS plantelLabel, d.filePath AS curpPath, d.status AS curpStatus FROM user u LEFT JOIN document d ON d.userId = u.id AND d.type = 'CURP' LEFT JOIN plantel p ON p.id = u.plantelId WHERE u.isActive=1 ORDER BY u.nombres, u.apellidoPaterno, u.apellidoMaterno`,
    );

    const usersById = new Map();
    for (const row of userRows || []) {
      const key = String(row.id);
      const existing = usersById.get(key);
      if (!existing) {
        usersById.set(key, row);
        continue;
      }
      if (!existing.curpPath && row.curpPath) {
        existing.curpPath = row.curpPath;
        existing.curpStatus = row.curpStatus;
      }
    }
    const users = Array.from(usersById.values());

    const pathIds = users.filter((u) => u.pathId).map((u) => u.pathId);
    let pruebas = [];
    if (pathIds.length) {
      const [rows] = await pathDB.query(
        `SELECT candidato_id, catalogo_id, code, id as pruebaId FROM pruebas WHERE candidato_id IN (${pathIds.map(() => "?").join(",")}) AND code IS NOT NULL AND completada=1 ORDER BY pubdate DESC`,
        pathIds,
      );
      pruebas = rows;
    }

    const ecoMap = {};
    const mmpiMap = {};
    for (const p of pruebas) {
      if (p.catalogo_id === 1 && !ecoMap[p.candidato_id])
        ecoMap[p.candidato_id] = p;
      if (p.catalogo_id === 2 && !mmpiMap[p.candidato_id])
        mmpiMap[p.candidato_id] = p;
    }

    for (const u of users) {
      u.fullName = [u.nombres, u.apellidoPaterno, u.apellidoMaterno]
        .filter(Boolean)
        .join(" ");
      u.hasEva = !!u.evaId;
      u.hasPath = !!u.pathId;
      u.hasCurp = !!u.curpPath;
      u.curpAbsPath = u.curpPath
        ? u.curpPath.startsWith("http")
          ? u.curpPath
          : CURP_ABSOLUTE_ROOT + u.curpPath
        : "";

      const eco = ecoMap[u.pathId] || null;
      const mmpi = mmpiMap[u.pathId] || null;

      // Ensure 'url' assigns standard 'MMPI' but retains visual 'MMPI-2 RF' label
      u.ecoPrueba = eco
        ? {
            label: "ECO",
            url: `/api/path-pdf?cid=${eco.candidato_id}&pid=${eco.pruebaId}&code=${eco.code}&type=${encodeURIComponent("ECO")}`,
          }
        : null;
      u.mmpiPrueba = mmpi
        ? {
            label: "MMPI-2 RF",
            url: `/api/path-pdf?cid=${mmpi.candidato_id}&pid=${mmpi.pruebaId}&code=${mmpi.code}&type=${encodeURIComponent("MMPI")}`,
          }
        : null;

      u.hasEco = !!eco;
      u.hasMmpi = !!mmpi;
      u.missingApellido = !u.apellidoPaterno || !u.apellidoMaterno;
      u.missingNombres = !u.nombres;
      u.missingNames = u.missingNombres || u.missingApellido;
      u.missingAny =
        !u.hasEva ||
        !u.hasPath ||
        !u.hasCurp ||
        !u.hasEco ||
        !u.hasMmpi ||
        u.missingNames;
      u.missingDetail = [];
      if (!u.hasEva) u.missingDetail.push("EVA");
      if (!u.hasPath) u.missingDetail.push("PATH");
      if (!u.hasCurp) u.missingDetail.push("CURP");
      if (!u.hasEco) u.missingDetail.push("ECO");
      if (!u.hasMmpi) u.missingDetail.push("MMPI");
      if (u.missingApellido) u.missingDetail.push("Apellidos");
      if (u.missingNombres) u.missingDetail.push("Nombres");
      u.curpExtract = u.hasCurp ? await extractCurpFields(u.curpPath) : null;
    }
    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
module.exports = { GET };
