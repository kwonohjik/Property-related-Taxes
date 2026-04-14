"use client";

import Link from "next/link";

interface LoginPromptBannerProps {
  /** 결과가 임시로 저장되어 있는지 여부 */
  hasPendingResult?: boolean;
}

/**
 * LoginPromptBanner — "로그인하면 이 결과가 자동 저장됩니다" 안내 배너
 * 비로그인 사용자의 계산 결과 화면에 표시
 */
export function LoginPromptBanner({ hasPendingResult = false }: LoginPromptBannerProps) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm">
      <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
        {hasPendingResult ? "💾 로그인하면 이 결과가 자동 저장됩니다" : "📋 계산 이력을 저장하려면 로그인하세요"}
      </p>
      <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
        로그인 후 계산 이력 조회 및 PDF 다운로드가 가능합니다.
      </p>
      <Link
        href="/auth/login"
        className="inline-block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
      >
        로그인 / 회원가입
      </Link>
    </div>
  );
}
