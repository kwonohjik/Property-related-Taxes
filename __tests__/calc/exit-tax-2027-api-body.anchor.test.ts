/**
 * 국외전출세 2027.1.1. 개정 — ④⑬ API 변환 anchor
 *
 * 핵심: **숨은 값 금지**(#3707과 같은 원칙) — 입력칸이 안 보이는 상태(시장·모드·era·토글이 꺼짐)에서 남아 있는 값은
 * body에 실리지 않는다. 안 그러면 엔진이 거부하거나(국내 행에 외화 필드), 조용히 다른 값으로 계산된다.
 *
 *   B-1 국내 행 — 외화 키 없음 (시장을 국외 → 국내로 바꿔도 stale 외화 값은 전송되지 않는다)
 *   B-2 국외 행(외화 모드) — 외화 키 전송 · 원화 단가 0 · stale 원화 시가 미전송
 *   B-3 외국법인 발행이면 중소기업은 false로 고정 (stale true 차단)
 *   B-4 환율·외화 단가 빈값은 키를 싣지 않는다 (대체 환율 없음)
 *   B-5 외국인근로자 — era && 국외 행 && status≠none일 때만, family일 때만 가족 구분·근로 개시일
 *   B-6 기본공제 배분 — 과세 구분 ≥2일 때만, 과세 구분의 값만
 */
import { describe, it, expect } from "vitest";
import {
  buildExitTaxApiBody,
  buildExitTaxHoldingBody,
  previewExitTaxBuckets,
} from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { exitForm, exitHolding, F1, H1 } from "../_helpers/exit-tax-2027-form";

const FOREIGN_KEYS = [
  "isListedForeignCorp",
  "isSmallMediumEnterprise",
  "countryCode",
  "foreignCurrencyCode",
  "departureDayPriceForeign",
  "departureExchangeRate",
  "perShareAcquisitionPriceForeign",
  "acquisitionExchangeRate",
];

describe("④ 종목 body", () => {
  it("B-1 국내 행에는 stale 외화 값이 있어도 외화 키가 없다", () => {
    const body = buildExitTaxHoldingBody(
      H1({
        // 국외주식이었다가 국내로 되돌린 행 — 외화 칸에 값이 남아 있다
        departureDayPriceForeign: "1000",
        departureExchangeRate: "1400",
        perShareAcquisitionPriceForeign: "400",
        acquisitionExchangeRate: "1200",
        isSmallMediumEnterprise: true,
      }),
    );
    for (const k of FOREIGN_KEYS) expect(body, k).not.toHaveProperty(k);
    expect(body.departureDayMarketPrice).toBe(50_000);
    expect(body.perShareAcquisitionPrice).toBe(10_000);
  });

  it("B-2 국외 행(외화 모드)은 외화 키를 싣고 원화 단가는 0, stale 원화 시가는 싣지 않는다", () => {
    const body = buildExitTaxHoldingBody(
      F1({ perShareAcquisitionPrice: "480,000", departureDayMarketPrice: "1,400,000" }),
    );
    expect(body).toMatchObject({
      marketType: "foreign_stock",
      departureDayValuationMode: "foreign_market_price",
      isListedForeignCorp: true,
      countryCode: "US",
      foreignCurrencyCode: "USD",
      departureDayPriceForeign: 1000,
      departureExchangeRate: 1400,
      perShareAcquisitionPriceForeign: 400,
      acquisitionExchangeRate: 1200,
      perShareAcquisitionPrice: 0,
    });
    expect(body).not.toHaveProperty("departureDayMarketPrice");
    expect(body).not.toHaveProperty("priorYearEndMonthAvg");
  });

  it("B-3 외국법인 발행(true)이면 중소기업 stale true도 false로 보낸다 · 내국법인 발행이면 입력값 그대로", () => {
    expect(buildExitTaxHoldingBody(F1({ isListedForeignCorp: true, isSmallMediumEnterprise: true })).isSmallMediumEnterprise).toBe(false);
    expect(buildExitTaxHoldingBody(F1({ isListedForeignCorp: false, isSmallMediumEnterprise: true })).isSmallMediumEnterprise).toBe(true);
    expect(buildExitTaxHoldingBody(F1({ isListedForeignCorp: false, isSmallMediumEnterprise: false })).isSmallMediumEnterprise).toBe(false);
  });

  it("B-4 환율·외화 단가 빈값은 키를 싣지 않는다 (대체 환율·이전 값 보간 없음)", () => {
    const body = buildExitTaxHoldingBody(
      F1({ departureExchangeRate: "", acquisitionExchangeRate: "", departureDayPriceForeign: "", perShareAcquisitionPriceForeign: "" }),
    );
    for (const k of ["departureDayPriceForeign", "departureExchangeRate", "perShareAcquisitionPriceForeign", "acquisitionExchangeRate"]) {
      expect(body, k).not.toHaveProperty(k);
    }
  });

  it("B-4b 3중 패턴 default — 모드·국가·통화가 빈 문자열이면 시장별 기본값", () => {
    const body = buildExitTaxHoldingBody(F1({ departureDayValuationMode: "" as never, countryCode: "", foreignCurrencyCode: "" }));
    expect(body.departureDayValuationMode).toBe("foreign_market_price");
    expect(body.countryCode).toBe("US");
    expect(body.foreignCurrencyCode).toBe("USD");
    expect(buildExitTaxHoldingBody(H1({ departureDayValuationMode: "" as never })).departureDayValuationMode).toBe("market_price");
  });

  it("B-4c 소수 환율은 소수 그대로(콤마 제거) 전달한다", () => {
    const body = buildExitTaxHoldingBody(F1({ departureExchangeRate: "1,300.10" }));
    expect(body.departureExchangeRate).toBe(1300.1);
  });
});

