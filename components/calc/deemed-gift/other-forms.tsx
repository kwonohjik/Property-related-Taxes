"use client";

/** 증여로 보는 경우 Phase 3 — 기타이익·자본거래연계·법인 입력 폼 (§41의2·§41의3·§41의5·§42·§42의2·§42의3·§45의5). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §41의2 초과배당 */
export function ExcessDividendFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <CurrencyInput label="초과배당금액" value={form.edExcessDividend} onChange={(v) => set({ edExcessDividend: v })} hint="(특수관계인 실수령 배당 − 균등배당) × 최대주주등 과소배당 비율" placeholder="초과배당금액 (원)" />
      <CurrencyInput label="초과배당금액에 대한 소득세 상당액" value={form.edIncomeTax} onChange={(v) => set({ edIncomeTax: v })} hint="시행규칙 §10의3 율표(또는 실제 소득세액) — 직접 입력. 정산(§41의2②③)은 별도" placeholder="소득세 상당액 (원)" />
    </div>
  );
}

/** §41의3 상장이익 / §41의5 합병상장이익 */
export function ListingGainFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <RadioCardGroup
        name="lg-event"
        tone="emerald"
        layout="inline"
        value={form.lgEventType}
        onChange={(v) => set({ lgEventType: v })}
        options={[
          { value: "listing", label: "상장 (§41의3)", testId: "lg-event-listing" },
          { value: "merger", label: "합병상장 (§41의5)", testId: "lg-event-merger" },
        ]}
      />
      <CurrencyInput label="정산기준일 1주당 평가가액" value={form.lgSettlementPrice} onChange={(v) => set({ lgSettlementPrice: v })} hint={form.lgEventType === "merger" ? "합병등기일 +3개월 (§63 평가)" : "상장일 +3개월 (§63 평가)"} placeholder="정산기준일 1주당 평가가액 (원)" />
      <CurrencyInput label="1주당 증여세 과세가액(취득가액)" value={form.lgAcqValue} onChange={(v) => set({ lgAcqValue: v })} placeholder="1주당 과세가액(취득가액) (원)" />
      <CurrencyInput label="1주당 기업가치 실질증가이익" value={form.lgCorpGrowth} onChange={(v) => set({ lgCorpGrowth: v })} hint="시행령 §31의3⑤ (1주당 순손익액 평균 × 보유월수)" placeholder="1주당 기업가치 실질증가이익 (원)" />
      <CurrencyInput label="증여·유상취득 주식수" value={form.lgShares} onChange={(v) => set({ lgShares: v })} placeholder="증여·유상취득 주식수" />
    </div>
  );
}

/** §42 재산사용·용역제공 */
export function PropertyServiceUseFields({ form, set }: Props) {
  const isFree = form.psuSubType === "free_use";
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <RadioCardGroup
        name="psu-subtype"
        tone="violet"
        value={form.psuSubType}
        onChange={(v) => set({ psuSubType: v })}
        options={[
          { value: "free_use", label: "무상 사용·용역제공받음 (§42①1호)", testId: "psu-subtype-free_use" },
          { value: "low_price", label: "저가 사용·용역제공받음 (§42①1·3호)", testId: "psu-subtype-low_price" },
          { value: "high_price", label: "고가 사용하게함·용역제공 (§42①2·4호)", testId: "psu-subtype-high_price" },
        ]}
      />
      <CurrencyInput label={isFree ? "재산사용·용역 시가 상당액" : "시가"} value={form.psuMarketValue} onChange={(v) => set({ psuMarketValue: v })} hint={isFree ? "기준금액 1천만원 이상이면 과세" : "기준금액 시가의 30% 이상이면 과세"} placeholder={isFree ? "시가 상당액 (원)" : "시가 (원)"} />
      {!isFree && (
        <CurrencyInput label="대가" value={form.psuConsideration} onChange={(v) => set({ psuConsideration: v })} placeholder="대가 (원)" />
      )}
    </div>
  );
}

/** §42의2 법인 조직변경 */
export function OrgChangeFields({ form, set }: Props) {
  const isShare = form.ocSubType === "share_change";
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <RadioCardGroup
        name="oc-subtype"
        tone="amber"
        layout="inline"
        value={form.ocSubType}
        onChange={(v) => set({ ocSubType: v })}
        options={[
          { value: "share_change", label: "소유지분 변동", testId: "oc-subtype-share_change" },
          { value: "value_change", label: "평가액 변동", testId: "oc-subtype-value_change" },
        ]}
      />
      {isShare ? (
        <>
          <CurrencyInput label="변동 전 지분" value={form.ocPreShares} onChange={(v) => set({ ocPreShares: v })} placeholder="변동 전 지분(주식수)" />
          <CurrencyInput label="변동 후 지분" value={form.ocPostShares} onChange={(v) => set({ ocPostShares: v })} placeholder="변동 후 지분(주식수)" />
          <CurrencyInput label="변동 후 1주당 가액" value={form.ocPostPerShare} onChange={(v) => set({ ocPostPerShare: v })} placeholder="변동 후 1주당 가액 (원)" />
        </>
      ) : (
        <>
          <CurrencyInput label="변동 전 가액" value={form.ocPreValue} onChange={(v) => set({ ocPreValue: v })} placeholder="변동 전 가액 (원)" />
          <CurrencyInput label="변동 후 가액" value={form.ocPostValue} onChange={(v) => set({ ocPostValue: v })} placeholder="변동 후 가액 (원)" />
        </>
      )}
      <CurrencyInput label="변동 전 해당 재산가액 (기준금액 산정)" value={form.ocBaseValue} onChange={(v) => set({ ocBaseValue: v })} hint="기준금액 = min(변동전 재산가액 × 30%, 3억)" placeholder="변동 전 재산가액 (원)" />
    </div>
  );
}

/** §42의3 재산취득 후 가치증가 */
export function ValueIncreaseFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <CurrencyInput label="사유발생일 현재 재산가액" value={form.viCurrentValue} onChange={(v) => set({ viCurrentValue: v })} placeholder="사유발생일 현재 재산가액 (원)" />
      <CurrencyInput label="취득가액" value={form.viAcqCost} onChange={(v) => set({ viAcqCost: v })} hint="증여받은 재산은 증여세 과세가액" placeholder="취득가액 (원)" />
      <CurrencyInput label="통상적인 가치상승분" value={form.viNormalIncrease} onChange={(v) => set({ viNormalIncrease: v })} placeholder="통상적인 가치상승분 (원)" />
      <CurrencyInput label="가치상승기여분" value={form.viContribution} onChange={(v) => set({ viContribution: v })} hint="자본적지출액 등" placeholder="가치상승기여분 (원)" />
    </div>
  );
}

/** §45의5 특정법인과의 거래 */
export function SpecificCorpFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <CurrencyInput label="거래이익" value={form.scTransactionBenefit} onChange={(v) => set({ scTransactionBenefit: v })} hint="증여재산가액·채무면제이익·시가−대가 차액" placeholder="거래이익 (원)" />
      <CurrencyInput label="법인세 상당액" value={form.scCorporateTax} onChange={(v) => set({ scCorporateTax: v })} hint="(산출세액 − 공제·감면) × min(거래이익/소득금액, 1)" placeholder="법인세 상당액 (원)" />
      <FieldCard label="지배주주등 주식보유비율" hint="증여의제이익 1억원 이상이면 과세" unit="%">
        <DecimalInput value={form.scRatioPct} onChange={(v) => set({ scRatioPct: v })} placeholder="지배주주등 지분율" />
      </FieldCard>
    </div>
  );
}
