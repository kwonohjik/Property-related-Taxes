/**
 * anchor — §97의5 상속 합산(V-13)이 화면 → ④ → ⑬ body → ⑫ Zod → ⑭ 매퍼 → 라우터(명시 매핑) → 엔진까지 간다
 *
 * 계획서 docs/01-plan/features/rental-97-5-inheritance-merge.plan.md §5. 엔진 판정은
 * `__tests__/tax-engine/transfer/rental-97-5-inheritance-merge.anchor.test.ts`.
 * 상속개시일은 자산 카드 취득일(Q-F) · 상속 자산에서만 싣는다(Q-G) · 직접 API의 비상속 합산 입력은 ⑫ 400.
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

/** 상속개시일(카드 취득일) 2017-06-01 · 상속인 등록·임대 2017-07-15 · 양도 2026-03-01 · 피상속인 2015-03-01 */
function form(cause: "inheritance" | "purchase", inherited: boolean, decedent = "2015-03-01"): TransferFormData {
  const red = {
    ...getReductionDefault("rental_97_5"),
    registrationDate: "2017-07-15", rentalStartDate: "2017-07-15", isTaxRegistered: true, taxRegistrationDate: "2017-07-15",
    rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
    officialPriceAtStart: "300,000,000", isNationalHousingScale: true, isPurchaseRental: true,
    isInherited975: inherited, decedentRegistrationDate975: inherited ? decedent : "", decedentRentalStartDate975: inherited ? decedent : "",
  };
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: cause, acquisitionDate: "2017-06-01", decedentAcquisitionDate: "2010-01-01",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "400,000,000", inheritanceValuation: "400,000,000",
    standardPriceAtAcq: "250,000,000", standardPriceAtTransfer: "600,000,000",
    reductions: [red],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-03-01", contractTotalPrice: "900000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
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
const red975 = (body: Any) => (body.reductions ?? []).find((r: Any) => r.type === "rental_97_5");
const codes = (r: Any) => (r.result.rental97TaxDetail?.ineligibleReasons ?? []).map((i: Any) => i.code);

describe("상속 자산 — 합산 관통", () => {
  it("합산 없음 → 상속인 분 8년 · RENTAL_PERIOD_SHORT (회귀)", async () => {
    const r = await post(form("inheritance", false));
    expect(r.status).toBe(200);
    expect(red975(r.body).inheritance975).toBeUndefined();
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
    expect(r.result.reductionAmount).toBe(0);
  });

  it("🔴 토글 ON → ④ body에 상속개시일 = 카드 취득일 · ⑫⑭·라우터 통과 · 적격 · 감면 = 산출세액", async () => {
    const f = form("inheritance", true);
    expect(validateStepDetailed(2, f)).toBeNull();
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(red975(r.body).inheritance975).toEqual({
      inheritanceDate: "2017-06-01", decedentRegistrationDate: "2015-03-01", decedentRentalStartDate: "2015-03-01",
    });
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
    expect(r.result.reductionAmount).toBeGreaterThan(0);
    expect(r.result.reductionAmount).toBe(r.result.calculatedTax);
    expect(r.result.rental97TaxDetail?.rentalPeriod975).toEqual({
      decedent: { start: "2015-03-01", end: "2017-06-01" },
      heir: { start: "2017-07-15", end: "2026-03-01" },
    });
  });

  it("⑧ — 토글 ON · 피상속인 날짜가 상속개시일 이후 → 피상속인 임대개시일 칸", () => {
    const issue = validateStepDetailed(2, form("inheritance", true, "2017-06-01"));
    expect(issue?.field).toBe("reduction.rental_97_5.decedentRentalStartDate975");
  });
});

describe("상속 자산이 아님 — 합산을 읽지 않는다 (Q-G)", () => {
  it("매매 자산에 남은 토글 → ④ 미전송 · ⑧ 통과(숨은 칸으로 막지 않는다) · 상속인 분만", async () => {
    const f = form("purchase", true);
    expect(validateStepDetailed(2, f)?.field ?? "").not.toMatch(/975/);
    const r = await post(f);
    expect(red975(r.body).inheritance975).toBeUndefined();
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("🔴 직접 API — 매매 자산 + inheritance975 → ⑫ 400", async () => {
    const body = (await captureBody(form("purchase", false))) as Any;
    const reds = body.reductions.map((x: Any) =>
      x.type === "rental_97_5"
        ? { ...x, inheritance975: { inheritanceDate: "2017-06-01", decedentRegistrationDate: "2015-03-01", decedentRentalStartDate: "2015-03-01" } }
        : x,
    );
    const r = await postBody({ ...body, reductions: reds });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("inheritance975");
  });
});
