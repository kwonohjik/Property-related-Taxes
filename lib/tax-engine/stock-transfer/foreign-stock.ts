/**
 * 국외주식 양도소득세 — 순수 엔진 (§94①3다목 트랙 + FS-09)
 *
 * 🔑 **트랙의 근거는 법 §118②(준용규정)** 이다:
 *   "다음 각 호의 소득에 대한 양도소득세액의 계산에 관하여는
 *    **제118조의2부터 제118조의4까지 및 제118조의6을 준용**한다.
 *    1. **제94조제1항제3호다목**에 따른 자산의 양도로 발생하는 소득"
 *
 * ⇒ 준용 O: §118의2(5년 요건) · §118의3(양도가액) · §118의4(필요경비·외화환산 위임) · §118의6(외국납부세액)
 * ⇒ 준용 X: **§118의5(세율)** · **§118의7(기본공제)** · §118의8(LTHD 배제 단서)
 *
 * 법령: 소득세법 §94①3다목 · §118② · §102①2호 · §103①2호 · §104①12호나목
 *       + 준용 §118의2~§118의4·§118의6
 * 시행령: §157의3(범위), §178의3(시가), §178의5(외화환산), §178의7(외국납부세액 범위)
 *
 * 계산 흐름:
 *   STEP 1: 납세의무 확인 (§118② → §118의2 — 5년 이상 거주자)
 *   STEP 2: 양도가액 원화 환산 (영 §178의5)
 *     FS-09: transferReceiptMode="installments" 시 §178의5② 장기할부 시점별 환율 적용
 *     single: 단일 환율 적용
 *   STEP 3: 취득가액 원화 환산 (영 §178의5)
 *   STEP 4: 필요경비 원화 환산 (§118② → §118의4)
 *   STEP 5: 외국납부세액 필요경비 산입 처리 (foreignTaxMethod="expense" 시)
 *   STEP 6: 양도차익 (장기보유특별공제 없음 — §95②가 §94①1·2호 자산 전용)
 *   STEP 7: 기본공제 §103①2호 250만원 (국내주식 §94①3호 가·나목과 **같은 그룹**)
 *   STEP 8: 과세표준
 *   STEP 9: **§104①12호나목 20% 단일세율**
 *   STEP 10: 외국납부세액공제 §118② → §118의6 (credit 선택 시)
 *   STEP 11: 지방소득세 10원 미만 절사
 *   STEP 12: 최종 결과 조립
 *
 * 계획서: docs/02-design/features/foreign-stock-94-1-3-da-statute-track.plan.md
 */

