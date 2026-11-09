/**
 * anchor — 부담부증여 **지분 일반건물의 의제취득일(1985.1.1.) 전 상속 파트 × 담보(상증법 §66)·임대(§61⑤) 승** 개방 (V-P5).
 * 계획서 `docs/00-pm/bg-gb-pre-deemed-fractional-clause-a.plan.md` §5 V-P5 · 선행 #3012(Q-2 a 차단) · #3021(의제취득일 전 파트 ①② 지분 축소).
 *
 * 종전: 게이트 `bgFractionalCollateralKindSupported`가 일반건물의 의제취득일 전 토지·건물 파트를 막아, 지분(축 A 단건 · 축 B · 함께 양도)의 시가 모드 담보 승과
 * 함께 양도의 기준시가 모드 담보·임대 승을 ⑧이 막았다. ⑫는 그때도 200이었고 값이 단건 기준과 같았다(⑧만 막았다).
 * 지금: 게이트를 열고 3자 max 술어(`gbBgThreeWayParts`·`gbBgUsesStdAcq`)에 축을 싣는다 — 축 없이 읽으면 지분 자산의 담보 승을 담보 패로 읽어
 * 3자 max로 판정했다(쓰이지 않는 ①을 ⑧이 요구하고 ⑤가 3자 max 안내를 띄운다 — 지분 50%·축 B 60% 실측).
 *
 * 오라클 = 같은 시나리오의 단건(축 A 단건 = 반 크기 단건 · 축 B = 단건 100% · 함께 양도 = 단건 합) + 손계산 고정값.
 *
 * · PC-1 90칸 격자(파트 3 × 10칸 × 3모양) — ⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 오라클 (축 B 기준시가 임대 3칸은 종전 V-G2 +4원 이내).
 * · PC-2 담보·임대 승에서 ①(상증법 평가액)을 비워도 ⑧ 0건 ∧ ⑫ 200 ∧ 같은 값 — ①은 담보 승에서 쓰이지 않는다(막다른 길 없음).
 * · PC-3 고정값 — 시가 담보 K-4: 토지 의제전 50% 581,550,000 · 축 B 1,163,100,000 · 함께 양도 1,944,650,000 · 두 파트 50% 669,100,000 · 축 B 1,338,200,000.
 *   손계산(토지 의제전 50%): 증여가액 = max(시가 5억, 담보 7억) = 7억 · 채무비율 1 → 양도가액 7억 · 취득가액 = (의제취득일 토지 300,000×100㎡ + 건물 2억) × 50% = 1억 1,500만
 *   · 개산공제 3% 345만 → 7억 − 1억 1,500만 − 345만 = 581,550,000.
 * · PC-4 술어 — 축을 넘기면 지분 담보 승은 3자 max가 아니다 · 축 미지정은 종전 그대로(fail-closed) · 보충 승은 계속 ①을 요구한다 · 주택 의제전 상속은 계속 닫힌다.
 * · PC-5 ⑤ 도우미 — 토지 공시지가 카드 문구·건물 칸 안내(`gb-bg-std-use.ts`)와 축 B 지분 카드 판정(`bg-pre-deemed-shares.ts`)도 축을 읽는다.
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
import { gbBgThreeWayParts, gbBgUsesStdAcq } from "@/lib/calc/bg-pre-deemed-mode";
import { gbBgStdUseOf } from "@/lib/calc/gb-bg-std-use";
import { gbBgLandStdNote } from "@/lib/calc/gb-bg-std-use";
import { gbBgAcqBuildingHint } from "@/lib/calc/gb-bg-std-use";
import { gbBgFractionalHasPartialShare } from "@/lib/calc/bg-pre-deemed-shares";
import { gbBgFractionalPreDeemedPartsAll } from "@/lib/calc/bg-pre-deemed-shares";
import { bgPreDeemedShareJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";

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


/** 의제취득일 전 파트 — 토지만(1980 상속) · 건물만(1980 상속) · 둘 다. 상증법 평가액 6천만 · 의제취득일 토지 단가 300,000 · 건물 3천만. */
const PL = (sc: number) => ({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01",
  publishedValueAtInheritance: S(60_000_000, sc), gbAcqLandPricePerSqm: S(300_000, sc), acquisitionDate: "2015-01-01", gbBuildingAcquisitionCause: "purchase" });
