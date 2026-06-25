"use client";

/**
 * 증여로 보는 경우 (Phase 1) — 폼 상태·유형 선택·유형별 입력 필드.
 * DeemedGiftCalculator 오케스트레이터가 import.
 */

import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/calc/inputs/RadioCardGroup";
import {
  RELATED_PARTY_SCOPE_TITLE,
  RELATED_PARTY_SCOPE_SUMMARY,
  RELATED_PARTY_SCOPE_DETAILS,
  RELATED_PARTY_SCOPE_LEGAL_BASIS,
} from "./related-party-scope";
import {
  MergerFields,
  CapitalIncreaseFields,
  CapitalDecreaseFields,
  ContributionFields,
  ConvertibleStockFields,
  ConvertibleBondFields,
} from "./capital-forms";
import { FreeRealEstateFields } from "./free-realestate-form";
import { AcquisitionFundFields, NomineeTrustFields } from "./presumption-forms";
import {
  ExcessDividendFields,
  ListingGainFields,
  PropertyServiceUseFields,
  OrgChangeFields,
  ValueIncreaseFields,
  SpecificCorpFields,
} from "./other-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "./deemed-form-state";

// ============================================================
// 폼 상태 — 타입·초기값은 deemed-form-state.ts로 분리(800줄 정책). 하위호환 re-export.
// ============================================================
export type { DeemedFormState };
export type { CdShareholderRow } from "./deemed-form-state";
export { INITIAL_DEEMED };

export const DEEMED_TYPE_META: Record<
  DeemedGiftType,
  { label: string; law: string }
> = {
  trust_benefit: { label: "신탁이익의 증여", law: "상증법 §33" },
  insurance: { label: "보험금의 증여", law: "상증법 §34" },
  bargain_transfer: { label: "저가양수·고가양도", law: "상증법 §35" },
  debt_forgiveness: { label: "채무면제 등", law: "상증법 §36" },
  free_realestate: { label: "부동산 무상사용", law: "상증법 §37" },
  free_loan: { label: "금전 무상대출", law: "상증법 §41의4" },
  // Phase 2 자본거래 (엔진 구현 — UI 입력폼은 후속)
  merger: { label: "합병에 따른 이익", law: "상증법 §38" },
  capital_increase: { label: "증자에 따른 이익", law: "상증법 §39" },
  capital_decrease: { label: "감자에 따른 이익", law: "상증법 §39의2" },
  contribution: { label: "현물출자에 따른 이익", law: "상증법 §39의3" },
  convertible_stock: { label: "전환주식에 따른 이익", law: "상증법 §39①3호" },
  convertible_bond: { label: "전환사채에 따른 이익", law: "상증법 §40" },
  // Phase 3 추정·의제
  acquisition_fund_presumption: { label: "재산취득자금 증여추정", law: "상증법 §45" },
  nominee_trust: { label: "명의신탁 증여의제", law: "상증법 §45의2" },
  // Phase 3 기타이익·자본거래연계·법인
  excess_dividend: { label: "초과배당에 따른 이익", law: "상증법 §41의2" },
  listing_gain: { label: "상장·합병상장 이익", law: "상증법 §41의3·§41의5" },
  property_service_use: { label: "재산사용·용역제공 이익", law: "상증법 §42" },
  org_change: { label: "법인 조직변경 이익", law: "상증법 §42의2" },
  value_increase: { label: "재산취득 후 가치증가 이익", law: "상증법 §42의3" },
  specific_corp: { label: "특정법인과의 거래 이익", law: "상증법 §45의5" },
};

type SetFn = (patch: Partial<DeemedFormState>) => void;

// ============================================================
// 유형 선택 (Step ①)
// ============================================================

