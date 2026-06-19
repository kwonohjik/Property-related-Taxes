"use client";

/**
 * EstateBodyDeposit — 전세보증금 반환채권 본체 입력 (상속세 전용)
 *
 * Plan estate-card-followup-phase2 §1.3·Visual §1.3
 * Restyle: docs/01-plan/estate-asset-input-fieldcard-restyle.plan.md (FieldCard + 섹션 카드)
 *
 * 자산본체: 임대보증금 (환산가액 = 보증금 ÷ 12%)
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EstateBodyDeposit({
  item,
  onUpdate,
  showCollateralDeductToggle,
}: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);

  return (
    <div
      data-testid={`estate-body-variant-deposit-${item.id}`}
      className="space-y-3"
    >
      <EstateBodySection
        title="평가액 입력"
        subtitle="자산 명칭 · 임대보증금 — 환산가액 = 보증금 ÷ 12%"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○시 ○○동 전세보증금)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* 평가 우선순위 안내 */}
        <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
          ℹ️ 임차인이 임대인에게 맡긴 전세보증금 — 반환받을 채권 액면가 (상속세 전용)
        </p>

        {/* 임대보증금 (자산본체) */}
        <FieldCard
          label="임대보증금"
          required
          unit="원"
          hint="환산가액 = 보증금 ÷ 12%"
        >
          <CurrencyInput
            label="임대보증금"
            value={item.leaseDeposit != null ? String(item.leaseDeposit) : ""}
            onChange={(v) => set({ leaseDeposit: parseAmount(v) })}
            hideLabel
            hideUnit
          />
        </FieldCard>
      </EstateBodySection>

      {/* §14 자동공제 토글 (조건부) — 섹션 카드 밖 (ToggleCard 자체 카드형) */}
      {showCollateralDeductToggle && (
        <ToggleCard
          lawLinks="상증법"
          tone="amber"
          title="이 담보채무를 §14 부채로 자동 공제"
          description={
            item.deductSecuredClaimAsDebt
              ? "재산평가 담보채권액(저당 + 임대보증금)이 §14 채무로 과세가액에서 공제됩니다. 채무 명세(Step 2)에 중복 입력하지 마세요."
              : "타인 채무를 담보한 물상보증은 OFF 유지 — §14 공제 대상이 아닙니다(§14①3호 '피상속인의 채무')."
          }
          checked={item.deductSecuredClaimAsDebt ?? false}
          onCheckedChange={(v) =>
            set({
              deductSecuredClaimAsDebt: v || undefined,
              securedClaimIsFinancialDebt: v ? item.securedClaimIsFinancialDebt : undefined,
              securedClaimCreditorName: v ? item.securedClaimCreditorName : undefined,
            })
          }
        />
      )}
    </div>
  );
}
