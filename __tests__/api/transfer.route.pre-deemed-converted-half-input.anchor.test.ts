/**
 * 의제취득일(1985.1.1.) 전 상속·증여 ③ 반쪽 입력 — 폼 → ⑧ → ④ → ⑫ → Route 전 구간
 * (계획서 `docs/02-design/features/pre-deemed-converted-half-input.plan.md` · F3 · F4).
 *
 * F3: 주택 §164⑦ 3시점에서 분자를 직접 넣고 분모는 자동값(양도 당시 개별주택가격)이면 엔진이 분모를 잃어 ③ 0이었다.
 * F4: ①·②가 있으면 ⑧ PD-1·⑫가 일찍 돌아가 분자만 있는 ③이 조용히 비교에서 빠졌다. 분모만 있는 것은 막지 않는다(Q-2).
 *
 * 시료: 1980-03-01 증여(또는 상속) · 2023-02-16 양도 · ① 1억 · mock 세율.
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const T = 920_000_000;
const STD_T = 1_243_350_000;
/** 이 계획의 ⑧·⑫ 문구 — 기존 PD-1(「…환산에는 양도시 기준시가가 필요합니다」)과 구별된다 */
const F4_MSG = /환산취득가액도 비교합니다 — 의제취득일 기준시가가 있으면 양도시 기준시가도/;

const GIFT_LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "gift",
  acquisitionDate: "1980-03-01",
  donorAcquisitionDate: "1975-01-01",
  fixedAcquisitionPrice: "100000000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  standardPriceAtAcq: "202620000",
  standardPriceAtTransfer: String(STD_T),
  actualSalePrice: String(T),
};
const LAND_GRADES = {
  pre1990GradeMode: "number" as const,
  pre1990Grade_atAcq: "200",
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990PricePerSqm_1990: "1100000",
};
/** 증여 단독주택 · §164⑦ 3시점(자동 분자 139,608,000) · 양도 당시 개별주택가격 4억(= 자동 분모) */
const HOUSE: Partial<AssetForm> = {
  assetKind: "housing",
  addressJibun: "서울 강남구 역삼동 2",
  acquisitionCause: "gift",
  acquisitionDate: "1980-03-01",
  donorAcquisitionDate: "1975-01-01",
  fixedAcquisitionPrice: "100000000",
  acquisitionArea: "100",
  transferArea: "100",
  actualSalePrice: String(T),
  standardPriceAtAcq: "",
  standardPriceAtTransfer: "",
  inhHouseValEnabled: true,
  inhHouseValLandArea: "100",
  inhHouseValLandPricePerSqmAtInheritance: "500000",
  inhHouseValBuildingStdPriceAtInheritance: "10000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValBuildingStdPriceAtFirst: "20000000",
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValHousePriceAtTransfer: "400000000",
  inhHouseValLandPricePerSqmAtTransfer: "2000000",
  ...LAND_GRADES,
} as Partial<AssetForm>;
const INHERITED = {
  acquisitionCause: "inheritance",
  inheritanceStartDate: "1980-03-01",
  publishedValueAtInheritance: "100000000",
  decedentAcquisitionDate: "1975-01-01",
} as Partial<AssetForm>;
/** 분자 직접 입력 2억 — 분모 칸은 자동값(4억)으로 잠긴 채 보인다 */
const NUM_OVERRIDE = { useStandardPriceAtAcqOverride: true, standardPriceAtAcq: "200000000" } as Partial<AssetForm>;
const PRICE_20 = { actualSalePrice: "2000000000" } as Partial<AssetForm>;
/** 1983 상속 토지 · 부담부증여 시가 평가(3자 max) */
const BG_MARKET_LAND = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  publishedValueAtInheritance: "100000000",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "920000000",
  standardPriceAtTransfer: String(STD_T),
  standardPriceAtAcq: "202620000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  landNature: "standalone",
} as Partial<AssetForm>;
const PURCHASE_LAND = {
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "150000000",
  actualSalePrice: "300000000",
} as Partial<AssetForm>;

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(assets: AssetForm[], contract = T): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2023-02-16";
  f.filingDate = "2023-04-30";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return f;
}
function companionForm(card: AssetForm): TransferFormData {
  const f = form([asset(1, PURCHASE_LAND), card], T + 300_000_000);
  f.assetSplitMode = "companion" as never;
  f.bundledSaleMode = "actual";
  return f;
}

