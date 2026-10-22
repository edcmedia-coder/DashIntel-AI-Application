"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { cn } from "./primitives";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => setToasts((p) => p.filter((t) => t.id !== toast.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tones = {
    success: "border-good/40 bg-good/12 text-good",
    error: "border-bad/40 bg-bad/12 text-bad",
    info: "border-line bg-panel text-ink",
  } as const;
  const Icon = toast.tone === "success" ? Check : toast.tone === "error" ? CircleAlert : Info;

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur",
        tones[toast.tone],
      )}
    >
      <Icon size={16} className="mt-px shrink-0" />
      <span className="flex-1 leading-snug text-ink">{toast.message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-ink-dim hover:text-ink">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Using the hook outside the provider should never crash the app.
    return { push: () => undefined };
  }
  return ctx;
}
