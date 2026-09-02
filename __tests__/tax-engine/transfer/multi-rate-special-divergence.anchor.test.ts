/**
 * anchor: 미분양·신축주택 감면의 **세율 특칙**이 다건 합산에서 소실된다 — 차단 유지 근거
 *         (D11-07 잔여 재현, 2026-09-02)
 *
 * ── 무엇을 잠그나 ──────────────────────────────────────────────────
 * `multi-transfer-tax-validate.ts`가 이 조문들을 **다건에서 차단**한다. 그 차단의 사유는
 * 2026-09-02에 「차감·세액감면 미지원」에서 **「세율 특칙 소실」**로 정정됐는데,
 * 그때 §98① 20% 단일세율(§98)만 수치로 확인되고 **§98의3계(단기세율 배제)는 재현하지 못했다**
 * (감면 미적격으로 양쪽 다 단기 50%). 이 anchor가 그 잔여를 수치로 채운다.
 *
 * ⭐ **격자가 조문을 잘못 골랐던 것이지 결함이 없던 게 아니다.**
 *   §98의3 5년 내는 **100% 세액감면**(농특세도 비과세)이라 산출세액이 크게 갈려도
 *   결정세액에 도달하지 못하고 소멸한다. 감면율이 100% 미만인 **§98의5(60%)**에서는
 *   남은 40%를 타고 총부담까지 통과한다. [[feedback_numeric_impact_verify_before_bug_claim]]
 *
 * ── 메커니즘 ──────────────────────────────────────────────────────
 * `suppressShortTermRate`(§98의3④·§98의5③·§98의6③)는 단건 `transfer-tax.ts`가 **세율 입력에만**
 * 주입한다(`taxRateInput`). 집계는 `transfer-tax-aggregate-helpers.ts`의 `assetTaxOf`가 원본
 * `correctedSingleInput`을 세율 입력으로 쓰므로 플래그가 실리지 않는다.
 * ⇒ 단기세율이 되살아나 **다건이 과대**해진다.
 *
 * 🔑 **두 플래그는 처방이 다르다** (2026-09-02 실측). §104⑤ MAX는 값을 **올리기만** 한다:
 *   · §98 `forceFlatRate20` → 20%는 누진보다 **낮아** `calculatedTaxByGeneral`이 덮는다.
 *     플래그를 심어도 결과가 안 바뀐다(D11-07 실측: 20% 계산 83,500,000 ↔ 최종 141,060,000).
 *   · §98의3계 `suppressShortTermRate` → 배제 결과가 **곧 누진**이라 MAX가 바꿀 게 없다.
 *     `assetTaxOf`의 세율 입력에 심으면 다건 산출세액이 **단건과 원 단위까지 일치**했다
 *     (215,010,000 · 자산 1건 실측). 남는 잔차는 아래 R3의 **감면액 산정 축**이다.
 *
 * ❌ **재제안 금지 — 「그러니 §98의3계만 배선을 이어 차단을 부분 해제한다」.**
 *   차단은 조문 집합(`ALL_INCOME_DEDUCTION_IDS`) 단위이고, 부분 해제는 §98·§99의3 등
 *   같은 집합의 다른 축을 함께 검증해야 성립한다. 감면액 산정 축(R3)도 열려 있다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { ALL_INCOME_DEDUCTION_IDS } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** §98의5 — 자기확인 요건을 모두 채워야 `isEligible`이 열린다(픽스처 함정). */
const RED_985 = {
  type: "unsold_98_5" as const,
  contractDate985: D("2010-06-01"),
  priceReductionRatePct985: 10,
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
};

/** §98의3 — 자기건설 신축주택(5년 내 양도 = 100% 세액감면) */
const RED_983 = {
  type: "unsold_98_3" as const,
  residencyType983: "resident" as const,
  houseType983: "self_built" as const,
  constructionStartDate983: D("2009-03-01"),
  usageApprovalDate983: D("2009-12-01"),
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  isNotExcludedSelfBuilt983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
};

function singleInput(o: Record<string, unknown>) {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: false,
    householdHousingCount: 2,
    ...o,
  } as never);
}

/**
 * 같은 입력을 단건 엔진과 집계 엔진에 각각 태운다.
 * ⚠️ `annualBasicDeductionUsed: 0`이어야 기본공제가 양쪽 동일하다 — 2,500,000을 주면
 *    집계만 기본공제를 잃어 **측정이 오염된다**(첫 격자에서 실제로 겪었다).
 */
function bothWays(o: Record<string, unknown>) {
  const s = singleInput(o) as unknown as Record<string, unknown>;
  const single = calculateTransferTax(s as never, rates);
  const multi = calculateTransferTaxAggregate(
    {
      taxYear: (s.transferDate as Date).getFullYear(),
      annualBasicDeductionUsed: 0,
      properties: [{ ...s, propertyId: "A", propertyLabel: "A" } as unknown as TransferTaxItemInput],
    } as AggregateTransferInput,
    rates,
  );
  return { single, multi };
}

