/**
 * 상속·증여 자산(EstateItem) Zod 스키마 — property-valuation-input.ts에서 분리 (800줄 정책, 2026-06-11)
 *
 * baseItemSchema + 자산 종류별 9개 스키마 + estateItemSchema(discriminatedUnion).
 * 외부 import 경로 보존: property-valuation-input.ts가 전량 re-export.
 */
import { z } from "zod";
import { unlistedStockDataSchema } from "./property-valuation-input-unlisted-data";
import { unlistedStockValuationV2Schema } from "./unlisted-stock-valuation-v2.schema";

export const heirAllocationSchema = z.object({
  heirId: z.string().min(1),
  amount: z.number().nonnegative(),
  areaM2: z.number().nonnegative().optional(),
});

const baseItemSchema = z.object({
  id: z.string().min(1),
  // cash·financial·deposit은 위치 기반이 아니므로 자산명 선택 입력 (빈 문자열 허용)
  name: z.string(),
  marketValue: z.number().nonnegative().optional(),
  appraisedValue: z.number().nonnegative().optional(),
  similarSalesValue: z.number().nonnegative().optional(), // 유사매매사례가액 (시행령 §49④) — baseItemSchema 추가 → 9멤버 .extend 전파
  /**
   * 유사매매사례가액 출처 메타 (§9 D8 — 1필드만).
   * "manual": 사용자 수동 입력 / "rtms_auto": RTMS 자동조회 후 선택
   * 엔진 미소비 — UI 표시 전용. baseItemSchema 추가 → discriminatedUnion 9멤버 자동 전파.
   */
  similarSalesSource: z.enum(["manual", "rtms_auto"]).optional(),
  standardPrice: z.number().nonnegative().optional(),
  // 상업용 건물 부수토지 개별공시지가 총액(§61①1호) — 경로 B 보충평가 합산용. 누락 시 silent strip.
  appurtenantLandStandardPrice: z.number().nonnegative().optional(),
  // 상속개시자료 요약 4표 (2026-05-28) — Table A 비고/수량 열
  valuationMethod: z
    .enum([
      "market_value",
      "similar_sales",
      "standard_price",
      "appraisal",
      "acquisition_cost",
      "book_value",
    ])
    .optional(),
  areaSqm: z.number().nonnegative().optional(),
  quantityCount: z.number().nonnegative().optional(),
  mortgageAmount: z.number().nonnegative().optional(),
  leaseDeposit: z.number().nonnegative().optional(),
  // §47① 부담부증여 수증자 인수 채무 (증여 모드 전용 — §66 평가용 mortgageAmount와 독립)
  assumedDebtForGift: z.number().nonnegative().optional(),
  // §47③ 배우자·직계존비속 채무 인수 객관적 입증 토글 (표시·안내용)
  burdenedGiftDebtConfirmed: z.boolean().optional(),
  // §47① 합산배제증여재산(§41의3·§41의5) — 본세 §55①3호 스트림. ⑫ strip 방지
  isAggregationExcludedGift: z.boolean().optional(),
  monthlyRent: z.number().nonnegative().optional(), // §61⑤ 임대료환산
  // §61⑤ 미임대(공실) 부분 — 1동 건물 일부 임대 시 미임대분 기준시가 합산용. 누락 시 silent strip.
  totalBuildingArea: z.number().nonnegative().optional(), // 전체 건물 연면적(㎡) — 토지 안분 분모
  vacantBuildingArea: z.number().nonnegative().optional(), // 미임대 건물 연면적(㎡) — 토지 안분 분자
  vacantBuildingStandardPrice: z.number().nonnegative().optional(), // 미임대분 건물 기준시가(원, 직접입력)
  creditGuaranteeAmount: z.number().nonnegative().optional(), // §63② 신용보증 차감
  // 담보채무 §14 자동공제 (collateral-debt-auto-deduction)
  deductSecuredClaimAsDebt: z.boolean().optional(),
  securedClaimIsFinancialDebt: z.boolean().optional(),
  securedClaimCreditorName: z.string().optional(),
  // 종합사례 PDF 확장
  heirAllocations: z.array(heirAllocationSchema).optional(),
  deemedCategory: z.enum(["retirement", "insurance", "trust"]).optional(),
  // 갭4: 물납 충당순위 §74②6호 상속인 거주주택 (누락 시 z.object 침묵 strip — ⑫)
  isHeirResidenceProperty: z.boolean().optional(),
  isFamilyBusinessAsset: z.boolean().optional(),
  // §23의2 동거주택 상속공제 자동도출 (v3)
  isCohabitantHouse: z.boolean().optional(),
  // §23의2 자산유형 — 입주권·분양권 미적용 게이트 (조심 2021중6665 / 재산세제과-237)
  cohabitHouseRightType: z
    .enum(["house", "single_redev_right", "one_plus_one_right", "sale_right"])
    .optional(),
  // §22 금융재산상속공제 자동화 (2026-05-21)
  isFinancialAssetForDeduction: z.boolean().optional(),
  // §22② 최대주주 법정 강제 배제 — 상장·비상장 V1·V2 공용 직속 필드 (2026-05-27, E-4)
  // baseItemSchema 상속으로 listedItemSchema·unlistedItemSchema 모두 자동 적용.
  isSection22MajorShareholder: z.boolean().optional(),
  trustType: z.enum(["cash_trust", "real_estate", "security", "other"]).optional(),
  // 영농상속공제 자동화 (2026-05-21, §18의3 + 시행령 §16⑤)
  farmingCategory: z
    .enum([
      "farmland",
      "pasture",
      "forest_land",
      "fishing_vessel",
      "fishing_right",
      "agricultural_building",
      "salt_field",
      "corporate_stock",
    ])
    .optional(),
  // 어업권·양식업권 면허 제외 (PR-RE-1, 시행령 §16⑤마목 단서)
  fishingLicenseExcluded: z.boolean().optional(),
  // 가업상속공제 정밀화 (2026-05-21, 상증법 §18의2 + 상증령 §15⑤)
  familyBusinessCategory: z
    .enum([
      "business_real_estate",
      "business_equipment",
      "corporate_stock",
      "intangible_asset",
      "inventory",
      "other",
    ])
    .optional(),
  // 거주지 자동 검증 좌표 (PR-E F-10, §16②1호나)
  estateLatLng: z.object({ lat: z.number(), lng: z.number() }).optional(),
  fishingAnchorLatLng: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  // v4.1.1 Phase 0+0-Fix — 자산 소재지 시·군·구 코드 + 주소 영속화
  estateSigunguCode: z.string().optional(),
  fishingAnchorSigunguCode: z.string().optional(),
  estateAddress: z
    .object({
      road: z.string().optional(),
      jibun: z.string().optional(),
      building: z.string().optional(),
      detail: z.string().optional(),
      pnu: z.string().optional(),
    })
    .optional(),
  // 법인 사업무관자산 (PR-C F-8, 시행령 §15⑤2호 + §16⑤2호)
  corporateNonBusinessAssets: z
    .object({
      nonBusinessLand: z.number().nonnegative().optional(),
      rentedRealEstate: z.number().nonnegative().optional(),
      externalLoans: z.number().nonnegative().optional(),
      excessCash: z.number().nonnegative().optional(),
      nonOperatingFinancial: z.number().nonnegative().optional(),
      // PR-3-b — 과다현금 자동산정 + 나·다목 제외 단서 (strip 방지)
      currentCash: z.number().nonnegative().optional(),
      cashByYearEnd: z.array(z.number().nonnegative()).optional(),
      rentedRealEstateExclusion: z.number().nonnegative().optional(),
      externalLoansExclusion: z.number().nonnegative().optional(),
    })
    .optional(),
  corporateTotalAssets: z.number().nonnegative().optional(),
  // 영농 2년 사용 (G4, §16⑤1호) — false=제외, undefined=충족 가정
  farmingUsedTwoYears: z.boolean().optional(),
  // D4: 영농 사용 개시일 (D-4, §16⑤1호 자동판정, 2026-06-04) — YYYY-MM-DD string, Date 변환 금지
  // farmingUseStartDate 입력 시 deathDate 대비 자동판정, 미입력 시 farmingUsedTwoYears fallback
  farmingUseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  // §74 지정문화유산 등 징수유예 (상증법 §74 / 상증령 §76①) — base 공통(전 variant 전파)
  culturalHeritageType: z
    .enum(["heritage_data", "museum", "designated", "natural_monument"])
    .optional(),
  // ===== 조특법 특례 2-스트림 분리과세 (§30의5⑪·§30의6⑤) =====
  // T-11: 동기화 지점 ⑨⑫ — types/inheritance-gift.types.ts EstateItem.isSpecialTreatmentAsset과 동기화
  /**
   * 특례 스트림 귀속 여부 — 혼합 증여(N개 자산) 시 명시 필수.
   *   true  → 특례 스트림 (창업자금 §30의5 / 가업승계 §30의6)
   *   false → 일반 스트림 (§47·§53·§56)
   *   undefined → 단일 자산 시 자동 특례 귀속 (명시 불필요)
   * 법령 근거: §30의5⑪ — 창업자금 외 자산은 특례 스트림 과세가액에 §47② 합산 금지.
   */
  isSpecialTreatmentAsset: z.boolean().optional(),
  // ===== 조특법 §71 영농자녀 농지 감면 (gift-farmland-reduction-71) =====
  // 동기화 지점 ⑫ — EstateItem.isFarmlandGiftReduction과 동기화 (누락 시 z.object 침묵 strip)
  isFarmlandGiftReduction: z.boolean().optional(),
});

