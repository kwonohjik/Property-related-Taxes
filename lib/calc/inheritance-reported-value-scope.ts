/**
 * 상속 「상속세 신고가액」 칸이 **어느 파트**를 받는지 — 단일 소스.
 *
 * 「소득세법 시행령」 제163조 제9항은 상속개시일 평가액을 취득가액으로 하는데, 일반건물만
 * 건물분 전용 칸(`gbBuildingInheritedValue`)이 따로 있어 `publishedValueAtInheritance`가
 * **토지분**이 된다(`general-building-route-actual.ts`의 `landAcq`/`buildingAcq` 배정).
 * 나머지 자산종류는 이 칸 하나가 자산 전체라 파트 표기를 붙이면 거짓말이 된다.
 *
 * `PreDeemedInputs`·`PostDeemedInputs` 두 곳이 같은 칸을 그리므로 문구를 각자 두면
 * 갈라진다 — 판정과 문구를 여기 한곳에 둔다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 건물분 평가액을 별도 칸으로 받는 자산종류인가 — 그렇다면 신고가액 칸은 토지분이다. */
export function hasSeparateBuildingInheritedValue(
  assetKind: AssetForm["assetKind"] | undefined,
): boolean {
  return assetKind === "general_building";
}

/** 신고가액 칸의 라벨·힌트에 붙일 파트 표기. 해당 없으면 빈 문자열이다. */
export function inheritanceReportedValuePartSuffix(
  assetKind: AssetForm["assetKind"] | undefined,
): { label: string; hint: string } {
  if (!hasSeparateBuildingInheritedValue(assetKind)) return { label: "", hint: "" };
  return {
    label: " (토지분)",
    hint:
      " ⚠️ 일반건물은 이 칸이 토지분 평가액입니다 — 건물분은 아래 「상속개시일 건물 신고가액」에" +
      " 따로 입력하세요. 신고서 총액을 넣으면 건물분이 이중계상됩니다.",
  };
}
