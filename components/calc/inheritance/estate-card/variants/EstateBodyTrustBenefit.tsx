"use client";

/**
 * EstateBodyTrustBenefit — 신탁의 이익을 받을 권리 본체 입력
 *
 * 상증법 §65①·상증령 §61.
 *   1호 동일수익자        = 신탁재산 가액 그 자체 (수익권 PV 미가산)
 *   2호가 원본권(수익자 다름) = 신탁재산 − 수익권 현가합
 *   2호나 수익권(수익자 다름) = 세후수익 현가합
 * 수익 회차수(연수)는 lib/calc가 trustRemainingYears로 합성 주입(평가기준일~수익시기, §61②).
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { TrustBeneficiaryType, TrustAssetComponent, AnnuityKindType } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const BENEFICIARY_OPTIONS: { value: TrustBeneficiaryType; label: string; description: string }[] = [
  { value: "same", label: "동일수익자 (1호)", description: "원본·수익을 같은 사람이 받음 → 신탁재산 가액으로 평가" },
  { value: "diff_principal", label: "원본권 (수익자 다름, 2호가)", description: "원본을 받을 권리 → 신탁재산 − 수익권 현가합" },
  { value: "diff_income", label: "수익권 (수익자 다름, 2호나)", description: "수익을 받을 권리 → 세후수익 현가합" },
];

const TIMING_OPTIONS: { value: Exclude<AnnuityKindType, "finite">; label: string; description: string }[] = [
  { value: "perpetual", label: "무기 (20년)", description: "§62 2호 준용 — 20년" },
  { value: "lifetime", label: "종신 (기대여명)", description: "§62 3호 준용 — 통계청 기대여명" },
];

export function EstateBodyTrustBenefit({ item, onUpdate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const beneficiaryType = item.trustBeneficiaryType ?? "same";
  const assets = item.trustAssets ?? [];
  const needsIncome = beneficiaryType !== "same"; // 수익권 PV 입력 필요 분기
  const yieldDetermined = item.trustYieldRateNumer != null;
  const timingUndetermined = item.trustAnnuityType != null && item.trustAnnuityType !== "finite";

  const updateAsset = (idx: number, patch: Partial<TrustAssetComponent>) =>
    set({ trustAssets: assets.map((a, i) => (i === idx ? { ...a, ...patch } : a)) });
  const addAsset = () => set({ trustAssets: [...assets, { kind: "simple", label: "", value: 0 }] });
  const removeAsset = (idx: number) => set({ trustAssets: assets.filter((_, i) => i !== idx) });

  return (
    <div data-testid={`estate-body-variant-trust_benefit-${item.id}`} className="space-y-3">
      <EstateBodySection title="신탁수익권 평가" subtitle="상증법 §65①·상증령 §61 — 신탁의 이익을 받을 권리">
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○신탁 수익권)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* ① 수익자 구성 */}
        <FieldCard label="수익자 구성">
          <RadioCardGroup
            name={`trust-beneficiary-${item.id}`}
            options={BENEFICIARY_OPTIONS}
            value={beneficiaryType}
            onChange={(v) => set({ trustBeneficiaryType: v as TrustBeneficiaryType })}
            tone="emerald"
          />
        </FieldCard>

        {/* ② 신탁재산 구성 (결정 B 경량 — Σ value = 신탁재산 가액) */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-700">신탁재산 구성 (평가기준일 현재 가액)</p>
          {assets.map((row, idx) => (
            <div key={idx} data-testid={`trust-asset-row-${idx}`} className="flex items-end gap-2 rounded-md border border-sky-200/70 bg-sky-50/30 p-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={row.label ?? ""}
                  onChange={(e) => updateAsset(idx, { label: e.target.value })}
                  placeholder="구성 자산 (예: 토지, 예금)"
                  className={TEXT_INPUT_CLASS}
                />
              </div>
              <div className="flex-1">
                <CurrencyInput
                  label="평가액"
                  value={row.value ? String(row.value) : ""}
                  onChange={(v) => updateAsset(idx, { value: parseAmount(v) || 0 })}
                  hideLabel
                  data-testid={`trust-asset-row-${idx}-value`}
                />
              </div>
              <button type="button" onClick={() => removeAsset(idx)} className="mb-1 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">✕</button>
            </div>
          ))}
          <button type="button" onClick={addAsset} data-testid="trust-asset-add" className="rounded-md border border-sky-300 bg-sky-100/60 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100">
            + 신탁재산 항목 추가
          </button>
        </div>

        {needsIncome && (
          <>
            {/* ③ 수익률 */}
            <ToggleCard
              checked={yieldDetermined}
              onCheckedChange={(on) =>
                set(on ? { trustYieldRateNumer: 0, trustYieldRateDenom: 100 } : { trustYieldRateNumer: undefined, trustYieldRateDenom: undefined })
              }
              title="연수익률 확정"
              description="OFF: 미확정 → 신탁재산 × 3% (상증칙 §19의2②) / ON: 확정 수익률 직접 입력"
              tone="violet"
            >
              <FieldCard label="연수익률" unit="%">
                <DecimalInput
                  value={item.trustYieldRateNumer != null ? String((item.trustYieldRateNumer * 100) / (item.trustYieldRateDenom ?? 100)) : ""}
                  onChange={(v) => {
                    const pct = parseDecimal(v);
                    set({ trustYieldRateNumer: pct > 0 ? Math.round(pct * 100) : 0, trustYieldRateDenom: 10000 });
                  }}
                  data-testid={`trust-yield-${item.id}`}
                />
              </FieldCard>
            </ToggleCard>

            {/* 원천징수세율 */}
            <FieldCard label="수익 원천징수세율" unit="%" hint="이자·배당 원천징수율 (없으면 비워두세요)">
              <DecimalInput
                value={item.trustWithholdingRateNumer != null ? String((item.trustWithholdingRateNumer * 100) / (item.trustWithholdingRateDenom ?? 100)) : ""}
                onChange={(v) => {
                  const pct = parseDecimal(v);
                  set(pct > 0 ? { trustWithholdingRateNumer: Math.round(pct * 10), trustWithholdingRateDenom: 1000 } : { trustWithholdingRateNumer: undefined });
                }}
                data-testid={`trust-withholding-${item.id}`}
              />
            </FieldCard>

            {/* ④ 수익시기 */}
            <ToggleCard
              checked={timingUndetermined}
              onCheckedChange={(on) => set({ trustAnnuityType: on ? "perpetual" : "finite" })}
              title="수익시기 미정 (§61② 준용)"
              description="OFF: 수익만기일 입력 / ON: §62 준용 (무기 20년·종신 기대여명)"
              tone="sky"
            >
              <RadioCardGroup
                name={`trust-timing-${item.id}`}
                options={TIMING_OPTIONS}
                value={item.trustAnnuityType === "lifetime" ? "lifetime" : "perpetual"}
                onChange={(v) => set({ trustAnnuityType: v as AnnuityKindType })}
                tone="sky"
              />
              {item.trustAnnuityType === "lifetime" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FieldCard label="수익자 성별">
                    <RadioCardGroup
                      name={`trust-gender-${item.id}`}
                      options={[{ value: "male", label: "남" }, { value: "female", label: "여" }]}
                      value={item.trustBeneficiaryGender ?? ""}
                      onChange={(v) => set({ trustBeneficiaryGender: v as "male" | "female" })}
                      tone="sky"
                      layout="inline"
                    />
                  </FieldCard>
                  <FieldCard label="수익자 나이" unit="세">
                    <DecimalInput
                      value={item.trustBeneficiaryAge != null ? String(item.trustBeneficiaryAge) : ""}
                      onChange={(v) => set({ trustBeneficiaryAge: parseDecimal(v) || undefined })}
                    />
                  </FieldCard>
                </div>
              )}
            </ToggleCard>
            {!timingUndetermined && (
              <FieldCard label="수익 만기일" hint="평가기준일~만기까지 연수로 수익권 현가 회차 산정">
                <div data-testid={`trust-maturity-${item.id}`}>
                  <DateInput
                    value={typeof item.trustIncomeMaturityDate === "string" ? item.trustIncomeMaturityDate : ""}
                    onChange={(v) => set({ trustIncomeMaturityDate: v || undefined })}
                  />
                </div>
              </FieldCard>
            )}
          </>
        )}

        {/* ⑤ 해지·철회 일시금 */}
        <FieldCard label="해지·철회·취소 일시금" unit="원" hint="평가기준일 현재 받을 수 있는 일시금 (평가액보다 크면 일시금 적용, §61① 단서)">
          <CurrencyInput
            label="해지 일시금"
            value={item.trustSurrenderValue != null ? String(item.trustSurrenderValue) : ""}
            onChange={(v) => set({ trustSurrenderValue: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
            data-testid={`trust-surrender-${item.id}`}
          />
        </FieldCard>

        <p className="text-xs text-sky-600 dark:text-sky-400">
          동일수익자 = 신탁재산 가액 / 원본권 = 신탁재산 − 수익권 현가합 / 수익권 = 세후수익 현가합 (이자율 3%)
        </p>
      </EstateBodySection>
    </div>
  );
}
