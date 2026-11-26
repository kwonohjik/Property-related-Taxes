/**
 * anchor — 둘째 이후 카드(컴패니언)의 가업상속공제 §97의2④ — ⑧ → ④ 컴패니언 payload → ⑫ 공유 스키마 → ⑭ companionEngine → 엔진 STEP 0.42.
 *
 * 계획서: docs/02-design/features/transfer-fb-share.engine.plan.md §12 · «최종 결정» Q-5 (FS-15·16·18·19·20·21)
 * 시료(§12.1): 축 B 50% + 50% · 총 양도가 18억 · 상속 카드 = 교재 이월과세5 FB(5억/15억/70%) · 매매 카드 = 2023-01-10 취득 12억(지분분 6억) · 토지 · mock 세율.
 * 손계산(§3.4·§4): 상속 카드 485,000,000 · 장특 127,700,000 + 매매 카드 300,000,000 · 장특 18,000,000(3년 6%)
 *   → 합계 양도차익 785,000,000 · 장특 145,700,000 · 과세표준 785,000,000 − 145,700,000 − 2,500,000 = 636,800,000
 *   → 산출세액 636,800,000 × 42% − 35,940,000 = 231,516,000.
 * 종전(반전 대상): FB 카드가 둘째면 ⑫가 키를 침묵 strip해 435,000,000(= FB 없는 값) · 첫째면 FB 100% 값이라 385,000,000.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(() => vi.unstubAllGlobals());

const FB = {
  decedentAcquisitionPrice: 500_000_000,
  inheritanceMarketValue: 1_500_000_000,
  fbDeductionAppliedRate: 0.7,
  inheritanceDate: "2022-04-10",
  fbRateBasis: { kind: "deduction_ratio" as const, deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
};
const LAND = { assetKind: "land", landAreaM2: "100", acquisitionArea: "100", landNature: "independent", companionLandNature: "independent" };
const half = { ownershipNumerator: "1", ownershipDenominator: "2" };

const inheritCard = (id: string, fb: typeof FB | undefined = FB) =>
  Object.assign({ ...makeDefaultAsset(1) }, {
    assetId: id, ...LAND, ...half,
    acquisitionCause: "inheritance", acquisitionDate: "2022-04-10", inheritanceStartDate: "2022-04-10",
    fixedAcquisitionPrice: "1,500,000,000", inheritanceAssetKind: "land", publishedValueAtInheritance: "1,500,000,000",
    decedentAcquisitionDate: "2012-03-08", transferExpense: "30,000,000",
    // PR-3 ⑧ V8-1 — 지분 카드의 FB는 «물건 전체 기준» 확인이 있어야 계산한다
    ...(fb ? { familyBusinessInheritance: fb, fbShareBasisConfirmed: true } : {}),
  }) as unknown as AssetForm;
const purchaseCard = (id: string) =>
  Object.assign({ ...makeDefaultAsset(1) }, {
    assetId: id, ...LAND, ...half, acquisitionCause: "purchase", acquisitionDate: "2023-01-10", fixedAcquisitionPrice: "1,200,000,000",
  }) as unknown as AssetForm;

function axisB(assets: AssetForm[]): TransferFormData {
  const f = Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-10-15", contractTotalPrice: "1,800,000,000", assetSplitMode: "fractional",
    householdHousingCount: "0", assets,
  }) as TransferFormData;
  return withTestAddress(f);
}

const issues = (f: TransferFormData) => {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push(i.message);
  return out;
};
async function captureBody(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  try { await callTransferTaxAPI(form); } catch { /* body만 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function postBody(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Agg = { totalTransferGain: number; totalLongTermHoldingDeduction: number; taxBase: number; calculatedTax: number; properties: Array<Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData): Promise<Agg> {
  expect(issues(f)).toEqual([]);
  const r = await postBody(await captureBody(f));
  expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  return r.j.data.aggregated as Agg;
}
const totals = (a: Agg) => [a.totalTransferGain, a.totalLongTermHoldingDeduction, a.taxBase, a.calculatedTax];
const EXPECTED = [785_000_000, 145_700_000, 636_800_000, 231_516_000];

describe("FS-15 축 B — 둘째 카드 상속+FB 50% (종전 435,000,000 = FB 침묵 strip → 반전)", () => {
  it("합계 785,000,000 · 145,700,000 · 636,800,000 · 231,516,000 · FB echo는 둘째 카드에만", async () => {
    const a = await run(axisB([purchaseCard("p"), inheritCard("s")]));
    expect(totals(a)).toEqual(EXPECTED);
    expect(a.properties[0].familyBusinessDetail).toBeUndefined();
    const d = a.properties[1].familyBusinessDetail;
    expect(d.imputedAcquisitionPrice).toBe(400_000_000);
    expect(d.ownershipRatio).toBe(0.5);
    expect(d.wholeInput).toEqual({ decedentAcquisitionPrice: 500_000_000, inheritanceMarketValue: 1_500_000_000 });
    expect(a.properties[1].transferGain).toBe(485_000_000);
    expect(a.properties[1].longTermHoldingDeduction).toBe(127_700_000);
    // PR-3 E-3 — 번들 breakdown에 부분별 장특 echo가 실린다(pickValuationDetails)
    expect(a.properties[1].fbLthdDetail.basis).toBe("slice_gain");
    expect(a.properties[0].fbLthdDetail).toBeUndefined();
  });
});

describe("FS-16 카드 순서 불변 — FB 카드가 첫째여도 같은 합계 (종전 385,000,000)", () => {
  it("합계 동일", async () => {
    const a = await run(axisB([inheritCard("s"), purchaseCard("p")]));
    expect(totals(a)).toEqual(EXPECTED);
    expect(a.properties[0].familyBusinessDetail.imputedAcquisitionPrice).toBe(400_000_000);
  });
});

describe("FS-18·C-5 FB 카드 2장 — 같은 물건 50%+50%를 각자 상속+FB로 입력", () => {
  /** 각 카드 = 교재 × 1/2 (485,000,000 · 127,700,000) → 합 970,000,000 · 255,400,000 · 과세표준 712,100,000 · 263,142,000 = 교재 단건 100%와 같다 */
  it("합계 = 단건 100% · 카드별 creditAmount · 합계 creditAmount 필드 없음(Q-8)", async () => {
    const a = await run(axisB([inheritCard("a"), inheritCard("b")]));
    expect(totals(a)).toEqual([970_000_000, 255_400_000, 712_100_000, 263_142_000]);
    expect(a.properties[0].familyBusinessDetail.imputedAcquisitionPrice + a.properties[1].familyBusinessDetail.imputedAcquisitionPrice).toBe(800_000_000);
    expect(typeof a.properties[0].familyBusinessDetail.creditAmount).toBe("number");
    expect(typeof a.properties[1].familyBusinessDetail.creditAmount).toBe("number");
    expect("creditAmount" in a).toBe(false);
    expect("familyBusinessDetail" in a).toBe(false);
  });
});

