/**
 * AcquisitionTaxForm 공유 상수·타입·유틸
 *
 * Step별 파일(Step0.tsx, Step1.tsx 등)과 메인 컴포넌트(AcquisitionTaxForm.tsx) 사이의
 * 공통 의존성을 집약한다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 상수 레이블
// ============================================================

export const PROPERTY_TYPE_LABELS: [string, string][] = [
  ["housing", "주택 (아파트·단독·연립·다세대)"],
  ["land", "토지 (주택 외)"],
  ["land_farmland", "농지 (전·답·과수원)"],
  ["building", "건물 (비주거용)"],
  ["vehicle", "차량"],
  ["machinery", "기계장비"],
  ["aircraft", "항공기"],
  ["vessel", "선박"],
  ["mining_right", "광업권"],
  ["fishing_right", "어업권"],
  ["membership", "회원권 (골프·승마·콘도 등)"],
  ["standing_tree", "입목"],
];

export const ACQUISITION_CAUSE_LABELS: [string, string][] = [
  ["purchase", "매매"],
  ["exchange", "교환"],
  ["auction", "공매·경매"],
  ["in_kind_investment", "현물출자"],
  ["inheritance", "상속"],
  ["inheritance_farmland", "농지 상속 (2.3% 특례)"],
  ["gift", "증여"],
  ["burdened_gift", "부담부증여"],
  ["donation", "기부"],
  ["new_construction", "신축"],
  ["extension", "증축"],
  ["reconstruction", "개축"],
  ["reclamation", "공유수면 매립·간척"],
];

export const STEPS = ["취득 정보", "물건 상세", "주택 현황", "감면 확인"];

// ============================================================
// 폼 상태
// ============================================================

export interface FormState {
  propertyType: string;
  acquisitionCause: string;
  acquiredBy: string;
  reportedPrice: string;
  marketValue: string;
  standardValue: string;
  encumbrance: string;
  constructionCost: string;
  houseCountAfter: string;
  isRegulatedArea: boolean;
  isLuxuryProperty: boolean;
  isRelatedParty: boolean;
  isFirstHome: boolean;
  isMetropolitan: boolean;
  areaSqm: string;
  balancePaymentDate: string;
  registrationDate: string;
  contractDate: string;
  usageApprovalDate: string;
  // ── 소재지 (공시가격 조회용) ──
  jibun: string;
  road: string;
  building: string;
}

export const INITIAL_FORM: FormState = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "",
  marketValue: "",
  standardValue: "",
  encumbrance: "",
  constructionCost: "",
  houseCountAfter: "1",
  isRegulatedArea: false,
  isLuxuryProperty: false,
  isRelatedParty: false,
  isFirstHome: false,
  isMetropolitan: false,
  areaSqm: "",
  balancePaymentDate: "",
  registrationDate: "",
  contractDate: "",
  usageApprovalDate: "",
  jibun: "",
  road: "",
  building: "",
};

// ============================================================
// 유효성 검사
// ============================================================

export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.propertyType) return "물건 유형을 선택하세요.";
    if (!form.acquisitionCause) return "취득 원인을 선택하세요.";
    const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"].includes(form.acquisitionCause);
    if (isOnerous && !form.reportedPrice) return "취득가액을 입력하세요.";
    if (form.acquisitionCause === "burdened_gift" && !form.encumbrance) {
      return "부담부증여 채무액을 입력하세요.";
    }
  }
  return null;
}

// ============================================================
// API 호출
// ============================================================

export async function callAcquisitionTaxAPI(form: FormState): Promise<AcquisitionTaxResult> {
  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);

  const body = {
    propertyType: form.propertyType,
    acquisitionCause: form.acquisitionCause,
    acquiredBy: form.acquiredBy,
    reportedPrice: parseAmount(form.reportedPrice) ?? 0,
    marketValue: parseAmount(form.marketValue) || undefined,
    standardValue: parseAmount(form.standardValue) || undefined,
    encumbrance: parseAmount(form.encumbrance) || undefined,
    constructionCost: isOriginal ? (parseAmount(form.constructionCost) || undefined) : undefined,
    houseCountAfter: form.propertyType === "housing" ? (parseInt(form.houseCountAfter) || 1) : undefined,
    isRegulatedArea: form.propertyType === "housing" ? form.isRegulatedArea : undefined,
    isLuxuryProperty: form.isLuxuryProperty || undefined,
    isRelatedParty: form.isRelatedParty || undefined,
    isFirstHome: form.isFirstHome || undefined,
    isMetropolitan: form.isFirstHome ? form.isMetropolitan : undefined,
    areaSqm: parseAmount(form.areaSqm) || undefined,
    balancePaymentDate: form.balancePaymentDate || undefined,
    registrationDate: form.registrationDate || undefined,
    contractDate: form.contractDate || undefined,
    usageApprovalDate: form.usageApprovalDate || undefined,
  };

  const res = await fetch("/api/calc/acquisition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || !json.data) {
    const errObj = json.error;
    const errMsg = typeof errObj === "object" ? errObj?.message : (errObj as string);
    throw new Error(errMsg ?? "계산 중 오류가 발생했습니다.");
  }
  return json.data as AcquisitionTaxResult;
}

// ============================================================
// 공통 스타일 유틸
// ============================================================

export const selectCls = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const labelCls = "text-sm font-medium leading-none";
export const checkboxWrapCls = "flex items-center gap-2";
export const infoBannerCls = "rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300";
export const warnBannerCls = "rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300";
