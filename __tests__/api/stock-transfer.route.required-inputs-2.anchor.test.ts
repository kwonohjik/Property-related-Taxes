/**
 * 주식 양도세 — Zod↔엔진 필수 점검 **2차** (계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1·§4.2).
 *
 * 비우면 400이 아니라 200 + 다른 세액이었다(엔진이 0·기본 분기로 읽는다). 조건은 ⑧의 거울이다.
 * - B5 비상장 환산 순손익·순자산 · B6 장부분실 액면가 · B8 양도일 거래정지 · B9 취득일 거래정지
 *   (키 집합은 `lib/calc/stock-transfer-required-inputs.ts` — ⑧과 공용)
 * - B10 취득 후 상장 간이 입력 · B11 매매사례가액 · B12 `face_value` 모드(⑧·UI 경로 없음 → enum 제거)
 * - B13~B17 취득원인 보조 입력 · B18 매수 lot 이월과세(분할·일자별 다건 — 후자는 ⑧에도 없었다 = 화면 도달)
 * - B21 국외주식 시가 모드 1주당 취득가액(화면에 칸이 없었다 — 입력 경로 추가 후 ⑧·⑫)
 *
 * 순손익가치 0은 적법(결손 법인)이라 **존재**만 요구한다 — 0은 통과해야 한다.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/stock-transfer/route";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { createEmptyAcquisitionLot } from "@/lib/stores/calc-wizard-stock-types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/stock-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const paths = (json: { issues?: { path: (string | number)[] }[] }) =>
  (json.issues ?? []).map((i) => i.path.join("."));
async function expectRejected(body: unknown, path: string) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(paths(r.json)).toContain(path);
}
async function expectFinalTax(body: unknown, tax: number) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  expect(r.json.result.finalTax).toBe(tax);
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

const BASE = {
  marketType: "unlisted",
  isMajorShareholder: true,
  selfShareRatio: 0.6,
  selfMarketCap: 2e9,
  isLargestShareholderGroup: false,
  combinedShareRatio: 0,
  combinedMarketCap: 0,
  priorYearEndDate: "2024-12-31",
  isQualifyingBlockShareholder: false,
  isHeavyRealEstateForRate: false,
  isHeavyRealEstateForValuation: false,
  isSmallMediumEnterprise: false,
  isMidsizeEnterprise: false,
  isListedSmallShareholder: false,
  isVentureCompany: false,
  isKOTCTrading: false,
  acquisitionDate: "2020-01-10",
  transferDate: "2025-07-01",
  shareCount: 1200,
  totalIssuedShares: 1000000,
  acquisitionCause: "purchase",
  transferPriceMode: "actual",
  transferActualInputMode: "per_share",
  perShareTransferPrice: 18000,
  acquisitionMode: "actual",
  perShareAcquisitionPrice: 10000,
  acquiredBeforeListing: false,
  tradingHaltAtTransfer: false,
  bookLost: false,
  expenseMode: "actual",
  filingType: "preliminary",
  filingDate: "2025-08-31",
  isElectronicFiling: false,
  filingViolation: "none",
  isFraudulent: false,
  isInternationalTransaction: false,
  realEstateGroupBasicDeductionUsed: 0,
};
const NI_NA = [
  "transferYearNetIncomePerShare",
  "transferYearNetAssetPerShare",
  "acquisitionYearNetIncomePerShare",
  "acquisitionYearNetAssetPerShare",
] as const;
const UNLISTED_EST = {
  ...without(BASE, "perShareAcquisitionPrice"),
  acquisitionMode: "estimated",
  expenseMode: "estimated",
  transferYearNetIncomePerShare: 20000,
  transferYearNetAssetPerShare: 15000,
  acquisitionYearNetIncomePerShare: 10000,
  acquisitionYearNetAssetPerShare: 8000,
};

describe("B5 — 비상장 환산 보충적 평가(시행령 §165④)", () => {
  it("🟢 네 값 모두 → 1,589,920", async () => {
    await expectFinalTax(UNLISTED_EST, 1_589_920);
  });
  // 종전: 양도측 NI·NA 생략 485,920 · 취득측 NI 2,268,640 · NA 2,365,600 (전부 200)
  it.each(NI_NA)("🔴 %s 없음 → 400", async (key) => {
    await expectRejected(without(UNLISTED_EST, key), key);
  });
  it("🟢 순손익가치 0(결손)은 입력이다 — 통과 (485,920)", async () => {
    await expectFinalTax({ ...UNLISTED_EST, transferYearNetIncomePerShare: 0 }, 485_920);
  });
  it("🟢 순자산 단독 평가 사유(§165④3호)면 순손익가치 없이 통과 (1,496,800)", async () => {
    await expectFinalTax(
      without(
        { ...UNLISTED_EST, netAssetOnlyReason: "liquidation_or_owner_death", acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" },
        "transferYearNetIncomePerShare",
        "acquisitionYearNetIncomePerShare",
      ),
      1_496_800,
    );
  });
});

describe("B6 — 취득시 장부분실 액면가(소득세법 §99①4호 후단)", () => {
  const B6 = {
    ...without(UNLISTED_EST, "acquisitionYearNetIncomePerShare", "acquisitionYearNetAssetPerShare"),
    acqFaceValueOnly: true,
    acqFaceValuePerShare: 5000,
  };
  it("🟢 액면가 있으면 취득측 평가 없이 2,608,000", async () => {
    await expectFinalTax(B6, 2_608_000);
  });
  it("🔴 액면가 없음 → 400 (종전 3,820,000 — 취득가액 0)", async () => {
    await expectRejected(without(B6, "acqFaceValuePerShare"), "acqFaceValuePerShare");
  });
});

describe("B5·B6-UI — ⑧도 같은 공용 술어로 요구한다 (⑫만 조이면 화면 400 막다른 길)", () => {
  const f = (patch: Partial<StockTransferFormData>) =>
    ({
      ...createInitialStockFormData(),
      marketType: "unlisted",
      acquisitionMode: "estimated",
      transferYearNetIncomePerShare: "20000",
      transferYearNetAssetPerShare: "15000",
      acquisitionYearNetIncomePerShare: "10000",
      acquisitionYearNetAssetPerShare: "8000",
      ...patch,
    }) as StockTransferFormData;
  const errs = (form: StockTransferFormData) =>
    validateAllSteps(form).filter((e) => e.severity === "error").map((e) => e.field);

  it("🔴 장부분실 토글 + 액면가 비움 → ⑧ 차단 / 🟢 액면가 있으면 그 오류 없음", () => {
    expect(errs(f({ acqFaceValueOnly: true, acqFaceValuePerShare: "" }))).toContain("acqFaceValuePerShare");
    expect(errs(f({ acqFaceValueOnly: true, acqFaceValuePerShare: "5000" }))).not.toContain("acqFaceValuePerShare");
  });
  it("🔴 취득연도 순자산가치 비움 → ⑧ 차단 / 🟢 순손익가치 \"0\"은 통과", () => {
    expect(errs(f({ acquisitionYearNetAssetPerShare: "" }))).toContain("acquisitionYearNetAssetPerShare");
    expect(errs(f({ transferYearNetIncomePerShare: "0" }))).not.toContain("transferYearNetIncomePerShare");
  });
});

describe("B8·B9 — 상장 거래정지 우회(시행령 §165③)", () => {
  const B8 = { ...UNLISTED_EST, marketType: "kosdaq", tradingHaltAtTransfer: true };
  const B9 = { ...UNLISTED_EST, marketType: "kosdaq", tradingHaltAtAcquisition: true, transferDatePriceAvg1Month: 18000 };
  it("B8 🟢 양도일 거래정지 1,589,920", async () => {
    await expectFinalTax(B8, 1_589_920);
  });
  it.each(NI_NA)("B8 🔴 %s 없음 → 400", async (key) => {
    await expectRejected(without(B8, key), key);
  });
  it("B9 🟢 취득일 거래정지 1,589,920 — 양도측 보충평가는 쓰지 않으므로 없어도 같다", async () => {
    await expectFinalTax(B9, 1_589_920);
    await expectFinalTax(without(B9, "transferYearNetIncomePerShare", "transferYearNetAssetPerShare"), 1_589_920);
  });
  it.each(["acquisitionYearNetIncomePerShare", "acquisitionYearNetAssetPerShare"])(
    "B9 🔴 %s 없음 → 400 (종전 2,268,640 / 2,365,600)",
    async (key) => {
      await expectRejected(without(B9, key), key);
    },
  );
});

describe("B10 — 취득 후 상장(시행령 §165⑤) 간이 입력", () => {
  const B10 = {
    ...UNLISTED_EST,
    marketType: "kospi",
    acquiredBeforeListing: true,
    transferDatePriceAvg1Month: 18000,
    listingDate: "2022-03-02",
    listingDatePriceAvg1Month: 16000,
    listingYearNetIncomePerShare: 12000,
    listingYearNetAssetPerShare: 11000,
  };
  it("🟢 744,180 — 양도연도 평가·상장일은 이 경로가 쓰지 않는다(생략해도 같다)", async () => {
    await expectFinalTax(B10, 744_180);
    await expectFinalTax(without(B10, "transferYearNetIncomePerShare", "transferYearNetAssetPerShare", "listingDate"), 744_180);
  });
  it.each([
    "listingDatePriceAvg1Month",
    "listingYearNetIncomePerShare",
    "listingYearNetAssetPerShare",
    "acquisitionYearNetIncomePerShare",
    "acquisitionYearNetAssetPerShare",
  ])("🔴 %s 없음 → 400 (종전 3,820,000 — 취득가액 0)", async (key) => {
    await expectRejected(without(B10, key), key);
  });
});

describe("B11 — 매매사례가액(시행령 §176의2③1호)", () => {
  const B11 = {
    ...without(BASE, "perShareAcquisitionPrice"),
    acquisitionMode: "sale_case",
    expenseMode: "estimated",
    acquisitionMarketSamplePrice: 10000,
    // 개산공제 base = 취득당시 기준시가(영 §163⑥4 · §165④) — 순손익=순자산이라 10,000으로 가중치 무관
    acquisitionYearNetIncomePerShare: 10000,
    acquisitionYearNetAssetPerShare: 10000,
  };
  // 양도 21,600,000 − 취득 12,000,000 − 개산공제(10,000 × 1,200주 × 1% = 120,000) = 9,480,000
  // − 기본공제 2,500,000 = 6,980,000 × 20% = 1,396,000. (종전 1,420,000은 개산공제 0원 — 매매사례를 «실가 의제»로 오독)
  it("🟢 매매사례가액 1,396,000 · 1주당 취득가액으로 대체해도 1,396,000", async () => {
    await expectFinalTax(B11, 1_396_000);
    await expectFinalTax({ ...without(B11, "acquisitionMarketSamplePrice"), perShareAcquisitionPrice: 10000 }, 1_396_000);
  });
  it("🔴 둘 다 없음 → 400 (종전 3,820,000)", async () => {
    await expectRejected(without(B11, "acquisitionMarketSamplePrice"), "acquisitionMarketSamplePrice");
  });
  it("🔴 취득연도 순손익·순자산 없음 → 400 (개산공제 base 없이 통과하면 필요경비가 조용히 0)", async () => {
    await expectRejected(without(B11, "acquisitionYearNetIncomePerShare"), "acquisitionYearNetIncomePerShare");
    await expectRejected(without(B11, "acquisitionYearNetAssetPerShare"), "acquisitionYearNetAssetPerShare");
  });
});

describe("B11-UI — ⑧도 「사례가액 또는 1주당 취득가액」 하나만 요구한다", () => {
  const f = (patch: Partial<StockTransferFormData>) =>
    ({ ...createInitialStockFormData(), marketType: "unlisted", acquisitionMode: "sale_case", ...patch }) as StockTransferFormData;
  const errs = (form: StockTransferFormData) =>
    validateAllSteps(form).filter((e) => e.severity === "error").map((e) => e.field);
  it("🟢 사례가액만 채우면 통과 (종전: 화면에 없는 1주당 취득가액을 요구해 막힘)", () => {
    const e = errs(
      f({
        acquisitionMarketSamplePrice: "10000",
        perShareAcquisitionPrice: "",
        acquisitionYearNetIncomePerShare: "10000",
        acquisitionYearNetAssetPerShare: "10000",
      }),
    );
    expect(e).not.toContain("perShareAcquisitionPrice");
    expect(e).not.toContain("acquisitionMarketSamplePrice");
  });
  it("🔴 둘 다 비면 차단", () => {
    expect(errs(f({ acquisitionMarketSamplePrice: "", perShareAcquisitionPrice: "" }))).toContain("acquisitionMarketSamplePrice");
  });
});

describe("B12 — `face_value` 모드는 ⑫에서 받지 않는다", () => {
  it("🔴 face_value → 400 (종전 액면가 있으면 2,608,000 · 없으면 3,820,000)", async () => {
    await expectRejected({ ...UNLISTED_EST, acquisitionMode: "face_value", faceValuePerShare: 5000 }, "acquisitionMode");
  });
  it("🟢 같은 입력의 정본 경로(환산 + 장부분실 토글)는 2,608,000 — 종전 face_value 결과와 같다", async () => {
    await expectFinalTax(
      {
        ...without(UNLISTED_EST, "acquisitionYearNetIncomePerShare", "acquisitionYearNetAssetPerShare"),
        acqFaceValueOnly: true,
        acqFaceValuePerShare: 5000,
      },
      2_608_000,
    );
  });
});

describe("B13~B17 — 취득원인 보조 입력(소득세법 §104② · §97의2①)", () => {
  const B13 = { ...BASE, acquisitionCause: "inheritance", acquisitionDate: "2025-03-01", decedentAcquisitionDate: "2010-01-01" };
  const B14 = { ...BASE, acquisitionCause: "merger_split", acquisitionDate: "2025-03-01", preMergerAcquisitionDate: "2010-01-01" };
  const B15 = {
    ...BASE,
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2025-03-01",
    donorAcquisitionDate: "2015-01-01",
    donorRelation: "spouse",
    donorAcquisitionPrice: 5000,
  };
  const B17 = { ...B15, giftTaxAmount: 1_000_000, transferredAssetValue: 12_000_000, giftTaxableValue: 12_000_000 };

  it("B13 🟢 1,420,000 / 🔴 피상속인 취득일 없음 → 400 (종전 2,130,000 — 단기 30%)", async () => {
    await expectFinalTax(B13, 1_420_000);
    await expectRejected(without(B13, "decedentAcquisitionDate"), "decedentAcquisitionDate");
  });
  it("B14 🟢 1,420,000 / 🔴 종전 주식 취득일 없음 → 400 (종전 2,130,000)", async () => {
    await expectFinalTax(B14, 1_420_000);
    await expectRejected(without(B14, "preMergerAcquisitionDate"), "preMergerAcquisitionDate");
  });
  it("B15 🟢 2,620,000 / 🔴 증여자 취득일 없음 → 400 (종전 2,130,000 — 이월과세 누락)", async () => {
    await expectFinalTax(B15, 2_620_000);
    await expectRejected(without(B15, "donorAcquisitionDate"), "donorAcquisitionDate");
  });
  it("B16 🔴 관계 없음 → 400 (종전 2,620,000 = 배우자로 읽음) · 🟢 「그 외」는 2,130,000", async () => {
    await expectRejected(without(B15, "donorRelation"), "donorRelation");
    await expectFinalTax({ ...B15, donorRelation: "other" }, 2_130_000);
  });
  it("B17 🟢 증여세 안분 2,420,000 / 🔴 분자·분모 중 하나 없음 → 400 (종전 2,620,000 — 증여세 0)", async () => {
    await expectFinalTax(B17, 2_420_000);
    await expectRejected(without(B17, "transferredAssetValue"), "transferredAssetValue");
    await expectRejected(without(B17, "giftTaxableValue"), "giftTaxableValue");
  });
});

const CARRYOVER_LOT = {
  id: "a",
  acquisitionDate: "2025-03-01",
  shareCount: 1200,
  perShareAcquisitionPrice: 10000,
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2015-01-01",
  donorRelation: "spouse",
  donorAcquisitionPrice: 5000,
};
const split = (lot: Record<string, unknown>) => ({
  ...BASE,
  costAllocationMethod: "fifo",
  acquisitionLots: [lot],
  transferLots: [{ id: "t1", transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18000 }],
});
const lotsOnly = (lot: Record<string, unknown>) => ({
  ...without(BASE, "perShareAcquisitionPrice"),
  acquisitionActualInputMode: "lots",
  costAllocationMethod: "fifo",
  acquisitionLots: [lot],
  transferLots: [{ id: "__synth_single_transfer__", transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18000 }],
});

describe.each([
  ["분할", split],
  ["일자별 다건", lotsOnly],
] as const)("B18 — 매수 lot 이월과세 (%s)", (_label, make) => {
  it("🟢 2,620,000 · 「그 외」 관계 2,130,000", async () => {
    await expectFinalTax(make(CARRYOVER_LOT), 2_620_000);
    await expectFinalTax(make({ ...CARRYOVER_LOT, donorRelation: "other" }), 2_130_000);
  });
  it("🔴 관계 없음 → 400 (종전 2,620,000 = 배우자로 읽음)", async () => {
    await expectRejected(make(without(CARRYOVER_LOT, "donorRelation")), "acquisitionLots.0.donorRelation");
  });
  it("🔴 증여자 취득일 없음 → 400 (종전 3,930,000 — 가액만 승계되고 세율은 단기)", async () => {
    await expectRejected(make(without(CARRYOVER_LOT, "donorAcquisitionDate")), "acquisitionLots.0.donorAcquisitionDate");
  });
  it("🟢 증여세 짝 2,420,000 / 🔴 한쪽만 → 400 (종전 2,620,000 — 증여세 0)", async () => {
    await expectFinalTax(make({ ...CARRYOVER_LOT, donorGiftTaxAmount: 1_000_000, donorGiftTaxableValue: 12_000_000 }), 2_420_000);
    await expectRejected(make({ ...CARRYOVER_LOT, donorGiftTaxAmount: 1_000_000 }), "acquisitionLots.0.donorGiftTaxableValue");
    await expectRejected(make({ ...CARRYOVER_LOT, donorGiftTaxableValue: 12_000_000 }), "acquisitionLots.0.donorGiftTaxableValue");
  });
});

describe("B18-UI — 일자별 다건(lots-only)도 ⑧이 이월과세 lot을 본다 (화면 도달)", () => {
  const form = (lot: Partial<ReturnType<typeof createEmptyAcquisitionLot>>) =>
    ({
      ...createInitialStockFormData(),
      marketType: "unlisted",
      stockName: "테스트",
      acquisitionDate: "2025-03-01",
      transferDate: "2025-07-01",
      shareCount: "1200",
      totalIssuedShares: "1000000",
      transferActualInputMode: "per_share",
      perShareTransferPrice: "18000",
      acquisitionMode: "actual",
      acquisitionActualInputMode: "lots",
      acquisitionLots: [
        {
          ...createEmptyAcquisitionLot(),
          id: "a",
          acquisitionDate: "2025-03-01",
          shareCount: "1200",
          perShareAcquisitionPrice: "10000",
          acquisitionCause: "carryover_gift",
          donorAcquisitionDate: "2015-01-01",
          donorRelation: "spouse",
          donorAcquisitionPrice: "5000",
          ...lot,
        },
      ],
    }) as StockTransferFormData;
  const errorFields = (f: StockTransferFormData) =>
    validateAllSteps(f).filter((e) => e.severity === "error").map((e) => e.field);

  it("🟢 다 채우면 lot 오류 없음 · ④는 lot 원인을 그대로 싣는다", () => {
    expect(errorFields(form({})).filter((f) => f.startsWith("acquisitionLots"))).toEqual([]);
    const body = buildStockTransferApiBody(form({}));
    expect((body.acquisitionLots as { donorRelation?: string }[])[0].donorRelation).toBe("spouse");
  });
  it("🔴 관계·증여자 취득일 비우면 ⑧ 차단 (종전 오류 0건 → ⑫ 400 막다른 길 방지)", () => {
    const fields = errorFields(form({ donorRelation: undefined, donorAcquisitionDate: "" }));
    expect(fields).toContain("acquisitionLots[0].donorRelation");
    expect(fields).toContain("acquisitionLots[0].donorAcquisitionDate");
  });
  it("🔴 증여세 한쪽만 → ⑧ 차단", () => {
    expect(errorFields(form({ donorGiftTaxAmount: "1000000" }))).toContain("acquisitionLots[0].donorGiftTaxableValue");
  });
});

const FOREIGN = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 10,
  isListedForeignCorp: true,
  stockName: "AAPL",
  countryCode: "US",
  shareCount: 100,
  transferDate: "2025-07-01",
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 200,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1400,
  acquisitionDate: "2020-01-10",
  acquisitionMode: "market_price",
  perShareAcquisitionPriceForeign: 100,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1200,
  capitalExpenditureForeign: 0,
  transferCostForeign: 0,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

describe("B21 — 국외주식 시가 모드 1주당 취득가액", () => {
  it("⑫ 🟢 2,700,000 / 🔴 없음 → 400 (종전 5,100,000 — 취득가액 0)", async () => {
    await expectFinalTax(FOREIGN, 2_700_000);
    await expectRejected(without(FOREIGN, "perShareAcquisitionPriceForeign"), "perShareAcquisitionPriceForeign");
  });

  const fgForm = (patch: Partial<StockTransferFormData>) =>
    ({
      ...createInitialStockFormData(),
      marketType: "foreign_stock",
      acquisitionModeFS: "market_price",
      ...patch,
    }) as StockTransferFormData;

  it("④ 시가 모드에서도 1주당 취득가액을 싣는다 (종전 실가 모드만)", () => {
    const body = buildStockTransferApiBody(fgForm({ perShareAcquisitionPriceForeign: "100" }));
    expect(body.acquisitionMode).toBe("market_price");
    expect(body.perShareAcquisitionPriceForeign).toBe(100);
  });
  it("⑧ 시가 모드에서 비우면 차단 (종전 오류 0건 → 취득가액 0)", () => {
    const errs = validateAllSteps(fgForm({ perShareAcquisitionPriceForeign: "" }));
    expect(errs.some((e) => e.field === "perShareAcquisitionPriceForeign" && e.severity === "error")).toBe(true);
  });
});
