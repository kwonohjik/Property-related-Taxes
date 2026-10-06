/**
 * 겸용주택 — 「주택건물 기준시가(나목)」 UI 어댑터 (S3-2).
 *
 * ⑤ 노출 · ④ 전송 · ⑧ 필수가 **같은 함수**를 호출한다(3중 패턴). 판정 규칙은 엔진 leaf
 * (`lib/tax-engine/mixed-use-housing-std.ts`)에만 있고 — 엔진·⑫ Zod도 같은 leaf를 부른다 — 이 파일은
 * 폼 문자열 → leaf 인자 변환만 한다. PHD·용도변경 방향·상속증여 규칙을 여기 다시 쓰지 않는다(dual-truth 금지).
 *
 * 인자의 원천은 ④ `buildMixedUsePayload`가 엔진·⑫에 보내는 값과 같다(`mixed-use-acq-date-split.ts`와 동일 식):
 *   · usePhd = `usePreHousingDisclosure` (④가 `usePreHousingDisclosure`로 그대로 전송)
 *   · 용도변경 방향 = `hasPartialUsageChange && partialChangeDirection`일 때만
 *   · 상속·증여 = 취득원인 ∧ 취득일 ≥ 1985-01-01 (④ `acquisitionByInheritance/Gift`의 날짜 게이트와 동일)
 *
 * 값 해소에 **폴백이 없다** — 미입력은 0 그대로이고 ⑧이 막는다(자동 안분 fallback 금지).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
  isHousingPriceAtTransferRequired,
  type HousingStdNeedInput,
} from "@/lib/tax-engine/mixed-use-housing-std";

/** 겸용 주택 자산인가 — 모든 술어의 선행 게이트. */
function isMixedHousing(a: AssetForm): boolean {
  return a.assetKind === "housing" && a.isMixedUseHouse === true;
}

/** 폼 → leaf 인자. ④가 엔진에 보내는 값과 같은 파생이다. */
export function housingStdNeedInputOf(a: AssetForm): HousingStdNeedInput {
  return {
    usePhd: a.usePreHousingDisclosure,
    partialDirection:
      a.hasPartialUsageChange && a.partialChangeDirection ? a.partialChangeDirection : undefined,
    byInheritanceOrGift:
      (a.acquisitionCause === "inheritance" || a.acquisitionCause === "gift") &&
      (a.acquisitionDate ?? "") >= "1985-01-01",
  };
}

/** ⑤ 노출 · ④ 전송 · ⑧ 필수의 **같은 술어** — 취득시 주택건물 기준시가. 겸용 주택이 아니면 거짓. */
export function needsMixedHousingBuildingStdAtAcq(a: AssetForm): boolean {
  return isMixedHousing(a) && isHousingBuildingStdAtAcqRequired(housingStdNeedInputOf(a));
}

/** ⑤ 노출 · ④ 전송 · ⑧ 필수의 **같은 술어** — 양도시 주택건물 기준시가. */
export function needsMixedHousingBuildingStdAtTransfer(a: AssetForm): boolean {
  return isMixedHousing(a) && isHousingBuildingStdAtTransferRequired(housingStdNeedInputOf(a));
}

/** 취득시 개별주택가격(H) 필수 술어 — 기존 ⑧ H 검사와의 격자 패리티 검증용(상속·증여는 거짓 — Q-B). */
export function needsMixedHousingPriceAtAcq(a: AssetForm): boolean {
  return isMixedHousing(a) && isHousingPriceAtAcqRequired(housingStdNeedInputOf(a));
}

/** 양도시 개별주택가격(H_T) 필수 술어 — 격자 패리티 검증용. */
export function needsMixedHousingPriceAtTransfer(a: AssetForm): boolean {
  return isMixedHousing(a) && isHousingPriceAtTransferRequired(housingStdNeedInputOf(a));
}

/**
 * ④·⑧이 쓰는 값. `parseAmount`는 null/undefined를 0으로 돌려주므로 stale sessionStorage(필드 없음)에도 안전하다.
 * 폴백 없음 — 술어 참인데 비어 있으면 0 그대로(⑧이 막고, ⑫·엔진도 막는다).
 */
export function mixedAcqHousingBuildingStd(a: Pick<AssetForm, "mixedAcqHousingBuildingStdPrice">): number {
  return parseAmount(a.mixedAcqHousingBuildingStdPrice);
}

export function mixedTransferHousingBuildingStd(
  a: Pick<AssetForm, "mixedTransferHousingBuildingStdPrice">,
): number {
  return parseAmount(a.mixedTransferHousingBuildingStdPrice);
}

/**
 * 모달 prefill 연면적(문자열, ㎡) — **표시 보조**일 뿐 저장값이 아니다(사용자가 모달에서 고친다).
 *
 * - 취득시 + 용도변경 주택→상가: 취득시에는 전체가 주택이었다 — 엔진 `computeAcqDerivedAreas`와 같은 규칙
 *   (`partialChangeAcqResidentialArea` 입력값, 없으면 양도시 주택 + 상가 연면적 합).
 * - 그 밖: 주택 연면적 `residentialFloorArea`.
 */
export function housingFloorAreaForModal(a: AssetForm, timePoint: "acq" | "transfer"): string {
  if (timePoint === "acq" && a.hasPartialUsageChange && a.partialChangeDirection === "house_to_commercial") {
    const entered = parseFloat(a.partialChangeAcqResidentialArea);
    if (entered > 0) return String(entered);
    const total = (parseFloat(a.residentialFloorArea) || 0) + (parseFloat(a.nonResidentialFloorArea) || 0);
    return total > 0 ? String(total) : "";
  }
  return a.residentialFloorArea ?? "";
}
