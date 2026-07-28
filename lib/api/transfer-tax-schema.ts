/**
 * 양도소득세 Zod 입력 스키마 (단건·다건 공유)
 *
 * propertySchema  — 단건 route에서 inputSchema로 재export
 * multiInputSchema — 다건 route 전용 (properties[] + 공통 필드)
 *
 * 서브스키마는 ./transfer-tax-schema-sub.ts 로 분리 (800줄 정책).
 */

import { z } from "zod";
import {
  temporaryTwoHouseSchema,
  replacementHouseSchema,
  nonBusinessLandRawSchema,
  rentalReductionDetailsSchema,
  newHousingDetailsSchema,
  pre1990LandSchema,
  houseSchema,
  presaleRightSchema,
  reductionSchema,
  filingPenaltyDetailsSchema,
  delayedPaymentDetailsSchema,
  amendmentSchema,
  inheritanceValuationSchema,
  inheritedAcquisitionSchema,
  inheritanceHouseValuationSchema,
  companionAssetSchema,
  parcelSchema,
  preHousingDisclosureSchema,
  mixedUseAssetSchema,
  addPropertyRefines,
} from "./transfer-tax-schema-sub";
import { burdenedGiftInfoSchema } from "./transfer-tax-burdened-gift-schema";
import { redevelopmentSchema } from "./transfer-tax-redevelopment-schema";
import {
  generalBuildingValuationSchema,
  commercialBuildingValuationSchema,
  commercialInheritanceValuationSchema,
} from "./transfer-tax-building-schemas";
export {
  generalBuildingValuationSchema,
  commercialBuildingValuationSchema,
} from "./transfer-tax-building-schemas";
export type { GeneralBuildingValuationSchemaInput } from "./transfer-tax-building-schemas";

// ─── ⑫ 상업용건물·일반건물 환산취득가 Zod 스키마 → sibling 파일 분리 ──────
// 정의는 `./transfer-tax-building-schemas.ts` 참조.
// 본 파일은 import만 + barrel re-export (위 import 블록 참조).

// ─── ⑨ 장기임대주택 거주주택 비과세 특례 Zod enum (소령 §155⑳) ──────

/** 시나리오: A=거주주택 양도, B=임대주택→거주주택 전환 후 양도(PHRP) */
export const RentalScenarioEnum = z.enum(['A', 'B']);

/** 임대구분: 장기일반·단기6년·구 임대주택법·기존사업자(나목)·미분양(라목) (의무기간·cap은 등록기준일·취득방법에서 파생) */
export const RentalCategoryEnum = z.enum(['long_general', 'short_6y', 'pre_2018', 'existing_business', 'unsold_08_09']);

/** 취득 방법: 매입·건설 */
export const RentalAcqTypeEnum = z.enum(['purchase', 'construction']);

/** 소재지역: 수도권·비수도권 (918 조정취득은 isExcluded918Rule 별도 축) */
export const RentalRegionEnum = z.enum(['seoul-metro', 'non-metro']);

/** ⑫ 임대주택 1호 Zod 객체 스키마 (미정의 시 침묵 stripping 방지) */
export const rentalUnitSchema = z.object({
  businessRegistrationDate: z.string().datetime(),
  rentalRegistrationDate: z.string().datetime(),
  rentalCategory: RentalCategoryEnum,
  rentalAcquisitionType: RentalAcqTypeEnum,
  isApartment: z.boolean(),
  region: RentalRegionEnum,
  isExcluded918Rule: z.boolean(),
  hasContractDepositProof: z.boolean(),
  isExcludedShortToLongChange: z.boolean(),
  standardPriceAtRentalStart: z.number().int().nonnegative(),
  acquisitionOfficialPrice: z.number().int().nonnegative(),
  isNationalSizeHousing: z.boolean(),
  landAreaM2: z.number().nonnegative().optional(),
  totalFloorAreaM2: z.number().nonnegative().optional(),
  hasMinimum2Units: z.boolean(),
  hasMinimum5UnitsInCity: z.boolean(),
  firstSaleContractDate: z.string().datetime().optional(),
  rentalMonths: z.number().nonnegative(),
  rentalAutoTermination: z.boolean(),
  requirementsConfirmed: z.boolean(),
});

