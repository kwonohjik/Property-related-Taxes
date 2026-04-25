"use client";

import { useState } from "react";
import { searchSigungu } from "@/lib/korean-law/sigungu-codes";

export interface SigunguSelectProps {
  code: string;
  name: string;
  onChange: (code: string, name: string) => void;
  placeholder?: string;
  className?: string;
}

export function SigunguSelect({
  code,
  name,
  onChange,
  placeholder = "시군구 검색...",
  className,
}: SigunguSelectProps) {
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);

  const results = open ? searchSigungu(query) : [];

  function handleInputChange(v: string) {
    setQuery(v);
    setOpen(true);
    // If no results and exactly 5 digits: direct code input
    const trimmed = v.trim();
    if (trimmed.length === 5 && /^\d{5}$/.test(trimmed)) {
      const found = searchSigungu(trimmed);
      if (found.length === 0) {
        onChange(trimmed, trimmed);
        setOpen(false);
        return;
      }
    }
  }

  function handleSelect(selectedCode: string, fullName: string) {
    setQuery(fullName);
    onChange(selectedCode, fullName);
    setOpen(false);
  }

  function handleBlur() {
    // Delay to allow click on dropdown items
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={(e) => {
          e.target.select();
          if (query) setOpen(true);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {code && !open && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {code}
        </span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
          {results.map((s) => (
            <li key={s.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s.code, s.fullName)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium">{s.fullName}</span>
                <span className="ml-2 text-xs text-muted-foreground">{s.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
