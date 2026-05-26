/**
 * besshi-form-constants — 별지 부표3 제1쪽 양식 단일 출처 상수 (2025.07.10 개정)
 *
 * 화면(`Page1CoverSection.tsx`)과 PDF(`lib/pdf/UnlistedStockBesshiPdfDocument.tsx`)가
 * 동일한 셀 라벨·사유 6행 정의를 import 재사용 → 양식 개정 시 한 곳만 수정(재드리프트 방지).
 *
 * Plan: docs/00-pm/inheritance-besshi-pdf-2025-revision-parity.plan.md §2.1 (C2)
 * 법령: 상증령 §54④ (순자산가치 단독 평가 사유) · 상증법 §63③ (최대주주 할증)
 */

import type { UnlistedNetAssetOnlyReason } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ─────────────────────────────────────────────────────────────────
// 2번 — 순자산가치로만 평가하는 경우 [v] (상증령 §54④) 6행 (가~바)
//   다(3호)는 2018.2.13. 삭제 — 회색 비활성 표시
// ─────────────────────────────────────────────────────────────────
export interface NetAssetReasonRow {
  code: string;
  label: string;
  reason?: UnlistedNetAssetOnlyReason;
  deleted?: boolean;
}

export const NET_ASSET_REASON_ROWS: NetAssetReasonRow[] = [
  { code: "가", label: "신고기한 내 청산절차 진행·사업계속 곤란 (1호)", reason: "liquidation" },
  { code: "나", label: "사업개시 전·3년 미만·휴업·폐업 (2호)", reason: "lt3y" },
  { code: "다", label: "3년 연속 결손금 (2018.2.13. 삭제)", deleted: true },
  { code: "라", label: "자산총액 중 부동산 80% 이상 (3호)", reason: "real_estate_80" },
  { code: "마", label: "자산총액 중 주식 등 80% 이상 (5호)", reason: "stock_holding_80" },
  { code: "바", label: "잔여 존속기한 3년 이내 (6호)", reason: "remaining_3y" },
];

// ─────────────────────────────────────────────────────────────────
// 3번 — 1주당 가액의 평가 셀 라벨 (공식 2025.07.10 순서·문구)
//   공식 양식: ⑥(헤더 "많은 금액") → ㉮(가중평균) → ㉯(80%),
//             ⑦(헤더) → ㉮(⑥×할증율) → ㉯(⑥+㉮)
// ─────────────────────────────────────────────────────────────────
export const BESSHI_P1_SECTION3 = {
  /** ③ 순자산가액 — 제2쪽 4.마 */
  netAssetTotal: "순자산가액 (제2쪽 4.마)",
  /** ④ 1주당 순자산가액 (③ ÷ ①) */
  netAssetPerShare: "1주당 순자산가액 (③ ÷ ①)",
  /** ⑤ 공식 장문 라벨 — 제6쪽 7.차 */
  netIncomeValue:
    "최근 3년간 순손익액의 가중평균액에 의한 1주당가액 또는 2 이상의 신용평가전문기관(회계법인 포함)이 산출한 1주당 추정이익의 평균액 (제6쪽 7.차)",
  /** ⑥ 헤더 — ㉮·㉯ 중 많은 금액 (㉮·㉯ 위에 배치) */
  finalPerShareHeader: "1주당 평가액 (㉮·㉯ 중 많은 금액)",
  /** ⑥㉮ 가중평균 — 일반 */
  weightedAvgNormal: "[{(④×2)+(⑤×3)}÷5]",
  /** ⑥㉮ 가중평균 — 부동산과다보유법인 병기 각주 */
  weightedAvgRealEstateNote: "* 부동산과다보유법인 [{(④×3)+(⑤×2)}÷5]",
  /** ⑥㉯ 80% 하한 */
  netAssetFloor80: "1주당 순자산가액(④)의 80%",
  /** ⑦ 헤더 — 최대주주등 해당 시 */
  maxShareholderHeader: "최대주주등에 해당하는 경우 1주당 평가액",
  /** ⑦㉮ 할증분 (⑥ × 할증율) */
  premiumSurcharge: (pct: string) => `최대주주등의 주식등의 1주당 평가액 (⑥ × 할증율 ${pct}%)`,
  /** ⑦㉯ (⑥ + ㉮) */
  premiumTotal: "(⑥ + ㉮)",
  /** ⑦ 비최대주주 분기 */
  nonMaxShareholder: "최대주주 해당 없음 (⑥ 적용)",
  /** ⑨ 보충적 평가가액 */
  reportingValue: "보충적 평가가액",
  /** 총 상속재산가액 (⑨ × 보유주식수) */
  total: (shares: string) => `상속재산가액 (⑨ × 보유주식수 ${shares}주)`,
} as const;

/**
 * 자본금 표시값 fallback — 명시 입력값(capital)이 없으면 액면가 × 발행주식총수로 도출.
 * 입력 폼(CorporateInfoSection)의 capitalDisplay와 동일 로직 → 화면·PDF·입력 3곳 일관.
 * (store에는 쓰지 않는 display fallback — mirror-pattern. capital은 평가 산식 미사용 표시 전용.)
 * @returns 표시할 자본금(원). 도출 불가 시 undefined.
 */
export function resolveCapitalDisplay(
  capital: number | undefined,
  faceValuePerShare: number,
  totalShares: number,
): number | undefined {
  if (capital && capital > 0) return capital;
  if (faceValuePerShare > 0 && totalShares > 0) return faceValuePerShare * totalShares;
  return undefined;
}
