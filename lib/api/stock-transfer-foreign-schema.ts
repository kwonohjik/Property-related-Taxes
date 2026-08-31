/**
 * ⑫ 해외주식(§94①3다목) 양도소득세 Zod 입력 스키마
 *
 * `stock-transfer-tax-schema.ts` 가 800줄 정책을 넘어 국내/국외 축으로 분리했다.
 * 국외전출세(`stock-transfer-exit-tax-schema.ts`)가 이미 별도 파일인 것과 같은 이음매다.
 * 기존 import 경로 호환을 위해 본체에서 **re-export** 한다.
 */
import { z } from "zod";
import {
  FOREIGN_STOCK_TRACK_START,
  isBeforeForeignStockTrack,
} from "@/lib/tax-engine/data/foreign-stock-track-era";

// ============================================================
// ⑫ PR-4A 해외주식 양도소득세 Zod 입력 스키마 (14지점 ⑨⑫)
//
// 법령: §94①3다목 · §118②(§118의2~§118의4·§118의6 준용) · §103①2호 · §104①12호나목
// 주의: TypeScript는 이 스키마의 필드 누락을 감지하지 못함 (⑫ 점검 필수)
// ============================================================

/** ⑨ Zod enum: 해외주식 양도가액 입력 방식 */
export const foreignTransferPriceModeSchema = z.enum(["per_share", "total"]);

/** ⑨ Zod enum: 해외주식 취득가액 입력 방식 */
export const foreignAcquisitionModeSchema = z.enum(["actual", "market_price"]);

/** ⑨ Zod enum: 외국납부세액 처리 방법 (§118의6) */
export const foreignTaxMethodSchema = z.enum(["credit", "expense"]);

/**
 * ⑨ Zod enum: §178의5② 수령 방식
 * "single": 단일 양도일 기준환율 적용 (기존 동작)
 * "installments": 장기할부 시점별 환율 적용
 */
export const transferReceiptModeSchema = z.enum(["single", "installments"]);

/**
 * ⑫ §178의5② 분할 수령 항목 Zod 정의 (TypeScript 미감지 — 배열 내부)
 *
 * route handler에서 receiptDate를 배열 map으로 개별 toDate() 변환 필수.
 * 평면 coerceDates로는 배열 내부 Date 미변환 — ⑭ 설계 R2-04 패턴.
 */
export const installmentReceiptSchema = z.object({
  /** 수령일 (§178의5② — 이 날짜의 기준환율 적용) */
  receiptDate: z.union([z.string(), z.date()]),
  /** 수령액 (외화) */
  amountForeign: z.number().positive(),
  /** 수령일 기준환율 (원/외화) */
  exchangeRate: z.number().positive(),
});

/**
 * ⑫ 해외주식 Zod 입력 객체 정의 (PR-4A + FS-09)
 *
 * ForeignStockInput 타입과 1:1 매핑.
 * TypeScript 미감지 — 신규 필드 추가 시 반드시 여기도 추가.
 */
