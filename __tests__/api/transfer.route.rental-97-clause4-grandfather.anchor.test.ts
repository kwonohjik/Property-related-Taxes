/**
 * anchor — 가액요건 부칙 §2② 질문(`clause4Grandfather`)이 화면 → API 변환(④) → body(⑬) → Zod(⑫) → Route(⑭) → 엔진까지 간다 (PR-B)
 *
 * 계획서 docs/01-plan/features/rental-97-5-textbook-gaps.plan.md §3.3. 엔진 판정 자체는
 * `__tests__/tax-engine/transfer/rental-97-clause4-grandfather.anchor.test.ts`.
 * ⑫에 키가 없으면 침묵 stripping되고, 라우터(⑭ 뒤 `rental-97-router.ts`)는 명시 매핑이라 적지 않으면 조용히 사라진다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
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

/** 취득 2018-11-01(한도 적용 구간) · 즉시 등록 · 양도 2029-12-01 · 수도권 임대개시 기준시가 7억(한도 6억 초과) */
const r975 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("rental_97_5"),
  registrationDate: "2018-11-15", rentalStartDate: "2018-11-15", isTaxRegistered: true, taxRegistrationDate: "2018-11-15",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "700,000,000", isNationalHousingScale: true, isPurchaseRental: true,
  ...over,
});

function form(reduction: unknown, assetContractDate = ""): TransferFormData {
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-11-01",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "600,000,000",
    standardPriceAtAcq: "500,000,000", standardPriceAtTransfer: "800,000,000",
    assetContractDate, reductions: [reduction] as never,
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2029-12-01", contractTotalPrice: "900000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Any;
  return { body: body as Any, status: res.status, result: json.data?.result ?? json.data };
}
const codes = (r: Any) => (r.result.rental97TaxDetail?.ineligibleReasons ?? []).map((i: Any) => i.code);

describe("§97의5 — 부칙 §2② 질문 관통", () => {
  it("미응답(\"\") → body에 싣지 않는다 · 한도 적용(OFFICIAL_PRICE_EXCEEDED)", async () => {
    const r = await post(form(r975()));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("clause4Grandfathered");
    expect(codes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.result.reductionAmount).toBe(0);
  });

  it("「예」 → ⑬ body true → ⑫·⑭·라우터 통과 → 적격·감면 = 산출세액", async () => {
    const r = await post(form(r975({ clause4Grandfather: "yes" })));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain('"clause4Grandfathered":true');
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
    expect(r.result.reductionAmount).toBeGreaterThan(0);
    expect(r.result.reductionAmount).toBe(r.result.calculatedTax);
  });

  it("「아니오」 → body false → 한도 적용", async () => {
    const r = await post(form(r975({ clause4Grandfather: "no" })));
    expect(JSON.stringify(r.body)).toContain('"clause4Grandfathered":false');
    expect(codes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
  });

  it("자산 매매계약일 2018-09-01 → 질문 없이 ②2호 예외 → 적격", async () => {
    const r = await post(form(r975(), "2018-09-01"));
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
  });
});

/**
 * §97의3 — 장기보유특별공제 경로(`evaluateRental97Lthd`)는 세액감면 경로와 **다른 호출부**(`transfer-tax-lthd.ts`)다.
 * 🔴 PR-B 리뷰 D-1′(2026-11-12): 그 호출부가 자산 매매계약일을 넘기지 않아 ②2호 자동 예외가 엔진에 닿지 않았고,
 *    화면은 계약일 ≤ 2018-09-13이면 질문을 숨겨 사용자가 고칠 길도 없었다(실측 결정세액 459,435,000 vs 324,810,000).
 *    엔진 직접 호출 anchor(G-4)는 contractDate를 손으로 넣어 이 결함을 가렸다 — 그래서 라우트로 관통한다.
 */
const r973 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2018-11-15", rentalStartDate: "2018-11-15", isTaxRegistered: true, taxRegistrationDate: "2018-11-15",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "700,000,000", isNationalHousingScale: true,
  stdPriceAtAcquisition: "500,000,000", stdPriceAtTransfer: "800,000,000",
  ...over,
});
const lthdCodes = (r: Any) => (r.result.rental97LthdDetail?.ineligibleReasons ?? []).map((i: Any) => i.code);

describe("§97의3 — 장특 경로 관통", () => {
  it("계약일·답 없음 → OFFICIAL_PRICE_EXCEEDED (회귀)", async () => {
    const r = await post(form(r973()));
    expect(r.status).toBe(200);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(false);
    expect(lthdCodes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
  });

  it("🔴 자산 매매계약일 2018-09-01 → ②2호 예외가 장특 경로에도 닿는다 — 「예」와 같은 세액", async () => {
    const none = await post(form(r973()));
    const byContract = await post(form(r973(), "2018-09-01"));
    const byAnswer = await post(form(r973({ clause4Grandfather: "yes" })));
    expect(byContract.result.rental97LthdDetail?.isEligible).toBe(true);
    expect(byAnswer.result.rental97LthdDetail?.isEligible).toBe(true);
    expect(byContract.result.totalTax).toBe(byAnswer.result.totalTax);
    expect(byContract.result.totalTax).toBeLessThan(none.result.totalTax);
  });

  it("「아니오」 → 한도 적용", async () => {
    const r = await post(form(r973({ clause4Grandfather: "no" })));
    expect(JSON.stringify(r.body)).toContain('"clause4Grandfathered":false');
    expect(lthdCodes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
  });
});
