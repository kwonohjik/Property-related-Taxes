"use client";

/**
 * StockBurdenedDebtSection — 주식 부담부증여 §47① 채무 인수 입력 (증여 모드 전용, ⑤)
 *
 * 상장·비상장 주식 카드 공용. EstateBodyRealEstate.tsx의 §47① 섹션(520~557행)을
 * 주식용으로 경량화한 버전 — §66 평가용 mortgage·lease·신용보증·§14 자동공제는 제외하고
 * `assumedDebtForGift`(§47①) + `burdenedGiftDebtConfirmed`(§47③ 표시 전용)만 포함.
 *
 * 법령:
 *   §47① — 증여세 과세가액 = 증여재산가액 − 수증자가 인수한 담보 채무
 *   §47③ — 배우자·직계존비속 간 채무 인수는 증여 추정(객관적 입증 시 예외). 토글은 표시·안내 전용.
 *
 * 정책:
 *   - mode !== "gift"이면 null (상속 모드 미노출 — 상속 엔진 grep 0건 유지)
 *   - 채무>평가액은 차단 아님(경고만, validateStep ⑧). §47③ 추정 배제도 차단 아님(엔진은 금액>0이면 차감)
 *   - useState lazy init R-1: 설정 켜진 채 접혀 숨겨지는 사고 방지
 */

import { useState } from "react";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

interface StockBurdenedDebtSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  mode: "inheritance" | "gift";
}

export function StockBurdenedDebtSection({
  item,
  onUpdate,
  mode,
}: StockBurdenedDebtSectionProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const hasDebt = (item.assumedDebtForGift ?? 0) > 0;
  // R-1 lazy init: 채무/입증 설정이 있으면 펼친 상태로 시작 (접혀 숨겨지는 사고 방지)
  const [open, setOpen] = useState(
    hasDebt || item.burdenedGiftDebtConfirmed === true,
  );

  if (mode !== "gift") return null;

  return (
    <ToggleCard
      tone="amber"
      title="§47① 부담부증여 채무인수"
      description="수증자가 증여재산(주식)에 담보된 채무를 인수한 경우, 그 채무액을 증여세 과세가액에서 차감합니다 (상증법 §47①)."
      checked={open}
      onCheckedChange={(v) => {
        setOpen(v);
        // OFF 시 입력값 초기화 (자동 안분 fallback 아님 — 명시적 사용자 해제)
        if (!v) {
          set({
            assumedDebtForGift: undefined,
            burdenedGiftDebtConfirmed: undefined,
          });
        }
      }}
    >
      <div className="space-y-3">
        <FieldCard
          label="수증자 인수 채무액 (§47①)"
          unit="원"
          hint="수증자가 실제로 인수한 채무액 (주식 질권부 채무 등). 증여세 과세가액에서 차감됩니다. 가업승계 특례 자산이면 특례 과세가액에서 차감됩니다."
        >
          <CurrencyInput
            label="수증자 인수 채무액 (§47①)"
            value={
              item.assumedDebtForGift != null
                ? String(item.assumedDebtForGift)
                : ""
            }
            onChange={(v) =>
              set({ assumedDebtForGift: parseAmount(v) || undefined })
            }
            placeholder="없으면 빈칸"
            hideLabel
            hideUnit
          />
        </FieldCard>

        {hasDebt && (
          <ToggleCard
            tone="amber"
            size="sm"
            title="채무 인수 사실 객관적 입증 가능 (§47③)"
            description="배우자·직계존비속 간 부담부증여는 채무 인수를 원칙적으로 증여로 추정하지 않습니다. 금융기관 확인서 등 객관적 증빙이 있는 경우 ON으로 표시하세요."
            checked={item.burdenedGiftDebtConfirmed ?? false}
            onCheckedChange={(v) =>
              set({ burdenedGiftDebtConfirmed: v || undefined })
            }
          />
        )}

        {hasDebt && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <strong>§47③ 주의</strong> — 배우자·직계존비속 간 부담부증여의 채무
            인수는 원칙적으로 증여로 추정하지 않습니다. 채무 이전이 객관적으로
            입증된 경우에만 과세가액에서 차감됩니다. 또한 채무 인수분은 증여자의
            유상양도에 해당하여 주식 양도소득세가 별도로 발생할 수 있습니다.
            (상증법 §47③, 소득세법 §88)
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
