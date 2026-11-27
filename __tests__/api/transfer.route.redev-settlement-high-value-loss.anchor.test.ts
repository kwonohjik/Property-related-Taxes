/**
 * anchor — 재개발 완공 아파트 **청산금 수령분 고가 안분 · 양도차손** (V-5).
 * 계획서 `docs/00-pm/redev-existing-building-lthd-netting.plan.md` §7 (#3409 남은 한계 V-5).
 *
 * 청산금 수령분(종전주택 일부의 따로 양도)은 권리가격 > 기준금액이면 §160①으로 「양도차익 × (권리가격 − 기준금액) ÷ 권리가격」만 과세한다(2705).
 * 종전에는 차손이면 안분하지 않아, 권리가격이 기준금액 이하면 차손 0(비과세 마스킹)인데 1원만 넘어도 차손 전액이 신축주택 양도차익을 지웠다.
 * 비율은 부호와 무관하다 — 일반 경로 `calcOneHouseProration`과 신축주택 분기(`applyHighValueAllocation`, #3409)도 차손을 안분한다.
 *
 * 시료: 1세대1주택 · 청산금 수령 · 취득 2015-01-01 · 인가 2018-06-01 · 청산금분 양도일 2022-10-01(그 날 1주택 선언) · 신축 양도 2026-02-16(20억).
 * (⑧은 거주 구간 입주일 칸을 요구한다 — 이 anchor는 ④→⑫~⑭ 경로만 본다.)
 *
 * · V5-1 권리 15억 · 취득 18억 · 청산 3억: 청산금분 −60,000,000 × 3/15 = −12,000,000 (종전 −60,000,000) · 산출세액 40,943,600 (종전 23,837,000)
 * · V5-2 권리 10억(≤ 12억): 비과세 — 차손도 0 (불변)
 * · V5-3 권리 15억 · 이익: +100,000,000 × 3/15 = 20,000,000 (불변)
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
const redev = (id: string, sc: number, v: Variant, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: id, ...BASE, bgMarketValueAtTransfer: S(1_000_000_000, sc), standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc), ...redevFields(sc, v),
  }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Res = Awaited<ReturnType<typeof post>>;


const rd = (r: Res) => r.j.data.result.redevelopmentDetail;
/** 일반 양도 · 원조합원 · 주택 출자 — 취득 2015-01-01 · 인가 2018-06-01 · 양도 2026-02-16(기존건물분 11년 22% · 청산금 납부분 7년 14%). */
const REG = (sale: number, acq: number, rights: number, settle: number, dir: "pay" | "receive") =>
  redev("g", 1, dir, { transferType: "regular", bgValuationMode: "", actualSalePrice: String(sale), redevActualAcquisitionPrice: String(acq),
    redevRightsValue: String(rights), redevSettlementAmount: String(settle), redevSettlementDirection: dir });
const regForm = (a: AssetForm, sale: number, over: Record<string, unknown> = {}) => form([a], { contractTotalPrice: String(sale), ...over });

const RCV = (rights: number, acq: number, settle: number) =>
  Object.assign(REG(2_000_000_000, acq, rights, settle, "receive"),
    x({ redevSettlementSaleDate: "2022-10-01", redevExemptionEligibleAtApproval: "yes", redevOneHouseAtSettlementSale: "yes" }));
const run = async (rights: number, acq: number, settle: number) => {
  const r = await post(regForm(RCV(rights, acq, settle), 2_000_000_000, { isOneHousehold: true }));
  expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  return { d: rd(r), tax: r.j.data.result.calculatedTax as number };
};

describe("V5 청산금 수령분 고가 안분 — 차손도 같은 비율", () => {
  it("V5-1 권리 15억 > 12억 · 청산금분 차손 −60,000,000 → × 3/15 = −12,000,000 · 합계 212,000,000 · 산출세액 40,943,600", async () => {
    const { d, tax } = await run(1_500_000_000, 1_800_000_000, 300_000_000);
    // 인가전 −3억 중 청산금 몫 3/15 = −60,000,000 (나목은 12/15 = −2.4억 → 신축 안분 8/20 = −96,000,000)
    expect(d.settlement.gainBeforeAllocation).toBe(-60_000_000);
    expect(d.settlement.gain).toBe(-12_000_000);
    expect(d.settlement.nontaxableGain).toBe(-48_000_000);
    expect(d.settlement.lthd).toBe(0);
    expect(d.settlementHighValueAllocation).toMatchObject({ rightsValue: 1_500_000_000, threshold: 1_200_000_000, gainBeforeAllocation: -60_000_000, taxableGain: -12_000_000, nontaxableGain: -48_000_000 });
    // 신축주택분: 인가전 −96,000,000 · 인가후 320,000,000 → 기존건물분 224,000,000 × 22% = 49,280,000 (#3409 상계)
    expect(d.total).toEqual({ gain: 212_000_000, lthd: 49_280_000, taxableIncome: 162_720_000 });
    // 과세표준 160,220,000 × 38% − 19,940,000
    expect(tax).toBe(40_943_600);
  });
  it("V5-2 권리 10억 ≤ 12억 — 청산금분 비과세: 차손도 0 (불변)", async () => {
    const { d } = await run(1_000_000_000, 1_300_000_000, 300_000_000);
    expect(d.settlementExemptionApplied).toBe(true);
    expect(d.settlement.gain).toBe(0);
    expect(d.exemptedGain).toBe(-90_000_000);
    expect(d.settlementHighValueAllocation).toBeUndefined();
  });
  it("V5-3 권리 15억 · 청산금분 이익 100,000,000 → × 3/15 = 20,000,000 · 공제 14% (불변)", async () => {
    const { d } = await run(1_500_000_000, 1_000_000_000, 300_000_000);
    expect(d.settlement.gain).toBe(20_000_000);
    expect(d.settlement.lthd).toBe(2_800_000);
  });
});
