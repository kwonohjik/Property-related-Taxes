/**
 * anchor — 이월과세 × 증여자 신축 일체 주택(`donorBuilt.housing`) × 영 §164⑨ 양도 당시 기준시가 특례 · API 경로 (PR-B)
 * 계획서: docs/00-pm/self-built-housing-164-9-plan.md §3 (Q-4 정렬 — 출하 수치 상승을 알고 승인) · §9.1 «5c» · §9.4 (13)
 *
 * 한 줄: A 시나리오의 양도차익은 `calcTransferGain` 이 `resolveConversionDenominatorAtTransfer` 로 특례(공익수용 1호·공매·경락 2호)가 걸린 H_T′ 를
 * 환산 분모로 쓴다. 증여자 신축 건물분 base 의 양도 당시 분모도 같은 값이어야 한다 — 종전에는 특례 전 H_T 로 안분해 조용히 «특례 무시»(나) 로 동작했다.
 *
 *  · DP-1 단건 수용·공매: 56,250,000 / 2,812,500 / 총 18,928,470 → 75,000,000 / 3,750,000 / 19,959,720 (+1,031,250)
 *  · DP-2 분기쌍: 구분 기재 · 양도차손 · 지분 · 증여세 상당액 · 증축 · 미등기
 *  · DP-3 단일 소스 항등: echo 분모 = 양도차익의 환산 분모 = 특례 detail 분모, base = 환산취득가액 × 취득 당시 건물 비율
 *  · DP-4 불변: 특례 없음 · 불발(수치) · 보상 미입력 · ②3호 B 채택 · 5년 경과 · 최상위 환산 OFF · donorBuilt 없음
 *  · DP-5 함께 양도(컴패니언): 93,750,000 / 4,687,500 → 125,000,000 / 6,250,000
 *  · DP-6 범위 밖 고정: 비주택 건물 단독 신축은 이번 PR 이 건드리지 않는다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const HOUSING = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000,
  buildingStdPriceAtTransfer: 160_000_000,
};
const COMMON = {
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
};
const CT = {
  giftRegistryDate: "2024-05-01",
  donorAcquisitionDate: "2022-01-10",
  useEstimatedAcquisition: true,
  giftTaxAmount: 0,
  giftDateValuation: 800_000_000,
};
const DB_NEW = { buildingType: "new", constructionDate: "2022-01-10" };
const DB_EXT = { buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 30_000_000 };

/** 공통 픽스처: 양도가 3억 · 증여자 취득 당시 H=2억(L=1억·N=6천만 → B_acq 75,000,000) · 양도 당시 H_T=4억(L_T=2.4억·N_T=1.6억) */
const single = (over: object = {}, ctOver: object = {}, dbOver: object = {}) => ({
  ...COMMON,
  propertyType: "housing",
  transferPrice: 300_000_000,
  transferDate: "2026-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2024-05-01",
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 400_000_000,
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2022-01-10",
  carryoverTaxation: { ...CT, ...ctOver, donorBuilt: { ...DB_NEW, housing: HOUSING, ...dbOver } },
  ...over,
});
/** 1호 — 보상액 3억 · 보상산정 기초 3.5억 → H_T′ = min(4억, 3억, 3.5억) = 3억 */
const EXPR = { transferCause: "public_expropriation", housingCompensationTotal: 300_000_000, housingCompensationBasisTotal: 350_000_000 };
/** 1호 불발 — 보상액·기초가 H_T 이상이라 분모가 안 바뀐다 */
const EXPR_MISS = { transferCause: "public_expropriation", housingCompensationTotal: 500_000_000, housingCompensationBasisTotal: 500_000_000 };
/** 2호 — 경락가 3억 → H_T′ = min(4억, 3억) = 3억 */
const AUCTION = { isAuctionTransfer: true, auctionPrice: 300_000_000 };

