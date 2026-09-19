/**
 * F-12 — 다건 합산(`/api/calc/transfer/multi`)이 단건 route가 소비하는 입력을 **조용히 버리지 않는다**.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-12 · §21.
 *
 * 다건 합산은 자산마다 단건 엔진을 그대로 부른다. 그런데 ⑬(`buildPropertyPayload`)·⑭(multi route)가
 * 단건 ④·⑭보다 키를 적게 옮겨, ⑧이 막지 않는 화면 입력까지 엔진에 닿지 않았다(수정 전 실측):
 *
 * | 화면 입력 | 단건 | 다건(수정 전) |
 * |---|---|---|
 * | §164⑨1호 수용 — 토지 ㎡단가 · 주택 총액 | 49,293,200 | 85,868,200 |
 * | §164⑨2호 공매·경락 | 49,293,200 | 85,868,200 |
 * | 소유자 분리(토지만 본인 · 소령 §166⑥·§168②) | 29,216,000 | 35,953,500 |
 * | 토지·건물 취득일 분리(§166⑥) — ⑧ 차단 | 27,291,000 | (차단) |
 *
 * ⇒ 단건과 **같은 leaf**로 ⑬ 전송 + ⑭ 매핑(결정 2026-09-19 — 둘 다 「다건에 연결」). 합산이 처리하지
 * 못하는 서브객체 모드(부담부증여·§166·겸용·일반/상업건물·PHD·상속 평가·가업상속·일괄양도)는
 * API로 직접 불러도 ⑫가 거부한다 — 화면은 ⑧이 막는다.
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
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import { MULTI_IGNORED_KEYS } from "@/lib/api/transfer-tax-schema-multi-refines";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Asset = Form["assets"][number];

function form(asset: Partial<Asset>, over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "500,000,000";
  f.assets[0] = { ...f.assets[0], acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "300,000,000", ...asset };
  return Object.assign(f, over);
}

/** 화면이 실제로 보내는 본문 — 두 클라이언트의 fetch를 가로챈다. */
async function bodyOf(send: () => Promise<unknown>) {
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
  return body;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function singleTax(f: Form) {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  return ((await res.json()) as { data: { result: { totalTax: number } } }).data.result.totalTax;
}
async function multiTax(f: Form) {
  const multi = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(multi, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { totalTax: number } }).data.totalTax;
}

/** 환산 토지 — 양도당시 기준시가 4억(㎡ 40만 × 1,000㎡) · 취득당시 1억 */
const EST_LAND: Partial<Asset> = {
  assetKind: "land",
  useEstimatedAcquisition: true,
  fixedAcquisitionPrice: "",
  standardPriceAtAcq: "100,000,000",
  standardPriceAtTransfer: "400,000,000",
};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("F-12 화면 경로(⑬→⑫→⑭) — 단건과 같은 세액", () => {
  it("F12-1 §164⑨1호 수용 토지(㎡단가): 보상단가 20만 < 양도당시 40만 → 차감 특례", async () => {
    const f = form({
      ...EST_LAND,
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2025-01-01",
      standardPricePerSqmAtTransfer: "400,000",
      transferArea: "1000",
      compensationPerSqm: "200,000",
      compensationBasisStdPrice: "250,000",
    });
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect(await singleTax(f)).toBe(49_293_200);
    expect(await multiTax(f)).toBe(49_293_200);
  });

  it("F12-2 §164⑨2호 공매·경락가액 2억", async () => {
    const f = form({ ...EST_LAND, isAuctionTransfer: true, auctionPrice: "200,000,000" });
    expect(await singleTax(f)).toBe(49_293_200);
    expect(await multiTax(f)).toBe(49_293_200);
  });

  it("F12-3 §164⑨1호 수용 주택(총액 트랙)", async () => {
    const f = form(
      {
        ...EST_LAND,
        assetKind: "housing",
        transferCause: "public_expropriation",
        expropriationNoticeDate: "2025-01-01",
        housingCompensationTotal: "200,000,000",
        housingCompensationBasisTotal: "250,000,000",
      },
      { householdHousingCount: "2" },
    );
    expect(await singleTax(f)).toBe(49_293_200);
    expect(await multiTax(f)).toBe(49_293_200);
  });

  it("F12-4 소유자 분리 — 토지만 본인(소령 §166⑥·§168②)", async () => {
    const f = form(
      {
        assetKind: "housing",
        selfOwns: "land_only",
        landAcquisitionPrice: "200,000,000",
        buildingAcquisitionPrice: "100,000,000",
        standardPricePerSqmAtTransfer: "300,000",
        transferArea: "1000",
        acquisitionArea: "1000",
        buildingStandardPriceAtTransfer: "100,000,000",
      },
      { householdHousingCount: "2" },
    );
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect(await singleTax(f)).toBe(29_216_000);
    expect(await multiTax(f)).toBe(29_216_000);
  });

  it("F12-5 토지·건물 취득일 분리 — ⑧ 차단을 풀고 단건과 같은 세액", async () => {
    const f = form(
      {
        assetKind: "housing",
        acquisitionDate: "2020-01-01",
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2005-01-01",
        landAcquisitionPrice: "100,000,000",
        buildingAcquisitionPrice: "200,000,000",
        standardPricePerSqmAtAcq: "50000",
        acquisitionArea: "1000",
        buildingStandardPriceAtAcq: "80,000,000",
        standardPriceAtAcq: "130,000,000",
        standardPricePerSqmAtTransfer: "300000",
        transferArea: "1000",
        buildingStandardPriceAtTransfer: "100,000,000",
      },
      { householdHousingCount: "2" },
    );
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect(await singleTax(f)).toBe(27_291_000);
    expect(await multiTax(f)).toBe(27_291_000);
  });

  it("F12-6 (대조) 특례·분리 없는 입력은 종전 그대로 — 구별력 가드", async () => {
    const plain = form({ assetKind: "land" });
    expect(await multiTax(plain)).toBe(35_953_500);
    // 같은 환산 토지에서 §164⑨가 빠지면 85,868,200 — F12-1·2가 이 값과 달라야 의미가 있다.
    expect(await multiTax(form(EST_LAND))).toBe(85_868_200);
  });
});

