/**
 * 주택별 개별주택가격 최초공시일 — 「소득세법 시행령」 §163⑨ 단서 2호 구간의 끝 (자산 단위·D2-4·D1-H 공용).
 *
 * 계획서: docs/00-pm/transfer-house-first-disclosure-per-house.plan.md · 근거 영 §164⑦ 「당해 주택에 대하여 … 최초로 공시한
 * 주택가격」 · 부동산거래관리과-364(2010.3.10. — 2005.5.12. 수증 · 2006.4.28. 최초공시 사안에 단서 2호 적용).
 *
 * 입력 사실은 기존 store 필드 `inhHouseValFirstDisclosureDate`(기본 2005-04-30) 하나다 — 세 경로의 카드가 이미 같은 `inhHouseVal*`
 * 묶음(최초공시 주택가격·㎡당가·건물 기준시가)을 쓰는 같은 주택의 사실이다. 단독·다가구로 **명시 선택**한 주택만 그 날짜가
 * 구간의 끝이 된다(Q-2 — 공동주택·모름은 2005-04-30 유지). 판정은 엔진 leaf `houseDisclosureBoundary` 하나를 쓴다.
 *
 * ⚠️ 3중 패턴 — ⑤ 카드·④ 전송·⑧ 검증이 이 파일의 함수를 같이 읽는다. 파생값은 store에 쓰지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  houseDisclosureBoundary,
  houseFirstDisclosureDateInRange,
  SEC_163_9_BUILDING_FIRST_DISCLOSURE,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { deriveSec163_9BaseDate, isSec163_9Cause } from "./transfer-163-9-base-date";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";

type HouseFirstDisclosureScope = Parameters<typeof effectiveLandAcquisitionCause>[0] & {
  assetKind?: string;
  acquisitionCause?: string;
  inheritanceAssetKind?: string;
  inhHouseValFirstDisclosureDate?: string;
};

/**
 * 이 날짜를 읽는 경로가 있는 자산인가 — 주택 ∧ (자산 취득원인 상속·증여 — 자산 단위·D2-4 ∨ 유효 토지 원인 상속·증여 — D1-H).
 * 그 밖의 자산에 남은 날짜는 보내지도 검증하지도 않는다(범위 밖 잔재가 무관한 계산을 막지 않게).
 */
export function houseFirstDisclosureRelevant(asset: HouseFirstDisclosureScope): boolean {
  if (asset.assetKind !== "housing") return false;
  return isSec163_9Cause(asset.acquisitionCause as AssetForm["acquisitionCause"]) || !!effectiveLandAcquisitionCause(asset);
}

/** 단서 2호 구간의 끝 — 엔진과 같은 `houseDisclosureBoundary`. 화면에서는 단독·다가구를 **명시 선택**한 주택만 저장된 날짜를 쓴다(Q-2). */
export function houseDisclosureBoundaryOf(asset: HouseFirstDisclosureScope): string {
  if (!houseFirstDisclosureRelevant(asset) || asset.inheritanceAssetKind !== "house_individual") return SEC_163_9_BUILDING_FIRST_DISCLOSURE;
  return houseDisclosureBoundary(asset.inhHouseValFirstDisclosureDate, asset.inheritanceAssetKind);
}

/** ④가 싣는 값 — 구간 끝이 2005-04-30이 아닐 때만(바꾸지 않은 입력은 payload가 종전과 같다). */
export function houseFirstDisclosureSent(asset: HouseFirstDisclosureScope): string | undefined {
  const b = houseDisclosureBoundaryOf(asset);
  return b === SEC_163_9_BUILDING_FIRST_DISCLOSURE ? undefined : b;
}

/** ④ payload 조각 — 본 자산·컴패니언·다건이 같은 함수를 spread한다. */
export function buildHouseFirstDisclosurePayload(asset: HouseFirstDisclosureScope): { houseFirstDisclosureDate?: string } {
  const d = houseFirstDisclosureSent(asset);
  return d ? { houseFirstDisclosureDate: d } : {};
}

export const HOUSE_FIRST_DISCLOSURE_KIND_REQUIRED_MESSAGE =
  "개별주택가격 최초 공시일을 상속개시일·증여일 뒤의 날짜로 입력한 주택은 단독·다가구주택인지 골라야 합니다 — 공동주택은 국세청장이 고시한 "
  + "공동주택 기준시가가 있었는지에 따라 「건물의 기준시가가 고시되기 전」(「소득세법 시행령」 제163조 제9항 단서 제2호)인지가 달라 이 날짜를 쓰지 않습니다. "
  + "공동주택이면 최초 공시일을 2005-04-30으로 두세요";

/** 각 경로의 기준일(상속개시일·증여일 · D2-4 건물 취득일 · D1-H 토지 취득일) — 이 날짜가 구간을 넓히는지 보는 데 쓴다. */
function pathBaseDates(asset: HouseFirstDisclosureScope & { acquisitionDate?: string; inheritanceStartDate?: string; landAcquisitionDate?: string }): string[] {
  const out: string[] = [];
  if (isSec163_9Cause(asset.acquisitionCause as AssetForm["acquisitionCause"])) {
    out.push(deriveSec163_9BaseDate(asset as Parameters<typeof deriveSec163_9BaseDate>[0]), asset.acquisitionDate ?? "");
  }
  if (effectiveLandAcquisitionCause(asset)) out.push(asset.landAcquisitionDate ?? "");
  return out.map((d) => d.slice(0, 10)).filter(Boolean);
}

/**
 * ⑧ — 날짜를 2005-04-30에서 바꿨는데 쓰이지 못하는 상태(계획서 Q-2·Q-3)의 사유. 없으면 null.
 *  · 범위 밖(2005-04-30 전 · 양도일 뒤 · 형식 오류) → 범위 문구(⑫와 같은 leaf 판정)
 *  · 그 날짜가 구간을 넓히는데(기준일이 2005-04-30 이후 · 그 날짜 전) 주택 구분이 단독·다가구로 명시되지 않음 → 주택 구분 요구.
 *    이미 2005-04-30 전에 받은 주택은 날짜가 조회 기준일만 바꾸므로(공동주택 최초공시 2006-04-28 조회 등) 묻지 않는다.
 */
export function houseFirstDisclosureIssue(
  asset: HouseFirstDisclosureScope & { acquisitionDate?: string; inheritanceStartDate?: string; landAcquisitionDate?: string },
  transferDate: string | undefined,
): "range" | "kind" | null {
  if (!houseFirstDisclosureRelevant(asset)) return null;
  const d = asset.inhHouseValFirstDisclosureDate?.slice(0, 10) ?? "";
  if (!d || d === SEC_163_9_BUILDING_FIRST_DISCLOSURE) return null;
  if (!houseFirstDisclosureDateInRange(d, transferDate)) return "range";
  if (asset.inheritanceAssetKind === "house_individual") return null;
  const widens = pathBaseDates(asset).some((b) => b >= SEC_163_9_BUILDING_FIRST_DISCLOSURE && b < d);
  return widens ? "kind" : null;
}
