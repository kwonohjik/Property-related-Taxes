/**
 * anchor: `calcTax`가 「**해당 호 후보 목록**」을 낸다 (Q1)
 *
 * 계획서: docs/02-design/features/transfer-rate-clause-candidates.plan.md §5·§6
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * `rateClause`는 §104① 후단·§104⑦ 후단이 고른 **승자**다:
 *   · §104① 후단(`rate-calc.ts:391`↔`:403`) — 비사업용 토지(§104①8호) vs 단기세율(2·3호)
 *   · §104⑦ 후단(`:460`↔`:472`)             — 다주택 중과(⑦1·3호) vs 단기세율(2·3호)
 *
 * 그런데 §104⑤2호 **단서**는 「동일한 호의 세율이 적용되고, 그 **적용세율이 둘 이상**인 경우
 * … **각 해당 호별** 세율을 적용하여 산출한 세액 중 **큰** 산출세액」이라 **「해당 호 집합」**을
 * 요구한다. 승자로 묶으면 「해당 호는 같은데 승자만 갈린」 자산이 나뉜다.
 *
 * ⇒ `candidateClauses`가 그 집합이다. `rateClause`(승자)는 **표시·기록용으로 그대로 유지**한다.
 *
 * **Q1은 세액을 바꾸지 않는다** — 정보만 추가한다. 소비는 Q2(`rateClauseKeyOf` 교체)부터다.
 *
 * ⚠️ 계획서 R-1: `calcTax` 반환 지점 중 **하나라도 후보가 빠지면 묶음이 조용히 갈린다.**
 *   이 파일이 **분기별 전수**를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { resolveSplitAwareTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const parsedRates = parseRatesFromMap(makeMockRates());
const D = (s: string) => new Date(s);
const TRANSFER = D("2026-06-01");

function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "land",
    transferDate: TRANSFER,
    acquisitionDate: D("2015-01-01"), // 11년 — 2년 이상이 기본
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    expenses: 0,
    ...o,
  };
}
const clauses = (taxBase: number, o: Partial<TransferTaxInput> = {}) =>
  calcTax(taxBase, parsedRates, input(o)).candidateClauses;
const applied = (taxBase: number, o: Partial<TransferTaxInput> = {}) =>
  calcTax(taxBase, parsedRates, input(o)).rateClause;

describe("Q1 — §104① 후단(비사업용 토지) 축은 **승패와 무관하게 같은 후보**", () => {
  /**
   * 비사토 2년 미만은 §104①8호(누진+10%p)와 §104①2·3호(단기 40%/50%) **둘 다 해당**한다.
   * 과세표준 크기에 따라 승자가 갈리지만 **후보 집합은 같아야** 한다.
   */
  const NBL_SHORT = { isNonBusinessLand: true, acquisitionDate: D("2025-01-01") }; // 17개월 → ①2호

  it("A-1a: 비사토 승(과세표준 큼) — 후보 2개", () => {
    // 3억: 누진 94,060,000 + 10% 30,000,000 = 124,060,000 > 40% 120,000,000 → ①8호 승
    expect(applied(300_000_000, NBL_SHORT)).toBe("104-1-8");
    expect(clauses(300_000_000, NBL_SHORT)).toEqual(["104-1-2", "104-1-8"]);
  });

  it("A-1b: **단기 승**(과세표준 작음) — 후보는 **동일**", () => {
    // 1억: 누진 20,100,000 + 10% 10,000,000 = 30,100,000 < 40% 40,000,000 → ①2호 승
    expect(applied(100_000_000, NBL_SHORT)).toBe("104-1-2");
    expect(clauses(100_000_000, NBL_SHORT)).toEqual(["104-1-2", "104-1-8"]);
  });

  it("A-2: 비사토 **2년 이상** — 후단 비교가 없어 후보 1개", () => {
    expect(clauses(300_000_000, { isNonBusinessLand: true })).toEqual(["104-1-8"]);
  });
});

