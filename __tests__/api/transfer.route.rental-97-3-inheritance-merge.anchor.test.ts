/**
 * anchor — §97의3 상속 합산(V-14)이 화면 → ④ → ⑬ body → ⑫ Zod → ⑭ 매퍼 → 라우터(명시 매핑) → 엔진까지 간다
 *
 * 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md §5. 엔진 판정은
 * `__tests__/tax-engine/transfer/rental-97-3-inheritance-merge.anchor.test.ts`.
 * 상속개시일은 자산 카드 취득일 · 상속 자산에서만 싣는다 · 직접 API의 비상속·변경신고 동시 입력은 ⑫ 400.
 * ⑧ 안분 검사는 엔진과 같은 개시일(피상속인 의제 개시일 — Q-3 Y)로 「안분 필요」를 판정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** 상속개시일(카드 취득일) 2019-01-01 · 상속인 등록·임대 2019-02-01 · 양도 2026-06-01 · 피상속인 2016-05-01 */
function form(cause: "inheritance" | "purchase", inherited: boolean, over: Record<string, unknown> = {}): TransferFormData {
  const red = {
    ...getReductionDefault("rental_97_3"),
    registrationDate: "2019-02-01", rentalStartDate: "2019-02-01", isTaxRegistered: true, taxRegistrationDate: "2019-02-01",
    rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
    officialPriceAtStart: "300,000,000", isNationalHousingScale: true, region: "capital",
    stdPriceAtAcquisition: "", stdPriceAtTransfer: "",
    isInherited973: inherited, decedentRegistrationDate973: inherited ? "2016-05-01" : "", decedentRentalStartDate973: inherited ? "2016-05-01" : "",
    ...over,
  };
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: cause, acquisitionDate: "2019-01-01", decedentAcquisitionDate: "2010-01-01",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "400,000,000", inheritanceValuation: "400,000,000",
    standardPriceAtAcq: "", standardPriceAtTransfer: "600,000,000",
    reductions: [red],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-06-01", contractTotalPrice: "900000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}

async function postBody(body: Any) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Any;
  return { status: res.status, result: json.data?.result ?? json.data, error: json.error };
}
async function post(f: TransferFormData) {
  const body = (await captureBody(f)) as Any;
  return { body, ...(await postBody(body)) };
}
const red973 = (body: Any) => (body.reductions ?? []).find((r: Any) => r.type === "rental_97_3");
const codes = (r: Any) => (r.result.rental97LthdDetail?.ineligibleReasons ?? []).map((i: Any) => i.code);

describe("상속 자산 — 합산 관통", () => {
  it("합산 없음 → 상속인 분 7년 · RENTAL_PERIOD_SHORT (회귀)", async () => {
    const r = await post(form("inheritance", false, { stdPriceAtAcquisition: "400,000,000", stdPriceAtTransfer: "900,000,000" }));
    expect(r.status).toBe(200);
    expect(red973(r.body).inheritance973).toBeUndefined();
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("🔴 토글 ON → ④ body에 상속개시일 = 카드 취득일 · ⑫⑭·라우터 통과 · 10년 70% · 구간 echo", async () => {
    const f = form("inheritance", true);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(red973(r.body).inheritance973).toEqual({
      inheritanceDate: "2019-01-01", decedentRegistrationDate: "2016-05-01", decedentRentalStartDate: "2016-05-01",
    });
    expect(r.result.rental97LthdDetail).toMatchObject({
      isEligible: true,
      overrideRate: 0.7,
      eligibleRentalYears: 10,
      rentalGainRatio: 1,
      rentalPeriod973: { decedent: { start: "2016-05-01", end: "2019-01-01" }, heir: { start: "2019-02-01", end: "2026-06-01" } },
    });
  });

  it("🔴 ⑧ 안분 — 합산이면 개시일이 상속개시일 전이라 안분 기준시가를 요구하지 않는다(엔진 비율 1과 같다) · 합산 없으면 요구한다", () => {
    expect(validateStepDetailed(2, form("inheritance", true))).toBeNull();
    expect(validateStepDetailed(2, form("inheritance", false))?.field).toBe("reduction.rental_97_3.stdPriceAtAcquisition");
  });

  it("⑧ — 토글 ON · 피상속인 날짜가 상속개시일 이후 → 피상속인 임대개시일 칸", () => {
    const issue = validateStepDetailed(2, form("inheritance", true, { decedentRentalStartDate973: "2019-01-01" }));
    expect(issue?.field).toBe("reduction.rental_97_3.decedentRentalStartDate973");
  });

  it("⑧ — 토글 ON · 2020.7.10 이전 변경신고 → 토글 칸 (Q-2)", () => {
    const issue = validateStepDetailed(2, form("inheritance", true, { shortTermConversionMode: "before" }));
    expect(issue?.field).toBe("reduction.rental_97_3.isInherited973");
  });
});

describe("상속 자산이 아님 — 합산을 읽지 않는다", () => {
  it("매매 자산에 남은 토글 → ④ 미전송 · ⑧은 합산 칸으로 막지 않는다 · 상속인 분만", async () => {
    const f = form("purchase", true, { stdPriceAtAcquisition: "400,000,000", stdPriceAtTransfer: "900,000,000" });
    expect(validateStepDetailed(2, f)?.field ?? "").not.toMatch(/973/);
    const r = await post(f);
    expect(red973(r.body).inheritance973).toBeUndefined();
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });
});

describe("직접 API — ⑫ 400", () => {
  const withInh = async (cause: "inheritance" | "purchase", extra: Record<string, unknown> = {}) => {
    const body = (await captureBody(form(cause, false, { stdPriceAtAcquisition: "400,000,000", stdPriceAtTransfer: "900,000,000" }))) as Any;
    const reds = body.reductions.map((x: Any) =>
      x.type === "rental_97_3"
        ? { ...x, inheritance973: { inheritanceDate: "2019-01-01", decedentRegistrationDate: "2016-05-01", decedentRentalStartDate: "2016-05-01" }, ...extra }
        : x,
    );
    return postBody({ ...body, reductions: reds });
  };
  it("🔴 매매 자산 + inheritance973 → 400", async () => {
    const r = await withInh("purchase");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("inheritance973");
  });
  it("🔴 상속 자산 + inheritance973 + shortTermConversion → 400", async () => {
    const r = await withInh("inheritance", { shortTermConversion: { reportedDate: "2019-06-01", acceptedDate: "2019-06-10" } });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("inheritance973");
  });
});
