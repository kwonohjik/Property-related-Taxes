/**
 * anchor — 일반건물 부담부증여 **축 A(공유 소유 — 채무는 본인 인수분)** 의 §159 지분율 전달.
 * 계획서 `docs/00-pm/gb-axis-a-bg-ownership-ratio.plan.md` (PR #2983, 결정 Q-1~Q-4 모두 a).
 *
 * 종전: 일반건물 ⑫(단건 `dispatchCoercedGeneralBuilding` · 함께 양도 `buildGbCompanionItems`)가 «물건 전체 입력 → 엔진이 지분분 환산»
 * 약속(BurdenedGiftBlock 안내)과 달리 지분율을 §159 부담부증여 빌더에 넘기지 않아, 증여가액 C·취득가액이 물건 전체 값으로 계산됐다.
 * 보충적 평가 승은 B/C 약분으로 지분 스케일이 상쇄돼 값이 같았고, 담보(상증법 §66)·임대(§61⑤) 승은 스케일에 민감해 틀렸다.
 * 주택 단건은 `general-building-route-actual.ts`가 이미 `ownershipRatio`를 받았고 축 B(`general-building-fractional.ts`)도 넘기고 있었다.
 *
 * 오라클 = **같은 종류의 반 크기 단건**(평가액·기준시가·실지취득가 ×0.5, 채무·보증금·임대료는 본인 인수분 그대로).
 * 손계산 1건(기준시가 · 담보 · 채무 7억 → 494,000,000)을 고정해 오라클 자체가 틀어지는 것을 막는다.
 *
 * · GA-1 축 A 단건 — 기준시가 담보·임대, 시가 담보: 양도차익 = 반 크기 단건.
 * · GA-2 승자 갈림 — 채무 M에 따라 보충↔담보가 갈리는 경계(M 4.5억·6억·7억·9억)에서 양도차익 = 반 크기 단건.
 * · GA-3 함께 양도 100%+50% — 양도차익 = 자산별 단건(크기 1 + 크기 0.5)의 합.
 * · GA-4 불변 대조 — 보충 승 축 A · 축 B 60/40 담보는 수정 전후 같다.
 * ⑧은 일반건물의 시가 담보·함께 양도를 계속 막는다(Q-3 별도 계획) — 여기서는 ⑫ 값만 고정한다(POST 직접).
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
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 경제 입력: 양도시 기준시가 8억(토지 ㎡당 600만 × 100㎡ + 건물 2억) · 취득시 4억(토지 ㎡당 200만 × 100㎡ + 건물 2억) · 시가 10억 · 실지 2.5억. `sc`는 물건 크기 배율. */
const S = (n: number, sc: number) => String(Math.round(n * sc));
const gb = (id: string, sc: number, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: id, addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: S(1_000_000_000, sc), bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual",
    standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc),
    assetKind: "general_building", gbAcqLandPricePerSqm: S(2_000_000, sc), gbAcqBuildingValue: S(200_000_000, sc), gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential", gbTransferLandPricePerSqm: S(6_000_000, sc), gbTransferBuildingValue: S(200_000_000, sc), actualSalePrice: S(1_600_000_000, sc),
    gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false,
    bgActualAcquisitionTotal: "", bgActualAcquisitionLand: S(100_000_000, sc), bgActualAcquisitionBuilding: S(150_000_000, sc),
  }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const RENT = { bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gainOf = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Awaited<ReturnType<typeof post>>) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r); };
/** 오라클: 같은 종류의 단건(물건 크기 sc) — 채무·보증금·임대료는 입력 그대로. */
const single = async (sc: number, ...over: Record<string, unknown>[]) => ok(await post(form([gb("z", sc, ...over)])));

describe("GA-1 축 A 단건 — 양도차익 = 반 크기 단건", () => {
  it("기준시가 · 담보(채무 7억) = 손계산 494,000,000", async () => {
    // 증여가액 C = max(보충 8억 × 50% = 4억, 담보 7억) = 7억 → 채무비율 1 → 취득가액 = 취득시 기준시가 4억 × 50% × 1 = 2억 · 개산공제 3% = 600만 → 7억 − 2억 − 600만
    const g = ok(await post(form([gb("a", 1, HALF, STD, debt("700000000"))])));
    expect(g).toBe(494_000_000);
    expect(g).toBe(await single(0.5, STD, debt("700000000")));
  });
  it.each([
    ["기준시가 · 임대", [STD, RENT]],
    ["시가 · 담보 (⑫ 직접)", [debt("700000000")]],
  ] as const)("%s", async (_n, over) => {
    const g = ok(await post(form([gb("a", 1, HALF, ...over)])));
    expect(g).toBe(await single(0.5, ...over));
  });
});

describe("GA-2 승자 갈림 — 채무 M에 따라 보충↔담보", () => {
  // 보충 = 양도시 기준시가 × 지분. 수정 전 ⑫는 지분을 줄이지 않은 8억과 M을 비교해 4.5억·6억·7억에서 보충을 골랐다.
  it.each(["300000000", "450000000", "600000000", "700000000", "900000000"])("M=%s", async (M) => {
    const g = ok(await post(form([gb("a", 1, HALF, STD, debt(M))])));
    expect(g).toBe(await single(0.5, STD, debt(M)));
  });
});

describe("GA-3 함께 양도 100%+50% — 양도차익 = 자산별 단건의 합", () => {
  it.each([
    ["기준시가 · 담보", [STD], debt("1600000000"), debt("700000000")],
    ["기준시가 · 임대", [STD], { ...RENT, bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "240000000" }, RENT],
    ["시가 · 담보", [], debt("1600000000"), debt("700000000")],
  ] as const)("%s", async (_n, mode, w100, w50) => {
    const g = ok(await post(form([gb("a", 1, ...mode, w100), gb("b", 1, HALF, ...mode, w50)], BD)));
    expect(g).toBe((await single(1, ...mode, w100))! + (await single(0.5, ...mode, w50))!);
  });
});

describe("GA-4 불변 대조 — 수정 전후 같다", () => {
  it("보충 승(채무 2억·3억) 축 A 단건: 기준시가·시가 모두 반 크기 단건과 같다", async () => {
    for (const [mode, M] of [[STD, "200000000"], [{}, "300000000"]] as const) {
      expect(ok(await post(form([gb("a", 1, HALF, mode, debt(M))])))).toBe(await single(0.5, mode, debt(M)));
    }
  });
  it("축 B 60/40 기준시가 · 담보(채무 물건 전체 12억): 두 카드 합 = 같은 물건 단건 100%", async () => {
    const w = debt("1200000000");
    const g = ok(await post(form([gb("p", 1, pct("60"), STD, w), gb("s", 1, pct("40"), STD, w)], { assetSplitMode: "fractional", contractTotalPrice: "1000000000" })));
    expect(g).toBe(await single(1, STD, w));
  });
});
