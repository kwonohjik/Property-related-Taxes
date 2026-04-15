"use client";

/**
 * ExemptionWarning — 사후관리·추징 경고 모달
 * 고위험 비과세 항목 선택 시 상세 안내를 표시합니다.
 */

import { useState } from "react";
import type { ExemptionRule } from "@/lib/tax-engine/exemption-rules";
import { getHighRiskRules } from "@/lib/tax-engine/exemption-rules";

// ============================================================
// 모달 내용
// ============================================================

function WarningModal({
  rule,
  onClose,
}: {
  rule: ExemptionRule;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-red-500 dark:text-red-400 font-medium mb-1">
              사후관리 추징 주의
            </p>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {rule.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-4 mt-0.5"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {rule.riskNote && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">
              ⚠️ 추징 리스크
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">{rule.riskNote}</p>
          </div>
        )}

        {rule.exclusions.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              비과세 취소되는 경우
            </p>
            <ul className="space-y-1">
              {rule.exclusions.map((ex, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 mb-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            정확한 요건 충족 여부는 세무사 상담을 권장합니다.
            사후관리 의무를 이행하지 않으면 비과세 혜택이 취소되고 가산세가 부과될 수 있습니다.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface ExemptionWarningProps {
  /** 선택된 비과세 룰 ID 목록 */
  selectedRuleIds: string[];
}

export function ExemptionWarning({ selectedRuleIds }: ExemptionWarningProps) {
  const [activeRule, setActiveRule] = useState<ExemptionRule | null>(null);

  const highRiskRules = getHighRiskRules().filter((r) =>
    selectedRuleIds.includes(r.id),
  );

  if (highRiskRules.length === 0) return null;

  return (
    <>
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
          ⚠️ 사후관리 의무가 있는 비과세 항목이 선택되었습니다
        </p>
        <div className="space-y-2">
          {highRiskRules.map((rule) => (
            <div key={rule.id} className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                  {rule.name}
                </p>
                {rule.riskNote && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 line-clamp-1">
                    {rule.riskNote}
                  </p>
                )}
              </div>
              <button
                onClick={() => setActiveRule(rule)}
                className="shrink-0 text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                상세 보기
              </button>
            </div>
          ))}
        </div>
      </div>

      {activeRule && (
        <WarningModal rule={activeRule} onClose={() => setActiveRule(null)} />
      )}
    </>
  );
}
