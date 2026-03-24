"use client";
import { useState } from "react";
import { BTN_BASE, BTN_SIZES, BTN_VARIANTS, classNames, SPINNER } from "../lib/designTokens";

export default function DownloadButton({ cid, variant = "secondary", className = "" }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/users/${cid}/report`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `Candidato_EVA_${cid}.pdf`; // Triggers native download instead of opening a tab
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => { 
        window.URL.revokeObjectURL(url); 
        a.remove(); 
      }, 1000);
    } catch {
      alert("Error al descargar el PDF de EVA.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS[variant], className, "w-full sm:w-auto")}
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? (
        <>
          <svg className={SPINNER} viewBox="0 0 24 24" fill="none">
             <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
             <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" />
          </svg>
          Descargando...
        </>
      ) : (
        <>
          <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Descargar PDF
        </>
      )}
    </button>
  );
}