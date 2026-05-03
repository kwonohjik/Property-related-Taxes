"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * 의뢰인 검색 입력. 200ms debounce 후 onChange 호출.
 */
export function ClientSearchInput({
  value,
  onChange,
  placeholder = "이름·전화번호로 검색",
  autoFocus = false,
}: Props) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // 외부 value 리셋 동기화
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setDraft(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 200);
  }

  function handleClear() {
    setDraft("");
    onChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={handleChange}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {draft && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
