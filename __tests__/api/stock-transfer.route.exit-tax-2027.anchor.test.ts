/**
 * 국외전출세 2027.1.1. 개정 — route 배관 anchor (W-1~W-3 · ⑨⑩⑫⑭) — PR-5
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §5·§5.1·§7.2
 * 수치는 전부 손계산이다(엔진 실행값 복사 아님) — 엔진 anchor(`exit-tax-2027-*.anchor.test.ts`)와 같은 시료.
 *
 *   H1 코스닥 10,000주 · 취득 10,000/주 · 시가 50,000/주              → 차익 400,000,000 (1호)
 *   F1 국외주식 1,000주 · 취득 480,000/주 · 시가 1,400,000/주          → 차익 920,000,000 (2호나목)
 *   F1 외화판 1,000주 · 취득 400 USD × 1,200 · 시가 1,000 USD × 1,400 → 시가 1,400,000,000 · 취득 480,000,000 (같은 차익)
 *
 *   K-5   F1만 · 2027-01-01          (920,000,000 − 2,500,000) × 20% = 183,500,000
 *   K-6   내국법인 해외상장 중소기업 → (920,000,000 − 2,500,000) × 10% = 91,750,000
 *   K-11  H1 + F1 · 배분 (2,500,000 / 0)  → 84,375,000 + 184,000,000 = 268,375,000
 *         H1 + F1 · 배분 (0 / 2,500,000)  → 85,000,000 + 183,500,000 = 268,500,000
 *   K-19  문자열 출국일 "2027-01-01" → from2027 / "2026-12-31" → pre2027 (미변환이면 `Date < string` silent false)
 *   K-24  교재 갑 2026-09-01 출국 · 실제 양도 2027-03-01 → 41,875,000 (게이트가 출국일이라는 음성 시료)
 *
 * · W-1 새 필드(종목 14개·최상위 5개)가 body → Zod → route → 엔진까지 도달한다(strip 없음)
 * · W-2 문자열 날짜(`foreignWorkerStartDate`·`acquisitionDate`·`departureDate`)가 Date로 변환돼 엔진 비교에 쓰인다
 * · W-3 엔진의 입력 결함(INVALID_INPUT)이 400 — Zod 최상위 refine(⑫)이 같은 엔진 판정으로 거르고,
 *       놓친 조합은 route가 `taxCalculationErrorResponse`로 400 처리한다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

// 엔진은 그대로 쓰되, 안전망 분기 시험을 위해 호출을 가로챌 수 있게 감싼다
vi.mock("@/lib/tax-engine/stock-transfer/stock-transfer-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/stock-transfer/stock-transfer-tax")>();
  return { ...actual, calculateStockTransferTax: vi.fn(actual.calculateStockTransferTax) };
});

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/stock-transfer/route";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

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
const issuePaths = (json: { issues?: { path: (string | number)[] }[] }) =>
  (json.issues ?? []).map((i) => i.path.join("."));

const H1 = {
  id: "h1",
  stockName: "H1 코스닥",
  marketType: "kosdaq",
  shareCount: 10_000,
  acquisitionDate: "2015-01-01",
  perShareAcquisitionPrice: 10_000,
  departureDayValuationMode: "market_price",
  departureDayMarketPrice: 50_000,
};
/** F1 — 원화 단가 경로(K-5). 외국법인 발행(기본) → 2호나목 */
const F1 = {
  id: "f1",
  stockName: "F1 국외주식",
  marketType: "foreign_stock",
  isListedForeignCorp: true,
  shareCount: 1_000,
  acquisitionDate: "2018-01-01",
  perShareAcquisitionPrice: 480_000,
  departureDayValuationMode: "market_price",
  departureDayMarketPrice: 1_400_000,
};
/** F1 — 외화 경로. 환산 총액은 위와 같다(1,400,000,000 / 480,000,000) */
const F1_FX = {
  id: "f1",
  stockName: "F1 국외주식(외화)",
  marketType: "foreign_stock",
  isListedForeignCorp: true,
  countryCode: "US",
  foreignCurrencyCode: "USD",
  shareCount: 1_000,
  acquisitionDate: "2018-01-01",
  perShareAcquisitionPrice: 0,
  departureDayValuationMode: "foreign_market_price",
  departureDayPriceForeign: 1_000,
  departureExchangeRate: 1_400,
  perShareAcquisitionPriceForeign: 400,
  acquisitionExchangeRate: 1_200,
};