export const landItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_land"),
});

export const apartmentItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_apartment"),
});

export const buildingItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_building"),
});

export const listedStockItemSchema = baseItemSchema.extend({
  category: z.literal("listed_stock"),
  listedStockAvgPrice: z
    .number()
    .positive({ message: "전후 2개월 종가 평균가는 0보다 커야 합니다." }),
  listedStockShares: z
    .number()
    .int()
    .positive({ message: "보유 주식 수는 1 이상이어야 합니다." }),
  // H-6 ⑫ — EstateItem.listedStockCode 보존 (inheritance-asset-category.ts §63 분류 분기)
  listedStockCode: z.string().optional(),
  // §63②3호 (PR-L3): 상장법인 증자 신주(미상장) — discriminatedUnion strip 방지 (C-D)
  isCapitalIncreaseUnlistedShare: z.boolean().optional(),
  listedStockDividendDifference: z.number().nonnegative().optional(),
  dividendBaseDateSameAsListed: z.boolean().optional(),
  // H-2 UI 선택 상태 단일 진실 — 라디오 value·패널 게이트 출처 (⑨⑩⑫ strip 방지)
  unlistedShareMode: z.enum(["none", "capital_increase", "merger"]).optional(),

  // ============================================================
  // 평가조서(갑·을) 재현 — 13 입력 + 1 캐시
  // Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md (PR-LS-01~)
  // ⑫ silent strip 방지 — discriminatedUnion strip 방지
  // ============================================================
  companyName: z.string().optional(),
  representative: z.string().optional(),
  companyAddress: z.string().optional(),
  stockClass: z.enum(["common", "preferred"]).optional(),
  listingDate: z.union([z.string(), z.date()]).optional(),
  capitalIncreaseDate: z.union([z.string(), z.date()]).optional(),
  mergerDate: z.union([z.string(), z.date()]).optional(),

  // §63③ 최대주주 할증
  isMaxShareholder: z.boolean().optional(),
  companySize: z.enum(["small", "medium", "large"]).optional(),
  premiumExclusionReason: z
    .enum([
      "none",
      "smb_med",
      "art53_8_1",
      "art53_8_2",
      "art53_8_3",
      "art53_8_4",
      "art53_8_5",
      "art53_8_6",
      "art53_8_7",
      "art53_8_8",
      "art53_8_9",
    ])
    .optional(),

  // §63②3호 미상장 신주 — 갑지 ⑪⑬
  priorDividendRate: z.number().nonnegative().optional(),
  faceValuePerShare: z.number().nonnegative().optional(),
  dividendBaseDate: z.union([z.string(), z.date()]).optional(),

  // 자동조회 4그룹 캐시 — channel-fill 전용 (sourcing은 키움 응답)
  listedStockDailyGroupsInput: z
    .object({
      beforeM1: z.array(z.any()),
      beforeM2: z.array(z.any()),
      afterM1: z.array(z.any()),
      afterM2: z.array(z.any()),
      beforeSubtotal: z.number(),
      afterSubtotal: z.number(),
      tradingDays: z.number(),
      closingSum: z.number(),
      closingAverage: z.number(),
    })
    .optional(),

  // 상증령 §52의2 anchor 보정 echo (이미지 13)
  resolvedValuationAnchor: z.string().optional(),
  valuationAnchorShifted: z.boolean().optional(),
  valuationAnchorShiftReason: z.string().optional(),
  valuationPeriodStart: z.string().optional(),
  valuationPeriodEnd: z.string().optional(),
});

