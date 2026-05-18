/**
 * unlisted-flat-adapter — 비상장 보충적 평가 §165④ flat 폼 → 4 필드 reduce
 *
 * 계획서: stock-transfer-unlisted-direct-calc.plan.md v4
 * Engine Design: stock-transfer-unlisted-direct-calc.engine.design.md v1
 *
 * 책임:
 *  - full 모드 74 신규 필드를 4 필드(transferNi/transferNa/acqNi/acqNa)로 reduce
 *  - isNetAssetOnly 시 NI 호출 skip (5개 지점 단일 진실 — UI·adapter·selector·validate·데이터 보존)
 *  - PostListing의 calcNetIncomePerShare/calcNetAssetPerShare 헬퍼 재사용 (이중 진실 차단)
 *
 * 의존: stock-valuation-post-listing.ts (상위 import 금지 — pure)
 */

import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "./stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export type UnlistedCol = "EUTransfer" | "EUAcq";

export interface UnlistedReduced {
  transferNi: number;
  transferNa: number;
  acqNi: number;
  acqNa: number;
}

/**
 * [E-6] 순자산 단독 평가 사유 발생 여부 — 5개 지점 단일 진실.
 * UI(NI 비노출) · adapter(NI skip) · selector(NI weight=0) · validate(NI 검증 skip) · 데이터 보존 모두 본 함수로 분기.
 */
export function shouldSkipNetIncome(
  form: Pick<StockTransferFormData, "netAssetOnlyReason">,
): boolean {
  return (form.netAssetOnlyReason ?? "") !== "";
}

function getStr(form: StockTransferFormData, key: string): string {
  const v = (form as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function parseI(s: string): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 양도/취득 컬럼별 1주당 순손익가치 산출.
 * NI 18 필드 (가산 4 + 차감 12 + 주식수 + 환원율) → calcNetIncomePerShare 위임.
 */
export function aggregateUnlistedNiPerShare(
  form: StockTransferFormData,
  col: UnlistedCol,
): number {
  const addA = [1, 2, 3, 4].map((i) => parseI(getStr(form, `niAddRow${i}${col}`)));
  const subB = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i) =>
    parseI(getStr(form, `niSubRow${i}${col}`)),
  );
  const shareCount = parseI(getStr(form, `niShareCount${col}`));
  const rateStr = getStr(form, `niDiscountRate${col}`) || "10";
  const discountRate = (parseFloat(rateStr) || 10) / 100;
  return calcNetIncomePerShare({ addA, subB, shareCount, discountRate }).perShareValue;
}

/**
 * 양도/취득 컬럼별 1주당 순자산가치 산출.
 * NA 19 필드 → calcNetAssetPerShare 위임.
 */
export function aggregateUnlistedNaPerShare(
  form: StockTransferFormData,
  col: UnlistedCol,
): number {
  const assetTotalRow1 = parseI(getStr(form, `naAssetTotalRow1${col}`));
  const assetAdd = [2, 3, 4, 5].map((i) => parseI(getStr(form, `naAssetAddRow${i}${col}`)));
  const assetSub = [6, 7].map((i) => parseI(getStr(form, `naAssetSubRow${i}${col}`)));
  const liabTotalRow8 = parseI(getStr(form, `naLiabTotalRow8${col}`));
  const liabAdd = [9, 10, 11, 12, 13, 14].map((i) =>
    parseI(getStr(form, `naLiabAddRow${i}${col}`)),
  );
  const liabSub = [15, 16, 17].map((i) => parseI(getStr(form, `naLiabSubRow${i}${col}`)));
  const goodwillRow19 = parseI(getStr(form, `naGoodwillRow19${col}`));
  const shareCount = parseI(getStr(form, `naShareCount${col}`));
  return calcNetAssetPerShare({
    assetTotalRow1,
    assetAdd,
    assetSub,
    liabTotalRow8,
    liabAdd,
    liabSub,
    goodwillRow19,
    shareCount,
  }).perShareAsset;
}

/**
 * Full 모드 — 74 신규 필드를 4 필드로 reduce.
 * niSkip === true 시 NI 호출 skip, transferNi/acqNi = 0.
 */
export function adaptUnlistedFlatToApiBody(
  form: StockTransferFormData,
  opts: { niSkip: boolean } = { niSkip: false },
): UnlistedReduced {
  const niSkip = opts.niSkip || shouldSkipNetIncome(form);
  return {
    transferNi: niSkip ? 0 : aggregateUnlistedNiPerShare(form, "EUTransfer"),
    transferNa: aggregateUnlistedNaPerShare(form, "EUTransfer"),
    acqNi: niSkip ? 0 : aggregateUnlistedNiPerShare(form, "EUAcq"),
    acqNa: aggregateUnlistedNaPerShare(form, "EUAcq"),
  };
}
