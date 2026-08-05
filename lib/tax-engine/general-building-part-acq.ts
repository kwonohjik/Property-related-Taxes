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
  /** 미입력 파트 이름 — 비어 있지 않으면 호출부가 차단해야 한다 */
  missingParts: string[];
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

  // 환산 파트는 이미 계산된 값을 유지하고, 비-환산 파트만 파트 값으로 교체한다.
  // 기준시가 인자는 환산 모드에서만 소비되므로 여기서는 0을 넘겨도 무해하다.
  const landRaw =
    landMode === "estimated"
      ? acquisition.land
      : calcPartAcquisitionPrice(landMode, true, 0, 0, 0, ctx);
  const buildingRaw =
    buildingMode === "estimated"
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
    missingParts,
  };
}
