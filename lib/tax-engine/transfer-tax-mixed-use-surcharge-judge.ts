/**
 * 겸용주택 — 법 §104⑦ 다주택 중과 판정(정밀 판정) 조립 (800줄 정책 분리 · NH-09).
 *
 * `transfer-tax-mixed-use.ts`의 해당 블록을 **로직 무변경으로 옮겼다**. 단건 `runMultiHouseSurchargeStep`과 같은 leaf를 쓰고,
 * NH-09로 감면주택(§99·§99의3 등) 중과 배제 선판정(`transfer-tax-mixed-use-reduction-surcharge.ts`)이 여기서 얹힌다.
 */
import { determineMultiHouseSurcharge } from "./multi-house-surcharge";
import { linkTaxIncentiveHouse5ho, withTaxIncentiveRental3hoNotice } from "./surcharge-tax-incentive-house-link";
import { surchargeHouseholdCountsRights } from "./surcharge-tax-incentive-house-link";
import { withSurchargeExclusionRegime } from "./transfer-reductions";
import { qualifiesOldClause8TemporaryTwoHouse } from "./data/surcharge-old-clauses-era";
import { withRentalResidenceSurchargeHouses, type resolveMixedUseRentalResidence } from "./transfer-tax-mixed-use-rental-residence";
import {
  resolveMixedReductionSurchargeExclusion,
  withReductionExcludedSellingHouse,
} from "./transfer-tax-mixed-use-reduction-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { judgeMixedUseOneHouseExemption } from "./transfer-tax-mixed-use-exemption";
import type { MixedUseApportionment, MixedUseAssetInput } from "./types/transfer-mixed-use.types";

type Exemption = ReturnType<typeof judgeMixedUseOneHouseExemption>;

export interface MixedSurchargeJudgeArgs {
  asset: MixedUseAssetInput;
  transferDate: Date;
  transferPrice: number;
  apportionment: MixedUseApportionment;
  rentalResidence: ReturnType<typeof resolveMixedUseRentalResidence>;
  rates: Pick<ParsedRates, "houseCountExclusionRules" | "regulatedAreaHistory" | "surchargeSpecialRules">;
  /** §89①3호 판정이 만든 §155 의제 값 — 단건이 `transfer-tax.ts`에서 넘기는 값과 같은 함수의 결과다. */
  exemption: Pick<
    Exemption,
    | "meetsOneHouseRequirements"
    | "surchargeDeemedOneHouseBy155"
    | "surchargeDeemedOneHouseSource"
    | "surchargeDeemedRestsOnInheritedExclusion"
    | "surchargeUnavoidableOutsideCapitalSlot"
    | "rightDeemingCitedByOldClause1"
  >;
}

