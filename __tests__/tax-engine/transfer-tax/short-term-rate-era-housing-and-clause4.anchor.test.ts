/**
 * S1-01 후속 anchor — 단기세율 양도일 축의 **주택·조합원입주권 축**과 **§104①4호 축**.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * `short-term-rate-transfer-date-axis.anchor.test.ts`(A6)는 **분양권**만 고정한다.
 * 그런데 양도일 축을 도입한 `resolveShortTermRate`(`data/short-term-rate-history.ts`)는
 * **같은 식이 지배하던 주택·조합원입주권**과, 2018-01-01 신설되고 2020-08-18 삭제된
 * **§104①4호(조정대상지역 주택분양권 50%)** 까지 함께 바꾼다.
 *
 * 🔴 그 두 축을 보는 테스트가 전 스위트에 **0건**이었다(전건 16,568 통과 = 회귀 0이지만,
 *    회귀 0은 「안전하다」가 아니라 「아무도 안 본다」는 뜻이기도 하다).
 *    ⇒ 여기서 고정한다.
 *
 * ── 근거 조문 (법제처 DRF `target=eflaw` + `MST` + `efYd` 실독, 2026-08-25) ──
 *
 * **2021-06-01 前** (예: 2020-01-01 시행본 MST 212777 · 법률 제16834호)
 *   · §104①1호 = 「제94조제1항제1호ㆍ제2호 및 제4호에 따른 자산　**제55조제1항에 따른 세율**」
 *                — 분양권 괄호 **없음**
 *   · §104①2호 = 「…자산[**주택**(…딸린 토지 포함) **및 조합원입주권은 제외한다**]으로서
 *                 보유기간이 1년 이상 2년 미만인 것　양도소득 과세표준의 100분의 40」
 *                ⇒ **주택·입주권은 2호에서 빠져 1호(누진)** 로 간다
 *   · §104①3호 = 「…보유기간이 1년 미만인 것　100분의 50(**주택 및 조합원 입주권의 경우에는
 *                 100분의 40**)」
 *   · §104①4호 = 「제94조제1항제2호에 따른 자산 중 「주택법」 제63조의2제1항제1호에 따른
 *                 **조정대상지역** 내 **주택의 입주자로 선정된 지위**(조합원입주권은 제외한다).
 *                 다만, … **1세대가 보유하고 있는 주택이 없는 경우로서 대통령령으로 정하는
 *                 경우는 제외**한다.　양도소득 과세표준의 100분의 50」
 *
 * **2021-06-01 이후** (MST 224801 · 법률 제17757호 — 법률 제17477호 개정규정 시행)
 *   · 1호에 「(분양권의 경우에는 …100분의 60)」 괄호 신설
 *   · 2호 = 40%[주택, 조합원입주권 **및 분양권**의 경우에는 100분의 60]
 *   · 3호 = 50%(주택, 조합원입주권 **및 분양권**의 경우에는 100분의 70)
 *   · 4호 = **삭제**\<2020.8.18\>
 *
 * ⚠️ MST만으로 조회하면 그 MST의 **최신 시행일** 본문이 나온다 — 2021-01-01 시행본을 보려면
 *    `efYd=20210101`을 함께 넘겨야 하고, 그 본문에는 분양권 60% 문언이 **없다**.
 *    (경계를 2021-01-01로 오독하기 딱 좋은 함정이라 기록해 둔다.)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../_helpers/mock-rates";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

/** 보유기간을 월 단위로 맞추기 위한 취득일 산출 — 양도일에서 개월 수만큼 뺀다. */
function acqDateFor(transferDate: string, monthsHeld: number): Date {
  const d = new Date(transferDate);
  d.setUTCMonth(d.getUTCMonth() - monthsHeld);
  return d;
}

function runHousing(transferDate: string, monthsHeld: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: acqDateFor(transferDate, monthsHeld),
    transferDate: new Date(transferDate),
    expenses: 0,
    useEstimatedAcquisition: false,
    // 비과세·중과 축을 끈다 — 이 anchor 가 보는 것은 §104① 세율 축뿐이다.
    isOneHousehold: false,
    householdHousingCount: 2,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
  });
}

