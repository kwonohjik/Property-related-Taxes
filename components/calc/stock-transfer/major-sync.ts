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
