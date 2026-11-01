/**
 * 함께 양도 × 청산금 수령 단독 신고 — 묶음 양도일은 함께 파는 자산의 폼 양도일이고, APT는 자기 고시일 축으로 계산된다.
 * 과세연도가 다르거나, 안분하거나, 계약서 가액이 수령액과 다르면 ⑧·⑫에서 막는다
 * (계획서 `docs/02-design/features/bundle-receive-only-order.plan.md`).
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
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE,
  BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE,
  BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE,
} from "@/lib/calc/bundle-receive-only";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const APT = { assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000", redevSettlementDirection: "receive", redevSettlementAmount: "50000000", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", redevReceiveOnlyMode: "yes", actualSalePrice: "50000000", standardPriceAtTransfer: "100000000" };
const HOUSE = { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000", addressJibun: "서울 B 2", actualSalePrice: "1000000000" };
const HH = { isOneHousehold: false, householdHousingCount: "2", residencePeriodMonths: "0", filingDate: "2026-12-31", contractTotalPrice: "1050000000", bundledSaleMode: "actual" };
const D = (d: string, over: L = {}) => ({ ...APT, redevSettlementSaleDate: d, ...over });

function form(list: L[], over: L = {}) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, HH, { transferDate: "2026-06-01" }, over);
  f.assets = list.map((a, k) => ({ ...makeDefaultAsset(k + 1), ...a, assetId: `A${k + 1}` }));
  return f as never;
}
async function calc(f: never) {
  const body = (await captureBody(f)) as L;
  const r = await postTransfer(body);
  const data = r.json?.data as L | undefined;
  return { status: r.status, body, error: r.json?.error as L | undefined, tax: data?.aggregated?.totalTax ?? data?.result?.totalTax, props: (data?.aggregated?.properties ?? []) as L[] };
}
const ALL = [BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE, BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE, BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE];
const conflicts = (f: never) => allIssues(f).map((i) => i.message).filter((m) => ALL.includes(m));

describe("같은 과세연도 — 카드 순서와 무관하다", () => {
  it("고시일 2026-03 — 어느 순서든 216,953,000, 주택 장특 154,000,000", async () => {
    const a = await calc(form([D("2026-03-01"), HOUSE]));
    const b = await calc(form([HOUSE, D("2026-03-01")]));
    expect(a.body.transferDate).toBe("2026-06-01");
    expect(b.body.transferDate).toBe("2026-06-01");
    expect(a.tax).toBe(216_953_000);
    expect(b.tax).toBe(216_953_000);
    expect(a.props.map((p) => p.longTermHoldingDeduction)).toEqual([5_000_000, 154_000_000]);
    expect(b.props.map((p) => p.longTermHoldingDeduction)).toEqual([154_000_000, 5_000_000]);
  });

  it("같은 날 — 값이 그대로다", async () => {
    expect((await calc(form([D("2026-06-01"), HOUSE]))).tax).toBe(216_953_000);
    expect((await calc(form([HOUSE, D("2026-06-01")]))).tax).toBe(216_953_000);
  });
});

describe("대조 — 미러가 필요한 경로는 그대로다", () => {
  it("단건 — 양도일 = 고시일 다음날", async () => {
    const t = await calc(form([D("2026-03-01")], { contractTotalPrice: "50000000" }));
    expect(t.body.transferDate).toBe("2026-03-01");
    expect(t.tax).toBe(605_000);
  });

  it("전 자산 단독 함께 양도 — 첫 자산의 고시일 다음날", async () => {
    const second = { acquisitionDate: "2016-03-01", redevActualAcquisitionPrice: "100000000", addressJibun: "서울 C 3" };
    const a = await calc(form([D("2026-03-01"), D("2026-05-01", second)], { contractTotalPrice: "100000000" }));
    expect(a.body.transferDate).toBe("2026-03-01");
    expect(a.tax).toBe(5_626_500);
  });

  it("단독 없는 묶음 — 새 판정이 걸리지 않는다", () => {
    const h2 = { ...HOUSE, addressJibun: "서울 C 3", actualSalePrice: "50000000" };
    expect(conflicts(form([h2, HOUSE]))).toEqual([]);
    expect(conflicts(form([h2, HOUSE], { bundledSaleMode: "apportioned" }))).toEqual([]);
  });

  it("축 B는 이 판정 밖이다 — 계약서 가액·안분 설정과 무관", () => {
    const share = (n: string) => D("2026-03-01", { ownershipNumerator: n, ownershipDenominator: "100", ownershipRemainderThirdParty: "", actualSalePrice: "" });
    const f = form([share("50"), share("50")], { assetSplitMode: "fractional", contractTotalPrice: "2000000000" });
    expect(conflicts(f)).toEqual([]);
  });

  it("전 자산 부담부증여 묶음은 이 판정 밖이다 — 양도가액을 채무가 정한다", async () => {
    const BG = { transferType: "burdened_gift" };
    const f = form([D("2020-03-01", BG), { ...HOUSE, ...BG }]);
    expect(conflicts(f)).toEqual([]);
    const t = await calc(f);
    for (const m of ALL) expect(JSON.stringify(t.error ?? "")).not.toContain(m);
  });

  it("단건 apportioned 설정이 남아 있어도 걸리지 않는다", () => {
    expect(conflicts(form([D("2020-03-01")], { bundledSaleMode: "apportioned", contractTotalPrice: "50000000" }))).toEqual([]);
  });
});

describe("막는 입력 — ⑧·⑫ 같은 문구", () => {
  const BLOCKED: [string, L[], L, string][] = [
    ["다른 과세연도 · APT 먼저", [D("2020-03-01"), HOUSE], {}, BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE],
    ["다른 과세연도 · 주택 먼저", [HOUSE, D("2020-03-01")], {}, BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE],
    ["전 자산 단독 · 고시일 연도가 다름", [D("2025-03-01"), D("2026-03-01", { addressJibun: "서울 C 3" })], { contractTotalPrice: "100000000" }, BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE],
    ["apportioned · APT 먼저", [D("2026-06-01"), HOUSE], { bundledSaleMode: "apportioned" }, BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE],
    ["apportioned · 주택 먼저", [HOUSE, D("2026-06-01")], { bundledSaleMode: "apportioned" }, BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE],
    ["계약서 가액 ≠ 수령액 · APT 먼저", [D("2026-06-01", { actualSalePrice: "70000000" }), HOUSE], { contractTotalPrice: "1070000000" }, BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE],
    ["계약서 가액 ≠ 수령액 · 주택 먼저", [HOUSE, D("2026-06-01", { actualSalePrice: "70000000" })], { contractTotalPrice: "1070000000" }, BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE],
  ];
  it.each(BLOCKED)("%s", async (_n, list, over, message) => {
    const f = form(list, over);
    expect(conflicts(f)).toEqual([message]);
    const t = await calc(f);
    expect(t.status).toBe(400);
    expect(JSON.stringify(t.error)).toContain(message);
  });

  it("증환지가 강제하는 안분 모드도 막는다 — 저장값이 actual이어도", () => {
    const f = form([D("2026-06-01"), { ...HOUSE, isReplotIncrement: true }]);
    expect(conflicts(f)).toEqual([BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE]);
  });

  it("지분 APT × 함께 양도 — 계약서 가액 × 지분율 = 수령액이면 통과한다(⑧ ④ 같은 값)", async () => {
    const share = D("2026-06-01", { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", actualSalePrice: "100000000" });
    const f = form([share, HOUSE]);
    expect(conflicts(f)).toEqual([]);
    expect((await calc(f)).status).toBe(200);
  });
});