/**
 * 본문 동치 — ⑧이 막지 않는 폼이면 다건 ⑬ 자산 본문이 단건 ④ 본문과 **키·값이 같다**.
 * 세액 anchor가 쓰지 않는 값(토지 파트 원인·부수토지 한도·분리 모드의 취득당시 기준시가)까지
 * 한 번에 지킨다 — 세액이 같아 보여도 한쪽이 키를 빠뜨리면 여기서 드러난다.
 */
describe("F-12 본문 동치(⑬ ↔ ④)", () => {
  const schemaKeys = new Set(Object.keys(propertyItemSchema.shape));
  /** 다건 스키마 키 중 무효과 분류·부담부증여 전용 키를 뺀, 엔진에 닿는 키 */
  const engineKey = (k: string) => schemaKeys.has(k) && !(k in MULTI_IGNORED_KEYS) && k !== "transferType";

  async function bodies(f: Form) {
    const single = (await bodyOf(() => callTransferTaxAPI(f))) as Record<string, unknown>;
    const multi = (await bodyOf(() =>
      callMultiTransferTaxAPI({ taxYear: 2026, annualBasicDeductionUsed: "0" } as MultiTransferFormData, [
        { propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 },
      ]),
    )) as { properties: Record<string, unknown>[] };
    return { single, property: multi.properties[0] };
  }

  const SPLIT_ACTUAL: Partial<Asset> = {
    assetKind: "housing",
    selfOwns: "land_only",
    landAcquisitionPrice: "200,000,000",
    buildingAcquisitionPrice: "100,000,000",
    standardPriceAtAcq: "130,000,000",
    standardPricePerSqmAtTransfer: "300,000",
    transferArea: "1000",
    acquisitionArea: "1000",
    buildingStandardPriceAtTransfer: "100,000,000",
  };
  const SEPARATE_WITH_LAND_CAUSE: Partial<Asset> = {
    assetKind: "housing",
    acquisitionDate: "2020-01-01",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-01-01",
    landAcquisitionCause: "inheritance",
    landDecedentAcquisitionDate: "1990-01-01",
    landAcquisitionPrice: "100,000,000",
    buildingAcquisitionPrice: "200,000,000",
    standardPricePerSqmAtAcq: "50000",
    acquisitionArea: "1000",
    buildingStandardPriceAtAcq: "80,000,000",
    standardPricePerSqmAtTransfer: "300000",
    transferArea: "1000",
    buildingStandardPriceAtTransfer: "100,000,000",
    buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential",
  };

  it.each([
    ["수용 토지", form({ ...EST_LAND, transferCause: "public_expropriation", standardPricePerSqmAtTransfer: "400,000", transferArea: "1000", compensationPerSqm: "200,000", compensationBasisStdPrice: "250,000" })],
    ["공매", form({ ...EST_LAND, isAuctionTransfer: true, auctionPrice: "200,000,000" })],
    ["소유자 분리(실가)", form(SPLIT_ACTUAL, { householdHousingCount: "2" })],
    ["취득일 분리 + 토지 상속 + 부수토지 한도", form(SEPARATE_WITH_LAND_CAUSE, { householdHousingCount: "2" })],
  ])("F12-B %s — 엔진에 닿는 키가 단건과 같다", async (_l, f) => {
    expect(validateMultiSupportedMode(f)).toBeNull();
    const { single, property } = await bodies(f);
    const keys = Object.keys(single).filter((k) => engineKey(k) && single[k] !== undefined);
    const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, o[k]]));
    expect(pick(property)).toEqual(pick(single));
    // 구별력 가드 — 이 픽스처들이 실제로 분리·특례 키를 싣는다.
    expect(keys.length).toBeGreaterThan(20);
  });
});

