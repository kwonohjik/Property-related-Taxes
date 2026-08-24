import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SameAdjustmentPeriodSection } from "@/components/calc/transfer/SameAdjustmentPeriodSection";
import { sameAdjustmentPeriodError } from "@/lib/calc/transfer-tax-validate-sec164";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcPriorStdPriceSubstitute } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { resolveSapPriorStdPrice, buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";

afterEach(cleanup);

/**
 * §80③ 전기 기준시가 **대체 산정 배선**.
 *
 * 종전에는 `calcPriorStdPriceSubstitute`가 anchor에서만 불렸고 프로덕션 호출부가
 * 0건이었다 — 사용자가 산식을 손으로 계산해 「전기의 기준시가」 칸에 적어야 했다.
 * 여기 테스트는 ⑤가 피연산자를 받아 **엔진 leaf로** 값을 파생시키고, ⑧이 미완성
 * 피연산자를 침묵 no-op 대신 차단함을 고정한다.
 */

// ── 엔진 leaf — 부동소수 곱의 1원 부족 ───────────────────────────────
describe("§80③2호 — 기준율 곱이 1원 적게 나오지 않는다", () => {
  it("15,000,000 × 50.03% = 7,504,500 (float floor는 7,504,499)", () => {
    // Math.floor(15_000_000 * 0.5003) === 7_504_499 — 실측된 1원 부족.
    expect(Math.floor(15_000_000 * 0.5003)).toBe(7_504_499);
    const r = calcPriorStdPriceSubstitute({
      firstNoticeStdPrice: 15_000_000,
      noticeBaseRate: 0.5003,
    });
    expect(r!.value).toBe(7_504_500);
  });
});

// ── ⑤ UI — 피연산자 → 파생 ──────────────────────────────────────────

describe("⑤⑧④ §80③ 대체 산정 — 읽는 시점에 같은 leaf로 파생한다", () => {
  const base = { ...makeDefaultAsset(1), sapEnabled: true, acquisitionDate: "2005-03-01" };

  it("2호: 최초고시 × 기준율", () => {
    expect(
      resolveSapPriorStdPrice({
        ...base,
        sapPriorBasis: "first_notice_rate",
        sapFirstNoticeStdPrice: "150,000,000",
        sapNoticeBaseRate: "98.1",
      }),
    ).toBe(147_150_000);
  });

  it("3호: 취득당시 × 전기합계 ÷ 취득당시합계", () => {
    expect(
      resolveSapPriorStdPrice({
        ...base,
        sapPriorBasis: "ratio_conversion",
        standardPriceAtAcq: "200,000,000",
        sapPriorLandBuildingSum: "180,000,000",
        sapAcqLandBuildingSum: "200,000,000",
      }),
    ).toBe(180_000_000);
  });

  /**
   * 🔴 3호의 「취득당시의 기준시가」는 **다른 섹션**에서 편집된다. 파생값을 저장해 두면
   *    그쪽을 고쳐도 이 값만 낡은 채로 남아 엔진에 낡은 값이 간다. 저장하지 않으므로
   *    다시 읽으면 곧바로 따라온다.
   */
  it("취득당시 기준시가를 다른 섹션에서 고치면 파생값이 즉시 따라온다", () => {
    const a = {
      ...base,
      sapPriorBasis: "ratio_conversion" as const,
      standardPriceAtAcq: "200,000,000",
      sapPriorLandBuildingSum: "180,000,000",
      sapAcqLandBuildingSum: "200,000,000",
    };
    expect(resolveSapPriorStdPrice(a)).toBe(180_000_000);
    expect(resolveSapPriorStdPrice({ ...a, standardPriceAtAcq: "300,000,000" })).toBe(270_000_000);
  });

  it("파생 근거는 직접 입력값을 읽지도 쓰지도 않는다 — 근거를 되돌리면 그대로 살아 있다", () => {
    const a = {
      ...base,
      sapPriorStdPrice: "999,999,999",
      sapPriorBasis: "first_notice_rate" as const,
      sapFirstNoticeStdPrice: "150,000,000",
      sapNoticeBaseRate: "98.1",
    };
    expect(resolveSapPriorStdPrice(a)).toBe(147_150_000);          // 직접 입력값 무시
    expect(resolveSapPriorStdPrice({ ...a, sapPriorBasis: "direct" })).toBe(999_999_999); // 보존
  });

  it("④가 엔진에 보내는 값도 같은 leaf에서 나온다", () => {
    const input = buildSameAdjustmentPeriodInput({
      ...base,
      sapPriorBasis: "ratio_conversion",
      standardPriceAtAcq: "200,000,000",
      sapPriorLandBuildingSum: "180,000,000",
      sapAcqLandBuildingSum: "200,000,000",
    });
    expect(input?.priorStandardPrice).toBe(180_000_000);
  });

  it("피연산자가 덜 차면 0 — 추정하지 않고 ⑧이 사유를 말한다", () => {
    expect(
      resolveSapPriorStdPrice({
        ...base,
        sapPriorBasis: "ratio_conversion",
        standardPriceAtAcq: "200,000,000",
        sapPriorLandBuildingSum: "180,000,000",
      }),
    ).toBe(0);
  });

  it("파생 근거에서는 「전기의 기준시가」 칸이 잠긴다 — 이중 진실 차단", () => {
    render(
      <SameAdjustmentPeriodSection
        asset={{ ...base, sapPriorBasis: "first_notice_rate" }}
        onChange={vi.fn()}
        transferDate="2005-11-01"
      />,
    );
    expect(
      screen.getAllByRole("textbox").filter((el) => (el as HTMLInputElement).disabled).length,
    ).toBe(1);
  });

  it("direct면 잠기지 않는다", () => {
    render(
      <SameAdjustmentPeriodSection
        asset={{ ...base, sapPriorBasis: "direct" }}
        onChange={vi.fn()}
        transferDate="2005-11-01"
      />,
    );
    expect(
      screen.getAllByRole("textbox").filter((el) => (el as HTMLInputElement).disabled).length,
    ).toBe(0);
  });

  it("파생값이 화면에 표시된다", () => {
    render(
      <SameAdjustmentPeriodSection
        asset={{
          ...base,
          sapPriorBasis: "first_notice_rate",
          sapFirstNoticeStdPrice: "150,000,000",
          sapNoticeBaseRate: "98.1",
        }}
        onChange={vi.fn()}
        transferDate="2005-11-01"
      />,
    );
    expect(screen.getByLabelText("전기의 기준시가")).toHaveValue("147,150,000");
  });
});

// ── ⑧ validate — 미완성 피연산자는 침묵 대신 차단 ────────────────────
describe("⑧ §80③ 피연산자 미완성 차단", () => {
  const base = { ...makeDefaultAsset(1), sapEnabled: true, acquisitionDate: "2005-03-01" };

  it("2호 — 기준율이 없으면 차단하고 조문을 말한다", () => {
    const a = { ...base, sapPriorBasis: "first_notice_rate" as const, sapFirstNoticeStdPrice: "150,000,000" };
    expect(sameAdjustmentPeriodError(a, "자산1")).toContain("§80③2호");
  });

  it("3호 — 합계액이 없으면 차단한다", () => {
    const a = {
      ...base,
      sapPriorBasis: "ratio_conversion" as const,
      standardPriceAtAcq: "200,000,000",
      sapPriorLandBuildingSum: "180,000,000",
    };
    expect(sameAdjustmentPeriodError(a, "자산1")).toContain("§80③3호");
  });

  it("2호 — 전부 채우면 통과", () => {
    const a = {
      ...base,
      sapPriorBasis: "first_notice_rate" as const,
      sapFirstNoticeStdPrice: "150,000,000",
      sapNoticeBaseRate: "98.1",
      sapPriorStdPrice: "147150000",
    };
    expect(sameAdjustmentPeriodError(a, "자산1")).toBeNull();
  });

  it("direct는 종전 그대로 — 피연산자를 묻지 않는다", () => {
    const a = { ...base, sapPriorBasis: "direct" as const, sapPriorStdPrice: "100,000,000" };
    expect(sameAdjustmentPeriodError(a, "자산1")).toBeNull();
  });
});

// ── ③ 종전 저장분 ───────────────────────────────────────────────────
describe("③ 대체 근거 + 직접 입력값만 있는 종전 자산은 direct로 되돌린다", () => {
  it("피연산자가 비었고 값이 있으면 direct", () => {
    const a = migrateAsset({
      ...makeDefaultAsset(1),
      sapPriorBasis: "ratio_conversion",
      sapPriorStdPrice: "180,000,000",
      sapPriorLandBuildingSum: undefined,
      sapAcqLandBuildingSum: undefined,
      sapFirstNoticeStdPrice: undefined,
      sapNoticeBaseRate: undefined,
    } as never);
    expect(a.sapPriorBasis).toBe("direct");
    expect(a.sapPriorStdPrice).toBe("180,000,000");
  });

  it("피연산자가 있으면 근거를 유지한다", () => {
    const a = migrateAsset({
      ...makeDefaultAsset(1),
      sapPriorBasis: "ratio_conversion",
      sapPriorStdPrice: "180,000,000",
      sapPriorLandBuildingSum: "180,000,000",
      sapAcqLandBuildingSum: "200,000,000",
    } as never);
    expect(a.sapPriorBasis).toBe("ratio_conversion");
  });
});
