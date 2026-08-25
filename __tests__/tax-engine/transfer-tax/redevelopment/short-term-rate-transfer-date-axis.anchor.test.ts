/**
 * anchor A6 — 결함 `S1-01` (critical): 단기·분양권 세율에 **양도일 축이 없다**.
 *
 * ── 결함 위치 ────────────────────────────────────────────────────────────
 * `lib/tax-engine/transfer-tax-rate-calc.ts:424·428·434·439` (`shortTermFlatRate`)
 * 가 `input.transferDate`를 **한 번도 읽지 않는다**. 그래서 분양권은 양도일이
 * 언제든 「1년 미만 70% / 1~2년 60% / 2년 이상 60%」가 적용된다.
 * 그러나 이 세 값은 전부 **2021-06-01 시행분**이다.
 *
 * ── 근거 조문 (법제처 DRF `target=eflaw&LM=소득세법&efYd=…` 원문 대조, 2026-08-25) ──
 * ① 시행 2021-01-01 본(= 2021-05-31까지 적용) **소득세법(법률) §104①**:
 *   1호 「제94조제1항제1호ㆍ제2호 및 제4호에 따른 자산　**제55조제1항에 따른 세율**」
 *        ← 분양권 괄호 **없음**
 *   2호 「…자산[**주택**(…) **및 조합원입주권은 제외한다**]으로서 그 보유기간이
 *        1년 이상 2년 미만인 것　양도소득 과세표준의 100분의 40」
 *   3호 「…그 보유기간이 1년 미만인 것　양도소득 과세표준의 100분의 50
 *        (주택 및 조합원 입주권의 경우에는 **100분의 40**)」
 *   4호 「제94조제1항제2호에 따른 자산 중 「주택법」 제63조의2제1항제1호에 따른
 *        **조정대상지역** 내 주택의 입주자로 선정된 지위(조합원입주권은 제외한다).
 *        다만, … 1세대가 보유하고 있는 주택이 없는 경우로서 대통령령으로 정하는
 *        경우는 제외한다.　양도소득 과세표준의 **100분의 50**」
 *        ← 이 호는 `RateClause` union에도 lib/ 어디에도 없다(`grep "104-1-4"` 0건).
 *
 * ② 시행 2021-06-01 본 **소득세법(법률) §104①**: 1호에 「(분양권의 경우에는 …100분의 60)」
 *   신설, 2호 60%, 3호 70%, **4호 삭제**. (같은 개정으로 §104⑦ 가산율 10/20 → 20/30.)
 *
 * ③ 경계·축의 근거 — **법률 제17477호(2020-08-18 공포) 부칙**:
 *   제1조(시행일) 「…다만, 제104조제1항제1호부터 제4호까지 및 같은 조 제7항 각 호 외의
 *     부분의 개정규정은 **2021년 6월 1일부터 시행**한다.」
 *   제3조(양도소득세의 세율에 관한 적용례) 「제104조제1항제1호부터 제4호까지 … 개정규정은
 *     **2021년 6월 1일 이후 양도하는 분부터** 적용한다.」
 *   ⇒ 축은 **양도일**이고 경계는 **2021-06-01**이다(취득일이 아니다).
 *
 * ── 대조 근거 (같은 저장소가 이미 양도일 축을 걸고 있다) ──────────────────
 * §104⑦ 가산율은 `resolveSurchargeAddonRate(input.transferDate, …)`로 양도일 축을 타고
 * (`data/multi-house-surcharge-rate-history.ts` — 근거가 **바로 같은 2021.6.1 개정**이다),
 * 누진표도 `loadFallbackTransferRates(targetDate)`로 양도일 축을 탄다.
 * **단기·분양권 세율만 축이 빠졌다.**
 *
 * ── 입력 사실관계 (A-1·A-2·A-3 공통) ─────────────────────────────────────
 * 분양권(`propertyType: "presale_right"`) · 2015-01-01 취득 · **비조정대상지역**
 * · 양도가 800,000,000 · 취득가 500,000,000 · 필요경비 0
 * ⇒ 양도차익 300,000,000 · LTHD 부적용(§95② 대상 자산 아님) · 기본공제 2,500,000
 * ⇒ **과세표준 297,500,000** (세 시점 모두 동일 — 아래에서 함께 단언한다)
 *
 * 적용 호 판정(2021-06-01 前):
 *   2호·3호 → 보유 5년이므로 미해당 / 4호 → **비조정대상지역**이므로 미해당
 *   ⇒ 남는 것은 **1호 = §55① 누진세율**뿐이다.
 *
 * ── 현행 실측값 (2026-08-25, 이 worktree) ────────────────────────────────
 *   2020-06-01 · 2021-05-31 · 2021-06-01 **셋 다 동일**:
 *     appliedRate 0.6 · progressiveDeduction 0 · 산출세액 178,500,000
 *     · 지방소득세 17,850,000 · 총세액 196,350,000
 *     · shortTermNote "분양권 60% 세율(소득세법 §104①1호)"
 *
 * ── 기대값 (법령상 옳은 값) ──────────────────────────────────────────────
 *   2020-06-01 / 2021-05-31 양도 → §104①1호 = §55① 누진.
 *   과세표준 297,500,000 은 「1.5억 초과 3억 이하」 구간(세율 38% · 누진공제 19,400,000)
 *   ⇒ 297,500,000 × 0.38 − 19,400,000 = **93,650,000**
 *   (누진표는 **하드코딩하지 않는다** — `loadFallbackTransferRates(양도일)`이 돌려준
 *    그 시점 표에서 구간을 읽어 기대값을 재계산하고, 그 결과가 93,650,000 임을 함께 단언한다.)
 *   2021-06-01 양도 → 현행 60% 그대로(회귀 방어).
 *
 * 🔴 **이 anchor는 수정 전 실패한다.** A-1·A-2가 178,500,000 을 받는다.
 *    A-3(2021-06-01)만 현행에서도 통과한다.
 *
 * ⚠️ **파급 — 이 결함은 주택·조합원입주권도 지배한다** (같은 `shortTermFlatRate` 식):
 *    2021-06-01 前 §104①3호는 주택·조합원입주권 1년 미만을 **40%** 로 정했는데 현행 코드는
 *    70% 를 적용하고, 2호는 주택·조합원입주권을 **제외**해 1~2년 보유는 1호(누진)인데
 *    현행 코드는 60% 를 적용한다. 또 §104①4호(조정대상지역 분양권 50%)는 **미구현**이다.
 *    이번 배치 범위는 **분양권**이므로 아래 `it.todo` 로 표시만 남긴다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../../_helpers/mock-rates";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

/** 사실관계는 고정하고 **양도일만** 바꾼다 — 축이 양도일임을 이 팩토리가 드러낸다. */
function presaleRightInput(transferDate: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "presale_right",
    transferPrice: 800_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2015-01-01"), // 보유 5년 — 2호·3호(단기) 미해당
    transferDate: new Date(transferDate),
    expenses: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false, // 비조정대상지역 — 구법 §104①4호(50%) 미해당
    wasRegulatedAtAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
  });
}