/** ⑫ 장기임대주택 거주주택 비과세 특례 Zod 스키마 (미정의 시 침묵 stripping 방지) */
export const rentalHousingExceptionSchema = z.object({
  applyException: z.boolean(),
  scenario: RentalScenarioEnum,
  rentalUnits: z.array(rentalUnitSchema).min(1),
  priorResidenceTransferDate: z.string().datetime().optional(),
  standardPriceAtAcquisitionForPhrp: z.number().int().nonnegative().optional(),
  standardPriceAtPriorTransfer: z.number().int().nonnegative().optional(),
  standardPriceAtTransferForPhrp: z.number().int().nonnegative().optional(),
});

// ─── 단건 기본 필드 객체 (단건·다건 공유) ───────────────────────

const propertyBaseShape = {
  propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right", "mixed-use-house", "commercial_building", "general_building", "redevelopment_apt"]),
  transferPrice: z.number().int().positive(),
  transferDate: z.string().date(),
  acquisitionPrice: z.number().int().nonnegative(),
  /**
   * 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정).
   * primary 자산이 동일 물건의 한 지분 단계취득인 경우. transferPrice는 이미 × ratio 적용됨.
   */
  totalPropertyTransferPrice: z.number().int().positive().optional(),
  acquisitionDate: z.string().date(),
  // Round 9 (2026-05-06): 자산-수준 매매계약일 (§99·§99의3·§98 시리즈·§97의2·§97의5·§99의2 시한 판정용)
  assetContractDate: z.string().date().optional(),
  /**
   * 취득 원인. "newConstruction" = 자가건축 주택 (영 §162①4호 — 사용승인일 등 기준 취득일).
   * UI에서 사용승인일 helper-text 노출 트리거로도 사용.
   * @deprecated `"burdened_gift"`는 Phase 2(2026-05-12) 이후 deprecation — `transferType: "burdened_gift"` 사용 권장.
   * 레거시 데이터 호환 위해 enum에 유지. 신규 코드는 transferType 분기 사용.
   */
  acquisitionCause: z.enum(["purchase", "inheritance", "gift", "carryover_gift", "newConstruction", "burdened_gift"]).optional(),
  /**
   * 양도 형태 (양도자 관점) — Phase 2(2026-05-12) 신규.
   * "regular": 일반 양도 (매매·교환 등)
   * "burdened_gift": 부담부증여 (소령 §159 — 채무 인수분을 유상 양도로 의제)
   * 부담부증여는 취득 사건이 아니라 양도 사건이므로 acquisitionCause와 별도 차원.
   */
  transferType: z.enum(["regular", "burdened_gift"]).optional(),
  decedentAcquisitionDate: z.string().date().optional(),
  decedentSameHouseholdBeforeInheritance: z.boolean().optional(),
  decedentCohabitationHoldingStartDate: z.string().date().optional(),
  decedentCohabitationResidenceMonths: z.number().int().nonnegative().optional(),
  donorAcquisitionDate: z.string().date().optional(),
  expenses: z.number().int().nonnegative(),
  /** §97① 가목 자본적 지출 — §97② 단서 swap 분리 입력용 (선택). 미명시 시 swap 비활성, expenses fallback */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  /** §97① 나목 양도비 — §97② 단서 swap 분리 입력용 (선택) */
  transferExpense: z.number().int().nonnegative().optional(),
  useEstimatedAcquisition: z.boolean(),
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  standardPriceAtTransfer: z.number().int().positive().optional(),
  // ⑫ 공익수용 양도당시 기준시가 차감 특례 (소득세법 시행령 §164⑨ 1호) — 엔진이 게이트, strip 방지
  transferCause: z.enum(["general", "public_expropriation"]).optional(),
  standardPricePerSqmAtTransfer: z.number().int().nonnegative().optional(),
  transferArea: z.number().positive().optional(),
  compensationPerSqm: z.number().int().nonnegative().optional(),
  compensationBasisStdPrice: z.number().int().nonnegative().optional(),
  // ⑫ §164⑨2호 공매·경락 특례 (P4) — 엔진이 게이트, strip 방지
  isAuctionTransfer: z.boolean().optional(),
  auctionPrice: z.number().int().nonnegative().optional(),
  // ⑫ §164⑨1호 주택 총액 트랙 (P5) — 엔진이 게이트, strip 방지
  housingCompensationTotal: z.number().int().nonnegative().optional(),
  housingCompensationBasisTotal: z.number().int().nonnegative().optional(),
  // ⑫ §164⑨1호 건물 split 토지분 트랙 (P6/D6) — 엔진이 게이트, strip 방지
  splitLandCompensationTotal: z.number().int().nonnegative().optional(),
  splitLandCompensationBasisTotal: z.number().int().nonnegative().optional(),
  householdHousingCount: z.number().int().min(0),
  // 사례 36 §89①4호 가목 1세대1입주권 비과세 — 세대 조합원입주권 보유 수 (양도일 현재).
  // optional: right_to_move_in 이외 자산 유형에서는 미전달 → 엔진 fallback householdRightCount ?? 0.
  householdRightCount: z.number().int().nonnegative().optional(),
  residencePeriodMonths: z.number().int().nonnegative(),
  isRegulatedArea: z.boolean(),
  wasRegulatedAtAcquisition: z.boolean(),
  /** ⑫ 법정동코드 10자리 — 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정, 미제공 시 isRegulatedArea boolean fallback */
  regionCode: z.string().length(10).optional(),
  isUnregistered: z.boolean(),
  isNonBusinessLand: z.boolean(),
  isSuccessorRightToMoveIn: z.boolean().optional(),
  isOneHousehold: z.boolean(),
  temporaryTwoHouse: temporaryTwoHouseSchema.optional(),
  // ⑨⑩⑫ §156의2⑤ 대체주택 비과세 특례
  replacementHouse: replacementHouseSchema.optional(),
  reductions: z.array(reductionSchema).default([]),
  nonBusinessLandRaw: nonBusinessLandRawSchema.optional(),
  houses: z.array(houseSchema).optional(),
  presaleRights: z.array(presaleRightSchema).optional(),
  sellingHouseId: z.string().optional(),
  marriageMerge: z.object({ marriageDate: z.string().date() }).optional(),
  isFirstTransferredInMerge: z.boolean().optional(),
  generalHouseGiftedFromDecedentWithin2yr: z.boolean().optional(),
  parentalCareMerge: z.object({ mergeDate: z.string().date() }).optional(),
  // ⑨⑩⑫ §154① 단서 — 비과세 보유·거주 요건 면제 사유 (propertyBaseShape 공유 → 단건·다건 동시)
  oneHouseExemptionProviso: z
    .object({
      reason: z.enum([
        "rental_5yr_residence",
        "expropriation",
        "overseas_migration",
        "overseas_residence",
        "unavoidable",
        "pre_designation_contract",
      ]),
      departureDate: z.string().date().optional(),
      expropriationDate: z.string().date().optional(),
      businessApprovalDate: z.string().date().optional(),
    })
    .optional(),
  // 다주택 중과 한시 유예 조건부 판정 — §167의3①12의2 가·나·다목(§167의10①12의2 미러).
  // 나목(isLandPermitTarget=true): 허가신청·허가·계약금 4요건. 다목(false): 계약·계약금 2요건.
  gracePeriod: z
    .object({
      contractDate: z.string().date(),
      isLandPermitTarget: z.boolean().optional(),
      permitApplicationDate: z.string().date().optional(),
      permitGranted: z.boolean().optional(),
      depositReceiptConfirmed: z.boolean().optional(),
      // @deprecated — 확정 시행령 나·다목 원문에 근거 없음(G3)·regionCode 명단 판정 대체(G6). 판정 미사용, 하위호환만.
      isLandPermitArea: z.boolean().optional(),
      hasTenantInResidence: z.boolean().optional(),
      areaDesignatedDate: z.string().date().optional(),
    })
    .optional(),
  rentalReductionDetails: rentalReductionDetailsSchema.optional(),
  newHousingDetails: newHousingDetailsSchema.optional(),
  acquisitionMethod: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  appraisalValue: z.number().int().nonnegative().optional(),
  // ⑫ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달
  similarSalesValue: z.number().int().nonnegative().optional(),
  isSelfBuilt: z.boolean().optional(),
  buildingType: z.enum(["new", "extension"]).optional(),
  constructionDate: z.string().date().optional(),
  extensionFloorArea: z.number().nonnegative().optional(),
  // ⑫ Phase 2 증축 — 증축부분 취득시 기준시가 총액(원). §114조의2① 증축부분 환산취득가 분자.
  extensionStdPriceAtAcquisition: z.number().nonnegative().optional(),
  pre1990Land: pre1990LandSchema.optional(),
  parcels: z.array(parcelSchema).max(10).optional(),

  // ─── 토지/건물 취득일 분리 (소득령 §166⑥·§168②) ────────────────
  /** 토지 취득일 (건물 acquisitionDate와 다를 때) */
  landAcquisitionDate: z.string().date().optional(),
  /** 분리 입력 방식 (@deprecated — landAcqMode/buildingAcqMode + saleSplitMode로 대체. 하위호환용 유지, 엔진 미소비) */
  landSplitMode: z.enum(["apportioned", "actual"]).optional(),
  /**
   * 토지 파트 취득 방식 — 4-way 독립(소득령 §166⑥). ⑫ 침묵 stripping 방지 — 명시 선언 필수.
   */
  landAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  /** 건물 파트 취득 방식 — landAcqMode와 독립 */
  buildingAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  /**
   * 별개 취득(토지·건물 취득시점 상이) — 취득가액 축 파트별 완결 게이트. ⑫ 침묵 stripping 방지.
   * 클라이언트가 `isSeparateAcquisition()`(lib/calc/transfer-tax-split-acq-mode.ts)으로 파생해 전송.
   */
  isSeparateAcquisition: z.boolean().optional(),
  /**
   * 양도가액 결정 방식 — 자산 내 토지·건물 분리 축(엔진 명시 입력, §9 M2).
   * "apportioned"(양도시 기준시가 비율 안분, 기본) | "actual"(구분양도 직접입력).
   */
  saleSplitMode: z.enum(["apportioned", "actual"]).optional(),
  /** 토지 파트 매매사례가액(추계, §176의2③1호) — landAcqMode==="salesCase" 시 직접입력 */
  landSalesCaseValue: z.number().int().nonnegative().optional(),
  /** 건물 파트 매매사례가액 — buildingAcqMode==="salesCase" 시 직접입력 */
  buildingSalesCaseValue: z.number().int().nonnegative().optional(),
  /** 토지 양도가액 (원) */
  landTransferPrice: z.number().int().positive().optional(),
  /** 건물 양도가액 (원) */
  buildingTransferPrice: z.number().int().positive().optional(),
  /** 토지 취득가액 (원) */
  landAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 건물 취득가액 (원) */
  buildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 토지 자본적지출·필요경비 (원) */
  landDirectExpenses: z.number().int().nonnegative().optional(),
  /** 건물 자본적지출·필요경비 (원) */
  buildingDirectExpenses: z.number().int().nonnegative().optional(),
  /** 토지 양도시 기준시가 — 환산취득가 분리 계산용 */
  landStandardPriceAtTransfer: z.number().int().positive().optional(),
  /** 건물 양도시 기준시가 — 환산취득가 분리 계산용 */
  buildingStandardPriceAtTransfer: z.number().int().positive().optional(),
  /** 취득시 토지 단위 기준시가 (원/㎡) — 안분 비율 산출용 */
  standardPricePerSqmAtAcquisition: z.number().positive().optional(),
  /** 취득 면적 (㎡) — 토지 기준시가 = standardPricePerSqmAtAcquisition × acquisitionArea */
  acquisitionArea: z.number().positive().optional(),

  // ─── 사례 28 — 신축주택 취득일 3-시점 + 부수토지 한도 산정 (영 §162①4호, 영 §154⑦) ────────────────
  /**
   * 사용승인일 (YYYY-MM-DD) — 영 §162①4호 자가건축 주택 취득일 기준.
   * acquisitionCause === "newConstruction" 시 사용.
   * ⑫ TypeScript 미감지 — 미정의 시 침묵 stripping 발생하므로 명시적 선언 필수.
   */
  occupancyApprovalDate: z.string().date().optional(),
  /**
   * 사용검사필증 교부일 (YYYY-MM-DD) — 도시계획법·건축법 용어 차이로 별도 입력 (영 §162①4호).
   * 사용승인일과 동일하면 미입력. 별도 시점인 경우만 입력. G-5 추가.
   * ⑫ TypeScript 미감지 — 미정의 시 침묵 stripping 발생하므로 명시적 선언 필수.
   */
  approvalCertificateDate: z.string().date().optional(),
  /**
   * 임시사용승인일 (YYYY-MM-DD) — 사용승인일보다 이른 경우에만 입력 (영 §162①4호).
   */
  temporaryApprovalDate: z.string().date().optional(),
  /**
   * 사실상 사용일 (YYYY-MM-DD) — 사용승인 전 실제 입주·사용일 (영 §162①4호).
   */
  actualUseDate: z.string().date().optional(),
  /**
   * 건물 정착면적 (㎡) — 부수토지 인정 한도 산정용 (영 §154⑦).
   * 도시지역: × 5배, 도시지역 외: × 10배.
   * ⑫ TypeScript 미감지 — 미정의 시 침묵 stripping 발생하므로 명시적 선언 필수.
   */
  buildingFootprintArea: z.number().positive().optional(),
  /**
   * 도시지역 여부 — 부수토지 배율 결정 (영 §154⑦).
   * true: 도시지역(5배 한도), false: 도시지역 외(10배 한도).
   */
  isUrbanArea: z.boolean().optional(),
  /**
   * ⑨⑫ 사례 28 — 부수토지 인정 한도 zone (영 §154⑦, 2022년 개정 후)
   * - "metropolitan_residential": 수도권 도시지역 주거·상업·공업 → 3배
   * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
   * - "non_urban": 도시지역 외 → 10배
   */
  appurtenantLandZone: z
    .enum(["metropolitan_residential", "non_metropolitan_or_green", "non_urban"])
    .optional(),
  /**
   * ⑨⑫ 토지 성질 명시 입력 (propertyType === "land" 자산).
   * 사용자가 자산 카드에서 선언. 부수토지 판정은 사실 관계 기반.
   * - "appurtenant_to_housing": 주택 부수토지 (§89①3호·영§154⑦ 일체과세 대상)
   * - "non_appurtenant": 독립 나대지 (토지 본래 세율 적용)
   */
  landNature: z
    .enum(["appurtenant_to_housing", "non_appurtenant"])
    .optional(),

  // ─── 일괄양도 안분 (소득세법 시행령 §166 ⑥) ────────────────
  /** 함께 양도된 자산들 (2개 이상 일괄 양도 시). 없거나 빈 배열이면 단건으로 처리. */
  companionAssets: z.array(companionAssetSchema).max(10).optional(),
  // appurtenantLandRateMode 제거됨 (2026-05-07): 자산별 landNature 명시 입력으로 대체.
  /** 매매계약 상 총 양도가액 (일괄양도 시 필수). 없으면 transferPrice가 총액으로 간주. */
  totalSalePrice: z.number().int().positive().optional(),
  /** 안분 방식 (v1은 standard_price_transfer만 지원) */
  apportionmentMethod: z.literal("standard_price_transfer").optional(),
  /** 주 자산의 양도시점 기준시가 — 일괄양도 안분 키 (apportioned 모드 시 필수) */
  standardPriceAtTransferForApportion: z.number().int().positive().optional(),
  /** 주 자산이 상속 보충적평가액 산정 대상인 경우 */
  primaryInheritanceValuation: inheritanceValuationSchema.optional(),
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서, 기본값)
   */
  bundledSaleMode: z.enum(["actual", "apportioned"]).default("apportioned"),
  /** actual 모드 시 주 자산의 계약서상 양도가액 (원) */
  primaryActualSalePrice: z.number().int().positive().optional(),
  /** 개별주택가격 미공시 취득 시 3-시점 환산취득가 계산 입력 (§164⑤) */
  preHousingDisclosure: preHousingDisclosureSchema.optional(),
  /** 배우자등 이월과세 (§97조의2) — acquisitionCause === "carryover_gift" 시 필수 */
  carryoverTaxation: z.object({
    giftRegistryDate: z.string().date(),
    donorAcquisitionDate: z.string().date(),
    donorAcquisitionPrice: z.number().int().nonnegative().optional(),
    useEstimatedAcquisition: z.boolean(),
    giftTaxAmount: z.number().int().nonnegative(),
    donorCapitalExpenditure: z.number().int().nonnegative().optional(),
    giftDateValuation: z.number().int().nonnegative(),
    exclusionDeclared: z.object({
      expropriationWithin2Years: z.boolean().optional(),
      oneHouseExemptionApplies: z.boolean().optional(),
      isFamilyBusinessInheritedAsset: z.boolean().optional(),
    }).optional(),
  }).optional(),
  /** 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨) — 의제취득일 전/후 분기 */
  inheritedAcquisition: inheritedAcquisitionSchema.optional(),
  /** 상속 주택 환산취득가 보조 입력 — 주택 + 상속개시일 < 2005-04-30 시 3-시점 합계 기준시가 자동 산출 */
  inheritedHouseValuation: inheritanceHouseValuationSchema.optional(),
  /** ⑫ 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 — 상가 + 상속개시일 < 2005-01-01 시 §163⑨2호 max */
  commercialInheritanceValuation: commercialInheritanceValuationSchema.optional(),
  /** 겸용주택(1세대 1주택 + 상가) 분리계산 입력 — propertyType === "mixed-use-house" 시 필수 */
  mixedUse: mixedUseAssetSchema.optional(),
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   * "building_only"/"land_only" 사용 시 landAcquisitionDate 필수.
   */
  selfOwns: z.enum(["both", "building_only", "land_only"]).optional(),
  // buildingFootprintArea / isUrbanArea 는 위 사례 28 블록(신축주택·부수토지)에 선언됨 — 중복 금지
  /** ⑫ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 미정의 시 침묵 stripping 방지 */
  rentalHousingException: rentalHousingExceptionSchema.optional(),
  /**
   * ⑫ 상업용건물·오피스텔 환산취득가 계산 입력 (소령 §164⑥, §176조의2②2호).
   * propertyType === "building" + 환산 모드 시 제공. 미정의 시 침묵 stripping 방지를 위해 명시 필수.
   */
  commercialBuildingValuation: commercialBuildingValuationSchema.optional(),
  /**
   * ⑫ 일반건물(토지+건물 일괄) 환산취득가 계산 입력 (소령 §176의2②, §163⑥).
   * propertyType === "general_building" + 환산 모드 시 제공. 미정의 시 침묵 stripping 방지를 위해 명시 필수.
   */
  generalBuildingValuation: generalBuildingValuationSchema.optional(),
  /**
   * ⑫ 부담부증여 입력 (소령 §159) — sibling 파일 정의.
   * acquisitionCause === "burdened_gift" 일 때 필수. 미정의 시 침묵 stripping 방지를 위해 명시 필수.
   * Phase 1 가드: propertyType === "general_building" 한정 (engine assert).
   */
  burdenedGiftInfo: burdenedGiftInfoSchema.optional(),
  /**
   * ⑫ 가업상속공제 §97의2④ 의제 취득가액 입력 (소령 §163의2③).
   * familyBusinessInheritance 미제공 시 일반 §97 산식 그대로 적용.
   * ★★★ 침묵 stripping 차단: Zod 객체 정의 없으면 route handler에서 자동 제거됨.
   */
  familyBusinessInheritance: z.object({
    decedentAcquisitionPrice: z.number().int().nonnegative(),
    inheritanceMarketValue: z.number().int().nonnegative(),
    fbDeductionAppliedRate: z.number().min(0).max(1),
    inheritanceDate: z.string().date(),
    decedentCapitalExpenditure: z.number().int().nonnegative().optional(),
    heirCapitalExpenditure: z.number().int().nonnegative().optional(),
  }).optional(),
  /**
   * ⑫ 재개발/재건축 입력 (시행령 §166 본문) — sibling 파일 분리(800줄 정책).
   * propertyType === "redevelopment_apt" 또는 "right_to_move_in" 시 제공.
   * 미정의 시 침묵 stripping 방지를 위해 명시 필수.
   */
  redevelopment: redevelopmentSchema,
  // ⑩ 사례 38/39 — 단독주택 출자 §164⑤ PHD 2-point 환산취득가 Zod refine은
  // addPropertyRefines (transfer-tax-schema-refines.ts)에 추가됨 — route.ts superRefine 내부 호출
};

