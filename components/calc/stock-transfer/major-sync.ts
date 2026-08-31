/**
 * 주식 양도세 대주주 자동 동기화 유틸 — F-9 (2026-05-17)
 *
 * 입력 patch 적용 후 자동 산출된 isMajorShareholder를 함께 갱신하는 wrapper 패턴.
 * F-8(MajorShareholderBlock 내부) + F-9(부모 컴포넌트 marketType 변경 시) 공용.
 *
 * 정책:
 * - useEffect → store 미러링 금지 (feedback_useeffect_store_mirror_forbidden)
 * - onChange 시점에만 동기화 발생 (렌더 사이클 무관)
 * - 자동 판정 미지원(other_asset 또는 priorYearEndDate 미입력) 시 patch만 전달
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

/** 자동 산출 — 입력 patch가 적용된 가상 form으로 대주주 여부 재계산 */
export function computeAutoIsMajor(
  form: Pick<
    StockTransferFormData,
    | "marketType"
    | "priorYearEndDate"
    | "selfShareRatio"
    | "selfMarketCap"
    | "isLargestShareholderGroup"
    | "combinedShareRatio"
    | "combinedMarketCap"
    // 🔴 2026-08-28(리뷰 #14 부수) — 비상장 벤처 40억 임계 축이 빠져 있어 엔진·UI 배지와
    //   **다른 인자 집합**으로 같은 술어를 불렀다([[feedback_shared_predicate_argument_parity]]).
    //   그 결과 비상장 벤처 + 시총 10억~40억 대역에서 저장값(대주주)과 화면·엔진(비대주주)이
    //   갈려, 사용자가 없앨 수 없는 상시 오탐 경고가 떴다(세액은 엔진 자동 산출이 우선이라 무영향).
    | "isVentureCompany"
    | "isKOTCTrading"
  >,
  patch: Partial<StockTransferFormData>,
): boolean | undefined {
  const merged = { ...form, ...patch };

  if (
    merged.marketType !== "kospi" &&
    merged.marketType !== "kosdaq" &&
    merged.marketType !== "konex" &&
    merged.marketType !== "unlisted"
  ) {
    return undefined;
  }

  if (!merged.priorYearEndDate) return undefined;

  const t = getMajorShareholderThreshold(
    merged.marketType,
    new Date(merged.priorYearEndDate),
    // 엔진(`stock-classification.ts:113`)·UI 배지(`MajorShareholderBlock.tsx:123`)와 동일 인자.
    { isVentureCompany: merged.isVentureCompany, isKOTCTrading: merged.isKOTCTrading },
  );

  const selfRatio = parseDecimal(merged.selfShareRatio) * 0.01;
  const selfCap = parseAmount(merged.selfMarketCap);
  const combRatio = merged.isLargestShareholderGroup
    ? parseDecimal(merged.combinedShareRatio) * 0.01
    : 0;
  const combCap = merged.isLargestShareholderGroup
    ? parseAmount(merged.combinedMarketCap)
    : 0;

  return (
    selfRatio >= t.shareRatioThreshold ||
    (selfCap > 0 && selfCap >= t.marketCapThreshold) ||
    combRatio >= t.shareRatioThreshold ||
    (combCap > 0 && combCap >= t.marketCapThreshold)
  );
}

/**
 * onChange wrapper — patch에 자동 산출 isMajorShareholder를 합쳐 호출.
 *
 * 사용 예:
 *   const syncedChange = withAutoSyncMajor(form, onChange);
 *   syncedChange({ marketType: "unlisted" });  // marketType + isMajorShareholder 동시 갱신
 */
export function withAutoSyncMajor(
  form: Parameters<typeof computeAutoIsMajor>[0],
  onChange: (patch: Partial<StockTransferFormData>) => void,
): (patch: Partial<StockTransferFormData>) => void {
  return (patch: Partial<StockTransferFormData>) => {
    const autoIsMajor = computeAutoIsMajor(form, patch);
    if (autoIsMajor === undefined) {
      onChange(patch);
    } else {
      onChange({ ...patch, isMajorShareholder: autoIsMajor });
    }
  };
}
