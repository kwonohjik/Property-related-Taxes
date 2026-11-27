/**
 * 국외전출세 종목별 실제 양도 — ④ 변환 · ⑬ body (PR-7b) anchor
 *
 *   B-1 토글 OFF(null) 종목은 `actualTransfer` 키가 없다 · ON인 종목만 싣는다
 *   B-2 국외주식은 외화 단가+환율만, 국내 종목은 원화 단가만 — 반대 쪽 stale 값은 싣지 않는다
 *   B-3 빈 칸은 키를 싣지 않는다(0·대체값 없음)
 *   B-4 외국납부세액은 선택한 방식 한쪽만 — 반대 쪽·꺼진 방식의 stale 값은 싣지 않는다
 *   B-5 비거주자 원천징수액은 허용 종목(국내·내국법인 발행)만
 *   B-6 모드가 다른 값은 싣지 않는다 — 종목별 모드에서는 전역 키 전부 제거 · 전역 모드에서는 종목별 입력 미전송
 *   B-7 외국납부세액 배제 사유는 종목별 외국납부세액이 있을 때만(종목별 모드)
 *   B-8 body는 ⑫ Zod를 통과해 엔진 input의 `holdings[].actualTransfer`(Date 변환 포함)에 도달한다
 *   B-9 엔진 결과 — F1 전량 양도 조정공제 40,000,000 → 경정 후 143,500,000 · 400주 부분 양도 16,000,000
 */
import { describe, it, expect } from "vitest";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-exit-tax-schema";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import { exitActual, exitForm, F1, F1_SOLD, H1 } from "../_helpers/exit-tax-2027-form";

type Body = Record<string, unknown> & { holdings: Record<string, unknown>[] };
const body = (form: ReturnType<typeof exitForm>) => buildExitTaxApiBody(form) as Body;

