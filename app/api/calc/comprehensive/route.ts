/**
 * 종합부동산세 계산 API Route (T-12)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → JSON 파싱 → Zod 검증 → 날짜 변환 → preloadTaxRates → calculateComprehensiveTax → saveCalculation → 결과 반환
 *
 * POST /api/calc/comprehensive
 *
 * 2-레이어 아키텍처:
 *   Layer 1 (여기): Rate Limit, 검증, 세율 로드 (종부세 + 재산세 통합)
 *   Layer 2 (comprehensive-tax.ts): 순수 계산 엔진 — property-tax.ts를 내부에서 자동 호출
 *
 * 과세기준일: assessmentYear-06-01 (종합부동산세법 §16①)
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { comprehensiveTaxInputSchema } from "@/lib/validators/comprehensive-input";
import { calculateComprehensiveTax } from "@/lib/tax-engine/comprehensive-tax";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { saveCalculation } from "@/actions/calculations";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  ComprehensiveTaxInput,
  ComprehensiveProperty,
  RentalExclusionInput,
  OtherExclusionInput,
} from "@/lib/tax-engine/types/comprehensive.types";
import type { ComprehensiveTaxInputSchema } from "@/lib/validators/comprehensive-input";

// ─────────────────────────────────────────────────────────────
// 날짜 변환 헬퍼 — Zod 검증된 string 날짜 → Date 객체
// ─────────────────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" 문자열을 Date 객체로 변환
 * Zod 검증 후에만 호출되므로 형식은 보장된 상태
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Zod 파싱 결과를 순수 엔진 입력 타입으로 변환
 *
 * Zod 스키마는 날짜를 string으로 받고, 엔진은 Date 객체를 요구함.
 * RentalExclusionInput의 rentalRegistrationDate, rentalStartDate,
 * OtherExclusionInput의 recruitmentNoticeDate, acquisitionDate를 변환.
 */
function toEngineInput(
  schema: ComprehensiveTaxInputSchema,
  assessmentDate: Date,
): ComprehensiveTaxInput {
  const properties: ComprehensiveProperty[] = schema.properties.map((p) => {
    const rentalInfo: RentalExclusionInput | undefined = p.rentalInfo
      ? {
          ...p.rentalInfo,
          rentalRegistrationDate: parseDate(p.rentalInfo.rentalRegistrationDate),
          rentalStartDate: parseDate(p.rentalInfo.rentalStartDate),
          assessmentDate,
        }
      : undefined;

    const otherInfo: OtherExclusionInput | undefined = p.otherInfo
      ? {
          ...p.otherInfo,
          recruitmentNoticeDate: p.otherInfo.recruitmentNoticeDate
            ? parseDate(p.otherInfo.recruitmentNoticeDate)
            : undefined,
          acquisitionDate: p.otherInfo.acquisitionDate
            ? parseDate(p.otherInfo.acquisitionDate)
            : undefined,
        }
      : undefined;

    return {
      propertyId: p.propertyId,
      assessedValue: p.assessedValue,
      area: p.area,
      location: p.location,
      exclusionType: p.exclusionType ?? "none",
      rentalInfo,
      otherInfo,
    };
  });

  return {
    properties,
    isOneHouseOwner: schema.isOneHouseOwner,
    birthDate: schema.birthDate ? parseDate(schema.birthDate) : undefined,
    acquisitionDate: schema.acquisitionDate
      ? parseDate(schema.acquisitionDate)
      : undefined,
    assessmentYear: schema.assessmentYear,
    isMultiHouseInAdjustedArea: schema.isMultiHouseInAdjustedArea,
    previousYearTotalTax: schema.previousYearTotalTax,
    landAggregate: schema.landAggregate,
    landSeparate: schema.landSeparate,
    targetDate: schema.targetDate,
  };
}

// ─────────────────────────────────────────────────────────────
// POST Handler
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ─────────────────────────────────────────────
  // 1. Rate Limiting (IP당 분당 30회)
  // ─────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(`comprehensive:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        },
      },
      { status: 429 },
    );
  }

  // ─────────────────────────────────────────────
  // 2. JSON 파싱
  // ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "요청 본문이 올바른 JSON이 아닙니다.",
        },
      },
      { status: 400 },
    );
  }

  // ─────────────────────────────────────────────
  // 3. Zod 입력 검증
  // ─────────────────────────────────────────────
  const parsed = comprehensiveTaxInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "입력값이 올바르지 않습니다.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const schema = parsed.data;

  // 과세기준일 확정: targetDate 우선, 없으면 assessmentYear-06-01
  const taxBaseDateStr = schema.targetDate ?? `${schema.assessmentYear}-06-01`;
  const taxBaseDate = new Date(taxBaseDateStr);

  // ─────────────────────────────────────────────
  // 4. 세율 로드 (Supabase 미설정 시 graceful skip)
  //
  //    종부세·재산세 두 세율을 1회 쿼리로 로드.
  //    ('property' 포함 이유: 종부세 엔진이 내부에서
  //     property-tax.ts를 호출하여 재산세를 자동 계산하고
  //     재산세 비율 안분 공제에 사용)
  // ─────────────────────────────────────────────
  let rates: TaxRatesMap | undefined;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(
        ["comprehensive_property", "property"],
        taxBaseDate,
      );
    } catch (err) {
      // DB 연결 실패 시 엔진 내부 상수로 계산 진행
      console.warn(
        "[POST /api/calc/comprehensive] preloadTaxRates 실패, 내부 상수 사용:",
        err,
      );
    }
  }

  // ─────────────────────────────────────────────
  // 5. Zod 검증 데이터 → 엔진 입력 타입 변환
  //    (string 날짜 → Date 객체)
  // ─────────────────────────────────────────────
  const engineInput = toEngineInput(schema, taxBaseDate);

  // ─────────────────────────────────────────────
  // 6. 순수 엔진 계산
  //    calculateComprehensiveTax 내부에서:
  //      - 합산배제 판정
  //      - 주택분 종부세 계산 (7단계 누진세율)
  //      - property-tax.ts 자동 호출 → 재산세 계산
  //      - 재산세 비율 안분 공제
  //      - 1세대1주택 공제 (isOneHouseOwner=true)
  //      - 세부담 상한
  //      - 농어촌특별세 20%
  //      - 토지분 종합합산 / 별도합산 (입력 시)
  // ─────────────────────────────────────────────
  let result;
  try {
    result = calculateComprehensiveTax(engineInput, rates);
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/comprehensive]", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "종합부동산세 계산 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }

  // ─────────────────────────────────────────────
  // 7. 이력 저장 (로그인 사용자만, 비동기 non-blocking)
  //    실패해도 계산 결과 반환에 영향 없음
  // ─────────────────────────────────────────────
  saveCalculation({
    taxType: "comprehensive_property",
    inputData: body as Record<string, unknown>,
    resultData: result as unknown as Record<string, unknown>,
    taxLawVersion: taxBaseDateStr,
  }).catch((err) => {
    console.warn("[POST /api/calc/comprehensive] saveCalculation 실패:", err);
  });

  return NextResponse.json({ data: result });
}
