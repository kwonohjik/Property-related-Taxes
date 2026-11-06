/**
 * 겸용주택 × 차감형 감면주택(조특법 §99·§99의3 등) 다주택 중과 배제 선판정 (리뷰 NH-09).
 *
 * 소득세법 시행령 §167의3①5호(3주택 이상)·§167의10①2호(2주택 — ①5호 준용)는 「조세특례제한법」 §99·§99의3 등에 따라
 * 양도소득세가 «감면되는 주택»을 중과 대상에서 뺀다. 단건 경로는 STEP 0.45(`runSurchargeAndLandSteps`)가 감면 입력이 적격이면
 * 양도 주택 행에 `isTaxSpecialExemption`을 주입해 배제한다. 겸용은 감면 선택을 «차감형은 계산하지 않고 고지»로만 다뤄
 * 이 주입이 빠져 있었다. 이 파일이 **같은 leaf(`resolveSurchargeExclusionByReduction`)·같은 인자**로 겸용에서도 선판정한다.
 *
 * ## 단건과 같은 인자, 겸용에서 다른 것
 *
 * | 인자 | 단건(STEP 0.45) | 겸용 |
 * |---|---|---|
 * | `acquisitionDate` | 자산 취득일 | **건물 취득일** — 겸용 §89 판정이 쓰는 주택 부분 취득일(`transfer-tax-mixed-use-exemption.ts`)과 같다 |
 * | `totalPropertyTransferPrice` | 지분 물건 전체 가액 | **고가주택 판정 가액**(아래) — 라우터는 이 칸으로 «고가주택 가액»을 읽는다 |
 * | `burdenedGiftDenominator` | 증여가액(부담부증여) | 넘기지 않는다 — 부담부증여 겸용의 증여가액은 `asset.totalPropertyTransferPrice`(= C)로 이미 덮여 있다 |
 * | `selfOwns` | 토지·건물 소유자 분리 | 넘기지 않는다 — 겸용은 소유자 분리 축 밖이다(`lib/calc/self-owns-scope.ts` `selfOwnsSplitApplicable`) |
 * | `acquisitionCause` | 자산 취득 원인 | 같다 — 취득 원인 echo(`asset.acquisitionCause`). 컴패니언 겸용은 비어 있다 |
 * | `standardPriceAtTransfer` | 자산 양도시 기준시가 | 넘기지 않는다 — 겸용은 3분할이라 단일 값이 없다. 감면 입력 자신의 칸(`standardPriceAtTransfer99` 등)이 쓰인다 |
 *
 * ## 고가주택 판정 가액 — 겸용 §89①3호 판정(`buildHousingPart` `highValueJudgmentBase ?? highValueBase`)과 같은 소스
 *
 * 조특법 §99①·§99의3① 단서가 가리키는 고가주택은 소득세법 §89①3호의 개념이고, 겸용의 판정 가액은 소령 §156②다.
 * - 주택 연면적 > 주택 외 연면적(소령 §154③ 본문): 건물 전부를 주택으로 보므로 **겸용 전체 양도가액**(공유지분이면 물건 전체)
 * - 그 밖(§154③ 단서): **주택분 양도가액**(공유지분이면 물건 전체 기준 주택분 `wholeHousingTransferPrice`)
 * 코드: `transfer-tax-mixed-use.ts`의 `wholeBuildingPrice`(L-10)와 `transfer-tax-mixed-use-helpers.ts`의 `highValueBase`.
 *
 * 감면 불성립(고가·기간 밖 등)이면 소령 §167의3①5호 «감면되는 주택»이 아니므로 중과도 배제하지 않는다 —
 * 라우터가 `eligibleId`를 주지 않으면 `excluded=false`다(차감 선판정과 본판정이 갈라지지 않는다).
 *
 * 차감(양도소득금액 공제) 자체는 이 파일이 하지 않는다 — §99·§99의3은 `transfer-tax-mixed-use-income-deduction.ts`(NH-33)가 주택분에서 계산하고,
 * 나머지 차감형은 그대로 고지만 한다.
 */
import { resolveSurchargeExclusionByReduction, buildSurchargeExclusionStep } from "./transfer-reductions";
import type { MixedUseApportionment, MixedUseAssetInput, MixedUseStep } from "./types/transfer-mixed-use.types";
import type { HouseInfo } from "./types/multi-house-surcharge.types";

