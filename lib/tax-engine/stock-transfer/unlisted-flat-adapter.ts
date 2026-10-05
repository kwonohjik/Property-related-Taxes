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
import { resolveNetAssetOnlyBasis } from "./net-asset-only-basis";
import type { ValuationSide } from "./net-asset-only-basis";

export type UnlistedCol = "EUTransfer" | "EUAcq";

export interface UnlistedReduced {
  transferNi: number;
  transferNa: number;
  acqNi: number;
  acqNa: number;
}

/**
 * [E-6] 순자산 단독 평가 여부 — 5개 지점 단일 진실.
 * UI(NI 비노출) · adapter(NI skip) · selector(NI weight=0) · validate(NI 검증 skip) · 데이터 보존 모두 본 함수로 분기.
 *
 * 근거는 엔진과 같은 `resolveNetAssetOnlyBasis` — §165④3 사유(사용자 선택) 또는 §165⑧1호 후단
 * (라목 · 양도일 2023-02-28 이후). 사유만 보면 라목에서 «엔진이 쓰지 않는 순손익을 화면·검증이 요구»한다.
 * 평가 시점마다 따로다(양도 당시 · 취득 당시 — 계획서 `stock-165-4-valuation-followups.plan.md` §14).
 */
export function shouldSkipNetIncome(
  form: Pick<
    StockTransferFormData,
    "netAssetOnlyReason" | "acquisitionNetAssetOnlyReason" | "isHeavyRealEstateForRate" | "transferDate"
  >,
  side: ValuationSide,
): boolean {
  return (
    resolveNetAssetOnlyBasis(
      {
        netAssetOnlyReason: form.netAssetOnlyReason || undefined,
        acquisitionNetAssetOnlyReason: form.acquisitionNetAssetOnlyReason || undefined,
        isHeavyRealEstateForRate: form.isHeavyRealEstateForRate,
        transferDate: form.transferDate ? new Date(form.transferDate) : undefined,
      },
      side,
    ) !== undefined
  );
}

/** 평가 시점별 순손익가치 생략 여부 — 필수 입력 술어(`requiredUnlistedValuationKeys`)·④ 어댑터 공용 */
export interface NetIncomeSkip {
  transfer: boolean;
  acquisition: boolean;
}

export function netIncomeSkipBySide(form: Parameters<typeof shouldSkipNetIncome>[0]): NetIncomeSkip {
  return { transfer: shouldSkipNetIncome(form, "transfer"), acquisition: shouldSkipNetIncome(form, "acquisition") };
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
 * 순자산 단독인 시점은 NI 호출 skip → 그 열의 Ni = 0 (평가 시점마다 따로).
 */
export function adaptUnlistedFlatToApiBody(
  form: StockTransferFormData,
  niSkip: NetIncomeSkip = netIncomeSkipBySide(form),
): UnlistedReduced {
  return {
    transferNi: niSkip.transfer ? 0 : aggregateUnlistedNiPerShare(form, "EUTransfer"),
    transferNa: aggregateUnlistedNaPerShare(form, "EUTransfer"),
    acqNi: niSkip.acquisition ? 0 : aggregateUnlistedNiPerShare(form, "EUAcq"),
    acqNa: aggregateUnlistedNaPerShare(form, "EUAcq"),
  };
}
