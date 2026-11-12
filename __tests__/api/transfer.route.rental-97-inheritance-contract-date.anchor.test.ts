/**
 * anchor — 상속 자산에 남은 자산-수준 매매계약일이 §97의5 시한·부칙 §2② 한도 예외를 풀지 않는다 (V-11)
 *
 * 계획서 docs/01-plan/features/rental-97-5-textbook-gaps.plan.md §8 V-11 · 사용자 결정 2026-11-12 (a).
 *
 * 「매매계약일 (분양/매매)」 칸은 취득원인과 무관하게 전송되고 원인을 바꿔도 지워지지 않았다. 그 값이 조특법 §97의5①1호 괄호
 * 「2018년 12월 31일까지 매매계약을 체결하고 계약금을 납부한 경우를 포함」과 대통령령 제29241호 부칙 §2②2호에 그대로 쓰여,
 * 상속에도 예외가 열렸다(실측 감면 0 → 129,060,000 · 총세액 141,966,000 → 25,812,000).
 * 수정: 상속이면 ⑤ 칸 숨김 · ④ 미전송 · 엔진 진입부 무시(`assetContractDateForCause`). 증여는 유지(결정 (a)).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { buildPeriodContext } from "@/components/calc/transfer/UnifiedReductionPanel";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
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

type Cause = "purchase" | "inheritance" | "gift";

/** 취득 9일 뒤 등록·임대 · 수도권 · 국민주택규모 · 매입임대 */
function form(cause: Cause, acq: string, transfer: string, contract: string, officialPrice: string): TransferFormData {
  const reg = acq.slice(0, 8) + String(Number(acq.slice(8)) + 9).padStart(2, "0");
  const red = {
    ...getReductionDefault("rental_97_5"),
    registrationDate: reg, rentalStartDate: reg, isTaxRegistered: true, taxRegistrationDate: reg,
    rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
    officialPriceAtStart: officialPrice, isNationalHousingScale: true, isPurchaseRental: true,
  };
  const asset = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: cause, acquisitionDate: acq, decedentAcquisitionDate: "2010-01-01",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "400,000,000", giftValuation: "400,000,000", inheritanceValuation: "400,000,000",
    standardPriceAtAcq: "250,000,000", standardPriceAtTransfer: "600,000,000",
    assetContractDate: contract, reductions: [red],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: transfer, contractTotalPrice: "900000000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
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
const codes = (r: Any) => (r.result.rental97TaxDetail?.ineligibleReasons ?? []).map((i: Any) => i.code);
const uiAllowed = (f: TransferFormData) => checkReductionPeriod("rental_97_5", buildPeriodContext(f.assets[0], f.transferDate)).inPeriod;

/** 취득 2019-02-01 — §97의5 취득 시한(2018.12.31.) 밖 */
const upper = (cause: Cause, contract: string) => form(cause, "2019-02-01", "2030-06-01", contract, "300,000,000");
/** 취득 2018-11-01 · 수도권 7억 — 부칙 §2① 한도 적용 구간 */
const cap = (cause: Cause, contract: string) => form(cause, "2018-11-01", "2029-12-01", contract, "700,000,000");

describe("상속 — 남은 매매계약일을 읽지 않는다", () => {
  it("🔴 시한: 상속개시일 2019-02-01 + 남은 계약일 2018-12-01 → ④ 미전송 · 화면 시한 밖 · OUT_OF_PERIOD · 감면 0", async () => {
    const f = upper("inheritance", "2018-12-01");
    expect(uiAllowed(f)).toBe(false);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(r.body.assetContractDate).toBeUndefined();
    expect(codes(r)).toContain("OUT_OF_PERIOD");
    expect(r.result.reductionAmount).toBe(0);
    expect(r.result.totalTax).toBe(141_966_000);
  });

  it("🔴 한도: 상속 2018-11-01 · 7억 + 남은 계약일 2018-09-01 → OFFICIAL_PRICE_EXCEEDED · 감면 0", async () => {
    const r = await post(cap("inheritance", "2018-09-01"));
    expect(codes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.result.reductionAmount).toBe(0);
  });

  it("🔴 엔진 진입부 — ④를 거치지 않은 직접 API body(상속 + assetContractDate)도 읽지 않는다", async () => {
    const body = (await captureBody(upper("inheritance", ""))) as Any;
    expect(body.assetContractDate).toBeUndefined();
    const r = await postBody({ ...body, assetContractDate: "2018-12-01" });
    expect(r.status).toBe(200);
    expect(codes(r)).toContain("OUT_OF_PERIOD");
    expect(r.result.reductionAmount).toBe(0);
  });
});

describe("매매·증여 — 매매계약일 예외 유지 (회귀 · 결정 (a))", () => {
  it.each<Cause>(["purchase", "gift"])("%s 시한: 계약일 2018-12-01 → 적격 · 감면 129,060,000", async (cause) => {
    const f = upper(cause, "2018-12-01");
    expect(uiAllowed(f)).toBe(true);
    const r = await post(f);
    expect(r.body.assetContractDate).toBe("2018-12-01");
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
    expect(r.result.reductionAmount).toBe(129_060_000);
    expect(r.result.totalTax).toBe(25_812_000);
  });

  it.each<Cause>(["purchase", "gift"])("%s 한도: 계약일 2018-09-01 → 부칙 §2②2호 예외 · 적격", async (cause) => {
    const r = await post(cap(cause, "2018-09-01"));
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
  });
});

/**
 * 칸을 숨긴 뒤의 막다른 길 방어 — 같은 자산-수준 값을 fallback으로 읽던 §99·§99의3·§98의8 (⑧·⑫).
 * §99·§99의3은 상속 취득이면 엔진이 취득 원인으로 불적용한다(`evaluateNew99AcquisitionGate`) — 매매계약일을 요구하지 않는다.
 * §98의8은 상속에도 열려 있어 조문 칸 「최초 매매계약일」을 가리킨다.
 */
describe("상속 — 같은 칸을 fallback으로 읽던 조문", () => {
  const withReduction = (cause: Cause, type: "new_99_3" | "new_99" | "unsold_98_8", contract = "") => {
    const f = upper(cause, contract);
    f.assets[0].reductions = [{ ...getReductionDefault(type), exclusiveAreaSqm993: "84", exclusiveAreaSqm99: "84" }] as never;
    return f;
  };
  const issue = (f: TransferFormData) => validateStepDetailed(2, f) as Any;

  it.each(["new_99_3", "new_99"] as const)("%s: 상속은 매매계약일을 요구하지 않는다(⑧) · ⑫ 통과 · 감면 0", async (type) => {
    const f = withReduction("inheritance", type);
    expect(issue(f)?.field ?? "").not.toMatch(/contractDate|assetContractDate/);
    const r = await post(f);
    expect(r.error?.fieldErrors ?? null).toBeNull();
    expect(r.status).toBe(200);
    expect(r.result.reductionAmount).toBe(0);
  });

  it("new_99_3: 매매는 여전히 매매계약일을 요구한다(⑧ 회귀)", () => {
    expect(issue(withReduction("purchase", "new_99_3"))?.field).toBe("assetContractDate");
  });

  it("🔴 unsold_98_8: 상속 + 남은 자산 계약일 → ⑧은 조문 칸 「최초 매매계약일」을 가리킨다(숨은 칸 아님)", () => {
    expect(issue(withReduction("inheritance", "unsold_98_8", "2015-03-01"))?.field).toBe("reduction.unsold_98_8.contractDate988");
    expect(issue(withReduction("purchase", "unsold_98_8"))?.field).toBe("assetContractDate");
  });
});
