/**
 * @vitest-environment jsdom
 *
 * §164⑥ 단서 안내 카드 노출 anchor (⑤ UI 지점).
 * 취득연도 ≤2000에서만 노출되고, 확인 토글이 단일 필드를 갱신한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CommercialBuildingBlock } from "@/components/calc/transfer/CommercialBuildingBlock";

afterEach(cleanup);

const NOTICE = /국세청 고시 전이라 존재하지 않습니다/;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    useEstimatedAcquisition: true,
    cbEra: "pre_disclosure",
    acquisitionDate: "1998-05-10",
    ...over,
  } as AssetForm;
}

describe("§164⑥ 단서 안내 — 노출 조건", () => {
  it("취득 1998(≤2000)이면 안내와 확인 토글이 보인다", () => {
    render(<CommercialBuildingBlock asset={asset()} onChange={() => {}} transferDate="2021-06-01" />);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("§164⑤ 준용으로 산정한 금액입니다")).toBeTruthy();
  });

  it("취득 2001이면 나목 가액이 있어 안내가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "2001-01-01" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("post_disclosure는 §164⑥ 경로가 아니라 안내가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ cbEra: "post_disclosure" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("확인 토글은 cbAcqBuildingStdBy164_5 한 필드만 갱신한다", () => {
    const onChange = vi.fn();
    render(<CommercialBuildingBlock asset={asset()} onChange={onChange} transferDate="2021-06-01" />);
    fireEvent.click(screen.getByText("§164⑤ 준용으로 산정한 금액입니다"));
    expect(onChange).toHaveBeenCalledWith({ cbAcqBuildingStdBy164_5: true });
  });
});
