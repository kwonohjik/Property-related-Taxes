/**
 * I-4 route anchor — §155㉓ 등록 말소일이 폼 → ④ → ⑬ 본문 → ⑫ Zod → ⑭ route → 엔진까지 닿는다.
 *
 * 단건(`/api/calc/transfer`) · 다건(`/api/calc/transfer/multi`) · 판정 메뉴(`/api/calc/one-house-exemption`).
 * Zod가 모르는 키는 침묵 strip되고 ⑭ 매핑이 없으면 엔진은 말소일을 못 본다 — 그러면 말소 호는 전부
 * 「말소일 입력 필요」로 떨어져 **기한 안 양도도 과세**가 된다. 이 파일은 기한 안/밖 짝으로 그것을 잡는다.
 *
 * 사실관계: 가목(2018-06-01 등록) 자진말소(단기 4년 → 1/2 24개월) · 30개월 임대 · 거주주택 2016-01-10 취득.
 * 말소 2021-03-03 → 기한 2026-03-03(화). 2호 이상은 최초 말소일이 기한을 정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Obj = Record<string, unknown>;
type UnitForm = TransferFormData["assets"][number]["rentalHousingException"]["rentalUnits"][number];

const cancelledUnit = (date: string): UnitForm => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2018-06-01",
  rentalRegistrationDate: "2018-06-01",
  standardPriceAtRentalStart: "300,000,000",
  rentalInputMode: "direct",
  rentalMonths: "30",
  requirementsConfirmed: true,
  rentalAutoTermination: true,
  terminatedRegistrationType: "short_term",
  registrationCancellationDate: date,
});

function form(transferDate: string, dates: string[]): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "1";
  const a = f.assets[0];
  Object.assign(a, {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2016-01-10",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: "400,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
  });
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: dates.map(cancelledUnit),
  };
  f.contractTotalPrice = "800,000,000";
  return f;
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function single(f: TransferFormData) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return {
    body,
    result: json.data.result as {
      totalTax: number;
      warnings?: string[];
      steps: { label: string; formula: string }[];
      rentalHousingExceptionDetail?: { applied: boolean; eligibility: { cancellationWindow?: Obj } };
    },
  };
}
async function multi(f: TransferFormData): Promise<number> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}
async function judge(transferDate: string, dates: string[]) {
  const calc = form(transferDate, dates);
  const f = createInitialOneHouseJudgmentForm();
  const body = buildOneHouseExemptionApiBody({
    ...f,
    isOneHousehold: true,
    transferDate,
    contractTotalPrice: "800000000",
    residencePeriodMonths: "60",
    assets: [{ ...f.assets[0], ...calc.assets[0] }],
  });
  const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", body);
  const json = (await res.json()) as { data: { judgment: { isExempt: boolean }; rentalHousingException?: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { body, data: json.data };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("I4R 단건 route", () => {
  it("I4R-1 ⑬ 본문에 말소일이 ISO로 실린다", async () => {
    const { body } = await single(form("2026-03-03", ["2021-03-03"]));
    const rhe = body.rentalHousingException as { rentalUnits: Obj[] };
    expect(rhe.rentalUnits[0].registrationCancellationDate).toBe("2021-03-03T00:00:00.000Z");
  });
  it("I4R-2 기한 당일 → 비과세 + 기한 echo / 다음날 → 과세", async () => {
    const on = await single(form("2026-03-03", ["2021-03-03"]));
    expect(on.result.totalTax).toBe(0);
    // 1주택 비과세 조기반환 경로(STEP 1a)는 상세 카드 없이 경고로 ㉓ 기한을 싣는다(`rentalNoticesForEarlyReturn`).
    expect((on.result.warnings ?? []).some((w) => w.includes("최초 말소일 2021-03-03(1호)") && w.includes("2026-03-03까지"))).toBe(true);
    const off = await single(form("2026-03-04", ["2021-03-03"]));
    expect(off.result.totalTax).toBeGreaterThan(0);
    // 미적용이면 상세 카드 대신 「적용 불가」 단계가 사유(기한)를 싣는다.
    const step = off.result.steps.find((s) => s.label.includes("적용 불가"));
    expect(step?.formula).toContain("2026-03-03까지");
  });
  it("I4R-3 2호 — 나중 말소 호의 5년은 남아도 최초 말소 호 기한이 지나면 과세", async () => {
    expect((await single(form("2025-09-01", ["2023-01-10", "2020-09-01"]))).result.totalTax).toBe(0);
    expect((await single(form("2025-09-02", ["2023-01-10", "2020-09-01"]))).result.totalTax).toBeGreaterThan(0);
  });
  it("I4R-2b 고가(15억) — 특례 산식 경로(RH-A2)는 상세 카드 echo에 기한을 싣는다", async () => {
    const f = form("2026-03-03", ["2021-03-03"]);
    f.assets[0].actualSalePrice = "1,500,000,000";
    f.contractTotalPrice = "1,500,000,000";
    const r = (await single(f)).result;
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.rentalHousingExceptionDetail?.eligibility.cancellationWindow).toEqual({
      firstCancellationDate: "2021-03-03",
      firstUnitIndex: 0,
      calendarEnd: "2026-03-03",
      deadline: "2026-03-03",
      withinDeadline: true,
    });
  });
  it("I4R-4 말소일 없는 구 기록 → 과세(침묵 비과세 아님)", async () => {
    expect((await single(form("2024-06-01", [""]))).result.totalTax).toBeGreaterThan(0);
  });
});

describe("I4R 다건 route (⑭ multi 매핑)", () => {
  it("I4R-5 기한 당일 비과세 / 다음날 과세", async () => {
    expect(await multi(form("2026-03-03", ["2021-03-03"]))).toBe(0);
    expect(await multi(form("2026-03-04", ["2021-03-03"]))).toBeGreaterThan(0);
  });
});

describe("I4R 판정 메뉴 route (④ 판정 본문 → 단건 ⑭ 공용)", () => {
  it("I4R-6 기한 당일 충족 · echo / 다음날 미충족 → 비과세 꺼짐", async () => {
    const on = await judge("2026-03-03", ["2021-03-03"]);
    expect(((on.body.rentalHousingException as { rentalUnits: Obj[] }).rentalUnits[0]).registrationCancellationDate).toBe(
      "2021-03-03T00:00:00.000Z",
    );
    expect(on.data.rentalHousingException?.passed).toBe(true);
    expect(on.data.rentalHousingException?.cancellationWindow).toMatchObject({ deadline: "2026-03-03", withinDeadline: true });
    expect(on.data.judgment.isExempt).toBe(true);
    const off = await judge("2026-03-04", ["2021-03-03"]);
    expect(off.data.rentalHousingException?.passed).toBe(false);
    expect(off.data.judgment.isExempt).toBe(false);
  });
});
