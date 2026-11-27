/**
 * anchor — 재개발 완공 아파트 **기존건물분양도차익 상계**(소득세법 시행령 §166②1호 · ⑤2호나목).
 * 계획서 `docs/00-pm/redev-existing-building-lthd-netting.plan.md` (K-5 전면 개방 V-6 손계산에서 발견, 2026-11-16).
 *
 * §166②1호: 기존건물분양도차익 = [인가후양도차익 × 평가액 ÷ (평가액 + 납부 청산금)] + 인가전양도차익 — **한 금액**이고,
 * ⑤2호나목이 그 금액에서 장기보유특별공제를 뺀다. 엔진은 이 금액을 두 분기(인가 전 분 · 인가 후 기존주택분)로 들고
 * 같은 공제율을 쓴다. 종전에는 분기마다 공제를 계산하고 음수 분기를 0으로 둬서, 부호가 다르면 양수 분기 전액에 공제가 붙었다.
 *
 * · EN-1 일반 양도 · 납부 · 인가 전 차손: 공제 = (인가 전 + 인가 후 기존주택분) × 22% (종전 44,000,000 → 22,000,000)
 * · EN-2 일반 양도 · 납부 · 인가 후 차손(양도가액 < 분양가): 같은 상계를 반대 방향으로
 * · EN-3 일반 양도 · 수령: 가목 + 나목(같은 공제율) 상계 — 사용자 결정 A(2026-11-16). 청산금 수령분은 따로 양도라 상계하지 않는다
 * · EN-4 부담부증여 지분 50% · K-5 · 담보 승(V-6 시료): 손계산 = 반 크기 단건
 * · EN-5 1세대1주택 고가(15억): 차손 분기도 같은 비율로 안분 + 안분 뒤 상계 (종전 합계 −140,000,001 · 세액 0)
 * · EN-6 §97의3·§97의4 특례도 상계한 기존건물분에 적용 · 술어 단위
 * · EN-7 표시 — 명세서 공제 산식·계산 단계가 상계한 금액을 보인다(분기 양도차익 × 율 ≠ 공제액이 되지 않게)
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 세대 주택 수 1 + «다른 주택 없음» 확인 — 재개발은 주택 계열이라 명부 확인이 필요하다(어긋나면 ⑧이 재개발과 무관한 사유를 얹는다). */
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const S = (n: number, sc: number) => String(Math.round(n * sc));
const BASE = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual" };
type Variant = "pay" | "receive" | "land" | "successor";
/** 원조합원 · 주택 출자 · 청산금 납부가 기본. 크기 sc — 청산금은 «지분 해당분»을 호출자가 정한다(화면 규약). */
const redevFields = (sc: number, v: Variant): Record<string, unknown> => {
  const b: Record<string, unknown> = { assetKind: "redevelopment_apt", actualSalePrice: S(525_000_000, sc), redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevRightsValue: S(219_218_500, sc), redevSettlementDirection: "pay", redevSettlementAmount: S(92_781_500, sc), redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing",
    redevActualAcquisitionPrice: S(100_000_000, sc), bgActualAcquisitionTotal: S(250_000_000, sc), useEstimatedAcquisition: false };
  if (v === "receive") Object.assign(b, { redevSettlementDirection: "receive", redevSettlementAmount: S(30_000_000, sc), actualSalePrice: S(189_218_500, sc), redevSettlementSaleDate: "2022-10-01" });
  if (v === "successor") Object.assign(b, { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" });
  if (v === "land") Object.assign(b, { redevOriginalAssetType: "land" });
  return b;
};
/** 시가 모드 K-5(환산취득가액) 칸 — 인가일 개별주택공시가격 · 취득당시 개별주택가격 (토지 출자는 §166③ 토지 칸). */
const K5 = (sc: number) => ({ bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: S(300_000_000, sc), redevAcquisitionHousingPrice: S(150_000_000, sc),
  redevLandArea: "100", redevLandStdPriceAtAcq: S(150_000_000, sc), redevLandStdPriceAtApproval: S(300_000_000, sc) });
const redev = (id: string, sc: number, v: Variant, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: id, ...BASE, bgMarketValueAtTransfer: S(1_000_000_000, sc), standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc), ...redevFields(sc, v),
  }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const set = (v: Variant, frac: number) => ({ redevSettlementAmount: S(Number(redevFields(1, v).redevSettlementAmount), frac) });

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

import { applyRental97LthdSpecial } from "@/lib/tax-engine/transfer-tax-redevelopment-lthd";
import { existingBuildingLthdBases } from "@/lib/tax-engine/redevelopment-existing-netting";
import { buildRedevLthdFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { RedevelopmentResult, RedevelopmentBranchDetail } from "@/lib/tax-engine/types/transfer.types";

const rd = (r: Res) => r.j.data.result.redevelopmentDetail;
/** 일반 양도 · 원조합원 · 주택 출자 — 취득 2015-01-01 · 인가 2018-06-01 · 양도 2026-02-16(기존건물분 11년 22% · 청산금 납부분 7년 14%). */
const REG = (sale: number, acq: number, rights: number, settle: number, dir: "pay" | "receive") =>
  redev("g", 1, dir, { transferType: "regular", bgValuationMode: "", actualSalePrice: String(sale), redevActualAcquisitionPrice: String(acq),
    redevRightsValue: String(rights), redevSettlementAmount: String(settle), redevSettlementDirection: dir });
const regForm = (a: AssetForm, sale: number, over: Record<string, unknown> = {}) => form([a], { contractTotalPrice: String(sale), ...over });

describe("EN-1 일반 양도 · 청산금 납부 · 인가 전 차손", () => {
  it("평가 2억 < 취득 3억: 기존건물분 = −1억 + 2억 = 1억 × 22% = 22,000,000 · 청산금 납부분 1억 × 14% · 양도소득금액 164,000,000", async () => {
    const f = regForm(REG(600_000_000, 300_000_000, 200_000_000, 100_000_000, "pay"), 600_000_000);
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    const d = rd(r);
    expect(d.preApproval.gain).toBe(-100_000_000);
    expect(d.postApprovalExistingHouse.gain).toBe(200_000_000);
    expect(d.preApproval.lthd).toBe(0);
    expect(d.postApprovalExistingHouse.lthdBaseGain).toBe(100_000_000);
    expect(d.postApprovalExistingHouse.lthd).toBe(22_000_000);
    expect(d.settlement.lthd).toBe(14_000_000);
    expect(d.total).toEqual({ gain: 200_000_000, lthd: 36_000_000, taxableIncome: 164_000_000 });
    expect(r.j.data.result.longTermHoldingDeduction).toBe(36_000_000);
  });
});

describe("EN-2 일반 양도 · 청산금 납부 · 인가 후 차손(양도가액 < 분양가)", () => {
  it("인가 전 +2억 · 인가 후 기존주택분 −75,000,000: 기존건물분 125,000,000 × 22% = 27,500,000 · 청산금 납부분 차손은 공제 0", async () => {
    const r = await post(regForm(REG(300_000_000, 100_000_000, 300_000_000, 100_000_000, "pay"), 300_000_000));
    const d = rd(r);
    expect(d.preApproval.gain).toBe(200_000_000);
    expect(d.postApprovalExistingHouse.gain).toBe(-75_000_000);
    expect(d.settlement.gain).toBe(-25_000_000);
    expect(d.preApproval.lthdBaseGain).toBe(125_000_000);
    expect(d.preApproval.lthd).toBe(27_500_000);
    expect(d.postApprovalExistingHouse.lthd).toBe(0);
    expect(d.total).toEqual({ gain: 100_000_000, lthd: 27_500_000, taxableIncome: 72_500_000 });
  });
});

describe("EN-3 일반 양도 · 청산금 수령 — 가목 + 나목 상계(결정 A)", () => {
  it("가목 +4.5억 · 나목 −75,000,000: (가 + 나) 375,000,000 × 22% = 82,500,000 · 청산금 수령분(−25,000,000)은 상계하지 않는다", async () => {
    const a = Object.assign(REG(600_000_000, 300_000_000, 200_000_000, 50_000_000, "receive"), x({ redevSettlementSaleDate: "2022-10-01" }));
    const d = rd(await post(regForm(a, 600_000_000)));
    expect(d.preApproval.gain).toBe(-75_000_000);
    expect(d.postApprovalExistingHouse.gain).toBe(450_000_000);
    expect(d.settlement.gain).toBe(-25_000_000);
    expect(d.postApprovalExistingHouse.lthdBaseGain).toBe(375_000_000);
    expect(d.postApprovalExistingHouse.lthd).toBe(82_500_000);
    expect(d.total.lthd).toBe(82_500_000);
  });
});

describe("EN-4 부담부증여 지분 50% · K-5 · 담보 승 (K-5 전면 개방 V-6 손계산)", () => {
  it("인가 전 −96,390,750 + 인가 후 기존주택분 382,227,128 = 285,836,378 × 22% = 62,884,003 · 청산금 납부분 22,648,202 · 산출세액 117,890,818 = 반 크기 단건", async () => {
    // 양도가액 7억(담보 7억 = 증여가액 C · 채무비율 1) · 취득가액 2억(취득시 기준시가 4억 × 50%) · 개산공제 600만
    // 인가 전 = 평가 109,609,250 − 2억 − 600만 · 인가 후 = 7억 − (109,609,250 + 청산금 46,390,750) = 544,000,000 → 평가 : 청산금 = 491,836,378 : 208,163,622
    const w = debt("700000000");
    const r = await post(form([redev("a", 1, "pay", HALF, K5(1), w, set("pay", 0.5))]));
    const d = rd(r);
    expect(d.preApproval.gain).toBe(-96_390_750);
    expect(d.postApprovalExistingHouse.gain).toBe(382_227_128);
    expect(d.settlement.gain).toBe(161_772_872);
    expect(d.postApprovalExistingHouse.lthdBaseGain).toBe(285_836_378);
    expect(d.postApprovalExistingHouse.lthd).toBe(62_884_003);
    expect(d.settlement.lthd).toBe(22_648_202);
    expect(d.total).toEqual({ gain: 447_609_250, lthd: 85_532_205, taxableIncome: 362_077_045 });
    // 과세표준 359,577,045 × 40% − 누진공제 25,940,000
    expect(r.j.data.result.calculatedTax).toBe(117_890_818);
    const half = await post(form([redev("z", 0.5, "pay", K5(0.5), w)]));
    expect(half.j.data.result.calculatedTax).toBe(117_890_818);
  });
});

describe("EN-5 1세대1주택 고가(15억) · 인가 전 차손", () => {
  it("세 분기 모두 3/15로 안분(차손 포함) → 100,000,000 · 기존건물분 (−60,000,000 + 114,285,714) × 22% = 11,942,857 · 청산금 45,714,286 × 14% = 6,400,000", async () => {
    // R-c08-12(2026-11-22) — 합계 먼저(분기 합 5억 × 3/15 = 100,000,000) · 남은 1원은 나머지가 큰 청산금 분기.
    // 종전 분기별 내림: 청산금 45,714,285 · 공제 6,399,999 · 합계 99,999,999(안분 박스 100,000,000과 1원 차). 양도소득금액 81,657,143 불변.
    const a = REG(1_500_000_000, 800_000_000, 500_000_000, 200_000_000, "pay");
    const d = rd(await post(regForm(a, 1_500_000_000, { isOneHousehold: true })));
    expect(d.preApproval.gain).toBe(-60_000_000);
    expect(d.preApproval.gainBeforeAllocation).toBe(-300_000_000);
    expect(d.postApprovalExistingHouse.gain).toBe(114_285_714);
    expect(d.settlement.gain).toBe(45_714_286);
    expect(d.postApprovalExistingHouse.lthdBaseGain).toBe(54_285_714);
    expect(d.postApprovalExistingHouse.lthd).toBe(11_942_857);
    expect(d.settlement.lthd).toBe(6_400_000);
    expect(d.total).toEqual({ gain: 100_000_000, lthd: 18_342_857, taxableIncome: 81_657_143 });
    expect(d.highValueAllocation.taxableGain).toBe(100_000_000);
  });
});

describe("EN-6 §97의3·§97의4 특례 · 술어", () => {
  const branch = (gain: number, lthd: number, extra: Partial<RedevelopmentBranchDetail> = {}): RedevelopmentBranchDetail =>
    ({ apportionedTransfer: 0, apportionedAcquisition: 0, gain, holdingMonths: 133, lthd, lthdRate: 0.22, ...extra }) as RedevelopmentBranchDetail;
  const result = (): RedevelopmentResult =>
    ({
      preApproval: branch(-100_000_000, 0),
      postApprovalExistingHouse: branch(200_000_000, 22_000_000, { lthdBaseGain: 100_000_000 }),
      settlement: branch(100_000_000, 14_000_000, { lthdRate: 0.14, holdingMonths: 92 }),
      total: { gain: 200_000_000, lthd: 36_000_000, taxableIncome: 164_000_000 },
    }) as unknown as RedevelopmentResult;
  it("§97의4 가산 10%p: 기존건물분 1억 × 32% = 32,000,000 (종전 2억 × 32%)", () => {
    const out = applyRental97LthdSpecial(result(), { rentalGainRatio: 1, additionalRate: 0.1 }, "apt");
    expect(out.preApproval.lthd).toBe(0);
    expect(out.postApprovalExistingHouse.lthd).toBe(32_000_000);
    expect(out.settlement.lthd).toBe(24_000_000);
  });
  it("§97의3 70% 대체(임대분 전부): 기존건물분 1억 × 70% = 70,000,000", () => {
    const out = applyRental97LthdSpecial(result(), { rentalGainRatio: 1, rentalGainFraction: { num: 1, den: 1 }, overrideRate: 0.7 }, "apt");
    expect(out.postApprovalExistingHouse.lthd).toBe(70_000_000);
  });
  it("술어: 부호가 다를 때만 · 합계가 0 이하면 0 · 공제율이 다르면 상계하지 않음", () => {
    expect(existingBuildingLthdBases({ gain: -1, lthdRate: 0.2 }, { gain: 5, lthdRate: 0.2 })).toEqual({ pre: 0, post: 4 });
    expect(existingBuildingLthdBases({ gain: 5, lthdRate: 0.2 }, { gain: -9, lthdRate: 0.2 })).toEqual({ pre: 0, post: 0 });
    expect(existingBuildingLthdBases({ gain: 5, lthdRate: 0.2 }, { gain: 3, lthdRate: 0.2 })).toBeUndefined();
    expect(existingBuildingLthdBases({ gain: 0, lthdRate: 0.2 }, { gain: 3, lthdRate: 0.2 })).toBeUndefined();
    expect(existingBuildingLthdBases({ gain: -1, lthdRate: 0.2 }, { gain: 5, lthdRate: 0.3 })).toBeUndefined();
  });
});

describe("EN-7 표시 — 상계한 금액으로 산식을 쓴다", () => {
  it("명세서: 양수 분기 = 「기존건물분 양도차익(…) 100,000,000 × 22% = 22,000,000」 · 차손 분기 = 상계 안내 · 계산 단계도 같은 금액", async () => {
    const r = await post(regForm(REG(600_000_000, 300_000_000, 200_000_000, 100_000_000, "pay"), 600_000_000));
    const d = rd(r);
    const post2 = buildRedevLthdFormula("postApprovalExistingHouse", d);
    expect(post2).toContain("기존건물분 양도차익(인가 전 분 + 인가 후 기존주택분) 100,000,000 × 22%");
    expect(post2).toContain("= 22,000,000");
    expect(buildRedevLthdFormula("preApproval", d)).toBe("양도차손 — 다른 기존건물분 줄의 양도차익과 합해 장기보유특별공제를 계산");
    const step = (r.j.data.result.steps as { label: string; formula: string; amount: number }[]).find((s) => s.label === "인가후 기존주택분 장기보유공제");
    expect(step?.formula).toContain("기존건물분 양도차익(인가 전 분과 인가 후 기존주택분을 합한 금액) 100,000,000 × 22%");
    expect(step?.amount).toBe(22_000_000);
  });
});
