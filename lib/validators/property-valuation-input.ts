/**
 * 재산평가 입력 Zod 스키마
 * 상속·증여 API Route에서 입력 검증에 사용
 */
import { z } from "zod";
import { unlistedStockDataSchema } from "./property-valuation-input-unlisted-data";

// 가업상속공제 스키마 — 800줄 정책으로 sibling 분리(2026-06-02)
import { familyBusinessInheritanceInputSchema } from "./family-business-inheritance-schema";
// 영농상속공제 사후관리 스키마 — 800줄 정책으로 sibling 분리(2026-06-07)
import {
  farmingPostMgmtInputSchema,
  type FarmingPostMgmtInputSchema,
} from "./farming-post-mgmt-input-schema";
export { farmingPostMgmtInputSchema, type FarmingPostMgmtInputSchema };
// 증여공제·감정수수료 보조 스키마 — 800줄 정책으로 sibling 분리(2026-06-07)
import {
  giftDeductionInputSchema,
  giftTaxCreditInputSchema,
  appraisalFeeSchema,
} from "./gift-aux-schemas";
export { giftDeductionInputSchema, giftTaxCreditInputSchema, appraisalFeeSchema };

// ============================================================
// 비상장주식 평가 데이터 스키마 — property-valuation-input-unlisted-data.ts로 분리(800줄).
// 재바인딩 + re-export로 외부 import 경로·내부 사용처 무변경.
// ============================================================

export { unlistedStockDataSchema };

// ============================================================
// 비상장주식 V2 평가 입력 — unlisted-stock-valuation-v2.schema.ts로 분리 (2026-05-22, 800줄 정책)
// ============================================================
// 기존 import 경로 보존을 위한 barrel re-export
export {
  unlistedNetAssetOnlyReasonSchema,
  unlistedPremiumExclusionReasonSchema,
  unlistedCapitalChangeSchema,
  fiscalYearAdjustmentSchema,
  unlistedNetAssetCalculationSchema,
  unlistedStockValuationV2Schema,
  type UnlistedStockValuationV2Input,
} from "./unlisted-stock-valuation-v2.schema";

import { unlistedStockValuationV2Schema } from "./unlisted-stock-valuation-v2.schema";

// ============================================================
// 자산 종류별 discriminatedUnion 스키마
// ============================================================
// 자산(EstateItem) 스키마 — 800줄 정책으로 estate-item-schema.ts 분리 (re-export 보존, 2026-06-11)
export {
  heirAllocationSchema,
  landItemSchema,
  apartmentItemSchema,
  buildingItemSchema,
  listedStockItemSchema,
  unlistedStockItemSchema,
  cashItemSchema,
  financialItemSchema,
  depositItemSchema,
  otherItemSchema,
  estateItemSchema,
  type EstateItemInput,
} from "./estate-item-schema";
import { heirAllocationSchema, estateItemSchema } from "./estate-item-schema";

// ============================================================
// 저가·고가 양도 증여의제 판정 스키마 (상증법 §35)
// ============================================================

export const bargainTransferInputSchema = z.object({
  transactionPrice: z.number().nonnegative({ message: "거래가액은 0 이상이어야 합니다." }),
  marketValue: z.number().positive({ message: "시가는 0보다 커야 합니다." }),
  isRelatedParty: z.boolean(),
  transactionType: z.enum(["purchase", "sale"]),
});

export type BargainTransferInputSchema = z.infer<typeof bargainTransferInputSchema>;

// ============================================================
// 사전증여 내역 스키마 — 800줄 정책으로 prior-gift-schema.ts 분리 (re-export 보존)
// ============================================================

export { giftDonorRelationSchema, priorGiftSchema } from "./prior-gift-schema";
import { giftDonorRelationSchema, priorGiftSchema } from "./prior-gift-schema";

