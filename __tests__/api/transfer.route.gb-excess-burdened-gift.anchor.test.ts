/**
 * anchor — 일반건물 부담부증여 **초과부담부(채무 B > 증여가액 C)** 가드.
 * 계획서 `docs/00-pm/gb-excess-burdened-gift-guard.plan.md` (PR #2997, 결정 Q-1~Q-4 모두 a).
 *
 * 종전: 일반건물 실가 경로(`general-building-route-actual.ts`)가 공용 단계의 `assertBurdenedGiftEligible`을 지나지 않고 `buildBurdenedGiftBreakdown`을 직접 불러,
 * B > C 입력이 400이 아니라 200이었다(채무비율 > 1 · 무상이전분 음수 · 취득가액이 취득시 기준시가를 넘는 값으로 계산). 주택·토지·재개발은 전 모양 400이다.
 * 화면(⑧)은 이미 일반건물도 막으므로 API 직접 호출에서만 드러났다.
 *
 * · GE-1 일반건물 B > C 8칸(단독 100% · 축 A 50% · 축 B 60/40 · 함께 양도 × 기준시가·시가 모드) → 400 `[EXCESS_BURDENED_GIFT]`.
 * · GE-2 경계 B = C → 200 · 값 불변(기준시가 388,000,000 · 시가 750,000,000) — 가드는 «초과»만 거른다.
 * · GE-3 정당한 입력 불변 — 담보평가액 = 채무(시가 < 담보평가액, B = C)는 계속 계산한다(O-5).
 * · GE-4 비교군 — 주택 단독 B > C도 같은 코드·같은 문구로 400이다(종류 간 응답 동일).
 * · GE-5 이월과세 시나리오 A·B — 두 시나리오가 C 쪽 칸(양도시 기준시가·채무·평가 모드)을 바꾸지 않아 B > C면 400, B = C면 200 (V-1).
 * · GE-6 층별 가감율(`bgGiftBuildingStdPriceAtTransfer`) — 가드의 C와 breakdown의 C가 같다(V-3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(() => vi.unstubAllGlobals());

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 경제 입력: 양도시 기준시가 8억(토지 ㎡당 600만 × 100㎡ + 건물 2억) · 취득시 4억 · 시가 10억. */
const COMMON = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
};
const KIND: Record<string, Record<string, unknown>> = {
  housing: { assetKind: "housing", bgActualAcquisitionTotal: "250000000" },
  general_building: {
    assetKind: "general_building", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential", gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", actualSalePrice: "1600000000",
    gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false,
    bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
  },
};
const asset = (kind: string, id: string, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, ...KIND[kind] }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
/** 채권최고액 0 → 담보평가액 0이라 C = 보충적평가(기준시가 8억 / 시가 10억). */
const over0 = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: "0" });
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Res = Awaited<ReturnType<typeof post>>;
const gainOf = (r: Res) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const EXCESS = "[EXCESS_BURDENED_GIFT]";
const expect400 = (r: Res) => {
  expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(400);
  expect(r.j.error?.code).toBe("INVALID_INPUT");
  expect(String(r.j.error?.message)).toContain(EXCESS);
};
const gb = (id: string, ...over: Record<string, unknown>[]) => asset("general_building", id, ...over);

/** 모양 4종 × 모드 2종. B는 물건 전체(축 B·함께 양도 100%) 또는 본인 인수분(축 A 50%) — 지분분 C보다 크게. */
const SHAPES: { n: string; mk: (mode: Record<string, unknown>) => TransferFormData }[] = [
  { n: "단독 100%", mk: (m) => form([gb("z", m, over0(m === STD ? "950000000" : "1100000000"))]) },
  { n: "축 A 50%", mk: (m) => form([gb("a", HALF, m, over0(m === STD ? "500000000" : "600000000"))]) },
  { n: "축 B 60/40", mk: (m) => form([gb("p", pct("60"), m, over0(m === STD ? "950000000" : "1100000000")), gb("s", pct("40"), m, over0(m === STD ? "950000000" : "1100000000"))], AB) },
  { n: "함께 양도 100%+50%", mk: (m) => form([gb("a", m, over0(m === STD ? "950000000" : "1100000000")), gb("b", HALF, m, over0(m === STD ? "500000000" : "600000000"))], BD) },
];

describe("GE-1 일반건물 B > C — 전 모양 · 두 모드 400", () => {
  for (const [mn, mode] of [["기준시가", STD], ["시가", {}]] as const) {
    it.each(SHAPES.map((s) => [s.n, s] as const))(`${mn} · %s`, async (_n, s) => {
      expect400(await post(s.mk(mode)));
    });
  }
});

