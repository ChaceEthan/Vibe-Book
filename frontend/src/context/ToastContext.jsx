// @ts-nocheck
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const iconFor = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, message, type }]);
    window.setTimeout(() => removeToast(id), 3600);
    return id;
  }, [removeToast]);

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-3 top-20 z-[100] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = iconFor[toast.type] || Info;
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-sm font-semibold shadow-xl transition ${
                toast.type === "error" ? "border-red-200 text-red-700" : toast.type === "success" ? "border-green-200 text-green-700" : "border-slate-200 text-slate-700"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">{toast.message}</p>
              <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    return { addToast: () => undefined, removeToast: () => undefined };
  }

  return context;
};
