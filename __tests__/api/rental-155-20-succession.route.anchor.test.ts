/**
 * §155⑳ 임대사업 승계(G-3·G-5) — 폼 → ④ → ⑬ 본문 → ⑫ Zod → ⑭ route(단건·다건) → 엔진.
 *
 * | 필드 | 무엇이 깨지면 이 테스트가 운다 |
 * |---|---|
 * | `rentalUnits[].donorRegistration` | Zod 미정의(침묵 strip)·route 매핑 누락 → 증여자 날짜가 엔진에 안 닿아 마목 아파트 제한으로 과세 |
 * | `rentalUnits[].succession` | 승계 echo·포괄양수 고지가 결과에 안 실린다 |
 *
 * 엔진 anchor: `__tests__/tax-engine/transfer/rental-155-20-succession.anchor.test.ts` ·
 * 클라이언트 anchor: `__tests__/calc/rental-155-20-succession-client.anchor.test.ts`.
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

/** 2021-03 수증자 등록 아파트 · 증여자 2019-06 등록 · 합산 60개월(증여자 24 + 본인 36) */
function form(unit: Partial<UnitForm> = {}, transferDate = "2024-06-01"): TransferFormData {
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
  });
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    priorRentalExemptionHistory: "none",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2021-03-01",
        rentalRegistrationDate: "2021-03-01",
        rentalRegisteredDate: "2021-03-01",
        isApartment: true,
        standardPriceAtRentalStart: "300,000,000",
        rentalInputMode: "direct",
        rentalMonths: "36",
        requirementsConfirmed: true,
        ...unit,
      },
    ],
  };
  f.contractTotalPrice = "800,000,000";
  return f;
}

const GIFT: Partial<UnitForm> = {
  rentalSuccession: "household_gift",
  decedentRentalMonths: "24",
  donorBusinessRegistrationDate: "2019-06-01",
  donorRentalRegistrationDate: "2019-06-01",
  donorRentalRegisteredDate: "2019-06-01",
};

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
  status: number;
  totalTax: number;
  warnings?: string[];
  steps?: { label: string; formula: string }[];
  echo?: Obj;
  json: Obj;
}
const reqBody = (f: TransferFormData) => bodyOf(() => callTransferTaxAPI(f));

