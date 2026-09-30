/**
 * anchor — CP-3a/b · 컴패니언 §163⑨ ②(§164④~⑦)·③(의제 전 환산) **운반** (④⑫⑭).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1 CP-3 (사용자 결정 2026-09-30: 운반 배선).
 *
 * ## 결함
 * ⑤(`CompanionAcqInheritanceBlock` → `InheritedAcquisitionDeemedSection`)·⑧은 함께양도 자산에서도 주 자산과 같은
 * 규칙으로 ②만 입력하거나(post-deemed) 「가목 확인 불가」 선언으로 ③에 가는 것(pre-deemed)을 허용한다. 그런데
 * ④·⑫·⑭ 어디에도 그 값을 나를 칸이 없어 ①(`inheritanceValuation`)만 실렸고 → **컴패니언 취득가액 0**.
 *
 * ## 수정 — 주 자산과 같은 leaf
 * ④ `buildInheritedAcquisitionPayload`·`buildInheritedHouseValuationPayload`·`buildCommercialInheritanceValuationPayload`·
 * `buildPre1990LandPayload` · ⑫ `sec163_9AcquisitionShape` spread · ⑭ `toEngineSec163_9Inputs`.
 *
 * ## 판정 기준 — 「같은 자산을 첫 번째에 두었을 때」와 같다
 * 같은 두 물건을 순서만 바꿔 넣으면(주 자산 ↔ 컴패니언) 신고 합계 세액이 같아야 한다 — 종전에는 컴패니언 쪽만
 * 취득가액 0이라 갈렸다(실측 아래). 단건(물건 하나) 값은 주 자산 경로가 바뀌지 않았음을 고정한다(긍정 짝).
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님).
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const asset = (id: number, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    addressJibun: `서울 강남구 테스트동 ${id}`,
    assetKind: "land",
    landNature: "standalone",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "500000000",
    ...over,
  }) as AssetForm;
const form = (assets: AssetForm[], contractTotalPrice = "1600000000"): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    contractTotalPrice,
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
    bundledSaleMode: "apportioned",
  }) as unknown as TransferFormData;
const issues = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));

async function run(f: TransferFormData) {
  let body: Body | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callTransferTaxAPI(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Body;
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return { body: body!, json };
}
/** 일괄 응답 — 합계 세액과 자산별 §163⑨ 의제 취득가액(엔진 STEP 0.45 결과) */
function bundled(json: Body) {
  const props = json.data.aggregated.properties as Body[];
  return {
    totalTax: json.data.aggregated.totalTax as number,
    deemedAcq: props.map((p) => p.inheritedAcquisitionDetail?.acquisitionPrice ?? null),
  };
}

/** 주택 · 상속개시일 2003(개별주택가격 최초공시 2005-04-30 前) · ① 비움 · ② §164⑤~⑦ 4+1필드 입력 */
const HOUSE_POST_DEEMED_CLAUSE2_ONLY = {
  assetKind: "housing",
  acquisitionCause: "inheritance",
  acquisitionDate: "2003-05-01",
  decedentAcquisitionDate: "1995-01-01",
  inheritanceAssetKind: "house_individual",
  fixedAcquisitionPrice: "",
  publishedValueAtInheritance: "",
  standardPriceAtTransfer: "600000000",
  inhHouseValLandArea: "200",
  inhHouseValLandPricePerSqmAtTransfer: "2000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValLandPricePerSqmAtInheritance: "800000",
  inhHouseValHousePriceAtTransfer: "600000000",
};
/** 주택 · 상속개시일 1980(의제취득일 前) · ①·② 없음 · 「가목 확인 불가」 선언 → ③ 환산 */
const HOUSE_PRE_DEEMED_DECLARED = {
  assetKind: "housing",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-05-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  fixedAcquisitionPrice: "",
  publishedValueAtInheritance: "",
  standardPriceAtAcq: "50000000",
  standardPriceAtTransfer: "600000000",
  preDeemedClauseAUnconfirmed: true,
};
/** 토지 · 상속개시일 1988(개별공시지가 최초고시 1990-08-30 前) · ① 비움 · ② §164④ 등급환산 입력 */
const LAND_CLAUSE1_ONLY = {
  assetKind: "land",
  landNature: "standalone",
  acquisitionCause: "inheritance",
  acquisitionDate: "1988-05-01",
  decedentAcquisitionDate: "1980-01-01",
  inheritanceAssetKind: "land",
  fixedAcquisitionPrice: "",
  publishedValueAtInheritance: "",
  acquisitionArea: "300",
  standardPriceAtTransfer: "600000000",
  pre1990GradeMode: "number",
  pre1990Grade_current: "150",
  pre1990Grade_prev: "140",
  pre1990Grade_atAcq: "130",
  pre1990PricePerSqm_1990: "500000",
};

