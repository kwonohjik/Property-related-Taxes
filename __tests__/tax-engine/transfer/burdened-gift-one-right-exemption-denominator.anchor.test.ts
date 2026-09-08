/**
 * anchor U-8 — **조합원입주권 §89①4호 12억 판정·안분의 분모**는 부담부증여에서
 * 「양도가액(= 채무액)」이 아니라 **증여가액 C**다.
 *
 * ## 종전 결함 — 24억 입주권이 «세액 0»이었다
 *
 * `applyOneRightExemption`이 `input.transferPrice`로 12억을 쟀는데, 부담부증여에서 그 값은
 * 소령 §159가 안분한 **채무액 B**다. 24억 입주권을 채무 6억으로 부담부증여하면
 * 6억 ≤ 12억이 되어 **전액 비과세**로 판정됐다(뮤테이션 실측):
 *
 * | | 종전 (분모 = B) | 정정 (분모 = C) |
 * |---|---|---|
 * | 12억 판정 | 6억 ≤ 12억 → **전액 비과세** | 24억 > 12억 → 안분 과세 |
 * | `isExempt` | true | false |
 * | 양도차익 | 0 | 235,625,000 |
 * | 산출세액 | **0** | **67,023,000** |
 * | 세액합계 | **0** | **73,725,300** |
 *
 * ## 근거 — 국세청 해석례 (본문 실독 2026-09-08 · taxlaw.nts.go.kr)
 *
 * > **서면4팀-1692**(2007.05.16, 「주택의 부담부 증여시 고가주택 판단」) — 「고가주택의 판정은
 * >   주택(그 부수 토지 포함)의 전체이전, 일부이전, **부담부 증여이전 등 이전방식에 관계없이
 * >   1주택의 전체가액을 기준으로 판정**하는 것이므로 1주택을 부담부 증여 이전하는 경우
 * >   고가주택 판정은 **당해 주택의 증여가액에 의하는 것**입니다.」
 * >   ⭐ 질의 사실관계가 「양도가액을 **채무액 3억으로 보아야 하는지**」였고 답은 **아니다**였다.
 *
 * > **서면4팀-1526**(2004.09.24) — 영 §160①1호 산식에서 「법 §95①의 양도차익」은 **영 §159**로
 * >   산정한 「양도로 보는」 값으로 계산하고, **「양도가액은 〔채무액 × (전체증여가액 ÷ 채무액)〕
 * >   을 적용」** 한다 = **전체 증여가액**.
 *
 * ## 해석 A와 충돌하지 않는다 — 다른 질문에 답한 것이었다
 *
 * `applyOneRightExemption` 헤더가 인용하는 해석 A 3건(재산세제과-1061 · 서면5팀-1152 ·
 * 서면5팀-74)은 **전부 유상 양도** 사안이고 법 §96①(「양도자와 양수자간에 실제로 거래한
 * 가액」)을 전제로 **양도차익 산정 방법**에 답했다 — 부담부증여 언급 0건(본문 실독).
 * 부담부증여에는 「실지거래가액」이 없고, 그 자리를 무엇으로 채우는지는 해석 B가 정한다.
 *
 * ## 입주권에도 같은 이유
 *
 * 해석 A 자신이 「입주권이 요건을 충족하면 이를 **법 §89①3호에서 규정하는 고가주택으로 보아**
 * §95③ · 영 §160으로 계산한다」고 밝힌다. 현행 §89①**4호 단서**(「해당 조합원입주권의
 * **양도 당시 실지거래가액**이 12억원을 초과하는 경우」)도 3호 괄호(「**양도 당시 실지거래가액의
 * 합계액**이 12억원을 초과하는 고가주택은 제외」)와 같은 문언 구조다.
 *
 * ⚠️ 수치는 mock 세율표(`makeMockRates`) 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/**
 * 1세대 1입주권 · §89①4호 가목 요건 충족 · 부담부증여.
 *
 *   증여가액 C = §61③ 보충적 평가 **24억** (권리가액 20억 + 납입금 3억 + 프리미엄 1억)
 *   인수 채무 B = **6억**  ⇒ r = 0.25
 *
 * 🔑 **C > 12억 > B** 로 두는 것이 이 anchor의 전부다 — 분모가 갈리면 결과가 «정반대»가 된다.
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
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
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
      exemptionEligibleAtApproval: true,
    },
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_standard",
      lendingDepositTotal: 0,
      mortgageDebtAmount: 600_000_000,
      annualRentTotal: 0,
      donorRelation: "lineal_descendant",
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 2_400_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 0,
      acquisitionMethod: "actual",
      actualAcquisitionTotal: 300_000_000,
      rightValuation: {
        memberRightsValue: 2_000_000_000,
        paidInstallments: 300_000_000,
        premium: 100_000_000,
      },
      ...bgOverrides,
    },
    ...rest,
  } as unknown as TransferTaxInput;
}

const run = (o: Record<string, unknown> = {}) =>
  calculateTransferTax(makeInput(o), rates) as TransferTaxResult;

describe("U-8 · 12억 판정 분모 = 증여가액 C (채무액 아님)", () => {
  it("전제 확인 — C = 24억 > 12억 > B = 6억", () => {
    const bg = run().transferBurdenedGiftBreakdown!;
    expect(bg.sangjeungbeopValuation.max).toBe(2_400_000_000);
    expect(bg.assumedDebtAmount).toBe(600_000_000);
    expect(bg.debtRatio).toBeCloseTo(0.25, 10);
  });

  it("🔴 전액 비과세가 «아니다» — 채무액으로 쟀다면 6억 ≤ 12억이라 전액 비과세였다", () => {
    const r = run();
    expect(r.isExempt).toBe(false);
    expect(r.redevelopmentDetail!.oneRightExemptionApplied).not.toBe(true);
  });

  it("🔴 12억 초과 안분이 발동한다 (§89①4호 각 목 외의 부분 단서)", () => {
    const r = run();
    expect(r.isPartialExempt).toBe(true);
    expect(r.redevelopmentDetail!.oneRightHighValueApplied).toBe(true);
  });

  it("🔴 세액이 0이 아니다 — 종전에는 0이었다", () => {
    const r = run();
    expect(r.calculatedTax).toBeGreaterThan(0);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("세액 실측값 (mock 세율)", () => {
    const r = run();
    expect(r.transferGain).toBe(235_625_000);
    expect(r.calculatedTax).toBe(67_023_000);
    expect(r.totalTax).toBe(73_725_300);
  });

  it("🔑 비교와 안분이 같은 분모 — 안분 비율 = (24억 − 12억) / 24억 = 0.5", () => {
    const redev = run().redevelopmentDetail!;
    const pre = redev.preApproval;
    // 안분 전 값이 보존되고, 과세대상은 그 절반이다(정수 floor).
    expect(pre.gainBeforeAllocation).toBeGreaterThan(0);
    expect(pre.gain).toBe(Math.floor(pre.gainBeforeAllocation! * 0.5));
  });

  it("🔴 과세대상 양도차익이 음수가 아니다 — 분모가 어긋나면 음수 비율이 된다", () => {
    const r = run();
    expect(r.transferGain).toBeGreaterThanOrEqual(0);
    expect(r.redevelopmentDetail!.total.gain).toBeGreaterThanOrEqual(0);
  });
});

describe("🔴 대조군 — 일반 양도에서는 분모가 「양도가액」 그대로다 (해석 A 유지)", () => {
  /**
   * 부담부증여가 아니면 `burdenedGiftDenominator`가 없으므로 `input.transferPrice`를 쓴다.
   * 해석 A 3건이 지지하는 동작이며 **회귀가 있어서는 안 된다**.
   */
  const regular = (transferPrice: number) =>
    calculateTransferTax(
      makeInput({
        transferType: "regular",
        transferPrice,
        acquisitionPrice: 300_000_000,
        burdenedGiftInfo: undefined,
      }) as TransferTaxInput,
      rates,
    ) as TransferTaxResult;

  it("양도가액 10억(≤12억) → 전액 비과세", () => {
    const r = regular(1_000_000_000);
    expect(r.isExempt).toBe(true);
    expect(r.redevelopmentDetail!.oneRightExemptionApplied).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("양도가액 15억(>12억) → 안분 과세 · 비율 = (15억 − 12억) / 15억", () => {
    const r = regular(1_500_000_000);
    expect(r.redevelopmentDetail!.oneRightHighValueApplied).toBe(true);
    const pre = r.redevelopmentDetail!.preApproval;
    expect(pre.gain).toBe(Math.floor(pre.gainBeforeAllocation! * (0.3 / 1.5)));
  });
});

describe("부담부증여 × 12억 이하 — 전액 비과세는 그대로 성립한다", () => {
  it("C = 10억이면 전액 비과세", () => {
    const r = run({
      bgOverrides: {
        buildingStdPriceAtTransfer: 1_000_000_000,
        mortgageDebtAmount: 400_000_000,
        rightValuation: {
          memberRightsValue: 800_000_000,
          paidInstallments: 150_000_000,
          premium: 50_000_000,
        },
      },
    });
    expect(r.transferBurdenedGiftBreakdown!.sangjeungbeopValuation.max).toBe(1_000_000_000);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});
