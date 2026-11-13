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
import { BURDENED_GIFT_TRANSFER } from "./legal-codes/burdened-gift";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "./types/transfer.types";

export type OwnerSplit = "building_only" | "land_only";

/** 부담부증여 주택·건물에서 한 파트만 본인 소유(한 파트만 증여)인가. */
export function bgOwnerSplitOf(input: Pick<TransferTaxInput, "transferType" | "propertyType" | "selfOwns">): OwnerSplit | undefined {
  if (input.transferType !== "burdened_gift") return undefined;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return undefined;
  return input.selfOwns === "building_only" || input.selfOwns === "land_only" ? input.selfOwns : undefined;
}

const PART_LABEL = { land: "토지", building: "건물" } as const;

type OwnerSplitInfo = NonNullable<TransferTaxInput["burdenedGiftInfo"]>;

/**
 * 증여한 부분의 양도시 기준시가가 계산에 쓰이는가 — 엔진 계약·⑫·⑧·⑤ 공용 술어(화면은 `bgValuationMode`·`bgAcquisitionMethod`를 같은 값으로 넘긴다).
 * 기준시가 평가: 증여가액 C·양도가액이다. 시가 평가 × 환산(K-5): 환산취득가액의 분모다(「소득세법 시행령」 제176조의2 제2항 제2호).
 * 시가 평가 × 실지(K-4)는 쓰지 않는다 — 증여가액 = 시가, 취득가액 = 실지취득가액이고 소유자 분리는 한 파트라 안분 비율도 없다
 * (probe 실측: 1원·1억·2억·9.99억 모두 결정세액 같음 · 담보 승도 같음). 감정·매매사례는 소유자 분리 범위 밖이다(`bg-owner-split-scope.ts`).
 */
export function bgOwnerSplitNeedsTransferStd(info: { valuationMode?: string; acquisitionMethod?: string }): boolean {
  return info.valuationMode !== "sangjeungbeop_market" || info.acquisitionMethod !== "actual";
}
export type BgOwnerSplitContractViolation = { detail: string; field: string };

/**
 * 입력 계약 위반 첫 건 — 채무 확인(`ownerSplitDebtConfirmed: true`), 비소유 파트의 기준시가·실지취득가액은 0(또는 없음), 증여한 파트의 양도시 기준시가는 양수.
 * 없으면 null. ⑫도 같은 판정을 쓴다. 채무 확인이 먼저다 — ⑧ `validateBgOwnerSplit`도 이 순서로 묻는다.
 */
export function bgOwnerSplitContractViolation(owner: OwnerSplit, info: OwnerSplitInfo): BgOwnerSplitContractViolation | null {
  const owned = owner === "building_only" ? "building" : "land";
  const other = owned === "building" ? "land" : "building";
  if (info.ownerSplitDebtConfirmed !== true)
    return {
      detail:
        `인수한 채무(임대보증금 포함)가 증여자 본인 채무이고 증여한 ${PART_LABEL[owned]}에만 관련된다는 확인(ownerSplitDebtConfirmed: true)을 보내세요 — ` +
        `타인 소유 부분과 함께 담보로 설정한 채무는 증여한 부분만의 평가액으로 안분해야 하는데 입력 칸이 없어 계산하지 않습니다(${BURDENED_GIFT_TRANSFER.SANGJEUNGBEOP_DECREE_JOINT_MORTGAGE_63_1_2}).`,
      field: "burdenedGiftInfo.ownerSplitDebtConfirmed",
    };
  const std = {
    land: { transfer: info.landStdPriceAtTransfer, acq: info.landStdPriceAtAcquisition },
    building: { transfer: info.buildingStdPriceAtTransfer, acq: info.buildingStdPriceAtAcquisition },
  };
  if ((std[other].transfer ?? 0) !== 0 || (std[other].acq ?? 0) !== 0)
    return { detail: `${other === "land" ? "토지는" : "건물은"} 본인 소유가 아니므로 양도시·취득시 ${PART_LABEL[other]} 기준시가는 0이어야 합니다.`, field: `burdenedGiftInfo.${other}StdPriceAtTransfer` };
  if (bgOwnerSplitNeedsTransferStd(info) && !(std[owned].transfer > 0)) return { detail: `양도시 ${PART_LABEL[owned]} 기준시가를 입력하세요.`, field: `burdenedGiftInfo.${owned}StdPriceAtTransfer` };
  const otherActual = other === "land" ? info.actualLandAcquisitionPrice : info.actualBuildingAcquisitionPrice;
  if ((otherActual ?? 0) !== 0)
    return { detail: `${PART_LABEL[other]} 실지취득가액은 보내지 않습니다.`, field: `burdenedGiftInfo.actual${other === "land" ? "Land" : "Building"}AcquisitionPrice` };
  if (owned === "land" && (info.giftBuildingStdPriceAtTransfer ?? 0) !== 0)
    return { detail: "증여일 건물 기준시가(상속세 및 증여세법 평가용)는 보내지 않습니다 — 건물은 본인 소유가 아니라 증여가액에 들어가지 않습니다.", field: "burdenedGiftInfo.giftBuildingStdPriceAtTransfer" };
  if (info.marketValueByPart !== undefined)
    return { detail: "토지분·건물분 시가(날짜 분리 전용)는 보내지 않습니다 — 증여한 부분의 시가는 양도시 시가 평가액 한 칸입니다.", field: "burdenedGiftInfo.marketValueByPart" };
  return null;
}

