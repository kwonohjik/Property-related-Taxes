/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 기준시가 고시 전) — PR-1(토지 1호 · 단독주택 2호) · PR-2(상가 · 오피스텔 2호 §164⑥)
 * · 건물(토지 제외) 2호 §164⑤(계획서 `building-163-9-proviso-164-5.plan.md` Q-33 a).
 * 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md` · 사용자 결정 Q-24 a · Q-25 a · Q-26 a · Q-27 a.
 *
 * §159①1호 A = 법 §97①1호 가액이고, 상속 · 증여 자산은 §163⑨에 따라 평가액이 실지거래가액이다. 단서 구간이면 평가액과 §164④(⑦) 가액 중
 * 큰 금액이다. 부담부증여는 평가액(①)을 「부담부증여」 카드의 실지취득가액 칸에서 받는다(Q-24 a). ②는 일반 양도와 같은 §164 칸이다.
 * ②를 비우면 일반 양도처럼 평가액만으로 계산한다(Q-25 a — 막지 않는다).
 *
 * ⑤ 칸 노출 · ④ 전송 · 안내 문구가 이 술어를 쓴다. 겸용(자기 경로 `mixedSec163_9CompareOf`) · 의제취득일 전(`isBgPreDeemedAsset`) ·
 * 이월과세 · 토지 · 건물 취득일이 다른 주택 · 소유자 분리 · 공동주택 · 일반건물은 이 범위 밖이다(일반건물은 파트별 — PR-3 B2).
 * 재개발 완공 아파트 · 조합원입주권 **원조합원**은 종전 토지(1호) · 종전 주택(2호)으로 연다(계획서 `remaining-4-measurements.plan.md` §B · Q-44 a · Q-45 a).
 * 상가의 ② 칸(§164⑥ 8칸)은 ③ 취득정보 `CommercialInheritanceStdPriceSection`에, 건물의 ② 칸(§164⑤)은 `BuildingSec164Section`에
 * 이미 있다 — 부담부증여 카드는 그 칸을 가리킨다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { sec164CommercialStatus, sec164HouseStatus, sec164LandStatus } from "./sec164-required-fields";
import { sec164BuildingStatus } from "./sec164-required-fields";
import { isOriginalMemberLandAsset, isSec163_9HouseAsset } from "./transfer-163-9-base-date";
import { deriveSec163_9BaseDate, DEEMED_ACQUISITION_DATE } from "./transfer-163-9-base-date";
import { deriveInheritanceHouseKind } from "./transfer-tax-api-asset-basics";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";

export type BgSec163_9ProvisoKind = "land" | "house" | "commercial" | "building";

/** 단서 구간인 부담부증여 자산의 종류 — 토지(1호 · §164④) · 단독주택(2호 · §164⑦) · 상가 · 오피스텔(2호 · §164⑥). 범위 밖이면 null. */
export function bgSec163_9ProvisoKind(asset: AssetForm): BgSec163_9ProvisoKind | null {
  if (asset.transferType !== "burdened_gift" || !isSec163_9Cause(asset.acquisitionCause)) return null;
  if (asset.bgValuationMode !== "sangjeungbeop_market" || asset.bgAcquisitionMethod !== "actual") return null;
  // 담보평가가 이겨 취득시 기준시가가 강제되면 실지(K-4)에 닿지 않는다 — 칸 · 안내 · 전송 모두 없다(엔진도 STEP 0.45 단계를 지운다).
  if (isBgPreDeemedAsset(asset) || bgAnyCarryover(asset) || bgCollateralForcesStdAcq(asset)) return null;
  if (asset.assetKind === "land") return sec164LandStatus(asset) !== null ? "land" : null;
  if (asset.assetKind === "commercial_building") return sec164CommercialStatus(asset) !== null ? "commercial" : null;
  if (asset.assetKind === "building") return sec164BuildingStatus(asset) !== null ? "building" : null;
  // 재개발 · 입주권 원조합원 — 인가 전 상속 · 증여받은 종전 토지(§164④) · 종전 주택(§164⑦). 승계조합원은 종전자산을 받지 않았다(술어가 뺀다).
  if (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in") {
    // 의제취득일 이후만 — `isBgPreDeemedAsset`은 입주권을 받지 않는다. 의제취득일 전 입주권 × 부담부증여는 범위 밖 결정(Q-30 · §166③ 환산 금지)이 유지된다.
    const baseDate = deriveSec163_9BaseDate(asset);
    if (!baseDate || baseDate < DEEMED_ACQUISITION_DATE) return null;
    if (isOriginalMemberLandAsset(asset)) return sec164LandStatus(asset) !== null ? "land" : null;
    if (isSec163_9HouseAsset(asset) && deriveInheritanceHouseKind(asset) === "house_individual") return sec164HouseStatus(asset) !== null ? "house" : null;
    return null;
  }
  if (
    asset.assetKind === "housing" &&
    !asset.isMixedUseHouse &&
    deriveInheritanceHouseKind(asset) === "house_individual" &&
    !asset.hasSeperateLandAcquisitionDate &&
    asset.selfOwns !== "land_only" &&
    asset.selfOwns !== "building_only"
  ) {
    return sec164HouseStatus(asset) !== null ? "house" : null;
  }
  return null;
}

/** ① 평가액이 들어 있는 부담부증여 실지 칸(Q-24 a) — 토지는 토지 칸, 주택 · 상가 · 건물은 총액 칸(⑧ `transfer-tax-validate-bg.ts` K-4와 같은 칸). */
export function bgSec163_9ReportedField(
  kind: BgSec163_9ProvisoKind,
  asset: Pick<AssetForm, "assetKind">,
): "bgActualAcquisitionLand" | "bgActualAcquisitionTotal" {
  // 원조합원(재개발 · 입주권)은 토지 출자도 「종전 부동산 실지취득가액」 한 칸(총액)이다
  return kind === "land" && asset.assetKind === "land" ? "bgActualAcquisitionLand" : "bgActualAcquisitionTotal";
}

/**
 * 부담부증여 취득가액이 「취득당시 기준시가 × 채무비율」인가 — 기준시가 평가(§159①1호 괄호), 또는 시가 평가에서 담보평가가 이겨 기준시가가 강제되는 경우.
 * ③ 안내 첫 문장(D-3m · `BgSec159AcqLead`)이 쓴다. 지분 축은 모르면 `undefined`(지분 자산은 승자를 확정하지 않는다 — `bgCollateralForcesStdAcq`).
 */
export function bgStdBasis(asset: AssetForm): boolean {
  return asset.bgValuationMode !== "sangjeungbeop_market" || bgCollateralForcesStdAcq(asset);
}
