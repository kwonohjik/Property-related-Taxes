/**
 * 일괄양도 companion 자산 한도 초과 split 헬퍼 (G-2, 세율 축: 영 §167의5)
 *
 * 신축주택 + 부수토지 일체과세 케이스에서
 * companion 토지가 부수토지 인정 한도를 초과하면
 * 한도 내 자산(부수토지) + 한도 초과 자산(나대지)으로 split한다.
 *
 * split 진입 조건:
 *   1. primary.acquisitionCause === "newConstruction"
 *   2. companion.assetKind === "land"
 *   3. companion.areaM2 > 0 (면적 확인 가능)
 *   4. excessArea > 0  (resolveCompanionLandRate 결과)
 *   5. companion.manualHoldingPeriodOverride === undefined (수동 지정 없음)
 *
 * 금액 안분 원칙 (정수 보존):
 *   - 각 금액을 Math.floor(금액 × 비율)로 excess 몫 계산
 *   - appurtenant 몫 = 전체 - excess 몫 (나머지 귀속, 절사 오차 흡수)
 *
 * 법령 근거 (세율 축):
 *   「소득세법」 §104①2·3호 괄호 (주택에 딸린 토지를 주택에 포함 — "이하 이 항에서 같다")
 *   같은 법 시행령 §167의5 (단기보유 주택부수토지의 범위 — 정착면적 × 배율)
 *     도시지역 내: 수도권 주거·상업·공업 3배 / 수도권 녹지 5배 / 수도권 밖 5배, 그 밖의 지역 10배
 *     ⚠️ 2022.1.1. 전 양도분은 종전 규정(도시지역 일률 5배) — 2020.2.11. 대통령령 제30395호 부칙 §39
 *   기재부 재산세제과-1354(2022.10.27) / 조심 2024인3140(2024.9.3. 기각)
 *
 * ※ 영 §154⑦(§89①3호 위임)은 **비과세 축**이라 여기서는 근거가 아니다 — 배율 수치만 동일하다.
 */

import type { z } from "zod";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { companionAssetSchema, reductionSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapReductionsToEngine } from "./route-reductions-mapper";
import { splitAcquisitionShape } from "@/lib/api/transfer-tax-schema-split";
import { resolveCompanionSplit, splitCompanionIntoTwo } from "./bundled-companion-split";
import {
  calculateHoldingPeriod,
  calculateEstimatedAcquisitionPrice,
} from "@/lib/tax-engine/tax-utils";
import {
  apportionBundledSale,
  type BundledAssetInput,
  type BundledApportionmentResult,
} from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import type { InheritanceAssetKind } from "@/lib/tax-engine/inheritance-acquisition-price";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";

// ─── 사례 28 자동 분기 양방향 확장 ───────────────────────────────
// 자산 순서와 무관하게(primary가 land여도) companion에서 housing을 검색하여
// land 자산에 housing 컨텍스트(부수토지 한도·보유기간)를 주입하기 위한 헬퍼.

interface CompanionForHousingCtx {
  assetKind: string;
  acquisitionDate?: string;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
}

interface PrimaryCtxResult {
  propertyType: "housing";
  holdingMonths: number;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
  bundledSaleMode?: "actual" | "apportioned";
}

/**
 * primary가 housing이 아닌 경우 companion 배열에서 housing 자산을 검색하여
 * 부수토지 자동 분기에 필요한 housing 컨텍스트를 도출한다.
 * housing이 없거나 acquisitionDate가 없으면 undefined.
 */
export function resolveHousingContextFromCompanion(
  companions: CompanionForHousingCtx[],
  transferDate: Date,
  fallbackBuildingFootprintArea: number | undefined,
  fallbackIsUrbanArea: boolean | undefined,
  bundledSaleMode: "actual" | "apportioned" | undefined,
  fallbackAppurtenantLandZone?:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban",
): PrimaryCtxResult | undefined {
  const housing = companions.find((c) => c.assetKind === "housing");
  if (!housing || !housing.acquisitionDate) return undefined;
  const hp = calculateHoldingPeriod(new Date(housing.acquisitionDate), transferDate);
  return {
    propertyType: "housing",
    holdingMonths: hp.years * 12 + hp.months,
    buildingFootprintArea: housing.buildingFootprintArea ?? fallbackBuildingFootprintArea,
    isUrbanArea: housing.isUrbanArea ?? fallbackIsUrbanArea,
    appurtenantLandZone: housing.appurtenantLandZone ?? fallbackAppurtenantLandZone,
    bundledSaleMode,
  };
}

