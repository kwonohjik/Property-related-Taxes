/**
 * 국외전출세 — 「보유 종목 최소 1건」 게이트가 **매트릭스가 있는 단계**에 있다
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` §2 · Q-1
 *
 * ## 왜 옮겼나
 *
 * 보유 종목 매트릭스는 **하나의 UI**인데 종전에는 Step1 이 「최소 1건 있는가」를,
 * Step2 가 「행별 상세」를 봤다. 매트릭스를 2단계로 옮기면서 게이트를 1단계에 두면
 * **사용자가 종목을 추가할 수단 없이 막힌다** — 화면에 「+ 종목 추가」가 없기 때문이다.
 * [[feedback_required_field_needs_an_input_path]]
 *
 * ⇒ 게이트를 **행 상세 검증과 같은 단계(Step2)** 로 옮긴다.
 */

import { describe, it, expect } from "vitest";
import { validateStep1, validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

const HOLDINGS_MSG = /보유 종목을 최소 1건/;

const exitForm = (o: Partial<StockTransferFormData> = {}): StockTransferFormData =>
  ({
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    etYearsResidentLast10: "10",
    etDepartureDate: "2025-06-01",
    etIsMajorShareholder: true,
    etHoldings: [],
    ...o,
  }) as StockTransferFormData;

describe("EX-5 보유 종목 게이트는 Step2 에 있다", () => {
  it("EX-5 🔴 Step1 은 종목 0건을 막지 않는다 (매트릭스가 없는 단계다)", () => {
    const errs = validateStep1(exitForm()).filter((e) => e.severity === "error");
    expect(errs.some((e) => HOLDINGS_MSG.test(e.message))).toBe(false);
  });

  it("EX-5b 🔴 Step2 가 종목 0건을 막는다", () => {
    const errs = validateStep2(exitForm()).filter((e) => e.severity === "error");
    expect(errs.some((e) => HOLDINGS_MSG.test(e.message))).toBe(true);
  });

  it("EX-5c Step1 의 다른 게이트는 살아 있다 (양성 짝 — 통째로 비운 게 아니다)", () => {
    const errs = validateStep1(exitForm({ etYearsResidentLast10: "", etDepartureDate: "" }))
      .filter((e) => e.severity === "error")
      .map((e) => e.field);
    expect(errs).toContain("etYearsResidentLast10");
    expect(errs).toContain("etDepartureDate");
  });

  it("EX-5d 종목이 1건 있으면 Step2 의 «최소 1건» 오류가 사라진다 (부정형의 짝)", () => {
    const withOne = exitForm({
      etHoldings: [
        {
          id: "h1",
          stockName: "A",
          marketType: "kospi",
          shareCount: "100",
          acquisitionDate: "2020-01-02",
          perShareAcquisitionPrice: "10000",
          departureDayValuationMode: "market_price",
          departureDayMarketPrice: "20000",
          priorYearEndMonthAvg: "",
          unlistedSamplePrice: "",
          unlistedStdPricePerShare: "",
        },
      ],
    } as Partial<StockTransferFormData>);
    const errs = validateStep2(withOne).filter((e) => e.severity === "error");
    expect(errs.some((e) => HOLDINGS_MSG.test(e.message))).toBe(false);
  });
});
