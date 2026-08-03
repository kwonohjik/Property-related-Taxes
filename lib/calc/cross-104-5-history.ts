/**
 * §104⑤ 크로스 — **이력 후보 선별** 순수 함수 (C-3c)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §4.2
 *
 * 화면은 IndexedDB에서 이력을 통째로 받아 이 함수들로 **연도별 후보**를 만든다.
 * 계산·네트워크는 하지 않는다 — 테스트 가능성을 위해 선별만 분리했다.
 */
import type { CalculationRecord } from "@/lib/storage/types";
import { extractStockTransferDate } from "@/lib/storage/title-generator";
import {
  extractRealEstateSide,
  extractOtherAssetSide,
  type CrossExtract,
} from "./cross-104-5-adapter";

/** 화면이 다루는 후보 1건 */
export interface CrossCandidate {
  record: CalculationRecord;
  /** 과세연도(YYYY) — 못 뽑으면 null이라 후보에서 빠진다 */
  taxYear: number | null;
  /** 어댑터 추출 결과 — `ok:false`면 「다시 계산」 안내 대상 */
  extract: CrossExtract;
}

/**
 * 이력 1건의 **과세연도**.
 *
 * 세 경로가 서로 다른 자리에 연도를 둔다(실측 — O-3):
 * - 부동산 **다자산**: `inputData.taxYear`(number, `__multiTransfer` 플래그 동반)
 * - 부동산 **단건**: `inputData.transferDate`("YYYY-MM-DD")
 * - **주식**: `extractStockTransferDate(inputData)` — `business-key.ts`가 이미 쓰는 함수
 */
export function extractTaxYear(rec: CalculationRecord): number | null {
  const input = rec.inputData ?? {};

  if (typeof input.taxYear === "number" && Number.isFinite(input.taxYear)) {
    return input.taxYear;
  }
  if (rec.taxType === "stock_transfer") {
    const d = extractStockTransferDate(input);
    return d ? Number(d.slice(0, 4)) : null;
  }
  if (typeof input.transferDate === "string" && input.transferDate.length >= 4) {
    const y = Number(input.transferDate.slice(0, 4));
    return Number.isFinite(y) ? y : null;
  }
  // 최후 수단 — 다자산은 `taxLawVersion = String(taxYear)`로 저장한다.
  const v = Number(rec.taxLawVersion?.slice(0, 4));
  return Number.isFinite(v) ? v : null;
}

/** 부동산 후보 — `taxType === "transfer"` */
export function buildRealEstateCandidates(records: CalculationRecord[]): CrossCandidate[] {
  return records
    .filter((r) => r.taxType === "transfer")
    .map((record) => ({
      record,
      taxYear: extractTaxYear(record),
      extract: extractRealEstateSide(record.resultData ?? {}),
    }));
}

/**
 * 기타자산 후보 — `taxType === "stock_transfer"` 중 **§104⑤ 대상만**.
 *
 * 🔒 주식(§94①3호)은 본문이 열거하지 않아 대상이 아니다. 어댑터가 그 사유로 `ok:false`를 내므로
 *   **후보 목록에서 아예 제외**한다 — 「다시 계산하면 된다」가 아니기 때문이다.
 */
export function buildOtherAssetCandidates(records: CalculationRecord[]): CrossCandidate[] {
  return records
    .filter((r) => r.taxType === "stock_transfer")
    .map((record) => ({
      record,
      taxYear: extractTaxYear(record),
      extract: extractOtherAssetSide(record.resultData ?? {}),
    }))
    .filter((c) => c.extract.ok || !c.extract.reason.includes("§94①3호"));
}

/** 양쪽에 **후보가 하나씩이라도 있는** 과세연도만 — 내림차순 */
export function crossableYears(
  realEstate: CrossCandidate[],
  otherAsset: CrossCandidate[],
): number[] {
  const reYears = new Set(realEstate.map((c) => c.taxYear).filter((y): y is number => y !== null));
  const oaYears = otherAsset.map((c) => c.taxYear).filter((y): y is number => y !== null);
  return [...new Set(oaYears.filter((y) => reYears.has(y)))].sort((a, b) => b - a);
}

/**
 * §103② 기본공제 **중복 감지**(R-2).
 *
 * 부동산과 기타자산은 **같은 §103②1호 그룹**이라 250만원은 합쳐서 1회다. 두 계산이 각각
 * 썼으면 합계가 한도를 넘는다.
 *
 * ⚠️ **감지만 한다.** 해소는 재계산이며 어느 쪽에 몰아줄지는 화면이 2안을 비교해 정한다(U-1).
 */
export const BASIC_DEDUCTION_LIMIT = 2_500_000;

export function detectBasicDeductionOverlap(args: {
  realEstateBasicDeduction: number;
  otherAssetBasicDeduction: number;
}): { total: number; exceeded: boolean; excess: number } {
  const total = args.realEstateBasicDeduction + args.otherAssetBasicDeduction;
  const excess = Math.max(0, total - BASIC_DEDUCTION_LIMIT);
  return { total, exceeded: excess > 0, excess };
}
