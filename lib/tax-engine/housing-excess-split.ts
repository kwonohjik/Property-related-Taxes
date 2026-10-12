/**
 * 토지·건물을 **같은 날** 함께 산 주택(비-별개취득)의 **배율 초과 부수토지 분리** 판정 — 엔진·④·⑤·⑧이 함께 읽는 단일 소스 (#17 · S08-1).
 *
 * ## 왜 필요한가
 *
 * 「소득세법」 §89①3호 비과세 대상은 «주택부수토지»(정착면적 × 지역별 배율 이내 — 영 §154⑦)까지이고, 그 초과분은 §104의3①5호
 * 비사업용 토지다. 조심2024서2826 · 조심2018서2003 · 서울행정법원 2018구단74696은 토지·건물을 같은 날·일괄 취득한 사안에서도
 * 초과분 과세를 유지했다 — 초과분의 성격은 취득 형태와 무관하다. 종전 엔진은 배율 판정(G-2)을 «별개취득»에서만 돌려, 같은 날
 * 산 단독·다가구의 초과분이 1세대1주택으로 전액 비과세되고 고지도 없었다(예: 10억 주택 · 초과 200㎡ → 세액 0 vs 별개취득 입력 44,980,100).
 *
 * ## 무엇을 분리하나 — 자동 안분 fallback이 아니다
 *
 * 초과분 양도차익을 떼려면 토지·건물 가액 구분이 필요하다. 법정 방식은 영 §166⑥·부가가치세법 시행령 §64①1호의 **기준시가 안분**이다
 * (취득 쪽: 개별주택가격 × 토지 ÷ (토지 + 건물) · 양도 쪽: 양도 당시 기준시가 비율). 입력(취득시 3칸 · 양도시 2칸)이 없으면 계산하지 않고
 * ⑧이 막는다 — 비과세로 끝내지 않는다.
 *
 * 🔑 S3-1(2026-10-06)의 «취득시 기준시가 입력 칸은 소유자 분리에만 연다» 결정을 #17(2026-10-11)로 개정한다 — 같은 날 취득 주택의 배율 초과분
 * 분리에도 같은 칸(개별주택가격 · ㎡당 공시지가 · 건물 기준시가 + 양도시 ㎡당 공시지가 · 건물 기준시가)을 연다.
 *
 * ## 적용 범위(검증하지 못한 조합은 막지 않고 «초과분 미분리» 고지로 남긴다)
 *
 * 매매 취득 · 소유자 같음 · 지분 아님 · 부담부증여 아님 · 겸용·PHD·재개발 아님 · 취득일 2005-04-30 이후(취득 당시 개별주택가격이
 * 존재). 상속·증여 평가, 2005-04-30 전 취득, 함께 양도 주택 카드, 환산 + 공익수용 양도는 이 범위 밖이다 — 막지 않고 비과세를 유지하며
 * «초과분 미분리 — 확인 필요»로 고지한다(`housingExcessUnseparatedNotice`; 함께 양도 주택 카드는 ④가 `companionHousingLand`로 면적 사실을 싣는다).
 *
 * 취득가액 산정 방식(실지거래가액·환산·감정·매매사례)은 묻지 않는다(#17-4). 분리 경로(`calcSplitGain` 주택 비-별개)는 개별주택가격을
 * 가목 : 나목 비례로 나누고 환산 분모(양도시 개별주택가격)도 같은 척도로 나누므로, 토지분 + 건물분 환산취득가액이 자산 전체 환산취득가액
 * (양도가액 × 취득시 ÷ 양도시 개별주택가격)을 취득시 기준시가 비율로 나눈 값과 같다 — 감정·매매사례도 총액을 같은 비율로 나눈다(영 §166⑥).
 * 다만 환산 + 공익수용은 §164⑨1호 주택 총액 특례(환산 분모 낮춤)가 분리 경로에 닿지 않는다(주택 분리 + 수용 환산 미지원 Q6과 같은 이유) — 범위 밖.
 */
import { appurtenantLandMultiplier, type AppurtenantLandZone } from "./appurtenant-land-rate";
import { round2 } from "./area-utils";
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE } from "./transfer-split-part-cause";
import type { TransferTaxInput } from "./types/transfer.types";

/** 배율 초과 면적(㎡) — 한도 = 정착면적 × 법정 배율(양도일·지역 연혁). 초과가 없거나 입력이 모자라면 0. */
export function housingExcessAreaM2(p: {
  zone: AppurtenantLandZone | undefined;
  footprintM2: number;
  landAreaM2: number;
  transferDate: Date | undefined;
}): number {
  if (p.zone === undefined || p.transferDate === undefined) return 0;
  if (!(p.footprintM2 > 0) || !(p.landAreaM2 > 0)) return 0;
  const limit = round2(p.footprintM2 * appurtenantLandMultiplier(p.zone, p.transferDate));
  return round2(Math.max(0, p.landAreaM2 - limit));
}

