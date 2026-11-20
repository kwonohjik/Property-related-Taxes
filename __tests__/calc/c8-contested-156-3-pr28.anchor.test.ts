/**
 * PR-28 anchor (2026-11 리뷰) — 양론 C8(종전주택 보유 중 취득한 분양권이 완공된 뒤 종전주택 양도)의 반대 입장(§156의3②·③).
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-80 | B가 3년 경과 예외(③ 이사·거주) 사실을 받을 칸이 없음 | 분양권 완공 신규 주택 행이 3년을 넘기면 ③ 카드가 열린다 · 「예」면 B 비과세(결론 같음 → 카드 없음) · 미답 불성립은 확인 필요 |
 * | D-81 | B가 「§156의3 ∧ §155①」로 계산됨 | §156의3②가 성립하면 §155①의 전입요건이 B를 뒤집지 않는다 |
 * | D-89 | 결론이 같아도 C8 카드가 뜸 | 결론이 갈릴 때만(결정 #43 D · Q-30 (a)) |
 *
 * 법령: 「소득세법 시행령」 §156의3② 「종전주택을 취득한 날부터 1년 이상이 지난 후에 분양권을 취득하고 그 분양권을 취득한 날부터 3년 이내에
 * 종전주택을 양도하는 경우 … 1세대 1주택으로 보아 제154조제1항을 적용한다」(전입·조정대상지역 문언 없음) · ③(3년 경과 뒤 이사·거주) · 사전-2024-법규재산-0833.
 */
import { describe, it, expect } from "vitest";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { rightThreeYearExceptionVisible } from "@/lib/calc/right-three-year-exception-scope";

const C8 = "155-1-presale-holding-completion";
const menu = (o: {
  today: string; transfer: string; prevAcq: string; prevRegion?: string; houses: Record<string, unknown>[]; over?: Record<string, unknown>;
}): RulingCase => ({
  id: "c8", docNo: "-", docDate: "-", basis: "current", today: o.today, summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: o.transfer, contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: o.prevAcq, ...(o.prevRegion ? { regionCode: o.prevRegion, residenceInputMode: "direct", residencePeriodMonthsAsset: "48" } : {}) },
    houses: o.houses,
    ...(o.over ?? {}),
  } as RulingCase["form"],
});

describe("D-81 B는 §156의3②로만 — §155① 전입요건이 B를 뒤집지 않는다", () => {
  // S1: 강남 종전 2018-01-01 · 거주 48개월 · 분양권 2021-01-10 · 완공 2021-06-01 · 양도 2022-03-01 · 세대 전입일 공란
  const s1 = (over: Record<string, unknown> = {}) =>
    menu({
      today: "2022-03-02", transfer: "2022-03-01", prevAcq: "2018-01-01", prevRegion: "1168010100",
      houses: [{ id: "b", region: "capital", regionCode: "1168010100", acquisitionDate: "2021-06-01", acquisitionOrigin: "presale", rightAcquisitionDate: "2021-01-10" }],
      over,
    });
  it("S1 전입일 공란 → A 과세 · B 비과세(§156의3② 3년 안) · 결론 갈림", async () => {
    const o = await observeCase(s1());
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.contested.find((c) => c.id === C8)).toMatchObject({ A: "taxable", B: "exempt" });
  });
});

describe("D-80 · D-89 ③ 칸 · 결론 같음", () => {
  // R-5 시료: 종전 2015-03-15 · 분양권 2022-03-15 · 완공 2025-09-15 · 양도 2026-06-15(분양권 취득 3년 경과)
  const r5 = (over: Record<string, unknown> = {}) =>
    menu({
      today: "2026-10-10", transfer: "2026-06-15", prevAcq: "2015-03-15",
      houses: [{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2022-03-15" }],
      over,
    });
  it("분양권 완공 신규 주택 행이 3년을 넘기면 ③ 카드가 열린다", () => {
    expect(rightThreeYearExceptionVisible(buildCaseForm(r5()) as never)).toBe(true);
  });
  it("③ 미답 → A 비과세 / B 과세(카드 유지) · B 사유는 확인 필요", async () => {
    const o = await observeCase(r5());
    expect(o.contested.find((c) => c.id === C8)).toMatchObject({ A: "exempt", B: "taxable" });
  });
  it("③ 「예」(완성일·이사·거주) → B 비과세 · 결론 같음 → 카드 없음", async () => {
    const o = await observeCase(
      r5({ rightThreeYearExceptionKind: "new_house", rightNewHouseCompletionDate: "2025-09-15", rightMovedInWithin3Years: true, rightResidedOneYearOrMore: true }),
    );
    expect(o.isExempt).toBe(true);
    expect(o.contested.find((c) => c.id === C8)).toBeUndefined();
  });
  it("대조 — 분양권 취득 3년 이내(2024-03-15)면 ③ 카드를 열지 않는다", () => {
    const c = r5();
    (c.form as unknown as { houses: Record<string, unknown>[] }).houses[0].rightAcquisitionDate = "2024-03-15";
    expect(rightThreeYearExceptionVisible(buildCaseForm(c) as never)).toBe(false);
  });
});
