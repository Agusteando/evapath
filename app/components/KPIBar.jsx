"use client"
export default function KPIBar({ active, res, bigRes }) {
  const kpi = (v, l, keyIdx = 0, warn = false) => (
    <div
      className={
        "flex-1 min-w-[110px] max-w-xs rounded-xl shadow-sm border px-4 py-3 flex flex-col items-center mx-1 " +
        (warn 
          ? "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300"
          : "bg-gradient-to-br from-white to-indigo-50 border-indigo-100")
      }
      key={l + String(keyIdx)}
    >
      <div className={"text-2xl md:text-3xl font-bold tracking-tight " + (warn ? "text-amber-700" : "text-indigo-700")}>
        {v}
      </div>
      <div className={"mt-1 text-xs font-semibold " + (warn ? "text-amber-900" : "text-indigo-900")}>
        {l}
      </div>
    </div>
  );
  
  if (!res) return <section className="flex gap-2 my-2"></section>;
  
  if (active === "signia") {
    const st = res.stats || { evaMatched: 0, pathMatched: 0, evaPct: "0.0", pathPct: "0.0", total: 0 };
    const tot = st.total ?? 0;
    const recent =
      (res.fullUsers || []).filter(
        (u) =>
          u.fechaIngresoISO &&
          new Date(u.fechaIngresoISO) > new Date("2025-07-01"),
      ).length;
    
    const evaNotReady = res.evaReady === false;
    
    return (
      <section className="flex flex-col md:flex-row gap-2 mb-4 justify-center">
        {kpi(tot, "Total")}
        {kpi(st.evaMatched, evaNotReady ? "Eva Matched ⚠️" : "Eva Matched", 1, evaNotReady)}
        {kpi(st.pathMatched, "Path Matched")}
        {kpi(`${st.evaPct}%`, evaNotReady ? "% Eva ⚠️" : "% Eva", 3, evaNotReady)}
        {kpi(`${st.pathPct}%`, "% PATH")}
        {kpi(recent, "Ingresos ≥ 01-07-2025")}
        {evaNotReady && (
          <div className="w-full text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
            ⚠️ EVA service no disponible - Mostrando datos parciales de Signia y PATH
          </div>
        )}
      </section>
    );
  }
  
  if (active === "eva") {
    const s = res.stats || { evaluando: 0, invitado: 0, postulado: 0, evaluado: 0 };
    return (
      <section className="flex flex-col md:flex-row gap-2 mb-4 justify-center">
        {kpi(s.evaluado, "Evaluado")}
        {kpi(s.evaluando, "Evaluando")}
        {kpi(s.invitado, "Invitado")}
        {kpi(s.postulado, "Postulado")}
      </section>
    );
  }
  
  if (active === "path" && bigRes) {
    const all = bigRes.users || [];
    const tot = all.length;
    const match = all.filter((u) => u.pathLinks.length).length;
    const pct = tot ? ((match / tot) * 100).toFixed(1) : "0.0";
    return (
      <section className="flex flex-col md:flex-row gap-2 mb-4 justify-center">
        {kpi(tot, "Total PATH", 0)}
        {kpi(match, "Matched", 1)}
        {kpi(tot - match, "Unmatched", 2)}
        {kpi(`${pct}%`, "% Matched", 3)}
      </section>
    );
  }
  
  return <section className="flex gap-2 my-2"></section>;
}