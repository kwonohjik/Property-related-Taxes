/**
 * 국외전출세 API — Zod 입력 스키마 (14지점 ⑨⑫) — PR-4B
 *
 * 분리 근거: stock-transfer-tax-schema.ts 800줄 정책 준수를 위해 분리 (2026-05-19)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 주의: TypeScript는 이 파일의 필드 누락을 감지하지 못함 (⑫ 점검).
 * 신규 필드 추가 시 반드시 이 파일에도 추가.
 */

import { z } from "zod";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { findExitTaxInputProblem } from "@/lib/tax-engine/stock-transfer/exit-tax-input-check";
import { buildExitTaxEngineInput } from "./stock-transfer-exit-tax-engine-input";

// ============================================================
// ⑫ PR-4B 국외전출세 Zod 입력 스키마 (14지점 ⑨⑫)
//
// 법령: §118의9~§118의16
// 주의: TypeScript 미감지 — 신규 필드 추가 시 반드시 여기도 추가
// ============================================================

/** ⑨ Zod enum: 출국일 시가 산정 모드 (§178의9) */
export const departureDayValuationModeSchema = z.enum([
  "market_price",     // §178의9① 출국일 거래가액
  "prior_year_std",   // §99①3 기준시가
  "unlisted_sample",  // §178의9②2호가목 전후 각 3개월 매매사례가액
  "unlisted_std",     // §99①4 비상장 기준시가
  // 2027.1.1. 이후 출국 · 국외주식(marketType "foreign_stock") 전용 외화 경로
  "foreign_market_price",   // 출국일 외화 거래가액(1주당) × 출국일 기준환율
  "foreign_decree_178_3",   // 시행령 §178의3 시가(외화 1주당, 직접 입력) × 출국일 기준환율
]);

/** ⑨ Zod enum: 납부유예 사유 */
export const deferralReasonSchema = z.enum(["none", "study_abroad", "other_10yr"]);

/** ⑨ Zod enum: §118의13② 외국납부세액공제 배제 사유 (3값) */
export const foreignTaxExclusionReasonSchema = z.enum(["none", "credit_allowed", "step_up"]);

/** ⑨ Zod enum: 영 §178의8②2·3호 외국인근로자 구분 (2027.1.1. 이후 출국분) */
export const foreignWorkerStatusSchema = z.enum(["none", "foreign_worker", "foreign_worker_family"]);

/** ⑨ Zod enum: 영 §178의8②3호 가족 구분 (배우자 / 20세 이하 직계비속) */
export const foreignWorkerFamilyKindSchema = z.enum(["spouse", "child_20_or_under"]);

/** ⑫ 영 §178의8②2·3호 외국인근로자 요건 4개 (사용자 선언) — 키가 빠지면 거부한다(미입력을 false로 채우지 않는다) */
export const foreignWorkerChecksSchema = z.object({
  isOfficerOrEmployee: z.boolean(),
  isNotDailyWorker: z.boolean(),
  domesticWorkRatioAtLeast80: z.boolean(),
  departedWithin6MonthsOfWorkEnd: z.boolean(),
});

/** ⑫ §118의10④ 기본공제 250만원의 세율 구분별 배분 — 과세 구분이 둘 이상일 때 사용자가 입력 (자동 안분 없음) */
export const basicDeductionAllocationSchema = z.object({
  clause1: z.number().min(0).optional(),
  clause2a: z.number().min(0).optional(),
  clause2b: z.number().min(0).optional(),
});

/**
 * ⑫ 종목별 실제 양도 (경정청구 §118의12~§118의14 · PR-7a) — 필수 조합(국내 원화/국외 외화+환율·외국납부세액 원화/외화)·주수 범위·
 * 제외 종목·V-14 차단은 엔진(`exit-tax-actual-transfer.ts`)이 판정하고, 아래 최상위 refine이 엔진을 그대로 돌려 같은 사유·경로로 거부한다(⑧과 단일 소스).
 */
export const exitTaxHoldingActualTransferSchema = z.object({
  shareCount: z.number().int().positive(),
  transferDate: z.union([z.string(), z.date()]).optional(),   // ⑭ toOptionalDate
  pricePerShare: z.number().min(0).optional(),
  priceForeign: z.number().min(0).optional(),
  exchangeRate: z.number().min(0).optional(),
  foreignTaxPaid: z.number().min(0).optional(),
  foreignTaxPaidForeign: z.number().min(0).optional(),
  foreignTaxCurrencyCode: z.string().optional(),
  foreignTaxExchangeRate: z.number().min(0).optional(),
  domesticSourceTaxWithheld: z.number().min(0).optional(),
});