function body(holdings: unknown[], over: Record<string, unknown> = {}) {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: "2027-01-01",
    isMajorShareholder: true,
    holdings,
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    ...over,
  };
}

const ALL_TRUE = {
  isOfficerOrEmployee: true,
  isNotDailyWorker: true,
  domesticWorkRatioAtLeast80: true,
  departedWithin6MonthsOfWorkEnd: true,
};

beforeEach(() => {
  vi.mocked(calculateStockTransferTax).mockClear();
});

describe("W-1 · 새 필드가 body → Zod → route → 엔진까지 도달한다", () => {
  it("K-5 F1만 · 2027-01-01 → 산출세액 183,500,000", async () => {
    const { status, json } = await post(body([F1]));
    expect(status).toBe(200);
    expect(json.result.exitTaxRegime).toBe("from2027");
    expect(json.result.incomeTax).toBe(183_500_000);
    expect(json.result.holdingDetails[0].rateBucket).toBe("clause2b");
  });

  it("종목 필드 — isListedForeignCorp=false + isSmallMediumEnterprise=true → 2호가목 10% (K-6 91,750,000)", async () => {
    const { status, json } = await post(
      body([{ ...F1, isListedForeignCorp: false, isSmallMediumEnterprise: true }]),
    );
    expect(status).toBe(200);
    expect(json.result.incomeTax).toBe(91_750_000);
    expect(json.result.holdingDetails[0].rateBucket).toBe("clause2a");
  });

  it("종목 필드 — 외화 시가 모드·단가·환율 4종·통화코드가 도달한다 (환산 총액 1,400,000,000 / 480,000,000)", async () => {
    const { status, json } = await post(body([F1_FX]));
    expect(status).toBe(200);
    expect(json.result.incomeTax).toBe(183_500_000);
    const fx = json.result.holdingDetails[0].fx;
    expect(fx.departureValueKrw).toBe(1_400_000_000);
    expect(fx.acquisitionCostKrw).toBe(480_000_000);
    expect(fx.currency).toBe("USD"); // foreignCurrencyCode가 엔진까지 도달했다
    expect(json.result.holdingDetails[0].valuationMode).toBe("foreign_market_price");
  });

  it("종목 필드 — foreign_decree_178_3 시가 모드(§178의9②3호)도 도달한다", async () => {
    const { status, json } = await post(body([{ ...F1_FX, departureDayValuationMode: "foreign_decree_178_3" }]));
    expect(status).toBe(200);
    expect(json.result.holdingDetails[0].valuationMode).toBe("foreign_decree_178_3");
    expect(json.result.incomeTax).toBe(183_500_000);
  });

  it("최상위 — basicDeductionAllocation이 도달한다 (K-11 배분에 따라 268,375,000 / 268,500,000)", async () => {
    const a = await post(body([H1, F1], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }));
    expect(a.status).toBe(200);
    expect(a.json.result.incomeTax).toBe(268_375_000);
    expect(a.json.result.basicDeductionBasis).toBe("user_allocation");

    const b = await post(body([H1, F1], { basicDeductionAllocation: { clause1: 0, clause2b: 2_500_000 } }));
    expect(b.status).toBe(200);
    expect(b.json.result.incomeTax).toBe(268_500_000);
  });

  it("최상위 — foreignWorkerStatus=foreign_worker + 요건 4개 전부 true → 국외주식 제외 (not_liable)", async () => {
    const { status, json } = await post(
      body([F1], { foreignWorkerStatus: "foreign_worker", foreignWorkerChecks: ALL_TRUE }),
    );
    expect(status).toBe(200);
    expect(json.result.taxCategory).toBe("not_liable");
    expect(json.result.holdingDetails[0].excludedReason).toBe("foreign_worker_owned");
  });

  it("최상위 — 요건 하나라도 false면 제외하지 않는다 (foreignWorkerChecks 키가 도달)", async () => {
    const { status, json } = await post(
      body([F1], {
        foreignWorkerStatus: "foreign_worker",
        foreignWorkerChecks: { ...ALL_TRUE, domesticWorkRatioAtLeast80: false },
      }),
    );
    expect(status).toBe(200);
    expect(json.result.incomeTax).toBe(183_500_000);
    expect(json.result.holdingDetails[0].scope).toBe("taxed");
  });

  it("최상위 — foreignWorkerFamilyKind·foreignWorkerStartDate 도달: 근로 개시일 전 취득 종목만 제외 (§178의8②3호)", async () => {
    const family = {
      foreignWorkerStatus: "foreign_worker_family",
      foreignWorkerChecks: ALL_TRUE,
      foreignWorkerFamilyKind: "spouse",
    };
    // F1 취득 2018-01-01 < 근로 개시일 2019-06-01 → 제외
    const before = await post(body([F1], { ...family, foreignWorkerStartDate: "2019-06-01" }));
    expect(before.status).toBe(200);
    expect(before.json.result.holdingDetails[0].excludedReason).toBe("foreign_worker_family_pre_work");
    // 취득이 근로 개시일 이후(2017-06-01 < 2018-01-01) → 「전에 취득」이 아니므로 과세
    const after = await post(body([F1], { ...family, foreignWorkerStartDate: "2017-06-01" }));
    expect(after.status).toBe(200);
    expect(after.json.result.holdingDetails[0].scope).toBe("taxed");
    expect(after.json.result.incomeTax).toBe(183_500_000);
  });
});

