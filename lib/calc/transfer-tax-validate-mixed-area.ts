/**
 * 겸용주택 면적 검증 — `transfer-tax-validate-asset.ts`에서 추출 (800줄 정책).
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.plan.md §3-4
 *
 * ⑧ 동기화 — UI 표시·API 변환(`transfer-tax-api-mixed-use.ts`)과 **동일한 three-state 규칙**:
 *   빈값 = 자동 안분 / "0" = 적법한 0. 문자열 수준 분기(`(x ?? "").trim() !== ""`).
 */

import { round2 } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 겸용주택 면적 필수·범위·합계 검증. 통과 시 null.
 *
 * V2(부수토지 합계)는 **주택·상가 override가 둘 다 설정된 경우에만** 발동한다 —
 * 한쪽만이면 나머지가 잔액을 흡수해 합이 항상 전체와 같다(engine.design §1-1).
 */
export function validateMixedUseAreas(asset: AssetForm, label: string): string | null {
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

  // ── V2 부수토지 합계 ──
  // ⚠️ `totalLandV > 0` 게이트 필수 — 전체 토지를 입력하지 않는 기존 E2E를 보호한다.
  if (totalLandV > 0 && landOv !== "" && commLandOv !== "") {
    const sum = round2((parseFloat(landOv) || 0) + (parseFloat(commLandOv) || 0));
    if (sum !== round2(totalLandV))
      return `${label}: 주택 부수토지 + 상가 부수토지(${sum}㎡)가 전체 토지 면적(${round2(totalLandV)}㎡)과 다릅니다. (면적 정보)`;
  }
  return null;
}
