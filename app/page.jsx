"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Sidebar from "./components/Sidebar";
import RecentsView from "./components/views/RecentsView";
import EvaSearchView from "./components/views/EvaSearchView";
import PathSearchView from "./components/views/PathSearchView";
import LinkView from "./components/views/LinkView";
import AutoMatchView from "./components/views/AutoMatchView";
import AuditView from "./components/views/AuditView";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [activeView, setActiveView] = useState("recents");

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F8FAFC]">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
          <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
        </svg>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50">
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-4xl shadow-lg mx-auto mb-6">O</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">Operaciones HR</h1>
          <p className="text-sm text-slate-500 mb-8">Inicia sesión con tu cuenta de Google Workspace para continuar.</p>
          <button
            onClick={() => signIn("google")}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuar con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans selection:bg-blue-200 selection:text-blue-900">
      <Sidebar active={activeView} onSelect={setActiveView} />
      <main className="flex-1 overflow-auto relative flex flex-col bg-white sm:rounded-l-[2rem] shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] border-l border-slate-200 z-10 m-0 sm:m-2 sm:ml-0">
        {activeView === "recents" && <RecentsView />}
        {activeView === "eva" && <EvaSearchView />}
        {activeView === "path" && <PathSearchView />}
        {activeView === "link" && <LinkView setView={setActiveView} />}
        {activeView === "auto" && <AutoMatchView setView={setActiveView} />}
        {activeView === "audit" && <AuditView />}
      </main>
    </div>
  );
}