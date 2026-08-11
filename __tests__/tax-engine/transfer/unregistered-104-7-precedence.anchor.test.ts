/**
 * anchor(현행 고정): **미등기 70%(§104①10호) ↔ 조정지역 다주택 중과(§104⑦)의 우열**
 *
 * 계획서: `docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md` §7 C-6b 주
 *
 * ── 이 파일은 「고쳤다」가 아니라 「현행이 옳다고 볼 근거」를 고정한다 ──────────
 *
 * `calcTax` T-1(`transfer-tax-rate-calc.ts:195`)은 미등기면 **어떤 비교도 없이 70%로 조기 반환**한다.
 * 그런데 §104⑦ 중과는 §55① 최고 45% + 30%p = **최고 75%**라 70%를 넘을 수 있다.
 * 조기 반환이 과소 계산인가?
 *
 * ## 문언 실측 (2026-08-11 · 소득세법 §104 전문)
 *
 * 후단(비교) 규정은 **셋** 있고, 어느 것도 10호를 비교 대상에 넣지 않는다:
 *
 * | 조항 | 후단 문언 | 비교 대상 |
 * |---|---|---|
 * | **§104① 후단** | 「하나의 자산이 **다음 각 호**에 따른 세율 중 둘 이상에 해당할 때 … 큰 것」 | **①항 각 호끼리** — ⑦항 세율은 「각 호」가 아니다 |
 * | **§104④ 후단** | 「… 산출세액과 **제1항제2호 또는 제3호**의 세율 … 중 큰 세액」 | **2·3호 한정 열거** |
 * | **§104⑦ 후단** | 「… 산출세액과 **제1항제2호 또는 제3호**의 세율 … 중 큰 세액」 | **2·3호 한정 열거** |
 *
 * ⇒ 입법자는 항-외 세율(④·⑦)을 ①항 호와 비교시킬 때 **어느 호와 비교할지 명시 지정**하는 방식을
 *   택했고, **두 번 다 2·3호만** 넣었다. 10호는 두 열거 어디에도 없다.
 *   §104① 후단도 「다음 각 호」라 ⑦항 세율을 포섭하지 않는다.
 *
 * 보강: §104⑦의 세율은 「**제55조제1항에 따른 세율**에 100분의 20(3·4호는 30)을 더한 세율」인데,
 * 미등기양도자산에는 §55①이 아니라 §104①10호 70% 단일세율이 적용되므로 가산의 **base가 없다**.
 * (⑦ 후단이 2·3호 단일세율과의 비교를 규정한 것은 반대 정황이나, 그 열거에 10호는 없다.)
 *
 * ⇒ **문언은 현행 구현(70% 조기 반환)을 지지한다.** 「명문이 없어 미판정」이 아니라
 *   **10호를 열거에서 뺀 명문이 있다**. 바꾸면 세액이 **오르는** 방향이라
 *   ([[feedback_unverified_authority_blocks_tax_change]]) 더더욱 근거 없이 움직이지 않는다.
 *
 * 📌 이 파일이 빨개지면 누군가 위 문언 분석을 뒤집는 근거(예규·판례)를 얻은 것이다.
 *   그 근거를 계획서에 적고 anchor를 정정본으로 교체하라. 값만 맞추지 말 것.
 */
import { describe, it, expect } from "vitest";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const mockRates = makeMockRates();
const parsedRates = parseRatesFromMap(mockRates);
const D = (s: string) => new Date(s);

/**
 * 조정지역 3주택 · 보유 11년(단기 아님) · 양도 2026-06-01.
 *
 * ⚠️ 양도일이 **2026-05-10 이후**여야 한다 — 중과 한시 유예가 `suspended_until: "2026-05-09"`라
 *   그 이전 양도분은 ⑦ 자체가 발동하지 않아 쟁점이 성립하지 않는다(B-4가 대조군).
 */
const regulatedMultiHouse = {
  propertyType: "housing" as const,
  transferDate: D("2026-06-01"),
  acquisitionDate: D("2015-01-01"),
  transferPrice: 3_000_000_000,
  acquisitionPrice: 1_000_000_000,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 3,
  isRegulatedArea: true,
};

const unregisteredSame = { ...regulatedMultiHouse, isUnregistered: true };

/** 두 세율이 정확히 같아지는 과세표준 — 0.45T − 65,940,000 + 0.3T = 0.7T ⇒ T = 1,318,800,000 */
const CROSSOVER_TAX_BASE = 1_318_800_000;

