/**
 * anchor — 부담부증여 **지분 일반건물(토지+건물 일괄)의 담보(상증법 §66)·임대(§61⑤) 승** 개방 (Q-3 · Q-1 a·Q-2 a).
 * 계획서 `docs/00-pm/bg-gb-fractional-gate.plan.md` §3·§4 · 선행 `bg-fractional-winner-kinds-grid.plan.md` §3.2.
 *
 * 종전: 게이트 `bgFractionalCollateralKindSupported`가 주택·토지·재개발만 통과시켜, 일반건물의 시가 모드 담보 승 3모양(축 A 단건 · 축 B · 함께 양도)과
 * 함께 양도의 기준시가 모드 담보·임대 승(시나리오마다 14칸)을 ⑧이 막았다. ⑫(엔진)는 60칸 중 58칸이 같은 종류 단건 기준과 맞았고 2칸(축 B 임대)은 +4원(게이트 무관).
 * 지금: 게이트에 `general_building`을 더하되 **선결 2건**을 함께 한다 —
 *  ① ⑫ Zod가 축 B 카드의 지분율을 `s.valuation?.ownershipRatio`(와이어에 없음)에서 읽어 담보 승인데 실지취득가액을 요구하던 막다른 길(⑧ 0건 → ⑫ 400) → `?? s.ownershipRatio`.
 *  ② 취득 안내 3곳이 담보 승을 축 없이 읽어 «실지취득가액 × 채무비율»이라 말하던 정반대 안내 → 축을 읽는다(components 쪽 anchor).
 * 의제취득일(1985.1.1.) 전 상속·증여 파트(`gbBgMarketPreDeemedParts`)는 당초 열지 않았다(Q-2 a — 같은 파트의 보충 승이 단건과 18,000,000 어긋났다). #3021이 그 값을 고친 뒤
 * V-P5로 열었다(격자는 `transfer.route.bg-gb-pre-deemed-collateral-win.anchor.test.ts`).
 *
 * 오라클 = 같은 시나리오의 단건(축 A 단건 = 반 크기 단건 · 축 B = 단건 100% · 함께 양도 = 단건 합) + 손계산 고정값(494,000,000 · 988,000,000 · 1,682,000,000).
 *
 * · GB-1 60칸 격자(2 시나리오 × 3모양 × 10칸) — ⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 오라클 (축 B 임대 2칸은 종전 +4원 이내).
 * · GB-2 고정값 — 시가 담보 K-4 세 모양.
 * · GB-3 축 B 실지 비움 — 담보 승이면 칸이 없으므로 ⑧ 0건 ∧ ⑫ 200 (막다른 길 해소) · 보충 승이면 ⑧ ≥ 1 ∧ ⑫ 400 (⑧ ⊇ ⑫).
 * · GB-4 필수 입력(취득시 기준시가)을 비우면 ⑧ 차단 ∧ ⑫ 400 (⑧ ⊇ ⑫).
 * · GB-5 의제취득일 전 토지·건물 파트 × 지분 × 담보 승도 연다 (V-P5) · 술어.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bgCollateralForcesStdAcq, bgFractionalCollateralKindSupported } from "@/lib/calc/burdened-gift-collateral-win";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const S = (n: number, sc: number) => String(Math.round(n * sc));
const COMMON = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual" };
/** 일반건물 시료 — 양도시 기준시가 8억(토지 6,000,000×100㎡ + 건물 2억) · 취득시 4억(2,000,000×100㎡ + 2억) · 시가 10억 · 실지 2.5억(토지 1억 + 건물 1.5억). 크기 sc. */
const gb = (sc: number, v: "base" | "sepdate"): Record<string, unknown> => {
  const b: Record<string, unknown> = { assetKind: "general_building", bgMarketValueAtTransfer: S(1_000_000_000, sc), standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc),
    gbAcqLandPricePerSqm: S(2_000_000, sc), gbAcqBuildingValue: S(200_000_000, sc), gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: S(6_000_000, sc), gbTransferBuildingValue: S(200_000_000, sc), actualSalePrice: S(1_600_000_000, sc), gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false, bgActualAcquisitionTotal: "",
    bgActualAcquisitionLand: S(100_000_000, sc), bgActualAcquisitionBuilding: S(150_000_000, sc) };
  if (v === "sepdate") Object.assign(b, { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-01" });
  return b;
};
const K5 = () => ({ bgAcquisitionMethod: "converted" });
const K6 = (sc: number) => ({ bgAcquisitionMethod: "salesCase", bgPresumedInputKind: "split", bgPresumedAcquisitionLand: S(100_000_000, sc), bgPresumedAcquisitionBuilding: S(150_000_000, sc), bgPresumedAcquisitionTotal: S(250_000_000, sc) });
const K7 = (sc: number) => ({ ...K6(sc), bgAcquisitionMethod: "appraisal" });
const asset = (sc: number, v: "base" | "sepdate", id: string, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, ...gb(sc, v) }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const RENT = { bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = (t: string) => ({ assetSplitMode: "fractional", contractTotalPrice: t });
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };
const dbl = (v: string) => String(Number(v) * 2);

const issues = (f: TransferFormData) => {
  const out: { field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push({ field: i.field, message: i.message });
  return out;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Res = Awaited<ReturnType<typeof post>>;
const gainOf = (r: Res) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Res) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r)!; };

