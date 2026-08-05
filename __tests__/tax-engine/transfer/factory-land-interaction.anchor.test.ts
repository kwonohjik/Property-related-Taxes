/**
 * anchor — 공장용지 초과분 판정 × 기존 분기 상호작용 (Phase E)
 *
 * 계획서: `docs/02-design/features/factory-site-standard-area-nbl.plan.md`
 *
 * ## 주입 경로
 *
 * 공장 판정은 CB(STEP 0.62 직접 주입)와 달리 **NBL 엔진을 거친다**:
 *
 * ```
 * nonBusinessLandDetails.otherLand.factory
 *   → judgeNonBusinessLand (Step 0.5)                     ← 한도·초과비율 산출
 *   → transfer-tax-judgment-steps.ts:99 (STEP 0.6)
 *       isNonBusinessLand / nonBusinessLandAreaRatio 주입
 *   → 세율 계산 (+10%p × 초과비율)
 * ```
 *
 * ⇒ swap·수용은 **양도차익**에, 공장 초과분은 **세율**에 작용하므로 서로 독립이어야 한다.
 *
 * ## 🔴 여기 적힌 세액은 전부 실측값이다 (추정 아님)
 *
 * 아래 수치는 이 파일의 픽스처를 실제로 돌려 얻은 값이다. 특히 **낮은 초과비율에서는
 * 세액이 전혀 변하지 않는다** — 아래 §104⑤ 설명 참조.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const TRANSFER_DATE = new Date("2020-06-01");
/**
 * ⚠️ 취득일이 **2009.3.16~2012.12.31**이면 부칙 §9270호 §14①로 비사업용 +10%p가 배제된다
 * (`transfer-tax-rate-calc.ts` `isCrisisAcqExempt`). 기본 픽스처는 그 구간 **밖**을 쓴다.
 */
const ACQ_DATE = new Date("2013-06-01");
/** 부칙 §9270호 §14① 배제 구간 안 */
const CRISIS_ACQ_DATE = new Date("2010-06-01");

/**
 * 공장 입력 — 연면적 1,200㎡ ÷ 12% = 10,000㎡(별표6 1호).
 * 3호가2)로 산출면적의 20%까지 추가 인정되므로 기준면적 상한은 12,000㎡다.
 * `total`(공장 전체 부속토지)을 키우면 초과비율이 올라간다.
 */
function factory(total: number) {
  return {
    locationCategory: "eup_myeon_or_complex" as const,
    totalAppurtenantLandArea: total,
    segments: [{ floorArea: 1200, ratePercent: 12 }],
  };
}

function nblDetails(total: number, acq: Date) {
  return {
    landType: "other_land" as const,
    landArea: 5000, // 양도 대상 토지 (공장 일부)
    zoneType: "general_residential" as const,
    acquisitionDate: acq,
    transferDate: TRANSFER_DATE,
    otherLand: {
      propertyTaxType: "comprehensive" as const,
      hasBuilding: true,
      isRelatedToResidenceOrBusiness: false,
      factory: factory(total),
    },
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

/** `total=0`이면 공장 입력 없음(대조군). */
function land(over: Partial<TransferTaxInput> = {}, total = 0, acq: Date = ACQ_DATE): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 300_000_000,
    transferDate: TRANSFER_DATE,
    acquisitionDate: acq,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    transferCause: "general",
    ...(total > 0 ? { nonBusinessLandDetails: nblDetails(total, acq) } : {}),
    ...over,
  } as Partial<TransferTaxInput>);
}

const ratioOf = (r: ReturnType<typeof calculateTransferTax>) =>
  r.nonBusinessLandJudgmentDetail?.areaProportioning?.nonBusinessRatio;

