/**
 * anchor — 일체 주택 본인 신축 × §114조의2 가산세 base 를 건물분으로 · API 경로 (⑫ Zod · ⑭ route 매핑) — Q-12 PR-1
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7 ⑫⑭ · §9 Pre-Do anchor 8·9)
 *
 * 침묵 strip 방지가 이 파일의 존재 이유다 — ⑫ 에 없는 키는 400 이 아니라 200 + 종전 base 로 조용히 사라진다(TS 미감지).
 *  · RS-1 단건 인라인 shape(⑫)·route 매핑(⑭ `engine-input.ts`)을 지나 엔진에 닿는다 — 환산 187,500,000 / 감정 직접 1.1억
 *  · RS-2 함께 양도(컴패니언) — ⑫ 컴패니언 shape · ⑭ `bundled-split-helpers.ts` (키 커버리지 가드와 짝)
 *  · RS-3 다건 합산 — ⑫ `propertyItemSchema`(= 단건 base shape 공유) · ⑭ `multi/route.ts` (키 분류 가드와 짝)
 *  · RS-4 ⑫ 거부 — 받아 놓고 무시하면 침묵 오답이다(비주택·본인 신축 아님·이월과세·분리·PHD·증축·부담부증여)
 *  · RS-5 selfBuiltHousing 을 보내지 않은 요청은 400 — 엄격화(PR-4 · Q-2). 영 §164⑨ 공익수용 결합만 종전 base(자산 전체) 그대로 + 확인 필요
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const SB = {
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
const SINGLE = {
  ...COMMON,
  propertyType: "housing",
  transferPrice: 1_000_000_000,
  transferDate: "2026-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2022-01-10",
  expenses: 0,
  acquisitionCause: "purchase",
  useEstimatedAcquisition: true,
  acquisitionMethod: "estimated",
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 400_000_000,
  isSelfBuilt: true,
  buildingType: "new",
  constructionDate: "2022-01-10",
};
const APPRAISAL = { useEstimatedAcquisition: false, acquisitionMethod: "appraisal", appraisalValue: 300_000_000 };

interface Res {
  status: number;
  error?: unknown;
  result?: { penaltyBase: number; penaltyTax: number; totalTax: number; selfBuiltHousingPenalty?: { base: number } };
  data?: Record<string, unknown>;
}
async function post(b: object, route: typeof POST = POST, url = "http://localhost/api/calc/transfer"): Promise<Res> {
  const res = await route(
    new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }),
  );
  const json = (await res.json()) as { data?: Record<string, unknown> & { result?: Res["result"] }; error?: unknown };
  return { status: res.status, error: json.error, result: json.data?.result, data: json.data };
}

const fieldErrorsOf = (r: Res) => (r.error as { fieldErrors?: unknown } | undefined)?.fieldErrors;
/** PR-4 — 입력 부재는 엔진이 던져 400(INVALID_INPUT)이다: 메시지가 무엇을 보내야 하는지 알려준다 */
const expectAbsent400 = (r: Res) => {
  expect(r.status).toBe(400);
  expect(JSON.stringify(r.error)).toContain("selfBuiltHousing");
};
/** 영 §164⑨ 공익수용 결합 — 건물분 base 를 지원하지 않아 자산 전체 base 를 유지한다(PR-1~3 의 «없으면» 수치를 보존) */
// 보상액·보상기초가 양도 당시 주택공시가격(4억) 이상이라 min[] 이 분모를 바꾸지 않는다 — ⑫ 가 수용 보상액을 필수로 요구하므로 채운다
const EXPR = { transferCause: "public_expropriation", housingCompensationTotal: 500_000_000, housingCompensationBasisTotal: 500_000_000 };

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("RS-1 단건 — ⑫·⑭ 를 지나 엔진에 닿는다 (strip 이면 종전 base)", () => {
  it("환산: base 187,500,000 · 가산세 9,375,000 · 총납부 180,649,700 (없으면 400 · 공익수용 결합은 500,000,000 / 25,000,000 / 197,837,200)", async () => {
    const on = await post({ ...SINGLE, selfBuiltHousing: SB });
    expect(on.status, JSON.stringify(on.error)).toBe(200);
    expect(on.result).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000, totalTax: 180_649_700 });
    expect(on.result?.selfBuiltHousingPenalty).toMatchObject({ base: 187_500_000 });
    expectAbsent400(await post(SINGLE));
    const off = await post({ ...SINGLE, ...EXPR });
    expect(off.status, JSON.stringify(off.error)).toBe(200);
    expect(off.result).toMatchObject({ penaltyBase: 500_000_000, penaltyTax: 25_000_000, totalTax: 197_837_200 });
    expect(off.result?.selfBuiltHousingPenalty).toBeUndefined();
  });

  it("구분 기재(sale) 와이어도 닿는다 — 토지 7억/건물 3억 → 140,625,000", async () => {
    const r = await post({ ...SINGLE, selfBuiltHousing: { ...SB, sale: { landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 } } });
    expect(r.result?.penaltyBase).toBe(140_625_000);
  });

  it("감정: 건물 감정가액 직접 1.1억 → 5,500,000 / 비례 → 5,625,000 (없으면 400 · 공익수용 결합은 15,000,000)", async () => {
    const direct = await post({ ...SINGLE, ...APPRAISAL, selfBuiltHousing: { buildingAppraisalValue: 110_000_000 } });
    expect(direct.result).toMatchObject({ penaltyBase: 110_000_000, penaltyTax: 5_500_000 });
    const ratio = await post({
      ...SINGLE,
      ...APPRAISAL,
      selfBuiltHousing: { landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 },
    });
    expect(ratio.result).toMatchObject({ penaltyBase: 112_500_000, penaltyTax: 5_625_000 });
    expectAbsent400(await post({ ...SINGLE, ...APPRAISAL }));
    const off = await post({ ...SINGLE, ...APPRAISAL, ...EXPR });
    expect(off.result).toMatchObject({ penaltyBase: 300_000_000, penaltyTax: 15_000_000 });
  });

  it("양도차손도 닿는다 — 총납부 10,312,500 (없으면 400 · 공익수용 결합은 27,500,000)", async () => {
    const on = await post({ ...SINGLE, capitalExpenditure: 1_200_000_000, selfBuiltHousing: SB });
    expect(on.result).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000, totalTax: 10_312_500 });
    expectAbsent400(await post({ ...SINGLE, capitalExpenditure: 1_200_000_000 }));
    const off = await post({ ...SINGLE, ...EXPR, capitalExpenditure: 1_200_000_000 });
    expect(off.result?.totalTax).toBe(27_500_000);
  });

  it("게이트가 닫힌 조합(5년 경과)은 키를 받고도 가산세 0 — 필수 칸이 비어 있어도 요구하지 않는다", async () => {
    const r = await post({ ...SINGLE, transferDate: "2027-01-11", selfBuiltHousing: {} });
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.result?.penaltyTax).toBe(0);
  });
});

