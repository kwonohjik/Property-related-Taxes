/**
 * 일반건물 부담부증여(§159) × 양도인 본인 신축 — 「소득세법」 §114조의2 가산세 **카드 신호** (순수 함수, PR-5b · 계획서 §17).
 *
 * 일반건물 부담부증여는 실가 경로 카드 조립(`general-building-route-actual.ts`)을 타는데 카드가 §159 breakdown 의 산정방식(환산 K-5 · 감정 K-7)을 몰라
 * `isSelfBuilt`·신축일·`penaltyAxis`가 사라졌다. 단건 건물은 `runBurdenedGiftStep`(`transfer-tax-burdened-gift-step.ts`)이 같은 규칙으로 신호를 싣는다 —
 * 이 함수는 **그 규칙을 일반건물 건물 카드로 옮긴 것**이다(base 정의를 한 곳에서 읽는다).
 *
 *  · K-5(`converted`): 채무비율 안분 후 건물 환산취득가액. §97②2호 단서(W-6) swap 이 발동하면 `perAsset.building.acquisitionPrice`는 0 이 되지만
 *    §114조의2 는 «환산취득가액을 썼다는 사실»에 붙는 가산세라 swap 前 값(`convertedAcquisitionBeforeSwap`)을 우선한다.
 *  · K-7(`appraisal`): 채무비율 안분 후 건물 감정가액. (조문: 「감정가액 또는 환산취득가액」 — 실지 K-4 · 기준시가 K-1~K-3 · 매매사례 K-6 은 대상이 아니다.)
 *  · 담보평가가 이겨 취득가액이 기준시가로 강제되면(환산 요청인데 `acquisitionMethodUsed`가 `converted`가 아님 — 1h-G1-2) 신호를 세우지 않는다.
 *    감정 요청(K-7)은 §159 가 항상 그 감정가액을 쓰므로(`acquisitionMethodUsed === "appraisal"`) 같은 확인이 필요 없다(뮤테이션 동치).
 * 증축은 일반건물 부담부증여 UI 에 없고(토글 비노출) 서버는 증축 입력을 이 경로에서 읽지 않으므로 신축만 다룬다.
 * 발동 게이트(5년·시행일 2018.1.1./2020.1.1.)는 호출 쪽 `calculateBuildingPenalty`(finalize STEP 10.5)가 최종 판정한다.
 */
import { calculateBuildingPenalty } from "./transfer-tax-building-penalty";
import { assertDonorBuiltDatesAndExtension } from "./transfer-tax-carryover-donor-penalty";
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { TRANSFER } from "./legal-codes";
import type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { DonorBuiltInput } from "./types/transfer-carryover.types";
import type { TransferTaxInput } from "./types/transfer.types";

/** 적용 고지(Q-14) — 일반건물 부담부증여에 대한 정면 해석례는 확인하지 못했다. 결과 `warnings`에 싣는다. */
export const GB_BG_SELF_BUILT_NOTICE =
  `일반건물 부담부증여에서 양도인 본인이 신축한 건물에 ${TRANSFER.BUILDING_PENALTY} 가산세를 적용했습니다(신축일부터 5년 이내 양도 · 환산취득가액 또는 감정가액 적용 시 채무비율 안분 후 건물분의 5%). 단건 부담부증여에 대한 조세심판례(조심2019서3934)는 있으나 일반건물 부담부증여에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.`;

export interface GbBgPenaltyAxis {
  acquisitionMethod: "estimated" | "appraisal";
  base: number;
  /** 증여자 신축·증축분(PR-5c) — 신축자가 증여자임을 가산세 step 라벨(`penaltyDonorBuilt`)이 읽는다. 본인 신축이면 없다. */
  donor?: true;
}

export function gbBurdenedGiftSelfBuiltPenaltyAxis(
  info: BurdenedGiftInfo,
  breakdown: TransferBurdenedGiftBreakdown,
  buildingIsNewConstruction: boolean,
  /** 신축일(영 §162①4호) · 양도일 — 발동 게이트(5년·시행일)를 같은 leaf(`calculateBuildingPenalty`)로 미리 본다 */
  constructionDate: Date | undefined,
  transferDate: Date,
): GbBgPenaltyAxis | undefined {
  if (!buildingIsNewConstruction || !constructionDate) return undefined;
  const building = breakdown.perAsset.building;
  let axis: GbBgPenaltyAxis | undefined;
  if (info.acquisitionMethod === "converted" && breakdown.acquisitionMethodUsed === "converted")
    axis = { acquisitionMethod: "estimated", base: breakdown.convertedAcquisitionBeforeSwap?.building ?? building.acquisitionPrice };
  else if (info.acquisitionMethod === "appraisal")
    axis = { acquisitionMethod: "appraisal", base: building.acquisitionPrice };
  if (!axis) return undefined;
  // 게이트가 닫히면(5년 경과·시행일 전) 신호 자체를 싣지 않는다 — 가산세 0 이고 `penaltyBase` 에코도 종전(0)과 같다.
  const gate = calculateBuildingPenalty(
    { isSelfBuilt: true, acquisitionMethod: axis.acquisitionMethod, transferDate, constructionDate, buildingType: "new" } as TransferTaxInput,
    1,
  );
  return gate ? axis : undefined;
}

