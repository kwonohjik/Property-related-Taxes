/**
 * S15-14 anchor — §155⑱ 처분기한 예외는 양도일 연혁을 따른다: 2022-02-15 전 양도분은 사유 해당 **그리고** 「그 방법으로 양도」(④⑫⑭ 경유).
 * 연혁 leaf 자체는 `__tests__/tax-engine/transfer/temporary-two-house-155-18-era.anchor.test.ts`가 고정한다(원문 근거도 거기).
 *
 * 시료: 종전 2015-01-01 · 신규 2018-03-01(비조정) → 3년 말일 2021-03-02 · 양도 2021-06-01(기한 경과).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { newForm, hrow, runCalc, type Form } from "./_one-house-pr3a-calc-route";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2021-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const judgeForm = (transferDate: string, prev: string, nw: string, extra: Record<string, unknown>) => ({
  isOneHousehold: true,
  isRegulatedArea: false,
  transferDate,
  contractTotalPrice: "500000000",
  asset: { assetKind: "housing", acquisitionDate: prev },
  houses: [{ id: "new", acquisitionOrigin: "general", region: "non_capital", acquisitionDate: nw }],
  ...extra,
});
const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.appliedExceptions ?? []).map((e: { id: string }) => e.id);
const errs = (r: Awaited<ReturnType<typeof observeRaw>>) => r.issues.filter((x) => x.startsWith("error"));
const run = (transferDate: string, prev: string, nw: string, extra: Record<string, unknown>) =>
  observeRaw(mkCase("2026-10-10", judgeForm(transferDate, prev, nw, extra)));

function card(transferDate: string, prev: string, nw: string, extra: Record<string, unknown>) {
  const f = buildCaseForm(mkCase("2026-10-10", judgeForm(transferDate, prev, nw, extra)));
  return judgmentTempTwoHouseVerdict(f, judgmentDerivedNewHouse(f)) as unknown as {
    status: string;
    threeYearMet: boolean;
    delayReasonApplied: boolean;
    delayNote?: string;
  };
}

describe("S15-14 판정 메뉴 — 2022-02-15 전 양도분", () => {
  it("2021-06-01 · kamco · 방법 미확인 → 과세(⑱ 미적용) · 카드가 확인 필요를 말한다", async () => {
    const f = { disposalDelayReason: "kamco" };
    const r = await run("2021-06-01", "2015-01-01", "2018-03-01", f);
    expect(errs(r)).toEqual([]);
    expect(r.j.isExempt).toBe(false);
    expect(ids(r)).not.toContain("155-18-disposal-delay:kamco");
    const c = card("2021-06-01", "2015-01-01", "2018-03-01", f);
    expect(c.status).toBe("ineligible");
    expect(c.delayReasonApplied).toBe(false);
    expect(c.delayNote).toContain("확인 필요");
  });
  it("양성 짝 — 같은 사실에 「그 방법으로 양도」를 확인하면 비과세 · 155-18 적용", async () => {
    const f = { disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true };
    const r = await run("2021-06-01", "2015-01-01", "2018-03-01", f);
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain("155-18-disposal-delay:kamco");
    expect(card("2021-06-01", "2015-01-01", "2018-03-01", f).delayReasonApplied).toBe(true);
  });
  it("방법을 「아니다」로 두면(false는 싣지 않는다) 과세", async () => {
    const r = await run("2021-06-01", "2015-01-01", "2018-03-01", { disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: false });
    expect(r.j.isExempt).toBe(false);
  });
  it("④ — 방법 선언은 사유가 있을 때만 싣는다(stale 방지)", async () => {
    const withReason = await run("2021-06-01", "2015-01-01", "2018-03-01", { disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true });
    expect((withReason.body as { temporaryTwoHouse?: Record<string, unknown> }).temporaryTwoHouse).toMatchObject({
      disposalDelayReason: "kamco",
      disposalDelayDisposedByThatMethod: true,
    });
    const noReason = await run("2021-06-01", "2015-01-01", "2018-03-01", { disposalDelayDisposedByThatMethod: true });
    expect((noReason.body as { temporaryTwoHouse?: Record<string, unknown> }).temporaryTwoHouse).not.toHaveProperty("disposalDelayDisposedByThatMethod");
  });
  it("2019-06-01 · expropriation_suit(당시 5호 없음) → 방법을 확인해도 과세", async () => {
    const f = { disposalDelayReason: "expropriation_suit", disposalDelayDisposedByThatMethod: true };
    const r = await run("2019-06-01", "2012-01-01", "2016-03-01", f);
    expect(r.j.isExempt).toBe(false);
    expect(card("2019-06-01", "2012-01-01", "2016-03-01", f).delayNote).toContain("2020.02.11.");
  });
  it("2019-06-01 · kamco · 방법 확인 → 비과세(1~3호는 전 구간에 있다)", async () => {
    const r = await run("2019-06-01", "2012-01-01", "2016-03-01", { disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true });
    expect(r.j.isExempt).toBe(true);
  });
});

describe("S15-14 판정 메뉴 — 2022-02-15 이후는 현행 문언(사유만)", () => {
  it("2023-06-01 · kamco · 방법 미확인 → 비과세 유지(대조)", async () => {
    const r = await run("2023-06-01", "2016-01-01", "2020-03-01", { disposalDelayReason: "kamco" });
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain("155-18-disposal-delay:kamco");
  });
  it("경계 — 양도 2022-02-14는 방법이 필요하고 2022-02-15는 필요 없다", async () => {
    // 종전 2015-01-01 · 신규 2019-01-01 → 3년 말일 2022-01-02(기한 경과). 사유만 선언.
    const f = { disposalDelayReason: "auction" };
    expect((await run("2022-02-14", "2015-01-01", "2019-01-01", f)).j.isExempt).toBe(false);
    expect((await run("2022-02-15", "2015-01-01", "2019-01-01", f)).j.isExempt).toBe(true);
  });
});

describe("S15-14 계산기 — 판정 메뉴에서 넘겨받은 사실(④⑫⑭)", () => {
  function calcForm(extra: Partial<Form>): Form {
    const f = newForm();
    f.isOneHousehold = true;
    Object.assign(f.assets[0], {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "300,000,000", addressJibun: "테스트 주소 1", regionCode: "4180025000",
      residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
    });
    return Object.assign(f, {
      transferDate: "2021-06-01", contractTotalPrice: "500,000,000", residencePeriodMonths: "0",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: false,
      householdHousingCount: "2", isRegulatedArea: false,
      houses: [hrow({ id: "new", acquisitionOrigin: "general", acquisitionDate: "2018-03-01", region: "non_capital" })],
      ...extra,
    });
  }
  it("사유만(방법 미확인) → 과세 · 방법 확인 → 비과세 0원", async () => {
    const no = await runCalc(calcForm({ disposalDelayReason: "kamco" }));
    expect(no.status).toBe(200);
    expect(no.isExempt).toBe(false);
    expect(no.totalTax).toBeGreaterThan(0);
    const yes = await runCalc(calcForm({ disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true }));
    expect(yes.isExempt).toBe(true);
    expect(yes.totalTax).toBe(0);
  });
});

describe("S15-14 판정 보류 — 방법 미확인이 결론을 가를 때만 확인 필요", () => {
  it("2021-06-01 · kamco · 방법 미확인 → undetermined에 155-18-disposal-method-unverified", async () => {
    const r = await run("2021-06-01", "2015-01-01", "2018-03-01", { disposalDelayReason: "kamco" });
    expect((r.j.undetermined ?? []).map((u: { id: string }) => u.id)).toContain("155-18-disposal-method-unverified");
  });
  it("방법을 확인하면 고지가 사라진다", async () => {
    const r = await run("2021-06-01", "2015-01-01", "2018-03-01", { disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true });
    expect((r.j.undetermined ?? []).map((u: { id: string }) => u.id)).not.toContain("155-18-disposal-method-unverified");
  });
  it("결론을 가르지 않으면(기한 안 양도) 고지하지 않는다", async () => {
    const r = await run("2021-01-15", "2015-01-01", "2018-03-01", { disposalDelayReason: "kamco" });
    expect((r.j.undetermined ?? []).map((u: { id: string }) => u.id)).not.toContain("155-18-disposal-method-unverified");
  });
  it("2022-02-15 이후 양도는 고지하지 않는다", async () => {
    const r = await run("2023-06-01", "2016-01-01", "2020-03-01", { disposalDelayReason: "kamco" });
    expect((r.j.undetermined ?? []).map((u: { id: string }) => u.id)).not.toContain("155-18-disposal-method-unverified");
  });
});
