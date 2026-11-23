/**
 * 결과뷰 리뷰 2026-11-21 후보 ⑤ — 일반건물(GB) 토지 카드 취득가액·필요경비 산식이 카드 값을 재현하는가(표시만 · 세액 0).
 *
 * 엔진은 토지 **전체**를 먼저 환산·안분·개산공제한 뒤 사업용 인정면적 비율로 가른다(`planGbLandCards` split —
 * 사업용분 = floor(전체 × 인정면적 / 전체면적), 비사업용 초과분 = 잔액). 종전 산식은 카드 몫에 비율을 바로 곱하거나
 * 토지 전체 식의 우변에 카드 몫을 적어 좌변이 우변을 못 만들었다. §164⑨ 공익수용은 토지 환산 분모를 낮추는데
 * 산식은 원 양도시 토지기준시가를 적었다(한 장짜리 카드에서도 어긋남).
 *
 * 기대값은 입력에서 BigInt로 손계산한다 — 엔진 출력 복사 아님.
 *   토지 205㎡ · 바닥 20㎡(일반주거 → 인정 80㎡) · 양도시 ㎡당 5,514,000 → 1,130,370,000 · 취득시 ㎡당 1,000,000 → 205,000,000
 *   건물 양도시 259,072,400 · 취득시 150,000,000 · 증축 양도시 40,000,000 · 취득시 30,000,000 · 총 양도가액 1,600,000,000
 * 폼 → ④ → route(mock 세율) → 빌더.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbExpenseFormulas";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { asset } from "./_helpers/gb-bundled-blocks-fixtures";
import { form } from "./_helpers/gb-bundled-blocks-fixtures";
import { run } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// ── 손계산 ──────────────────────────────────────────────────────────────
const fl = (a: bigint, b: bigint, c: bigint) => (a * b) / c; // BigInt 나눗셈 = floor(양수)
const n = (v: bigint) => Number(v).toLocaleString("ko-KR");
const TOTAL = 1_600_000_000n;
const LAND_STD = 5_514_000n * 205n; // 1,130,370,000
const ACQ_LAND_STD = 1_000_000n * 205n; // 205,000,000
const B_STD = 259_072_400n;
const ACQ_B_STD = 150_000_000n;
const EXT_STD = 40_000_000n;
const biz = (whole: bigint) => fl(whole, 80n, 205n);
const IND = "\n        ";
const tailBiz = (whole: bigint) => `${IND}× 사업용 인정면적 비율 = ${n(biz(whole))}`;
const tailNbl = (whole: bigint) => `${IND}- 사업용분 ${n(biz(whole))} = ${n(whole - biz(whole))} (비사업용 초과분 · 잔액)`;

/** 산식 첫 줄 「A × B / C = D」·「A × B / (C+D) = E」를 BigInt floor로 평가해 우변과 같은지(산식 = 값). */
function firstLineHolds(formula: string): boolean {
  const m = formula.split("\n")[0].match(/^([\d,]+) × ([\d,]+) \/ \(?([\d,+]+)\)? = ([\d,]+)/);
  if (!m) return false;
  const big = (s: string) => BigInt(s.replace(/,/g, ""));
  const denom = m[3].split("+").reduce((s, x) => s + big(x), 0n);
  return fl(big(m[1]), big(m[2]), denom) === big(m[4]);
}