// ─── 단건 스키마 (기존 inputSchema와 동일) ─────────────────────

// P5 모드 2 (2026-06-12) — 보유 감면주택 주택수 제외 (§89①3호 의제, 7개 조문 ②·§98 령②·§99②)
const specialHouseExclusionSchema = z.array(
  z.object({
    article: z.enum([
      "unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6",
      "unsold_98_7", "unsold_98_8", "unsold_99_2", "new_99",
    ]),
    houseAcquisitionDate: z.string().date().optional(),
    houseContractDate: z.string().date().optional(),
    requirementsConfirmed: z.boolean().default(false),
  }),
).default([]);

const priorReductionUsageSchema = z.array(
  z.object({
    year: z.number().int().min(1990).max(new Date().getFullYear()),
    // Phase 1 (2026-05-06): 23개 조문 ID + legacy 5개 (long_term_rental/new_housing/unsold_housing은 마이그레이션 후 deprecated 예정)
    type: z.enum([
      // legacy (마이그레이션 후 deprecated)
      "self_farming", "long_term_rental", "new_housing", "unsold_housing", "public_expropriation",
      // 장기임대 §97 시리즈 신규
      "rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_3", "rental_97_4", "rental_97_5",
      // 신축 §99 시리즈 신규
      "new_99", "new_99_3", "new_99_4_rural", "new_99_4_hometown",
      // 미분양 §98 시리즈 + §99의2 신규
      "unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_4", "unsold_98_5",
      "unsold_98_6", "unsold_98_7", "unsold_98_8", "unsold_98_9", "unsold_99_2",
    ]),
    amount: z.number().int().nonnegative(),
  }),
).default([]);