type Cell = { name: string; mode: Record<string, unknown>; win: Record<string, unknown>; ext?: (sc: number) => Record<string, unknown> };
const CELLS: Cell[] = [
  { name: "기준시가·담보", mode: STD, win: debt("700000000") },
  { name: "기준시가·임대", mode: STD, win: RENT },
  { name: "기준시가·보충", mode: STD, win: debt("200000000") },
  { name: "시가·담보 K4", mode: {}, win: debt("700000000") },
  { name: "시가·보충 K4", mode: {}, win: debt("300000000") },
  { name: "시가·담보 K5", mode: {}, win: debt("700000000"), ext: K5 },
  { name: "시가·보충 K5", mode: {}, win: debt("300000000"), ext: K5 },
  { name: "시가·담보 K6", mode: {}, win: debt("700000000"), ext: K6 },
  { name: "시가·보충 K6", mode: {}, win: debt("300000000"), ext: K6 },
  { name: "시가·담보 K7", mode: {}, win: debt("700000000"), ext: K7 },
];

describe("GB-1 일반건물 60칸 격자 — ⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 같은 종류 단건 오라클", () => {
  for (const v of ["base", "sepdate"] as const) {
    for (const c of CELLS) {
      const isRent = c.name.includes("임대");
      const isSupp = c.name.includes("보충");
      const ex = (sc: number) => (c.ext ? c.ext(sc) : {});
      const mort = (c.win as Record<string, string>).bgMortgageDebtAmount;
      const single = (sc: number, w: Record<string, unknown>) => post(form([asset(sc, v, "z", c.mode, w, ex(sc))]));

      it(`${v} · ${c.name} · 축 A 단건 50%`, async () => {
        const f = form([asset(1, v, "a", HALF, c.mode, c.win, ex(1))]);
        expect(issues(f), "⑧").toEqual([]);
        const got = ok(await post(f));
        expect(got).toBe(ok(await single(0.5, c.win)));
      });

      it(`${v} · ${c.name} · 축 B 60/40`, async () => {
        const wB: Record<string, unknown> = isRent ? { ...RENT, bgMortgageDebtAmount: "100000000", bgMortgageSetAmount: "100000000" } : debt(dbl(mort));
        const f = form([asset(1, v, "p", pct("60"), c.mode, wB, ex(1)), asset(1, v, "s", pct("40"), c.mode, wB, ex(1))], AB("1600000000"));
        expect(issues(f), "⑧").toEqual([]);
        const got = ok(await post(f));
        const ref = ok(await single(1, wB));
        // 축 B 임대 2칸은 종전부터 토지·건물 파트 안분 반올림으로 +4원(게이트 무관 — 계획서 §3.1·V-G2). 그 밖은 정확히 같다.
        if (isRent) expect(Math.abs(got - ref)).toBeLessThanOrEqual(4);
        else expect(got).toBe(ref);
      });

      it(`${v} · ${c.name} · 함께 양도 100% + 50%`, async () => {
        const wC = isRent ? { ...RENT, bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "240000000" } : isSupp ? debt(dbl(mort)) : debt("1600000000");
        const f = form([asset(1, v, "a", c.mode, wC, ex(1)), asset(1, v, "b", HALF, c.mode, c.win, ex(1))], BD);
        expect(issues(f), "⑧").toEqual([]);
        const got = ok(await post(f));
        expect(got).toBe(ok(await single(1, wC)) + ok(await single(0.5, c.win)));
      });
    }
  }
});

