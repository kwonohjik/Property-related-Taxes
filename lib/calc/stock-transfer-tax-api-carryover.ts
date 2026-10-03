/**
 * 주식 양도세 ④ API 변환 — §97의2① 이월과세 body 구성 (800줄 정책 분리)
 *
 * `stock-transfer-tax-api.ts`의 `buildStockTransferApiBody`가 부른다. 이동만 했다 — 로직 변경 없음.
 *
 * ## 두 축
 * - **증여자 측**(시나리오 A): §97의2①1호 → §97①1호 가목(실지거래가액) / 나목(매매사례가액·환산취득가)
 * - **수증자 측**(시나리오 B): 영 §163⑨ 증여일 평가액(실지거래가액 의제) — Step 2 「실가」
 *
 * 계획서: docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { parseIntOrUndef, parseFloatOrUndef } from "./stock-transfer-tax-api-parse";

/**
 * 증여자 기준 **환산**인가 — 수증자 모드가 실가여도 엔진 A가 환산을 탄다. 분자는 증여자 취득 당시
 * 기준시가로 덮어쓰이므로 필요한 것은 **분모**(양도 당시 기준시가)뿐이다(계획서 V-2).
 * ⑧(`stock-transfer-tax-validate-step2.ts`)·⑫(`stock-transfer-tax-refines.ts`)도 같은 조건을 쓴다.
 */
export function isDonorConversionForm(form: StockTransferFormData): boolean {
  return (
    (form.acquisitionCause || "purchase") === "carryover_gift" &&
    (form.donorAcquisitionMethod || "actual") === "estimated" &&
    (form.acquisitionMode || "actual") !== "estimated"
  );
}

/** §104②2호 증여자 취득일 + §97의2① 본체(①1호 방식별 입력 · ①2호 · ①3호) */
export function appendCarryoverDonorBody(body: Record<string, unknown>, form: StockTransferFormData): void {
  /** 증여자 측 취득가액 산정 방식 — 3중 패턴 default "actual" */
  const donorMethod = form.donorAcquisitionMethod || "actual";
  if (form.donorAcquisitionDate) body.donorAcquisitionDate = form.donorAcquisitionDate;
  // ── §97의2① 본체(필요경비) ──
  if (form.donorRelation) body.donorRelation = form.donorRelation;
  if (form.donorDeceased) body.donorDeceased = true;
  // ①1호 — 방식별 입력만 싣는다. 다른 방식의 잔존값이 실리면 엔진 도출이 흔들린다.
  body.donorAcquisitionMethod = donorMethod;
  if (donorMethod === "actual") {
    const donorPrice = parseIntOrUndef(form.donorAcquisitionPrice);
    if (donorPrice !== undefined) body.donorAcquisitionPrice = donorPrice;    // 가목
  } else {
    // 나목 — 환산 분자 · 매매사례 개산공제 base (영 §163⑥4)
    const donorStd = parseIntOrUndef(form.donorAcquisitionStdPrice);
    if (donorStd !== undefined) body.donorAcquisitionStdPrice = donorStd;
  }
  if (donorMethod === "sale_case") {
    // 나목 매매사례 — 영 §176의2③1호 (증여자 취득일 전후 3개월)
    const donorSample = parseIntOrUndef(form.donorAcquisitionMarketSamplePrice);
    if (donorSample !== undefined) body.donorAcquisitionMarketSamplePrice = donorSample;
    if (form.donorAcquisitionMarketSampleDate) body.donorAcquisitionMarketSampleDate = form.donorAcquisitionMarketSampleDate;
  }
  const donorCapex = parseIntOrUndef(form.donorCapitalExpenditure);
  if (donorCapex !== undefined) body.donorCapitalExpenditure = donorCapex;     // ①2호
  const giftTax = parseIntOrUndef(form.giftTaxAmount);
  if (giftTax !== undefined) body.giftTaxAmount = giftTax;                     // ①3호
  const transferredVal = parseIntOrUndef(form.transferredAssetValue);
  if (transferredVal !== undefined) body.transferredAssetValue = transferredVal;
  const taxableVal = parseIntOrUndef(form.giftTaxableValue);
  if (taxableVal !== undefined) body.giftTaxableValue = taxableVal;
}

/**
 * 증여자 기준 환산의 **분모** — 수증자 모드가 실가라 `buildStockTransferApiBody`의 `estimated` 블록을 타지 않는다.
 * 상장 정상: 양도일 이전 1개월 종가평균 / 비상장·양도일 거래정지(영 §165③): 양도연도 순손익·순자산.
 * 🔴 호출부는 full 결산서 블록 «뒤»에 둔다 — 그 블록은 `acquisitionMode`를 보지 않아 수증자 환산 시절의
 *    결산서 값이 남아 있으면 덮는다. 이 화면은 simple 입력만 연다.
 */
export function appendDonorConversionDenominator(
  body: Record<string, unknown>,
  form: StockTransferFormData,
): void {
  const dTransferAvg = parseIntOrUndef(form.transferDatePriceAvg1Month);
  if (dTransferAvg !== undefined) body.transferDatePriceAvg1Month = dTransferAvg;
  if (form.transferStdInputMode) body.transferStdInputMode = form.transferStdInputMode;
  delete body.transferYearNetIncomePerShare;
  delete body.transferYearNetAssetPerShare;
  const dNI = parseFloatOrUndef(form.transferYearNetIncomePerShare);
  const dNA = parseFloatOrUndef(form.transferYearNetAssetPerShare);
  if (dNI !== undefined) body.transferYearNetIncomePerShare = dNI;
  if (dNA !== undefined) body.transferYearNetAssetPerShare = dNA;
}