export const propertySchema = z
  .object({
    ...propertyBaseShape,
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    specialHouseExclusions: specialHouseExclusionSchema,
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
    amendment: amendmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    addPropertyRefines(data, ctx);

    // 수정신고 ↔ 무신고/과소신고 가산세 상호배타 (동시 전송 금지)
    if (data.amendment && (data.filingPenaltyDetails || data.delayedPaymentDetails)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amendment"],
        message: "수정신고와 무신고/과소신고 가산세는 동시에 적용할 수 없습니다",
      });
    }

    // 소유자 분리 유효성 (소령 §166⑥, §168②)
    if (data.selfOwns && data.selfOwns !== "both") {
      if (!data.landAcquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["landAcquisitionDate"],
          message: "토지·건물 소유자가 다른 경우 토지 취득일을 입력해 주세요",
        });
      }
      if (data.propertyType !== "housing" && data.propertyType !== "building") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selfOwns"],
          message: "소유자 분리는 주택(housing) 또는 건물(building) 자산에만 적용됩니다",
        });
      }
    }

    // 일괄양도 유효성 (소득세법 시행령 §166 ⑥)
    const companions = data.companionAssets ?? [];
    if (companions.length > 0) {
      // 총 양도가액 필수
      if (data.totalSalePrice === undefined || data.totalSalePrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalSalePrice"],
          message: "일괄양도 시 총 양도가액(totalSalePrice)이 필수입니다",
        });
      }

      // ── 양도가액 모드 단일 결정 검증 (계약서 단위) ──
      // 지분 모드(totalPropertyTransferPrice 설정) 자산은 양도가액이 자동 계산되므로 검증 면제.
      const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
      const anyFractional =
        primaryIsFractional ||
        companions.some((c) => c.totalPropertyTransferPrice !== undefined);

      if (data.bundledSaleMode === "actual") {
        // 주 자산 actual 가액 필수 (단, 지분 모드면 자동 계산되므로 면제)
        if (!primaryIsFractional && (!data.primaryActualSalePrice || data.primaryActualSalePrice <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["primaryActualSalePrice"],
            message: "actual 모드: 주 자산의 계약서상 양도가액 필수",
          });
        }
        // 컴패니언도 자산별 지분 모드면 면제
        for (let i = 0; i < companions.length; i++) {
          const c = companions[i];
          const isFractionalCompanion = c.totalPropertyTransferPrice !== undefined;
          if (!isFractionalCompanion && (!c.fixedSalePrice || c.fixedSalePrice! <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedSalePrice"],
              message: "actual 모드: 모든 자산의 계약서상 양도가액 필수",
            });
          }
        }
        // 합계 = totalSalePrice 검증 — 지분 모드 자산이 하나라도 있으면 ratio 합산 검증으로 대체되므로 생략
        if (!anyFractional && data.totalSalePrice && data.primaryActualSalePrice) {
          const sumFixed =
            data.primaryActualSalePrice +
            companions.reduce((s, c) => s + (c.fixedSalePrice ?? 0), 0);
          if (sumFixed !== data.totalSalePrice) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["primaryActualSalePrice"],
              message: `구분 기재된 양도가액 합(${sumFixed.toLocaleString()})이 총 양도가액(${data.totalSalePrice.toLocaleString()})과 일치하지 않습니다`,
            });
          }
        }
      } else {
        // apportioned: 주 자산 양도시점 기준시가 필수 (안분 키)
        // 단, primary가 지분 모드(totalPropertyTransferPrice 설정됨)이면 ratio×total로 자동 결정 → 면제
        if (
          !primaryIsFractional &&
          (data.standardPriceAtTransferForApportion === undefined ||
            data.standardPriceAtTransferForApportion <= 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["standardPriceAtTransferForApportion"],
            message: "apportioned 모드: 주 자산의 양도시점 기준시가 필수",
          });
        }
        // 컴패니언도 지분 모드(totalPropertyTransferPrice 설정됨)면 standardPriceAtTransfer 면제
        for (let i = 0; i < companions.length; i++) {
          const c = companions[i];
          const isFractionalCompanion = c.totalPropertyTransferPrice !== undefined;
          if (!isFractionalCompanion && (!c.standardPriceAtTransfer || c.standardPriceAtTransfer! <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "standardPriceAtTransfer"],
              message: "apportioned 모드: 양도시 기준시가 필수",
            });
          }
        }
      }

      // ── 컴패니언별 acquisitionCause 검증 ──
      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        if (c.acquisitionCause === "purchase") {
          if (c.useEstimatedAcquisition) {
            if (!c.standardPriceAtAcquisition || c.standardPriceAtAcquisition <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "standardPriceAtAcquisition"],
                message: "매매(환산) 시 취득시 기준시가 필수",
              });
            }
            if (!c.standardPriceAtTransfer || c.standardPriceAtTransfer <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "standardPriceAtTransfer"],
                message: "매매(환산) 시 양도시 기준시가 필수",
              });
            }
          } else {
            if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "fixedAcquisitionPrice"],
                message: "매매(실가) 시 취득가액 필수",
              });
            }
          }
          if (!c.acquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "acquisitionDate"],
              message: "매매 자산은 취득일 필수",
            });
          }
        } else if (c.acquisitionCause === "gift") {
          if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedAcquisitionPrice"],
              message: "증여 자산은 신고가액(취득가액) 필수",
            });
          }
          if (!c.donorAcquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "donorAcquisitionDate"],
              message: "증여 자산은 증여자 취득일 필수",
            });
          }
          if (!c.acquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "acquisitionDate"],
              message: "증여 자산은 증여일 필수",
            });
          }
        } else if (c.acquisitionCause === "inheritance") {
          // P2c: 상속 취득가액은 inheritanceValuation(신고가액) 경로로 항상 전송 (manual/fixedAcquisitionPrice 폐기).
          if (!c.decedentAcquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "decedentAcquisitionDate"],
              message: "상속 자산은 피상속인 취득일 필수",
            });
          }
        }
      }

      // assetId 중복 금지
      const ids = companions.map((a) => a.assetId);
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === "primary") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `"primary"는 주 자산 예약 식별자입니다`,
          });
        }
        if (seen.has(ids[i])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `assetId "${ids[i]}"가 중복됩니다`,
          });
        }
        seen.add(ids[i]);
      }
      // inheritanceValuation 사용 시 landAreaM2 일관성
      for (let i = 0; i < companions.length; i++) {
        const v = companions[i].inheritanceValuation;
        if (v?.assetKind === "land" && (!v.landAreaM2 || v.landAreaM2 <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "inheritanceValuation", "landAreaM2"],
            message: "토지 상속평가액 산정 시 면적(㎡)이 필수입니다",
          });
        }
      }
    }
  });

