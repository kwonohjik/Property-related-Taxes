"use client";

import { useState } from "react";

interface Props {
  currentTitle: string;
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}

export function EditTitleDialog({ currentTitle, onSave, onClose }: Props) {
  const [title, setTitle] = useState(currentTitle);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background shadow-2xl p-6">
        <h2 className="text-base font-semibold mb-4">이름 수정</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          autoFocus
          maxLength={100}
        />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted/60 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </>
  );
}