const calc = (input: TransferTaxInput) =>
  calculateTransferTax(input, loadFallbackTransferRates(input.transferDate));

describe("S1-01 후속 A — 주택 단기세율의 양도일 축 (§104①2호·3호 괄호)", () => {
  describe("2021-06-01 前 양도 (2020-06-01)", () => {
    it("A-1: 보유 1년 미만 주택은 **40%** 다 (§104①3호 괄호 — 현행 70% 가 아니다)", () => {
      const r = calc(runHousing("2020-06-01", 6));
      expect(r.appliedRate).toBe(0.4);
    });

    it("A-2: 보유 1~2년 주택은 **누진**이다 (§104①2호가 주택을 제외 ⇒ 1호)", () => {
      const r = calc(runHousing("2020-06-01", 18));
      // 단일세율 60% 가 아니라 §55① 누진 구간세율이 적용된다.
      expect(r.appliedRate).not.toBe(0.6);
      expect(r.progressiveDeduction).toBeGreaterThan(0);
    });
  });

  describe("2021-06-01 이후 양도 (현행 유지 — 회귀 방어)", () => {
    it("A-3: 보유 1년 미만 주택은 70% 다 (§104①3호 괄호 현행)", () => {
      const r = calc(runHousing("2021-06-01", 6));
      expect(r.appliedRate).toBe(0.7);
    });

    it("A-4: 보유 1~2년 주택은 60% 다 (§104①2호 괄호 현행)", () => {
      const r = calc(runHousing("2021-06-01", 18));
      expect(r.appliedRate).toBe(0.6);
    });
  });

  it("A-5: 경계 전후 1일이 서로 다르다 (보유 1년 미만 주택 — 40% ↔ 70%)", () => {
    expect(calc(runHousing("2021-05-31", 6)).appliedRate).toBe(0.4);
    expect(calc(runHousing("2021-06-01", 6)).appliedRate).toBe(0.7);
  });
});

