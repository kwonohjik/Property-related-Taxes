/**
 * 양도소득세 route 5-a — 일괄양도 분기 (소득세법 시행령 §166⑥).
 *
 * `route.ts`에서 분리(800줄 정책). companionAssets가 있고 안분 키가 갖춰지면 안분 → 자산별 카드 → 다건 엔진을 돌려
 * 응답 `data`를 돌려주고, 일괄양도가 아니면 `null`을 돌려준다(route가 다음 분기로 넘어간다).
 *
 * ⚠️ 성공 응답은 route가 `okJson`으로 감싼다 — 여기서 `NextResponse`를 만들지 않는다(E-14l 비유한 값 가드).
 * ⚠️ `engineInput`을 그대로 고친다(주 자산 토지의 `primaryContextForCompanionRate`) — 종전 route 본문과 같은 동작이다.
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { PropertySchemaInput } from "@/lib/api/transfer-tax-schema";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { buildMixedUseCompanionItems } from "./mixed-use-part-cards";
import type { MixedUseCompanionContext } from "./bundled-split-helpers";
import { buildGbCompanionItems } from "./general-building-part-cards";
import {
  resolveHousingContextFromCompanion,
  buildCompanionEngineInputs,
} from "./bundled-split-helpers";
import { prepareBundledApportionment } from "./bundled-apportionment";
import { burdenedGiftBundleKind } from "@/lib/calc/burdened-gift-transfer-price-scope";
import { shareWholePropertyPrice } from "./bundled-apportionment";
import { appurtenantLimitShareOf } from "./bundled-companion-split";
import { asReverseUnitHouse, resolveReverseAppurtenantUnit, reverseUnitHouseFacts, splitReversePrimaryLand } from "./bundled-reverse-appurtenant";
import { aggregateWithSameDayRightWarning } from "@/lib/tax-engine/one-house/same-day-right";
import type { GbBundledAssetDetail } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { GB_BG_SELF_BUILT_NOTICE } from "@/lib/tax-engine/general-building-bg-penalty-signal";

export function calculateBundledTransfer(
  data: PropertySchemaInput,
  engineInput: TransferTaxInput,
  rates: TaxRatesMap,
  transferDate: Date,
  acquisitionDate: Date,
) {
  // companionAssets 존재 시 안분 → 자산별 상속 취득가액 → 다건 엔진
  //
  // 양도가액 결정 모드 (data.bundledSaleMode, 계약서 단위 단일 결정):
  //   - "actual":      §166⑥ 본문. 계약서에 구분 기재된 fixedSalePrice 사용.
  //   - "apportioned": §166⑥ 단서. standardPriceAtTransferForApportion 비율 안분.
  const companions = data.companionAssets ?? [];
  const isActualMode = data.bundledSaleMode === "actual";
  // 지분 모드 식별: primary 또는 모든 companion이 totalPropertyTransferPrice를 가지면 ratio×total로 자동 안분.
  // 별도 안분 키(actual 가액 또는 양도시 기준시가)가 불필요하므로 bundled flow 진입 허용.
  const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
  const allCompanionsFractional =
    companions.length > 0 && companions.every((c) => c.totalPropertyTransferPrice !== undefined);
  // 완전 지분 모드(축 B): primary·전 companion 모두 fractional (같은 물건 지분 분할).
  // 이때만 각 자산의 확정 양도가액(총계약가×ratio)을 fixedSalePrice로 주입하고 안분 키를 면제한다.
  // 혼합(함께양도 묶음에 지분 자산이 섞임)은 축 B가 아니다 — 지분 자산도 계약서 가액(actual) 또는 안분 키(apportioned)를
  // 가진다(④가 100% 입력 × 지분율로 싣는다). 종전에는 한쪽만 지분이어도 키를 면제해 actual 500·apportioned 양도가액 0이었다
  // (2026-10-10 실측). ⑫ `transfer-tax-schema.ts`의 면제도 같은 판정이다.
  // ⑭ 명시 플래그(⑬ — 화면의 사용자 선택)가 앞선다. 함께 양도 묶음의 전 자산이 지분이면 모양(전 자산 `totalPropertyTransferPrice`)만으로는
  //    축 B와 구분되지 않아, 종전에는 자산별 양도가액을 「총양도가 × 지분율」로 바꿨다(2026-10-18 실측 T1 229,812,000 vs 218,724,000).
  const isFullFractionalBundle = data.fractionalSplitBundle ?? (primaryIsFractional && allCompanionsFractional);
  // 전 자산 부담부증여: 양도가액을 §159가 정한다 → 안분 키·계약서 가액 불필요(⑩과 같은 술어 · 확정 가액 Bᵢ는 안분 준비가 넣는다)
  const isAllBurdenedGift = burdenedGiftBundleKind([data.transferType === "burdened_gift", ...companions.map((c) => c.burdenedGiftInfo !== undefined)]) === "all";
  const bundledOk =
    companions.length > 0 &&
    data.totalSalePrice !== undefined &&
    (
      // 축 B: ratio×total 자동 안분 → 안분 키 불필요
      isFullFractionalBundle ||
      isAllBurdenedGift ||
      // actual 모드: primary 명시 가액 필요
      (isActualMode && data.primaryActualSalePrice !== undefined) ||
      // apportioned 모드: 안분 키 (양도시 기준시가) 필요
      (!isActualMode && data.standardPriceAtTransferForApportion !== undefined)
    );

  if (!bundledOk) return null;

  // (1)~(4.5) 안분 준비·실행 — bundled-split-helpers.ts로 추출 (800줄 정책)
  const { apportionment, adjustedAcq } = prepareBundledApportionment(
    {
      propertyType: data.propertyType,
      totalSalePrice: data.totalSalePrice,
      standardPriceAtTransferForApportion: data.standardPriceAtTransferForApportion,
      expenses: data.expenses,
      acquisitionPrice: data.acquisitionPrice,
      primaryActualSalePrice: data.primaryActualSalePrice,
      primaryInheritanceValuation: data.primaryInheritanceValuation,
      // ⑭ 신고 단위 공통 양도비 (§100② 후단) — 안분은 엔진 Step 5가 수행한다.
      commonTransferExpense: data.commonTransferExpense,
      burdenedGiftInfo: data.transferType === "burdened_gift" ? data.burdenedGiftInfo : undefined,
    },
    companions,
    { isActualMode, isFullFractionalBundle, isAllBurdenedGift },
  );

  // (5) TransferTaxItemInput[] 조립 — 주 자산은 engineInput 파생, 컴패니언은 기본값 + override
  // G-2: companion이 한도 초과 split 대상이면 flatMap으로 두 자산([appurtenant, excess])을 생성.
  //      split 조건: newConstruction + land + areaM2 있음 + excessArea > 0 + 수동 오버라이드 없음
  const primaryHp = calculateHoldingPeriod(acquisitionDate, transferDate);

  // 사례 28 자동 분기 양방향 확장 + 폼-수준 사용자 모드 (헬퍼)
  const housingCtxFromCompanion =
    engineInput.propertyType !== "housing"
      ? resolveHousingContextFromCompanion(
          companions,
          transferDate,
          data.buildingFootprintArea,
          data.isUrbanArea,
          data.bundledSaleMode,
          data.appurtenantLandZone,
        )
      : undefined;

  // G1 — 사례 28 역방향(첫 자산 주택부수토지 + 함께 양도 주택 1건): 주택 카드가 단위의 주택, 첫 자산 토지는 배율 이내·초과로 나눈다.
  const reverseUnit = resolveReverseAppurtenantUnit(engineInput, companions, housingCtxFromCompanion);

  const primaryCtxForSplit = reverseUnit
    ? reverseUnit.houseCtx
    : engineInput.buildingFootprintArea !== undefined ||
    engineInput.manualHoldingPeriodOverride !== undefined
      ? {
          propertyType: engineInput.propertyType,
          holdingMonths: primaryHp.years * 12 + primaryHp.months,
          buildingFootprintArea: engineInput.buildingFootprintArea,
          isUrbanArea: engineInput.isUrbanArea,
          appurtenantLandZone: engineInput.appurtenantLandZone,
          bundledSaleMode: data.bundledSaleMode,
        }
      : housingCtxFromCompanion;

  // #17 후속(K1) — 배율 한도를 주 자산 주택 카드의 토지와 부수토지 카드들이 함께 쓴다.
  const appurtenantLimitShare = reverseUnit?.limitShare ?? appurtenantLimitShareOf(engineInput, companions);

  // 사례 28 — primary가 land이고 housingCtxFromCompanion이 있으면 primaryCtx 주입 (양방향 자동 분기)
  // landNature는 개별 자산에 명시 입력되므로 폼-수준 userModeOverride 불필요.
  if (engineInput.propertyType === "land") {
    if (housingCtxFromCompanion && !engineInput.primaryContextForCompanionRate) {
      engineInput.primaryContextForCompanionRate = {
        propertyType: housingCtxFromCompanion.propertyType,
        holdingMonths: housingCtxFromCompanion.holdingMonths,
        buildingFootprintArea: housingCtxFromCompanion.buildingFootprintArea,
        isUrbanArea: housingCtxFromCompanion.isUrbanArea,
        appurtenantLandZone: housingCtxFromCompanion.appurtenantLandZone,
        bundledSaleMode: housingCtxFromCompanion.bundledSaleMode,
      };
    }
  }

  /**
   * ⑭ 겸용 서브엔진 컨텍스트 — **primary와 컴패니언이 같은 객체를 쓴다**.
   *
   * 폼-전역 값이라 자산마다 달라질 수 없다. 두 곳에서 따로 조립하면 한쪽만 필드를
   * 빠뜨리는 순간 「같은 물건이 자리에 따라 다른 값」이 된다.
   *
   * `globals` 타입은 `MixedUseAssetInputSources`에서 **파생**한다 — leaf에 폼-전역 필드가
   * 늘면 여기서 컴파일이 실패한다.
   * ⚠️ 날짜를 갖는 값은 전부 `engineInput` 변환본이다(Zod 출력은 string).
   */
  const mixedUseCtx = {
    rates,
    globals: {
      regionCode: data.regionCode,
      regionInDesignatedDistrict: data.regionInDesignatedDistrict,
      oneHouseExemptionProviso: engineInput.oneHouseExemptionProviso,
      temporaryTwoHouse: engineInput.temporaryTwoHouse,
      // §155의3 상생임대 (P5-c) — ⚠️ Date 변환본(`engineInput`).
      winWinRentalHouse: engineInput.winWinRentalHouse,
      specialHouseExclusions: engineInput.specialHouseExclusions,
      isSelfCultivatedExpropriatedLand: data.isSelfCultivatedExpropriatedLand,
      rawHouses: data.houses,
      houses: engineInput.houses,
      sellingHouseId: data.sellingHouseId,
      marriageMerge: engineInput.marriageMerge,
      parentalCareMerge: engineInput.parentalCareMerge,
      isFirstTransferredInMerge: engineInput.isFirstTransferredInMerge,
      gracePeriod: engineInput.gracePeriod,
      unavoidableOutsideCapitalHouse: engineInput.unavoidableOutsideCapitalHouse,
    },
  } satisfies MixedUseCompanionContext;

  // 일반건물 자산별 결과 상세(산식 재료) — 자산 id 키. 단건 슬롯과 다른 키다(수정신고 판별자 · `gb-bundled-result-formulas.plan.md`).
  const gbDetailsByAsset: Record<string, GbBundledAssetDetail> = {};
  const onGbDetail = (assetId: string, detail: GbBundledAssetDetail) => {
    gbDetailsByAsset[assetId] = detail;
  };

  const itemsRaw: TransferTaxItemInput[] = apportionment.apportioned.flatMap((a, idx) => {
    if (a.assetId === "primary") {
      // 주 자산: engineInput을 복제 + 안분 결과로 양도·취득·필요경비 덮어쓰기
      // 지분 모드: data.totalPropertyTransferPrice는 engineInput에서 이미 상속됨 (...engineInput).
      const primaryItem = {
        ...engineInput,
        transferPrice: a.allocatedSalePrice,
        // 함께양도 묶음의 지분 primary(apportioned) — 물건 전체 양도가액을 안분액 ÷ 지분율로 채운다(12억 분모).
        totalPropertyTransferPrice: shareWholePropertyPrice(
          engineInput.totalPropertyTransferPrice, data.ownershipRatio, a.allocatedSalePrice, isFullFractionalBundle,
        ),
        acquisitionPrice: a.allocatedAcquisitionPrice,
        expenses: a.allocatedExpenses,
        propertyId: "primary",
        propertyLabel: a.assetLabel,
        // F-13 — 주 자산 주택은 배율 이내 부수토지 카드와 「1세대1주택 단위」를 이룬다(합산 엔진이 묶는다).
        oneHouseUnitRole: engineInput.propertyType === "housing" ? ("house" as const) : undefined,
        /**
         * 가산세는 **신고서 단위**로만 부과한다 — 아래 (6)에서 aggregate에 직접 넘긴다.
         * `...engineInput` 스프레드로 자산-수준에도 실리면 `transfer-tax-aggregate.ts:458`이
         * 명시한 「자산별과 신고단위가 동시에 들어오면 둘 다 부과된다」 전제를 깨뜨린다.
         * (실측상 현재는 자산-수준 값이 무시되지만, 그 무시에 의존하지 않는다.)
         */
        filingPenaltyDetails: undefined,
        delayedPaymentDetails: undefined,
      } satisfies TransferTaxItemInput;

      /**
       * ⑭ **주 자산이 겸용주택이면 파트 4~5장으로 대체한다** — 컴패니언과 **같은 leaf**.
       *
       * 🔴 종전에는 이 스프레드가 겸용을 **평범한 주택 item**으로 만들었다. 5-a-2 겸용
       *    분기는 5-a가 `return`해 도달하지 못하므로, 주택·상가 분리가 통째로 사라진
       *    채 200이 나갔다 — 그래서 ⑧이 「주 자산이 겸용이면」 막고 있었다.
       *    그 차단을 여기서 없앤다(⑧도 함께 걷었다).
       *
       * ~~⚠️ 겸용 × 지분 분할은 별도로 계속 차단이다~~ → **그 차단도 2026-09-04에 없어졌다**
       *    (`transfer-tax-validate.ts:81` 목록의 표). 막고 있던 것은
       *    「`totalPropertyTransferPrice`의 의미 충돌」이 아니라 **절대금액 미스케일**이었고
       *    `buildMixedUsePayload`가 해소했다(축 B 60/40 합계 152,203,211 = 단건 일치).
       *    ⚠️ 이 문단은 **이력**이다 — 두 축은 이미 만난다.
       */
      if (data.propertyType === "mixed-use-house" && data.mixedUse) {
        return buildMixedUseCompanionItems(
          data.mixedUse,
          primaryItem,
          {
            transferDate,
            mixedUseCtx,
            primaryEngineInput: {
              householdHousingCount: engineInput.householdHousingCount,
              isRegulatedArea: engineInput.isRegulatedArea,
              wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
              presaleRights: engineInput.presaleRights,
            },
          },
          {
            ownershipRatio: data.ownershipRatio,
            isUnregistered: data.isUnregistered,
            totalPropertyTransferPrice: primaryItem.totalPropertyTransferPrice,
            assetId: "primary",
            assetLabel: a.assetLabel ?? "",
            allocatedSalePrice: a.allocatedSalePrice,
          },
        );
      }
      // ⑭ 주 자산 일반건물도 토지·건물(+증축) 파트 카드로 펼친다 — 컴패니언과 같은 leaf(종전엔 토지 1장·취득가액 0으로 계산됐다).
      if (data.propertyType === "general_building" && data.generalBuildingValuation) {
        return buildGbCompanionItems(data.generalBuildingValuation as Record<string, unknown>, primaryItem, {
          ownershipRatio: data.ownershipRatio, assetId: "primary", assetLabel: a.assetLabel ?? "",
        }, onGbDetail);
      }
      return reverseUnit ? splitReversePrimaryLand(primaryItem, reverseUnit, transferDate) : [primaryItem];
    }
    // 컴패니언 자산 빌드 + 한도 초과 split — bundled-split-helpers.ts로 추출
    const rawC = companions[idx - 1];
    // 함께양도 묶음의 지분 컴패니언(apportioned) — 물건 전체 양도가액을 안분액 ÷ 지분율로 채운다(12억 분모).
    const c = {
      ...rawC,
      totalPropertyTransferPrice: shareWholePropertyPrice(
        rawC.totalPropertyTransferPrice, rawC.ownershipRatio, a.allocatedSalePrice, isFullFractionalBundle,
      ),
    };
    const built = buildCompanionEngineInputs(c, a, {
      primaryCtxForSplit,
      transferDate,
      primaryAcquisitionCause: data.acquisitionCause,
      primaryEngineInput: {
        householdHousingCount: engineInput.householdHousingCount,
        // 세대 단위 — 컴패니언 주택도 §89②·§104⑦ 판정을 받아야 한다(R-5).
        presaleRights: engineInput.presaleRights,
        rightThreeYearException: engineInput.rightThreeYearException,
        // 축 B 입주권 카드의 §89①4호 판정 사실(세대 단위) — 같은 물건이라 주 카드와 같은 사실이다(#11 별건).
        ...(isFullFractionalBundle
          ? {
              oneRightHouseholdFacts: {
                householdRightCount: engineInput.householdRightCount,
                householdNoPresaleRightsConfirmed: engineInput.householdNoPresaleRightsConfirmed,
                transferorNonResidentAtTransfer: engineInput.transferorNonResidentAtTransfer,
                houses: engineInput.houses,
                sellingHouseId: engineInput.sellingHouseId,
                marriageMerge: engineInput.marriageMerge,
                parentalCareMerge: engineInput.parentalCareMerge,
                isFirstTransferredInMerge: engineInput.isFirstTransferredInMerge,
                contestedRightSaleParentalCareMergeApply: engineInput.contestedRightSaleParentalCareMergeApply,
              },
            }
          : {}),
        isRegulatedArea: engineInput.isRegulatedArea,
        wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
        // §104①4호 단서(영 §167의6) — 세대 단위, 컴패니언 분양권도 같은 사실을 본다.
        presaleRightNoOtherRight: engineInput.presaleRightNoOtherRight,
        presaleRightAgeOrSpouseMet: engineInput.presaleRightAgeOrSpouseMet,
        // 부수토지 컴패니언 전용 상속값 (F12) — 세대 단위 3값과 같은 층위.
        residencePeriodMonths: engineInput.residencePeriodMonths,
        propertyType: engineInput.propertyType,
        buildingFootprintArea: engineInput.buildingFootprintArea,
        isUrbanArea: engineInput.isUrbanArea,
        appurtenantLandZone: engineInput.appurtenantLandZone,
        // G1 역방향 — 부수토지 컴패니언의 짝 주택은 함께 양도 주택이다(배율 분리·거주기간 상속).
        ...(reverseUnit ? reverseUnitHouseFacts(reverseUnit) : {}),
      },
      bundledSaleMode: data.bundledSaleMode,
      appurtenantLimitShare,
      adjustedAcqPrice: adjustedAcq.get(c.assetId)?.price,
      /**
       * ⑭ 겸용 컴패니언 서브엔진 컨텍스트 — **`| null`이라 명시가 강제된다**.
       *
       * `globals`는 `MixedUseAssetInputSources`에서 파생된 타입이라, leaf에 폼-전역 필드가
       * 늘면 여기서 컴파일이 실패한다. 손으로 나열한 목록이었다면 조용히 누락됐을 축이다.
       * ⚠️ 날짜를 갖는 값은 전부 `engineInput` 변환본이다(Zod 출력은 string).
       */
      mixedUseCtx,
      onGbDetail,
    });
    return reverseUnit && c.assetId === reverseUnit.houseAssetId
      ? built.map((it) => asReverseUnitHouse(it, reverseUnit, engineInput))
      : built;
  });

  // 축 B(같은 물건 지분 분할 — 한 사람이 나눠 취득해 전부 양도)는 서버가 다자산 구성에서 도출해 표시한다(#11 — 공유와 구별).
  const items: TransferTaxItemInput[] = isFullFractionalBundle
    ? itemsRaw.map((it) => ({ ...it, soleSplitAcquisition: true }))
    : itemsRaw;

  // (6) 다건 엔진 호출
  const aggregateInput: AggregateTransferInput = {
      taxYear: transferDate.getFullYear(),
      properties: items,
      annualBasicDeductionUsed: data.annualBasicDeductionUsed,
      priorReductionUsage: data.priorReductionUsage ?? [],
      // [A1] 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
      amendment: engineInput.amendment,
      /**
       * 🔴 G-02: 신고서 단위 신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4).
       *
       * 종전에는 이 두 필드를 넘기지 않아 **일괄양도에서 가산세가 항상 0원**이었다.
       * 아래 (7)의 2-pass(`:551~`)는 단건 경로 전용이고 이 분기는 그 앞에서 반환하므로,
       * 결정세액 주입은 aggregate가 자체적으로 수행한다(`transfer-tax-aggregate.ts:461~`).
       * 형제 분기는 이미 배선돼 있다 — mixedUse `:404`, GB `:493`.
       */
      filingPenaltyDetails: engineInput.filingPenaltyDetails,
      delayedPaymentDetails: engineInput.delayedPaymentDetails,
      /**
       * ⑭ 축 B × 부담부증여 — 물건 전체 §159를 **1회** 계산해 표시용으로 담는다.
       * 카드별 breakdown을 합치면 증여세가 쪼개진다(집계 M-0.5 주석의 표 참조).
       */
      burdenedGiftWholeInfo: data.burdenedGiftWholeInfo,
      burdenedGiftDate: data.burdenedGiftWholeInfo ? transferDate : undefined,
      /**
       * 일괄양도는 모든 자산의 양도일이 같다 — 어느 자산에 기본공제해도 세액이 같으면 한계세율 높은 자산 → 자산 번호
       * (주 자산 = 자산 1, 이어서 화면 순서)로 정한다(2026-10-16 사용자 결정). 기본값 propertyId 순은 `primary`가
       * `asset-…`보다 늘 뒤이고 함께 양도 자산끼리는 생성 시각 순이다.
       */
      sameDayEqualTaxOrder: "marginalRateThenAssetNumber",
  };
  // 양도일과 같은 날 취득한 권리를 보유로 세면 어느 자산의 결론이 달라질 때만 확인 필요를 싣는다(코드 리뷰 결정 #1) — 단건과 같은 고지.
  const aggregated = aggregateWithSameDayRightWarning(
    engineInput,
    calculateTransferTaxAggregate(aggregateInput, rates),
    items,
    (heldItems) => calculateTransferTaxAggregate({ ...aggregateInput, properties: heldItems }, rates),
  );

  // 일반건물 부담부증여 × 본인 신축 §114조의2 가산세가 붙었으면 고지(Q-14) — 단건(`runActualGeneralBuildingOnce`)과 같은 문구·같은 조건.
  //   전 자산 부담부증여 묶음에서 카드의 `penaltyAxis`는 GB 부담부증여 카드만 싣는다(일반 양도 GB 카드의 감정 신호는 혼합 묶음이라 ⑧이 막는다).
  if (isAllBurdenedGift && items.some((it) => it.penaltyAxis) && !aggregated.warnings.includes(GB_BG_SELF_BUILT_NOTICE)) {
    aggregated.warnings.push(GB_BG_SELF_BUILT_NOTICE);
  }
  if (Object.keys(gbDetailsByAsset).length > 0) aggregated.generalBuildingDetailsByAsset = gbDetailsByAsset;

  return {
    mode: "bundled" as const,
    apportionment,
    aggregated,
    /**
     * 축 B(지분 분할 취득) × 부담부증여 — **물건 전체 기준 §159 1건**.
     *
     * 결과뷰(`BundledAllocationCard`)에 이미 §159 명세 카드와 증여세 신고서 양식이
     * 배선돼 있다(일반건물 부담부증여 경로가 쓰던 슬롯) — **같은 슬롯을 재사용**한다.
     * 양도세는 카드별 결과의 합이고, 이 값은 채무비율·증여세처럼 **물건 단위로 하나**인
     * 항목만 담는다(집계 M-0.5).
     */
    ...(aggregated.burdenedGift
      ? { transferBurdenedGiftBreakdown: aggregated.burdenedGift }
      : {}),
  };
}