describe("W-2 · 문자열 날짜가 Date로 변환돼 엔진에 도달한다 (⑭)", () => {
  it("K-19 출국일 문자열 — 2027-01-01 → from2027 / 2026-12-31 → pre2027(국외 종목 제외·echo)", async () => {
    const on = await post(body([H1, F1], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }));
    expect(on.json.result.exitTaxRegime).toBe("from2027");
    const off = await post(body([H1, F1], { departureDate: "2026-12-31" }));
    expect(off.status).toBe(200);
    expect(off.json.result.exitTaxRegime).toBe("pre2027");
    expect(off.json.result.incomeTax).toBe(84_375_000);
    expect(off.json.result.holdingDetails.find((h: { id: string }) => h.id === "f1").excludedReason).toBe(
      "pre2027_foreign_not_covered",
    );
  });

  it("holdings[].acquisitionDate 문자열이 Date로 도달한다 — 근로 개시일 비교의 양변(3호)", async () => {
    // 취득일을 근로 개시일과 같은 날로 → 「전」이 아니다(같은 날은 과세). 둘 중 하나라도 문자열이면 비교가 깨진다
    const { json } = await post(
      body([{ ...F1, acquisitionDate: "2019-06-01" }], {
        foreignWorkerStatus: "foreign_worker_family",
        foreignWorkerChecks: ALL_TRUE,
        foreignWorkerFamilyKind: "child_20_or_under",
        foreignWorkerStartDate: "2019-06-01",
      }),
    );
    expect(json.result.holdingDetails[0].scope).toBe("taxed");
  });

  it("K-24 교재 갑 — 2026-09-01 출국 · 실제 양도 2027-03-01 → 종전 규정 41,875,000 (기존 body 불변)", async () => {
    const { status, json } = await post(
      body(
        [{ ...H1, marketType: "kosdaq" }],
        {
          departureDate: "2026-09-01",
          deferralRequested: true,
          actualTransferDate: "2027-03-01",
          actualTransferPricePerShare: 45_000,
          foreignTaxPaid: 30_000_000,
        },
      ),
    );
    expect(status).toBe(200);
    expect(json.result.exitTaxRegime).toBe("pre2027");
    expect(json.result.incomeTax).toBe(84_375_000);
    expect(json.result.adjustmentDeduction).toBe(12_500_000);
    expect(json.result.finalTaxAfterAdjustment).toBe(41_875_000);
  });

  it("형식이 틀린 날짜 문자열은 500이 아니라 400", async () => {
    const { status } = await post(body([F1], { departureDate: "not-a-date" }));
    expect(status).toBe(400);
  });
});

