/**
 * 겸용주택(§160① 단서) **엔진 입력 조립 — 단일 소스**.
 *
 * 「Zod 겸용 서브객체 + 폼-전역/자산-수준 값 → `MixedUseAssetInput`」이라는 규칙을 두 호출부가
 * 공유한다:
 *
 * | 호출부 | `mixedUse` 출처 |
 * |---|---|
 * | route 5-a-2 (단건 겸용) | `data.mixedUse` |
 * | 컴패니언 함께양도 (`bundled-split-helpers.ts`) | 그 컴패니언 자산의 `c.mixedUse` |
 *
 * 🔑 **승격한 이유가 안전장치다.** 이 조립은 **25필드이고 대부분 optional**이라 한 줄만 빠져도
 *    타입이 통과하고 세액이 조용히 틀린다(설계문서 `transfer-bundled-subengine-hosting.design.md`
 *    §9.3). 컴패니언 축을 열면서 **복제했다면 그 25필드를 손으로 옮기는 일**이 됐을 것이다 —
 *    F13·F15가 터진 것과 같은 실패 모드다. GB가 `buildGbPartCards`를 leaf로 승격한 것과 같은 층위.
 *
 * ⚠️ **Date 변환본을 받는다.** Zod 출력은 날짜가 string이라 raw를 넘기면 `addYears`·`>=` 비교가
 *    침묵 오작동한다. 어느 값이 변환본이어야 하는지는 각 필드 주석에 남겼다.
 */
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { mixedUseAssetSchema } from "@/lib/api/transfer-tax-schema-mixed-use";
import type { z } from "zod";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { qualifiesUnavoidableOutsideCapital } from "@/lib/tax-engine/transfer-tax-exemption-requirements";

/** Zod 겸용 서브객체 출력 — `transferTaxSchema.mixedUse` / `companionAssetSchema.mixedUse` 공통. */
export type MixedUseZodPayload = z.infer<typeof mixedUseAssetSchema>;

/**
 * 조립에 필요한 값 전부. **명시 필드로 열거해** 호출부가 하나라도 빠뜨리면 컴파일 실패가 되게 한다
 * (optional 필드를 `?`로 두지 않는 이유 — `undefined`를 넘기는 것과 «안 넘기는 것»을 구분해야
 * 「조용한 누락」이 성립하지 않는다).
 */
export interface MixedUseAssetInputSources {
  /** ⑫ 겸용 서브객체 (Zod 출력 그대로). */
  mixedUse: MixedUseZodPayload;

  // ── 자산-수준 ──────────────────────────────────────────────
  /** 개산공제(영 §163⑥) base 축소. 컴패니언(단독 소유)은 1 또는 undefined. */
  ownershipRatio: number | undefined;
  /** §104③ 미등기양도자산. */
  isUnregistered: boolean | undefined;
  /**
   * **물건 전체(100%) 양도가액** — §89①3호 고가주택(12억) 판정·안분 분모(영 §156①·②).
   * 지분 양도에서만 값이 있다. 단독 소유면 `undefined`(= 양도가액이 곧 분모).
   */
  totalPropertyTransferPrice: number | undefined;
  /** ⚠️ `mapReductionsToEngine` 변환본 — raw 금지(§77① 「소급 2년」 비교가 침묵 오작동). */
  reductions: TransferTaxInput["reductions"];
  filingPenaltyDetails: TransferTaxInput["filingPenaltyDetails"];
  delayedPaymentDetails: TransferTaxInput["delayedPaymentDetails"];
  /** CB-05 §97 시리즈 시한 기준일 (Date 변환본). */
  assetContractDate: TransferTaxInput["assetContractDate"];

  // ── 폼-전역 ────────────────────────────────────────────────
  /** 영 §154① 요건 판정. */
  wasRegulatedAtAcquisition: boolean | undefined;
  regionCode: TransferTaxInput["regionCode"];
  /** ⚠️ Date 변환본 — §154① 단서의 `addYears` 비교. */
  oneHouseExemptionProviso: TransferTaxInput["oneHouseExemptionProviso"];
  /** §155① 일시적 2주택 (Date 변환본). */
  temporaryTwoHouse: TransferTaxInput["temporaryTwoHouse"];
  /** §89①3호 주택수 제외 축 (D4-02). */
  householdHousingCount: number;
  specialHouseExclusions: TransferTaxInput["specialHouseExclusions"];
  isOneHousehold: boolean;
  isRegulatedArea: boolean;
  isSelfCultivatedExpropriatedLand: boolean | undefined;
  priorReductionUsage: MixedUseAssetInput["priorReductionUsage"];

