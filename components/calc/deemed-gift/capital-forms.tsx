"use client";

/** 증여로 보는 경우 Phase 2 — 자본거래 입력 폼 (합병·증자·감자·현물출자·전환사채) + sub-case 토글. */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** (7) 합병 §38 — 주식교부(§28③1) / 주식 외 재산교부(§28③2) */
export function MergerFields({ form, set }: Props) {
  const isStock = form.mrgCaseType !== "non_stock";
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <RadioCardGroup
        name="mrg-case"
        tone="emerald"
        layout="inline"
        value={form.mrgCaseType}
        onChange={(v) => set({ mrgCaseType: v })}
        options={[
          { value: "stock", label: "주식 교부 (§28③1)", testId: "mrg-case-stock" },
          { value: "non_stock", label: "주식 외 재산 교부 (§28③2)", testId: "mrg-case-non_stock" },
        ]}
      />
      {isStock ? (
        <>
          <CurrencyInput label="합병 후 1주당 평가가액" value={form.mrgMergedPrice} onChange={(v) => set({ mrgMergedPrice: v })} placeholder="합병 후 1주당 평가가액 (원)" />
          <CurrencyInput label="과대평가법인 합병 전 주식수" value={form.mrgPreShares} onChange={(v) => set({ mrgPreShares: v })} placeholder="합병 전 주식수" />
          <CurrencyInput label="교부받은 주식수 (과대평가법인 주주)" value={form.mrgExchangedShares} onChange={(v) => set({ mrgExchangedShares: v })} placeholder="교부받은 주식수" />
        </>
      ) : (
        <>
          <CurrencyInput label="액면가액" value={form.mrgFaceValue} onChange={(v) => set({ mrgFaceValue: v })} placeholder="액면가액 (원)" />
          <CurrencyInput label="합병대가 (액면 미달 시 적용)" value={form.mrgConsideration} onChange={(v) => set({ mrgConsideration: v })} placeholder="합병대가 (원)" />
        </>
      )}
      <CurrencyInput label={isStock ? "과대평가법인 1주당 평가가액" : "합병당사법인 1주당 평가가액"} value={form.mrgOvervaluedPrice} onChange={(v) => set({ mrgOvervaluedPrice: v })} placeholder="1주당 평가가액 (원)" />
      <CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 주식수" />
    </div>
  );
}

const CI_SHARES_LABEL: Record<DeemedFormState["ciSubType"], string> = {
  forfeited_realloc: "배정받은 실권주수",
  third_party: "직접배정 신주수",
  excess: "초과배정 신주수",
  no_realloc: "실권주수",
};