export function judgeMixedUseMultiHouseSurcharge(args: MixedSurchargeJudgeArgs) {
  const { asset, transferDate, transferPrice, apportionment, rentalResidence, rates, exemption } = args;
  const { houseCountExclusionRules, regulatedAreaHistory, surchargeSpecialRules } = rates;
  const {
    meetsOneHouseRequirements,
    surchargeDeemedOneHouseBy155,
    surchargeDeemedOneHouseSource,
    surchargeDeemedRestsOnInheritedExclusion,
    surchargeUnavoidableOutsideCapitalSlot,
    rightDeemingCitedByOldClause1,
  } = exemption;

  // ── 법 §104⑦ 다주택 중과 판정 ────────────────────────────────────────────────
  // 주택 수 산정·배제 주택·혼인합가 차감·한시 유예는 전부 정본
  // `determineMultiHouseSurcharge`가 갖고 있다. 겸용은 그 결과만 받아 쓴다.
  //
  // ⚠️ `houseCountExclusionRules`가 없으면(DB 키 부재) 판정을 **건너뛴다** — 단건 엔진
  //    (`transfer-tax.ts:184`)과 동일한 가드다. 예외를 던지지 않으므로 테스트에서
  //    `makeMockRates()`를 쓰면 중과가 조용히 스킵된다(계획서 R-9).
  const multiHouse = withRentalResidenceSurchargeHouses(asset, rentalResidence);
  // ⑥ 주택 수 제외의 확인된 영 §167의3①5호 조문 → 10호 「일반주택」 판정의 5호 주택 — 단건(`runMultiHouseSurchargeStep`)과 같은 leaf
  const judgeMixedSurcharge = (houses: NonNullable<typeof multiHouse>["houses"]) =>
    determineMultiHouseSurcharge(
      {
        ...multiHouse!,
        houses,
        transferDate,
        // §155⑤ 1세대1주택 의제 중과배제(배제2) 게이트 — 위에서 만든 §154① 통합 판정을
        // 그대로 넘긴다. 단건이 `transfer-tax.ts:202`에서 넘기는 값과 **같은 함수의 결과**다.
        sellingHouseMeetsOneHouseRequirements: meetsOneHouseRequirements,
        // §167의10①15호 ① 요소 — §155① 의제 성립. 단건과 **같은 정본 함수**를 쓴다
        // (기한 규칙 재구현 금지 — 계획서 F-2). `temporaryTwoHouse` 미주입 시 undefined.
        // E-14d — §155②③(상속주택 + 일반주택) 경로(`inherited_general_house`)도 담는다.
        deemedOneHouseBy155: surchargeDeemedOneHouseBy155,
        deemedOneHouseSource: surchargeDeemedOneHouseSource,
        deemedRestsOnInheritedExclusion: surchargeDeemedRestsOnInheritedExclusion,
        unavoidableOutsideCapitalHouse:
          surchargeUnavoidableOutsideCapitalSlot ?? multiHouse!.unavoidableOutsideCapitalHouse,
        // E-7 — §156의2·§156의3 의제의 구 §167의11①1호 인용 범위(단건 `runMultiHouseSurchargeStep`과 같은 값).
        rightDeemingCitedByOldClause1,
        // E-14e — 구 §167의10①8호(2023.2.28. 전 양도분). 단건과 같은 leaf · 실제 소유 주택 수(조심2021중1803).
        oldClause8TemporaryTwoHouse: qualifiesOldClause8TemporaryTwoHouse({
          isOneHousehold: multiHouse!.isOneHousehold,
          householdHousingCount: asset.householdHousingCountForExclusion,
          transferDate,
          temporaryTwoHouse: asset.temporaryTwoHouse,
        }),
      },
      houseCountExclusionRules!,
      regulatedAreaHistory ?? null,
      surchargeSpecialRules,
      multiHouse!.isRegulatedArea,
    );
  // NH-09 — 단건 STEP 0.45와 같은 leaf·인자로 감면주택(§99·§99의3 등) 중과 배제를 선판정해 양도 주택 행에 얹는다(소령 §167의3①5호·§167의10①2호).
  const reductionExclusion =
    multiHouse && houseCountExclusionRules
      ? resolveMixedReductionSurchargeExclusion(asset, transferDate, transferPrice, apportionment)
      : undefined;
  const mixedHouses = multiHouse
    ? withReductionExcludedSellingHouse(
        linkTaxIncentiveHouse5ho(multiHouse.houses, asset.specialHouseExclusions, transferDate, multiHouse.sellingHouseId),
        multiHouse.sellingHouseId,
        reductionExclusion ?? { excluded: false },
      )
    : undefined;
  const multiHouseSurcharge =
    multiHouse && mixedHouses && houseCountExclusionRules
      ? withTaxIncentiveRental3hoNotice(
          judgeMixedSurcharge(mixedHouses),
          mixedHouses,
          asset.specialHouseExclusions,
          transferDate,
          multiHouse.sellingHouseId,
          judgeMixedSurcharge,
        )
      : undefined;
  // 배제 근거를 세대 구성(산입 조합원입주권·분양권 유무)에 맞춘다 — 단건 `runMultiHouseSurchargeStep`과 같은 leaf (NH-82)
  return {
    multiHouseSurcharge,
    reductionExclusion:
      reductionExclusion && multiHouse && houseCountExclusionRules
        ? withSurchargeExclusionRegime(
            reductionExclusion,
            surchargeHouseholdCountsRights(multiHouse.presaleRights ?? [], houseCountExclusionRules, multiHouseSurcharge),
          )
        : reductionExclusion,
  };
}
