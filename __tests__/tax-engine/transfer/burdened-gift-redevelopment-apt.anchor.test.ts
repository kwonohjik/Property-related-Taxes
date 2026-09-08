/**
 * anchor A-A2 / A-A3 / A-A5 — 재개발·재건축 APT × 부담부증여(소령 §159 × §166).
 *
 * 설계: `docs/02-design/features/burdened-gift-redevelopment-assets.{plan,engine.design}.md`
 *
 * ## β — §166 산식의 절대 금액항을 채무비율로 안분한다
 *
 * §159①은 **취득가액·양도가액 두 항만** 안분한다. §166 산식의 평가액·청산금·필요경비는
 * 물건 전체 값 그대로라, 그대로 결합하면 **스케일이 다른 값끼리 더하고 뺀다**.
 *
 * ### 🔴 뮤테이션 실측 (2026-09-08 · 이 파일의 `BASE` 사실관계 · `debtRatio` 배선 제거)
 *
 * | | α (β 미적용) | β (현행) |
 * |---|---|---|
 * | 인가전 양도차익 | 370,000,000 | **76,000,000** |
 * | 인가후 기존주택분 | **−75,000,000** | 227,142,857 |
 * | 청산금분 | **−30,000,000** | 90,857,143 |
 * | 총 양도차익 | 265,000,000 | **394,000,000** |
 * | 산출세액 | 40,442,000 | **93,123,029** |
 *
 * α에서 인가후 두 분기가 음수가 되는 이유는 명확하다 — 양도가액은 채무분(6억)으로 줄었는데
 * 분양가(평가액 5억 + 청산금 2억 = 7억)와 필요경비는 **물건 전체** 값이라, 전체 물건의 원가를
 * 채무분 양도가액에서 빼고 있다. 그 음수 분기는 장기보유특별공제가 0이 되고
 * (`redevelopment.ts`의 `splitLthdAmount`), 결과적으로 **청산금·필요경비를 전액 공제받은**
 * 과소 산정이 된다.
 *
 * ⚠️ **β의 방향은 사실관계에 종속된다 — 「항상 납세자에게 유리」가 아니다.**
 *    설계 P0 사례에서는 반대로 α가 인가전 분을 음수로 만들어 장기보유공제를 소멸시켜
 *    **세액을 높였다**. 여기서는 β가 세액을 높인다. 어느 쪽이든 **α는 스케일이 어긋난
 *    산식**이고, β를 택한 근거는 「유리·불리」가 아니라 **산식 정합성**과 **안분 비율 보존**이다
 *    (§166②1호의 `평가액 : 청산금` 비율은 분자·분모에 같은 `r`이 걸려 불변).
 *    법적 불확실성은 결과 화면 고지로 노출한다(`detectRedevelopmentBurdenedGiftNotice`).
 *
 * ⚠️ 수치는 mock 세율표(`makeMockRates`) 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/**
 * 재개발 APT · 청산금 **납부** · 부담부증여.
 *
 *   증여가액 C = 증여일 기준시가 15억 (상증법 §61①4호)
 *   인수 채무 B = 6억  ⇒ r = B/C = 0.4
 *   §159 양도가액 = 15억 × 0.4 = 6억 · 취득가액 = 3억 × 0.4 = 1.2억
 *   §166④1호 평가액 5억 · 납부 청산금 2억 (둘 다 물건 전체 → β가 0.4배로 줄인다)
 */
function makeInput(overrides: Record<string, unknown> = {}): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "redevelopment_apt",
    transferType: "burdened_gift",
    acquisitionDate: new Date("2009-03-01"),
    transferDate: new Date("2024-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    reductions: [],
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2018-06-01"),
      rightsValue: 500_000_000,
      settlementDirection: "pay",
      settlementAmount: 200_000_000,
      preApprovalExpenses: 10_000_000,
      postApprovalExpenses: 5_000_000,
      completionDate: new Date("2021-09-01"),
    },
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_standard",
      lendingDepositTotal: 0,
      mortgageDebtAmount: 600_000_000,
      annualRentTotal: 0,
      donorRelation: "lineal_descendant",
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 1_500_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 300_000_000,
    },
    ...overrides,
  } as unknown as TransferTaxInput;
}

