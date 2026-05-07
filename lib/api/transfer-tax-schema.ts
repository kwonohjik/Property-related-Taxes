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
  nonBusinessLandDetailsSchema,
  rentalReductionDetailsSchema,
  newHousingDetailsSchema,
  pre1990LandSchema,
  houseSchema,
  reductionSchema,
  filingPenaltyDetailsSchema,
  delayedPaymentDetailsSchema,
  inheritanceValuationSchema,
  inheritedAcquisitionSchema,
  inheritanceHouseValuationSchema,
  companionAssetSchema,
  parcelSchema,
  preHousingDisclosureSchema,
  mixedUseAssetSchema,
  addPropertyRefines,
} from "./transfer-tax-schema-sub";

// ─── ⑨ 장기임대주택 거주주택 비과세 특례 Zod enum (소령 §155⑳) ──────

/** 시나리오: A=거주주택 양도, B=임대주택→거주주택 전환 후 양도(PHRP) */
export const RentalScenarioEnum = z.enum(['A', 'B']);

/** 임대 유형: 단기(4·6년)·장기(8·10년)·2018 이전 등록 */
export const RentalTypeEnum = z.enum(['short-4', 'short-6', 'long-8', 'long-10', 'pre-2018']);

/** 취득 방법: 매입·건설 */
export const RentalAcqTypeEnum = z.enum(['purchase', 'construction']);

/** 소재지역: 수도권·비수도권·조정대상지역 */
export const RentalRegionEnum = z.enum(['seoul-metro', 'non-metro', 'regulated-area']);

/** ⑫ 임대주택 1호 Zod 객체 스키마 (미정의 시 침묵 stripping 방지) */
export const rentalUnitSchema = z.object({
  registrationDate: z.string().datetime(),
  rentalType: RentalTypeEnum,
  rentalAcquisitionType: RentalAcqTypeEnum,
  isApartment: z.boolean(),
  region: RentalRegionEnum,
  standardPriceAtRentalStart: z.number().int().nonnegative(),
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
  propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right", "mixed-use-house"]),
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
  acquisitionCause: z.enum(["purchase", "inheritance", "gift", "carryover_gift"]).optional(),
  decedentAcquisitionDate: z.string().date().optional(),
  donorAcquisitionDate: z.string().date().optional(),
  expenses: z.number().int().nonnegative(),
  /** §97① 가목 자본적 지출 — §97② 단서 swap 분리 입력용 (선택). 미명시 시 swap 비활성, expenses fallback */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  /** §97① 나목 양도비 — §97② 단서 swap 분리 입력용 (선택) */
  transferExpense: z.number().int().nonnegative().optional(),
  useEstimatedAcquisition: z.boolean(),
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  standardPriceAtTransfer: z.number().int().positive().optional(),
  householdHousingCount: z.number().int().min(0),
  residencePeriodMonths: z.number().int().nonnegative(),
  isRegulatedArea: z.boolean(),
  wasRegulatedAtAcquisition: z.boolean(),
  isUnregistered: z.boolean(),
  isNonBusinessLand: z.boolean(),
  isSuccessorRightToMoveIn: z.boolean().optional(),
  isOneHousehold: z.boolean(),
  temporaryTwoHouse: temporaryTwoHouseSchema.optional(),
  reductions: z.array(reductionSchema).default([]),
  nonBusinessLandDetails: nonBusinessLandDetailsSchema.optional(),
  houses: z.array(houseSchema).optional(),
  sellingHouseId: z.string().optional(),
  marriageMerge: z.object({ marriageDate: z.string().date() }).optional(),
  parentalCareMerge: z.object({ mergeDate: z.string().date() }).optional(),
  rentalReductionDetails: rentalReductionDetailsSchema.optional(),
  newHousingDetails: newHousingDetailsSchema.optional(),
  acquisitionMethod: z.enum(["actual", "estimated", "appraisal"]).optional(),
  appraisalValue: z.number().int().nonnegative().optional(),
  isSelfBuilt: z.boolean().optional(),
  buildingType: z.enum(["new", "extension"]).optional(),
  constructionDate: z.string().date().optional(),
  extensionFloorArea: z.number().nonnegative().optional(),
  pre1990Land: pre1990LandSchema.optional(),
  parcels: z.array(parcelSchema).max(10).optional(),

  // ─── 토지/건물 취득일 분리 (소득령 §166⑥·§168②) ────────────────
  /** 토지 취득일 (건물 acquisitionDate와 다를 때) */
  landAcquisitionDate: z.string().date().optional(),
  /** 분리 입력 방식 */
  landSplitMode: z.enum(["apportioned", "actual"]).optional(),
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

  // ─── 일괄양도 안분 (소득세법 시행령 §166 ⑥) ────────────────
  /** 함께 양도된 자산들 (2개 이상 일괄 양도 시). 없거나 빈 배열이면 단건으로 처리. */
  companionAssets: z.array(companionAssetSchema).max(10).optional(),
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
  /** 검용주택(1세대 1주택 + 상가) 분리계산 입력 — propertyType === "mixed-use-house" 시 필수 */
  mixedUse: mixedUseAssetSchema.optional(),
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   * "building_only"/"land_only" 사용 시 landAcquisitionDate 필수.
   */
  selfOwns: z.enum(["both", "building_only", "land_only"]).optional(),
  /** ⑫ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 미정의 시 침묵 stripping 방지 */
  rentalHousingException: rentalHousingExceptionSchema.optional(),
};

// ─── 단건 스키마 (기존 inputSchema와 동일) ─────────────────────

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
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    addPropertyRefines(data, ctx);

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
          // 상속: inheritanceValuation(auto) 또는 fixedAcquisitionPrice(manual) 중 하나 필요
          const hasAuto = c.inheritanceValuation !== undefined;
          const hasManual = c.fixedAcquisitionPrice !== undefined && c.fixedAcquisitionPrice > 0;
          if (!hasAuto && !hasManual) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedAcquisitionPrice"],
              message: "상속 자산은 보충적평가 또는 직접입력 취득가액 필수",
            });
          }
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
    basicDeductionAllocation: z
      .enum(["MAX_BENEFIT", "FIRST", "EARLIEST_TRANSFER"])
      .default("MAX_BENEFIT"),
    // 가산세는 자산별로 입력 (propertyItemSchema.filingPenaltyDetails / delayedPaymentDetails).
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
