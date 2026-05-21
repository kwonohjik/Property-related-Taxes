"use client";

/**
 * HistoryQuotaBanner — /history 페이지 상단 저장 한도 경고 (v4 §1.6).
 *
 * 사용자당 record 총수 ≥ HISTORY_WARNING_THRESHOLD(190) 시 노출.
 * 200건 도달 시 "한도에 도달했습니다" 추가 라인.
 */

import { AlertTriangle } from "lucide-react";
import { MAX_CALCULATIONS_PER_USER, HISTORY_WARNING_THRESHOLD } from "@/lib/storage/types";

interface Props {
  count: number;
}

export function HistoryQuotaBanner({ count }: Props) {
  if (count < HISTORY_WARNING_THRESHOLD) return null;
  const isMax = count >= MAX_CALCULATIONS_PER_USER;
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 mb-4"
    >
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4" />
        저장 한도 안내 — 현재 {count}/{MAX_CALCULATIONS_PER_USER}건
      </p>
      <p className="text-xs text-amber-800 mt-1">
        사용자당 최대 {MAX_CALCULATIONS_PER_USER}건까지 저장 가능합니다.{" "}
        {MAX_CALCULATIONS_PER_USER}건 도달 시 가장 오래된 이력부터 자동으로 삭제됩니다.
        필요한 이력은 미리 PDF로 저장하거나 불필요한 이력은 직접 삭제해주세요.
      </p>
      {isMax && (
        <p className="text-xs text-amber-900 font-semibold mt-1">
          ※ 한도에 도달했습니다. 새로 저장하면 가장 오래된 이력이 삭제됩니다.
        </p>
      )}
    </div>
  );
}
