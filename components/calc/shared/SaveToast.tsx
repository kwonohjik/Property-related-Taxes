"use client";

/**
 * SaveToast — 저장 결과 토스트 (6세목 공유)
 *
 * fixed bottom-right z-50. 3초 자동 사라짐 + 사용자 X 버튼.
 * 자동저장/수동저장 모두에서 사용.
 *
 * 사용 예:
 *   const [msg, setMsg] = useState<SaveToastMessage | null>(null);
 *   <SaveToast message={msg} onClose={() => setMsg(null)} />
 */

import { useEffect } from "react";
import { X } from "lucide-react";

export interface SaveToastMessage {
  kind: "success" | "error" | "info";
  text: string;
}

interface Props {
  message: SaveToastMessage | null;
  onClose: () => void;
  /** 자동 사라짐 ms (기본 3000) */
  autoCloseMs?: number;
}

export function SaveToast({ message, onClose, autoCloseMs = 3000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(t);
  }, [message, autoCloseMs, onClose]);

  if (!message) return null;

  const palette =
    message.kind === "success"
      ? "bg-emerald-600 text-white border-emerald-700"
      : message.kind === "error"
      ? "bg-destructive text-white border-destructive"
      : "bg-sky-600 text-white border-sky-700";

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed bottom-6 right-6 z-50 shadow-lg print:hidden rounded-md px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 border flex items-center gap-3 max-w-sm " +
        palette
      }
    >
      <span className="whitespace-pre-line">{message.text}</span>
      <button
        type="button"
        onClick={onClose}
        className="opacity-80 hover:opacity-100"
        aria-label="알림 닫기"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
