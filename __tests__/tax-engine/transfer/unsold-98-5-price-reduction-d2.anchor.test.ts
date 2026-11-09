/**
 * anchor — §98의5 분양가격 인하율을 공시 분양가·매매가 두 금액으로 계산 (D2: US-58·US-59, Q-18 (a)·Q-5)
 *
 * 조특령 §98의4④(MST 288915 실독 2026-11-09): 분양가격 인하율 =
 *   (입주자 모집공고안에 공시된 분양가격 − 매매계약서상의 매매가격) ÷ 입주자 모집공고안에 공시된 분양가격 × 100.
 * 법 §98의5①: 1호 10% 이하 60% / 2호 10% 초과 20% 이하 80% / 3호 20% 초과 100%.
 * 구간은 정수 교차곱으로 판정한다 — 사용자 반올림·부동소수로 구간이 바뀌지 않는다.
 * 음수(매매가 > 공시 분양가)는 정책 결정(Q-5, 2026-11-06)으로 감면율 0%(감면 없음). 법 §98의5①1호에 하한 문언이 없고
 * 부동산거래관리과-1295가 인하율 0에 60%를 준 점은 반대 근거(확인 필요).
 */
import { describe, it, expect } from "vitest";
import { resolve985Reduction, evaluateUnsold985 } from "@/lib/tax-engine/transfer-reductions/unsold-98-5";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const rate = (announced: number, contract: number) => {
  const r = resolve985Reduction({ announcedPrice: announced, contractPrice: contract });
  return r.kind === "ok" ? r.rate : r.kind;
};

describe("구간 경계 — 정수 교차곱", () => {
  it("정확히 10% → 60%, 1원 더 적게 받으면 10% 초과 → 80%", () => {
    expect(rate(100_000_000, 90_000_000)).toBe(0.6);
    expect(rate(100_000_000, 89_999_999)).toBe(0.8);
  });
  it("정확히 20% → 80%, 20% 초과 → 100%", () => {
    expect(rate(100_000_000, 80_000_000)).toBe(0.8);
    expect(rate(100_000_000, 79_999_999)).toBe(1.0);
  });
  it("0%(인하 없음) → 60% (부동산거래관리과-1295)", () => {
    expect(rate(100_000_000, 100_000_000)).toBe(0.6);
  });
  it("리뷰 US-58 사안: 공시 300,010,000 · 매매 270,000,000 = 10.002999…% → 80% (10.0으로 반올림하면 60%였던 사안)", () => {
    expect(rate(300_010_000, 270_000_000)).toBe(0.8);
  });
  it("상한: 매매가 0원 = 인하율 100% → 100%", () => {
    expect(rate(100_000_000, 0)).toBe(1.0);
  });
  it("음수(매매가 > 공시) → 감면율 0%(Q-5 정책): negative", () => {
    expect(rate(100_000_000, 100_000_001)).toBe("negative");
  });
  it("누락·0 → missing, 직접 % 100 초과 → over_100, 100은 통과", () => {
    expect(rate(0, 10)).toBe("missing");
    expect(resolve985Reduction({ announcedPrice: 100 }).kind).toBe("missing");
    expect(resolve985Reduction({}).kind).toBe("missing");
    expect(resolve985Reduction({ priceReductionRatePct: 150 }).kind).toBe("over_100");
    expect(resolve985Reduction({ priceReductionRatePct: 100 }).kind).toBe("ok");
  });
  it("두 금액이 있으면 직접 % 입력은 무시한다", () => {
    const r = resolve985Reduction({ announcedPrice: 100, contractPrice: 100, priceReductionRatePct: 50 });
    expect(r.kind === "ok" && r.rate).toBe(0.6);
  });
});

describe("결과 라벨 — 한국어 풀어쓰기, 절사 표시", () => {
  it("산식·구간·감면율이 문장에 있다", () => {
    const r = resolve985Reduction({ announcedPrice: 300_010_000, contractPrice: 270_000_000 });
    expect(r.kind === "ok" && r.label).toBe(
      "분양가격 인하율 = (입주자 모집공고안에 공시된 분양가격 300,010,000원 − 매매계약서상의 매매가격 270,000,000원) ÷ (공시된 분양가격) × 100 = 10.002999% (10% 초과 20% 이하) → 감면율 80%",
    );
  });
});

