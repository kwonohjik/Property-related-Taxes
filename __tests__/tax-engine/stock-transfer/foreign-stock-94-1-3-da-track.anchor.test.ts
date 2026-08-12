/**
 * 해외주식 근거 조문 트랙 정정 — anchor
 *
 * 계획서: docs/02-design/features/foreign-stock-94-1-3-da-statute-track.plan.md
 *
 * ## 왜 이 파일이 필요한가
 *
 * 기존 `foreign-stock.test.ts`는 **§118의5(§55① 누진)·§118의7(별도 기본공제)** 을 정본으로
 * 고정하고 있다. 그 두 조문은 **§118②의 준용 목록에 없어** 국외주식에 적용되지 않는다.
 *
 * > 법 §118② — 다음 각 호의 소득에 대한 양도소득세액의 계산에 관하여는
 * >   **제118조의2부터 제118조의4까지 및 제118조의6을 준용**한다.
 * >   1. **제94조제1항제3호다목**에 따른 자산의 양도로 발생하는 소득
 *
 * ⇒ 세율은 **§104①12호나목 20%**, 기본공제는 **§103①2호**(국내주식과 한 그룹).
 * ⇒ 반면 **§118의2(5년 요건)·§118의3·§118의4·§118의6은 준용되어 그대로 살아 있다**
 *   (기획재정부 금융세제과-70, 2022.2.23. — 5년 미만이면 국외주식 양도소득 불과세).
 *
 * ## 대조군을 반드시 함께 읽을 것
 *
 * R-3·R-4는 **부정 단언**(10%가 아니다 / 30%가 아니다)이라 세율 계산이 통째로 죽어도
 * 통과할 수 있다. R-1이 **20%가 실제로 적용됨**을 보이는 양성 대조군이다.
 */

import { describe, it, expect } from "vitest";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  foreignStockInputSchema,
  stockTransferInputSchema,
} from "@/lib/api/stock-transfer-tax-schema";
import { stockTransferAggregateInputSchema } from "@/lib/api/stock-transfer-tax-schema";

/** 클라이언트 변환기 원문 — S-4 트립와이어가 `items` 전송 배선 유무를 본다. */
const stockTransferApiSource = readFileSync(
  resolve(process.cwd(), "lib/calc/stock-transfer-tax-api.ts"),
  "utf8",
);
import { validateStep1Foreign } from "@/lib/calc/stock-transfer-tax-validate-foreign";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isBeforeForeignStockTrack } from "@/lib/tax-engine/data/foreign-stock-track-era";

// ============================================================
// 픽스처 — 원화 환산을 단순화(환율 1)해 세율 축만 보이게 한다
// ============================================================

/**
 * 양도차익이 정확히 `gain`이 되는 입력.
 *   양도가액 = gain + 1,000,000 · 취득가액 = 1,000,000 · 필요경비 0 · 환율 1
 */
function fx(gain: number, over: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Anchor Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2025-06-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2020-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...over,
  };
}

/** §104①12호나목 20% 정답값 — 기본공제 250만 후 20% */
function expected20(gain: number) {
  const taxBase = Math.max(0, gain - 2_500_000);
  const incomeTax = Math.floor(taxBase * 0.2);
  return { taxBase, incomeTax };
}

// ============================================================
// R 시리즈 — 세율 (D-1)
// ============================================================

