/**
 * ⑭ 컴패니언 엔진 input 조립의 **타입 선언** — `bundled-split-helpers.ts`에서 옮김 (800줄 정책, 동작 무변경).
 *
 * 조립 함수(`buildCompanionEngineInputs`)는 그 파일에 남는다. 이 파일은 로직 없이 타입만 둔다:
 * `CompanionRawAsset`(⑫ 파생) · `CompanionOwnedKeys`(키 커버리지 가드의 기준) · `CompanionBuildContext` · `MixedUseCompanionContext`.
 */

import type { z } from "zod";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { buildGbCompanionItems } from "./general-building-part-cards";
import type { MixedUseAssetInputSources } from "./mixed-use-asset-input";
import type { companionAssetSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { PrimarySplitContext } from "./bundled-companion-split";

/**
 * ⑭ 분리취득 축은 **⑫ 스키마에서 파생**한다 (N-6(A), 2026-08-23).
 *
 * 아래 `CompanionRawAsset`은 손으로 쓴 인터페이스라, ⑫에 필드가 늘어도 여기 적지 않으면
 * 그 값이 **조용히 사라진다** — 이 파일 주석이 스스로 경고하는 실패 모드다(F13·F15 실사고).
 * 분리취득 축은 필드가 24개라 손으로 유지할 수 없으므로 타입을 스키마에 **묶어 둔다**:
 * ⑫에 필드가 늘면 여기서 컴파일 에러가 나거나 자동으로 따라온다.
 */
/**
 * ⑫ 스키마와 엔진 input에 **둘 다 있는 키** — 컴패니언 경로가 반드시 전달해야 하는 축.
 *
 * 사용자가 입력할 수 있고(⑫) 엔진이 읽는다면(input), 그 사이를 잇는 것이 ⑭의 책임이다.
 * ⑫에 그런 필드가 늘면 아래 키 커버리지 가드가 즉시 빨간불이 된다 —
 * 「손으로 옮기는 것을 잊었다」가 컴파일 에러가 된다.
 *
 * 🔑 **이 선언이 「컴패니언은 무엇을 책임지는가」의 단일 문서**다.
 */
export type CompanionOwnedKeys = Exclude<
  Extract<keyof z.infer<typeof companionAssetSchema>, keyof TransferTaxItemInput>,
  CompanionContextOnlyKeys
>;

/**
 * ⑫∩엔진 키이지만 **컴패니언 자기 item에는 싣지 않는** 축 — 가드에서 명시 제외한다.
 *
 * 세 키는 `resolveHousingContextFromCompanion`(`:99`)이 읽어 **다른 컴패니언(토지)** 에게
 * 줄 「주택 컨텍스트」(정착면적·도시지역·배율 구역)를 만드는 데 쓰인다. 즉 이 값들의 소비처는
 * **자기 자신이 아니라 형제 자산**이고, 그래서 자기 item에는 실리지 않는다.
 *
 * 🟡 **미검증** — 컴패니언 주택이 **자기 부수토지 축**(영 §167의5)을 가질 수 있는 국면에서도
 *    싣지 않는 것이 옳은지는 확인하지 않았다. 싣는 쪽으로 바꾸면 세액이 움직일 수 있으므로
 *    anchor 없이 건드리지 않는다. 착수하려면 그 국면을 먼저 실측할 것.
 *
 * ⚠️ **이 목록은 늘리기 전에 근거를 적을 것.** 근거 없이 추가하면 가드가 그만큼 눈을 감는다.
 */
type CompanionContextOnlyKeys =
  | "buildingFootprintArea"
  | "isUrbanArea"
  | "appurtenantLandZone"
  /**
   * 🔑 **겸용주택은 자기 item으로 가지 않는다** — 아래 ⑭ 겸용 분기가 그 자산 1건을
   * **파트 4건**(주택·상가토지·상가건물·배율초과 비사토)으로 **대체**하므로 `companionEngine`에
   * 실을 자리가 없다. 실으면 aggregate가 겸용을 모르는 단건 엔진으로 돌려 조용히 틀린다
   * (`mixedUse`를 읽는 것은 `calcMixedUseTransferTax`뿐이다).
   *
   * ⚠️ 타입도 다르다 — ⑫는 **Zod payload**, 엔진은 `MixedUseAssetInput`이다. 그 사이는
   *    `buildMixedUseAssetInput` leaf가 잇는다.
   */
  | "mixedUse"
  /**
   * 🔑 **컴패니언은 주택 split 파트 이월과세를 받지 않는다** — ⑫ leaf S0·`splitAcquisitionShape`가 키를 받아서 **명시 거부**(400)하므로
   * 이 키는 컴패니언 item에 도달할 수 없다(싣지 않는 것이 의도다). 엔진 input의 `carryoverGiftEvent`는 파트 이월과세의 echo 전용이다.
   * ②3호 비교가 신고 전체 결정세액을 봐야 해서 컴패니언 병용은 별도 작업이다
   * (docs/02-design/features/transfer-split-part-carryover.engine.design.md §4.5 · 계획서 §11 I-6).
   */
  | "carryoverGiftEvent"
  /**
   * 🔑 **컴패니언은 구주택 멸실·신축 통산(해석 (5))을 받지 않는다** — ⑫ `refineLandRebuild`(`host.supported: false`)가 키를 받아서 **명시 거부**(400)하므로
   * 이 키는 컴패니언 item에 도달할 수 없다(싣지 않는 것이 의도다). 컴패니언 토지 카드 세율(`resolveCompanionLandRate`)은 토지 취득일을 보지 않는 별개 구현이라
   * 같은 통산을 넣으면 두 경로가 갈린다 — 별건(계획서 §사용자 결정 Q-3).
   */
  | "landRebuildPriorHouse";

/**
 * ⑭ 컴패니언 원시 자산 — **⑫ 스키마에서 전면 파생**한다 (장치 1, 2026-09-04).
 *
 * ## 왜 손으로 쓰지 않는가
 *
 * 종전에는 `CompanionSplitFields`(분리취득 24키)만 파생하고 **나머지 44키를 손으로 나열**했다.
 * 그러면 ⑫에 필드가 늘어도 여기 적지 않는 한 **타입에 나타나지 않아 접근조차 못 한다**
 * — 이 파일 헤더가 경고하는 F13·F15의 절반(갭 1)이다.
 *
 * **실측**(2026-09-04): 손으로 쓴 44키 **전부**가 ⑫에 존재했고, 전면 파생으로 바꿔도
 * `tsc` 에러 **0건**이었다 — 좁힘 override가 하나도 필요 없다. 그리고 파생 전에는
 * ⑫ 전용 키 접근이 `TS2339`로 막혔고(예: `inheritanceValuation`), 파생 후에는 통과한다.
 *
 * ## 갭 1만 닫는다 — 갭 2는 아래 키 커버리지 가드가 막는다
 *
 * 「타입에 있다」와 「조립부가 싣는다」는 다른 문제다. F13·F15가 실제로 터진 곳은 후자이고,
 * 그쪽은 `_companionKeyCoverageGuards`가 담당한다. 두 장치는 **함께** 있어야 한다.
 *
 * 계획서: `docs/02-design/features/companion-derived-type-guard.plan.md`
 */
export type CompanionRawAsset = z.infer<typeof companionAssetSchema>;

export interface CompanionApportioned {
  assetLabel?: string;
  allocatedSalePrice: number;
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
}

export interface CompanionBuildContext {
  primaryCtxForSplit?: {
    propertyType: TransferTaxItemInput["propertyType"];
    holdingMonths: number;
    buildingFootprintArea?: number;
    isUrbanArea?: boolean;
    appurtenantLandZone?:
      | "metropolitan_residential"
      | "non_metropolitan_or_green"
      | "non_urban";
    bundledSaleMode?: "actual" | "apportioned";
  };
  // userModeOverride 제거됨 (2026-05-07): 자산별 landNature 기반으로 대체
  // primaryAcquisitionDate 제거됨 (2026-09-30 CP-5): 컴패니언 취득일이 비면 주 자산 취득일로 대신 채웠다(C).
  //   이제 ⑫(`refineCompanionAcquisitionDate`)가 요구하고 ④가 신축·이월과세 취득일을 채운다.
  transferDate: Date;
  primaryAcquisitionCause: TransferTaxItemInput["acquisitionCause"];
  primaryEngineInput: {
    householdHousingCount: number;
    isRegulatedArea: boolean;
    wasRegulatedAtAcquisition: boolean;
    /**
     * 세대 보유 조합원입주권·분양권 — 「소득세법」 §89②·§104⑦2호·4호 판정용 (R-5).
     *
     * 🔴 「1세대가 … 보유」는 **세대 단위 사실**이라 같은 계약으로 함께 양도하는 주택이
     *    두 채면 양쪽이 모두 이 값을 봐야 한다. 종전에는 `householdHousingCount`는
     *    상속시키면서 이 값만 빠뜨려 컴패니언 주택이 §89② 배제를 통째로 면했다
     *    (실측: 총세액 77,341,000 — 컴패니언분이 조용히 0원이었다).
     */
    presaleRights?: TransferTaxItemInput["presaleRights"];
    /**
     * 그 권리의 §156의2④·§156의3③·시행규칙 §75① 선언 — `presaleRights`와 **짝**이다(세대 단위 사실:
     * 신축주택 완성·세대전원 이사·거주, 경매·공매). OH-30b 이후 2022-02-15 전 취득 권리는 1년 요건을
     * 못 채워도 ④가 남으므로, 이 선언이 컴패니언에 닿지 않으면 컴패니언만 판정 불가로 샌다.
     */
    rightThreeYearException?: TransferTaxItemInput["rightThreeYearException"];
    /**
     * §89①4호 가·나목 판정 사실(세대 단위) — **축 B(같은 물건 지분 분할 취득)에서만** 실린다(#11 별건).
     *
     * 🔴 컴패니언 엔진 input에는 이 사실이 없어 입주권 둘째 카드는 `resolveOneRightExemptionClause`가 항상 불성립이었다 —
     *    50%+50% 20억 입주권에서 앞 카드는 전액 비과세, 뒤 카드는 전액 과세(단건 224,831,640 vs 291,211,800).
     *    같은 물건의 지분 카드는 같은 세대·같은 입주권이라 주 카드와 같은 사실을 본다. 함께 양도(다른 물건)는 싣지 않는다 —
     *    그쪽 입주권 카드의 4호 판정은 별개 축이다.
     */
    oneRightHouseholdFacts?: Pick<
      TransferTaxItemInput,
      | "householdRightCount"
      | "householdNoPresaleRightsConfirmed"
      | "transferorNonResidentAtTransfer"
      | "houses"
      | "sellingHouseId"
      | "marriageMerge"
      | "parentalCareMerge"
      | "isFirstTransferredInMerge"
      | "contestedRightSaleParentalCareMergeApply"
    >;
    /**
     * §104①4호 단서(영 §167의6 1·2호) — 세대 단위 사실. 컴패니언이 분양권(`presale_right`)이면
     * 이 값으로 단서를 판정한다. 미제공 시 단서 불성립(모름 = 혜택 불성립).
     */
    presaleRightNoOtherRight?: boolean;
    presaleRightAgeOrSpouseMet?: boolean;
    /** 주택 부수토지 컴패니언이 상속받는 거주기간 (F12) — 세대 단위 3값과 같은 취급. */
    residencePeriodMonths: number;
    propertyType: TransferTaxItemInput["propertyType"];
    buildingFootprintArea?: number;
    isUrbanArea?: boolean;
    appurtenantLandZone?:
      | "metropolitan_residential"
      | "non_metropolitan_or_green"
      | "non_urban";
  };
  bundledSaleMode?: "actual" | "apportioned";
  /** #17 후속(K1) — 배율 한도를 주택 카드·부수토지 카드가 공유한다(`appurtenantLimitShareOf`). */
  appurtenantLimitShare?: Pick<PrimarySplitContext, "houseLandAreaM2" | "appurtenantCardsAreaM2">;
  adjustedAcqPrice?: number;
  /**
   * 겸용 컴패니언 전용 컨텍스트. **optional이 아니라 `| null`이다** — 호출부가 「이 축은 없다」를
   * 명시하게 만들어 조용한 누락(⑫는 통과하는데 ⑭가 못 받는 상태)을 컴파일 에러로 바꾼다.
   */
  mixedUseCtx: MixedUseCompanionContext | null;
  /** 일반건물 컴패니언 결과 상세(산식 재료) 수집 — `buildGbCompanionItems` 참조. */
  onGbDetail?: Parameters<typeof buildGbCompanionItems>[3];
}

/**
 * 겸용 컴패니언이 서브엔진을 돌리는 데 필요한 것.
 *
 * 🔑 `globals` 타입을 **`MixedUseAssetInputSources`에서 파생**시킨다 — leaf에 필드가 늘면
 *    route가 그것을 넘기지 않는 한 컴파일이 실패한다. 손으로 나열했다면 조용히 누락됐을 축이다.
 *    자산-수준·세대 축은 컴패니언 자기 값(`c`·`primaryEngineInput`)을 쓰므로 여기 없다.
 */
export interface MixedUseCompanionContext {
  rates: TaxRatesMap;
  globals: Pick<
    MixedUseAssetInputSources,
    | "regionCode"
    | "regionInDesignatedDistrict"
    | "oneHouseExemptionProviso"
    | "temporaryTwoHouse"
    | "specialHouseExclusions"
    | "isSelfCultivatedExpropriatedLand"
    | "rawHouses"
    | "houses"
    | "sellingHouseId"
    | "marriageMerge"
    | "parentalCareMerge"
    | "isFirstTransferredInMerge"
    | "gracePeriod"
    | "unavoidableOutsideCapitalHouse"
    /**
     * §155의3 상생임대 (P5-c) — 🔴 **`Pick` 목록은 손으로 나열돼 있어 컴파일러가 누락을
     * 잡지 못한다.** leaf(`MixedUseAssetInputSources`)에 필드를 더해도 여기 안 적으면
     * 컴패니언 겸용만 조용히 면제를 못 받는다(「primary는 표2인데 함께 양도한 겸용은 표1」).
     *
     * 폼-전역 값을 컴패니언이 상속하는 것은 이 축의 **기존 규약**이다 — 단건 경로도
     * 컴패니언 주택부수토지 표2 판정에 같은 폼-전역 값을 쓴다(`transfer-tax-lthd.ts:219`).
     */
    | "winWinRentalHouse"
  >;
}