async function single(f: TransferFormData, mutate?: (b: Obj) => void): Promise<Verdict> {
  const body = await reqBody(f);
  mutate?.(body);
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data?: { result: Obj }; error?: unknown };
  const r = (json.data?.result ?? {}) as {
    totalTax?: number;
    warnings?: string[];
    steps?: { label: string; formula: string }[];
    rentalHousingExceptionDetail?: { eligibility?: { perUnitVerdict?: Array<{ succession?: Obj }> } };
  };
  return {
    status: res.status,
    totalTax: r.totalTax ?? -1,
    warnings: r.warnings,
    steps: r.steps,
    echo: r.rentalHousingExceptionDetail?.eligibility?.perUnitVerdict?.[0]?.succession,
    json: json as Obj,
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const unitsOf = (b: Obj) => (b.rentalHousingException as { rentalUnits: Obj[] }).rentalUnits;

describe("G-3 증여 승계 — 증여자 날짜·승계 echo가 엔진에 닿는다 (단건·다건)", () => {
  it("S-1 ★ 수증자 날짜만(승계 없음) → 마목 아파트 제한으로 과세 / 증여 승계(증여자 2019-06) → 가목 비과세", async () => {
    const own = await single(form({ rentalMonths: "60" }));
    const gift = await single(form(GIFT));
    expect(own.totalTax).toBeGreaterThan(0);
    expect(gift.status).toBe(200);
    expect(gift.totalTax).toBe(0);
    // ⑭ 다건 매핑 — donorRegistration이 빠지면 과세로 남는다
    expect(await multi(form({ rentalMonths: "60" }))).toBe(own.totalTax);
    expect(await multi(form(GIFT))).toBe(0);
  });

  it("S-2 ⑬ 본문 — donorRegistration·succession이 stripping 없이 전송되고, 승계 개월이 rentalMonths에 합산된다", async () => {
    const body = await reqBody(form(GIFT));
    const u = unitsOf(body)[0] as {
      rentalMonths: number;
      succession?: Obj;
      donorRegistration?: Obj;
    };
    expect(u.rentalMonths).toBe(60);
    expect(u.succession).toEqual({ kind: "household_gift", predecessorMonths: 24 });
    expect(u.donorRegistration).toMatchObject({
      businessRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegisteredDate: "2019-06-01T00:00:00.000Z",
    });
  });

  it("S-3 ⑫ → 엔진 — 승계 echo가 결과 perUnitVerdict까지 도달한다 (12억 초과 RH-A2 — 12억 이하 A1은 일반 비과세 경로라 detail이 없다)", async () => {
    const f = form(GIFT);
    f.assets[0].actualSalePrice = "1,500,000,000";
    f.contractTotalPrice = "1,500,000,000";
    const gift = await single(f);
    expect(gift.echo).toMatchObject({
      kind: "household_gift",
      predecessorMonths: 24,
      donorRentalRegistrationDate: "2019-06-01",
    });
  });

  it("S-4 상속 승계 — succession만 전송(donorRegistration 없음), 합산 개월 그대로", async () => {
    const body = await reqBody(form({ rentalSuccession: "inheritance", decedentRentalMonths: "24", donorRentalRegistrationDate: "2019-06-01" }));
    const u = unitsOf(body)[0] as { rentalMonths: number; succession?: Obj; donorRegistration?: Obj };
    expect(u.rentalMonths).toBe(60);
    expect(u.succession).toEqual({ kind: "inheritance", predecessorMonths: 24 });
    expect(u.donorRegistration).toBeUndefined(); // 증여가 아닌 승계의 남은 증여자 값은 보내지 않는다(⑤·⑧과 같은 술어)
  });

  it("S-5 포괄양수 — 목은 본인 날짜(마목 제한 유지) + 「포괄양수」 확인 필요 고지가 warnings로 나온다", async () => {
    const r = await single(form({ rentalSuccession: "assumption", decedentRentalMonths: "24" }));
    expect(r.totalTax).toBeGreaterThan(0);
    // 불성립 경로는 고지를 「확인 필요」 단계(steps)로, 성립 경로는 warnings로 싣는다
    const texts = [...(r.warnings ?? []), ...(r.steps ?? []).filter((x) => x.label.includes("확인 필요")).map((x) => x.formula)];
    expect(texts.some((w) => w.includes("포괄양수") && w.includes("확인 필요"))).toBe(true);
  });
});

describe("⑫ Zod — 승계 입력 짝·순서 (⑧과 같은 격자)", () => {
  const mut = (m: (u: Obj) => void) => (b: Obj) => m(unitsOf(b)[0]);
  const f = () => form(GIFT);

  it("Z-1 증여인데 donorRegistration 없음 → 400", async () => {
    expect((await single(f(), mut((u) => delete u.donorRegistration))).status).toBe(400);
  });

  it("Z-2 증여가 아닌데 donorRegistration 있음 → 400", async () => {
    const r = await single(f(), mut((u) => ((u.succession as Obj).kind = "inheritance")));
    expect(r.status).toBe(400);
  });

  it("Z-3 증여자 신청일이 수증자 신청일보다 뒤 → 400", async () => {
    const r = await single(
      f(),
      mut((u) => ((u.donorRegistration as Obj).rentalRegistrationDate = "2021-03-02T00:00:00.000Z")),
    );
    expect(r.status).toBe(400);
  });

  it("Z-4 증여자 신청일 = 수증자 신청일(같은 날)은 통과", async () => {
    const r = await single(
      f(),
      mut((u) => {
        const donor = u.donorRegistration as Obj;
        donor.rentalRegistrationDate = "2021-03-01T00:00:00.000Z";
        donor.rentalRegisteredDate = "2021-03-01T00:00:00.000Z";
      }),
    );
    expect(r.status).toBe(200);
  });

  it("Z-5 증여자 등록일이 증여자 신청일보다 앞 → 400", async () => {
    const r = await single(
      f(),
      mut((u) => ((u.donorRegistration as Obj).rentalRegisteredDate = "2019-05-31T00:00:00.000Z")),
    );
    expect(r.status).toBe(400);
  });

  it("Z-6 증여자 등록일 없음(신청일 대용 — 엔진 registeredDateOf) → 통과", async () => {
    const r = await single(f(), mut((u) => delete (u.donorRegistration as Obj).rentalRegisteredDate));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(0);
  });

  it("Z-7 알 수 없는 승계 종류 → 400", async () => {
    expect((await single(f(), mut((u) => ((u.succession as Obj).kind = "sale")))).status).toBe(400);
  });
});