async function run(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  return { status: res.status, json, body, issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)) };
}
type Breakdown = { reportedAmount: number | null; sec164Amount: number | null; convertedAmount: number; selectedMethod: string };
const breakdownOf = (r: Awaited<ReturnType<typeof run>>) =>
  r.json.data.result.inheritedAcquisitionDetail.preDeemedBreakdown as Breakdown;
/** 함께 양도 응답 어디에 있든 `preDeemedBreakdown`을 모은다 */
function breakdownsIn(v: unknown, out: Breakdown[] = []): Breakdown[] {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.preDeemedBreakdown) out.push(o.preDeemedBreakdown as Breakdown);
    for (const x of Object.values(o)) if (x && typeof x === "object" && x !== o.preDeemedBreakdown) breakdownsIn(x, out);
  }
  return out;
}
const f4Issues = (r: Awaited<ReturnType<typeof run>>) => r.issues.filter((i) => F4_MSG.test(i.message));
const fieldErrorsOf = (r: Awaited<ReturnType<typeof run>>) => (r.json.error?.fieldErrors ?? {}) as Record<string, string[]>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("E F3 — 주택 분자 직접 입력 + 분모 자동값", () => {
  it("E-1 증여·상속 · 양도 20억 — ③ = 20억 × 2억 ÷ 4억 = 10억 · 결정세액 84,871,600 = 두 칸 직접 입력(2억/4억)과 같다 (종전 ③ 0 · ② 채택 · 181,792,099)", async () => {
    const direct = await run(form([asset(1, HOUSE, PRICE_20, NUM_OVERRIDE, { useStandardPriceAtTransferOverride: true, standardPriceAtTransfer: "400000000" })], 2_000_000_000));
    expect(direct.status, JSON.stringify(direct.json.error)).toBe(200);
    for (const over of [{}, INHERITED]) {
      const r = await run(form([asset(1, HOUSE, PRICE_20, over, NUM_OVERRIDE)], 2_000_000_000));
      expect(r.status, JSON.stringify(r.json.error)).toBe(200);
      expect((r.body.inheritedAcquisition as Record<string, unknown>).standardPriceAtTransfer).toBeUndefined();
      expect(breakdownOf(r)).toMatchObject({ convertedAmount: 1_000_000_000, selectedMethod: "converted" });
      expect(r.json.data.result.determinedTax).toBe(84_871_600);
      expect(r.json.data.result.determinedTax).toBe(direct.json.data.result.determinedTax);
    }
  });

  it("E-2 함께 양도 — 매매 토지 + 증여 주택 카드: ③ 460,000,000 (종전 0)", async () => {
    const r = await run(companionForm(asset(2, HOUSE, NUM_OVERRIDE)));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(breakdownsIn(r.json.data)).toContainEqual(expect.objectContaining({ convertedAmount: 460_000_000, selectedMethod: "converted" }));
  });

  it("E-3 회귀 — 자동/자동 · 자동 분자 + 분모 직접 3억은 그대로", async () => {
    expect(breakdownOf(await run(form([asset(1, HOUSE)]))).convertedAmount).toBe(321_098_400);
    const big = await run(form([asset(1, HOUSE, PRICE_20)], 2_000_000_000));
    expect(breakdownOf(big).convertedAmount).toBe(698_040_000);
    expect(big.json.data.result.determinedTax).toBe(118_410_437);
    const den = await run(form([asset(1, HOUSE, { useStandardPriceAtTransferOverride: true, standardPriceAtTransfer: "300000000" })]));
    expect(breakdownOf(den).convertedAmount).toBe(428_131_200);
  });

  it("D-4 공동주택(고시 가액 없었음 · 첫 가격 1992.1.1.) — 같은 수정이 덮는다: ③ = 9.2억 × 2억 ÷ 5억 = 368,000,000", async () => {
    const apart = asset(1, HOUSE, INHERITED, NUM_OVERRIDE, {
      inheritanceAssetKind: "house_apart",
      addressDong: "101",
      addressHo: "1001",
      inhApartNtsPriceExisted: "no",
      inhApartFirstPriceAgency: "nts",
      inhApartFirstPriceDate: "1992-01-01",
      inhHouseValHousePriceAtTransfer: "500000000",
    } as Partial<AssetForm>);
    const r = await run(form([apart]));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.body.inheritedHouseValuation).toBeDefined();
    expect(breakdownOf(r)).toMatchObject({ convertedAmount: 368_000_000, selectedMethod: "converted" });
  });
});

