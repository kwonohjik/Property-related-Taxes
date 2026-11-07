/**
 * §155⑳ 임대주택 호 — 「주택법」 도시형 생활주택인 아파트 (V-10 · `docs/00-pm/rental-155-20-review-fixes.plan.md`).
 *
 * 소령 §167의3①2호 가목2) 「…아파트[「주택법」에 따른 도시형 생활주택인 아파트는 제외한다. 이하 이 목, 나목2)ㆍ라목8) 및
 * 마목4)에서 같다]를 임대하는 민간매입임대주택 … 제11항에 따른 기한까지 양도할 것」(MST 290841 실독) — 괄호는 양도기한에만 걸린다.
 * 마목2)(2020.7.11. 이후 임대사업자등록 신청 아파트 배제)에는 괄호가 없어 도시형 생활주택인 아파트도 아파트다.
 * 종전에는 같은 「아파트 여부」 하나가 두 축을 갈라, 도시형 생활주택인 아파트도 2027.12.31. 뒤 양도면 ⑳이 서지 않았다.
 *
 * | # | 주장 |
 * |---|---|
 * | U-1 | 가목 아파트 · 거주주택 양도 2028-06-01 · 도시형 아님 → 양도기한 경과 ⑳ 불성립 190,366,000 (2026-11-07 — 2012 취득은 부칙 제9270호 §14① 위기취득 창 안이라 세율 중과 배제 · 명부 경로와 같은 값, 종전 299,816,000) |
 * | U-2 | 같은 입력 + 도시형 생활주택인 아파트 → ⑳ 성립 RH-A1 · 0 |
 * | U-3 | [짝] 2020.7.11. 이후 신청 아파트(마목2)) + 도시형 → 아파트 배제 그대로(불성립) |
 * | U-4 | ④ — 묻는 범위 밖(아파트 아님)이면 남은 값을 싣지 않고, 도시형이면 ⑪ 연장 사실을 싣지 않는다 |
 * | U-5 | 다건 route = 단건 (⑭ 다건 매핑 침묵 strip 방지) |
 * | U-6 | 다주택 중과 2호(명부 행) — 같은 사실이면 양도기한 게이트만 빠진다 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

type Unit = ReturnType<typeof makeDefaultRentalUnit>;

/** 거주주택 2012 취득 · 거주 60개월 · 10억 · 조정 · 임대 1호(장기일반 매입 아파트 · 2018.3.1. 등록 · 96개월). */
function form(transferDate: string, patch: Partial<Unit> = {}) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate,
    householdHousingCount: "2",
    isOneHousehold: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    contractTotalPrice: "1,000,000,000",
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2012-08-12",
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "500,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
  });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2018-03-01",
        rentalRegistrationDate: "2018-03-01",
        isApartment: true,
        standardPriceAtRentalStart: "300,000,000",
        rentalInputMode: "direct" as const,
        rentalMonths: "96",
        requirementsConfirmed: true,
        ...patch,
      },
    ],
  };
  return f;
}

type Detail = { applied?: boolean; scenarioId?: string; eligibility?: { failReasons?: { code: string }[] } };
const detail = (r: { result: unknown }) => (r.result as { rentalHousingExceptionDetail?: Detail }).rentalHousingExceptionDetail;
const unitPayload = (f: ReturnType<typeof form>) =>
  (toRentalHousingExceptionApi(f.assets[0]) as { rentalUnits: Record<string, unknown>[] }).rentalUnits[0];

