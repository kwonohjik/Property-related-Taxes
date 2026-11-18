/**
 * 종합부동산세 임대주택 합산배제 입력 Zod 스키마 (시행령 §3) — comprehensive-input.ts에서 분리(800줄 정책 · 행동 불변).
 * T-14 의제 다가구(`deemedMultiFamily`)가 붙으면서 `rentalRegistrationDate`는 의제가 없을 때만 필수다.
 */

import { z } from "zod";
import { rentIncreaseLimitApplies } from "@/lib/tax-engine/comprehensive-exclusion";

/** 대통령령 제30404호 시행일(YYYY-MM-DD) — 세무서 사업자등록일이 이 날 전이어야 종전 의제 규정이 닿는다(문자열 비교 · ⑧과 같은 값) */
const DEEMED_MULTIFAMILY_CUTOFF = "2020-02-11";

// ============================================================
// 임대주택 합산배제 입력 스키마 (시행령 §3)
// ============================================================

const rentalRegistrationTypeSchema = z.enum([
  "private_construction",
  "private_purchase_long",
  "private_purchase_short",
  "public_support_construction",
  "public_support_purchase",
  "public_construction",
  "public_purchase",
  "existing_rental",
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
  "unsold_purchase",
  "vacant_construction",
  "reit_purchase",
  "public_conversion_pending",
]);

const isoDateOptional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
  .optional();

