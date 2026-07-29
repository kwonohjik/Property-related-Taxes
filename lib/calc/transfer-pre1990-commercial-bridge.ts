/**
 * 상가·오피스텔 §164⑥ + 1990.8.30. 이전 취득 토지 환산 브리지 (단일 진실 헬퍼).
 *
 * ## 왜 필요한가
 * §164⑥ 산식의 기준시가합 토지 성분은 「법 §99①1호 **가목**의 가액」(개별공시지가)이다
 * (시행규칙 §80③3호가 다목 자산 환산의 합계액을 "가목의 가액 + 나목의 가액"으로 명시).
 * 취득일이 1990-08-30 이전이면 개별공시지가가 없고, 그 경우 가목의 가액을 정하는 규정이 §164④다.
 * 검증: `docs/01-plan/features/commercial-164-4-appurtenant-land-verification.md`
 *
 * ## 왜 `hasPre1990`을 확장하지 않는가 (중요)
 * `transfer-tax-api.ts:89`의 `hasPre1990`은 `assetKind === "land"` 게이트이며, 발동하면
 * **acquisitionPrice=0 · useEstimatedAcquisition=false · standardPriceAtAcquisition=undefined**로
 * 자산을 통째로 pre1990Land 서브엔진 경로에 태운다. 상가에 이를 열면 §164⑥ 경로가 **무력화**된다.
 * → 게이트는 그대로 두고, **취득시 토지 ㎡당 가액만 파생**해 `cbLandPricePerSqmAtAcq`에 잇는다.
 *    겸용주택이 같은 이유로 쓰는 `transfer-pre1990-phd-bridge.ts`와 동일한 패턴이다.
 *
 * ## 정책
 * 파생만 하고 **store에 저장하지 않는다**(useEffect → store 미러링 금지).
 * 표시·API 변환·validate가 **같은 함수**로 값을 얻어 3중 패턴을 지킨다
 * (memory `feedback_store_default_vs_ui_display_fallback`).
 */

import {
  calculatePre1990LandValuation,
  type LandGradeInput,
} from "@/lib/tax-engine/pre-1990-land-valuation";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별공시지가 최초 고시일 — 이 날 이전 취득은 가목의 가액이 없다(§164④ 적용 구간). */
export const LAND_PRICE_NOTICE_START = "1990-08-30";

/** 상가 §164⑥ 경로에서 취득일이 개별공시지가 고시 전인가. 상속은 상속개시일 기준. */
export function isCommercialPre1990Acquisition(asset: AssetForm): boolean {
  const acqDate = commercialAcquisitionDate(asset);
  return !!acqDate && acqDate < LAND_PRICE_NOTICE_START;
}

/** §164⑥ 경로의 취득일 — 상속은 상속개시일이 취득일이다. */
export function commercialAcquisitionDate(asset: AssetForm): string {
  return asset.acquisitionCause === "inheritance"
    ? asset.inheritanceStartDate || asset.acquisitionDate || ""
    : asset.acquisitionDate || "";
}

/**
 * 1990.8.30. 이전 취득 상가 부수토지 — 취득시 토지 ㎡당 가액(원, 정수) 단일 진실.
 *
 * @returns 환산 ㎡당 가액 | null (구간 아님·미활성·입력 부족·대지면적 0 시)
 */
export function derivePre1990CommercialLandPricePerSqmAtAcq(
  asset: AssetForm,
  transferDate: string,
): number | null {
  if (!isCommercialPre1990Acquisition(asset)) return null;
  if (!asset.pre1990Enabled || !transferDate) return null;

  // §164⑥ 기준시가합의 토지 성분 면적 = 이 호에 귀속되는 대지권 면적
  const area = parseDecimal(asset.cbLandArea);
  if (!area || area <= 0) return null;

  const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(asset.pre1990Grade_current);
  const gPrev = buildGrade(asset.pre1990Grade_prev);
  const gAcq = buildGrade(asset.pre1990Grade_atAcq);
  const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
  if (!gCur || !gPrev || !gAcq || p1990 <= 0) return null;

  try {
    const r = calculatePre1990LandValuation({
      acquisitionDate: new Date(commercialAcquisitionDate(asset)),
      transferDate: new Date(transferDate),
      areaSqm: area,
      pricePerSqm_1990: p1990,
      // 환산엔 미사용 — validateInput 통과용 동일값 주입(PHD 브리지와 동일)
      pricePerSqm_atTransfer: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    });
    return r.pricePerSqmAtAcquisition;
  } catch {
    return null;
  }
}

/**
 * 위 파생값을 폼 문자열로 — display fallback(`value={asset.x || asString}`)용.
 * @returns ㎡당 가액 문자열 | "" (파생 불가 시 — fallback 체인이 다음 항으로 진행)
 */
export function derivePre1990CommercialLandPricePerSqmAtAcqString(
  asset: AssetForm,
  transferDate: string,
): string {
  const v = derivePre1990CommercialLandPricePerSqmAtAcq(asset, transferDate);
  return v !== null && v > 0 ? String(v) : "";
}

/**
 * API·validate 공용 — 취득시 토지 ㎡당 가액의 **최종 유효값**.
 * 사용자 직접 입력이 우선, 없으면 §164④ 환산 파생값.
 */
export function effectiveCommercialLandPriceAtAcq(
  asset: AssetForm,
  transferDate: string,
): number {
  return (
    parseAmount(asset.cbLandPricePerSqmAtAcq) ||
    (derivePre1990CommercialLandPricePerSqmAtAcq(asset, transferDate) ?? 0)
  );
}
