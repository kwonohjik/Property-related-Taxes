/**
 * P3 앵커 — §155의2 장기저당담보주택 · §155의3 상생임대주택
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §6 OH-11~OH-13c · G-2.
 * 법령 실독(법제처 DRF, MST 286211 · 2026-09-20):
 *
 *   §155의2① 「국내에 1주택을 소유한 1세대가 … 장기저당담보로 제공된 주택을 양도하는 경우에는
 *            제154조제1항의 규정을 적용함에 있어 **거주기간의 제한을 받지 아니한다**」
 *            1호 계약체결일 현재 가입자 60세 이상 · 2호 계약기간 10년 이상 · 3호 만기 일시상환
 *   §155의2② 동거봉양 합가로 2주택 → **먼저 양도하는 주택**을 1주택으로 **보아** §154① 적용.
 *            거주기간 면제는 「**장기저당담보주택은**」 — 담보주택을 양도할 때만.
 *   §155의2③ 계약기간 **만료 이전** 양도면 ①②를 적용하지 않는다.
 *   §155의3① 「… 제154조제1항, 제155조제20항제1호 및 제159조의4를 적용할 때 해당 규정에 따른
 *            **거주기간의 제한을 받지 않는다**」 1호 5% 이하 + 2021-12-20~2026-12-31 체결 ·
 *            2호 직전임대차 **1년 6개월** 이상 · 3호 상생임대차 **2년** 이상
 *
 * 🔴 **관측 지점을 먼저 정했다.** 둘 다 「거주요건 **면제**」라 케이스를 잘못 잡으면 요건을
 *    무력화해도 세액이 그대로다(P2에서 §89② 축이 같은 이유로 구별력 0이었다).
 *    면제가 실제로 판정을 가르는 자리는 셋뿐이고, 각각을 따로 고정한다:
 *
 *    | 면제 대상 | 갈리는 지점 | 시료 조건 |
 *    |---|---|---|
 *    | §154① | 비과세 여부 | **취득 당시 조정지역** + 거주 2년 미달 |
 *    | §159의4 | 장특 표1 ↔ 표2 | 고가주택(12억 초과) + 거주 2년 미달 + 취득 당시 **비**조정 |
 *    | §155⑳1호 | 특례 적용 여부 | 장기임대주택 보유 + 거주주택 거주 2년 미달 |
 *
 * 🔑 **보유 2년은 어느 조문도 면제하지 않는다** — 면제 대상은 거주기간뿐이다(둘 다 법문 그대로).
 * 🔑 §155의2·§155의3은 **중과 배제(영 §167의10①15호)와 무관**하다 — 15호는 「제155조 또는
 *    조세특례제한법」만 열거한다(조문 실독). 의제인 §155의2②조차 들어가지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const run = (over: Partial<TransferTaxInput>) => calculateTransferTax(baseTransferInput(over), rates);
const exempt = (over: Partial<TransferTaxInput>) => run(over).isExempt;

/** §155의2 계약 요건을 모두 갖춘 사실 — 각 테스트가 한 축씩만 깬다. */
const MORTGAGE_OK = {
  contractDate: D("2016-01-01"),
  borrowerAgeAtContract: 60,
  contractYears: 10,
  maturityLumpSumRepayment: true,
  transferredBeforeMaturity: false,
  isTransferredHouseMortgaged: true,
} satisfies NonNullable<TransferTaxInput["longTermMortgageHouse"]>;

/** §155의3 요건을 모두 갖춘 사실. */
const WIN_WIN_OK = {
  winWinContractDate: D("2022-03-01"),
  increaseRatePct: 5,
  priorLeaseMonths: 18,
  winWinLeaseMonths: 24,
} satisfies NonNullable<TransferTaxInput["winWinRentalHouse"]>;

/** §154① 거주요건이 **실제로 걸리는** 시료 — 취득 당시 조정지역 + 거주 0년. */
const RESIDENCE_BINDS = {
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 0,
} as const;

