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
import { TRANSFER } from "./legal-codes";
import type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "./types/transfer.types";

/** 적용 고지(Q-14) — 일반건물 부담부증여에 대한 정면 해석례는 확인하지 못했다. 결과 `warnings`에 싣는다. */
export const GB_BG_SELF_BUILT_NOTICE =
  `일반건물 부담부증여에서 양도인 본인이 신축한 건물에 ${TRANSFER.BUILDING_PENALTY} 가산세를 적용했습니다(신축일부터 5년 이내 양도 · 환산취득가액 또는 감정가액 적용 시 채무비율 안분 후 건물분의 5%). 단건 부담부증여에 대한 조세심판례(조심2019서3934)는 있으나 일반건물 부담부증여에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.`;

export interface GbBgPenaltyAxis {
  acquisitionMethod: "estimated" | "appraisal";
  base: number;
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