/**
 * ⑫ 국외전출세 보유 종목 Zod 정의
 *
 * 주의: holdings[] 배열 내 acquisitionDate는
 * route handler에서 배열 map toDate() 별도 처리 필수
 * (평면 coerceDates로 배열 내부 Date 미변환 — 디자인 R2-04)
 */
export const exitTaxHoldingSchema = z.object({
  id: z.string().min(1),
  stockName: z.string().min(1),
  // "foreign_stock" = §94①3다목 국외주식등 (2027.1.1. 이후 출국분부터 과세, 이전은 제외·echo)
  marketType: z.enum(["kospi", "kosdaq", "konex", "unlisted", "foreign_stock"]),
  shareCount: z.number().int().positive(),
  acquisitionDate: z.union([z.string(), z.date()]),   // route handler에서 map toDate()
  perShareAcquisitionPrice: z.number().min(0),
  departureDayValuationMode: departureDayValuationModeSchema,
  departureDayMarketPrice: z.number().min(0).optional(),
  priorYearEndMonthAvg: z.number().min(0).optional(),
  unlistedSamplePrice: z.number().min(0).optional(),
  unlistedStdPricePerShare: z.number().min(0).optional(),

  // ── 국외주식(foreign_stock) 전용 — 소득세법 §94①3다목 · 시행령 §157의3 ──
  // 외화 경로의 필수 여부·원화 혼용·환율 자릿수는 엔진(`resolveForeignHoldingKrw`·`assertForeignInputs`)이 판정하고,
  // 아래 최상위 refine이 엔진을 그대로 돌려 같은 사유·경로로 거부한다(⑧과 단일 소스).
  isListedForeignCorp: z.boolean().optional(),
  isSmallMediumEnterprise: z.boolean().optional(),
  countryCode: z.string().optional(),
  foreignCurrencyCode: z.string().optional(),
  departureDayPriceForeign: z.number().min(0).optional(),
  departureExchangeRate: z.number().min(0).optional(),
  perShareAcquisitionPriceForeign: z.number().min(0).optional(),
  acquisitionExchangeRate: z.number().min(0).optional(),

  // ── 종목별 실제 양도 (경정청구 · PR-7a) — 있는 종목만 양도한 것 ──
  actualTransfer: exitTaxHoldingActualTransferSchema.optional(),
}).superRefine((h, ctx) => {
  // 모드별 필수 입력 검증 (자동 fallback 금지)
  if (h.departureDayValuationMode === "market_price" && h.departureDayMarketPrice == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["departureDayMarketPrice"],
      message: "출국일 거래가액 입력 필수 (§178의9①)",
    });
  }
  if (h.departureDayValuationMode === "prior_year_std" && h.priorYearEndMonthAvg == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["priorYearEndMonthAvg"],
      message: "기준시가(1개월 종가평균) 입력 필수 (§99①3)",
    });
  }
  if (h.departureDayValuationMode === "unlisted_sample" && h.unlistedSamplePrice == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unlistedSamplePrice"],
      message: "매매사례가액 입력 필수 (§178의9②2호가목)",
    });
  }
  if (h.departureDayValuationMode === "unlisted_std" && h.unlistedStdPricePerShare == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unlistedStdPricePerShare"],
      message: "비상장 기준시가 입력 필수 (§99①4)",
    });
  }
});

/**
 * ⑫ 국외전출세 Zod 입력 객체 정의 (PR-4B)
 *
 * ExitTaxInput 타입과 1:1 매핑.
 * TypeScript 미감지 — 신규 필드 추가 시 반드시 여기도 추가.
 */
