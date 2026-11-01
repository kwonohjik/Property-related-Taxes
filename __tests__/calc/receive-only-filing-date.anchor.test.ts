/**
 * 청산금 수령 단독 신고 — 신고기한·가산세의 기준 양도일. 세액은 고시일 다음날을 쓰므로 폼 양도일도 같아야 하고,
 * 묶음에 기한이 둘이면 가장 이른 기한을 넘긴 신고는 담을 수 없다(계획서 `docs/02-design/features/receive-only-filing-deadline.plan.md`).
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
import { allIssues, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { derivePenaltyFields } from "@/lib/calc/filing-deadline";
import {
  RECEIVE_ONLY_FILING_DATE_MESSAGE,
  RECEIVE_ONLY_FILING_DEADLINES_MESSAGE,
} from "@/lib/calc/receive-only-filing-date";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const APT = { assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "2000000000", redevSettlementDirection: "receive", redevSettlementAmount: "500000000", redevSettlementSaleDate: "2024-03-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", redevReceiveOnlyMode: "yes", actualSalePrice: "500000000", standardPriceAtTransfer: "100000000" };
const HOUSE = { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000", addressJibun: "서울 B 2", actualSalePrice: "1000000000" };
const HH = { isOneHousehold: false, householdHousingCount: "2", residencePeriodMonths: "0", bundledSaleMode: "actual", contractTotalPrice: "500000000" };

function form(transferDate: string, filingDate: string, list: L[], over: L = {}) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, HH, { transferDate, filingDate }, over);
  f.assets = list.map((a, k) => ({ ...makeDefaultAsset(k + 1), ...a, assetId: `A${k + 1}` }));
  Object.assign(f, derivePenaltyFields(transferDate, filingDate, f as never));
  return f as never;
}
const shares = (a: L = APT) => ["50", "50"].map((p) => ({ ...a, redevSettlementAmount: "250000000", ownershipNumerator: p, ownershipDenominator: "100", ownershipRemainderThirdParty: "" }));
const AXIS = { assetSplitMode: "fractional" };
const BUNDLE = { contractTotalPrice: "1500000000" };
const ALL = [RECEIVE_ONLY_FILING_DATE_MESSAGE, RECEIVE_ONLY_FILING_DEADLINES_MESSAGE];
const issues = (f: never) => allIssues(f).map((i) => i.message).filter((m) => ALL.includes(m));
async function tax(f: never) {
  const r = await postTransfer((await captureBody(f)) as L);
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  const d = r.json?.data as L;
  return (d.aggregated ?? d.result).totalTax as number;
}

describe("전 자산 단독 — 폼 양도일이 고시일 다음날이어야 한다", () => {
  it.each([
    ["단건 · 폼이 늦음", "2024-06-01", [APT], {}],
    ["단건 · 폼이 빠름", "2024-01-10", [APT], {}],
    ["축 B", "2024-06-01", shares(), AXIS],
    ["전 자산 단독 함께 양도 · 첫 자산과 다름", "2024-05-01", [APT, { ...APT, redevSettlementSaleDate: "2024-05-01", addressJibun: "서울 C 3" }], { contractTotalPrice: "1000000000" }],
  ] as [string, string, L[], L][])("막는다 — %s", (_n, td, list, over) => {
    expect(issues(form(td, "2024-04-15", list, over))).toEqual([RECEIVE_ONLY_FILING_DATE_MESSAGE]);
  });

  it.each([
    ["기한 내 5/15", "2024-05-15", 97_405_000],
    ["기한 후 7/15", "2024-07-15", 107_117_164],
    ["기한 후 9/15", "2024-09-15", 108_324_986],
    ["기한 내 4/15", "2024-04-15", 97_405_000],
  ])("날짜가 같으면 통과하고 기한대로 계산된다 — %s", async (_n, filing, expected) => {
    const f = form("2024-03-01", filing, [APT]);
    expect(issues(f)).toEqual([]);
    expect(await tax(f)).toBe(expected);
  });

  it("축 B도 같은 값", async () => {
    const f = form("2024-03-01", "2024-07-15", shares(), AXIS);
    expect(issues(f)).toEqual([]);
    expect(await tax(f)).toBe(107_117_164);
  });

  it("고시일을 아직 넣지 않았으면 이 판정을 내지 않는다 — 기존 필수 안내가 맡는다", () => {
    expect(issues(form("2024-06-01", "2024-07-15", [{ ...APT, redevSettlementSaleDate: "" }]))).toEqual([]);
  });
});

describe("함께 양도 — 자산별 기한이 다르면", () => {
  it.each([
    ["APT 먼저", [APT, HOUSE]],
    ["주택 먼저", [HOUSE, APT]],
  ] as [string, L[]][])("가장 이른 기한을 넘긴 신고는 막는다 — %s", (_n, list) => {
    expect(issues(form("2024-06-01", "2024-07-15", list, BUNDLE))).toEqual([RECEIVE_ONLY_FILING_DEADLINES_MESSAGE]);
    expect(issues(form("2024-06-01", "2024-09-15", list, BUNDLE))).toEqual([RECEIVE_ONLY_FILING_DEADLINES_MESSAGE]);
  });

  it("가장 이른 기한 날 신고는 통과한다 — 가산세 없음", async () => {
    const f = form("2024-06-01", "2024-05-31", [APT, HOUSE], BUNDLE);
    expect(issues(f)).toEqual([]);
    expect(await tax(f)).toBe(357_555_000);
  });

  it("전 자산 부담부증여 묶음은 3개월 기한으로 본다(§105①3호)", () => {
    const BG = { transferType: "burdened_gift" };
    const list = [{ ...APT, ...BG }, { ...HOUSE, ...BG }];
    expect(issues(form("2024-06-01", "2024-06-15", list, BUNDLE))).toEqual([]);
    expect(issues(form("2024-06-01", "2024-07-15", list, BUNDLE))).toEqual([RECEIVE_ONLY_FILING_DEADLINES_MESSAGE]);
  });

  it("양도일이 비어 있으면 이 판정을 내지 않는다 — 기존 필수 안내가 맡는다", () => {
    expect(issues(form("", "2024-07-15", [APT, HOUSE], BUNDLE))).toEqual([]);
  });

  it("같은 달이면 기한이 같아 기한 후 신고도 통과한다", async () => {
    const list = [{ ...APT, redevSettlementSaleDate: "2024-06-01" }, HOUSE];
    expect(issues(form("2024-06-20", "2024-08-15", list, BUNDLE))).toEqual([]);
    const late = form("2024-06-20", "2024-09-15", list, BUNDLE);
    expect(issues(late)).toEqual([]);
    expect(await tax(late)).toBe(391_061_154);
  });
});

describe("대조 — 다른 입력은 판정 밖이다", () => {
  it("단독 없는 단건·묶음, 동시 신고", () => {
    expect(issues(form("2024-06-01", "2024-09-15", [HOUSE], { contractTotalPrice: "1000000000" }))).toEqual([]);
    expect(issues(form("2024-06-01", "2024-09-15", [{ ...HOUSE, addressJibun: "서울 C 3", actualSalePrice: "500000000" }, HOUSE], BUNDLE))).toEqual([]);
    expect(issues(form("2024-06-01", "2024-09-15", [{ ...APT, redevReceiveOnlyMode: "no" }], { contractTotalPrice: "2000000000" }))).toEqual([]);
  });

  it("부담부증여 단독 — 기한은 3개월로 본다(§105①3호)", () => {
    const bg = { ...APT, transferType: "burdened_gift" };
    expect(issues(form("2024-03-01", "2024-07-15", [bg]))).toEqual([]);
    expect(issues(form("2024-06-01", "2024-07-15", [bg]))).toEqual([RECEIVE_ONLY_FILING_DATE_MESSAGE]);
  });
});