describe("RS-2 함께 양도(컴패니언) — ⑫ 컴패니언 shape · ⑭ bundled-split-helpers", () => {
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
  const companion = (over: object = {}) => ({
    assetId: "c1",
    assetLabel: "함께 양도 주택",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2022-01-10",
    directExpenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    standardPriceAtTransferForApportion: 400_000_000,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: "2022-01-10",
    ...over,
  });
  type Props = { propertyId?: string; penaltyBase: number; penaltyTax: number }[];
  const props = async (b: object) => {
    const r = await post(b);
    return { status: r.status, error: r.error, p: ((r.data?.aggregated as { properties?: Props } | undefined)?.properties ?? []) as Props };
  };

  it("환산 컴패니언: 건물분 93,750,000 / 4,687,500 (없으면 400 — 키 strip 이면 종전 값이 아니라 400 으로 드러난다 · 공익수용 결합은 전체 base 250,000,000)", async () => {
    const absent = await props({ ...primary, companionAssets: [companion()] });
    expect(absent.status).toBe(400);
    expect(JSON.stringify(absent.error)).toContain("selfBuiltHousing");
    const off = await props({ ...primary, companionAssets: [companion(EXPR)] });
    expect(off.status, JSON.stringify(off.error)).toBe(200);
    expect(off.p[1].penaltyBase).toBe(250_000_000); // 종전: 배분 양도가 5억 × 200,000,000 ÷ 400,000,000
    const on = await props({ ...primary, companionAssets: [companion({ selfBuiltHousing: SB })] });
    expect(on.status, JSON.stringify(on.error)).toBe(200);
    expect(on.p[1].penaltyBase).toBe(93_750_000);
    expect(on.p[1].penaltyTax).toBe(4_687_500);
    expect(on.p[0].penaltyTax).toBe(0);
  });

  it("감정 컴패니언: 건물 감정가액 직접 → 그 값 · 비례 → 총액 × N/(L+N)", async () => {
    const ap = { useEstimatedAcquisition: false, acquisitionMethod: "appraisal", fixedAcquisitionPrice: 300_000_000 };
    const direct = await props({ ...primary, companionAssets: [companion({ ...ap, selfBuiltHousing: { buildingAppraisalValue: 110_000_000 } })] });
    expect(direct.p[1]).toMatchObject({ penaltyBase: 110_000_000, penaltyTax: 5_500_000 });
    const ratio = await props({
      ...primary,
      companionAssets: [companion({ ...ap, selfBuiltHousing: { landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 } })],
    });
    expect(ratio.p[1]).toMatchObject({ penaltyBase: 112_500_000, penaltyTax: 5_625_000 });
    expect((await props({ ...primary, companionAssets: [companion(ap)] })).status).toBe(400);
    const off = await props({ ...primary, companionAssets: [companion({ ...ap, ...EXPR })] });
    expect(off.p[1]).toMatchObject({ penaltyBase: 300_000_000, penaltyTax: 15_000_000 });
  });
});

