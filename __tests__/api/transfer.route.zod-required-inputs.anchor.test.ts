/**
 * 양도세 ⑫ — 엔진이 필요로 하는데 Zod가 비워 두게 두던 값 (2026-09-30 Zod↔엔진 필수 점검).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §2.
 *
 * 각 행은 **비우면 200 + 다른 세액**이었다(엔진·라우터가 빈 값을 0·기본값·다른 분기로 조용히 채운다).
 * 수정 후: 비우면 400 + 정확한 경로 · 값이 있으면 200 + 종전과 같은 세액(🟢 긍정 짝).
 * ⑧(UI)은 모두 이미 요구한다 — 조건은 각 refine 주석의 ⑧ 위치의 거울이다.
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님). 긍정 짝은 「수정 전과 같다」를 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Json = {
  data?: { result?: { determinedTax: number; [k: string]: unknown }; totalTax?: number };
  error?: unknown;
};
async function post(handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const single = (body: unknown) => post(SINGLE, "http://localhost/api/calc/transfer", body);
const multi = (body: unknown) => post(MULTI, "http://localhost/api/calc/transfer/multi", body);

/** 400 응답의 issue 경로(점 표기) — route가 `error.fieldErrors`의 키로 싣는다 */
function issuePaths(json: Json): string[] {
  const e = json.error as { fieldErrors?: Record<string, unknown> } | undefined;
  return Object.keys(e?.fieldErrors ?? {});
}
async function expectRejected(body: unknown, path: string, send = single) {
  const r = await send(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(issuePaths(r.json)).toContain(path);
}
async function expectTax(body: unknown, tax: number) {
  const r = await single(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  expect(r.json.data!.result!.determinedTax).toBe(tax);
}

const without = <T extends Record<string, unknown>>(o: T, ...keys: string[]) => {
  const c: Record<string, unknown> = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

const BASE = {
  propertyType: "housing",
  transferPrice: 800_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2003-01-15",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
};

// ── 감면 (조특법 §99·§99의3·§97의3·§97의5) ─────────────────────────────
const R993 = {
  type: "new_99_3",
  acquisitionType993: "from_builder",
  contractDate993: "2002-03-01",
  standardPriceAtAcquisition993: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer993: 600_000_000,
  region993: "outside_speculation",
  isResident993: true,
  isHousingConstructionBusiness993: false,
  hasOccupancyAtContract: false,
};
const R99 = {
  type: "new_99",
  acquisitionType99: "from_builder",
  contractDate99: "1999-01-10",
  isResident99: true,
  isHousingConstructionBusiness99: false,
  isNationalHousing99: false,
  standardPriceAtAcquisition99: 150_000_000,
  standardPriceAt5Years99: 250_000_000,
  standardPriceAtTransfer99: 600_000_000,
  hasOccupancyAtContract99: false,
};
const R973 = {
  type: "rental_97_3",
  registrationDate: "2015-01-01",
  rentalStartDate: "2015-01-01",
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  officialPriceAtStart: 300_000_000,
  isNationalHousingScale: true,
  region: "capital",
  rentalHousingType: "long_term_private",
  isPrivateConstructionRental: false,
  stdPriceAtAcquisition: 200_000_000,
  stdPriceAtTransfer: 500_000_000,
};
const RENTAL = { ...BASE, transferPrice: 700_000_000, acquisitionDate: "2015-01-01", transferDate: "2025-06-01" };

describe("감면 — 비우면 400 (종전 200 + 다른 세액)", () => {
  it("R1 §99의3 전용면적 — 🟢 170㎡ 고가주택 113,060,000 / 🔴 생략 400 (종전 78,860,000 — 면적 0으로 고가 판정 불발)", async () => {
    await expectTax({ ...BASE, reductions: [{ ...R993, exclusiveAreaSqm993: 170 }] }, 113_060_000);
    await expectRejected({ ...BASE, reductions: [R993] }, "reductions.0.exclusiveAreaSqm993");
  });

  it("R2 §99 전용면적 — 🟢 170㎡ 113,060,000 / 🔴 생략 400 (종전 82,554,444)", async () => {
    const b = { ...BASE, acquisitionDate: "1999-10-01" };
    await expectTax({ ...b, reductions: [{ ...R99, exclusiveAreaSqm99: 170 }] }, 113_060_000);
    await expectRejected({ ...b, reductions: [R99] }, "reductions.0.exclusiveAreaSqm99");
  });

  it("R3 §99의3 1호 매매계약일 — 🟢 계약일·자산 계약일 각각 113,060,000 / 🔴 둘 다 없으면 400 (종전 취득일로 읽어 78,860,000)", async () => {
    const b = { ...BASE, acquisitionDate: "2001-08-01" };
    const r = { ...R993, contractDate993: "2001-04-01", exclusiveAreaSqm993: 84 };
    await expectTax({ ...b, reductions: [r] }, 113_060_000);
    await expectTax({ ...b, assetContractDate: "2001-04-01", reductions: [without(r, "contractDate993")] }, 113_060_000);
    await expectRejected({ ...b, reductions: [without(r, "contractDate993")] }, "reductions.0.contractDate993");
  });

  it("R4 §99의3 2호 사용승인일 — 🟢 45,610,000 / 🔴 생략 400 (종전 29,622,500)", async () => {
    const b = { ...BASE, transferPrice: 550_000_000, acquisitionDate: "2003-05-01" };
    const r = {
      ...without(R993, "contractDate993"),
      acquisitionType993: "self_built",
      usageApprovalDate993: "2003-08-01",
      exclusiveAreaSqm993: 84,
    };
    await expectTax({ ...b, reductions: [r] }, 45_610_000);
    await expectRejected({ ...b, reductions: [without(r, "usageApprovalDate993")] }, "reductions.0.usageApprovalDate993");
  });

  it("R5 §99 자기건설 사용승인일 — 🟢 113,060,000 / 🔴 생략 400 (종전 82,554,444)", async () => {
    const b = { ...BASE, acquisitionDate: "1999-05-01" };
    const r = {
      ...without(R99, "contractDate99"),
      acquisitionType99: "self_built",
      usageApprovalDate99: "1999-08-01",
      exclusiveAreaSqm99: 84,
    };
    await expectTax({ ...b, reductions: [r] }, 113_060_000);
    await expectRejected({ ...b, reductions: [without(r, "usageApprovalDate99")] }, "reductions.0.usageApprovalDate99");
  });

  it("R7 §99 1호 매매계약일 — 🟢 113,060,000 / 🔴 계약일·자산 계약일 모두 없으면 400 (종전 취득일로 읽어 82,554,444)", async () => {
    const b = { ...BASE, acquisitionDate: "1998-07-01" };
    const r = { ...R99, contractDate99: "1998-03-01", exclusiveAreaSqm99: 84 };
    await expectTax({ ...b, reductions: [r] }, 113_060_000);
    await expectRejected({ ...b, reductions: [without(r, "contractDate99")] }, "reductions.0.contractDate99");
  });

  it("R6 §97의3 임대 계속 여부 — 🟢 false+B 50,043,333 · true 25,685,000 / 🔴 생략 400 (종전 true로 읽음)", async () => {
    await expectTax(
      { ...RENTAL, reductions: [{ ...R973, rentalContinuesToTransfer: false, stdPriceAtRentalEnd: 400_000_000 }] },
      50_043_333,
    );
    await expectTax({ ...RENTAL, reductions: [{ ...R973, rentalContinuesToTransfer: true }] }, 25_685_000);
    await expectRejected({ ...RENTAL, reductions: [R973] }, "reductions.0.rentalContinuesToTransfer");
  });

  it("R6b §97의5 임대 계속 여부 — 🔴 생략 400", async () => {
    const r975 = { ...without(R973, "rentalHousingType", "isPrivateConstructionRental"), type: "rental_97_5" };
    await expectRejected(
      { ...RENTAL, acquisitionDate: "2014-12-01", reductions: [r975] },
      "reductions.0.rentalContinuesToTransfer",
    );
  });
});

// ── 보유 주택 명부 · 상속 ────────────────────────────────────────────
const ROW = {
  region: "capital",
  acquisitionDate: "2018-01-01",
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
};

describe("명부·상속 — 비우면 400", () => {
  it("O1 상속주택 상속개시일 — 🔴 생략 400 (종전 「상속 당시 보유」로 읽어 판정이 바뀜)", async () => {
    await expectRejected(
      { ...BASE, houses: [{ ...ROW, id: "selling" }, { ...ROW, id: "h1", isInherited: true }] },
      "houses.1.inheritedDate",
    );
    const ok = await single({
      ...BASE,
      houses: [{ ...ROW, id: "selling" }, { ...ROW, id: "h1", isInherited: true, inheritedDate: "2020-01-01" }],
    });
    expect(ok.status).toBe(200);
  });

  it("O2 동일세대 상속 — 거주·보유 개시일 🔴 생략 400 / 🟢 비주택이면 요구하지 않는다", async () => {
    const inh = {
      ...BASE,
      acquisitionCause: "inheritance",
      acquisitionDate: "2023-06-01",
      decedentAcquisitionDate: "2010-01-01",
      decedentSameHouseholdBeforeInheritance: true,
    };
    await expectRejected(inh, "decedentCohabitationHoldingStartDate");
    expect((await single({ ...inh, decedentCohabitationHoldingStartDate: "2015-01-01" })).status).toBe(200);
    expect(
      (await single({ ...inh, propertyType: "land", householdHousingCount: 0 })).status,
    ).toBe(200);
  });

  it("H-2 부득이한 사유 — 거주기간·취득 당시 기준시가 🔴 각각 생략 400", async () => {
    const row = { ...ROW, id: "h1", isUnavoidableReason: true, unavoidableResidenceYears: 2, acquisitionOfficialPrice: 100_000_000 };
    const b = { ...BASE, isRegulatedArea: true, houses: [{ ...ROW, id: "selling" }, row] };
    expect((await single(b)).status).toBe(200);
    await expectRejected({ ...b, houses: [b.houses[0], without(row, "unavoidableResidenceYears")] }, "houses.1.unavoidableResidenceYears");
    await expectRejected({ ...b, houses: [b.houses[0], without(row, "acquisitionOfficialPrice")] }, "houses.1.acquisitionOfficialPrice");
  });

  it("H-4 사원용 주택·어린이집 기간 — 🔴 생략 400", async () => {
    const sell = { ...ROW, id: "selling", isEmployeeHousing: true, freeProvisionYears: 12 };
    const b = { ...BASE, houses: [sell, { ...ROW, id: "h1" }, { ...ROW, id: "h2" }] };
    expect((await single(b)).status).toBe(200);
    await expectRejected({ ...b, houses: [without(sell, "freeProvisionYears"), b.houses[1], b.houses[2]] }, "houses.0.freeProvisionYears");
    await expectRejected(
      { ...b, houses: [{ ...ROW, id: "selling", isDayCareCenter: true }, b.houses[1], b.houses[2]] },
      "houses.0.dayCareOperationYears",
    );
  });
});

// ── 이월과세 · §163⑨ · 승계조합원 ───────────────────────────────────
const CT = {
  giftRegistryDate: "2020-01-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 20_000_000,
  giftDateValuation: 300_000_000,
  donorRelation: "spouse",
};
const LAND = {
  ...BASE,
  propertyType: "land",
  transferPrice: 500_000_000,
  householdHousingCount: 0,
  acquisitionPrice: 200_000_000,
  acquisitionDate: "2010-03-01",
};
const CO = { ...LAND, acquisitionCause: "carryover_gift", acquisitionDate: "2020-01-01", acquisitionPrice: 300_000_000, carryoverTaxation: CT };

describe("주 자산 취득원인 — 비우면 400", () => {
  it("CO-1 이월과세 서브객체 — 🟢 80,190,000 / 🔴 생략 400 (종전 일반 증여로 49,030,000)", async () => {
    await expectTax(CO, 80_190_000);
    await expectRejected(without(CO, "carryoverTaxation"), "carryoverTaxation");
  });

  it("CO-2 증여자 취득가액 — 🔴 생략 400 (종전 0으로 읽어 107,460,000)", async () => {
    await expectRejected({ ...CO, carryoverTaxation: without(CT, "donorAcquisitionPrice") }, "carryoverTaxation.donorAcquisitionPrice");
  });

  it("CO-3 환산 이월과세 — 🟢 기준시가 있음 63,591,600 / 🔴 최상위 기준시가 생략 400 (종전 0·1로 읽어 107,460,000)", async () => {
    const ct = { ...without(CT, "donorAcquisitionPrice"), useEstimatedAcquisition: true };
    await expectTax(
      { ...CO, useEstimatedAcquisition: true, standardPriceAtAcquisition: 80_000_000, standardPriceAtTransfer: 250_000_000, carryoverTaxation: ct },
      63_591_600,
    );
    await expectRejected({ ...CO, carryoverTaxation: ct }, "standardPriceAtAcquisition");
  });

  it("CF-1 가업상속 의제 자산 — 🔴 400 (종전 배제로 계산 49,030,000)", async () => {
    await expectRejected(
      { ...CO, carryoverTaxation: { ...CT, exclusionDeclared: { isFamilyBusinessInheritedAsset: true } } },
      "carryoverTaxation.exclusionDeclared",
    );
  });

  it("CO-R 관계 「그 외」는 400이 아니다 — 엔진이 미적용을 판정한다(F15-6)", async () => {
    const r = await single({ ...CO, carryoverTaxation: { ...without(CT, "donorAcquisitionPrice"), donorRelation: "other" } });
    expect(r.status).toBe(200);
  });

  it("GE-1 증여 취득 + 환산 — 🟢 실가 200 / 🔴 환산 400 (§163⑨ — 종전 55,607,800으로 계산)", async () => {
    const gift = { ...LAND, acquisitionCause: "gift", acquisitionDate: "2015-03-01", donorAcquisitionDate: "2000-01-01" };
    expect((await single(gift)).status).toBe(200);
    await expectRejected(
      { ...gift, useEstimatedAcquisition: true, acquisitionPrice: 0, standardPriceAtAcquisition: 150_000_000, standardPriceAtTransfer: 300_000_000 },
      "useEstimatedAcquisition",
    );
  });

  it("RD-1 승계조합원 준공일 — 🟢 222,250,000 / 🔴 생략 400 (종전 취득일로 읽어 0)", async () => {
    const rd = {
      ...BASE,
      propertyType: "redevelopment_apt",
      transferPrice: 920_000_000,
      transferDate: "2023-02-16",
      acquisitionDate: "2020-04-15",
      acquisitionPrice: 450_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2010-01-01",
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: "2016-02-20",
        rightsValue: 450_000_000,
        settlementDirection: "pay",
        settlementAmount: 0,
        preApprovalExpenses: 0,
        postApprovalExpenses: 150_000_000,
        originalAssetType: "housing",
        completionDate: "2022-12-02",
        isSuccessorMember: true,
      },
    };
    await expectTax(rd, 222_250_000);
    await expectRejected({ ...rd, redevelopment: without(rd.redevelopment, "completionDate") }, "redevelopment.completionDate");
  });
});

// ── 부담부증여 ───────────────────────────────────────────────────────
const BGI = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 200_000_000,
  mortgageDebtAmount: 0,
  annualRentTotal: 0,
  marketValueAtTransfer: 500_000_000,
  acquisitionMethod: "actual",
  actualAcquisitionTotal: 300_000_000,
  landStdPriceAtTransfer: 150_000_000,
  buildingStdPriceAtTransfer: 100_000_000,
  landStdPriceAtAcquisition: 80_000_000,
  buildingStdPriceAtAcquisition: 60_000_000,
  donorRelation: "lineal_descendant",
};
const BG = { ...BASE, transferPrice: 500_000_000, acquisitionDate: "2009-03-01", transferType: "burdened_gift", burdenedGiftInfo: BGI };

describe("부담부증여 — 비우면 400", () => {
  it("BG 🟢 7,080,000", async () => {
    await expectTax(BG, 7_080_000);
  });
  it.each([
    ["BG-1 정보 없음 (종전 일반 양도 32,685,000)", without(BG, "burdenedGiftInfo"), "burdenedGiftInfo"],
    ["BG-2 양도시 시가 (종전 0)", { ...BG, burdenedGiftInfo: without(BGI, "marketValueAtTransfer") }, "burdenedGiftInfo.marketValueAtTransfer"],
    ["BG-3 실지취득가액 (종전 0)", { ...BG, burdenedGiftInfo: without(BGI, "actualAcquisitionTotal") }, "burdenedGiftInfo.actualAcquisitionTotal"],
    ["BG-4 산정방식 (종전 legacy 분기)", { ...BG, burdenedGiftInfo: without(BGI, "acquisitionMethod") }, "burdenedGiftInfo.acquisitionMethod"],
    ["BG-5 증여자 관계 (종전 직계비속으로 증여세)", { ...BG, burdenedGiftInfo: without(BGI, "donorRelation") }, "burdenedGiftInfo.donorRelation"],
  ])("%s 🔴 400", async (_n, body, path) => {
    await expectRejected(body, path);
  });
});

// ── 수정신고 ─────────────────────────────────────────────────────────
const AMEND = {
  originalDeterminedTax: 10_000_000,
  applyUnderReportingPenalty: true,
  underReportingReason: "normal",
  underReductionMode: "auto_48_2",
  statutoryFilingDeadline: "2024-05-31",
  amendedFilingDate: "2024-08-31",
  priorAssessmentNotified: false,
  applyLatePaymentPenalty: true,
  amendedPaymentDate: "2024-08-31",
  correctionKind: "amend",
};

describe("수정신고·경정청구 — 비우면 400", () => {
  it("AM 🟢 날짜 모두 있음 200", async () => {
    expect((await single({ ...BASE, amendment: AMEND })).status).toBe(200);
  });
  it.each([
    ["AM-1 법정신고기한 (종전 납부지연 0·§48② 0)", "statutoryFilingDeadline"],
    ["AM-2 수정신고일 (종전 §48② 감면율 0)", "amendedFilingDate"],
    ["AM-3 납부(예정)일 (종전 오늘로 계산)", "amendedPaymentDate"],
  ])("%s 🔴 400", async (_n, key) => {
    await expectRejected({ ...BASE, amendment: without(AMEND, key) }, `amendment.${key}`);
  });
  it("AM-4 후발적 사유 안 날 🔴 400 (종전 청구기한 판정 생략)", async () => {
    await expectRejected(
      {
        ...BASE,
        amendment: {
          ...AMEND,
          correctionKind: "refund_claim",
          claimReasonType: "posterior",
          applyUnderReportingPenalty: false,
          applyLatePaymentPenalty: false,
          originalDeterminedTax: 60_000_000,
        },
      },
      "amendment.posteriorEventDate",
    );
  });
});

// ── 다건 route ───────────────────────────────────────────────────────
describe("다건 — 단건과 같은 규칙", () => {
  const item = { ...BASE, propertyId: "p1", propertyLabel: "p1" };
  it("M1 소유자 분리 + 토지 취득일 없음 🔴 400 (종전 분리 없이 계산)", async () => {
    await expectRejected(
      { taxYear: 2024, properties: [{ ...item, selfOwns: "land_only" }], annualBasicDeductionUsed: 0 },
      "properties.0.landAcquisitionDate",
      multi,
    );
    const ok = await multi({
      taxYear: 2024,
      properties: [{ ...item, selfOwns: "land_only", landAcquisitionDate: "2003-01-15" }],
      annualBasicDeductionUsed: 0,
    });
    expect(ok.status, JSON.stringify(ok.json.error)).toBe(200);
  });
  it("다건 §163⑨ 증여 + 환산 🔴 400 (주 자산 규칙 `refinePropertyRequiredInputs` 배선)", async () => {
    await expectRejected(
      {
        taxYear: 2024,
        properties: [
          {
            ...LAND,
            propertyId: "p1",
            propertyLabel: "p1",
            acquisitionCause: "gift",
            acquisitionDate: "2015-03-01",
            donorAcquisitionDate: "2000-01-01",
            useEstimatedAcquisition: true,
            acquisitionPrice: 0,
            standardPriceAtAcquisition: 150_000_000,
            standardPriceAtTransfer: 300_000_000,
          },
        ],
        annualBasicDeductionUsed: 0,
      },
      "properties.0.useEstimatedAcquisition",
      multi,
    );
  });
  it("다건 감면 전용면적 🔴 400", async () => {
    await expectRejected(
      { taxYear: 2024, properties: [{ ...item, reductions: [R993] }], annualBasicDeductionUsed: 0 },
      "properties.0.reductions.0.exclusiveAreaSqm993",
      multi,
    );
  });
});