export const exitTaxInputSchema = z.object({
  /** 도메인 식별자 — 반드시 "exit_tax" */
  marketType: z.literal("exit_tax"),

  // ── 거주자 요건 §118의9①1호 ──
  yearsResidentLast10: z.number().int().min(0),
  departureDate: z.union([z.string(), z.date()]),

  // ── 대주주 요건 §178의8 ──
  isMajorShareholder: z.boolean(),

  // ── 보유 종목 (최소 1건) ──
  holdings: z.array(exitTaxHoldingSchema).min(1, "보유 주식을 1종목 이상 입력하세요"),

  // ── 영 §178의8②2·3호 외국인근로자 제외 (2027.1.1. 이후 출국분) ──
  // 미입력은 "none"(엔진 default) — status ≠ none 일 때의 필수 입력은 엔진 판정(`assertForeignInputs`)이 거부한다
  foreignWorkerStatus: foreignWorkerStatusSchema.optional(),
  foreignWorkerChecks: foreignWorkerChecksSchema.optional(),
  foreignWorkerFamilyKind: foreignWorkerFamilyKindSchema.optional(),
  foreignWorkerStartDate: z.union([z.string(), z.date()]).optional(),   // ⑭ toOptionalDate

  // ── §118의10④ 기본공제 250만원 구분별 배분 — 과세 구분이 둘 이상이면 필수(엔진 `calcBuckets`가 판정) ──
  basicDeductionAllocation: basicDeductionAllocationSchema.optional(),

  // ── 납부유예 §118의16 ──
  deferralRequested: z.boolean(),
  deferralReason: deferralReasonSchema,

  // ── 경정청구용 실양도 정보 ──
  actualTransferDate: z.union([z.string(), z.date()]).optional(),
  actualTransferPricePerShare: z.number().min(0).optional(),

  // ── 외국납부세액 §118의13 ──
  foreignTaxPaid: z.number().min(0).optional(),
  // 외화 + 기준환율 (소령 §178의5) — 둘 다 있으면 엔진이 환산해 우선 적용
  foreignTaxPaidForeign: z.number().min(0).optional(),
  foreignTaxCurrencyCode: z.string().optional(),
  foreignTaxExchangeRate: z.number().min(0).optional(),
  foreignTaxExclusionReason: foreignTaxExclusionReasonSchema,

  // ── §118의14 비거주자 세액공제 ──
  domesticSourceTaxWithheld: z.number().min(0).optional(),

  // ── 보유현황 신고 §118의15 ──
  hasFiledHoldingsReport: z.boolean(),
  totalFaceValue: z.number().min(0).optional(),

  // ── 재전입 환급 §118의17①1호 ──
  reenteredWithin5Years: z.boolean().default(false),

  // ── 납부유예 이자상당액 §118의16④·§178의12③ ──
  deferralInterestDays: z.number().int().min(0).optional(),
  deferralInterestDailyRate: z.number().min(0).optional(),
}).superRefine((d, ctx) => {
  // 🔴 「납부유예 신청 시 사유 필수」 refine 을 **제거했다** (anchor: `exit-tax-deferral-reason-zod`).
  //
  // §118의16②는 「출국일부터 **5년**(국외전출자의 국외유학 등 대통령령으로 정하는 사유에
  // 해당하는 경우에는 10년으로 한다) 이내에 …」로 **5년이 원칙**이고 10년이 예외다. 사유를
  // 고르지 않은 상태(`"none"`)가 곧 기본 5년이라 막을 근거가 없다.
  //
  // 종전에는 이 refine 만 `"none"`을 거부해 **토글을 켜면 계산 자체가 실패**했다
  // (화면엔 「계산 오류 / Validation failed」만 떴다). UI 는 「일반 사유 (5년 유예)」를 정당한
  // 선택지로 제시하고, 클라이언트 validate 도 허용하고, 엔진도 5년으로 처리하는데 Zod 만 막았다.

  // 외국납부세액공제 배제가 아닌데 세액이 있으면 OK — 배제 사유 외 추가 검증 없음
  // (자동 안분 fallback 금지 — 엔진에서 0 처리 금지, validate에서 차단)

  // 보유현황 미신고 시 가산세 계산 위한 액면금액 안내 (차단 X — 미입력 시 계산 불가 안내로 처리)
  // 실양도가 < 0 방어
  if (d.actualTransferPricePerShare != null && d.actualTransferPricePerShare < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["actualTransferPricePerShare"],
      message: "실제 양도 단가는 0 이상이어야 합니다",
    });
  }

  // 입력 결함 판정은 엔진이 한다 — 같은 판정을 여기서 다시 구현하지 않는다(⑧↔⑫ 단일 소스, 계획서 §5.1).
  // 위에서 이미 걸린 결함이 있으면 엔진을 돌리지 않는다(같은 문제를 두 번 보고하지 않는다).
  if (ctx.issues.length > 0) return;
  let engineInput;
  try {
    engineInput = buildExitTaxEngineInput(d as Record<string, unknown>);
  } catch (err) {
    // 날짜 형식 오류 — 종전에는 route에서 잡히지 않아 500이었다
    ctx.addIssue({
      code: "custom",
      path: [],
      message: err instanceof Error ? err.message : "날짜 형식이 올바르지 않습니다",
    });
    return;
  }
  let problem;
  try {
    problem = findExitTaxInputProblem(engineInput);
  } catch (err) {
    // 입력 결함이 아닌 오류(세율 누락 등)는 여기서 가리지 않는다 — route가 종전대로 응답한다
    if (err instanceof TaxCalculationError) return;
    throw err;
  }
  if (problem) {
    ctx.addIssue({
      code: "custom",
      path: problem.path ? problem.path.split(".") : [],
      message: problem.message,
    });
  }
});
