/**
 * 함께 양도 두 번째 자산 × 매매 분리취득 — 자산 전체 취득가액(`fixedAcquisitionPrice`) ⑧≡⑫ 격자 (2026-10-21)
 *
 * 계획서: docs/00-pm/companion-split-fixed-acq-price.plan.md (Q-1 a)
 *
 * 종전: ⑫ 컴패니언 매매 갈래가 분리 계산 여부를 보지 않고 자산 전체 취득가액을 요구했다. 별개 취득 화면에는 그 칸이 없어
 * ⑧ 통과 ↔ ⑫ 400이었다(일반·토지 증여 D1·파트 환산·파트 감정). 엔진은 파트 가액으로 계산해 그 값은 세액에 쓰이지 않는다.
 *
 * 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) ⑧ 차단 ⇔ ⑫ 400(같은 칸) · (C) 숨은 총액 잔재는 세액을 바꾸지 않는다 ·
 * (D) 칸이 보이는 경로(분리 아님 · 같은 날 소유자 분리)는 종전대로 총액을 요구한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf, cForm } from "./_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionDate: "2015-06-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: "1,200,000,000",
  buildingTransferPrice: "300,000,000",
  actualSalePrice: "1,500,000,000",
  landStandardPriceAtTransfer: "900,000,000",
  buildingStandardPriceAtTransfer: "600,000,000",
};
const SEPARATE = { acquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2003-06-01", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "250,000,000" };

const first = {
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 2-2",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-02",
  fixedAcquisitionPrice: "300,000,000",
  actualSalePrice: "400,000,000",
} as unknown as AssetForm;

const second = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(2), assetId: "a2", ...BASE, ...over }) as unknown as AssetForm;
const bundle = (over: Record<string, unknown>): TransferFormData =>
  cForm({ transferDate: "2025-06-30", filingDate: "2025-08-31", assets: [first, second(over)], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as Partial<TransferFormData>);

async function route(f: TransferFormData) {
  return routeOf(POST, await bodyOf(f));
}
const tax = (r: Awaited<ReturnType<typeof route>>) => r.json.data.aggregated.determinedTax as number;

/** 별개 취득 매매 형태 — 종전 400이던 셀 */
const SEPARATE_CELLS: [string, Record<string, unknown>][] = [
  ["일반(실가·실가)", SEPARATE],
  ["토지 증여(D1)", { ...SEPARATE, landAcquisitionCause: "gift", landCauseHost: "purchase", landHouseExisted: "no" }],
  ["토지 환산", { ...SEPARATE, landAcqMode: "estimated", landAcquisitionPrice: "", standardPricePerSqmAtAcq: "500,000", acquisitionArea: "200" }],
  ["건물 감정", { ...SEPARATE, buildingAcqMode: "appraisal", buildingAcquisitionPrice: "260,000,000", buildingStandardPriceAtAcq: "200,000,000" }],
];

describe.each(SEPARATE_CELLS)("두 번째 자산 · 매매 별개 취득 · %s", (_name, over) => {
  it("⑧ 통과 ⇒ ⑫ 200 (자산 전체 취득가액 칸이 화면에 없고 보내지도 않는다)", async () => {
    const f = bundle(over);
    expect(issuesOf(f)).toEqual([]);
    const body = await bodyOf(f);
    expect((body.companionAssets as Record<string, unknown>[])[0].fixedAcquisitionPrice).toBeUndefined();
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  });

  it("숨은 총액 잔재(9억)는 세액을 바꾸지 않는다 — 엔진은 파트 가액으로 계산한다", async () => {
    const [clean, residue] = [await route(bundle(over)), await route(bundle({ ...over, fixedAcquisitionPrice: "900,000,000" }))];
    expect(residue.status).toBe(200);
    expect(tax(clean)).toBe(tax(residue));
  });
});

describe("⑥ 사이드바 — 자산 전체 값이 없어도 계산 후 취득가액은 엔진이 쓴 파트 합이다", () => {
  // 응답의 `apportionment.apportioned[].allocatedAcquisitionPrice`는 자산 전체 값이 없으면 0이다. 사이드바가 그 값을 그대로 쓰면 0으로 보인다 —
  // 분리 자산은 엔진 echo(`aggregated.properties[].acquisitionPrice`)로 덮는다(`transfer-per-asset-summary.ts`). 그 덮어쓰기가 컴패니언에도 서는지 본다.
  it("일반 별개 취득: 두 번째 자산 행 acqPrice = 토지 3억 + 건물 2.5억", async () => {
    const f = bundle(SEPARATE);
    const r = await route(f);
    expect(r.status).toBe(200);
    const row = computeTransferPerAssetSummary(f, { mode: "bundled", ...r.json.data } as never).rows[1];
    expect(row.acqPrice).toBe(550_000_000);
  });
});

describe("파트 완결은 V1·V2가 지킨다", () => {
  it("건물 취득가액을 비우면 ⑧ 차단 ⇔ ⑫ 400 — 같은 칸이고 자산 전체 취득가액 오류는 없다", async () => {
    const f = bundle({ ...SEPARATE, buildingAcquisitionPrice: "" });
    expect(issuesOf(f).map((i) => i.field)).toContain("buildingAcquisitionPrice");
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(["companionAssets.0.buildingAcquisitionPrice"]);
  });
});

describe("칸이 보이는 경로는 종전대로 요구한다", () => {
  it("분리 아님 매매 — 총액 비움: ⑧ 차단 ⇔ ⑫ 400 `fixedAcquisitionPrice`", async () => {
    const f = bundle({ acquisitionCause: "purchase", saleSplitMode: "", landTransferPrice: "", buildingTransferPrice: "" });
    expect(issuesOf(f).map((i) => i.field)).toContain("fixedAcquisitionPrice");
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain("companionAssets.0.fixedAcquisitionPrice");
  });

  it("같은 날 소유자 분리(건물만) — 총액 칸이 보인다: 비우면 ⑧ 차단 ⇔ ⑫ 400 · 넣으면 200", async () => {
    const owner = {
      acquisitionCause: "purchase",
      selfOwns: "building_only",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "200",
      standardPriceAtAcq: "500,000,000",
      buildingStandardPriceAtAcq: "300,000,000",
    };
    const empty = bundle(owner);
    expect(issuesOf(empty).map((i) => i.field)).toContain("fixedAcquisitionPrice");
    const r = await route(empty);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain("companionAssets.0.fixedAcquisitionPrice");
    const filled = bundle({ ...owner, fixedAcquisitionPrice: "550,000,000" });
    expect(issuesOf(filled)).toEqual([]);
    expect((await route(filled)).status).toBe(200);
  });
});
