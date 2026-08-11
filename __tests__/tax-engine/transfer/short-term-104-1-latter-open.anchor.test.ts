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
 * 🔴 **어느 쪽인지 판단하지 않았다.** 이 쟁점을 **직접** 판정한 예규·판례를 찾지 못했다
 * (법제처 해석례 19-0620은 §104①**4호 단서** 건이라 무관하나, 「조세법규는 법문대로 해석하고
 *  합리적 이유 없이 확장·유추해석할 수 없다」는 원칙은 확인해 준다 — 대법원 95누1491·97누20090).
 * 세액이 **오르는** 방향이라 근거 없이 바꾸지 않는다(memory `feedback_unverified_authority_blocks_tax_change`
 * 「법문 해석만으로 세액 변경 금지」).
 *
 * 🟢 **다만 실무 교재가 「배타적 독법」 쪽 정황을 준다**(2026-08-03 사용자 제공 이미지 재확인).
 *   §104⑤2호 「자산별」 해설에서 **호별 그룹을 이렇게 열거**한다:
 *     「즉, **2년 이상 보유토지 등, 단기양도, 미등기자산, 비사업용토지, 조정대상지역내 다주택자**와
 *      같이 각 호별로 합산하라는 의미이다」(기획재정부 재산-536, 2018.6.19. 인용부 직후)
 *   ⇒ 1호 그룹을 「**2년 이상 보유토지 등**」으로 부르고 「단기양도」를 **별개 그룹**으로 병렬한다.
 *     단기 자산이 1호에도 해당한다면 §104⑤2호 호별 합산에서 **한 자산이 두 그룹에 중복 계상**되어
 *     이 그룹핑 자체가 성립하지 않는다. A-5가 그 대응(교재 5그룹 ↔ 엔진 `RateGroup` 5개)을 고정한다.
 *   교재 **사례2**도 정합적이다 — B·C주택(1~2년 미만 + 조정지역 3주택)의 비교 후보를
 *     **①2호 60% vs ⑦3호 70% 둘만** 들고 §104①1호 누진(4억×40%−25,940,000 = 134,060,000)은
 *     후보에 넣지 않는다. (다만 1호는 어차피 져서 생략됐을 수도 있어 이것만으로는 결정적이지 않다.)
 *
 * ⚠️ **반대 정황도 있다** — 교재 「④ 하나의 토지가 사업용과 비사업용으로 나뉘는 경우」는
 *   §104① 후단이 **기본세율(1호) ↔ 비사업용 중과(8호)** 사이에서 작동한다고 서술한다
 *   (「…가장 높은 것을 적용한다는 규정에 따라 … 전체를 비사업용 토지로 보고」). 즉 그 국면에서는
 *   1호가 후단의 한 축이었다. 다만 그것은 **한 자산이 물리적으로 두 성격으로 나뉘는** 경우이고,
 *   대법원 2012두15371 + 2018.4.1. §104⑤ 본문 후단 신설로 **이미 폐기된 취급**이다.
 *   ⇒ 균질한 자산 하나가 1호·2호에 **동시 해당**하는가는 교재도 직접 답하지 않는다.
 *
 * ⚠️ **실질 영향은 §104①2호 40% 축뿐이다** — 후단이 발동하려면 단일세율이 누진 한계세율(최고 45%)
 *   보다 낮아야 하는데, 단일세율 호는 40%·50%·60%·70%뿐이라 **40%(비주택 1~2년)만 후보**다.
 *   역전 경계는 과세표준 **1,318,800,000**이다 — `0.45T − 65,940,000 > 0.4T ⟺ 0.05T > 65,940,000`.
 *   (2026-08-11 실측 정정: 종전 주석의 「약 19.7억」은 A-1 케이스 값 1,997,500,000을 경계로 오기한
 *    것이었다. A-3이 5억 미발현을, 아래 A-6이 경계 자체를 고정한다.)
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

  it("A-5: 교재의 **호별 5그룹**과 엔진 `RateGroup`이 1:1로 대응한다", () => {
    // 「즉, 2년 이상 보유토지 등 · 단기양도 · 미등기자산 · 비사업용토지 · 조정대상지역내 다주택자와
    //   같이 각 호별로 합산하라는 의미이다」 — 실무 교재(기재부 재산-536 인용부 직후)
    //
    // 이 5그룹이 **배타적**이라는 것이 「단기 자산은 1호에 해당하지 않는다」 독법의 근거다.
    // 단기 자산이 1호에도 해당한다면 호별 합산에서 한 자산이 두 그룹에 중복 계상된다.
    //
    // ⇒ 누군가 §104① 후단을 도입하며 `candidateClauses`에 1호를 넣으면 이 대응이 깨진다.
    //   그때 이 anchor가 「교재 그룹핑과의 정합을 어떻게 유지할 것인가」를 강제로 묻게 한다.
    const engineGroups = [
      "progressive", // 2년 이상 보유토지 등 (§104①1호)
      "short_term", // 단기양도 (§104①2·3호)
      "unregistered", // 미등기자산 (§104①10호)
      "non_business_land", // 비사업용토지 (§104①8호)
      "multi_house_surcharge", // 조정대상지역내 다주택자 (§104⑦)
    ] as const;
    expect(engineGroups).toHaveLength(5);

    // 각 그룹이 실제로 만들어지는지 — 자산 5건을 한 신고에 담아 확인한다.
    const D2 = D("2026-06-01");
    const base = {
      transferDate: D2,
      acquisitionPrice: 0,
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
    };
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 2_500_000,
        properties: [
          // 2년 이상 보유토지
          { ...(baseTransferInput({ ...base, propertyType: "land", acquisitionDate: D("2015-01-01"), transferPrice: 300_000_000 }) as unknown as Record<string, unknown>), propertyId: "G1", propertyLabel: "G1" },
          // 단기양도(19개월)
          { ...(baseTransferInput({ ...base, propertyType: "land", acquisitionDate: D("2024-11-01"), transferPrice: 300_000_000 }) as unknown as Record<string, unknown>), propertyId: "G2", propertyLabel: "G2" },
          // 미등기
          { ...(baseTransferInput({ ...base, propertyType: "land", acquisitionDate: D("2015-01-01"), transferPrice: 300_000_000, isUnregistered: true }) as unknown as Record<string, unknown>), propertyId: "G3", propertyLabel: "G3" },
          // 비사업용토지
          { ...(baseTransferInput({ ...base, propertyType: "land", acquisitionDate: D("2015-01-01"), transferPrice: 300_000_000, isNonBusinessLand: true }) as unknown as Record<string, unknown>), propertyId: "G4", propertyLabel: "G4" },
          // 조정대상지역 다주택
          { ...(baseTransferInput({ ...base, propertyType: "housing", acquisitionDate: D("2015-01-01"), transferPrice: 300_000_000, isRegulatedArea: true, householdHousingCount: 3 }) as unknown as Record<string, unknown>), propertyId: "G5", propertyLabel: "G5" },
        ],
      } as never,
      mockRates,
    );
    expect([...r.groupTaxes.map((g) => g.group)].sort()).toEqual([...engineGroups].sort());
    // 각 그룹에 정확히 1건씩 — 겹치는 자산이 없다(배타성).
    for (const g of r.groupTaxes) expect(g.assetIds).toHaveLength(1);
  });

  it("A-6: 역전 경계는 과세표준 **1,318,800,000** — 종전 주석의 「약 19.7억」은 오기였다", () => {
    // 0.45T − 65,940,000 > 0.4T ⟺ 0.05T > 65,940,000 ⟺ T > 1,318,800,000
    // A-1(19.97억)은 「경계」가 아니라 그보다 한참 위의 한 케이스일 뿐이다.
    const asShortTerm = (T: number) =>
      calcTax(T, parsedRates, baseTransferInput(shortTermLand) as TransferTaxInput).calculatedTax;
    const asProgressive = (T: number) =>
      calcTax(
        T,
        parsedRates,
        baseTransferInput({ ...shortTermLand, acquisitionDate: D("2010-01-01") }) as TransferTaxInput,
      ).calculatedTax;

    // 경계에서 정확히 동률
    expect(asShortTerm(1_318_800_000)).toBe(527_520_000);
    expect(asProgressive(1_318_800_000)).toBe(527_520_000);

    // 아래 — 40%가 크다(쟁점 미발현)
    expect(asShortTerm(1_200_000_000)).toBe(480_000_000);
    expect(asProgressive(1_200_000_000)).toBe(474_060_000);

    // 위 — 누진이 크다. 15억에서 이미 9,060,000 벌어진다(19.7억을 기다릴 필요가 없다).
    expect(asShortTerm(1_500_000_000)).toBe(600_000_000);
    expect(asProgressive(1_500_000_000)).toBe(609_060_000);
    expect(asProgressive(1_500_000_000) - asShortTerm(1_500_000_000)).toBe(9_060_000);
  });
});