describe("엔진 — 두 금액으로 감면 적용/배제", () => {
  const BASE = {
    contractDate: new Date("2010-06-15"), acquisitionDate: new Date("2011-06-15"), transferDate: new Date("2016-01-01"),
    transferIncome: 200_000_000, isNonCapitalUnsoldAtCutoff: true, isFirstContract: true, isNotOccupiedAtContract: true, isNotRecontract: true,
  };
  it("음수는 NEGATIVE_PRICE_REDUCTION_RATE로 적용 불가", () => {
    const r = evaluateUnsold985({ ...BASE, announcedPrice: 100, contractPrice: 101 } as Any);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("NEGATIVE_PRICE_REDUCTION_RATE");
  });
  it("15% 인하 → 감면율 0.8, 산식 문장에 두 금액이 들어간다", () => {
    const r = evaluateUnsold985({ ...BASE, announcedPrice: 100_000_000, contractPrice: 85_000_000 } as Any);
    expect(r.taxReductionRate).toBe(0.8);
    expect(r.formulaSteps.some((s) => (s.formula ?? "").includes("매매계약서상의 매매가격 85,000,000원"))).toBe(true);
  });
});

describe("⑫ Zod", () => {
  const parse = (o: object) => reductionSchema.safeParse({ type: "unsold_98_5", ...o });
  it("두 금액이 strip되지 않고 통과한다", () => {
    const r = parse({ announcedPrice985: 100, contractPrice985: 0 });
    expect(r.success && (r.data as Any).announcedPrice985).toBe(100);
    expect(r.success && (r.data as Any).contractPrice985).toBe(0);
  });
  it("직접 %는 100까지만, 음수 거부", () => {
    expect(parse({ priceReductionRatePct985: 100 }).success).toBe(true);
    expect(parse({ priceReductionRatePct985: 100.01 }).success).toBe(false);
    expect(parse({ priceReductionRatePct985: 150 }).success).toBe(false);
    expect(parse({ priceReductionRatePct985: -1 }).success).toBe(false);
  });
  it("공시 분양가 0·소수는 거부", () => {
    expect(parse({ announcedPrice985: 0 }).success).toBe(false);
    expect(parse({ announcedPrice985: 1.5 }).success).toBe(false);
  });
});

describe("⑧ validate — 엔진과 같은 판정", () => {
  function msgFor(announced: string, contract: string) {
    const form = createDefaultTransferFormData();
    form.transferDate = "2016-01-01";
    const r = {
      type: "unsold_98_5", contractDate985: "2010-06-15", announcedPrice985: announced, contractPrice985: contract,
    } as AssetReductionForm;
    form.assets[0] = { ...form.assets[0], acquisitionDate: "2011-06-15", reductions: [r] };
    return validateStep(2, form);
  }
  it("공시 분양가 미입력 → 차단", () => {
    expect(msgFor("", "")).toContain("공시된 분양가격(원)을 입력");
  });
  it("매매가 미입력 → 차단", () => {
    expect(msgFor("100000000", "")).toContain("매매가격(원)을 입력");
  });
  it("매매가 > 공시 → 차단(인하율 음수, 감면율 0%)", () => {
    expect(msgFor("100000000", "100000001")).toContain("인하율이 음수");
  });
  it("인하 없음(같은 금액)은 인하율 검증을 통과한다", () => {
    const m = msgFor("100000000", "100000000");
    expect(m ?? "").not.toMatch(/분양가격|매매가격/);
  });
});

describe("풀 파이프라인 총부담(원 단위) — 리뷰 US-58·US-59 mock 사안 (양도 8억·취득 5억·2주택, 취득 2011-06-15, 양도 2016-01-01)", () => {
  const total = (extra: Record<string, unknown>) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000, acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-06-15"), transferDate: new Date("2016-01-01"), householdHousingCount: 2,
        reductions: [{
          type: "unsold_98_5" as const, contractDate985: new Date("2010-06-15"),
          isNonCapitalUnsoldAtCutoff985: true, isFirstContract985: true, isNotOccupiedAtContract985: true, isNotRecontract985: true,
          standardPriceAtAcquisition985: 200_000_000, standardPriceAt5Years985: 300_000_000, standardPriceAtTransfer985: 400_000_000,
          ...extra,
        }],
      }),
      makeMockRates(),
    ).totalTax;
  it("US-58: 공시 300,010,000 · 매매 270,000,000(10.002999…%) → 80% 총부담 18,477,800 (종전 「10.0」 입력은 60% 36,955,600)", () => {
    expect(total({ announcedPrice985: 300_010_000, contractPrice985: 270_000_000 })).toBe(18_477_800);
    expect(total({ priceReductionRatePct985: 10 })).toBe(36_955_600);
  });
  it("정확히 10% → 60% 36,955,600", () => {
    expect(total({ announcedPrice985: 300_000_000, contractPrice985: 270_000_000 })).toBe(36_955_600);
  });
  it("US-59: 매매가 > 공시(음수) → 감면 없음 92,389,000 (Q-5 정책 — 엔진 동작 유지)", () => {
    expect(total({ announcedPrice985: 100_000_000, contractPrice985: 102_000_000 })).toBe(92_389_000);
  });
});
