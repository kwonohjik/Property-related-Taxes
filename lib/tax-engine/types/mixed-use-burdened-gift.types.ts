/**
 * 겸용주택 × 부담부증여 — 결과 명세 타입.
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.engine.design.md §3.5.
 *
 * `TransferBurdenedGiftBreakdown`의 증여세·평가·채무 필드는 그대로 재사용하고, 토지/건물 2부분(`perAsset`)을
 * 겸용 4부분(`perPart`)으로 바꾼다. `perAsset`을 토지/건물 합으로 흉내 내지 않는다 — 부분별 1~3원 어긋남이 가려진다.
 * `debtRatio`(단일)는 귀속 하에서 어느 부분의 비율도 아니므로 Omit하고 `debtAttribution`의 부분별 비율을 쓴다.
 */
import type {
  TransferBurdenedGiftAcquisitionMethodUsed,
  TransferBurdenedGiftBreakdown,
} from "./transfer-burdened-gift.types";

export type MixedUsePartKey = "housingLand" | "housingBuilding" | "commercialLand" | "commercialBuilding";

export interface MixedUseBurdenedGiftPart {
  /** A_i — 이 부분의 상증법 평가가액(보충적: 양도시 기준시가 basis · 시가: 시가 총액의 기준시가 비례 몫) */
  sangjeungbeopValue: number;
  /** 취득시 기준시가 basis */
  stdPriceAtAcquisition: number;
  /** 양도시 기준시가 basis */
  stdPriceAtTransfer: number;
  /** 양도가액 = 그 쪽(주택/상가) 채무 상당액의 체인 안분 몫 */
  transferPrice: number;
  /** 취득가액. §97②2호 단서(나목) 채택 시 0 */
  acquisitionPrice: number;
  /** 개산공제 또는 실비 안분 */
  estimatedDeduction: number;
  /** 개산공제율 echo — 개산공제 경로에서만 */
  estimatedDeductionRate?: number;
  acquisitionMethod: TransferBurdenedGiftAcquisitionMethodUsed;
  /** 단서(나목) 채택 전 환산취득가액 — 표시용 */
  acquisitionBeforeSwap?: number;
  /**
   * 채무비율(`B_side'/C_side`)을 곱하기 전 취득가액 — 증여자 상속·증여 취득(소령 §163⑨ 평가액·§164 가액)에서만 있다.
   * §163⑨ 단서 자산 합계 비교(`calcMixedSec163_9Compare`)가 이 값의 합계로 후보를 비교한다(사용자 결정 Q-36 · PR-7b-7a-2).
   */
  acquisitionBeforeRatio?: number;
  /**
   * 이 부분이 속한 쪽(주택/상가)이 양도로 보는 채무액을 가졌는가(`B_side' > 0`). false면 위 금액은 전부 0이다.
   * 세법상 분류(비과세/과세)가 아니라 «양도 여부»다 — 비과세여도 양도했으면 true.
   */
  transferred: boolean;
}

export interface MixedUseDebtAttributionEcho {
  /** 입력 3값 */
  housing: number;
  commercial: number;
  unallocated: number;
  /** 구분 불분명분의 안분 결과 */
  unallocatedToHousing: number;
  unallocatedToCommercial: number;
  /** 주택/상가가 «양도로 보는 채무액» B_h', B_c' */
  housingDebt: number;
  commercialDebt: number;
  /** 부분별 채무비율 B_h'/C_h, B_c'/C_c */
  housingRatio: number;
  commercialRatio: number;
  /** 부분별 증여가액 C_h, C_c */
  housingGiftValue: number;
  commercialGiftValue: number;
}

export type MixedUseBurdenedGiftBreakdown = Omit<
  TransferBurdenedGiftBreakdown,
  | "perAsset"
  | "debtRatio"
  | "convertedAcquisitionBeforeSwap"
  | "wholePropertySupplementary"
  | "fractionalHighValueDenominator"
  | "acquisitionStdForcedByCollateral"
  | "assetKind"
  | "rightValuationDetail"
  | "carryoverGiftTax"
  | "ownershipRatio"
> & {
  perPart: Record<MixedUsePartKey, MixedUseBurdenedGiftPart>;
  /** 12억 판정/안분 echo — 결과뷰가 분모를 재도출하지 않게 한다 */
  highValue: {
    /** 양도하는 주택 부분이 있어 판정·안분이 걸리는가(false = «주택 양도 없음») */
    applicable: boolean;
    judgmentBase: number;
    prorationBase: number;
    basis: "whole_building_C" | "housing_part_C";
  };
  debtAttribution: MixedUseDebtAttributionEcho;
  /**
   * 증여자가 상속·증여로 취득해 상속개시일·증여일 현재 상증법 평가액(주택분·상가분)이 취득 당시 실지거래가액인 경로(소령 §163⑨ — 시가 평가만).
   * `acquisitionMethodUsed`는 "actual"(실지거래가액 경로)이고, 결과뷰는 이 값으로 「실지취득가액」 대신 평가액이라고 적는다. 그 밖에는 없다.
   */
  deemedCause?: "inheritance" | "gift";
  /**
   * `deemedCause`가 있을 때 주택분·상가분 취득가액(채무비율 전)이 무엇으로 정해졌는가 — 결과 라벨용(PR-7b-7a-2).
   * reported = 상속개시일·증여일 평가액(①) · standard = §164 가액(②: 주택분은 PHD면 §164⑦ 환산가액, 아니면 취득시 개별주택가격 · 상가분은 취득시 토지 + 건물 기준시가).
   */
  deemedBasis?: { housing: "reported" | "standard"; commercial: "reported" | "standard"; housingPhd: boolean };
};
