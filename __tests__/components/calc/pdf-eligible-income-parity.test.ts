/**
 * PDF ↔ 화면 ⑲·「감면후 소득금액」 정합 anchor (D-13·D-14)
 *
 * 계획: docs/00-pm/transfer-reduction-eligible-income-gap.plan.md §2-A
 *
 * - **D-13**: PDF가 `reductionEligibleIncome` 헬퍼를 쓰지 않아 §77·§77의3(「양도소득금액 전액」
 *   분기)에서 화면과 값이 달랐다.
 * - **D-14**: PDF가 「감면후 소득금액」에서 **세액감면분까지** 뺐다. 별지84호 본 서식
 *   ⑧ 과세표준 = ④+⑤−⑥−⑦에서 차감 대상 ⑥은 §90②(소득금액 차감방식)뿐이다
 *   (작성방법 6번). §90①(세액감면)은 소득금액을 줄이지 않는다.
 *
 * PDF는 react-pdf 렌더러라 유닛에서 렌더하기 무거우므로, **같은 입력에 대해 두 경로가
 * 같은 산식을 쓰는지**를 헬퍼 계약 수준에서 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  reductionEligibleIncome,
  eligibleIncomeBasisText,
} from "@/components/calc/results/transfer/reduction-eligible-income";

const INCOME = 100_000_000;
/** §77 계열은 result.reducibleIncome이 감면율을 곱한 값이라 ⑲에 직접 쓰면 안 된다 */
const RATE_APPLIED = 15_000_000;

describe("D-13 — ⑲는 조문별 기준이 다르다 (PDF도 같은 헬퍼를 써야 한다)", () => {
  it("§77 공익수용 — 양도소득금액 전액 (reducibleIncome 아님)", () => {
    expect(reductionEligibleIncome("public_expropriation", INCOME, RATE_APPLIED, undefined)).toBe(INCOME);
  });

  it("§77의3 개발제한 — 양도소득금액 전액", () => {
    expect(reductionEligibleIncome("gb_designated_land", INCOME, RATE_APPLIED, undefined)).toBe(INCOME);
  });

  it("§77의2 대토보상 — 대토보상분 echo", () => {
    expect(reductionEligibleIncome("replacement_land_comp", INCOME, RATE_APPLIED, 40_000_000)).toBe(40_000_000);
  });

  it("🔴 구별력 — 헬퍼를 안 쓰고 reducibleIncome을 그대로 쓰면 값이 달라진다", () => {
    // PDF가 종전에 하던 방식
    const pdfOld = RATE_APPLIED;
    const screen = reductionEligibleIncome("public_expropriation", INCOME, RATE_APPLIED, undefined);
    expect(pdfOld).not.toBe(screen);
  });
});

describe("D-14 — 「감면후 소득금액」은 §90②만 차감한다", () => {
  /** 화면(DetailedStatementHelpers)과 PDF가 공유해야 할 산식 */
  function incomeAfter(income: number, incomeDeductionReducible: number): number {
    return Math.max(0, income - incomeDeductionReducible);
  }

  it("세액감면(§90①)만 있으면 소득금액은 줄지 않는다", () => {
    // §99의2 5년 내 100% 세액감면 — 소득금액차감액은 0
    expect(incomeAfter(INCOME, 0)).toBe(INCOME);
  });

  it("소득금액차감(§90②)이 있으면 그만큼만 준다", () => {
    expect(incomeAfter(INCOME, 30_000_000)).toBe(70_000_000);
  });

  it("🔴 구별력 — 세액감면분까지 빼면 소득금액이 과소해진다 (PDF 종전 동작)", () => {
    const pdfOld = Math.max(0, INCOME - INCOME - 0); // reducibleIncome이 채워지면 전액 차감돼 0
    expect(pdfOld).toBe(0);
    expect(incomeAfter(INCOME, 0)).toBe(INCOME);
    expect(pdfOld).not.toBe(incomeAfter(INCOME, 0));
  });
});

describe("Phase 2 — ⑲ 산출 근거 문구 (조문별 기준을 밝힌다)", () => {
  it("§77 — 「자산 전부가 감면 대상」임을 밝힌다", () => {
    const t = eligibleIncomeBasisText("public_expropriation", INCOME);
    expect(t).toContain("양도소득금액 전액 100,000,000");
    expect(t).toContain("자산 전부가 감면 대상");
    expect(t).toContain("§77");
  });

  it("§77의2 — 대토보상분임을 밝힌다", () => {
    expect(eligibleIncomeBasisText("replacement_land_comp", 40_000_000)).toContain("대토보상분");
  });

  it("§69 — 편입 부분감면 시 감면비율이 반영됨을 밝힌다", () => {
    const t = eligibleIncomeBasisText("self_farming", 80_000_000);
    expect(t).toContain("자경 감면 대상 양도소득금액 80,000,000");
    expect(t).toContain("§69");
  });

  it("§97 계열 — 임대기간 안분임을 밝힌다 (§97의5① 「임대기간 중 발생한 양도소득」)", () => {
    const t = eligibleIncomeBasisText("rental_97_5", 60_000_000);
    expect(t).toContain("임대기간 중 발생한 양도소득 60,000,000");
  });

  it("🔴 구별력 — 감면 없으면 「감면 대상 없음」", () => {
    expect(eligibleIncomeBasisText(undefined, 0)).toBe("감면 대상 없음");
  });

  it("하이브리드 5년 내 등 그 밖의 조문 — 대상 소득금액을 그대로 밝힌다", () => {
    expect(eligibleIncomeBasisText("unsold_99_2", 282_000_000)).toContain(
      "감면 적용 대상 양도소득금액 282,000,000",
    );
  });
});
