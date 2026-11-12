/**
 * 부담부증여 × 토지·건물 소유자 분리 — 증여한 파트(본인 소유분)만 §159로 계산한다(계획서 `docs/00-pm/bg-owner-split-159.plan.md` §5 · Q-2 a).
 *
 * 「소득세법 시행령」 제159조 제1항 — 양도가액·취득가액 = A × B / C. 토지·건물을 나누는 규정은 없다 → A(평가액)·C(증여가액)는 **증여한 자산**의 값이다.
 * 건물만 소유해 건물만 증여했으면 건물분 값이다(토지만이면 토지분).
 *
 * 입력 계약: ④가 본인 몫만 싣는다 — 비소유 파트의 양도·취득시 기준시가는 0이다. 그러면 기존 §159 안분(`buildBurdenedGiftBreakdown` —
 * 토지 = 기준시가 비율 floor · 건물 = 잔액)이 증여한 파트에 전부를 싣는다. 새 §159 산식은 없다(계획서 §3-1).
 * 비소유 파트에 값이 있으면 **던진다** — 엔진이 0으로 바꾸면 물건 전체 값으로 계산하던 결함(#3272 전)이 조용히 돌아온다.
 *
 * 날짜 분리(`bgPartDatesDiffer`)는 `selfOwns === both`를 요구하므로 두 경로는 함께 켜지지 않는다.
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { TransferTaxInput } from "./types/transfer.types";

type OwnerSplit = "building_only" | "land_only";

/** 부담부증여 주택·건물에서 한 파트만 본인 소유(한 파트만 증여)인가. */
export function bgOwnerSplitOf(input: Pick<TransferTaxInput, "transferType" | "propertyType" | "selfOwns">): OwnerSplit | undefined {
  if (input.transferType !== "burdened_gift") return undefined;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return undefined;
  return input.selfOwns === "building_only" || input.selfOwns === "land_only" ? input.selfOwns : undefined;
}

const PART_LABEL = { land: "토지", building: "건물" } as const;

/** 입력 계약 검사 — 비소유 파트의 기준시가·실지취득가액은 0(또는 없음), 증여한 파트의 양도시 기준시가는 양수. */
export function assertBgOwnerSplitInputs(owner: OwnerSplit, info: NonNullable<TransferTaxInput["burdenedGiftInfo"]>): void {
  const owned = owner === "building_only" ? "building" : "land";
  const other = owned === "building" ? "land" : "building";
  const fail = (detail: string, field: string): never => {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `[burdened_gift] 토지·건물 소유자가 다르면 증여한 부분(${PART_LABEL[owned]})의 값만 보내야 합니다 — ${detail} ` +
        "평가액·증여가액은 증여한 자산의 값입니다(「소득세법 시행령」 제159조 제1항).",
      { field },
    );
  };
  const std = {
    land: { transfer: info.landStdPriceAtTransfer, acq: info.landStdPriceAtAcquisition },
    building: { transfer: info.buildingStdPriceAtTransfer, acq: info.buildingStdPriceAtAcquisition },
  };
  if ((std[other].transfer ?? 0) !== 0 || (std[other].acq ?? 0) !== 0)
    fail(`${PART_LABEL[other]}은 본인 소유가 아니므로 양도시·취득시 ${PART_LABEL[other]} 기준시가는 0이어야 합니다.`, `burdenedGiftInfo.${other}StdPriceAtTransfer`);
  if (!(std[owned].transfer > 0)) fail(`양도시 ${PART_LABEL[owned]} 기준시가를 입력하세요.`, `burdenedGiftInfo.${owned}StdPriceAtTransfer`);
  const otherActual = other === "land" ? info.actualLandAcquisitionPrice : info.actualBuildingAcquisitionPrice;
  if ((otherActual ?? 0) !== 0)
    fail(`${PART_LABEL[other]} 실지취득가액은 보내지 않습니다.`, `burdenedGiftInfo.actual${other === "land" ? "Land" : "Building"}AcquisitionPrice`);
  if (info.marketValueByPart !== undefined)
    fail("토지분·건물분 시가(날짜 분리 전용)는 보내지 않습니다 — 증여한 부분의 시가는 양도시 시가 평가액 한 칸입니다.", "burdenedGiftInfo.marketValueByPart");
}
