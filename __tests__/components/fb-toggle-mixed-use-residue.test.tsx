/**
 * 겸용주택 가업상속공제 토글 — 켜지는 못하되 남은 값은 끌 수 있다(2026-11-11 · 사용자 결정 a).
 * ⑧이 겸용 잔재의 해제를 요구하므로(`transfer-tax-validate-asset.ts`) 토글이 비활성이면 막다른 길이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FamilyBusinessInheritanceTransferSection } from "@/components/calc/transfer/FamilyBusinessInheritanceTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (fbOn: boolean): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "inheritance",
    acquisitionDate: "2016-03-01",
    ...(fbOn
      ? { familyBusinessInheritance: { decedentAcquisitionPrice: 200_000_000, inheritanceMarketValue: 500_000_000, fbDeductionAppliedRate: 0.8, inheritanceDate: "2016-03-01" } }
      : {}),
  }) as unknown as AssetForm;

describe("겸용주택 가업상속공제 토글", () => {
  it("값이 남아 있으면 끌 수 있다 — OFF는 키를 지운다", () => {
    const onChange = vi.fn();
    render(<FamilyBusinessInheritanceTransferSection asset={asset(true)} onChange={onChange} transferDate="2026-01-27" />);
    const sw = screen.getAllByRole("switch")[0];
    expect(sw).not.toHaveAttribute("data-disabled");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith({ familyBusinessInheritance: undefined });
  });

  it("값이 없으면 켤 수 없다(미지원 안내)", () => {
    const onChange = vi.fn();
    render(<FamilyBusinessInheritanceTransferSection asset={asset(false)} onChange={onChange} transferDate="2026-01-27" />);
    expect(screen.getByText("겸용주택은 가업상속공제 의제취득가액 미지원(범위 밖)")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
