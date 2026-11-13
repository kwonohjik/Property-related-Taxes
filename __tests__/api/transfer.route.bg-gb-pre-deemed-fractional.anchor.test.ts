/**
 * 일반건물 의제취득일(1985.1.1.) 전 상속 파트 × 부담부증여 × 공유 지분 — 파트 ①(상증법 평가액)·②(§164 가액)도 지분 몫으로 줄인다.
 * 계획서 `docs/00-pm/bg-gb-pre-deemed-fractional-clause-a.plan.md` Q-1 (a). 종전엔 `keepPreDeemedClauseA`(PR-7b-6b L-1 (a) · 「§159는 지분 축소를 하지 않는다」 전제)가
 * 축 A 단건·함께 양도 지분 카드의 ①②를 100%로 실어 ③·기준시가·채무(지분 몫)와 단위가 섞였다 — #2990이 §159에 지분율을 넘기면서 전제가 깨졌다.
 *
 * 대조(오라클): 축 A = 반 크기 단건(채무는 본인 인수분이라 그대로) · 축 B = 단건 100% · 함께 양도 = 단건 합. 화면 경로 그대로: 폼 → ⑧ → ④ → ⑫~⑭.
 * 격자: 파트 3종(토지·건물·둘 다) × 승패 4종 × 모양 3종 × 모드 2종 = 72칸. 함께 양도 × win4 × 시가 보충은 오라클이 성립하지 않아(묶음 총액을 자산 시가 비율로 안분) 제외한다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const COMMON = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000" };
const S = (n: number, sc: number) => String(Math.round(n * sc));
const COMMON_SC = (sc: number) => ({ ...COMMON, bgMarketValueAtTransfer: S(1000000000, sc), standardPriceAtTransfer: S(800000000, sc), standardPriceAtAcq: S(400000000, sc) });
// GB 시료 — 양도시 기준시가 8억(토지 6,000,000×100㎡ + 건물 2억) · 취득시 4억(2,000,000×100㎡ + 2억) · 시가 10억 · 실지 2.5억(토지 1억 + 건물 1.5억)
const redev = (sc: number, v: string): Record<string, unknown> => {
  const b: Record<string, unknown> = { assetKind: "general_building", gbAcqLandPricePerSqm: S(2000000, sc), gbAcqBuildingValue: S(200000000, sc), gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential", gbTransferLandPricePerSqm: S(6000000, sc), gbTransferBuildingValue: S(200000000, sc), bgGiftBuildingStdPriceAtTransfer: S(200000000, sc), actualSalePrice: S(1600000000, sc), gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false, bgActualAcquisitionTotal: "", bgActualAcquisitionLand: S(100000000, sc), bgActualAcquisitionBuilding: S(150000000, sc) };
  if (v === "sepdate") Object.assign(b, { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-01" });
  return b;
};
const a = (sc: number, v: string, id: string, ...over: Record<string, unknown>[]) => Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON_SC(sc), ...redev(sc, v) }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) => Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = (t: string) => ({ assetSplitMode: "fractional", contractTotalPrice: t });
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };
const dbl = (v: string) => String(Number(v) * 2);

const issues = (f: TransferFormData) => { const o: { field?: string; message: string }[] = []; for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) o.push({ field: m.field, message: m.message }); return o; };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gain = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;



// 파트 의제전 변형 — land: 토지만 1980 상속 / building: 건물만 1980 상속 / both. ① 크기 V: win1=①승(6천만) · win2=②승(① 500만, 단가 300,000) · win3=③승(① 500만, 단가 50,000)
const LAND_PRE = (sc: number, v: string) => ({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01",
  publishedValueAtInheritance: S(v === "win1" ? 60000000 : 5000000, sc), gbAcqLandPricePerSqm: S(v === "win3" ? 50000 : 300000, sc), acquisitionDate: "2015-01-01", gbBuildingAcquisitionCause: "purchase", ...(v === "win4" ? { bgMarketValueAtTransfer: S(2400000000, sc) } : {}) });
const BLD_PRE = (sc: number, v: string) => ({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionCause: "purchase", acquisitionDate: "1980-01-01", gbBuildingAcquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01", gbBuildingDecedentAcquisitionDate: "1970-01-01", gbBuildingInheritedValue: S(v === "win1" ? 60000000 : 5000000, sc), gbAcqBuildingValue: S(v === "win3" ? 5000000 : 30000000, sc) });
const BOTH_PRE = (sc: number, v: string) => ({ ...LAND_PRE(sc, v), ...BLD_PRE(sc, v), hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionDate: "1980-01-01", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance" });
const PARTS: [string, (sc: number, v: string) => Record<string, unknown>][] = [["land", LAND_PRE], ["building", BLD_PRE], ["both", BOTH_PRE]];


const MODES: [string, Record<string, unknown>, string][] = [["시가보충", {}, "300000000"], ["기준시가보충", STD, "200000000"]];

describe("GF-1 고정값 — 토지 파트 ① 채택 · 지분 50% 단건 · 시가 보충", () => {
  it("양도차익 237,000,000 (토지 취득가액 = ①6천만 × 0.5 × 채무비율 0.6 = 1,800만 · 수정 전 219,000,000)", async () => {
    const r = await post(form([a(1, "base", "a", HALF, debt("300000000"), LAND_PRE(1, "win1"))]));
    expect(issues(form([a(1, "base", "a", HALF, debt("300000000"), LAND_PRE(1, "win1"))]))).toEqual([]);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(237_000_000);
  });
});

describe("GF-2 와이어 — 지분 몫으로 줄인 ①②를 싣는다", () => {
  it("축 A 단건 50%: 토지 ①②", async () => {
    const body = (await captureBody(form([a(1, "base", "a", HALF, debt("300000000"), LAND_PRE(1, "win1"))]))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(body.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 30_000_000, sec164: 15_000_000 });
  });
  it("함께 양도 지분 카드 50%: 카드 토지 ①②", async () => {
    const body = (await captureBody(form([a(1, "base", "a", debt("600000000")), a(1, "base", "b", HALF, debt("300000000"), LAND_PRE(1, "win1"))], BD))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const c = (body.companionAssets as Record<string, any>[]).find((y) => y.assetKind === "general_building")!; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 30_000_000, sec164: 15_000_000 });
  });
});

describe("GF-3 72칸 격자 — 지분 자산 양도차익 = 같은 종류 단건 대조", () => {
  for (const [pn, PF] of PARTS) {
    it(`${pn} 파트: win1~win4 × 축 A·축 B·함께 양도 × 시가·기준시가 보충`, async () => {
      const bad: string[] = [];
      let cells = 0;
      for (const v of ["win1", "win2", "win3", "win4"]) for (const [mn, md, dbt] of MODES) {
        const cases: [string, TransferFormData, TransferFormData[]][] = [
          ["A", form([a(1, "base", "a", HALF, md, debt(dbt), PF(1, v))]), [form([a(0.5, "base", "z", md, debt(dbt), PF(0.5, v))])]],
          ["B", form([a(1, "base", "p", pct("60"), md, debt(dbl(dbt)), PF(1, v)), a(1, "base", "s", pct("40"), md, debt(dbl(dbt)), PF(1, v))], AB("1600000000")), [form([a(1, "base", "z", md, debt(dbl(dbt)), PF(1, v))])]],
          ["C", form([a(1, "base", "a", md, debt(dbl(dbt))), a(1, "base", "b", HALF, md, debt(dbt), PF(1, v))], BD), [form([a(1, "base", "z1", md, debt(dbl(dbt)))]), form([a(0.5, "base", "z2", md, debt(dbt), PF(0.5, v))])]],
        ];
        for (const [shape, f, refs] of cases) {
          cells++;
          const r = await post(f);
          const i8 = issues(f).length;
          if (r.status !== 200 || i8 !== 0) { bad.push(`${v}/${shape}/${mn}: ⑧${i8} ⑫${r.status}`); continue; }
          if (shape === "C" && v === "win4" && mn === "시가보충") continue; // 오라클 부적합(묶음 총액 안분)
          let ref = 0;
          for (const rf of refs) ref += gain(await post(rf)) ?? 0;
          if (gain(r) !== ref) bad.push(`${v}/${shape}/${mn}: ${gain(r)} ≠ ${ref}`);
        }
      }
      expect(cells).toBe(24);
      expect(bad).toEqual([]);
    }, 600000);
  }
});
