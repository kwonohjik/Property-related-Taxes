// @vitest-environment jsdom
/**
 * ⑤ UI 위젯 anchor — GracePeriodSection §168의14①·§83의5① (갭 3b)
 *
 * 15종 사유 옵션 + 사유별 조건부 입력 + 단서 토글 + 자동종료 미리보기.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { GracePeriodSection } from "@/components/calc/transfer/nbl/GracePeriodSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { NblGracePeriodInput } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function withGrace(items: NblGracePeriodInput[]) {
  return { ...makeDefaultAsset(1), acquisitionDate: "2020-01-01", nblGracePeriods: items };
}

describe("[NBL-GRACE-UI] ⑤ §168의14①·§83의5① 유예기간 위젯", () => {
  it("단서 토글(매매업 매매용부동산) 렌더 + onChange", () => {
    const onChange = vi.fn();
    render(<GracePeriodSection asset={makeDefaultAsset(1)} onAssetChange={onChange} transferDate="2026-06-01" />);
    expect(screen.getByText(/부동산매매업 매매용부동산/)).toBeTruthy();
  });

  it("유예기간 추가 버튼 → onAssetChange(nblGracePeriods)", () => {
    const onChange = vi.fn();
    render(<GracePeriodSection asset={makeDefaultAsset(1)} onAssetChange={onChange} transferDate="2026-06-01" />);
    fireEvent.click(screen.getByText(/유예기간 추가/));
    expect(onChange).toHaveBeenCalled();
    const patch = onChange.mock.calls[0][0];
    expect(patch.nblGracePeriods?.[0]?.reasonCode).toBe("other_justifiable");
  });

  it("9호 멸실(fixed) 항목 → 기산일 입력 노출 + 자동 가산 기간 미리보기", () => {
    const asset = withGrace([{ reasonCode: "demolition", anchorDate: "2021-06-01", endDate: "", description: "" }]);
    render(<GracePeriodSection asset={asset} onAssetChange={() => {}} transferDate="2026-06-01" />);
    expect(screen.getByText(/기산일/)).toBeTruthy();
    // 멸실+5년 = 2026-06-01 미리보기
    expect(screen.getByText(/2021-06-01 ~ 2026-06-01/)).toBeTruthy();
  });

  it("6호 저당권(취득일 자동) → 기산일 입력 없이 취득일 자동 안내", () => {
    const asset = withGrace([{ reasonCode: "mortgage_or_liquidation", anchorDate: "", endDate: "", description: "" }]);
    render(<GracePeriodSection asset={asset} onAssetChange={() => {}} transferDate="2026-06-01" />);
    expect(screen.getByText(/자산 취득일을 자동 사용/)).toBeTruthy();
    // 취득일 2020-01-01 + 2년 = 2022-01-01
    expect(screen.getByText(/2020-01-01 ~ 2022-01-01/)).toBeTruthy();
  });

  it("5호 건설착공 → 취득일 자동 + 착공일 입력 안내", () => {
    const asset = withGrace([{ reasonCode: "construction_in_progress", anchorDate: "", endDate: "", secondaryDate: "2020-03-01", description: "" }]);
    render(<GracePeriodSection asset={asset} onAssetChange={() => {}} transferDate="2026-06-01" />);
    expect(screen.getByText(/취득일부터 2년은 자산 취득일로 자동/)).toBeTruthy();
  });

  it("1호(건축허가 제한) + 매매업 단서 → 가산 배제 안내", () => {
    const asset = {
      ...withGrace([{ reasonCode: "building_permit_restricted", anchorDate: "2021-01-01", endDate: "2023-01-01", description: "" }]),
      nblBusinessIsRealEstateDealer: true,
    };
    render(<GracePeriodSection asset={asset} onAssetChange={() => {}} transferDate="2026-06-01" />);
    expect(screen.getByText(/매매업 매매용부동산이므로/)).toBeTruthy();
  });
});