// resolveUserModeOverride 제거됨 (2026-05-07): 자산별 landNature 명시 입력으로 대체.
// 폼-수준 appurtenantLandRateMode → companion manualHoldingPeriodOverride 매핑 불필요.

// ─── companion engineInput 빌드 + split 분기 통합 헬퍼 ────────────
// route.ts의 인라인 60줄을 헬퍼로 추출 (800줄 정책 준수).

/**
 * ⑭ 분리취득 축은 **⑫ 스키마에서 파생**한다 (N-6(A), 2026-08-23).
 *
 * 아래 `CompanionRawAsset`은 손으로 쓴 인터페이스라, ⑫에 필드가 늘어도 여기 적지 않으면
 * 그 값이 **조용히 사라진다** — 이 파일 주석이 스스로 경고하는 실패 모드다(F13·F15 실사고).
 * 분리취득 축은 필드가 24개라 손으로 유지할 수 없으므로 타입을 스키마에 **묶어 둔다**:
 * ⑫에 필드가 늘면 여기서 컴파일 에러가 나거나 자동으로 따라온다.
 */
type CompanionSplitFields = Pick<
  z.infer<typeof companionAssetSchema>,
  keyof typeof splitAcquisitionShape
>;

interface CompanionRawAsset extends CompanionSplitFields {
  assetId: string;
  assetLabel?: string;
  assetKind: "housing" | "land" | "building";
  acquisitionDate?: string;
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  decedentAcquisitionDate?: string;
  /**
   * §154⑧3호 상속주택 자체 양도 — 동일세대 게이트 + 통산 보유 기산일·통산 거주 개월.
   * ⑫(`companionAssetSchema`)·⑬(`buildAssetPayload`)에는 있는데 ⑭만 빠져 있었다(F13):
   * 세 값이 엔진에 도달하지 않아 컴패니언 상속주택의 §154① 비과세가 통째로 사라졌다.
   * (엔진이 `acquisitionCause === "inheritance"` 게이트를 내부에서 판정하므로 여기서는 원값만 전달 —
   *  단건 `engine-input.ts:71-73`과 같은 형태.)
   */
  decedentSameHouseholdBeforeInheritance?: boolean;
  decedentCohabitationHoldingStartDate?: string;
  decedentCohabitationResidenceMonths?: number;
  donorAcquisitionDate?: string;
  assetContractDate?: string;
  capitalExpenditure?: number;
  transferExpense?: number;
  useEstimatedAcquisition?: boolean;
  standardPriceAtAcquisition?: number;
  standardPriceAtTransfer?: number;
  // 공익수용 §164⑨ 1호 환산 min[] 특례 (계획 Q5 — 컴패니언 지원).
  // ⑫ `transfer-tax-schema-sub.ts` 컴패니언 스키마와 1:1이어야 한다(누락 시 침묵 strip).
  transferCause?: "general" | "public_expropriation";
  standardPricePerSqmAtTransfer?: number;
  transferArea?: number;
  compensationPerSqm?: number;
  compensationBasisStdPrice?: number;
  // §164⑨2호 공매·경락 특례 (P4 — 컴패니언 지원, 1호와 대칭)
  isAuctionTransfer?: boolean;
  auctionPrice?: number;
  // §164⑨1호 주택 총액 트랙 (P5 — 컴패니언 주택 지원)
  housingCompensationTotal?: number;
  housingCompensationBasisTotal?: number;
  residencePeriodMonths?: number;
  isUnregistered?: boolean;
  isNonBusinessLand?: boolean;
  isOneHousehold?: boolean;
  /**
   * ⑫ `companionAssetSchema.reductions`(= `z.array(reductionSchema)`)의 파싱 결과 그대로.
   *
   * 🔴 느슨한 `Array<{ type: string; [key: string]: unknown }>`로 두면 안 된다 —
   *    정본 매퍼(`mapReductionsToEngine`)가 요구하는 판별 유니온과 어긋나 캐스팅으로 때우게 되고,
   *    variant별 일자 변환 누락을 컴파일러가 다시 못 잡는다(F14가 그렇게 발생했다).
   */
  reductions?: Array<z.infer<typeof reductionSchema>>;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /**
   * 토지 성질 명시 입력 (assetKind === "land" 전용).
   * Zod companion schema의 landNature enum에서 도출됨.
   * - "appurtenant_to_housing": 주택 부수토지 (§104①2호 괄호·영 §167의5 일체과세 대상)
   * - "non_appurtenant": 독립 나대지
   */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";
  areaM2?: number;
  totalPropertyTransferPrice?: number;
  /**
   * 공유지분율 (0<r≤1) — 필요경비 개산공제(§163⑥) base 축소 전용.
   * ⑫(`companionAssetSchema:ownershipRatio`)·⑬(`buildAssetPayload`)에는 있었는데 ⑭만 빠져 있어
   * 지분 자산의 개산공제가 100% 기준시가로 계산됐다(F39).
   */
  ownershipRatio?: number;
  /**
   * ⑭ 배우자등 이월과세 §97의2 — **⑫(`companionAssetSchema`)의 파싱 결과 그대로**.
   *
   * 🔴 느슨한 인라인 타입으로 다시 적으면 안 된다 — ⑫에 필드가 늘 때 한쪽만 갱신되어
   *    조용히 strip된다(F14가 `reductions`에서 그렇게 발생했다).
   *    일자는 아직 **string**이다(JSON 경유) — 매핑에서 `toDate`로 변환한다.
   */
  carryoverTaxation?: z.infer<typeof companionAssetSchema>["carryoverTaxation"];
}

