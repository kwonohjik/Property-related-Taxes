/**
 * PR-26 anchor (2026-11 리뷰 D-61 · 결정 Q-25) — §155⑳ B 「직전거주주택 양도일」은 이 주택의 보유기간 안이어야 한다
 * (소득세법 시행령 §155⑳ 후단 「…그 보유기간 중에 양도한 다른 거주주택…」 · §154⑩2호).
 *
 * 종전에는 ⑧·⑫·엔진 어디서도 범위를 보지 않아 취득 전·양도 뒤(2099년 포함) 날짜로도 B 과세분을 계산했다.
 * Q-25: 하한은 본인 취득일, 상한은 양도일(같은 날은 §154⑨ 순서 선택이라 허용). 통산 보유 주택은 막지 않고 확인 필요.
 *
 * 시료(기존 #20 B 픽스처): 취득 2009-08-12 · 양도 2026-08-01 · 15억 · 임대 1호 · 비조정 · 주택 수 2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc } from "./one-house-pr6b/_helpers";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { priorResidenceDateFieldIssue } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { priorResidenceTransferDateRange } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/prior-residence-range";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

function form(prior: string, scenario: "A" | "B" = "B") {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2026-08-01", householdHousingCount: "2", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "30" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario,
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "80", requirementsConfirmed: true }],
    priorResidenceTransferDate: prior,
    standardPriceAtAcquisitionForPhrp: "300,000,000",
    standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000",
    postRegistrationResidenceMonths: "30",
    wasRegisteredRentalOrChildcare: true,
  };
  return f;
}
const D = (s: string) => new Date(s);
const issue8 = (prior: string, cause = "purchase") => {
  const f = form(prior);
  return priorResidenceDateFieldIssue(f.assets[0].rentalHousingException!, { ...f.assets[0], acquisitionCause: cause } as never, "자산1", f.transferDate);
};
async function captureBody(f: ReturnType<typeof form>): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const real = globalThis.fetch;
  globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }) as never;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* 본문만 */
  } finally {
    globalThis.fetch = real;
  }
  return body;
}

describe("술어 — 경계(본인 취득일 · 양도일 · 통산 기산일)", () => {
  const acq = D("2009-08-12");
  const tr = D("2026-08-01");
  it("취득일 당일·양도일 당일은 범위 안 · 하루 밖은 막는다", () => {
    expect(priorResidenceTransferDateRange(D("2009-08-12"), acq, tr)).toBeNull();
    expect(priorResidenceTransferDateRange(D("2026-08-01"), acq, tr)).toBeNull();
    expect(priorResidenceTransferDateRange(D("2009-08-11"), acq, tr)).toBe("before_acquisition");
    expect(priorResidenceTransferDateRange(D("2026-08-02"), acq, tr)).toBe("after_transfer");
  });
  it("통산 기산일(2005)이 있으면 그 사이는 확인 필요 · 그보다 이르면 막는다", () => {
    expect(priorResidenceTransferDateRange(D("2007-01-01"), acq, tr, D("2005-01-01"))).toBe("before_acquisition_consolidated");
    expect(priorResidenceTransferDateRange(D("2004-12-31"), acq, tr, D("2005-01-01"))).toBe("before_acquisition");
  });
});

describe("⑧ — 엔진보다 넓게 막지 않는다", () => {
  it("범위 안·양도일 당일은 통과 · 양도일 뒤는 막는다 · 취득일 전은 매매만 막고 상속·증여·이월과세는 엔진에 맡긴다", () => {
    expect(issue8("2016-08-25")).toBeNull();
    expect(issue8("2026-08-01")).toBeNull();
    expect(issue8("2027-01-01")).not.toBeNull();
    expect(issue8("2005-01-01")).not.toBeNull();
    for (const c of ["inheritance", "gift", "carryover_gift"]) expect(issue8("2005-01-01", c), c).toBeNull();
  });
  it("시나리오 A면 보지 않는다", () => {
    const f = form("2099-01-01", "A");
    expect(priorResidenceDateFieldIssue(f.assets[0].rentalHousingException!, f.assets[0], "자산1", f.transferDate)).toBeNull();
  });
});

describe("계산기 route ⑫ · 엔진", () => {
  it("범위 안(2016-08-25) → B 적용", async () => {
    const r = await runCalc(form("2016-08-25"));
    expect(r.status).toBe(200);
    expect(r.result.rentalHousingExceptionDetail.applied).toBe(true);
  });
  it("양도일 뒤(2027-01-01) → ⑫ 400", async () => {
    const r = await runCalc(form("2027-01-01"));
    expect(r.status).toBe(400);
  });
  it("취득일 전(2005-01-01) → ⑫는 통과시키고 엔진이 B 미적용 + 사유", async () => {
    const r = await runCalc(form("2005-01-01"));
    expect(r.status).toBe(200);
    const d = r.result.rentalHousingExceptionDetail;
    expect(d.applied).toBe(false);
    expect(d.eligibility.residenceFailReasons.join(" ")).toContain("취득일(2009-08-12) 전입니다");
  });
  it("④ — 시나리오 A로 바꾼 뒤 남은 직전 양도일은 보내지 않는다(숨은 값이 ⑫에 막히지 않음)", async () => {
    const body = await captureBody(form("2099-01-01", "A"));
    expect((body.rentalHousingException as Record<string, unknown>).priorResidenceTransferDate).toBeUndefined();
  });
});
