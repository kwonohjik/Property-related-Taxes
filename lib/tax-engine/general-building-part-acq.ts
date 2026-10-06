/**
 * 일반건물 — **파트별 취득 방식**(토지·건물 각각 실가/환산) 적용 (2026-08-05 P3).
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.3
 *
 * ## 왜 환산 경로에 붙는가
 *
 * 산정방식이 파트마다 다른 자산(예: 토지 실거래가 + 건물 환산)은 **환산 경로**로 라우팅한다
 * (사용자 확정 2026-08-05). 그 경로만이 파트별 취득시 기준시가·개산공제(§163⑥) 구조를
 * 이미 갖고 있어, 실가 파트를 「그 파트의 실지거래가액 + 개산공제 0」 예외로 처리하면 되기 때문이다.
 * 반대로 실가 경로는 개산공제 개념 자체가 없어 환산 파트를 새로 이식해야 한다.
 *
 * ## 규약
 *
 * - **환산 파트**: 종전 그대로 — 환산취득가(§176의2②) + 개산공제(§163⑥ 3%)
 * - **실가 파트만** 개산공제 **제외**: §163⑥은 「소득세법」 제97조 제2항 제2호 「그 밖의 경우」
 *   (= 같은 조 제1항 제1호 **나목** — 매매사례가액·감정가액·환산취득가액)의 필요경비 의제라,
 *   실지거래가액(가목) 파트에만 근거가 없다. 감정·매매사례 파트는 **개산공제 대상이다**.
 * - 비-환산 파트의 취득가액은 그 파트 값(실지거래가액·감정가액·매매사례가액)으로 교체한다.
 * - 파트 값 미입력은 `null`로 승격해 호출부가 차단한다 — `?? 0`으로 메우면
 *   「취득가액 0 + 개산공제 0」이 조용한 과대과세가 된다.
 *
 * ## 회귀 0
 *
 * 두 파트가 모두 환산이면(= 종전 유일 경로) 이 모듈은 **입력을 그대로 돌려준다**.
 * 산식은 `calcPartAcquisitionPrice`(`transfer-tax-split-gain.ts`) 단일 정본을 쓴다 —
 * 주택·건물 split 경로와 같은 함수다(dual-truth 회피).
 */
import { calcPartAcquisitionPrice, type PartAcqMode } from "./transfer-tax-split-gain";
import { safeMultiplyThenDivide } from "./tax-utils";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

export interface PartAcqModeInput {
  /** 토지 파트 취득 방식 — 미주입 시 환산(이 경로의 기본) */
  landAcqMode?: PartAcqMode;
  /** 건물 파트 취득 방식 — 미주입 시 환산 */
  buildingAcqMode?: PartAcqMode;
  /** 파트별 실지거래가액(§97①1호) — 비-환산 파트에서 필수 */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  /**
   * 토지·건물 **일괄** 취득가액 — 분리 OFF(자산 단위) 감정가액·매매사례가액의 총액.
   * 적용 조건은 `usesBundledPartAcquisition` 한 곳이 정한다.
   */
  bundledAcquisitionPrice?: number;
  /** 증축(3파트) 경로는 `bundledAcquisitionPrice`를 원건물 일괄 실가로 쓰므로 이 규칙에서 제외한다. */
  extensionInfo?: unknown;
  /** 일괄 총액 안분 base — 취득시 기준시가(토지 ㎡당 × 면적 · 건물 총액). 비-actual 파트가 이미 요구하는 값이다. */
  acquisitionLandPricePerSqm?: number;
  acquisitionBuildingStdPrice?: number;
  landArea?: number;
}

export interface PartPair {
  land: number;
  building: number;
}

export interface PartAcqModeResult {
  acquisition: PartPair;
  estimatedDeduction: PartPair;
  /** 카드의 `usedEstimatedAcquisition`·`estimatedBase` 판정 — 파트별 */
  landUsedEstimated: boolean;
  buildingUsedEstimated: boolean;
  /** 카드 `acquisitionMode` echo(E-1) — 파트별 유효 취득 방식 */
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  /** 미입력 파트 이름 — 비어 있지 않으면 호출부가 차단해야 한다 */
  missingParts: string[];
}

