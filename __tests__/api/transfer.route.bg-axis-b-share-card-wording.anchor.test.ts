/**
 * 축 B × 부담부증여 지분 카드 ⑧ 문구 — 지분 카드에는 「② 양도정보」가 없고 취득시 기준시가 칸은 「이 지분의 취득시 기준시가 (물건 전체)」다.
 * 계획서 docs/00-pm/remaining-4-measurements.plan.md §C · Q-48 a. 칸 키(`standardPriceAtAcq`) · 조건은 그대로 — 문구만 바뀐다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = "housing" | "land" | "commercial_building" | "building";
const KINDS: Kind[] = ["housing", "land", "commercial_building", "building"];
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 종류별 실지취득가액 칸 — 화면 `BurdenedGiftBlock.tsx`와 같다(토지는 토지 칸, 그 밖은 총액). */
const FIELD: Record<Kind, "bgActualAcquisitionTotal" | "bgActualAcquisitionLand"> = {
  housing: "bgActualAcquisitionTotal", land: "bgActualAcquisitionLand", commercial_building: "bgActualAcquisitionTotal", building: "bgActualAcquisitionTotal",
};
const LAND = { landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent", companionLandNature: "independent" };
/** 시가 10억 · 양도시 기준시가 8억 · 취득시 기준시가 4억 — vp2c §15.1과 같은 재료. */
const COMMON = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
const debt = (d: number) => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const pct = (n: number, third = false) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}) });
const K6 = { bgAcquisitionMethod: "salesCase", bgPresumedInputKind: "total", bgPresumedAcquisitionTotal: "300000000", bgPresumedAcquisitionLand: "300000000" };
const OWN = { bgShareOwnAcquisition: true };

/** 자산 1(주 자산) — 2015 취득 · 실지 2.5억. */
/** 건물 기준시가 평가는 증여일 기준시가(상증법 §61①2호) 필수 — 양도시 기준시가와 같은 값(종전 엔진 대체값)이라 세액 불변. 토지·주택·상가에는 싣지 않는다. */
const GIFT_STD = { bgGiftBuildingStdPriceAtTransfer: "800000000" };
const primary = (k: Kind, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: "p", ...COMMON, assetKind: k, acquisitionDate: "2015-01-01", ...(k === "land" ? LAND : {}), ...(k === "building" ? GIFT_STD : {}), [FIELD[k]]: "250000000" }), ...over.map(x)) as AssetForm;
/**
 * 「+ 지분 추가」로 만든 지분 카드 — 저장값은 기본값(양도 형태 「일반 양도」 · 자산 종류 「주택」). 2018 취득.
 * 취득시 기준시가는 지분 카드의 「이 지분의 취득시 기준시가 (물건 전체)」 칸 값(K-6 개산공제 · 기준시가 평가가 읽는다 — `BurdenedGiftTrancheBasisBlock`).
 */
const share = (...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(2) }, x({ assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", standardPriceAtAcq: "400000000" }), ...over.map(x)) as AssetForm;
/** 오라클용 축 A 단건 — 그 지분 재료로 넣은 같은 종류 단건(나머지 제3자). */
const single = (k: Kind, id: string, acq: string, actual: string, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, assetKind: k, acquisitionDate: acq, ...(k === "land" ? LAND : {}), ...(k === "building" ? GIFT_STD : {}), [FIELD[k]]: actual }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, contractTotalPrice: "",
  }, over))) as TransferFormData;
const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

const SHARE_FIELD = "이 지분 카드의 「이 지분의 취득시 기준시가 (물건 전체)」 칸";

describe("SW-1 지분 카드 ⑧ 문구 — 「② 양도정보」 대신 지분 카드 칸을 가리킨다(Q-48 a · 표시만)", () => {
  for (const k of ["housing", "commercial_building", "building"] as Kind[]) {
    it(`${k} · K-6 지분 카드 취득시 기준시가 비움`, () => {
      const f = form([primary(k, pct(60), debt(600_000_000)), share(pct(40), OWN, K6, { standardPriceAtAcq: "" })], AB);
      const shareIssues = allIssues(f).filter((i) => i.includes("자산 2"));
      expect(shareIssues).toHaveLength(1);
      expect(shareIssues[0]).toContain(":standardPriceAtAcq:");
      expect(shareIssues[0]).toContain(SHARE_FIELD);
      expect(shareIssues[0]).not.toContain("② 양도정보");
    });
    it(`${k} · 기준시가 평가 지분 카드 취득시 기준시가 비움`, () => {
      const f = form([primary(k, pct(60), debt(400_000_000), STD), share(pct(40), { standardPriceAtAcq: "" })], AB);
      const shareIssues = allIssues(f).filter((i) => i.includes("자산 2"));
      expect(shareIssues.some((i) => i.includes(SHARE_FIELD))).toBe(true);
    });
  }
  it("자산 1(주 자산) 문구는 그대로 「② 양도정보」", () => {
    const f = form([primary("housing", K6, debt(600_000_000), { standardPriceAtAcq: "" })], { contractTotalPrice: "1000000000" });
    expect(allIssues(f).some((i) => i.includes("「② 양도정보」의 취득시 기준시가를"))).toBe(true);
  });
});