describe("§155의2 장기저당담보주택 — ① 1주택 거주요건 면제", () => {
  it("OH-13b ① 요건 충족 → 거주 0년이어도 비과세 (보유 2년은 충족 상태)", () => {
    expect(exempt({ ...RESIDENCE_BINDS, longTermMortgageHouse: MORTGAGE_OK })).toBe(true);
    // 음성 짝 — 같은 시료에서 특례 사실만 빼면 과세다(거주요건 미충족).
    expect(exempt(RESIDENCE_BINDS)).toBe(false);
  });

  it("OH-13 ③ 계약기간 만료 **이전** 양도 → ①② 부적용", () => {
    expect(
      exempt({
        ...RESIDENCE_BINDS,
        longTermMortgageHouse: { ...MORTGAGE_OK, transferredBeforeMaturity: true },
      }),
    ).toBe(false);
  });

  it("①1호 60세 — 59세는 불성립, 60세는 성립 (지정값 ±1 동등성)", () => {
    const at = (age: number) =>
      exempt({ ...RESIDENCE_BINDS, longTermMortgageHouse: { ...MORTGAGE_OK, borrowerAgeAtContract: age } });
    expect(at(59)).toBe(false);
    expect(at(60)).toBe(true);
    expect(at(61)).toBe(true);
  });

  it("①2호 계약기간 10년 — 9년은 불성립, 10년은 성립", () => {
    const at = (years: number) =>
      exempt({ ...RESIDENCE_BINDS, longTermMortgageHouse: { ...MORTGAGE_OK, contractYears: years } });
    expect(at(9)).toBe(false);
    expect(at(10)).toBe(true);
  });

  it("①3호 만기 일시상환 조건이 아니면 불성립", () => {
    expect(
      exempt({
        ...RESIDENCE_BINDS,
        longTermMortgageHouse: { ...MORTGAGE_OK, maturityLumpSumRepayment: false },
      }),
    ).toBe(false);
  });

  it("**보유** 2년은 면제되지 않는다 — 면제 대상은 거주기간뿐이다", () => {
    const shortHolding = {
      ...RESIDENCE_BINDS,
      acquisitionDate: D("2023-06-01"), // 양도 2024-06-01 → 보유 1년
      longTermMortgageHouse: MORTGAGE_OK,
    };
    expect(exempt(shortHolding)).toBe(false);
  });

  it("부칙 §11 — 2005년 과세기간 전 양도에는 적용하지 않는다", () => {
    /**
     * 🔴 관측 지점을 **거주요건이 아니라 ② 의제**로 잡는다.
     *    2005년 무렵 양도는 취득일이 2017-08-03(`prePolicyDate`)보다 앞설 수밖에 없고,
     *    그러면 §154① 경과규정이 **거주요건을 이미 면제**해 §155의2①의 면제가 아무것도 바꾸지
     *    못한다(구별력 0 — 실측으로 확인). 반면 ②의 「2주택 → 1주택」 의제는 경과규정과 무관하다.
     */
    const old = {
      householdHousingCount: 2,
      isFirstTransferredInMerge: true,
      acquisitionDate: D("2000-01-01"),
      longTermMortgageHouse: { ...MORTGAGE_OK, contractDate: D("1998-01-01"), parentalCareMerge: true },
    };
    expect(exempt({ ...old, transferDate: D("2004-12-31") })).toBe(false);
    expect(exempt({ ...old, transferDate: D("2005-01-01") })).toBe(true);
  });
});

