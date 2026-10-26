/**
 * 승계조합원 완공 아파트 — 부담부증여 매매 막다른 길 · 실거래가 전용 (계획서 `docs/02-design/features/redev-successor-bg-acq-method.plan.md`).
 *
 * A(Q-1 a) — 부담부증여 × 승계 × 매매: ⑧이 화면에 없는 상단 취득가액 칸을 요구해 계산할 수 없었다. 엔진은 §159 안분으로 맞게 계산한다.
 * B(Q-2 a) — 승계 완공 APT의 산정 방식 라디오(감정·매매사례·환산)를 엔진이 읽지 않아, 남은 플래그가 취득가액을 0으로 싣고
 *   엔진은 §166④1호 평가액(= 숨은 취득가액 칸 미러)으로 대신했다. 지금: ④⑧이 플래그를 무시하고 엔진은 평가액으로 대신하지 않는다.
 *
 * 시료(E2-01·#2577 anchor와 같은 값): 인가 2016-02-20 · 승계취득 2020-04-15 · 준공 2022-12-02 · 2023-02-16 양도 920,000,000 ·
 * 취득가액 450,000,000 → 양도차익 470,000,000 · 산출세액 327,250,000. 부담부증여 시가 920,000,000 · 채무 300,000,000. 세율 mock.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUCC: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2020-04-15",
  actualSalePrice: "920,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-02-20",
  redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02", redevSettlementDirection: "pay", redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", fixedAcquisitionPrice: "450,000,000", standardPriceAtTransfer: "600,000,000",
};
const BG = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920,000,000",
  bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "450,000,000", fixedAcquisitionPrice: "",
};
const HOUSE = {
  addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "920000000", assets: [{ ...makeDefaultAsset(1), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;
const bundle = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "1220000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE } as AssetForm, { ...makeDefaultAsset(2), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;

async function run(f: TransferFormData, mutate?: (body: Loose) => void) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  mutate?.(body);
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: issues.map((i) => i.field),
    body,
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    gain: result?.transferGain as number | undefined,
    tax: result?.calculatedTax as number | undefined,
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
  };
}

describe("A — 부담부증여 × 승계 × 매매: 종전 ⑧ 막다른 길(숨은 칸 요구) → 계산", () => {
  it("A-1 시가 평가 · 실지 → ⑧ 통과 · 200 · §159 안분 양도차익 153,260,870 · 산출세액 105,532,609", async () => {
    const r = await run(single(BG));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.gain).toBe(153_260_870); // 300,000,000 − 450,000,000 × 300/920
    expect(r.tax).toBe(105_532_609);
  });
  it("A-2 인가 후 필요경비 50,000,000도 채무비율로 안분된다 → 136,956,523", async () => {
    const r = await run(single({ ...BG, redevPostApprovalExpenses: "50,000,000" }));
    expect(r.fields).toEqual([]);
    expect(r.gain).toBe(136_956_523);
  });
  it("A-3 기준시가 평가 · 취득시 기준시가 300,000,000 → ⑧ 통과 · 150,000,000 (증여 취득과 같은 값)", async () => {
    const std = { ...BG, bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", standardPriceAtAcq: "300,000,000" };
    const purchase = await run(single(std));
    expect(purchase.fields).toEqual([]);
    expect(purchase.gain).toBe(150_000_000);
    expect((await run(single({ ...std, acquisitionCause: "gift" }))).gain).toBe(150_000_000);
  });
});

describe("B — 승계 완공 APT 실거래가 전용: 남은 추계 플래그를 ④⑧이 무시", () => {
  it("B-1 남은 감정가액 플래그(화면 E-2) → 본문 취득가액 450,000,000 · actual · 327,250,000 (종전: 취득가액 0 · appraisal · 평가액 대체)", async () => {
    const r = await run(single({ isAppraisalAcquisition: true }));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionPrice).toBe(450_000_000);
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.tax).toBe(327_250_000);
  });
  it("B-2 매매사례가액 500,000,000 · 취득가액 칸 450,000,000 → 취득가액 칸 값으로 계산(매매사례가액은 싣지 않는다)", async () => {
    const r = await run(single({ isSalesCaseAcquisition: true, similarSalesValue: "500,000,000" }));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionPrice).toBe(450_000_000);
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.body.similarSalesValue).toBeUndefined();
    expect(r.tax).toBe(327_250_000);
  });
  it("B-3 매매사례 플래그 · 취득가액 비움 → ⑧ 취득가액 칸(이제 화면에 있다) · 400", async () => {
    const r = await run(single({ isSalesCaseAcquisition: true, similarSalesValue: "500,000,000", fixedAcquisitionPrice: "" }));
    expect(r.fields).toEqual(["fixedAcquisitionPrice"]);
    expect(r.status).toBe(400);
  });
  it("B-4 남은 환산 플래그 → ⑧ 이슈 0(종전 「환산 미지원」) · 본문 useEstimatedAcquisition false · 327,250,000", async () => {
    const r = await run(single({ useEstimatedAcquisition: true }));
    expect(r.fields).toEqual([]);
    expect(r.body.useEstimatedAcquisition).toBe(false);
    // 화면에 없는 기준시가 칸(환산 모드 전용)은 싣지 않는다
    expect(r.body.standardPriceAtTransfer).toBeUndefined();
    expect(r.tax).toBe(327_250_000);
  });
  it("B-5 API 취득가액 0 · 평가액 999,000,000 → 400 (종전 200 · 양도차손 · 세액 0)", async () => {
    const r = await run(single(), (b) => { b.acquisitionPrice = 0; b.redevelopment.rightsValue = 999_000_000; });
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["acquisitionPrice"]);
  });
  it("B-6 컴패니언 남은 감정·매매사례·환산 플래그 → ⑧ 이슈 0 · 실거래가와 같은 합산 결정세액", async () => {
    const base = await run(bundle());
    expect(base.status).toBe(200);
    for (const flag of [{ isAppraisalAcquisition: true }, { isSalesCaseAcquisition: true, similarSalesValue: "500,000,000" }, { useEstimatedAcquisition: true }]) {
      const r = await run(bundle(flag));
      expect(r.fields, JSON.stringify(flag)).toEqual([]);
      expect(r.body.companionAssets[0].acquisitionMethod, JSON.stringify(flag)).toBeUndefined();
      expect(r.body.companionAssets[0].useEstimatedAcquisition, JSON.stringify(flag)).toBe(false);
      expect(r.total, JSON.stringify(flag)).toBe(base.total);
    }
  });
  it("B-8 증여 승계 · 남은 감정가액 플래그 → 증여 신고가액으로 · 327,250,000 (리뷰 게이트 확인 필요 2)", async () => {
    const r = await run(single({ acquisitionCause: "gift", isAppraisalAcquisition: true }));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionPrice).toBe(450_000_000);
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.tax).toBe(327_250_000);
  });
  it("B-9 ⑥ 사이드바 — 남은 감정가액 플래그로 필요경비를 「계산 후 표시」로 미루지 않는다(실거래가 승계와 같다)", () => {
    const row = (over: Record<string, unknown>) => computeTransferPerAssetSummary(single(over), null).rows[0];
    expect(row({ isAppraisalAcquisition: true }).expensePending).toBe(row({}).expensePending);
    expect(row({ isAppraisalAcquisition: true }).expensePending).toBe(false);
  });
  it("B-7 컴패니언 실가 거래 모드 · 남은 환산 플래그 → 숨은 양도시 기준시가를 싣지 않는다(안분 키 칸도 없는 모드)", async () => {
    const f = bundle({ useEstimatedAcquisition: true });
    f.bundledSaleMode = "actual";
    const r = await run(f);
    expect(r.fields).toEqual([]);
    expect(r.body.companionAssets[0].standardPriceAtTransfer).toBeUndefined();
  });
});
