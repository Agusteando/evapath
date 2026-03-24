"use client";

export default function Pagination({ page, setPage, lastPage, pageSize, setPageSize, total }) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-8 py-4 bg-white border-t border-slate-200 z-10 relative">
      <div className="text-sm text-slate-500">
        Mostrando <span className="font-bold text-slate-900">{total}</span> resultados
      </div>
      <div className="flex items-center gap-6">
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="text-sm border border-slate-200 bg-slate-50 rounded-lg py-1.5 px-3 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
        >
          <option value={20}>20 por página</option>
          <option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setPage((p) => Math.max(1, p - 1))} 
            disabled={page <= 1} 
            className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-50 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
          >
            Anterior
          </button>
          <span className="text-sm font-medium text-slate-600 min-w-[5rem] text-center">
            <span className="text-slate-900 font-bold">{page}</span> / {lastPage}
          </span>
          <button 
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))} 
            disabled={page >= lastPage} 
            className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-50 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}