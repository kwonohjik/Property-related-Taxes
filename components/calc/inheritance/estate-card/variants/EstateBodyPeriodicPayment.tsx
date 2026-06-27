"use client";

/**
 * EstateBodyPeriodicPayment — 정기금을 받을 권리 본체 입력
 *
 * 상증법 §65①·상증령 §62.
 *   유기(finite)  = Σ 각연도 정기금/(1.03)ⁿ (1년분×20 한도)
 *   무기(perpetual) = 1년분 × 20
 *   종신(lifetime) = 기대여명 연수까지 현가합
 * 잔존연수는 lib/calc가 periodicRemainingYears로 합성 주입(평가기준일~만기/기대여명).
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { AnnuityKindType } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const KIND_OPTIONS: { value: AnnuityKindType; label: string; description: string }[] = [
  { value: "finite", label: "유기정기금", description: "잔존기간 현가합 (1년분×20 한도, §62 1호)" },
  { value: "perpetual", label: "무기정기금", description: "1년분 × 20 (§62 2호)" },
  { value: "lifetime", label: "종신정기금", description: "기대여명 연수 현가합 (§62 3호)" },
];

export function EstateBodyPeriodicPayment({ item, onUpdate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const type = item.periodicAnnuityType ?? "finite";

  return (
    <div data-testid={`estate-body-variant-periodic_payment-${item.id}`} className="space-y-3">
      <EstateBodySection title="정기금받을권리 평가" subtitle="상증법 §65①·상증령 §62 — 정기금을 받을 권리">
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○연금 수급권)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* ① 정기금 종류 */}
        <FieldCard label="정기금 종류">
          <RadioCardGroup
            name={`periodic-kind-${item.id}`}
            options={KIND_OPTIONS}
            value={type}
            onChange={(v) => set({ periodicAnnuityType: v as AnnuityKindType })}
            tone="emerald"
          />
        </FieldCard>

        {/* ② 1년분 정기금액 */}
        <FieldCard label="1년분 정기금액" unit="원" hint="연간 받을 정기금 합계">
          <CurrencyInput
            label="1년분 정기금액"
            value={item.periodicAnnualAmount != null ? String(item.periodicAnnualAmount) : ""}
            onChange={(v) => set({ periodicAnnualAmount: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
            data-testid={`periodic-annual-${item.id}`}
          />
        </FieldCard>

        {/* ③ 기간 — 유기: 만기일 / 종신: 성별·나이 / 무기: 없음 */}
        {type === "finite" && (
          <FieldCard label="정기금 만기일" hint="평가기준일~만기까지 잔존연수 산정">
            <div data-testid={`periodic-maturity-${item.id}`}>
              <DateInput
                value={typeof item.periodicMaturityDate === "string" ? item.periodicMaturityDate : ""}
                onChange={(v) => set({ periodicMaturityDate: v || undefined })}
              />
            </div>
          </FieldCard>
        )}
        {type === "lifetime" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="수급자 성별">
              <RadioCardGroup
                name={`periodic-gender-${item.id}`}
                options={[{ value: "male", label: "남" }, { value: "female", label: "여" }]}
                value={item.periodicBeneficiaryGender ?? ""}
                onChange={(v) => set({ periodicBeneficiaryGender: v as "male" | "female" })}
                tone="sky"
                layout="inline"
              />
            </FieldCard>
            <FieldCard label="수급자 나이" unit="세">
              <DecimalInput
                value={item.periodicBeneficiaryAge != null ? String(item.periodicBeneficiaryAge) : ""}
                onChange={(v) => set({ periodicBeneficiaryAge: parseDecimal(v) || undefined })}
              />
            </FieldCard>
          </div>
        )}

        {/* ④ 해지·철회 일시금 */}
        <FieldCard label="해지·철회·취소 일시금" unit="원" hint="평가기준일 현재 받을 수 있는 일시금 (평가액보다 크면 일시금 적용, §62 본문 단서)">
          <CurrencyInput
            label="해지 일시금"
            value={item.periodicSurrenderValue != null ? String(item.periodicSurrenderValue) : ""}
            onChange={(v) => set({ periodicSurrenderValue: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
            data-testid={`periodic-surrender-${item.id}`}
          />
        </FieldCard>

        <p className="text-xs text-sky-600 dark:text-sky-400">
          유기 = 현가합(1년분×20 한도) / 무기 = 1년분×20 / 종신 = 기대여명 현가합 (이자율 3%, 상증칙 §19의2③)
        </p>
      </EstateBodySection>
    </div>
  );
}
