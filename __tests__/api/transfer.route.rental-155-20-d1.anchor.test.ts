/**
 * §155⑳ D1 신규 판정 사실 — 폼 → ④ API 변환 → ⑬ 본문 → ⑫ Zod → ⑭ route(단건·다건) → 엔진.
 *
 * | 필드 | OH | 무엇이 깨지면 이 테스트가 운다 |
 * |---|---|---|
 * | `rentalHousingException.priorRentalExemptionHistory` | OH-40 | Zod 미정의(침묵 strip)·route 매핑 누락 → 이력 「있음」이 비과세로 새어 나간다 |
 * | `rentalHousingException.residenceTransitionUnderAddendum` | OH-40 | 경과조치를 켜도 과세 |
 * | `rentalHousingException.postRegistrationResidenceMonths` | OH-15 | B가 항상 불충족(미입력 취급) |
 * | `rentalUnits[].terminatedRegistrationType` | OH-39 | ㉓ 1/2이 판정되지 않아 항상 과세 |
 *
 * 엔진 anchor: `__tests__/tax-engine/rental-housing-exception/rh-155-20-{era,requirements}-d1.anchor.test.ts`.
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Obj = Record<string, unknown>;
type RheForm = TransferFormData["assets"][number]["rentalHousingException"];
type UnitForm = RheForm["rentalUnits"][number];

function form(
  rhe: Partial<RheForm>,
  unit: Partial<UnitForm> = {},
  asset: Record<string, unknown> = {},
  transferDate = "2024-06-01",
): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "1";
  const a = f.assets[0];
  Object.assign(a, {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-06-01",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: "400,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    ...asset,
  });
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2016-06-01",
        rentalRegistrationDate: "2016-06-01",
        standardPriceAtRentalStart: "300,000,000",
        rentalInputMode: "direct",
        rentalMonths: "96",
        requirementsConfirmed: true,
        ...unit,
      },
    ],
    ...rhe,
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

interface Verdict {
  totalTax: number;
  warnings?: string[];
  rentalApplied?: boolean;
}
async function single(f: TransferFormData): Promise<Verdict> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result as { totalTax: number; warnings?: string[]; rentalHousingExceptionDetail?: { applied: boolean } };
  return { totalTax: r.totalTax, warnings: r.warnings, rentalApplied: r.rentalHousingExceptionDetail?.applied };
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const LIFE = "생애 한 차례";

describe("OH-40 route — 생애 1회 이력·경과조치가 엔진에 닿는다(단건·다건)", () => {
  it("D1R-1 이력 「있음」 → 과세 / 「없음」 → 비과세·고지 없음 (단건)", async () => {
    const used = await single(form({ priorRentalExemptionHistory: "used" }));
    const none = await single(form({ priorRentalExemptionHistory: "none" }));
    expect(used.totalTax).toBeGreaterThan(0);
    expect(none.totalTax).toBe(0);
    expect((none.warnings ?? []).some((w) => w.includes(LIFE))).toBe(false);
  });

  it("D1R-2 미선택 → 비과세 + 판정 보류 고지(침묵 적용 아님)", async () => {
    const r = await single(form({ priorRentalExemptionHistory: "" }));
    expect(r.totalTax).toBe(0);
    expect((r.warnings ?? []).some((w) => w.includes(LIFE))).toBe(true);
  });

  it("D1R-3 경과조치(부칙 제7조②) → 이력 「있음」이어도 비과세", async () => {
    const r = await single(
      form({ priorRentalExemptionHistory: "used", residenceTransitionUnderAddendum: true }),
    );
    expect(r.totalTax).toBe(0);
  });

  it("D1R-4 다건 route도 같은 결론 (⑭ multi 매핑)", async () => {
    expect(await multi(form({ priorRentalExemptionHistory: "used" }))).toBeGreaterThan(0);
    expect(await multi(form({ priorRentalExemptionHistory: "none" }))).toBe(0);
  });
});

describe("OH-39 route — 말소 주택 등록 유형", () => {
  // 2018-06-01 등록 가목 · 자진말소 · 27개월 임대
  const terminated = (t: UnitForm["terminatedRegistrationType"]) =>
    form(
      { priorRentalExemptionHistory: "none" },
      {
        businessRegistrationDate: "2018-06-01",
        rentalRegistrationDate: "2018-06-01",
        rentalMonths: "27",
        rentalAutoTermination: true,
        terminatedRegistrationType: t,
      },
    );
  it("D1R-5 단기(4년 → 24개월) → 비과세 / 장기일반(8년 → 48개월) → 과세 (단건·다건)", async () => {
    expect((await single(terminated("short_term"))).totalTax).toBe(0);
    expect((await single(terminated("long_term_general"))).totalTax).toBeGreaterThan(0);
    expect(await multi(terminated("short_term"))).toBe(0);
    expect(await multi(terminated("long_term_general"))).toBeGreaterThan(0);
  });
});

describe("OH-15 route — B 등록 이후 거주기간", () => {
  const b = (months: string) =>
    form(
      {
        scenario: "B",
        priorResidenceTransferDate: "2016-08-25",
        standardPriceAtAcquisitionForPhrp: "300,000,000",
        standardPriceAtPriorTransfer: "450,000,000",
        standardPriceAtTransferForPhrp: "500,000,000",
        postRegistrationResidenceMonths: months,
      },
      {},
      { acquisitionDate: "2009-08-12", residencePeriodMonthsAsset: "48" },
      "2024-03-03",
    );
  it("D1R-6 등록 이후 0개월 → 특례 미적용 / 24개월 → RH-B1 적용", async () => {
    expect((await single(b("0"))).rentalApplied).toBeUndefined();
    expect((await single(b("24"))).rentalApplied).toBe(true);
  });
  it("D1R-7 다건 route도 같은 결론", async () => {
    const off = await multi(b("0"));
    const on = await multi(b("24"));
    expect(off).toBeGreaterThan(on);
  });
});