describe("R — 세율은 §104①12호나목 20% 단일세율이다", () => {
  it("R-1 [양성 대조군] 외국법인 비상장 · 차익 1억 → 20%", () => {
    const r = calculateForeignStockTax(fx(100_000_000));
    const e = expected20(100_000_000);

    expect(r.taxBase).toBe(e.taxBase);          // 97,500,000
    expect(r.appliedRate).toBe(0.2);
    expect(r.incomeTax).toBe(e.incomeTax);      // 19,500,000
    // 누진공제는 §104①12호에 없다 — 0이어야 한다
    expect(r.progressiveDeduction).toBe(0);
  });

  it("R-2 내국법인 해외상장 DR(영 §157의3 2호)도 같은 20%", () => {
    const r = calculateForeignStockTax(fx(100_000_000, { isListedForeignCorp: false }));
    expect(r.appliedRate).toBe(0.2);
    expect(r.incomeTax).toBe(expected20(100_000_000).incomeTax);
  });

  it("R-3 소규모 외국법인이라도 10%(§104①12호가목)가 되지 않는다", () => {
    // Q-1 종결: 외국법인에는 「중소기업기본법」 §2 중소기업 규정을 적용하지 않는다.
    // 차익을 작게 잡아 「중소기업처럼 보이는」 사안을 만들어도 20%여야 한다.
    const r = calculateForeignStockTax(fx(30_000_000));
    expect(r.appliedRate).toBe(0.2);
    expect(r.appliedRate).not.toBe(0.1);
    expect(r.incomeTax).toBe(expected20(30_000_000).incomeTax); // 5,500,000
  });

  it("R-4 보유 1년 미만이어도 30%가 아니다 (§104①11호가목1)은 가·나목 전용)", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, {
        acquisitionDate: new Date("2025-01-02"), // 양도 2025-06-01 → 5개월
      }),
    );
    expect(r.appliedRate).toBe(0.2);
    expect(r.appliedRate).not.toBe(0.3);
    expect(r.incomeTax).toBe(expected20(100_000_000).incomeTax);
  });

  it("R-6 [경계] 양도일 2020-01-01 → 신 트랙 20%", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, {
        transferDate: new Date("2020-01-01"),
        acquisitionDate: new Date("2019-01-02"),
      }),
    );
    expect(r.taxCategory).toBe("foreign_stock");
    expect(r.appliedRate).toBe(0.2);
  });

  it("R-7 거주 5년 미만 → not_liable (§118② → §118의2 준용 · 세율 판정 없음)", () => {
    const r = calculateForeignStockTax(fx(100_000_000, { yearsResidentInKorea: 4 }));
    expect(r.taxCategory).toBe("not_liable");
    expect(r.isLiable).toBe(false);
    expect(r.totalTax).toBe(0);
  });

  it("R-8 [역전 확인] 고액 차익에서 누진(45%)이 아니라 20%다", () => {
    // 현행 누진 코드에서는 383,010,000이 나온다. 20%면 199,500,000.
    const r = calculateForeignStockTax(fx(1_000_000_000));
    expect(r.incomeTax).toBe(expected20(1_000_000_000).incomeTax); // 199,500,000
  });

  it("R-9 [역전 확인] 소액 차익에서 누진(6%)이 아니라 20%다", () => {
    // 현행 누진 코드에서는 30,000이 나온다. 20%면 100,000.
    const r = calculateForeignStockTax(fx(3_000_000));
    expect(r.incomeTax).toBe(expected20(3_000_000).incomeTax); // 100,000
  });

  it("R-10 [정밀도] floor(x × 0.2)가 정확 정수연산과 1원도 어긋나지 않는다", () => {
    // `applyRate`는 double 0.2를 곱한다. 0.70이 `applyFairMarketRatio`를 필요로 했던 것처럼
    // 1원이 깎일 수 있는 자리라, 5로 나누어떨어지는 경계에서 정확값과 대조한다.
    for (const taxBase of [5, 100, 12_345, 97_500_000, 102_933_335, 997_500_000, 1_999_999_995]) {
      const gain = taxBase + 2_500_000;
      const r = calculateForeignStockTax(fx(gain));
      expect(r.taxBase).toBe(taxBase);
      // 정확 정수연산: taxBase × 2 / 10
      expect(r.incomeTax).toBe(Math.floor((taxBase * 2) / 10));
    }
  });
});

// ============================================================
// N 시리즈 — 준용되어 살아 있는 것 (변경되면 안 된다)
// ============================================================

