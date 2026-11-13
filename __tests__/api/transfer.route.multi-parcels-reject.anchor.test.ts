/**
 * anchor — 다건 합산(`/api/calc/transfer/multi`)이 다필지(`parcels`)를 거부한다 (⑫ ≡ ⑧) · 계획서 docs/00-pm/early-return-mixed-use-aggregate-audit.plan.md (Q-1 a)
 *
 * 종전: ⑧(`validateMultiSupportedMode`)은 화면에서 막지만 ⑫ `MULTI_REJECT_RULES`에 `parcels` 규칙이 없어 직접 API가 200으로 계산됐고,
 * 집계 자산 행이 취득가액 0 · 필요경비 406,000,000(진짜 400,000,000 / 6,000,000)으로 표시됐다.
 *
 *  · PR-1 다필지 → 400 + 문구 + path `parcels` · PR-2 ⑧ ≡ ⑫ 같은 문구
 *  · PR-3 빈 `parcels: []`는 통과 · PR-4 다필지 없는 다건은 종전대로 200
 *  · PR-5 단건 다필지는 불변(200 · 필요경비 6,000,000 — #3310)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_PARCELS_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_REJECT_RULES } from "@/lib/api/transfer-tax-schema-multi-refines";

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

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
const parcel = (id: string) => ({ id, acquisitionDate: "2015-01-01", acquisitionMethod: "actual", acquisitionPrice: 200_000_000, acquisitionArea: 100, transferArea: 100, expenses: 3_000_000 });
const LAND = {
  ...COMMON, propertyType: "land", transferPrice: 800_000_000, transferDate: "2026-03-01", acquisitionPrice: 400_000_000, acquisitionDate: "2015-01-01", expenses: 6_000_000,
  useEstimatedAcquisition: false, acquisitionCause: "purchase",
};
const req = (u: string, b: object) => new NextRequest(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const multi = (prop: object) => MULTI(req("http://localhost/api/calc/transfer/multi", { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [{ propertyId: "p1", propertyLabel: "p1", ...prop }] }));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("PR 다건 다필지 거부 (Q-1 a)", () => {
  it("PR-1 다필지를 담은 다건은 400 — 문구 + path parcels (종전 200 · 취득가액 0 / 필요경비 406,000,000)", async () => {
    const res = await multi({ ...LAND, parcels: [parcel("a"), parcel("b")] });
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toContain(MULTI_PARCELS_UNSUPPORTED_MESSAGE);
    expect(text).toContain("parcels");
  });
  it("PR-2 ⑧ ≡ ⑫: 화면 차단 문구와 서버 거부 문구가 같다", () => {
    const f = createDefaultTransferFormData();
    f.assets[0] = { ...f.assets[0], assetKind: "land", parcelMode: true } as never;
    expect(validateMultiSupportedMode(f)).toBe(MULTI_PARCELS_UNSUPPORTED_MESSAGE);
    expect(MULTI_REJECT_RULES.parcels([{}])).toBe(MULTI_PARCELS_UNSUPPORTED_MESSAGE);
    expect(MULTI_PARCELS_UNSUPPORTED_MESSAGE).toBe("다필지 토지는 단건 계산기에서만 지원됩니다.");
  });
  it("PR-3 빈 parcels 배열 · 값 없음은 통과 — 단건 엔진도 다필지로 보지 않는다", async () => {
    expect(MULTI_REJECT_RULES.parcels([])).toBeNull();
    expect(MULTI_REJECT_RULES.parcels(undefined)).toBeNull();
    expect((await multi({ ...LAND, parcels: [] })).status).toBe(200);
  });
  it("PR-4 다필지 없는 다건은 종전대로 200 · 취득가액 400,000,000 / 필요경비 6,000,000", async () => {
    const res = await multi(LAND);
    expect(res.status).toBe(200);
    const p = ((await res.json()) as { data: { properties: { acquisitionPrice: number; necessaryExpense: number }[] } }).data.properties[0];
    expect(p).toMatchObject({ acquisitionPrice: 400_000_000, necessaryExpense: 6_000_000 });
  });
  it("PR-5 단건 다필지는 불변: 200 · 필요경비 6,000,000 (#3310)", async () => {
    const res = await SINGLE(req("http://localhost/api/calc/transfer", { ...LAND, acquisitionPrice: 0, expenses: 0, parcels: [parcel("a"), parcel("b")] }));
    expect(res.status).toBe(200);
    const r = ((await res.json()) as { data: { result: { expenses: number; transferGain: number } } }).data.result;
    expect(r).toMatchObject({ expenses: 6_000_000, transferGain: 394_000_000 });
  });
});