/** 위 계약 위반 문구(`[burdened_gift] … 증여한 부분(…)`) — 엔진 throw와 ⑫ 400이 같은 문장을 쓴다. */
export function bgOwnerSplitContractMessage(owner: OwnerSplit, detail: string): string {
  return (
    `[burdened_gift] 토지·건물 소유자가 다르면 증여한 부분(${PART_LABEL[owner === "building_only" ? "building" : "land"]})의 값만 보내야 합니다 — ${detail} ` +
    "평가액·증여가액은 증여한 자산의 값입니다(「소득세법 시행령」 제159조 제1항)."
  );
}

type PartBreakdown = TransferBurdenedGiftBreakdown["perAsset"]["land"];

/**
 * §159 명세의 비소유 파트 몫을 증여한 파트로 접는다 — 입력 전체가 증여한 부분의 값이다(계약). 안분이 기준시가 비율인데 그 합이 0이면
 * (시가 × 실지에서 기준시가를 비운 경우) 하류 안분이 잔액을 건물에 싣는다 → 토지만 본인이면 실지취득가액이 비소유 건물로 가 증여한 토지의
 * 취득가액이 0이 됐다(실측 결정세액 12,360,000 · 접은 뒤 5,385,000). 비소유 파트 값이 0이면 접어도 그대로다(기존 경로 불변).
 */
export function foldOwnerSplitBreakdown(owner: OwnerSplit, b: TransferBurdenedGiftBreakdown): TransferBurdenedGiftBreakdown {
  const ownedKey = owner === "building_only" ? "building" : "land";
  const o = b.perAsset[ownedKey];
  const x = b.perAsset[ownedKey === "land" ? "building" : "land"];
  const sum = (k: "actualAcquisition" | "presumedAcquisition") => (o[k] === undefined && x[k] === undefined ? undefined : (o[k] ?? 0) + (x[k] ?? 0));
  const folded: PartBreakdown = {
    ...o,
    sangjeungbeopValue: o.sangjeungbeopValue + x.sangjeungbeopValue,
    stdPriceAtAcquisition: o.stdPriceAtAcquisition + x.stdPriceAtAcquisition,
    transferPrice: o.transferPrice + x.transferPrice,
    acquisitionPrice: o.acquisitionPrice + x.acquisitionPrice,
    estimatedDeduction: o.estimatedDeduction + x.estimatedDeduction,
    estimatedDeductionRate: o.estimatedDeductionRate ?? x.estimatedDeductionRate,
    stdPriceAtTransfer: o.stdPriceAtTransfer + x.stdPriceAtTransfer,
    actualAcquisition: sum("actualAcquisition"),
    presumedAcquisition: sum("presumedAcquisition"),
  };
  const empty: PartBreakdown = {
    ...x,
    sangjeungbeopValue: 0, stdPriceAtAcquisition: 0, transferPrice: 0, acquisitionPrice: 0, estimatedDeduction: 0, stdPriceAtTransfer: 0,
    ...(x.actualAcquisition === undefined ? {} : { actualAcquisition: 0 }),
    ...(x.presumedAcquisition === undefined ? {} : { presumedAcquisition: 0 }),
  };
  return { ...b, perAsset: ownedKey === "land" ? { land: folded, building: empty } : { land: empty, building: folded } };
}

/** 입력 계약 검사 — 위반이면 던진다(엔진이 0으로 바꾸지 않는다). */
export function assertBgOwnerSplitInputs(owner: OwnerSplit, info: OwnerSplitInfo): void {
  const v = bgOwnerSplitContractViolation(owner, info);
  if (v) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, bgOwnerSplitContractMessage(owner, v.detail), { field: v.field });
}
