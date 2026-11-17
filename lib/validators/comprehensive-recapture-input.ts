/**
 * 합산배제 추징 계산기 Zod 스키마 (`/api/calc/comprehensive-recapture`)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.3·§5.5·§7(Q-6·Q-12)
 *
 * - 연도별 경감세액: 1~20행 · 정수 · 0 이상 · 연도 중복 거부(자동 병합 없음)
 * - 연도 범위: 2009 ~ 고지 연도(Q-12) · 고지일 하한 2009-02-04(Q-6 — 이자 규정 시작 전 고지일 거부)
 * - 날짜는 `YYYY-MM-DD`(존재하는 날짜) — route가 `toDate`로 UTC 자정 Date로 바꾼다
 * - 사유별 입력은 discriminatedUnion(`reason`)
 * - §10③3호 가목 신청일 상한 2020-08-17(V-12 — 2020.8.18. 민특법 개정으로 두 유형 폐지 · ⑧ 같은 규칙)
 */

import { z } from "zod";
import { COMPREHENSIVE_EXCL_CONST } from "@/lib/tax-engine/legal-codes";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 달력에 있는 날짜인가 — `2024-02-31`은 정규식을 통과하지만 `Date`로는 무효다 */
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const isoDate = z
  .string()
  .regex(ISO, { message: "YYYY-MM-DD 형식이어야 합니다." })
  .refine(isRealDate, { message: "존재하지 않는 날짜입니다." });

/** §10③1호가 열거한 호(제3조제1항 1·2·7·8·10·11호)의 임대 유형 — `rentViolationApplies`와 같은 집합 */
const rent5pctTypeSchema = z.enum([
  "private_construction",
  "public_construction",
  "private_purchase_short",
  "public_purchase",
  "public_support_construction",
  "private_purchase_long",
  "public_support_purchase",
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);

const exemptionSchema = z.discriminatedUnion("reason", [
  z.object({ reason: z.literal("other") }),
  z.object({
    reason: z.literal("rent_over_5pct"),
    registrationType: rent5pctTypeSchema,
    rentalStartDate: isoDate,
    rentalApplicationDate: isoDate.optional(),
    rentalRegistrationDate: isoDate,
    ceasedDate: isoDate,
  }),
  z.object({
    reason: z.literal("registration_cancelled"),
    cancelClause: z.enum(["6①11호", "6⑤", "other"]),
  }),
  z.object({
    reason: z.literal("replacement_housing"),
    cause: z.enum(["redevelopment_reconstruction", "small_scale_redevelopment", "remodeling"]),
    originalKind: z.enum(["short_term", "other"]),
    newHousing: z.object({
      completionDate: isoDate,
      isApartment: z.boolean(),
      registeredAsRental: z.boolean(),
      application: z
        .object({
          kind: z.enum(["long_general_apartment_purchase", "short_term", "other"]),
          date: isoDate,
        })
        .nullable()
        .optional(),
    }),
  }),
]);

const FIRST_TAX_YEAR = 2009;

export const comprehensiveRecaptureInputSchema = z
  .object({
    /** 추징할 세액의 고지일(§10②1호 종기) — 2009-02-04 이상 */
    noticeDate: isoDate.refine((s) => s >= COMPREHENSIVE_EXCL_CONST.RECAPTURE_INTEREST_RULE_START, {
      message: "고지일은 2009-02-04 이후여야 합니다 — 이자상당가산액 규정이 있는 시행본 이후만 계산합니다.",
    }),
    rows: z
      .array(
        z.object({
          taxYear: z.number().int(),
          amount: z.number().int().min(0, { message: "경감세액은 0원 이상이어야 합니다." }),
        }),
      )
      .min(1, { message: "연도별 경감세액을 1행 이상 입력하세요." })
      .max(COMPREHENSIVE_EXCL_CONST.RECAPTURE_MAX_ROWS, {
        message: `연도별 경감세액은 최대 ${COMPREHENSIVE_EXCL_CONST.RECAPTURE_MAX_ROWS}행까지 입력할 수 있습니다.`,
      }),
    exemption: exemptionSchema,
  })
  .superRefine((v, ctx) => {
    const ex = v.exemption;
    if (ex.reason === "replacement_housing") {
      const app = ex.newHousing.application;
      if (app && app.kind !== "other" && app.date > COMPREHENSIVE_EXCL_CONST.RECAPTURE_EXEMPT_3HO_GA_UNTIL) {
        ctx.addIssue({
          code: "custom",
          path: ["exemption", "newHousing", "application", "date"],
          message: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_3HO_GA_ABOLISHED,
        });
      }
    }
    const noticeYear = Number(v.noticeDate.slice(0, 4));
    const seen = new Set<number>();
    v.rows.forEach((r, i) => {
      if (seen.has(r.taxYear)) {
        ctx.addIssue({ code: "custom", path: ["rows", i, "taxYear"], message: `과세연도 ${r.taxYear}이(가) 중복됩니다.` });
      }
      seen.add(r.taxYear);
      if (r.taxYear < FIRST_TAX_YEAR || r.taxYear > noticeYear) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", i, "taxYear"],
          message: `과세연도는 ${FIRST_TAX_YEAR}년부터 고지 연도(${noticeYear}년)까지여야 합니다.`,
        });
      }
    });
  });

export type ComprehensiveRecaptureInput = z.infer<typeof comprehensiveRecaptureInputSchema>;
