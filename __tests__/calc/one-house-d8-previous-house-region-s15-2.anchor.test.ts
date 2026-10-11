/**
 * S15-2 anchor — 합가 D8 「상대 쪽 두 주택」 짝(B → C)의 §155①2호 「종전의 주택」 조정 여부는 **B의 소재**로 판정한다.
 *
 * 법문: 「소득세법 시행령」 §155① 본문 「그 주택(이하 이 항에서 "종전의 주택")」 = 신규 주택을 취득한 1세대가 그때 소유하던 주택,
 * 2호(MST 229391)·현행 1호(MST 290841) 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」.
 * 짝의 종전·신규는 사전-2026-법규재산-0643(B: 종전주택, C: 신규주택)이 정한다.
 * ⚠️ A(합가 전 취득해 먼저 양도하는 주택)를 양도할 때 조정 판정 기준 주택을 직접 다룬 해석례는 확인하지 못했다(확인 필요) —
 *    기대값은 법문의 「종전의 주택」 정의와 짝의 명시에 기댄다.
 *
 * 연천(4180025000)은 2020-03-01 비조정, 강남(1168010100)은 조정. 혼인 2020-06-01, 양도 2021-06-01 — 신규(C) 취득 2020-03-01부터
 * 단축 기한 1년의 말일은 2021-03-02라 B·C가 모두 조정이면 기한이 지났고, B가 비조정이면 3년이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { newForm, hrow, runCalc } from "./_one-house-pr3a-calc-route";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2021-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const GN = "1168010100";
const YC = "4180025000";

const form = (a: string, b: string | undefined, c: string, extra: Record<string, unknown> = {}) => ({
  isOneHousehold: true,
  transferDate: "2021-06-01",
  contractTotalPrice: "800000000",
  marriageDate: "2020-06-01",
  isFirstTransferredInMerge: true,
  asset: { assetKind: "housing", acquisitionDate: "2015-02-22", regionCode: a },
  houses: [
    { id: "b", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2016-11-23", mergeOrigin: "counterpart_side", ...(b ? { regionCode: b } : {}) },
    { id: "c", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2020-03-01", mergeOrigin: "counterpart_side", regionCode: c },
  ],
  ...extra,
});

async function run(f: Record<string, unknown>) {
  const c = mkCase("2021-06-02", f);
  const r = await observeRaw(c);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2021-06-02T03:00:00Z"));
  try {
    const built = buildCaseForm(c);
    const card = judgmentTempTwoHouseVerdict(built, judgmentDerivedNewHouse(built)) as {
      status: string;
      regulated: { previous?: boolean; next?: boolean; previousAuto: boolean; determined: boolean };
    };
    return { r, card };
  } finally {
    vi.useRealTimers();
  }
}
const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.appliedExceptions ?? []).map((e: { id: string }) => e.id);
const errors = (r: Awaited<ReturnType<typeof observeRaw>>) => r.issues.filter((x) => x.startsWith("error"));

describe("S15-2 D8 짝(B→C) — 종전주택은 B다", () => {
  it("P1 A강남·B연천(비조정)·C강남 → B 비조정 → 3년 → 카드 eligible · 비과세(155-1·155-5)", async () => {
    const { r, card } = await run(form(GN, YC, GN));
    expect(errors(r)).toEqual([]);
    expect(card.status).toBe("eligible");
    expect(card.regulated.previous).toBe(false);
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-5-marriage-merge"]));
  });
  it("P3 A연천·B강남·C강남 → B·C 모두 조정 → 1년 기한 경과 → 카드 ineligible · 과세", async () => {
    const { r, card } = await run(form(YC, GN, GN));
    expect(errors(r)).toEqual([]);
    expect(card.status).toBe("ineligible");
    expect(card.regulated.previous).toBe(true);
    expect(r.j.isExempt).toBe(false);
  });
  it("대조 P4 A·B·C 강남 → 과세", async () => {
    const { r, card } = await run(form(GN, GN, GN));
    expect(card.status).toBe("ineligible");
    expect(r.j.isExempt).toBe(false);
  });
  it("대조 P2 A·B 연천 · C 강남 → 비과세", async () => {
    const { r, card } = await run(form(YC, YC, GN));
    expect(card.status).toBe("eligible");
    expect(r.j.isExempt).toBe(true);
  });
  it("B에 주소가 없으면 A의 주소로 대신 판정하지 않는다 — 자동 판정 불가 · 미확정 → 선언을 받는다", async () => {
    const { card } = await run(form(GN, undefined, GN));
    expect(card.regulated.previousAuto).toBe(false);
    expect(card.regulated.previous).toBeUndefined();
    expect(card.regulated.determined).toBe(false);
  });
  it("B에 주소가 없을 때 선언(조정대상지역 아님)을 받으면 그대로 따른다 → 3년 · 비과세", async () => {
    const { r, card } = await run(form(GN, undefined, GN, { prevHouseRegulatedAtNewAcquisition: "no" }));
    expect(card.regulated.previous).toBe(false);
    expect(card.status).toBe("eligible");
    expect(r.j.isExempt).toBe(true);
  });
  it("양성 짝 — 양도 주택 A와 짝(A→C, 합가 후 취득 1채)이면 종전주택은 여전히 A의 주소로 판정한다", async () => {
    const f = form(GN, undefined, GN);
    f.houses = [{ id: "c", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2020-08-01", regionCode: GN }] as never;
    const { card } = await run(f);
    expect(card.regulated.previousAuto).toBe(true);
    expect(card.regulated.previous).toBe(true);
  });
});

describe("S15-2 계산기 — 같은 짝·같은 판정(④⑫⑭)", () => {
  function calc(a: string, b: string, c: string) {
    const f = newForm();
    f.isOneHousehold = true;
    Object.assign(f.assets[0], {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-02-22",
      fixedAcquisitionPrice: "300,000,000", addressJibun: "테스트 주소 1", regionCode: a,
      residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
    });
    return Object.assign(f, {
      transferDate: "2021-06-01", contractTotalPrice: "800,000,000", residencePeriodMonths: "0",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: false,
      householdHousingCount: "3", marriageDate: "2020-06-01", isFirstTransferredInMerge: true,
      houses: [
        hrow({ id: "b", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2016-11-23", mergeOrigin: "counterpart_side", regionCode: b }),
        hrow({ id: "c", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2020-03-01", mergeOrigin: "counterpart_side", regionCode: c }),
      ],
    });
  }
  it("A강남·B연천(비조정)·C강남 → 비과세 0원", async () => {
    const r = await runCalc(calc(GN, YC, GN));
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("A연천·B강남·C강남 → 과세", async () => {
    const r = await runCalc(calc(YC, GN, GN));
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });
});