// 특례 귀속 가능 재산 종류 — 엔진 단일 진실 (UI ⑤·validateStep ⑧과 동일 헬퍼)
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";
import type { AssetCategory } from "@/lib/tax-engine/types/inheritance-gift.types";
// 대납(代納) gross-up 차단 판정 — donorGroup=B 시 세대생략 할증 ↔ 대납 fold-back 미지원
import { getDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";

// ============================================================
// 비과세 항목 스키마 — ExemptionCheckedItem[] 기반 (§11·§12·§46·§46의2)
// ============================================================

export const exemptionCheckedItemSchema = z.object({
  ruleId: z.string().min(1),
  claimedAmount: z.number().nonnegative(),
  priorDisabledTrustUsed: z.number().nonnegative().optional(),
  relatedStockExceeded: z.boolean().optional(),
  excessStockAmount: z.number().nonnegative().optional(),
  // 갭5a: §16② 동족주식 한도 자동계산 입력 (누락 시 침묵 strip — ⑫)
  publicInterestType: z
    .enum(["general", "charity_no_voting", "mutual_investment_restricted", "art48_11_unmet"])
    .optional(),
  relatedStockDonatedShares: z.number().nonnegative().optional(),
  relatedStockTotalShares: z.number().nonnegative().optional(),
  relatedStockPriorHeld: z.number().nonnegative().optional(),
  relatedStockValuePerShare: z.number().nonnegative().optional(),
  marriageExemptionAlreadyUsed: z.boolean().optional(),
  claimedAreaM2: z.number().nonnegative().optional(),
  // 작업4: 협의분할 — 상속인별 귀속 (heirAllocationSchema 재사용). 누락 시 침묵 strip
  heirAllocations: z.array(heirAllocationSchema).optional(),
});

/** @deprecated ExemptionInput → ExemptionCheckedItem[] 로 대체됨 */
export const exemptionInputSchema = z.object({
  isWarHero: z.boolean().optional(),
  donatedToState: z.number().nonnegative().optional(),
  ceremonialProperty: z.number().nonnegative().optional(),
  socialNormGifts: z.number().nonnegative().optional(),
  publicInterestContribution: z.number().nonnegative().optional(),
});

// ============================================================
// 상속인 스키마
// ============================================================

export const heirSchema = z.object({
  id: z.string().min(1),
  relation: z.enum([
    "spouse",
    "child",
    "lineal_ascendant",
    "sibling",
    "other",
    // 종합사례 PDF 확장
    "legatee",
    "corporate",
  ]),
  name: z.string().optional(),
  residentNumber: z.string().optional(), // 신고서 인적사항 칸(식별정보, 계산 미사용)·strip 방지
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  isDisabled: z.boolean().optional(),
  /** §20①4호 장애인공제 성별·연령별 기대여명 (⑫ — 누락 시 침묵 strip 방지) */
  gender: z.enum(["male", "female"]).optional(),
  /** §20①1호·2호 태아 포함 (2023.1.1.~) — ⑫ strip 방지 */
  isFetus: z.boolean().optional(),
  // actualShareRatio 제거 (2026-05-26) — 협의분할 자산별 일원화. 기존 저장값은 Zod strip으로 자동 제거.
  isCohabitant: z.boolean().optional(),
  // 종합사례 PDF 확장
  isHeir: z.boolean().optional(),
  isGenerationSkipBeneficiary: z.boolean().optional(),
  // §27 단서 — 민법 §1001 대습상속 할증 배제 (2026-06-07)
  isSubstituteInheritance: z.boolean().optional(),
  // 대습상속 법정상속분 (민법 §1001·§1003②·§1010, 2026-06-09) — ⑫ z.object 침묵 strip 방지.
  // forRelation·Role 필수성(substituteGroupId 보유 시)은 inheritance-validate.ts ⑧에서 검증.
  substituteGroupId: z.string().optional(),
  substituteForRelation: z.enum(["child", "sibling"]).optional(),
  substituteRole: z.enum(["spouse", "descendant"]).optional(),
  substituteAncestorName: z.string().optional(), // 피대습자 성명(표시 전용)
  // B-7 (2026-06-01) — §27 미성년 3-state override. undefined=자동(birthDate), true/false=수동.
  isMinorOverride: z.boolean().optional(),
  // Phase 2 (2026-06-07) — §23의2①1호 동거기간 검증. ⑫ 미선언 시 z.object 침묵 strip → 엔진 미도달.
  // cohabitStartDate: 미입력=검증 생략(isCohabitant 체크박스 신뢰). validation 오류 아님.
  cohabitStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
    .optional(),
  // cohabitExcludedYears: §23의2② 부득이 사유 제외 연수 (legacy — Phase 4에서 cohabitReasons로 대체).
  // @deprecated: 역직렬화 호환을 위해 잔류. 신규 입력 UI에서는 cohabitReasons 사용.
  cohabitExcludedYears: z.number().nonnegative().optional(),
  // Phase 4 (2026-06-07) — §23의2② 부득이사유 구조화 배열 ⑨⑫
  // startDate < endDate 는 superRefine에서 검증. 빈 배열 허용 (사유 없음).
  cohabitReasons: z
    .array(
      z.object({
        type: z.enum([
          "conscription",
          "schooling",
          "work",
          "medical",
          "reconstruction_lease",
          "overseas_grad",
        ]),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
      }).superRefine((reason, ctx) => {
        if (reason.startDate >= reason.endDate) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: `부득이사유 종료일(${reason.endDate})은 시작일(${reason.startDate})보다 늦어야 합니다.`,
          });
        }
      }),
    )
    .optional(),
  // donee-phase2 — 영리법인 여부 (corporate Heir, §3의2② 적용 판정). ⚠️ z.object 침묵 strip 방지.
  isForProfit: z.boolean().optional(),
  corporateGiftComputedTax: z.number().nonnegative().optional(),
  // PR 2 (2026-05-22) — 부표 5 영리법인 면제 명세
  businessRegistrationNumber: z.string().optional(),
  businessAddress: z.string().optional(),
  shareholders: z
    .array(
      z.object({
        id: z.string().min(1),
        relation: z.enum([
          "heir",
          "heir_spouse",
          "lineal_descendant_of_heir",
          "spouse_of_lineal_descendant",
        ]),
        // ⑦ 드롭다운에서 "입력된 상속인" 선택 시 해당 Heir.id 참조.
        // 미설정 = 기타 관계(수동 입력). 엔진 미사용 — 신고서 표시 전용.
        // ⚠️ z.object 침묵 strip 방지 (feedback_api_zod_schema_sync 14지점 ⑧).
        heirRef: z.string().optional(),
        name: z.string().min(1),
        residentNumber: z.string().optional(),
        shareRatio: z.number().min(0).max(1),
      }),
    )
    .optional()
    .refine(
      (arr) => {
        if (!arr) return true;
        const sum = arr.reduce((s, sh) => s + sh.shareRatio, 0);
        return sum <= 1.0 + 1e-9; // 부동소수 허용 오차
      },
      { message: "주주 지분율 합이 100%를 초과합니다 (외부 주주분 제외)." },
    ),
});