import type {
  ForeignStockInput,
  ForeignStockResult,
  InstallmentReceipt,
  InstallmentReceiptDetail,
} from "./types/foreign-stock.types";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import {
  STOCK_FOREIGN,
  STOCK_FOREIGN_BASIC_DEDUCTION,
  STOCK_FOREIGN_RATE,
  STOCK_FOREIGN_RESIDENT_MIN_YEARS,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 내부 상수
// ============================================================

/** §103①2호 기본공제 250만원 (국내주식 §94①3호 가·나목과 같은 그룹) */
const BASIC_DEDUCTION_AMOUNT = STOCK_FOREIGN_BASIC_DEDUCTION;

/** §118② → §118의2 납세의무 요건 — 5년 이상 거주자 */
const MIN_RESIDENT_YEARS = STOCK_FOREIGN_RESIDENT_MIN_YEARS;

/** 10원 미만 절사 (§47③ 준용 — 지방소득세) */
function floorTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

// ============================================================
// FS-09: §178의5② 장기할부 분할 수령 환산
// ============================================================

/**
 * §178의5② 장기할부 분할 수령 — 시점별 환율 적용 후 원화 합산
 *
 * 법령: 소득세법 시행령 §178의5②
 *   "장기할부조건의 경우에는 양도일 및 취득일을 양도가액 또는 취득가액을
 *    수령하거나 지출한 날로 본다"
 *   → 각 수령일의 기준환율을 개별 적용하여 원화 환산 후 합산
 *
 * 정수 연산: 각 수령액 × 환율을 개별 floor() 후 합산 (오버플로우 방지)
 *
 * @param receipts 분할 수령 배열 (≥2건)
 * @returns { totalKrw, detail }
 */
function calcInstallmentTransferPrice(receipts: InstallmentReceipt[]): {
  totalKrw: number;
  detail: InstallmentReceiptDetail;
} {
  const receiptItems: InstallmentReceiptDetail["receipts"] = receipts.map((r) => ({
    receiptDate: r.receiptDate,
    amountForeign: r.amountForeign,
    exchangeRate: r.exchangeRate,
    amountKrw: Math.floor(r.amountForeign * r.exchangeRate),
  }));

  const totalKrw = receiptItems.reduce((sum, item) => sum + item.amountKrw, 0);

  return {
    totalKrw,
    detail: {
      mode: "installments",
      receipts: receiptItems,
      totalKrw,
    },
  };
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 해외주식 양도소득세 계산 (§118의2~§118의8)
 *
 * @param input ForeignStockInput — Date는 route handler에서 coerceDates 완료된 상태
 * @returns ForeignStockResult
 */
export function calculateForeignStockTax(input: ForeignStockInput): ForeignStockResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // ──────────────────────────────────────────────────────────
  // STEP 1: 납세의무 확인 (§118의2 — 거주 기간 5년 이상)
  // ──────────────────────────────────────────────────────────
  if (input.yearsResidentInKorea < MIN_RESIDENT_YEARS) {
    return {
      taxCategory: "not_liable",
      isLiable: false,
      ineligibleReason: `국내 거주기간 ${input.yearsResidentInKorea}년 — §118의2 납세의무 미충족 (5년 이상 거주자만 과세)`,
      transferPriceKrw: 0,
      acquisitionPriceKrw: 0,
      necessaryExpensesKrw: 0,
      transferGain: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      incomeTax: 0,
      localIncomeTax: 0,
      finalTax: 0,
      finalLocalTax: 0,
      totalTax: 0,
      transferExchangeRate: input.transferExchangeRate,
      acquisitionExchangeRate: input.acquisitionExchangeRate,
      shareCount: input.shareCount,
      transferReceiptDetail: undefined,
      warnings: ["§118의2 납세의무 미충족 — 거주기간 5년 미만"],
      appliedRules: [STOCK_FOREIGN.SECTION_118_2_RESIDENT_REQUIREMENT],
    };
  }

  appliedRules.push(STOCK_FOREIGN.SECTION_118_2_RESIDENT_REQUIREMENT);

  // ──────────────────────────────────────────────────────────
  // STEP 2: 양도가액 원화 환산 (§178의5)
  //
  // FS-09 분기:
  //   "installments" → §178의5② 장기할부 시점별 환율 적용 (calcInstallmentTransferPrice)
  //   "single" (또는 미설정) → §178의5① 단일 양도일 기준환율 적용 (기존 동작 유지)
  // ──────────────────────────────────────────────────────────
  let transferPriceKrw: number;
  let transferReceiptDetail: InstallmentReceiptDetail | undefined;

  const receiptMode = input.transferReceiptMode ?? "single";

  if (receiptMode === "installments") {
    // §178의5② 장기할부 분할 수령 — 시점별 환율 적용
    const receipts = input.transferInstallmentReceipts ?? [];

    // 검증: 배열 최소 2건 (1건은 single 모드와 동일 → 경고)
    if (receipts.length < 2) {
      warnings.push(
        `§178의5② 장기할부 분할 수령: 수령 건수(${receipts.length}건)가 2건 미만입니다. ` +
        "단일 수령(single 모드) 사용을 권장합니다.",
      );
    }

    const { totalKrw, detail } = calcInstallmentTransferPrice(receipts);
    transferPriceKrw = totalKrw;
    transferReceiptDetail = detail;
    appliedRules.push(STOCK_FOREIGN.SECTION_178_5_FX_RATE);
    appliedRules.push("§178의5②(장기할부 분할 수령 — 수령일별 기준환율 적용)");
  } else {
    // §178의5① 단일 양도일 기준환율 (기존 동작 — 회귀 없음)
    if (input.transferPriceMode === "total") {
      // 총액 직접 입력 → 환산
      const totalForeign = input.totalTransferPriceForeign ?? 0;
      transferPriceKrw = Math.floor(totalForeign * input.transferExchangeRate);
    } else {
      // 1주당 단가 × 주식수 → 환산
      const perShare = input.perShareTransferPriceForeign ?? 0;
      transferPriceKrw = Math.floor(perShare * input.shareCount * input.transferExchangeRate);
    }
    appliedRules.push(STOCK_FOREIGN.SECTION_178_5_FX_RATE);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 3: 취득가액 원화 환산 (§178의5 — 취득일 기준환율)
  // ──────────────────────────────────────────────────────────
  let acquisitionPriceKrw: number;
  if (input.acquisitionMode === "actual") {
    const perShareAcq = input.perShareAcquisitionPriceForeign ?? 0;
    acquisitionPriceKrw = Math.floor(
      perShareAcq * input.shareCount * input.acquisitionExchangeRate,
    );
  } else {
    // market_price: §178의3 시가 산정 — v1에서는 사용자 직접 입력값으로 수신
    // (perShareAcquisitionPriceForeign에 §178의3 적용 시가를 입력)
    const perShareMkt = input.perShareAcquisitionPriceForeign ?? 0;
    acquisitionPriceKrw = Math.floor(
      perShareMkt * input.shareCount * input.acquisitionExchangeRate,
    );
    warnings.push("§178의3 시가 산정: 사용자 입력값 사용. 외국정부 평가가액 → 상증법§63 준용 시가 순위 적용 확인 필요");
    appliedRules.push(STOCK_FOREIGN.SECTION_178_3_MARKET_PRICE);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 4: 필요경비 원화 환산 (§118의4 — 지출일 환율, 근사치로 양도일 환율 사용)
  // ──────────────────────────────────────────────────────────
  // v1: 자본적지출·양도비는 양도일 기준환율로 환산 (지출일 환율 미입력 시 근사치)
  const capitalExpKrw = Math.floor(
    input.capitalExpenditureForeign * input.transferExchangeRate,
  );
  const transferCostKrw = Math.floor(
    input.transferCostForeign * input.transferExchangeRate,
  );

  // ──────────────────────────────────────────────────────────
  // STEP 5: 외국납부세액 처리 (§118의6)
  // ──────────────────────────────────────────────────────────
  let foreignTaxPaidKrw = 0;
  let foreignTaxExpenseApplied: number | undefined;

  if (input.hasForeignTax && input.foreignTaxPaidForeign != null) {
    const fxRate = input.foreignTaxExchangeRate ?? input.transferExchangeRate;
    foreignTaxPaidKrw = Math.floor(input.foreignTaxPaidForeign * fxRate);
    appliedRules.push(STOCK_FOREIGN.SECTION_178_7_FOREIGN_TAX_SCOPE);
  }

  // 필요경비 산입 선택 시 — 취득가액 계산에 앞서 필요경비에 포함
  let extraExpenseFromForeignTax = 0;
  if (input.foreignTaxMethod === "expense" && foreignTaxPaidKrw > 0) {
    extraExpenseFromForeignTax = foreignTaxPaidKrw;
    foreignTaxExpenseApplied = foreignTaxPaidKrw;
    appliedRules.push(STOCK_FOREIGN.SECTION_118_6_EXPENSE_METHOD);
  }

  const necessaryExpensesKrw = capitalExpKrw + transferCostKrw + extraExpenseFromForeignTax;

  // ──────────────────────────────────────────────────────────
  // STEP 6: 양도차익 — 장기보유특별공제 없음
  //
  // ⚠️ 근거가 §118의8 단서가 **아니다**. §118의8은 §118②의 준용 목록에 없다.
  //    §95②의 장기보유특별공제 대상이 §94①1호·2호 자산이라 주식에는 애초에 붙지 않는다.
  //    (금액은 종전과 같고 근거만 정정 — 계획서 §5.3)
  // ──────────────────────────────────────────────────────────
  const transferGain = transferPriceKrw - acquisitionPriceKrw - necessaryExpensesKrw;
  appliedRules.push(STOCK_FOREIGN.SECTION_95_2_NO_LTHD);

  if (transferGain < 0) {
    warnings.push(`양도손실 발생 (${transferGain.toLocaleString()}원) — 동일 과세기간 다른 해외주식 양도차익과 통산 가능`);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 7: 기본공제 §103①2호 250만원
  //
  // ⚠️ §118의7(별도 그룹)이 **아니다** — §118②의 준용 목록에 없다.
  //    §103①2호가 「§94①3호에 따른 소득」을 한 그룹으로 묶으므로 국내 상장·비상장 주식과
  //    **같은 그룹**에서 연 1회다.
  //
  // 🔑 현재 이 앱은 국내주식과 국외주식을 **한 계산에 담을 수 없다**
  //    (`marketType`이 폼-전역이고 다종목 `items` 경로에 국외주식이 없다).
  //    따라서 단독 계산에서는 250만원 전액이 맞다. 그룹 배분은 다종목 입력이 생길 때
  //    `stock-transfer-aggregate.ts`가 맡는다 — 계획서 D-2·D-3.
  // ──────────────────────────────────────────────────────────
  // 손실 시 기본공제 0 처리
  const basicDeduction = transferGain > 0
    ? Math.min(BASIC_DEDUCTION_AMOUNT, transferGain)
    : 0;
  appliedRules.push(STOCK_FOREIGN.SECTION_103_1_2_BASIC_DEDUCTION);

  // ──────────────────────────────────────────────────────────
  // STEP 8: 과세표준
  // ──────────────────────────────────────────────────────────
  const taxBase = Math.max(0, transferGain - basicDeduction);

  // ──────────────────────────────────────────────────────────
  // STEP 9: §104①12호나목 — 20% 단일세율
  //
  // ⚠️ §118의5(§55① 6~45% 누진)는 §118②의 준용 목록에 **없다**.
  // ⚠️ 보유기간 구분 없음 — §104①11호가목1)의 「1년 미만 30%」는 가·나목 전용.
  // ⚠️ 가목 「중소기업의 주식등 10%」는 외국법인에 중소기업 규정을 적용하지 않아 도달 불가
  //    (계획서 §4 Q-1).
  // ──────────────────────────────────────────────────────────
  //
  // 🔑 `applyRate`(= floor(x × 0.2))를 그대로 쓴다 — 2026-08-12 실측으로 **1원 오차 0건**.
  //    0~20억 5배수 전수 + 1~300만 1단위 전수를 `applyRateFraction(x, 2, 10)`과 대조해 확인했다.
  //    0.70이 `applyFairMarketRatio`를 필요로 했던 것과 방향이 반대다 — 0.7의 double은 실제보다
  //    **작아서** floor가 1원 깎였지만, 0.2의 double은 실제보다 **커서** 깎이지 않는다.
  const rate = taxBase > 0 ? STOCK_FOREIGN_RATE : 0;
  const progressiveDeduction = 0; // §104①12호에 누진공제 없음
  const incomeTax = applyRate(taxBase, STOCK_FOREIGN_RATE);
  appliedRules.push(STOCK_FOREIGN.SECTION_104_1_12_TAX_RATE);

  // ──────────────────────────────────────────────────────────
  // STEP 10: 외국납부세액공제 §118의6 (credit 선택 시)
  //
  // 한도 = A × B / C (§118의6①1호)
  //   A: 「제118조의5에 따라 계산한 해당 과세기간의 국외자산에 대한 양도소득 산출세액」
  //   B: 해당 국외자산 양도소득금액   C: 해당 과세기간의 국외자산에 대한 양도소득금액
  //
  // 🔑 **A = §104①12호로 계산한 산출세액**이다(= 바로 위 `incomeTax`). A가 지시하는
  //    §118의5를 문언 그대로 §55① 누진으로 읽지 않는 이유(2026-08-12 DRF·서식 실측):
  //      ① §118②의 준용 열거가 §118의2~§118의4·§118의6뿐 ⇒ §55① 적용 근거가 없다.
  //      ② §118의5①의 「국외자산」은 §118의2가 정하는데 그 **3호·4호가 삭제**되어
  //         국외주식은 §118의5의 적용대상 자체가 아니다.
  //      ③ 영 §178의7(§118의6② 위임)은 A를 재정의하지 않는다.
  //      ④ 별지 제84호서식 부표 1 세율표가 국외주식 산출세액을 10%·20%로 계산하고,
  //         §55① 비교(⑩란 가·나)는 「§94①1호·2호 및 4호 자산」 전용이다.
  //    계획서 §4 Q-3 종결 · anchor F 시리즈(`foreign-stock-94-1-3-da-track.anchor.test.ts`).
  //
  // ⚠️ **B/C 안분은 미구현**이다. 이 엔진은 국외자산을 하나만 보므로 B = C(비율 1)로
  //    계산된다 — 단건에서는 맞지만, 한 과세기간에 국외주식이 둘 이상이면 종목마다
  //    한도를 전액으로 잡아 **과대공제**가 된다. 구조상 C를 알 수 있는 aggregate 레벨로
  //    옮겨야 하므로 D-3(aggregate 편입) 이후에만 구현 가능하다 — 계획서 §3.4·§6.3 D-4 잔여.
  // ──────────────────────────────────────────────────────────
  let foreignTaxCreditLimit: number | undefined;
  let foreignTaxCreditApplied: number | undefined;

  if (input.foreignTaxMethod === "credit" && input.hasForeignTax && foreignTaxPaidKrw > 0) {
    foreignTaxCreditLimit = incomeTax;
    foreignTaxCreditApplied = Math.min(foreignTaxPaidKrw, foreignTaxCreditLimit);
    appliedRules.push(STOCK_FOREIGN.SECTION_118_6_CREDIT_METHOD);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 11: 지방소득세 §103의3 (10원 미만 절사)
  // ──────────────────────────────────────────────────────────
  // 지방소득세 = (산출세액 - 외국납부세액공제) × 10%
  const taxAfterCredit = incomeTax - (foreignTaxCreditApplied ?? 0);
  const localIncomeTax = floorTen(taxAfterCredit * 0.1);

  // ──────────────────────────────────────────────────────────
  // STEP 12: 최종 납부세액
  // ──────────────────────────────────────────────────────────
  const finalTax = taxAfterCredit;
  const finalLocalTax = localIncomeTax;
  const totalTax = finalTax + finalLocalTax;

  return {
    taxCategory: "foreign_stock",
    isLiable: true,

    transferPriceKrw,
    acquisitionPriceKrw,
    necessaryExpensesKrw,
    transferGain,

    basicDeduction,
    taxBase,

    appliedRate: rate,
    progressiveDeduction,
    incomeTax,
    localIncomeTax,

    foreignTaxCreditLimit,
    foreignTaxCreditApplied,
    foreignTaxPaidKrw: foreignTaxPaidKrw > 0 ? foreignTaxPaidKrw : undefined,
    foreignTaxExpenseApplied,

    finalTax,
    finalLocalTax,
    totalTax,

    // 산식 echo
    transferExchangeRate: input.transferExchangeRate,
    acquisitionExchangeRate: input.acquisitionExchangeRate,
    foreignTaxExchangeRate: input.foreignTaxExchangeRate,
    shareCount: input.shareCount,

    // FS-09 §178의5② 분할 수령 detail (installments 모드 시만 정의)
    transferReceiptDetail,

    warnings,
    appliedRules,
  };
}
