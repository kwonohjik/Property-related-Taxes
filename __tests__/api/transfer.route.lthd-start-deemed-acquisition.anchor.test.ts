/**
 * 장기보유특별공제 기산일 — 의제취득일 하한(2026-11-11 사용자 결정 · 계획서 docs/00-pm/remaining-4-measurements.plan.md §I).
 * 1984.12.31. 이전 취득 토지·건물은 1985.1.1.에 취득한 것으로 본다(법률 제4803호 부칙 제8조) · 보유기간은 취득일부터(소득세법 §95④).
 * 종전: 상속 1983-06-01 시료(G9)의 `lthdStartDate`가 1983-06-01이었다. 공제율은 두 날짜 모두 15년 이상 30%라 세액은 같다.
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
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const B: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: "1999-06-01",
  inheritanceStartDate: "1999-06-01", decedentAcquisitionDate: "1980-01-01", actualSalePrice: "500000000", standardPriceAtTransfer: "300000000",
  standardPriceAtAcq: "200000000", publishedValueAtInheritance: "100000000", inheritanceValuationMethod: "supplementary",
};
const V: Loose = { inhBuildingSec164Value: "200000000" };
const at = (d: string): Loose => ({ acquisitionDate: d, inheritanceStartDate: d });

function form(a: Loose): TransferFormData {
  return rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: (a.contractTotal as string) ?? "500000000",
    assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  })) as TransferFormData;
}
async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  const res = (r.result ?? {}) as Loose;
  return { fe8: allIssues(f).map((i) => i.field), status: r.status, start: String(res.lthdStartDate ?? "").slice(0, 10), lthd: res.longTermHoldingDeduction as number, tax: res.determinedTax as number };
}
const P: Loose = { ...B, acquisitionCause: "purchase", inheritanceStartDate: "", decedentAcquisitionDate: "", publishedValueAtInheritance: "", fixedAcquisitionPrice: "100000000" };

describe("LS-1 의제취득일 전 취득 — 장기보유 기산일 1985-01-01", () => {
  it("상속 1983-06-01 건물: 기산일 1985-01-01(종전 1983-06-01)", async () => {
    const r = await run({ ...B, ...at("1983-06-01") });
    expect([r.status, r.start]).toEqual([200, "1985-01-01"]);
  });
  it("경계 — 매매 1984-12-31 건물: 기산일 1985-01-01", async () => {
    const r = await run({ ...P, acquisitionDate: "1984-12-31" });
    expect([r.status, r.start]).toEqual([200, "1985-01-01"]);
  });
  it("매매 1980-05-01 건물: 기산일 1985-01-01", async () => {
    const r = await run({ ...P, acquisitionDate: "1980-05-01" });
    expect([r.status, r.start]).toEqual([200, "1985-01-01"]);
  });
});

describe("LS-2 의제취득일 이후는 종전 그대로", () => {
  it("상속 1999-06-01: 기산일 1999-06-01", async () => {
    const r = await run({ ...B, ...V });
    expect([r.status, r.start]).toEqual([200, "1999-06-01"]);
  });
  it("매매 1985-01-01 당일: 기산일 1985-01-01", async () => {
    const r = await run({ ...P, acquisitionDate: "1985-01-01" });
    expect([r.status, r.start]).toEqual([200, "1985-01-01"]);
  });
});
