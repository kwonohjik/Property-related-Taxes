/**
 * D2-1 경로 anchor — 건물 상속·증여 + 토지 매매가 **다건 합산 · 컴패니언(일괄양도) · 12억 초과 고가주택**에서도 단건과 같게 동작한다 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 · 엔진 설계 `transfer-acq-cause-mixed-d2.engine.design.md` §4.4 · §10 U-6·U-8
 * 설계상 「구현 전 필수 실측」 3건을 고정한다:
 *   1) 다건 route(`/api/calc/transfer/multi`)가 D2 payload를 수용하는가 → 수용한다(단건과 같은 세액)
 *   2) 컴패니언(일괄양도)에서 파트 가액과 자산 단위 평가의 우선순위 → 파트 가액이 이긴다
 *   3) 12억 초과 고가주택(표2 장특)에서 D2 파트별 보유기간 → 건물 상속개시일 · 토지 자기 취득일로 각각 센다
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Form = ReturnType<typeof createDefaultTransferFormData>;

/** 건물 상속(2025-05-01, 피상속인 2000) + 토지 매매 2025-01-10 — D2 토글 ON 상태(UI 설계 §2.4 ON 패치) */
function d2Asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2025-05-01", inheritanceStartDate: "2025-05-01", inheritanceDate: "2025-05-01",
    decedentAcquisitionDate: "2000-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2025-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}