/** (8) 증자 §39 — 저가발행(①1호) / 고가발행(①2호) + 가/나/다/라목 */
export function CapitalIncreaseFields({ form, set }: Props) {
  const isHigh = form.ciDirection === "high";
  const needsRatio = isHigh && form.ciSubType !== "forfeited_realloc"; // 고가 나·다·라목 비율가중
  const sharesLabel = CI_SHARES_LABEL[form.ciSubType];
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <RadioCardGroup
        name="ci-direction"
        tone="sky"
        layout="inline"
        value={form.ciDirection}
        onChange={(v) => set({ ciDirection: v })}
        options={[
          { value: "low", label: "저가발행 (①1호)", testId: "ci-direction-low" },
          { value: "high", label: "고가발행 (①2호)", testId: "ci-direction-high" },
        ]}
      />
      <RadioCardGroup
        name="ci-subtype"
        tone="sky"
        value={form.ciSubType}
        onChange={(v) => set({ ciSubType: v })}
        options={[
          { value: "forfeited_realloc", label: "실권주 재배정 (가목)", testId: "ci-subtype-forfeited_realloc" },
          { value: "third_party", label: "제3자 직접배정 (다목)", testId: "ci-subtype-third_party" },
          { value: "excess", label: "초과배정 (라목)", testId: "ci-subtype-excess" },
          { value: "no_realloc", label: "실권주 미배정 (나목)", testId: "ci-subtype-no_realloc" },
        ]}
      />
      <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciPrePrice} onChange={(v) => set({ ciPrePrice: v })} placeholder="증자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="증자 전 발행주식총수" value={form.ciPreShares} onChange={(v) => set({ ciPreShares: v })} placeholder="증자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.ciNewPrice} onChange={(v) => set({ ciNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="증자 주식수" value={form.ciIssuedShares} onChange={(v) => set({ ciIssuedShares: v })} placeholder="증자 주식수" />
      <CurrencyInput label={sharesLabel} value={form.ciForfeitedShares} onChange={(v) => set({ ciForfeitedShares: v })} placeholder={sharesLabel} />
      {needsRatio && (
        <>
          <CurrencyInput label="특수관계인이 인수한 신주수" value={form.ciRelatedAcquiredShares} onChange={(v) => set({ ciRelatedAcquiredShares: v })} placeholder="특수관계인이 인수한 신주수" />
          <CurrencyInput label="분모 신주수" value={form.ciRatioDenomShares} onChange={(v) => set({ ciRatioDenomShares: v })} hint="나목=균등증자 증자주식총수 / 다·라목=주주 아닌 자 배정+초과인수 총수" placeholder="분모 신주수" />
        </>
      )}
      {!isHigh && (
        <ToggleCard
          tone="violet"
          checked={form.ciSmallImputation}
          onCheckedChange={(v) => set({ ciSmallImputation: v })}
          title="소액주주 1인 의제 (§39②)"
          description="이익을 증여한 소액주주(1%·액면3억 미만)가 2명 이상이면 1명으로 보고 계산"
        />
      )}
    </div>
  );
}

/** (9) 감자 §39의2 — 저가소각(①1호) / 고가소각(①2호) */
export function CapitalDecreaseFields({ form, set }: Props) {
  const isHigh = form.cdCaseType === "high";
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <RadioCardGroup
        name="cd-case"
        tone="amber"
        layout="inline"
        value={form.cdCaseType}
        onChange={(v) => set({ cdCaseType: v })}
        options={[
          { value: "low", label: "저가 소각 (①1호)", testId: "cd-case-low" },
          { value: "high", label: "고가 소각 (①2호)", testId: "cd-case-high" },
        ]}
      />
      <CurrencyInput label="감자주식 1주당 평가액" value={form.cdSharePrice} onChange={(v) => set({ cdSharePrice: v })} placeholder="감자주식 1주당 평가액 (원)" />
      <CurrencyInput label="소각 시 지급한 1주당 금액" value={form.cdRedemptionPrice} onChange={(v) => set({ cdRedemptionPrice: v })} placeholder="소각 지급 1주당 금액 (원)" />
      {isHigh ? (
        <CurrencyInput label="해당 주주등 감자 주식수" value={form.cdOwnRedeemedShares} onChange={(v) => set({ cdOwnRedeemedShares: v })} placeholder="해당 주주등 감자 주식수" />
      ) : (
        <>
          <CurrencyInput label="총감자 주식수" value={form.cdTotalShares} onChange={(v) => set({ cdTotalShares: v })} placeholder="총감자 주식수" />
          <FieldCard label="대주주등 감자후 지분비율" hint="감자 후 대주주등의 지분율" unit="%">
            <DecimalInput value={form.cdMajorRatioPct} onChange={(v) => set({ cdMajorRatioPct: v })} />
          </FieldCard>
          <CurrencyInput label="대주주등 특수관계인 감자 주식수" value={form.cdRelatedShares} onChange={(v) => set({ cdRelatedShares: v })} placeholder="대주주등 특수관계인 감자 주식수" />
        </>
      )}
    </div>
  );
}

