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
]);

/** ⑨ Zod enum: 납부유예 사유 */
export const deferralReasonSchema = z.enum(["none", "study_abroad", "other_10yr"]);

/** ⑨ Zod enum: §118의13② 외국납부세액공제 배제 사유 (3값) */
export const foreignTaxExclusionReasonSchema = z.enum(["none", "credit_allowed", "step_up"]);

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
  marketType: z.enum(["kospi", "kosdaq", "konex", "unlisted"]),
  shareCount: z.number().int().positive(),
  acquisitionDate: z.union([z.string(), z.date()]),   // route handler에서 map toDate()
  perShareAcquisitionPrice: z.number().min(0),
  departureDayValuationMode: departureDayValuationModeSchema,
  departureDayMarketPrice: z.number().min(0).optional(),
  priorYearEndMonthAvg: z.number().min(0).optional(),
  unlistedSamplePrice: z.number().min(0).optional(),
  unlistedStdPricePerShare: z.number().min(0).optional(),
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

  // ── 납부유예 §118의16 ──
  deferralRequested: z.boolean(),
  deferralReason: deferralReasonSchema,

  // ── 경정청구용 실양도 정보 ──
  actualTransferDate: z.union([z.string(), z.date()]).optional(),
  actualTransferPricePerShare: z.number().min(0).optional(),

  // ── 외국납부세액 §118의13 ──
  foreignTaxPaid: z.number().min(0).optional(),
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
  // 납부유예 신청 시 사유 필수
  if (d.deferralRequested && d.deferralReason === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deferralReason"],
      message: "납부유예 신청 시 유예 사유를 선택하세요",
    });
  }

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
});