describe("④ 외국인근로자 body", () => {
  const checks = {
    etForeignWorkerIsOfficerOrEmployee: true,
    etForeignWorkerIsNotDailyWorker: true,
    etForeignWorkerDomesticRatio80: true,
    etForeignWorkerDeparted6Months: false,
  };

  it("B-5a status none → 아무것도 싣지 않는다 (stale 요건 체크가 있어도)", () => {
    const body = buildExitTaxApiBody(exitForm({ etForeignWorkerStatus: "none", ...checks }));
    expect(body).not.toHaveProperty("foreignWorkerStatus");
    expect(body).not.toHaveProperty("foreignWorkerChecks");
  });

  it("B-5b foreign_worker → status + 요건 4개(선언 그대로, 빠진 키 없음), 가족 필드는 stale이어도 미전송", () => {
    const body = buildExitTaxApiBody(
      exitForm({
        etForeignWorkerStatus: "foreign_worker",
        ...checks,
        etForeignWorkerFamilyKind: "spouse",
        etForeignWorkerStartDate: "2024-01-01",
      }),
    );
    expect(body.foreignWorkerStatus).toBe("foreign_worker");
    expect(body.foreignWorkerChecks).toEqual({
      isOfficerOrEmployee: true,
      isNotDailyWorker: true,
      domesticWorkRatioAtLeast80: true,
      departedWithin6MonthsOfWorkEnd: false,
    });
    expect(body).not.toHaveProperty("foreignWorkerFamilyKind");
    expect(body).not.toHaveProperty("foreignWorkerStartDate");
  });

  it("B-5c foreign_worker_family → 가족 구분·근로 개시일 전송, 비어 있으면 키 없음", () => {
    const full = buildExitTaxApiBody(
      exitForm({
        etForeignWorkerStatus: "foreign_worker_family",
        ...checks,
        etForeignWorkerFamilyKind: "child_20_or_under",
        etForeignWorkerStartDate: "2024-01-01",
      }),
    );
    expect(full.foreignWorkerFamilyKind).toBe("child_20_or_under");
    expect(full.foreignWorkerStartDate).toBe("2024-01-01");
    const empty = buildExitTaxApiBody(
      exitForm({ etForeignWorkerStatus: "foreign_worker_family", ...checks }),
    );
    expect(empty).not.toHaveProperty("foreignWorkerFamilyKind");
    expect(empty).not.toHaveProperty("foreignWorkerStartDate");
  });

  it("B-5d era 밖(2026-12-31 출국)이거나 국외 행이 없으면 status≠none이어도 미전송", () => {
    const preEra = buildExitTaxApiBody(
      exitForm({ etDepartureDate: "2026-12-31", etForeignWorkerStatus: "foreign_worker", ...checks }),
    );
    expect(preEra).not.toHaveProperty("foreignWorkerStatus");
    const noForeign = buildExitTaxApiBody(
      exitForm({ etHoldings: [H1()], etForeignWorkerStatus: "foreign_worker", ...checks }),
    );
    expect(noForeign).not.toHaveProperty("foreignWorkerStatus");
  });
});

