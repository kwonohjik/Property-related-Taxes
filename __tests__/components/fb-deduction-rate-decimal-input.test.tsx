/**
 * 가업상속공제적용률 — 소수점을 칠 수 있다 (2026-09-05 · 코드리뷰 Q13)
 *
 * ## 종전 결함
 *
 * 저장값이 0~1 소수라 매 타건마다 파싱(문자열→소수) → 포맷(소수→문자열) 왕복을 거쳤다.
 * 「80.5」를 치려고 「80.」까지 가면 `parseFloat("80.") = 80` → 표시가 `"80"`이 되어
 * **찍은 소수점이 곧바로 지워졌다**. 게다가 「805」를 향해 치는 도중 `n > 100 → 1` 클램프가
 * 걸려 **입력 중에 100%로 확정**됐다.
 *
 * ⇒ 섹션 안 로컬 draft: 입력 중에는 draft가 화면을 잡고 **범위 안(0~100)일 때만** store에
 *   쓰며, 포커스 아웃에서 클램프해 확정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FamilyBusinessInheritanceTransferSection } from "@/components/calc/transfer/FamilyBusinessInheritanceTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(rate = 0): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2016-03-01",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 200_000_000,
      inheritanceMarketValue: 500_000_000,
      fbDeductionAppliedRate: rate,
      inheritanceDate: "2016-03-01",
    },
  } as unknown as AssetForm;
}

/** 적용률 입력칸 — `%` 단위가 붙은 유일한 DecimalInput */
function rateInput() {
  const el = screen
    .getAllByPlaceholderText("적용률 (0~100)")
    .at(0);
  expect(el, "적용률 입력칸을 못 찾았다").toBeTruthy();
  return el!;
}

describe("가업상속공제적용률 입력", () => {
  it("🔴 소수점을 찍어도 지워지지 않는다 (「80.」 중간 상태 보존)", () => {
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset(0.8)}
        onChange={() => {}}
        transferDate="2026-01-27"
      />,
    );
    const input = rateInput();
    fireEvent.change(input, { target: { value: "80." } });
    // 종전에는 파싱 왕복으로 "80"이 되어 다음 글자를 칠 수 없었다.
    expect((input as HTMLInputElement).value).toBe("80.");
  });

  it("🔴 「80.5」가 그대로 store에 0.805로 들어간다", () => {
    const onChange = vi.fn();
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset(0.8)}
        onChange={onChange}
        transferDate="2026-01-27"
      />,
    );
    fireEvent.change(rateInput(), { target: { value: "80.5" } });
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.familyBusinessInheritance.fbDeductionAppliedRate).toBeCloseTo(0.805, 6);
  });

  it("🔴 입력 도중 범위를 넘는 값은 store에 쓰지 않는다 (종전에는 100%로 확정)", () => {
    const onChange = vi.fn();
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset(0.8)}
        onChange={onChange}
        transferDate="2026-01-27"
      />,
    );
    onChange.mockClear();
    fireEvent.change(rateInput(), { target: { value: "805" } });
    // 화면은 사용자가 친 대로 두되, store는 건드리지 않는다.
    expect(onChange).not.toHaveBeenCalled();
    expect((rateInput() as HTMLInputElement).value).toBe("805");
  });

  it("포커스 아웃에서 클램프해 확정한다 (0~100)", () => {
    const onChange = vi.fn();
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset(0.8)}
        onChange={onChange}
        transferDate="2026-01-27"
      />,
    );
    const input = rateInput();
    fireEvent.change(input, { target: { value: "805" } });
    fireEvent.blur(input);
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.familyBusinessInheritance.fbDeductionAppliedRate).toBe(1);
  });

  it("대조군 — 정상 범위는 blur에서도 그대로다", () => {
    const onChange = vi.fn();
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset(0.8)}
        onChange={onChange}
        transferDate="2026-01-27"
      />,
    );
    const input = rateInput();
    fireEvent.change(input, { target: { value: "42.75" } });
    fireEvent.blur(input);
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.familyBusinessInheritance.fbDeductionAppliedRate).toBeCloseTo(0.4275, 6);
  });
});