describe("N — §118②이 준용하는 조문은 그대로여야 한다", () => {
  it("N-1 §118의2 5년 요건 — 4년 11개월도 not_liable", () => {
    const r = calculateForeignStockTax(fx(100_000_000, { yearsResidentInKorea: 4 }));
    expect(r.taxCategory).toBe("not_liable");
    expect(r.ineligibleReason).toContain("118의2");
  });

  it("N-2 §178의5② 장기할부 분할수령 환산액 불변", () => {
    const r = calculateForeignStockTax(
      fx(0, {
        transferReceiptMode: "installments",
        transferInstallmentReceipts: [
          { receiptDate: new Date("2025-06-01"), amountForeign: 100, exchangeRate: 1_300 },
          { receiptDate: new Date("2025-12-01"), amountForeign: 100, exchangeRate: 1_400 },
        ],
      }),
    );
    // 100×1300 + 100×1400 = 270,000 — 시점별 환율 개별 적용
    expect(r.transferPriceKrw).toBe(270_000);
    expect(r.transferReceiptDetail?.totalKrw).toBe(270_000);
  });

  it("N-3 §118의4 필요경비 — 자본적지출+양도비이며 개산공제는 발생하지 않는다", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, { capitalExpenditureForeign: 300_000, transferCostForeign: 200_000 }),
    );
    expect(r.necessaryExpensesKrw).toBe(500_000);
    // 개산공제(§163⑥4호 1%)가 섞이면 이 값이 커진다 — §97② 경로가 아님을 고정
    expect(r.necessaryExpensesKrw).not.toBeGreaterThan(500_000);
  });

  it("N-4 §118의6 필요경비 산입(expense) 방식이 유지된다", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, {
        hasForeignTax: true,
        foreignTaxPaidForeign: 1_000_000,
        foreignTaxExchangeRate: 1,
        foreignTaxMethod: "expense",
      }),
    );
    expect(r.foreignTaxExpenseApplied).toBe(1_000_000);
    expect(r.necessaryExpensesKrw).toBe(1_000_000);
  });

  it("N-5 §118의6 세액공제(credit) 방식이 유지된다", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, {
        hasForeignTax: true,
        foreignTaxPaidForeign: 1_000_000,
        foreignTaxExchangeRate: 1,
        foreignTaxMethod: "credit",
      }),
    );
    expect(r.foreignTaxCreditApplied).toBe(1_000_000);
    expect(r.finalTax).toBe(r.incomeTax - 1_000_000);
  });

  it("N-6 LTHD는 적용되지 않는다 (금액 기준 — 근거 문구는 D-5에서 정정)", () => {
    // 장기보유(2020-01-02 취득 → 2025-06-01 양도, 5년 초과)여도 과세표준이 깎이지 않는다
    const r = calculateForeignStockTax(fx(100_000_000));
    expect(r.taxBase).toBe(100_000_000 - 2_500_000);
  });

  it("N-7 지방소득세 10원 미만 절사", () => {
    const r = calculateForeignStockTax(fx(3_000_000));
    expect(r.localIncomeTax % 10).toBe(0);
    expect(r.localIncomeTax).toBe(Math.floor((r.incomeTax * 0.1) / 10) * 10);
  });
});

// ============================================================
// B 시리즈 — 기본공제 (D-2)
// ============================================================

describe("B — 기본공제는 §103①2호 그룹 연 1회 250만원", () => {
  it("B-1 국외주식 단독이면 250만원 1회 — 현행과 값이 같다", () => {
    const r = calculateForeignStockTax(fx(100_000_000));
    expect(r.basicDeduction).toBe(2_500_000);
  });

  it("B-1b 차익이 250만 미만이면 차익만큼만 공제", () => {
    const r = calculateForeignStockTax(fx(1_000_000));
    expect(r.basicDeduction).toBe(1_000_000);
    expect(r.taxBase).toBe(0);
  });

  it("B-1c 차손이면 기본공제 0", () => {
    const r = calculateForeignStockTax(fx(-5_000_000));
    expect(r.transferGain).toBeLessThan(0);
    expect(r.basicDeduction).toBe(0);
    expect(r.taxBase).toBe(0);
  });
});

