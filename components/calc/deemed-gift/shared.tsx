"use client";

/**
 * 증여로 보는 경우 (Phase 1) — 폼 상태·유형 선택·유형별 입력 필드.
 * DeemedGiftCalculator 오케스트레이터가 import.
 */

import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/calc/inputs/RadioCardGroup";

// ============================================================
// 폼 상태
// ============================================================

export interface DeemedFormState {
  giftDate: string;
  type: DeemedGiftType | "";
  // 보험금 §34
  insCaseType: "non_payer" | "gifted_premium";
  insProceeds: string;
  insTotalPremium: string;
  insRelevantPremium: string;
  insIsInheritance: boolean;
  // 저가양수·고가양도 §35
  bargMarketValue: string;
  bargPrice: string;
  bargRelated: boolean;
  bargType: "purchase" | "sale";
  bargJustifiable: boolean;
  bargExcluded: boolean;
  // 채무면제 §36
  debtForgiven: string;
  debtCompensation: string;
  debtOccurType: "creditor_waiver" | "third_party_assumption";
  // 부동산 무상사용 §37
  freeSubType: "free_use" | "collateral";
  freePropertyValue: string;
  freeLoanAmount: string;
  freeInterest: string;
  freeRelated: boolean;
  freeJustifiable: boolean;
  // 금전 무상대출 §41의4
  loanAmount: string;
  loanInterest: string;
  loanRelated: boolean;
  loanJustifiable: boolean;
}

export const INITIAL_DEEMED: DeemedFormState = {
  giftDate: "",
  type: "",
  insCaseType: "non_payer",
  insProceeds: "",
  insTotalPremium: "",
  insRelevantPremium: "",
  insIsInheritance: false,
  bargMarketValue: "",
  bargPrice: "",
  bargRelated: true,
  bargType: "purchase",
  bargJustifiable: false,
  bargExcluded: false,
  debtForgiven: "",
  debtCompensation: "",
  debtOccurType: "creditor_waiver",
  freeSubType: "free_use",
  freePropertyValue: "",
  freeLoanAmount: "",
  freeInterest: "",
  freeRelated: true,
  freeJustifiable: false,
  loanAmount: "",
  loanInterest: "",
  loanRelated: true,
  loanJustifiable: false,
};

export const DEEMED_TYPE_META: Record<
  DeemedGiftType,
  { label: string; law: string }
> = {
  insurance: { label: "보험금의 증여", law: "상증법 §34" },
  bargain_transfer: { label: "저가양수·고가양도", law: "상증법 §35" },
  debt_forgiveness: { label: "채무면제 등", law: "상증법 §36" },
  free_realestate: { label: "부동산 무상사용", law: "상증법 §37" },
  free_loan: { label: "금전 무상대출", law: "상증법 §41의4" },
};

type SetFn = (patch: Partial<DeemedFormState>) => void;

// ============================================================
// 유형 선택 (Step ①)
// ============================================================

const TYPE_OPTIONS: RadioCardOption<DeemedGiftType>[] = [
  { value: "insurance", label: "보험금의 증여", description: "상증법 §34 — 수령인 ≠ 보험료 납부자 등", testId: "deemed-type-insurance" },
  { value: "bargain_transfer", label: "저가양수·고가양도", description: "상증법 §35 — 특수/비특수 30%·3억 공제", testId: "deemed-type-bargain_transfer" },
  { value: "debt_forgiveness", label: "채무면제 등", description: "상증법 §36 — 면제·인수·변제 이익", testId: "deemed-type-debt_forgiveness" },
  { value: "free_realestate", label: "부동산 무상사용", description: "상증법 §37 — 무상사용(5년 현가합)·무상담보", testId: "deemed-type-free_realestate" },
  { value: "free_loan", label: "금전 무상대출", description: "상증법 §41의4 — 적정이자율 4.6% 차액", testId: "deemed-type-free_loan" },
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
      name="deemed-type"
      tone="rose"
      value={value}
      onChange={onChange}
      options={TYPE_OPTIONS}
    />
  );
}

// ============================================================
// 유형별 입력 (Step ②)
// ============================================================

export function DeemedInputFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  switch (form.type) {
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
    default:
      return null;
  }
}

function InsuranceFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <RadioCardGroup
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
      <ToggleCard
        tone="violet"
        checked={form.bargRelated}
        onCheckedChange={(v) => set({ bargRelated: v })}
        title="특수관계인 간 거래 (§35①)"
        description="끄면 특수관계인 외 거래 (§35②) — 공제 3억 고정"
      />
      <RadioCardGroup
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
          tone="amber"
          checked={form.bargJustifiable}
          onCheckedChange={(v) => set({ bargJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§35②)"
          description="비특수관계인 간 정당한 사유가 있으면 미적용"
        />
      )}
      <ToggleCard
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
      <CurrencyInput label="보상(지급)액" value={form.debtCompensation} onChange={(v) => set({ debtCompensation: v })} placeholder="보상액 (없으면 빈칸)" />
    </div>
  );
}

function FreeRealEstateFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <RadioCardGroup
        name="free-subtype"
        tone="violet"
        layout="inline"
        value={form.freeSubType}
        onChange={(v) => set({ freeSubType: v })}
        options={[
          { value: "free_use", label: "무상 사용 (§37①)", testId: "free-subtype-free_use" },
          { value: "collateral", label: "무상 담보 (§37②)", testId: "free-subtype-collateral" },
        ]}
      />
      {form.freeSubType === "free_use" ? (
        <CurrencyInput label="부동산 가액" value={form.freePropertyValue} onChange={(v) => set({ freePropertyValue: v })} hint="5년 현가합이 1억 이상이면 과세 (연 2%·할인율 10%)" placeholder="부동산 가액 (원)" />
      ) : (
        <>
          <CurrencyInput label="차입금" value={form.freeLoanAmount} onChange={(v) => set({ freeLoanAmount: v })} hint="차입이익(차입금×4.6%−이자)이 1천만 이상이면 과세" placeholder="차입금 (원)" />
          <CurrencyInput label="실제 지급이자" value={form.freeInterest} onChange={(v) => set({ freeInterest: v })} placeholder="실제 지급이자 (없으면 빈칸)" />
        </>
      )}
      <ToggleCard
        tone="violet"
        checked={form.freeRelated}
        onCheckedChange={(v) => set({ freeRelated: v })}
        title="특수관계인 간 거래"
        description="끄면 §37③ — 정당한 사유 없는 경우만 과세"
      />
      {!form.freeRelated && (
        <ToggleCard
          tone="amber"
          checked={form.freeJustifiable}
          onCheckedChange={(v) => set({ freeJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§37③)"
        />
      )}
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
        tone="violet"
        checked={form.loanRelated}
        onCheckedChange={(v) => set({ loanRelated: v })}
        title="특수관계인 간 거래"
        description="끄면 §41의4③ — 정당한 사유 없는 경우만 과세"
      />
      {!form.loanRelated && (
        <ToggleCard
          tone="amber"
          checked={form.loanJustifiable}
          onCheckedChange={(v) => set({ loanJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§41의4③)"
        />
      )}
    </div>
  );
}
