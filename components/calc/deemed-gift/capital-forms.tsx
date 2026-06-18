"use client";

/** 증여로 보는 경우 Phase 2 — 자본거래 입력 폼 (합병·증자·감자·현물출자·전환사채). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** (7) 합병 §38 — 주식교부 */
export function MergerFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <CurrencyInput label="합병 후 1주당 평가가액" value={form.mrgMergedPrice} onChange={(v) => set({ mrgMergedPrice: v })} placeholder="합병 후 1주당 평가가액 (원)" />
      <CurrencyInput label="과대평가법인 1주당 평가가액" value={form.mrgOvervaluedPrice} onChange={(v) => set({ mrgOvervaluedPrice: v })} placeholder="과대평가법인 1주당 평가가액 (원)" />
      <CurrencyInput label="과대평가법인 합병 전 주식수" value={form.mrgPreShares} onChange={(v) => set({ mrgPreShares: v })} placeholder="합병 전 주식수" />
      <CurrencyInput label="교부받은 주식수 (과대평가법인 주주)" value={form.mrgExchangedShares} onChange={(v) => set({ mrgExchangedShares: v })} placeholder="교부받은 주식수" />
      <CurrencyInput label="대주주등 교부 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 교부 주식수" />
    </div>
  );
}

/** (8) 증자 §39 — 저가발행·실권주 재배정 */
export function CapitalIncreaseFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciPrePrice} onChange={(v) => set({ ciPrePrice: v })} placeholder="증자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="증자 전 발행주식총수" value={form.ciPreShares} onChange={(v) => set({ ciPreShares: v })} placeholder="증자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.ciNewPrice} onChange={(v) => set({ ciNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="증자 주식수" value={form.ciIssuedShares} onChange={(v) => set({ ciIssuedShares: v })} placeholder="증자 주식수" />
      <CurrencyInput label="배정받은 실권주수" value={form.ciForfeitedShares} onChange={(v) => set({ ciForfeitedShares: v })} placeholder="배정받은 실권주수" />
    </div>
  );
}

/** (9) 감자 §39의2 — 저가소각 */
export function CapitalDecreaseFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <CurrencyInput label="감자주식 1주당 평가액" value={form.cdSharePrice} onChange={(v) => set({ cdSharePrice: v })} placeholder="감자주식 1주당 평가액 (원)" />
      <CurrencyInput label="소각 시 지급한 1주당 금액" value={form.cdRedemptionPrice} onChange={(v) => set({ cdRedemptionPrice: v })} placeholder="소각 지급 1주당 금액 (원)" />
      <CurrencyInput label="총감자 주식수" value={form.cdTotalShares} onChange={(v) => set({ cdTotalShares: v })} placeholder="총감자 주식수" />
      <FieldCard label="대주주등 감자후 지분비율" hint="감자 후 대주주등의 지분율" unit="%">
        <DecimalInput value={form.cdMajorRatioPct} onChange={(v) => set({ cdMajorRatioPct: v })} />
      </FieldCard>
      <CurrencyInput label="대주주등 특수관계인 감자 주식수" value={form.cdRelatedShares} onChange={(v) => set({ cdRelatedShares: v })} placeholder="대주주등 특수관계인 감자 주식수" />
    </div>
  );
}

/** (10) 현물출자 §39의3 — 저가인수 */
export function ContributionFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <CurrencyInput label="현물출자 전 1주당 평가가액" value={form.conPrePrice} onChange={(v) => set({ conPrePrice: v })} placeholder="현물출자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="현물출자 전 발행주식총수" value={form.conPreShares} onChange={(v) => set({ conPreShares: v })} placeholder="현물출자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.conNewPrice} onChange={(v) => set({ conNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="현물출자 주식수" value={form.conContributedShares} onChange={(v) => set({ conContributedShares: v })} placeholder="현물출자 주식수" />
      <CurrencyInput label="배정받은 신주수" value={form.conAllocatedShares} onChange={(v) => set({ conAllocatedShares: v })} placeholder="배정받은 신주수" />
    </div>
  );
}

/** (11) 전환사채 §40 — 저가 인수·취득 */
export function ConvertibleBondFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <CurrencyInput label="전환사채 시가" value={form.cbMarketValue} onChange={(v) => set({ cbMarketValue: v })} placeholder="전환사채 시가 (원)" />
      <CurrencyInput label="인수·취득가액" value={form.cbAcquisitionPrice} onChange={(v) => set({ cbAcquisitionPrice: v })} placeholder="인수·취득가액 (원)" />
    </div>
  );
}