// ── DebtItem 스키마 (Phase A0 협의분할) ──
export const debtItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["financial", "tax", "personal", "funeral"]),
  name: z.string(),
  amount: z.number().nonnegative(),
  isBongan: z.boolean().optional(),
  heirAllocations: z.array(heirAllocationSchema).optional(),
  // §22 순금융재산 차감 채무 여부 (2026-05-21)
  isFinancialDebtForDeduction: z.boolean().optional(),
  // 상속개시자료 요약 4표 (2026-05-28) — Table C 채권자/비고 열
  creditorAddress: z.string().optional(),
  incurredDate: z.string().optional(),
});

// ── PresumedInheritanceItem 스키마 (Phase A §15) ──
export const presumedInheritanceItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["real_estate", "deposit", "other_asset", "financial_debt"]),
  amountWithin1Y: z.number().nonnegative(),
  amountWithin2Y: z.number().nonnegative(),
  verifiedUseAmount: z.number().nonnegative(),
  heirAllocations: z.array(heirAllocationSchema).optional(),
});

// ============================================================
// 상속공제 입력 스키마
// ============================================================

/** 영농상속공제 자격 입력 스키마 (2026-05-21, §18의3 + 시행령 §16) */
export const farmingInheritanceInputSchema = z.object({
  type: z.enum(["personal", "corporate"]),
  decedentEightYearFarming: z.boolean(),
  decedentResidenceMet: z.boolean(),
  decedentCorporateMet: z.boolean().optional(),
  heirIsAdult: z.boolean(),
  heirTwoYearFarming: z.boolean(),
  heirResidenceMet: z.boolean(),
  decedentEarlyDeath: z.boolean().optional(),
  heirCorporateOfficer: z.boolean().optional(),
  isDesignatedSuccessor: z.boolean().optional(),
  // §16⑭1호 — 사업소득금액+총급여 3,700만 이상 (1호 전용으로 의미 축소, D-3 2026-06-04)
  hasDisqualifyingIncome: z.boolean().optional(),
  // §16⑭2호 — 사업소득 총수입금액 소령§208⑤2호 기준 이상 (2026.2.27 신설)
  hasDisqualifyingGrossReceipt: z.boolean().optional(),
  hasTaxFraudConviction: z.boolean().optional(),
  // §16② 단서 (F-9, 2026-05-21) — corporate 전용
  isSecondaryAfterFarmingInheritance: z.boolean().optional(),
  // 부록 A: 상속인별 분리 자격 평가 (FH-1~6, 2026-05-22)
  heirAssessments: z
    .array(
      z.object({
        heirId: z.string(),
        heirIsAdult: z.boolean(),
        heirTwoYearFarming: z.boolean(),
        heirResidenceMet: z.boolean(),
        heirCorporateOfficer: z.boolean().optional(),
        isDesignatedSuccessor: z.boolean().optional(),
        // §16⑭1호 — 상속인 단위
        hasDisqualifyingIncome: z.boolean().optional(),
        // §16⑭2호 — 상속인 단위 (2026.2.27 신설)
        hasDisqualifyingGrossReceipt: z.boolean().optional(),
      }),
    )
    .optional(),
  // §16⑤ 본문 자격자 분배분 (F-11, 2026-05-21)
  qualifiedHeirIds: z.array(z.string()).optional(),
  // 거주지 좌표 자동 검증 (F-10, §16②1호나, 2026-05-21)
  decedentResidenceLatLng: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  heirResidenceLatLng: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  // 주소 영속화 (A 작업, 2026-05-22)
  decedentResidenceAddress: z
    .object({
      road: z.string().optional(),
      jibun: z.string().optional(),
      building: z.string().optional(),
      detail: z.string().optional(),
    })
    .optional(),
  heirResidenceAddress: z
    .object({
      road: z.string().optional(),
      jibun: z.string().optional(),
      building: z.string().optional(),
      detail: z.string().optional(),
    })
    .optional(),
  // v4.1.1 Phase 0+0-Fix — §16②1호나 시·군·구 OR 자동 판정
  decedentResidenceSigunguCode: z.string().optional(),
  heirResidenceSigunguCode: z.string().optional(),
  // v4.1.1 C1-F — 산림지 §16②1호나 단서 (통상적으로 직접 경영할 수 있는 지역)
  decedentForestManageableArea: z.boolean().optional(),
  heirForestManageableArea: z.boolean().optional(),
});

