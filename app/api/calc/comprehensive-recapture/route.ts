/**
 * POST /api/calc/comprehensive-recapture — 합산배제 추징세액·이자상당가산액 (종합부동산세법 §17⑤1호 · 시행령 §10)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.5
 *
 * Rate Limiting → Zod 검증 → Date 변환(`date-coerce`) → `calculateRecapture` → `finiteJson`
 *
 * 세율 DB(`preloadTaxRates`)를 쓰지 않는다 — 이자율은 시행령 §10②2호·부칙의 법정 상수이고 연도별 구간은 엔진이 가른다.
 * 본 계산 route(`/api/calc/comprehensive`)와 독립이다(재산세 연동·합산배제 판정 없음 — 연도별 경감세액을 입력으로 받는다).
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import {
  comprehensiveRecaptureInputSchema,
  type ComprehensiveRecaptureInput,
} from "@/lib/validators/comprehensive-recapture-input";
import { calculateRecapture } from "@/lib/tax-engine/comprehensive-recapture";
import type { RecaptureExemptionInput, RecaptureInput } from "@/lib/tax-engine/types/comprehensive-recapture.types";

/** ⑭ Zod 출력(날짜 문자열) → 엔진 입력(UTC 자정 Date) */
function toEngineExemption(e: ComprehensiveRecaptureInput["exemption"]): RecaptureExemptionInput {
  switch (e.reason) {
    case "other":
      return { reason: "other" };
    case "rent_over_5pct":
      return {
        reason: "rent_over_5pct",
        registrationType: e.registrationType,
        rentalStartDate: toDate(e.rentalStartDate, "exemption.rentalStartDate"),
        rentalApplicationDate: toOptionalDate(e.rentalApplicationDate),
        rentalRegistrationDate: toDate(e.rentalRegistrationDate, "exemption.rentalRegistrationDate"),
        ceasedDate: toDate(e.ceasedDate, "exemption.ceasedDate"),
      };
    case "registration_cancelled":
      return { reason: "registration_cancelled", cancelClause: e.cancelClause };
    case "replacement_housing":
      return {
        reason: "replacement_housing",
        cause: e.cause,
        originalKind: e.originalKind,
        newHousing: {
          completionDate: toDate(e.newHousing.completionDate, "exemption.newHousing.completionDate"),
          isApartment: e.newHousing.isApartment,
          registeredAsRental: e.newHousing.registeredAsRental,
          application: e.newHousing.application
            ? {
                kind: e.newHousing.application.kind,
                date: toDate(e.newHousing.application.date, "exemption.newHousing.application.date"),
              }
            : null,
        },
      };
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`comprehensive-recapture:${ip}`, {
    limit: 30,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  const parsed = comprehensiveRecaptureInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "입력값이 올바르지 않습니다",
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  // 계산 오류와 NaN·Infinity 결과(`finiteJson`)는 500으로 응답한다.
  try {
    const data = parsed.data;
    const input: RecaptureInput = {
      noticeDate: toDate(data.noticeDate, "noticeDate"),
      rows: data.rows.map((r) => ({ taxYear: r.taxYear, amount: r.amount })),
      exemption: toEngineExemption(data.exemption),
    };
    return finiteJson({ data: calculateRecapture(input) }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/calc/comprehensive-recapture]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