describe("§104①10호(미등기 70%) × §104⑦(다주택 중과) 우열 — 현행 고정", () => {
  it("B-1: 미등기가 켜지면 ⑦이 더 커도 **70%가 그대로 적용**된다", () => {
    const taxBase = 2_000_000_000;

    const unreg = calcTax(
      taxBase,
      parsedRates,
      baseTransferInput(unregisteredSame) as TransferTaxInput,
    );
    expect(unreg.appliedRate).toBe(0.7);
    expect(unreg.calculatedTax).toBe(1_400_000_000); // 20억 × 70%

    // 같은 자산이 등기돼 있었다면 ⑦3호 중과가 붙어 **더 컸다**.
    const surcharged = calcTax(
      taxBase,
      parsedRates,
      baseTransferInput(regulatedMultiHouse) as TransferTaxInput,
    );
    expect(surcharged.surchargeType).toBe("multi_house_3plus");
    expect(surcharged.appliedRate).toBe(0.75); // §55① 45% + 30%p
    // 누진 834,060,000(= 45% − 65,940,000) + 가산 600,000,000
    expect(surcharged.calculatedTax).toBe(1_434_060_000);

    // 미수행분 = 34,060,000. 이 숫자가 쟁점의 크기다(§104① 후단 건의 33,935,000과 대응).
    expect(surcharged.calculatedTax - unreg.calculatedTax).toBe(34_060_000);
  });

  it("B-2: 구조 — 미등기의 「해당 호」에 **⑦ 호가 없다**", () => {
    // `candidateClauses`는 §104⑤2호 버킷 키의 정본이다. 여기에 "104-7-3"이 들어가면
    // 다건 묶음이 재편되어 **세액이 함께 움직인다**(집합 일치 요구).
    // ⇒ 우열 판단은 단건 세율만의 문제가 아니다.
    const unreg = calcTax(
      2_000_000_000,
      parsedRates,
      baseTransferInput(unregisteredSame) as TransferTaxInput,
    );
    expect(unreg.candidateClauses).toEqual(["104-1-10"]);
    expect(unreg.candidateClauses).not.toContain("104-7-3");
    expect(unreg.rateClause).toBe("104-1-10");

    // 대조군 — 등기 자산은 ⑦ 호를 싣는다(위 부정 단언이 다른 이유로 통과하지 않게 고정).
    const surcharged = calcTax(
      2_000_000_000,
      parsedRates,
      baseTransferInput(regulatedMultiHouse) as TransferTaxInput,
    );
    expect(surcharged.candidateClauses).toContain("104-7-3");
  });

  it("B-3: 과세표준 13.188억이 분기점 — 그 아래에서는 쟁점이 발현하지 않는다", () => {
    // 70%가 ⑦(누진+30%p)보다 커지는 구간에서는 현행이 어느 해석에서도 옳다.
    const atCross = calcTax(
      CROSSOVER_TAX_BASE,
      parsedRates,
      baseTransferInput(regulatedMultiHouse) as TransferTaxInput,
    );
    expect(atCross.calculatedTax).toBe(923_160_000);
    expect(Math.floor(CROSSOVER_TAX_BASE * 0.7)).toBe(923_160_000); // 정확히 동률

    const below = calcTax(
      1_300_000_000,
      parsedRates,
      baseTransferInput(regulatedMultiHouse) as TransferTaxInput,
    );
    expect(below.calculatedTax).toBe(909_060_000);
    expect(Math.floor(1_300_000_000 * 0.7)).toBe(910_000_000); // 미등기 70%가 더 크다
  });

  it("B-4: 중과 한시 유예 구간(~2026-05-09 양도)에는 ⑦ 자체가 없어 쟁점이 성립하지 않는다", () => {
    // 유예 중에는 등기 자산도 누진세율뿐이라 70%가 항상 이긴다.
    const suspended = calcTax(
      2_000_000_000,
      parsedRates,
      baseTransferInput({
        ...regulatedMultiHouse,
        transferDate: D("2026-04-01"),
      }) as TransferTaxInput,
    );
    expect(suspended.surchargeType).toBeUndefined();
    expect(suspended.calculatedTax).toBe(834_060_000); // 누진 단독
    expect(suspended.calculatedTax).toBeLessThan(1_400_000_000);

    // ⇒ 쟁점이 발현하려면 **2026-05-10 이후 양도 + 과세표준 13.188억 초과 + 미등기 주택**이
    //   동시에 성립해야 한다. 유예가 다시 연장되면 발현 가능 구간이 사라진다.
  });
});