interface Echo {
  applied: boolean;
  notAppliedReason?: string;
  base?: number;
  penalty?: number;
  formula?: { multiplicand: number; numerator: number; denominator: number };
  housingSplit?: {
    acquisitionBuilding: number;
    transferBuilding: number;
    saleBuilding: number;
    transferHousing?: number;
    sec164_9?: { kind: string; standardHousing: number; candidates: Record<string, number> };
  };
}
interface Result {
  penaltyBase: number;
  penaltyTax: number;
  totalTax: number;
  transferGain: number;
  warnings?: string[];
  housingExpropriationValuationDetail?: { standardTotal: number; denominator: number };
  auctionValuationDetail?: { standardTotal: number; denominator: number };
  carryoverTaxationDetail?: { adoptedScenario: string; donorBuiltPenalty?: Echo };
}
type Prop = { penaltyBase: number; penaltyTax: number; carryoverTaxationDetail?: { donorBuiltPenalty?: Echo } };
async function call(b: object): Promise<{ status: number; result?: Result; props?: Prop[]; totalTax?: number; error?: unknown }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
  const json = (await res.json()) as { data?: { result: Result; aggregated?: { properties?: Prop[]; totalTax?: number } }; error?: unknown };
  return { status: res.status, result: json.data?.result, props: json.data?.aggregated?.properties, totalTax: json.data?.aggregated?.totalTax, error: json.error };
}
const OK = (r: { status: number; error?: unknown }) => expect(r.status, JSON.stringify(r.error)).toBe(200);
const echoOf = (r: { result?: Result }) => r.result!.carryoverTaxationDetail!.donorBuiltPenalty!;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("DP-1 단건 — 특례가 걸린 H_T′ 로 건물분을 안분한다 (종전: 특례 전 H_T → 56,250,000)", () => {
  it("1호 공익수용: B_tr′ = 3억 × 1.6억 ÷ 4억 = 120,000,000 → base 75,000,000 · 가산세 3,750,000 · 총납부 19,959,720 (종전 56,250,000 / 2,812,500 / 18,928,470)", async () => {
    const r = await call(single(EXPR));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 75_000_000, penaltyTax: 3_750_000, totalTax: 19_959_720 });
    expect(r.result!.totalTax - 18_928_470).toBe(1_031_250);
    const e = echoOf(r);
    expect(e).toMatchObject({ applied: true, base: 75_000_000, penalty: 3_750_000 });
    expect(e.formula).toEqual({ multiplicand: 120_000_000, numerator: 75_000_000, denominator: 120_000_000 });
    expect(e.housingSplit).toMatchObject({
      acquisitionBuilding: 75_000_000,
      transferBuilding: 120_000_000,
      saleBuilding: 120_000_000,
      transferHousing: 300_000_000,
      sec164_9: { kind: "expropriation", standardHousing: 400_000_000, candidates: { compensation: 300_000_000, basis: 350_000_000 } },
    });
  });

  it("2호 공매·경락: 같은 H_T′ → 같은 값 + echo 가 2호 (종전 56,250,000 / 18,928,470)", async () => {
    const r = await call(single(AUCTION));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 75_000_000, penaltyTax: 3_750_000, totalTax: 19_959_720 });
    expect(echoOf(r).housingSplit).toMatchObject({
      transferBuilding: 120_000_000,
      transferHousing: 300_000_000,
      sec164_9: { kind: "auction", standardHousing: 400_000_000, candidates: { auction: 300_000_000 } },
    });
  });

  it("1호·2호 동시(잔재): N3 배타로 1호가 우선한다 — 1호 echo · 같은 값", async () => {
    const r = await call(single({ ...EXPR, ...AUCTION }));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 75_000_000, totalTax: 19_959_720 });
    expect(echoOf(r).housingSplit!.sec164_9!.kind).toBe("expropriation");
  });
});

