/**
 * 겸용주택 컴패니언 — **1건을 파트 카드 4~5장으로 펼친다**.
 *
 * ## 왜 파트로 펼치는가
 *
 * 겸용 엔진(`calcMixedUseTransferTax`)은 **세액까지 자체 완결**해 `MixedUseGainBreakdown`을
 * 낸다. 함께양도(5-a)는 자산들을 하나의 신고로 **합산**해야 하므로(§103② 기본공제 1회 ·
 * §104⑤ 비교과세) 세액이 이미 확정된 결과를 합칠 수 없다.
 *
 * ⇒ 겸용 엔진을 **1회 호출하되 `total`은 버리고**, 그 엔진만이 아는 값
 * (§166⑥ 주택·상가 안분 · §97 환산취득가 · §163⑥ 개산공제 · §167의5 배율초과 비율)만
 * 꺼내 aggregate item으로 되먹인다. 세율·장특·비과세·중과는 **item이 다시 판정한다** —
 * aggregate는 item마다 단건 엔진을 그대로 돌리기 때문이다(`transfer-tax-aggregate.ts`).
 *
 * ## 🔑 카드 구성은 실측으로 정했다 (2026-09-04)
 *
 * | 카드 | `propertyType` | 세대 축 | 취득일 |
 * |---|---|---|---|
 * | 주택 토지 | `housing` | **싣는다** | 토지 취득일 |
 * | 주택 건물 | `housing` | **싣는다** | 건물 취득일 |
 * | 상가 토지 | `land` | 없음 | 토지 취득일 |
 * | 상가 건물 | `building` | 없음 | 건물 취득일 |
 * | 배율초과 비사토 | `land` + `isNonBusinessLand` | 없음 | 토지 취득일 |
 *
 * 🔴 **주택을 한 장으로 합치면 안 된다.** 주택분 장기보유특별공제는 토지·건물을 **각각의
 *    보유기간으로** 계산해 더한다(실측: 토지 11년·건물 6년일 때 219,750,439원인데
 *    「차익 × 단일율」은 181,477,799원 — **38,272,640원 차이**). 카드 1장은 취득일이 하나뿐이라
 *    이 블렌딩을 구조적으로 재현할 수 없다.
 *
 * 🔴 **주택 2장에는 `totalPropertyTransferPrice`(주택분 합계)를 반드시 싣는다.** §89① 12억
 *    판정이 **카드 단위**라, 안 실으면 두 장이 각각 12억 이하가 되어 **주택분이 통째로 비과세**된다
 *    (실측 뮤테이션: 과세표준 674,353,403 → 611,479,114).
 *
 * 🔴 **상가·비사토 카드에는 세대 축을 싣지 않는다**(GB `buildProperties`와 같은 규약).
 *    실으면 상가가 1세대1주택 표2 80% 장특을 받는다(실측으로 실제 그렇게 됐다).
 *
 * ## 실측 — 단건 겸용과 세액이 **완전히 일치**한다
 *
 * | 케이스 | 과세표준 | 세액(단건×1.1 = aggregate) |
 * |---|---|---|
 * | 기본 | 1,670,099,614 | 754,165,308 |
 * | 보유기간 상이·표1 미포화 | 1,977,597,282 | 906,376,653 |
 * | 1세대1주택 표2 + 12억 | 674,353,403 | 272,017,271 |
 * | 배율초과 비사토 | 1,348,935,828 | 595,189,234 |
 * | §104⑦ 중과 2주택 | 2,123,794,113 | 1,251,108,072 |
 *
 * 설계문서: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md` §10
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { buildMixedUseAssetInput } from "./mixed-use-asset-input";
import type { MixedUseZodPayload } from "./mixed-use-asset-input";
import type { MixedUseCompanionContext } from "./bundled-split-helpers";
import { reductionsForCard } from "./general-building-route-cards";

/** 파트 카드 id 접미사 — 결과뷰·신고서가 자산을 되짚을 수 있게 `#<assetId>`를 붙인다. */
export const MIXED_USE_PART_IDS = {
  housingLand: "mu-house-land",
  housingBuilding: "mu-house-bld",
  commercialLand: "mu-comm-land",
  commercialBuilding: "mu-comm-bld",
  nonBusinessLand: "mu-nbl",
} as const;

