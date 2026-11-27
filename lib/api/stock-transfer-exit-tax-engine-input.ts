/**
 * 국외전출세 — Zod 출력 → 엔진 input 매핑 (14지점 ⑭, Date 변환 포함)
 *
 * 🔑 route(`handleExitTax`)와 ⑫ Zod의 입력 결함 판정(`stock-transfer-exit-tax-schema.ts`의 최상위 refine)이
 *   **같은 매핑**을 쓴다. 매핑이 둘로 갈라지면 한쪽에만 새 필드가 도달해 ⑧↔⑫ 판정이 어긋난다.
 *
 * ⚠️ TypeScript는 이 매핑의 누락을 감지하지 못한다(대부분 optional) — 새 필드는 반드시 여기에도 추가한다.
 *   `satisfies`로 엔진 타입과 대조하고, 키 커버리지는 `__tests__/api/exit-tax-2027-key-coverage.anchor.test.ts`가 지킨다.
 *
 * Date: JSON 경유 후 string으로 도달한다. 평면 필드는 `coerceDates`, 배열(`holdings[]`) 안은 map으로 `toDate`
 * (평면 `coerceDates`는 배열 안을 변환하지 못한다 — 디자인 R2-04). `new Date(x)` 직접 호출 금지.
 */

import type { ExitTaxHolding, ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { coerceDates, toDate, toOptionalDate } from "@/lib/api/date-coerce";

/** ⑭ 평면 Date 필드 (`coerceDates` 적용 — 배열 안은 제외) */
const EXIT_TAX_DATE_FIELDS = ["departureDate", "actualTransferDate", "foreignWorkerStartDate"] as const;

/** 종목 1건 — `holdings[]` 안 Date(`acquisitionDate`)는 여기서 `toDate`로 변환한다 */
export function mapExitTaxHolding(h: Record<string, unknown>) {
  return {
    id: h.id as string,
    stockName: h.stockName as string,
    marketType: h.marketType as ExitTaxHolding["marketType"],
    shareCount: h.shareCount as number,
    acquisitionDate: toDate(h.acquisitionDate, "holdings[].acquisitionDate"),
    perShareAcquisitionPrice: h.perShareAcquisitionPrice as number,
    departureDayValuationMode: h.departureDayValuationMode as ExitTaxHolding["departureDayValuationMode"],
    departureDayMarketPrice: h.departureDayMarketPrice as number | undefined,
    priorYearEndMonthAvg: h.priorYearEndMonthAvg as number | undefined,
    unlistedSamplePrice: h.unlistedSamplePrice as number | undefined,
    unlistedStdPricePerShare: h.unlistedStdPricePerShare as number | undefined,

    // 2027.1.1. 이후 출국 · 국외주식(§94①3다목)
    isListedForeignCorp: h.isListedForeignCorp as boolean | undefined,
    isSmallMediumEnterprise: h.isSmallMediumEnterprise as boolean | undefined,
    countryCode: h.countryCode as string | undefined,
    foreignCurrencyCode: h.foreignCurrencyCode as string | undefined,
    departureDayPriceForeign: h.departureDayPriceForeign as number | undefined,
    departureExchangeRate: h.departureExchangeRate as number | undefined,
    perShareAcquisitionPriceForeign: h.perShareAcquisitionPriceForeign as number | undefined,
    acquisitionExchangeRate: h.acquisitionExchangeRate as number | undefined,
  } satisfies ExitTaxHolding;
}

/**
 * Zod 통과 후의 body → `ExitTaxInput`. 날짜가 올바르지 않으면 `Error`를 던진다(Zod 단계에서 400으로 바꾼다).
 */
export function buildExitTaxEngineInput(rawInput: Record<string, unknown>) {
  const coerced = coerceDates(rawInput, [...EXIT_TAX_DATE_FIELDS]);
  const rawHoldings = (coerced.holdings ?? []) as Array<Record<string, unknown>>;

  return {
    marketType: "exit_tax",

    yearsResidentLast10: coerced.yearsResidentLast10 as number,
    departureDate: coerced.departureDate as Date,

    isMajorShareholder: coerced.isMajorShareholder as boolean,

    holdings: rawHoldings.map(mapExitTaxHolding),

    // 영 §178의8②2·3호 외국인근로자 제외 (2027.1.1. 이후 출국분)
    foreignWorkerStatus: coerced.foreignWorkerStatus as ExitTaxInput["foreignWorkerStatus"],
    foreignWorkerChecks: coerced.foreignWorkerChecks as ExitTaxInput["foreignWorkerChecks"],
    foreignWorkerFamilyKind: coerced.foreignWorkerFamilyKind as ExitTaxInput["foreignWorkerFamilyKind"],
    foreignWorkerStartDate: toOptionalDate(coerced.foreignWorkerStartDate),
    // §118의10④ 기본공제 250만원 구분별 배분
    basicDeductionAllocation: coerced.basicDeductionAllocation as ExitTaxInput["basicDeductionAllocation"],

    deferralRequested: coerced.deferralRequested as boolean,
    deferralReason: coerced.deferralReason as ExitTaxInput["deferralReason"],

    actualTransferDate: toOptionalDate(coerced.actualTransferDate),
    actualTransferPricePerShare: coerced.actualTransferPricePerShare as number | undefined,

    foreignTaxPaid: coerced.foreignTaxPaid as number | undefined,
    // 외화 + 기준환율 (소령 §178의5) — 둘 다 있으면 엔진이 환산해 우선 적용
    foreignTaxPaidForeign: coerced.foreignTaxPaidForeign as number | undefined,
    foreignTaxCurrencyCode: coerced.foreignTaxCurrencyCode as string | undefined,
    foreignTaxExchangeRate: coerced.foreignTaxExchangeRate as number | undefined,
    foreignTaxExclusionReason: coerced.foreignTaxExclusionReason as ExitTaxInput["foreignTaxExclusionReason"],

    domesticSourceTaxWithheld: coerced.domesticSourceTaxWithheld as number | undefined,

    hasFiledHoldingsReport: coerced.hasFiledHoldingsReport as boolean,
    totalFaceValue: coerced.totalFaceValue as number | undefined,
    // [B-1②b] 재전입 환급 §118의17①1호 (bool — Date 무관)
    reenteredWithin5Years: (coerced.reenteredWithin5Years as boolean | undefined) ?? false,
    // [B-1②a] 납부유예 이자상당액 §118의16④·§178의12③
    deferralInterestDays: coerced.deferralInterestDays as number | undefined,
    deferralInterestDailyRate: coerced.deferralInterestDailyRate as number | undefined,
  } satisfies ExitTaxInput;
}