const BASE_985 = {
  transferPrice: 900_000_000,
  acquisitionPrice: 300_000_000,
  acquisitionDate: D("2010-07-01"),
  reductions: [RED_985],
};

describe("§98의5(60% 감면) — 단기 구간에서 총부담이 갈린다", () => {
  it("R1: 🔴 보유 7개월(단기 70%) — 다건이 36,020,600원 과대", () => {
    const { single, multi } = bothWays({ ...BASE_985, transferDate: D("2011-02-01") });
    expect(single.unsold985Detail?.isEligible).toBe(true);
    // 단건은 §98의5③으로 단기세율이 배제돼 §104①1호 누진을 탄다.
    expect(single.calculatedTax).toBe(215_010_000);
    expect(single.totalTax).toBe(94_604_400);
    // 집계는 플래그가 실리지 않아 단기 70%가 되살아난다.
    expect(multi.calculatedTax).toBe(298_750_000);
    expect(multi.totalTax).toBe(130_625_000);
    expect((multi.totalTax ?? 0) - (single.totalTax ?? 0)).toBe(36_020_600);
  });

  it("R2: 🔴 보유 18개월(단기 60%) — 다건이 9,895,600원 과대", () => {
    const { single, multi } = bothWays({ ...BASE_985, transferDate: D("2012-01-01") });
    expect(single.totalTax).toBe(94_604_400);
    expect(multi.totalTax).toBe(104_500_000);
    expect((multi.totalTax ?? 0) - (single.totalTax ?? 0)).toBe(9_895_600);
  });

  it("R3: 장기(보유 4년)는 **산출세액이 같다** — 세율 특칙 축이 아니다", () => {
    const { single, multi } = bothWays({ ...BASE_985, transferDate: D("2014-06-01") });
    expect(single.calculatedTax).toBe(199_890_000);
    expect(multi.calculatedTax).toBe(199_890_000);
    /**
     * 📌 그럼에도 총부담이 587,388원 갈린다 — **감면액 산정 축**의 별개 divergence다.
     * 다건은 `산출세액 × k`(`k = 감면대상소득 / 과세표준`)로 내는데 기본공제 때문에
     * 자산 1건에서도 `k > 1`이 된다(2,500,000 / 560,000,000 ≈ 0.446%).
     * 차단 덕에 도달 불가라 여기서는 **관측만 고정**한다 — 차단을 푸는 작업이 함께 풀 것.
     */
    expect(single.reductionAmount).toBe(119_934_000); // = 199,890,000 × 60%
    expect(multi.reductionAmount).toBe(120_467_989);
    expect((multi.totalTax ?? 0) - (single.totalTax ?? 0)).toBe(-587_388);
  });
});

describe("§98의3(5년 내 100% 감면) — 산출세액만 갈리고 총부담은 같다", () => {
  const BASE_983 = {
    transferPrice: 800_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: D("2009-12-01"),
    reductions: [RED_983],
  };

  it("R4: 🔑 보유 7개월 — 산출세액은 크게 갈리는데(93,110,000 ↔ 148,750,000) 총부담은 둘 다 0", () => {
    const { single, multi } = bothWays({ ...BASE_983, transferDate: D("2010-06-01") });
    expect(single.unsold983Detail?.isEligible).toBe(true);
    expect(single.calculatedTax).toBe(93_110_000);
    expect(multi.calculatedTax).toBe(148_750_000);
    // 100% 세액감면 + 농특세 비과세 ⇒ 차이가 소멸한다. 종전 격자가 재현에 실패한 이유다.
    expect(single.totalTax).toBe(0);
    expect(multi.totalTax).toBe(0);
  });

  it("R5: 5년 후 하이브리드(보유 6년)는 장기라 세율 특칙 자체가 무관 — 완전 일치", () => {
    const { single, multi } = bothWays({ ...BASE_983, transferDate: D("2015-12-01") });
    expect(single.totalTax).toBe(34_028_500);
    expect(multi.totalTax).toBe(34_028_500);
  });
});

describe("차단이 유일한 방어선이다", () => {
  it("R6: 세율 특칙 조문 4종이 모두 다건 차단 집합에 있다", () => {
    // `MULTI_UNSUPPORTED_REDUCTION_TYPES`는 `ALL_INCOME_DEDUCTION_IDS`로 만들어진다.
    for (const id of ["unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_2"]) {
      expect(ALL_INCOME_DEDUCTION_IDS, `${id}가 빠지면 다건이 조용히 과대과세한다`).toContain(id);
    }
  });
});