const PB = (sc: number) => ({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionCause: "purchase", acquisitionDate: "1980-01-01", gbBuildingAcquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01", gbBuildingDecedentAcquisitionDate: "1970-01-01", gbBuildingInheritedValue: S(60_000_000, sc), gbAcqBuildingValue: S(30_000_000, sc) });
const PBOTH = (sc: number) => ({ ...PL(sc), ...PB(sc), hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionDate: "1980-01-01", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance" });
const PARTS: [string, (sc: number) => Record<string, unknown>][] = [["토지", PL], ["건물", PB], ["토지·건물", PBOTH]];

/** 한 칸의 세 모양(축 A 단건 50% · 축 B 60/40 · 함께 양도 100%+50%)과 각 오라클. `noClauseA` — ①(상증법 평가액) 칸을 비운다. */
function shapes(c: Cell, PF: (sc: number) => Record<string, unknown>, noClauseA = false): [string, TransferFormData, TransferFormData[]][] {
  const isRent = c.name.includes("임대"); const isSupp = c.name.includes("보충");
  const ex = (sc: number) => {
    const o: Record<string, unknown> = { ...(c.ext ? c.ext(sc) : {}), ...PF(sc) };
    if (noClauseA) { o.publishedValueAtInheritance = ""; o.gbBuildingInheritedValue = ""; }
    return o;
  };
  const mort = (c.win as Record<string, string>).bgMortgageDebtAmount;
  const wB: Record<string, unknown> = isRent ? { ...RENT, bgMortgageDebtAmount: "100000000", bgMortgageSetAmount: "100000000" } : debt(dbl(mort));
  const wC = isRent ? { ...RENT, bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "240000000" } : isSupp ? debt(dbl(mort)) : debt("1600000000");
  return [
    ["축 A", form([asset(1, "base", "a", HALF, c.mode, c.win, ex(1))]), [form([asset(0.5, "base", "z", c.mode, c.win, ex(0.5))])]],
    ["축 B", form([asset(1, "base", "p", pct("60"), c.mode, wB, ex(1)), asset(1, "base", "s", pct("40"), c.mode, wB, ex(1))], AB("1600000000")), [form([asset(1, "base", "z", c.mode, wB, ex(1))])]],
    ["함께 양도", form([asset(1, "base", "a", c.mode, wC, ex(1)), asset(1, "base", "b", HALF, c.mode, c.win, ex(1))], BD), [form([asset(1, "base", "z1", c.mode, wC, ex(1))]), form([asset(0.5, "base", "z2", c.mode, c.win, ex(0.5))])]],
  ];
}
async function oracle(refs: TransferFormData[]) {
  let sum = 0;
  for (const rf of refs) sum += ok(await post(rf));
  return sum;
}

describe("PC-1 90칸 격자 — ⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 단건 오라클", () => {
  for (const [pn, PF] of PARTS) it(`의제취득일 전 ${pn} 파트 · 10칸 × 3모양`, async () => {
    for (const c of CELLS) for (const [shape, f, refs] of shapes(c, PF)) {
      const tag = `${pn} · ${c.name} · ${shape}`;
      expect(issues(f), tag).toEqual([]);
      const d = ok(await post(f)) - (await oracle(refs));
      // 축 B 기준시가 임대는 지분 카드별 반올림으로 종전부터 +4원 이내(V-G2 — 게이트·의제 파트와 무관)
      if (shape === "축 B" && c.name === "기준시가·임대") { expect(d, tag).toBeGreaterThanOrEqual(0); expect(d, tag).toBeLessThanOrEqual(4); }
      else expect(d, tag).toBe(0);
    }
  }, 600_000);
});

describe("PC-2 담보·임대 승은 ①(상증법 평가액)을 비워도 계산한다 — ⑧ 0건 ∧ ⑫ 200 ∧ 같은 값", () => {
  const NON_SUPP = CELLS.filter((c) => !c.name.includes("보충"));
  for (const [pn, PF] of PARTS) it(`의제취득일 전 ${pn} 파트`, async () => {
    for (const c of NON_SUPP) {
      const full = shapes(c, PF); const blank = shapes(c, PF, true);
      for (let i = 0; i < full.length; i++) {
        const tag = `${pn} · ${c.name} · ${blank[i][0]}`;
        expect(issues(blank[i][1]), tag).toEqual([]);
        expect(ok(await post(blank[i][1])), tag).toBe(ok(await post(full[i][1])));
      }
    }
  }, 600_000);
});

describe("PC-3 고정값 — 시가 담보 K-4", () => {
  const K4 = CELLS.find((c) => c.name === "시가·담보 K4")!;
  it.each([
    ["토지", PL, [581_550_000, 1_163_100_000, 1_944_650_000]],
    ["건물", PB, [581_550_000, 1_163_100_000, 1_944_650_000]],
    ["토지·건물", PBOTH, [669_100_000, 1_338_200_000, 2_207_300_000]],
  ] as const)("의제취득일 전 %s 파트", async (_n, PF, want) => {
    const got: number[] = [];
    for (const [, f] of shapes(K4, PF)) got.push(ok(await post(f)));
    expect(got).toEqual(want);
  }, 120_000);
});

describe("PC-4 술어 — 축 · fail-closed · 형제 차단", () => {
  const coll = asset(1, "base", "a", pct("60"), debt("1400000000"), PL(1));
  it("게이트가 열린다 · 축을 넘기면 담보 승 · 3자 max가 아니다", () => {
    expect(bgFractionalCollateralKindSupported(coll)).toBe(true);
    for (const axis of [true, false]) {
      const a = axis ? coll : asset(1, "base", "a", HALF, debt("700000000"), PL(1));
      expect(bgCollateralForcesStdAcq(a, axis)).toBe(true);
      expect(gbBgThreeWayParts(a, axis).any).toBe(false);
      expect(gbBgUsesStdAcq(a, axis)).toBe(true);
      expect(gbBgStdUseOf(a, axis)).toBe("market_collateral");
    }
  });
  it("축 미지정은 종전 그대로 — 지분 담보 승을 확정하지 않는다(미전환 호출처 fail-closed)", () => {
    expect(bgCollateralForcesStdAcq(coll)).toBe(false);
    expect(gbBgThreeWayParts(coll).land).toBe(true);
  });
  it("단독 소유(100%)는 축과 무관하게 담보 승 — 3자 max가 아니다", () => {
    const solo = asset(1, "base", "a", debt("1400000000"), PL(1));
    expect(gbBgThreeWayParts(solo).any).toBe(false);
    expect(gbBgThreeWayParts(solo, false).any).toBe(false);
  });
  it("시가 보충 승은 그 파트만 3자 max — ①을 비우면 ⑧이 ①을 요구한다(축 A·B)", () => {
    const supp = { bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" };
    const blank = { publishedValueAtInheritance: "" };
    const fa = form([asset(1, "base", "a", HALF, supp, PL(1), blank)]);
    const fb = form([asset(1, "base", "p", pct("60"), debt("600000000"), PL(1), blank), asset(1, "base", "s", pct("40"), debt("600000000"), PL(1), blank)], AB("1600000000"));
    for (const f of [fa, fb]) expect(issues(f).map((m) => m.message).join("\n")).toContain("①을 입력하세요");
    expect(gbBgThreeWayParts(asset(1, "base", "a", HALF, supp, PL(1)), false).land).toBe(true);
  });
  it("주택의 의제취득일 전 상속은 계속 닫힌다(측정 범위 밖 — `isBgPreDeemedAsset`)", () => {
    const house = asset(1, "base", "a", HALF, debt("700000000"), { assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "1980-01-01", inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01" });
    expect(bgFractionalCollateralKindSupported(house)).toBe(false);
  });
});

describe("PC-5 ⑤ 도우미 — 문구·축 B 지분 카드 판정도 축을 읽는다", () => {
  const half = asset(1, "base", "a", HALF, debt("700000000"), PBOTH(1));
  const b60 = asset(1, "base", "p", pct("60"), debt("1400000000"), PBOTH(1));
  const b40 = asset(1, "base", "s", pct("40"), debt("1400000000"), PBOTH(1));
  it("토지 공시지가 카드 문구 · 취득시 건물 칸 안내 — 담보 승 문구(3자 max 문구 아님)", () => {
    for (const [a, axis] of [[half, false], [b60, true]] as const) {
      expect(gbBgLandStdNote(a, "2026-02-16", axis)).toContain("담보평가 승");
      expect(gbBgLandStdNote(a, "2026-02-16", axis)).not.toContain("중 큰 금액");
      expect(gbBgAcqBuildingHint(a, axis)).toContain("× 채무비율이 건물 취득가액");
    }
  });
  it("축 B 지분 카드 — 두 파트 다 의제전이어도 담보 승이면 산정방식 라디오를 남기고(⑧·⑫가 요구) 금액 칸을 3자 max로 숨기지 않는다", () => {
    expect(gbBgFractionalHasPartialShare([b60, b40])).toBe(true);
    expect(gbBgFractionalPreDeemedPartsAll([b60, b40])).toEqual({ land: false, building: false });
    expect(bgPreDeemedShareJudgmentFields(b40, b60)).toEqual({});
  });
});