describe("GB-2 손계산 고정값 — 시가 담보 K-4 (취득가액 = 취득시 기준시가 × 채무비율 · 개산공제)", () => {
  it("축 A 단건 50% = 494,000,000", async () => {
    expect(ok(await post(form([asset(1, "base", "a", HALF, debt("700000000"))])))).toBe(494_000_000);
  });
  it("축 B 60/40(물건 전체 채무 14억) = 988,000,000", async () => {
    const f = form([asset(1, "base", "p", pct("60"), debt("1400000000")), asset(1, "base", "s", pct("40"), debt("1400000000"))], AB("1600000000"));
    expect(ok(await post(f))).toBe(988_000_000);
  });
  it("함께 양도 100% + 50% = 1,682,000,000", async () => {
    const f = form([asset(1, "base", "a", debt("1600000000")), asset(1, "base", "b", HALF, debt("700000000"))], BD);
    expect(ok(await post(f))).toBe(1_682_000_000);
  });
});

describe("GB-3 축 B 실지취득가액 비움 — 담보 승은 칸이 없으므로 통과, 보충 승은 요구(⑧ ⊇ ⑫)", () => {
  const BLA = { bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "" };
  const BLP = { bgPresumedAcquisitionLand: "", bgPresumedAcquisitionBuilding: "", bgPresumedAcquisitionTotal: "" };
  const mkB = (w: Record<string, unknown>, ...over: Record<string, unknown>[]) =>
    form([asset(1, "base", "p", pct("60"), ...over, w), asset(1, "base", "s", pct("40"), ...over, w)], AB("1600000000"));

  it("K-4 담보 승: ⑧ 0건 ∧ ⑫ 200 · 988,000,000 (종전 ⑫ 400 «토지·건물 칸이 모두 필요합니다»)", async () => {
    const f = mkB(debt("1400000000"), BLA);
    expect(issues(f), "⑧").toEqual([]);
    expect(ok(await post(f))).toBe(988_000_000);
  });
  it("K-6 담보 승(매매사례가액 칸 비움): ⑧ 0건 ∧ ⑫ 200 · 988,000,000", async () => {
    const f = mkB(debt("1400000000"), K6(1), BLP);
    expect(issues(f), "⑧").toEqual([]);
    expect(ok(await post(f))).toBe(988_000_000);
  });
  it("K-4 보충 승: ⑧ ≥ 1건 ∧ ⑫ 400 (보충 승은 실지취득가액을 요구한다)", async () => {
    const f = mkB(debt("600000000"), BLA);
    expect(issues(f).length).toBeGreaterThan(0);
    expect((await post(f)).status).toBe(400);
  });
});

describe("GB-4 취득시 기준시가를 비우면 ⑧ 차단 ∧ ⑫ 400 (⑧ ⊇ ⑫)", () => {
  const cases: [string, Record<string, unknown>][] = [["취득시 토지 공시지가", { gbAcqLandPricePerSqm: "" }], ["취득시 건물 기준시가", { gbAcqBuildingValue: "" }]];
  for (const [name, blank] of cases) {
    it(`축 A 단건 담보 승 · ${name}`, async () => {
      const f = form([asset(1, "base", "a", HALF, debt("700000000"), blank)]);
      expect(issues(f).length).toBeGreaterThan(0);
      expect((await post(f)).status).toBe(400);
    });
    it(`축 B 담보 승 · ${name}`, async () => {
      const f = form([asset(1, "base", "p", pct("60"), debt("1400000000"), blank), asset(1, "base", "s", pct("40"), debt("1400000000"), blank)], AB("1600000000"));
      expect(issues(f).length).toBeGreaterThan(0);
      expect((await post(f)).status).toBe(400);
    });
  }
});

