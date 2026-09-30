/**
 * 재산세 — ⑧(`components/calc/property/shared.ts` validateStep)과 ⑫(`lib/validators/property-input.ts`)가
 * 같이 쓰는 필수 입력 술어. 두 계층이 같은 조건으로 막도록 한 곳에 둔다(3중 패턴).
 */

/**
 * 도시지역 주택에 본세 세부담상한(법률 제19230호 부칙 제15조 — 종전 「지방세법」 §122 단서)이 적용되면
 * 도시지역분(§112①2호)도 **따로** 상한을 받는다 — 종전 §122 본문 괄호 「제112조제1항 각 호 및 같은 조
 * 제2항에 따른 각각의 세액」, 「지방세법 시행령」 §118 각 호 외의 부분 「… 산출세액 각각에 대하여 …
 * 각각 산출한 세액」. 그 상한의 기준인 직전 연도 도시지역분이 필요하다.
 *
 * @param baseCapApplied 본세 세부담상한 경과조치를 적용하는가(⑧: 토글 ON · ⑫: 직전 본세 > 0)
 */
export function needsPriorUrbanTax(p: {
  isHousing: boolean;
  isUrbanArea: boolean;
  baseCapApplied: boolean;
}): boolean {
  return p.isHousing && p.isUrbanArea && p.baseCapApplied;
}

export type HouseSplitInputKey = "buildingOwner" | "landOwner" | "buildingStdValue" | "landStdValue";

/**
 * 주택 건물·부속토지 소유자 분리(「지방세법」 §107①2호) — 대표 납세의무자 판정과 산출세액 안분에
 * 두 소유자와 두 시가표준액이 모두 필요하다. 하나라도 없으면 엔진은 경고만 남기고 공부상 소유자로
 * 처리한다(안분 없음). 빠진 키를 ⑧ 메시지 순서대로 돌려준다.
 */
export function missingHouseSplitInputs(p: {
  buildingOwner: string | undefined;
  landOwner: string | undefined;
  buildingStdValue: number | null | undefined;
  landStdValue: number | null | undefined;
}): HouseSplitInputKey[] {
  const missing: HouseSplitInputKey[] = [];
  if (!p.buildingOwner?.trim()) missing.push("buildingOwner");
  if (!p.landOwner?.trim()) missing.push("landOwner");
  if (!((p.buildingStdValue ?? 0) > 0)) missing.push("buildingStdValue");
  if (!((p.landStdValue ?? 0) > 0)) missing.push("landStdValue");
  return missing;
}

export const HOUSE_SPLIT_MISSING_MESSAGE: Record<HouseSplitInputKey, string> = {
  buildingOwner: "건물 소유자 성명을 입력하세요.",
  landOwner: "부속토지 소유자 성명을 입력하세요.",
  buildingStdValue: "건축물 시가표준액을 입력하세요 (§107①2호 안분 필수).",
  landStdValue: "부속토지 시가표준액을 입력하세요 (§107①2호 안분 필수).",
};

export const PRIOR_URBAN_TAX_MISSING_MESSAGE =
  "도시지역 주택은 도시지역분 세부담상한 적용을 위해 직전연도 도시지역분을 입력하세요.";
