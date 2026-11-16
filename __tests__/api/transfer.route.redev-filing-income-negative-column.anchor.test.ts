/**
 * anchor — 재개발 신고서 표·명세서 **열별 양도소득금액 = 양도차익 − 장기보유특별공제(차손이면 음수 그대로)** (V-4).
 * 계획서 `docs/00-pm/redev-existing-building-lthd-netting.plan.md` §8.
 *
 * 종전에는 열마다 `max(0, 양도차익 − 공제)`로 0 바닥을 깔아, 차손 열이 있으면 열 합 ≠ 합계 열(합계 열은 바닥 없이 `과세대상 양도차익 − 공제`)이었다.
 * 시료(EN-1 · 일반 양도 · 납부 · 인가 전 차손): 종전 열 0 + 178,000,000 + 86,000,000 = 264,000,000 ≠ 합계 164,000,000.
 * 같은 표의 임대 토지·건물 분리 열(`FilingFormTableRentalSplit.ts`)은 이미 차손 파트를 음수 그대로 보인다.
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
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
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
const gainOf = (r: Res) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Res) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r)!; };
/** 오라클: 같은 시나리오 단건(물건 크기 sc). 채무·보증금·임대료는 입력 그대로. */
const single = async (v: Variant, sc: number, ...over: Record<string, unknown>[]) => ok(await post(form([redev("z", sc, v, ...over)])));


const rd = (r: Res) => r.j.data.result.redevelopmentDetail;
/** 일반 양도 · 원조합원 · 주택 출자 — 취득 2015-01-01 · 인가 2018-06-01 · 양도 2026-02-16(기존건물분 11년 22% · 청산금 납부분 7년 14%). */
const REG = (sale: number, acq: number, rights: number, settle: number, dir: "pay" | "receive") =>
  redev("g", 1, dir, { transferType: "regular", bgValuationMode: "", actualSalePrice: String(sale), redevActualAcquisitionPrice: String(acq),
    redevRightsValue: String(rights), redevSettlementAmount: String(settle), redevSettlementDirection: dir });
const regForm = (a: AssetForm, sale: number, over: Record<string, unknown> = {}) => form([a], { contractTotalPrice: String(sale), ...over });

import { fillRedev4SplitBranchData } from "@/components/calc/results/transfer/FilingFormTableRedevRows";
import { buildRedevPerAssetForIncome } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";

describe("V4 열별 양도소득금액 — 차손 열은 음수 그대로 · 열 합 = 합계", () => {
  it("신고서 표 3열: −100,000,000 + 178,000,000 + 86,000,000 = 164,000,000 = 엔진 양도소득금액", async () => {
    const d = rd(await post(regForm(REG(600_000_000, 300_000_000, 200_000_000, 100_000_000, "pay"), 600_000_000)));
    const cells: Record<string, number> = {};
    fillRedev4SplitBranchData(d, (row, col, v) => { if (row === "incomeAmount") cells[col] = v as number; }, () => {});
    expect(cells).toEqual({ preApproval: -100_000_000, postApprovalExistingHouse: 178_000_000, settlement: 86_000_000 });
    expect(cells.preApproval + cells.postApprovalExistingHouse + cells.settlement).toBe(d.total.taxableIncome);
  });
  it("명세서 양도소득금액 열: 같은 값 · 산식도 음수를 그대로 쓴다", async () => {
    const d = rd(await post(regForm(REG(600_000_000, 300_000_000, 200_000_000, 100_000_000, "pay"), 600_000_000)));
    const per = buildRedevPerAssetForIncome(d, "apt", "pay");
    expect(per.map((p) => p.value)).toEqual([-100_000_000, 178_000_000, 86_000_000]);
    expect(per[0].formula).toContain("= -100,000,000");
  });
});
