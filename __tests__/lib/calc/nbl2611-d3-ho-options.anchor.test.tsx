// @vitest-environment jsdom
/**
 * NBL2611-V7-S ⑤ UI — 호 선택지는 엔진 호 메타 표에서 만들어진다 · 3호 조성 완료일 칸 · 자기 선언 요건 안내 · 12호 도소매업 품목 칸.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { OTHER_LAND_HO_IDS, OTHER_LAND_HO_META } from "@/lib/tax-engine/non-business-land/other-land-ho-meta";

describe("[NBL-OTHER-UI] 호 선택지 = 호 메타 표", () => {
  it("U-1 표의 호가 전부 라디오로 렌더된다(testId 일치) — 누락 호 6종 포함", () => {
    render(<OtherLandDetailSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />);
    for (const h of OTHER_LAND_HO_IDS) expect(screen.getByTestId(OTHER_LAND_HO_META[h].option.testId), h).toBeTruthy();
  });

  it("U-2 3호 선택 → 조성 완료일 칸 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "private_investment_land" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText("토지 조성 완료일")).toBeTruthy();
  });

  it("U-3 면적기준 없는 호(8호) 선택 → 자기 선언 요건 안내 노출 · 면적 칸 없음", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "aggregate_extraction" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    const box = screen.getByTestId("nbl-other-self-declared-notice");
    expect(box.textContent).toContain("확인 필요");
    expect(box.textContent).toContain("골재채취");
    expect(screen.queryByText(/기준면적 \(㎡\)/)).toBeNull();
  });

  it("U-4 14호 선택 → 「이 호는 인정되지 않습니다」 안내(엔진 단계 사유 그대로)", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "etc_14호" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-ho-fail-notice").textContent).toContain("14호");
  });

  it("U-5 누락 호 클릭 → onAssetChange(호)", () => {
    const onChange = vi.fn();
    render(<OtherLandDetailSection asset={makeDefaultAsset(1)} onAssetChange={onChange} />);
    fireEvent.click(screen.getByTestId("nbl-other-related-waste_treatment"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherRelatedBusinessType: "waste_treatment", nblOtherLegacyRelatedReselect: false });
  });

  it("U-6 도소매업 업종 → 품목 칸 노출 · 농산물이면 시장 운영 토글 노출", () => {
    const base = { ...makeDefaultAsset(1), nblRevenueBusinessType: "wholesale_retail" as const };
    const { unmount } = render(<OtherLandDetailSection asset={base} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-revenue-wholesale-item")).toBeTruthy();
    expect(screen.queryByText(/유통산업발전법」에 따른 시장 또는/)).toBeNull();
    unmount();
    render(<OtherLandDetailSection asset={{ ...base, nblRevenueWholesaleItem: "agricultural_product" as const }} onAssetChange={() => {}} />);
    expect(screen.getByText(/유통산업발전법」에 따른 시장 또는/)).toBeTruthy();
    expect(screen.getByTestId("nbl-revenue-wholesale-not-in-market")).toBeTruthy();
  });

  it("U-7 도소매업이 아닌 업종 → 품목 칸 없음", () => {
    const asset = { ...makeDefaultAsset(1), nblRevenueBusinessType: "parking_operation" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-revenue-wholesale-item")).toBeNull();
  });
});