interface CompanionApportioned {
  assetLabel?: string;
  allocatedSalePrice: number;
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
}

interface CompanionBuildContext {
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
  primaryAcquisitionDate: Date;
  transferDate: Date;
  primaryAcquisitionCause: TransferTaxItemInput["acquisitionCause"];
  primaryEngineInput: {
    householdHousingCount: number;
    isRegulatedArea: boolean;
    wasRegulatedAtAcquisition: boolean;
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
  adjustedAcqPrice?: number;
}

/**
 * companion 자산 1개 → engineInput 1~2개 (한도 초과 split 시 2개) 빌드.
 * 사용자 폼-수준 모드(userModeOverride)와 companion 자체 manualHoldingPeriodOverride를 합성.
 */
export function buildCompanionEngineInputs(
  c: CompanionRawAsset,
  a: CompanionApportioned,
  ctx: CompanionBuildContext,
): TransferTaxItemInput[] {
  const acqPrice = ctx.adjustedAcqPrice ?? a.allocatedAcquisitionPrice;
  const acqDate = c.acquisitionDate ? new Date(c.acquisitionDate) : ctx.primaryAcquisitionDate;
  const decedent =
    c.acquisitionCause === "inheritance" && c.decedentAcquisitionDate
      ? new Date(c.decedentAcquisitionDate)
      : undefined;
  /**
   * ⑭ 증여자 취득일 — `gift`뿐 아니라 **`carryover_gift`에도 싣는다**(D-2).
   *
   * 🔴 종전 게이트는 `"gift"` 하나뿐이라 **쓰이지 않는 경우에만 싣고, 쓰이는 경우에 버렸다** —
   *    `transfer-rate-holding-basis.ts`의 §104②2호 보유기간 소급은 `carryover_gift`에서만
   *    이 값을 읽는다(`gift`는 「증여받은 날」 기산이라 값이 있어도 통산하지 않는다).
   *    ⇒ 컴패니언 이월과세의 단기보유 세율 판정이 영영 발화하지 않았다.
   */
  const donor =
    (c.acquisitionCause === "gift" || c.acquisitionCause === "carryover_gift") &&
    c.donorAcquisitionDate
      ? new Date(c.donorAcquisitionDate)
      : undefined;
  // companion 자체 수동 override 사용 (폼-수준 userModeOverride 제거됨).
  const effectiveOverride = c.manualHoldingPeriodOverride;

  const propertyType: TransferTaxItemInput["propertyType"] =
    c.assetKind === "housing" ? "housing" : c.assetKind === "building" ? "building" : "land";

  /**
   * ⑭ 분리취득 축 — ⑫가 통과시킨 필드를 **그대로** 엔진 모양으로 옮긴다.
   * 일자만 Date로 바꾸고, 나머지는 숫자·enum이라 변환이 없다.
   */
  const splitFields = {
    landAcquisitionDate: toOptionalDate(c.landAcquisitionDate),
    landAcquisitionCause: c.landAcquisitionCause,
    landDecedentAcquisitionDate: toOptionalDate(c.landDecedentAcquisitionDate),
    landDonorAcquisitionDate: toOptionalDate(c.landDonorAcquisitionDate),
    selfOwns: c.selfOwns,
    landAcqMode: c.landAcqMode,
    buildingAcqMode: c.buildingAcqMode,
    isSeparateAcquisition: c.isSeparateAcquisition,
    landAcquisitionPrice: c.landAcquisitionPrice,
    buildingAcquisitionPrice: c.buildingAcquisitionPrice,
    landDirectExpenses: c.landDirectExpenses,
    buildingDirectExpenses: c.buildingDirectExpenses,
    landSalesCaseValue: c.landSalesCaseValue,
    buildingSalesCaseValue: c.buildingSalesCaseValue,
    saleSplitMode: c.saleSplitMode,
    landTransferPrice: c.landTransferPrice,
    buildingTransferPrice: c.buildingTransferPrice,
    landAppraisalAtTransfer: c.landAppraisalAtTransfer,
    buildingAppraisalAtTransfer: c.buildingAppraisalAtTransfer,
    // 🔴 엔진은 **Date**를 요구한다 — string 그대로 두면 감정 유효창
    //    [(양도연도−1)-01-01, 양도연도-12-31] 비교가 침묵 false가 된다.
    appraisalDateAtTransfer: toOptionalDate(c.appraisalDateAtTransfer),
    saleSplitExemption: c.saleSplitExemption,
    landStandardPriceAtTransfer: c.landStandardPriceAtTransfer,
    buildingStandardPriceAtTransfer: c.buildingStandardPriceAtTransfer,
    buildingStandardPriceAtAcquisition: c.buildingStandardPriceAtAcquisition,
  };

  const companionEngine: TransferTaxItemInput = {
    /**
     * ⑭ 토지·건물 **분리취득** 축 (N-6(A), 2026-08-23) — **키를 열거하지 않는다**.
     *
     * 위 `carryoverTaxation`과 같은 규약이다: 열거형은 ⑫·④가 실제로 보내는 필드를 빠뜨려
     * 침묵 strip을 만든다. spread는 키를 세지 않으므로 ⑫에 필드가 늘면 여기 수정 없이 따라간다.
     *
     * ⚠️ 일자 4개는 `toOptionalDate` 필수 — JSON 경유 string이 그대로 도달하면
     *    `calcSplitGain`의 취득일 비교·§104② 기산이 **침묵 오작동**한다.
     * ⚠️ 스프레드를 **맨 앞에** 둔다 — 아래 명시 매핑(`acquisitionDate`·`expenses` 등)이 이긴다.
     */
    ...splitFields,
    propertyType,
    transferPrice: a.allocatedSalePrice,
    totalPropertyTransferPrice: c.totalPropertyTransferPrice,
    transferDate: ctx.transferDate,
    acquisitionPrice: acqPrice,
    acquisitionDate: acqDate,
    assetContractDate: c.assetContractDate ? new Date(c.assetContractDate) : undefined,
    expenses: a.allocatedExpenses,
    capitalExpenditure: c.capitalExpenditure,
    transferExpense: c.transferExpense,
    /**
     * ⑭ 환산취득가 사용 여부 — **원값만 전달**한다(acquisitionCause 재게이트 금지).
     *
     * 🔴 종전 `c.acquisitionCause === "purchase" &&` 게이트는 이월과세 `general` 환산
     *    (§97①1호나목)을 컴패니언에서 통째로 죽였다 — ④가 `topLevelOverrides`로 실은
     *    `useEstimatedAcquisition: true`가 여기서 false로 눌렸다.
     *    단건 경로(`engine-input.ts`)는 원값을 그대로 넘긴다 ⇒ 재게이트가 곧
     *    「단건 ≠ 일괄」 dual-truth였다. 어느 취득원인에 환산이 성립하는지는 엔진이 판정한다.
     */
    useEstimatedAcquisition: c.useEstimatedAcquisition ?? false,
    standardPriceAtAcquisition: c.standardPriceAtAcquisition,
    standardPriceAtTransfer: c.standardPriceAtTransfer,
    // ⑭ 개산공제(§163⑥) base 지분 축소 — 기준시가는 물건 전체 값을 유지하고 개산공제만 지분분이 된다.
    //    단건 `engine-input.ts:218`·겸용 `route.ts:333`과 같은 축(F39).
    ownershipRatio: c.ownershipRatio,
    // 공익수용 §164⑨ 1호 환산 min[] 특례 — 컴패니언 자산 지원(계획 Q5).
    // 엔진이 게이트 판정(적격 자산·환산·수용·2009.02.04·후보>0) — 여기선 원값만 전달.
    // ⚠️ 이 매핑이 없으면 ⑫ Zod를 통과한 값이 엔진에 **도달하지 못한다**(명시 매핑 = 침묵 strip 지점).
    transferCause: c.transferCause,
    standardPricePerSqmAtTransfer: c.standardPricePerSqmAtTransfer,
    transferArea: c.transferArea,
    compensationPerSqm: c.compensationPerSqm,
    compensationBasisStdPrice: c.compensationBasisStdPrice,
    // §164⑨2호 공매·경락 (P4 — 컴패니언). 엔진이 게이트 판정 — 여기선 원값 전달(침묵 strip 방지).
    isAuctionTransfer: c.isAuctionTransfer,
    auctionPrice: c.auctionPrice,
    // §164⑨1호 주택 총액 트랙 (P5 — 컴패니언 주택)
    housingCompensationTotal: c.housingCompensationTotal,
    housingCompensationBasisTotal: c.housingCompensationBasisTotal,
    householdHousingCount: ctx.primaryEngineInput.householdHousingCount,
    /**
     * ⑬ `buildAssetPayload`가 컴패니언 payload에 `residencePeriodMonths`를 **한 번도 싣지 않아**
     * 컴패니언은 항상 거주 0개월이었다(F12) — 「소득세법 시행령」 §159의4 표2 대상 판정
     * (거주 2년 이상)에 영영 진입하지 못했다.
     *
     * 주택 부수토지(`landNature === "appurtenant_to_housing"`)는 §104①2호 괄호·§155⑳ 축에서
     * 주택과 일체로 다뤄지고 `transfer-tax-lthd.ts` L-1b도 「1세대1주택 여부·거주기간을 주택과
     * 공유」를 전제로 짜여 있으므로, 이 경우에만 primary 주택의 거주기간을 상속한다.
     *
     * ⚠️ **별개 주택 컴패니언에는 상속시키지 않는다** — 일괄 상속하면 자기 거주요건을 갖추지 못한
     *    컴패니언 주택이 primary의 거주기간으로 §154① 비과세·표2를 잘못 여는 방향이 된다.
     */
    residencePeriodMonths:
      c.residencePeriodMonths ??
      (c.landNature === "appurtenant_to_housing"
        ? ctx.primaryEngineInput.residencePeriodMonths
        : 0),
    isRegulatedArea: ctx.primaryEngineInput.isRegulatedArea,
    wasRegulatedAtAcquisition: ctx.primaryEngineInput.wasRegulatedAtAcquisition,
    isUnregistered: c.isUnregistered ?? false,
    isNonBusinessLand: c.isNonBusinessLand ?? false,
    isOneHousehold: c.isOneHousehold ?? false,
    acquisitionCause: c.acquisitionCause,
    decedentAcquisitionDate: decedent,
    // ⑭ §154⑧3호 통산 3필드 — 없으면 컴패니언 상속주택의 비과세·표2 대상판정이 열리지 않는다(F13).
    //    ⚠️ 일자는 `toOptionalDate` 필수: JSON 경유 string이 그대로 도달하면
    //       `decedentCohabitationHoldingStartDate < acquisitionDate` 비교가 침묵 false가 된다.
    decedentSameHouseholdBeforeInheritance: c.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationHoldingStartDate: toOptionalDate(c.decedentCohabitationHoldingStartDate),
    decedentCohabitationResidenceMonths: c.decedentCohabitationResidenceMonths,
    donorAcquisitionDate: donor,
    /**
     * ⑭ 배우자등 이월과세 §97의2 — **키를 열거하지 않는다**(spread + 일자만 덮어쓰기).
     *
     * 단건 `engine-input.ts`가 F15에서 같은 형태로 고쳐졌다 — 열거형은 ⑫·④가 실제로
     * 보내던 `donorRelation`·`donorDeceased`를 빠뜨려 침묵 strip했다. spread는 **키를 세지
     * 않으므로 누락이 구조적으로 불가능**하다(⑫에 필드가 늘면 여기 수정 없이 따라간다).
     *
     * ⚠️ 일자 2개는 `toDate` 필수 — JSON 경유 string이 그대로 도달하면
     *    `Date < string` 비교가 **침묵 false**가 된다(`lib/api/date-coerce.ts`).
     * ⚠️ 게이트(`acquisitionCause === "carryover_gift"`)는 엔진이 판정한다
     *    (`transfer-tax.ts` STEP 0.475) — 여기선 원값만 전달한다.
     */
    carryoverTaxation: c.carryoverTaxation
      ? {
          ...c.carryoverTaxation,
          giftRegistryDate: toDate(
            c.carryoverTaxation.giftRegistryDate,
            "companionAssets[].carryoverTaxation.giftRegistryDate",
          ),
          donorAcquisitionDate: toDate(
            c.carryoverTaxation.donorAcquisitionDate,
            "companionAssets[].carryoverTaxation.donorAcquisitionDate",
          ),
        }
      : undefined,
    // ⑭ 감면 일자 변환은 **단건과 같은 정본 매퍼**를 쓴다(`route-reductions-mapper.ts`).
    //    전용 매퍼를 두면 variant가 늘 때마다 한쪽만 갱신되어 「같은 감면인데 자산1과 자산2의
    //    세액이 다르다」가 된다(F14 실측: §77의3 감면율 40%↔25%, §97 임대 전액 소실,
    //    §99의4·§98의9는 `.getTime is not a function` 500).
    reductions: mapReductionsToEngine(c.reductions ?? []),
    propertyId: c.assetId,
    propertyLabel: c.assetLabel ?? "",
    manualHoldingPeriodOverride: effectiveOverride,
    landNature: c.landNature,
    primaryContextForCompanionRate: ctx.primaryCtxForSplit,
    acquisitionArea: c.areaM2,
  };

  // G-2 한도 초과 split (세율 축 — 영 §167의5)
  if (ctx.primaryCtxForSplit) {
    const splitResult = resolveCompanionSplit(
      {
        assetId: c.assetId,
        assetLabel: c.assetLabel ?? "",
        assetKind: c.assetKind,
        areaM2: c.areaM2,
        manualHoldingPeriodOverride: effectiveOverride,
        landNature: c.landNature,
      },
      {
        acquisitionCause: ctx.primaryAcquisitionCause,
        buildingFootprintArea: ctx.primaryEngineInput.buildingFootprintArea,
        isUrbanArea: ctx.primaryEngineInput.isUrbanArea,
        appurtenantLandZone: ctx.primaryEngineInput.appurtenantLandZone,
        holdingMonths: ctx.primaryCtxForSplit.holdingMonths,
        propertyType: ctx.primaryEngineInput.propertyType,
        bundledSaleMode: ctx.bundledSaleMode,
      },
      ctx.transferDate,
    );
    if (splitResult.applied) {
      return splitCompanionIntoTwo(companionEngine, splitResult, ctx.primaryCtxForSplit);
    }
  }

  return [companionEngine];
}

// ─── 한도초과 분리 (영 §167의5) — `bundled-companion-split.ts`로 분리 (800줄 정책) ───
// 재-export: 종전 이 파일에서 import하던 소비자가 깨지지 않게 한다.
export {
  resolveCompanionSplit,
  splitCompanionIntoTwo,
  type CompanionSplitContext,
  type PrimarySplitContext,
  type CompanionSplitNotApplied,
  type CompanionSplitApplied,
  type CompanionSplitResult,
} from "./bundled-companion-split";


// mapCompanionReductions 삭제됨 (2026-08-13, F14):
//   27 variant 중 3개(public_expropriation·replacement_land_comp·self_farming)만 Date 변환하고
//   나머지는 string 그대로 통과시켜 컴패니언에서만 다른 세액이 나왔다.
//   정본은 `route-reductions-mapper.ts`의 `mapReductionsToEngine` 하나다.

// ─── 일괄양도 안분 준비·실행 헬퍼 (route.ts (1)~(4.5) 추출, 800줄 정책) ───
// 상속 보충평가 취득가액 → companion 취득가액 → BundledAssetInput 조립 → 안분 →
// 매매 환산 사후산정까지를 단일 함수로. route는 결과(apportionment·adjustedAcq)만 소비한다.

interface BundledInheritanceValuation {
  inheritanceDate: string;
  assetKind: InheritanceAssetKind;
  landAreaM2?: number;
  publishedValueAtInheritance: number;
}

interface BundledPrimaryInput {
  // 넓은 union 허용 (right_to_move_in 등) — 내부에서 housing/building/land로 매핑
  propertyType: TransferTaxItemInput["propertyType"];
  totalSalePrice?: number;
  standardPriceAtTransferForApportion?: number;
  expenses?: number;
  acquisitionPrice: number;
  /** 지분 모드·actual 모드에서 route가 fixedSalePrice로 주입할 primary 확정 양도가액 */
  primaryActualSalePrice?: number;
  primaryInheritanceValuation?: BundledInheritanceValuation;
}

interface BundledCompanionForApportion {
  assetId: string;
  assetLabel: string;
  assetKind: "housing" | "land" | "building";
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  useEstimatedAcquisition?: boolean;
  /** §97①1호나목 환산 분모(4.5 매매 estimated). 이월과세 general에서는 증여자 축 값이다. */
  standardPriceAtTransfer?: number;
  /**
   * §166⑥ **안분 키** — 사용자가 입력한 자산-수준 「양도시 기준시가」(⑫ 전용 필드).
   * `standardPriceAtTransfer`와 나눠 두지 않으면 이월과세 general 환산 컴패니언에서
   * 안분 키가 증여자 기준시가로 치환된다(D-5·V-10).
   */
  standardPriceAtTransferForApportion?: number;
  standardPriceAtAcquisition?: number;
  directExpenses?: number;
  fixedAcquisitionPrice?: number;
  fixedSalePrice?: number;
  inheritanceValuation?: BundledInheritanceValuation;
}

/**
 * 일괄양도 안분 준비·실행.
 * @param opts.isActualMode §166⑥ 본문 (계약서 구분기재)
 * @param opts.isFullFractionalBundle 완전 지분 모드 (같은 물건 지분 분할) — fixedSalePrice 주입 + 잔액 흡수
 */
export function prepareBundledApportionment(
  primary: BundledPrimaryInput,
  companions: BundledCompanionForApportion[],
  opts: { isActualMode: boolean; isFullFractionalBundle: boolean },
): {
  apportionment: BundledApportionmentResult;
  adjustedAcq: Map<string, { price: number; used: boolean }>;
} {
  const { isActualMode, isFullFractionalBundle } = opts;

  // (1) 주 자산 상속 보충적평가액 (선택)
  let primaryFixedAcq: number | undefined;
  if (primary.primaryInheritanceValuation) {
    const v = primary.primaryInheritanceValuation;
    primaryFixedAcq = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date(v.inheritanceDate),
      assetKind: v.assetKind,
      landAreaM2: v.landAreaM2,
      reportedValue: v.publishedValueAtInheritance,
      reportedMethod: "supplementary",
    }).acquisitionPrice;
  }

  // (2) 컴패니언 자산별 취득가액 (acquisitionCause 분기)
  const companionFixedAcq: (number | undefined)[] = companions.map((c) => {
    if (c.acquisitionCause === "purchase" && c.useEstimatedAcquisition) return undefined;
    if (c.acquisitionCause === "inheritance" && c.inheritanceValuation) {
      const v = c.inheritanceValuation;
      return calculateInheritanceAcquisitionPrice({
        inheritanceDate: new Date(v.inheritanceDate),
        assetKind: v.assetKind,
        landAreaM2: v.landAreaM2,
        reportedValue: v.publishedValueAtInheritance,
        reportedMethod: "supplementary",
      }).acquisitionPrice;
    }
    return c.fixedAcquisitionPrice;
  });

  // (3) BundledAssetInput 배열 구성
  const primaryAssetKind: BundledAssetInput["assetKind"] =
    primary.propertyType === "housing"
      ? "housing"
      : primary.propertyType === "building"
        ? "building"
        : "land";
  const primaryLabel =
    primary.propertyType === "housing"
      ? "주 자산(주택)"
      : primary.propertyType === "land"
        ? "주 자산(토지)"
        : "주 자산";

  const bundleAssets: BundledAssetInput[] = [
    {
      assetId: "primary",
      assetLabel: primaryLabel,
      assetKind: primaryAssetKind,
      standardPriceAtTransfer: primary.standardPriceAtTransferForApportion ?? 0,
      directExpenses: primary.expenses,
      fixedAcquisitionPrice:
        primaryFixedAcq ??
        (primary.acquisitionPrice > 0 ? primary.acquisitionPrice : undefined),
      // actual 모드 또는 완전 지분 모드: 주 자산의 확정 양도가액 주입
      fixedSalePrice:
        isActualMode || isFullFractionalBundle ? primary.primaryActualSalePrice : undefined,
    },
    ...companions.map(
      (c, i): BundledAssetInput => ({
        assetId: c.assetId,
        assetLabel: c.assetLabel,
        assetKind: c.assetKind,
        // §166⑥ 안분 키 — 전용 필드 우선. 구필드 fallback은 전용 키를 모르는 직접 호출자 하위호환
        // (⑩ superRefine의 `apportionKey` 선택식과 **같은 식**이어야 한다 — 단일 기준).
        standardPriceAtTransfer:
          c.standardPriceAtTransferForApportion ?? c.standardPriceAtTransfer ?? 0,
        standardPriceAtAcquisition: c.standardPriceAtAcquisition,
        directExpenses: c.directExpenses,
        fixedAcquisitionPrice: companionFixedAcq[i],
        // actual 모드 또는 완전 지분 모드: 컴패니언의 확정 양도가액 주입
        fixedSalePrice:
          isActualMode || isFullFractionalBundle ? c.fixedSalePrice : undefined,
      }),
    ),
  ];

  // 완전 지분 모드: applyRatio(floor) 절사로 Σfixed < total일 수 있으므로
  // 마지막 자산이 잔액을 흡수해 Σfixed = totalSalePrice 불변식 보장
  // (apportionBundledSale "잔여 양도가액 있으나 안분 대상 없음" throw 회피).
  // 정수 보정(1~2원)일 뿐 안분 방식 선택이 아님 — feedback_floor_residual_absorption.
  if (isFullFractionalBundle && bundleAssets.every((a) => a.fixedSalePrice !== undefined)) {
    const last = bundleAssets.length - 1;
    const sumExceptLast = bundleAssets
      .slice(0, last)
      .reduce((s, a) => s + (a.fixedSalePrice ?? 0), 0);
    bundleAssets[last].fixedSalePrice = primary.totalSalePrice! - sumExceptLast;
  }

  // (4) 안분 실행
  const apportionment = apportionBundledSale({
    totalSalePrice: primary.totalSalePrice!,
    assets: bundleAssets,
  });

  // (4.5) 매매 estimated 컴패니언: 안분된 양도가액으로 환산취득가 사후 산정
  const adjustedAcq = new Map<string, { price: number; used: boolean }>();
  companions.forEach((c) => {
    if (
      c.acquisitionCause === "purchase" &&
      c.useEstimatedAcquisition &&
      c.standardPriceAtAcquisition &&
      c.standardPriceAtTransfer
    ) {
      const alloc = apportionment.apportioned.find((a) => a.assetId === c.assetId);
      if (!alloc) return;
      const price = calculateEstimatedAcquisitionPrice(
        alloc.allocatedSalePrice,
        c.standardPriceAtAcquisition,
        c.standardPriceAtTransfer,
      );
      adjustedAcq.set(c.assetId, { price, used: true });
    }
  });

  // usedEstimatedAcquisition 플래그 전파 (결과 표시용)
  apportionment.apportioned.forEach((a) => {
    const adj = adjustedAcq.get(a.assetId);
    if (adj?.used) a.usedEstimatedAcquisition = true;
  });

  return { apportionment, adjustedAcq };
}
