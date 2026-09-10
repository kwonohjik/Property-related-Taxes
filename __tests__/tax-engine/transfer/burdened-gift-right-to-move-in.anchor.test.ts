/**
 * anchor R-A1 / R-A3 / R-A5 / R-A7 — **조합원입주권 × 부담부증여** (소령 §159 × §166①).
 *
 * 설계: `docs/02-design/features/burdened-gift-redevelopment-assets.{plan,engine.design}.md`
 *
 * ## 이 배치의 핵심은 «§159①1호 A괄호가 발동하지 않는다»
 *
 * 괄호는 열거를 닫아 두고 있다 — 「양도가액을 「상속세 및 증여세법」 **제61조제1항ㆍ제2항ㆍ
 * 제5항 및 제66조**에 따라 기준시가로 산정한 경우에는 취득가액도 기준시가로 산정한다」.
 * 조합원입주권의 증여재산 평가는 **§61③**(부동산을 취득할 수 있는 권리 → 시행령 §51②)이라
 * 그 열거에 **없다** ⇒ 취득가액은 §97①1호 **실지거래가액**이다(K-4 전용).
 *
 * 종전 엔진은 `valuationMode === "sangjeungbeop_standard"`를 **최상위 조건**으로 두어
 * 기준시가 모드면 무조건 「취득시 기준시가 × 채무비율」로 갔다. 입주권은 그 칸을 쓰지 않아
 * (④가 `buildingStdPriceAtAcquisition: 0`을 보낸다) **취득가액이 0**이 되고, 양도차익이
 * 그만큼 통째로 부풀었다. 이 파일의 R-A1이 그 회귀를 잡는다.
 *
 * ## 🔴 세액 0 함정 (설계 D-1)
 *
 * 평가액을 `rightValuation`에만 넣고 기준시가 4필드를 0으로 두면
 * `sangjeungbeopValuation.supplementary`(= **양도가액 안분 분모**)가 0이 되어
 * `transferDenominator === 0` 가드가 발동하고 **양도가액이 0 → 세액 0**이 된다(침묵).
 * ⇒ ④는 평가액 **총액**을 `buildingStdPriceAtTransfer`에 싣는다.
 *
 * ⚠️ 수치는 mock 세율표(`makeMockRates`) 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/**
 * 조합원입주권 · 청산금 **납부** · 부담부증여.
 *
 *   증여가액 C = §61③ 보충적 평가 15억 (권리가액 12억 + 납입금 2억 + 프리미엄 1억)
 *   인수 채무 B = 6억  ⇒ r = 0.4
 *   §166④1호 평가액 5억 · 납부 청산금 2억 (β가 0.4배로 줄인다)
 *   종전 부동산 실지취득가액 3억  ⇒ 취득가액 = 3억 × 0.4 = 1.2억
 *
 * 🔑 **§166④1호 평가액(5억)과 상증칙 §16③ 조합원권리가액(12억)을 «다른 값»으로 둔다** —
 *    한쪽을 다른 쪽으로 재사용하는 구현이면 수치가 어긋나 반드시 깨진다.
 */
