
"use client";
import { FIELDS } from "../lib/userUtils";
import StatusBadge from "./StatusBadge";
import { classNames } from "../lib/designTokens";

export default function NamesEditBlock({
  names,
  onChange,
  onBlur,
  fieldState,
  fieldErr,
  curpExtract,
  fillFromCurp
}) {
  const missing = !names.nombres || !names.apellidoPaterno || !names.apellidoMaterno;
  return (
    <div className="rounded-xl px-5 py-4 bg-white/75 border border-slate-100 my-2">
      {FIELDS.map((f) => (
        <div className="flex flex-col md:flex-row items-start md:items-center mb-3 gap-x-2" key={f.name}>
          <label
            className="text-slate-600 w-full md:w-[125px] mb-1 md:mb-0 text-xs font-semibold"
            htmlFor={f.name}
          >
            {f.label}:
          </label>
          <div className="flex-1 min-w-0 relative flex items-center">
            <input
              id={f.name}
              type="text"
              value={names[f.name]}
              onChange={e => onChange(f.name, e.target.value)}
              onBlur={e => onBlur(f.name, e.target.value)}
              className={classNames(
                "font-semibold text-lg px-2 py-1 rounded flex-1 min-w-0 outline-none border bg-slate-50 pr-16",
                !names[f.name]
                  ? "bg-rose-50 border-rose-300 text-rose-600"
                  : "border-slate-200 text-indigo-900"
              )}
              autoComplete="off"
              spellCheck="false"
            />
            <div className="absolute right-2">
              {fieldState[f.name] === "saving" && (
                <svg className="inline-block animate-spin text-indigo-400" style={{height:"1.1em",width:"1.1em"}} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor"/></svg>
              )}
              {fieldState[f.name] === "saved" && (
                <span className="text-emerald-500">✔</span>
              )}
              {fieldState[f.name] === "error" && (
                <span className="text-rose-600 text-xs font-semibold" title={fieldErr[f.name]}>!</span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center mt-2">
        <span className="text-slate-600 w-[95px] mr-3 text-xs">CURP:</span>
        <span className="font-mono font-semibold text-slate-900 text-base bg-slate-50 rounded px-2 py-1 min-w-[160px]">
          {curpExtract?.curp || <span className="text-gray-400">[no extraído]</span>}
        </span>
      </div>
      {missing && (
        <div className="mt-2">
          <StatusBadge status="warn" label="Campos faltantes" />
          {curpExtract && (
            <button
              className="ml-2 inline text-indigo-600 underline text-xs"
              type="button"
              onClick={fillFromCurp}
              tabIndex={0}
            >
              🟩 Copiar desde CURP extraída
            </button>
          )}
        </div>
      )}
    </div>
  );
}
