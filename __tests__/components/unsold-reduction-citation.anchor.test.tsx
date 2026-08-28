/**
 * anchor: 미분양·신축 감면 카드가 **자기 조문에 맞는 근거 호**를 제시한다
 * (결과탭 코드리뷰 Lane 1 — #032 · #033).
 *
 * ## 플래그 하나로 여러 조문을 묶으면 근거가 틀린다
 *
 * ### #032 농어촌특별세 비과세 사유
 *
 * 카드는 `ruralSurtaxExempt` **플래그 하나**만 보고 전부 「농어촌특별세법 시행령 §4⑦1호」라고
 * 적었다. 실측한 그 호의 열거는
 *   「… 제95조의2, **제98조의3, 제98조의5**, 제99조의9, 제99조의11 …」
 * 라 **제98조·제98조의2가 없다**. 엔진은 사유를 나눠 주석에 적고 있었다 —
 * `unsold-hybrid-p3.ts:246·361` 「농특세령 §4⑦1호」 vs `p4.ts:121`·`p5.ts:169` 「감면세액 부재」.
 *
 * | 조문 | 실제 사유 |
 * |---|---|
 * | §98의3 · §98의5 | 농특세령 §4⑦1호에 **열거** |
 * | §98의2 | 효과가 「장특 표2 + 기본세율」 특칙 ⇒ **감면세액이 없다**(§5①1호 과세표준 0) |
 * | §98 | 「세율 20% 단일」은 농특세법 §2①의 「감면」(1호 세액감면 등 / 2호 **열거된** 특례세율)에 **비해당** |
 *
 * ### #033 다주택 중과 배제 근거 호
 *
 * 실측 소득세법 시행령 §167의3①:
 * - **3호** 「조특법 제97조ㆍ제97조의2 및 **제98조**에 따라 양도소득세가 감면되는 임대주택으로서
 *   **5년 이상 임대한 국민주택**」 ← §98은 여기고, 추가 요건이 붙는다
 * - **5호** 「제77조, **제98조의2**, 제98조의3, 제98조의5부터 제98조의8까지, 제99조, 제99조의2 및
 *   제99조의3」 ← §98은 **없다**
 *
 * `unsold-hybrid-p5.ts` 헤더가 이미 「중과 배제 근거 = 소령 §167의3①**3호** … 5호 아님」이라고
 * 적어 뒀다 — **엔진은 알고 있었고 카드만 5호로 찍었다.**
 *
 * 법령: 농어촌특별세법 §2①·§5①1호 · 농어촌특별세법 시행령 §4⑦1호 · 소득세법 시행령 §167의3①3호·5호
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { IncomeDeductionDetailCard } from "@/components/calc/results/transfer/IncomeDeductionDetailCard";

afterEach(cleanup);

/** 엔진이 실제로 내는 형태의 최소 하이브리드 결과 — 렌더 경로만 재기 위한 것. */
function hybrid(over: Record<string, unknown> = {}) {
  return {
    id: "unsold_98",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    effectCategory: "flat_rate_20",
    taxReductionRate: 1,
    reductionAmount: 0,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "normal",
    formulaSteps: [],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt: true,
    legalBasis: "조세특례제한법 §98",
    ...over,
  };
}

function text(kind: string, over: Record<string, unknown> = {}) {
  const { container } = render(
    <IncomeDeductionDetailCard
      kind={kind as never}
      result={hybrid(over) as never}
      calculatedTax={100_000_000}
    />,
  );
  return container.textContent ?? "";
}

// ── C-0 구별력 ──────────────────────────────────────────────────────
describe("C-0 격자 — 비과세 블록이 실제로 렌더된다", () => {
  it("ruralSurtaxExempt가 false면 블록 자체가 없다 (구별력 확인)", () => {
    const t = text("unsold_98", { ruralSurtaxExempt: false });
    expect(t).not.toContain("농어촌특별세 비과세");
    expect(t).not.toContain("과세표준이 발생하지 않습니다");
  });
});

// ── C-1 #032 농특세 비과세 사유 ─────────────────────────────────────
describe("C-1 농특세 비과세 사유가 조문별로 갈린다 (#032)", () => {
  it("§98의3·§98의5 — 농특세령 §4⑦1호 열거", () => {
    for (const kind of ["unsold_98_3", "unsold_98_5"]) {
      expect(text(kind, { id: kind }), kind).toContain("시행령 §4⑦1호");
    }
  });

  it("🔴 §98의2 — 열거에 없으므로 §4⑦1호를 근거로 대지 않는다", () => {
    const t = text("unsold_98_2", { id: "unsold_98_2", effectCategory: "lthd_rate_special" });
    expect(t, "§4⑦1호 열거에 제98조의2는 없다").not.toContain("§4⑦1호");
    expect(t).toContain("감면세액이 없어");
    expect(t).toContain("§5①1호");
  });

  it("🔴 §98 — 세율 특례라 「감면」 정의에 해당하지 않는다", () => {
    const t = text("unsold_98");
    expect(t, "§4⑦1호 열거에 제98조는 없다").not.toContain("§4⑦1호");
    expect(t).toContain("§2①");
  });
});

// ── C-2 #033 중과 배제 근거 호 ──────────────────────────────────────
describe("C-2 다주택 중과 배제 근거 호가 조문별로 갈린다 (#033)", () => {
  it("🔴 §98 — 5호가 아니라 3호이고, 「5년 이상 임대한 국민주택」 요건을 알린다", () => {
    const t = text("unsold_98");
    expect(t, "§167의3①5호 열거에 제98조는 없다").not.toContain("§167의3①5호");
    expect(t).toContain("§167의3①3호");
    expect(t).toContain("5년 이상 임대한 국민주택");
  });

  it("§98의2·§98의3·§98의5 — 5호가 맞다 (대조군)", () => {
    for (const kind of ["unsold_98_2", "unsold_98_3", "unsold_98_5"]) {
      expect(text(kind, { id: kind }), kind).toContain("§167의3①5호");
    }
  });

  it("§98의4 — 5호 비열거라 중과가 정상 적용된다 (대조군)", () => {
    expect(text("unsold_98_4", { id: "unsold_98_4" })).toContain("중과 배제 대상이 아닙니다");
  });
});
