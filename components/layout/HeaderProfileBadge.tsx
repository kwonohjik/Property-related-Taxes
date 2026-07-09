"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { userRepository } from "@/lib/storage/user-repository";

/**
 * 헤더 우측 — 프로필 이름 표시.
 * IndexedDB는 클라이언트 전용이므로 Client Component로 분리.
 * 미설정 시 "프로필 설정" 링크 노출.
 */
export function HeaderProfileBadge() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    userRepository.getProfile().then((p) => {
      setDisplayName(p?.displayName ?? null);
      setReady(true);
    });
  }, []);

  // 하이드레이션 전 숨김 (깜빡임 방지)
  if (!ready) return null;

  if (!displayName) {
    return (
      <Link
        href="/profile"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
      >
        프로필 설정
      </Link>
    );
  }

  return (
    <Link
      href="/profile"
      className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted/60 transition-colors"
      title="프로필 수정"
    >
      <span className="inline-block w-5 h-5 rounded-full bg-primary/15 text-primary text-center leading-5 font-semibold text-micro">
        {displayName.charAt(0).toUpperCase()}
      </span>
      <span>{displayName}</span>
    </Link>
  );
}