export function buildMixedUsePartCards(
  /**
   * 이미 조립된 컴패니언 item — 세대 축(§89②·§104⑦)·감면·미등기·`propertyId` 등을 그대로
   * 물려받는다. **평범한 주택 컴패니언과 같은 값을 쓰는 것**이 이 스프레드의 목적이다.
   */
  companionEngine: TransferTaxItemInput,
  mixedAsset: MixedUseAssetInput,
  /** 5-a가 §166⑥ 키로 안분한 **그 자산의 몫**. 자산 간 안분은 호출부가 이미 끝냈다. */
  partTransferPrice: number,
  transferDate: Date,
  rates: TaxRatesMap,
  assetId: string,
  assetLabel: string,
): TransferTaxItemInput[] {
  const r = calcMixedUseTransferTax(partTransferPrice, transferDate, mixedAsset, rates);
  const hp = r.housingPart;
  const cp = r.commercialPart;
  const nb = r.nonBusinessLandPart;

  const landAcqDate = mixedAsset.landAcquisitionDate;
  const bldAcqDate = mixedAsset.buildingAcquisitionDate;

  /**
   * 배율초과 비사토 carve-out — 주택 **토지분**에서 비율만큼 떼어낸다.
   * 절사는 비사토 쪽에서 하고 **잔액은 주택이 흡수**한다(합 불변식 — 저장소 공통 규약).
   */
  const ratio = hp.nonBusinessTransferRatio ?? 0;
  const nblA = Math.floor(hp.landAcqPrice * ratio);
  const nblE = Math.floor(hp.landAppraisalDed * ratio);
  /**
   * 🔑 **양도가액이 잔액을 흡수한다** — 비사토 카드의 차익이 엔진의
   * `nonBusinessTransferredGain`과 **정확히** 같아지도록 역산한다.
   *
   * ⚠️ 세 금액을 각각 `floor(비율 × ·)` 하면 차익이 1원 어긋난다(실측). 엔진은 **차익**을
   *    비율로 쪼개고(`floor(landGain × ratio)`) 우리는 **금액**을 쪼개므로, 절사 지점이 다르면
   *    그만큼 갈린다. 주택 토지 카드가 나머지를 그대로 받으므로 합은 불변이다.
   */
  const nblT = ratio > 0 ? hp.nonBusinessTransferredGain + nblA + nblE : 0;

  const housingLandT = hp.landTransferPrice - nblT;

  /**
   * §89①3호 고가주택(12억) 판정·안분 **분모** — 카드별 판정을 막는다.
   *
   * 🔑 **겸용 엔진이 쓴 값을 그대로 가져온다**(`apportionment`). 여기서 카드 금액으로 다시
   *    만들면 두 경로가 갈린다:
   *
   *    · **지분 양도** — 엔진은 `wholeHousingTransferPrice`(물건 전체 주택분, 영 §156①)를
   *      쓰는데 카드 합계는 **내 지분분**이다. 지분 60%·물건 전체 주택분 16.7억이면
   *      카드 합계 10억이 12억 이하가 되어 **전액 비과세**가 된다(실측).
   *    · **배율초과 비사토** — 카드 합계는 carve-out **후**, 엔진 분모는 carve-out **전**이다.
   *      비사토가 있으면 그만큼 분모가 작아져 안분율이 달라진다.
   *
   *   ⇒ 단일 소스는 `apportionment`다.
   */
  const housingTotal =
    r.apportionment.wholeHousingTransferPrice ?? r.apportionment.housingTransferPrice;

  /**
   * 두 축을 **명시적으로 중화**한다 — `companionEngine` 스프레드가 실어 오지만 파트 카드에서는
   * 재적용되면 안 되는 값들이다.
   *
   * · **분리취득 축**(`isSeparateAcquisition` 등): 우리가 이미 토지·건물로 갈라 놓았다.
   *   남겨 두면 `calcSplitGain`이 카드 안에서 **한 번 더** 쪼갠다.
   * · **환산 축**(`useEstimatedAcquisition`): 취득가액은 겸용 엔진이 이미 환산해 넣었다.
   *   true로 두면 item이 자기 기준시가로 **다시** 환산한다.
   */
  const neutralized = {
    isSeparateAcquisition: false,
    landAcquisitionPrice: undefined,
    buildingAcquisitionPrice: undefined,
    landDirectExpenses: undefined,
    buildingDirectExpenses: undefined,
    landTransferPrice: undefined,
    buildingTransferPrice: undefined,
    saleSplitMode: undefined,
    useEstimatedAcquisition: false,
    standardPriceAtAcquisition: undefined,
    standardPriceAtTransfer: undefined,
    totalPropertyTransferPrice: undefined,
    /** 겸용 서브객체는 **파트로 대체**됐다 — 남기면 item이 겸용 엔진을 다시 부른다. */
    mixedUse: undefined,
  } satisfies Partial<TransferTaxItemInput>;

  /** 주택이 아닌 파트 — 세대 축을 지운다(GB `buildProperties`와 같은 규약). */
  const nonHousing = {
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
  } satisfies Partial<TransferTaxItemInput>;

  const card = (
    idBase: string,
    label: string,
    propertyType: TransferTaxItemInput["propertyType"],
    isBuilding: boolean,
    amounts: { transferPrice: number; acquisitionPrice: number; expenses: number },
    acquisitionDate: Date,
    extra: Partial<TransferTaxItemInput> = {},
  ): TransferTaxItemInput => ({
    ...companionEngine,
    ...neutralized,
    propertyId: `${idBase}#${assetId}`,
    propertyLabel: `${assetLabel} ${label}`.trim(),
    propertyType,
    ...amounts,
    acquisitionDate,
    transferDate,
    // 감면은 **카드마다 같은 배열**을 싣는다 — §133② 한도는 집계 단계에서 1회 적용된다
    // (GB와 같은 규칙·같은 함수). §77의3 건물 제외 축도 그대로 따라온다.
    reductions: reductionsForCard(companionEngine.reductions, isBuilding),
    ...extra,
  });

  return [
    card(
      MIXED_USE_PART_IDS.housingLand,
      "주택 부수토지",
      "housing",
      false,
      {
        transferPrice: housingLandT,
        acquisitionPrice: hp.landAcqPrice - nblA,
        expenses: hp.landAppraisalDed - nblE,
      },
      landAcqDate,
      { totalPropertyTransferPrice: housingTotal },
    ),
    card(
      MIXED_USE_PART_IDS.housingBuilding,
      "주택 건물",
      "housing",
      true,
      {
        transferPrice: hp.buildingTransferPrice,
        acquisitionPrice: hp.buildingAcqPrice,
        expenses: hp.buildingAppraisalDed,
      },
      bldAcqDate,
      { totalPropertyTransferPrice: housingTotal },
    ),
    card(
      MIXED_USE_PART_IDS.commercialLand,
      "상가 부수토지",
      "land",
      false,
      {
        transferPrice: cp.landTransferPrice,
        acquisitionPrice: cp.landAcqPrice,
        expenses: cp.landAppraisalDed,
      },
      landAcqDate,
      nonHousing,
    ),
    card(
      MIXED_USE_PART_IDS.commercialBuilding,
      "상가 건물",
      "building",
      true,
      {
        transferPrice: cp.buildingTransferPrice,
        acquisitionPrice: cp.buildingAcqPrice,
        expenses: cp.buildingAppraisalDed,
      },
      bldAcqDate,
      nonHousing,
    ),
    /**
     * §104⑤ 본문 **후단** — 한 필지가 비사업용 토지와 그 외로 구분되면 **각각을 별개 자산**으로
     * 보아 산출세액을 계산한다. 그래서 별도 카드이고 `isNonBusinessLand`로 §104①8호(+10%p)를 탄다.
     */
    ...(nb
      ? [
          card(
            MIXED_USE_PART_IDS.nonBusinessLand,
            "주택 부수토지(배율초과)",
            "land",
            false,
            { transferPrice: nblT, acquisitionPrice: nblA, expenses: nblE },
            landAcqDate,
            { ...nonHousing, isNonBusinessLand: true },
          ),
        ]
      : []),
  ];
}

