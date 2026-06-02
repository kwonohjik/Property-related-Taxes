/**
 * besshi-buppyo-2 명세 페이지 분할 anchor — splitBuppyo2NaRows
 *
 * Plan: docs/00-pm/inheritance-buppyo-2-na-page1-overflow-split.plan.md
 * R1 1쪽 5행 · R2 4초과 시 별지 계속 + 2쪽 오버플로(중복 없음) · R3 5 이하 1쪽 전부·2쪽 없음.
 */

import { describe, it, expect } from "vitest";
import { splitBuppyo2NaRows } from "@/components/calc/inheritance/besshi-buppyo-2/besshi-buppyo-2-constants";
import type { Buppyo2ItemRow } from "@/lib/calc/besshi-buppyo-2-data";

const row = (n: number): Buppyo2ItemRow => ({
  kindCode: "A11",
  typeCode: "12",
  locationOrName: `R${n}`,
  isOverseasAsset: false,
  quantityOrArea: null,
  unitPrice: null,
  valuatedAmount: n,
  valuationMethodCode: "01",
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));

describe("부표2 명세 페이지 분할 (splitBuppyo2NaRows)", () => {
  it("P-3: N=3 → 1쪽 전부, 2쪽 없음", () => {
    const r = splitBuppyo2NaRows(rows(3));
    expect(r.page1Rows.length).toBe(3);
    expect(r.page2Rows.length).toBe(0);
    expect(r.needsContinuation).toBe(false);
    expect(r.needsPage2).toBe(false);
  });

  it("P-5: N=5 경계 → 1쪽 5행 전부, 2쪽 없음 (R3 우선)", () => {
    const r = splitBuppyo2NaRows(rows(5));
    expect(r.page1Rows.length).toBe(5);
    expect(r.page2Rows.length).toBe(0);
    expect(r.needsContinuation).toBe(false);
    expect(r.needsPage2).toBe(false);
  });

  it("P-6: N=6 경계 → 1쪽 4행+별지계속, 2쪽 2행(중복 없음) (R2)", () => {
    const r = splitBuppyo2NaRows(rows(6));
    expect(r.page1Rows.length).toBe(4);
    expect(r.page2Rows.length).toBe(2);
    expect(r.needsContinuation).toBe(true);
    expect(r.needsPage2).toBe(true);
    // 무중복: page1 마지막 ≠ page2 첫
    expect(r.page1Rows[3].locationOrName).toBe("R4");
    expect(r.page2Rows[0].locationOrName).toBe("R5");
  });

  it("P-16: N=16(배우자 fixture) → 1쪽 4행, 2쪽 12행", () => {
    const r = splitBuppyo2NaRows(rows(16));
    expect(r.page1Rows.length).toBe(4);
    expect(r.page2Rows.length).toBe(12);
    expect(r.needsPage2).toBe(true);
  });

  it("INV: 모든 N에서 page1+page2 = N (무중복·무누락)", () => {
    for (const n of [0, 1, 4, 5, 6, 10, 16, 20]) {
      const r = splitBuppyo2NaRows(rows(n));
      expect(r.page1Rows.length + r.page2Rows.length).toBe(n);
    }
  });
});
