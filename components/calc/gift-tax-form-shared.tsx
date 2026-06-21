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
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { CollapsibleEstateGroup } from "@/components/calc/inheritance/CollapsibleEstateGroup";
import { sumEstateItemsValuation } from "@/lib/stores/inheritance-summary";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import { INITIAL_APPRAISAL_FEE_FIELDS } from "@/lib/calc/appraisal-fee-form";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { resolvePropertyType } from "@/lib/calc/gift-burdened-transfer-api";

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

// G-M3: donor → donorRelation 자동 도출. 사전증여(GiftRowEditor) prefill 공용을 위해
// lib 단일 출처로 이동(순환 import 회피). 상단 import로 내부 사용 + 하위호환 재노출.
export { deriveDonorRelation };

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
    // ─── 부담부증여 양도소득세 함께 계산 — 토글 ON 검증 ───
    // (설계 §9⑧ — 자동 안분 fallback 금지, 미입력=차단)
    const BURDENED_GIFT_RE_CATEGORIES = [
      "real_estate_land",
      "real_estate_building",
      "real_estate_apartment",
    ] as const;
    const bgItems = form.giftItems.filter(
      (it) =>
        it.burdenedGiftTransferTax !== undefined &&
        BURDENED_GIFT_RE_CATEGORIES.includes(
          it.category as (typeof BURDENED_GIFT_RE_CATEGORIES)[number],
        ),
    );
    // C-4: 다자산 동시 토글 ON 차단 (MVP 단일 자산 제한)
    if (bgItems.length > 1) {
      return "양도소득세 함께 계산은 자산 1건에만 켤 수 있습니다. (복수 토글 ON 비지원)";
    }
    if (bgItems.length === 1) {
      const bgItem = bgItems[0];
      const bgt = bgItem.burdenedGiftTransferTax!;
      const itemLabel = bgItem.name.trim() || "부담부증여 자산";

      // 필수: 취득일
      if (!bgt.acquisitionDate) {
        return `${itemLabel}: 취득일을 입력하세요. (양도소득세 계산 필수)`;
      }
      // 필수: 취득시 기준시가
      if (!bgt.standardPriceAtAcquisition || bgt.standardPriceAtAcquisition <= 0) {
        return `${itemLabel}: 취득시 기준시가를 입력하세요. (양도소득세 계산 필수)`;
      }
      // housing 전용 — 거주기간 (resolvePropertyType 단일 진실로 dual-truth 방지)
      const propertyType = resolvePropertyType(bgItem.category, bgt.isHousing);
      // ─── 평가방식(valuationMode) 분기 검증 ───
      const valuationMode = bgt.valuationMode ?? "sangjeungbeop_standard";
      const isMarketMode = valuationMode === "sangjeungbeop_market";

      if (isMarketMode) {
        // K-4/K-5 시가 모드: 분모 C (양도시 시가) 필수
        if (!bgt.marketValueAtTransfer || bgt.marketValueAtTransfer <= 0) {
          return `${itemLabel}: 시가 평가 시 양도시 시가(분모 C)를 입력하세요. (§159①1호 K-4/K-5 필수)`;
        }
        // 취득가액 산정방식 필수
        if (!bgt.acquisitionMethod) {
          return `${itemLabel}: 취득가액 산정방식(실지 또는 환산)을 선택하세요.`;
        }
        // K-4 실지: 실지취득가액 합계 필수
        if (bgt.acquisitionMethod === "actual") {
          if (!bgt.actualAcquisitionTotal || bgt.actualAcquisitionTotal <= 0) {
            return `${itemLabel}: 실지취득가액 합계를 입력하세요. (K-4 실지 모드 필수)`;
          }
        }
        // K-5 환산 + 토지: 양도시 기준시가 별도 필수
        if (bgt.acquisitionMethod === "converted" && propertyType === "land") {
          if (!bgt.landStdPriceAtTransfer || bgt.landStdPriceAtTransfer <= 0) {
            return `${itemLabel}: 토지 양도시(증여시) 기준시가(원/㎡)를 입력하세요. (K-5 환산 분모 필수)`;
          }
        }
        // K-5 환산 + 건물/주택: 양도시 기준시가(standardPrice = 분모) 침묵 0-base 차단 (소령 §176의2②2호)
        if (bgt.acquisitionMethod === "converted" && propertyType !== "land") {
          if (!bgItem.standardPrice || bgItem.standardPrice <= 0) {
            return `${itemLabel}: 양도시(증여시) 기준시가를 입력하세요. (K-5 환산 분모 필수)`;
          }
          // §114조의2 신축·증축: 신축일(취득일) 필수 (5년 기산 — 자동 fallback 금지)
          if (bgt.isSelfBuilt === true && !bgt.constructionDate) {
            return `${itemLabel}: 신축·증축 건물의 신축일(취득일)을 입력하세요. (§114조의2 5년 기산 필수)`;
          }
          // TODO(Phase 2 증축): buildingType==="extension" 활성화 시 extensionFloorArea>0 필수 차단 추가.
          //   현재 UI는 증축 disabled(Phase 1 신축만). 미입력 시 엔진 rate-calc.ts (extensionFloorArea ?? 0)<=85 → 침묵 미발동.
        }
      } else {
        // 기준시가 모드(K-1~K-3): 양도시 기준시가 필수 — 건물·아파트 및 토지 모두
        // 토지: standardPrice = 개별공시지가 총액 (LandPriceLookupField with area prop → 총액 저장)
        // 주택·건물: standardPrice = 공동주택가격·건물기준시가
        if (!bgItem.standardPrice || bgItem.standardPrice <= 0) {
          const transferStdLabel =
            propertyType === "land"
              ? "양도시(증여시) 개별공시지가 총액"
              : "양도시(증여시) 기준시가";
          return `${itemLabel}: ${transferStdLabel}를 입력하세요. (양도소득세 §159 안분 분모 필수)`;
        }
      }

      if (propertyType === "housing" && bgt.isOneHousehold) {
        // 1세대1주택 비과세 판정 시 거주기간 필수 (H11)
        if (bgt.residencePeriodMonths === undefined || bgt.residencePeriodMonths < 0) {
          return `${itemLabel}: 1세대1주택 여부가 활성화되어 있으면 거주기간(개월)을 입력하세요.`;
        }
      }
      // C-4: 채무인수액(§47①) 필수 — assumedDebtForGift가 0이면 양도소득세 과세 대상 없음
      // (소득세법 §88: 유상양도 = 수증자 채무인수가 있어야 양도가액 발생)
      // Note: leaseDeposit·mortgageAmount는 §66 평가 목적 필드로 채무인수와 별개.
      const assumedDebt = bgItem.assumedDebtForGift ?? 0;
      if (assumedDebt <= 0) {
        return `${itemLabel}: 수증자 인수 채무액(§47①)을 입력하세요. 채무인수가 있어야 양도소득세가 발생합니다. "양도소득세 함께 계산" 토글을 끄거나 채무액을 입력하세요.`;
      }
    }
    // ─── end 부담부증여 양도소득세 ───

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
        // D2: 조특법 특례(§30의5/6) 회차는 §47 합산 제외 → §47 카드 미노출 → ⑤·⑦ 검증 면제
        if (isSameDonorGroup(p.donor, form.donor) && !p.specialTreatmentType) {
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

    // 상증령 §46①2호 동시증여 안분 (⑧) — Zod taxableValue.positive() 동기화.
    // §53(관계공제)·§53의2(혼인·출산공제) 모두 동시증여 안분(Phase 2) → 별도 차단 없음.
    if (form.simultaneousGifts !== undefined) {
      for (let i = 0; i < form.simultaneousGifts.length; i++) {
        if (parseAmount(form.simultaneousGifts[i].taxableValue) <= 0) {
          return `동시증여 ${i + 1}: 증여세 과세가액을 입력하세요. (자동 분할 없음 — §46①2호)`;
        }
      }
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
