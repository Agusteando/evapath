
"use client"
import React, { useEffect, useRef, useState } from "react"
import { useEvaData } from "../contexts/EvaDataContext"

export default function EvaOverlay() {
  const { evaReady, loading, status, logs, refresh, error } = useEvaData()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!evaReady || loading) setVisible(true)
    else setTimeout(() => setVisible(false), 800)
  }, [evaReady, loading])

  return (
    <>
      {(visible || loading || !evaReady) && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded shadow-xl p-6 w-[92vw] max-w-md flex flex-col items-center">
            <div className="mb-4 flex flex-col items-center">
              <svg className="animate-spin h-10 w-10 text-blue-600 mb-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="font-bold text-gray-700 text-lg">Cargando datos de EVA…</span>
              <span className="text-xs text-gray-500 block mt-1">
                Estado actual: <span className="font-mono">{status}</span>
              </span>
            </div>
            {error && <div className="text-red-600 text-sm py-2">{error}</div>}
            <button
              className="py-1 px-4 rounded bg-blue-600 text-white text-sm hover:bg-blue-800 transition mt-2"
              onClick={refresh}
              disabled={loading}
            >
              Actualizar
            </button>
          </div>
        </div>
      )}
      {(evaReady && !visible) && (
        <button
          className="fixed bottom-4 right-4 z-[9999] py-2 px-3 bg-blue-600 text-white rounded-full shadow"
          style={{ display: visible ? "none" : "inline-flex" }}
          onClick={() => setVisible(true)}
        >
          EVA Estado
        </button>
      )}
    </>
  )
}
