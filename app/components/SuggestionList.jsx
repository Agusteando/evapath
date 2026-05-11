"use client";

export default function SuggestionList({
  title,
  list,
  onAssociate,
  disabled,
  loadingForId,
}) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold text-slate-700 mb-2 px-1">
        {title}
      </h4>
      <div className="rounded-lg border border-slate-100 bg-white max-h-[220px] overflow-y-auto min-w-[172px] shadow-sm">
        {list.length === 0 ? (
          <div className="text-slate-400 text-xs p-3">Sin resultados</div>
        ) : (
          list.map((item) => {
            const isLoading = loadingForId === item.cid;
            return (
              <button
                key={item.cid || item.email || item.name}
                className="block w-full text-left px-4 py-3 border-b last:border-b-0 border-slate-100 text-gray-900 hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onAssociate(item.cid)}
                disabled={disabled || !!loadingForId}
                type="button"
              >
                <span className="block text-sm font-bold leading-tight">
                  {item.name || item.label}
                </span>
                {item.email && (
                  <span className="mt-1 block truncate text-[11px] font-medium text-slate-500">
                    {item.email}
                  </span>
                )}
                {item.puesto && (
                  <span className="mt-1 block truncate text-[11px] text-indigo-500">
                    {item.puesto}
                  </span>
                )}
                {isLoading && (
                  <svg
                    className="animate-spin inline-block mt-2 text-indigo-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ width: "1em", height: "1em" }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      opacity=".2"
                    />
                    <path
                      d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
