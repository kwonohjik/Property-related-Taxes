"use client";

/**
 * EstateBodySimple — cash·financial·other 본체 입력
 *
 * Plan estate-card-followup-phase2 §1.2·Visual §1.1
 * Restyle: docs/01-plan/estate-asset-input-fieldcard-restyle.plan.md (FieldCard + 섹션 카드)
 *
 * 노출 매트릭스 [Plan AN-FU1-4]:
 *   - cash: 자산명 + 시가("현금 금액"), 감정가 미노출
 *   - financial: 자산명 + 시가("잔액 또는 시가"), 감정가 미노출
 *   - other: 자산명 + 시가("시가") + 감정가
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const NAME_PLACEHOLDER: Record<"cash" | "financial" | "other", string> = {
  cash: "선택 입력 (예: 현금 보유)",
  financial: "선택 입력 (예: ○○은행 보통예금)",
  other: "선택 입력",
};

const MARKET_LABEL: Record<"cash" | "financial" | "other", string> = {
  cash: "현금 금액",
  financial: "잔액 또는 시가",
  other: "시가 (매매·수용·경매가액)",
};

const MARKET_HINT: Record<"cash" | "financial" | "other", string> = {
  cash: "지폐·동전 실제 보유액 (§22 금융재산공제 미적용)",
  financial: "평가기준일 현재 잔액",
  other: "평가기간(±6개월) 내 실거래가",
};

const PRIORITY_HINT: Record<"cash" | "financial" | "other", string> = {
  cash: "현금 액면가 = 시가 (상증법 §60) — §22 금융재산공제 대상 아님",
  financial:
    "예금·펀드·채권·공제금 등 잔액 또는 평가기준일 시가 (상증법 §62·시행령 §19①) — §22 금융재산공제 적용",
  other: "시가 우선 원칙 (상증법 §60)",
};

const SUBTITLE: Record<"cash" | "financial" | "other", string> = {
  cash: "자산 명칭 · 현금 금액 — 상증법 §60",
  financial: "자산 명칭 · 잔액 또는 시가 — 상증법 §62·§19①",
  other: "자산 명칭 · 시가 · 감정가 — 상증법 §60",
};

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EstateBodySimple({ item, onUpdate }: VariantBodyProps) {
  const cat = item.category as "cash" | "financial" | "other";
  const set = makePatcher(item, onUpdate);

  return (
    <div
      data-testid={`estate-body-variant-simple-${item.id}`}
      className="space-y-3"
    >
      <EstateBodySection title="평가액 입력" subtitle={SUBTITLE[cat]}>
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={NAME_PLACEHOLDER[cat]}
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* 평가 우선순위 안내 */}
        <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
          ℹ️ {PRIORITY_HINT[cat]}
        </p>

        {/* 시가 */}
        <FieldCard label={MARKET_LABEL[cat]} unit="원" hint={MARKET_HINT[cat]}>
          <CurrencyInput
            label={MARKET_LABEL[cat]}
            value={item.marketValue != null ? String(item.marketValue) : ""}
            onChange={(v) => set({ marketValue: parseAmount(v) || undefined })}
            placeholder="없으면 빈칸"
            hideLabel
            hideUnit
          />
        </FieldCard>

        {/* 감정평가액 — other만 노출 (cash·financial은 미노출) */}
        {cat === "other" && (
          <FieldCard
            label="감정평가액"
            unit="원"
            hint="감정평가법인 감정가 (시가 없을 때 2순위)"
          >
            <CurrencyInput
              label="감정평가액"
              value={
                item.appraisedValue != null ? String(item.appraisedValue) : ""
              }
              onChange={(v) =>
                set({ appraisedValue: parseAmount(v) || undefined })
              }
              placeholder="없으면 빈칸"
              hideLabel
              hideUnit
            />
          </FieldCard>
        )}
      </EstateBodySection>
    </div>
  );
}
