/**
 * 사전증여 내역 Zod 스키마 (상속세 preGiftsWithin10Years · 증여세 priorGiftsWithin10Years 공용)
 *
 * 800줄 정책으로 property-valuation-input.ts에서 분리 (2026-06-07, §53의2 superRefine 추가 시).
 * property-valuation-input.ts가 re-export하므로 기존 import 사이트 무변경.
 */
import { z } from "zod";
import { checkCorporateGiftRule } from "@/lib/calc/prior-gift-corporate-rule";
import { checkMarriageBirthGiftRule } from "@/lib/calc/prior-gift-marriage-birth-rule";
import { checkDeceasedDonorRule } from "@/lib/calc/prior-gift-deceased-rule";

/** Phase A: 증여자 관계 enum (7그룹 8값, gift-prior-aggregation.ts와 동일) */
export const giftDonorRelationSchema = z.enum([
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
]);

export const priorGiftSchema = z
  .object({
    giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
    isHeir: z.boolean().optional(),
    giftAmount: z.number().nonnegative(),
    giftTaxPaid: z.number().nonnegative(),
    giftTaxBase: z.number().nonnegative().optional(),
    // §28① 단서 전단 — 증여세 부과제척기간 만료(국기법 §26의2④⑤) → 상속세 증여세액공제 제외
    giftTaxTimeBarred: z.boolean().optional(),
    doneeRelation: z
      .enum([
        "spouse",
        "lineal_ascendant_adult",
        "lineal_ascendant_minor",
        "lineal_descendant",
        "other_relative",
      ])
      .optional(),
    // Phase A: 동일인 §47 합산 + §58/§57 한도 산식용
    donor: giftDonorRelationSchema.optional(),
    computedTax: z.number().nonnegative().optional(),
    additionalGenerationSkipSurcharge: z.number().nonnegative().optional(),
    wasGenerationSkip: z.boolean().optional(),
    // 종합사례 PDF 확장 — 상속인별 배부·영리법인 면제
    doneeId: z.string().min(1).optional(),
    beneficiaryType: z.enum(["heir", "legatee", "corporate"]).optional(),
    corporateGiftComputedTax: z.number().nonnegative().optional(),
    // UI 메타 (이력 조회 출처) — 엔진 무시. buildInput에서 strip(④) 누락 안전망(⑨).
    sourceCalculationId: z.string().optional(),
    // 신고서 부표 1 표시 메타 (2026-05-20) — 엔진 무관
    // PR 3 (2026-05-22): real_estate_individual_house · officetel · acquisition_right 신규 + isAttachedLandToBuilding
    propertyCategory: z
      .enum([
        "cash",
        "real_estate_land",
        "real_estate_individual_house",
        "real_estate_apartment",
        "real_estate_officetel",
        "real_estate_building",
        "real_estate_acquisition_right",
        "listed_stock",
        "unlisted_stock",
        "financial",
        "deposit",
        "other",
      ])
      .optional(),
    propertyName: z.string().optional(),
    propertyLocation: z.string().optional(),
    isAttachedLandToBuilding: z.boolean().optional(),
    // §53의2 혼인·출산 증여재산공제 — 직계존속 giftTaxBase 미설정 분기에서 §24·§19 분자 차감용 (2026-06-07)
    marriageBirthDeduction: z.number().nonnegative().optional(),
    // [C] 증여 당시 수증자 미성년 여부 — §53 직계존속 미성년 2천 분기 (birthDate 미입력 시 fallback)
    doneeWasMinorAtGift: z.boolean().optional(),
    // [B] 상속세 모드 과세표준 산정 방식 (UI 메타 — 엔진 무시, giftTaxBase 유무로 branch)
    priorGiftTaxBaseInputMode: z.enum(["auto", "manual"]).optional(),
    // ===== 조특법 특례 2-스트림 분리과세 (§30의5①후단·§30의5⑪·§30의6⑤) =====
    // T-10: 동기화 지점 ⑨⑫ — types/inheritance-prior-gift.types.ts PriorGift와 동기화
    /**
     * 과거 특례 회차 구분 — §30의5①후단·§30의6⑤ 기간무관 합산용.
     * "startup": 창업자금 (§30의5) — §47② 일반 합산 제외, 특례 스트림에서 기간무관 합산
     * "family_business": 가업승계 (§30의6) — §30의6⑤ 준용
     * undefined: 일반 증여 (§47② 10년 cutoff 합산)
     */
    specialTreatmentType: z.enum(["startup", "family_business"]).optional(),
    /**
     * 과거 특례 회차에서 실제 납부한 특례세액 (이중과세 방지 차감용).
     * §30의5①후단 합산 시: max(0, 합산기준특례산출세액 - Σ priorSpecialTaxPaid)
     * specialTreatmentType 있을 때만 유효. 미입력 시 0으로 처리.
     */
    priorSpecialTaxPaid: z.number().nonnegative().optional(),
    // ===== 조특법 §71 영농자녀 농지 감면 (gift-farmland-reduction-71) — 동기화 지점 ⑫ =====
    /** 그 회차 §71 농지 감면 적용 여부 (5년 1억 한도 누계 식별) */
    farmlandReductionApplied: z.boolean().optional(),
    /** 그 회차 감면받은 증여세액 — farmlandReductionApplied=true 시 필수(client validate ⑧) */
    farmlandReductionAmount: z.number().nonnegative().optional(),
    /** §71⑥ 그 회차 농지 과세부분(㉯) — 설정 시 §47② 합산에 giftAmount 대신 사용 (감면농지 prior) */
    farmlandTaxablePortion: z.number().nonnegative().optional(),
    /**
     * 그 회차 증여자 사망일 — 재산-58·서일46014-11750. 금번 증여일 전 사망 시 §47② 합산 제외.
     * 동기화 지점 ⑫ — strip 방지. types/inheritance-prior-gift.types.ts PriorGift.donorDeceasedDate와 동기화.
     */
    donorDeceasedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
      .optional(),
  })
  .superRefine((data, ctx) => {
    // 영리법인 사전증여 필수요건 (동기화 지점 ⑨)
    // 공유 헬퍼 checkCorporateGiftRule 단일진실 — client validatePriorGift(⑧)와 동일 규칙
    // 법령 근거: §13①2호(상속인 아닌 자) · §4의2③(법인세 부과 시 증여세 미부과) · §3의2②(면제 한도)
    const corpError = checkCorporateGiftRule(data);
    if (corpError !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: corpError,
        path: ["corporateGiftComputedTax"],
      });
    }
    // §53의2 혼인·출산 — client validatePriorGift(⑧)와 단일진실 헬퍼 공용 (서버 대칭)
    const mbError = checkMarriageBirthGiftRule(data);
    if (mbError !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: mbError,
        path: ["marriageBirthDeduction"],
      });
    }
    // 증여자 사망 합산제외 (재산-58) — client validatePriorGift(⑧)와 단일진실 헬퍼 공용
    const deceasedError = checkDeceasedDonorRule(data);
    if (deceasedError !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: deceasedError,
        path: ["donorDeceasedDate"],
      });
    }
  });