/**
 * **자산 단위(분리 OFF) 감정가액·매매사례가액 일괄 총액을 토지·건물로 나눠야 하는가** — 엔진·⑫ refine이 공유하는 단일 술어.
 *
 * 성립 조건(모두):
 *   · 증축 없음(증축은 `bundledAcquisitionPrice`를 원건물 일괄 실가로 쓴다)
 *   · 두 파트 모드가 **같은** `appraisal` 또는 `salesCase`(분리 OFF 불변식 — 두 파트가 같은 값)
 *   · 그 모드가 읽는 **파트 값이 둘 다 없음**(감정 = `*AcquisitionPrice` · 매매사례 = `*SalesCaseValue`)
 *   · 일괄 총액 > 0
 * 파트 값이 **한쪽만** 있으면 이 술어는 거짓이고 `applyPartAcqModes`가 그 반대 파트를 `missingParts`로 돌려준다 —
 * 잔액으로 메우지 않는다(자동 안분 fallback 금지).
 */
export function usesBundledPartAcquisition(input: {
  landAcqMode?: PartAcqMode;
  buildingAcqMode?: PartAcqMode;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  bundledAcquisitionPrice?: number;
  extensionInfo?: unknown;
}): boolean {
  if (input.extensionInfo !== undefined) return false;
  const mode = input.landAcqMode;
  if (mode !== input.buildingAcqMode) return false;
  if (mode !== "appraisal" && mode !== "salesCase") return false;
  if (!((input.bundledAcquisitionPrice ?? 0) > 0)) return false;
  const [land, building] =
    mode === "salesCase"
      ? [input.landSalesCaseValue, input.buildingSalesCaseValue]
      : [input.landAcquisitionPrice, input.buildingAcquisitionPrice];
  return !((land ?? 0) > 0) && !((building ?? 0) > 0);
}

/**
 * 일괄 총액을 **취득시 기준시가 비율**로 토지·건물에 나눈다 — 「소득세법」 제100조 제2항 본문 「취득 당시」.
 * 토지 = floor(총액 × 토지 기준시가 ÷ (토지 + 건물 기준시가)), 건물 = 총액 − 토지(잔액 흡수).
 * 중간곱이 2^53을 넘을 수 있어 `safeMultiplyThenDivide`를 쓴다. 분모가 0이면 조용히 0으로 메우지 않고 던진다.
 */
function splitBundledByAcquisitionStd(input: PartAcqModeInput, total: number): PartPair {
  const landStd = multiplyByArea(input.acquisitionLandPricePerSqm ?? 0, input.landArea ?? 0);
  const buildingStd = input.acquisitionBuildingStdPrice ?? 0;
  if (!(landStd > 0) || !(buildingStd > 0)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물: 감정가액·매매사례가액 총액을 토지·건물로 나눌 수 없습니다 — 취득시 토지 공시지가와 건물 기준시가를 입력하세요 (소득세법 §100②).",
      { landStd, buildingStd },
    );
  }
  const land = Math.floor(safeMultiplyThenDivide(total, landStd, landStd + buildingStd));
  return { land, building: total - land };
}

/** 두 파트가 모두 환산인가 — 종전 경로와 동일한지 판정(회귀 0 조기 반환). */
export function isAllEstimatedParts(input: PartAcqModeInput): boolean {
  return (
    (input.landAcqMode ?? "estimated") === "estimated" &&
    (input.buildingAcqMode ?? "estimated") === "estimated"
  );
}

/**
 * 환산 산출값에 파트별 취득 방식을 적용한다.
 *
 * @param acquisition        환산취득가 산출값 (§176의2②)
 * @param estimatedDeduction 개산공제 산출값 (§163⑥)
 */
