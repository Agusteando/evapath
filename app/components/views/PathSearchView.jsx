"use client";
import { useState, useEffect } from "react";
import Pagination from "../Pagination";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PathSearchView() {
  const [data, setData] = useState({ users: [], loading: true, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");

  const fetchData = async () => {
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/reclutamiento-users?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData({ ...json, loading: false });
    } catch (e) {
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, q]);

  return (
    <div className="flex flex-col h-full bg-[#FDFDFE] flex-1 overflow-hidden relative">
      <div className="px-8 py-8 border-b border-slate-200 bg-white shadow-sm z-10 relative">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Directorio PATH</h1>
        <p className="text-sm text-slate-500 mt-1">Directorio de resultados psicométricos (ECO / MMPI) evaluados externamente.</p>
      </div>

      <div className="px-8 py-4 border-b border-slate-200 bg-slate-50/50">
        <div className="relative w-full max-w-lg">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="search" 
            placeholder="Buscar candidato en PATH por nombre o correo..." 
            value={q} 
            onChange={(e) => { setQ(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all" 
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#FDFDFE]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-8 py-3.5 tracking-wide">Candidato</th>
              <th className="px-8 py-3.5 tracking-wide text-center w-40">Reporte ECO</th>
              <th className="px-8 py-3.5 tracking-wide text-center w-40">Reporte MMPI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.loading ? (
              <tr><td colSpan="3" className="px-8 py-12 text-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-emerald-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80"/></svg>
                Buscando en PATH...
              </td></tr>
            ) : data.users.length === 0 ? (
              <tr><td colSpan="3" className="px-8 py-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold text-slate-700">No se encontraron candidatos</div>
              </td></tr>
            ) : (
              data.users.map((u) => {
                const eco = u.pathLinks?.find(x => x.label === "ECO");
                const mmpi = u.pathLinks?.find(x => x.label === "MMPI-2 RF");
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3.5">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200 shadow-sm">
                          {getInitials(u.nombre)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{u.nombre}</div>
                          <div className="text-slate-500 text-xs font-mono mt-0.5">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      {eco ? (
                        <a href={eco.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow">
                          <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          VER ECO
                        </a>
                      ) : <span className="text-slate-400 font-bold text-[10px] bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">PENDIENTE</span>}
                    </td>
                    <td className="px-8 py-4 text-center">
                      {mmpi ? (
                        <a href={mmpi.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow">
                          <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          VER MMPI
                        </a>
                      ) : <span className="text-slate-400 font-bold text-[10px] bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">PENDIENTE</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} setPage={setPage} lastPage={data.lastPage} pageSize={pageSize} setPageSize={setPageSize} total={data.total} />
    </div>
  );
}