export const unlistedStockItemSchema = baseItemSchema.extend({
  category: z.literal("unlisted_stock"),
  // legacy 입력 모드 (기존 호환). V2 입력 시 미사용 가능
  unlistedStockData: unlistedStockDataSchema.optional(),
  // V2 입력 모드 (별지 부표3 완전 재현)
  unlistedStockValuationV2: unlistedStockValuationV2Schema.optional(),
  /**
   * 간편(simple)/정식(formal) 평가 모드 명시 (선택).
   * ⚠️ 누락 시 z.object 침묵 strip → 서버 resolveUnlistedDisplayMode가 default 판정에 의존.
   *    V1+V2 객체 공존 시 라우팅 오판 위험 → 엔진 도달 위해 스키마 선언 (14지점 ⑫).
   */
  unlistedValuationMode: z.enum(["simple", "formal"]).optional(),
}).superRefine((item, ctx) => {
  // V1·V2 둘 중 하나는 필수
  if (!item.unlistedStockData && !item.unlistedStockValuationV2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unlistedStockData"],
      message: "비상장주식은 legacy 입력 또는 V2 입력 중 하나는 필수입니다.",
    });
  }
});

export const cashItemSchema = baseItemSchema.extend({
  category: z.literal("cash"),
  marketValue: z.number().nonnegative({ message: "현금 금액은 0 이상이어야 합니다." }),
});

