/**
 * OH-01 A2b §155①2호 새 입력 — 폼 → ④ API 변환 → ⑬ 본문 → ⑫ Zod → ⑭ route(단건·다건·판정 메뉴) → 엔진.
 *
 * | 폼 필드 | 엔진 필드 | 무엇이 깨지면 이 테스트가 운다 |
 * |---|---|---|
 * | 명부 행 `regionCode` | `temporaryTwoHouse.newHouseRegionCode` | ④가 행 코드를 싣지 않거나 ⑫가 strip → 신규 주택 조정 판정이 선언/대리 지표로 떨어진다 |
 * | `newHouseRegulatedAtAcquisition`·`prevHouseRegulatedAtNewAcquisition` | 같은 이름(boolean) | 3-상태 → boolean 변환 누락 |
 * | `newHouseContractDate` | `newHouseContractDate`(Date) | ⑭ Date 변환 누락 → 부칙 경과조치 미적용 |
 * | `newHouseMoveInDate` | `wholeHouseholdMoveInDate`(Date) | 가목 전입 미판정 |
 * | `newHouseExistingTenant`+`newHouseTenantLeaseEndDate` | `existingTenantLeaseEndDate`(Date) | 단서 기한 연장 미도달 |
 *
 * 엔진 anchor: `__tests__/tax-engine/transfer/temporary-two-house-regulated-move-in-a2b.anchor.test.ts`.
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
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";
const SEO_GU = "2826010100";

/** 명부 1행 — UI가 실제로 만드는 모양(`one-house-exemption-api.anchor.test.ts`의 `house()`와 같다). */
const house = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    id: "h-new",
    region: "capital",
    acquisitionDate: "2020-06-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  }) as HouseEntry;

/** 2주택 · 종전 2015-01-01 취득(당시 미지정 — 거주요건 없음) · 5억 양도 · 3억 취득 */
function form(over: Partial<TransferFormData> = {}, row: Partial<HouseEntry> = {}, asset: Obj = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2021-03-01";
  f.householdHousingCount = "2";
  f.isOneHousehold = true;
  f.isRegulatedArea = false;
  f.contractTotalPrice = "500,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    actualSalePrice: "500,000,000",
    fixedAcquisitionPrice: "300,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    ...asset,
  });
  f.houses = [house(row)];
  return { ...f, ...over };
}
const both: Partial<TransferFormData> = {
  newHouseRegulatedAtAcquisition: "yes",
  prevHouseRegulatedAtNewAcquisition: "yes",
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

async function single(f: TransferFormData): Promise<number> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: { totalTax: number } } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result.totalTax;
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
async function judge(f: TransferFormData): Promise<boolean> {
  const jf = { ...createInitialOneHouseJudgmentForm(), ...f };
  const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(jf));
  const json = (await res.json()) as { data: { judgment: { isExempt: boolean } } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.judgment.isExempt;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("A2b ④⑬ 본문 — 새 필드가 `temporaryTwoHouse`에 실린다", () => {
  it("R-0 선언·계약일·전입일·임차인 종료일 + 명부 행 코드", async () => {
    const body = await bodyOf(() =>
      callTransferTaxAPI(
        form(
          {
            ...both,
            newHouseContractDate: "2020-05-01",
            newHouseMoveInDate: "2021-01-01",
            newHouseExistingTenant: true,
            newHouseTenantLeaseEndDate: "2021-12-31",
          },
          { regionCode: GANGNAM },
        ),
      ),
    );
    expect(body.temporaryTwoHouse).toMatchObject({
      newAcquisitionDate: "2020-06-01",
      newHouseRegionCode: GANGNAM,
      newHouseRegulatedAtAcquisition: true,
      previousHouseRegulatedAtNewAcquisition: true,
      newHouseContractDate: "2020-05-01",
      wholeHouseholdMoveInDate: "2021-01-01",
      existingTenantLeaseEndDate: "2021-12-31",
    });
  });
  it("R-0 부정 짝 — 임차인 토글 OFF면 남은 종료일을 싣지 않는다 · 미선택 선언도 싣지 않는다", async () => {
    const body = await bodyOf(() => callTransferTaxAPI(form({ newHouseTenantLeaseEndDate: "2021-12-31" })));
    const tt = body.temporaryTwoHouse as Obj;
    expect(tt).toBeDefined();
    expect(tt).not.toHaveProperty("existingTenantLeaseEndDate");
    expect(tt).not.toHaveProperty("newHouseRegulatedAtAcquisition");
  });
});

describe("A2b ⑭ route — 단건·다건·판정 메뉴가 같은 결론", () => {
  it("R-1 가목 전입 2021-06-01 비과세 / 2021-06-02 과세 (단건·다건·판정)", async () => {
    const ok = form({ ...both, newHouseMoveInDate: "2021-06-01" });
    const late = form({ ...both, newHouseMoveInDate: "2021-06-02" });
    expect(await single(ok)).toBe(0);
    expect(await single(late)).toBeGreaterThan(0);
    expect(await multi(ok)).toBe(0);
    expect(await multi(late)).toBeGreaterThan(0);
    expect(await judge(ok)).toBe(true);
    expect(await judge(late)).toBe(false);
  });

  it("R-2 단서 — 종료 2021-12-31 · 양도 2021-12-31: 토글 ON 비과세 / OFF 과세 (단건·다건)", async () => {
    const on = form({
      ...both,
      transferDate: "2021-12-31",
      newHouseMoveInDate: "2021-12-30",
      newHouseExistingTenant: true,
      newHouseTenantLeaseEndDate: "2021-12-31",
    });
    const off = { ...on, newHouseExistingTenant: false };
    expect(await single(on)).toBe(0);
    expect(await single(off)).toBeGreaterThan(0);
    expect(await multi(on)).toBe(0);
    expect(await multi(off)).toBeGreaterThan(0);
  });

  it("R-3 계약일 경과조치 — 신규 2018-10-01 · 양도 2021-06-01: 계약 2018-09-13 비과세 / 2018-09-14 과세 (단건·다건)", async () => {
    const at = (c: string) =>
      form({ ...both, transferDate: "2021-06-01", newHouseContractDate: c }, { acquisitionDate: "2018-10-01" });
    expect(await single(at("2018-09-13"))).toBe(0);
    expect(await single(at("2018-09-14"))).toBeGreaterThan(0);
    expect(await multi(at("2018-09-13"))).toBe(0);
    expect(await multi(at("2018-09-14"))).toBeGreaterThan(0);
  });

  it("R-4 명부 행 주소 — 신규 인천 서구 2020-06-18 취득 비과세 / 2020-06-19 과세 (단건·다건·판정)", async () => {
    const at = (acq: string) =>
      form({ transferDate: "2021-08-01" }, { acquisitionDate: acq, regionCode: SEO_GU }, { regionCode: GANGNAM });
    expect(await single(at("2020-06-18"))).toBe(0);
    expect(await single(at("2020-06-19"))).toBeGreaterThan(0);
    expect(await multi(at("2020-06-18"))).toBe(0);
    expect(await multi(at("2020-06-19"))).toBeGreaterThan(0);
    expect(await judge(at("2020-06-18"))).toBe(true);
    expect(await judge(at("2020-06-19"))).toBe(false);
  });
});
