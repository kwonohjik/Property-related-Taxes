/**
 * route anchor — §99의3 안분 분모 0 × 소득세법 시행령 §167의3①5호 중과 배제 (NH-76 형제 · L15 후속)
 *
 * 화면 입력 경로(폼 → ⑧ → ④ → route)로 분모 0(양도시 기준시가 = 취득시 기준시가)에 도달한다 — ⑧이 막지 않는다.
 * 단건 route(STEP 0.45)와 다주택 중과 판정 메뉴 route(`surcharge-judgment-payload.ts`)가 같은 선판정을 쓴다.
 * 수정은 #2984(`income-deduction-router.ts` `onlyCalcFactorReasons`) — 여기는 route 두 곳과 ⑧ 통과를 고정한다.
 * 세율: 프로덕션 fallback(양도 2021-09-01).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { runSingle } from "../calc/_helpers/single-multi-route-parity";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { POST as JUDGMENT_POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

const TD = "2021-09-01";
const STEP = "감면주택 다주택 중과 배제";

/** §99의3 1호(계약 2002-12-01) · 취득 2003-06-01 → 5년 후 양도 · 취득시 = 양도시 기준시가 3억(분모 0 — 1억 이하면 2주택 대조가 소득세법 시행령 §167의10①9호(양도 당시 기준시가 1억원 이하)로 중과 밖이라 피함) */
function form(p: { trStd: string; otherHouses: number; withRed?: boolean }): TransferFormData {
  const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
  const red = {
    ...getReductionDefault("new_99_3"),
    acquisitionType993: "from_builder", firstContract993: "yes" as const,
    standardPriceAtAcquisition993: "300,000,000", standardPriceAt5Years: "400,000,000", standardPriceAtTransfer993: p.trStd,
    exclusiveAreaSqm993: "84", region993: "outside_speculation",
  };
  const asset = {
    ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "서울특별시 강남구 역삼동 1-1", regionCode: "1168010100",
    acquisitionCause: "purchase", acquisitionDate: "2003-06-01", assetContractDate: "2002-12-01",
    actualSalePrice: "1,000,000,000", fixedAcquisitionPrice: "300,000,000", standardPriceAtTransfer: p.trStd,
    reductions: p.withRed === false ? [] : [red], residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  };
  const houses = Array.from({ length: p.otherHouses }, (_, i) => ({
    ...createHouseEntry(`h${i + 2}`), region: "capital", regionCode: "1168010100", acquisitionDate: "2010-01-01",
    officialPrice: "500,000,000", acquisitionPrice: "300,000,000", exclusiveArea: "84", isApartment: true,
  }));
  return {
    ...base, transferDate: TD, contractTotalPrice: "1,000,000,000", assets: [asset], houses,
    presaleRights: [], householdNoPresaleRightsConfirmed: true, isOneHousehold: true,
    householdHousingCount: String(p.otherHouses + 1), isRegulatedArea: true, wasRegulatedAtAcquisition: false, isUnregistered: false,
  } as unknown as TransferFormData;
}
type Steps = Array<{ label: string; legalBasis?: string }>;
async function single(f: TransferFormData) {
  const x = await runSingle(f);
  expect(x.status, JSON.stringify(x.json).slice(0, 300)).toBe(200);
  const r = x.r as Record<string, unknown>;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
  const d = r.new993Detail as { isEligible: boolean; signCase: string; ineligibleReasons: { code: string }[] } | undefined;
  return {
    tax: x.totalTax, surcharge: mh.surchargeApplicable, reasons: mh.exclusionReasons.map((e) => e.type),
    step: ((r.steps ?? []) as Steps).some((s) => s.label === STEP), codes: d?.ineligibleReasons.map((x) => x.code), eligible: d?.isEligible, signCase: d?.signCase, body: x.body,
  };
}
async function judge(f: TransferFormData) {
  const { body } = await single(f);
  const res = await JUDGMENT_POST(new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
    method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ property: body }),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.headline.result as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
}

describe("§99의3 분모 0 — 단건 route · 판정 메뉴 route", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  });
  it("⑧은 분모 0 입력을 막지 않는다(화면에서 도달)", () => {
    const f = form({ trStd: "300,000,000", otherHouses: 2 });
    expect(validateStep(3, f)).toBeNull();
  });
  it.each([1, 2])("다른 주택 %i채 · 분모 0 → 전액 감면(US-36, 확인 필요 고지) · 중과 배제 · 단계 표시", async (n) => {
    const r = await single(form({ trStd: "300,000,000", otherHouses: n }));
    expect(r.eligible).toBe(true);
    expect(r.signCase).toBe("pos_zero");
    expect(r.codes).toEqual([]);
    expect(r.surcharge).toBe(false);
    expect(r.reasons).toEqual(["tax_special_exemption"]);
    expect(r.step).toBe(true);
    const ctl = await single(form({ trStd: "300,000,000", otherHouses: n, withRed: false }));
    expect(ctl.surcharge).toBe(true);
    expect(r.tax!).toBeLessThan(ctl.tax!);
  });
  it("판정 메뉴: 분모 0 → 중과 배제(단건과 같다) · 짝: 감면 미선택 → 중과", async () => {
    const z = await judge(form({ trStd: "300,000,000", otherHouses: 2 }));
    expect(z.surchargeApplicable).toBe(false);
    expect(z.exclusionReasons.map((e) => e.type)).toEqual(["tax_special_exemption"]);
    const ctl = await judge(form({ trStd: "300,000,000", otherHouses: 2, withRed: false }));
    expect(ctl.surchargeApplicable).toBe(true);
  });
});