describe("DP-2 분기쌍 — 이익·손실 / 구분 기재 / 지분 / 증여세 / 증축 / 미등기 (전 → 후, 전부 수용 1호)", () => {
  it.each([
    // [라벨, 입력, 전 base, 전 총납부, 후 base, 후 가산세, 후 총납부]
    ["구분 기재 토지 2억/건물 1억", single(EXPR, {}, { housing: { ...HOUSING, sale: { landTransferPrice: 200_000_000, buildingTransferPrice: 100_000_000 } } }), 46_875_000, 18_412_845, 62_500_000, 3_125_000, 19_272_220],
    ["양도차손(자본적지출 12억) — 손실 조기반환도 같은 base", single({ ...EXPR, capitalExpenditure: 1_200_000_000 }), 56_250_000, 3_093_750, 75_000_000, 3_750_000, 4_125_000],
    ["지분 50%(양도가 1.5억 · 기준시가·보상 물건 전체)", single({ ...EXPR, ownershipRatio: 0.5, transferPrice: 150_000_000 }), 28_125_000, 6_882_975, 37_500_000, 1_875_000, 7_398_600],
    ["증여세 상당액 1천만(A 입력이 실가로 전환되는 경로)", single(EXPR, { giftTaxAmount: 10_000_000 }), 56_250_000, 16_499_670, 75_000_000, 3_750_000, 17_530_920],
    ["증축(분자 = 증축 부분 기준시가 3천만)", single(EXPR, {}, { ...DB_EXT }), 22_500_000, 17_072_220, 30_000_000, 1_500_000, 17_484_720],
    ["미등기", single({ ...EXPR, isUnregistered: true }), 56_250_000, 79_631_750, 75_000_000, 3_750_000, 80_663_000],
  ])("%s", async (_label, body, _beforeBase, _beforeTotal, base, penalty, total) => {
    const r = await call(body);
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: base, penaltyTax: penalty, totalTax: total });
    expect(r.result!.penaltyBase).toBeGreaterThan(_beforeBase as number);
    expect(r.result!.totalTax).toBeGreaterThan(_beforeTotal as number);
    expect(echoOf(r).housingSplit!.sec164_9).toBeDefined();
  });
});

describe("DP-3 단일 소스 — 가산세 base 의 분모 = 양도차익의 환산 분모 (정렬이 사라지면 깨진다)", () => {
  it("수용: echo.transferHousing = 특례 detail 분모(3억) · 양도차익 94,000,000 = 3억 − 환산취득가액 2억 − 개산공제 600만", async () => {
    const r = await call(single(EXPR));
    OK(r);
    const denom = r.result!.housingExpropriationValuationDetail!.denominator;
    expect(denom).toBe(300_000_000);
    expect(echoOf(r).housingSplit!.transferHousing).toBe(denom);
    const acq = Math.floor((300_000_000 * 200_000_000) / denom); // 양도차익이 쓴 환산취득가액 (S × H ÷ H_T′)
    expect(acq).toBe(200_000_000);
    expect(r.result!.transferGain).toBe(300_000_000 - acq - Math.floor(acq * 0.03));
    // 기준시가 비례 양도가액이면 base = 환산취득가액 × 취득 당시 건물 비율(B_acq ÷ H) — 가산세 base 가 자산 전체 환산취득가액의 건물 몫
    expect(r.result!.penaltyBase).toBe(Math.floor((acq * 75_000_000) / 200_000_000));
  });

  it("공매: detail 분모(3억) = echo.transferHousing", async () => {
    const r = await call(single(AUCTION));
    OK(r);
    expect(r.result!.auctionValuationDetail!.denominator).toBe(300_000_000);
    expect(echoOf(r).housingSplit!.transferHousing).toBe(300_000_000);
  });

  it("경계: 보상액 399,999,999 → H_T′ 399,999,999 (분모 한 칸 차이도 echo 가 따라간다) · 건물분 160,000,000 → 같은 base", async () => {
    const r = await call(single({ transferCause: "public_expropriation", housingCompensationTotal: 399_999_999, housingCompensationBasisTotal: 400_000_000 }));
    OK(r);
    expect(r.result!.housingExpropriationValuationDetail!.denominator).toBe(399_999_999);
    expect(echoOf(r).housingSplit).toMatchObject({ transferHousing: 399_999_999, transferBuilding: 160_000_000 });
    expect(r.result!.penaltyBase).toBe(56_250_000);
  });
});