  // ── §104⑦ 중과 판정 입력 ──────────────────────────────────
  /** **원시(Zod) houses** — 존재 판정과 `sellingHouseId` fallback에만 쓴다. */
  rawHouses: { id: string }[] | undefined;
  /** ⚠️ `mapHousesToEngine` 변환본 (`acquisitionDate`가 Date). */
  houses: TransferTaxInput["houses"];
  sellingHouseId: string | undefined;
  presaleRights: TransferTaxInput["presaleRights"];
  marriageMerge: TransferTaxInput["marriageMerge"];
  parentalCareMerge: TransferTaxInput["parentalCareMerge"];
  /** ⚠️ `mapGracePeriodToEngine` 변환본. */
  gracePeriod: TransferTaxInput["gracePeriod"];
  /**
   * §167의10①4호 부득이한 사유 수도권 밖 주택 — **top-level `{reason, resolvedDate}` 객체**.
   *
   * 🔴 **중첩 `multiHouse`의 동명 필드는 `boolean`이다** — 같은 이름의 다른 축이라 그대로 이어
   *    붙일 수 없다. 아래에서 비과세와 **같은 정본 함수**(`qualifiesUnavoidableOutsideCapital`)로
   *    파생한다. 그 파생이 단건 경로에만 있어 겸용에서 중과 배제가 미발동하던 것을 PR #1465가
   *    고쳤다(실측 75,080,960원 과대).
   */
  unavoidableOutsideCapitalHouse: TransferTaxInput["unavoidableOutsideCapitalHouse"];

  /** §167의10①4호 3년 기한 판정 기준일. */
  transferDate: Date;
}