describe("§155의2② 동거봉양 합가 2주택 — 먼저 양도하는 주택 1주택 의제", () => {
  const MERGE_BASE = {
    householdHousingCount: 2,
    isFirstTransferredInMerge: true,
    // 🔴 2017-08-03(`prePolicyDate`) **이후** 취득이어야 §154① 거주요건이 실제로 걸린다.
    //    그 전 취득이면 경과규정이 거주요건을 면제해 이 절의 단언이 전부 구별력 0이 된다(실측).
    acquisitionDate: D("2018-01-01"),
  } as const;

  it("OH-13c ② 성립 → 2주택이어도 §154① 적용(고가주택 부분과세)", () => {
    const r = run({
      ...MERGE_BASE,
      ...RESIDENCE_BINDS,
      transferPrice: 2_000_000_000,
      longTermMortgageHouse: { ...MORTGAGE_OK, parentalCareMerge: true },
    });
    expect(r.isPartialExempt).toBe(true);
    expect(r.exemptReason).toContain("§155의2 ②");
  });

  it("②는 표2 **대상**에 들어가지만 §159의4의 거주 2년은 **그대로 요구**된다", () => {
    /**
     * 🔴 설계 초안은 「②면 표2」라고 적었지만 **법문이 그렇지 않다**.
     *    §155의2②가 면제하는 것은 「**제154조제1항**을 적용하되 … 거주기간의 제한」뿐이고,
     *    §159의4는 면제 대상 조문에 **없다**(§155의3①과 대조 — 그쪽은 §159의4를 명시 열거한다).
     *    §159의4의 괄호가 §155의2를 포함하는 것은 「**1주택**」 개념에 넣는다는 뜻이지
     *    거주 2년 요건을 면제한다는 뜻이 아니다.
     */
    const over = {
      ...MERGE_BASE,
      transferPrice: 2_000_000_000,
      wasRegulatedAtAcquisition: false,
      longTermMortgageHouse: { ...MORTGAGE_OK, parentalCareMerge: true },
    };
    // 거주 0년 → 표2 대상이어도 거주 요건 미충족이라 표1(6년 × 2% = 12%)
    expect(run({ ...over, residencePeriodMonths: 0 }).longTermHoldingRate).toBeCloseTo(0.12, 5);
    // 긍정 짝 — 거주 2년을 채우면 의제가 표2를 연다(6년 × 4% + 2년 × 4% = 32%)
    expect(run({ ...over, residencePeriodMonths: 24 }).longTermHoldingRate).toBeCloseTo(0.32, 5);
  });

  it("음성 짝 — 합가 선언이 없으면 2주택 과세", () => {
    expect(
      exempt({ ...MERGE_BASE, ...RESIDENCE_BINDS, longTermMortgageHouse: MORTGAGE_OK }),
    ).toBe(false);
  });

  it("음성 짝 — 「먼저 양도하는 주택」이 아니면 의제가 서지 않는다", () => {
    expect(
      exempt({
        ...MERGE_BASE,
        ...RESIDENCE_BINDS,
        isFirstTransferredInMerge: false,
        longTermMortgageHouse: { ...MORTGAGE_OK, parentalCareMerge: true },
      }),
    ).toBe(false);
  });

  it("담보주택이 **아닌** 쪽을 먼저 양도하면 의제만 서고 거주요건은 그대로 본다", () => {
    const notMortgaged = { ...MORTGAGE_OK, parentalCareMerge: true, isTransferredHouseMortgaged: false };
    // 거주요건이 걸리는 시료 → 면제가 없으므로 과세
    expect(exempt({ ...MERGE_BASE, ...RESIDENCE_BINDS, longTermMortgageHouse: notMortgaged })).toBe(false);
    // 긍정 짝 — 거주요건 자체가 없는 시료(취득 당시 비조정)에서는 의제가 서서 비과세다
    expect(
      exempt({ ...MERGE_BASE, wasRegulatedAtAcquisition: false, longTermMortgageHouse: notMortgaged }),
    ).toBe(true);
  });

  it("③ 만기 전 양도는 ②도 막는다", () => {
    expect(
      exempt({
        ...MERGE_BASE,
        ...RESIDENCE_BINDS,
        longTermMortgageHouse: {
          ...MORTGAGE_OK,
          parentalCareMerge: true,
          transferredBeforeMaturity: true,
        },
      }),
    ).toBe(false);
  });
});

