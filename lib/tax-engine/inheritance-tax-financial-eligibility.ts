/**
 * §22 금융재산상속공제 — 자산 적격 판정 순수 함수 (엔진 단일 진실)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-05-21):
 *   - 상속세 및 증여세법 §22 (mst=276123, 시행 2026-01-02)
 *   - 상속세 및 증여세법 시행령 §19① (금융재산 정의, mst=283637)
 *   - 시행령 §19④ (금융채무 정의 — §10① 1호 입증 금융회사등 채무 한정)
 *
 * 의존 방향 정책:
 *   - lib/tax-engine/… (이 파일) → lib/calc/… import 금지 (역방향)
 *   - lib/calc/financial-deduction-resolver.ts 가 이 파일의 헬퍼를 import (허용 방향)
 *   - lib/tax-engine/inheritance-tax-financial-rows.ts 도 이 파일을 import
 *
 * 우선순위:
 *   0. §22② 최대주주 강제 배제 (isSection22MajorShareholderExcluded) — 사용자 명시보다 우선
 *   1. 사용자 명시값 (item.isFinancialAssetForDeduction !== undefined)
 *   2. deemedCategory override:
 *      - "insurance" → true (§8 보험금 §19① 명시)
 *      - "trust" + trustType==="cash_trust" → true (§19① 금전신탁만)
 *      - "trust" + 그 외(undefined 포함) → false (안전 default)
 *      - "retirement" → false (§19① 미열거)
 *   3. 카테고리 default (CATEGORY_DEFAULT)
 *
 * M-5 수정 (2026-06-04):
 *   - 이 단일 헬퍼로 buildPhaseDFinancialRows + resolveFinancialEligibility 판정 통일
 *   - 수정 전 rows 누락 케이스: unlisted_stock undefined, cash_trust 신탁
 */

import type { AssetCategory, EstateItem } from "./types/inheritance-gift.types";

// ============================================================
// 카테고리별 §22 default 매핑 (상증령 §19①)
// ============================================================

/**
 * AssetCategory → §22 금융재산 default true 여부.
 * §19①에 열거된 예금·적금·신탁(금전)·보험금·공제금·주식·채권·수익증권·출자지분·어음 등.
 *
 * deposit(전세보증금 반환채권)은 §19① "금융회사등이 취급" 한정에서 제외 — 임대인(사인)에 대한
 * 채권으로 금융회사 취급 금융재산이 아니므로 default 미적용(false). 사용자가 명시 ON 한 경우만 포함.
 */
export const FINANCIAL_CATEGORY_DEFAULT: Partial<Record<AssetCategory, boolean>> = {
  financial: true,        // 예금·적금·부금·채권·수익증권·공제금 등
  listed_stock: true,     // 상장주식 (§22② 최대주주 보유분 제외는 사용자 override)
  unlisted_stock: true,   // 비상장주식 (§22② 최대주주 보유분 제외는 사용자 override)
  // deposit(전세보증금 반환채권)·cash·real_estate_*·other → undefined → false (§19① 미열거)
};

// ============================================================
// §22② 최대주주 배제 판정
// ============================================================

/**
 * §22② 최대주주 보유주식 배제 대상 여부 판정 (순수 함수).
 *
 * 상증법 §22② — 최대주주 보유 주식등은 금융재산공제 금융재산에 "포함되지 아니한다".
 *
 * OR 체크 두 경로:
 *   (a) 직속 EstateItem.isSection22MajorShareholder
 *   (b) V2 nested unlistedStockValuationV2.isSection22MajorShareholder — 기존 호환 유지
 */
export function isSection22MajorShareholderExcluded(item: EstateItem): boolean {
  return (
    item.isSection22MajorShareholder === true ||
    item.unlistedStockValuationV2?.isSection22MajorShareholder === true
  );
}

// ============================================================
// §22 금융재산 적격 판정 — 단일 진실 헬퍼
// ============================================================

/**
 * §22 금융재산공제 대상 여부 판정 (엔진 단일 진실).
 *
 * buildPhaseDFinancialRows(lib/tax-engine)와
 * resolveFinancialEligibility(lib/calc) 양쪽이 이 함수를 호출하여
 * 동일 판정 기준으로 rows↔base 정합성을 보장.
 *
 * 우선순위:
 *   0. §22② 법정 강제 배제 (isSection22MajorShareholderExcluded)
 *   1. 사용자 명시값 (item.isFinancialAssetForDeduction)
 *   2. deemedCategory override
 *   3. 카테고리 default (FINANCIAL_CATEGORY_DEFAULT)
 */
export function isFinancialAssetEligible(item: EstateItem): boolean {
  // 우선순위 0: §22② 최대주주 강제 배제
  if (isSection22MajorShareholderExcluded(item)) {
    return false;
  }
  // 우선순위 1: 사용자 명시값
  if (item.isFinancialAssetForDeduction !== undefined) {
    return item.isFinancialAssetForDeduction;
  }
  // 우선순위 2: deemedCategory override
  if (item.deemedCategory === "insurance") {
    // §8 보험금 — §19① 보험금 명시 → true
    return true;
  }
  if (item.deemedCategory === "trust") {
    // §9 신탁재산 — §19① "금전신탁만". cash_trust만 true, 그 외(undefined 포함) false
    return item.trustType === "cash_trust";
  }
  if (item.deemedCategory === "retirement") {
    // §10 퇴직금 — §19① 미열거 → false
    return false;
  }
  // 우선순위 3: 카테고리 default
  return FINANCIAL_CATEGORY_DEFAULT[item.category] ?? false;
}