describe("D F4 — ①·②가 있어도 분자만 있고 분모가 없으면 ⑧·⑫ 차단", () => {
  const rows: Array<[string, () => TransferFormData, string]> = [
    ["L1 증여 토지 · 분자만(종전 200 · ③ 0 · 204,090,000)", () => form([asset(1, GIFT_LAND, { standardPriceAtTransfer: "" })]), "inheritedAcquisition.standardPriceAtTransfer"],
    ["L1i 상속 토지 · 분자만", () => form([asset(1, GIFT_LAND, INHERITED, { standardPriceAtTransfer: "" })]), "inheritedAcquisition.standardPriceAtTransfer"],
    ["L3 증여 토지 · 등급 자동 분자 · 분모 비움", () => form([asset(1, GIFT_LAND, LAND_GRADES, { standardPriceAtAcq: "", standardPriceAtTransfer: "" })]), "inheritedAcquisition.standardPriceAtTransfer"],
    ["H2 증여 주택 · 3시점 자동 분자 · 양도 당시 개별주택가격·분모 비움", () => form([asset(1, HOUSE, { inhHouseValHousePriceAtTransfer: "" })]), "inheritedAcquisition.standardPriceAtTransfer"],
    ["B1 부담부증여 시가 · 상속 토지 · 분자만(종전 88,170,000 · 두 칸 80,721,398)", () => form([asset(1, BG_MARKET_LAND, { standardPriceAtTransfer: "" })]), "inheritedAcquisition.standardPriceAtTransfer"],
    ["C1 함께 양도 · 증여 토지 카드 · 분자만", () => companionForm(asset(2, GIFT_LAND, { standardPriceAtTransfer: "" })), "companionAssets.0.inheritedAcquisition.standardPriceAtTransfer"],
    // 직접 입력 토글을 켜고 분자 칸을 비우면 ④는 싣지 않고 엔진은 자동값(등급 환산)으로 돌아간다 — ⑧도 분자 있음으로 본다(리뷰 게이트 D-2 (a) · 종전 ⑧ 통과 ↔ ⑫ 400)
    ["L3t 증여 토지 · 등급 · 분자 직접 입력 토글 켬 · 빈 칸 · 분모 비움", () => form([asset(1, GIFT_LAND, LAND_GRADES, { useStandardPriceAtAcqOverride: true, standardPriceAtAcq: "", standardPriceAtTransfer: "" } as Partial<AssetForm>)]), "inheritedAcquisition.standardPriceAtTransfer"],
  ];
  for (const [name, mk, path] of rows) {
    it(`D-1 ${name}`, async () => {
      const r = await run(mk());
      expect(f4Issues(r).map((i) => i.field)).toEqual(["standardPriceAtTransfer"]);
      expect(r.status).toBe(400);
      expect(fieldErrorsOf(r)[path]?.join()).toMatch(F4_MSG);
    });
  }

  it("D-2 분모만 있으면 막지 않는다 — 분모 칸은 §167의3 판정·공익수용과 함께 쓴다(Q-2) · ③은 비교하지 않는다", async () => {
    for (const over of [{}, INHERITED]) {
      const r = await run(form([asset(1, GIFT_LAND, over, { standardPriceAtAcq: "" })]));
      expect(f4Issues(r)).toEqual([]);
      expect(r.status, JSON.stringify(r.json.error)).toBe(200);
      expect(breakdownOf(r)).toMatchObject({ convertedAmount: 0, selectedMethod: "reported" });
      expect(r.json.data.result.determinedTax).toBe(204_090_000);
    }
  });

  it("D-2 주택 분모 직접 입력 토글 켬 · 빈 칸 · 양도 당시 개별주택가격 4억 — 엔진이 그 값으로 돌아가므로 막지 않는다(리뷰 게이트 D-2 (b)) · ③ 321,098,400", async () => {
    const r = await run(form([asset(1, HOUSE, { useStandardPriceAtTransferOverride: true, standardPriceAtTransfer: "" } as Partial<AssetForm>)]));
    expect(f4Issues(r)).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(breakdownOf(r)).toMatchObject({ convertedAmount: 321_098_400, selectedMethod: "converted" });
  });

  it("D-2 두 칸 비움 → 통과(③ 비교 안 함) · 두 칸 다 있음 → ③ 149,925,925 · 187,624,669", async () => {
    const empty = await run(form([asset(1, GIFT_LAND, { standardPriceAtAcq: "", standardPriceAtTransfer: "" })]));
    expect(f4Issues(empty)).toEqual([]);
    expect(empty.status).toBe(200);
    const both = await run(form([asset(1, GIFT_LAND)]));
    expect(both.issues).toEqual([]);
    expect(breakdownOf(both).convertedAmount).toBe(149_925_925);
    expect(both.json.data.result.determinedTax).toBe(187_624_669);
  });

  it("D-3 래치 켠 상속 토지 등급 · 분모 비움 — ⑧은 기존 환산 검증 문구 · ⑫는 이 규칙으로 400(종전 200)", async () => {
    const r = await run(form([asset(1, GIFT_LAND, INHERITED, LAND_GRADES, { pre1990Enabled: true, standardPriceAtAcq: "", standardPriceAtTransfer: "" } as Partial<AssetForm>)]));
    expect(f4Issues(r)).toEqual([]);
    expect(r.issues.map((i) => i.message).join()).toMatch(/양도 당시 기준시가를 입력하세요/);
    expect(r.status).toBe(400);
    expect(fieldErrorsOf(r)["inheritedAcquisition.standardPriceAtTransfer"]?.join()).toMatch(F4_MSG);
  });

  it("D-3 ①② 없음 · 선언 · 분자만 — 기존 PD-1 문구 그대로", async () => {
    const r = await run(form([asset(1, GIFT_LAND, INHERITED, { publishedValueAtInheritance: "", preDeemedClauseAUnconfirmed: true, standardPriceAtTransfer: "" } as Partial<AssetForm>)]));
    expect(f4Issues(r)).toEqual([]);
    expect(r.issues.map((i) => i.message).join()).toMatch(/환산에는 양도시 기준시가가 필요합니다/);
    expect(fieldErrorsOf(r)["inheritedAcquisition.standardPriceAtTransfer"]?.join()).toMatch(/환산취득가액은 양도시 기준시가가 필요합니다/);
  });

  it("D-3 기준시가 평가 부담부증여 — ③이 없다(Q-25) · 기존 §159 문구 그대로", async () => {
    const r = await run(form([asset(1, BG_MARKET_LAND, { bgValuationMode: "sangjeungbeop_standard", standardPriceAtTransfer: "" } as Partial<AssetForm>)]));
    expect(f4Issues(r)).toEqual([]);
    expect(r.issues.map((i) => i.message).join()).toMatch(/부담부증여 기준시가 평가 — 양도시 기준시가/);
    expect(JSON.stringify(r.json.error)).not.toMatch(F4_MSG);
  });
});
