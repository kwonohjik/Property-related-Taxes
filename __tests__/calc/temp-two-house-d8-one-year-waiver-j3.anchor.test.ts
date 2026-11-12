/**
 * anchor — 합가 D8 상대 쪽 짝(B → C)의 §155① 1년 요건은 **양도 주택 A의 §154① 단서로 면제하지 않는다** (2026-11-12 리뷰 J-3 · 사용자 결정).
 *
 * 소득세법 시행령 §155① 후단 「이 경우 제154조제1항제1호, 같은 항 제2호가목 및 같은 항 제3호의 어느 하나에 해당하는 경우에는
 * 종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 않으며」 — §154① 각 호는 그 주택의
 * 양도·수용 사실이고, 사전-2026-법규재산-0643은 D8 짝의 종전주택을 B로 본다. A의 사유를 B→C 짝으로 옮기는 직접 근거는 없다
 * ⇒ 면제하지 않고, 면제했다면 결론이 바뀌는 경우에만 「확인 필요」를 고지한다(`155-1-roster-pair-one-year-waiver-unverified`).
 *
 * 시료(0643 변형): 甲 A 2018-02-22(양도 · 3호 부득이) · 乙 B 2021-06-01 · 乙 C 2022-04-19(B 취득 후 1년 안) · 혼인 2022-11-23 ·
 * 양도 2025-03-19(C 취득일부터 3년 안).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2025-03-19")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const NOTICE = "155-1-roster-pair-one-year-waiver-unverified";

const d8Form = (bAcq: string, extra: Record<string, unknown> = {}) => ({
  isOneHousehold: true,
  transferDate: "2025-03-19",
  contractTotalPrice: "800000000",
  marriageDate: "2022-11-23",
  isFirstTransferredInMerge: true,
  asset: {
    assetKind: "housing",
    acquisitionDate: "2018-02-22",
    // 3호(부득이)는 1년 이상 거주가 요건 — 거주 24개월(직접 입력)
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "24",
  },
  houses: [
    { id: "b", region: "non_capital", acquisitionDate: bAcq, mergeOrigin: "counterpart_side", acquisitionOrigin: "general" },
    { id: "c", region: "non_capital", acquisitionDate: "2022-04-19", mergeOrigin: "counterpart_side", acquisitionOrigin: "general" },
  ],
  ...extra,
});
const UNAVOIDABLE = { provisoReason: "unavoidable" };

const run = (bAcq: string, extra: Record<string, unknown> = {}) => observeRaw(mkCase("2025-03-20", d8Form(bAcq, extra)));
const card = (bAcq: string, extra: Record<string, unknown> = {}) => {
  const f = buildCaseForm(mkCase("2025-03-20", d8Form(bAcq, extra)));
  return judgmentTempTwoHouseVerdict(f, judgmentDerivedNewHouse(f)) as unknown as { status: string; oneYearWaived?: boolean };
};
const undeterminedIds = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.undetermined ?? []).map((u: { id: string }) => u.id);

describe("J-3 — D8 짝 1년 요건은 A의 단서로 면제하지 않는다", () => {
  it("B→C 1년 안 · A 3호 → 과세 + 확인 필요 고지 · 카드도 면제 안 함", async () => {
    const r = await run("2021-06-01", UNAVOIDABLE);
    expect(r.issues.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.j.isExempt).toBe(false);
    expect(undeterminedIds(r)).toContain(NOTICE);
    expect(card("2021-06-01", UNAVOIDABLE).oneYearWaived).toBe(false);
  });

  it("대조: 단서 없음 → 과세 · 고지 없음(면제 사유가 없으면 결론이 갈리지 않는다)", async () => {
    const r = await run("2021-06-01");
    expect(r.j.isExempt).toBe(false);
    expect(undeterminedIds(r)).not.toContain(NOTICE);
  });

  it("양성 짝: B→C 1년 지남(B 2018-11-23 · 0643 원 사실) · A 3호 → 비과세 · 고지 없음", async () => {
    const r = await run("2018-11-23", UNAVOIDABLE);
    expect(r.j.isExempt).toBe(true);
    expect(undeterminedIds(r)).not.toContain(NOTICE);
  });
});