// ============================================================
// R-5 / G 시리즈 — 2020-01-01 이전 양도 차단 (Q-2 · §6.5)
//
// 🔑 차단은 **⑧ validate와 ⑫ Zod 양쪽**에 있어야 한다. 한쪽만 막으면
//    API 직접 호출로 뚫려 「차단 중」이 거짓말이 된다 — 그래서 두 계층을 **각각** 단언한다.
// ============================================================

/** ⑧ validate용 최소 폼 — 양도일 외 필수값은 채워 두어 다른 오류가 섞이지 않게 한다. */
function form(transferDate: string): StockTransferFormData {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: "10",
    acquisitionDate: "2019-01-02",
    transferDate,
    shareCount: "100",
  } as unknown as StockTransferFormData;
}

/** ⑫ Zod용 최소 body */
function body(transferDate: string) {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Anchor Corp",
    countryCode: "US",
    shareCount: 100,
    transferDate,
    transferPriceMode: "total",
    totalTransferPriceForeign: 10_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1_300,
    acquisitionDate: "2019-01-02",
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 50,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1_200,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
  };
}

describe("G — 2020-01-01 이전 양도는 두 계층 모두에서 차단된다", () => {
  it("G-0 술어 자체 — 경계 하루 차이로 갈린다", () => {
    expect(isBeforeForeignStockTrack("2019-12-31")).toBe(true);
    expect(isBeforeForeignStockTrack("2020-01-01")).toBe(false);
    expect(isBeforeForeignStockTrack(new Date("2019-12-31"))).toBe(true);
    expect(isBeforeForeignStockTrack(new Date("2020-01-01"))).toBe(false);
    // 미입력은 여기서 막지 않는다 — 필수값 검증의 몫
    expect(isBeforeForeignStockTrack(undefined)).toBe(false);
    expect(isBeforeForeignStockTrack("")).toBe(false);
  });

  it("R-5 ⑧ validate — 2019-12-31 양도는 error", () => {
    const errs = validateStep1Foreign(form("2019-12-31"));
    const hit = errs.find((e) => e.field === "transferDate" && e.severity === "error");
    expect(hit).toBeDefined();
    expect(hit?.message).toContain("2020-01-01");
  });

  it("R-6 ⑧ validate [양성 대조군] — 2020-01-01 양도는 통과", () => {
    const errs = validateStep1Foreign(form("2020-01-01"));
    expect(errs.filter((e) => e.field === "transferDate" && e.severity === "error")).toHaveLength(0);
  });

  it("R-5b ⑫ Zod — 2019-12-31 양도는 400 (클라 우회 API 직접 호출 방어)", () => {
    const parsed = foreignStockInputSchema.safeParse(body("2019-12-31"));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const hit = parsed.error.issues.find((i) => i.path.includes("transferDate"));
      expect(hit).toBeDefined();
      expect(hit?.message).toContain("2020-01-01");
    }
  });

  it("R-6b ⑫ Zod [양성 대조군] — 2020-01-01 양도는 통과", () => {
    const parsed = foreignStockInputSchema.safeParse(body("2020-01-01"));
    expect(parsed.success).toBe(true);
  });
});

// ============================================================
// S 시리즈 — 구조 트립와이어
//
// ## 🔴 2026-08-12 개정 — 종전 S-1이 **울려야 할 때 울리지 않았다**
//
// 종전 S-1은 「다종목 `items` 스키마는 국외주식을 받지 않는다」를
// **`stockTransferInputSchema`**(국내 단건 스키마)로 단언했다. 그런데 `items`가 실제로 쓰는
// 스키마는 `stockTransferAggregateInputSchema.items`이고, D-3에서 그것을
// **`aggregateStockItemSchema`(국내 ∪ 국외) union**으로 넓혔는데도 S-1은 그대로 통과했다 —
// 국내 단건 스키마는 여전히 국외를 거부하기 때문이다.
//
// ⇒ **트립와이어가 다른 단계를 보고 있었다**([[feedback_anchor_observes_wrong_stage]]).
//   전제가 뒤집혔는데 초록불이 유지되는 것이 가장 나쁜 실패다. 이제 **실제 `items` 스키마**를
//   본다.
//
// ## 남은 전제 (2026-08-12 실측)
//
// 엔진·API는 열렸지만 **클라이언트 경로는 아직 없다**:
//   · `lib/calc/stock-transfer-tax-api.ts` — `items` grep **0건** (aggregate로 보내지 않는다)
//   · `calc-wizard-stock-store.ts:77` — `marketType`이 **폼-전역** 단일 필드
//   ⇒ 사용자는 아직 국외주식 2종목을 입력할 수 없다. Phase 5(다종목 UI)가 그것을 연다.
// ============================================================