export const financialItemSchema = baseItemSchema.extend({
  category: z.literal("financial"),
  marketValue: z.number().nonnegative(),
});

export const depositItemSchema = baseItemSchema.extend({
  category: z.literal("deposit"),
  leaseDeposit: z.number().positive({ message: "임대보증금은 0보다 커야 합니다." }),
});

export const otherItemSchema = baseItemSchema.extend({
  category: z.literal("other"),
});

/** 지상권 (상증법 §61③·상증령 §51·상증규 §16) — 토지가액×2% 연수입 10% 현가환산 */
export const superficiesItemSchema = baseItemSchema
  .extend({
    category: z.literal("superficies"),
    superficiesLandStandardPrice: z.number().positive({ message: "지상권 설정 토지의 개별공시지가를 입력하세요." }),
    superficiesLandArea: z.number().positive({ message: "지상권 설정 토지의 면적을 입력하세요." }),
    // 미약정이 기본(토글 OFF=undefined) — 엔진 !!superficiesAgreed로 false 처리
    superficiesAgreed: z.boolean().optional(),
    superficiesStructureType: z.enum(["solid_building", "other_building", "non_building", "unspecified"]),
    superficiesAgreedYears: z.number().positive().optional(),
    superficiesSetDate: z.union([z.string(), z.date()]),
    superficiesRemainingYearsOverride: z.number().int().positive().optional(),
    // 합성 잔존연수 (lib/calc buildInput/buildGiftTaxInput에서 주입) — ⑫ silent strip 방지
    superficiesRemainingYears: z.number().int().nonnegative().optional(),
  })
  .superRefine((item, ctx) => {
    // 약정 시 약정 존속기간 필수
    if (item.superficiesAgreed && !(item.superficiesAgreedYears && item.superficiesAgreedYears > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["superficiesAgreedYears"],
        message: "존속기간 약정 시 약정 존속기간(년)을 입력하세요.",
      });
    }
  });

