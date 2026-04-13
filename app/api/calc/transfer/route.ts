/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

// ============================================================
// Zod 입력 스키마 (⑫-1)
// ============================================================

const temporaryTwoHouseSchema = z.object({
  previousAcquisitionDate: z.string().date(),
  newAcquisitionDate: z.string().date(),
});

const reductionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("self_farming"),
    farmingYears: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("long_term_rental"),
    rentalYears: z.number().int().nonnegative(),
    rentIncreaseRate: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("new_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
  z.object({
    type: z.literal("unsold_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
]);

const inputSchema = z
  .object({
    /** 1. 물건 종류 */
    propertyType: z.enum(["housing", "land", "building"]),
    /** 2. 양도가액 (원, 양수 정수) */
    transferPrice: z.number().int().positive(),
    /** 3. 양도일 (YYYY-MM-DD) */
    transferDate: z.string().date(),
    /** 4. 취득가액 (0이면 환산취득가 사용) */
    acquisitionPrice: z.number().int().nonnegative(),
    /** 5. 취득일 (YYYY-MM-DD) */
    acquisitionDate: z.string().date(),
    /** 6. 필요경비 */
    expenses: z.number().int().nonnegative(),
    /** 7. 환산취득가 사용 여부 */
    useEstimatedAcquisition: z.boolean(),
    /** 8. 취득시 기준시가 */
    standardPriceAtAcquisition: z.number().int().positive().optional(),
    /** 9. 양도시 기준시가 */
    standardPriceAtTransfer: z.number().int().positive().optional(),
    /** 10. 세대 보유 주택 수 */
    householdHousingCount: z.number().int().min(0),
    /** 11. 거주기간 (월) */
    residencePeriodMonths: z.number().int().nonnegative(),
    /** 12. 양도일 기준 조정대상지역 여부 */
    isRegulatedArea: z.boolean(),
    /** 13. 취득일 기준 조정대상지역 여부 */
    wasRegulatedAtAcquisition: z.boolean(),
    /** 14. 미등기 여부 */
    isUnregistered: z.boolean(),
    /** 15. 비사업용 토지 여부 */
    isNonBusinessLand: z.boolean(),
    /** 16. 1세대 여부 */
    isOneHousehold: z.boolean(),
    /** 17. 일시적 2주택 정보 */
    temporaryTwoHouse: temporaryTwoHouseSchema.optional(),
    /** 18. 조세특례 감면 목록 */
    reductions: z.array(reductionSchema).default([]),
    /** 19. 당해 연도 기사용 기본공제 */
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
  })
  .superRefine((data, ctx) => {
    // V-1: 환산취득가 사용 시 취득시 기준시가 필수
    if (data.useEstimatedAcquisition && !data.standardPriceAtAcquisition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["standardPriceAtAcquisition"],
        message: "환산취득가 사용 시 취득시 기준시가 필수",
      });
    }
    // V-2: 환산취득가 사용 시 양도시 기준시가 필수
    if (data.useEstimatedAcquisition && !data.standardPriceAtTransfer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["standardPriceAtTransfer"],
        message: "환산취득가 사용 시 양도시 기준시가 필수",
      });
    }
    // V-3: 취득일은 양도일보다 이전이어야 함
    if (data.acquisitionDate >= data.transferDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acquisitionDate"],
        message: "취득일은 양도일보다 이전이어야 합니다",
      });
    }
  });

// ============================================================
// POST handler (⑫-2, ⑫-3)
// ============================================================

export async function POST(request: NextRequest) {
  // 단계 1: JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // 단계 2: Zod 검증
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      {
        error: {
          code: TaxErrorCode.INVALID_INPUT,
          message: "입력값이 올바르지 않습니다",
          fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  // 단계 3: string → Date 변환
  const data = parsed.data;
  const transferDate = new Date(data.transferDate);
  const acquisitionDate = new Date(data.acquisitionDate);

  const engineInput: TransferTaxInput = {
    propertyType: data.propertyType,
    transferPrice: data.transferPrice,
    transferDate,
    acquisitionPrice: data.acquisitionPrice,
    acquisitionDate,
    expenses: data.expenses,
    useEstimatedAcquisition: data.useEstimatedAcquisition,
    standardPriceAtAcquisition: data.standardPriceAtAcquisition,
    standardPriceAtTransfer: data.standardPriceAtTransfer,
    householdHousingCount: data.householdHousingCount,
    residencePeriodMonths: data.residencePeriodMonths,
    isRegulatedArea: data.isRegulatedArea,
    wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
    isUnregistered: data.isUnregistered,
    isNonBusinessLand: data.isNonBusinessLand,
    isOneHousehold: data.isOneHousehold,
    temporaryTwoHouse: data.temporaryTwoHouse
      ? {
          previousAcquisitionDate: new Date(data.temporaryTwoHouse.previousAcquisitionDate),
          newAcquisitionDate: new Date(data.temporaryTwoHouse.newAcquisitionDate),
        }
      : undefined,
    reductions: data.reductions,
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
  };

  // 단계 4: 세율 로드
  let rates;
  try {
    rates = await preloadTaxRates(["transfer"], transferDate);
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "TAX_RATE_NOT_FOUND", message: "세율 데이터를 로드할 수 없습니다" } },
      { status: 500 },
    );
  }

  // 단계 5: 계산 실행
  try {
    const result = calculateTransferTax(engineInput, rates);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다" } },
      { status: 500 },
    );
  }
}
