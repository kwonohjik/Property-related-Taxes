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
import { effectiveSingleAcquisitionCause } from "./stock-acquisition-cause";
import { isForeignCarryoverForm } from "./stock-foreign-carryover";

/**
 * 증여자 기준 **환산**인가 — 수증자 모드가 실가여도 엔진 A가 환산을 탄다. 분자는 증여자 취득 당시
 * 기준시가로 덮어쓰이므로 필요한 것은 **분모**(양도 당시 기준시가)뿐이다(계획서 V-2).
 * ⑧(`stock-transfer-tax-validate-step2.ts`)·⑫(`stock-transfer-tax-refines.ts`)도 같은 조건을 쓴다.
 */
export function isDonorConversionForm(form: StockTransferFormData): boolean {
  return (
    // 분할 모드에 남은 단건 원인은 입력이 아니다 — ④·⑧과 같은 leaf
    effectiveSingleAcquisitionCause(form) === "carryover_gift" &&
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

/**
 * 국외주식 §97의2① 이월과세 body — 증여자 취득가액(외화+환율)·자본적지출·증여세 (④⑬)
 *
 * `isForeignCarryoverForm`일 때만 싣는다 — 토글 OFF 뒤에 남은 값이 body에 새면 안 된다(값은 지우지 않는다).
 * ⚠️ 국내 `appendCarryoverDonorBody`는 **호출하지 않는다** — 국내 원화 필드(`donorAcquisitionPrice` 등)를
 *    국외 body에 섞으면 외화 단가로 재해석된다.
 *
 * 🔑 빈 칸은 **키 자체를 싣지 않는다** — 환율·단가를 0으로 보내면 엔진이 「입력 없음」과 「0」을 구분하지
 *    못하고(`?? fallback`이 죽는다), ⑧·⑫가 막아야 할 미입력이 조용히 0원 취득가액이 된다.
 *    자동 안분 fallback 금지 — 지출일 환율을 양도일 환율로 대신하지 않는다(계획서 Q-4).
 *
 * ⑧(`stock-transfer-tax-validate-foreign-carryover.ts`)이 **이 함수가 만든 body에서 사실을 읽어** 판정한다 —
 * 두 지점이 같은 값을 본다는 것을 구조로 보장한다(3중 패턴).
 */
export function appendForeignCarryoverBody(body: Record<string, unknown>, form: StockTransferFormData): void {
  if (!isForeignCarryoverForm(form)) return;
  body.acquisitionCause = "carryover_gift";
  if (form.donorAcquisitionDate) body.donorAcquisitionDate = form.donorAcquisitionDate;
  if (form.donorRelation) body.donorRelation = form.donorRelation;
  if (form.donorDeceased) body.donorDeceased = true;
  body.donorAcquisitionMode = form.donorAcquisitionModeFS || "actual";            // 3중 패턴 default
  body.donorAcquisitionCurrencyCode = form.donorAcquisitionCurrencyCode || "USD"; // 3중 패턴 default
  const perShare = parseFloatOrUndef(form.donorPerShareAcquisitionPriceForeign);
  if (perShare !== undefined) body.donorPerShareAcquisitionPriceForeign = perShare;
  const rate = parseFloatOrUndef(form.donorAcquisitionExchangeRate);
  if (rate !== undefined) body.donorAcquisitionExchangeRate = rate;
  const capex = parseFloatOrUndef(form.donorCapitalExpenditureForeign);
  if (capex !== undefined) body.donorCapitalExpenditureForeign = capex;
  // 지출일 환율은 지출액이 있을 때만 의미가 있다 — 금액을 지운 뒤 남은 환율이 ⑫(positive)를 막지 않게 한다
  if (capex !== undefined && capex > 0) {
    const capexRate = parseFloatOrUndef(form.donorCapitalExpenditureExchangeRate);
    if (capexRate !== undefined) body.donorCapitalExpenditureExchangeRate = capexRate;
  }
  const giftTax = parseIntOrUndef(form.giftTaxAmount);
  if (giftTax !== undefined) body.giftTaxAmount = giftTax;
  const transferredVal = parseIntOrUndef(form.transferredAssetValue);
  if (transferredVal !== undefined) body.transferredAssetValue = transferredVal;
  const taxableVal = parseIntOrUndef(form.giftTaxableValue);
  if (taxableVal !== undefined) body.giftTaxableValue = taxableVal;
}