export function applyPartAcqModes(
  input: PartAcqModeInput,
  acquisition: PartPair,
  estimatedDeduction: PartPair,
): PartAcqModeResult {
  const landMode: PartAcqMode = input.landAcqMode ?? "estimated";
  const buildingMode: PartAcqMode = input.buildingAcqMode ?? "estimated";

  if (landMode === "estimated" && buildingMode === "estimated") {
    return {
      acquisition,
      estimatedDeduction,
      landUsedEstimated: true,
      buildingUsedEstimated: true,
      landMode,
      buildingMode,
      missingParts: [],
    };
  }

  /**
   * 🔴 개산공제 대상은 **「그 밖의 경우」 전부**다 — 환산만이 아니다(2026-08-05 P7 정정).
   *
   * 「소득세법」 제97조 제2항 제2호는 같은 조 제1항 제1호 **나목**(매매사례가액·감정가액·
   * 환산취득가액)을 쓰는 경우를 묶어 "그 밖의 경우"로 부르고, 그 필요경비에 시행령
   * 제163조 제6항의 개산공제를 더한다. 실지거래가액(가목) 파트만 제외 대상이다.
   *
   * 형제 경로도 같은 술어다 — `transfer-tax-split-gain.ts:526-527` `landMode !== "actual"`.
   * 종전 구현은 `=== "estimated"`라 감정·매매사례 파트의 개산공제를 **누락**시켰다
   * (현재 UI는 2종만 노출해 도달 불가였으나 Zod는 4종을 허용한다).
   */
  const landDeductible = landMode !== "actual";
  const buildingDeductible = buildingMode !== "actual";

  /**
   * 비-환산 파트는 **파트별 완결**이다 — 총액을 참조하지 않는다.
   * `isSeparate: true`가 그 규약이고, `landRatio: null`은 안분 경로가 쓰이지 않음을 뜻한다
   * (총액 안분이 필요한 조합은 애초에 이 경로로 오지 않는다).
   */
  const ctx = {
    isSeparate: true,
    landRatio: null,
    landAcquisitionPrice: input.landAcquisitionPrice,
    buildingAcquisitionPrice: input.buildingAcquisitionPrice,
    landSalesCaseValue: input.landSalesCaseValue,
    buildingSalesCaseValue: input.buildingSalesCaseValue,
  };

  const missingParts: string[] = [];

  // 분리 OFF 자산 단위 감정·매매사례 — 총액을 취득시 기준시가 비율로 나눈다(`usesBundledPartAcquisition`).
  const bundledPair = usesBundledPartAcquisition({ ...input, landAcqMode: landMode, buildingAcqMode: buildingMode })
    ? splitBundledByAcquisitionStd(input, input.bundledAcquisitionPrice!)
    : null;

  // 환산 파트는 이미 계산된 값을 유지하고, 비-환산 파트만 파트 값으로 교체한다.
  // 기준시가 인자는 환산 모드에서만 소비되므로 여기서는 0을 넘겨도 무해하다.
  const landRaw = bundledPair
    ? bundledPair.land
    : landMode === "estimated"
      ? acquisition.land
      : calcPartAcquisitionPrice(landMode, true, 0, 0, 0, ctx);
  const buildingRaw = bundledPair
    ? bundledPair.building
    : buildingMode === "estimated"
      ? acquisition.building
      : calcPartAcquisitionPrice(buildingMode, false, 0, 0, 0, ctx);

  if (landRaw == null) missingParts.push("토지");
  if (buildingRaw == null) missingParts.push("건물");

  return {
    acquisition: { land: landRaw ?? 0, building: buildingRaw ?? 0 },
    estimatedDeduction: {
      // §163⑥은 **추계** 취득가액(나목)의 필요경비 의제 — 실지거래가액 파트만 제외한다.
      land: landDeductible ? estimatedDeduction.land : 0,
      building: buildingDeductible ? estimatedDeduction.building : 0,
    },
    landUsedEstimated: landMode === "estimated",
    buildingUsedEstimated: buildingMode === "estimated",
    landMode,
    buildingMode,
    missingParts,
  };
}
