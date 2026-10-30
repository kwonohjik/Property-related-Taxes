/**
 * anchor — 함께 부담부증여 **지분 컴패니언 실측 확장**: 모드(시가·기준시가) × 지분율(100·50·25·1/3) × 자산 수(2·3) — ⑧↔⑫ 정합 · 합산 증여가액 · 채무 재배분 · 양도차익 (측정, 결함 없음)
 *
 * 계획서 `docs/00-pm/bg-fractional-grid-measure.plan.md`. #2750(컴패니언 채무 안분을 축 B 로 한정)이 닫은 지분 쌍을 같은 방법으로 격자 전수에 넓혔다.
 *
 * 셀마다 확인하는 불변식:
 *   (a) ⑧ 통과 → ⑫ 200 (⑫ 가 ⑧ 이 허용한 입력을 막지 않는다)
 *   (b) 자산별 승자(⑧ 과 같은 `companionBurdenedGiftValuations`)가 서로 다르면 ⑫ 400 (혼합 승자는 증여세가 ΣA 보다 작아진다 — #2746)
 *   (c) ⑫ 200 이면 합산 증여가액 = ΣAᵢ(±2원) · 카드 채무 합 = 폼 채무 합(±0) — 3건 묶음의 「마지막 자산이 잔액 흡수」 포함
 *   (d) 균일 비보충 승(담보·임대)이면 양도차익 = 자산별 단건 지분 실행의 합(±0) — 담보·임대가 이기면 Aᵢ = Bᵢ 라 가산된다(#2750)
 *   (e) 균일 보충 승이면 「지분율 100% · 시가·면적·금액 ×r」 환산 오라클과 증여가액 ±0 · 양도차익·총세액 ±2원(1/3 환산 입력의 절사)
 *
 * 시료 주의: 채무 4억(`sup`)은 지분 1/3·25% 에서 지분 시가(3.33억·2.5억)보다 커 담보 승이 된다 — 보충 승 균일 쌍은 채무 2억·1억(`supL`·`ssupL`)으로 따로 만들었다.
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
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildBurdenedGiftInfo, companionBurdenedGiftValuations } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const base = { transferType: "burdened_gift", transferCause: "general", bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "205000000", bgActualAcquisitionBuilding: "150000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: "2010-05-01", acquisitionDate: "2010-05-01", hasSeperateLandAcquisitionDate: false, bgLendingDepositTotal: "0" } as unknown as Partial<AssetForm>;

/** 자산 한 장의 승자를 정하는 입력. 시가 모드: sup(보충, 채무 4억) · mort(담보, 채무 12억) · supL(보충, 채무 2억). 기준시가 모드: ssup · smort · srent · ssupL(채무 1억). */
const MK: Record<string, Record<string, string>> = {
  sup: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "400,000,000", bgMortgageSetAmount: "400,000,000" },
  mort: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" },
  supL: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "200,000,000", bgMortgageSetAmount: "200,000,000" },
  ssup: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000" },
  smort: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "1,600,000,000", bgMortgageSetAmount: "1,600,000,000" },
  srent: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAnnualRentTotal: "200,000,000" },
  ssupL: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "100,000,000", bgMortgageSetAmount: "100,000,000" },
};
/** 지분율: 분자/분모. r3 = 1/3 (나누어떨어지지 않는 비율). */
const R: Record<string, [string, string]> = { r1: ["100", "100"], r50: ["50", "100"], r25: ["25", "100"], r3: ["1", "3"] };
const K: Record<string, number> = { r1: 1, r50: 0.5, r25: 0.25, r3: 1 / 3 };
const asset = (id: number, t: string, r: string) =>
  Object.assign({ ...makeDefaultAsset(id) }, BASE, base, MK[t] as unknown as Partial<AssetForm>, { ownershipNumerator: R[r][0], ownershipDenominator: R[r][1] }) as AssetForm;
/** 「지분율 100% · 시가·면적·금액 ×k」 환산 자산 — 보충 승 영역의 오라클(담보·임대 승 영역에서는 단건 지분 경로와도 안 맞아 쓰지 않는다 — #2750 계획서 §7). */
const scaled = (id: number, t: string, k: number) =>
  Object.assign({ ...makeDefaultAsset(id) }, BASE, base, MK[t] as unknown as Partial<AssetForm>, {
    gbLandArea: String(205 * k), gbBuildingArea: String(300 * k), gbBuildingFootprintArea: String(135 * k),
    gbAcqBuildingValue: String(150000000 * k), gbTransferBuildingValue: String(259072400 * k),
    bgActualAcquisitionLand: String(205000000 * k), bgActualAcquisitionBuilding: String(150000000 * k),
    bgCoDonorLandStdPriceAtAcq: (10_000_000 * k).toLocaleString("en-US"), bgCoDonorBuildingStdPriceAtAcq: (40_000_000 * k).toLocaleString("en-US"),
    ...(MK[t].bgMarketValueAtTransfer ? { bgMarketValueAtTransfer: (1_000_000_000 * k).toLocaleString("en-US") } : {}),
  } as unknown as Partial<AssetForm>) as AssetForm;

