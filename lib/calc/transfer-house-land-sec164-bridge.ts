/**
 * 주택 분리 계산의 **혼합 원인 토지 파트(주택 부수토지)** — 「소득세법 시행령」 §163⑨ 단서 2호 ②(영 §164⑦ 가액의 토지 몫) 브리지 (D1-H).
 *
 * 계획서: docs/00-pm/transfer-house-land-163-9-2.plan.md · 근거 부동산거래관리과-364(2010.3.10.) — 부수토지만 증여받은 사람의 취득가액은
 * 「건물의 기준시가가 고시되기 전에 증여받은 주택부수토지」로서 증여일 평가액과 영 §164⑦ 가액 중 많은 금액이다.
 *
 *     ② = 최초공시 주택가격 P_F × 수증일 토지 기준시가 L_E ÷ (최초공시 토지 기준시가 L_F + 최초공시 건물 기준시가 B_F)
 *
 * 영 §164⑦의 환산주택가격(분자 L_E + 건물 B_E)을 재산세과-371(2009.10.5.)이 자산별 취득당시 기준시가로 다시 안분하면 B_E가 분자·분모에
 * 한 번씩 나와 약분된다 — D2-4 건물 몫(`transfer-building-sec164-bridge.ts`)의 거울이다. 토지 몫 산식의 정면 해석례는 없다(결과 고지).
 *
 * 열리는 조건(엔진·⑫와 같은 술어 `isSec163_9HouseLandTarget`): 주택 ∧ 유효 토지 원인 상속·증여 ∧ 건물 매매 ∧ 토지 취득일 1990-08-30 ~ 2005-04-29
 * ∧ 「받을 당시 주택이 있었다」 ∧ 단독·다가구(명시 선택). max는 여기서 하지 않는다 — ①과 ②를 **따로** 보내 엔진(`resolveLandPartAcquisition`)이 한다.
 *
 * ⚠️ 3중 패턴 — ⑤ 카드·④ 전송·⑧ 검증이 이 파일의 함수를 **같이** 읽는다. 파생값은 store에 쓰지 않는다(useEffect → store 미러링 금지).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { applyRatio, safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import {
  isSec163_9BuildingSec164Open,
  isSec163_9HouseLandProviso,
  isSec163_9HouseLandTarget,
  type BuildingHouseKind,
  type LandHouseExisted,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";
import { sec164AreaSqm } from "./transfer-pre1990-housing-land-bridge";

/** 게이트가 읽는 칸 — 사이드바(`separateAcqPartsSum`)는 AssetForm 부분 타입을 넘긴다(D2-4 `buildingSec164Applies`와 같은 구조 타입). */
type HouseLandScope = Parameters<typeof effectiveLandAcquisitionCause>[0] & {
  assetKind?: string;
  acquisitionCause?: string;
  landAcquisitionDate?: string;
  landHouseExisted?: string;
  inheritanceAssetKind?: string;
};

/**
 * 카드가 열리는 구간인가 — 주택 ∧ 유효 토지 원인 상속·증여 ∧ 건물 매매 ∧ 토지 취득일 1990-08-30 ~ 2005-04-29.
 * 「받을 당시 주택이 있었는가」를 묻는 자리다(답은 보지 않는다). 신축 호스트는 열지 않는다(Q-2 — 결과 고지만).
 */
export function houseLandSec164Applies(asset: HouseLandScope): boolean {
  return asset.assetKind === "housing" && asset.acquisitionCause === "purchase"
    && isSec163_9HouseLandProviso(effectiveLandAcquisitionCause(asset), asset.landAcquisitionDate);
}

/** ④가 싣는 「받을 당시 주택이 있었는가」 — 구간 안에서 고른 값만(미선택은 보내지 않는다 = 엔진은 모름으로 읽는다). */
export function landHouseExistedSent(asset: HouseLandScope): LandHouseExisted | undefined {
  if (!houseLandSec164Applies(asset)) return undefined;
  const v = asset.landHouseExisted;
  return v === "yes" || v === "no" || v === "unknown" ? v : undefined;
}

/** 비교 대상인가(주택 구분 전) — 구간 ∧ 「있었다」. 엔진 술어 그대로. */
function houseLandTarget(asset: HouseLandScope): boolean {
  return isSec163_9HouseLandTarget({
    isHousing: asset.assetKind === "housing",
    buildingAcquisitionCause: asset.acquisitionCause,
    landAcquisitionCause: effectiveLandAcquisitionCause(asset),
    landAcquisitionDate: asset.landAcquisitionDate,
    landHouseExisted: landHouseExistedSent(asset),
  });
}

/**
 * ④가 엔진·⑫에 싣는 주택 구분 — 비교 대상일 때만, **명시 선택만**(D2-4 Check F1과 같다 — 미선택을 단독으로 승격하지 않는다).
 */
export function houseLandKindSent(asset: HouseLandScope): BuildingHouseKind | undefined {
  if (!houseLandTarget(asset)) return undefined;
  const k = asset.inheritanceAssetKind;
  return k === "house_individual" || k === "house_apart" ? k : undefined;
}

/** ②를 만들 수 있는가 — 비교 대상 ∧ 단독·다가구. */
export function houseLandSec164Open(asset: HouseLandScope): boolean {
  return houseLandTarget(asset) && isSec163_9BuildingSec164Open(true, houseLandKindSent(asset));
}

/**
 * ② 영 §164⑦ 가액의 토지 몫 총액(원) — **지분 스케일 적용 후**(①`ratioed`와 같은 축). 4입력과 면적이 모두 양수일 때만 값이 있다
 * (부분 입력은 ②를 만들지 않는다). 대상이 아니거나 공동주택이면 0.
 *
 * 입력: `inhHouseValHousePriceAtFirst`(P_F) · `inhHouseValLandPricePerSqmAtInheritance`(수증일 ㎡당 개별공시지가) × 면적(L_E) ·
 * `inhHouseValLandPricePerSqmAtFirst` × 면적(L_F) · `inhHouseValBuildingStdPriceAtFirst`(B_F). 면적은 D1-4·D2-4와 같은 `sec164AreaSqm`.
 * 반올림은 안분 1회 floor + 지분 1회 floor(단독이면 1회).
 */
export function deriveHouseLandSec164Total(asset: AssetForm): number {
  if (!houseLandSec164Open(asset)) return 0;
  const area = sec164AreaSqm(asset);
  const housePriceAtFirst = parseAmount(asset.inhHouseValHousePriceAtFirst);
  const landPerSqmAtAcq = parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance);
  const landPerSqmAtFirst = parseAmount(asset.inhHouseValLandPricePerSqmAtFirst);
  const buildingAtFirst = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst);
  if (!area || area <= 0 || !(housePriceAtFirst > 0) || !(landPerSqmAtAcq > 0) || !(landPerSqmAtFirst > 0) || !(buildingAtFirst > 0)) return 0;

  const landAtAcq = multiplyByArea(landPerSqmAtAcq, area);
  const landAtFirst = multiplyByArea(landPerSqmAtFirst, area);
  const whole = safeMultiplyThenDivide(housePriceAtFirst, landAtAcq, landAtFirst + buildingAtFirst);
  const ratio = getOwnershipRatio(asset);
  return ratio < 1 ? applyRatio(whole, ratio) : whole;
}
