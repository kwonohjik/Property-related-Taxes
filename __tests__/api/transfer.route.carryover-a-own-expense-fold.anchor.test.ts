/**
 * anchor — 이월과세(§97의2) 시나리오 A 에서 양도자 **본인** 필요경비(`expenses` 스칼라)가 소실되는 결함 (PR-1, 엔진 접기 E-1).
 *
 * 계획서 `docs/00-pm/gb-estimated-carryover-scenario-a-capex.plan.md` §2.6·§6.2·§8.1.
 *
 * ## 결함
 * 이월과세 엔진 A 입력은 `capitalExpenditure`를 **항상 숫자로 선언**(`effectiveCapex`)한다. 그러면 `calcNecessaryExpense`가
 * legacy `expenses` 스칼라를 읽지 않는다(`swapEligible` → `directSide`). 함께양도(일괄) 자산은 본인 필요경비(자산별 `directExpenses` +
 * 공통 양도비 가액 비례 몫)를 `expenses`로만 싣고, legacy 단건 `directExpenses`도 같은 모양이라 **시나리오 A 에서만** 통째로 버려졌다
 * (시나리오 B 는 반영 → 같은 경제 사실이 입력 채널만 달라도 A 만 갈렸다).
 *
 * ## 법령
 * 「소득세법」 제97조의2 제1항 본문 「필요경비는 제97조제2항에 따르되」 · 제2호 「…증여자가 지출한 금액을 포함한다」(= 더하는 문언, 대체 아님).
 * 본인 지출을 빼라는 문언이 없다.
 *
 * ## 수정 모양 (`transfer-tax-carryover.ts` — Step 4b)
 * 본인이 `capitalExpenditure`/`transferExpense`를 **선언하지 않았고** 일반건물 카드 표지(`usedEstimatedAcquisition`)가 없으면 `expenses`를
 * 본인 나목에 접는다. 일반건물 카드는 `expenses`가 개산공제·swap 나목이 섞인 스칼라라 접을 수 없다 → 후속 PR-2(카드별 본인 나목 명시).
 *
 * ## 손계산 (독립 검증, 엔진 값을 쓰지 않음)
 * 컴패니언 양도가액 = 1,800,000,000 × 400,000,000 / 1,400,000,000 = 514,285,714 (내림).
 * 공통 양도비 20,000,000 의 컴패니언 몫 = 20,000,000 × 514,285,714 / 1,800,000,000 = 5,714,285.7 → 5,714,286.
 * A 양도차익 = 514,285,714 − 증여자 취득가액 100,000,000 − 증여세 상당액 30,000,000 − 본인 양도비 5,714,286 = 378,571,428.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const PRIMARY_LAND = {
  propertyType: "land",
  transferPrice: 1_800_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 500_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: 1_800_000_000,
  standardPriceAtTransferForApportion: 1_000_000_000,
};

/** 증여자 취득 2005-01-01 → 2021-06-01 증여 → 2024-03-01 양도 (배우자, 생존) */
const CT = {
  giftRegistryDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 300_000_000,
  donorRelation: "spouse" as const,
  exclusionDeclared: {},
};

const COMPANION = {
  assetId: "c1",
  assetLabel: "이월과세 주택",
  assetKind: "housing" as const,
  standardPriceAtTransfer: 400_000_000,
  standardPriceAtTransferForApportion: 400_000_000,
  directExpenses: 0,
  isOneHousehold: false,
  reductions: [] as unknown[],
  acquisitionCause: "carryover_gift" as const,
  acquisitionDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  carryoverTaxation: CT,
};

/** 단건(legacy) — 컴패니언 몫과 같은 양도가액 */
const SINGLE = {
  propertyType: "housing",
  transferPrice: 514_285_714,
  transferDate: "2024-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2021-06-01",
  acquisitionCause: "carryover_gift",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  carryoverTaxation: CT,
};

type Breakdown = {
  propertyId: string;
  transferPrice: number;
  acquisitionPrice: number;
  necessaryExpense: number;
  transferGain: number;
  determinedTax: number;
};