/** 가업상속공제 자격 입력 스키마 (2026-05-21, 상증법 §18의2 + 상증령 §15) */
// 가업상속공제 스키마 — sibling(family-business-inheritance-schema.ts) 정의. 재수출로 외부 import 호환.
export { familyBusinessInheritanceInputSchema };

export const inheritanceDeductionInputSchema = z.object({
  heirs: z.array(heirSchema).min(1, "상속인이 1명 이상 필요합니다."),
  spouseActualAmount: z.number().nonnegative().optional(),
  netFinancialAssets: z.number().nonnegative().optional(),
  cohabitHouseStdPrice: z.number().nonnegative().optional(),
  cohabitSecuredDebt: z.number().nonnegative().optional(),
  // §23의2 자산유형 미적용 게이트 (deductionInput 경유 — 엔진 차단)
  cohabitHouseRightType: z
    .enum(["house", "single_redev_right", "one_plus_one_right", "sale_right"])
    .optional(),
  farmingAssetValue: z.number().nonnegative().optional(),
  familyBusinessValue: z.number().nonnegative().optional(),
  familyBusinessYears: z.number().int().nonnegative().optional(),
  // 종합사례 PDF Phase D·E
  familyBusinessDirectAmount: z.number().nonnegative().optional(),
  cohabitDirectAmount: z.number().nonnegative().optional(),
  spouseLegalShareOverride: z.number().nonnegative().optional(),
  legateeAmountNonHeir: z.number().nonnegative().optional(),
  priorGiftDeductionTotal: z.number().nonnegative().optional(),
  disasterLossDeduction: z.number().nonnegative().optional(),
  // 영농상속공제 정밀화 (2026-05-21)
  farming: farmingInheritanceInputSchema.optional(),
  // 가업상속공제 정밀화 (2026-05-21, 상증법 §18의2 + 상증령 §15)
  familyBusiness: familyBusinessInheritanceInputSchema.optional(),
  // ⑫ 동기화: InheritanceDeductionInput.deathDate와 동일 선언 — 미선언 시 Zod strip됨.
  // 오케스트레이터(inheritance-tax.ts)가 input.deathDate로 재주입하므로 현재는 기능 무해이나,
  // schema 통과 후 deductionInput에 deathDate가 보존되어야 하는 경우(단독 호출 등)에 대비.
  deathDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
    .optional(),
  // ⑫ 동기화 (2026-06-05, §20 P1 동거가족): 미선언 시 z.object 침묵 strip → 엔진 미도달.
  cohabitantDependents: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        birthDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
          .optional(),
        isDisabled: z.boolean().optional(),
        gender: z.enum(["male", "female"]).optional(),
        relation: z.enum(["lineal_ascendant", "lineal_descendant", "sibling"]),
      }),
    )
    .optional(),
  // ⑫ 동기화 (2026-06-07, §21① 단서): 미선언 시 z.object 침묵 strip → 엔진 미도달.
  //   완전 무신고 시 일괄공제 5억 고정. 라디오 입력이라 모순 불가(별도 validate 차단 불요).
  isUnfiled: z.boolean().optional(),
  // ⑨⑫ 동기화 (2026-06-07, §23 재해손실공제): 미선언 시 z.object 침묵 strip → 엔진 미도달.
  //   enum은 CasualtyLossInput.disasterType과 정확히 일치 (enum-verification-before-mapping).
  //   lossValue nonnegative — validate ⑧에서 >0 추가 차단 (API max(0,…) fallback 3중 패턴).
  casualtyLoss: z
    .object({
      lossValue: z.number().nonnegative(),
      compensatedValue: z.number().nonnegative().optional(),
      disasterType: z
        .enum(["fire", "collapse", "explosion", "environmental", "natural", "other"])
        .optional(),
      disasterDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
        .optional(),
      isWithinFilingDeadline: z.boolean().optional(),
    })
    .optional(),
  // ⑨⑫ 동기화 (2026-06-07, G4 §23의2① 주택부수토지 면적한도 Phase 3).
  // 세 필드 전부 또는 전무 — validate ⑧에서 partial 입력 차단.
  // ancillaryLandArea: 부수토지 실제 면적(㎡). 미입력=차감 없음(자동 안분 fallback 금지).
  ancillaryLandArea: z.number().nonnegative().optional(),
  // buildingFootprintArea: 건물 정착 면적(㎡). 소득세 시행령 §154⑦ 배율 계산 분모.
  buildingFootprintArea: z.number().nonnegative().optional(),
  // ancillaryLandRegion: 지역 구분 4종 enum (소득세 시행령 §154⑦ 4호).
  ancillaryLandRegion: z
    .enum([
      "metro_residential_commercial_industrial",
      "metro_green",
      "non_metro",
      "other",
    ])
    .optional(),
});