/**
 * ⑭ 컴패니언 겸용 자산 1건 → 파트 item 4~5개.
 *
 * `bundled-split-helpers.ts`의 분기에서 이리로 옮겼다 — 조립(`buildMixedUseAssetInput`)과
 * 확장(`buildMixedUsePartCards`)이 여기 함께 있는 편이 응집도가 높고, 그 파일의 800줄 정책도 지킨다.
 */
export function buildMixedUseCompanionItems(
  mixedUse: MixedUseZodPayload,
  companionEngine: TransferTaxItemInput,
  ctx: {
    transferDate: Date;
    mixedUseCtx: MixedUseCompanionContext | null;
    primaryEngineInput: {
      householdHousingCount: number;
      isRegulatedArea: boolean;
      wasRegulatedAtAcquisition: boolean;
      presaleRights?: TransferTaxItemInput["presaleRights"];
    };
  },
  asset: {
    ownershipRatio: number | undefined;
    isUnregistered: boolean | undefined;
    /** §89①3호 12억 분모(영 §156①·②) — 지분 양도 전용. */
    totalPropertyTransferPrice: number | undefined;
    assetId: string;
    assetLabel: string;
    allocatedSalePrice: number;
  },
): TransferTaxItemInput[] {
  /**
   * ⑩ refine이 `mixed_use_house`에 `mixedUse`를 강제하고 route는 항상 컨텍스트를 넘기므로
   * 여기 도달할 수 없다. **조용히 일반 주택으로 계산하는 대신 시끄럽게 실패한다** —
   * 침묵 오산이 이 축의 유일한 위험이기 때문이다.
   */
  if (!ctx.mixedUseCtx) {
    throw new Error("겸용주택 컴패니언에 서브엔진 컨텍스트가 없습니다");
  }
  const g = ctx.mixedUseCtx.globals;
  const mixedAsset = buildMixedUseAssetInput({
    mixedUse,
    transferDate: ctx.transferDate,
    // ── 자산-수준 ──
    ownershipRatio: asset.ownershipRatio,
    isUnregistered: asset.isUnregistered,
    totalPropertyTransferPrice: asset.totalPropertyTransferPrice,
    reductions: companionEngine.reductions,
    /**
     * 가산세는 **신고서 단위**로만 부과한다 — route가 aggregate에 직접 넘긴다.
     * 파트 카드에 실으면 같은 신고 1건의 가산세가 카드 수만큼 배가된다.
     */
    filingPenaltyDetails: undefined,
    delayedPaymentDetails: undefined,
    assetContractDate: companionEngine.assetContractDate,
    // ── 폼-전역(세대 단위) — primary와 같은 값을 상속한다 ──
    wasRegulatedAtAcquisition: ctx.primaryEngineInput.wasRegulatedAtAcquisition,
    regionCode: g.regionCode,
    oneHouseExemptionProviso: g.oneHouseExemptionProviso,
    temporaryTwoHouse: g.temporaryTwoHouse,
    householdHousingCount: ctx.primaryEngineInput.householdHousingCount,
    specialHouseExclusions: g.specialHouseExclusions,
    isOneHousehold: companionEngine.isOneHousehold ?? false,
    isRegulatedArea: ctx.primaryEngineInput.isRegulatedArea,
    isSelfCultivatedExpropriatedLand: g.isSelfCultivatedExpropriatedLand,
    priorReductionUsage: [],
    // ── §104⑦ 중과 판정 입력 ──
    rawHouses: g.rawHouses,
    houses: g.houses,
    sellingHouseId: g.sellingHouseId,
    presaleRights: ctx.primaryEngineInput.presaleRights,
    marriageMerge: g.marriageMerge,
    parentalCareMerge: g.parentalCareMerge,
    gracePeriod: g.gracePeriod,
    unavoidableOutsideCapitalHouse: g.unavoidableOutsideCapitalHouse,
  });
  return buildMixedUsePartCards(
    companionEngine,
    mixedAsset,
    asset.allocatedSalePrice,
    ctx.transferDate,
    ctx.mixedUseCtx.rates,
    asset.assetId,
    asset.assetLabel,
  );
}
