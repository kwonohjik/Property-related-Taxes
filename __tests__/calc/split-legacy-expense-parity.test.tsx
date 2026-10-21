/**
 * 분리 계산 × 이전 형식 필요경비(`directExpenses`) — ⑤·⑧·④·⑫ 격자 (2026-10-21)
 *
 * 계획서: docs/00-pm/split-v7-era-and-legacy-expense.plan.md §2 · §3.2 (Q-2 a) · §4-2
 *
 * 종전: 분리 계산 자산의 이전 형식 총액을 엔진이 취득시 기준시가 비율로 파트에 나눠(⑧이 그 3칸을 요구) 신축 + 토지 상속·증여 화면에서는
 * 채울 칸이 없는 막다른 길이었고, 양도비를 넣으면 칸이 숨은 채 값이 세액을 바꿨다(69,975,600 → 68,075,600).
 * 이제 현행 자본적지출과 같은 규칙 — ⑤ 칸을 보이고 ⑧이 파트 칸으로 옮기게 막고 ④(단건·다건·함께 양도)는 싣지 않는다.
 *
 * 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) 이전 형식이 남으면 ⑧ 차단(⑧ 전용 — ④가 싣지 않아 ⑫는 200) · (C) ⑧ 차단이면 그 칸이 화면에 있다 ·
 * (D) 제외 대상(부담부증여·분리 아님)은 종전 그대로 싣는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { legacyExpenseMovesToParts } from "@/lib/calc/split-legacy-expense";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf, cForm } from "./_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const COMMON = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionDate: "2020-06-01",
  landAcquisitionDate: "2015-03-10",
  hasSeperateLandAcquisitionDate: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300,000,000",
  actualSalePrice: "1,000,000,000",
  saleSplitMode: "actual",
  landTransferPrice: "600,000,000",
  buildingTransferPrice: "400,000,000",
  landStandardPriceAtTransfer: "600,000,000",
  buildingStandardPriceAtTransfer: "400,000,000",
  transferExpense: "1,000,000",
};

type Host = { name: string; over: Record<string, unknown> };
const HOSTS: Host[] = [
  { name: "신축 + 토지 상속", over: { acquisitionCause: "newConstruction", occupancyApprovalDate: "2020-06-01", fixedAcquisitionPrice: "400,000,000", landAcquisitionCause: "inheritance", landCauseHost: "newConstruction", landDecedentAcquisitionDate: "1990-04-01" } },
  { name: "신축 + 토지 증여", over: { acquisitionCause: "newConstruction", occupancyApprovalDate: "2020-06-01", fixedAcquisitionPrice: "400,000,000", landAcquisitionCause: "gift", landCauseHost: "newConstruction" } },
  { name: "매매 + 토지 증여", over: { acquisitionCause: "purchase", buildingAcquisitionPrice: "400,000,000", landAcquisitionCause: "gift", landCauseHost: "purchase" } },
  { name: "매매 일반 분리취득", over: { acquisitionCause: "purchase", buildingAcquisitionPrice: "400,000,000" } },
  { name: "건물 상속 + 토지 매매(D2)", over: { acquisitionCause: "inheritance", inheritanceStartDate: "2020-06-01", inheritanceDate: "2020-06-01", decedentAcquisitionDate: "2000-01-01", buildingAcquisitionPrice: "400,000,000", landAcquisitionCause: "purchase", landCauseHost: "inheritance" } },
];

const asset = (h: Host, over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...COMMON, ...h.over, ...over }) as unknown as AssetForm;
const form = (a: AssetForm, over: Partial<TransferFormData> = {}) => cForm({ contractTotalPrice: "1000000000", ...over }, a);
const MSG = /이전 입력 형식으로 저장된 필요경비 5,000,000원/;
const legacyIssue = (f: TransferFormData) => issuesOf(f).find((i) => MSG.test(i.message ?? ""));
const shows = (a: AssetForm) => {
  const { container } = render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset />);
  const on = !!container.querySelector('[data-field="directExpenses"]');
  cleanup();
  return on;
};

describe.each(HOSTS)("$name", (h) => {
  const HIDDEN = { directExpenses: "5,000,000" }; // 양도비(COMMON)가 있어 종전엔 칸이 숨었다
  const VISIBLE = { directExpenses: "5,000,000", transferExpense: "" };

  it("숨은 이전 형식 — ⑤ 칸이 보이고 · ⑧이 그 칸으로 막고 · ④ expenses 0 · (⑧ 전용) ⑫ 200", async () => {
    const a = asset(h, HIDDEN);
    expect(legacyExpenseMovesToParts(a)).toBe(true);
    expect(shows(a)).toBe(true);
    const f = form(a);
    expect(legacyIssue(f)?.field).toBe("directExpenses");
    // 취득시 기준시가는 더 이상 요구하지 않는다(종전 막다른 길)
    expect(issuesOf(f).some((i) => i.field === "buildingStandardPriceAtAcq")).toBe(false);
    const body = await bodyOf(f);
    expect(body.expenses).toBe(0);
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  });

  it("보이는 이전 형식(양도비 없음) — 같은 차단", () => {
    const a = asset(h, VISIBLE);
    expect(shows(a)).toBe(true);
    expect(legacyIssue(form(a))?.field).toBe("directExpenses");
  });

  it("파트 칸이 있어도 숨은 이전 형식이 남으면 막는다 — 종전엔 숨은 총액이 잔액으로 다른 파트에 붙었다", () => {
    expect(legacyIssue(form(asset(h, { ...HIDDEN, landDirectExpenses: "2,000,000" })))?.field).toBe("directExpenses");
  });

  it("파트 칸으로 옮긴 상태 — ⑧ 통과 ⇒ ⑫ 200, 세액은 같은 금액을 파트 칸에만 넣은 것과 같다", async () => {
    const moved = form(asset(h, { landDirectExpenses: "5,000,000" }));
    expect(issuesOf(moved)).toEqual([]);
    const r = await routeOf(POST, await bodyOf(moved));
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    const ref = await routeOf(POST, await bodyOf(form(asset(h, { landDirectExpenses: "5,000,000", directExpenses: "" }))));
    expect(r.json.data.result.determinedTax).toBe(ref.json.data.result.determinedTax);
  });

  it("다건 ④도 싣지 않는다", () => {
    const payload = buildPropertyPayload(form(asset(h, HIDDEN)) as never) as Record<string, unknown>;
    expect(payload.expenses).toBe(0);
  });
});

describe("소유자 분리(취득일 같음 — 별개 취득 아님)도 분리 계산이다", () => {
  it("건물만 소유 + 숨은 이전 형식: ⑧ 차단 · ④ expenses 0", async () => {
    const owner = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-10",
      fixedAcquisitionPrice: "700,000,000",
      actualSalePrice: "1,000,000,000",
      selfOwns: "building_only",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "200",
      standardPriceAtAcq: "500,000,000",
      buildingStandardPriceAtAcq: "300,000,000",
      landStandardPriceAtTransfer: "600,000,000",
      buildingStandardPriceAtTransfer: "400,000,000",
      directExpenses: "5,000,000",
      transferExpense: "1,000,000",
    } as unknown as AssetForm;
    expect(legacyExpenseMovesToParts(owner)).toBe(true);
    expect(shows(owner)).toBe(true);
    const f = form(owner);
    expect(legacyIssue(f)?.field).toBe("directExpenses");
    expect((await bodyOf(f)).expenses).toBe(0);
  });
});

describe("함께 양도 두 번째 자산 — 같은 술어", () => {
  it("신축 + 토지 상속 컴패니언: ⑧ 차단(자산 2) · ④ companionAssets[0].directExpenses 0", async () => {
    const first = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-03-02",
      fixedAcquisitionPrice: "300,000,000",
      actualSalePrice: "400,000,000",
    } as unknown as AssetForm;
    const second = { ...asset(HOSTS[0], { directExpenses: "5,000,000" }), assetId: "a2" } as AssetForm;
    const f = cForm({ assets: [first, second], contractTotalPrice: "1400000000", bundledSaleMode: "actual" } as Partial<TransferFormData>);
    const issue = legacyIssue(f);
    expect(issue?.field).toBe("directExpenses");
    expect(issue?.assetIndex).toBe(1);
    const body = await bodyOf(f);
    const comp = (body.companionAssets as Record<string, unknown>[])[0];
    expect(comp.directExpenses).toBe(0);
  });
});

describe("제외 — 종전 그대로", () => {
  it("분리 계산이 아닌 자산: 숨은 이전 형식은 숨은 채 ④가 싣는다(종전 동작)", async () => {
    const plain = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-10",
      fixedAcquisitionPrice: "700,000,000",
      actualSalePrice: "1,000,000,000",
      directExpenses: "5,000,000",
      transferExpense: "1,000,000",
    } as unknown as AssetForm;
    expect(legacyExpenseMovesToParts(plain)).toBe(false);
    expect(shows(plain)).toBe(false);
    expect(legacyIssue(form(plain))).toBeUndefined();
    expect((await bodyOf(form(plain))).expenses).toBe(5_000_000);
  });

  it("부담부증여(④가 분리 축을 싣지 않는다): 옮기라고 하지 않는다 — 옮긴 파트 칸은 전송되지 않아 경비가 사라진다", () => {
    const bg = asset(HOSTS[3], { directExpenses: "5,000,000", transferType: "burdened_gift" });
    expect(legacyExpenseMovesToParts(bg)).toBe(false);
  });

  it("일반건물(자체 경로)·파트 이월과세(④가 이미 0)는 이 술어 밖이다", () => {
    expect(legacyExpenseMovesToParts(asset(HOSTS[3], { assetKind: "general_building", directExpenses: "5,000,000" }))).toBe(false);
  });
});
