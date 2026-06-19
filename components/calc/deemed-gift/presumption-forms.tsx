"use client";

/** 증여로 보는 경우 Phase 3 — 추정·의제 입력 폼 (재산취득자금 증여추정·명의신탁 증여의제). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §45 재산취득자금·채무상환 증여추정 */
export function AcquisitionFundFields({ form, set }: Props) {
  const isDebt = form.afSubType === "debt_repayment";
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <RadioCardGroup
        lawLinks="상증법"
        name="af-subtype"
        tone="sky"
        layout="inline"
        value={form.afSubType}
        onChange={(v) => set({ afSubType: v })}
        options={[
          { value: "acquisition", label: "재산취득자금 (§45①)", testId: "af-subtype-acquisition" },
          { value: "debt_repayment", label: "채무상환자금 (§45②)", testId: "af-subtype-debt_repayment" },
        ]}
      />
      <CurrencyInput
        label={isDebt ? "채무상환금액" : "취득재산가액"}
        value={form.afAcquisitionValue}
        onChange={(v) => set({ afAcquisitionValue: v })}
        hint="미입증액이 취득가액(상환금액) 20%·2억 중 적은 금액 이상이면 증여추정 (§45③)"
        placeholder={isDebt ? "채무상환금액 (원)" : "취득재산가액 (원)"}
      />
      <CurrencyInput
        label="입증된 금액 (소득·상속수증·처분대가)"
        value={form.afProvenAmount}
        onChange={(v) => set({ afProvenAmount: v })}
        placeholder="입증된 금액 (원)"
      />
    </div>
  );
}

/** §45의2 명의신탁재산 증여의제 */
export function NomineeTrustFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <CurrencyInput
        label="명의신탁 재산 가액"
        value={form.ntPropertyValue}
        onChange={(v) => set({ ntPropertyValue: v })}
        hint="등기등이 필요한 재산(토지·건물 제외) — 주식 등"
        placeholder="명의신탁 재산 가액 (원)"
      />
      <ToggleCard
        lawLinks="상증법"
        tone="rose"
        checked={form.ntTaxAvoidance}
        onCheckedChange={(v) => set({ ntTaxAvoidance: v })}
        title="조세회피목적 있음 (§45의2③ 추정)"
        description="끄면 조세회피목적 없음 — 증여의제 미적용 (§45의2①1호)"
      />
      <ToggleCard
        lawLinks="상증법"
        tone="amber"
        checked={form.ntExcluded}
        onCheckedChange={(v) => set({ ntExcluded: v })}
        title="배제사유 해당 (§45의2①)"
        description="신탁재산 등기·비거주자 법정대리인 명의 등기 등"
      />
    </div>
  );
}
