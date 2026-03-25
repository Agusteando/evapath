import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { getEva } from "../../shared";

const EVA_UNIDADES = {
  'dictámenes': 11031,
  'guarderías': 7176,
  'casitas': 7176,
  'preescolar': 7382,
  'primarias': 7380,
  'secundarias': 7381,
  'prepa': 26856
};

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const system = searchParams.get("system") || "EVA";
  
  try {
    if (system === "EVA") {
      const eva = getEva();
      if (!eva.ready) return NextResponse.json({ error: "EVA no está listo" }, { status: 503 });

      const uniqueIds = Array.from(new Set(Object.values(EVA_UNIDADES)));
      let allPuestos = [];

      await Promise.all(uniqueIds.map(async (id) => {
        try {
          const res = await eva.get(`EnterpriseDashBoard/Entity/Detail/${id}/false`, true);
          if (res && res.SF && res.SF.JPF) {
            res.SF.JPF.forEach(jpf => {
              if (!jpf.N.toLowerCase().includes('intendencia')) {
                allPuestos.push({ id: jpf.JPI, name: jpf.N, unit: res.N });
              }
            });
          }
        } catch (e) {
          console.error(`Error fetching EVA Puestos para ID ${id}:`, e.message);
        }
      }));

      // Sort alphabetically by unit then name
      allPuestos.sort((a, b) => {
        if (a.unit < b.unit) return -1;
        if (a.unit > b.unit) return 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ puestos: allPuestos });

    } else if (system === "PATH") {
      const res = await fetch('https://reclutamiento.casitaapps.com/fetch-estructuras.php', {
        method: 'POST',
        body: JSON.stringify({ data: { id: 1, origin: 0 } })
      });
      const data = await res.json();
      
      const items = Object.values(data).flat()
        .filter(e => e.puesto)
        .map(e => ({ id: e.puesto_id, name: e.puesto, unit: e.estructura }));
        
      items.sort((a, b) => {
        if (a.unit < b.unit) return -1;
        if (a.unit > b.unit) return 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ puestos: items });
    } else {
      return NextResponse.json({ error: "Sistema no válido" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}