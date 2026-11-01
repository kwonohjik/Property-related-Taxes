/**
 * 겸용주택 §89①3호 **1세대1주택 비과세 판정** — `calcMixedUseTransferTax`에서 800줄 정책으로 분리(E-14d).
 *
 * 한 덩어리로 옮긴 판정 세 축:
 *   · 영 §154① 보유·거주(단서 면제 포함) — 정본 `meetsOneHouseHoldingResidence`
 *   · §89①3호 주택 수 제외 — 조특법(§99의4·§98의9·보유 감면주택) + §155②③ 상속주택(E-14d)
 *   · §155①④⑤ 1세대1주택 의제 — 정본 `resolveDeemedOneHouseBy155` (OH-09)
 *   · §155⑥1호·⑦·⑧ 특례 주택 + 일반주택 의제 — 단건 E-3.6~E-3.8과 같은 술어(S08-3). 비과세 축 전용
 * 그리고 같은 주택 수로 영 §167의10①15호 ① 요소(중과 배제)를 선판정한다(E-14 · E-14d).
 *
 * `warnings`에 in-place push한다(호출부 배열 순서 유지).
 */
import { resolveOneHouseMinHoldingYears } from "./data/one-house-holding-residence-era";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import { TRANSFER } from "./legal-codes";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import { calculateHoldingPeriod } from "./tax-utils";
import {
  expropriationProvisoLandCutoff,
  isLaterAcquiredLandHeldTooShort,
  landCoveredByExpropriationProviso,
} from "./transfer-tax-appurtenant-land";
import { meetsOneHouseHoldingResidence, resolveDeemedOneHouseBy155 } from "./transfer-tax-exemption";
import { resolveExemptionHoldingStartDate } from "./transfer-tax-exemption-holding";
import { resolveHouseCountExclusionDate } from "./one-house/gift-household-basis";
import {
  giftHouseholdFactDecides,
  giftHouseholdNotice,
  giftPriorResidenceDecides,
  giftPriorResidenceNotice,
} from "./one-house/gift-household-notice";
import {
  qualifiesCulturalHeritageHouse,
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
} from "./transfer-tax-exemption";
import {
  new994MergeOrderOf,
  surcharge15HouseCount,
  inheritedGeneralHouseSurchargeBasis,
  specialActHouseExclusionBasis,
  culturalOrUnavoidableDeemingBasis,
  verifiedSpecialAct15Exclusions,
  collectKnownHouseExclusionIds,
} from "./transfer-tax-house-exclusion-step";
import {
  resolveInheritedHouseExclusionFromInput,
  buildInheritedExclusionSteps,
} from "./transfer-inheritance-exclusion";
import { resolvePopulationDecline71_2 } from "./transfer-reductions/population-decline-71-2";
import { resolveHouseCountExclusion, resolveSpecialHouseExclusions } from "./transfer-reductions";
import type { HouseCountExclusionDetail } from "./transfer-reductions/unsold-98-9";
import { resolveArticle89Clause2, type Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import { mixedUseUnmetNotices } from "./transfer-tax-mixed-use-unmet-notices";
import { decisiveProvisoException } from "./one-house/decisive-proviso";
import { deemedPathProvisoNotices } from "./transfer-tax-one-house-warnings";
import { isOldSurchargeClauseEra } from "./data/surcharge-old-clauses-era";
import {
  article89Clause2Notices,
  clause2BlocksSurchargeDeeming,
  clause2SurchargeDeemed,
} from "./transfer-tax-89-2-consequences";
import type {
  New994Result,
  Unsold989Result,
  SpecialHouseExclusionResolution,
} from "./transfer-reductions";

/** §155 의제 판정 결과 → 일반 경로 판정의 적용 특례 id(`one-house/deemed-verdict.ts`). 근거 고지 leaf가 이 id를 읽는다. */
function deemedAppliedIds(basis: DeemedOneHouseBasis | undefined): string[] {
  const temp = "155-1-temporary-two-house";
  const marriage = "155-5-marriage-merge";
  const parental = "155-4-parental-care-merge";
  switch (basis) {
    case "temporary_two_house":
      return [temp];
    case "marriage_merge":
      return [marriage];
    case "parental_care_merge":
      return [parental];
    case "marriage_merge_overlap":
      return [marriage, temp];
    case "parental_care_merge_overlap":
      return [parental, temp];
    case "double_merge":
      return [marriage, parental];
    default:
      return [];
  }
}

export function judgeMixedUseOneHouseExemption(
  asset: MixedUseAssetInput,
  transferDate: Date,
  oneHouseSpecialRules: OneHouseSpecialRulesData,
  warnings: string[],
  /** §88 10호 「분양권」 정의 시행일 — 단건과 같은 값(`presaleRightStartDate(parsedRates)`). §89② 분양권 축 게이트. */
  presaleRightStartDate?: Date,
): {
  /** 영 §154① 보유·거주 충족 — 중과 배제2(§155⑤ 의제) 게이트로도 쓴다. */
  meetsOneHouseRequirements: boolean;
  isUnregistered: boolean;
  isOneHouseExempt: boolean;
  /** 주택보다 나중에 취득한 부수토지가 보유요건(영 §154①) 미만 — 그 토지분은 비과세에서 뺀다(분리취득 G-3과 같은 술어). */
  laterLandExemptExcluded: boolean;
  /** 영 §167의10①15호 ① 요소 — §155①④⑤ 의제 또는 §155②③ 상속주택 경로. */
  surchargeDeemedOneHouseBy155: DeemedOneHouseBasis | undefined;
  /** `surchargeDeemedOneHouseBy155`의 표시용 근거 조문 — 조특법 감면주택 · §156의2·§156의3 경로(E-14a · E-7) */
  surchargeDeemedOneHouseSource: string | undefined;
  /** `surchargeDeemedOneHouseBy155`가 상속 제외에 기댄 ⑥·⑧ 2중첩인가 — 중과 상세 고지(#16) */
  surchargeDeemedRestsOnInheritedExclusion: boolean;
  /** 4호 슬롯 재판정 값 — `article155SpecialHouses` 미전달이면 undefined(route 값 유지) */
  surchargeUnavoidableOutsideCapitalSlot: boolean | undefined;
  /** 구 영 §167의11①1호 인용 범위 — §156의2③④·§156의3②③ 직접 경로(E-14f · 단건 `resolveSurchargeDeemedOneHouseDetail`과 같은 값) */
  rightDeemingCitedByOldClause1: boolean | undefined;
  /** §89② 판정(E-7) — `article89Clause2Facts` 미전달이면 undefined(판정하지 않음). */
  article89Clause2: Article89Clause2Result | undefined;
  new994Detail: New994Result | undefined;
  unsold989Detail: Unsold989Result | undefined;
  houseCountExclusionDetails: HouseCountExclusionDetail[] | undefined;
  specialHouseExclusionDetail: SpecialHouseExclusionResolution | undefined;
} {
  // ── 영 §154① 본문 — 1세대1주택 비과세 **보유 2년** 요건 ─────────────────────────
  // 「소득세법」 제89조 제1항 제3호 가목이 위임한 같은 법 시행령 제154조 제1항 본문:
  //   "…해당 주택의 **보유기간이 2년 이상**인 것"
  //
  // 종전에는 호출부가 넘긴 `isOneHouseExempt`를 그대로 신뢰해, 「1세대 해당」 토글만 켜면
  // **보유 1일이어도 12억 비과세**가 적용됐다(과소과세). 일반 단건 엔진은 정본
  // `meetsOneHouseHoldingResidence`(transfer-tax-exemption.ts)로 이미 판정하고 있었다 —
  // 겸용만 그 규칙을 쓰지 않던 내부 불일치다.
  //
  // 기산일은 **건물 취득일**이다. §154①의 보유기간은 「해당 **주택**」의 보유기간이고,
  // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이기 때문이다. 예외는 증여받은 겸용주택에서 증여자와 계속 같은
  // 세대가 확인된 경우 하나다 — 단건과 같은 leaf가 세대 보유 시작일부터 통산한다(아래 `giftHouseholdBasis`).
  //
  // 본문 후단은 **취득 당시 조정대상지역**이면 거주 2년을 더 요구하고, **단서**는
  //   "제1호부터 제3호까지 … 그 **보유기간 및** 거주기간의 제한을 받지 않으며 제5호에 해당하는
  //    경우에는 거주기간의 제한을 받지 않는다"
  // 고 정한다(법제처 실측 2026-07-31 · 시행령 MST 286211).
  //
  // ⚠️ **판정을 쪼개지 않는다.** 종전 P3a는 보유 축만 따로 구현했다가 단서가 보유요건까지
  //    면제한다는 점을 놓쳐, 수용·해외이주 등에 해당하는데도 보유 2년 미만이면 비과세를
  //    배제했다(**과다과세**). 단서 면제는 정본의 `meetsHolding` **내부**에 있으므로
  //    거주 축을 AND로 덧붙이는 방식으로는 고칠 수 없다 — 정본 함수 하나를 부른다.
  const exemptionReqInput = {
    // 주택 부분의 취득일 = 건물 취득일. §154①의 보유기간은 「해당 **주택**」의 보유기간이고
    // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이다.
    acquisitionDate: asset.buildingAcquisitionDate,
    transferDate,
    // 거주기간은 §154⑧3호 **통산값**(동일세대 상속분 포함)을 쓴다. API 변환
    // (`transfer-tax-api-mixed-use.ts:171`)이 `consolidateResidenceMonths`로 이미 통산해
    // 보내므로, 여기서 `acquisitionCause`·`decedent*`를 함께 넘기면 **통산이 두 번** 걸린다
    // → 의도적으로 미전달. 같은 미전달이 `resolveExemptionHoldingStartDate`의 backdate도
    // 막는다(겸용에는 그 입력 자체가 없다). 보유 기산이 건물 취득일에서 움직이는 경로는 아래 증여 세대 통산뿐이다.
    residencePeriodMonths: (asset.table2ResidencePeriodYears ?? asset.residencePeriodYears) * 12,
    oneHouseExemptionProviso: asset.oneHouseExemptionProviso,
    regionCode: asset.regionCode,
    // 미주입 시 false — 조정대상지역이 아니면 거주요건 자체가 없다(종전 동작 불변).
    wasRegulatedAtAcquisition: asset.wasRegulatedAtAcquisition ?? false,
    /**
     * §155의3① 상생임대주택 — **§154①의 거주기간 제한 면제** (P5-c).
     *
     * 🔴 `ResidenceReqInput`이 이 필드를 **포함**하는데(`transfer-tax-exemption-requirements.ts`)
     *    겸용만 넘기지 않아, 상생임대주택인데도 거주 2년 미달이면 비과세가 **배제**됐다
     *    (과다과세). 같은 필드가 아래 표2 게이트도 연다 — 법문이 §154①과 §159의4를 함께
     *    열거하므로 **두 지점을 동시에** 배선해야 축이 어긋나지 않는다.
     *
     * 🔑 §155의2(장기저당담보)는 여기 오지 않는다 — 공용 술어에 일부러 넣지 않은 축이고
     *    (다른 의제 경로로 면제가 샌다) 호출부 2곳에서만 주입한다. 겸용 × §155의2는 별개 축.
     */
    winWinRentalHouse: asset.winWinRentalHouse,
    /**
     * 결정 #38 후속 — 증여받은 겸용주택의 「증여자와 계속 같은 세대」 사실. 단건과 **같은 leaf**(`gift-household-basis.ts`)가
     * 정본 안에서 §154① 보유 기산(세대 보유 시작일 통산)·「취득 당시」 조정대상지역·경과규정 기준일을 정한다 — 여기서 날짜를 고르지 않는다.
     * 장기보유특별공제·세율 보유기간은 건물 취득일(증여일) 그대로다(아래 주택분 계산은 이 입력을 읽지 않는다).
     */
    giftHouseholdBasis: asset.giftHouseholdBasis,
  };
  // 경고 문구용 §154① 보유기간 — 정본과 같은 기산일(세대 통산이 성립하면 세대 보유 시작일, 아니면 건물 취득일).
  const exemptionHoldingStart = resolveExemptionHoldingStartDate(exemptionReqInput);
  const exemptionHolding = calculateHoldingPeriod(exemptionHoldingStart, transferDate);
  const meetsOneHouseRequirements = meetsOneHouseHoldingResidence(
    exemptionReqInput,
    oneHouseSpecialRules.one_house_exemption,
  );
  // §91① — 미등기양도자산에는 **비과세 규정을 적용하지 아니한다**. 주택분 12억 비과세도 배제.
  const isUnregistered = asset.isUnregistered === true;
  /**
   * §89①3호 **주택수 제외** — 겸용 경로만 이 축을 건너뛰고 있었다 (D4-02).
   *
   * §99의4①·§98의9①은 「그 주택을 해당 1세대의 소유주택이 **아닌 것으로 보아** 소득세법
   * §89①3호를 적용한다」로 **양도자산의 종류를 제한하지 않는다** — 겸용주택 양도에도 적용된다.
   * 보유 감면주택(§98의2④ 등)·상속주택(§155②③)도 같은 층위다.
   *
   * 판정은 일반 경로와 **같은 정본 함수**를 쓴다. 「판정을 쪼개지 않는다」 — 위 §154① 요건과
   * 같은 규약이다. 주택 수가 미전달이면 종전 동작(호출부 판정을 그대로 신뢰)을 유지한다.
   */
  let houseCountExclusionApplied = 0;
  // E-14a — 그중 15호·13호 포섭이 해석으로 확인된 조특법 제외(보유 감면주택·§99의4·§98의9 — 단건과 같은 leaf)
  let verifiedSpecial: ReturnType<typeof verifiedSpecialAct15Exclusions> = {
    specialActVerified15Count: 0,
    specialActVerified15Basis: [],
  };
  let mixedNew994Detail: New994Result | undefined;
  let mixedUnsold989Detail: Unsold989Result | undefined;
  let mixedHouseCountExclusionDetails: HouseCountExclusionDetail[] | undefined;
  let mixedSpecialHouseExclusionDetail: SpecialHouseExclusionResolution | undefined;
  // PR-3(§155④⑤ 합가 전 구성 — `knownHouseExclusionHouseIds`)가 빼고 셀 행 id 재료 — houseId가
  // 있는 적용 건만 아래 `collectKnownHouseExclusionIds`가 거른다.
  let hceAppliedForMerge: HouseCountExclusionDetail[] = [];
  let specialEntriesForMerge: SpecialHouseExclusionResolution["entries"] = [];
  if (asset.householdHousingCountForExclusion !== undefined) {
    const hce = resolveHouseCountExclusion(asset.reductions ?? [], {
      // D4-05 — 단건(`transfer-tax-precalc.ts` `resolveHouseCountExclusionDate`)과 같은 leaf: 세대 통산이 확인되면 세대 보유 시작일.
      generalHouseAcquisitionDate: resolveHouseCountExclusionDate(asset.buildingAcquisitionDate, asset.giftHouseholdBasis),
      transferDate,
      // §99의4 D5 합가 맥락 — 일반 경로와 **같은 함수**(`new994MergeOrderOf`). 겸용 명부(`multiHouse.houses`)에도 `mergeOrigin`이 실린다.
      mergeOrder: new994MergeOrderOf({
        marriageMerge: asset.multiHouse?.marriageMerge,
        parentalCareMerge: asset.multiHouse?.parentalCareMerge,
        houses: asset.multiHouse?.houses,
      }),
    });
    const special = resolveSpecialHouseExclusions(asset.specialHouseExclusions, transferDate);
    mixedNew994Detail = hce.new994Detail;
    mixedUnsold989Detail = hce.unsold989Detail;
    mixedHouseCountExclusionDetails = hce.details.length > 0 ? hce.details : undefined;
    mixedSpecialHouseExclusionDetail = special.entries.length > 0 ? special : undefined;
    houseCountExclusionApplied = hce.appliedList.length + special.excludedCount;
    verifiedSpecial = verifiedSpecialAct15Exclusions(special, hce.appliedList);
    hceAppliedForMerge = hce.appliedList;
    specialEntriesForMerge = special.entries;
  }
  const isOneHouseholdForHouseCount = asset.multiHouse?.isOneHousehold ?? asset.isOneHousehold ?? false;
  /**
   * E-14d — §155②③ 상속주택 제외. 단건과 **같은 정본**(`resolveInheritedHouseExclusionFromInput`)에 명부·괄호 사실을
   * 넘긴다. 일반주택 취득일은 §154① 보유 기산과 같은 **건물 취득일**이다. §155②는 「1세대가」 요건이라 비1세대면 판정하지 않는다.
   */
  const inheritedExclusion =
    asset.inheritedHouseExclusion && asset.householdHousingCountForExclusion !== undefined && isOneHouseholdForHouseCount
      ? resolveInheritedHouseExclusionFromInput({
          ...asset.inheritedHouseExclusion,
          houses: asset.multiHouse?.houses,
          sellingHouseId: asset.multiHouse?.sellingHouseId,
          acquisitionDate: asset.buildingAcquisitionDate,
          transferDate,
        })
      : undefined;
  const inheritedExcludedCount = inheritedExclusion?.excludedCount ?? 0;
  /**
   * 조특법 §71의2① 인구감소지역주택(결정 #42) — 겸용 경로는 `runHouseCountExclusionStep`을 타지 않고 위 두 resolver를 직접 부르므로 여기서도 같은 평가기를
   * 부른다(안 부르면 겸용 양도에서만 조용히 빠진다). 선언이 아니라 명부에서 도출 — 같은 행을 다른 제외가 이미 뺐으면 한 번만 뺀다.
   */
  if (
    asset.householdHousingCountForExclusion !== undefined &&
    isOneHouseholdForHouseCount &&
    asset.multiHouse?.houses &&
    asset.multiHouse.sellingHouseId
  ) {
    const pop = resolvePopulationDecline71_2({
      houses: asset.multiHouse.houses,
      sellingHouseId: asset.multiHouse.sellingHouseId,
      transferDate,
      presaleRights: asset.multiHouse.presaleRights ?? [],
      alreadyExcludedIds: new Set(
        collectKnownHouseExclusionIds({
          hceApplied: hceAppliedForMerge,
          specialEntries: specialEntriesForMerge,
          inheritedExcludedHouses: inheritedExclusion?.excludedHouses,
        }),
      ),
      otherExcludedCount: houseCountExclusionApplied + inheritedExcludedCount,
      householdHousingCount: asset.householdHousingCountForExclusion,
      sellingIsHousing: true,
    });
    if (pop.entries.length > 0) {
      const merged = {
        entries: [...specialEntriesForMerge, ...pop.entries],
        excludedCount: (mixedSpecialHouseExclusionDetail?.excludedCount ?? 0) + pop.excludedCount,
      };
      mixedSpecialHouseExclusionDetail = merged;
      specialEntriesForMerge = merged.entries;
      houseCountExclusionApplied += pop.excludedCount;
      verifiedSpecial = verifiedSpecialAct15Exclusions(merged, hceAppliedForMerge);
    }
  }
  // PR-3 — §155④⑤ 합가 전 구성 판정(`resolveMergeComposition`)이 명부에서 뺄 행 id(사용자 결정 Q-4).
  const knownHouseExclusionHouseIds = collectKnownHouseExclusionIds({
    hceApplied: hceAppliedForMerge,
    specialEntries: specialEntriesForMerge,
    inheritedExcludedHouses: inheritedExclusion?.excludedHouses,
  });
  const effectiveHouseCount =
    asset.householdHousingCountForExclusion !== undefined
      ? Math.max(asset.householdHousingCountForExclusion - houseCountExclusionApplied - inheritedExcludedCount, 0)
      : undefined;
  /**
   * §155 1세대1주택 의제(① 일시적 2주택 · ④⑤ 합가) — 비과세 주택 수 축과 중과 배제(§167의10①15호
   * ① 요소)가 **같은 정본**(`resolveDeemedOneHouseBy155`)을 한 번 판정해 함께 쓴다(OH-09).
   *
   * 🔴 종전에는 이 판정을 중과 배제에만 넘기고, 비과세 주택 수 축은 ④가 만든 `isOneHouseExempt`
   *    (UI가 사라진 `temporaryTwoHouseSpecial` 토글)를 그대로 믿었다 — 명부에서 §155①이 도출돼도
   *    겸용 경로만 「다주택 전액 과세」였고, 저장분의 토글 true는 1년·3년 타이밍 없이 비과세를 열었다.
   *    §154①(보유·거주)은 아래 `meetsOneHouseRequirements`가 따로 AND한다(단건 E-3과 같은 분담).
   */
  const surcharge15Count = surcharge15HouseCount(
    asset.householdHousingCountForExclusion ?? 0,
    inheritedExcludedCount,
    houseCountExclusionApplied,
    verifiedSpecial.specialActVerified15Count,
  );
  const deemedInput = {
    ...exemptionReqInput,
    isRegulatedArea:
      asset.multiHouse?.isRegulatedArea ?? asset.surchargeFallback?.isRegulatedArea ?? false,
    isOneHousehold: asset.multiHouse?.isOneHousehold ?? asset.isOneHousehold ?? false,
    temporaryTwoHouse: asset.temporaryTwoHouse,
    // 이 호출은 중과 15호 ① 요소와 §155①④⑤ 비과세 축을 겸한다 — §155⑦ 농어촌주택은 여기 넘기지 않는다
    //   (`ruralHouse` 미전달 → §155⑦ 불성립). ⑥·⑦·⑧의 **비과세** 판정은 아래 `special155Basis`(`article155SpecialHouses`)가 맡는다(S08-3).
    //   중과 쪽으로의 전달은 아래 `culturalOrUnavoidableDeemingBasis`(#16 — 상속·조특법 제외로 2주택이 된 세대의 ⑥·⑧)가 맡는다.
    // `householdHousingCount`는 §155①(일시적 2주택)·④⑤ 합가 의제의 「2주택」 판정에 쓴다 —
    //   단건 E-3·E-3.5와 같은 비과세 축(폼 세대 주택 수, 겸용주택 자신 포함 · 조특법 제외 후)이다.
    //   E-14 — 단건 15호 ① 요소와 같은 규칙(`surcharge15HouseCount`) · E-14d §155②③ 제외 포함.
    householdHousingCount: surcharge15Count,
    ruralHouse: undefined,
    marriageMerge: asset.multiHouse?.marriageMerge,
    parentalCareMerge: asset.multiHouse?.parentalCareMerge,
    isFirstTransferredInMerge: asset.isFirstTransferredInMerge,
    /**
     * §155④⑤ 합가 전 구성(`resolveMergeComposition`) — 겸용은 명부를 **원시 롤스터**
     * (`asset.multiHouse.houses`)로 갖고 있다. `householdHousingCount`를 위에서 제외 후
     * 수치(`surcharge15Count`)로 강제하므로 롤스터 행 수와 항상 어긋나는데, 위에서 이미
     * 계산한 제외 건(`hceAppliedForMerge`·`specialEntriesForMerge`·`inheritedExclusion`)
     * 중 명부 행으로 특정된 몫은 `knownHouseExclusionHouseIds`로 빼고 다시 센다(PR-3,
     * 사용자 결정 Q-4). 2026-10-05 — `merge-composition-unknown-unfavorable.plan.md` §3-4.
     */
    houses: asset.multiHouse?.houses,
    sellingHouseId: asset.multiHouse?.sellingHouseId,
    knownHouseExclusionCount: houseCountExclusionApplied + inheritedExcludedCount,
    inheritedHouseExclusionCount: inheritedExcludedCount,
    knownHouseExclusionHouseIds,
  };
  const deemedOneHouseBy155 = resolveDeemedOneHouseBy155(deemedInput, oneHouseSpecialRules);
  // 제외 후 1채 이하면 주택 수 축이 충족된다(§89①3호 가목). 제외가 0이면 호출부 판정 그대로.
  // §155 의제가 성립하면 「1세대1주택으로 보아」 주택 수 축이 충족된다(OH-09).
  // E-14i — 제외 분기도 「1세대가」(§89①3호가목·영 §154①)를 본다. 조특법 §99의4①·§98의9①·§98의7② 등은 주택 수에서
  //   뺄 뿐 1세대 요건을 대신하지 않는다. 단건 `checkExemptionCore`의 `!input.isOneHousehold` · 위 상속 제외(E-14d)와 같은 값.
  /**
   * §155⑥1호·⑦·⑧ — 특례 주택과 일반주택을 「각각 1개씩 소유」한 1세대가 일반주택을 양도하면 「1개의 주택을 소유하고 있는 것으로
   * 보아 제154조제1항을 적용」한다(S08-3). 겸용주택의 주택 부분은 §154③상 §89①3호의 「주택」이라 일반주택이다 — 단건
   * `checkExemptionCore`(E-3.7 ⑧ → E-3.6 ⑥ → E-3.8 ⑦)와 **같은 술어·같은 순서**, 주택 수는 제외 후 값(`effectiveHouseCount`)이다.
   * §154①(보유·거주)은 아래 `meetsOneHouseRequirements`가 따로 AND한다. 이 `special155Basis`는 비과세 축 전용이다 — 중과 15호 ① 요소는
   * 제외 후 2주택이 된 세대의 ⑥·⑧만 `culturalOrUnavoidableDeemingBasis`로 따로 판정한다(#16). 선언은 `asset.article155SpecialHouses`뿐이라 미전달이면 판정하지 않는다.
   */
  const special155Facts = asset.article155SpecialHouses;
  const special155Input =
    special155Facts && effectiveHouseCount !== undefined && isOneHouseholdForHouseCount
      ? {
          householdHousingCount: effectiveHouseCount,
          inheritedHouseExclusionCount: inheritedExcludedCount,
          transferDate,
          ruralHouse: special155Facts.ruralHouse,
          culturalHeritageHouse: special155Facts.culturalHeritageHouse,
          unavoidableOutsideCapitalHouse: special155Facts.unavoidableOutsideCapitalHouse,
        }
      : undefined;
  const special155Basis = special155Input
    ? qualifiesUnavoidableOutsideCapital(special155Input)
      ? TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL
      : qualifiesCulturalHeritageHouse(special155Input)
        ? TRANSFER.CULTURAL_HERITAGE_HOUSE
        : qualifiesRuralHouse(special155Input)
          ? `${TRANSFER.TEMPORARY_TWO_HOUSE}⑦`
          : undefined
    : undefined;
  const houseCountOkWithoutSpecial155 =
    (effectiveHouseCount !== undefined && houseCountExclusionApplied + inheritedExcludedCount > 0
      ? isOneHouseholdForHouseCount && effectiveHouseCount <= 1
      : (asset.isOneHouseExempt ?? true)) || deemedOneHouseBy155 !== undefined;
  const houseCountOk = houseCountOkWithoutSpecial155 || special155Basis !== undefined;
  // ⑦ E-14d — 단건 산식 step과 **같은 문구**(`buildInheritedExclusionSteps`)를 경고로 싣는다(제외·불성립 사유).
  if (inheritedExclusion) {
    for (const st of buildInheritedExclusionSteps(
      inheritedExclusion,
      (asset.householdHousingCountForExclusion ?? 0) - houseCountExclusionApplied,
    )) {
      warnings.push(`${st.label}: ${st.formula} — ${st.legalBasis}`);
    }
  }
  if (houseCountExclusionApplied > 0) {
    warnings.push(
      `주택 수 제외 ${houseCountExclusionApplied}채 적용 — 세대 보유 ${asset.householdHousingCountForExclusion}채에서 ` +
        `${Math.max((asset.householdHousingCountForExclusion ?? 0) - houseCountExclusionApplied, 0)}채로 보아 1세대1주택 비과세를 판정했습니다 ` +
        `(조특법 §99의4①·§98의9① 등 · 소득세법 §89①3호 의제 — 다주택 중과 주택 수는 불변).`,
    );
  }
  /**
   * E-7 — 「소득세법」 §89②: 주택과 조합원입주권·분양권을 함께 보유한 1세대가 그 주택을 양도하면 §89①3호를 적용하지
   * 않는다(단서 예외 영 §156의2·§156의3). 겸용주택의 주택 부분도 §154③상 §89①3호의 「주택」이다. 단건 `checkExemption`과
   * **같은 leaf**를 같은 모양의 입력(비과세 주택 수 = 제외 후 · §154① 요건 입력)으로 부른다. 배제 **확정**만 비과세를 끄고,
   * 판정 보류는 종전 동작(적용) + 단건과 같은 고지다. 세대 사실이 없거나 주택 수가 없으면 판정하지 않는다(종전 동작).
   */
  const clause2Facts = asset.article89Clause2Facts;
  const clause2Judge = (householdHousingCount: number) =>
    resolveArticle89Clause2(
      {
        ...clause2Facts!,
        ...exemptionReqInput,
        propertyType: "housing",
        isOneHousehold: isOneHouseholdForHouseCount,
        householdHousingCount,
      },
      presaleRightStartDate,
    );
  const article89Clause2 =
    clause2Facts && effectiveHouseCount !== undefined ? clause2Judge(effectiveHouseCount) : undefined;
  const clause2Excluded = article89Clause2?.status === "excluded";
  const isOneHouseExempt = houseCountOk && meetsOneHouseRequirements && !isUnregistered && !clause2Excluded;
  /**
   * 결정 #38 후속 — 증여받은 겸용주택의 세대 사실 확인 필요 고지. 단건(`collectEraUndetermined`)과 **같은 문구·같은 반사실 규칙**
   * (`gift-household-notice.ts`)이고, 겸용 결과에는 판정 보류 칸이 없어 경고로 싣는다. 세대 사실만 바꾼 §154① 판정이 결론을 가를 때만
   * 낸다 — 주택 수·미등기·§89② 배제로 이미 과세면 말하지 않는다(단건 게이트와 같은 방향).
   */
  const giftBasis = asset.giftHouseholdBasis;
  const giftNotice = giftHouseholdNotice(giftBasis, "gift");
  if (
    giftBasis &&
    giftNotice &&
    isOneHouseholdForHouseCount &&
    houseCountOk &&
    !isUnregistered &&
    !clause2Excluded &&
    giftHouseholdFactDecides(giftBasis, String(meetsOneHouseRequirements), (b) =>
      String(meetsOneHouseHoldingResidence({ ...exemptionReqInput, giftHouseholdBasis: b }, oneHouseSpecialRules.one_house_exemption)),
    )
  ) {
    warnings.push(giftNotice.reason);
  }
  // 결정 #38-7 — 증여 전 동일세대 거주 개월 고지. 같은 문구·같은 반사실 규칙(`gift-household-notice.ts`). 개월을 바꾼 §154① 판정이 결론을 가를 때만.
  const giftPriorNotice = giftPriorResidenceNotice(giftBasis);
  if (
    giftBasis &&
    giftPriorNotice &&
    isOneHouseholdForHouseCount &&
    houseCountOk &&
    !isUnregistered &&
    !clause2Excluded &&
    giftPriorResidenceDecides(giftBasis, String(meetsOneHouseRequirements), (b) =>
      String(meetsOneHouseHoldingResidence({ ...exemptionReqInput, giftHouseholdBasis: b }, oneHouseSpecialRules.one_house_exemption)),
    )
  ) {
    warnings.push(giftPriorNotice.reason);
  }
  // §155⑥⑦⑧ 의제가 비과세를 연 경우 — 겸용주택에 이 특례를 적용한 정면 해석례가 없어 사실대로 알린다(S08-3).
  if (!houseCountOkWithoutSpecial155 && special155Basis !== undefined && isOneHouseExempt) {
    warnings.push(
      `겸용주택의 주택 부분을 「${special155Basis}」에 따라 1세대1주택으로 보아 영 §154①을 적용했습니다 — ` +
        "같은 영 §154③이 겸용주택을 주택으로 보고 §155⑥·⑦·⑧의 「일반주택」에서 겸용주택을 빼는 문언은 없으나, " +
        "겸용주택 양도에 이 특례를 정면으로 적용한 해석례는 확인하지 못했습니다 — 확인 필요",
    );
  }
  warnings.push(
    ...article89Clause2Notices(article89Clause2, isOneHouseExempt, transferDate, {
      // 미선언·확인 필요 고지는 선언이 비과세를 바꿀 때만(G5-8). 겸용 경로는 중과 적용 여부가 이 시점에 없어 구 §167의11①1호 시대 양도는 그대로 둔다.
      coreWouldPass: houseCountOk && meetsOneHouseRequirements && !isUnregistered,
      surchargeDeclarationMatters: isOldSurchargeClauseEra(transferDate),
    }),
  );
  // 4호 미충족 · §155① 취득 선후 — 일반 경로와 같은 문장·같은 게이트(1세대 · 비과세 아님 · 핵심 판정 불성립 — 단건 `coreWouldPass`).
  if (deemedInput.isOneHousehold && !isOneHouseExempt && !(houseCountOk && meetsOneHouseRequirements && !isUnregistered)) {
    warnings.push(
      ...mixedUseUnmetNotices(deemedInput, oneHouseSpecialRules, {
        transferDate,
        oneHouseExemptionProviso: asset.oneHouseExemptionProviso,
      }),
    );
  }
  // §155 의제 경로의 §154① 단서(5호 · 삭제 전 4호) 근거 — 겸용 결과뷰에는 적용 특례 행이 없어 일반 경로와 같은 문장을 경고로 싣는다.
  const decisiveProviso = isOneHouseExempt
    ? decisiveProvisoException(exemptionReqInput, oneHouseSpecialRules.one_house_exemption)
    : undefined;
  if (decisiveProviso) {
    warnings.push(
      ...deemedPathProvisoNotices([
        decisiveProviso.id,
        ...deemedAppliedIds(deemedOneHouseBy155),
        ...(special155Basis !== undefined ? ["155-6-special-house"] : []),
      ]),
    );
  }
  // 배제 확정 — 단건은 판정 결과(`article89Clause2`)를 결과 카드가 보여 주지만 겸용 결과뷰에는 그 칸이 없다 ⇒ 경고로 사유를 싣는다.
  if (clause2Excluded && houseCountOk && meetsOneHouseRequirements && !isUnregistered) {
    warnings.push(
      "세대가 주택과 조합원입주권·분양권을 함께 보유한 상태에서 겸용주택을 양도해 「소득세법」 §89②에 따라 " +
        "1세대1주택 비과세(§89①3호)를 적용하지 않았습니다 — 시행령 §156의2·§156의3의 예외를 적용하지 않았습니다(해당 여부는 판정 메뉴에서 확인 필요). 주택분도 과세됩니다.",
    );
  }
  if (houseCountOk && !meetsOneHouseRequirements) {
    // 어느 요건이 걸렸는지 사용자가 판별할 수 있도록 세 축을 모두 싣는다(침묵 과세 방지).
    const r = oneHouseSpecialRules.one_house_exemption;
    warnings.push(
      `${exemptionHoldingStart.getTime() === asset.buildingAcquisitionDate.getTime() ? "건물 보유기간" : "세대 통산 보유기간"} ` +
        `${exemptionHolding.years}년 ${exemptionHolding.months}개월 · ` +
        `거주기간 ${exemptionReqInput.residencePeriodMonths / 12}년 · ` +
        `취득 당시 조정대상지역 ${asset.wasRegulatedAtAcquisition ? "해당" : "미해당"} — ` +
        `1세대1주택 비과세 요건(보유 ${resolveOneHouseMinHoldingYears(transferDate, r.minHoldingYears)}년, 조정대상지역 취득 시 거주 ` +
        `${r.regulatedAreaMinResidenceYears}년, 소득세법 시행령 §154①) 미충족으로 주택분도 과세됩니다.`,
    );
  }

  // E-14a — 확인된 조특법 감면주택 제외만으로 1주택(단건과 같은 술어). 상속 경로가 서면 쓰지 않는다.
  const specialDeemed = specialActHouseExclusionBasis({
    isOneHousehold: isOneHouseholdForHouseCount,
    houseCount: surcharge15Count,
    inheritedExcludedCount,
    ...verifiedSpecial,
  });

  /**
   * 중과 배제 ① 요소 — 단건 `resolveSurchargeDeemedOneHouseDetail`과 같은 순서·같은 술어(E-7): §89② 게이트(15호 주택 수로
   * 다시 판정 — 단건과 같은 값) → §155①④⑤ → §155②③ → 조특법 감면주택 → §156의2·§156의3. §155⑳ 거주주택 경로는 겸용에
   * 입력이 없다(종전 동작).
   */
  const clause2ForSurcharge = clause2Facts ? clause2Judge(surcharge15Count) : undefined;
  const surchargeBlocked = clause2ForSurcharge !== undefined && clause2BlocksSurchargeDeeming(clause2ForSurcharge);
  const inheritedDeemed = inheritedGeneralHouseSurchargeBasis({
    isOneHousehold: isOneHouseholdForHouseCount,
    houseCount: surcharge15Count,
    inheritedExcludedCount,
    specialActExcludedCount: houseCountExclusionApplied,
    specialActVerified15Count: verifiedSpecial.specialActVerified15Count,
    transferDate,
  });
  // #16(G8-3) — 상속·조특법 제외로 2주택이 된 세대의 §155⑥·⑧ 의제. 단건과 같은 술어 · 비과세 축(`special155Basis`)과 같은 선언이다.
  const cultural155Deemed =
    deemedOneHouseBy155 === undefined && inheritedDeemed === undefined && specialDeemed === undefined
      ? culturalOrUnavoidableDeemingBasis({
          isOneHousehold: isOneHouseholdForHouseCount,
          houseCount: surcharge15Count,
          rawHouseCount: asset.householdHousingCountForExclusion ?? 0,
          inheritedExcludedCount,
          specialActExcludedCount: houseCountExclusionApplied,
          transferDate,
          culturalHeritageHouse: special155Facts?.culturalHeritageHouse,
          unavoidableOutsideCapitalHouse: special155Facts?.unavoidableOutsideCapitalHouse,
        })
      : undefined;
  const rightDeemed =
    deemedOneHouseBy155 === undefined && inheritedDeemed === undefined && specialDeemed === undefined && cultural155Deemed === undefined && clause2ForSurcharge
      ? clause2SurchargeDeemed(clause2ForSurcharge)
      : undefined;

  /**
   * 분리취득 G-3(`isLaterAcquiredLandExemptExcluded`)과 같은 규칙 — 영 §154①의 보유기간은 「해당 주택」의 것이라 주택보다
   * **나중에** 취득한 부수토지는 그 토지를 취득한 날부터 센다. 보유요건(양도일 연혁 2년·3년) 미만이면 그 토지분은
   * 1세대1주택 비과세 대상이 아니다. 같은 항 단서 2호 가목(수용)이 덮는 토지(사업인정 고시일 전 취득 — 5A)는 그대로 비과세다.
   * 종전 겸용 엔진은 보유요건을 건물 취득일 하나로만 판정해 나중 토지도 통째로 비과세했다.
   */
  const laterLandExemptExcluded =
    isOneHouseExempt &&
    isLaterAcquiredLandHeldTooShort(asset.landAcquisitionDate, asset.buildingAcquisitionDate, transferDate) &&
    !landCoveredByExpropriationProviso(asset.landAcquisitionDate, expropriationProvisoLandCutoff(exemptionReqInput));
  if (laterLandExemptExcluded) {
    warnings.push(
      "주택보다 나중에 취득한 부수토지는 그 토지를 취득한 날부터 보유기간을 계산해 보유요건(「소득세법 시행령」 제154조 제1항) " +
        "미만이므로 그 토지분은 1세대1주택 비과세에서 제외했습니다.",
    );
  }

  return {
    meetsOneHouseRequirements,
    isUnregistered,
    isOneHouseExempt,
    laterLandExemptExcluded,
    // E-14d — §155②③(상속주택 + 일반주택)은 주택 수가 1로 줄어 §155①④⑤ 의제 분기에 걸리지 않는다
    //   ⇒ 단건(`resolveSurchargeDeemedOneHouse`)과 같은 술어로 경로를 연다.
    surchargeDeemedOneHouseBy155: surchargeBlocked
      ? undefined
      : (deemedOneHouseBy155 ?? inheritedDeemed ?? specialDeemed?.basis ?? cultural155Deemed ?? rightDeemed?.basis),
    surchargeDeemedRestsOnInheritedExclusion: !surchargeBlocked && cultural155Deemed !== undefined && inheritedExcludedCount > 0,
    // #16 — 영 §167의10①4호 슬롯의 주택 수는 ① 요소와 같은 제외 후 값이다(route가 원시 수로 만든 boolean을 대체한다).
    surchargeUnavoidableOutsideCapitalSlot:
      special155Facts?.unavoidableOutsideCapitalHouse && isOneHouseholdForHouseCount
        ? qualifiesUnavoidableOutsideCapital({
            householdHousingCount: surcharge15Count,
            inheritedHouseExclusionCount: inheritedExcludedCount,
            transferDate,
            unavoidableOutsideCapitalHouse: special155Facts.unavoidableOutsideCapitalHouse,
          })
        : undefined,
    // E-14a · E-7 — 조특법 · §156의2·§156의3 경로의 근거 조문(표시용). 다른 경로는 없다.
    surchargeDeemedOneHouseSource:
      surchargeBlocked || deemedOneHouseBy155 !== undefined || inheritedDeemed !== undefined
        ? undefined
        : (specialDeemed?.source ?? rightDeemed?.source),
    rightDeemingCitedByOldClause1: surchargeBlocked ? undefined : rightDeemed?.citedByOldClause1,
    article89Clause2,
    new994Detail: mixedNew994Detail,
    unsold989Detail: mixedUnsold989Detail,
    houseCountExclusionDetails: mixedHouseCountExclusionDetails,
    specialHouseExclusionDetail: mixedSpecialHouseExclusionDetail,
  };
}
