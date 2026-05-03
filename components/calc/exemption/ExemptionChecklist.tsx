"use client";

/**
 * ExemptionChecklist — 비과세 항목 체크리스트
 * 상속세·증여세 계산 마법사 내 비과세 단계에서 사용
 *
 * 사용자가 해당되는 비과세 항목을 선택하고 금액을 입력하면
 * 해당 항목의 비과세 금액과 리스크 경고를 표시합니다.
 */

import { useState } from "react";
import type {
  ExemptionRule,
  ExemptionCategory,
} from "@/lib/tax-engine/exemption-rules";
import {
  getExemptionRulesByCategory,
} from "@/lib/tax-engine/exemption-rules";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

// ============================================================
// 리스크 배지
// ============================================================

function RiskBadge({ level }: { level: ExemptionRule["riskLevel"] }) {
  if (level === "none") return null;
  const styles = {
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  } as const;
  const labels = { low: "사후관리 주의", medium: "추징 위험", high: "고위험 추징" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

// ============================================================
// 개별 항목 행
// ============================================================

interface ExemptionRowProps {
  rule: ExemptionRule;
  checked: boolean;
  amount: number;
  onToggle: (ruleId: string) => void;
  onAmountChange: (ruleId: string, amount: number) => void;
}

function ExemptionRow({ rule, checked, amount, onToggle, onAmountChange }: ExemptionRowProps) {
  return (
    <ToggleCard
      tone="violet"
      title={rule.name}
      description={
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <RiskBadge level={rule.riskLevel} />
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {rule.lawRef}
            </span>
          </span>
          <span>{rule.description}</span>
        </span>
      }
      checked={checked}
      onCheckedChange={() => onToggle(rule.id)}
    >
      <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
        {rule.requirements.map((req, i) => (
          <li key={i}>{req}</li>
        ))}
      </ul>

      {/* 금액 입력 (사회통념 타입 제외하고 모두 표시) */}
      {rule.limitType !== "social_norm" && (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            해당 자산 가액
            {rule.limitType === "fixed" && rule.limitAmount && (
              <span className="ml-1 text-amber-600">
                (최대 {rule.limitAmount.toLocaleString()}              </span>
            )}
            {rule.limitType === "area" && rule.limitAreaM2 && (
              <span className="ml-1 text-amber-600">
                (면적 한도 {rule.limitAreaM2}㎡)
              </span>
            )}
          </label>
          <CurrencyInput
            label=""
            value={amount > 0 ? String(amount) : ""}
            onChange={(v) => onAmountChange(rule.id, parseInt(v.replace(/,/g, "") || "0", 10))}
            placeholder="금액 입력"
          />
        </div>
      )}

      {/* 리스크 경고 */}
      {rule.riskNote && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
          ⚠️ {rule.riskNote}
        </div>
      )}

      {/* 제외 사유 */}
      {rule.exclusions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
            적용 제외 사유:
          </p>
          <ul className="text-xs text-red-500 dark:text-red-400 space-y-0.5 list-disc list-inside">
            {rule.exclusions.map((ex, i) => (
              <li key={i}>{ex}</li>
            ))}
          </ul>
        </div>
      )}
    </ToggleCard>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface ExemptionChecklistProps {
  category: ExemptionCategory;
  value: ExemptionCheckedItem[];
  onChange: (items: ExemptionCheckedItem[]) => void;
}

export function ExemptionChecklist({
  category,
  value,
  onChange,
}: ExemptionChecklistProps) {
  const rules = getExemptionRulesByCategory(category);

  const checkedMap = new Map(value.map((v) => [v.ruleId, v]));

  const handleToggle = (ruleId: string) => {
    if (checkedMap.has(ruleId)) {
      onChange(value.filter((v) => v.ruleId !== ruleId));
    } else {
      onChange([...value, { ruleId, claimedAmount: 0 }]);
    }
  };

  const handleAmountChange = (ruleId: string, amount: number) => {
    onChange(
      value.map((v) => (v.ruleId === ruleId ? { ...v, claimedAmount: amount } : v)),
    );
  };

  if (rules.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          비과세 해당 항목 선택
        </h3>
        <span className="text-xs text-gray-400">
          {value.length > 0 ? `${value.length}개 선택됨` : "없으면 건너뛰기"}
        </span>
      </div>
      <div className="space-y-2">
        {rules.map((rule) => (
          <ExemptionRow
            key={rule.id}
            rule={rule}
            checked={checkedMap.has(rule.id)}
            amount={checkedMap.get(rule.id)?.claimedAmount ?? 0}
            onToggle={handleToggle}
            onAmountChange={handleAmountChange}
          />
        ))}
      </div>
    </div>
  );
}
