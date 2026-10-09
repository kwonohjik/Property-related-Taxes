/**
 * 주택 분리 계산의 **혼합 원인 건물 파트** — 「소득세법 시행령」 §163⑨ 단서 2호 ②(영 §164⑦ 가액의 건물 몫) 브리지 (D2-4).
 *
 * 건물 기준시가(개별주택가격)가 고시되기 전(2005.4.30. 전)에 상속·증여받은 건물의 취득가액은 상속개시일·증여일 평가액(①)과
 * 영 §164⑦ 가액 중 많은 금액이다. 토지는 따로 샀으므로(매매) 건물 몫만 필요하다.
 *
 *     ② = 최초공시 주택가격 P_F × 취득당시 건물 기준시가 B_E ÷ (최초공시 토지 기준시가 L_F + 최초공시 건물 기준시가 B_F)
 *
 * 영 §164⑦의 환산주택가격(분자의 토지 L_acq + 건물 B_E)을 재산세과-1702가 자산별 취득당시 기준시가로 다시 안분하면
 * L_acq가 분자·분모에 한 번씩 나와 약분된다 → 토지 취득 시점(상속 전·후, 1990.8.30. 전·후)과 무관하다.
 * 정면 해석례는 없다(계획서 §13 Q-D24-1 「확인 필요」 — 결과 고지로 표시).
 *
 * `transfer-pre1990-housing-land-bridge.ts`(D1-4)의 3단 구조(게이트 · 파생 · 전송)를 미러링한다. max는 여기서 하지 않는다 —
 * ①과 ②를 **따로** 엔진에 보내 엔진 split 파트가 max·echo를 한다(`resolveBuildingPartAcquisition`).
 *
 * 단독·다가구(`house_individual`)만 연다(계획서 §13 Q-D24-2). 공동주택은 영 §164⑥ 체계라 ②를 만들지 않고, 주택 구분 사실
 * (`buildingHouseKindSent`)만 보내 엔진·⑫·⑧이 같은 이유로 막게 한다.
 *
 * ⚠️ 3중 패턴 — ④ 전송·⑧ 검증이 이 파일의 `buildingSec164Applies`/`deriveBuildingSec164Total`/`buildingHouseKindSent`를 **같이** 읽는다.
 *    파생값은 store에 쓰지 않는다(useEffect → store 미러링 금지).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { applyRatio, safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { isSec163_9BuildingProviso, isSec163_9BuildingSec164Open } from "@/lib/tax-engine/transfer-split-part-cause";
import type { BuildingHouseKind } from "@/lib/tax-engine/transfer-split-part-cause";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";
import { sec164AreaSqm } from "./transfer-pre1990-housing-land-bridge";

/**
 * 영 §163⑨ 단서 2호 구간의 **주택**인가 — 유효 D2(건물 상속·증여 + 토지 매매) ∧ 주택 ∧ 건물 취득일 < 2005-04-30.
 * 엔진·⑫와 같은 술어(`isSec163_9BuildingProviso`). 단독·다가구 여부는 보지 않는다(`buildingSec164Open`).
 */
export function buildingSec164Applies(asset: AssetForm): boolean {
  return asset.assetKind === "housing" && isSec163_9BuildingProviso(effectiveBuildingCauseMix(asset), asset.acquisitionDate);
}

/**
 * ④가 엔진·⑫에 싣는 주택 구분 사실 — 단서 구간에서만. 구간 밖이면 보내지 않는다(범위 밖 잔재 차단).
 * **명시 선택만** 싣는다(Check F1): 표시용 파생 `deriveInheritanceHouseKind`는 미선택(기본 "land")·동·호 공란을 단독으로 읽는데,
 * 이 사실은 ② 비교(유리 방향일 수 있다)를 여는 게이트라 「모름」을 단독으로 승격하면 안 된다(모름 = 불성립).
 */
export function buildingHouseKindSent(asset: AssetForm): BuildingHouseKind | undefined {
  if (!buildingSec164Applies(asset)) return undefined;
  const k = asset.inheritanceAssetKind;
  return k === "house_individual" || k === "house_apart" ? k : undefined;
}

/** ②를 만들 수 있는 구간인가 — `buildingSec164Applies` ∧ 단독·다가구(엔진 leaf와 같은 `isSec163_9BuildingSec164Open`). */
export function buildingSec164Open(asset: AssetForm): boolean {
  return buildingSec164Applies(asset) && isSec163_9BuildingSec164Open(true, buildingHouseKindSent(asset));
}

/**
 * ② 영 §164⑦ 가액의 건물 몫 총액(원) — **지분 스케일 적용 후**(①`ratioed`와 같은 축). 5입력이 모두 양수일 때만 값이 있다
 * (부분 입력은 ②를 만들지 않는다 — 비교를 건너뛴 ① 단독 계산은 하지 않는다). 구간 밖·공동주택이면 0.
 *
 * 입력: `inhHouseValHousePriceAtFirst`(P_F) · `inhHouseValLandPricePerSqmAtFirst`(㎡당 최초공시 개별공시지가) × `acquisitionArea`(L_F) ·
 * `inhHouseValBuildingStdPriceAtFirst`(B_F) · `inhHouseValBuildingStdPriceAtInheritance`(B_E). 면적은 콤마를 지우고 파싱한다
 * (`sec164AreaSqm` — 카드의 ②와 ④의 ②가 갈리지 않게 D1-4와 같은 파서). 반올림은 안분 1회 floor + 지분 1회 floor(단독이면 1회).
 */
export function deriveBuildingSec164Total(asset: AssetForm): number {
  if (!buildingSec164Open(asset)) return 0;
  const area = sec164AreaSqm(asset);
  const housePriceAtFirst = parseAmount(asset.inhHouseValHousePriceAtFirst);
  const landPerSqmAtFirst = parseAmount(asset.inhHouseValLandPricePerSqmAtFirst);
  const buildingAtFirst = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst);
  const buildingAtAcq = parseAmount(asset.inhHouseValBuildingStdPriceAtInheritance);
  if (!area || area <= 0 || !(housePriceAtFirst > 0) || !(landPerSqmAtFirst > 0) || !(buildingAtFirst > 0) || !(buildingAtAcq > 0)) return 0;

  const landAtFirst = multiplyByArea(landPerSqmAtFirst, area);
  const whole = safeMultiplyThenDivide(housePriceAtFirst, buildingAtAcq, landAtFirst + buildingAtFirst);
  const ratio = getOwnershipRatio(asset);
  return ratio < 1 ? applyRatio(whole, ratio) : whole;
}