/** 겸용 엔진 입력 1건을 조립한다. 키 커버리지는 함수 안의 가드가 강제한다. */
export function buildMixedUseAssetInput(s: MixedUseAssetInputSources): MixedUseAssetInput {
  const phdInput = s.mixedUse.preHousingDisclosure
    ? {
        ...s.mixedUse.preHousingDisclosure,
        firstDisclosureDate: new Date(s.mixedUse.preHousingDisclosure.firstDisclosureDate),
      }
    : undefined;

  /**
   * ⑭ 법 §104⑦ 다주택 중과 입력 — **가드가 보도록 이름을 붙여 끌어올렸다**.
   *
   * 🔴 종전에는 `mixedAsset` 안의 **중첩 객체 리터럴**이라, 상위 조립부의 키 커버리지 가드가
   *    이 안의 누락을 **보지 못했다**(실측: `marriageMerge`·`parentalCareMerge`·`gracePeriod`를
   *    지워도 tsc·테스트 **둘 다 통과**). 중첩은 별도 가드가 필요하다.
   */
  const mixedMultiHouse =
    s.rawHouses && s.rawHouses.length > 0
      ? ({
          houses: s.houses ?? [],
          sellingHouseId: s.sellingHouseId ?? s.rawHouses[0].id,
          presaleRights: s.presaleRights ?? [],
          isOneHousehold: s.isOneHousehold,
          isRegulatedArea: s.isRegulatedArea,
          marriageMerge: s.marriageMerge,
          parentalCareMerge: s.parentalCareMerge,
          gracePeriod: s.gracePeriod,
          /**
           * §167의10①4호 — **비과세와 같은 정본 함수**를 태운다(2주택·해소 3년 기한 규칙을
           * 재구현하지 않는다). `multi-house-surcharge-exclusion.ts:393`이 이 boolean을 읽는다.
           */
          unavoidableOutsideCapitalHouse: qualifiesUnavoidableOutsideCapital({
            householdHousingCount: s.householdHousingCount,
            transferDate: s.transferDate,
            unavoidableOutsideCapitalHouse: s.unavoidableOutsideCapitalHouse,
          }),
        } satisfies NonNullable<MixedUseAssetInput["multiHouse"]>)
      : undefined;

  /**
   * ⑭ **중첩 키 커버리지 가드** — 상위 가드는 중첩 객체 안을 못 본다. 제외 목록은 **없다**.
   * ⚠️ 제외를 늘리기 전에 근거를 적을 것 — 근거 없이 추가하면 가드가 그만큼 눈을 감는다.
   */
  const _mixedMultiHouseGuards: [
    Exclude<
      keyof NonNullable<MixedUseAssetInput["multiHouse"]>,
      keyof NonNullable<typeof mixedMultiHouse>
    > extends never
      ? true
      : never,
  ] = [true];
  void _mixedMultiHouseGuards;

  const mixedAsset = {
    ...s.mixedUse,
    isMixedUseHouse: true as const,
    // ⑭ 개산공제(§163⑥) 지분 축소 — `mixedUse` 서브객체에는 없는 자산-수준 값.
    ownershipRatio: s.ownershipRatio,
    isUnregistered: s.isUnregistered,
    // ⑭ §89①3호 12억 분모 — 지분 양도에서 이 값이 없으면 문턱이 1/지분율만큼 올라간다.
    totalPropertyTransferPrice: s.totalPropertyTransferPrice,
    // ⑭ 영 §154① 요건 판정 — 폼-전역이라 서브객체에 없다. 누락 시 거주요건·단서 면제가 미판정.
    wasRegulatedAtAcquisition: s.wasRegulatedAtAcquisition,
    regionCode: s.regionCode,
    oneHouseExemptionProviso: s.oneHouseExemptionProviso,
    // ⑭ §155① 일시적 2주택 — 겸용 서브엔진이 §155① 의제 성립을 선판정해 중과 배제(§167의10①15호)로 넘긴다.
    temporaryTwoHouse: s.temporaryTwoHouse,
    // ⑭ §89①3호 주택수 제외 축 (D4-02).
    householdHousingCountForExclusion: s.householdHousingCount,
    // ⑭ §97 시리즈 시한 기준일 (CB-05).
    assetContractDate: s.assetContractDate,
    specialHouseExclusions: s.specialHouseExclusions,
    // ⑭ 법 §104⑦ — `rawHouses` 미전송(단독 주택)이면 undefined → 엔진이 중과 판정을 건너뛴다.
    multiHouse: mixedMultiHouse,
    /**
     * ⑭ 법 §104⑦ 중과 **원시 플래그 fallback** — `multiHouse`가 `houses` 없이는 조립되지 않아
     * 겸용주택에 중과가 통째로 미적용되던 것을 메운다(실측 505,484,136원 과소).
     *
     * ⚠️ **`multiHouse`와 나란히, 조건 없이 항상 보낸다.** 「houses가 없을 때만」으로 좁히면
     *    엔진이 정밀 판정을 갖고도 원시 플래그를 못 받아 표시 문구를 만들지 못한다.
     *    우선순위(정밀 > fallback)는 `resolveSurchargeApplication`이 판단한다.
     */
    surchargeFallback: {
      isRegulatedArea: s.isRegulatedArea,
      // 🔑 양도하는 겸용주택 **자신을 포함한** 세대 보유 주택 수 — §104⑦ 각 호의 「1세대 2주택」이
      //    세대 소유분 전체를 세므로 +1 보정을 하지 않는다(일반 주택 경로와 같은 규약).
      householdHousingCount: s.householdHousingCount,
    },
    landAcquisitionDate: new Date(s.mixedUse.landAcquisitionDate),
    buildingAcquisitionDate: new Date(s.mixedUse.buildingAcquisitionDate),
    /**
     * ⑭ 조특법 감면·가산세 (F17-B) — 종전에는 이 축이 통째로 없어 폼에서 §77을 골라도 세액이
     * 1원도 안 움직였다(실측 `totalPayable` 60,853,408 → 60,853,408).
     */
    reductions: s.reductions,
    filingPenaltyDetails: s.filingPenaltyDetails,
    delayedPaymentDetails: s.delayedPaymentDetails,
    priorReductionUsage: s.priorReductionUsage ?? [],
    isSelfCultivatedExpropriatedLand: s.isSelfCultivatedExpropriatedLand,
    preHousingDisclosure: phdInput,
    partialUsageChange: s.mixedUse.partialUsageChange
      ? {
          ...s.mixedUse.partialUsageChange,
          // date-coerce: 빈문자열·invalid → undefined 가드.
          usageChangeDate: toOptionalDate(s.mixedUse.partialUsageChange.usageChangeDate),
        }
      : undefined,
  } satisfies MixedUseAssetInput;

  /**
   * ⑭ **겸용 조립 키 커버리지 가드** — 런타임 영향 없음(`void`로 소비).
   *
   * `MixedUseAssetInput`은 **59필드 중 45개가 optional(76%)** 이라 한 줄이 빠져도 타입이 통과한다.
   * 착수 전 뮤테이션 실측: `marriageMerge`·`parentalCareMerge`·`gracePeriod`를 지우면
   * **tsc 0건 · 테스트 전건 통과**였다(필수 필드는 컴파일러가 이미 잡는다 — 위험은 optional).
   *
   * ⚠️ `const mixedAsset: MixedUseAssetInput = {…}`로 바꾸면 추론 타입이 넓어져 `keyof`가 항상
   *    전체 키가 되고 **가드가 상수 참**이 된다(PR #1462 실측) — 반드시 `satisfies`.
   * ⚠️ 이 가드는 **키의 존재만** 본다 — 값이 옳은지·Date 변환을 했는지는 못 본다.
   */
  const _mixedUseKeyCoverageGuards: [
    typeof mixedAsset extends MixedUseAssetInput ? true : never,
    Exclude<keyof MixedUseAssetInput, keyof typeof mixedAsset> extends never ? true : never,
  ] = [true, true];
  void _mixedUseKeyCoverageGuards;

  return mixedAsset;
}