// ============================================================
// 세액공제 입력 스키마
// ============================================================

export const inheritanceTaxCreditInputSchema = z.object({
  priorGifts: z.array(priorGiftSchema).optional(),
  foreignTaxPaid: z.number().nonnegative().optional(),
  // §29/상증령 §21① 한도식 분자 — 국외 상속재산 과세표준. ⑫ 동기화 지점.
  foreignInheritanceTaxBase: z.number().nonnegative().optional(),
  // §30 banding 자동 도출 — 1차 상속개시일 (2차=deathDate). ⑫ 동기화 지점.
  shortTermReinheritPriorDeathDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  // §30 재산별 구분 입력 — 집행 30-22-1②. 원소: name? + priorValue(1차 당시 가액). ⑫ 동기화 지점.
  shortTermReinheritAssets: z
    .array(z.object({ name: z.string().optional(), priorValue: z.number().int().nonnegative() }))
    .optional(),
  // legacy: 수동 band(공제율 구간 정수) — priorDeathDate 부재 시 fallback
  shortTermReinheritYears: z.number().int().min(0).max(10).optional(),
  shortTermReinheritTaxPaid: z.number().nonnegative().optional(),
  // §30②1호 안분 입력 — optional. 미입력 시 엔진이 전부재상속(분수=1) fallback.
  // ⑫ 동기화 지점: 누락 시 Zod strip → 엔진 미도달 침묵 오류 차단.
  shortTermReinheritAssetValue: z.number().int().nonnegative().optional(),
  shortTermReinheritPriorEstateValue: z.number().int().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
});