const run = (o: Record<string, unknown> = {}) =>
  calculateTransferTax(makeInput(o), rates) as TransferTaxResult;

describe("A-A2 · 재개발 APT × 부담부증여 — 게이트가 열려 있다", () => {
  it("🔴 계산이 차단되지 않는다 (엔진 게이트 편입)", () => {
    expect(() => run()).not.toThrow();
  });

  it("채무비율 r = B/C = 0.4 로 산정된다", () => {
    expect(run().transferBurdenedGiftBreakdown?.debtRatio).toBeCloseTo(0.4, 10);
  });

  it("🔴 §159 명세가 결과에 실린다 (D-4 — 종전에는 이 분기가 버렸다)", () => {
    const bg = run().transferBurdenedGiftBreakdown;
    expect(bg).toBeDefined();
    // 양도가액 = C × r = 15억 × 0.4
    expect(bg!.perAsset.land.transferPrice + bg!.perAsset.building.transferPrice).toBe(600_000_000);
  });
});

describe("A-A2 · β 스케일 — §166 절대 금액항이 채무비율로 줄어든다", () => {
  const redev = run().redevelopmentDetail!;

  it("평가액(§166④1호) 5억 → 2억", () => {
    expect(redev.preApproval.apportionedTransfer).toBe(200_000_000);
  });

  it("분양가 = (평가액 + 납부청산금) × r = (5억 + 2억) × 0.4", () => {
    expect(redev.salePriceTotal).toBe(280_000_000);
  });

  it("🔴 인가후 두 분기가 «음수가 아니다» — α의 스케일 불일치 회귀", () => {
    // α에서는 −75,000,000 / −30,000,000 이었다(파일 헤더 표).
    expect(redev.postApprovalExistingHouse.gain).toBeGreaterThan(0);
    expect(redev.settlement.gain).toBeGreaterThan(0);
  });

  it("분기별 양도차익 실측값", () => {
    expect(redev.preApproval.gain).toBe(76_000_000);
    expect(redev.postApprovalExistingHouse.gain).toBe(227_142_857);
    expect(redev.settlement.gain).toBe(90_857_143);
  });

  it("β 항등식 — Σ분기 = 양도가액 − 취득가액 − 청산금·r − 필요경비·r", () => {
    const r = 0.4;
    const expected =
      600_000_000 - // §159 양도가액
      120_000_000 - // §159 취득가액 (3억 × r)
      Math.floor(200_000_000 * r) - // 납부 청산금 × r
      (Math.floor(10_000_000 * r) + Math.floor(5_000_000 * r)); // 인가전후 필요경비 × r
    expect(redev.total.gain).toBe(expected);
    expect(redev.total.gain).toBe(394_000_000);
  });

  it("🔑 안분 비율은 β에 불변이다 — 기존건물분 : 청산금분 = 평가액 : 청산금 = 5 : 2", () => {
    const existing = redev.postApprovalExistingHouse.gain;
    const settlement = redev.settlement.gain;
    expect(existing / (existing + settlement)).toBeCloseTo(500 / 700, 6);
  });

  it("세액 실측값 (mock 세율)", () => {
    const r = run();
    expect(r.calculatedTax).toBe(93_123_029);
    expect(r.totalTax).toBe(102_435_331);
  });
});

describe("A-A2 · β 적용 고지", () => {
  it("결과 warnings에 §159 × §166 결합의 근거 상태가 실린다", () => {
    const w = run().warnings ?? [];
    expect(w.some((x) => x.includes("제159조와 제166조의 결합"))).toBe(true);
  });

  it("🔴 유리·불리·절감 표현을 쓰지 않는다", () => {
    const notice = (run().warnings ?? []).find((x) => x.includes("제166조"))!;
    for (const banned of ["유리", "불리", "절감", "절세", "줄어듭니다", "늘어납니다"]) {
      expect(notice).not.toContain(banned);
    }
  });

  it("🔴 대조군 — 일반 양도(부담부증여 아님)에서는 고지가 없다", () => {
    const r = calculateTransferTax(
      makeInput({
        transferType: "regular",
        transferPrice: 1_500_000_000,
        acquisitionPrice: 300_000_000,
        burdenedGiftInfo: undefined,
      }) as TransferTaxInput,
      rates,
    ) as TransferTaxResult;
    expect((r.warnings ?? []).some((x) => x.includes("제166조의 결합"))).toBe(false);
  });
});