// ────────────────────────────────────────────────────────────
describe("§104⑤ 비교과세 — 낮은 초과비율에서는 세액이 변하지 않는다", () => {
  /**
   * 「소득세법」 §104⑤는 **그룹별 합산세액과 전체 일반 누진세액 중 큰 것**을 택한다.
   * 초과비율이 낮으면 +10%p를 그 비율만큼만 얹은 세액이 일반 누진세액을 넘지 못해
   * **일반세액이 채택**된다 — 중과 효과가 법령상 소멸하는 구간이다.
   *
   * ⇒ "초과분이 잡혔는데 세액이 그대로"는 결함이 아니다. 판정(`ratio`)과 세액을 **따로** 단언한다.
   */
  const BASELINE = 221_730_000;

  it("E104-0: 공장 입력이 없으면 판정 자체가 없다 (대조군)", () => {
    const r = calculateTransferTax(land(), rates);
    expect(r.calculatedTax).toBe(BASELINE);
    expect(r.nonBusinessLandJudgmentDetail).toBeUndefined();
  });

  it("E104-1a: 기준면적 이내면 사업용 — 안분 자체가 없다", () => {
    const r = calculateTransferTax(land({}, 12_000), rates);
    expect(r.nonBusinessLandJudgmentDetail?.isNonBusinessLand).toBe(false);
    expect(ratioOf(r)).toBeUndefined(); // 전량 사업용이라 areaProportioning 미생성
    expect(r.calculatedTax).toBe(BASELINE);
  });

  it.each([
    ["초과 7.69%", 13_000, 0.0769],
    ["초과 20%", 15_000, 0.2],
    ["초과 40%", 20_000, 0.4],
  ])("E104-1b %s — 초과비율은 잡히되 세액은 불변", (_label, total, expectedRatio) => {
    const r = calculateTransferTax(land({}, total), rates);
    expect(ratioOf(r)).toBe(expectedRatio);
    expect(r.calculatedTax).toBe(BASELINE); // §104⑤로 일반세액 채택
  });

  it("E104-2: 경계 — 40%는 불변이나 45.45%부터 상승한다", () => {
    const at40 = calculateTransferTax(land({}, 20_000), rates);
    const at4545 = calculateTransferTax(land({}, 22_000), rates);
    expect(ratioOf(at40)).toBe(0.4);
    expect(ratioOf(at4545)).toBe(0.4545);
    expect(at40.calculatedTax).toBe(BASELINE);
    expect(at4545.calculatedTax).toBe(221_826_860);
    expect(at4545.calculatedTax).toBeGreaterThan(at40.calculatedTax);
  });

  it.each([
    ["초과 50%", 24_000, 0.5, 224_195_000],
    ["초과 60%", 30_000, 0.6, 231_422_000],
    ["초과 70%", 40_000, 0.7, 238_784_000],
    ["초과 90%", 120_000, 0.9, 260_142_000],
  ])("E104-3 %s — 세액이 실제로 오른다", (_label, total, expectedRatio, expectedTax) => {
    const r = calculateTransferTax(land({}, total), rates);
    expect(ratioOf(r)).toBe(expectedRatio);
    expect(r.calculatedTax).toBe(expectedTax);
  });
});

describe("부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득은 +10%p 배제", () => {
  /**
   * ⚠️ **검증에는 세액이 실제로 오르는 비율을 써야 한다.** 초과 40% 이하는 §104⑤ 때문에
   * 원래 세액이 안 오르므로, 그 구간으로 테스트하면 "배제됐다"와 "원래 안 오른다"를
   * 구분하지 못해 공허하게 통과한다. ⇒ 초과 70%(세액 +17,054,000 확인된 구간)를 쓴다.
   */
  it("E-CRISIS-1: 초과 70%인데도 배제 구간 취득이면 세액이 오르지 않는다", () => {
    const base = calculateTransferTax(land({}, 0, CRISIS_ACQ_DATE), rates);
    const withFactory = calculateTransferTax(land({}, 40_000, CRISIS_ACQ_DATE), rates);

    expect(ratioOf(withFactory)).toBe(0.7); // 판정은 정상 작동
    expect(withFactory.calculatedTax).toBe(base.calculatedTax); // 세율만 배제
    expect(withFactory.calculatedTax).toBe(204_090_000);
  });

  it("E-CRISIS-2: 같은 초과비율이라도 배제 구간 밖 취득이면 오른다 (대조)", () => {
    const outside = calculateTransferTax(land({}, 40_000, ACQ_DATE), rates);
    expect(outside.calculatedTax).toBe(238_784_000);
    expect(outside.calculatedTax).toBeGreaterThan(221_730_000);
  });
});

