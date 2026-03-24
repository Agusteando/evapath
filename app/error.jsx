"use client";
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("App Error:", error);
  }, [error]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Algo salió mal</h2>
      <p className="text-slate-600 mb-4 text-sm max-w-md text-center">
        {error?.message || "Ocurrió un error inesperado en la aplicación."}
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}