describe("A-A3 · 청산금 «수령» 분기에도 β가 걸린다", () => {
  const receive = () =>
    run({
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2018-06-01"),
        rightsValue: 500_000_000,
        settlementDirection: "receive",
        settlementAmount: 100_000_000,
        preApprovalExpenses: 10_000_000,
        postApprovalExpenses: 5_000_000,
        completionDate: new Date("2021-09-01"),
      },
    });

  it("분양가 = (평가액 − 수령청산금) × r = (5억 − 1억) × 0.4", () => {
    expect(receive().redevelopmentDetail!.salePriceTotal).toBe(160_000_000);
  });

  it("수령 청산금 양도가액 = 1억 × 0.4", () => {
    expect(receive().redevelopmentDetail!.settlement.apportionedTransfer).toBe(40_000_000);
  });

  it("계산이 완료된다 (분기 도달성)", () => {
    expect(receive().totalTax).toBeGreaterThanOrEqual(0);
  });
});

describe("A-A5 · 12억 비교·안분 분모는 «증여가액 C»다 (D-2)", () => {
  /**
   * 🔴 종전에는 재개발 경로가 `input.transferPrice`(= 채무액 B)로 12억을 쟀다. 부담부증여에서
   *    그 값은 물건 값이 아니라 **채무분**이라, 24억 물건을 채무 6억으로 부담부증여하면
   *    6억 ≤ 12억이 되어 **고가주택 안분이 통째로 빠진다**.
   *
   * 일반 경로(`transfer-tax-exemption.ts` 7곳)는 이미 `burdenedGiftDenominator`를 쓴다 —
   * 재개발 경로만 배선이 없었다.
   *
   * 🔴 **뮤테이션 실측(2026-09-08)에서 증상이 「안분 누락」보다 나빴다.** 비과세 판정이
   *    `isPartialExempt`로 안분을 켠 뒤 분모만 채무액 6억이면
   *    `taxableRatio = (6억 − 12억) / 6억 = −1`이 되어 **과세대상 양도차익이 −471,250,000**,
   *    비과세분이 942,500,000으로 찍혔다(전체 양도차익 471,250,000의 두 배).
   *    비교와 안분이 같은 값을 써야 하는 이유가 여기 있다.
   */
  const oneHouse = () =>
    run({
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 36,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 0,
        mortgageDebtAmount: 600_000_000,
        annualRentTotal: 0,
        donorRelation: "lineal_descendant",
        landStdPriceAtTransfer: 0,
        // C = 24억 > 12억 · B = 6억 ⇒ B로 재면 안분이 빠진다
        buildingStdPriceAtTransfer: 2_400_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 300_000_000,
      },
    });

  it("증여가액 C = 24억이 분모다", () => {
    expect(oneHouse().transferBurdenedGiftBreakdown?.sangjeungbeopValuation.max).toBe(
      2_400_000_000,
    );
  });

  it("🔴 12억 초과 안분이 «발동한다» — 채무액 6억으로 쟀다면 발동하지 않는다", () => {
    const step = oneHouse().steps.find((s) =>
      s.label.includes("12억 초과 과세대상 양도차익 안분"),
    );
    expect(step).toBeDefined();
    // 분모 라벨·값이 증여가액 24억이어야 한다 (비교와 안분이 같은 값)
    expect(step!.formula).toContain("증여가액 2,400,000,000");
    expect(step!.formula).not.toContain("양도가액 600,000,000");
  });

  it("🔴 과세대상 양도차익이 음수가 아니다 — 분모가 채무액이면 −471,250,000이 된다", () => {
    const r = oneHouse();
    expect(r.transferGain).toBeGreaterThanOrEqual(0);
    expect(r.taxableGain).toBeGreaterThanOrEqual(0);
  });

  it("안분 비율 = (24억 − 12억) / 24억 = 0.5 — 전체 양도차익의 절반이 과세대상", () => {
    const r = oneHouse();
    const alloc = r.redevelopmentDetail!.highValueAllocation!;
    expect(alloc.taxableGain).toBe(Math.floor((alloc.taxableGain + alloc.nontaxableGain) * 0.5));
  });
});