/** 겸용에서 주택분 양도소득금액 차감으로 **계산하는** 차감형 조문(NH-33 — `transfer-tax-mixed-use-income-deduction.ts`). 나머지 차감형은 종전대로 고지만 한다. */
export const MIXED_INCOME_DEDUCTION_COMPUTED_IDS: ReadonlySet<string> = new Set(["new_99_3", "new_99"]);

export type MixedReductionSurchargeExclusion = ReturnType<typeof resolveSurchargeExclusionByReduction>;

/** 고가주택 판정 가액 — 위 헤더 참조. `transferPrice`는 부담부증여면 채무 합계라 BG에서는 `asset.totalPropertyTransferPrice`(증여가액 C)가 우선한다. */
export function mixedHighValueJudgmentPrice(
  asset: Pick<MixedUseAssetInput, "residentialFloorArea" | "nonResidentialFloorArea" | "totalPropertyTransferPrice">,
  transferPrice: number,
  apportionment: Pick<MixedUseApportionment, "wholeHousingTransferPrice" | "housingTransferPrice">,
): number {
  const wholeBuildingDeemedHouse = asset.residentialFloorArea > asset.nonResidentialFloorArea;
  return wholeBuildingDeemedHouse
    ? (asset.totalPropertyTransferPrice ?? transferPrice)
    : (apportionment.wholeHousingTransferPrice ?? apportionment.housingTransferPrice);
}

/** STEP 0.45 겸용판 — 감면 입력이 적격이면 `excluded: true`. */
export function resolveMixedReductionSurchargeExclusion(
  asset: MixedUseAssetInput,
  transferDate: Date,
  transferPrice: number,
  apportionment: MixedUseApportionment,
): MixedReductionSurchargeExclusion {
  return resolveSurchargeExclusionByReduction(asset.reductions, {
    transferDate,
    acquisitionDate: asset.buildingAcquisitionDate,
    assetContractDate: asset.assetContractDate,
    transferPrice,
    totalPropertyTransferPrice: mixedHighValueJudgmentPrice(asset, transferPrice, apportionment),
    // 조특법 §129② — 미등기면 «감면되는 주택»이 아니다(단건 STEP 0.45와 같은 게이트 · NH-58)
    isUnregistered: asset.isUnregistered,
    // 취득 원인 게이트 — 상속·증여(지분 포함)로 받은 주택은 §99·§99의3 «감면되는 주택»이 아니다(단건 STEP 0.45와 같은 값 · L1c).
    // 컴패니언 겸용은 이 echo가 비어 매매로 보고 최초 계약 여부(감면 입력 칸)로 판정한다.
    acquisitionCause: asset.acquisitionCause,
  });
}

/** 단건 `housesForSurcharge`와 같다 — 양도 주택 행에만 «조세특례제한법 특례 적용 주택» 표시를 얹는다. */
export function withReductionExcludedSellingHouse(
  houses: HouseInfo[],
  sellingHouseId: string,
  exclusion: MixedReductionSurchargeExclusion,
): HouseInfo[] {
  return exclusion.excluded
    ? houses.map((h) => (h.id === sellingHouseId ? { ...h, isTaxSpecialExemption: true } : h))
    : houses;
}

/** 단건 `buildSurchargeExclusionStep`을 겸용 step 모양으로 옮긴다 — 같은 라벨·근거를 쓴다. */
export function buildMixedReductionSurchargeExclusionStep(exclusion: MixedReductionSurchargeExclusion): MixedUseStep {
  const s = buildSurchargeExclusionStep(exclusion);
  return {
    id: "surcharge-exclusion-by-reduction",
    title: s.label,
    legalBasis: s.legalBasis,
    values: [{ label: s.formula, value: "중과 배제", isResult: true }],
  };
}

/** 중과 배제 반영 고지 — §99·§99의3은 주택분 차감도 함께 계산하므로(NH-33) «차감 미반영» 문구를 붙이지 않는다. 그 밖의 차감형은 종전 문구를 유지한다. */
export function mixedReductionSurchargeExclusionNotice(exclusion: MixedReductionSurchargeExclusion): string {
  const s = buildSurchargeExclusionStep(exclusion);
  const deductionComputed = exclusion.appliedId !== undefined && MIXED_INCOME_DEDUCTION_COMPUTED_IDS.has(exclusion.appliedId);
  return (
    `다주택 중과 배제를 반영했습니다 — ${s.formula}(${s.legalBasis}).` +
    (deductionComputed
      ? ""
      : " 겸용주택 계산은 감면의 양도소득금액 차감은 반영하지 않으므로 중과 배제만 적용된 결과입니다.")
  );
}
