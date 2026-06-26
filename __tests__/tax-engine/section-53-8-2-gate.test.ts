/**
 * §53⑧2호 전부매각 할증배제 게이트 anchor — 케이스 매트릭스 1~7.
 *
 * 법령: 상증령 §53⑧2(전부매각·§49①1호 적합)·§49②1(매매계약일 기준)
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.engine.design.md §1-2
 *
 * 평가기준일 D = 2026-03-01.
 *   상속 허용: D−6m(2025-09-01) ~ D+6m(2026-09-01)
 *   증여 허용: D−6m(2025-09-01) ~ D+3m(2026-06-01)
 */
import { describe, it, expect } from "vitest";
import { evaluateSection53_8_2 } from "@/lib/tax-engine/property-valuation/section-53-8-2-gate";
import type { Section53_8_2Input } from "@/lib/tax-engine/types/stock-premium-exclusion.types";

const D = new Date("2026-03-01");

const base = (over: Partial<Section53_8_2Input>): Section53_8_2Input => ({
  allSharesSold: true,
  meetsArticle49_1_1: true,
  saleContractDate: new Date("2026-04-01"),
  transferType: "inheritance",
  ...over,
});

describe("§53⑧2호 전부매각 게이트", () => {
  it("케이스1 — 상속, 전부매각+정상거래+기간내 → 배제(eligible)", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "inheritance", saleContractDate: new Date("2026-06-01") }),
      D,
    );
    expect(r).toEqual({ eligible: true });
  });

  it("케이스2 — 증여, S=D+3월(2026-06-01) 경계 포함 → 배제", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "gift", saleContractDate: new Date("2026-06-01") }),
      D,
    );
    expect(r).toEqual({ eligible: true });
  });

  it("케이스3 — 증여, S=D+3월+1일(2026-06-02) 초과 → out_of_period", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "gift", saleContractDate: new Date("2026-06-02") }),
      D,
    );
    expect(r).toEqual({ eligible: false, failReason: "out_of_period" });
  });

  it("케이스3b — 증여, S=D+3월~D+6월 사이(2026-08-01) → out_of_period(증여는 후3월만)", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "gift", saleContractDate: new Date("2026-08-01") }),
      D,
    );
    expect(r).toEqual({ eligible: false, failReason: "out_of_period" });
  });

  it("케이스4 — S<D−6월(2025-08-01) → out_of_period", () => {
    const r = evaluateSection53_8_2(
      base({ saleContractDate: new Date("2025-08-01") }),
      D,
    );
    expect(r).toEqual({ eligible: false, failReason: "out_of_period" });
  });

  it("케이스5 — 전부매각 아님 → not_all_sold", () => {
    const r = evaluateSection53_8_2(base({ allSharesSold: false }), D);
    expect(r).toEqual({ eligible: false, failReason: "not_all_sold" });
  });

  it("케이스6 — §49①1호 부적합(특수관계 부당거래) → not_normal_transaction", () => {
    const r = evaluateSection53_8_2(base({ meetsArticle49_1_1: false }), D);
    expect(r).toEqual({ eligible: false, failReason: "not_normal_transaction" });
  });

  it("케이스7 — 보조입력 부재 → missing_input", () => {
    const r = evaluateSection53_8_2(undefined, D);
    expect(r).toEqual({ eligible: false, failReason: "missing_input" });
  });

  // 경계 정밀
  it("경계 — 상속 S=D+6월(2026-09-01) 포함 → 배제", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "inheritance", saleContractDate: new Date("2026-09-01") }),
      D,
    );
    expect(r).toEqual({ eligible: true });
  });

  it("경계 — 상속 S=D+6월+1일(2026-09-02) 초과 → out_of_period", () => {
    const r = evaluateSection53_8_2(
      base({ transferType: "inheritance", saleContractDate: new Date("2026-09-02") }),
      D,
    );
    expect(r).toEqual({ eligible: false, failReason: "out_of_period" });
  });

  it("경계 — 하한 S=D−6월(2025-09-01) 포함 → 배제", () => {
    const r = evaluateSection53_8_2(
      base({ saleContractDate: new Date("2025-09-01") }),
      D,
    );
    expect(r).toEqual({ eligible: true });
  });
});
