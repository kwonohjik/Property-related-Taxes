/**
 * anchor: **§104① 후단을 일반 단기 자산(2·3호) ↔ 1호(§55① 누진)에도 적용한다** (2026-08-11 구현)
 *
 * 계획서: `docs/02-design/features/transfer-104-1-latter-short-term.plan.md`
 *
 * ── 법문 ──────────────────────────────────────────────────────
 * §104① 본문 후단: 「이 경우 **하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에 해당할 때에는**
 * 해당 세율을 적용하여 계산한 양도소득 산출세액 중 **큰 것**을 그 세액으로 한다」
 *
 *   **1호** 제94조제1항제1호·제2호 및 제4호에 따른 자산 → §55① 세율     ← **보유기간 한정 없음**
 *   **2호** 같은 자산으로서 보유기간이 1년 이상 2년 미만인 것 → 40%(주택 등 60%)
 *
 * 보유 19개월 비주택 토지는 **양쪽 기술에 그대로 들어맞는다** ⇒ 후단이 발동한다.
 *
 * ── 종전에는 하지 않았다 ────────────────────────────────────────
 * `calcTax`는 후단을 비사토(8호)↔단기, ⑦중과↔단기 **두 곳에서만** 수행하고 일반 단기는
 * 그냥 반환했다. 과소분 **33,935,000**(과세표준 1,997,500,000).
 *
 * ── 「잔여규정 독법」은 폐기했다 ─────────────────────────────────
 * 「1호는 특별 규정이 적용되지 않는 잔여규정이라 2호 적용 자산은 1호에 **해당**하지 않는다」는
 * 대립 해석은 **법문 근거가 없었다** — 조문에 「제2호·제3호에 해당하는 것은 제외한다」가 없고,
 * 유일한 실질 근거였던 실무 교재의 호별 5그룹 논거는 §104⑤2호 단서가 「해당」이 아니라
 * **「적용」**이라고 쓴 것을 놓친 것이었다(후단 MAX 후 **적용** 호는 하나뿐이라 중복 계상이 없다).
 * 오히려 §104④·⑦ 후단이 「§55①(=1호) 계열 세율 ↔ 제1항제2호·제3호」를 비교하라고 하는 것은
 * **1호와 2·3호를 비교 가능한 관계로 본다**는 방증이다. 계획서 §6-B.
 *
 * ── 설계: `candidateClauses`는 **승자 기준** ────────────────────
 * §104⑤2호 단서의 그룹핑 조건이 「동일한 호의 세율이 **적용**되고」라 **적용** 호가 기준이다.
 * 1호를 무조건 실으면 `clauseBucketKey`가 누진 호 포함으로 판정해 **세율을 키에서 빼고**
 * 40% 비주택과 60% 주택 단기가 같은 버킷이 된다(분양권 함정과 동형).
 * ⇒ **1호가 이길 때만** 후보에 1호를 싣는다 — A-2b가 그 회귀 0을 고정한다.
 *
 * ── 발현 구간 ──────────────────────────────────────────────────
 * 단일세율 호는 40·50·60·70%뿐이고 누진 한계는 45%라 **40%(비주택 1~2년)만** 1호에 진다.
 * 경계는 과세표준 **1,318,800,000** — `0.45T − 65,940,000 > 0.4T ⟺ 0.05T > 65,940,000`.
 * (2026-08-11 정정: 종전 주석의 「약 19.7억」은 A-1 케이스 값을 경계로 오기한 것이었다.)
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

describe("§104① 후단 — 일반 단기 자산 × 1호 누진 (2026-08-11 적용)", () => {
  it("A-1: 단건 — 누진이 더 크면 **§104① 후단으로 누진이 적용**된다", () => {
    const r = calculateTransferTax(baseTransferInput(shortTermLand) as TransferTaxInput, mockRates);
    expect(r.taxBase).toBe(1_997_500_000); // 20억 − 기본공제 2,500,000

    // 40% 799,000,000 < 누진 832,935,000 ⇒ 후단이 누진을 고른다.
    expect(r.calculatedTax).toBe(832_935_000);
    expect(r.appliedRate).toBe(0.45); // §55① 최고구간
    expect(r.progressiveDeduction).toBe(65_940_000);

    // 종전(후단 미수행) 값과의 차이 = 33,935,000. 이 금액만큼 과소였다.
    expect(r.calculatedTax - Math.floor(1_997_500_000 * 0.4)).toBe(33_935_000);
  });

  it("A-2: 구조 — 누진이 이기면 「해당 호」에 **1호와 2호가 함께** 실린다", () => {
    // `candidateClauses`는 §104⑤2호 버킷 키의 정본이다.
    // ⑤2호 단서의 그룹핑 조건은 「동일한 호의 세율이 **적용**되고」이므로
    // **적용**된 호(=후단 승자)를 기준으로 싣는다. 2호는 「각 해당 호별」 재계산 대상으로 남는다.
    const st = calcTax(
      1_997_500_000,
      parsedRates,
      baseTransferInput(shortTermLand) as TransferTaxInput,
    );
    expect(st.rateClause).toBe("104-1-1");
    expect(st.candidateClauses).toEqual(["104-1-1", "104-1-2"]);
  });

  it("A-2b: 40%가 이기면 후보는 **종전 그대로** — 버킷 회귀 0", () => {
    // 🔑 이것이 설계의 핵심이다. 13.188억 이하에서는 승자가 2호라 후보가 바뀌지 않는다.
    //   ⇒ `clauseBucketKey`가 「단일세율 호만」 규약(`후보|세율`)을 유지해
    //     40% 비주택 토지와 60% 주택 단기가 **계속 분리**된다.
    //   1호를 무조건 추가했다면 누진 호 포함으로 판정돼 세율이 키에서 빠지고 둘이 합쳐졌을 것이다.
    const st = calcTax(
      500_000_000,
      parsedRates,
      baseTransferInput(shortTermLand) as TransferTaxInput,
    );
    expect(st.rateClause).toBe("104-1-2");
    expect(st.candidateClauses).toEqual(["104-1-2"]);
    expect(st.candidateClauses).not.toContain("104-1-1");
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

  it("A-4: 후단 적용 후 **단건 경로와 §104⑤ 경로가 일치**한다", () => {
    // 종전에는 자산별(⑤2호) 799,000,000 < 합계액 누진(⑤1호) 832,935,000이라 §104⑤ MAX가
    // 뒤늦게 누진을 공급했다. 후단을 단건에서 수행하면 **자산별 산출세액 자체가** 후단을 거친
    // 값이 되어 두 경로가 같아진다 — 「단건은 40%, 다건은 누진」이라는 어긋남이 사라진다.
    //
    // ⚠️ 라우트는 `companions.length > 0`일 때만 다건 엔진을 타므로(`route.ts:458`)
    //   단일 자산이 다건으로 계산되는 일은 없다. 이 케이스는 두 계층의 정합 확인용이다.
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
    // 자산별(⑤2호)이 후단을 거쳐 합계액 누진(⑤1호)과 같아졌다.
    expect(r.calculatedTaxByGroups).toBe(832_935_000);
    expect(r.calculatedTaxByGeneral).toBe(832_935_000);
    expect(r.calculatedTax).toBe(832_935_000);
  });

  it("A-5: 교재의 **호별 5그룹**과 엔진 `RateGroup`이 1:1로 대응한다", () => {
    // 「즉, 2년 이상 보유토지 등 · 단기양도 · 미등기자산 · 비사업용토지 · 조정대상지역내 다주택자와
    //   같이 각 호별로 합산하라는 의미이다」 — 실무 교재(기재부 재산-536 인용부 직후)
    //
    // 이 5그룹은 **「적용」 호의 그룹**이다(⑤2호 단서: 「동일한 호의 세율이 **적용**되고」).
    // 후단 MAX를 거쳐도 자산 하나에 적용되는 호는 하나뿐이라 **후단 적용과 양립한다** —
    // 종전에는 이 5그룹을 「단기는 1호에 해당하지 않는다」의 근거로 읽었으나 그것이
    // 「해당 ↔ 적용」 혼동이었다(계획서 §6-B(2)).
    //
    // ⇒ 이 anchor는 여전히 유효한 방어선이다: `candidateClauses`에 1호를 **무조건** 실으면
    //   버킷 키에서 세율이 빠져 그룹 대응이 깨진다. 승자 기준 규약(A-2b)이 그것을 막는다.
    //   아래 케이스는 차익 3억이라 40%가 이기고, 그래서 그룹이 종전 그대로다.
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

  it("A-6: 승자 전환 경계는 과세표준 **1,318,800,000** — 그 위에서만 1호가 이긴다", () => {
    // 0.45T − 65,940,000 > 0.4T ⟺ 0.05T > 65,940,000 ⟺ T > 1,318,800,000
    // (종전 주석의 「약 19.7억」은 A-1 케이스 값 1,997,500,000을 경계로 오기한 것이었다.)
    const st = (T: number) =>
      calcTax(T, parsedRates, baseTransferInput(shortTermLand) as TransferTaxInput);

    // 아래 — 40%가 이긴다. 후보·호 모두 종전 그대로(버킷 회귀 0).
    expect(st(1_200_000_000).calculatedTax).toBe(480_000_000);
    expect(st(1_200_000_000).rateClause).toBe("104-1-2");

    // 경계 — 동률이면 단기가 남는다(후단은 「큰 것」이라 동률에서 바뀌지 않는다).
    expect(st(1_318_800_000).calculatedTax).toBe(527_520_000);
    expect(st(1_318_800_000).rateClause).toBe("104-1-2");

    // 위 — 누진이 이긴다. 15억에서 이미 9,060,000 늘어난다(19.7억을 기다릴 필요가 없다).
    expect(st(1_500_000_000).calculatedTax).toBe(609_060_000);
    expect(st(1_500_000_000).rateClause).toBe("104-1-1");
    expect(st(1_500_000_000).calculatedTax - Math.floor(1_500_000_000 * 0.4)).toBe(9_060_000);
  });
});
