"use client";

/**
 * gift-tax-form-shared.tsx
 *
 * GiftTaxForm 공유 타입·상수·헬퍼·Step 컴포넌트 (800줄 정책 분리).
 * GiftTaxForm.tsx 오케스트레이터가 import.
 */

import { useMemo, useState } from "react";

import type {
  EstateItem,
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import type { AppraisalFeeFormFields } from "@/lib/calc/appraisal-fee-form";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { CollapsibleEstateGroup } from "@/components/calc/inheritance/CollapsibleEstateGroup";
import { sumEstateItemsValuation } from "@/lib/stores/inheritance-summary";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { INITIAL_APPRAISAL_FEE_FIELDS } from "@/lib/calc/appraisal-fee-form";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { DoneeMinorField } from "@/components/calc/gift/DoneeMinorField";

// ============================================================
// 폼 상태 타입
// ============================================================

export interface FormState extends AppraisalFeeFormFields {
  // Step 0
  giftDate: string;
  donorRelation: DonorRelation;
  /** Phase A: 증여자 관계 (동일인 §47 합산 그룹화 + §57 적용 판정) */
  donor: GiftDonorRelation;
  /** G-M2b: isGenerationSkip은 buildInput에서 donor 파생으로 자동 설정됨.
   *  UI 토글 제거됨 — donor=grandparent이면 엔진에서 세대생략 적용.
   *  이 필드는 예외 케이스(manually override)를 위해 FormState에 보존하나
   *  buildInput에서 donor === "grandparent"로 덮어씀.
   */
  isGenerationSkip: boolean;
  isMinorDonee: boolean;
  /**
   * 수증자 주민등록번호 — 앞 7자리로 미성년 자동판정(증여일 기준 만 19세 미만).
   * 클라이언트 derive 전용(엔진 미전송)·체크섬 검증 생략. 파싱불가/미입력 시 isMinorDonee 수동 fallback.
   * optional — 기존 신규 필드 패턴(donorPaysGiftTax 등) 일관. INITIAL_FORM은 "".
   */
  doneeResidentNumber?: string;
  /**
   * §57① 단서 — 증여자(조부모)의 최근친 직계비속(부·모)이 이미 사망하여
   * 그 사망자의 최근친 직계비속(손자녀)이 증여받는 경우 세대생략 할증 배제.
   * donor === "grandparent" 일 때만 UI 노출·API 전송. 기타 donor이면 undefined로 strip.
   */
  isSubstituteGift: boolean;
  // Step 1
  giftItems: EstateItem[];
  stockItems: EstateItem[];
  // Step 2
  exemptionItems: ExemptionCheckedItem[];
  priorGifts: PriorGift[];
  // Step 3
  marriageExemption: string;
  birthExemption: string;
  priorUsedDeduction: string;
  /**
   * §53의2③ 수증자 통산 기공제액 — 과거 다른 증여에서 이미 공제받은 혼인·출산 공제 합계.
   * CurrencyInput 규약에 따라 string 타입. parseAmount → number | undefined 변환은 API 변환 ④에서.
   */
  priorUsedMarriageBirthDeduction: string;
  /**
   * 상증령 §46①2호 동시증여 안분 — 같은 날 *다른 동일인 그룹*으로부터 받은 증여.
   * 각 항목 = 다른 동일인 그룹의 합산 과세가액(원, CurrencyInput string) + 그 그룹의 donorRelation.
   * 같은 동일인(부·모)은 현재 신고 증여재산에 이미 합산 → 여기 넣지 않음.
   * 3-state: undefined=동시증여 없음 / []=ON 빈 / [...]=데이터.
   */
  simultaneousGifts?: Array<{ donorRelation: DonorRelation; taxableValue: string }>;
  isFiledOnTime: boolean;
  foreignTaxPaid: string;
  specialTreatment: "" | "startup" | "family_business";
  /** 창업자금 §30의5④ — 투자 완료 여부 (startup 선택 시 노출) */
  startupInvestmentCompleted: boolean;
  /** 창업자금 §30의5① — 10명 이상 신규 고용 여부 (한도 50억 → 100억, startup 선택 시 노출) */
  startupNewHiresAtLeast10: boolean;
  /**
   * 가업승계 §30의6① — 부모 가업 영위기간(년). 한도 분기: 10년 이상 300억 / 20년 이상 400억 / 30년 이상 600억.
   * DecimalInput 규약 string. 빈값 → 엔진 기본 10년(300억 한도). family_business 선택 시 노출.
   */
  familyBusinessYears: string;
  // 분납 (Step3 끝, 상증법 §70②) — 결정세액 미영향 투영, 별지10호 ㊼ 연동
  /** 분납 신청 여부 */
  splitPaymentEnabled: boolean;
  /** 분납 희망액 (원, 빈 문자열 허용 — 미입력 시 최대 분납액) */
  splitPaymentAmount: string;
  /**
   * §36 채무면제 — 증여자가 수증자의 증여세를 대납(代納)하는 경우.
   * true 시 gross-up 순환계산 적용. (UI 위젯은 UI senior 담당)
   */
  donorPaysGiftTax?: boolean;
  /**
   * §4의2⑥ 연대납세의무 — true 시 재차증여 아님 → gross-up 미적용.
   * donorPaysGiftTax=true 이어야 유효. (UI 위젯은 UI senior 담당)
   */
  donorHasJointLiability?: boolean;
  /**
   * §36 부분 대납 — 수증자 본인이 직접 납부하는 증여세액(원).
   * 증여자는 (총세액 − 이 금액) 부족분만 대납. 미입력/""/0 = 전액 대납(기존 동작).
   * donorPaysGiftTax=true && donorHasJointLiability!==true 일 때만 유효.
   */
  doneePaidGiftTax?: string;
}

export const INITIAL_FORM: FormState = {
  giftDate: "",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  isGenerationSkip: false,
  isMinorDonee: false,
  doneeResidentNumber: "",
  isSubstituteGift: false,
  giftItems: [],
  stockItems: [],
  exemptionItems: [],
  priorGifts: [],
  marriageExemption: "",
  birthExemption: "",
  priorUsedDeduction: "",
  priorUsedMarriageBirthDeduction: "",
  isFiledOnTime: true,
  foreignTaxPaid: "",
  specialTreatment: "",
  startupInvestmentCompleted: false,
  startupNewHiresAtLeast10: false,
  familyBusinessYears: "",
  splitPaymentEnabled: false,
  splitPaymentAmount: "",
  donorPaysGiftTax: false,
  donorHasJointLiability: false,
  doneePaidGiftTax: "",
  ...INITIAL_APPRAISAL_FEE_FIELDS,
};

export const STEPS = ["증여 정보", "증여재산", "비과세·합산", "공제·세액공제"];

// ============================================================
// 관계 레이블
// ============================================================

export const RELATION_LABELS: Record<DonorRelation, string> = {
  spouse: "배우자 (6억 공제)",
  lineal_ascendant_adult: "직계존속 — 성인 수증자 (5천만원)",
  lineal_ascendant_minor: "직계존속 — 미성년 수증자 (2천만원)",
  lineal_descendant: "직계비속 (5천만원)",
  other_relative: "기타 친족 (1천만원)",
};

// Phase A: 증여자 관계 (8 enum / 7 그룹) — UI 셀렉트 옵션
export const DONOR_LABELS: Record<GiftDonorRelation, string> = {
  father: "부",
  mother: "모",
  grandparent: "조부모",
  spouse: "배우자",
  lineal_descendant: "직계비속",
  sibling: "형제자매",
  other_relative: "기타친족",
  other: "기타",
};

export const DONOR_OPTIONS: GiftDonorRelation[] = [
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
];

// G-M3: donor → donorRelation 자동 도출. 사전증여(GiftRowEditor) prefill 공용을 위해
// lib 단일 출처로 이동(순환 import 회피). 상단 import로 내부 사용 + 하위호환 재노출.
export { deriveDonorRelation };

// API 에러 상세화 — 800줄 정책 준수를 위해 분리 (gift/gift-api-error-format.ts)
export { formatGiftApiError } from "@/components/calc/gift/gift-api-error-format";

// ============================================================
// 단계별 유효성 검사 (gift-tax-form-validate.ts로 분리, 800줄 정책)
// ============================================================

export { validateStep } from "@/components/calc/gift-tax-form-validate";

// ============================================================
// Step 0 — 증여 기본 정보
// ============================================================

export function Step0({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        증여의 기본 정보를 입력하세요.
      </p>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          증여일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={form.giftDate}
          onChange={(v) => set({ giftDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          신고기한(3개월) · 10년 합산 기준일
        </p>
      </div>

      {/* Phase A: 증여자 (donor) — §47 합산 그룹 + §57 적용 판정
          G-M3: donor 변경 시 donorRelation 자동 도출 (단일 진실화) */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            §47
          </span>
          <p className="text-xs font-semibold text-violet-700">
            증여자 (동일인 합산 그룹 + §57 적용 판정)
          </p>
        </div>
        <select
          value={form.donor}
          onChange={(e) => {
            const newDonor = e.target.value as GiftDonorRelation;
            // G-M3: donorRelation 자동 도출 — 혼인·출산 공제 초기화(직계존속 외)
            const newDonorRelation = deriveDonorRelation(newDonor, form.isMinorDonee);
            const isAscendant =
              newDonorRelation === "lineal_ascendant_adult" ||
              newDonorRelation === "lineal_ascendant_minor";
            set({
              donor: newDonor,
              donorRelation: newDonorRelation,
              ...(!isAscendant ? { marriageExemption: "", birthExemption: "" } : {}),
            });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {DONOR_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DONOR_LABELS[d]}
            </option>
          ))}
        </select>
        {/* G-M2b: 세대생략 §57은 donor=grandparent이면 자동 적용됨을 안내 */}
        {form.donor === "grandparent" && (
          <p className="text-[11px] text-rose-700 bg-rose-50/70 rounded px-2 py-1">
            조부모→손자녀 증여 — 세대생략 §57 할증 30% (또는 미성년+20억 초과 시 40%) 자동 적용됩니다.
          </p>
        )}
        {/* §57① 단서 — donor=grandparent 선택 시에만 노출 */}
        {form.donor === "grandparent" && (
          <ToggleCard
            tone="rose"
            title="§57① 단서 — 증여자의 최근친 직계비속 사망 (할증 배제)"
            description="증여자(조부모)의 최근친 직계비속(부·모)이 이미 사망하여, 그 사망자의 최근친 직계비속(손자녀)이 증여받은 경우. 이 경우 세대생략 할증(30%·40%)이 적용되지 않습니다. (상증법 §57① 단서)"
            checked={form.isSubstituteGift}
            onCheckedChange={(v) => set({ isSubstituteGift: v })}
          />
        )}
      </div>

      {/* G-M2: 수증자 미성년 — 주민번호 자동판정(증여일 기준 만19세) 우선 + 수동 토글 fallback(D-1).
          donor=grandparent 포함 직계존속 전체 노출 (§57① 40% 판정: 미성년 AND 20억 초과) */}
      {(form.donor === "father" ||
        form.donor === "mother" ||
        form.donor === "grandparent") && (
        <DoneeMinorField
          doneeResidentNumber={form.doneeResidentNumber ?? ""}
          giftDate={form.giftDate}
          isMinorDonee={form.isMinorDonee}
          onResidentNumberChange={(v) => set({ doneeResidentNumber: v })}
          onMinorToggle={(v) => {
            // G-M3: 수동 토글 시 donorRelation 재도출 (채택안 A — store set 유지)
            const newDonorRelation = deriveDonorRelation(form.donor, v);
            set({ isMinorDonee: v, donorRelation: newDonorRelation });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Step 1 — 증여재산 평가
// ============================================================

/** 섹션 헤더 우측 "+ 추가" 버튼 — 상속세 Step1Estate의 SectionAddButton과 동형 */
function SectionAddButton({
  onClick,
  label,
  testId,
}: {
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="shrink-0 rounded-md border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-200 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
    >
      + {label}
    </button>
  );
}

export function Step1({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  // 추가 패널 열림 상태 — 헤더 "+추가" 버튼(controlled)이 토글
  const [giftAddOpen, setGiftAddOpen] = useState(false);
  const [stockAddOpen, setStockAddOpen] = useState(false);
  // 그룹별 합계 — 접힘 헤더 요약용 (상속세와 동일 valuation 로직 공유)
  const giftTotal = useMemo(
    () => sumEstateItemsValuation(form.giftItems, form.giftDate),
    [form.giftItems, form.giftDate],
  );
  const stockTotal = useMemo(
    () => sumEstateItemsValuation(form.stockItems, form.giftDate),
    [form.stockItems, form.giftDate],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        증여하는 재산을 모두 입력하세요. 주식은 아래 별도 섹션에 입력합니다.
      </p>

      <CollapsibleEstateGroup
        groupKey="gift"
        sectionNum={1}
        tone="sky"
        title="증여재산 목록"
        description={
          <>
            주식·지분은 아래{" "}
            <span className="text-indigo-600 dark:text-indigo-400">주식평가</span>{" "}
            섹션에 별도 입력
          </>
        }
        count={form.giftItems.length}
        totalAmount={giftTotal}
        headerAction={
          !giftAddOpen && (
            <SectionAddButton
              onClick={() => setGiftAddOpen(true)}
              label="증여재산 추가"
              testId="gift-add-header-estate"
            />
          )
        }
      >
        <PropertyValuationForm
          items={form.giftItems}
          onChange={(items) => set({ giftItems: items })}
          mode="gift"
          valuationDate={form.giftDate}
          hideHeader
          addPanelOpen={giftAddOpen}
          onAddPanelOpenChange={setGiftAddOpen}
        />
      </CollapsibleEstateGroup>

      <CollapsibleEstateGroup
        groupKey="stock"
        sectionNum={2}
        tone="emerald"
        title="주식·지분 목록"
        description="상장주식과 비상장주식을 구분하여 입력하세요"
        count={form.stockItems.length}
        totalAmount={stockTotal}
        headerAction={
          !stockAddOpen && (
            <SectionAddButton
              onClick={() => setStockAddOpen(true)}
              label="주식·지분 추가"
              testId="gift-add-header-stock"
            />
          )
        }
      >
        <StockValuationForm
          items={form.stockItems}
          onChange={(items) => set({ stockItems: items })}
          mode="gift"
          valuationDate={form.giftDate}
          hideHeader
          addPanelOpen={stockAddOpen}
          onAddPanelOpenChange={setStockAddOpen}
        />
      </CollapsibleEstateGroup>
    </div>
  );
}

// ============================================================
// Step 2 — 비과세·사전증여
// ============================================================

export function Step2({
  form,
  set,
  activeClientId,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
  activeClientId: string | null;
}) {
  return (
    <div className="space-y-6">
      <ExemptionChecklist
        category="gift"
        value={form.exemptionItems}
        onChange={(items) => set({ exemptionItems: items })}
      />
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <PriorGiftInput
          gifts={form.priorGifts}
          onChange={(gifts) => set({ priorGifts: gifts })}
          mode="gift"
          currentGiftDate={form.giftDate}
          currentDonor={form.donor}
          currentClientId={activeClientId}
        />
      </div>
    </div>
  );
}

// ============================================================
// Step 3 — 공제·세액공제
// ============================================================

export function Step3({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  // Step4(공제·세액공제)는 칩 체크리스트로 컴팩트화 — GiftCreditChecklist로 분리(800줄 정책).
  return <GiftCreditChecklist form={form} set={set} />;
}