describe("§155⑳ 도시형 생활주택인 아파트 — 가목2) 괄호는 양도기한에만 (V-10)", () => {
  it("U-1 도시형 아님 · 2028-06-01 양도 → 양도기한 경과로 ⑳ 불성립 190,366,000", async () => {
    const r = await runCalc(form("2028-06-01"));
    expect(detail(r)?.applied).toBe(false);
    expect(r.result.totalTax).toBe(190_366_000);
  });

  it("U-2 도시형 생활주택인 아파트 → 양도기한 비적용 · ⑳ 성립 RH-A1 · 0", async () => {
    const r = await runCalc(form("2028-06-01", { isUrbanLifeHousingApartment: true }));
    expect(r.status).toBe(200);
    expect(detail(r)?.scenarioId).toBe("RH-A1");
    expect(r.result.totalTax).toBe(0);
  });

  it("U-2 [짝] 기한 안(2027-12-20) 양도는 도시형 여부와 무관하게 성립", async () => {
    expect((await runCalc(form("2027-12-20"))).result.totalTax).toBe(0);
  });

  it("U-3 [짝] 2020.7.11. 이후 신청 아파트(마목 2)) + 도시형 → 아파트 배제 그대로 · 불성립", async () => {
    const r = await runCalc(
      form("2027-01-05", {
        businessRegistrationDate: "2020-08-03",
        rentalRegistrationDate: "2020-07-13",
        rentalMonths: "72",
        isUrbanLifeHousingApartment: true,
      }),
    );
    expect(detail(r)?.applied).toBe(false);
    expect(r.result.totalTax).toBe(190_366_000);
    const steps = (r.result.steps ?? []) as { label: string; formula: string }[];
    expect(steps.find((s) => s.label.includes("적용 불가"))?.formula).toMatch(/마목\)에서 아파트는/);
    // 짝 — 같은 입력의 비아파트는 0(아파트 배제만이 결론을 가른다)
    const nonApt = await runCalc(
      form("2027-01-05", { businessRegistrationDate: "2020-08-03", rentalRegistrationDate: "2020-07-13", rentalMonths: "72", isApartment: false }),
    );
    expect(nonApt.result.totalTax).toBe(0);
  });

  it("U-4 ④ — 도시형이면 싣고 ⑪ 연장 사실은 싣지 않는다 · 아파트 아님이면 남은 값을 싣지 않는다", () => {
    const urban = unitPayload(
      form("2028-06-01", { isUrbanLifeHousingApartment: true, aptDeadlineExtension: { status: "none" } }),
    );
    expect(urban.isUrbanLifeHousingApartment).toBe(true);
    expect(urban.aptDeadlineExtension).toBeUndefined();

    const plain = unitPayload(form("2028-06-01", { aptDeadlineExtension: { status: "none" } }));
    expect(plain.isUrbanLifeHousingApartment).toBeUndefined();
    expect(plain.aptDeadlineExtension).toEqual({ confirmedNone: true });

    const nonApt = unitPayload(form("2028-06-01", { isApartment: false, isUrbanLifeHousingApartment: true }));
    expect(nonApt.isUrbanLifeHousingApartment).toBeUndefined();
  });

  it("U-5 다건 route = 단건 — 도시형 아파트 0 · 도시형 아님 190,366,000", async () => {
    const multi = async (f: ReturnType<typeof form>) => {
      const cap: { body?: unknown } = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init?: RequestInit) => {
          cap.body = JSON.parse(String(init?.body));
          return { ok: true, json: async () => ({ data: {} }) } as unknown as Response;
        }),
      );
      const mf = { taxYear: 2028, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
      await callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]).catch(() => undefined);
      vi.unstubAllGlobals();
      const res = await MULTI(
        new NextRequest("http://localhost/api/calc/transfer/multi", {
          method: "POST",
          headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(cap.body),
        }),
      );
      const json = (await res.json()) as { data: { totalTax: number } };
      expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
      return json.data.totalTax;
    };
    expect(await multi(form("2028-06-01", { isUrbanLifeHousingApartment: true }))).toBe(0);
    expect(await multi(form("2028-06-01"))).toBe(190_366_000);
  });
});

describe("다주택 중과 2호 — 같은 사실이면 가목2) 양도기한만 빠진다 (U-6)", () => {
  /** 가목 장기임대 아파트 · 2018.1.1. 등록 · 수도권 3억 · 8년 · ⑪ 연장 사유 없음 확인 */
  const rental = (patch: Partial<HouseInfo> = {}): HouseInfo =>
    ({
      id: "rental",
      acquisitionDate: new Date("2018-01-01"),
      officialPrice: 300_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      isLongTermRental: true,
      rentalType: "A",
      isApartment: true,
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2018-01-01"),
      businessRegistrationDate: new Date("2018-01-01"),
      rentalStartOfficialPrice: 300_000_000,
      rentIncreaseUnder5Pct: true,
      rentalPeriodYears: 8,
      rentalAptDeadlineExtension: { confirmedNone: true },
      ...patch,
    }) as HouseInfo;
  const AFTER = new Date("2028-06-01");

  it("도시형 아님 → 기한 경과로 2호 아님", () => {
    expect(isLongTermRentalHousingExempt(rental(), AFTER)).toBe(false);
  });
  it("도시형 생활주택인 아파트 → 2호", () => {
    expect(isLongTermRentalHousingExempt(rental({ isUrbanLifeHousingApartment: true }), AFTER)).toBe(true);
  });
});
