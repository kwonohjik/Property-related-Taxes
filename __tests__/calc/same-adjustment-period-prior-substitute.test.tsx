import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SameAdjustmentPeriodSection } from "@/components/calc/transfer/SameAdjustmentPeriodSection";
import { sameAdjustmentPeriodError } from "@/lib/calc/transfer-tax-validate-sec164";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcPriorStdPriceSubstitute } from "@/lib/tax-engine/same-adjustment-period-std-price";

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
function renderSection(overrides: Record<string, unknown>, onChange = vi.fn()) {
  const asset = { ...makeDefaultAsset(1), sapEnabled: true, acquisitionDate: "2005-03-01", ...overrides };
  render(
    <SameAdjustmentPeriodSection
      asset={asset}
      onChange={onChange}
      transferDate="2005-11-01"
    />,
  );
  return { asset, onChange };
}

/** 라벨(`hideLabel`이라 aria-label로만 남는다)로 입력칸을 집는다 */
function fieldFor(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

describe("⑤ §80③ 대체 산정 — 피연산자 입력이 전기 기준시가를 파생시킨다", () => {
  it("2호: 기준율을 채우면 같은 patch에 전기 기준시가가 실린다", () => {
    const { onChange } = renderSection({
      sapPriorBasis: "first_notice_rate",
      sapFirstNoticeStdPrice: "150,000,000",
    });
    fireEvent.change(screen.getByTestId("sap-notice-base-rate"), { target: { value: "98.1" } });
    const last = onChange.mock.calls.at(-1)![0];
    // 파생값이 피연산자와 **같은 batch**에 실려야 한다 — 나눠 보내면 뒤 patch가 앞을 덮는다.
    expect(last.sapNoticeBaseRate).toBe("98.1");
    expect(last.sapPriorStdPrice).toBe("147150000");
  });

  it("3호: 합계액 두 칸이 차면 취득당시 기준시가로 비율환산한다", () => {
    const { onChange } = renderSection({
      sapPriorBasis: "ratio_conversion",
      standardPriceAtAcq: "200,000,000",
      sapPriorLandBuildingSum: "180,000,000",
    });
    fireEvent.change(fieldFor("취득당시의 토지·건물 기준시가 합계액"), {
      target: { value: "200000000" },
    });
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.sapPriorStdPrice).toBe("180000000"); // 2억 × 1.8억 ÷ 2억
  });

  it("피연산자가 덜 차면 파생값을 비운다 — 옛 값을 남기지 않는다", () => {
    const { onChange } = renderSection({
      sapPriorBasis: "ratio_conversion",
      standardPriceAtAcq: "200,000,000",
      sapPriorStdPrice: "999,999,999",
    });
    fireEvent.change(fieldFor("전기의 토지·건물 기준시가 합계액"), {
      target: { value: "180000000" },
    });
    // 취득당시 합계액이 아직 없다 → 산정 불가 ⇒ 빈 값 + ⑧이 사유를 말한다
    expect(onChange.mock.calls.at(-1)![0].sapPriorStdPrice).toBe("");
  });

  it("파생 근거에서는 「전기의 기준시가」 칸이 잠긴다 — 이중 진실 차단", () => {
    renderSection({ sapPriorBasis: "first_notice_rate" });
    const locked = screen
      .getAllByRole("textbox")
      .filter((el) => (el as HTMLInputElement).disabled);
    expect(locked.length).toBe(1);
  });

  it("direct면 잠기지 않는다", () => {
    renderSection({ sapPriorBasis: "direct" });
    const locked = screen
      .getAllByRole("textbox")
      .filter((el) => (el as HTMLInputElement).disabled);
    expect(locked.length).toBe(0);
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
