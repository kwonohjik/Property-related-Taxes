/**
 * anchor: 가산세 상세 — **폼 → API → zod → coerceDates → 엔진 배선** (14 동기화 지점 ④⑧⑫⑬⑭)
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase A′)
 *
 * ⚠️ **⑫⑬⑭는 TypeScript가 잡지 못한다** — zod 가 모르는 키를 조용히 버리고(strip), body
 *    spread 에서 빠뜨려도 컴파일이 통과한다. 그래서 「값이 **세액까지** 도달했는가」를 단언한다
 *    (메모리 `feedback_api_zod_schema_sync` · `feedback_leaf_anchor_skips_zod_layer`).
 *
 * ⚠️ **Date 두 칸이 이 파일의 존재 이유 중 하나다** — `paymentDeadline`·`actualPaymentDate` 가
 *    `STOCK_DATE_FIELDS` 에 빠지면 string 이 그대로 엔진에 도달해 `Date` 연산이 조용히
 *    어긋난다(`lib/api/date-coerce.ts` 의 silent false 함정).
 */
import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";

/**
 * route handler 의 Date 강제 목록을 **그대로 import** 한다.
 *
 * 🔑 목록을 복사해 두면 route 에서 필드를 빼도 이 anchor 가 **자기 복사본으로 통과**해
 *    구별력이 0이 된다. 정본을 import 해야 ⑭ 누락이 여기서 잡힌다.
 */
const DATE_FIELDS = [...STOCK_DATE_FIELDS];

/** 코스피 대주주 · 1,000주 · 양도차익 100,000,000 → 산출세액 19,500,000 (기본공제 250만 후 20%) */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트종목",
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: "3",
    totalIssuedShares: "10000000",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "2022-01-01",
    transferDate: "2024-06-01",
    shareCount: "1000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "110000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "10000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    filingViolation: "under_report",
    isFraudulent: true,
    ...o,
  };
}

function runPipeline(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = stockTransferInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`zod 실패: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS);
  // 🔑 ⑭ 매핑을 **반드시 통과**시킨다 — coerced 를 엔진에 바로 넘기면 route 의 매핑 누락을
  //    감지하지 못한다(실측: `unpaidTax` 매핑 삭제에도 9건 전부 통과했다).
  return { body, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

describe("PW-1 「과소신고납부세액등」 차감 항목이 세액까지 도달한다", () => {
  it("PW-1-1: 입력이 없으면 base = 결정세액 19,500,000 × 40% = 7,800,000", () => {
    const { result } = runPipeline(form());
    expect(result.underReportPenalty).toBe(7_800_000);
    expect(result.penaltyBase).toBe(19_500_000);
  });

  it("PW-1-2: 당초 신고세액 10,000,000 — ⑬body·⑫zod·⑭engine 전부 통과", () => {
    const { body, result } = runPipeline(form({ originalFiledTax: "10000000" }));
    expect(body.originalFiledTax).toBe(10_000_000);
    expect(result.penaltyBase).toBe(9_500_000);
    expect(result.underReportPenalty).toBe(3_800_000);
  });

  it("PW-1-3: 기납부세액 5,000,000", () => {
    const { body, result } = runPipeline(form({ priorPaidTax: "5000000" }));
    expect(body.priorPaidTax).toBe(5_000_000);
    expect(result.underReportPenalty).toBe(5_800_000);
  });

  it("PW-1-4: 이자상당가산액 1,500,000", () => {
    const { body, result } = runPipeline(form({ interestSurcharge: "1500000" }));
    expect(body.interestSurcharge).toBe(1_500_000);
    expect(result.underReportPenalty).toBe(7_200_000);
  });
});

describe("PW-2 ④ 게이트 — 「당초 신고세액」은 과소신고 축에서만 payload 에 실린다", () => {
  it("PW-2-1: 무신고로 바꾸면 stale 값이 body 에 실리지 않는다", () => {
    const { body, result } = runPipeline(
      form({ filingViolation: "non_report", originalFiledTax: "10000000" }),
    );
    expect(body.originalFiledTax).toBeUndefined();
    // base 가 줄지 않았으므로 무신고 부정 40% 전액
    expect(result.underReportPenalty).toBe(7_800_000);
  });

  it("PW-2-2: 정상신고면 가산세 0", () => {
    const { result } = runPipeline(
      form({ filingViolation: "none", isFraudulent: false, originalFiledTax: "10000000" }),
    );
    expect(result.underReportPenalty).toBe(0);
  });
});

describe("PW-3 납부지연가산세 — Date 두 칸이 coerceDates 를 통과한다", () => {
  it("PW-3-1: 미납 10,000,000 · 기한 2024-08-31 · 납부 2024-10-01 → 68,200", () => {
    const { body, result } = runPipeline(
      form({
        unpaidTax: "10000000",
        paymentDeadline: "2024-08-31",
        actualPaymentDate: "2024-10-01",
      }),
    );
    expect(body.unpaidTax).toBe(10_000_000);
    expect(body.paymentDeadline).toBe("2024-08-31");
    expect(result.latePaymentPenalty).toBe(68_200);
  });

  it("PW-3-2: 기한 미입력이면 ⑧ validation 이 막는다 (조용히 0 이 되지 않는다)", () => {
    const errors = validateAllSteps(form({ unpaidTax: "10000000", paymentDeadline: "" }));
    expect(errors.some((e) => e.field === "paymentDeadline")).toBe(true);
  });

  it("PW-3-3: 미납세액이 0이면 기한만 있어도 오류가 아니다", () => {
    const errors = validateAllSteps(form({ unpaidTax: "0", paymentDeadline: "" }));
    expect(errors.some((e) => e.field === "paymentDeadline")).toBe(false);
  });
});

// ============================================================
// PW-4 §47조의3①1호 가목·나목 분해 — 폼 → ④ → ⑫ → ⑭ → 엔진
//
// 「부정행위로 인한 과소신고분」은 **빈 문자열이면 body 에 넣지 않는다**(미입력 = 전액 부정).
// 0 은 「부정행위분이 없다」는 유효한 선언이므로 **0도 보낸다** — 이 둘을 섞으면
// 「0을 입력했는데 전액 40%가 붙는」 침묵 오류가 된다.
// ============================================================

describe("PW-4 가목·나목 분해 배선", () => {
  it("PW-4-1: 미입력 → body 에 키 없음 · 전액 40% (종전 동작)", () => {
    const { body, result } = runPipeline(form({ fraudulentPortion: "" }));
    expect(body.fraudulentPortion).toBeUndefined();
    expect(result.underReportPenalty).toBe(7_800_000); // 19,500,000 × 40%
  });

  it("PW-4-2: 부정분 5,000,000 → 5,000,000×40% + 14,500,000×10% = 3,450,000", () => {
    const { body, result } = runPipeline(form({ fraudulentPortion: "5000000" }));
    expect(body.fraudulentPortion).toBe(5_000_000);
    expect(result.underReportPenalty).toBe(3_450_000);
  });

  it("PW-4-3: **0 도 전달된다** — 「부정행위분 없음」 선언이라 전액 10%", () => {
    const { body, result } = runPipeline(form({ fraudulentPortion: "0" }));
    expect(body.fraudulentPortion).toBe(0);
    expect(result.underReportPenalty).toBe(1_950_000); // 19,500,000 × 10%
  });

  it("PW-4-4: 무신고에는 분해가 없다 — 부정분을 넣어도 전액 40%", () => {
    const { result } = runPipeline(
      form({ filingViolation: "non_report", fraudulentPortion: "5000000" }),
    );
    expect(result.underReportPenalty).toBe(7_800_000);
  });
});
