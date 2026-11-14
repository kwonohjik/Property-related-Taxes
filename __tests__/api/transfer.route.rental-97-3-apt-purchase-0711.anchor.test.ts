/**
 * anchor — §97의3① 괄호(법률 제19199호 개정 전) 「2020년 7월 11일 이후 장기일반민간임대주택으로 등록 신청한 경우로서
 * 아파트를 임대하는 민간매입임대주택」 적용 제외(G-1)가 화면 → ⑧ → ④ → ⑬ body → ⑫ Zod → ⑭ 라우터(명시 매핑) → 엔진까지 간다.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §5 A-1~A-8 (Q-1 a · Q-2 · Q-4 권장안, 사용자 결정 2026-11-14).
 * 근거: 기획재정부 재산세제과-954(2024.08.19.) — 2020.7.11. 이후 포괄승계로 등록한 아파트 장기일반 → 적용 불가.
 * 시료: 아파트 매입 · 취득 2020-07-01 · 장기 등록·사업자등록·임대 2020-07-20 · 양도 2030-08-01 · 양도차익 3억(보유 10년).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
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
    registrationDate: "2020-07-20", rentalStartDate: "2020-07-20", isTaxRegistered: true, taxRegistrationDate: "2020-07-20",
    rentIncreaseViolationMode: "none", hasVacancyOverGrace: false,
    officialPriceAtStart: "200,000,000", isNationalHousingScale: true, region: "capital",
    rentalContinuesToTransfer: true,
    stdPriceAtAcquisition: "200,000,000", stdPriceAtTransfer: "400,000,000",
    aptPurchaseAfter0711_973: "yes",
    ...over,
  };
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2020-07-01",
    actualSalePrice: "600,000,000", fixedAcquisitionPrice: "300,000,000",
    reductions: [red],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2030-08-01", contractTotalPrice: "600000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
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
/** 전 단계 차단 오류 — 첫 오류만 보면 다른 칸 오류에 가려진다 */
const stepErrors = (f: TransferFormData) => JSON.stringify([0, 1, 2, 3, 4].flatMap((step) => collectStepIssues(step, f)));

describe("G-1 화면 → 엔진 관통", () => {
  it("A-1 「예」 → ④ body true · 엔진 부적격(APT_PURCHASE_AFTER_0711) · 장특 일반 20% 60,000,000", async () => {
    const r = await post(form());
    expect(r.status).toBe(200);
    expect(red973(r.body).aptPurchaseAfter0711_973).toBe(true);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(false);
    expect(codes(r)).toContain("APT_PURCHASE_AFTER_0711");
    expect(r.result.transferGain).toBe(300_000_000);
    expect(r.result.longTermHoldingDeduction).toBe(60_000_000);
  });

  it("A-2 「아니오」 → ④ body false · 적격 70% · 장특 210,000,000 (현행과 같음)", async () => {
    const r = await post(form({ aptPurchaseAfter0711_973: "no" }));
    expect(r.status).toBe(200);
    expect(red973(r.body).aptPurchaseAfter0711_973).toBe(false);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(true);
    expect(r.result.longTermHoldingDeduction).toBe(210_000_000);
  });

  it("A-3 미답 → ⑧ 차단(필드 키 aptPurchaseAfter0711_973)", () => {
    expect(stepErrors(form({ aptPurchaseAfter0711_973: "" }))).toContain("aptPurchaseAfter0711_973");
  });

  it("A-4 장기 등록 2020-07-10 → 질문 구간 밖: ⑧ 통과 · ④ 미전송 · 적격", async () => {
    const f = form({ registrationDate: "2020-07-10", rentalStartDate: "2020-07-10", taxRegistrationDate: "2020-07-10", aptPurchaseAfter0711_973: "" });
    expect(stepErrors(f)).not.toContain("aptPurchaseAfter0711_973");
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(red973(r.body)).not.toHaveProperty("aptPurchaseAfter0711_973");
    expect(r.result.rental97LthdDetail?.isEligible).toBe(true);
  });

  it("A-5 장기 등록 2021-01-05 매입 → 질문 구간 밖 · 기존 PURCHASE_RENTAL_REG_DEADLINE", async () => {
    const f = form({ registrationDate: "2021-01-05", rentalStartDate: "2021-01-05", taxRegistrationDate: "2021-01-05", aptPurchaseAfter0711_973: "" });
    expect(stepErrors(f)).not.toContain("aptPurchaseAfter0711_973");
    const r = await post(f);
    expect(red973(r.body)).not.toHaveProperty("aptPurchaseAfter0711_973");
    expect(codes(r)).toContain("PURCHASE_RENTAL_REG_DEADLINE");
    expect(codes(r)).not.toContain("APT_PURCHASE_AFTER_0711");
  });

  it("A-6 「예」 + 자동말소 토글 → 적용 제외 사유만(간주 echo 없음 · Q-4)", async () => {
    const r = await post(form({
      rentalContinuesToTransfer: false, rentalEndDate: "2028-07-20", stdPriceAtRentalEnd: "350,000,000", autoCancelled973: true,
    }));
    expect(r.status).toBe(200);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(false);
    expect(codes(r)).toEqual(["APT_PURCHASE_AFTER_0711"]);
    expect(r.result.rental97LthdDetail?.autoCancelDeemed973).toBeUndefined();
  });

  it("A-7 단기→장기 변경신고(2020.7.10 이전 신고 · 수리 2020-07-15) → 질문 대상 아님(Q-2): ⑧ 통과 · ④ 미전송 · 엔진 사유 없음", async () => {
    const f = form({
      registrationDate: "2017-07-01", rentalStartDate: "2017-07-01", taxRegistrationDate: "2017-07-01",
      shortTermConversionMode: "before", conversionReportedDate: "2020-07-08", conversionAcceptedDate: "2020-07-15",
      aptPurchaseAfter0711_973: "",
    });
    expect(stepErrors(f)).not.toContain("aptPurchaseAfter0711_973");
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(red973(r.body).shortTermConversion).toBeDefined();
    expect(red973(r.body)).not.toHaveProperty("aptPurchaseAfter0711_973");
    // 장기 등록일(수리일) 2020-07-15가 질문 구간 안이지만 변경신고 주택이라 엔진도 적용 제외로 보지 않는다
    expect(codes(r)).not.toContain("APT_PURCHASE_AFTER_0711");
  });

  it("A-8 직접 API — 질문 구간인데 필드 없음 → ⑫ 400", async () => {
    const body = (await captureBody(form())) as Any;
    delete red973(body).aptPurchaseAfter0711_973;
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("2020.7.11");
  });
});