describe("CP-3 컴패니언 §163⑨ — 주 자산과 같은 값이 엔진에 닿는다", () => {
  it.each([
    // [이름, 자산, 컴패니언 의제 취득가액, 합계 세액(순서 무관)]
    ["CP-3a 주택 ②(§164⑤~⑦)만 — 240,000,000 · 302,115,000 (종전 취득가액 0 · 379,731,000)", HOUSE_POST_DEEMED_CLAUSE2_ONLY, 240_000_000, 302_115_000],
    ["CP-3a 토지 ②(§164④ 등급환산)만 — 70,165,500 · 357,039,477 (종전 취득가액 0 · 379,731,000)", LAND_CLAUSE1_ONLY, 70_165_500, 357_039_477],
    // ③ 환산 분자 = 이 자산의 §166⑥ 안분 양도가액 872,727,273 × 50,000,000 / 600,000,000
    ["CP-3b 주택 의제 전 ③(선언) — 72,727,272 · 355,725,900 (종전 취득가액 0 · 379,731,000)", HOUSE_PRE_DEEMED_DECLARED, 72_727_272, 355_725_900],
  ] as const)("%s", async (_n, a, deemedAcq, totalTax) => {
    const asCompanion = form([asset(1), asset(2, a)]);
    expect(issues(asCompanion)).toEqual([]);
    const c = await run(asCompanion);
    // ④ 운반 — 주 자산과 같은 키
    expect(c.body.companionAssets[0].inheritedAcquisition).toBeDefined();
    const got = bundled(c.json);
    expect(got.deemedAcq[1]).toBe(deemedAcq);
    expect(got.totalTax).toBe(totalTax);

    // 🟢 같은 두 물건을 순서만 바꿔도(그 자산이 주 자산) 합계 세액이 같다 — 주 자산 경로는 바뀌지 않았다
    const asPrimary = form([asset(1, a), asset(2)]);
    expect(bundled((await run(asPrimary)).json).totalTax).toBe(totalTax);
  });

  it.each([
    ["주택 ②만", HOUSE_POST_DEEMED_CLAUSE2_ONLY, 186_450_000, 240_000_000],
    ["토지 ②만", LAND_CLAUSE1_ONLY, 236_381_343, 70_165_500],
    ["주택 의제 전 ③", HOUSE_PRE_DEEMED_DECLARED, 232_069_000, 83_333_333],
  ] as const)("🟢 단건(주 자산 하나) — %s: 종전과 같은 세액 (engine-input.ts leaf 공용화 회귀 방어)", async (_n, a, tax, deemed) => {
    const r = await run(form([asset(1, a)], "1000000000"));
    expect(r.json.data.result.determinedTax).toBe(tax);
    expect(r.json.data.result.inheritedAcquisitionDetail.acquisitionPrice).toBe(deemed);
  });

  it("🟢 겸용 컴패니언(1985 前 상속·선언)은 §163⑨ 운반을 싣지 않는다 — 자기 서브객체가 취득가액을 만든다 (328,370,189 · 종전과 같음)", async () => {
    // 게이트를 빼면 ⑭가 파트 카드마다 STEP 0.45를 다시 돌려 492,297,397이 된다(뮤테이션 실측).
    const MIXED_PRE_DEEMED = {
      assetKind: "housing",
      isMixedUseHouse: true,
      acquisitionCause: "inheritance",
      acquisitionDate: "1980-03-01",
      decedentAcquisitionDate: "1970-01-01",
      useEstimatedAcquisition: false,
      addressRoad: "서울 강남구 테헤란로 1",
      residentialFloorArea: "60",
      nonResidentialFloorArea: "40",
      buildingFootprintArea: "50",
      mixedUseTotalLandArea: "600",
      mixedZoneType: "general_residential",
      mixedTransferHousingPrice: "900000000",
      mixedTransferCommercialBuildingPrice: "300000000",
      mixedTransferLandPricePerSqm: "2000000",
      mixedAcqHousingPrice: "300000000",
      mixedAcqCommercialBuildingPrice: "100000000",
      mixedAcqLandPricePerSqm: "1000000",
      standardPriceAtAcq: "50000000",
      standardPriceAtTransfer: "1200000000",
      preDeemedClauseAUnconfirmed: true,
    };
    const f = { ...form([asset(1), asset(2, MIXED_PRE_DEEMED)], "2000000000"), transferDate: "2024-06-01", filingDate: "2024-08-31" };
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.body.companionAssets[0].inheritedAcquisition).toBeUndefined();
    expect(bundled(r.json).totalTax).toBe(328_370_189);
  });
});