export const rentalExclusionInfoSchema = z.object({
  /** 임대등록 유형 */
  registrationType: rentalRegistrationTypeSchema,

  /** 임대사업자 등록일 (YYYY-MM-DD) — `deemedMultiFamily`가 없으면 필수(아래 refine) */
  rentalRegistrationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /** 임대개시일 (YYYY-MM-DD) — 4·9호(「소유」)는 없어도 된다(아래 refine). 그 밖은 필수 */
  rentalStartDate: isoDateOptional,

  /** 공시가격 (원, 양의 정수) */
  assessedValue: z
    .number()
    .int({ message: "공시가격은 원 단위 정수여야 합니다." })
    .nonnegative({ message: "공시가격은 0원 이상이어야 합니다." }),

  /** 전용면적 (㎡) */
  area: z
    .number()
    .positive({ message: "전용면적은 0㎡ 초과여야 합니다." }),

  /** 수도권 여부 */
  location: z.enum(["metro", "non_metro"]),

  /** 직전 임대료 (환산 월세 기준, 원) */
  previousRent: z
    .number()
    .nonnegative()
    .optional(),

  /** 가격 판정 기준 공시가격(원) — 임대개시일 등 또는 최초 합산배제신고 연도 과세기준일(종부령 §3① 가목). 0은 받지 않는다(빈칸=보내지 않음) */
  priceBasisValue: z
    .number()
    .int({ message: "기준 공시가격은 원 단위 정수여야 합니다." })
    .positive({ message: "기준 공시가격은 0원보다 커야 합니다." })
    .optional(),

  /** 과세기준일 현재 공실(§3⑦4호) · 기존 임차인 퇴거일 — 엔진 comprehensive-exclusion-vacancy.ts */
  rentalVacantAtAssessment: z.boolean().optional(),
  vacancyEvictionDate: isoDateOptional,
  /** §3⑧ 5% 넘게 올린 계약일 — 엔진 comprehensive-exclusion-rent-violation.ts */
  rentViolationDate: isoDateOptional,

  /** 현재 임대료 (원) */
  currentRent: z
    .number()
    .nonnegative({ message: "임대료는 0원 이상이어야 합니다." }),

  /** 처음 쓴 표준임대차계약 여부(2019.2.12. 이후 — 5% 비교 제외) */
  isInitialContract: z.boolean(),

  /** 실제 임대 경과 연수 (시행령 §3⑦ 합산, 선택) — 의무기간 미달 시 추징 경고용 */
  actualRentalYears: z
    .number()
    .nonnegative({ message: "임대 경과 연수는 0년 이상이어야 합니다." })
    .optional(),

  /** 세무서 사업자등록일 (YYYY-MM-DD) — §3①1호·2호 단서 2018.3.31. 판정(민간건설·민간매입). 없으면 그 두 유형은 불성립 */
  businessRegistrationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /** 사용승인일 (YYYY-MM-DD, 선택) — §3①1호·7호 가목 6억/9억 적용례(대통령령 제31447호 부칙 제2조). 없으면 6억 + 확인 필요 */
  usageApprovalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /** 임대등록 말소일 (YYYY-MM-DD, 선택) — 과세기준일(당일 포함)까지 말소면 합산배제 거부(§3①) */
  registrationRevokedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /** 읍·면 지역 여부 (existing_rental §3①3호 전용 — 읍면 100㎡ / 그외 85㎡ 면적 상한) */
  isEupMyeonArea: z.boolean().optional(),
  /** 30호 이상 여부 (§3①1·2·7·8호 공시가격 상한 tier) */
  isThirtyPlusUnits: z.boolean().optional(),
  /** §3①1·3·7·10호 「요건을 모두 갖춘 주택이 2호 이상」 — 이 주택 포함 호수. 그 네 유형에서 없으면 엔진이 「모름」=불성립 */
  qualifyingUnitCount: z.number().int().nonnegative().optional(),

  // ── §3①8호 나목 1)~4)·7호 단서 (엔진 comprehensive-exclusion-8ho-na.ts) — 없으면 엔진이 「모름」=불성립 ──
  acquisitionDate: isoDateOptional,
  depositPaidDate: isoDateOptional,
  acquiredViaMergedPeriod: z.boolean().optional(),
  householdOwnedHouseAtAcquisition: z.boolean().nullable().optional(),
  regulatedAtAssessment: z.boolean().nullable().optional(),
  regulatedNoticeDate: isoDateOptional,
  rentalApplicationDate: isoDateOptional,
  businessRegistrationApplicationDate: isoDateOptional,
  isApartment: z.boolean().nullable().optional(),
  convertedFromShortTerm: z.boolean().nullable().optional(),
  shortTermConversionDate: isoDateOptional,

  // ── §3①6호 미분양매입임대 (엔진 comprehensive-exclusion-6ho.ts) — 없으면 엔진이 「모름」=불성립 ──
  unsoldContractDate: isoDateOptional,
  isUnsoldFirstComeSupply: z.boolean().nullable().optional(),
  unsoldDocsSubmitted: z.boolean().nullable().optional(),
  unsoldUnitCount: z.number().int().nonnegative().optional(),
  purchaseRental2hoCount: z.number().int().nonnegative().optional(),
  existingRental3hoSameRegionCount: z.number().int().nonnegative().optional(),
  reitRental5hoCount: z.number().int().nonnegative().optional(),
  rentalRegistrationKind: z.enum(["short_term", "long_term_general", "public_support", "other"]).optional(),

  // ── §3①4·5·9호 (엔진 comprehensive-exclusion-{4,5,9}ho.ts) — 없으면 엔진이 「모름」=불성립 ──
  neverRentedSinceApproval: z.boolean().nullable().optional(),
  reitAcquisitionDate: isoDateOptional,
  reitPrice2008Under6eok: z.boolean().nullable().optional(),
  conversionBase: z.enum(["construction", "purchase"]).optional(),
  isConversionPublicRental: z.boolean().nullable().optional(),
  mandatoryPeriodEndDate: isoDateOptional,
  conversionCompleted: z.boolean().nullable().optional(),

  // ── T-14 2020.2.11. 전 세무서에만 등록한 다가구(부칙<제30404호> §6) — 엔진 comprehensive-exclusion-multifamily.ts ──
  // 있으면 세무서 사업자등록일을 §5 등록일로 보아 판정(지자체 등록일·말소일은 보지 않는다) · 구별(1구=1호) 면적·공시가격
  deemedMultiFamily: z
    .object({
      units: z
        .array(
          z.object({
            label: z.string(),
            area: z.number().positive({ message: "구별 면적은 0㎡ 초과여야 합니다." }),
            assessedValue: z
              .number()
              .int({ message: "구별 공시가격은 원 단위 정수여야 합니다." })
              .positive({ message: "구별 공시가격은 0원보다 커야 합니다." }),
          }),
        )
        .min(1, { message: "구별(층별) 행이 1개 이상 필요합니다." }),
      noConversionAfterCutoff: z.boolean(),
    })
    .optional(),
}).refine(
  // 지자체 임대사업자 등록일은 의제 다가구가 아니면 필수 — 의제면 세무서 등록일이 그 자리를 대신한다(아래 refine)
  (r) => r.deemedMultiFamily !== undefined || r.rentalRegistrationDate !== undefined,
  { message: "임대사업자 등록일을 입력하세요 (YYYY-MM-DD).", path: ["rentalRegistrationDate"] },
).refine(
  // T-14 — 1·2호 유형만 · 세무서 사업자등록일이 있고 2020.2.11. 전(⑧ validateDeemedMultiFamilyInputs와 같은 조건)
  (r) => {
    if (!r.deemedMultiFamily) return true;
    return (
      (r.registrationType === "private_construction" || r.registrationType === "private_purchase_short") &&
      r.businessRegistrationDate !== undefined &&
      r.businessRegistrationDate < DEEMED_MULTIFAMILY_CUTOFF
    );
  },
  {
    message:
      "2020.2.11. 전 세무서에만 등록한 다가구주택은 민간건설·민간매입임대(§3①1호·2호)이고 세무서 사업자등록일이 2020.2.11. 전이어야 합니다 (종합부동산세법 시행령 부칙<대통령령 제30404호> 제6조).",
    path: ["deemedMultiFamily"],
  },
).refine(
  // §3① 각 호 외의 부분 — 4·9호는 「소유」라 임대개시일이 없을 수 있다. 그 밖 유형은 임대개시일 필수(종전과 같음)
  (r) => r.rentalStartDate !== undefined || r.registrationType === "vacant_construction" || r.registrationType === "public_conversion_pending",
  { message: "임대개시일을 입력하세요 (YYYY-MM-DD).", path: ["rentalStartDate"] },
).refine(
  // 5% 요건 유형에서 처음 쓴 표준임대차계약이 아니면 직전 임대료가 있어야 증가율을 본다 — 없으면 엔진이 조용히 통과시켰다(⑧과 같은 술어)
  // 공실이면 그해 계약이 없어 5% 비교를 하지 않는다(T-12 Q-5 a — ⑧과 같은 면제)
  (r) => !rentIncreaseLimitApplies(r.registrationType) || r.rentalVacantAtAssessment === true || r.isInitialContract || r.previousRent !== undefined,
  { message: "처음 쓴 표준임대차계약이 아니면 직전 임대료(월)를 입력하세요 — 임대료 증가율 5% 요건 (종합부동산세법 시행령 §3①).", path: ["previousRent"] },
);
