/**
 * F-3 — 가업상속공제적용률 「금액으로 입력」 모드
 *
 * 금액 모드는 공제금액·가업상속 재산가액을 `fbRateBasis`로 저장하고, 표시용 `fbDeductionAppliedRate`를
 * 같은 핸들러에서 그 비율로 쓴다(useEffect 미러링 금지 · ⑧ 정합 술어가 둘을 대조).
 * 미리보기는 엔진 leaf를 같은 법정량으로 호출한다 — 1/3에서 733,333,332(6자리 basis면 733,333,600).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FamilyBusinessInheritanceTransferSection } from "@/components/calc/transfer/FamilyBusinessInheritanceTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(fb: Record<string, unknown>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2024-01-01",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 200_000_000,
      inheritanceMarketValue: 1_000_000_000,
      fbDeductionAppliedRate: 0,
      inheritanceDate: "2024-01-01",
      ...fb,
    },
  } as unknown as AssetForm;
}

const lastFb = (onChange: ReturnType<typeof vi.fn>) =>
  (onChange.mock.calls.at(-1)![0] as Partial<AssetForm>).familyBusinessInheritance!;

describe("F-3 적용률 금액 입력", () => {
  it("금액 모드: 재산가액 입력 → fbRateBasis와 표시 적용률을 함께 쓴다", () => {
    const onChange = vi.fn();
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset({ fbRateBasis: { kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 0 } })}
        onChange={onChange}
        transferDate="2026-01-01"
      />,
    );
    fireEvent.change(screen.getByLabelText("가업상속 재산가액 (원)"), { target: { value: "120,000,000,000" } });
    const fb = lastFb(onChange);
    expect(fb.fbRateBasis).toEqual({ kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 120_000_000_000 });
    expect(fb.fbDeductionAppliedRate).toBe(40_000_000_000 / 120_000_000_000);
  });

  it("금액 모드 미리보기 — 33.3333% · 66.6666% · 733,333,332", () => {
    render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset({
          fbDeductionAppliedRate: 1 / 3,
          fbRateBasis: { kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 120_000_000_000 },
        })}
        onChange={() => {}}
        transferDate="2026-01-01"
      />,
    );
    expect(screen.getByTestId("fb-rate-from-amount").textContent).toContain("33.3333%");
    const preview = screen.getByText(/의제 취득가액 미리보기/).parentElement!.textContent!;
    expect(preview).toContain("33.3333%");
    expect(preview).toContain("66.6666%");
    expect(preview).toContain("733,333,332");
  });

  it("% 직접 입력으로 바꾸면 법정량을 지운다 · 금액 모드로 바꾸면 빈칸에서 시작", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FamilyBusinessInheritanceTransferSection
        asset={asset({ fbDeductionAppliedRate: 0.5, fbRateBasis: { kind: "deduction_ratio", deductionAmount: 1, businessEstateValue: 2 } })}
        onChange={onChange}
        transferDate="2026-01-01"
      />,
    );
    fireEvent.click(screen.getByTestId("fb-rate-mode-percent"));
    expect(lastFb(onChange).fbRateBasis).toBeUndefined();
    expect(lastFb(onChange).fbDeductionAppliedRate).toBe(0.5);

    rerender(
      <FamilyBusinessInheritanceTransferSection asset={asset({ fbDeductionAppliedRate: 0.5 })} onChange={onChange} transferDate="2026-01-01" />,
    );
    expect(screen.getAllByPlaceholderText("적용률 (0~100)").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("fb-rate-mode-amount"));
    expect(lastFb(onChange).fbRateBasis).toEqual({ kind: "deduction_ratio", deductionAmount: 0, businessEstateValue: 0 });
    expect(lastFb(onChange).fbDeductionAppliedRate).toBe(0);
  });
});
