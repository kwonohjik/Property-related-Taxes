"use client";

/** 증여로 보는 경우 Phase 3 — 추정·의제 입력 폼 (재산취득자금 증여추정·명의신탁 증여의제). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §45 재산취득자금·채무상환 증여추정 */
export function AcquisitionFundFields({ form, set }: Props) {
  const isDebt = form.afSubType === "debt_repayment";
  return (
    <ToneCard tone="sky" bodyClassName="space-y-3" noDark>
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
    </ToneCard>
  );
}

/** §45의2 명의신탁재산 증여의제 */
export function NomineeTrustFields({ form, set }: Props) {
  const isPerShare = form.ntValuationMode === "per_share";
  return (
    <ToneCard tone="rose" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="nt-valuation-mode"
        tone="rose"
        layout="inline"
        value={form.ntValuationMode}
        onChange={(v) => set({ ntValuationMode: v })}
        options={[
          { value: "total", label: "재산가액 직접", testId: "nt-mode-total" },
          { value: "per_share", label: "유상증자 신주 (1주당 × 신주수)", testId: "nt-mode-per_share" },
        ]}
      />
      {isPerShare ? (
        <ToneCard tone="emerald" bodyClassName="space-y-3" noDark>
          <p className="text-xs leading-relaxed text-emerald-800">
            유상증자 신주의 증여재산가액 = <b>명의개서일 현재 §60·§63 평가 1주당 가액 × 명의신탁 신주 수</b>.
            신주인수가액(발행가액)·이론적 권리락가가 아닌 증여일 평가액을 적용합니다 (희석효과 반영, 조심2012중3707·2019서2129).
          </p>
          <CurrencyInput
            label="1주당 평가액 (명의개서일 §63)"
            value={form.ntPerSharePrice}
            onChange={(v) => set({ ntPerSharePrice: v })}
            hint="증여일 현재 상증법 §60·§63 평가액 (희석효과 반영 — 인수가·권리락 아님)"
            placeholder="1주당 평가액 (원)"
          />
          <CurrencyInput
            label="명의신탁 신주 수"
            value={form.ntNewShares}
            onChange={(v) => set({ ntNewShares: v })}
            hint="유상증자로 명의자에게 배정된 신주 수 (제척기간 만료된 기존분 제외)"
            placeholder="명의신탁 신주 수"
          />
          <div className="space-y-2 rounded-md border border-emerald-200 bg-white p-2">
            <p className="text-xs font-semibold text-emerald-700">참고·비교 입력 (선택 — 평가에 미적용)</p>
            <CurrencyInput
              label="신주인수가액 (발행가액)"
              value={form.ntSubscriptionPrice}
              onChange={(v) => set({ ntSubscriptionPrice: v })}
              placeholder="신주인수가액 (원)"
            />
            <CurrencyInput
              label="이론적 권리락 증자후 1주당"
              value={form.ntTheoreticalExRights}
              onChange={(v) => set({ ntTheoreticalExRights: v })}
              placeholder="권리락 단가 (원)"
            />
            <CurrencyInput
              label="증자 전 1주당 평가액"
              value={form.ntPreIncreasePerShare}
              onChange={(v) => set({ ntPreIncreasePerShare: v })}
              hint="희석 출발점"
              placeholder="증자 전 평가액 (원)"
            />
            <input
              type="text"
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
              placeholder="실제소유자(증여자) 성명 (선택)"
              value={form.ntActualOwner}
              onChange={(e) => set({ ntActualOwner: e.target.value })}
              onFocus={(e) => e.target.select()}
              aria-label="실제소유자 성명"
            />
            <input
              type="text"
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
              placeholder="명의자(증여의제 수증자) 성명 (선택)"
              value={form.ntNominee}
              onChange={(e) => set({ ntNominee: e.target.value })}
              onFocus={(e) => e.target.select()}
              aria-label="명의자 성명"
            />
          </div>
        </ToneCard>
      ) : (
        <CurrencyInput
          label="명의신탁 재산 가액"
          value={form.ntPropertyValue}
          onChange={(v) => set({ ntPropertyValue: v })}
          hint="등기등이 필요한 재산(토지·건물 제외) — 주식 등"
          placeholder="명의신탁 재산 가액 (원)"
        />
      )}
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
    </ToneCard>
  );
}