/**
 * PD-1 × CP-3 (취득가액 리뷰 게이트 지적, 2026-09-30) — ③(환산) 입력이 비면 주 자산·컴패니언 모두 막는다.
 *
 * 종전(이 PR 중간 상태): 주 자산은 ⑧ 통과 ↔ ⑫ PD-1 400(막다른 길), 컴패니언은 ⑧·⑫ 모두 통과해
 * **200 + 취득가액 0**(합계 379,731,000 — 분자를 넣은 짝 355,725,900).
 */
describe("PD-1 — 의제 전 ③ 분자 누락 (주 자산·컴패니언 같은 규칙)", () => {
  const NO_NUMERATOR = { ...HOUSE_PRE_DEEMED_DECLARED, standardPriceAtAcq: "" };
  const MSG = "의제취득일(1985.1.1.) 전 상속·증여 자산을 환산하려면 의제취득일 현재 기준시가를 입력하세요";

  it("🔴 ⑧ 주 자산 — 차단 (종전 통과 → ⑫ 400 막다른 길)", () => {
    expect(issues(form([asset(1, NO_NUMERATOR)])).some((m) => m.includes(MSG))).toBe(true);
  });

  it("🔴 ⑧ 컴패니언 — 차단 (종전 통과 → 200 + 취득가액 0)", () => {
    expect(issues(form([asset(1), asset(2, NO_NUMERATOR)])).some((m) => m.includes(MSG))).toBe(true);
  });

  it("🟢 ⑧ 분자가 있으면 통과 (CP-3b 짝 — 위 표의 72,727,272)", () => {
    expect(issues(form([asset(1), asset(2, HOUSE_PRE_DEEMED_DECLARED)])).some((m) => m.includes(MSG))).toBe(false);
  });

  it("🔴 ⑫ 컴패니언 API — 분자를 지운 본문은 400 + 경로 (종전 200 · 취득가액 0)", async () => {
    const { body } = await run(form([asset(1), asset(2, HOUSE_PRE_DEEMED_DECLARED)]));
    delete body.companionAssets[0].inheritedAcquisition.standardPriceAtDeemedDate;
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as Body;
    expect(res.status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toContain("companionAssets.0.inheritedAcquisition.reportedValue");
  });
});