describe("GE-1b 함께 양도 — 50% 자산만 초과(100% 자산은 B = C)여야 지분율 전달이 판별된다", () => {
  // 100% 자산이 B > C면 지분율과 무관하게 걸린다. 50% 자산의 B(5억)만 지분분 C(4억)를 넘고, 물건 전체 C(8억)로는 넘지 않는다.
  it("기준시가 모드: 100% 자산 B = 8억(= C) + 50% 자산 B = 5억(> 지분분 4억) → 400", async () => {
    expect400(await post(form([gb("a", STD, over0("800000000")), gb("b", HALF, STD, over0("500000000"))], BD)));
  });
  it("같은 조합에서 50% 자산 B = 4억(= 지분분 C) → 200", async () => {
    const r = await post(form([gb("a", STD, over0("800000000")), gb("b", HALF, STD, over0("400000000"))], BD));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
  });
});

describe("GE-2 경계 B = C — 계속 200, 값 불변", () => {
  it("기준시가 모드 단독 100% B = 8억 → 388,000,000", async () => {
    const r = await post(form([gb("z", STD, over0("800000000"))]));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
    expect(gainOf(r)).toBe(388_000_000);
  });
  it("시가 모드 단독 100% B = 10억 → 750,000,000", async () => {
    const r = await post(form([gb("z", over0("1000000000"))]));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
    expect(gainOf(r)).toBe(750_000_000);
  });
});

describe("GE-3 정당한 입력 불변 — 담보평가액 = 채무", () => {
  it("시가 10억 < 담보평가액 12억 = 채무 12억(B = C): 200", async () => {
    const r = await post(form([gb("z", { bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" })]));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
  });
  it("축 A 50% 시가 담보 승(채무 7억 = 담보평가액 > 지분 시가 5억): 200 — #2990 anchor와 같은 입력", async () => {
    const r = await post(form([gb("a", HALF, { bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000" })]));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
  });
});

describe("GE-4 비교군 — 주택 단독 B > C도 같은 코드·문구", () => {
  it("기준시가 모드 B 9.5억 > C 8억 → 400 [EXCESS_BURDENED_GIFT]", async () => {
    expect400(await post(form([asset("housing", "h", STD, over0("950000000"))])));
  });
});

describe("GE-5 이월과세 시나리오 A·B (V-1)", () => {
  const TRANSFER_DATE = "2026-03-01";
  /** 일반건물 · 부담부증여 K-5 · 이월과세(토지·건물 둘 다) — `bg-gb-carryover-statement-expense-formula.anchor.test.ts` 시료. 시가 10억. */
  const carry = (debt: string) =>
    sameDayBuildingDonorDate({
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "purchase",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
      gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
      transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageSetAmount: "0", bgAcquisitionMethod: "converted", bgActualAcquisitionLand: "250,000,000", bgActualAcquisitionBuilding: "250,000,000",
      bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    } as unknown as AssetForm);
  const postCarry = (debt: string) => {
    const f = Object.assign(createDefaultTransferFormData(), FORM, { transferDate: TRANSFER_DATE, assets: [carry(debt)], contractTotalPrice: "1,000,000,000", houses: [], presaleRights: [], isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false }) as TransferFormData;
    return post(f);
  };
  it("B > C(채무 11억 > 시가 10억) → 400", async () => {
    expect400(await postCarry("1,100,000,000"));
  });
  it("B = C(채무 10억 = 시가 10억) → 200 — 이월과세 계산은 그대로", async () => {
    const r = await postCarry("1,000,000,000");
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  });
});

describe("GE-6 층별 가감율 — 가드의 C = breakdown의 C (V-3)", () => {
  // 기준시가 모드 C = 토지 6억 + 건물(가감율 적용 1.5억) = 7.5억 — 가감율 칸을 읽지 않으면 C가 8억이라 B = 7.6억이 통과한다.
  const withFloor = (d: string) => form([gb("z", STD, { bgGiftBuildingStdPriceAtTransfer: "150000000" }, over0(d))]);
  it("B = 7.5억(= C) → 200 · breakdown의 채무비율이 정확히 1 (두 C가 같다)", async () => {
    const r = await post(withFloor("750000000"));
    expect(r.status, JSON.stringify(r.j).slice(0, 200)).toBe(200);
    expect(r.j.data?.transferBurdenedGiftBreakdown?.debtRatio).toBe(1);
  });
  it("B = 7.6억(> C) → 400", async () => {
    expect400(await post(withFloor("760000000")));
  });
});

describe("⑧은 일반건물 B > C를 계속 막는다 — 화면 변화 없음 (측정 시점의 사실 고정)", () => {
  it("기준시가 모드 단독 B 9.5억: ⑧ «채무액 … 증여가액 … 초과합니다»", () => {
    const f = form([gb("z", STD, over0("950000000"))]);
    const m: string[] = [];
    for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) m.push(i.message);
    expect(m.some((t) => t.includes("초과합니다"))).toBe(true);
  });
});