describe("S — 다종목 경로 구조 (D-3 완료 후)", () => {
  it("S-1 🆕 **실제** items 스키마(union)는 국외주식을 받는다 — D-3 완료", () => {
    // `body()`는 국외주식 body다(marketType: "foreign_stock").
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [body("2025-06-01"), body("2025-09-01")],
      deductionMode: "aggregate",
    });
    expect(parsed.success).toBe(true);
  });

  it("S-2 [음성 대조군] 알 수 없는 marketType은 거부된다 — union이 아무거나 받는 게 아니다", () => {
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [{ ...body("2025-06-01"), marketType: "bogus_market" }],
      deductionMode: "aggregate",
    });
    expect(parsed.success).toBe(false);
  });

  it("S-3 국내 **단건** 스키마는 여전히 국외주식을 거부한다 — 경로가 섞이지 않았다", () => {
    // 단건 `POST`는 `marketType === "foreign_stock"`이면 `handleForeignStock`으로 가야 한다.
    // 국내 단건 스키마가 국외를 받기 시작하면 그 분기가 무의미해진다.
    const parsed = stockTransferInputSchema.safeParse({
      ...body("2025-06-01"),
      marketType: "foreign_stock",
    });
    expect(parsed.success).toBe(false);
  });

  it("S-4 ✅ 클라이언트가 `items`를 보낸다 — Phase 5 완료 (트립와이어가 예정대로 울렸다)", () => {
    // 종전 S-4는 「클라이언트가 아직 items를 안 보낸다」는 **전제**를 고정하는 트립와이어였다.
    // Phase 5에서 `callStockTransferTaxAggregateAPI`가 배선되자 **설계대로 실패**했고
    // (pre-push 전체 회귀에서 검출), 여기서 실제 전송 anchor로 교체했다.
    //
    // 이제 고정하는 것: 다종목 합산 경로가 **실재한다**. 지워지면 §103①2호 공동 기본공제·
    // §102② 통산·§118의6①1호 B/C가 전부 도달 불가로 되돌아간다.
    expect(stockTransferApiSource).toContain("callStockTransferTaxAggregateAPI");
    expect(stockTransferApiSource).toContain("items:");
    expect(stockTransferApiSource).toContain('deductionMode: "aggregate"');
  });
});

