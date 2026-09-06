/**
 * 겸용주택 면적 검증 — `transfer-tax-validate-asset.ts`에서 추출 (800줄 정책).
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.plan.md §3-4
 *
 * ⑧ 동기화 — UI 표시·API 변환(`transfer-tax-api-mixed-use.ts`)과 **동일한 three-state 규칙**:
 *   빈값 = 자동 안분 / "0" = 적법한 0. 문자열 수준 분기(`(x ?? "").trim() !== ""`).
 */

import { round2 } from "@/lib/tax-engine/area-utils";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { APPURTENANT_ZONE_OPTIONS } from "@/components/calc/transfer/appurtenant-zone-options";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 「선택이 세액을 가르는가」의 임계 배율 — **엔진 표에서 파생한다**(하드코딩 금지).
 *
 * 초과면적 = max(0, 부수토지 − 정착면적 × 배율)이므로, 부수토지가 **도달 가능한 최소 배율**
 * 이하이면 어느 용도지역을 골라도 초과가 0이라 결과가 같다. 그 최소 배율은 축마다 다르다:
 *   · 수도권 · 2022.1.1. 이후 양도 → 주·상·공 **3배**
 *   · 수도권 밖 → 도시지역 전 구간 **5배** (3배는 애초에 도달 불가)
 *   · 2022.1.1. 전 양도(부칙 §39 경과조치) → 도시지역 일률 **5배**
 * ⇒ 상수를 적지 않고 `getHousingMultiplier`를 선택지 전체에 돌려 최솟값을 얻는다.
 *   표가 개정되면 게이트가 **자동으로** 따라온다.
 */
function minReachableMultiplier(isMetropolitan: boolean, transferDate?: string): number {
  const d = transferDate ? new Date(transferDate) : undefined;
  return Math.min(
    ...APPURTENANT_ZONE_OPTIONS.map(
      (o) => getHousingMultiplier(o.value as ZoneType, isMetropolitan, d).multiplier,
    ),
  );
}

/**
 * 겸용주택 면적 필수·범위·합계 검증. 통과 시 null.
 *
 * V2(부수토지 합계)는 **주택·상가 override가 둘 다 설정된 경우에만** 발동한다 —
 * 한쪽만이면 나머지가 잔액을 흡수해 합이 항상 전체와 같다(engine.design §1-1).
 */
