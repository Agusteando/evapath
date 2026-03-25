"use client";
import { useState, useEffect, useCallback } from "react";
import { BTN_BASE, BTN_SIZES, BTN_VARIANTS, classNames } from "../../lib/designTokens";

export default function PostularView() {
  const [system, setSystem] = useState("EVA"); // EVA or PATH
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [puestoId, setPuestoId] = useState("");
  
  const [emailStatus, setEmailStatus] = useState("idle"); // idle, typing, validating, valid, invalid
  const [emailError, setEmailError] = useState("");
  
  const [puestos, setPuestos] = useState([]);
  const [loadingPuestos, setLoadingPuestos] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Fetch Puestos depending on selected system
  useEffect(() => {
    let active = true;
    setLoadingPuestos(true);
    setPuestoId("");
    setPuestos([]);
    
    fetch(`/api/postular/puestos?system=${system}`)
      .then(r => r.json())
      .then(data => {
        if (active) {
          setPuestos(data.puestos || []);
          setLoadingPuestos(false);
        }
      })
      .catch(() => {
        if (active) setLoadingPuestos(false);
      });
      
    return () => { active = false; };
  }, [system]);

  // Debounced email validation
  useEffect(() => {
    if (!email) {
      setEmailStatus("idle");
      setEmailError("");
      return;
    }
    const emailRe = /^([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)$/;
    if (!emailRe.test(email)) {
      setEmailStatus("typing");
      return;
    }

    setEmailStatus("validating");
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/postular/validate?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        
        if (data.status === 'invalid') {
          setEmailStatus("invalid");
          setEmailError(data.reason === "The mailbox doesn't exist." ? "El buzón de correo no existe." : data.reason);
        } else {
          setEmailStatus("valid");
          setEmailError("");
        }
      } catch (err) {
        setEmailStatus("idle"); // Failsafe
      }
    }, 600);
    
    return () => clearTimeout(timeout);
  }, [email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (emailStatus !== "valid" || !name || !puestoId) return;

    setSubmitting(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const payload = {
        system,
        email,
        name,
        puestoId: parseInt(puestoId, 10)
      };

      const res = await fetch('/api/postular/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al procesar la solicitud.");
      }
      
      setResult(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setName("");
    setPuestoId("");
    setResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#FDFDFE] flex-1 overflow-hidden relative">
      <div className="px-8 py-8 border-b border-slate-200 bg-white shadow-sm z-10 relative">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Postular Candidato</h1>
        <p className="text-sm text-slate-500 mt-1">Invita y asigna pruebas a candidatos en los sistemas Evaluatest y PATH.</p>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 p-8">
        <div className="max-w-3xl mx-auto">
          {result ? (
            <div className="bg-white rounded-2xl p-8 shadow-xl border-t-4 border-emerald-500 text-center animate-fade-in">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Candidato postulado exitosamente!</h2>
              <p className="text-slate-600 mb-8">El candidato ha sido registrado y notificado correctamente.</p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left w-full overflow-hidden">
                  <span className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-1">Enlace de la vacante</span>
                  <a href={result.link} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold truncate block w-full hover:underline">
                    {result.link}
                  </a>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(result.link);
                    alert("¡Enlace copiado al portapapeles!");
                  }}
                  className="shrink-0 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold py-2 px-4 rounded-lg text-sm shadow-sm transition"
                >
                  Copiar Enlace
                </button>
              </div>

              <button 
                onClick={resetForm}
                className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}
              >
                Nueva Postulación
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="grid grid-cols-2 bg-slate-100 p-1 m-4 rounded-xl">
                <button
                  onClick={() => setSystem("EVA")}
                  className={`py-3 text-sm font-bold rounded-lg transition-all ${system === "EVA" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Sistema Evaluatest (EVA)
                </button>
                <button
                  onClick={() => setSystem("PATH")}
                  className={`py-3 text-sm font-bold rounded-lg transition-all ${system === "PATH" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Sistema PATH (Psicometría)
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 pt-4">
                {errorMsg && (
                  <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                    <svg className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-rose-800 font-medium">{errorMsg}</div>
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Correo Electrónico del Candidato</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <input 
                        type="email" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ejemplo@correo.com"
                        className={`block w-full pl-10 pr-10 py-2.5 text-slate-900 border rounded-xl shadow-sm focus:ring-2 focus:outline-none transition-colors ${emailStatus === 'invalid' ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200 bg-rose-50' : 'border-slate-300 focus:border-blue-400 focus:ring-blue-100 bg-white'}`}
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        {emailStatus === "validating" && (
                          <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
                            <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
                          </svg>
                        )}
                        {emailStatus === "valid" && <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                        {emailStatus === "invalid" && <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>}
                      </div>
                    </div>
                    {emailStatus === "invalid" && <p className="mt-1.5 text-sm text-rose-600 font-semibold">{emailError}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Nombre Completo</label>
                    <input 
                      type="text" 
                      required 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre del candidato"
                      className="block w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Seleccionar Puesto / Estructura
                    </label>
                    <div className="relative">
                      <select 
                        required
                        value={puestoId}
                        onChange={(e) => setPuestoId(e.target.value)}
                        disabled={loadingPuestos}
                        className="block w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 appearance-none cursor-pointer"
                      >
                        <option value="" disabled>{loadingPuestos ? "Cargando puestos..." : "Selecciona un puesto"}</option>
                        {puestos.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.unit} - {p.name} (ID: {p.id})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        {loadingPuestos ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
                            <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={submitting || emailStatus !== "valid" || !name || !puestoId}
                    className={`w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white transition-all ${
                      submitting || emailStatus !== "valid" || !name || !puestoId 
                        ? 'bg-slate-300 cursor-not-allowed' 
                        : system === "EVA" ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md'
                    }`}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
                          <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
                        </svg>
                        Procesando...
                      </span>
                    ) : (
                      `Enviar Postulación a ${system}`
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}