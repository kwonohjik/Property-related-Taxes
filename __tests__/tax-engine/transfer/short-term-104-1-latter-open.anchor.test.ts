/**
 * anchor(현행 고정): **일반 단기 자산에 §104① 후단(1호 누진 vs 2·3호 단기 MAX)이 수행되지 않는다**
 *
 * 계획서: `docs/02-design/features/transfer-104-1-latter-short-term.plan.md`
 *
 * ── 이 파일은 「고쳤다」가 아니라 「미결이다」를 고정한다 ──────────────────
 * §104① 본문 후단: 「이 경우 **하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에 해당할 때에는**
 * 해당 세율을 적용하여 계산한 양도소득 산출세액 중 **큰 것**을 그 세액으로 한다」
 *
 * `calcTax`는 이 후단을 **두 곳에서만** 수행한다:
 *   · 비사업용 토지(§104①8호) vs 단기(2·3호) — `transfer-tax-rate-calc.ts:387`
 *   · 다주택 중과(§104⑦) vs 단기(2·3호) — `:476` (⑦ 후단은 법문에 명시)
 * **일반 단기 자산(§104①2·3호)과 §104①1호(§55① 누진) 사이에는 없다**(`:494`가 그냥 반환).
 *
 * 쟁점: 보유 1~2년 **비주택 토지**는 문언상 §94①1호 자산이므로 **1호에도 해당**하고, 동시에
 * 보유기간 요건으로 **2호에도 해당**한다. 그렇다면 후단이 발동해 MAX여야 한다.
 * 반대 해석: 1호는 2·3호·8호 등 특별 규정이 적용되지 않는 **잔여(일반) 규정**이므로 2호가
 * 적용되는 자산은 1호에 「해당」하지 않는다.
 *
 * 🔴 **어느 쪽인지 판단하지 않았다.** 이 쟁점을 직접 다룬 예규·판례를 찾지 못했다
 * (법제처 해석례 19-0620은 §104①**4호 단서** 건이라 무관하나, 「조세법규는 법문대로 해석하고
 *  합리적 이유 없이 확장·유추해석할 수 없다」는 원칙은 확인해 준다 — 대법원 95누1491·97누20090).
 * 세액이 **오르는** 방향이라 근거 없이 바꾸지 않는다(memory `feedback_unverified_authority_blocks_tax_change`
 * 「법문 해석만으로 세액 변경 금지」).
 *
 * ⚠️ **실질 영향은 §104①2호 40% 축뿐이다** — 후단이 발동하려면 단일세율이 누진 한계세율(최고 45%)
 *   보다 낮아야 하는데, 단일세율 호는 40%·50%·60%·70%뿐이라 **40%(비주택 1~2년)만 후보**다.
 *   그마저 과세표준이 약 **19.7억**을 넘어야 역전된다(A-1이 그 경계를 실측 고정).
 *
 * 📌 이 파일이 빨개지면 **누군가 그 판단을 내린 것**이다. 계획서의 착수 조건(근거 확보)을
 *   충족했는지 먼저 확인하고, 충족했다면 이 anchor를 정정본으로 교체하라.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const mockRates = makeMockRates();
const parsedRates = parseRatesFromMap(mockRates);
const D = (s: string) => new Date(s);

/** 비주택 토지 · 보유 19개월(§104①2호 40%) · 양도차익 20억 */
const shortTermLand = {
  propertyType: "land" as const,
  transferDate: D("2026-06-01"),
  acquisitionDate: D("2024-11-01"),
  transferPrice: 2_500_000_000,
  acquisitionPrice: 500_000_000,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  isNonBusinessLand: false,
};