describe("FS-20 ④ 컴패니언 body — FB 100% 그대로 · 상속 아니면 싣지 않는다", () => {
  it("둘째 카드 FB = 폼 입력(줄이지 않음) + ownershipRatio 0.5", async () => {
    const body = await captureBody(axisB([purchaseCard("p"), inheritCard("s")]));
    const c = (body.companionAssets as Record<string, unknown>[])[0];
    expect(c.familyBusinessInheritance).toEqual(FB);
    expect(c.ownershipRatio).toBe(0.5);
  });
  it("매매 카드에 남은 FB 잔재는 싣지 않는다(A04 술어 공유)", async () => {
    const stale = Object.assign(purchaseCard("q"), { familyBusinessInheritance: FB }) as AssetForm;
    const body = await captureBody(axisB([purchaseCard("p"), stale]));
    expect((body.companionAssets as Record<string, unknown>[])[0].familyBusinessInheritance).toBeUndefined();
  });
});

describe("FS-19·21 ⑫ 직접 API — 컴패니언 FB 형식 오류·범위 밖 자산은 400", () => {
  const baseBody = () => captureBody(axisB([purchaseCard("p"), inheritCard("s")]));
  it("fbRateBasis 분모 0 → 400 (단건과 같은 공유 스키마)", async () => {
    const body = await baseBody();
    const c = (body.companionAssets as Record<string, any>[])[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    c.familyBusinessInheritance = { ...FB, fbRateBasis: { ...FB.fbRateBasis, businessEstateValue: 0 } };
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.j.error.fieldErrors ?? {}).some((k) => k.startsWith("companionAssets.0.familyBusinessInheritance"))).toBe(true);
  });
  it.each(["general_building", "mixed_use_house"])("assetKind %s + FB → 400(가업상속 칸)", async (kind) => {
    const body = await baseBody();
    (body.companionAssets as Record<string, unknown>[])[0].assetKind = kind;
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.j.error.fieldErrors ?? {})).toContain("companionAssets.0.familyBusinessInheritance");
  });
});
