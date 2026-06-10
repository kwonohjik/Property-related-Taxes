"use client";

/**
 * InheritanceSidebar — 상속세 마법사 사이드바 합계 카드 (지점 ⑥)
 *
 * computeInheritanceSummary의 4필드를 + 보조 메타로 노출.
 * 양도세 WizardSidebar 패턴 따름. useMemo로 매 렌더 새 객체 생성 차단.
 *
 * 사용 예 (InheritanceTaxForm):
 *   <InheritanceSidebar form={form} result={result} />
 *
 * 0원·null 항목은 표시하지 않음 (입력 가능한 값만).
 */

import { useMemo } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  computeInheritanceSummary,
  type InheritanceSummaryFormInput,
} from "@/lib/stores/inheritance-summary";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";

interface InheritanceSidebarProps {
  form: InheritanceSummaryFormInput;
  result: InheritanceTaxResult | null;
  className?: string;
}

export function InheritanceSidebar({
  form,
  result,
  className = "",
}: InheritanceSidebarProps) {
  const summary = useMemo(
    () => computeInheritanceSummary(form, result),
    [form, result],
  );

  const hasAnyInput = summary.totalEstate > 0 || summary.priorGiftTotal > 0;
  if (!hasAnyInput && !result) {
    return (
      <div className={`rounded-lg border border-border bg-muted/30 p-4 ${className}`}>
        <p className="text-xs text-muted-foreground italic">
          입력값을 추가하면 합계가 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-3 ${className}`}
    >
      <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
        합계 미리보기
      </h3>

      <div className="space-y-2">
        {/* ① 총상속재산 (본래+간주+추정) */}
        {summary.totalEstate > 0 && (
          <Row
            label="총상속재산"
            value={formatKRW(summary.totalEstate)}
            sub={
              summary.presumedAdded > 0
                ? `+ 추정상속재산 §15 ${formatKRW(summary.presumedAdded)}`
                : undefined
            }
          />
        )}

        {/* 사전증여 가산 (corporate 행 1건 이상 시 § 3의2② 보조 라벨) */}
        {summary.priorGiftTotal > 0 && (
          <Row
            label="+ 사전증여 가산"
            value={formatKRW(summary.priorGiftTotal)}
            sub={
              form.priorGifts.some((g) => g.beneficiaryType === "corporate")
                ? "🏢 일부 영리법인 포함 (§3의2②로 별도 공제)"
                : undefined
            }
            tone="add"
          />
        )}

        {/* 채무·공과·장례 차감 */}
        {(summary.totalDebts > 0 || summary.funeralApplied > 0) && (
          <Row
            label="− 채무·공과·장례"
            value={formatKRW(-(summary.totalDebts + summary.funeralApplied))}
            sub={
              summary.funeralApplied > 0
                ? `장례 한도 적용 ${formatKRW(summary.funeralApplied)}`
                : undefined
            }
            tone="sub"
          />
        )}

        {/* 비과세·과세가액 불산입 차감 (§12·§16·§17) */}
        {summary.exemptEstimate > 0 && (
          <Row
            label="− 비과세·불산입"
            value={formatKRW(-summary.exemptEstimate)}
            tone="sub"
          />
        )}

        {/* ② 상속세 과세가액 */}
        {summary.taxableEstateValue > 0 && (
          <Row
            label="② 상속세 과세가액"
            value={formatKRW(summary.taxableEstateValue)}
            highlight
          />
        )}

        {/* ③ 과세표준·④ 자진납부세액·§74 징수유예는 계산 후 결과 화면에서 표시.
            사이드바는 result===null(입력 단계)에서만 렌더되므로 여기서는 ②까지만 노출. */}
        {summary.taxableEstateValue > 0 && (
          <p className="text-xs text-muted-foreground italic pt-1">
            과세표준·자진납부세액은 계산 결과 화면에서 확인됩니다.
          </p>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  tone?: "primary" | "add" | "sub";
}

function Row({ label, value, sub, highlight, tone }: RowProps) {
  const valueClass =
    tone === "primary"
      ? "text-indigo-700 dark:text-indigo-300 font-bold"
      : tone === "add"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "sub"
          ? "text-rose-600 dark:text-rose-400"
          : "";
  return (
    <div
      className={`flex flex-col gap-0.5 ${
        highlight ? "border-t border-indigo-200 dark:border-indigo-900 pt-2" : ""
      }`}
    >
      <p
        className={`text-xs whitespace-nowrap ${
          highlight ? "font-semibold text-indigo-900 dark:text-indigo-200" : "text-muted-foreground"
        }`}
      >
        {label}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground/80">{sub}</p>
      )}
      <span className={`text-sm font-mono tabular-nums whitespace-nowrap ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