// ─── 다건 개별 자산 스키마 (propertyId·propertyLabel 추가) ──────

export const propertyItemSchema = z
  .object({
    propertyId: z.string().min(1),
    propertyLabel: z.string().min(1),
    ...propertyBaseShape,
    // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => addPropertyRefines(data, ctx));

// ─── 다건 입력 스키마 ────────────────────────────────────────────

export const multiInputSchema = z
  .object({
    taxYear: z.number().int().min(2000).max(2100),
    properties: z.array(propertyItemSchema).min(1).max(20),
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    specialHouseExclusions: specialHouseExclusionSchema,
    basicDeductionAllocation: z
      .enum(["MAX_BENEFIT", "FIRST", "EARLIEST_TRANSFER"])
      .default("MAX_BENEFIT"),
    // 확정신고 기납부세액 정산 (§111③) — filing-level. 음수 차단.
    priorPaidTax: z.number().int().nonnegative().default(0),
    priorPaidLocalTax: z.number().int().nonnegative().default(0),
    // 가산세는 자산별로 입력 (propertyItemSchema.filingPenaltyDetails / delayedPaymentDetails).
    // [B4] 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2) — 단건 amendmentSchema 재사용.
    amendment: amendmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // taxYear 일관성 — 모든 양도일이 taxYear 내에 있어야 함
    for (let i = 0; i < data.properties.length; i++) {
      const year = new Date(data.properties[i].transferDate).getFullYear();
      if (year !== data.taxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "transferDate"],
          message: `양도일(${data.properties[i].transferDate})이 과세연도(${data.taxYear})와 다릅니다`,
        });
      }
    }
    // propertyId 중복 금지
    const ids = data.properties.map((p) => p.propertyId);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      if (seen.has(ids[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "propertyId"],
          message: `propertyId "${ids[i]}"가 중복됩니다`,
        });
      }
      seen.add(ids[i]);
    }
    // annualBasicDeductionUsed 한도 검증
    if (data.annualBasicDeductionUsed > 2_500_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualBasicDeductionUsed"],
        message: "연간 기본공제 한도(2,500,000)를 초과할 수 없습니다",
      });
    }
  });

export type PropertySchemaInput = z.infer<typeof propertySchema>;
export type PropertyItemSchemaInput = z.infer<typeof propertyItemSchema>;
export type MultiInputSchemaInput = z.infer<typeof multiInputSchema>;
