
"use client";
export default function SuggestionList({ title, list, onAssociate, disabled, loadingForId }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold text-indigo-700 mb-2 px-1">{title}</h4>
      <div className="rounded-lg border border-slate-100 bg-white max-h-[190px] overflow-y-auto min-w-[172px] shadow-sm">
        {list.length === 0 ? (
          <div className="text-slate-400 text-xs p-2">Sin resultados</div>
        ) : (
          list.map((l, i) => (
            <button
              key={i}
              className="block w-full text-left px-4 py-2 border-b last:border-b-0 border-slate-100 font-semibold text-[15px] text-gray-900 hover:bg-indigo-50 transition"
              onClick={() => onAssociate(l.cid)}
              disabled={disabled || !!loadingForId}
            >
              {l.name}
              {l.puesto && (
                <span className="ml-1 text-indigo-400 text-xs font-normal">{`(${l.puesto})`}</span>
              )}
              {loadingForId === l.cid && (
                <svg
                  className="animate-spin inline-block ml-2 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ width: "1em", height: "1em" }}
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".2" />
                  <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" />
                </svg>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