const TYPE_OPTIONS: RadioCardOption<DeemedGiftType>[] = [
  { value: "trust_benefit", label: "신탁이익의 증여", description: "상증법 §33 — 원본·수익 권리 현재가치 (령§61·연 3%)", testId: "deemed-type-trust_benefit" },
  { value: "insurance", label: "보험금의 증여", description: "상증법 §34 — 수령인 ≠ 보험료 납부자 등", testId: "deemed-type-insurance" },
  { value: "bargain_transfer", label: "저가양수·고가양도", description: "상증법 §35 — 특수/비특수 30%·3억 공제", testId: "deemed-type-bargain_transfer" },
  { value: "debt_forgiveness", label: "채무면제 등", description: "상증법 §36 — 면제·인수·변제 이익", testId: "deemed-type-debt_forgiveness" },
  { value: "free_realestate", label: "부동산 무상사용", description: "상증법 §37 — 무상사용(5년 현가합)·무상담보", testId: "deemed-type-free_realestate" },
  { value: "free_loan", label: "금전 무상대출", description: "상증법 §41의4 — 적정이자율 4.6% 차액", testId: "deemed-type-free_loan" },
  { value: "merger", label: "합병에 따른 이익", description: "상증법 §38 — 주식교부·주식 외 재산교부", testId: "deemed-type-merger" },
  { value: "capital_increase", label: "증자에 따른 이익", description: "상증법 §39 — 저가/고가발행 (실권주·제3자·초과)", testId: "deemed-type-capital_increase" },
  { value: "convertible_stock", label: "전환주식에 따른 이익", description: "상증법 §39①3호 — 전환 시점 − 발행 시점 이익", testId: "deemed-type-convertible_stock" },
  { value: "capital_decrease", label: "감자에 따른 이익", description: "상증법 §39의2 — 저가/고가 소각", testId: "deemed-type-capital_decrease" },
  { value: "contribution", label: "현물출자에 따른 이익", description: "상증법 §39의3 — 저가/고가 인수", testId: "deemed-type-contribution" },
  { value: "convertible_bond", label: "전환사채에 따른 이익", description: "상증법 §40 — 인수취득·주식전환·양도", testId: "deemed-type-convertible_bond" },
  { value: "acquisition_fund_presumption", label: "재산취득자금 증여추정", description: "상증법 §45 — 미입증 취득자금·채무상환", testId: "deemed-type-acquisition_fund_presumption" },
  { value: "nominee_trust", label: "명의신탁 증여의제", description: "상증법 §45의2 — 명의신탁 재산가액", testId: "deemed-type-nominee_trust" },
  { value: "excess_dividend", label: "초과배당에 따른 이익", description: "상증법 §41의2 — 초과배당금액 − 소득세상당액", testId: "deemed-type-excess_dividend" },
  { value: "listing_gain", label: "상장·합병상장 이익", description: "상증법 §41의3·§41의5 — 정산기준일 평가차익", testId: "deemed-type-listing_gain" },
  { value: "property_service_use", label: "재산사용·용역제공 이익", description: "상증법 §42 — 무상·저가·고가 사용/용역", testId: "deemed-type-property_service_use" },
  { value: "org_change", label: "법인 조직변경 이익", description: "상증법 §42의2 — 소유지분·평가액 변동", testId: "deemed-type-org_change" },
  { value: "value_increase", label: "재산취득 후 가치증가 이익", description: "상증법 §42의3 — 개발·상장 등 가치증가", testId: "deemed-type-value_increase" },
  { value: "specific_corp", label: "특정법인과의 거래 이익", description: "상증법 §45의5 — 지배주주 특수관계법인 거래", testId: "deemed-type-specific_corp" },
];

export function DeemedTypeSelector({
  value,
  onChange,
}: {
  value: DeemedGiftType | "";
  onChange: (v: DeemedGiftType) => void;
}) {
  return (
    <RadioCardGroup
      lawLinks="상증법"
      name="deemed-type"
      tone="rose"
      value={value}
      onChange={onChange}
      options={TYPE_OPTIONS}
      columns={2}
    />
  );
}

// ============================================================
// 유형별 입력 (Step ②)
// ============================================================