// ============================================================
// 상속세 전체 입력 스키마
// ============================================================

export const inheritanceTaxInputSchema = z.object({
  decedentType: z.enum(["resident", "non_resident"]),
  deathDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  estateItems: z.array(estateItemSchema).min(1, "상속재산이 1개 이상 필요합니다.").superRefine((items, ctx) => {
    // v4.1.1 Phase 5 D11 — cross-item 룰: forestManageableArea=true 사용 시 forest_land 자산 1건+ 필수
    // 본 룰은 estateItems 배열 수준에서만 평가 가능 — farming 객체와의 cross-validation은 inheritanceTaxInputSchema에서
    const hasForestLand = items.some((i) => i.farmingCategory === "forest_land");
    if (!hasForestLand) return; // 자산 목록 자체에는 강제 사항 없음
    // (실제 forest_manageable_area=true 시 forest_land 필수 룰은 farming 입력 단계에서 검증)
    void ctx;
  }),
  // legacy debts·funeralExpense — debtItems 입력 시 우선
  // §9②1호: 일반 장례비 — 한도 초과 입력도 허용, 엔진이 clamp[500만,1천만] 적용
  funeralExpense: z.number().min(0).max(1_000_000_000).optional().default(0),
  // §9②2호: 봉안시설·자연장지 — 한도 초과 입력도 허용, 엔진이 min(실제,500만) 적용
  funeralBonganExpense: z.number().min(0).max(1_000_000_000).optional(),
  // @deprecated funeralBonganExpense 사용. legacy 이력 복원 하위호환용.
  funeralIncludesBongan: z.boolean().optional().default(false),
  debts: z.number().nonnegative().optional().default(0),
  // 종합사례 PDF Phase A0·A
  debtItems: z.array(debtItemSchema).optional(),
  presumedItems: z.array(presumedInheritanceItemSchema).optional(),
  exemptions: z.array(exemptionCheckedItemSchema).optional(),
  preGiftsWithin10Years: z.array(priorGiftSchema),
  heirs: z.array(heirSchema).min(1),
  deductionInput: inheritanceDeductionInputSchema,
  creditInput: inheritanceTaxCreditInputSchema,
  valuationBaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isGenerationSkip: z.boolean().optional(),
  isMinorHeir: z.boolean().optional(),
  generationSkipAssetAmount: z.number().nonnegative().optional(),
  appraisalFee: appraisalFeeSchema.optional(),
});

export type InheritanceTaxInputSchema = z.infer<typeof inheritanceTaxInputSchema>;

// ============================================================
// 증여세 전체 입력 스키마
// ============================================================