describe("§155의2 — 면제가 **다른 경로로 새지 않는다** (경로 한정 확인)", () => {
  /**
   * 🔴 §155의2①은 「국내에 **1주택**을 소유한 1세대」, ②는 「**동거봉양** 합가」로 경로가 한정돼
   *    있다. 거주요건 면제를 공통 술어에 넣으면 아래 경로들에도 새는데, 그 세대에는 면제할
   *    **법 근거가 없다**(법 근거 없는 유리 적용 — `feedback_no_unfavorable_application_without_legal_basis`의
   *    반대 방향이지만 같은 원칙이다). 세 경로를 음성 짝으로 고정한다.
   */
  it("§155① 일시적 2주택에는 §155의2 거주면제가 붙지 않는다", () => {
    const temp = {
      ...RESIDENCE_BINDS,
      householdHousingCount: 2,
      acquisitionDate: D("2018-01-01"),
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2018-01-01"),
        newAcquisitionDate: D("2022-06-01"),
      },
    } as const;
    // 긍정 짝 — 거주요건이 없는 시료에서는 §155①이 비과세를 낸다(분기 자체는 살아 있다).
    expect(exempt({ ...temp, wasRegulatedAtAcquisition: false })).toBe(true);
    // 음성 짝 — 거주요건이 걸리면 장기저당담보 사실이 있어도 과세다.
    expect(exempt({ ...temp, longTermMortgageHouse: MORTGAGE_OK })).toBe(false);
  });

  it("§155⑤ 혼인 합가에도 §155의2 거주면제가 붙지 않는다 (②는 동거봉양 한정)", () => {
    const merge = {
      ...RESIDENCE_BINDS,
      householdHousingCount: 2,
      isFirstTransferredInMerge: true,
      acquisitionDate: D("2018-01-01"),
      marriageMerge: { marriageDate: D("2020-01-01") },
    } as const;
    expect(exempt({ ...merge, wasRegulatedAtAcquisition: false })).toBe(true);
    expect(exempt({ ...merge, longTermMortgageHouse: MORTGAGE_OK })).toBe(false);
  });

  it("3주택 세대에는 애초에 도달하지 않는다", () => {
    expect(
      exempt({ ...RESIDENCE_BINDS, householdHousingCount: 3, longTermMortgageHouse: MORTGAGE_OK }),
    ).toBe(false);
  });
});