// ============================================================
// F 시리즈 — 외국납부세액 공제한도의 A 항 (Q-3 종결 · 계획서 §4 Q-3 / §3.4 D-4)
//
// §118의6①1호:
//   공제한도금액 = A × B / C
//   A: **제118조의5에 따라 계산한** 해당 과세기간의 국외자산에 대한 양도소득 산출세액
//
// A가 지시하는 §118의5는 §118②의 준용 목록에 **없다**. 두 독법이 있었다:
//   (가) A = §104①12호로 계산한 국외주식 산출세액 (준용 맥락으로 치환)
//   (나) A = §118의5대로 §55① 누진으로 계산한 가상세액 (인용 문언 그대로)
//
// ⇒ **(가) 확정** (2026-08-12 DRF·서식 실측):
//   ① §118② 열거가 §118의2~§118의4·§118의6뿐 ⇒ §55①을 국외주식에 적용할 근거가 없다.
//   ② §118의5①의 「국외자산」은 §118의2가 정하는 것인데 그 **3호·4호가 삭제**되어
//      국외주식은 §118의5의 적용대상 자체가 아니다 ⇒ (나)는 적용대상 아닌 조문의 적용이다.
//   ③ 영 §178의7(§118의6② 위임)은 A를 재정의하지 않는다 — 「국외자산 양도소득세액」
//      (=공제받을 외국세)의 범위만 정한다.
//   ④ 별지 제84호서식 부표 1 세율표가 국외주식 산출세액을 **10%(코드 1-62)·20%(1-61)** 로
//      계산한다. §55① 비교(⑩ 산출세액란 가·나)는 「§94①1호·2호 및 4호 자산」 전용이라
//      3호(주식)에 오지 않는다. ⑫ 외국납부세액공제는 그 ⑩ 산출세액에서 차감된다.
//   ⑤ 국세청 해석례 부존재 — nts 코퍼스 3질의(국외주식 11건·국외자산 외국납부세액 1건·
//      국외자산 양도소득 9건) 전수 확인, A항을 다룬 해석이 없다.
//
// 🔑 이 앵커는 **(나)를 채택하면 실패하도록** 과세표준을 역전점(102,933,333원 —
//    §55① 실효세율이 20%가 되는 지점) **아래**로 잡는다. 그 위에서는 「산출세액에서 공제」
//    라는 §118의6①1호 본문이 한도를 산출세액으로 잘라내 두 독법의 차이가 사라진다.
//
// ⚠️ 여기서 고정하는 것은 **A 항뿐**이다. B/C 안분(다종목·다국가)은 여전히 미구현이며
//    aggregate 편입(D-3) 이후에만 가능하다 — F-3이 그 전제를 함께 고정한다.
// ============================================================

describe("F — 외국납부세액 공제한도의 A는 §104①12호 산출세액이다 (Q-3)", () => {
  /**
   * 차익 52,500,000 → 기본공제 250만 → 과세표준 50,000,000 (역전점 아래)
   *   (가) A = floor(50,000,000 × 0.2)              = 10,000,000
   *   (나) A = 0.15 × 50,000,000 − 1,260,000        =  6,240,000  ← 채택 시 실패
   * 외국납부세액 8,000,000원을 걸어 **두 독법이 실제 공제액에서 갈리게** 한다.
   */
  const GAIN = 52_500_000;
  const FOREIGN_TAX = 8_000_000;
  const input = fx(GAIN, {
    hasForeignTax: true,
    foreignTaxPaidForeign: FOREIGN_TAX,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1,
    foreignTaxMethod: "credit",
  });
  const result = calculateForeignStockTax(input);

  it("F-0 [픽스처 가드] 과세표준이 역전점 아래여야 두 독법이 갈린다", () => {
    expect(result.taxBase).toBe(50_000_000);
    expect(result.taxBase).toBeLessThan(102_933_333);
  });

  it("F-1 한도 A = §104①12호 20% 산출세액 10,000,000 (§55① 누진 6,240,000 아님)", () => {
    expect(result.foreignTaxCreditLimit).toBe(expected20(GAIN).incomeTax);
    expect(result.foreignTaxCreditLimit).toBe(10_000_000);
    expect(result.foreignTaxCreditLimit).not.toBe(6_240_000);
  });

  it("F-2 외국납부세액 8,000,000 < 한도 → 전액 공제 · 최종세액 2,000,000", () => {
    // (나)였다면 한도 6,240,000에 막혀 공제 6,240,000 · 최종세액 3,760,000이 된다.
    expect(result.foreignTaxCreditApplied).toBe(8_000_000);
    expect(result.finalTax).toBe(2_000_000);
  });

  it("F-3 [트립와이어] 단건 경로는 B = C라 한도가 A 전액이다 — 다종목이 열리면 깨진다", () => {
    // 엔진이 국외자산을 하나만 보므로 B/C = 1이다. aggregate에 국외주식이 편입되는 순간
    // 이 동일성이 깨지고 B/C 안분(D-4 잔여)을 구현해야 한다.
    expect(result.foreignTaxCreditLimit).toBe(result.incomeTax);
  });
});
