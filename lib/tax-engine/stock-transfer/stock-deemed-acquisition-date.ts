/**
 * 주식·기타자산 의제취득일 — 단일 소스 (영 §162⑥⑦)
 *
 *   ⑥1호 「1984년 12월 31일 이전에 취득한 법 제94조제1항제2호 및 **제4호**의 자산」 → ⑦1호 **1985년 1월 1일**
 *   ⑥3호 「1985년 12월 31일 이전에 취득한 법 제94조제1항**제3호**의 자산」        → ⑦3호 **1986년 1월 1일**
 *
 * 사전-2015-법령해석재산-0242: 「1985.1.1.(… 의제취득일) 전에 취득한 … 제94조 제1항 제4호 다목 …
 * 기타자산에 해당하는 비상장 주식」 — 4호 «주식»도 1985.1.1.이다.
 *
 * 🔑 날짜는 **저장하지 않고 파생**한다. 4호 여부는 §94②(3호 + 라목·다목)로도 정해지는데, 그 토글은
 *    Step 1에서 취득일보다 **뒤에** 입력된다 — 입력 시점에 날짜를 바꿔 저장하면 원래 날짜가 사라져
 *    분류가 바뀐 뒤 되돌릴 수 없다. 그래서 store·API에는 사용자가 입력한 날짜가 그대로 가고,
 *    의제일은 쓰는 곳(엔진 보유기간·±3개월 기준일·§163⑨ 술어·⑤ 안내·종가 조회 기준일)에서 매번 계산한다.
 *
 * 4호 판정: 엔진은 **분류 결과**(`isSection94_4Category`)를 쓰고, 분류가 없는 곳(⑤⑧⑫③·시나리오 B)은
 * `isSection94_4Asset`을 쓴다. 두 판정이 같은 답을 내는지는 parity anchor가 고정한다
 * (`__tests__/calc/stock-deemed-date-gates.anchor.test.ts` Y1-3).
 *
 * 계획서: docs/00-pm/stock-deemed-date-other-asset-and-conversion-citation.plan.md
 */

import { judgeBlockShareholderGate } from "./block-shareholder-gate";

/** 영 §162⑦3호 — 법 §94①3호(주식등) */
export const STOCK_DEEMED_ACQUISITION_DATE = "1986-01-01";
/** 영 §162⑦1호 — 법 §94①4호(기타자산) */
export const OTHER_ASSET_DEEMED_ACQUISITION_DATE = "1985-01-01";

/** 4호면 1985-01-01, 아니면 1986-01-01 ("YYYY-MM-DD") */
export function stockDeemedAcquisitionDate(is94_4: boolean): string {
  return is94_4 ? OTHER_ASSET_DEEMED_ACQUISITION_DATE : STOCK_DEEMED_ACQUISITION_DATE;
}

/** 의제일 «전»(엄격 미만) 취득이면 의제일로 — 의제일 당일 취득은 실제 취득일 그대로다 */
export function resolveStockDeemedDate(
  date: Date,
  is94_4: boolean,
): { effectiveDate: Date; isDeemedApplied: boolean } {
  const deemed = new Date(stockDeemedAcquisitionDate(is94_4)); // "YYYY-MM-DD" → UTC 자정
  if (date.getTime() < deemed.getTime()) return { effectiveDate: deemed, isDeemedApplied: true };
  return { effectiveDate: date, isDeemedApplied: false };
}

/** 폼 문자열 버전 — ⑤ 안내·조회 기준일용. 빈 값은 그대로 돌려준다. */
export function resolveStockDeemedDateString(
  date: string,
  is94_4: boolean,
): { effectiveDate: string; isDeemedApplied: boolean } {
  const deemed = stockDeemedAcquisitionDate(is94_4);
  if (date && date < deemed) return { effectiveDate: deemed, isDeemedApplied: true };
  return { effectiveDate: date, isDeemedApplied: false };
}

/** 4호 판정에 필요한 사실 — 엔진 단위(비율 0~1 소수 · Date) */
export interface Section94_4Facts {
  marketType: string | undefined;
  isHeavyRealEstateForRate: boolean | undefined;
  isQualifyingBlockShareholder: boolean | undefined;
  blockShareholderRealEstateRatio?: number;
  blockShareholderOwnershipRatio?: number;
  cumulativeTransferRatio?: number;
  aggregationFirstTransferDate?: Date;
  transferDate?: Date;
}

const SECTION_94_3_DOMESTIC_MARKETS = new Set(["kospi", "kosdaq", "konex", "unlisted"]);

/**
 * 법 §94①4호(기타자산) 자산인가 — `stock-classification.ts` `classifySection94`와 같은 규칙.
 *
 *   · `other_asset` 직접 선택 → 4호 (다목·라목이 모두 불성립하면 ⑧⑫가 막는다)
 *   · 국내 3호 시장 + (라목 토글 ∨ 다목 게이트 통과) → §94② 「제4호를 적용한다」
 *
 * 다목은 토글이 아니라 **게이트 통과**(영 §158①② 세 요건)로 본다 — 분류와 같은 leaf를 쓴다.
 */
export function isSection94_4Asset(f: Section94_4Facts): boolean {
  if (f.marketType === "other_asset") return true;
  if (!f.marketType || !SECTION_94_3_DOMESTIC_MARKETS.has(f.marketType)) return false;
  if (f.isHeavyRealEstateForRate) return true;
  if (!f.isQualifyingBlockShareholder || !f.transferDate) return false;
  return judgeBlockShareholderGate({
    realEstateRatio: f.blockShareholderRealEstateRatio,
    ownershipRatio: f.blockShareholderOwnershipRatio,
    cumulativeTransferRatio: f.cumulativeTransferRatio,
    firstTransferDate: f.aggregationFirstTransferDate,
    transferDate: f.transferDate,
  }).passed;
}