async function run(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
async function companionOf(body: object): Promise<Breakdown> {
  const { status, json } = await run(body);
  expect(status).toBe(200);
  return (json.data.aggregated.properties as Breakdown[]).find((p) => p.propertyId === "c1")!;
}

describe("이월과세 A — 본인 필요경비 접기 (PR-1, 함께양도·legacy)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("FOLD-0 대조군: 본인 지출 0 → 컴패니언 A 양도차익 384,285,714 (수정 前후 불변)", async () => {
    const c = await companionOf({ ...PRIMARY_LAND, companionAssets: [COMPANION] });
    expect(c.transferGain).toBe(384_285_714);
    expect(c.necessaryExpense).toBe(30_000_000);
  });

  it("FOLD-1 공통 양도비 20,000,000 → 컴패니언 몫 5,714,286 이 A 필요경비에 들어간다", async () => {
    const c = await companionOf({ ...PRIMARY_LAND, commonTransferExpense: 20_000_000, companionAssets: [COMPANION] });
    expect(c.necessaryExpense).toBe(30_000_000 + 5_714_286);
    expect(c.transferGain).toBe(378_571_428);
    expect(c.transferPrice - c.acquisitionPrice - c.necessaryExpense).toBe(c.transferGain);
    // 계획서 V-4 — 신고서 항등식(양도비 = 필요경비 − 자본적지출)은 접힌 본인 지출에도 성립한다: 자본적지출 표시칸은 0 으로 남고 35,714,286 전액이 필요경비 칸이다.
    expect((c as Breakdown & { capitalExpenditureForDisplay?: number }).capitalExpenditureForDisplay ?? 0).toBe(0);
  });

  it("FOLD-2 공통 양도비 100,000,000 → 몫 28,571,429", async () => {
    const c = await companionOf({ ...PRIMARY_LAND, commonTransferExpense: 100_000_000, companionAssets: [COMPANION] });
    expect(c.necessaryExpense).toBe(30_000_000 + 28_571_429);
    expect(c.transferGain).toBe(355_714_285);
  });

  it("FOLD-3 컴패니언 directExpenses(legacy) 20,000,000 → A 필요경비에 그대로", async () => {
    const c = await companionOf({ ...PRIMARY_LAND, companionAssets: [{ ...COMPANION, directExpenses: 20_000_000 }] });
    expect(c.necessaryExpense).toBe(30_000_000 + 20_000_000);
    expect(c.transferGain).toBe(364_285_714);
  });

  it("FOLD-4 legacy 단건 expenses 10,000,000 → A 양도차익 374,285,714", async () => {
    const { status, json } = await run({ ...SINGLE, expenses: 10_000_000 });
    expect(status).toBe(200);
    const r = json.data.result;
    expect(r.carryoverTaxationDetail.adoptedScenario).toBe("A");
    // 514,285,714 − 100,000,000 − 30,000,000 − 10,000,000
    expect(r.transferGain).toBe(374_285_714);
  });

  it("FOLD-5 대조군: 본인이 capitalExpenditure 를 선언하면 이중 계상하지 않는다 (선언 채널 우선)", async () => {
    // 선언 + legacy expenses 동시 입력 — 접기는 선언이 없을 때만. 선언 10,000,000 만 반영된다.
    const { json } = await run({ ...SINGLE, capitalExpenditure: 10_000_000, expenses: 10_000_000 });
    expect(json.data.result.transferGain).toBe(374_285_714);
  });

  it("FOLD-6 증여세 상당액 한도(령 §163의2②)는 본인 지출 반영 후 양도차익이 캡이다", async () => {
    // 한도 = 양도가액 − 증여자 취득가액 − 본인 지출 = 514,285,714 − 100,000,000 − 400,000,000 = 14,285,714 < 증여세 30,000,000
    const { json } = await run({ ...SINGLE, expenses: 400_000_000 });
    const a = json.data.result.carryoverTaxationDetail.scenarioA;
    expect(a.giftTaxLimitCap).toBe(14_285_714);
    expect(a.giftTaxLimitApplied).toBe(true);
    expect(a.giftTaxAddedToExpense).toBe(14_285_714);
    // 본인 지출 + 한도 후 증여세 = 양도차익 0 (대조: 종전엔 본인 지출이 빠져 한도가 414,285,714로 열려 증여세 30,000,000 전액 산입)
    expect(json.data.result.transferGain).toBe(0);
    // echo 는 종전 의미(수증자 선언 + 증여자 자본적지출)를 지킨다 — 접힌 본인 `expenses`는 섞이지 않는다
    expect(a.effectiveCapex).toBe(0);
  });

  it("FOLD-7 주 자산이 이월과세인 구성 — 공통 양도비 몫 14,285,714 가 주 자산 A 필요경비에 들어간다", async () => {
    const primary = {
      ...SINGLE,
      transferPrice: 1_800_000_000,
      totalSalePrice: 1_800_000_000,
      standardPriceAtTransferForApportion: 1_000_000_000,
    };
    const plainCompanion = {
      assetId: "c1",
      assetLabel: "일반 토지",
      assetKind: "land" as const,
      standardPriceAtTransfer: 400_000_000,
      standardPriceAtTransferForApportion: 400_000_000,
      fixedAcquisitionPrice: 100_000_000,
      acquisitionDate: "2010-01-01",
      acquisitionCause: "purchase" as const,
      directExpenses: 0,
      isOneHousehold: false,
      reductions: [] as unknown[],
    };
    const base = { ...primary, companionAssets: [plainCompanion] };
    const zero = await run(base);
    const withCommon = await run({ ...base, commonTransferExpense: 20_000_000 });
    expect(JSON.stringify(zero.json.error ?? {})).toBe("{}");
    expect(zero.status).toBe(200);
    expect(withCommon.status).toBe(200);
    // 채택(A/B)과 무관하게 시나리오 A 컬럼의 양도차익을 본다 — 이 구성은 B 가 채택된다(계획서 V-7: 결정세액이 아닌 A 양도차익으로만 확인).
    const pOf = (j: { data: { aggregated: { properties: Array<Breakdown & { carryoverTaxationDetail: { scenarioA: { transferGain: number } } }> } } }) => {
      const p = j.data.aggregated.properties.find((x) => x.propertyId === "primary")!;
      return { transferGain: p.carryoverTaxationDetail.scenarioA.transferGain };
    };
    // 1,800,000,000 × 1,000,000,000 / 1,400,000,000 = 1,285,714,285.7 → 1,285,714,286 − 증여자 100,000,000 − 증여세 30,000,000
    expect(pOf(zero.json).transferGain).toBe(1_155_714_286);
    // 20,000,000 × 1,285,714,286 / 1,800,000,000 = 14,285,714.3 → 14,285,714
    expect(pOf(withCommon.json).transferGain).toBe(1_155_714_286 - 14_285_714);
  });
});