// ── 시료 ────────────────────────────────────────────────────────────────
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "20",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(TOTAL),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2010-05-01",
};
const EST: Partial<AssetForm> = { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" };
const EXT: Partial<AssetForm> = {
  gbHasExtension: true,
  gbExtensionDate: "2018-05-01",
  gbExtensionArea: "50",
  gbExtensionAcquisitionMode: "estimated",
  gbExtensionAcquisitionCause: "purchase",
  gbTransferExtensionBuildingStdPrice: "40000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000",
};
const BUNDLED = 700_000_001n;
const ACT: Partial<AssetForm> = { useEstimatedAcquisition: false, fixedAcquisitionPrice: String(BUNDLED) };

async function formulas(...over: Partial<AssetForm>[]) {
  const f = form(Number(TOTAL), [asset(1, BASE, ...over)]);
  const r = await run(f);
  expect(r.status).toBe(200);
  const gb = r.aggregated.generalBuildingValuationDetail;
  const by = Object.fromEntries(r.aggregated.properties.map((p) => [p.propertyId, p]));
  const acq = (id: string) => buildGbAcquisitionFormula(by[id], gb, f.assets[0])!;
  const exp = (id: string) => buildGbExpenseFormula(by[id], gb)!;
  return { by, acq, exp };
}

describe("후보 ⑤ — 토지 두 장(사업용·비사업용 초과분) 취득가액 산식은 토지 전체 식 + 몫 꼬리", () => {
  it("환산 2-way(사례 31) — 토지 전체 양도가액 × 취득시 / 양도시 = 전체 환산취득가, 카드는 그 몫", async () => {
    const { by, acq } = await formulas(EST);
    const tl = fl(TOTAL, LAND_STD, LAND_STD + B_STD); // 1,301,667,489
    const al = fl(tl, ACQ_LAND_STD, LAND_STD); // 236,065,921
    const head = `${n(tl)} × ${n(ACQ_LAND_STD)} / ${n(LAND_STD)} = ${n(al)}`;
    expect(acq("land_business")).toBe(head + tailBiz(al));
    expect(acq("land_nbl")).toBe(head + tailNbl(al));
    expect(by.land_business.acquisitionPrice).toBe(Number(biz(al)));
    expect(by.land_nbl.acquisitionPrice).toBe(Number(al - biz(al)));
    expect(firstLineHolds(acq("land_business"))).toBe(true);
  });

  it("증축 환산(사례 33) — 3-way 토지 전체 양도가액으로 환산", async () => {
    const { by, acq } = await formulas(EST, EXT);
    const tl = fl(TOTAL, LAND_STD, LAND_STD + B_STD + EXT_STD); // 1,265,243,006
    const al = fl(tl, ACQ_LAND_STD, LAND_STD); // 229,460,102
    const head = `${n(tl)} × ${n(ACQ_LAND_STD)} / ${n(LAND_STD)} = ${n(al)}`;
    expect(acq("land_business")).toBe(head + tailBiz(al));
    expect(acq("land_nbl")).toBe(head + tailNbl(al));
    expect(by.land_nbl.acquisitionPrice).toBe(Number(al - biz(al)));
    expect(firstLineHolds(acq("land_nbl"))).toBe(true);
  });

  it("일괄 실가(사례 35 · bundled_apportion) — 일괄 실가 × 취득시 토지 / (토지+건물) = 토지 전체, 카드는 그 몫", async () => {
    const { by, acq } = await formulas(ACT);
    const al = fl(BUNDLED, ACQ_LAND_STD, ACQ_LAND_STD + ACQ_B_STD); // 404,225,352
    const head = `${n(BUNDLED)} × ${n(ACQ_LAND_STD)} / (${n(ACQ_LAND_STD)}+${n(ACQ_B_STD)}) = ${n(al)}`;
    expect(acq("land_business")).toBe(head + tailBiz(al));
    expect(acq("land_nbl")).toBe(head + tailNbl(al));
    expect(by.land_business.acquisitionPrice).toBe(Number(biz(al)));
    // 건물 잔액식(종전부터 맞음) — 회귀 짝
    expect(acq("building")).toBe(`${n(BUNDLED)} - 토지 ${n(al)} = ${n(BUNDLED - al)} (잔액 보정)`);
  });

  it("증축 + 원건물 일괄 실가 — 일괄 총액은 토지 두 장 합 + 건물(3001), 건물 잔액식도 토지 두 장 합을 뺀다", async () => {
    const { by, acq } = await formulas(ACT, EXT);
    const al = fl(BUNDLED, ACQ_LAND_STD, ACQ_LAND_STD + ACQ_B_STD); // 404,225,352
    const head = `${n(BUNDLED)} × ${n(ACQ_LAND_STD)} / (${n(ACQ_LAND_STD)}+${n(ACQ_B_STD)}) = ${n(al)}`;
    expect(acq("land_business")).toBe(head + tailBiz(al));
    expect(acq("land_nbl")).toBe(head + tailNbl(al));
    expect(by.building1.acquisitionPrice).toBe(Number(BUNDLED - al));
    expect(acq("building1")).toBe(`${n(BUNDLED)} - 토지 ${n(al)} = ${n(BUNDLED - al)} (잔액 보정)`);
  });
});

describe("후보 ⑤ — 토지 두 장 개산공제(§163⑥)는 토지 전체 base × 3% + 몫 꼬리", () => {
  it("환산 2-way — 205,000,000 × 3% = 6,150,000 → 사업용 2,400,000 · 초과분 3,750,000", async () => {
    const { by, exp } = await formulas(EST);
    const el = (ACQ_LAND_STD * 3n) / 100n; // 6,150,000
    const head = `취득시 토지기준시가 ${n(ACQ_LAND_STD)} × 3% = ${n(el)}`;
    expect(exp("land_business")).toBe(head + tailBiz(el));
    expect(exp("land_nbl")).toBe(head + tailNbl(el));
    expect(by.land_business.necessaryExpense).toBe(Number(biz(el)));
    expect(by.land_nbl.necessaryExpense).toBe(Number(el - biz(el)));
  });
});

describe("후보 ⑤ — §164⑨ 공익수용 특례는 낮춘 분모를 적는다(토지 한 장)", () => {
  it("min(5,514,000 · 3,000,000 · 4,000,000) × 205㎡ = 615,000,000 분모", async () => {
    const EXPR = {
      gbBuildingFootprintArea: "135",
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2020-01-01",
      compensationPerSqm: "3000000",
      compensationBasisStdPrice: "4000000",
    } as Partial<AssetForm>;
    const { by, acq } = await formulas(EST, EXPR);
    const tl = fl(TOTAL, LAND_STD, LAND_STD + B_STD); // 안분은 원 기준시가 유지 — 1,301,667,489
    const denom = 3_000_000n * 205n; // 615,000,000
    const al = fl(tl, ACQ_LAND_STD, denom); // 433,889,163
    expect(by.land.acquisitionPrice).toBe(Number(al));
    expect(acq("land")).toBe(
      `${n(tl)} × ${n(ACQ_LAND_STD)} / ${n(denom)} = ${n(al)} (분모: 양도 당시 토지기준시가를 ${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1} 공익수용 특례로 낮춘 값)`,
    );
    expect(firstLineHolds(acq("land"))).toBe(true);
  });
});

describe("후보 ⑤ 리뷰 — §164⑨ 게이트만 통과하고 ㎡당 기준시가가 그대로 최소면 «낮춘 값»이라 적지 않는다", () => {
  it("보상액 6,000,000 · 기초 기준시가 7,000,000 > 기준시가 5,514,000 → 분모 = 원 기준시가 1,130,370,000 · 중립 문구", async () => {
    const EXPR = {
      gbBuildingFootprintArea: "135",
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2020-01-01",
      compensationPerSqm: "6000000",
      compensationBasisStdPrice: "7000000",
    } as Partial<AssetForm>;
    const { acq } = await formulas(EST, EXPR);
    const f = acq("land");
    expect(f).not.toContain("낮춘 값");
    expect(f).toContain(`${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1} 공익수용 특례 적용`);
    expect(f).toContain(`/ ${n(5_514_000n * 205n)} =`);
    expect(firstLineHolds(f)).toBe(true);
  });
});

describe("후보 ⑤ 리뷰 — §97②2호 단서(swap)로 집계 값이 카드 값과 갈리면 꼬리를 붙이지 않는다(음수 «사업용분» 금지)", () => {
  it("환산 2-way + 자본적지출 900,000,000 → swap · 토지 두 장 산식에 음수 금액 없음", async () => {
    const { by, acq, exp } = await formulas(EST, { capitalExpenditure: "900000000" } as Partial<AssetForm>);
    for (const id of ["land_business", "land_nbl"]) {
      expect(by[id]).toBeDefined();
      for (const f of [acq(id), exp(id)]) {
        expect(f).not.toMatch(/-\d|사업용분 -/);
        expect(f).not.toContain("사업용 인정면적 비율 =");
        expect(f).not.toContain("- 사업용분");
      }
    }
  });
});

/**
 * 후보 ⑤ 형제(2026-11-23) — 사례 35 일괄 실가 **필요경비**도 토지 두 장이면 토지 전체 식 + 몫 꼬리.
 *
 * 종전: 신규 두 칸(양도비·자본적지출) 입력은 echo 산식이 토지 몫 ≠ 토지 전체라 포기하고 legacy 산식으로 떨어져
 * 「0 × 1,130,370,000 / (1,130,370,000+259,072,400) = 3,174,798」(총액 0 · 우변 카드 몫)이었다. legacy 칸 입력은 좌변이 토지 전체
 * 24,406,271을 만드는데 우변에 카드 몫 9,524,398을 적었다. 엔진은 양도비를 양도시 기준시가, 자본적지출을 취득시 기준시가로 나눠
 * 토지 전체를 낸 뒤 인정면적 비율로 가른다.
 */
describe("후보 ⑤ 형제 — 사례 35 일괄 실가 필요경비(토지 두 장)는 토지 전체 식 + 몫 꼬리", () => {
  const TX = 10_000_001n;
  const CAPEX = 20_000_003n;
  const txLand = fl(TX, LAND_STD, LAND_STD + B_STD); // 8,135,422 — 양도비는 양도시 기준시가 비율
  const capexLand = fl(CAPEX, ACQ_LAND_STD, ACQ_LAND_STD + ACQ_B_STD); // 11,549,297 — 자본적지출은 취득시 기준시가 비율
  const txHead = `${n(TX)} × ${n(LAND_STD)} / (${n(LAND_STD)}+${n(B_STD)}) = ${n(txLand)}`;
  const capexHead = `${n(CAPEX)} × ${n(ACQ_LAND_STD)} / (${n(ACQ_LAND_STD)}+${n(ACQ_B_STD)}) = ${n(capexLand)}`;

  it("양도비만 — 양도비 × 양도시 토지 / (토지+건물) = 토지 전체, 카드는 그 몫", async () => {
    const { by, exp } = await formulas(ACT, { transferExpense: String(TX) });
    expect(exp("land_business")).toBe(txHead + tailBiz(txLand));
    expect(exp("land_nbl")).toBe(txHead + tailNbl(txLand));
    expect(by.land_business.necessaryExpense).toBe(Number(biz(txLand)));
    expect(by.land_nbl.necessaryExpense).toBe(Number(txLand - biz(txLand)));
    expect(firstLineHolds(exp("land_business"))).toBe(true);
    // 건물 잔액식(종전부터 맞음) — 회귀 짝
    expect(exp("building")).toBe(`${n(TX)} - 토지 ${n(txLand)} = ${n(TX - txLand)} (잔액 보정)`);
  });

  it("자본적지출만 — 분모는 취득시 기준시가(종전 산식은 양도시를 적었다)", async () => {
    const { by, exp } = await formulas(ACT, { capitalExpenditure: String(CAPEX) });
    expect(exp("land_business")).toBe(capexHead + tailBiz(capexLand));
    expect(exp("land_nbl")).toBe(capexHead + tailNbl(capexLand));
    expect(by.land_nbl.necessaryExpense).toBe(Number(capexLand - biz(capexLand)));
    expect(firstLineHolds(exp("land_nbl"))).toBe(true);
  });

  it("둘 다 — 양도비·자본적지출 두 줄 + 합계(토지 전체) + 몫 꼬리", async () => {
    const { by, exp } = await formulas(ACT, { transferExpense: String(TX), capitalExpenditure: String(CAPEX) });
    const whole = txLand + capexLand; // 19,684,719
    const body = `양도비 ${txHead}${IND}자본적지출 ${capexHead}${IND}합계 = ${n(whole)}`;
    expect(exp("land_business")).toBe(body + tailBiz(whole));
    expect(exp("land_nbl")).toBe(body + tailNbl(whole));
    expect(by.land_business.necessaryExpense).toBe(Number(biz(whole)));
  });

  it("legacy 일괄 필요경비 칸 — 좌변이 만드는 토지 전체를 우변에 적고 카드 몫은 꼬리로", async () => {
    const LEGACY = 30_000_007n;
    const { by, exp } = await formulas(ACT, { directExpenses: String(LEGACY) });
    const whole = fl(LEGACY, LAND_STD, LAND_STD + B_STD); // 24,406,271
    const head = `${n(LEGACY)} × ${n(LAND_STD)} / (${n(LAND_STD)}+${n(B_STD)}) = ${n(whole)}`;
    expect(exp("land_business")).toBe(head + tailBiz(whole));
    expect(exp("land_nbl")).toBe(head + tailNbl(whole));
    expect(by.land_business.necessaryExpense).toBe(Number(biz(whole)));
  });
});
