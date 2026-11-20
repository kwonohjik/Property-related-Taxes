// @vitest-environment jsdom
/**
 * NBL2611-B1 (R05) ⑤ 렌더 anchor — 지목별 입력 소비 술어가 화면·고지를 같은 표로 정한다.
 *   V10-PU10 / V8-VL08: 도시편입일은 편입유예를 판정에 쓰는 지목(농지·임야·목장)에만
 *   V2-C1: 유예 입력을 아직 읽지 않는 지목(주택부수토지 — 기타토지는 NBL2611-B3에서 반영)은 「가산됩니다」 대신 「반영되지 않음 — 확인 필요」
 *   Q-12: 별장 사용기간 0행이면 「사용 없음」 확인 토글, 행이 있으면 숨김
 *   Q-10 (나): 레거시 「거주·사업 직접 관련」 복원분의 「호 재선택」 고지 — 호를 고르면 꺼진다
 *   V8-VL08: 별장 기간 행의 기본 사용 형태는 「자경」이 아니다
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { GracePeriodSection } from "@/components/calc/transfer/nbl/GracePeriodSection";
import { VillaLandDetailSection } from "@/components/calc/transfer/nbl/VillaLandDetailSection";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const base = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "land", nblUseDetailedJudgment: true, nblZoneType: "general_residential", ...over }) as AssetForm;

const hasIncorporation = () => document.querySelector('[data-field="nblUrbanIncorporationDate"]') !== null;

describe("V10-PU10·V8-VL08 — 도시편입일 칸은 소비 지목에만", () => {
  it.each(["farmland", "forest", "pasture"] as const)("%s → 도시편입일 칸이 있다", (landType) => {
    render(<NblSectionContainer asset={base({ nblLandType: landType })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(hasIncorporation()).toBe(true);
  });

  it.each(["villa_land", "housing_site", "other_land"] as const)("%s → 도시편입일 칸이 없다 (어느 judge도 읽지 않는다)", (landType) => {
    render(<NblSectionContainer asset={base({ nblLandType: landType })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(hasIncorporation()).toBe(false);
    expect(screen.queryByText(/도시지역 편입 시 3년 유예/)).toBeNull();
  });
});

describe("V2-C1 — 유예기간 안내를 사실대로", () => {
  it.each(["housing_site"] as const)("%s → 「반영되지 않음 — 확인 필요」 고지, 「가산됩니다」 문구 없음", (landType) => {
    render(<GracePeriodSection asset={base({ nblLandType: landType })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(screen.getByTestId("nbl-grace-not-applied-notice").textContent).toContain("가산하지 않습니다");
    expect(screen.queryByText(/사업용 사용 기간에 가산됩니다/)).toBeNull();
  });

  it.each(["farmland", "forest", "pasture", "villa_land", "other_land"] as const)("%s → 종전 안내 유지 · 고지 없음 (기타토지는 NBL2611-B3부터 유예를 읽는다)", (landType) => {
    render(<GracePeriodSection asset={base({ nblLandType: landType })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(screen.queryByTestId("nbl-grace-not-applied-notice")).toBeNull();
    expect(screen.getByText(/사업용 사용 기간에 가산됩니다/)).toBeTruthy();
  });

  it("지목 미선택 → 단정하지 않는다 (고지 없음)", () => {
    render(<GracePeriodSection asset={base({ nblLandType: "" })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(screen.queryByTestId("nbl-grace-not-applied-notice")).toBeNull();
  });
});

describe("Q-12 · V8-VL08 — 별장 화면", () => {
  it("사용기간 0행 → 「사용 없음」 확인 토글이 보이고 클릭하면 nblVillaNoUseConfirmed", () => {
    const onChange = vi.fn();
    render(<VillaLandDetailSection asset={base({ nblLandType: "villa_land" })} onAssetChange={onChange} transferDate="2024-06-03" />);
    expect(document.querySelector('[data-field="nblVillaNoUseConfirmed"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /별장으로 사용한 기간이 없습니다/ }));
    expect(onChange).toHaveBeenCalledWith({ nblVillaNoUseConfirmed: true });
  });

  it("사용기간이 1행 이상이면 확인 토글을 숨긴다", () => {
    const asset = base({ nblLandType: "villa_land", nblVillaUsePeriods: [{ startDate: "", endDate: "", usageType: "별장 사용" }] });
    render(<VillaLandDetailSection asset={asset} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(document.querySelector('[data-field="nblVillaNoUseConfirmed"]')).toBeNull();
  });

  it("「+ 기간 추가」 기본 사용 형태는 「별장 사용」이다 (농지용 「자경」이 아니다)", () => {
    const onChange = vi.fn();
    render(<VillaLandDetailSection asset={base({ nblLandType: "villa_land" })} onAssetChange={onChange} transferDate="2024-06-03" />);
    fireEvent.click(screen.getByText("+ 기간 추가"));
    expect(onChange.mock.calls[0][0].nblVillaUsePeriods[0].usageType).toBe("별장 사용");
  });
});

describe("Q-10 (나) — 레거시 「거주·사업 직접 관련」 고지", () => {
  it("표지가 서 있으면 「호를 다시 선택하세요」 고지, 호를 고르면 표지를 끄는 patch", () => {
    const onChange = vi.fn();
    const asset = base({ nblLandType: "other_land", nblOtherLegacyRelatedReselect: true });
    render(<OtherLandDetailSection asset={asset} onAssetChange={onChange} transferDate="2024-06-03" />);
    expect(screen.getByTestId("nbl-other-legacy-related-notice")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nbl-other-related-hatchang"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherRelatedBusinessType: "hatchang", nblOtherLegacyRelatedReselect: false });
  });

  it("표지가 없으면 고지가 없다", () => {
    render(<OtherLandDetailSection asset={base({ nblLandType: "other_land" })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(screen.queryByTestId("nbl-other-legacy-related-notice")).toBeNull();
  });
});