function makeInput(overrides: Record<string, unknown> = {}): TransferTaxInput {
  const { bgOverrides, ...rest } = overrides as {
    bgOverrides?: Record<string, unknown>;
  } & Record<string, unknown>;
  return {
    ...baseTransferInput(),
    propertyType: "right_to_move_in",
    transferType: "burdened_gift",
    acquisitionDate: new Date("2009-03-01"),
    transferDate: new Date("2024-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    reductions: [],
    redevelopment: {
      subject: "right",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2018-06-01"),
      rightsValue: 500_000_000,
      settlementDirection: "pay",
      settlementAmount: 200_000_000,
      preApprovalExpenses: 10_000_000,
      postApprovalExpenses: 5_000_000,
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
      buildingStdPriceAtAcquisition: 0,
      acquisitionMethod: "actual",
      actualAcquisitionTotal: 300_000_000,
      rightValuation: {
        memberRightsValue: 1_200_000_000,
        paidInstallments: 200_000_000,
        premium: 100_000_000,
      },
      ...bgOverrides,
    },
    ...rest,
  } as unknown as TransferTaxInput;
}

const run = (o: Record<string, unknown> = {}) =>
  calculateTransferTax(makeInput(o), rates) as TransferTaxResult;

describe("R-A1 · 취득가액은 «기준시가가 아니라 실지거래가액 × 채무비율»이다", () => {
  const bg = run().transferBurdenedGiftBreakdown!;

  it("🔴 취득가액 = 실지 3억 × 0.4 = 1.2억 (A괄호 미발동)", () => {
    expect(bg.perAsset.building.acquisitionPrice).toBe(120_000_000);
  });

  it("🔴 취득시 기준시가는 0이다 — 그 축으로 갔다면 취득가액이 0이 된다", () => {
    expect(bg.perAsset.building.stdPriceAtAcquisition).toBe(0);
    expect(bg.perAsset.building.acquisitionPrice).toBeGreaterThan(0);
  });

  it("산정방식이 「실지」로 기록된다 (기준시가 모드인데도)", () => {
    expect(bg.acquisitionMethodUsed).toBe("actual");
  });

  it("🔴 대조군 — 같은 사실관계에서 `rightValuation`만 빼면 A괄호가 발동해 취득가액이 0이 된다", () => {
    const withoutRv = run({
      bgOverrides: {
        rightValuation: undefined,
        // 이 자산은 취득시 기준시가를 입력받지 않으므로 0 그대로다
      },
    }).transferBurdenedGiftBreakdown!;
    expect(withoutRv.acquisitionMethodUsed).toBe("standard_price");
    expect(withoutRv.perAsset.building.acquisitionPrice).toBe(0);
  });

  it("개산공제는 적용되지 않는다 (K-4는 실비로 대체 — §163⑥ 미적용)", () => {
    expect(bg.perAsset.building.estimatedDeduction).toBe(0);
    expect(bg.perAsset.land.estimatedDeduction).toBe(0);
  });
});

describe("R-A3 · C = 조합원권리가액 + 납입금 + 프리미엄 (상증령 §51②)", () => {
  const bg = run().transferBurdenedGiftBreakdown!;

  it("평가 3항이 결과에 실린다", () => {
    expect(bg.rightValuationDetail).toEqual({
      memberRightsValue: 1_200_000_000,
      paidInstallments: 200_000_000,
      premium: 100_000_000,
      total: 1_500_000_000,
    });
  });

  it("🔴 자기일관 — 3항 합 === 양도가액 안분 분모(보충적평가)", () => {
    expect(bg.rightValuationDetail!.total).toBe(bg.sangjeungbeopValuation.supplementary);
  });

  it("🔑 §166④1호 평가액(5억)을 C로 «쓰지 않는다» — 두 조문의 값이 다르다", () => {
    // 관리처분 평가액 5억을 조합원권리가액으로 혼용했다면 C가 8억이 됐을 것이다.
    expect(bg.sangjeungbeopValuation.supplementary).toBe(1_500_000_000);
    expect(bg.sangjeungbeopValuation.supplementary).not.toBe(800_000_000);
  });

  it("자산 종류가 결과에 기록된다 (모드 플래그로 추론 금지)", () => {
    expect(bg.assetKind).toBe("right_to_move_in");
  });

  it("채무비율 r = 6억 / 15억 = 0.4", () => {
    expect(bg.debtRatio).toBeCloseTo(0.4, 10);
  });
});

describe("🔴 D-1 · 세액 0 함정 방어", () => {
  it("양도가액이 0이 아니다 — 평가액을 building 슬롯에 싣지 않으면 조용히 0이 된다", () => {
    const bg = run().transferBurdenedGiftBreakdown!;
    const total = bg.perAsset.land.transferPrice + bg.perAsset.building.transferPrice;
    expect(total).toBe(600_000_000); // = 인수 채무 B
  });

  it("세액이 0이 아니다", () => {
    const r = run();
    expect(r.transferGain).toBeGreaterThan(0);
    expect(r.calculatedTax).toBeGreaterThan(0);
  });

  it("세액 실측값 (mock 세율)", () => {
    const r = run();
    expect(r.transferGain).toBe(394_000_000);
    expect(r.calculatedTax).toBe(125_188_000);
    expect(r.totalTax).toBe(137_706_800);
  });
});

describe("§166①1호 · β 스케일 + 장기보유공제 분포", () => {
  const redev = run().redevelopmentDetail!;

  it("인가전 = 평가액×r − 취득가액 − 인가전경비×r = 2억 − 1.2억 − 400만", () => {
    expect(redev.preApproval.gain).toBe(76_000_000);
  });

  it("인가후 = 양도가액 − (평가액+청산금)×r − 인가후경비×r = 6억 − 2.8억 − 200만", () => {
    expect(redev.settlement.gain).toBe(318_000_000);
  });

  it("🔑 §95② 본문 괄호 — 입주권은 인가후 분에 장기보유특별공제가 없다", () => {
    expect(redev.postApprovalExistingHouse.gain).toBe(0);
    expect(redev.settlement.lthd).toBe(0);
    expect(redev.preApproval.lthd).toBeGreaterThan(0);
  });

  it("β 항등식 — Σ = 양도가액 − 취득가액 − 청산금·r − 필요경비·r", () => {
    const r = 0.4;
    expect(redev.total.gain).toBe(
      600_000_000 -
        120_000_000 -
        Math.floor(200_000_000 * r) -
        (Math.floor(10_000_000 * r) + Math.floor(5_000_000 * r)),
    );
  });
});

describe("🔴 U-6 · 입주권 × 담보(§66)·임대(§61⑤) 승리는 fail-fast", () => {
  /**
   * 그 경로는 A괄호가 발동해 「입주권의 기준시가」(소령 §165①)를 요구하는데 본 설계는 그 입력을
   * 두지 않는다. 값이 0으로 흘러 **취득가액 0 → 양도차익 과대**가 되므로 계산을 중단한다 —
   * 근거 없는 불리 적용을 막기 위한 것이지 「지원 예정」 안내가 아니다.
   */
  /**
   * ⚠️ 담보평가는 `임대보증금 + min(채권최고액, 담보채권액)`이라 **실제 채무액으로 cap**된다
   *    (`computeMortgageValuation`). 설정액만 키워서는 보충적평가를 못 넘는다 —
   *    채무액 자체가 보충적평가(15억)를 넘어야 한다.
   */
  it("담보평가가 채택되면 계산이 중단된다", () => {
    expect(() =>
      run({
        bgOverrides: {
          mortgageSetAmount: 2_000_000_000,
          mortgageDebtAmount: 1_600_000_000, // > 보충적평가 15억 ⇒ 담보(§66)가 Max 승자
        },
      }),
    ).toThrow(/조합원입주권의 증여재산 평가가 담보/);
  });

  it("임대평가가 채택되어도 계산이 중단된다", () => {
    expect(() =>
      run({
        bgOverrides: {
          mortgageDebtAmount: 0,
          lendingDepositTotal: 1_000_000_000,
          annualRentTotal: 100_000_000, // 환산 833,333,333 ⇒ 임대평가 18.3억 > 15억
        },
      }),
    ).toThrow(/조합원입주권의 증여재산 평가가 임대/);
  });

  it("🔴 대조군 — 보충적평가가 채택되면 정상 계산된다", () => {
    expect(() => run()).not.toThrow();
    expect(run().transferBurdenedGiftBreakdown!.sangjeungbeopValuation.selectedMode).toBe(
      "supplementary",
    );
  });
});

describe("R-A7 · 청산금 «수령» — §166①2호 가·나목 2조각", () => {
  const receive = () =>
    run({
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2018-06-01"),
        rightsValue: 500_000_000,
        settlementDirection: "receive",
        settlementAmount: 100_000_000,
        preApprovalExpenses: 10_000_000,
        postApprovalExpenses: 5_000_000,
      },
    });

  it("분양가 = (평가액 − 수령청산금) × r = (5억 − 1억) × 0.4", () => {
    expect(receive().redevelopmentDetail!.salePriceTotal).toBe(160_000_000);
  });

  it("나목(인가전 축소분)과 가목(인가후)이 모두 산출된다", () => {
    const d = receive().redevelopmentDetail!;
    expect(d.preApproval.apportionedTransfer).toBe(160_000_000);
    expect(d.settlement.apportionedAcquisition).toBe(160_000_000);
  });

  it("계산이 완료된다 (분기 도달성)", () => {
    expect(receive().totalTax).toBeGreaterThanOrEqual(0);
  });
});