describe("Q1 — §104⑦ 후단(다주택 중과) 축도 승패와 무관", () => {
  /** 조정지역 3주택 + 1~2년 보유 → §104⑦3호(누진+30%p)와 §104①2호(60%) 둘 다 해당 */
  const MH3_SHORT = {
    propertyType: "housing" as const,
    acquisitionDate: D("2025-01-01"), // 17개월 → ①2호
    isRegulatedArea: true,
    householdHousingCount: 3,
  };

  it("A-3a: 중과 승(과세표준 큼) — 후보 2개", () => {
    // 3억: 누진 94,060,000 + 30% 90,000,000 = 184,060,000 > 60% 180,000,000 → ⑦3호 승
    expect(applied(300_000_000, MH3_SHORT)).toBe("104-7-3");
    expect(clauses(300_000_000, MH3_SHORT)).toEqual(["104-1-2", "104-7-3"]);
  });

  it("A-3b: **단기 승**(과세표준 작음) — 후보는 **동일**", () => {
    // 1.5억: 누진 37,060,000 + 30% 45,000,000 = 82,060,000 < 60% 90,000,000 → ①2호 승
    expect(applied(150_000_000, MH3_SHORT)).toBe("104-1-2");
    expect(clauses(150_000_000, MH3_SHORT)).toEqual(["104-1-2", "104-7-3"]);
  });

  it("A-3c: 중과 대상이 아니면 단기 호 하나뿐", () => {
    expect(clauses(300_000_000, { acquisitionDate: D("2025-01-01") })).toEqual(["104-1-2"]);
  });
});

describe("Q1 — 단정 분기 (승패 비교가 없다)", () => {
  it("A-4a: 미등기 §104①10호", () => {
    expect(clauses(200_000_000, { isUnregistered: true })).toEqual(["104-1-10"]);
  });

  it("A-4b: 기본 누진 §104①1호", () => {
    expect(clauses(200_000_000)).toEqual(["104-1-1"]);
  });

  it("A-4c: T-3 다주택 중과(2년 이상 — 단기 후보 없음)", () => {
    expect(
      clauses(300_000_000, {
        propertyType: "housing",
        isRegulatedArea: true,
        householdHousingCount: 3,
      }),
    ).toEqual(["104-7-3"]);
  });

  it("A-5: 조특법 §98①1호 20% 단일세율은 **§104 각 호 밖** → 후보 없음", () => {
    // §104①에도 불구하고 세율을 대체하므로 「해당 호」가 존재하지 않는다.
    // `undefined`는 「묶지 않음」이라 안전측이다.
    expect(clauses(300_000_000, { forceFlatRate20: true } as Partial<TransferTaxInput>)).toBeUndefined();
    expect(applied(300_000_000, { forceFlatRate20: true } as Partial<TransferTaxInput>)).toBeUndefined();
  });
});

describe("Q1 — 정렬 결정성 (계획서 R-3)", () => {
  it("A-6: 같은 후보 집합이면 **항상 같은 배열** — 정렬이 흔들리면 순서 의존이 재발한다", () => {
    const a = clauses(300_000_000, { isNonBusinessLand: true, acquisitionDate: D("2025-01-01") });
    const b = clauses(100_000_000, { isNonBusinessLand: true, acquisitionDate: D("2025-01-01") });
    expect(a).toEqual(b); // 승자는 달라도(①8호 vs ①2호) 후보 배열은 동일
    expect(a).toEqual([...a!].sort()); // 문자열 오름차순으로 정렬돼 있다
  });
});

describe("Q1 — 파트도 후보 목록을 들고 나온다 (E-4)", () => {
  it("A-8: 부분 비사토 파트 — 비사업용 `[104-1-8]` · 그 외 `[104-1-1]`", () => {
    const r = resolveSplitAwareTax({
      taxBase: 234_000_000,
      transferIncome: 234_000_000,
      basicDeduction: 0,
      splitDetail: undefined, // 한 필지 내부 분할
      parsedRates,
      taxRateInput: input({ isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 }),
    });
    const parts = r.splitPartDetail!.parts;
    const nbl = parts.find((p) => p.kind === "non_business_land")!;
    const other = parts.find((p) => p.kind !== "non_business_land")!;
    // 취득 2015 → 2년 이상이라 §104① 후단 비교가 없다 ⇒ 각 파트의 해당 호가 하나뿐이다.
    expect(nbl.candidateClauses).toEqual(["104-1-8"]);
    expect(other.candidateClauses).toEqual(["104-1-1"]);
  });
});