type Bracket = { min: number; max?: number; rate: number; deduction: number };

/**
 * 그 시점 §55① 누진표에서 과세표준이 속한 구간을 읽어 산출세액을 재계산한다.
 * (누진표 하드코딩 금지 — 단일 소스는 `transfer-rate-seed{,-historical}.ts` 이다.)
 */
function progressiveTaxAt(transferDate: string, taxBase: number) {
  const rates = loadFallbackTransferRates(new Date(transferDate));
  const rec = rates.get("transfer:progressive_rate:_default") as unknown as {
    rateTable?: { brackets?: Bracket[] };
  };
  const brackets = rec?.rateTable?.brackets ?? [];
  const b = brackets.find((x) => taxBase >= x.min && (x.max === undefined || taxBase <= x.max));
  if (!b) throw new Error(`구간 미발견: ${transferDate} / ${taxBase}`);
  return { rate: b.rate, deduction: b.deduction, tax: Math.floor(taxBase * b.rate) - b.deduction };
}

const TAX_BASE = 297_500_000;

describe("A6 / S1-01 — 분양권 세율은 양도일 축을 타야 한다 (소득세법 §104①, 법률 제17477호 부칙 §3)", () => {
  describe.each([
    ["2020-06-01"], // 구법 구간 한가운데
    ["2021-05-31"], // 🔒 경계 직전 — 여기까지가 구법이다
  ])("2021-06-01 前 양도 (%s)", (transferDate) => {
    const result = calculateTransferTax(
      presaleRightInput(transferDate),
      loadFallbackTransferRates(new Date(transferDate)),
    );
    const expected = progressiveTaxAt(transferDate, TAX_BASE);

    it("A-1: 과세표준은 297,500,000 이다 (LTHD 부적용 + 기본공제 250만)", () => {
      expect(result.taxBase).toBe(TAX_BASE);
    });

    it("A-2: §104①1호 = §55① 누진세율이 적용된다 (현행: 60% 단일세율 — 실패)", () => {
      // 현행 실측: appliedRate 0.6 · progressiveDeduction 0
      expect(result.appliedRate).toBe(expected.rate);
      expect(result.progressiveDeduction).toBe(expected.deduction);
    });

    it("A-3: 산출세액 = 93,650,000 (현행: 178,500,000 — 실패)", () => {
      // 그 시점 누진표에서 재계산한 값과 법령상 기대값이 서로 일치하는지 먼저 고정한다.
      expect(expected.tax).toBe(93_650_000);
      expect(result.calculatedTax).toBe(93_650_000);
    });
  });

  describe("2021-06-01 이후 양도 (회귀 방어 — 현행에서도 통과해야 한다)", () => {
    const result = calculateTransferTax(
      presaleRightInput("2021-06-01"),
      loadFallbackTransferRates(new Date("2021-06-01")),
    );

    it("A-4: 경계 당일부터 §104①1호 괄호(분양권 60%)가 적용된다", () => {
      expect(result.taxBase).toBe(TAX_BASE);
      expect(result.appliedRate).toBe(0.6);
      expect(result.calculatedTax).toBe(178_500_000);
    });
  });

  it("A-5: 경계 전후 1일의 산출세액이 서로 달라야 한다 (경계 고정)", () => {
    const before = calculateTransferTax(
      presaleRightInput("2021-05-31"),
      loadFallbackTransferRates(new Date("2021-05-31")),
    ).calculatedTax;
    const onOrAfter = calculateTransferTax(
      presaleRightInput("2021-06-01"),
      loadFallbackTransferRates(new Date("2021-06-01")),
    ).calculatedTax;
    // 현행: 둘 다 178,500,000 (양도일을 안 읽으므로 구별력 0)
    expect(before).not.toBe(onOrAfter);
    expect(before).toBe(93_650_000);
    expect(onOrAfter).toBe(178_500_000);
  });

  // ── 범위 밖(별건) — 같은 `shortTermFlatRate` 식이 지배하는 파급 ──────────
  it.todo(
    "주택·조합원입주권: 2021-06-01 前 §104①3호는 1년 미만 40%(현행 70%) — 별건",
  );
  it.todo(
    "주택·조합원입주권: 2021-06-01 前 §104①2호는 주택·입주권을 제외 ⇒ 1~2년 보유는 1호 누진(현행 60%) — 별건",
  );
  it.todo(
    "조정대상지역 분양권: 2021-06-01 前 §104①4호 50% 미구현 (RateClause에 `104-1-4` 없음) — 별건",
  );
});