export function validateMixedUseAreas(
  asset: AssetForm,
  label: string,
  /** 양도일 — 배율 경과조치(2022.1.1., 부칙 §39) 판정용. 미제공 시 현행 배율. */
  formTransferDate?: string,
): string | null {
  if (!asset.residentialFloorArea || parseFloat(asset.residentialFloorArea) <= 0)
    return `${label}: 주택 연면적(㎡)을 입력하세요. (면적 정보 — 전용/공통 입력 시 자동 파생)`;
  if (!asset.nonResidentialFloorArea || parseFloat(asset.nonResidentialFloorArea) <= 0)
    return `${label}: 상가 연면적(㎡)을 입력하세요. (면적 정보 — 전용/공통 입력 시 자동 파생)`;
  if (!asset.mixedUseTotalLandArea || parseFloat(asset.mixedUseTotalLandArea) <= 0)
    return `${label}: 전체 토지 면적(㎡)을 입력하세요. (면적 정보)`;
  if (!asset.buildingFootprintArea || parseFloat(asset.buildingFootprintArea) <= 0)
    return `${label}: 건물 정착면적(㎡)을 입력하세요. (면적 정보)`;

  const totalLandV = parseFloat(asset.mixedUseTotalLandArea) || 0;
  const footprintV = parseFloat(asset.buildingFootprintArea) || 0;
  // 부수토지 override는 PHD 여부와 무관하게 유효하다(2026-07-15 배타 해제).
  // UI·API·사이드바가 모두 PHD 무게이트이므로 여기도 게이트를 두면 안 된다
  // (UI 통과 ↔ validate 차단 모순 — 3중 패턴).
  const landOv = (asset.mixedResidentialLandAreaOverride ?? "").trim();
  const commLandOv = (asset.mixedCommercialLandAreaOverride ?? "").trim();
  const fpOv = (asset.mixedResidentialFootprintOverride ?? "").trim();

  // ── override 범위 가드 (three-state: 빈값=자동, 0 적법) ──
  const guards: ReadonlyArray<readonly [string, string, number, string]> = [
    [landOv, "주택 부수토지", totalLandV, "전체 토지면적"],
    [commLandOv, "상가 부수토지", totalLandV, "전체 토지면적"],
    [fpOv, "주택 정착면적", footprintV, "건물 정착면적"],
  ];
  for (const [raw, name, max, maxLabel] of guards) {
    if (raw === "") continue;
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0 || v > max)
      return `${label}: ${name} 면적은 0 이상 ${maxLabel} 이하로 입력하세요. (면적 정보)`;
  }

  /**
   * ── V3 용도지역 — **배율이 실제로 갈릴 때만** 묻는다 (2026-09-06 · UI 리뷰) ──
   *
   * 부수토지 배율(영 §168의12·§154⑦)은 **용도지역 × 수도권 2축**으로 3배·5배·10배가 갈린다.
   * 종전에는 폼에 용도지역 축이 없어 ④가 `"residential"`을 하드코딩했고, 그래서 「도시지역
   * 밖 10배」가 도달하지 않아 비도시지역 상가주택의 초과 부수토지가 과대 계산됐다.
   *
   * ⚠️ **무조건 묻지 않는다.** 주택 부수토지가 **도달 가능한 최소 배율** 이하면 어느 용도지역을
   *   골라도 초과분이 0이라 세액이 같다 — 그때 요구하면 필요 없는 입력을 강제하는 오탐이다
   *   (§97의3⑤ 안분 기준시가 게이트와 같은 방식). 임계는 `minReachableMultiplier`가 엔진 표에서
   *   파생한다(수도권 3배 / 수도권 밖·2022 前 5배).
   *
   * 미선택으로 남겨 두면 엔진 폴백(`?? "residential"`)이 종전 동작을 유지한다 —
   * 구 세션·기존 E2E는 초과가 없으면 그대로 통과한다.
   */
  if (!(asset.mixedZoneType ?? "").trim()) {
    const derived = computeDerivedAreas({
      residentialFloorArea: parseFloat(asset.residentialFloorArea) || 0,
      nonResidentialFloorArea: parseFloat(asset.nonResidentialFloorArea) || 0,
      buildingFootprintArea: footprintV,
      totalLandArea: totalLandV,
      ...(landOv !== "" ? { residentialLandAreaOverride: parseFloat(landOv) || 0 } : {}),
      ...(commLandOv !== "" ? { commercialLandAreaOverride: parseFloat(commLandOv) || 0 } : {}),
      ...(fpOv !== "" ? { residentialFootprintOverride: parseFloat(fpOv) || 0 } : {}),
    });
    /**
     * 도달 가능한 **최소 배율**로도 초과가 생기면 용도지역이 세액을 가른다.
     *
     * ⚠️ **임계를 3으로 고정하면 안 된다** — 수도권 **밖**은 도시지역이 일률 5배라 3배가
     *   애초에 도달 불가다. 고정하면 3~5배 구간에서 「어느 용도지역을 골라도 초과 0」인데도
     *   선택을 강제하는 오탐이 된다(리뷰 게이트 실측).
     *
     * ⚠️ **정착면적 0은 제외한다** — 인정면적이 0이라 어느 배율을 골라도 초과분이 같다
     *   (0 × 3 = 0 × 10). 여기서 묻으면 세액과 무관한 입력을 강제하는 오탐이 된다
     *   (`mixed-use-area-validate.anchor` 「주택 정착면적 = 0 (three-state 적법)」이 실측).
     */
    const minMultiplier = minReachableMultiplier(
      asset.mixedIsMetropolitanArea !== false,
      formTransferDate,
    );
    if (
      derived.residentialFootprintArea > 0 &&
      derived.residentialLandArea > derived.residentialFootprintArea * minMultiplier
    ) {
      return `${label}: 부수토지가 정착면적의 ${minMultiplier}배를 넘습니다 — 배율(3·5·10배)이 세액을 가르므로 용도지역을 선택하세요 (「소득세법 시행령」 §168의12·§154⑦). (면적 정보)`;
    }
  }

  // ── V2 부수토지 합계 ──
  // ⚠️ `totalLandV > 0` 게이트 필수 — 전체 토지를 입력하지 않는 기존 E2E를 보호한다.
  if (totalLandV > 0 && landOv !== "" && commLandOv !== "") {
    const sum = round2((parseFloat(landOv) || 0) + (parseFloat(commLandOv) || 0));
    if (sum !== round2(totalLandV))
      return `${label}: 주택 부수토지 + 상가 부수토지(${sum}㎡)가 전체 토지 면적(${round2(totalLandV)}㎡)과 다릅니다. (면적 정보)`;
  }
  return null;
}