describe("§155의3 상생임대주택 — 거주요건 면제 (의제 아님)", () => {
  it("OH-12 성립 → 조정지역 취득·거주 0년이어도 §154① 비과세", () => {
    expect(exempt({ ...RESIDENCE_BINDS, winWinRentalHouse: WIN_WIN_OK })).toBe(true);
    expect(exempt(RESIDENCE_BINDS)).toBe(false);
  });

  it("OH-11 ①2호 직전임대차 **1년 6개월** — 17개월 불성립 / 18개월 성립", () => {
    const at = (m: number) =>
      exempt({ ...RESIDENCE_BINDS, winWinRentalHouse: { ...WIN_WIN_OK, priorLeaseMonths: m } });
    expect(at(17)).toBe(false);
    expect(at(18)).toBe(true);
  });

  it("①3호 상생임대차 **2년** — 23개월 불성립 / 24개월 성립", () => {
    const at = (m: number) =>
      exempt({ ...RESIDENCE_BINDS, winWinRentalHouse: { ...WIN_WIN_OK, winWinLeaseMonths: m } });
    expect(at(23)).toBe(false);
    expect(at(24)).toBe(true);
  });

  it("①1호 증가율 「100분의 5」 — 5%는 성립, 5.1%는 불성립", () => {
    const at = (pct: number) =>
      exempt({ ...RESIDENCE_BINDS, winWinRentalHouse: { ...WIN_WIN_OK, increaseRatePct: pct } });
    expect(at(5)).toBe(true);
    expect(at(5.1)).toBe(false);
  });

  it("①1호 계약 체결 기간 2021-12-20 ~ 2026-12-31 (양 끝 ±1일)", () => {
    const at = (d: string) =>
      exempt({ ...RESIDENCE_BINDS, winWinRentalHouse: { ...WIN_WIN_OK, winWinContractDate: D(d) } });
    expect(at("2021-12-19")).toBe(false);
    expect(at("2021-12-20")).toBe(true);
    expect(at("2026-12-31")).toBe(true);
    expect(at("2027-01-01")).toBe(false);
  });

  it("**보유** 2년은 면제되지 않는다", () => {
    expect(
      exempt({
        ...RESIDENCE_BINDS,
        acquisitionDate: D("2023-06-01"), // 보유 1년
        winWinRentalHouse: WIN_WIN_OK,
      }),
    ).toBe(false);
  });

  it("OH-12 §159의4 — 거주 2년 미달이어도 장특 **표2**를 적용한다", () => {
    // 취득 당시 비조정이라 §154① 거주요건은 애초에 없다 → 갈리는 것은 표2 게이트뿐이다.
    const base = {
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      transferPrice: 2_000_000_000, // 고가주택 — 과세분이 남아야 공제율이 보인다
      acquisitionDate: D("2014-06-01"), // 보유 10년
    } as const;
    const without = run(base);
    const withWinWin = run({ ...base, winWinRentalHouse: WIN_WIN_OK });
    expect(without.longTermHoldingRate).toBeCloseTo(0.18, 5); // 표1 — 보유 9년 × 2%
    expect(withWinWin.longTermHoldingRate).toBeCloseTo(0.36, 5); // 표2 보유분 — 9년 × 4%
    expect(withWinWin.totalTax).toBeLessThan(without.totalTax);
  });

  it("OH-12b **중과 배제 근거가 켜지지 않는다** — 의제가 아니다", () => {
    // §167의10①15호는 「제155조 또는 조세특례제한법」만 인정한다. 상생임대는 주택 수를 줄이지
    // 않으므로 2주택 세대는 그대로 2주택이고, 비과세도 서지 않는다.
    expect(exempt({ householdHousingCount: 2, winWinRentalHouse: WIN_WIN_OK })).toBe(false);
  });
});

describe("§155의3 — §155⑳1호 거주요건 면제 (법문이 명시한 세 번째 대상)", () => {
  /** 장기임대주택 1호 + 거주주택 양도(시나리오 A). 거주주택 거주 0년이라 ⑳1호가 걸린다. */
  const RENTAL_BASE: Partial<TransferTaxInput> = {
    householdHousingCount: 1, // 임대주택 제외 전제(현행 A 시나리오 관례)
    residencePeriodMonths: 0,
    wasRegulatedAtAcquisition: true, // §154① 거주요건도 걸어 두어 특례 경로로 흐르게 한다
    rentalHousingException: {
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          businessRegistrationDate: D("2018-06-01"),
          rentalRegistrationDate: D("2018-06-01"),
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          isApartment: false,
          region: "non-metro",
          isExcluded918Rule: false,
          standardPriceAtRentalStart: 250_000_000,
          hasMinimum2Units: false,
          rentalMonths: 96,
          rentalAutoTermination: false,
          requirementsConfirmed: true,
        },
      ],
    },
  };

  it("거주주택이 상생임대주택이면 §155⑳1호 **거주 2년 요건이 면제**된다", () => {
    const without = run(RENTAL_BASE);
    const withWinWin = run({ ...RENTAL_BASE, winWinRentalHouse: WIN_WIN_OK });
    // 음성 짝 — 면제가 없으면 「거주주택 거주기간 2년 미충족」으로 특례가 적용되지 않는다.
    expect(JSON.stringify(without.steps ?? [])).toContain("거주기간 2년 미충족");
    expect(JSON.stringify(withWinWin.steps ?? [])).not.toContain("거주기간 2년 미충족");
  });
});