const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: String(1_600_000_000 + 400_000_000 * (assets.length - 1)) });
  return f as unknown as TransferFormData;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function cell(assets: AssetForm[]) {
  const f = bundle(assets);
  const gate = allIssues(f).map(String).filter((m) => m.includes("함께 양도와 같이")).length;
  const infos = assets.map((a) => buildBurdenedGiftInfo(a));
  const v = companionBurdenedGiftValuations(infos, assets.map((a) => getOwnershipRatio(a)));
  const r = await post(f);
  const g = r.status === 200 ? r.j.data.aggregated : undefined;
  const cards = r.status === 200 ? (r.j.data.transferBurdenedGiftBreakdown.cards as { breakdown: { assumedDebtAmount: number } }[]) : undefined;
  return {
    gate, status: r.status, modes: v.map((x) => x.selectedMode[0]).join(""), sumA: v.reduce((s, x) => s + x.value, 0),
    gross: g?.burdenedGift?.giftTax?.grossGiftValue as number | undefined, giftTax: g?.burdenedGift?.giftTax?.finalTax as number | undefined,
    wholeMax: g?.burdenedGift?.giftValuation?.max as number | undefined, gain: g?.totalTransferGain as number | undefined, tax: g?.totalTax as number | undefined,
    cardDebt: cards?.reduce((s, c) => s + c.breakdown.assumedDebtAmount, 0), formDebt: infos.reduce((s, i) => s + i.lendingDepositTotal + i.mortgageDebtAmount, 0),
  };
}
type Cell = Awaited<ReturnType<typeof cell>>;
const uniform = (c: Cell) => new Set(c.modes).size === 1;
async function singleGain(a: AssetForm): Promise<number> {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets: [a] });
  const r = await post(f as unknown as TransferFormData);
  expect(r.status).toBe(200);
  return r.j.data.aggregated.totalTransferGain as number;
}

/** 불변식 (a)~(d). 어긋나면 어느 셀인지 이름과 함께 던진다. */
async function checkInvariants(name: string, assets: AssetForm[], tally: Record<string, number>) {
  const c = await cell(assets);
  const kind = `${c.gate > 0 ? "⑧게이트" : "⑧통과"}|${c.status}|${uniform(c) ? "균일" : "혼합"}`;
  tally[kind] = (tally[kind] ?? 0) + 1;
  if (c.gate === 0) expect([name, "(a) ⑧통과→⑫200", c.status]).toEqual([name, "(a) ⑧통과→⑫200", 200]);
  if (!uniform(c)) expect([name, "(b) 혼합→⑫400", c.status]).toEqual([name, "(b) 혼합→⑫400", 400]);
  if (c.status === 200) {
    expect([name, "(c) 증여가액=ΣA", Math.abs(c.wholeMax! - c.sumA) <= 2]).toEqual([name, "(c) 증여가액=ΣA", true]);
    expect([name, "(c) ΣB=폼 채무 합", c.cardDebt]).toEqual([name, "(c) ΣB=폼 채무 합", c.formDebt]);
    if (c.modes[0] !== "s") {
      const sum = (await Promise.all(assets.map((a, i) => singleGain({ ...a, id: `solo-${i}` } as AssetForm)))).reduce((s, x) => s + x, 0);
      expect([name, "(d) 양도차익=단건 합", c.gain]).toEqual([name, "(d) 양도차익=단건 합", sum]);
    }
  }
  return c;
}

const PAIRS: [string, string][] = [["sup", "sup"], ["mort", "sup"], ["sup", "mort"], ["mort", "mort"], ["ssup", "ssup"], ["smort", "ssup"], ["ssup", "smort"], ["smort", "smort"], ["srent", "ssup"], ["ssup", "srent"], ["srent", "srent"], ["srent", "smort"], ["smort", "srent"]];