describe("W-3 · 엔진의 INVALID_INPUT은 400 (⑫가 같은 판정으로 거르고, 놓친 조합은 route 안전망)", () => {
  it("구분 2개 이상(1호 + 2호)인데 기본공제 배분이 없음 → 400 · 경로 basicDeductionAllocation", async () => {
    const { status, json } = await post(body([H1, F1]));
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("basicDeductionAllocation");
  });

  it("배분 합계가 공제액과 다름 → 400", async () => {
    const { status, json } = await post(body([H1, F1], { basicDeductionAllocation: { clause1: 1_000_000, clause2b: 0 } }));
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("basicDeductionAllocation");
  });

  it("구분 간 손실(2호 구분 음수) → 400 · 경로 holdings", async () => {
    // 시가 1,400,000,000(5억 초과라 과세 대상) < 취득 1,500,000,000 → 2호나목 차익 −100,000,000
    const lossF1 = { ...F1, perShareAcquisitionPrice: 1_500_000 };
    const { status, json } = await post(
      body([H1, lossF1], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("holdings");
  });

  it("외화 시가 모드인데 출국일 기준환율 없음 → 400 · 경로 holdings.f1.departureExchangeRate (자동 보정 없음)", async () => {
    const { departureExchangeRate: _omit, ...noRate } = F1_FX;
    void _omit;
    const { status, json } = await post(body([noRate]));
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("holdings.f1.departureExchangeRate");
  });

  it("환율 소수 5자리 → 400 (엔진 fxRateProblem과 같은 사유)", async () => {
    const { status, json } = await post(body([{ ...F1_FX, departureExchangeRate: 1400.12345 }]));
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("holdings.f1.departureExchangeRate");
  });

  it("외화 시가 모드에 원화 단가를 섞음 → 400", async () => {
    const { status } = await post(body([{ ...F1_FX, perShareAcquisitionPrice: 480_000 }]));
    expect(status).toBe(400);
  });

  it("외국인근로자 가족인데 근로 개시일 없음 → 400 · 경로 foreignWorkerStartDate", async () => {
    const { status, json } = await post(
      body([F1], {
        foreignWorkerStatus: "foreign_worker_family",
        foreignWorkerChecks: ALL_TRUE,
        foreignWorkerFamilyKind: "spouse",
      }),
    );
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("foreignWorkerStartDate");
  });

  it("외국인근로자 구분이 none이 아닌데 요건 4개 없음 → 400 · 경로 foreignWorkerChecks", async () => {
    const { status, json } = await post(body([F1], { foreignWorkerStatus: "foreign_worker" }));
    expect(status).toBe(400);
    expect(issuePaths(json)).toContain("foreignWorkerChecks");
  });

  it("2호 과세 종목 + 경정청구 입력(Q-8) → 400", async () => {
    const { status } = await post(body([F1], { actualTransferPricePerShare: 1_000_000 }));
    expect(status).toBe(400);
  });

  it("2026 출국 + 국외 종목은 거부하지 않는다 (제외·고지 — C-4)", async () => {
    const { status, json } = await post(body([F1], { departureDate: "2026-12-31" }));
    expect(status).toBe(200);
    expect(json.result.taxCategory).toBe("not_liable");
  });

  it("안전망 — Zod가 놓쳐 엔진이 INVALID_INPUT을 던지면 route는 400 + fieldErrors (500 아님)", async () => {
    vi.mocked(calculateStockTransferTax).mockImplementationOnce(() => {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "안전망 시험", { path: "holdings.f1" });
    });
    const { status, json } = await post(body([F1]));
    expect(status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(json.error.fieldErrors["holdings.f1"]).toEqual(["안전망 시험"]);
  });

  it("안전망 — INVALID_INPUT이 아닌 오류는 종전대로 500", async () => {
    vi.mocked(calculateStockTransferTax).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const { status } = await post(body([F1]));
    expect(status).toBe(500);
  });
});