describe("④ 종목별 실제 양도 body", () => {
  it("B-1 토글 OFF 종목에는 키가 없다 · ON 종목만 싣는다", () => {
    const b = body(
      exitForm({
        etHoldings: [H1(), F1({ actualTransfer: F1_SOLD })],
        etBasicDeductionAllocClause1: "2,500,000",
        etBasicDeductionAllocClause2b: "0",
      }),
    );
    expect("actualTransfer" in b.holdings[0]).toBe(false);
    expect(b.holdings[1].actualTransfer).toEqual({ shareCount: 1000, priceForeign: 1000, exchangeRate: 1200 });
  });

  it("B-2 국외주식은 외화 단가+환율만 — 국내 원화 단가 stale 값은 싣지 않는다", () => {
    const a = exitActual({ ...F1_SOLD, pricePerShare: "999,999" });
    const at = body(exitForm({ etHoldings: [F1({ actualTransfer: a })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect(at.priceForeign).toBe(1000);
    expect(at.exchangeRate).toBe(1200);
    expect("pricePerShare" in at).toBe(false);
  });

  it("B-2 국내 종목은 원화 단가만 — 외화 단가·환율 stale 값은 싣지 않는다", () => {
    const a = exitActual({ shareCount: "5,000", pricePerShare: "40,000", priceForeign: "77", exchangeRate: "1300" });
    const b = body(exitForm({ etActualTransferMode: "per_holding", etHoldings: [H1({ actualTransfer: a })] }));
    expect(b.holdings[0].actualTransfer).toEqual({ shareCount: 5000, pricePerShare: 40000 });
  });

  it("B-3 빈 칸은 키를 싣지 않는다 — 주식 수·양도가 미입력을 0으로 채우지 않는다", () => {
    const at = body(exitForm({ etHoldings: [F1({ actualTransfer: exitActual() })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect(at).toEqual({});
  });

  it("B-4 외국납부세액은 선택한 방식 한쪽만", () => {
    const krw = exitActual({
      ...F1_SOLD,
      foreignTaxInput: "krw",
      foreignTaxPaid: "5,000,000",
      foreignTaxPaidForeign: "9999", // 방식 전환 전 stale 값
      foreignTaxExchangeRate: "1300",
    });
    const atKrw = body(exitForm({ etHoldings: [F1({ actualTransfer: krw })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect(atKrw.foreignTaxPaid).toBe(5_000_000);
    for (const k of ["foreignTaxPaidForeign", "foreignTaxExchangeRate", "foreignTaxCurrencyCode"]) expect(k in atKrw).toBe(false);

    const fx = exitActual({
      ...F1_SOLD,
      foreignTaxInput: "foreign",
      foreignTaxPaidForeign: "10,000",
      foreignTaxExchangeRate: "1,300.5",
      foreignTaxPaid: "7,000,000", // stale
    });
    const atFx = body(exitForm({ etHoldings: [F1({ actualTransfer: fx })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect(atFx).toMatchObject({ foreignTaxPaidForeign: 10000, foreignTaxExchangeRate: 1300.5, foreignTaxCurrencyCode: "USD" });
    expect("foreignTaxPaid" in atFx).toBe(false);

    const none = exitActual({ ...F1_SOLD, foreignTaxInput: "none", foreignTaxPaid: "7,000,000" });
    const atNone = body(exitForm({ etHoldings: [F1({ actualTransfer: none })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect("foreignTaxPaid" in atNone).toBe(false);
  });

  it("B-5 비거주자 원천징수액은 허용 종목만 — 외국법인 발행 국외주식에는 싣지 않는다", () => {
    const a = exitActual({ ...F1_SOLD, domesticSourceTaxWithheld: "1,000,000" });
    const foreignCorp = body(exitForm({ etHoldings: [F1({ actualTransfer: a })] })).holdings[0].actualTransfer as Record<string, unknown>;
    expect("domesticSourceTaxWithheld" in foreignCorp).toBe(false);
    const domesticCorp = body(exitForm({ etHoldings: [F1({ isListedForeignCorp: false, actualTransfer: a })] })).holdings[0]
      .actualTransfer as Record<string, unknown>;
    expect(domesticCorp.domesticSourceTaxWithheld).toBe(1_000_000);
    const domestic = body(
      exitForm({
        etActualTransferMode: "per_holding",
        etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "1", pricePerShare: "1", domesticSourceTaxWithheld: "5" }) })],
      }),
    );
    expect((domestic.holdings[0].actualTransfer as Record<string, unknown>).domesticSourceTaxWithheld).toBe(5);
  });

  it("B-6 종목별 모드(강제)에서는 전역 경정청구 키를 싣지 않는다", () => {
    const b = body(
      exitForm({
        etHoldings: [F1({ actualTransfer: F1_SOLD })],
        etActualTransferDate: "2027-06-01",
        etActualTransferPricePerShare: "1,000,000",
        etHasForeignTax: true,
        etForeignTaxPaid: "5,000,000",
        etForeignTaxPaidForeign: "100",
        etForeignTaxExchangeRate: "1300",
        etDomesticSourceTaxWithheld: "100",
      }),
    );
    for (const k of [
      "actualTransferDate",
      "actualTransferPricePerShare",
      "foreignTaxPaid",
      "foreignTaxPaidForeign",
      "foreignTaxExchangeRate",
      "foreignTaxCurrencyCode",
      "domesticSourceTaxWithheld",
    ]) {
      expect(k in b, k).toBe(false);
    }
    expect(b.holdings[0].actualTransfer).toBeDefined();
  });

  it("B-6 전역 모드(1호뿐·기본)에서는 종목별 입력이 남아 있어도 싣지 않고 전역 키는 종전 그대로", () => {
    const b = body(
      exitForm({
        etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "5,000", pricePerShare: "40,000" }) })],
        etDeferralRequested: true,
        etActualTransferDate: "2027-06-01",
        etActualTransferPricePerShare: "40,000",
      }),
    );
    expect("actualTransfer" in b.holdings[0]).toBe(false);
    expect(b.actualTransferPricePerShare).toBe(40000);
    expect(b.actualTransferDate).toBe("2027-06-01");
  });

  it("B-6 2026 출국도 전역 — 종목별 입력은 싣지 않는다 (2026 body 불변)", () => {
    const b = body(
      exitForm({
        etDepartureDate: "2026-09-01",
        etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "5,000", pricePerShare: "40,000" }) })],
      }),
    );
    expect("actualTransfer" in b.holdings[0]).toBe(false);
  });

  it("B-7 배제 사유는 종목별 외국납부세액이 있을 때만", () => {
    const none = body(exitForm({ etForeignTaxExclusionReason: "step_up", etHoldings: [F1({ actualTransfer: F1_SOLD })] }));
    expect(none.foreignTaxExclusionReason).toBe("none");
    const withTax = exitActual({ ...F1_SOLD, foreignTaxInput: "krw", foreignTaxPaid: "1,000,000" });
    const some = body(exitForm({ etForeignTaxExclusionReason: "step_up", etHoldings: [F1({ actualTransfer: withTax })] }));
    expect(some.foreignTaxExclusionReason).toBe("step_up");
  });

  it("B-8 ⑫ Zod를 통과해 엔진 input에 도달한다 — 실제 양도일 Date 변환 포함", () => {
    const a = exitActual({ ...F1_SOLD, transferDate: "2027-06-01", foreignTaxInput: "krw", foreignTaxPaid: "1,000,000" });
    const parsed = exitTaxInputSchema.safeParse(body(exitForm({ etHoldings: [F1({ actualTransfer: a })] })));
    expect(parsed.success).toBe(true);
    const input = buildExitTaxEngineInput(body(exitForm({ etHoldings: [F1({ actualTransfer: a })] })));
    const at = input.holdings[0].actualTransfer;
    expect(at).toMatchObject({ shareCount: 1000, priceForeign: 1000, exchangeRate: 1200, foreignTaxPaid: 1_000_000 });
    expect(at?.transferDate).toBeInstanceOf(Date);
  });

  it("B-9 엔진 결과 — 전량 양도 조정공제 40,000,000 · 경정 후 143,500,000", () => {
    const input = buildExitTaxEngineInput(body(exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] })));
    const r = calculateExitTax(input);
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.adjustmentDeduction).toBe(40_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(143_500_000);
    expect(r.holdingDetails[0].actualTransfer).toMatchObject({
      soldShareCount: 1000,
      departureValueSold: 1_400_000_000,
      actualTransferValue: 1_200_000_000,
      priceDrop: 200_000_000,
    });
  });

  it("B-9 부분 양도 400주 → 조정공제 16,000,000", () => {
    const a = exitActual({ ...F1_SOLD, shareCount: "400" });
    const r = calculateExitTax(buildExitTaxEngineInput(body(exitForm({ etHoldings: [F1({ actualTransfer: a })] }))));
    expect(r.adjustmentDeduction).toBe(16_000_000);
    expect(r.holdingDetails[0].actualTransfer?.priceDrop).toBe(80_000_000);
  });
});
