export const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

export const BTN_SIZES = {
  xs: "px-3 py-1.5 text-xs",
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
};

export const BTN_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow focus-visible:ring-blue-500 border border-transparent",
  secondary: "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm focus-visible:ring-slate-400",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400",
  danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 focus-visible:ring-rose-500",
  success: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 focus-visible:ring-emerald-500",
  warning: "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 focus-visible:ring-amber-500",
};

export const SPINNER =
  "animate-spin h-4 w-4 text-current [&>circle]:opacity-20 [&>path]:opacity-80";

export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}