describe("F-12 API 직접 호출 — 합산 미지원 서브객체 모드는 ⑫가 거부", () => {
  const base = {
    propertyId: "p1",
    propertyLabel: "p1",
    propertyType: "land" as const,
    transferDate: "2026-03-01",
    acquisitionDate: "2010-01-01",
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    residencePeriodMonths: 0,
  };
  const call = async (over: object) => {
    const res = await post(MULTI, "http://l/api/calc/transfer/multi", {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [{ ...base, ...over }],
    });
    return { status: res.status, text: JSON.stringify(await res.json()) };
  };

  it("F12-R1 부담부증여(transferType) → 400 · ⑧과 같은 문구", async () => {
    const r = await call({ transferType: "burdened_gift" });
    expect(r.status).toBe(400);
    expect(r.text).toContain("부담부증여(소령 §159)는 단건 계산기에서만 지원됩니다.");
  });

  it("F12-R2 PHD(영 §164⑦) 서브객체 → 400", async () => {
    const r = await call({
      propertyType: "housing",
      acquisitionDate: "1999-05-20", // 최초 고시(2005) 전 취득 — PHD 대상
      preHousingDisclosure: {
        landArea: 350,
        firstDisclosureDate: "2005-01-01",
        firstDisclosureHousingPrice: 430_000_000,
        landPricePerSqmAtAcquisition: 930_000,
        buildingStdPriceAtAcquisition: 15_000_000,
        landPricePerSqmAtFirstDisclosure: 1_620_000,
        buildingStdPriceAtFirstDisclosure: 12_000_000,
        transferHousingPrice: 690_000_000,
        landPricePerSqmAtTransfer: 2_548_000,
        buildingStdPriceAtTransfer: 8_000_000,
      },
    });
    expect(r.status).toBe(400);
    expect(r.text).toContain("개별주택가격 미공시 환산취득가(영 §164⑦)는 단건 계산기에서만 지원됩니다.");
  });

  it("F12-R4 §98 미분양 감면(세율 20% 특칙) → 400 — ⑭는 옮기지만 합산이 특칙을 잃는다", async () => {
    const r = await call({
      propertyType: "housing",
      acquisitionDate: "1996-06-01",
      transferPrice: 900_000_000,
      householdHousingCount: 2,
      isOneHousehold: false,
      reductions: [
        {
          type: "unsold_98",
          contractDate98: "1996-06-01",
          isResident98: true,
          isNationalScale98: true,
          isOutsideSeoul98: true,
          isUnsoldConfirmed98: true,
          isNotRentalHousing98: true,
          isFirstBuyerNoOccupancy98: true,
          rentedFor5Years98: true,
        },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.text).toContain("미분양·신축주택 감면(조특법 §98");
  });

  it("F12-R3 (대조) 부담부증여가 아닌 transferType은 통과", async () => {
    expect((await call({ transferType: "regular" })).status).toBe(200);
    expect((await call({})).status).toBe(200);
  });
});