describe("GB-5 의제취득일 전 파트 × 지분 × 담보 승 — V-P5로 연다 (종전 Q-2 a 차단) · 술어", () => {
  /** 토지 파트만 1980-01-01 상속(의제취득일 1985.1.1. 전) · 건물은 2015 매매 — 상증법 평가액 6천만 · 취득시 단가 300,000. */
  const PRE = (sc: number) => ({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01",
    decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: S(60_000_000, sc), gbAcqLandPricePerSqm: S(300_000, sc), acquisitionDate: "2015-01-01", gbBuildingAcquisitionCause: "purchase" });

  it("축 A 시가 담보 승: ⑧ 0건 ∧ ⑫ 200 · 581,550,000 (종전 ⑧ 차단 — 기준시가 모드와 같은 값)", async () => {
    const f = form([asset(1, "base", "a", HALF, debt("700000000"), PRE(1))]);
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(581_550_000);
  });
  it("축 B 시가 담보 승: ⑧ 0건 ∧ ⑫ 200 · 1,163,100,000", async () => {
    const f = form([asset(1, "base", "p", pct("60"), debt("1400000000"), PRE(1)), asset(1, "base", "s", pct("40"), debt("1400000000"), PRE(1))], AB("1600000000"));
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(1_163_100_000);
  });
  it("의제취득일 전 파트가 없는 같은 입력(토지 2015 매매)도 연다 (Q-3)", () => {
    expect(issues(form([asset(1, "base", "a", HALF, debt("700000000"))]))).toEqual([]);
  });
  it("기준시가 모드 담보 승은 종전처럼 통과한다(게이트와 무관 — 값 581,550,000)", async () => {
    const f = form([asset(1, "base", "a", HALF, STD, debt("700000000"), PRE(1))]);
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(581_550_000);
  });
  it("건물 파트만 의제취득일 전 상속(토지는 2015 매매)이어도 같다 — 게이트 술어 · ⑧ 0건 · 581,550,000", async () => {
    /** 건물 취득일 = acquisitionDate(1980-01-01 상속) · 토지는 별도 취득일 2015-01-01 매매. */
    const PRE_B = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "1980-01-01", gbBuildingAcquisitionCause: "inheritance",
      inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01", gbBuildingDecedentAcquisitionDate: "1970-01-01", gbBuildingInheritedValue: "60000000", gbAcqBuildingValue: "30000000" };
    const a = asset(1, "base", "a", HALF, debt("700000000"), PRE_B);
    expect(bgFractionalCollateralKindSupported(a)).toBe(true);
    expect(bgCollateralForcesStdAcq(a, false)).toBe(true);
    expect(issues(form([a]))).toEqual([]);
    expect(ok(await post(form([a])))).toBe(581_550_000);
  });
  it("술어: 게이트 · 강제", () => {
    const plain = asset(1, "base", "a", HALF, debt("700000000"));
    const pre = asset(1, "base", "a", HALF, debt("700000000"), PRE(1));
    expect(bgFractionalCollateralKindSupported(plain)).toBe(true);
    expect(bgCollateralForcesStdAcq(plain, false)).toBe(true);
    expect(bgFractionalCollateralKindSupported(pre)).toBe(true);
    expect(bgCollateralForcesStdAcq(pre, false)).toBe(true);
    // 축 인자 없이는 지분 자산을 확정하지 않는다(종전 fail-closed 유지)
    expect(bgCollateralForcesStdAcq(plain)).toBe(false);
  });
});
