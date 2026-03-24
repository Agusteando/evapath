"use client";
import { useState, useEffect } from "react";
import DownloadButton from "../DownloadButton";
import Pagination from "../Pagination";
import StatusBadge from "../StatusBadge";

// Helper for initials
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RecentsView() {
  const [data, setData] = useState({ users: [], signiaStats: {}, loading: true, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("recent");

  const fetchData = async () => {
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/signia-users?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData({ ...json, loading: false });
    } catch (e) {
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, q]);

  let displayUsers = data.users || [];
  if (filter === "matched") displayUsers = displayUsers.filter((u) => u.evaCID || u.pathLinks?.length);
  if (filter === "unmatched") displayUsers = displayUsers.filter((u) => !u.evaCID && !u.pathLinks?.length);
  if (filter === "recent") displayUsers = displayUsers.filter((u) => new Date(u.fechaIngresoISO) > new Date("2025-07-01"));

  return (
    <div className="flex flex-col h-full bg-[#FDFDFE] flex-1 overflow-hidden relative">
      <div className="px-8 py-8 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white shadow-sm z-10 relative">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Candidatos Recientes</h1>
          <p className="text-sm text-slate-500 mt-1">Directorio consolidado de ingresos y vinculaciones EVA/PATH.</p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Base Signia</span>
            <span className="text-2xl font-black text-slate-800 leading-none">{data.signiaStats?.total || 0}</span>
          </div>
          <div className="w-px bg-slate-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">EVA Linked</span>
            <span className="text-2xl font-black text-blue-600 leading-none">{data.signiaStats?.evaMatched || 0}</span>
          </div>
          <div className="w-px bg-slate-200 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">PATH Linked</span>
            <span className="text-2xl font-black text-emerald-600 leading-none">{data.signiaStats?.pathMatched || 0}</span>
          </div>
        </div>
      </div>

      <div className="px-8 py-4 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 bg-slate-50/50">
        <div className="relative w-full max-w-lg">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="search" 
            placeholder="Buscar por nombre o correo electrónico..." 
            value={q} 
            onChange={(e) => { setQ(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
          />
        </div>
        <div className="flex bg-slate-200/50 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
          {[
            { id: "recent", label: "Ingresos > Jul" },
            { id: "all", label: "Todos" },
            { id: "matched", label: "Vinculados" },
            { id: "unmatched", label: "Pendientes" }
          ].map((f) => (
            <button 
              key={f.id} 
              onClick={() => setFilter(f.id)} 
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${filter === f.id ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#FDFDFE]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-8 py-3.5 tracking-wide">Candidato</th>
              <th className="px-8 py-3.5 tracking-wide">Ingreso</th>
              <th className="px-8 py-3.5 tracking-wide">Reporte EVA</th>
              <th className="px-8 py-3.5 tracking-wide">Resultados PATH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.loading ? (
              <tr><td colSpan="4" className="px-8 py-12 text-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" /><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" /></svg>
                Cargando base de datos...
              </td></tr>
            ) : displayUsers.length === 0 ? (
              <tr><td colSpan="4" className="px-8 py-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold text-slate-700">No se encontraron registros</div>
                <div className="text-xs text-slate-400 mt-1">Intenta ajustar los filtros o el término de búsqueda.</div>
              </td></tr>
            ) : (
              displayUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200 shadow-sm">
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{u.name}</div>
                        <div className="text-slate-500 text-xs font-mono mt-0.5">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="text-slate-700 font-medium">
                      {u.fechaIngresoISO ? new Date(u.fechaIngresoISO).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    {u.evaCID ? (
                      <div className="flex flex-col items-start gap-2">
                        {u.evaEstado && <StatusBadge status="info" label={u.evaEstado} />}
                        <DownloadButton cid={u.evaCID} variant="primary" />
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                        SIN VINCULAR
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex flex-wrap gap-2">
                      {u.pathLinks?.length ? (
                        u.pathLinks.map(l => (
                          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors shadow-sm">
                            <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            VER {l.label}
                          </a>
                        ))
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                          SIN VINCULAR
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} setPage={setPage} lastPage={data.lastPage} pageSize={pageSize} setPageSize={setPageSize} total={data.total} />
    </div>
  );
}