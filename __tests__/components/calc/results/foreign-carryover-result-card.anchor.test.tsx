/**
 * @vitest-environment jsdom
 *
 * 국외주식 §97의2① 이월과세 — **단건 결과 카드** (⑦)
 *
 * RC-1 FC-1 적용: 비교 카드가 뜨고 두 결정세액(49,500,000 / 39,500,000)이 보인다
 * RC-2 취득가액 행이 「증여자 취득 당시 승계」로 바뀐다
 * RC-3 PD-2 배제(②3호): 채택은 미적용 열, 문구는 §97의2②3호 배제
 * RC-4 게이트 탈락한 선언 종목(`carryoverComparison` 없음): 0원 비교표를 그리지 않는다
 * RC-5 미선언 종목: 카드 없음 · 종전 화면 그대로
 * RC-6 필요경비 행이 증여자 자본적지출·증여세 상당액을 밝힌다
 * RC-7 국외 카드에는 「세율 보유기간」·숫자 끝 「원」이 없다
 * RC-8 비교를 **수행했는데** 두 결정세액이 모두 0(양도차손)이면 비교표를 그린다 — 「>0」 추정이 아니라
 *      `carryoverComparison` 유무로 가른다(RC-4의 짝)
 */
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { ForeignStockInput, ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { FOREIGN_BASE, FOREIGN_CARRYOVER } from "../../../tax-engine/stock-transfer/foreign-carryover-97-2-fixtures";

afterEach(cleanup);

const run = (i: ForeignStockInput) => calculateStockTransferTax(i) as ForeignStockResult;
const view = (r: ForeignStockResult) => render(<ForeignStockResultCard result={r} stockName="Example Corp" />);
const CARD = "§97의2① 이월과세 — 적용 / 미적용 비교";

describe("RC — 국외 단건 결과 카드의 이월과세", () => {
  it("RC-1 FC-1: 비교 카드와 두 결정세액", () => {
    const { container } = view(run(FOREIGN_CARRYOVER));
    const t = container.textContent ?? "";
    expect(t).toContain(CARD);
    expect(t).toContain("이월과세를 적용");
    expect(t).toContain("49,500,000");
    expect(t).toContain("39,500,000");
    expect(t).toContain("전체 결정세액");
  });

  it("RC-2 취득가액 행이 증여자 취득 당시 승계로 바뀌고, 비교표에 원화 환산 A/B가 있다", () => {
    const { container } = view(run(FOREIGN_CARRYOVER));
    const t = container.textContent ?? "";
    expect(t).toContain("취득가액 (외화) — 증여자 취득 당시 승계 (이월과세)");
    expect(t).toContain("증여자 취득일 기준환율");
    expect(t).toContain("취득가액 (원화 환산)");
    expect(t).toContain("50,000,000"); // A
    expect(t).toContain("100,000,000"); // B
    expect(t).toContain("2025-08-01");
  });

  it("RC-3 PD-2 배제: 미적용 채택 · ②3호 문구", () => {
    const { container } = view(run({ ...FOREIGN_CARRYOVER, donorPerShareAcquisitionPriceForeign: 1_600 }));
    const t = container.textContent ?? "";
    expect(t).toContain("이월과세를 적용하지 않았습니다");
    expect(t).toContain("§97의2②3호로 배제");
    expect(t).not.toContain("취득가액 (외화) — 증여자 취득 당시 승계");
  });

  it("RC-4 게이트 탈락(양도가 수증일 1년 초과): 0원 비교표 없음 · 미비교 문구", () => {
    const r = run({ ...FOREIGN_CARRYOVER, transferDate: new Date("2027-01-06") });
    // 전제 — 선언 종목이라 outcome은 오지만 비교는 없다(엔진 계약)
    expect(r.carryoverOutcome).toBe("excluded");
    expect(r.carryoverComparison).toBeUndefined();
    const { container } = view(r);
    const t = container.textContent ?? "";
    expect(t).toContain(CARD);
    expect(t).toContain("적용 여부를 비교하지 않았습니다");
    expect(t).not.toContain("전체 결정세액");
    expect(container.querySelector("table")).toBeNull();
  });

  it("RC-5 미선언: 카드 없음", () => {
    const { container } = view(run(FOREIGN_BASE));
    expect(container.textContent ?? "").not.toContain(CARD);
    expect(container.textContent ?? "").toContain("39,500,000");
  });

  it("RC-6 필요경비 행이 증여자 자본적지출·증여세 상당액을 밝힌다", () => {
    const r = run({
      ...FOREIGN_CARRYOVER,
      donorCapitalExpenditureForeign: 10,
      donorCapitalExpenditureExchangeRate: 1_200,
      giftTaxAmount: 1_000_000,
      transferredAssetValue: 50_000_000,
      giftTaxableValue: 100_000_000,
    });
    const { container } = view(r);
    const t = container.textContent ?? "";
    expect(t).toContain("증여자 자본적지출 12,000");
    expect(t).toContain("증여세 상당액 500,000");
    expect(t).toContain("증여자 자본적지출 + 증여세 상당액");
    // 비교표 산입 행
    expect(t).toContain("증여자 자본적지출 산입 (①2호)");
    expect(t).toContain("증여세 상당액 산입 (①3호)");
  });

  it("RC-7 국외 카드에는 「세율 보유기간」·숫자 끝 「원」이 없다", () => {
    const { container } = view(run(FOREIGN_CARRYOVER));
    const card = Array.from(container.querySelectorAll("p")).find((p) => p.textContent?.includes(CARD))!.closest(
      "div.rounded-lg",
    )!;
    const t = card.textContent ?? "";
    expect(t).not.toContain("세율 보유기간");
    expect(t).not.toMatch(/\d원/);
  });

  it("RC-8 비교 수행 + 두 세액 0(양도차손): 비교표가 있다 (RC-4의 긍정 짝)", () => {
    const r = run({ ...FOREIGN_CARRYOVER, perShareTransferPriceForeign: 100 });
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 0, excludedTotalTax: 0 });
    const { container } = view(r);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent ?? "").toContain("전체 결정세액");
  });
});
