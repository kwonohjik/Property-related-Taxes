/**
 * 국외전출세 종목별 실제 양도 — ⑧ validate anchor (PR-7b)
 *
 *   V-1 칸 단위: 주식 수·양도가(국내 원화 / 국외 외화+환율)·외국납부세액 방식별 필수 입력
 *   V-2 방식 충돌은 지우지 않고 막는다 — 종목별 모드 + 전역 입력 / 전역 모드 + 종목별 입력
 *   V-3 엔진 판정 사유는 «3단계»에서 막는다 — `holdings.<id>.actualTransfer…`는 2단계에서 풀 수 없다
 *   V-4 오류 앵커 = 입력칸 `data-field`(`etHoldings[i].actualTransfer.<엔진 키>`)
 *   V-5 종목별 모드에서는 전역 칸 검증이 돌지 않는다(숨은 전역 값이 종목별 입력을 가리지 않는다)
 */
import { describe, it, expect } from "vitest";
import { validateStep2ExitTax, validateStep3ExitTax } from "@/lib/calc/stock-transfer-tax-validate-exit";
import { exitTaxProblemField, exitTaxProblemStep } from "@/lib/calc/stock-transfer-exit-tax-input-problem";
import { exitActual, exitForm, F1, F1_SOLD, H1 } from "../_helpers/exit-tax-2027-form";

const errs = (f: ReturnType<typeof exitForm>) => validateStep3ExitTax(f).filter((e) => e.severity === "error");
const fields = (f: ReturnType<typeof exitForm>) => errs(f).map((e) => e.field);

describe("⑧ 칸 단위", () => {
  it("V-1 국외주식: 주식 수·외화 양도가·기준환율이 비면 각 칸을 가리킨다", () => {
    const f = exitForm({ etHoldings: [F1({ actualTransfer: exitActual() })] });
    expect(fields(f)).toEqual([
      "etHoldings[0].actualTransfer.shareCount",
      "etHoldings[0].actualTransfer.priceForeign",
      "etHoldings[0].actualTransfer.exchangeRate",
    ]);
  });

  it("V-1 국내 종목: 원화 단가를 요구한다(외화 칸은 보지 않는다)", () => {
    const f = exitForm({
      etActualTransferMode: "per_holding",
      etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "1", priceForeign: "5", exchangeRate: "5" }) })],
    });
    expect(fields(f)).toEqual(["etHoldings[0].actualTransfer.pricePerShare"]);
  });

  it("V-1 외국납부세액 — 방식별 필수 칸", () => {
    const krw = exitForm({ etHoldings: [F1({ actualTransfer: { ...F1_SOLD, foreignTaxInput: "krw" } })] });
    expect(fields(krw)).toEqual(["etHoldings[0].actualTransfer.foreignTaxPaid"]);
    const fx = exitForm({ etHoldings: [F1({ actualTransfer: { ...F1_SOLD, foreignTaxInput: "foreign" } })] });
    expect(fields(fx)).toEqual([
      "etHoldings[0].actualTransfer.foreignTaxPaidForeign",
      "etHoldings[0].actualTransfer.foreignTaxExchangeRate",
    ]);
  });

  it("V-1 외국법인 발행 국외주식의 원천징수액 입력은 막고 사유를 말한다", () => {
    const f = exitForm({ etHoldings: [F1({ actualTransfer: { ...F1_SOLD, domesticSourceTaxWithheld: "1,000" } })] });
    const e = errs(f);
    expect(e.map((x) => x.field)).toEqual(["etHoldings[0].actualTransfer.domesticSourceTaxWithheld"]);
    expect(e[0].message).toContain("외국법인이 발행한 국외주식");
  });

  it("정상 입력은 오류가 없다", () => {
    expect(errs(exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] }))).toEqual([]);
    expect(errs(exitForm({ etHoldings: [F1()] }))).toEqual([]);
  });
});

describe("⑧ 방식 충돌 — 지우지 않고 막는다", () => {
  it("V-2 종목별 모드(강제) + 전역 입력 → 충돌 오류(앵커 etActualTransferMode)", () => {
    const f = exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })], etActualTransferPricePerShare: "1,000" });
    const e = errs(f);
    expect(e).toHaveLength(1);
    expect(e[0].field).toBe("etActualTransferMode");
    expect(e[0].message).toContain("종목 공통(전역)");
    // 값은 지워지지 않는다 — validate는 폼을 바꾸지 않는다
    expect(f.etActualTransferPricePerShare).toBe("1,000");
  });

  it("V-2 전역 모드 + 종목별 입력(선택 가능한 경우) → 충돌 · 방식을 바꾸라고 안내", () => {
    const f = exitForm({ etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "1", pricePerShare: "1" }) })] });
    const e = errs(f);
    expect(e.map((x) => x.field)).toEqual(["etHoldings[0].actualTransfer"]);
    expect(e[0].message).toContain("입력 방식을 종목별로 바꾸거나");
  });

  it("V-2 2026 출국 + 종목별 입력 → 선택 불가 안내", () => {
    const f = exitForm({
      etDepartureDate: "2026-09-01",
      etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "1", pricePerShare: "1" }) })],
    });
    const e = errs(f);
    expect(e).toHaveLength(1);
    expect(e[0].message).toContain("종목 공통(전역) 입력만 씁니다");
  });

  it("V-5 종목별 모드에서는 전역 외국납부세액 토글 ON이어도 전역 칸 검증은 돌지 않는다(충돌 하나만)", () => {
    const f = exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })], etHasForeignTax: true });
    expect(fields(f)).toEqual(["etActualTransferMode"]);
  });
});

describe("⑧ 엔진 판정 단계 분배 · 앵커", () => {
  it("V-3 보유 초과 주수는 엔진 사유 — 3단계에서 막고 2단계는 통과", () => {
    const f = exitForm({ etHoldings: [F1({ actualTransfer: { ...F1_SOLD, shareCount: "1,001" } })] });
    expect(validateStep2ExitTax(f).filter((e) => e.severity === "error")).toEqual([]);
    const e = errs(f);
    expect(e).toHaveLength(1);
    expect(e[0].field).toBe("etHoldings[0].actualTransfer.shareCount");
    expect(e[0].message).toContain("보유 주식 수");
  });

  it("V-3 제외 종목 입력 → 3단계 · 종목 카드 앵커", () => {
    const small = F1({
      departureDayPriceForeign: "100",
      perShareAcquisitionPriceForeign: "40",
      actualTransfer: { ...F1_SOLD, priceForeign: "90" },
    });
    const f = exitForm({ etActualTransferMode: "per_holding", etHoldings: [H1(), small] });
    expect(validateStep2ExitTax(f).filter((e) => e.severity === "error")).toEqual([]);
    expect(fields(f)).toEqual(["etHoldings[1].actualTransfer"]);
  });

  it("V-4 exitTaxProblemStep/Field — actualTransfer 경로는 3단계 · 입력칸 앵커", () => {
    const form = exitForm({ etHoldings: [F1()] });
    const p = { message: "x", path: "holdings.f1.actualTransfer.exchangeRate" };
    expect(exitTaxProblemStep(p)).toBe(3);
    expect(exitTaxProblemField(p, form, "etBasicDeductionAllocClause1")).toBe("etHoldings[0].actualTransfer.exchangeRate");
    // 종전 종목 경로는 2단계 그대로
    const q = { message: "x", path: "holdings.f1.departureExchangeRate" };
    expect(exitTaxProblemStep(q)).toBe(2);
    expect(exitTaxProblemField(q, form, "etBasicDeductionAllocClause1")).toBe("etHoldings[0].departureExchangeRate");
  });
});
