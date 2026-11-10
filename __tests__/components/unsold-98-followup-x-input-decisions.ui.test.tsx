/**
 * @vitest-environment jsdom
 *
 * §98 시리즈 리뷰 후속 그룹 X (2026-11-10 결정) — UI 계층
 *  - Q-20: §98의3 과밀 여부 3-state 라디오 (미선택이 기본, 면적 칸은 «예»에서만)
 *  - Q-21: §98의6 1호↔2호 전환 시 기준시가 합계 비움 + ⑧ 재입력 요구
 *  - Q-28: 「조문 미정」 항목 안내·해제
 *  - Q-29: 입력 안내 2건(세액 불변)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Unsold983InputForm } from "@/components/calc/transfer/Unsold983InputForm";
import { Unsold985InputForm } from "@/components/calc/transfer/Unsold985InputForm";
import { Unsold986InputForm } from "@/components/calc/transfer/Unsold986InputForm";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type Of<T extends AssetReductionForm["type"]> = Extract<AssetReductionForm, { type: T }>;

function Harness983({ initial, selfBuilt = false }: { initial?: Partial<Of<"unsold_98_3">>; selfBuilt?: boolean }) {
  const [v, setV] = useState({ ...(getReductionDefault("unsold_98_3") as Of<"unsold_98_3">), ...(selfBuilt ? { houseType983: "self_built" as const } : {}), ...initial });
  return <Unsold983InputForm value={v} onChange={(p) => setV((prev) => ({ ...prev, ...p }))} />;
}

describe("Q-20 ⑤ 과밀 여부 3-state 라디오", () => {
  it("기본은 미선택, 값은 no/yes, 면적 칸은 «예»에서만 나타난다", () => {
    const { container } = render(<Harness983 />);
    expect(radioValues(container, "isOverconcentration983")).toEqual(["no", "yes"]);
    expect(checkedRadioValue(container, "isOverconcentration983")).toBeFalsy();
    expect(container.querySelector('[data-field="reduction.unsold_98_3.landAreaSqm983"]')).toBeNull();
    fireEvent.click(container.querySelector('input[name="isOverconcentration983"][value="yes"]') as HTMLInputElement);
    expect(checkedRadioValue(container, "isOverconcentration983")).toBe("yes");
    expect(container.querySelector('[data-field="reduction.unsold_98_3.landAreaSqm983"]')).not.toBeNull();
    fireEvent.click(container.querySelector('input[name="isOverconcentration983"][value="no"]') as HTMLInputElement);
    expect(container.querySelector('[data-field="reduction.unsold_98_3.landAreaSqm983"]')).toBeNull();
  });
});

function Harness986() {
  const [v, setV] = useState<Of<"unsold_98_6">>({ ...(getReductionDefault("unsold_98_6") as Of<"unsold_98_6">), stdPriceSumAtBase986: "500000000" });
  return (
    <>
      <Unsold986InputForm value={v} onChange={(p) => setV((prev) => ({ ...prev, ...p }))} />
      <output data-testid="sum">{v.stdPriceSumAtBase986}</output>
    </>
  );
}

describe("Q-21 §98의6 1호↔2호 전환 — 기준시가 합계 비움", () => {
  it("전환하면 비우고(안내 문구 노출), 같은 값을 다시 누르면 유지한다", () => {
    const { container, getByTestId } = render(<Harness986 />);
    expect(getByTestId("sum").textContent).toBe("500000000");
    const group = container.querySelector('input[name="unsold986-ho"][value="seller_rented"]') as HTMLInputElement;
    fireEvent.click(group); // 같은 값(기본 1호) — 유지
    expect(getByTestId("sum").textContent).toBe("500000000");
    fireEvent.click(container.querySelector('input[name="unsold986-ho"][value="buyer_rented"]') as HTMLInputElement);
    expect(getByTestId("sum").textContent).toBe("");
    expect(container.querySelector('[data-testid="unsold-98-6-ho-switch-notice"]')).not.toBeNull();
  });

  it("⑧ — 비운 뒤에는 기준시가 합계 재입력을 요구한다", () => {
    const red = { ...(getReductionDefault("unsold_98_6") as Of<"unsold_98_6">), hoType986: "buyer_rented" as const, stdPriceSumAtBase986: "" };
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2012-06-01", reductions: [red] };
    const issue = collectStepIssues(2, { assets: [asset], transferDate: "2013-06-01" } as unknown as TransferFormData)[0];
    expect(issue?.message).toContain("기준시가 합계를 입력하세요");
    expect(issue?.field).toBe("reduction.unsold_98_6.stdPriceSumAtBase986");
  });
});

describe("Q-28 「조문 미정」 항목", () => {
  const unresolvedAsset = () => ({
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionDate: "2013-05-01",
    reductions: [{ type: "unsold_housing_unresolved" } as AssetReductionForm],
  });

  it("⑧ — 재선택(해제)을 요구한다", () => {
    const issue = collectStepIssues(2, { assets: [unresolvedAsset()], transferDate: "2024-08-01" } as unknown as TransferFormData)[0];
    expect(issue?.message).toContain("적용 조문을 정하지 못했습니다");
    expect(issue?.field).toBe("reduction.unsold_housing_unresolved");
  });

  it("⑤ 패널 — 안내 카드 + 해제 버튼이 항목을 제거한다", () => {
    let asset = unresolvedAsset();
    const { container, getByTestId, queryByTestId, rerender } = render(
      <UnifiedReductionPanel asset={asset} transferDate="2024-08-01" onChange={(p) => { asset = { ...asset, ...p } as typeof asset; }} />,
    );
    expect(getByTestId("unsold-housing-unresolved-notice")).not.toBeNull();
    fireEvent.click(getByTestId("unsold-housing-unresolved-remove"));
    expect(asset.reductions).toEqual([]);
    rerender(<UnifiedReductionPanel asset={asset} transferDate="2024-08-01" onChange={() => {}} />);
    expect(queryByTestId("unsold-housing-unresolved-notice")).toBeNull();
    expect(container).toBeTruthy();
  });
});

describe("Q-29 입력 안내 (세액 불변)", () => {
  it("§98의3 자기건설 — 주택신축판매업자 사업소득 안내 + 인용 3건 (자기건설에서만)", () => {
    const { container, queryByTestId } = render(<Harness983 selfBuilt />);
    const note = queryByTestId("unsold-98-3-builder-seller-notice");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("사업소득");
    for (const c of ["재산세과-984", "재산세과-1079", "부동산거래관리과-620"]) expect(note!.textContent).toContain(c);
    cleanup();
    const purchased = render(<Harness983 />);
    expect(purchased.queryByTestId("unsold-98-3-builder-seller-notice")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("§98의5 — 해제 후 제3자 재계약도 미분양주택 안내 + 부동산거래관리과-130", () => {
    const { getByTestId } = render(<Unsold985InputForm value={getReductionDefault("unsold_98_5") as Of<"unsold_98_5">} onChange={() => {}} />);
    const note = getByTestId("unsold-98-5-rescinded-recontract-notice");
    expect(note.textContent).toContain("제3자가 다시 계약");
    expect(note.textContent).toContain("미분양주택으로 봅니다");
    expect(note.textContent).toContain("부동산거래관리과-130");
  });
});
