/**
 * route anchor — 리뷰 NH-22·NH-31: 신축주택 «딸린 토지 — 건물 연면적의 2배 이내» 확인 필요 고지 (계산 불변).
 * 계획서 docs/00-pm/new-housing-appurtenant-land-2x-nh22-31.plan.md (Q-1 b · Q-2 a · Q-3 b · Q-4 a).
 * 폼 → ⑧ validate → ④ 변환 → fetch body → ⑫ Zod → ⑭ route → 엔진. 세율표는 route 폴백이다.
 *
 * 고지는 «확정 초과»(연면적·토지 면적이 둘 다 양수이고 토지 > 2 × 연면적)일 때만 나오고, 세액은 고지 유무와 무관하게 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { POST } from "@/app/api/calc/transfer/route";
import { allIssues, captureBody, runCalc } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const NOTICE = /딸린 토지 면적 .*㎡가 건물 연면적 .*㎡의 2배/;
const SEPARATE = /별도 토지 카드가 있습니다/;

function house(o: { acq: string; transfer: string; reductions: unknown[] }): TransferFormData {
  const asset = Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: o.acq,
    actualSalePrice: "500,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: o.reductions as never,
  }));
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: o.transfer, contractTotalPrice: "500000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}
/** 구간 밖(2003-03 계약 — 종전 고급주택 기준 구간 2002.12.31. 이전 밖) §99의3, 5년 후 양도. 주택 유형은 묻지 않는다(""). */
const r993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", contractDate993: "2003-03-01", exclusiveAreaSqm993: "84", houseType993: "", firstContract993: "yes",
  region993: "outside_speculation",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "150,000,000", standardPriceAtTransfer993: "400,000,000",
  ...over,
});
const run993 = (over: Record<string, unknown> = {}) => runCalc(house({ acq: "2003-03-01", transfer: "2024-08-01", reductions: [r993(over)] }));
const warnings = (r: Awaited<ReturnType<typeof runCalc>>) => ((r.r?.warnings ?? r.warnings ?? []) as string[]).map(String);
const has = (r: Awaited<ReturnType<typeof runCalc>>, re: RegExp) => warnings(r).some((w) => re.test(w));

describe("NH-22 — §99의3 딸린 토지 2배 확인 필요 고지 (구간 밖 선택 입력)", () => {
  it("연면적 100 · 토지 400 → 고지 + 세액은 면적 미입력 대조와 같다", async () => {
    const f = house({ acq: "2003-03-01", transfer: "2024-08-01", reductions: [r993({ grossFloorAreaSqm993: "100", attachedLandAreaSqm993: "400" })] });
    expect(allIssues(f).filter((m) => /99|신축|연면적|딸린/.test(String(m)))).toEqual([]);
    const body = await captureBody(f);
    const red = (body.reductions as Record<string, unknown>[])[0];
    expect(red.grossFloorAreaSqm993, "④가 구간 밖에서도 면적을 싣는다").toBe(100);
    expect(red.attachedLandAreaSqm993).toBe(400);
    const r = await runCalc(f);
    const c = await run993();
    expect(r.status).toBe(200);
    expect(has(r, NOTICE)).toBe(true);
    expect(has(c, NOTICE), "대조: 면적 미입력이면 고지 없음").toBe(false);
    expect(r.totalTax, "계산 불변").toBe(c.totalTax);
  });

  it.each([
    ["경계 — 토지 200 = 연면적 100의 2배", { grossFloorAreaSqm993: "100", attachedLandAreaSqm993: "200" }, false],
    ["토지 200.01 > 2배", { grossFloorAreaSqm993: "100", attachedLandAreaSqm993: "200.01" }, true],
    ["토지만 입력(연면적 없음)", { attachedLandAreaSqm993: "400" }, false],
    ["연면적만 입력(토지 없음)", { grossFloorAreaSqm993: "100" }, false],
    ["공동주택 선택 시 판정하지 않는다", { houseType993: "apartment", grossFloorAreaSqm993: "100", attachedLandAreaSqm993: "400" }, false],
  ] as const)("%s → 고지 %s", async (_n, over, expected) => {
    const r = await run993(over as Record<string, unknown>);
    expect(r.status).toBe(200);
    expect(has(r, NOTICE)).toBe(expected);
  });

  it("감면이 적용되지 않으면(신축주택취득기간 2003.6.30. 밖 계약 — 불성립) 고지하지 않는다", async () => {
    const f = house({
      acq: "2004-01-01", transfer: "2024-08-01",
      reductions: [r993({ contractDate993: "2004-01-01", grossFloorAreaSqm993: "100", attachedLandAreaSqm993: "400" })],
    });
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.r?.new993Detail?.isEligible, "전제: 감면 불성립").toBe(false);
    expect(has(r, NOTICE)).toBe(false);
  });
});

