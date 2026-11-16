/**
 * 건물 증여 전 동일세대 거주(서면-2025-법규재산-4289) — 폼 쪽 **노출·전송·검증 공용 술어**(3중 패턴: ⑤ 표시 = ④ 전송 = ⑧ 검증).
 *
 * 게이트·상한 규칙 본문은 엔진 leaf `transfer-split-land-residence.ts`(엔진·⑧·⑫ 공유)다. 이 파일은 **폼 값 → 그 leaf가 읽는 사실**로
 * 옮기는 일만 한다 — 「이 자산이 호스트인가」를 ⑤·④·⑧이 각자 판정하면 «칸은 보이는데 안 실림 / 실리는데 ⑧이 막음»이 생긴다.
 *
 * 호스트 = D2 **증여**(건물 증여 + 토지 매수 — `effectiveBuildingCauseMix === "gift"`: 호스트 태그·부담부증여 제외 포함) ∧
 *   주 자산(컴패니언 제외) ∧ 본인이 토지·건물 모두 소유.
 * §155⑳ 선언은 호스트 판정에 넣지 않는다 — 선언 중에도 칸은 보이되(막다른 길 금지) 켤 수 없고, ④는 싣지 않으며, 켜진 채면 ⑧이 막는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";
import { parsePriorResidenceMonths } from "./gift-household-payload";
import { toRentalHousingExceptionApi } from "./transfer-tax-api-rental-housing";

type LandPartResidenceAsset = Pick<
  AssetForm,
  | "acquisitionCause" | "assetKind" | "isMixedUseHouse" | "transferType" | "hasSeperateLandAcquisitionDate" | "landAcquisitionCause"
  | "landCauseHost" | "selfOwns" | "landPartDonorSameHousehold" | "landPartPriorHouseholdResidenceMonths"
>;

/** ⑤ 칸이 열리는 자산인가 — 주 자산의 D2 증여 · 본인이 토지·건물 모두 소유. */
export function landPartResidenceHost(asset: LandPartResidenceAsset, opts?: { isNonPrimary?: boolean }): boolean {
  if (opts?.isNonPrimary) return false;
  if (effectiveBuildingCauseMix(asset) !== "gift") return false;
  return (effectiveSelfOwns(asset as Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">) ?? "both") === "both";
}

/** §155⑳ 거주주택 특례를 선언했는가 — ④가 `rentalHousingException`을 싣는 조건과 같은 술어(엔진 `rentalHousingDeclared`와 같은 사실). */
export function landPartResidenceRentalDeclared(asset: AssetForm): boolean {
  return toRentalHousingExceptionApi(asset) !== undefined;
}

/**
 * 「건물 증여 전 같은 세대 거주」 칸이 **입력 가능하게** 열려 있는가 — 호스트 ∧ ⑳ 미선언. 거주 구간 오류가 이 칸으로 안내해도 되는 조건이다
 * (선언 중에는 칸이 잠겨 안내만 하면 막다른 길).
 */
export function landPartResidenceAsked(asset: AssetForm | undefined, opts?: { isNonPrimary?: boolean }): boolean {
  return !!asset && landPartResidenceHost(asset, opts) && !landPartResidenceRentalDeclared(asset);
}

/** 유효 토글 — 호스트에서 켠 값만(호스트가 닫힌 자산의 잔재는 꺼짐). */
export function landPartResidenceOn(asset: LandPartResidenceAsset, opts?: { isNonPrimary?: boolean }): boolean {
  return landPartResidenceHost(asset, opts) && asset.landPartDonorSameHousehold === true;
}

/**
 * ④ 전송 조각 — 호스트 ∧ 토글 ON ∧ ⑳ 미선언일 때만. OFF·잔재는 **둘 다** 싣지 않는다(stale 방지).
 * 개월이 비었거나 정수가 아니면 토글만 싣는다 — ⑧이 먼저 막고, ⑧을 거치지 않는 호출은 ⑫ 400이 같은 이유로 막는다(조용히 종전 계산으로 떨어지지 않는다).
 */
export function buildLandPartResidencePayload(
  asset: AssetForm,
  opts?: { isNonPrimary?: boolean },
): { landPartDonorSameHousehold?: true; landPartPriorHouseholdResidenceMonths?: number } {
  if (!landPartResidenceOn(asset, opts) || landPartResidenceRentalDeclared(asset)) return {};
  const m = parsePriorResidenceMonths(asset.landPartPriorHouseholdResidenceMonths);
  return {
    landPartDonorSameHousehold: true,
    ...(m !== undefined && Number.isInteger(m) ? { landPartPriorHouseholdResidenceMonths: m } : {}),
  };
}

/**
 * ⑧ 사실 — 엔진 leaf(`collectSplitPartCauseIssues`)에 넘길 값. 호스트 ∧ 토글 ON일 때만 값을 넘긴다(잔재는 읽지 않는다 — ④와 같다).
 * ⑳ 선언은 항상 넘긴다(그 사실이 leaf의 ④ 게이트다). 개월: 빈칸 = undefined(필수 위반) · 비정수 = NaN(형식 위반).
 */
export function landPartResidenceFacts(
  asset: AssetForm,
  opts?: { isNonPrimary?: boolean },
): {
  landPartDonorSameHousehold?: boolean;
  landPartPriorHouseholdResidenceMonths?: number;
  donorAcquisitionDate?: string;
  rentalHousingDeclared: boolean;
} {
  const rentalHousingDeclared = landPartResidenceRentalDeclared(asset);
  if (!landPartResidenceOn(asset, opts)) return { rentalHousingDeclared };
  return {
    landPartDonorSameHousehold: true,
    landPartPriorHouseholdResidenceMonths: parsePriorResidenceMonths(asset.landPartPriorHouseholdResidenceMonths),
    // 상한 시작일 — ④가 증여 취득이면 싣는 최상위 `donorAcquisitionDate`와 같은 값
    donorAcquisitionDate: asset.donorAcquisitionDate || undefined,
    rentalHousingDeclared,
  };
}