describe("④ 기본공제 배분 body", () => {
  it("B-6a 과세 구분 2개(1호+2호나목) → 과세 구분의 입력값만 싣는다 (2호가목 stale 값은 미전송)", () => {
    const form = exitForm({
      etHoldings: [H1(), F1()],
      etBasicDeductionAllocClause1: "2,500,000",
      etBasicDeductionAllocClause2b: "0",
      etBasicDeductionAllocClause2a: "999", // 과세 구분이 아님 — 숨은 값
    });
    expect(previewExitTaxBuckets(form)).toEqual(expect.arrayContaining(["clause1", "clause2b"]));
    expect(buildExitTaxApiBody(form).basicDeductionAllocation).toEqual({ clause1: 2_500_000, clause2b: 0 });
  });

  it("B-6b 과세 구분이 하나면 stale 배분이 있어도 싣지 않는다 (엔진은 입력이 있으면 자동값과 같은지 검증한다)", () => {
    const form = exitForm({ etHoldings: [F1()], etBasicDeductionAllocClause2b: "2,500,000" });
    expect(previewExitTaxBuckets(form)).toEqual(["clause2b"]);
    expect(buildExitTaxApiBody(form)).not.toHaveProperty("basicDeductionAllocation");
  });

  it("B-6c 빈 칸은 0으로 채우지 않는다 — 입력한 구분만 싣고, 모두 비면 키 자체가 없다", () => {
    const some = buildExitTaxApiBody(exitForm({ etHoldings: [H1(), F1()], etBasicDeductionAllocClause1: "2,500,000" }));
    expect(some.basicDeductionAllocation).toEqual({ clause1: 2_500_000 });
    const none = buildExitTaxApiBody(exitForm({ etHoldings: [H1(), F1()] }));
    expect(none).not.toHaveProperty("basicDeductionAllocation");
  });

  it("B-6d 5억 이하라 국외가 제외되면 과세 구분은 1호뿐 → 배분 미전송 (판정은 엔진 helper)", () => {
    // F1을 소액(시가 100 USD × 1,400 × 1,000주 = 140,000,000 ≤ 5억)으로 — 국외주식 합계가 임계 이하라 제외
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    const form = exitForm({ etHoldings: [H1(), small], etBasicDeductionAllocClause1: "2,500,000" });
    expect(previewExitTaxBuckets(form)).toEqual(["clause1"]);
    expect(buildExitTaxApiBody(form)).not.toHaveProperty("basicDeductionAllocation");
  });

  it("B-6e 입력이 덜 찬 종목(환율 빈값)이면 과세 구분을 판정하지 못해 null — 배분 미전송", () => {
    const form = exitForm({ etHoldings: [H1(), F1({ departureExchangeRate: "" })], etBasicDeductionAllocClause1: "2,500,000" });
    expect(previewExitTaxBuckets(form)).toBeNull();
    expect(buildExitTaxApiBody(form)).not.toHaveProperty("basicDeductionAllocation");
  });

  it("B-6f 2026 이전 출국이면 국외 행은 제외돼 과세 구분 1호뿐", () => {
    const form = exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1(), F1()] });
    expect(previewExitTaxBuckets(form)).toEqual(["clause1"]);
  });
});

describe("④ 국내 행 보존 — 종전 body와 키가 같다", () => {
  it("B-7 국내 행 body 키 집합 (외화 키 없음 · 종전 키만)", () => {
    const body = buildExitTaxHoldingBody(exitHolding("x", { stockName: "A", marketType: "kospi", shareCount: "10", acquisitionDate: "2020-01-01", perShareAcquisitionPrice: "1,000", departureDayMarketPrice: "2,000" }));
    expect(Object.keys(body).sort()).toEqual(
      ["acquisitionDate", "departureDayMarketPrice", "departureDayValuationMode", "id", "marketType", "perShareAcquisitionPrice", "shareCount", "stockName"].sort(),
    );
  });
});
