/**
 * 일반건물 §99-164-10 환산주택가격 — **술어·파생 단일 소스** (순수 함수)
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` §4.4·§7.5
 *
 * ## 왜 순수 함수인가
 *
 * 두 값이 **UI 게이트·validate(⑧)·API 변환(④)** 세 층에서 똑같이 쓰인다. 각 층이 인라인으로
 * 재기술하면 한 곳만 고쳐질 때 조용히 갈린다 — 「칸이 없는데 차단」 또는 「칸은 있는데 안 쓰임」
 * (memory `feedback_shared_predicate_argument_parity` · `feedback_ui_engine_dual_truth_avoidance`).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";

/** `isGbFirstDisclosureApplicable`가 읽는 필드만. */
type GateAsset = Pick<
  AssetForm,
  | "landAcqMode"
  | "buildingAcqMode"
  | "isSalesCaseAcquisition"
  | "isAppraisalAcquisition"
  | "useEstimatedAcquisition"
>;

/**
 * §99-164-10(환산주택가격)이 적용될 수 있는 상태인가 = **토지·건물 중 하나라도 환산인가**.
 *
 * ## 축이 `useEstimatedAcquisition`(플래그)이 **아니라** 파트인 이유
 *
 * API 변환이 최초공시 payload를 싣는 조건이 **파트 축**이다
 * (`transfer-tax-api-gb.ts` `anyEstimated` — `effectivePartAcqMode` 2개의 OR).
 * UI·validate가 플래그 축을 쓰면 **분리 취득 + 파트만 환산**에서 축이 어긋난다:
 * API는 전송할 준비가 됐는데 토글이 뜨지 않아 **입력 경로가 없는 트리거**가 된다
 * (memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * `effectivePartAcqMode`는 파트 미선택 시 자산 전체 레거시 플래그로 폴백하므로
 * **분리 OFF + 환산도 그대로 포함**한다 — 플래그 축의 상위 개념이다(종전 노출은 전부 유지).
 *
 * ⚠️ 주택 자산의 형제 기능 §164⑤ PHD는 플래그 축을 쓴다
 * (`transfer-tax-validate-asset.ts` `isEstimated`). 그 술어를 여기로 복제하지 말 것 —
 * PHD는 토지·건물 파트 분리 축이 없는 자산용이라 전제가 다르다.
 */
export function isGbFirstDisclosureApplicable(asset: GateAsset): boolean {
  return (
    effectivePartAcqMode(asset.landAcqMode, asset) === "estimated" ||
    effectivePartAcqMode(asset.buildingAcqMode, asset) === "estimated"
  );
}

/** `gbFirstDisclosureLandStdPriceOf`가 읽는 필드만. */
type LandStdAsset = Pick<
  AssetForm,
  "gbFirstDisclosureLandPricePerSqm" | "gbFirstDisclosureLandStdPrice" | "gbLandArea"
>;

/**
 * 최초공시 당시 **토지 기준시가 총액**(원, 정수) — 엔진 `firstDisclosureLandStdPrice`의 값.
 *
 * ```
 * floor(㎡당 공시지가 × 토지면적)  ||  legacy 총액 직접 입력
 * ```
 *
 * ## 왜 legacy 총액을 남기는가
 *
 * 종전 UI는 총액을 직접 받았다(`gbFirstDisclosureLandStdPrice`). 통합하며 취득·양도와 같은
 * ㎡당 단가 입력으로 바꿨지만, 구형 sessionStorage에 총액만 든 자산이 **계산 불가**가 되면
 * 안 된다. 총액 ÷ 면적으로 단가를 역산하는 것도 금지다 — 면적 0·소수 손실로 조용히 틀린다.
 *
 * ⚠️ **유령 값 주의**: 단가를 지우면 legacy 총액이 되살아난다(화면 0 · 계산은 총액). UI는
 *    「저장된 총액 N원을 사용합니다 · 지우기」를 표시해 그 값을 버릴 경로를 반드시 제공한다.
 *
 * ## floor를 쓰는 이유
 *
 * Zod가 `z.number().int()`를 요구한다(`transfer-tax-building-schemas.ts`). 면적이 소수면
 * 곱이 소수가 되어 400이 난다.
 *
 * ⚠️ 엔진은 **분자**(취득당시 토지)를 `단가 × landArea`로 **floor 없이** 계산한다
 *    (`general-building-converted-housing.ts`). 분모만 정수인 이 비대칭은 **현행 그대로**다 —
 *    종전에도 총액을 정수로 직접 입력받았으므로 이번 변경으로 달라지는 것이 없다.
 */
export function gbFirstDisclosureLandStdPriceOf(asset: LandStdAsset): number {
  const perSqm = parseAmount(asset.gbFirstDisclosureLandPricePerSqm);
  const area = parseDecimal(asset.gbLandArea);
  if (perSqm > 0 && area > 0) return Math.floor(perSqm * area);
  return parseAmount(asset.gbFirstDisclosureLandStdPrice);
}

/**
 * legacy 총액이 **fallback으로 실제 쓰이는 중인가** — UI 안내줄(「저장된 총액 사용」) 노출 조건.
 *
 * 단가가 들어오면 legacy는 무시되므로 안내도 사라진다. UI가 이 판정을 재기술하면
 * 위 함수와 갈려 「안내는 없는데 계산은 총액」이 된다.
 */
export function gbFirstDisclosureUsesLegacyLandTotal(asset: LandStdAsset): boolean {
  const perSqm = parseAmount(asset.gbFirstDisclosureLandPricePerSqm);
  const area = parseDecimal(asset.gbLandArea);
  return !(perSqm > 0 && area > 0) && parseAmount(asset.gbFirstDisclosureLandStdPrice) > 0;
}
