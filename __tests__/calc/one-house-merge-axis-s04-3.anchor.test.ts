/**
 * S04-3 anchor — 두 합가일이 있는 2주택은 명부 mergeOrigin(UI 정의: 먼저 합친 쪽 = counterpart_side)이 가리키는 합가 축으로 판정한다.
 * A: 무주택 배우자와 혼인 후 1주택 부모와 동거봉양 합가(2020) → §155④ 10년 이내 → 비과세.
 * B: 동거봉양 합가(2012, 10년 경과) 후 무주택 배우자와 혼인 → §155⑤ 불성립(혼인으로 2주택 된 게 아님) → 과세.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { newForm, hrow, runCalc, type Form } from "./_one-house-pr3a-calc-route";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";

const T = "2024-12-01";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(T)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

type Sc = { sellAcq: string; marriage?: string; parental?: string; origin: "counterpart_side" | "second_merge_side" };
// B: 양도 주택 2010 · 동거봉양 2012 · 혼인(무주택 배우자) 2020 · 부모 주택 counterpart_side(먼저 합친 쪽 = 동거봉양 가족)
const B: Sc = { sellAcq: "2010-01-01", parental: "2012-01-01", marriage: "2020-01-01", origin: "counterpart_side" };
// A: 양도 주택 2005 · 혼인(무주택 배우자) 2008 · 동거봉양 2020 · 부모 주택 second_merge_side(나중 합친 쪽 = 동거봉양 가족)
const A: Sc = { sellAcq: "2005-01-01", marriage: "2008-01-01", parental: "2020-01-01", origin: "second_merge_side" };

function calcForm(s: Sc): Form {
  const f = newForm();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: s.sellAcq,
    fixedAcquisitionPrice: "300,000,000",
    addressJibun: "테스트동 1",
    residenceInputMode: "direct",
    residencePeriods: [],
  } as Form["assets"][number];
  return Object.assign(f, {
    transferDate: T,
    contractTotalPrice: "800,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    householdNoPresaleRightsConfirmed: true,
    marriageDate: s.marriage ?? "",
    parentalCareMergeDate: s.parental ?? "",
    parentalCareParentAge: s.parental ? "over_60" : "", // 결정 #9 — 동거봉양 합가일이 있으면 연령 요건 선언(60세 이상)
    isFirstTransferredInMerge: true,
    houses: [hrow({ id: "parent", acquisitionDate: "2000-01-01", mergeOrigin: s.origin })],
  });
}

function judgeCase(s: Sc, label: string): RulingCase {
  return {
    id: label,
    docNo: "-",
    docDate: "-",
    basis: "current",
    today: "2024-12-01",
    summary: label,
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: T,
      contractTotalPrice: "800000000",
      ...(s.marriage ? { marriageDate: s.marriage } : {}),
      ...(s.parental ? { parentalCareMergeDate: s.parental, parentalCareParentAge: "over_60" } : {}),
      isFirstTransferredInMerge: true,
      asset: { assetKind: "housing", acquisitionDate: s.sellAcq },
      houses: [{ id: "parent", region: "non_capital", acquisitionDate: "2000-01-01", mergeOrigin: s.origin }],
    } as RulingCase["form"],
  };
}


describe("S04-3 — 합가일 둘 + 2주택은 명부 소유 쪽이 가리키는 합가가 축", () => {
  it("A 두 날짜 — 계산기 비과세(§155④)", async () => {
    const r = await runCalc(calcForm(A));
    expect(r.issues).toEqual([]);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("B 두 날짜 — 계산기 과세(동거봉양만과 같은 세액)", async () => {
    const both = await runCalc(calcForm(B));
    const only = await runCalc(calcForm({ ...B, marriage: undefined }));
    expect(both.isExempt).toBe(false);
    expect(both.totalTax).toBe(only.totalTax);
  });
  it("A 두 날짜 — 판정 메뉴 155-4 적용", async () => {
    const o = await observeCase(judgeCase(A, "A"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("155-4-parental-care-merge");
  });
  it("B 두 날짜 — 판정 메뉴 155-5 미적용·과세", async () => {
    const o = await observeCase(judgeCase(B, "B"));
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("155-5-marriage-merge");
  });

  it.each([
    ["A 동거봉양만(합가 2020 · ④ 성립)", { ...A, marriage: undefined, origin: "counterpart_side" as const }, true],
    ["B 동거봉양만(합가 2012 · 10년 경과)", { ...B, marriage: undefined }, false],
    ["B 혼인만(혼인 2020 · ⑤ 성립)", { ...B, parental: undefined }, true],
    ["A 혼인만(혼인 2008 · 10년 경과)", { ...A, parental: undefined, origin: "counterpart_side" as const }, false],
  ])("긍정·음성 짝 — 한쪽 날짜만 넣은 대조 %s", async (_l, sc, exempt) => {
    const r = await runCalc(calcForm(sc));
    expect(r.issues).toEqual([]);
    expect(r.isExempt).toBe(exempt);
  });
  it("A 두 날짜 — 판정 메뉴 요건 검토표도 동거봉양 합가(2020-01-01) 축으로 읽는다", async () => {
    const o = await observeRaw(mkCase("2024-12-01", judgeCase(A, "A").form as Record<string, unknown>));
    expect(o.j.isExempt).toBe(true);
    const w = o.j.requirementReview?.items.find((x: { id: string }) => x.id === "merge-window");
    expect(w?.facts.find((f: { label: string }) => f.label === "합가일")?.value).toBe("2020-01-01");
  });
  it("B 두 날짜 — 판정 메뉴 요건 검토표는 동거봉양 합가(2012-01-01) 축으로 기한 미충족을 보인다", async () => {
    const o = await observeRaw(mkCase("2024-12-01", judgeCase(B, "B").form as Record<string, unknown>));
    expect(o.j.isExempt).toBe(false);
    const w = o.j.requirementReview?.items.find((x: { id: string }) => x.id === "merge-window");
    expect(w?.facts.find((f: { label: string }) => f.label === "합가일")?.value).toBe("2012-01-01");
    expect(w?.status).toBe("unmet");
  });
});