describe("RS-3 다건 합산 — ⑭ multi/route.ts 매핑", () => {
  const item = (over: object = {}) => ({
    propertyId: "a1",
    propertyLabel: "a1",
    ...SINGLE,
    ...over,
  });
  const call = (properties: object[]) => post({ taxYear: 2026, annualBasicDeductionUsed: 0, properties }, MULTI, "http://localhost/api/calc/transfer/multi");
  type Props = { penaltyBase: number; penaltyTax: number }[];

  it("환산: 187,500,000 / 9,375,000 (없으면 400 · 공익수용 결합은 500,000,000 / 25,000,000)", async () => {
    const on = await call([item({ selfBuiltHousing: SB })]);
    expect(on.status, JSON.stringify(on.error)).toBe(200);
    const p = (on.data as { properties?: Props }).properties!;
    expect(p[0]).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000 });
    expectAbsent400(await call([item()]));
    const off = await call([item(EXPR)]);
    expect((off.data as { properties?: Props }).properties![0]).toMatchObject({ penaltyBase: 500_000_000, penaltyTax: 25_000_000 });
  });

  it("감정 직접 1.1억 → 5,500,000", async () => {
    const on = await call([item({ ...APPRAISAL, selfBuiltHousing: { buildingAppraisalValue: 110_000_000 } })]);
    expect((on.data as { properties?: Props }).properties![0]).toMatchObject({ penaltyBase: 110_000_000, penaltyTax: 5_500_000 });
  });
});

