// @vitest-environment jsdom
/**
 * ⑤ UI 위젯 anchor — DeemedTransferSection §168의14② (F1)
 *
 * 6종 양도일 의제 사유 옵션 + reason≠none 시 의제일 DateInput 조건부 노출.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { DeemedTransferSection } from "@/components/calc/transfer/nbl/DeemedTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

describe("[NBL-DEEMED-UI] ⑤ §168의14② 양도일 의제 위젯", () => {
  it("6개 의제 사유 옵션 렌더", () => {
    render(<DeemedTransferSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />);
    expect(screen.getByText("민사집행법 경매 (1호)")).toBeTruthy();
    expect(screen.getByText("국세징수법 공매 (2호)")).toBeTruthy();
    expect(screen.getByText("캠코 매각위임 (§83의5②1호)")).toBeTruthy();
    expect(screen.getByText("신문 매각공고 (§83의5②2호)")).toBeTruthy();
    expect(screen.getByText("매각 재공고 (§83의5②3호)")).toBeTruthy();
  });

  it("기본(none) → 의제 양도일 입력 미노출", () => {
    render(<DeemedTransferSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />);
    expect(screen.queryByText("의제 양도일")).toBeNull();
  });

  it("auction 선택 상태 → 의제 양도일 DateInput 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblDeemedTransferReason: "auction" };
    render(<DeemedTransferSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText("의제 양도일")).toBeTruthy();
  });

  it("사유 라디오 클릭 → onChange(nblDeemedTransferReason)", () => {
    const onChange = vi.fn();
    render(<DeemedTransferSection asset={makeDefaultAsset(1)} onAssetChange={onChange} />);
    fireEvent.click(screen.getByTestId("nbl-deemed-auction"));
    expect(onChange).toHaveBeenCalledWith({ nblDeemedTransferReason: "auction" });
  });
});
