"use client";
import { useState, useEffect } from "react";
import Linker from "../Linker"; 

export default function LinkView({ setView }) {
  const [asociar, setAsociar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch("/api/signia-missing")
      .then((r) => r.json())
      .then((data) => {
        setAsociar(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FDFDFE] text-slate-500">
        <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
          <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
        </svg>
        Cargando herramienta de vinculación manual...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFE] p-6">
      <Linker 
        asociar={asociar} 
        setAsociar={setAsociar} 
        idx={idx} 
        setIdx={setIdx} 
        setLinkMode={() => setView('recents')} 
      />
    </div>
  );
}