/** 증여자 신축·증축 신호(PR-5c) — 카드에 싣는 필드 묶음. 5년 기산점은 증여자 신축일이고 카드의 `acquisitionDate`(증여자 취득일, 장기보유특별공제 축)와 다르다. */
export interface GbBgDonorBuiltSignal {
  axis: GbBgPenaltyAxis;
  constructionDate: Date;
  buildingType: "new" | "extension";
  extensionFloorArea?: number;
}

/**
 * 입력 거부 — 조용히 무시하지 않는다(⑧·⑫와 같은 규칙, 직접 호출 방어선). 일반건물 부담부증여 × 이월과세(F27)가 증여자 신축·증축을 받는 조건:
 * 시가 모드 환산취득가액(K-5) · 건물 취득원인이 본인 신축이 아님 · 신축·증축일 범위와 증축 필수 칸(증축 부분 기준시가).
 */
export function assertGbBgDonorBuiltInput(
  info: BurdenedGiftInfo,
  ct: Parameters<typeof assertDonorBuiltDatesAndExtension>[1],
  db: DonorBuiltInput,
  buildingIsNewConstruction: boolean,
): void {
  const law = TRANSFER.BUILDING_PENALTY;
  const field = "burdenedGiftInfo.carryoverDonorBasis.donorBuilt";
  const reject = (message: string): never => {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { field });
  };
  if (info.valuationMode !== "sangjeungbeop_market" || info.acquisitionMethod !== "converted")
    reject(`일반건물 부담부증여의 증여자 신축·증축 가산세(${law})는 시가 모드의 취득가액 산정방식이 «환산취득가액»(K-5)일 때만 적용됩니다.`);
  if (buildingIsNewConstruction)
    reject(`일반건물 부담부증여에서 «양도인 본인 신축»(건물 취득 원인 newConstruction)과 «당초 증여자 신축»(donorBuilt)은 다른 축입니다 — 함께 입력할 수 없습니다.`);
  assertDonorBuiltDatesAndExtension(db, ct, field, true);
}

/**
 * 일반건물 부담부증여 K-5 × **당초 증여자** 신축·증축 → §114조의2 카드 신호 (PR-5c). 이월과세 **A 시나리오 호출에서만** 부른다(B 는 부르지 않는다 — R2).
 * base 규칙은 본인 신축 K-5 와 같다(위 함수·단건 `runBurdenedGiftStep`): 채무비율 안분 **후** 건물분. A 의 `info` 는 이미 당초 증여자 취득 당시 기준시가로 치환돼 있어
 * (`applyCarryoverDonorBasis`) 그 base 가 곧 «증여자 기준 건물분 환산취득가액»이다(D2·D4). 신축은 swap 前 값, 증축은 증축 부분만
 * (`양도가액 건물분 × 증축 부분 취득 당시 기준시가 ÷ 양도 당시 건물 기준시가`).
 * 게이트(5년·시행일·증축 85㎡)가 닫히거나 base 가 0 이면 신호 없음 — 호출부가 사유(outside_penalty_window / zero_base)를 가른다.
 */
export function gbBurdenedGiftDonorBuiltPenaltySignal(
  info: BurdenedGiftInfo,
  breakdown: TransferBurdenedGiftBreakdown,
  db: DonorBuiltInput,
  transferDate: Date,
): GbBgDonorBuiltSignal | undefined {
  if (info.acquisitionMethod !== "converted" || breakdown.acquisitionMethodUsed !== "converted") return undefined;
  const building = breakdown.perAsset.building;
  // 증축 부분 기준시가가 없거나(0) 양도시 건물 기준시가가 0 이면 환산이 0 이 되고(`safeMultiplyThenDivide`) 아래 base 0 가드가 신호를 없앤다 — 입력 필수는 ⑫·방어선이 지킨다.
  const base =
    db.buildingType === "extension"
      ? calculateEstimatedAcquisitionPrice(building.transferPrice, db.extensionStdPriceAtAcquisition ?? 0, info.buildingStdPriceAtTransfer)
      : (breakdown.convertedAcquisitionBeforeSwap?.building ?? building.acquisitionPrice);
  if (!(base > 0)) return undefined;
  const gate = calculateBuildingPenalty(
    { isSelfBuilt: true, penaltyDonorBuilt: true, acquisitionMethod: "estimated", transferDate, constructionDate: db.constructionDate, buildingType: db.buildingType, extensionFloorArea: db.extensionFloorArea } as TransferTaxInput,
    1,
  );
  if (!gate) return undefined;
  return {
    axis: { acquisitionMethod: "estimated", base, donor: true },
    constructionDate: db.constructionDate,
    buildingType: db.buildingType,
    ...(db.extensionFloorArea !== undefined ? { extensionFloorArea: db.extensionFloorArea } : {}),
  };
}
