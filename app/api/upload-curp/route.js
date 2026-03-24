const { NextResponse } = require("next/server");
const path = require("path");
const fs = require("fs/promises");
const { getSigniaPool } = require("../shared");
const { getServerSession } = require("next-auth/next");
const { authOptions } = require("../../lib/auth");

const UPLOAD_DIR = "public/uploads/curp";

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const form = await req.formData();
  const file = form.get("curp");
  const userId = parseInt(form.get("userId"), 10);
  if (!file || isNaN(userId)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  await ensureDir(UPLOAD_DIR);
  const ext = file.name && path.extname(file.name) || ".pdf";
  const fname = "curp-" + userId + "-" + Date.now() + ext;
  const destPath = path.join(UPLOAD_DIR, fname);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destPath, buf);

  const filePath = "/uploads/curp/" + fname;

  const signiaDB = await getSigniaPool();
  await signiaDB.query("DELETE FROM documents WHERE userId=? AND type='CURP'", [userId]);
  await signiaDB.query("INSERT INTO documents (id, userId, type, status, filePath, version) VALUES (?, ?, ?, ?, ?, ?)", [String(Date.now()) + "-" + userId, userId, "CURP", "PENDING", filePath, 1]);

  return NextResponse.json({ filePath });
}

module.exports = { POST };