describe("DP-4 불변 — 분모가 바뀌지 않거나 가산세가 붙지 않는 셀은 종전과 같다", () => {
  it("특례 없음(대조군): 56,250,000 / 2,812,500 / 36,152,050 · echo 에 특례 필드가 없다 (응답 바이트 동일)", async () => {
    const r = await call(single());
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 56_250_000, penaltyTax: 2_812_500, totalTax: 36_152_050 });
    expect(echoOf(r).housingSplit).toEqual({ acquisitionBuilding: 75_000_000, transferBuilding: 160_000_000, saleBuilding: 120_000_000 });
  });

  it("특례 불발(보상 5억/5억 ≥ H_T): 수치는 그대로(S=10억 187,500,000 / 9,375,000 / 180,649,700) · echo 는 특례 detail 이 있으므로 싣는다(본인 신축 Q-7 과 같은 규칙)", async () => {
    const r = await call(single({ ...EXPR_MISS, transferPrice: 1_000_000_000 }));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000, totalTax: 180_649_700 });
    expect(echoOf(r).housingSplit).toMatchObject({ transferBuilding: 160_000_000, transferHousing: 400_000_000, sec164_9: { kind: "expropriation", standardHousing: 400_000_000 } });
  });

  it("보상액 = H_T 정확히: 분모 불변 → 56,250,000", async () => {
    const r = await call(single({ transferCause: "public_expropriation", housingCompensationTotal: 400_000_000, housingCompensationBasisTotal: 400_000_000 }));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 56_250_000, totalTax: 36_152_050 });
    expect(echoOf(r).housingSplit!.transferHousing).toBe(400_000_000);
  });

  it("수용인데 보상액 미입력: 특례가 발동하지 않는다 — 56,250,000 · echo 에 특례 필드 없음 (자동 합성 없음)", async () => {
    const r = await call(single({ transferCause: "public_expropriation" }));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 56_250_000, totalTax: 36_152_050 });
    expect(echoOf(r).housingSplit!.sec164_9).toBeUndefined();
    expect(echoOf(r).housingSplit!.transferHousing).toBeUndefined();
  });

  it("②3호 B 채택(증여 당시 평가액이 낮다): 가산세 0 · 총납부 현행 — 특례와 무관", async () => {
    const r = await call(single(EXPR, { giftDateValuation: 200_000_000 }));
    OK(r);
    expect(r.result!.penaltyTax).toBe(0);
    expect(echoOf(r)).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("5년 경과: 가산세 0 · outside_penalty_window", async () => {
    const r = await call(single({ ...EXPR, transferDate: "2027-01-11" }));
    OK(r);
    expect(r.result!.penaltyTax).toBe(0);
    expect(echoOf(r)).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });

  it("최상위 환산 OFF(A 입력이 환산하지 않는다): 분모가 없으므로 특례도 없다 — 56,250,000 그대로", async () => {
    const r = await call(single({ ...EXPR, useEstimatedAcquisition: false }));
    OK(r);
    expect(r.result!.penaltyBase).toBe(56_250_000);
    expect(echoOf(r).housingSplit!.sec164_9).toBeUndefined();
  });

  it("donorBuilt 없는 이월과세: 가산세 0 · donor echo 없음 (특례만으로 가산세가 생기지 않는다)", async () => {
    const r = await call({ ...single(EXPR), carryoverTaxation: CT });
    OK(r);
    expect(r.result!.penaltyTax).toBe(0);
    expect(r.result!.carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
  });
});

describe("DP-4b 고지 — 「확인 필요」 는 한 번만 (본인 신축 E2E SB-10 과 같은 규칙) · 특례 없는 셀은 종전 문장", () => {
  const confirm = (s: string) => s.split("확인 필요").length - 1;
  it("특례 적용 셀: 특례 문장 포함 · 확인 필요 1회", async () => {
    const r = await call(single(EXPR));
    const w = r.result!.warnings!.find((x) => x.includes("증여자가 신축·증축한 건물에"))!;
    expect(w).toContain("소득세법 시행령 §164⑨ 1호 공익수용 특례에 따른 금액을 같은 비율로 나누었습니다");
    expect(confirm(w)).toBe(1);
    const a = await call(single(AUCTION));
    expect(a.result!.warnings!.find((x) => x.includes("증여자가 신축·증축한 건물에"))).toContain("소득세법 시행령 §164⑨ 2호 공매·경락 특례");
  });
  it("특례 없는 셀: 종전 고지 그대로(특례 문장 없음) · 확인 필요 1회", async () => {
    const r = await call(single());
    const w = r.result!.warnings!.find((x) => x.includes("증여자가 신축·증축한 건물에"))!;
    expect(w).not.toContain("§164⑨");
    expect(confirm(w)).toBe(1);
  });
});

describe("DP-5 함께 양도(컴패니언) — ⑭ 가 §164⑨ 키를 엔진에 싣고 같은 leaf 가 정렬한다", () => {
  const primary = {
    ...COMMON,
    propertyType: "housing",
    transferPrice: 500_000_000,
    totalSalePrice: 1_000_000_000,
    transferDate: "2026-03-01",
    acquisitionPrice: 100_000_000,
    acquisitionDate: "2015-03-01",
    expenses: 0,
    useEstimatedAcquisition: false,
    standardPriceAtTransferForApportion: 400_000_000,
    bundledSaleMode: "apportioned",
  };
  const companion = (over: object = {}, ctOver: object = {}) => ({
    assetId: "c1",
    assetLabel: "함께 양도 주택",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    donorAcquisitionDate: "2022-01-10",
    directExpenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    standardPriceAtTransferForApportion: 400_000_000,
    carryoverTaxation: { ...CT, ...ctOver, donorBuilt: { ...DB_NEW, housing: HOUSING } },
    ...over,
  });
  const run = (over: object, ctOver: object = {}) => call({ ...primary, companionAssets: [companion(over, ctOver)] });

  it("수용: 배분 양도가 5억 → 건물분 125,000,000 / 6,250,000 · 총납부 179,558,866 (종전 93,750,000 / 4,687,500 / 177,840,116)", async () => {
    const r = await run(EXPR);
    OK(r);
    expect(r.props![1]).toMatchObject({ penaltyBase: 125_000_000, penaltyTax: 6_250_000 });
    expect(r.totalTax).toBe(179_558_866);
    expect(r.props![1].carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit).toMatchObject({ transferBuilding: 120_000_000, transferHousing: 300_000_000, sec164_9: { kind: "expropriation" } });
  });
  it("공매: 같은 값 · 2호 echo", async () => {
    const r = await run(AUCTION);
    OK(r);
    expect(r.props![1]).toMatchObject({ penaltyBase: 125_000_000, penaltyTax: 6_250_000 });
    expect(r.props![1].carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit!.sec164_9!.kind).toBe("auction");
  });
  it("불발·특례 없음: 93,750,000 / 4,687,500 그대로 · ②3호 B 채택은 가산세 0", async () => {
    const miss = await run(EXPR_MISS);
    OK(miss);
    expect(miss.props![1]).toMatchObject({ penaltyBase: 93_750_000, penaltyTax: 4_687_500 });
    expect(miss.totalTax).toBe(212_321_010);
    const none = await run({});
    expect(none.props![1].carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit!.sec164_9).toBeUndefined();
    expect(none.props![1].penaltyBase).toBe(93_750_000);
    const b = await run(EXPR, { giftDateValuation: 200_000_000 });
    expect(b.props![1].penaltyTax).toBe(0);
  });
});

describe("DP-6 범위 밖 고정 — 비주택 건물 단독 신축은 이번 PR 이 건드리지 않는다 (확인 필요: 같은 부류의 분모 불일치 — 보고서 참조)", () => {
  it("비주택 건물 × 공매: 가산세 base 가 종전 150,000,000 그대로", async () => {
    const r = await call({
      ...single({ ...AUCTION, auctionPrice: 200_000_000 }),
      propertyType: "building",
      carryoverTaxation: { ...CT, donorBuilt: DB_NEW },
    });
    OK(r);
    expect(r.result!.penaltyBase).toBe(150_000_000);
    expect(r.result!.carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit).toBeUndefined();
  });
});
