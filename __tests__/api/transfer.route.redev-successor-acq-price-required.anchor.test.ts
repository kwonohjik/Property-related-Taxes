/**
 * 승계조합원 완공 아파트 — 취득가액(승계취득가액) 필수 · 엔진 오류 코드 (계획서 `docs/02-design/features/redev-successor-acq-price-required.plan.md`).
 *
 * 종전: 엔진(`redevelopment-successor.ts`)은 취득가액과 §166④1호 평가액(rightsValue)이 모두 0이면 `TaxRateNotFoundError`로 계산을
 * 중단했고 응답은 **500**이었다. 컴패니언 arm ⑫는 `fixedAcquisitionPrice`로 이미 막지만 주 자산 ⑫에는 검사가 없었고, 증여 승계는
 * ⑧도 통과해 **화면 경로에서 500**이 났다. 지금: 주 자산 ⑫ · ⑧ 증여 분기 · 엔진 `INVALID_INPUT`(400).
 *
 * 시료(E2-01 anchor와 같은 값): 인가 2016-02-20 · 입주권 승계취득 2020-04-15 · 준공 2022-12-02 · 2023-02-16 양도 920,000,000 ·
 * 승계취득가액 450,000,000 → 양도차익 470,000,000 · 산출세액 327,250,000(단기 70%). 세율 mock.
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUCC: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2020-04-15",
  actualSalePrice: "920,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-02-20",
  redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02", redevSettlementDirection: "pay", redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", fixedAcquisitionPrice: "450,000,000", standardPriceAtTransfer: "600,000,000",
};
const HOUSE = {
  addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const BG = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920,000,000",
  bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "450,000,000", fixedAcquisitionPrice: "",
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
  return {
    fields: issues.map((i) => i.field),
    messages: issues.map((i) => i.message),
    status: r.status,
    code: r.json?.error?.code as string | undefined,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
  };
}
const zeroBoth = (b: Loose) => { b.acquisitionPrice = 0; b.redevelopment.rightsValue = 0; };

describe("S-1 주 자산 매매 승계 — 종전 500(TAX_RATE_NOT_FOUND) → 400 + 경로", () => {
  it("S-1a 화면 취득가액 비움 — ⑧과 ⑫가 함께 막는다", async () => {
    const r = await run(single({ fixedAcquisitionPrice: "" }));
    expect(r.fields).toEqual(["fixedAcquisitionPrice"]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["acquisitionPrice"]);
  });
  it("S-1b API 취득가액 0 · 평가액 0 → 400 acquisitionPrice", async () => {
    const r = await run(single(), zeroBoth);
    expect(r.status).toBe(400);
    expect(r.code).toBe("INVALID_INPUT");
    expect(r.fieldErrors).toEqual(["acquisitionPrice"]);
  });
  it("S-1c API 취득가액 0 · 평가액 450,000,000 → 막지 않는다(엔진이 §166④1호 평가액을 쓴다 — E2-01 A-2와 같은 값)", async () => {
    const r = await run(single(), (b) => { b.acquisitionPrice = 0; b.redevelopment.rightsValue = 450_000_000; });
    expect(r.status).toBe(200);
    expect(r.tax).toBe(327_250_000);
  });
  it("S-1d API 취득가액 0 · 평가액 0이어도 `inheritedAcquisition`이 있으면 막지 않는다(STEP 0.45가 취득가액을 만든다 — 리뷰 게이트 과차단 지적)", async () => {
    const IA = { mode: "post-deemed", inheritanceStartDate: "2020-04-15", assetKind: "house_apart", reportedValue: 450_000_000, reportedMethod: "supplementary" };
    for (const acquisitionCause of ["gift", "purchase"]) {
      const r = await run(single({ acquisitionCause }), (b) => { zeroBoth(b); b.inheritedAcquisition = IA; });
      expect(r.status, acquisitionCause).toBe(200);
      expect(r.tax, acquisitionCause).toBe(327_250_000);
    }
  });
});

describe("S-2 증여 승계 — 종전 ⑧ 통과 · 500(화면 경로) → ⑧ 차단 + 400", () => {
  it("S-2a 주 자산 증여 신고가액 비움", async () => {
    const r = await run(single({ acquisitionCause: "gift", fixedAcquisitionPrice: "" }));
    expect(r.fields).toEqual(["fixedAcquisitionPrice"]);
    expect(r.messages[0]).toContain("증여 신고가액");
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["acquisitionPrice"]);
  });
  it("S-2b 컴패니언 증여 신고가액 비움 — 종전 ⑧ 통과 ↔ ⑫ 400, 지금 ⑧도 같은 칸", async () => {
    const r = await run(bundle({ acquisitionCause: "gift", fixedAcquisitionPrice: "" }));
    expect(r.fields).toEqual(["fixedAcquisitionPrice"]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["companionAssets.0.fixedAcquisitionPrice"]);
  });
});

describe("S-3 정상 입력 · 제외 축 — 값 불변", () => {
  it("S-3a 매매 · 증여 · 컴패니언 정상 → 200 · 산출세액 327,250,000 · 합산 결정세액 358,535,000", async () => {
    const purchase = await run(single());
    expect(purchase.status).toBe(200);
    expect(purchase.tax).toBe(327_250_000);
    const gift = await run(single({ acquisitionCause: "gift" }));
    expect(gift.status).toBe(200);
    expect(gift.tax).toBe(327_250_000);
    const comp = await run(bundle());
    expect(comp.status).toBe(200);
    expect(comp.total).toBe(358_535_000);
  });
  it("S-3b 부담부증여 승계 · API 취득가액 0 · 평가액 0 → ⑫는 막지 않는다(§159가 취득가액을 정한다 · 엔진 200)", async () => {
    const r = await run(single(BG), zeroBoth);
    expect(r.status).toBe(200);
    expect(r.fieldErrors).toEqual([]);
  });
});