describe("RS-4 ⑫ 거부 — 받아 놓고 무시하지 않는다 (400)", () => {
  it.each([
    ["비주택 건물", () => ({ ...SINGLE, propertyType: "building", selfBuiltHousing: SB })],
    ["본인 신축 아님", () => ({ ...SINGLE, isSelfBuilt: false, selfBuiltHousing: SB })],
    ["취득원인이 이월과세", () => ({ ...SINGLE, acquisitionCause: "carryover_gift", selfBuiltHousing: SB })],
    ["취득원인이 상속", () => ({ ...SINGLE, acquisitionCause: "inheritance", selfBuiltHousing: SB })],
    ["토지·건물 취득일 분리", () => ({ ...SINGLE, landAcquisitionDate: "2015-05-01", selfBuiltHousing: SB })],
    ["소유자 분리(건물만 소유)", () => ({ ...SINGLE, landAcquisitionDate: "2015-05-01", selfOwns: "building_only", selfBuiltHousing: SB })],
    ["소유자 분리(selfOwns 만)", () => ({ ...SINGLE, selfOwns: "building_only", selfBuiltHousing: SB })],
    ["별개 취득(isSeparateAcquisition)", () => ({ ...SINGLE, isSeparateAcquisition: true, selfBuiltHousing: SB })],
    ["PHD(최초공시 전)", () => ({ ...SINGLE, preHousingDisclosure: { firstDisclosureDate: "2015-04-30", firstDisclosureHousingPrice: 486_000_000, landArea: 212, landPricePerSqmAtAcquisition: 2_360_000, buildingStdPriceAtAcquisition: 220_890_540, landPricePerSqmAtFirstDisclosure: 2_369_000, buildingStdPriceAtFirstDisclosure: 220_725_560, transferHousingPrice: 627_000_000, landPricePerSqmAtTransfer: 3_486_000, buildingStdPriceAtTransfer: 252_871_000 }, selfBuiltHousing: SB })],
    ["증축", () => ({ ...SINGLE, buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000, selfBuiltHousing: SB })],
    ["부담부증여", () => ({ ...SINGLE, transferType: "burdened_gift", selfBuiltHousing: SB })],
    ["알 수 없는 키(.strict)", () => ({ ...SINGLE, selfBuiltHousing: { ...SB, bogus: 1 } })],
    ["음수 기준시가", () => ({ ...SINGLE, selfBuiltHousing: { ...SB, buildingStdPriceAtAcquisition: -1 } })],
  ])("%s", async (_label, make) => {
    const r = await post(make());
    expect(r.status).toBe(400);
    // 다른 refine·엔진이 우연히 막은 것이 아니라 ⑫(Zod fieldErrors)가 이 입력(selfBuiltHousing)을 사유로 막아야 한다
    expect(JSON.stringify(fieldErrorsOf(r))).toContain("selfBuiltHousing");
  });

  it("컴패니언: 비주택·본인 신축 아님·이월과세 컴패니언에 보내면 400", async () => {
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
    const c = {
      assetId: "c1",
      assetLabel: "c",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2022-01-10",
      directExpenses: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      standardPriceAtTransferForApportion: 400_000_000,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: "2022-01-10",
      selfBuiltHousing: SB,
    };
    expect((await post({ ...primary, companionAssets: [c] })).status).toBe(200);
    for (const bad of [{ assetKind: "land" }, { isSelfBuilt: false }, { buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 1_000_000 }, { landAcquisitionDate: "2015-05-01" }]) {
      const r = await post({ ...primary, companionAssets: [{ ...c, ...bad }] });
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(JSON.stringify(fieldErrorsOf(r)), JSON.stringify(bad)).toContain("selfBuiltHousing");
    }
  });

  it("다건 합산도 같은 거부 규칙을 탄다 (비주택)", async () => {
    const r = await post(
      { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [{ propertyId: "a", propertyLabel: "a", ...SINGLE, propertyType: "building", selfBuiltHousing: SB }] },
      MULTI,
      "http://localhost/api/calc/transfer/multi",
    );
    expect(r.status).toBe(400);
    expect(JSON.stringify(fieldErrorsOf(r))).toContain("selfBuiltHousing");
  });
});
