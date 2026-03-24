import "../styles/globals.css";
import { GlobalProvider } from "./contexts/GlobalContext";
import AuthProvider from "./components/AuthProvider";

export const metadata = {
  title: "Dashboard Operativo · Signia/EVA/PATH",
  description: "Búsqueda y vinculación centralizada",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full bg-[#F8FAFC]">
      <body suppressHydrationWarning className="h-full text-slate-800 antialiased selection:bg-blue-200 selection:text-blue-900">
        <AuthProvider>
          <GlobalProvider>
            {children}
          </GlobalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}