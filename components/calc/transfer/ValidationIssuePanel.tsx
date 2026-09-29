"use client";

/**
 * ValidationIssuePanel — 양도세 마법사 검증 오류 목록 (하단 sticky)
 *
 * 계획서: `docs/00-pm/transfer-validation-issue-panel.plan.md`
 *
 * - `fixed`가 아니라 `sticky`: 문서 흐름상 자리(「다음」 버튼 바로 위)에 도달하면 흐름으로
 *   돌아가 버튼을 가리지 않는다. 위로 스크롤하면 뷰포트 하단에 붙는다.
 * - 부모가 `key`를 바꿔 새 오류 묶음마다 펼침 상태로 되돌린다(useEffect 금지).
 * - 배경은 불투명해야 한다 — 아래 폼이 비치면 읽을 수 없다. 톤은 안쪽 div가 입힌다.
 */
import { useState } from "react";
import type { ValidationIssue } from "@/lib/calc/transfer-tax-validate";

interface Props {
  issues: ValidationIssue[];
  /** API·계산 오류 (검증 목록과 별개) */
  error: string | null;
  /** 주면 자산-수준 항목이 해당 자산 카드로 이동하는 버튼이 된다 */
  onAssetClick?: (assetIndex: number) => void;
  /** 주면 「다시 계산하기」 버튼을 표시한다 */
  onRetry?: () => void;
}

export function ValidationIssuePanel({ issues, error, onAssetClick, onRetry }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (!error && issues.length === 0) return null;

  return (
    <div
      className="sticky bottom-4 z-40 mt-4 rounded-lg bg-background shadow-lg print:hidden"
      data-testid="validation-issues"
      aria-live="polite"
    >
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {issues.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">입력 확인이 필요합니다 ({issues.length}건)</p>
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
                className="shrink-0 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                {collapsed ? "펼치기" : "접기"}
              </button>
            </div>
            {!collapsed && (
              <ul className="mt-1.5 max-h-[40vh] overflow-y-auto space-y-1 list-disc pl-4">
                {issues.map((it, idx) => (
                  <li key={idx}>
                    {onAssetClick && it.assetIndex != null ? (
                      <button
                        type="button"
                        onClick={() => onAssetClick(it.assetIndex!)}
                        className="text-left underline underline-offset-2 hover:opacity-70 transition-opacity"
                      >
                        {it.message}
                      </button>
                    ) : (
                      <span className="whitespace-pre-line">{it.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <p className="whitespace-pre-line">{error}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
          >
            다시 계산하기
          </button>
        )}
      </div>
    </div>
  );
}
