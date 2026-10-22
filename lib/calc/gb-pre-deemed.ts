/**
 * 일반건물 — 의제취득일(1985.1.1.) 전 상속·증여 파트 (PR-4). ④(`transfer-tax-api-gb.ts`)·⑤(입력 화면 안내)가 같은 술어를 쓴다.
 *
 * 그 파트의 취득가액은 max(① 상증법 평가액, ② 영 §164④·⑤ 가액, ③ 환산취득가액)이다(계획서
 * `inheritance-pre-deemed-clause-b-revisit.plan.md` §15). ③은 엔진이 계산한다(`general-building-pre-deemed.ts`).
 * 경계 술어는 split D1과 같은 leaf다(`isPreDeemedLandPart` — 원인·날짜만 보므로 건물 파트에도 같다).
 */
import { isPreDeemedLandPart } from "@/lib/tax-engine/transfer-split-part-cause";
import { partAcquisitionDates } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { GbPreDeemedClauseA } from "@/lib/tax-engine/types/general-building.types";

type GbAsset = Pick<
  AssetForm,
  "acquisitionCause" | "gbBuildingAcquisitionCause" | "acquisitionDate" | "landAcquisitionDate" | "hasSeperateLandAcquisitionDate"
>;

export const gbLandPreDeemed = (asset: GbAsset): boolean =>
  isPreDeemedLandPart(asset.acquisitionCause, partAcquisitionDates(asset).land);

export const gbBuildingPreDeemed = (asset: GbAsset): boolean =>
  isPreDeemedLandPart(asset.gbBuildingAcquisitionCause, asset.acquisitionDate);

/** ④ payload 필드 — ①②를 따로 싣는다. 부담부증여는 §159가 취득가액을 정하므로 범위 밖(PR-7). */
export function gbPreDeemedClauseAFields(
  asset: GbAsset,
  isBurdenedGift: boolean,
  land: GbPreDeemedClauseA,
  building: GbPreDeemedClauseA,
): { landPreDeemedClauseA?: GbPreDeemedClauseA; buildingPreDeemedClauseA?: GbPreDeemedClauseA } {
  if (isBurdenedGift) return {};
  return {
    ...(gbLandPreDeemed(asset) ? { landPreDeemedClauseA: land } : {}),
    ...(gbBuildingPreDeemed(asset) ? { buildingPreDeemedClauseA: building } : {}),
  };
}

export const GB_PRE_DEEMED_LAND_NOTE =
  "1985.1.1. 전 상속·증여 토지는 이 등급을 의제취득일(1985.1.1.) 기준으로 입력하세요. 환산취득가액(양도가액에 이 기준시가와 양도시 기준시가의 비율을 곱한 금액)과도 비교해 셋 중 큰 금액이 취득가액이 됩니다 (소득세법 시행령 §176조의2④).";

export const GB_PRE_DEEMED_BUILDING_HINT =
  "의제취득일(1985.1.1.) 기준 건물기준시가 총액. 1985.1.1. 전 상속·증여 건물은 이 금액이 §164⑤ 가액이자 환산취득가액(양도가액에 이 기준시가와 양도시 기준시가의 비율을 곱한 금액)의 분자이고, 평가액·§164⑤ 가액·환산취득가액 중 큰 금액이 취득가액이 됩니다 (소득세법 시행령 §163⑨·§176조의2④). [건물 기준시가 계산]은 1985년 이전 취득을 산정기준율표의 「1985년 이전」 열로 계산합니다.";