export interface HousingExcessSplitFacts {
  /** 일반 주택(겸용·재개발·PHD·pre1990 아님) */
  isPlainHousing: boolean;
  /** 취득원인 매매 — 상속·증여·신축 평가 조합은 범위 밖 */
  isPurchase: boolean;
  /**
   * 환산취득가액 + 공익수용 양도 — §164⑨1호 주택 총액 특례가 환산 분모를 낮추는데 분리 경로는 그 특례를 반영하지 못한다(범위 밖).
   * 특례 발동 조건(2009-02-04 이후 양도·보상액 입력)까지 따지지 않는 보수적 상위집합이다 — 걸리면 분리 대신 «초과분 미분리» 고지.
   */
  isExpropriationConversion: boolean;
  /** 토지·건물 소유자 같음(`selfOwns === both`) */
  ownsBoth: boolean;
  /** 별개취득이면 기존 G-2 경로 — 이 경로의 대상이 아니다 */
  isSeparateAcquisition: boolean;
  isBurdenedGift: boolean;
  /** 공유지분 양도 */
  isFractional: boolean;
  /**
   * 취득일이 개별주택가격 최초 공시일(2005-04-30) 전 — «취득 당시 개별주택가격»이 존재하지 않아 기준시가 안분 입력(취득시 3칸)을 줄 수 없다.
   * 이 경우는 막지 않고 비과세를 유지하며 «초과분 미분리 — 확인 필요» 고지로 남긴다(#17 조건). 취득일 미입력은 false(취득일 필수는 다른 ⑧이 막는다).
   */
  acquiredBeforeFirstDisclosure: boolean;
  excessAreaM2: number;
}

/** 취득일(ISO `YYYY-MM-DD…`)이 개별주택가격 최초 공시일(2005-04-30) 전인가 — ⑧·④·엔진이 같은 상수·같은 비교를 쓴다. */
export function isBeforeHousePriceFirstDisclosure(acquisitionDate: string | Date | undefined): boolean {
  if (!acquisitionDate) return false;
  if (acquisitionDate instanceof Date) {
    return acquisitionDate.getTime() < new Date(`${SEC_163_9_BUILDING_FIRST_DISCLOSURE}T00:00:00.000Z`).getTime();
  }
  return acquisitionDate.slice(0, 10) < SEC_163_9_BUILDING_FIRST_DISCLOSURE;
}

/** 같은 날 취득 주택의 초과분 분리 경로(5칸 입력 + 기준시가 안분)를 타는가. */
export function housingExcessSplitApplies(f: HousingExcessSplitFacts): boolean {
  return (
    f.isPlainHousing &&
    f.isPurchase &&
    !f.isExpropriationConversion &&
    f.ownsBoth &&
    !f.isSeparateAcquisition &&
    !f.isBurdenedGift &&
    !f.isFractional &&
    !f.acquiredBeforeFirstDisclosure &&
    f.excessAreaM2 > 0
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 엔진 입력 어댑터 — `calcSplitGain` 게이트·`resolveTaxableGain` 차단·고지가 같은 값을 읽는다
// ──────────────────────────────────────────────────────────────────────────────

type EngineFacts = Pick<
  TransferTaxInput,
  | "propertyType"
  | "acquisitionCause"
  | "useEstimatedAcquisition"
  | "selfOwns"
  | "isSeparateAcquisition"
  | "transferType"
  | "ownershipRatio"
  | "totalPropertyTransferPrice"
  | "oneHouseUnitRole"
  | "transferCause"
  | "preHousingDisclosure"
  | "pre1990Land"
  | "redevelopment"
  | "appurtenantLandZone"
  | "buildingFootprintArea"
  | "acquisitionArea"
  | "transferDate"
  | "acquisitionDate"
>;

/** 배율 초과 면적(㎡) — 별개취득 여부·취득원인과 무관한 순수 면적 판정(고지의 모집단). */
export function housingExcessAreaOfInput(input: EngineFacts): number {
  if (input.propertyType !== "housing") return 0;
  return housingExcessAreaM2({
    zone: input.appurtenantLandZone,
    footprintM2: input.buildingFootprintArea ?? 0,
    landAreaM2: input.acquisitionArea ?? 0,
    transferDate: input.transferDate,
  });
}

/** 분리 경로(5칸 입력 + 기준시가 안분)를 타는 입력인가 — 엔진 어댑터. */
export function housingExcessSplitAppliesToInput(input: EngineFacts): boolean {
  return housingExcessSplitApplies({
    isPlainHousing: input.propertyType === "housing" && !input.preHousingDisclosure && !input.pre1990Land && !input.redevelopment,
    isPurchase: (input.acquisitionCause ?? "purchase") === "purchase",
    isExpropriationConversion: input.useEstimatedAcquisition === true && input.transferCause === "public_expropriation",
    ownsBoth: (input.selfOwns ?? "both") === "both",
    isSeparateAcquisition: input.isSeparateAcquisition === true,
    isBurdenedGift: input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift",
    /**
     * 지분 = `ownershipRatio < 1`(클라이언트 술어 `getOwnershipRatio < 1`과 같은 축). `totalPropertyTransferPrice`는 지분 표식이 아니라 12억 판정·안분
     * 분모다 — 일괄양도 1세대1주택 단위(#18 `applyOneHouseUnitPrice`)는 지분이 아닌 주택 카드(`oneHouseUnitRole === "house"`)에도 주택 + 부수토지
     * 합계액을 싣는다. 종전에는 그 값만 보고 지분으로 판정해, ⑤⑧이 받고 ④가 보낸 기준시가 5칸을 엔진이 버리고 초과분을 비과세로 남겼다(#17-3).
     * 그 밖의 경로(겸용 파트 카드의 주택분 합계 등)는 종전대로 지분처럼 범위 밖으로 둔다.
     */
    isFractional:
      (input.ownershipRatio !== undefined && input.ownershipRatio < 1) ||
      (input.totalPropertyTransferPrice !== undefined && input.oneHouseUnitRole !== "house"),
    acquiredBeforeFirstDisclosure: isBeforeHousePriceFirstDisclosure(input.acquisitionDate),
    excessAreaM2: housingExcessAreaOfInput(input),
  });
}
