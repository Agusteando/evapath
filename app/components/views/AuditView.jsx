"use client";
import { useState, useEffect } from "react";
import Pagination from "../Pagination";
import StatusBadge from "../StatusBadge";

export default function AuditView() {
  const [data, setData] = useState({ logs: [], loading: true, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");

  const fetchData = async () => {
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/audit?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`);
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
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Registro de Auditoría</h1>
        <p className="text-sm text-slate-500 mt-1">Historial de acciones críticas, descargas de reportes y vinculaciones.</p>
      </div>

      <div className="px-8 py-4 border-b border-slate-200 bg-slate-50/50">
        <div className="relative w-full max-w-lg">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="search" 
            placeholder="Buscar por correo del usuario, acción o entidad..." 
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
              <th className="px-8 py-3.5 tracking-wide">Usuario Actor</th>
              <th className="px-8 py-3.5 tracking-wide">Acción</th>
              <th className="px-8 py-3.5 tracking-wide">Entidad Destino</th>
              <th className="px-8 py-3.5 tracking-wide">Fecha y Hora</th>
              <th className="px-8 py-3.5 tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.loading ? (
              <tr><td colSpan="5" className="px-8 py-12 text-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80"/></svg>
                Cargando registros...
              </td></tr>
            ) : data.logs.length === 0 ? (
              <tr><td colSpan="5" className="px-8 py-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold text-slate-700">No se encontraron registros</div>
              </td></tr>
            ) : (
              data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-3">
                    <div className="flex items-center gap-3">
                      {log.user_photo ? (
                        <img src={log.user_photo} alt={log.user_name} className="w-8 h-8 rounded-full border border-slate-200 shadow-sm" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {log.user_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-800">{log.user_name}</div>
                        <div className="text-slate-500 text-xs font-mono">{log.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-3">
                    <span className="font-semibold text-slate-700">{log.action_type}</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">Vía {log.source_system}</div>
                  </td>
                  <td className="px-8 py-3 text-slate-600 font-mono text-xs">
                    {log.target_entity}
                  </td>
                  <td className="px-8 py-3 text-slate-600">
                    {new Date(log.created_at).toLocaleString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-8 py-3">
                    <StatusBadge status={log.status === 'SUCCESS' ? 'ok' : 'err'} label={log.status} />
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