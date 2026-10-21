/**
 * anchor BD-10 ~ BD-16 — 주식 부담부증여 개산공제 base 안분을 «분수 그대로»(S-2).
 *
 * 계획: docs/00-pm/stock-burdened-debt-fraction-wire.plan.md §5·§9.1
 *
 * 소령 §159①은 `A × B/C`(B 채무액, C 증여가액)를 정한다. 종전 와이어는 소수 비율 `burdenedGiftDebtRatio` 하나뿐이라
 * 엔진이 C를 모르고 `applyRatio(base, B/C)`로 곱했다 — 순환 소수 비율에서 참값이 정수인 곱이 1원 과소였다.
 * S-2: 와이어에 C(`burdenedGiftValuationAmount`)를 싣고, 엔진이 `safeMultiplyThenDivide(base, transferPrice(=B), C)`로 곱한다.
 *
 * 하네스: ④ → ⑫(addStockRefines) → ⑭(buildEngineInput) → 엔진 전 계층. 라우트(단건·합산)는 실제 `POST`.
 * 참값은 BigInt `floor(base × B / C)`로 독립 계산한다.
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import { POST } from "@/app/api/calc/stock-transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

const DATE_FIELDS = ["transferDate", "acquisitionDate", "filingDate", "priorYearEndDate", "listingDate"] as const;
const GIFT_DATE = "2025-06-02";

const truth = (x: number, b: number, c: number): number => Number((BigInt(x) * BigInt(b)) / BigInt(c));
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** 상장(KOSPI) 환산 — 증여 평가액 C = marketValue, 채무 B = debt */
function listedEstimated(C: number, B: number, shares: number, acqAvg: number, trAvg: number): EstateItem {
  return {
    id: "s1",
    name: "T",
    category: "listed_stock",
    marketValue: C,
    listedStockShares: shares,
    assumedDebtForGift: B,
    burdenedGiftStockTransferTax: {
      marketType: "kospi",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      transferDatePriceAvg1Month: trAvg,
      acquisitionDatePriceAvg1Month: acqAvg,
    },
  } as unknown as EstateItem;
}

const bodyOf = (it: EstateItem) => buildGiftStockBurdenedTransferBody(it, { giftDate: GIFT_DATE } as unknown as FormState);

