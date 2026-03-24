"use client";
import { useState, useEffect } from "react";
import DownloadButton from "../DownloadButton";
import Pagination from "../Pagination";
import StatusBadge from "../StatusBadge";
import { useGlobal } from "../../contexts/GlobalContext";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function EvaSearchView() {
  const { evaStatus } = useGlobal();
  const [data, setData] = useState({ users: [], stats: {}, loading: true, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");

  const fetchData = async () => {
    if (!evaStatus.ready) return;
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/evaluatest-users?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData({ ...json, loading: false });
    } catch (e) {
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, q, evaStatus.ready]);

  if (!evaStatus.ready) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-slate-500 bg-[#FDFDFE]">
        <span className="relative flex h-12 w-12 mb-6">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-40"></span>
          <span className="relative inline-flex rounded-full h-12 w-12 bg-blue-500 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor"/></svg>
          </span>
        </span>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Conectando con Evaluatest</h2>
        <p className="text-sm">Sincronizando el catálogo de candidatos, esto puede tomar unos segundos.</p>
        <p className="text-xs mt-4 font-mono bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">Estado interno: {evaStatus.status}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#FDFDFE] flex-1 overflow-hidden relative">
      <div className="px-8 py-8 border-b border-slate-200 bg-white shadow-sm z-10 relative">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Directorio EVA</h1>
        <p className="text-sm text-slate-500 mt-1">Explora todos los candidatos extraídos directamente de la plataforma Evaluatest.</p>
      </div>

      <div className="px-8 py-4 border-b border-slate-200 bg-slate-50/50">
        <div className="relative w-full max-w-lg">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="search" 
            placeholder="Buscar por nombre, correo, puesto o estado..." 
            value={q} 
            onChange={(e) => { setQ(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#FDFDFE]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-8 py-3.5 tracking-wide">Candidato</th>
              <th className="px-8 py-3.5 tracking-wide">Puesto</th>
              <th className="px-8 py-3.5 tracking-wide">Fecha Proceso</th>
              <th className="px-8 py-3.5 tracking-wide">Estado</th>
              <th className="px-8 py-3.5 tracking-wide text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.loading ? (
              <tr><td colSpan="5" className="px-8 py-12 text-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80"/></svg>
                Buscando en EVA...
              </td></tr>
            ) : data.users.length === 0 ? (
              <tr><td colSpan="5" className="px-8 py-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold text-slate-700">No se encontraron candidatos</div>
              </td></tr>
            ) : (
              data.users.map((u) => (
                <tr key={u.CID} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200 shadow-sm">
                        {getInitials(u.nombre)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{u.nombre}</div>
                        <div className="text-slate-500 text-xs font-mono mt-0.5">{u.correo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="text-slate-700 font-medium max-w-[200px] truncate" title={u.puesto || ''}>{u.puesto || '—'}</div>
                  </td>
                  <td className="px-8 py-4 text-slate-600 font-medium">
                    {u.fechaProceso ? new Date(u.fechaProceso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-8 py-4">
                    <StatusBadge status="info" label={u.estado} />
                  </td>
                  <td className="px-8 py-4 text-right">
                    <DownloadButton cid={u.CID} variant="primary" />
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