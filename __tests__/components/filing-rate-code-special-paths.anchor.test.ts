/**
 * anchor: 신고서 ③ 세율구분 코드 — 재개발·다필지·겸용 경로 (2026-11-23 · 표시만 · 세액 0)
 *
 * 🔴 종전: 세 경로의 결과에 `rateClause`가 없어 ③이 「-」였다(일반 주택은 1-10 · 미등기 1-30 정상).
 *   - 재개발·다필지 — `calcTax` 결과를 받으면서 `appliedRate`만 실었다 → `filingRateEcho`로 호·표지를 싣는다.
 *   - 겸용 — 자체 세율 로직이라 호가 없었다 → §104⑤2호 계산의 파트별 채택 세율에서 호를 읽어(`partRateClauses`) 열마다 적는다.
 * 기대 코드는 별지 제84호서식 작성방법 코드표(`filing-rate-code.ts` 정본 대응 주석)에서 손으로 고른다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, mixedUseExcessLand } from "../tax-engine/_helpers/mixed-use-fixture";
import { CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

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
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

type Row = { label: string; values: Record<string, unknown> };
const RATE_CODE = "세율구분 코드";

function codesOf(result: TransferTaxResult, transferDate: string, assetKind?: string) {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  if (assetKind) f.assets[0] = { ...f.assets[0], assetKind } as never;
  const rows = buildRows(result, deriveColumns(result).mode, f, f.assets[0]) as unknown as Row[];
  return rows.find((r) => r.label === RATE_CODE)?.values ?? {};
}

describe("겸용 — 열마다 그 파트에 적용된 호의 코드", () => {
  const rates = makeMockRates();
  const mixed = (over: object = {}, input = { ...mixedUseCase14(), ...over }) => {
    const b = calcMixedUseTransferTax(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, input as never, rates);
    return { b, codes: codesOf(mixedUseToFilingResult(b), "2022-02-16") };
  };

  it("전 파트 2년 이상 · 중과 없음 → 네 열 · 합계 1-10(①)", () => {
    const { codes } = mixed();
    expect(codes).toMatchObject({ housingLand: "1-10", housingBuilding: "1-10", commercialLand: "1-10", commercialBuilding: "1-10", total: "1-10" });
  });

  it("미등기(§104①10호) → 네 열 · 합계 1-30(⑧)", () => {
    const { b, codes } = mixed({ isUnregistered: true });
    expect(b.total.rateBasis).toBe("unregistered");
    expect(codes).toMatchObject({ housingLand: "1-30", housingBuilding: "1-30", commercialLand: "1-30", commercialBuilding: "1-30", total: "1-30" });
  });

  it("1년 미만(2022.2.16. 양도 — '21.6.1. 이후) → 주택 1-46(⑥) · 상가 1-20(③) · 합계는 코드가 갈려 비운다", () => {
    const { codes } = mixed({ landAcquisitionDate: new Date("2021-06-01"), buildingAcquisitionDate: new Date("2021-06-01") });
    expect(codes).toMatchObject({ housingLand: "1-46", housingBuilding: "1-46", commercialLand: "1-20", commercialBuilding: "1-20" });
    expect(codes.total ?? "-").toBe("-");
  });

  it("건물만 1~2년 → 주택(토지·건물 중 짧은 보유) 1-39(⑤) · 상가 토지 1-10 · 상가 건물 1-15(②)", () => {
    const { codes } = mixed({ buildingAcquisitionDate: new Date("2020-12-01") });
    expect(codes).toMatchObject({ housingLand: "1-39", housingBuilding: "1-39", commercialLand: "1-10", commercialBuilding: "1-15" });
  });

  it("배율 초과 비사업용 토지(1-11)가 합산된 주택분 토지 열은 한 칸에 두 코드를 적을 수 없어 비운다 · 나머지 열은 1-10", () => {
    const { b, codes } = mixed({}, mixedUseExcessLand());
    expect(b.total.partRateClauses?.find((p) => p.kind === "non_business_land")?.rateClause).toBe("104-1-8");
    expect(codes.housingLand ?? "-").toBe("-");
    expect(codes).toMatchObject({ housingBuilding: "1-10", commercialLand: "1-10", commercialBuilding: "1-10" });
  });
});

describe("재개발 · 다필지 — 엔진이 받은 호를 결과에 싣는다", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  });
  const COMMON = {
    transferPrice: 500_000_000, transferDate: "2024-03-01", acquisitionPrice: 300_000_000, acquisitionDate: "2009-03-01", expenses: 0,
    useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
  };
  const REDEV = {
    ...COMMON, propertyType: "redevelopment_apt",
    redevelopment: {
      subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: "2018-06-20", rightsValue: 400_000_000,
      settlementDirection: "pay", settlementAmount: 0, preApprovalExpenses: 0, originalAssetType: "housing",
      acquisitionStdPrice: 200_000_000, managementDisposalStdPrice: 400_000_000,
    },
  };
  const P = (id: string, acquisitionDate = "2015-01-01") => ({ id, acquisitionDate, acquisitionMethod: "actual", acquisitionPrice: 200_000_000, acquisitionArea: 100, transferArea: 100, expenses: 0 });
  const MP = { ...COMMON, propertyType: "land", transferPrice: 800_000_000, acquisitionPrice: 0, acquisitionDate: "2015-01-01", acquisitionCause: "purchase", parcels: [P("p1"), P("p2")] };
  async function result(body: object): Promise<TransferTaxResult> {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: { result: TransferTaxResult } }).data.result;
  }

  it("재개발 완공 APT 일반세율 → rateClause 104-1-1 · ③ 1-10", async () => {
    const r = await result(REDEV);
    expect(r.rateClause).toBe("104-1-1");
    expect(codesOf(r, "2024-03-01", "redevelopment_apt").total).toBe("1-10");
  });

  it("재개발 미등기 → 1-30", async () => {
    const r = await result({ ...REDEV, isUnregistered: true });
    expect(r.rateClause).toBe("104-1-10");
    expect(codesOf(r, "2024-03-01", "redevelopment_apt").total).toBe("1-30");
  });

  it("다필지 토지 일반세율 → 1-10 · 미등기 → 1-30", async () => {
    expect(codesOf(await result(MP), "2024-03-01", "land").total).toBe("1-10");
    expect(codesOf(await result({ ...MP, isUnregistered: true }), "2024-03-01", "land").total).toBe("1-30");
  });

  it("다필지 토지 1~2년 보유(2023-01-01 취득) → 104-1-2 · ③ 1-15(②)", async () => {
    const r = await result({ ...MP, acquisitionDate: "2023-01-01", parcels: [P("p1", "2023-01-01"), P("p2", "2023-01-01")] });
    expect(r.rateClause).toBe("104-1-2");
    expect(codesOf(r, "2024-03-01", "land").total).toBe("1-15");
  });
});
