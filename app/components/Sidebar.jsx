"use client";
import { useGlobal } from "../contexts/GlobalContext";
import { useSession, signOut } from "next-auth/react";

export default function Sidebar({ active, onSelect }) {
  const { evaStatus } = useGlobal();
  const { data: session } = useSession();

  const navGroups = [
    {
      label: "Reclutamiento",
      items: [
        { id: "postular", label: "Postular Candidato", icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" }
      ]
    },
    {
      label: "Exploradores",
      items: [
        { id: "recents", label: "Candidatos Recientes", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
        { id: "eva", label: "Directorio EVA", icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
        { id: "path", label: "Directorio PATH", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      ]
    },
    {
      label: "Vinculación",
      items: [
        { id: "link", label: "Asociación Manual", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
        { id: "auto", label: "Auto-Similitud", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" },
      ]
    },
    {
      label: "Administración",
      items: [
        { id: "audit", label: "Registro de Auditoría", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }
      ]
    }
  ];

  return (
    <aside className="w-72 bg-[#F8FAFC] border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-6 pb-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md">O</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Operaciones<span className="text-slate-400 font-medium">HR</span>
          </h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 space-y-8 mt-2">
        {navGroups.map((group, i) => (
          <div key={i}>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">
              {group.label}
            </h2>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = active === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 font-medium ${
                        isActive
                          ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <svg className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="p-4 mt-auto">
        <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 flex items-center gap-3 shadow-sm mb-4">
          <span className="relative flex h-3 w-3">
            {evaStatus.ready ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 animate-pulse"></span>
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700">Conexión EVA</span>
            <span className="text-[10px] text-slate-500 capitalize">{evaStatus.status}</span>
          </div>
        </div>

        {session?.user && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-2 py-2 border-t border-slate-200 pt-4">
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name} className="w-8 h-8 rounded-full border border-slate-300" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                  {session.user.name?.charAt(0)}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 truncate">{session.user.name}</span>
                <span className="text-[10px] text-slate-500 truncate">{session.user.email}</span>
              </div>
            </div>
            <button 
              onClick={() => signOut()}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 text-left px-2"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}