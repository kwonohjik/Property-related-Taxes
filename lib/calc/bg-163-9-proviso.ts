/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 기준시가 고시 전) — PR-1 범위(토지 1호 · 단독주택 2호).
 * 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md` · 사용자 결정 Q-24 a · Q-25 a · Q-26 a · Q-27 a.
 *
 * §159①1호 A = 법 §97①1호 가액이고, 상속 · 증여 자산은 §163⑨에 따라 평가액이 실지거래가액이다. 단서 구간이면 평가액과 §164④(⑦) 가액 중
 * 큰 금액이다. 부담부증여는 평가액(①)을 「부담부증여」 카드의 실지취득가액 칸에서 받는다(Q-24 a). ②는 일반 양도와 같은 §164 칸이다.
 * ②를 비우면 일반 양도처럼 평가액만으로 계산한다(Q-25 a — 막지 않는다).
 *
 * ⑤ 칸 노출 · ④ 전송 · 안내 문구가 이 술어를 쓴다. 겸용(자기 경로 `mixedSec163_9CompareOf`) · 의제취득일 전(`isBgPreDeemedAsset`) ·
 * 이월과세 · 토지 · 건물 취득일이 다른 주택 · 소유자 분리 · 공동주택 · 상가 · 건물 · 재개발 · 입주권은 이 범위 밖이다(PR-2 · PR-3).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { sec164HouseStatus, sec164LandStatus } from "./sec164-required-fields";
import { deriveInheritanceHouseKind } from "./transfer-tax-api-asset-basics";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";

/** 단서 구간인 부담부증여 자산의 종류 — 토지(1호 · §164④) · 단독주택(2호 · §164⑦). 범위 밖이면 null. */
export function bgSec163_9ProvisoKind(asset: AssetForm): "land" | "house" | null {
  if (asset.transferType !== "burdened_gift" || !isSec163_9Cause(asset.acquisitionCause)) return null;
  if (asset.bgValuationMode !== "sangjeungbeop_market" || asset.bgAcquisitionMethod !== "actual") return null;
  if (isBgPreDeemedAsset(asset) || bgAnyCarryover(asset)) return null;
  if (asset.assetKind === "land") return sec164LandStatus(asset) !== null ? "land" : null;
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

/** ① 평가액이 들어 있는 부담부증여 실지 칸(Q-24 a) — 토지는 토지 칸, 주택은 총액 칸(⑧ `transfer-tax-validate-bg.ts` K-4와 같은 칸). */
export function bgSec163_9ReportedField(kind: "land" | "house"): "bgActualAcquisitionLand" | "bgActualAcquisitionTotal" {
  return kind === "land" ? "bgActualAcquisitionLand" : "bgActualAcquisitionTotal";
}

/**
 * 부담부증여 취득가액이 「취득당시 기준시가 × 채무비율」인가 — 기준시가 평가(§159①1호 괄호), 또는 시가 평가에서 담보평가가 이겨 기준시가가 강제되는 경우.
 * ③ 안내 첫 문장(D-3m · `BgSec159AcqLead`)이 쓴다. 지분 축은 모르면 `undefined`(지분 자산은 승자를 확정하지 않는다 — `bgCollateralForcesStdAcq`).
 */
export function bgStdBasis(asset: AssetForm): boolean {
  return asset.bgValuationMode !== "sangjeungbeop_market" || bgCollateralForcesStdAcq(asset);
}