export const foreignStockInputSchema = z.object({
  /** 도메인 식별자 — 반드시 "foreign_stock" */
  marketType: z.literal("foreign_stock"),

  // ── 납세의무 요건 §118의2 ──
  yearsResidentInKorea: z.number().int().min(0),

  // ── 자산 분류 §157의3 ──
  isListedForeignCorp: z.boolean(),
  /** §104①12호가목 중소기업 10% — 영 §157의3 2호(내국법인 해외상장) 전용. 미입력=나목 20%. */
  isSmallMediumEnterprise: z.boolean().optional(),
  stockName: z.string().min(1),
  countryCode: z.string().min(2).max(3),

  // ── 양도 정보 ──
  shareCount: z.number().int().positive(),
  transferDate: z.union([z.string(), z.date()]),
  transferPriceMode: foreignTransferPriceModeSchema,
  perShareTransferPriceForeign: z.number().min(0).optional(),
  totalTransferPriceForeign: z.number().min(0).optional(),
  transferCurrencyCode: z.string().min(1),
  transferExchangeRate: z.number().positive(),

  // ── FS-09 §178의5② 장기할부 분할 수령 ──
  /** 수령 방식: "single"(기본) | "installments"(장기할부) */
  transferReceiptMode: transferReceiptModeSchema.optional().default("single"),
  /** 분할 수령 배열 (transferReceiptMode="installments" 시 필수, ≥2건, 최대 120) */
  transferInstallmentReceipts: z.array(installmentReceiptSchema).max(120).optional(),

  // ── 취득 정보 ──
  acquisitionDate: z.union([z.string(), z.date()]),
  acquisitionMode: foreignAcquisitionModeSchema,
  perShareAcquisitionPriceForeign: z.number().min(0).optional(),
  acquisitionCurrencyCode: z.string().min(1),
  acquisitionExchangeRate: z.number().positive(),

  // ── 필요경비 §118의4 ──
  capitalExpenditureForeign: z.number().min(0),
  transferCostForeign: z.number().min(0),

  // ── 외국납부세액 §118의6 ──
  hasForeignTax: z.boolean(),
  foreignTaxPaidForeign: z.number().min(0).optional(),
  foreignTaxCurrencyCode: z.string().optional(),
  foreignTaxExchangeRate: z.number().positive().optional(),
  foreignTaxMethod: foreignTaxMethodSchema,

  // ── 기타 ──
  isElectronicFiling: z.boolean(),

  // ── 신고축(가산세) — 국외자산 양도도 같은 신고다(소득세법 §118조의8 준용) ──
  // 전부 optional: 미선언 = 정상신고(가산세 0).
  filingViolation: z.enum(["none", "under_report", "non_report"]).optional(),
  isFraudulent: z.boolean().optional(),
  isInternationalTransaction: z.boolean().optional(),
  originalFiledTax: z.number().min(0).optional(),
  priorPaidTax: z.number().min(0).optional(),
  interestSurcharge: z.number().min(0).optional(),
  fraudulentPortion: z.number().min(0).optional(),
  unpaidTax: z.number().min(0).optional(),
  paymentDeadline: z.union([z.string(), z.date()]).optional(),
  actualPaymentDate: z.union([z.string(), z.date()]).optional(),
}).superRefine((d, ctx) => {
  // 납세의무 요건 — 5년 미만은 not_liable 처리이므로 차단하지 않음 (엔진 내부 처리)

  const receiptMode = d.transferReceiptMode ?? "single";

  if (receiptMode === "installments") {
    // FS-09: 분할 수령 모드 — transferInstallmentReceipts 필수 + ≥2건
    const receipts = d.transferInstallmentReceipts;
    if (!receipts || receipts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferInstallmentReceipts"],
        message: "§178의5② 장기할부 분할 수령: 수령 내역을 1행 이상 입력하세요",
      });
    } else if (receipts.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferInstallmentReceipts"],
        message: "§178의5② 장기할부 분할 수령: 수령 건수는 2건 이상이어야 합니다 (1건은 single 모드 사용)",
      });
    }
    // 분할 수령 모드에서는 양도가액 필수 검증 생략 (합계 = 배열 합산)
  } else {
    // single 모드 — 기존 양도가액 필수성 검증
    if (d.transferPriceMode === "per_share" && (d.perShareTransferPriceForeign == null || d.perShareTransferPriceForeign < 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["perShareTransferPriceForeign"],
        message: "1주당 양도가액 (외화)을 입력하세요",
      });
    }
    if (d.transferPriceMode === "total" && (d.totalTransferPriceForeign == null || d.totalTransferPriceForeign <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalTransferPriceForeign"],
        message: "총 양도가액 (외화)을 입력하세요",
      });
    }
  }

  // 취득가액 필수성 검증 (actual 모드)
  if (d.acquisitionMode === "actual" && (d.perShareAcquisitionPriceForeign == null || d.perShareAcquisitionPriceForeign < 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["perShareAcquisitionPriceForeign"],
      message: "1주당 취득가액 (외화)을 입력하세요",
    });
  }

  // 외국납부세액 필수성 검증
  if (d.hasForeignTax && (d.foreignTaxPaidForeign == null || d.foreignTaxPaidForeign < 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["foreignTaxPaidForeign"],
      message: "외국에서 납부한 세액 (외화)을 입력하세요",
    });
  }

  // ⑫ §94①3호다목 트랙 개시일 이전 양도 차단 (계획서 §6.5)
  //
  // 🔑 클라이언트 ⑧(`stock-transfer-tax-validate-foreign.ts`)과 **같은 술어**를 쓴다.
  //    ⑧만 막으면 API 직접 호출로 뚫려 「차단 중」이 거짓말이 된다.
  // ⚠️ 취득일에는 걸지 않는다 — 2020년 이전 취득 후 2020년 이후 양도는 정상 케이스다.
  if (isBeforeForeignStockTrack(d.transferDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transferDate"],
      message:
        `${FOREIGN_STOCK_TRACK_START} 이전 양도는 지원하지 않습니다 ` +
        "(구 §118의2 3호 트랙 — 법률 제16834호 부칙 §1·§2②)",
    });
  }
});