describe("§104① 후단 — 일반 단기 자산 × 1호 누진 (미판정·현행 고정)", () => {
  it("A-1: 단건 — 누진이 더 큰데도 **40%가 그대로 적용**된다", () => {
    const r = calculateTransferTax(baseTransferInput(shortTermLand) as TransferTaxInput, mockRates);
    expect(r.taxBase).toBe(1_997_500_000); // 20억 − 기본공제 2,500,000
    expect(r.appliedRate).toBe(0.40);
    expect(r.calculatedTax).toBe(799_000_000); // 1,997,500,000 × 40%

    // 같은 과세표준에 §55① 누진을 태우면 더 크다 — 후단이 발동한다면 이 값이어야 한다.
    const asProgressive = calcTax(
      1_997_500_000,
      parsedRates,
      baseTransferInput({ ...shortTermLand, acquisitionDate: D("2010-01-01") }) as TransferTaxInput,
    );
    expect(asProgressive.calculatedTax).toBe(832_935_000);
    expect(asProgressive.calculatedTax).toBeGreaterThan(r.calculatedTax);
    // 미수행분 = 33,935,000. 이 숫자가 쟁점의 크기다.
    expect(asProgressive.calculatedTax - r.calculatedTax).toBe(33_935_000);
  });

  it("A-2: 구조 — 단기 자산의 「해당 호」에 **1호가 없다**", () => {
    // `candidateClauses`는 §104⑤2호 버킷 키의 정본이다. 여기에 1호를 넣는 순간
    // 버킷 묶음이 달라져 **다건 세액도 함께 움직인다**(집합 일치 요구 — Q3).
    // ⇒ 후단 판단은 단건만의 문제가 아니다. 계획서 §blast-radius.
    const st = calcTax(
      1_997_500_000,
      parsedRates,
      baseTransferInput(shortTermLand) as TransferTaxInput,
    );
    expect(st.candidateClauses).toEqual(["104-1-2"]);
    expect(st.candidateClauses).not.toContain("104-1-1");
    expect(st.rateClause).toBe("104-1-2");
  });

  it("A-3: 40% 미만 구간에서는 쟁점이 발현하지 않는다 (경계 확인)", () => {
    // 과세표준 5억: 40% 200,000,000 > 누진 174,060,000 → 후단이 발동해도 결과 동일.
    const small = calcTax(
      500_000_000,
      parsedRates,
      baseTransferInput(shortTermLand) as TransferTaxInput,
    );
    const smallProgressive = calcTax(
      500_000_000,
      parsedRates,
      baseTransferInput({ ...shortTermLand, acquisitionDate: D("2010-01-01") }) as TransferTaxInput,
    );
    expect(small.calculatedTax).toBe(200_000_000);
    expect(smallProgressive.calculatedTax).toBe(174_060_000);
    expect(small.calculatedTax).toBeGreaterThan(smallProgressive.calculatedTax);
  });

  it("A-4: 다건은 **§104⑤(별개 규정)이 같은 비교를 공급**한다 — 어느 해석에서도 옳다", () => {
    // §104⑤1호(합계액 누진) vs 2호(자산별) MAX는 「둘 이상 양도」의 독립 규정이라
    // 후단 쟁점의 결론과 무관하게 적용된다. 결과적으로 다건에서는 누진이 채택된다.
    //
    // ⚠️ 라우트는 `companions.length > 0`일 때만 다건 엔진을 타므로(`route.ts:458`)
    //   **단일 자산이 다건으로 계산되는 일은 없다** — 사용자 도달 가능한 「경로 불일치」가 아니다.
    //   이 케이스는 후단 쟁점의 크기를 다른 각도에서 확증하는 용도다.
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 0,
        properties: [
          {
            ...(baseTransferInput(shortTermLand) as unknown as Record<string, unknown>),
            propertyId: "A",
            propertyLabel: "A",
          },
        ],
      } as never,
      mockRates,
    );
    expect(r.calculatedTaxByGroups).toBe(799_000_000); // 2호 = 40%
    expect(r.calculatedTaxByGeneral).toBe(832_935_000); // 1호 = 누진
    expect(r.calculatedTax).toBe(832_935_000);
    expect(r.comparedTaxApplied).toBe("general");
  });
});