describe("S1-01 후속 B — §104①4호 조정대상지역 주택분양권 50% (2018-01-01 신설 ~ 2020-08-18 삭제)", () => {
  function presale(transferDate: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "presale_right",
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: acqDateFor(transferDate, 60), // 보유 5년 — 2·3호(단기) 미해당
      transferDate: new Date(transferDate),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2, // 무주택 단서 미해당
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      ...over,
    });
  }

  it("B-1: 조정대상지역 분양권(보유 2년 이상)은 **50%** 다 — §104①4호", () => {
    expect(calc(presale("2020-06-01")).appliedRate).toBe(0.5);
  });

  /**
   * 별건 5(2026-10-06) — 단서는 무주택 **하나만으로** 서지 않는다. 시행령 §167의6은
   * ① 무주택 ② 1호(다른 분양권 미보유) ③ 2호(30세 이상 또는 배우자)를 **모두** 요구한다
   * (KoreanLaw DRF efYd=20180213 실독). 종전 B-2는 무주택 하나만으로 4호를 배제했다 — 과소과세.
   */
  it("B-2a: 무주택만으로는 4호를 배제하지 못한다(영 §167의6 1·2호 미확인) — 여전히 50%", () => {
    const r = calc(presale("2020-06-01", { householdHousingCount: 0 }));
    expect(r.appliedRate).toBe(0.5);
  });

  it("B-2b: 무주택 + 영 §167의6 1·2호가 모두 확인되면 4호가 배제되어 1호 누진이다", () => {
    const r = calc(
      presale("2020-06-01", {
        householdHousingCount: 0,
        presaleRightNoOtherRight: true,
        presaleRightAgeOrSpouseMet: true,
      }),
    );
    expect(r.appliedRate).not.toBe(0.5);
    expect(r.progressiveDeduction).toBeGreaterThan(0);
  });

  it("B-2c: 영 §167의6 요건 중 하나만 확인되면 4호가 그대로 적용된다(모름 = 혜택 불성립)", () => {
    const r = calc(
      presale("2020-06-01", {
        householdHousingCount: 0,
        presaleRightNoOtherRight: true,
        // presaleRightAgeOrSpouseMet 미확인
      }),
    );
    expect(r.appliedRate).toBe(0.5);
  });

  /**
   * 영 §167의6 자체의 존재 구간은 법 §104①4호(2018.1.1~2021.5.31)보다 43일 좁다 —
   * 2018.1.1~2018.2.12는 이 조가 "삭제" 상태였다(KoreanLaw DRF efYd 실독, 2026-10-06).
   * 그 구간에는 세 요건을 전부 확인해도 받을 내용이 없어 단서가 성립할 수 없다.
   */
  it("B-2d: 영 §167의6 시행 전(2018.1.1~2018.2.12)은 요건을 다 확인해도 단서가 성립하지 않는다", () => {
    const r = calc(
      presale("2018-02-01", {
        householdHousingCount: 0,
        presaleRightNoOtherRight: true,
        presaleRightAgeOrSpouseMet: true,
      }),
    );
    expect(r.appliedRate).toBe(0.5);
  });

  it("B-2e: 영 §167의6 시행일(2018.2.13) 당일부터는 세 요건 확인 시 단서가 성립한다", () => {
    const r = calc(
      presale("2018-02-13", {
        householdHousingCount: 0,
        presaleRightNoOtherRight: true,
        presaleRightAgeOrSpouseMet: true,
      }),
    );
    expect(r.appliedRate).not.toBe(0.5);
    expect(r.progressiveDeduction).toBeGreaterThan(0);
  });

  it("B-3: 비조정대상지역이면 4호 미해당 ⇒ 1호 누진 (A6 anchor 와 동일 결론)", () => {
    const r = calc(presale("2020-06-01", { isRegulatedArea: false, wasRegulatedAtAcquisition: false }));
    expect(r.appliedRate).not.toBe(0.5);
    expect(r.progressiveDeduction).toBeGreaterThan(0);
  });

  it("B-4: 4호 신설 前(2017-12-31 양도)에는 조정대상지역이어도 1호 누진이다", () => {
    const r = calc(presale("2017-12-31"));
    expect(r.appliedRate).not.toBe(0.5);
    expect(r.progressiveDeduction).toBeGreaterThan(0);
  });

  it("B-5: 4호 삭제 後(2021-06-01 양도)에는 조정대상지역이어도 **1호 괄호 60%** 다", () => {
    expect(calc(presale("2021-06-01")).appliedRate).toBe(0.6);
  });

  /**
   * §104① 후단(각 호 외 부분) — 「하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에 해당할
   * 때에는 …산출세액 중 큰 것」. 4호(50%, 보유기간 무관)는 1~2호(보유기간별)와 **동시에
   * 해당**할 수 있다. 종전 `resolveShortTermRate`는 1년 미만·1~2년 구간에서 이 비교 없이
   * 바로 반환해, 보유 1~2년 분양권이 2호(40%)로 **과소과세**됐다(2026-10-06 수정).
   */
  function presaleHeld(transferDate: string, monthsHeld: number, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "presale_right",
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: acqDateFor(transferDate, monthsHeld),
      transferDate: new Date(transferDate),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      ...over,
    });
  }

  it("C-1: 보유 1~2년 분양권은 2호(40%)가 아니라 **4호(50%)**가 더 크다 — 종전 결함", () => {
    const r = calc(presaleHeld("2020-06-01", 18));
    expect(r.appliedRate).toBe(0.5);
  });

  it("C-2: 보유 1년 미만 분양권은 3호(50%)와 4호(50%)가 동률 — 기존 3호 라벨을 유지한다", () => {
    const r = calc(presaleHeld("2020-06-01", 6));
    expect(r.appliedRate).toBe(0.5);
    expect(r.rateClause).toBe("104-1-3");
  });

  it("C-3: 단서(영 §167의6)가 성립하면 4호가 빠지고 보유기간별 특례세율(2호 40%)만 남는다", () => {
    const r = calc(
      presaleHeld("2020-06-01", 18, {
        householdHousingCount: 0,
        presaleRightNoOtherRight: true,
        presaleRightAgeOrSpouseMet: true,
      }),
    );
    expect(r.appliedRate).toBe(0.4);
  });
});