function runBody(body: Record<string, unknown>) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS as unknown as string[]);
  return { ok: true as const, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

function runFullStack(it: EstateItem) {
  const body = bodyOf(it);
  const out = runBody(body);
  if (!out.ok) throw new Error(out.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  return { body, result: out.result };
}

interface RouteJson {
  error?: string;
  result: {
    estimatedBase: number;
    estimatedDeduction: number;
    taxBase: number;
    items: Array<{ estimatedBase: number; estimatedDeduction: number; taxBase: number }>;
  };
}

async function postRoute(payload: unknown) {
  const req = new Request("http://localhost/api/calc/stock-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify(payload),
  });
  const res = await POST(req as never);
  return { status: res.status, json: (await res.json()) as RouteJson };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-10 · 격자 — 참값이 정수로 떨어지는 B (순환 소수 비율 포함)", () => {
  it("🔴 estimatedBase·개산공제가 BigInt 참값과 전건 일치", () => {
    const bad: string[] = [];
    let n = 0;
    let nonterminating = 0;
    for (const trAvg of [10_000, 25_000, 42_400, 100_000]) {
      for (const shares of [100, 300, 700, 1_100, 3_300]) {
        for (const acqAvg of [1_000, 3_000, 5_500, 7_000]) {
          const C = trAvg * shares;
          const base = acqAvg * shares;
          const g = gcd(C, base);
          const unit = C / g; // B가 unit의 배수여야 base × B / C 가 정수
          for (let m = 1; m <= 12; m++) {
            const B = m * unit;
            if (!(B < C)) break;
            // 비율 B/C 가 십진 유한 소수가 아닌(순환) 경우를 세어 격자가 그 부류를 실제로 포함함을 보인다
            let d = C / gcd(C, B);
            while (d % 2 === 0) d /= 2;
            while (d % 5 === 0) d /= 5;
            if (d !== 1) nonterminating++;
            const { result } = runFullStack(listedEstimated(C, B, shares, acqAvg, trAvg));
            const expectedBase = truth(base, B, C);
            n++;
            if (result.estimatedBase !== expectedBase || result.estimatedDeduction !== Math.floor(expectedBase / 100)) {
              bad.push(`C=${C} B=${B} base=${base} got=${result.estimatedBase}/${result.estimatedDeduction} truth=${expectedBase}`);
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(nonterminating).toBeGreaterThan(100); // 순환 소수 부류를 충분히 포함
    expect(bad.slice(0, 5), `${bad.length}/${n}건 불일치`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-11 · 결정세액 사례 — 순환 소수 비율 1원 차이가 산출세액 10원으로 번지는 구성", () => {
  it("🔴 C 1,373,760,000 · B 717,925,280 · 32,400주 · 10,500 · 42,400 → 개산공제 base 177,788,100 · 산출세액 107,171,850 (옛 107,171,860)", () => {
    const { body, result } = runFullStack(listedEstimated(1_373_760_000, 717_925_280, 32_400, 10_500, 42_400));
    expect(body.burdenedGiftValuationAmount).toBe(1_373_760_000);
    expect(body.transferTotalPrice).toBe(717_925_280);
    expect(truth(10_500 * 32_400, 717_925_280, 1_373_760_000)).toBe(177_788_100);
    expect(result.estimatedBase).toBe(177_788_100);
    expect(result.estimatedDeduction).toBe(1_777_881);
    expect(result.taxBase).toBe(535_859_299);
    expect(result.calculatedTax).toBe(107_171_850);
    expect(result.finalTax).toBe(107_171_850);
    expect(result.localIncomeTax).toBe(10_717_180);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-12 · 짧은 소수(정수 %)·B=C 회귀 — 불변", () => {
  it("57% : 취득기준시가 총액 50,000,000 → 28,500,000 / 285,000", () => {
    const { result } = runFullStack(listedEstimated(100_000_000, 57_000_000, 1000, 50_000, 100_000));
    expect(result.estimatedBase).toBe(28_500_000);
    expect(result.estimatedDeduction).toBe(285_000);
  });
  it("10% : 5,000,000 / 50,000", () => {
    const { result } = runFullStack(listedEstimated(100_000_000, 10_000_000, 1000, 50_000, 100_000));
    expect(result.estimatedBase).toBe(5_000_000);
    expect(result.estimatedDeduction).toBe(50_000);
  });
  it("B = C : 안분 없음 (50,000,000)", () => {
    const { result } = runFullStack(listedEstimated(100_000_000, 100_000_000, 1000, 50_000, 100_000));
    expect(result.estimatedBase).toBe(50_000_000);
  });
  it("actual 모드 : C를 싣지 않는다 (④가 취득가를 이미 안분)", () => {
    const it = {
      ...listedEstimated(100_000_000, 57_000_000, 1000, 50_000, 100_000),
      burdenedGiftStockTransferTax: {
        marketType: "kospi",
        acquisitionDate: "2015-03-02",
        acquisitionMode: "actual",
        actualAcquisitionPrice: 40_000_000,
      },
    } as unknown as EstateItem;
    const body = bodyOf(it);
    expect(body.burdenedGiftValuationAmount).toBeUndefined();
    expect(body.burdenedGiftDebtRatio).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-13 · B>C — ⑫ refine 400 유지 (종전 max(1) 위반과 같은 상태)", () => {
  const over = () => bodyOf(listedEstimated(100_000_000, 120_000_000, 1000, 50_000, 100_000));

  it("🔴 estimated · B 1.2억 > C 1억 → Zod 실패, 사유는 증여가액 필드에 달린다", () => {
    const out = runBody(over());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.path.join(".") === "burdenedGiftValuationAmount")).toBe(true);
  });
  it("🔴 라우트 POST 400 (단건)", async () => {
    const { status, json } = await postRoute(over());
    expect(status).toBe(400);
    expect(json.error).toBe("Validation failed");
  });
  it("actual 모드 B>C 는 영향 없음 — C를 싣지 않으므로 통과 (이번 PR 범위 밖 관찰)", () => {
    const it = {
      ...listedEstimated(100_000_000, 120_000_000, 1000, 50_000, 100_000),
      burdenedGiftStockTransferTax: {
        marketType: "kospi",
        acquisitionDate: "2015-03-02",
        acquisitionMode: "actual",
        actualAcquisitionPrice: 40_000_000,
      },
    } as unknown as EstateItem;
    expect(runBody(bodyOf(it)).ok).toBe(true);
  });
  it("B = C 는 통과", () => {
    expect(runBody(bodyOf(listedEstimated(100_000_000, 100_000_000, 1000, 50_000, 100_000))).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-14 · 구필드 burdenedGiftDebtRatio — 폐지, 수신 시 400 명시 거절 (침묵 strip 금지)", () => {
  const legacy = () => {
    const body = { ...bodyOf(listedEstimated(110_000_000, 14_000_000, 1000, 55_000, 100_000)) };
    delete body.burdenedGiftValuationAmount;
    body.burdenedGiftDebtRatio = 14_000_000 / 110_000_000;
    return body;
  };

  it("🔴 Zod 실패 + 사유가 구필드 키에 달린다", () => {
    const out = runBody(legacy());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const issue = out.issues.find((i) => i.path.join(".") === "burdenedGiftDebtRatio");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("burdenedGiftValuationAmount");
  });
  it("🔴 라우트 단건 POST 400", async () => {
    const { status, json } = await postRoute(legacy());
    expect(status).toBe(400);
    expect(json.error).toBe("Validation failed");
  });
  it("🔴 라우트 합산 POST 400 (items 안의 구필드도 거절)", async () => {
    const { status } = await postRoute({ items: [legacy()], deductionMode: "aggregate" });
    expect(status).toBe(400);
  });
  it("대조: C·비율 모두 없는 estimated payload(일반 양도)는 안분 없이 통과한다 (자동 채움 없음)", () => {
    const body = { ...bodyOf(listedEstimated(110_000_000, 14_000_000, 1000, 55_000, 100_000)) };
    delete body.burdenedGiftValuationAmount;
    const out = runBody(body);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.estimatedBase).toBe(55_000_000); // 안분 없음
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-15 · 형태 제약 — C는 «실가·총액 양도(단건)»에서만 B=transferPrice 가 성립한다", () => {
  const base = () => bodyOf(listedEstimated(110_000_000, 14_000_000, 1000, 55_000, 100_000));
  const failsOnC = (body: Record<string, unknown>) => {
    const out = runBody(body);
    return !out.ok && out.issues.some((i) => i.path.join(".") === "burdenedGiftValuationAmount");
  };

  it("기준: ④ 정상 body 는 통과", () => {
    expect(runBody(base()).ok).toBe(true);
  });
  it("🔴 transferActualInputMode = per_share → 400", () => {
    expect(failsOnC({ ...base(), transferActualInputMode: "per_share", perShareTransferPrice: 14_000 })).toBe(true);
  });
  it("transferActualInputMode 미지정 → Zod 기본값 total 이 채워져 통과 (스키마 default 와 엔진 읽기가 같은 값)", () => {
    const body = base();
    delete body.transferActualInputMode;
    expect(runBody(body).ok).toBe(true);
  });
  it("🔴 교환 양도(transferPriceMode = exchange) → 400", () => {
    expect(
      failsOnC({ ...base(), transferPriceMode: "exchange", exchangePropertyValue: 14_000_000, exchangeDebtRelief: 0, exchangeCash: 0 }),
    ).toBe(true);
  });
  it("🔴 lots 동시 지정(split 모드 후보) → 400", () => {
    const lot = { acquisitionDate: "2015-03-02", shareCount: 1000, perShareAcquisitionPrice: 1, acquisitionCause: "purchase" };
    expect(failsOnC({ ...base(), acquisitionLots: [lot] })).toBe(true);
    expect(
      failsOnC({
        ...base(),
        transferLots: [{ transferDate: GIFT_DATE, shareCount: 1000, perShareTransferPrice: 1 }],
      }),
    ).toBe(true);
  });
  it("🔴 C ≤ 0 → 400 (positive)", () => {
    expect(failsOnC({ ...base(), burdenedGiftValuationAmount: 0 })).toBe(true);
    expect(failsOnC({ ...base(), burdenedGiftValuationAmount: -1 })).toBe(true);
  });
  it("🔴 transferTotalPrice = 0 (B 없음) 인데 C → 400", () => {
    expect(failsOnC({ ...base(), transferTotalPrice: 0 })).toBe(true);
  });
  it("비정수 C 는 허용 (Q4 — .int() 없음)", () => {
    expect(runBody({ ...base(), burdenedGiftValuationAmount: 110_000_000.5 }).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BD-16 · 합산 라우트 — C 가 strip 되지 않고 항목별로 보존된다 (⑬·합산 스키마·합산 재실행)", () => {
  const burdened = () => bodyOf(listedEstimated(110_000_000, 14_000_000, 1000, 55_000, 100_000));
  // 일반 항목 = C 없는 일반 양도 (부담부 아님)
  const ordinary = () => {
    const b = { ...bodyOf(listedEstimated(110_000_000, 14_000_000, 1000, 55_000, 100_000)) };
    delete b.burdenedGiftValuationAmount;
    return b;
  };

  it("🔴 단건 POST — estimatedBase 7,000,000 (C 가 도달하지 못하면 55,000,000)", async () => {
    const { status, json } = await postRoute(burdened());
    expect(status).toBe(200);
    expect(json.result.estimatedBase).toBe(7_000_000);
    expect(json.result.estimatedDeduction).toBe(70_000);
  });

  it("🔴 합산 POST items[부담부, 일반] — 부담부는 안분(7,000,000), 일반은 불변(55,000,000)", async () => {
    const { status, json } = await postRoute({ items: [burdened(), ordinary()], deductionMode: "aggregate" });
    expect(status).toBe(200);
    const items = json.result.items;
    expect(items).toHaveLength(2);
    expect(items[0].estimatedBase).toBe(7_000_000);
    expect(items[0].estimatedDeduction).toBe(70_000);
    expect(items[1].estimatedBase).toBe(55_000_000);
    expect(items[1].estimatedDeduction).toBe(550_000);
  });

  it("합산 POST 의 부담부 항목 == 단건 POST 결과 (경로 통합 정당화)", async () => {
    const single = (await postRoute(burdened())).json.result;
    const agg = (await postRoute({ items: [burdened()], deductionMode: "aggregate" })).json.result.items[0];
    expect({ b: agg.estimatedBase, d: agg.estimatedDeduction, t: agg.taxBase }).toEqual({
      b: single.estimatedBase,
      d: single.estimatedDeduction,
      t: single.taxBase,
    });
  });
});