describe("§97②2호 swap × 공장 초과분 — 두 축은 독립이다", () => {
  /** 환산취득가 모드에서 나목(자본적지출+양도비)이 가목보다 커 swap이 발동하는 입력. */
  const SWAP: Partial<TransferTaxInput> = {
    useEstimatedAcquisition: true,
    acquisitionPrice: 0,
    standardPricePerSqmAtTransfer: 2_000_000,
    standardPricePerSqmAtAcquisition: 800_000,
    transferArea: 500,
    capitalExpenditure: 450_000_000,
    transferExpense: 10_000_000,
  };

  it("E-SWAP-1: swap이 발동해도 공장 초과분 중과가 사라지지 않는다", () => {
    const base = calculateTransferTax(land(SWAP, 0), rates);
    const withFactory = calculateTransferTax(land(SWAP, 40_000), rates);

    expect(withFactory.swapApplied).toBe(true); // swap은 그대로 작동
    expect(ratioOf(withFactory)).toBe(0.7); // 판정도 그대로

    expect(base.calculatedTax).toBe(163_140_000);
    expect(withFactory.calculatedTax).toBe(173_698_500);
    expect(withFactory.calculatedTax - base.calculatedTax).toBe(10_558_500);
  });

  it("E-SWAP-2: swap은 양도차익을, 공장은 세율을 건드린다 — 중과폭이 서로 다르다", () => {
    // 같은 초과비율(0.7)이라도 swap으로 과세표준이 줄면 중과 증분도 줄어든다.
    const plainDiff =
      calculateTransferTax(land({}, 40_000), rates).calculatedTax -
      calculateTransferTax(land(), rates).calculatedTax;
    const swapDiff =
      calculateTransferTax(land(SWAP, 40_000), rates).calculatedTax -
      calculateTransferTax(land(SWAP, 0), rates).calculatedTax;

    expect(plainDiff).toBe(17_054_000);
    expect(swapDiff).toBe(10_558_500);
    expect(swapDiff).toBeLessThan(plainDiff); // 과세표준이 작으므로
  });
});

describe("공익수용 × 공장 초과분", () => {
  const EXPR: Partial<TransferTaxInput> = { transferCause: "public_expropriation" };

  it("E-EXPR-1: 수용이어도 공장 초과분 중과는 그대로 적용된다", () => {
    const base = calculateTransferTax(land(EXPR, 0), rates);
    const withFactory = calculateTransferTax(land(EXPR, 40_000), rates);

    expect(ratioOf(withFactory)).toBe(0.7);
    expect(base.calculatedTax).toBe(221_730_000);
    expect(withFactory.calculatedTax).toBe(238_784_000);
    expect(withFactory.calculatedTax - base.calculatedTax).toBe(17_054_000);
  });
});

describe("단서(허가·사용승인 미이행) × 세액", () => {
  it("E-PROVISO-1: 전량 비사업용이라 초과비율 100%로 중과된다", () => {
    const details = nblDetails(12_000, ACQ_DATE); // 면적만 보면 한도 이내
    details.otherLand.factory = { ...factory(12_000), isUnregistered: true } as never;
    const r = calculateTransferTax(
      land({ nonBusinessLandDetails: details } as Partial<TransferTaxInput>),
      rates,
    );

    expect(r.nonBusinessLandJudgmentDetail?.isNonBusinessLand).toBe(true);
    // 전량 비사업용은 면적 안분이 아니다 — areaProportioning 없이 100% 중과
    expect(r.nonBusinessLandJudgmentDetail?.areaProportioning).toBeUndefined();
    expect(r.calculatedTax).toBeGreaterThan(221_730_000);
  });
});