describe("R-A5 · 시가 모드(§60②)에서도 K-4 축으로 간다", () => {
  const market = () =>
    run({
      bgOverrides: {
        valuationMode: "sangjeungbeop_market",
        marketValueAtTransfer: 1_500_000_000,
        acquisitionMethod: "actual",
        actualAcquisitionTotal: 300_000_000,
      },
    });

  it("시가 모드에서도 취득가액 = 실지 × r", () => {
    expect(market().transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(
      120_000_000,
    );
  });

  it("평가 명세는 그대로 실린다", () => {
    expect(market().transferBurdenedGiftBreakdown!.rightValuationDetail!.total).toBe(
      1_500_000_000,
    );
  });
});

describe("지분 부담부증여 — 평가 3항이 «합을 보존하며» 축소된다", () => {
  /**
   * 🔴 세 항을 각각 floor하면 합이 `floor(총액 × 지분율)`보다 최대 2원 작아진다.
   *    평가액 총액(`buildingStdPriceAtTransfer`)은 따로 그 값으로 줄어들므로 **지분 자산에서만**
   *    자기일관 검사가 깨진다 ⇒ 마지막 항이 잔액을 흡수한다.
   *
   * 끝자리를 1로 두어 floor 판별력을 확보한다.
   */
  const fractional = () =>
    run({
      ownershipRatio: 1 / 3,
      bgOverrides: {
        buildingStdPriceAtTransfer: 1_500_000_001,
        mortgageDebtAmount: 200_000_000,
        rightValuation: {
          memberRightsValue: 1_200_000_001,
          paidInstallments: 200_000_000,
          premium: 100_000_000,
        },
      },
    });

  it("🔴 3항 합 === 보충적평가(= 축소된 평가액 총액)", () => {
    const bg = fractional().transferBurdenedGiftBreakdown!;
    expect(bg.rightValuationDetail!.total).toBe(bg.sangjeungbeopValuation.supplementary);
  });

  it("총액이 지분분으로 줄었다", () => {
    const bg = fractional().transferBurdenedGiftBreakdown!;
    expect(bg.rightValuationDetail!.total).toBe(Math.floor(1_500_000_001 / 3));
  });
});