function form(assets: AssetForm[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-30";
  f.contractTotalPrice = "1,200,000,000";
  f.householdHousingCount = "2";
  f.assets = assets as never;
  return Object.assign(f, over);
}

async function bodyOf(send: () => Promise<unknown>) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

async function single(f: Form): Promise<{ status: number; r: J; body: J }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const body = (await res.json()) as J;
  return { status: res.status, r: body?.data?.result, body };
}
async function multi(f: Form): Promise<{ status: number; body: J }> {
  const m = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() => callMultiTransferTaxAPI(m, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  return { status: res.status, body: (await res.json()) as J };
}

describe("1) 다건 합산 route — D2 payload 수용", () => {
  it("단건과 같은 세액 · 토지 overlay 운반(⑭) · 건물 상속 통산 유지", async () => {
    const f = form([d2Asset()]);
    const s = await single(f);
    const m = await multi(f);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.data.totalTax).toBe(s.r.totalTax);
    expect(s.r.splitDetail.land).toMatchObject({ acquisitionCause: "purchase", rateBasisRule: "own" });
    expect(s.r.splitDetail.building).toMatchObject({ acquisitionCause: "inheritance", rateBasisRule: "decedent" });
  });

  it("건물 증여도 같다 · D2 규칙 위반(경계일 전)은 다건 ⑫에서도 400", async () => {
    const g = form([d2Asset({ acquisitionCause: "gift", landCauseHost: "gift" as never, decedentAcquisitionDate: "" })]);
    const sg = await single(g);
    const mg = await multi(g);
    expect(mg.status, JSON.stringify(mg.body)).toBe(200);
    expect(mg.body.data.totalTax).toBe(sg.r.totalTax);
    const pre = form([d2Asset({ acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01", landAcquisitionDate: "2003-01-10", decedentAcquisitionDate: "1990-01-01" })]);
    expect((await multi(pre)).status).toBe(400);
  });
});

describe("2) 컴패니언(일괄양도) — 파트 가액이 자산 단위 평가보다 앞선다", () => {
  /** 주 자산 = 단순 토지, 컴패니언 = D2 주택. 총 양도 가액은 주택 12억 + 토지 3억. */
  function bundled(companion: AssetForm): Form {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    return form([land, { ...companion, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
  }
  it("D2 컴패니언이 200으로 계산된다 — 취득가액은 파트 합 7억(자산 단위 총액 0이 아니다) · 파트 echo가 단건과 같다(토지 purchase · 건물 inheritance)", async () => {
    const res = await single(bundled(d2Asset({ actualSalePrice: "1,200,000,000" })));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.mode).toBe("bundled");
    const c1 = res.body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.acquisitionPrice).toBe(700_000_000); // 일괄양도 안분 단계의 allocatedAcquisitionPrice는 0이지만 파트 가액이 이긴다
    expect(c1.splitDetail.land).toMatchObject({ acquisitionPrice: 300_000_000, acquisitionCause: "purchase", rateBasisRule: "own" });
    expect(c1.splitDetail.building).toMatchObject({ acquisitionPrice: 400_000_000, acquisitionCause: "inheritance", rateBasisRule: "decedent" });
  });
  it("컴패니언에 자산 단위 상속 평가를 얹으면 ⑫ 400(Y7) · overlay를 빼면 400(Y8) — 긍정 짝은 위", async () => {
    const body = (await bodyOf(() => callTransferTaxAPI(bundled(d2Asset({ actualSalePrice: "1,200,000,000" }))))) as J;
    const withIv = JSON.parse(JSON.stringify(body));
    withIv.companionAssets[0].inheritanceValuation = { inheritanceDate: "2025-05-01", assetKind: "house_individual", publishedValueAtInheritance: 450_000_000 };
    expect((await post(SINGLE, "http://l/api/calc/transfer", withIv)).status).toBe(400);
    const noOverlay = JSON.parse(JSON.stringify(body));
    delete noOverlay.companionAssets[0].landAcquisitionCause;
    expect((await post(SINGLE, "http://l/api/calc/transfer", noOverlay)).status).toBe(400);
  });
});

describe("2b) Check 후속 — 컴패니언 건물 증여 · 같은 날 파트 가액 · 주 자산 primaryInheritanceValuation", () => {
  function bundled(companion: AssetForm, primaryAsset?: AssetForm): Form {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    return form(primaryAsset ? [primaryAsset, { ...land, assetId: "c1" } as AssetForm] : [land, { ...companion, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
  }
  const GIFT = { acquisitionCause: "gift", landCauseHost: "gift" as never, decedentAcquisitionDate: "" } as Partial<AssetForm>;

  it("[Medium #2] 컴패니언 건물 증여 D2: ⑫ 통과(증여 arm `fixedAcquisitionPrice` 필수 면제) · 취득가액은 파트 합 7억 · 건물 gift/own", async () => {
    const res = await single(bundled(d2Asset({ ...GIFT, actualSalePrice: "1,200,000,000" })));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const c1 = res.body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.acquisitionPrice).toBe(700_000_000);
    expect(c1.splitDetail.land).toMatchObject({ acquisitionCause: "purchase", acquisitionPrice: 300_000_000 });
    expect(c1.splitDetail.building).toMatchObject({ acquisitionCause: "gift", rateBasisRule: "own", acquisitionPrice: 400_000_000 });
    // 긍정 짝: 면제는 D2 한정 — overlay 없는 컴패니언 증여는 종전대로 신고가액 필수(400)
    const body = (await bodyOf(() => callTransferTaxAPI(bundled(d2Asset({ ...GIFT, actualSalePrice: "1,200,000,000" })))));
    const plain = JSON.parse(JSON.stringify(body));
    for (const k of ["landAcquisitionCause", "landAcquisitionDate", "landAcquisitionPrice", "buildingAcquisitionPrice", "isSeparateAcquisition"]) delete plain.companionAssets[0][k];
    expect((await post(SINGLE, "http://l/api/calc/transfer", plain)).status).toBe(400);
  });

  it("[취득가액 리뷰 a] 같은 날 + 컴패니언 + 파트 가액 없음 → 400 (종전 200·취득가액 0·474,060,000) · 가액이 있으면 200", async () => {
    const sameNoParts = d2Asset({ landAcquisitionDate: "2025-05-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "", actualSalePrice: "1,200,000,000" });
    const bad = await single(bundled(sameNoParts));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain("건물 취득가액");
    const ok = await single(bundled(d2Asset({ landAcquisitionDate: "2025-05-01", actualSalePrice: "1,200,000,000" })));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("[취득가액 리뷰 b] 일괄양도 주 자산 `primaryInheritanceValuation` 동봉 → 400(Y7) — ④는 D2 유효 시 싣지 않는다", async () => {
    const f = bundled(d2Asset(), d2Asset({ actualSalePrice: "1,200,000,000" }));
    const body = (await bodyOf(() => callTransferTaxAPI(f))) as J;
    expect(body.primaryInheritanceValuation).toBeUndefined();
    expect((await post(SINGLE, "http://l/api/calc/transfer", body)).status).toBe(200);
    const bad = await post(SINGLE, "http://l/api/calc/transfer", { ...body, primaryInheritanceValuation: { inheritanceDate: "2025-05-01", assetKind: "house_individual", publishedValueAtInheritance: 450_000_000 } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain("자산 단위 상속 취득가액 의제");
  });
});

describe("3) 12억 초과 고가주택(표2 장특) — 파트별 보유기간", () => {
  // 양도 20억(토지 12억 / 건물 8억), 1세대1주택. 건물 상속개시 2018-03-02(8년)·거주 96개월, 토지 2015-01-10 매매(11년).
  const hi = (over: Partial<AssetForm> = {}) =>
    d2Asset({
      acquisitionDate: "2018-03-02", inheritanceStartDate: "2018-03-02", inheritanceDate: "2018-03-02", landAcquisitionDate: "2015-01-10",
      actualSalePrice: "2,000,000,000", landTransferPrice: "1,200,000,000", buildingTransferPrice: "800,000,000",
      landStandardPriceAtTransfer: "1,200,000,000", buildingStandardPriceAtTransfer: "800,000,000", ...over,
    } as Partial<AssetForm>);
  const f = (a: AssetForm) => form([a], { contractTotalPrice: "2,000,000,000", householdHousingCount: "1", isOneHousehold: true, residenceMonths: "96" } as never);

  it("고가주택 부분과세가 계산되고 파트 보유기간이 각자 자기 취득일부터다 — 건물 8년(개시일) · 토지 11년(자기 취득일)", async () => {
    const res = await single(f(hi({ residencePeriodMonths: "96" } as never)));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sd = res.r.splitDetail;
    expect(sd.land.holdingYears).toBe(11);
    expect(sd.building.holdingYears).toBe(8);
    expect(res.r.isExempt).toBe(false); // 12억 초과분 과세
    expect(res.r.determinedTax).toBeGreaterThan(0);
  });
  it("건물 매매로 바꾼 대조군과 장특·보유연수가 같다(원인이 파트 장특 기산을 바꾸지 않는다 — 상속은 개시일부터)", async () => {
    const d2r = await single(f(hi({ residencePeriodMonths: "96" } as never)));
    const ctl = await single(f(hi({ acquisitionCause: "purchase", landCauseHost: "" as never, landAcquisitionCause: "", decedentAcquisitionDate: "", residencePeriodMonths: "96" } as never)));
    expect(ctl.status, JSON.stringify(ctl.body)).toBe(200);
    expect(d2r.r.splitDetail.building.longTermDeduction).toBe(ctl.r.splitDetail.building.longTermDeduction);
    expect(d2r.r.splitDetail.land.longTermDeduction).toBe(ctl.r.splitDetail.land.longTermDeduction);
    expect(d2r.r.determinedTax).toBe(ctl.r.determinedTax);
  });
});