export const giftTaxInputSchema = z
  .object({
    giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
    donorRelation: z.enum([
      "spouse",
      "lineal_ascendant_adult",
      "lineal_ascendant_minor",
      "lineal_descendant",
      "other_relative",
    ]),
    /** Phase A: 증여자 관계 (동일인 §47 합산 그룹화 + §57 적용 판정) — 필수 */
    donor: giftDonorRelationSchema,
    giftItems: z.array(estateItemSchema).min(1, "증여재산이 1개 이상 필요합니다."),
    exemptions: z.array(exemptionCheckedItemSchema).optional(),
    priorGiftsWithin10Years: z.array(priorGiftSchema),
    isGenerationSkip: z.boolean(),
    isMinorDonee: z.boolean(),
    /**
     * §57① 단서 — 최근친 직계비속 사망 시 할증 배제.
     * true 시 donorGroup=B이어도 §57① 할증 전액 미적용.
     */
    isSubstituteGift: z.boolean().optional(),
    /**
     * §36 채무면제 — 증여자가 수증자의 증여세를 대납(代納)하는 경우.
     * true 시 gift-tax-grossup.ts에서 고정점 수렴 계산 적용.
     */
    donorPaysGiftTax: z.boolean().optional(),
    /**
     * §4의2⑥ 연대납세의무 — true 시 대납이 재차증여가 아님(국세청 해석[207328]) → gross-up 미적용.
     * donorPaysGiftTax=true 이어야 유효.
     */
    donorHasJointLiability: z.boolean().optional(),
    /**
     * 수증자 본인 납부액(원). 증여자는 (총세액 − 이 금액) 부족분만 대납.
     * 미입력/0 = 증여자 전액 대납. donorPaysGiftTax=true 일 때만 유효.
     */
    doneePaidGiftTax: z.number().min(0).optional(),
    deductionInput: giftDeductionInputSchema,
    creditInput: giftTaxCreditInputSchema,
    valuationBaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    appraisalFee: appraisalFeeSchema.optional(),
    // 분납 (§70②) — 별지10호 ㊼ 연동
    applyInstallmentSplit: z.boolean().optional(),
    requestedSplitAmount: z.number().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    // T-12 (동기화 지점 ⑩): 조특법 특례 2-스트림 — 혼합 자산 귀속 미설정 차단
    // §30의5⑪: 창업자금 외 자산은 특례 스트림 과세가액에 §47② 합산 금지.
    // 혼합 증여(N≥2 자산)에서 특례 선택 시 isSpecialTreatmentAsset 명시 필수.
    const specialTreatment = data.creditInput?.specialTreatment;
    if (specialTreatment && data.giftItems.length >= 2) {
      const unassigned = data.giftItems.filter(
        (item) => item.isSpecialTreatmentAsset === undefined,
      );
      if (unassigned.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["giftItems"],
          message:
            `조특법 특례(${specialTreatment === "startup" ? "창업자금 §30의5" : "가업승계 §30의6"}) 선택 시 ` +
            `혼합 자산 ${data.giftItems.length}개 중 미귀속 자산 ${unassigned.length}개에 ` +
            `특례 귀속(isSpecialTreatmentAsset)을 명시해야 합니다 (§30의5⑪).`,
        });
      }
    }

    // 특례 귀속 자산 재산 종류 제약 (동기화 지점 ⑩ — R3 잔여 해소):
    //   startup — 소득세법 §94① 재산(부동산·주식) 제외 (조특령 §27의5①)
    //   family_business — 주식·출자지분만 (§30의6①)
    // 명시 태깅(true) + 단일 자산 자동 귀속(엔진 partition이 1개면 자동 특례) 모두 검사.
    // 이 차단으로 "특례 자산 + assumedDebtForGift(부동산 전용 입력)" 조합도 구조적으로 차단됨.
    if (specialTreatment) {
      const effectiveSpecialItems =
        data.giftItems.length === 1
          ? data.giftItems
          : data.giftItems.filter(
              (item) => item.isSpecialTreatmentAsset === true,
            );
      const ineligible = effectiveSpecialItems.filter(
        (item) =>
          !isSpecialTreatmentEligibleCategory(
            item.category as AssetCategory,
            specialTreatment,
          ),
      );
      if (ineligible.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["giftItems"],
          message: `특례 귀속 불가 재산 ${ineligible.length}개 — ${SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[specialTreatment]}`,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // 대납(代納) gross-up 차단 조합 ⑫ (Zod superRefine)
    // ⑧ validateStep과 동일 메시지로 동기화
    // ──────────────────────────────────────────────────────────────
    if (data.donorPaysGiftTax === true) {
      // ⓐ 동시증여 + 대납 — 상증령 §46①2호 안분 ↔ 대납 fold-back 미지원
      if (data.deductionInput?.simultaneousGifts && data.deductionInput.simultaneousGifts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["donorPaysGiftTax"],
          message: "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다.",
        });
      }
      // ⓑ 2-스트림 특례 + 대납 — aggregatedOrdinaryValue 주입 미지원
      if (data.creditInput?.specialTreatment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["donorPaysGiftTax"],
          message: "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다.",
        });
      }
      // ⓒ 세대생략(donorGroup=B) + 대납 — §57 grossGiftValue 조정 미구현
      if (getDonorGroup(data.donor) === "B") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["donorPaysGiftTax"],
          message: "세대생략 할증 대상 증여와 대납(代納)은 현재 함께 계산할 수 없습니다.",
        });
      }
    }
  });

export type GiftTaxInputSchema = z.infer<typeof giftTaxInputSchema>;