describe("NH-22 — §99(종전 고급주택 구간 안 단독주택) 같은 고지", () => {
  const r99 = (over: Record<string, unknown> = {}) => ({
    ...getReductionDefault("new_99"),
    acquisitionType99: "self_built", usageApprovalDate99: "1999-03-01", exclusiveAreaSqm99: "84", houseType99: "detached",
    stdPriceFloorMet99: "no", luxuryFacility99: "no",
    standardPriceAtAcquisition99: "100,000,000", standardPriceAt5Years99: "150,000,000", standardPriceAtTransfer99: "400,000,000",
    ...over,
  });
  const run99 = (over: Record<string, unknown> = {}) => runCalc(house({ acq: "1999-03-01", transfer: "2024-08-01", reductions: [r99(over)] }));

  it("단독 연면적 100 · 토지 400 → 고지 + 세액 불변(토지 200 대조와 같음)", async () => {
    const r = await run99({ grossFloorAreaSqm99: "100", attachedLandAreaSqm99: "400" });
    const c = await run99({ grossFloorAreaSqm99: "100", attachedLandAreaSqm99: "200" });
    expect(r.status).toBe(200);
    expect(r.r?.new99Detail?.isEligible, "전제: §99 적격").toBe(true);
    expect(has(r, NOTICE)).toBe(true);
    expect(has(c, NOTICE), "대조: 정확히 2배").toBe(false);
    expect(r.totalTax).toBe(c.totalTax);
  });
});

describe("NH-31 — 일괄양도 별도 토지 카드 고지 (계산 불변)", () => {
  const landCard = (id: number) => ({
    ...makeDefaultAsset(id), addressJibun: "경기도 테스트시 테스트동 2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2003-03-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "10000000", standardPriceAtTransfer: "40000000",
    actualSalePrice: "100000000", fixedAcquisitionPrice: "20000000",
  }) as unknown as AssetForm;
  const houseCard = (reductions: unknown[]) =>
    Object.assign({ ...makeDefaultAsset(1) }, x({
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-03-01", actualSalePrice: "400,000,000", fixedAcquisitionPrice: "200,000,000",
      standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000", reductions: reductions as never,
    })) as AssetForm;
  const bundle = (assets: AssetForm[]) =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2024-08-01", filingDate: "2024-10-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual",
      contractTotalPrice: "500000000", isOneHousehold: false, householdHousingCount: "2",
    }) as TransferFormData;
  async function aggregated(f: TransferFormData) {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)),
    }));
    const j = (await res.json()) as { data?: { aggregated?: { warnings?: string[]; calculatedTax: number } }; error?: unknown };
    expect(res.status, JSON.stringify(j.error)).toBe(200);
    return j.data!.aggregated!;
  }

  it("주택 카드에 §99의3 적용 + 별도 토지 카드 → 고지 / 감면 없는 대조 → 고지 없음 / 토지 카드 없는 대조 → 고지 없음", async () => {
    const withBoth = await aggregated(bundle([houseCard([r993()]), landCard(2)]));
    expect((withBoth.warnings ?? []).some((w) => SEPARATE.test(w))).toBe(true);
    const noReduction = await aggregated(bundle([houseCard([]), landCard(2)]));
    expect((noReduction.warnings ?? []).some((w) => SEPARATE.test(w)), "대조: 감면 선택 없음").toBe(false);
  });
});
