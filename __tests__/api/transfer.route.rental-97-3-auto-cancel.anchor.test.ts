/**
 * anchor — §97의3 자동말소 8년 간주(구 조특령 §97의3②2호)가 화면 → ④ → ⑬ body → ⑫ Zod → ⑭ 매퍼 → 라우터(명시 매핑) → 엔진까지 간다
 *
 * 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md §6. 엔진 판정은
 * `__tests__/tax-engine/transfer/rental-97-3-auto-cancel-deemed.anchor.test.ts`.
 * 사실관계 = 사전-2025-법규재산-0726(단기 2016-11-24 · 임대 2016-12-23 · 장기 변경 2019-07-12 · 말소 2024-11-26 · 양도 2025-07-30).
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

function form(over: Record<string, unknown> = {}): TransferFormData {
  const red = {
    ...getReductionDefault("rental_97_3"),
    registrationDate: "2016-11-24", rentalStartDate: "2016-12-23", isTaxRegistered: true, taxRegistrationDate: "2016-11-24",
    shortTermConversionMode: "before", conversionReportedDate: "2019-07-12", conversionAcceptedDate: "2019-07-12",
    rentIncreaseViolationMode: "none", hasVacancyOverGrace: false,
    officialPriceAtStart: "200,000,000", isNationalHousingScale: true, region: "capital",
    rentalContinuesToTransfer: false, rentalEndDate: "2024-11-26",
    stdPriceAtRentalEnd: "400,000,000", stdPriceAtAcquisition: "200,000,000", stdPriceAtTransfer: "450,000,000",
    autoCancelled973: true,
    ...over,
  };
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2017-01-06",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "400,000,000",
    reductions: [red],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-07-30", contractTotalPrice: "900000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
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

describe("화면 → 엔진 관통", () => {
  it("🔴 토글 ON · 말소 선택 → ④ body autoCancelled973 · 라우터 통과 · 50% · 간주 echo", async () => {
    const r = await post(form());
    expect(r.status).toBe(200);
    expect(red973(r.body).autoCancelled973).toBe(true);
    expect(r.result.rental97LthdDetail).toMatchObject({
      isEligible: true,
      overrideRate: 0.5,
      eligibleRentalYears: 8,
      autoCancelDeemed973: { cancelledDate: "2024-11-26", actualYears: 7 },
    });
  });

  it("토글 OFF → 미전송 · 실제 기간으로 RENTAL_PERIOD_SHORT (회귀)", async () => {
    const r = await post(form({ autoCancelled973: false }));
    expect(red973(r.body).autoCancelled973).toBeUndefined();
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("「양도일까지 등록·임대 유지」 + 남은 토글 → ④ 미전송 · ⑧은 토글로 막지 않는다", async () => {
    const f = form({ rentalContinuesToTransfer: true });
    expect(validateStepDetailed(2, f)?.field ?? "").not.toMatch(/autoCancelled973/);
    const r = await post(f);
    expect(red973(r.body).autoCancelled973).toBeUndefined();
    expect(r.result.rental97LthdDetail?.autoCancelDeemed973).toBeUndefined();
  });
});

describe("⑧ — 간주가 성립하지 않는 입력", () => {
  it("말소일 2020-08-17 → 종료일 칸 (부칙 제31086호 §2 · 민특법 부칙 §7 안내)", () => {
    const issue = validateStepDetailed(2, form({ shortTermConversionMode: "none", registrationDate: "2013-01-15", rentalStartDate: "2013-01-15", taxRegistrationDate: "2013-01-15", rentalEndDate: "2020-08-17" }));
    expect(issue?.field).toBe("reduction.rental_97_3.rentalEndDate");
    expect(issue?.message).toMatch(/2020\.8\.18\.에 말소된 것으로 봅니다/);
  });

  it("말소일 2020-08-18 → 통과", () => {
    const issue = validateStepDetailed(2, form({ shortTermConversionMode: "none", registrationDate: "2013-01-15", rentalStartDate: "2013-01-15", taxRegistrationDate: "2013-01-15", rentalEndDate: "2020-08-18" }));
    expect(issue?.field ?? "").not.toMatch(/rentalEndDate|autoCancelled973/);
  });
});

describe("직접 API — ⑫ 400 (⑧과 같은 leaf)", () => {
  const send = async (patch: (r: Any) => Any) => {
    const body = (await captureBody(form({ autoCancelled973: false }))) as Any;
    return postBody({ ...body, reductions: body.reductions.map((x: Any) => (x.type === "rental_97_3" ? patch(x) : x)) });
  };
  it("🔴 종료(말소) 없이 autoCancelled973 → 400", async () => {
    const r = await send((x) => ({ ...x, autoCancelled973: true, rentalContinuesToTransfer: true, rentalEndDate: undefined }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("autoCancelled973");
  });
  it("🔴 말소일 2020-08-17 → 400", async () => {
    const r = await send((x) => ({ ...x, autoCancelled973: true, rentalEndDate: "2020-08-17" }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("2020.8.18. 이후 말소분부터");
  });
  it("🔴 장기 등록(수리일) 2020-08-18 → 400", async () => {
    const r = await send((x) => ({ ...x, autoCancelled973: true, shortTermConversion: { reportedDate: "2020-08-18", acceptedDate: "2020-08-18" } }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("종전 민간임대주택법");
  });
  it("정상 입력 → 200 · 50%", async () => {
    const r = await send((x) => ({ ...x, autoCancelled973: true }));
    expect(r.status).toBe(200);
    expect(r.result.rental97LthdDetail?.overrideRate).toBe(0.5);
  });
});