/** (10) 현물출자 §39의3 — 저가인수(①1호) / 고가인수(①2호) */
export function ContributionFields({ form, set }: Props) {
  const isHigh = form.conCaseType === "high";
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <RadioCardGroup
        name="con-case"
        tone="violet"
        layout="inline"
        value={form.conCaseType}
        onChange={(v) => set({ conCaseType: v })}
        options={[
          { value: "low", label: "저가 인수 (①1호)", testId: "con-case-low" },
          { value: "high", label: "고가 인수 (①2호)", testId: "con-case-high" },
        ]}
      />
      <CurrencyInput label="현물출자 전 1주당 평가가액" value={form.conPrePrice} onChange={(v) => set({ conPrePrice: v })} placeholder="현물출자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="현물출자 전 발행주식총수" value={form.conPreShares} onChange={(v) => set({ conPreShares: v })} placeholder="현물출자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.conNewPrice} onChange={(v) => set({ conNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="현물출자 주식수" value={form.conContributedShares} onChange={(v) => set({ conContributedShares: v })} placeholder="현물출자 주식수" />
      <CurrencyInput label={isHigh ? "인수 신주수" : "배정받은 신주수"} value={form.conAllocatedShares} onChange={(v) => set({ conAllocatedShares: v })} placeholder={isHigh ? "인수 신주수" : "배정받은 신주수"} />
      {isHigh ? (
        <FieldCard label="현물출자자 특수관계인 주주등 지분비율" hint="고가인수 시 비율 가중" unit="%">
          <DecimalInput value={form.conRelatedRatioPct} onChange={(v) => set({ conRelatedRatioPct: v })} />
        </FieldCard>
      ) : (
        <ToggleCard
          tone="violet"
          checked={form.conSmallImputation}
          onCheckedChange={(v) => set({ conSmallImputation: v })}
          title="소액주주 1인 의제 (§39의3②)"
          description="이익을 증여한 소액주주(1%·액면3억 미만)가 2명 이상이면 1명으로 보고 계산"
        />
      )}
    </div>
  );
}

/** (11) 전환사채등 §40 — 인수취득(①1호)·주식전환(①2호 가나다/라)·양도(①3호) */
export function ConvertibleBondFields({ form, set }: Props) {
  const ct = form.cbCaseType;
  const isConversion = ct === "conversion" || ct === "conversion_reverse";
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <RadioCardGroup
        name="cb-case"
        tone="rose"
        value={form.cbCaseType}
        onChange={(v) => set({ cbCaseType: v })}
        options={[
          { value: "acquisition", label: "인수·취득 (①1호)", testId: "cb-case-acquisition" },
          { value: "conversion", label: "주식전환 가·나·다목 (①2호)", testId: "cb-case-conversion" },
          { value: "conversion_reverse", label: "주식전환 라목 (①2호)", testId: "cb-case-conversion_reverse" },
          { value: "transfer", label: "양도 (①3호)", testId: "cb-case-transfer" },
        ]}
      />
      {(ct === "acquisition" || ct === "transfer") && (
        <CurrencyInput label="전환사채등 시가" value={form.cbMarketValue} onChange={(v) => set({ cbMarketValue: v })} placeholder="전환사채등 시가 (원)" />
      )}
      {ct === "acquisition" && (
        <CurrencyInput label="인수·취득가액" value={form.cbAcquisitionPrice} onChange={(v) => set({ cbAcquisitionPrice: v })} placeholder="인수·취득가액 (원)" />
      )}
      {ct === "transfer" && (
        <CurrencyInput label="양도가액" value={form.cbTransferPrice} onChange={(v) => set({ cbTransferPrice: v })} placeholder="양도가액 (원)" />
      )}
      {isConversion && (
        <>
          <CurrencyInput label="전환등 전 1주당 평가가액" value={form.cbPreConvPrice} onChange={(v) => set({ cbPreConvPrice: v })} placeholder="전환등 전 1주당 평가가액 (원)" />
          <CurrencyInput label="전환등 전 발행주식총수" value={form.cbPreConvShares} onChange={(v) => set({ cbPreConvShares: v })} placeholder="전환등 전 발행주식총수" />
          <CurrencyInput label="1주당 전환가액등" value={form.cbConversionPrice} onChange={(v) => set({ cbConversionPrice: v })} placeholder="1주당 전환가액등 (원)" />
          <CurrencyInput label="전환등 증가주식수 (교부받은 주식수)" value={form.cbIncreasedShares} onChange={(v) => set({ cbIncreasedShares: v })} placeholder="전환등 증가주식수" />
        </>
      )}
      {ct === "conversion" && (
        <>
          <CurrencyInput label="이자손실분" value={form.cbInterestLoss} onChange={(v) => set({ cbInterestLoss: v })} placeholder="이자손실분 (없으면 빈칸)" />
          <CurrencyInput label="인수 시 기과세 이익 (§30①1)" value={form.cbAcqGainPrior} onChange={(v) => set({ cbAcqGainPrior: v })} placeholder="기과세 이익 (없으면 빈칸)" />
        </>
      )}
      {ct === "conversion_reverse" && (
        <FieldCard label="특수관계인 전환 전 보유 지분비율" hint="라목 비율 가중" unit="%">
          <DecimalInput value={form.cbRelatedPreRatioPct} onChange={(v) => set({ cbRelatedPreRatioPct: v })} />
        </FieldCard>
      )}
    </div>
  );
}