describe("FG-1 2건 묶음 — 13쌍 × 지분 7조합(91셀): 불변식 (a)~(d)", () => {
  it("모든 셀이 불변식을 지킨다 · 분류 합계: ⑧통과·200·균일 6 / ⑧게이트·200·균일 29(담보·임대 균일) / ⑧게이트·400·혼합 56", async () => {
    const RS: [string, string][] = [["r1", "r1"], ["r1", "r50"], ["r50", "r1"], ["r1", "r3"], ["r3", "r1"], ["r50", "r3"], ["r25", "r1"]];
    const tally: Record<string, number> = {};
    for (const [a, b] of PAIRS) for (const [ra, rb] of RS) await checkInvariants(`${a}+${b}@${ra}/${rb}`, [asset(1, a, ra), asset(2, b, rb)], tally);
    expect(tally).toEqual({ "⑧통과|200|균일": 6, "⑧게이트|200|균일": 29, "⑧게이트|400|혼합": 56 });
  }, 600_000);
});

describe("FG-2 보충 승 균일 지분 쌍 — 1/3 · 25% 포함 10셀: 환산 오라클과 증여가액 ±0 · 양도차익·총세액 ±2원", () => {
  it("supL · ssupL 쌍", async () => {
    const CELLS: [string, string, string, string][] = [
      ["supL", "supL", "r1", "r3"], ["supL", "supL", "r3", "r3"], ["supL", "supL", "r50", "r3"], ["supL", "supL", "r25", "r25"], ["supL", "supL", "r1", "r25"],
      ["ssupL", "ssupL", "r1", "r3"], ["ssupL", "ssupL", "r3", "r3"], ["ssupL", "ssupL", "r25", "r25"], ["ssupL", "ssupL", "r1", "r25"], ["ssupL", "ssupL", "r50", "r25"],
    ];
    let maxGain = 0; let maxTax = 0;
    for (const [a, b, ra, rb] of CELLS) {
      const name = `${a}+${b}@${ra}/${rb}`;
      const c = await cell([asset(1, a, ra), asset(2, b, rb)]);
      const o = await cell([scaled(1, a, K[ra]), scaled(2, b, K[rb])]);
      expect([name, c.gate, c.status, c.modes]).toEqual([name, 0, 200, "ss"]);
      expect([name, c.gross, c.giftTax]).toEqual([name, o.gross, o.giftTax]);
      maxGain = Math.max(maxGain, Math.abs(c.gain! - o.gain!)); maxTax = Math.max(maxTax, Math.abs(c.tax! - o.tax!));
    }
    expect(maxGain).toBeLessThanOrEqual(2); expect(maxTax).toBeLessThanOrEqual(2);
  }, 300_000);
});

describe("FG-3 3건 묶음 — 승자 10패턴 × 지분 3조합(30셀): 불변식 (a)~(d) · 보충 승 균일은 증여세가 같은 증여가액·채무의 2건과 같다", () => {
  it("30셀 분류 합계: ⑧통과·200·균일 7 / ⑧게이트·200·균일 9 / ⑧게이트·400·혼합 14", async () => {
    const P3: [string, string, string][] = [["sup", "sup", "sup"], ["sup", "sup", "mort"], ["sup", "mort", "mort"], ["mort", "mort", "mort"], ["ssup", "ssup", "ssup"], ["ssup", "ssup", "smort"], ["smort", "smort", "smort"], ["srent", "srent", "srent"], ["ssup", "srent", "srent"], ["supL", "supL", "supL"]];
    const RS3: [string, string, string][] = [["r1", "r1", "r1"], ["r1", "r50", "r50"], ["r1", "r1", "r3"]];
    const tally: Record<string, number> = {};
    for (const [a, b, c3] of P3) for (const rs of RS3) await checkInvariants(`3자산 ${a}+${b}+${c3}@${rs.join("/")}`, [asset(1, a, rs[0]), asset(2, b, rs[1]), asset(3, c3, rs[2])], tally);
    expect(tally).toEqual({ "⑧통과|200|균일": 7, "⑧게이트|200|균일": 9, "⑧게이트|400|혼합": 14 });
  }, 600_000);
  it("supL 3건(지분 100/100/100) = 시가 1.5B · 채무 3억 두 건의 2건 묶음과 증여가액·증여세 같음 (ΣA 3.0B · ΣB 6억)", async () => {
    const three = await cell([asset(1, "supL", "r1"), asset(2, "supL", "r1"), asset(3, "supL", "r1")]);
    const bigger = (id: number) => Object.assign(asset(id, "supL", "r1"), { bgMarketValueAtTransfer: "1,500,000,000", bgMortgageDebtAmount: "300,000,000", bgMortgageSetAmount: "300,000,000" }) as AssetForm;
    const two = await cell([bigger(1), bigger(2)]);
    expect([three.status, three.gross, three.giftTax]).toEqual([200, 3_000_000_000, two.giftTax]);
    expect([two.status, two.gross]).toEqual([200, 3_000_000_000]);
  }, 120_000);
});