export function DeemedInputFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  switch (form.type) {
    case "trust_benefit":
      return <TrustBenefitFields form={form} set={set} />;
    case "insurance":
      return <InsuranceFields form={form} set={set} />;
    case "bargain_transfer":
      return <BargainFields form={form} set={set} />;
    case "debt_forgiveness":
      return <DebtFields form={form} set={set} />;
    case "free_realestate":
      return <FreeRealEstateFields form={form} set={set} />;
    case "free_loan":
      return <FreeLoanFields form={form} set={set} />;
    case "merger":
      return <MergerFields form={form} set={set} />;
    case "capital_increase":
      return <CapitalIncreaseFields form={form} set={set} />;
    case "capital_decrease":
      return <CapitalDecreaseFields form={form} set={set} />;
    case "contribution":
      return <ContributionFields form={form} set={set} />;
    case "convertible_stock":
      return <ConvertibleStockFields form={form} set={set} />;
    case "convertible_bond":
      return <ConvertibleBondFields form={form} set={set} />;
    case "acquisition_fund_presumption":
      return <AcquisitionFundFields form={form} set={set} />;
    case "nominee_trust":
      return <NomineeTrustFields form={form} set={set} />;
    case "excess_dividend":
      return <ExcessDividendFields form={form} set={set} />;
    case "listing_gain":
      return <ListingGainFields form={form} set={set} />;
    case "property_service_use":
      return <PropertyServiceUseFields form={form} set={set} />;
    case "org_change":
      return <OrgChangeFields form={form} set={set} />;
    case "value_increase":
      return <ValueIncreaseFields form={form} set={set} />;
    case "specific_corp":
      return <SpecificCorpFields form={form} set={set} />;
    default:
      return null;
  }
}

function TrustBenefitFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <RadioCardGroup
        lawLinks="상증법"
        name="tb-beneficiary"
        tone="rose"
        value={form.tbBeneficiaryType}
        onChange={(v) => set({ tbBeneficiaryType: v })}
        options={[
          { value: "same", label: "원본·수익 동일 수익자", description: "§61①1호 — 수익권 현가합 + 원본", testId: "tb-beneficiary-same" },
          { value: "diff_principal", label: "원본만 수익", description: "§61①2호가목 — 신탁재산 − 수익권", testId: "tb-beneficiary-diff_principal" },
          { value: "diff_income", label: "수익만 수익", description: "§61①2호나목 — 수익권 현가합", testId: "tb-beneficiary-diff_income" },
        ]}
      />
      <CurrencyInput label="신탁재산(원본) 가액" value={form.tbPropertyValue} onChange={(v) => set({ tbPropertyValue: v })} placeholder="신탁재산 가액 (원)" />
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        checked={form.tbYieldDetermined}
        onCheckedChange={(v) => set({ tbYieldDetermined: v })}
        title="신탁 수익률 확정"
        description="끄면 미확정 → 원본 × 3% 추산 (상증칙 §19의2②)"
      >
        <div className="space-y-1">
          <label className="block text-xs text-gray-600 dark:text-gray-400">신탁 수익률 (%)</label>
          <DecimalInput value={form.tbYieldRatePct} onChange={(v) => set({ tbYieldRatePct: v })} placeholder="신탁 수익률 (%)" />
        </div>
      </ToggleCard>
      <div className="space-y-1">
        <label className="block text-xs text-gray-600 dark:text-gray-400">원천징수세율 (%)</label>
        <DecimalInput value={form.tbWithholdingPct} onChange={(v) => set({ tbWithholdingPct: v })} placeholder="원천징수세율 (%)" />
      </div>

      {/* 증여시기 분리 (§33①1·2호 별개 증여 · §25①) */}
      <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
        <p className="text-xs font-semibold text-violet-700">증여시기 (원본·수익 별개 — §33①·§25①)</p>
        {form.tbBeneficiaryType !== "diff_principal" && (
          <div className="space-y-1" data-testid="tb-income-gift-date">
            <label className="block text-xs text-violet-700">수익권 증여시기 (수익 최초지급일 등)</label>
            <DateInput value={form.tbIncomeGiftDate} onChange={(v) => set({ tbIncomeGiftDate: v })} />
          </div>
        )}
        {form.tbBeneficiaryType !== "diff_income" && (
          <div className="space-y-1" data-testid="tb-principal-gift-date">
            <label className="block text-xs text-violet-700">원본권 증여시기 (원본 실제지급일 — 예: 신탁 종료)</label>
            <DateInput value={form.tbPrincipalGiftDate} onChange={(v) => set({ tbPrincipalGiftDate: v })} />
          </div>
        )}
        <RadioCardGroup
          name="tb-gift-timing"
          tone="violet"
          layout="inline"
          value={form.tbGiftTiming}
          onChange={(v) => set({ tbGiftTiming: v })}
          options={[
            { value: "first_installment", label: "분할 최초지급일", testId: "tb-timing-first" },
            { value: "actual", label: "실제 지급일", testId: "tb-timing-actual" },
            { value: "agreed", label: "약정일", testId: "tb-timing-agreed" },
            { value: "decedent_death", label: "위탁자 사망일", testId: "tb-timing-death" },
          ]}
        />
        <p className="text-xs text-muted-foreground">증여시기 종류(§25①) — 위 날짜의 의미를 선택.</p>
      </div>

      {/* 정기금 유형 (§61②→§62) */}
      <RadioCardGroup
        lawLinks="상증법"
        name="tb-annuity"
        tone="sky"
        layout="inline"
        value={form.tbAnnuityType}
        onChange={(v) => set({ tbAnnuityType: v })}
        options={[
          { value: "finite", label: "유기정기금", description: "지급 횟수 확정", testId: "tb-annuity-finite" },
          { value: "perpetual", label: "무기정기금", description: "§62 2호 — 20년", testId: "tb-annuity-perpetual" },
          { value: "lifetime", label: "종신정기금", description: "§62 3호 — 기대여명", testId: "tb-annuity-lifetime" },
        ]}
      />
      {form.tbAnnuityType === "finite" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-xs text-gray-600 dark:text-gray-400">수익 분할 횟수 (회)</label>
            <DecimalInput value={form.tbInstallments} onChange={(v) => set({ tbInstallments: v })} placeholder="수익 지급 횟수 (회)" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-gray-600 dark:text-gray-400">회차 간격 (연)</label>
            <DecimalInput value={form.tbIntervalYears} onChange={(v) => set({ tbIntervalYears: v })} placeholder="회차 간 연수 (기본 1)" />
          </div>
        </div>
      )}
      {form.tbAnnuityType === "lifetime" && (
        <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
          <p className="text-xs font-semibold text-sky-700">종신 기대여명 (§62 3호 — 2023 생명표, 소수점 버림)</p>
          <RadioCardGroup
            name="tb-gender"
            tone="sky"
            layout="inline"
            value={form.tbBeneficiaryGender}
            onChange={(v) => set({ tbBeneficiaryGender: v })}
            options={[
              { value: "male", label: "남성", testId: "tb-gender-male" },
              { value: "female", label: "여성", testId: "tb-gender-female" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-sky-700">수익자 연령 (만)</label>
              <DecimalInput value={form.tbBeneficiaryAge} onChange={(v) => set({ tbBeneficiaryAge: v })} placeholder="만 나이" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-sky-700">기대여명 직접 입력 (선택, 연)</label>
              <DecimalInput value={form.tbExpectedRemainingYears} onChange={(v) => set({ tbExpectedRemainingYears: v })} placeholder="미입력 시 생명표 조회" />
            </div>
          </div>
        </div>
      )}

      <CurrencyInput label="해지·철회 일시금 (선택)" value={form.tbSurrenderValue} onChange={(v) => set({ tbSurrenderValue: v })} hint="평가액보다 크면 일시금으로 평가 (§61① 단서)" />
    </div>
  );
}

function InsuranceFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <RadioCardGroup
        lawLinks="상증법"
        name="ins-case"
        tone="sky"
        layout="inline"
        value={form.insCaseType}
        onChange={(v) => set({ insCaseType: v })}
        options={[
          { value: "non_payer", label: "수령인 ≠ 보험료 납부자 (§34①1호)", testId: "ins-case-non_payer" },
          { value: "gifted_premium", label: "증여받은 재산으로 보험료 납부 (§34①2호)", testId: "ins-case-gifted_premium" },
        ]}
      />
      <CurrencyInput label="보험금" value={form.insProceeds} onChange={(v) => set({ insProceeds: v })} placeholder="보험금 (원)" />
      <CurrencyInput label="납부보험료 총액" value={form.insTotalPremium} onChange={(v) => set({ insTotalPremium: v })} placeholder="납부보험료 총액 (원)" />
      <CurrencyInput
        label={form.insCaseType === "non_payer" ? "수령인 외의 자가 납부한 보험료" : "증여받은 재산으로 납부한 보험료"}
        value={form.insRelevantPremium}
        onChange={(v) => set({ insRelevantPremium: v })}
        placeholder="관련 보험료 (원)"
      />
      <ToggleCard
        lawLinks="상증법"
        tone="rose"
        checked={form.insIsInheritance}
        onCheckedChange={(v) => set({ insIsInheritance: v })}
        title="상속재산으로 보는 보험금 (§34②)"
        description="§8에 따라 상속재산에 해당하면 증여세 미적용"
      />
    </div>
  );
}

function BargainFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex justify-end">
        <TaxHelp
          triggerLabel="특수관계인 범위 조회"
          title={RELATED_PARTY_SCOPE_TITLE}
          summary={RELATED_PARTY_SCOPE_SUMMARY}
          details={RELATED_PARTY_SCOPE_DETAILS}
          legalBasis={RELATED_PARTY_SCOPE_LEGAL_BASIS}
        />
      </div>
      <ToggleCard
        lawLinks="상증법"
        tone="violet"
        checked={form.bargRelated}
        onCheckedChange={(v) => set({ bargRelated: v })}
        title="특수관계인 간 거래 (§35①)"
        description="끄면 특수관계인 외 거래 (§35②) — 공제 3억 고정"
      />
      <RadioCardGroup
        lawLinks="상증법"
        name="barg-type"
        tone="emerald"
        layout="inline"
        value={form.bargType}
        onChange={(v) => set({ bargType: v })}
        options={[
          { value: "purchase", label: "저가 양수", testId: "barg-type-purchase" },
          { value: "sale", label: "고가 양도", testId: "barg-type-sale" },
        ]}
      />
      <CurrencyInput label="시가" value={form.bargMarketValue} onChange={(v) => set({ bargMarketValue: v })} placeholder="시가 (원)" />
      <CurrencyInput label="거래대가" value={form.bargPrice} onChange={(v) => set({ bargPrice: v })} placeholder="거래대가 (원)" />
      {!form.bargRelated && (
        <ToggleCard
          lawLinks="상증법"
          tone="amber"
          checked={form.bargJustifiable}
          onCheckedChange={(v) => set({ bargJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§35②)"
          description="비특수관계인 간 정당한 사유가 있으면 미적용"
        />
      )}
      <ToggleCard
        lawLinks="상증법"
        tone="rose"
        checked={form.bargExcluded}
        onCheckedChange={(v) => set({ bargExcluded: v })}
        title="과세제외 거래 (§35③)"
        description="법인세법 §52② 시가 해당·거래소 상장 시가거래 등"
      />
    </div>
  );
}

function DebtFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <RadioCardGroup
        lawLinks="상증법"
        name="debt-occur"
        tone="amber"
        layout="inline"
        value={form.debtOccurType}
        onChange={(v) => set({ debtOccurType: v })}
        options={[
          { value: "creditor_waiver", label: "채권자의 면제 (의사표시일)", testId: "debt-occur-creditor_waiver" },
          { value: "third_party_assumption", label: "제3자 인수·변제 (계약체결일)", testId: "debt-occur-third_party_assumption" },
        ]}
      />
      <CurrencyInput label="면제·인수·변제 채무액" value={form.debtForgiven} onChange={(v) => set({ debtForgiven: v })} placeholder="채무액 (원)" />
      <CurrencyInput label="보상(지급)액" value={form.debtCompensation} onChange={(v) => set({ debtCompensation: v })} />
    </div>
  );
}


function FreeLoanFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <CurrencyInput label="대출금액" value={form.loanAmount} onChange={(v) => set({ loanAmount: v })} hint="증여이익(대출금×4.6%−실제이자)이 1천만 이상이면 과세" placeholder="대출금액 (원)" />
      <CurrencyInput label="실제 지급이자" value={form.loanInterest} onChange={(v) => set({ loanInterest: v })} placeholder="실제 지급이자 (무이자면 빈칸)" />
      <p className="text-xs text-muted-foreground">적정이자율은 증여일 기준 자동 적용 (2016.3.7~ 연 4.6%)</p>
      <ToggleCard
        lawLinks="상증법"
        tone="violet"
        checked={form.loanRelated}
        onCheckedChange={(v) => set({ loanRelated: v })}
        title="특수관계인 간 거래"
        description="끄면 §41의4③ — 정당한 사유 없는 경우만 과세"
      />
      {!form.loanRelated && (
        <ToggleCard
          lawLinks="상증법"
          tone="amber"
          checked={form.loanJustifiable}
          onCheckedChange={(v) => set({ loanJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§41의4③)"
        />
      )}
    </div>
  );
}
