/**
 * @vitest-environment jsdom
 *
 * 이월과세 A/B 비교 카드 — **다건 결과에서 이월과세 종목마다 모두 표시** (계획서 Q-8 · 부록 B V-5)
 *
 * 종전: Calculator가 대표 결과로 **마지막 종목**만 두고(`setResult(agg.items.at(-1))`) 결과뷰는
 * 그 종목의 `carryoverDetail`만 카드로 그렸다 — 이월과세 종목이 마지막이 아니면 카드가 **통째로 안 떴다**
 * (국내 2종목에도 있던 결함, 국외 이월과세가 섞이면 빈도가 커진다).
 *
 * MC-1 국내 2종목(이월과세가 첫째) — V-5 재현: 마지막이 아니어도 카드가 뜬다
 * MC-2 이월과세 2건 — 카드 2장, 머리표 「종목 1」「종목 2」
 * MC-3 국내 + 국외 이월과세 — 국외 카드는 variant=foreign(「세율 보유기간」 문장 없음)
 * MC-4 단건(aggregate 없음) — 종전 그대로 1장
 * MC-5 이월과세 종목이 없으면 카드 0장
 */
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import type { StockAggregateMeta } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { carryover, stock, D } from "../../../tax-engine/stock-transfer/carryover-97-2-fixtures";
import { FOREIGN_CARRYOVER } from "../../../tax-engine/stock-transfer/foreign-carryover-97-2-fixtures";

afterEach(cleanup);

/** 국내 픽스처와 같은 과세기간(2025)에 증여·양도하는 국외 이월과세 종목 */
const F2025_CARRY: ForeignStockInput = {
  ...FOREIGN_CARRYOVER,
  acquisitionDate: D("2025-06-01"),
  transferDate: D("2025-12-01"),
  donorAcquisitionDate: D("2025-03-01"),
};

const CARD_TITLE = "§97의2① 이월과세 — 적용 / 미적용 비교";

function renderView(items: Parameters<typeof calculateStockTransferTaxAggregate>[0], opts: { single?: boolean } = {}) {
  const agg = calculateStockTransferTaxAggregate(items);
  const last = agg.items[agg.items.length - 1] as StockTransferResult;
  const aggregate: StockAggregateMeta = { items: agg.items as StockTransferResult[], aggregated: agg };
  const r = render(
    <StockTransferTaxResultView
      result={last}
      shareCount={10_000}
      aggregate={opts.single ? undefined : aggregate}
    />,
  );
  return { agg, ...r };
}
const cards = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("p")).filter((p) => p.textContent?.includes(CARD_TITLE));

describe("MC — 다건 결과의 이월과세 비교 카드", () => {
  it("MC-1 국내 2종목: 이월과세 종목이 첫째(마지막이 아님)여도 카드가 뜬다 (V-5)", () => {
    const { agg, container } = renderView([carryover(), stock()]);
    // 전제 — 마지막 종목에는 carryoverDetail이 없다(종전 결함이 재현되는 배치)
    expect(agg.items[0].carryoverDetail).toBeDefined();
    expect(agg.items[1].carryoverDetail).toBeUndefined();
    expect(cards(container)).toHaveLength(1);
  });

  it("MC-2 이월과세 2건: 카드 2장, 머리표가 종목 순서를 가린다", () => {
    const { container } = renderView([carryover(), carryover({ perShareAcquisitionPrice: 80_000 })]);
    expect(cards(container)).toHaveLength(2);
    const text = container.textContent ?? "";
    expect(text).toContain("종목 1");
    expect(text).toContain("종목 2");
  });

  it("MC-3 국내 + 국외 이월과세: 국외 카드는 foreign variant — 「세율 보유기간」 문장이 없다", () => {
    const { agg, container } = renderView([carryover(), F2025_CARRY]);
    expect(agg.items[1].carryoverDetail).toBeDefined();
    const all = cards(container);
    expect(all).toHaveLength(2);
    const bodies = all.map((p) => p.closest("div.rounded-lg")?.textContent ?? "");
    // 국내 카드: 종전 문장 그대로
    expect(bodies[0]).toContain("세율 보유기간도");
    // 국외 카드: 단일세율이라 틀린 문장 — 없다
    expect(bodies[1]).not.toContain("세율 보유기간");
    expect(bodies[1]).not.toContain("§104②2호");
    // 국외 카드는 취득가액(원화 환산) 행이 있다
    expect(bodies[1]).toContain("취득가액 (원화 환산)");
  });

  it("MC-4 단건(aggregate 없음): 종전 그대로 1장", () => {
    const { container } = renderView([carryover()], { single: true });
    expect(cards(container)).toHaveLength(1);
  });

  it("MC-5 이월과세 종목이 없으면 카드 0장", () => {
    const { container } = renderView([stock(), stock()]);
    expect(cards(container)).toHaveLength(0);
  });

  it("MC-6 다건 국외: 비교를 수행했는데 두 세액이 0(양도차손)이어도 비교표가 그려진다 · 게이트 탈락은 표 없이 「비교하지 않았습니다」 [짝]", () => {
    const NOT_COMPARED = /적용 여부를 비교하지 않았습니다/;
    // 양도 USD 300 < 증여자 400 < 수증 800 — A·B 모두 차손이라 두 결정세액 0, 그래도 비교는 수행됐다
    const loss: ForeignStockInput = { ...F2025_CARRY, perShareTransferPriceForeign: 300 };
    const performed = renderView([loss, { ...loss, stockName: "Other" }]);
    expect(performed.agg.items[0].carryoverDetail?.comparisonPerformed).toBe(true);
    expect(performed.agg.items[0].carryoverDetail?.appliedTotalTax).toBe(0);
    expect(cards(performed.container).length).toBeGreaterThan(0);
    expect(performed.container.textContent).not.toMatch(NOT_COMPARED);
    // 동률(0 = 0)은 적용 유지 — 비교표가 그려져야 한다(prop이 없으면 「세액 > 0」 폴백으로 표가 사라진다)
    expect(performed.container.textContent).toMatch(/적용\(①\)/);
    cleanup();
    // 관계 「그 외」 — 게이트 탈락: 비교 없음
    const gateOut = renderView([{ ...loss, donorRelation: "other" }, { ...loss, acquisitionCause: "purchase", stockName: "Other" }]);
    expect(gateOut.agg.items[0].carryoverDetail?.comparisonPerformed).toBe(false);
    expect(gateOut.container.textContent).toMatch(NOT_COMPARED);
    expect(gateOut.container.textContent).not.toMatch(/적용\(①\)/);
  });
});