/** 채권 (대여금·외상매출금·받을어음·정리채권) — 상증령 §58②·상증칙 §18의2② */
export const receivableItemSchema = baseItemSchema
  .extend({
    category: z.literal("receivable"),
    receivableKind: z.enum(["loan", "trade", "note", "reorg", "other"]).optional(),
    receivableMode: z.enum(["simple", "discounted"]).optional(),
    receivablePrincipal: z.number().nonnegative().optional(),
    receivableAccruedInterest: z.number().nonnegative().optional(),
    receivableUncollectible: z.number().nonnegative().optional(),
    receivableUncollectibleReason: z.string().optional(),
    // ⑫ silent strip 방지 — discounted 현가할인 스케줄·할인율·평가기준일 주입
    receivableSchedule: z
      .array(
        z.object({
          recoverDate: z.union([z.string(), z.date()]),
          amount: z.number().nonnegative(),
        }),
      )
      .optional(),
    receivableDiscountRateOverride: z
      .object({ numer: z.number(), denom: z.number() })
      .optional(),
    receivableValuationDate: z.union([z.string(), z.date()]).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.receivableMode === "discounted") {
      const rows = item.receivableSchedule ?? [];
      if (rows.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receivableSchedule"],
          message: "연도별 회수 스케줄을 1건 이상 입력하세요.",
        });
      }
      rows.forEach((r, i) => {
        if (!(r.amount > 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["receivableSchedule", i, "amount"], message: "회수금액을 입력하세요." });
        }
        if (!r.recoverDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["receivableSchedule", i, "recoverDate"], message: "회수일을 입력하세요." });
        }
      });
    } else {
      if (!((item.receivablePrincipal ?? 0) > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receivablePrincipal"],
          message: "원본(원금) 가액을 입력하세요.",
        });
      }
      if ((item.receivableUncollectible ?? 0) > (item.receivablePrincipal ?? 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receivableUncollectible"],
          message: "회수불가능 차감액이 원본을 초과할 수 없습니다.",
        });
      }
    }
  });

/** 자산 항목 discriminatedUnion 스키마 */
export const estateItemSchema = z
  .discriminatedUnion("category", [
    landItemSchema,
    apartmentItemSchema,
    buildingItemSchema,
    listedStockItemSchema,
    unlistedStockItemSchema,
    cashItemSchema,
    financialItemSchema,
    depositItemSchema,
    superficiesItemSchema,
    receivableItemSchema,
    otherItemSchema,
  ])
  // v4.1.1 Phase 5 D11/디자인 §5 — 카테고리별 좌표 입력 정책 (영농 §16②1호나)
  .superRefine((item, ctx) => {
    // 무관 카테고리 + 좌표 입력 → 차단
    const COORD_INCOMPATIBLE = ["listed_stock", "unlisted_stock", "cash", "financial", "deposit", "superficies", "receivable", "other"];
    if (COORD_INCOMPATIBLE.includes(item.category)) {
      if (item.estateLatLng !== undefined || item.estateSigunguCode !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estateLatLng"],
          message: `${item.category} 카테고리는 §16②1호나 거주지 OR 대상이 아니므로 좌표·시·군·구 코드 입력 불가`,
        });
      }
      if (item.fishingAnchorLatLng !== undefined || item.fishingAnchorSigunguCode !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fishingAnchorLatLng"],
          message: `${item.category} 카테고리는 어선·어업권 분기 대상이 아니므로 선적지 좌표·코드 입력 불가`,
        });
      }
    }
    // fishing_* (fishing_vessel·fishing_right) — fishingAnchor 사용. estateLatLng/estateSigunguCode 차단
    const isFishing = item.farmingCategory === "fishing_vessel" || item.farmingCategory === "fishing_right";
    if (isFishing && (item.estateLatLng !== undefined || item.estateSigunguCode !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estateLatLng"],
        message: "어선·어업권은 estateLatLng/estateSigunguCode 대신 fishingAnchorLatLng/fishingAnchorSigunguCode를 사용",
      });
    }
    // 농지·초지·산림지가 아닌 카테고리에 fishingAnchor 입력 → 차단
    const isLandBased = item.farmingCategory === "farmland" || item.farmingCategory === "pasture" || item.farmingCategory === "forest_land";
    if (isLandBased && (item.fishingAnchorLatLng !== undefined || item.fishingAnchorSigunguCode !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fishingAnchorLatLng"],
        message: "농지·초지·산림지는 estateLatLng/estateSigunguCode를 사용 — fishingAnchor 차단",
      });
    }
  });

export type EstateItemInput = z.infer<typeof estateItemSchema>;
