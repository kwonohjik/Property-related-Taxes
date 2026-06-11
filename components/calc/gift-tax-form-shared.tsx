"use client";

/**
 * gift-tax-form-shared.tsx
 *
 * GiftTaxForm 공유 타입·상수·헬퍼·Step 컴포넌트 (800줄 정책 분리).
 * GiftTaxForm.tsx 오케스트레이터가 import.
 */

import type {
  EstateItem,
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import type { AppraisalFeeFormFields } from "@/lib/calc/appraisal-fee-form";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { AppraisalFeeSection } from "@/components/calc/deductions/AppraisalFeeSection";
import { resolveValuationMethod, evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import { INITIAL_APPRAISAL_FEE_FIELDS } from "@/lib/calc/appraisal-fee-form";
import { SpecialTreatmentAssetSelector } from "@/components/calc/gift/SpecialTreatmentAssetSelector";
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";

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
}

export const INITIAL_FORM: FormState = {
  giftDate: "",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  isGenerationSkip: false,
  isMinorDonee: false,
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

/**
 * G-M3: donor 선택 시 donorRelation 자동 도출 (단일 진실화)
 *
 * 매핑 기준:
 * - father/mother/grandparent → lineal_ascendant_adult (기본)
 *   isMinorDonee=true 이면 lineal_ascendant_minor (2천만원 공제)
 * - spouse → spouse
 * - lineal_descendant → lineal_descendant
 * - sibling/other_relative/other → other_relative
 */
export function deriveDonorRelation(
  donor: GiftDonorRelation,
  isMinorDonee: boolean,
): DonorRelation {
  switch (donor) {
    case "father":
    case "mother":
    case "grandparent":
      return isMinorDonee ? "lineal_ascendant_minor" : "lineal_ascendant_adult";
    case "spouse":
      return "spouse";
    case "lineal_descendant":
      return "lineal_descendant";
    case "sibling":
    case "other_relative":
    case "other":
      return "other_relative";
  }
}

// ============================================================
// API 에러 상세화 — Zod issues → 한국어 라벨 + 메시지
// ============================================================

const GIFT_FIELD_LABELS: Record<string, string> = {
  giftDate: "증여일",
  reportDate: "신고일",
  donor: "증여자",
  recipient: "수증자",
  isGenerationSkip: "세대생략 증여 여부",
  isMinor: "수증자 미성년 여부",
  estateItems: "증여재산",
  category: "재산 종류",
  name: "자산 명칭",
  marketValue: "시가",
  standardPrice: "기준시가/공시가격",
  appraisedValue: "감정평가액",
  listedStockAvgPrice: "상장주식 평균종가",
  listedStockShares: "상장주식 수량",
  listedStockCode: "상장주식 종목코드",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 설정액",
  marriageDeduction: "혼인공제",
  childbirthDeduction: "출산공제",
  prior10YearDeductionsUsed: "10년 내 기사용 증여재산공제",
  foreignTaxPaid: "외국납부세액",
  specialTaxRegime: "조특법 과세특례",
  priorGifts: "사전증여",
  giftAmount: "사전증여 금액",
  giftTaxBase: "그 회차 합산과세표준 ⑤",
  computedTax: "그 회차 산출세액 ⑦",
  filedWithinDeadline: "법정신고기한 내 신고",
};

interface ApiIssue {
  path: string[];
  message: string;
  code?: string;
}

function labelForPath(path: string[]): string {
  if (path.length === 0) return "입력";
  const parts: string[] = [];
  for (const seg of path) {
    if (/^\d+$/.test(seg)) {
      parts.push(`${Number(seg) + 1}번`);
    } else {
      parts.push(GIFT_FIELD_LABELS[seg] ?? seg);
    }
  }
  return parts.join(" › ");
}

export function formatGiftApiError(data: { error?: string; issues?: ApiIssue[] }): string {
  if (Array.isArray(data.issues) && data.issues.length > 0) {
    const lines = data.issues.slice(0, 8).map((iss) => {
      const label = labelForPath(iss.path);
      return `• ${label}: ${iss.message}`;
    });
    const more = data.issues.length > 8 ? `\n(외 ${data.issues.length - 8}건)` : "";
    return `${data.error ?? "입력값이 올바르지 않습니다."}\n${lines.join("\n")}${more}`;
  }
  return data.error ?? "계산 중 오류가 발생했습니다.";
}

// ============================================================
// 단계별 유효성 검사
// ============================================================

import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";

/**
 * G-M4: 동일그룹 판정을 isSameDonorGroup 엔진 헬퍼로 재사용.
 * 기존 하드코딩 (A=부/모, B=조부모) → 전 그룹 자동 적용.
 */
export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.giftDate) return "증여일을 입력하세요.";
    if (!form.donor) return "증여자를 선택하세요.";
    // §57① 단서 (isSubstituteGift): donor !== "grandparent"이면 UI가 토글 미노출.
    // API 변환(④)에서 undefined strip되므로 여기서 추가 검증 불필요 — 3중 패턴 준수.
  }
  if (step === 1) {
    if (form.giftItems.length + form.stockItems.length === 0) {
      return "증여재산을 1개 이상 입력하세요.";
    }
    const allItems = [...form.giftItems, ...form.stockItems];
    // cash·financial·deposit은 위치 기반 자산이 아니므로 자산명 선택 입력
    const needsName = allItems.filter(
      (it) => it.category !== "cash" && it.category !== "financial" && it.category !== "deposit"
    );
    if (needsName.some((it) => !it.name.trim())) {
      return "모든 증여재산에 자산명을 입력하세요.";
    }
    // §47① 채무인수액 > 재산평가액 경고 (차단 아님 — §47① 입증 후 허용 가능, 엔진 음수가드 위임)
    // 부동산(giftItems) + 주식(stockItems) 전수. 주식 평가액은 엔진 단일 진실(evaluateAllEstateItems)
    // — UI 자체 재계산 금지(dual-truth). 입력 미완성 예외는 try/catch → 0(경고 미발생, 엔진 위임).
    const debtCandidates = [...form.giftItems, ...form.stockItems];
    for (let i = 0; i < debtCandidates.length; i++) {
      const it = debtCandidates[i];
      const debtForGift = it.assumedDebtForGift ?? 0;
      if (debtForGift <= 0) continue;
      let valuation = 0;
      if (it.category === "listed_stock" || it.category === "unlisted_stock") {
        try {
          valuation = evaluateAllEstateItems([it])[0]?.valuatedAmount ?? 0;
        } catch {
          valuation = 0;
        }
      } else {
        valuation =
          it.marketValue ?? it.appraisedValue ?? it.similarSalesValue ?? it.standardPrice ?? 0;
      }
      if (valuation > 0 && debtForGift > valuation) {
        return `${it.name.trim() || `재산 ${i + 1}`}: 채무인수액(${debtForGift.toLocaleString()}원)이 평가액(${valuation.toLocaleString()}원)을 초과합니다. 입력값을 확인하세요. (과세가액 0으로 처리됩니다)`;
      }
    }
  }
  if (step === 2) {
    // 사전증여 입력 시 동일인 그룹·⑤·⑦ 필수 (UI ↔ validate 모순 방지)
    // G-M4: isSameDonorGroup 엔진 헬퍼 재사용 — 그룹 C~G 포함 전수 적용
    for (let i = 0; i < form.priorGifts.length; i++) {
      const p = form.priorGifts[i];
      if (p.giftAmount > 0) {
        if (!p.donor) {
          return `사전증여 ${i + 1}: 증여자를 선택하세요 (§47 합산 그룹 판정).`;
        }
        // 동일 그룹 priorGift이면 §58 한도 산식용으로 ⑤·⑦ 필수
        // (다른 그룹은 자동 무시되므로 검증 제외)
        if (isSameDonorGroup(p.donor, form.donor)) {
          if (!p.giftTaxBase || p.giftTaxBase <= 0) {
            return `사전증여 ${i + 1}: 동일인 합산 — 그 회차 합산과세표준 ⑤을 입력하세요.`;
          }
          if (!p.computedTax || p.computedTax <= 0) {
            return `사전증여 ${i + 1}: 동일인 합산 — 그 회차 산출세액 ⑦을 입력하세요.`;
          }
          if (p.wasGenerationSkip && !p.additionalGenerationSkipSurcharge) {
            return `사전증여 ${i + 1}: 세대생략 회차이면 추가 할증세액 ⑫를 입력하세요.`;
          }
        }
      }
    }
  }
  if (step === 3) {
    // §53의2③ 기공제액 — 엔진이 min(입력값, 1억) 가드를 처리하므로 UI 단계에서는 차단하지 않음.
    // 단, 음수 입력은 의미 없으므로 차단.
    const cumUsed = parseAmount(form.priorUsedMarriageBirthDeduction);
    if (cumUsed < 0) {
      return "이미 공제받은 혼인·출산 공제액은 0원 이상이어야 합니다.";
    }
    // 1억 초과 입력은 엔진 가드(min 처리)로 안전 처리됨 — UI 차단 없음 (모순 방지)

    // 엔진 superRefine 동기화 (⑧): 혼합 자산(N≥2)에서 특례 선택 시 귀속 미설정 차단.
    // 자산 1개는 엔진이 자동 귀속으로 처리하므로 차단 없음.
    // Zod superRefine(property-valuation-input.ts)과 동일 조건 — 미귀속(undefined) 1개라도
    // 있으면 차단. (일부만 태깅 후 신규 자산 추가 시 UI 통과↔API 400 모순 방지)
    if (form.specialTreatment !== "") {
      const allItems = [...form.giftItems, ...form.stockItems];
      if (allItems.length >= 2) {
        const unassigned = allItems.filter(
          (it) => it.isSpecialTreatmentAsset === undefined
        );
        if (unassigned.length > 0) {
          const label =
            form.specialTreatment === "startup" ? "창업자금" : "가업승계";
          return `${label} 특례 적용 시 모든 자산의 특례 귀속 여부를 선택하세요. (위 "특례 귀속 자산 선택" 항목 — 미선택 ${unassigned.length}개)`;
        }
      }

      // 특례 귀속 재산 종류 제약 — Zod superRefine 동기화 (⑧, R3 잔여 해소).
      // startup: 소법 §94① 재산(부동산·주식) 제외 (조특령 §27의5①) / family_business: 주식만 (§30의6①).
      // 단일 자산은 엔진 자동 귀속이므로 동일 검사 (Zod와 동일 조건 — UI 통과↔API 400 모순 방지)
      const effectiveSpecialItems =
        allItems.length === 1
          ? allItems
          : allItems.filter((it) => it.isSpecialTreatmentAsset === true);
      const ineligible = effectiveSpecialItems.filter(
        (it) =>
          !isSpecialTreatmentEligibleCategory(it.category, form.specialTreatment as "startup" | "family_business")
      );
      if (ineligible.length > 0) {
        return `특례 귀속 불가 재산 ${ineligible.length}개 — ${SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[form.specialTreatment as "startup" | "family_business"]}`;
      }
    }

    // §30의6① 가업 영위기간 — Zod min(0) 동기화 (음수만 차단).
    // 10년 미만은 엔진이 특례 불가 판정(일반 스트림 폴백)으로 안전 처리 — UI 차단 없음 (모순 방지)
    if (
      form.specialTreatment === "family_business" &&
      parseDecimal(form.familyBusinessYears) < 0
    ) {
      return "가업 영위기간은 0 이상이어야 합니다.";
    }
  }
  return null;
}

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
        {(form.donor === "father" || form.donor === "mother") && (
          <p className="text-[11px] text-violet-600">
            부·모는 §47② 동일인. 다른 한쪽의 사전증여도 합산 대상입니다.
          </p>
        )}
        {/* 자동 도출된 공제 관계 표시 */}
        <p className="text-[11px] text-violet-500">
          공제 관계 자동 설정: <strong>{RELATION_LABELS[form.donorRelation]}</strong>
        </p>
      </div>

      {/* G-M2: isMinorDonee — donor=grandparent 포함 직계존속 전체에서 항상 노출
          (§57 40% 판정: isMinorDonee AND grossGiftValue > 20억) */}
      {(form.donor === "father" ||
        form.donor === "mother" ||
        form.donor === "grandparent") && (
        <ToggleCard
          tone="violet"
          title="수증자 미성년자 (§57 ② 40% 할증 판정)"
          description="수증자가 미성년자이고 세대생략 증여재산가액이 20억을 초과하면 30% 대신 40% 할증 적용"
          checked={form.isMinorDonee}
          onCheckedChange={(v) => {
            // G-M3: isMinorDonee 변경 시 donorRelation 재도출 (직계존속 성인↔미성년 전환)
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

export function Step1({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        증여하는 재산을 모두 입력하세요.
      </p>
      <PropertyValuationForm
        items={form.giftItems}
        onChange={(items) => set({ giftItems: items })}
        mode="gift"
        valuationDate={form.giftDate}
      />
      <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
        <StockValuationForm
          items={form.stockItems}
          onChange={(items) => set({ stockItems: items })}
          mode="gift"
          valuationDate={form.giftDate}
        />
      </div>
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
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        공제 항목을 입력하면 납부세액이 줄어듭니다.
      </p>

      {/* 혼인·출산 공제 */}
      {(form.donorRelation === "lineal_ascendant_adult" || form.donorRelation === "lineal_ascendant_minor") && (
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            혼인·출산 공제 (§53의2, 최대 각 1억)
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            직계존속으로부터 증여 시 적용. 혼인신고일 전후 2년 이내 / 자녀 출생일로부터 2년 이내 증여분. 합산 1억 한도.
          </p>
          <CurrencyInput
            label="혼인공제"
            value={form.marriageExemption}
            onChange={(v) => set({ marriageExemption: v })}
            hint="최대 1억원"
            placeholder="없으면 빈칸"
          />
          <CurrencyInput
            label="출산공제"
            value={form.birthExemption}
            onChange={(v) => set({ birthExemption: v })}
            hint="최대 1억원"
            placeholder="없으면 빈칸"
          />
          {/* §53의2③ 수증자 통산 기공제액 — 과거 다른 증여에서 이미 혼인·출산 공제를 받은 경우 */}
          <CurrencyInput
            label="이미 공제받은 혼인·출산 공제액 (§53의2③)"
            value={form.priorUsedMarriageBirthDeduction}
            onChange={(v) => set({ priorUsedMarriageBirthDeduction: v })}
            hint="과거 다른 증여에서 §53의2 공제를 받은 금액 합계 (없으면 빈칸). 수증자 기준 통산 한도 1억."
            placeholder="없으면 빈칸"
          />
        </div>
      )}

      {/* 기사용 공제 */}
      <CurrencyInput
        label="10년 내 기사용 증여재산공제 합계"
        value={form.priorUsedDeduction}
        onChange={(v) => set({ priorUsedDeduction: v })}
        hint="동일 관계(그룹)에서 10년 이내 이미 공제받은 합계"
        placeholder="없으면 빈칸"
      />

      <AppraisalFeeSection
        taxType="gift"
        value={form}
        onChange={set}
        hasAppraisalAsset={[...form.giftItems, ...form.stockItems].some(
          (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
        )}
      />

      {/* 신고세액공제 */}
      <ToggleCard
        tone="violet"
        title="법정신고기한 내 신고 (§69 신고세액공제 3%)"
        description="증여일로부터 3개월 이내 신고 시 산출세액의 3% 공제"
        checked={form.isFiledOnTime}
        onCheckedChange={(v) => set({ isFiledOnTime: v })}
      />

      {/* 외국납부세액 */}
      <CurrencyInput
        label="외국납부세액 (§59)"
        value={form.foreignTaxPaid}
        onChange={(v) => set({ foreignTaxPaid: v })}
        hint="해외 소재 증여재산에 대해 납부한 외국 세액"
        placeholder="없으면 빈칸"
      />

      {/* 조특법 과세특례 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          조특법 과세특례 (창업·가업)
        </label>
        <RadioCardGroup<"none" | "startup" | "family_business">
          name="giftSpecialTreatment"
          tone="emerald"
          value={form.specialTreatment === "" ? "none" : form.specialTreatment}
          onChange={(v) => {
            const val = v === "none" ? "" : v;
            // 특례 타입이 바뀔 때 모든 자산의 isSpecialTreatmentAsset을 초기화
            // N≥2 혼합 자산 귀속: false(미귀속)로 초기화 → 사용자가 명시 선택 필요
            // 자산 1개: 엔진이 자동 귀속 처리 (isSpecialTreatmentAsset 미설정도 OK)
            const resetGiftItems = val !== ""
              ? form.giftItems.map((it) => ({ ...it, isSpecialTreatmentAsset: false as boolean | undefined }))
              : form.giftItems.map((it) => ({ ...it, isSpecialTreatmentAsset: undefined as boolean | undefined }));
            const resetStockItems = val !== ""
              ? form.stockItems.map((it) => ({ ...it, isSpecialTreatmentAsset: false as boolean | undefined }))
              : form.stockItems.map((it) => ({ ...it, isSpecialTreatmentAsset: undefined as boolean | undefined }));
            set({
              specialTreatment: val,
              giftItems: resetGiftItems,
              stockItems: resetStockItems,
              // startup이 아니면 startupInvestmentCompleted / startupNewHiresAtLeast10 초기화
              ...(val !== "startup" ? { startupInvestmentCompleted: false, startupNewHiresAtLeast10: false } : {}),
              // family_business가 아니면 familyBusinessYears 초기화
              ...(val !== "family_business" ? { familyBusinessYears: "" } : {}),
            });
          }}
          options={[
            { value: "none", label: "해당 없음" },
            { value: "startup", label: "창업자금 증여세 과세특례 (§30의5)" },
            { value: "family_business", label: "가업승계 증여세 과세특례 (§30의6)" },
          ]}
        />
      </div>

      {/* 특례 귀속 자산 선택 — 자산 1개:자동귀속, N개:멀티선택 */}
      {form.specialTreatment !== "" && (
        <SpecialTreatmentAssetSelector
          specialTreatment={form.specialTreatment as "startup" | "family_business"}
          allItems={[...form.giftItems, ...form.stockItems]}
          onItemChange={(index, isSpecial) => {
            // giftItems vs stockItems 인덱스 분리 — allItems 순서: giftItems 먼저
            // isSpecial=true → 특례 귀속, false → 일반 스트림(Zod: false = "명시 일반")
            // undefined가 아닌 boolean을 저장해야 Zod superRefine 통과
            const giftLen = form.giftItems.length;
            if (index < giftLen) {
              const updated = form.giftItems.map((it, i) =>
                i === index
                  ? { ...it, isSpecialTreatmentAsset: isSpecial }
                  : it
              );
              set({ giftItems: updated });
            } else {
              const stockIdx = index - giftLen;
              const updated = form.stockItems.map((it, i) =>
                i === stockIdx
                  ? { ...it, isSpecialTreatmentAsset: isSpecial }
                  : it
              );
              set({ stockItems: updated });
            }
          }}
        />
      )}

      {/* G-M7: 창업자금 투자 완료 여부 (§30의5④) — startup 선택 시 노출 */}
      {form.specialTreatment === "startup" && (
        <ToggleCard
          tone="emerald"
          title="창업자금 투자 완료 (§30의5④)"
          description="증여일로부터 2년 이내 창업법인 설립 및 투자 완료 여부. 미완료 시 과세특례 미적용."
          checked={form.startupInvestmentCompleted}
          onCheckedChange={(v) => set({ startupInvestmentCompleted: v })}
        />
      )}

      {/* G-M8: 10명 이상 신규 고용 여부 (§30의5①) — startup 선택 시 노출. ⑧ validation 불필요(boolean, 차단 없음) */}
      {form.specialTreatment === "startup" && (
        <ToggleCard
          tone="emerald"
          title="창업을 통하여 10명 이상 신규 고용 (§30의5①)"
          description="창업자금 증여세 과세특례 적용 한도: 10명 이상 신규 고용 시 100억원, 그 외 50억원 (조특법 §30의5①)."
          checked={form.startupNewHiresAtLeast10}
          onCheckedChange={(v) => set({ startupNewHiresAtLeast10: v })}
        />
      )}

      {/* 가업 영위기간 (§30의6①) — family_business 선택 시 노출. 한도: 10년 이상 300억 / 20년 이상 400억 / 30년 이상 600억 */}
      {form.specialTreatment === "family_business" && (
        <FieldCard
          label="부모 가업 영위기간 (§30의6①)"
          hint="부모가 계속하여 경영한 기간(년). 과세가액 한도: 10년 이상 300억 / 20년 이상 400억 / 30년 이상 600억. 비워두면 10년(300억 한도)으로 계산하며, 10년 미만 입력 시 특례 미적용(일반 증여세)으로 계산합니다."
        >
          <DecimalInput
            value={form.familyBusinessYears}
            onChange={(v) => set({ familyBusinessYears: v })}
            placeholder="영위 기간 입력"
            unit="년"
          />
        </FieldCard>
      )}

      {/* 분납 신청 (상증법 §70②) */}
      <ToggleCard
        tone="sky"
        title="분납 신청 (상증법 §70②)"
        description="결정세액 1천만원 초과 시 신고기한 경과 후 2개월 이내 분할납부. 1천만~2천만은 1천만 초과분, 2천만 초과는 50% 이하를 분납할 수 있습니다."
        checked={form.splitPaymentEnabled}
        onCheckedChange={(v) => set({ splitPaymentEnabled: v })}
      >
        <div className="space-y-3 pt-1">
          <FieldCard
            label="분납 희망액"
            hint="§70② 한도(2천만 이하→1천만 초과분 / 2천만 초과→50%) 이내에서 입력하세요. 비워두면 결과 화면에서 최대 분납액으로 안내합니다."
          >
            <CurrencyInput
              label="분납 희망액"
              hideLabel
              value={form.splitPaymentAmount}
              onChange={(v) => set({ splitPaymentAmount: v })}
            />
          </FieldCard>
        </div>
      </ToggleCard>
    </div>
  );
}
