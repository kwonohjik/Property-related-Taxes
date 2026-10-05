/**
 * 겸용주택 §89①3호 **1세대1주택 비과세 판정** — `calcMixedUseTransferTax`에서 800줄 정책으로 분리(E-14d).
 *
 * 한 덩어리로 옮긴 판정 세 축:
 *   · 영 §154① 보유·거주(단서 면제 포함) — 정본 `meetsOneHouseHoldingResidence`
 *   · §89①3호 주택 수 제외 — 조특법(§99의4·§98의9·보유 감면주택) + §155②③ 상속주택(E-14d)
 *   · §155①④⑤ 1세대1주택 의제 — 정본 `resolveDeemedOneHouseBy155` (OH-09)
 * 그리고 같은 주택 수로 영 §167의10①15호 ① 요소(중과 배제)를 선판정한다(E-14 · E-14d).
 *
 * `warnings`에 in-place push한다(호출부 배열 순서 유지).
 */
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import { calculateHoldingPeriod } from "./tax-utils";
import { meetsOneHouseHoldingResidence, resolveDeemedOneHouseBy155 } from "./transfer-tax-exemption";
import {
  surcharge15HouseCount,
  inheritedGeneralHouseSurchargeBasis,
  specialActHouseExclusionBasis,
  verifiedSpecialAct15Exclusions,
  collectKnownHouseExclusionIds,
} from "./transfer-tax-house-exclusion-step";
import {
  resolveInheritedHouseExclusionFromInput,
  buildInheritedExclusionSteps,
} from "./transfer-inheritance-exclusion";
import { resolveHouseCountExclusion, resolveSpecialHouseExclusions } from "./transfer-reductions";
import type { HouseCountExclusionDetail } from "./transfer-reductions/unsold-98-9";
import { resolveArticle89Clause2, type Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
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
  /** 영 §167의10①15호 ① 요소 — §155①④⑤ 의제 또는 §155②③ 상속주택 경로. */
  surchargeDeemedOneHouseBy155: DeemedOneHouseBasis | undefined;
  /** `surchargeDeemedOneHouseBy155`의 표시용 근거 조문 — 조특법 감면주택 · §156의2·§156의3 경로(E-14a · E-7) */
  surchargeDeemedOneHouseSource: string | undefined;
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
  // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이기 때문이다.
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
  const exemptionHolding = calculateHoldingPeriod(asset.buildingAcquisitionDate, transferDate);
  const exemptionReqInput = {
    // 주택 부분의 취득일 = 건물 취득일. §154①의 보유기간은 「해당 **주택**」의 보유기간이고
    // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이다.
    acquisitionDate: asset.buildingAcquisitionDate,
    transferDate,
    // 거주기간은 §154⑧3호 **통산값**(동일세대 상속분 포함)을 쓴다. API 변환
    // (`transfer-tax-api-mixed-use.ts:171`)이 `consolidateResidenceMonths`로 이미 통산해
    // 보내므로, 여기서 `acquisitionCause`·`decedent*`를 함께 넘기면 **통산이 두 번** 걸린다
    // → 의도적으로 미전달. 같은 미전달이 `resolveExemptionHoldingStartDate`의 backdate도
    // 막아 보유 기산일이 건물 취득일로 고정된다(겸용에는 그 입력 자체가 없다).
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
  };
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
      generalHouseAcquisitionDate: asset.buildingAcquisitionDate,
      transferDate,
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
  const deemedOneHouseBy155 = resolveDeemedOneHouseBy155(
    {
      ...exemptionReqInput,
      isRegulatedArea:
        asset.multiHouse?.isRegulatedArea ?? asset.surchargeFallback?.isRegulatedArea ?? false,
      isOneHousehold: asset.multiHouse?.isOneHousehold ?? asset.isOneHousehold ?? false,
      temporaryTwoHouse: asset.temporaryTwoHouse,
      // 겸용은 §155⑦ 농어촌주택 입력을 받지 않는다(농어촌주택은 겸용주택이 아니다) —
      //   `ruralHouse`가 없으면 §155⑦ 판정은 주택 수와 무관하게 불성립이다.
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
      knownHouseExclusionHouseIds,
    },
    oneHouseSpecialRules,
  );
  // 제외 후 1채 이하면 주택 수 축이 충족된다(§89①3호 가목). 제외가 0이면 호출부 판정 그대로.
  // §155 의제가 성립하면 「1세대1주택으로 보아」 주택 수 축이 충족된다(OH-09).
  // E-14i — 제외 분기도 「1세대가」(§89①3호가목·영 §154①)를 본다. 조특법 §99의4①·§98의9①·§98의7② 등은 주택 수에서
  //   뺄 뿐 1세대 요건을 대신하지 않는다. 단건 `checkExemptionCore`의 `!input.isOneHousehold` · 위 상속 제외(E-14d)와 같은 값.
  const houseCountOk =
    (effectiveHouseCount !== undefined && houseCountExclusionApplied + inheritedExcludedCount > 0
      ? isOneHouseholdForHouseCount && effectiveHouseCount <= 1
      : (asset.isOneHouseExempt ?? true)) || deemedOneHouseBy155 !== undefined;
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
  warnings.push(...article89Clause2Notices(article89Clause2, isOneHouseExempt, transferDate));
  // 배제 확정 — 단건은 판정 결과(`article89Clause2`)를 결과 카드가 보여 주지만 겸용 결과뷰에는 그 칸이 없다 ⇒ 경고로 사유를 싣는다.
  if (clause2Excluded && houseCountOk && meetsOneHouseRequirements && !isUnregistered) {
    warnings.push(
      "세대가 주택과 조합원입주권·분양권을 함께 보유한 상태에서 겸용주택을 양도해 「소득세법」 §89②에 따라 " +
        "1세대1주택 비과세(§89①3호)를 적용하지 않았습니다 — 시행령 §156의2·§156의3의 예외에 해당하지 않습니다. 주택분도 과세됩니다.",
    );
  }
  if (houseCountOk && !meetsOneHouseRequirements) {
    // 어느 요건이 걸렸는지 사용자가 판별할 수 있도록 세 축을 모두 싣는다(침묵 과세 방지).
    const r = oneHouseSpecialRules.one_house_exemption;
    warnings.push(
      `건물 보유기간 ${exemptionHolding.years}년 ${exemptionHolding.months}개월 · ` +
        `거주기간 ${exemptionReqInput.residencePeriodMonths / 12}년 · ` +
        `취득 당시 조정대상지역 ${asset.wasRegulatedAtAcquisition ? "해당" : "미해당"} — ` +
        `1세대1주택 비과세 요건(보유 ${r.minHoldingYears}년, 조정대상지역 취득 시 거주 ` +
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
    transferDate,
  });
  const rightDeemed =
    deemedOneHouseBy155 === undefined && inheritedDeemed === undefined && specialDeemed === undefined && clause2ForSurcharge
      ? clause2SurchargeDeemed(clause2ForSurcharge)
      : undefined;

  return {
    meetsOneHouseRequirements,
    isUnregistered,
    isOneHouseExempt,
    // E-14d — §155②③(상속주택 + 일반주택)은 주택 수가 1로 줄어 §155①④⑤ 의제 분기에 걸리지 않는다
    //   ⇒ 단건(`resolveSurchargeDeemedOneHouse`)과 같은 술어로 경로를 연다.
    surchargeDeemedOneHouseBy155: surchargeBlocked
      ? undefined
      : (deemedOneHouseBy155 ?? inheritedDeemed ?? specialDeemed?.basis ?? rightDeemed?.basis),
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
