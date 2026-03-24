export default function NotFound() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">404 - No Encontrado</h2>
      <p className="text-slate-600 mb-4">La página que buscas no existe.</p>
      <a href="/" className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800">
        Volver al inicio
      </a>
    </div>
  );
}