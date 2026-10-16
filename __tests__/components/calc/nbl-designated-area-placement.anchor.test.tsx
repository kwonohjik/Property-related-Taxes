/**
 * anchor — 지정지역 질문이 **입력 화면에 실제로 달린다** (A3 ① ⑤ 배치).
 *
 * 위젯 단독 테스트(`nbl-designated-area-question`)는 «기간 게이트·선택값»만 본다. 위젯을 어느 화면에 달았는지는 여기서 본다 —
 * 달지 않으면 ⑫까지 완벽해도 사용자가 선언할 수 없어 유예가 영영 켜지지 않는다.
 *  - 주 자산(단건 Step4 ⑤ 특수 상황): 비사업용 토지 토글 안
 *  - 컴패니언(`AssetSectionExtras`): 비사업용 토지일 때, 상세 판정 접힘 여부와 무관
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SpecialSituationSection } from "@/app/calc/transfer-tax/steps/step4-sections/SpecialSituationSection";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const land = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: false, ...over }) as AssetForm;
const formOf = (a: AssetForm, transferDate: string): TransferFormData =>
  ({ ...createDefaultTransferFormData(), assets: [a], transferDate }) as TransferFormData;
const primaryQ = () => screen.queryByTestId("nbl-designated-area-question-primary");

describe("주 자산 — SpecialSituationSection", () => {
  const renderPrimary = (a: AssetForm, d: string, onChange = vi.fn()) =>
    render(<SpecialSituationSection form={formOf(a, d)} onChange={onChange} primaryKind="land" showFormLevelUnregistered={false} />);

  it("비사업용 토지 + 양도일 2012-06-01 → 질문이 뜬다", () => {
    renderPrimary(land(), "2012-06-01");
    expect(primaryQ()).not.toBeNull();
  });
  it("양도일이 유예 기간 밖(2016-01-01)이면 뜨지 않는다", () => {
    renderPrimary(land(), "2016-01-01");
    expect(primaryQ()).toBeNull();
  });
  it("비사업용 토글이 꺼져 있으면 뜨지 않는다", () => {
    renderPrimary(land({ isNonBusinessLand: false }), "2012-06-01");
    expect(primaryQ()).toBeNull();
  });
  it("«지정지역 아님» 클릭 → 첫 자산에 isDesignatedArea:false 패치", () => {
    const onChange = vi.fn();
    renderPrimary(land(), "2012-06-01", onChange);
    fireEvent.click(screen.getByTestId("nbl-designated-area-out-primary"));
    const patch = onChange.mock.calls.at(-1)![0] as { assets: AssetForm[] };
    expect(patch.assets[0].isDesignatedArea).toBe(false);
  });
  it("상세 판정 모드(판정 도움)에서도 한 번만 뜬다(중복 렌더 없음)", () => {
    renderPrimary(land({ nblUseDetailedJudgment: true }), "2012-06-01");
    expect(screen.queryAllByTestId("nbl-designated-area-question-primary")).toHaveLength(1);
  });
});

describe("컴패니언 — AssetSectionExtras", () => {
  const renderCompanion = (a: AssetForm, d: string, onChange = vi.fn()) =>
    render(<AssetSectionExtras asset={a} assetIndex={1} onChange={onChange} transferDate={d} />);
  const q = () => screen.queryByTestId("nbl-designated-area-question-companion-1");

  it("비사업용 토지 + 2012-06-01 → 뜬다 (상세 판정을 접은 상태에서도)", () => {
    renderCompanion(land({ nblUseDetailedJudgment: false }), "2012-06-01");
    expect(q()).not.toBeNull();
  });
  it("기간 밖이거나 토지가 아니면 뜨지 않는다", () => {
    const { unmount } = renderCompanion(land(), "2024-06-01");
    expect(q()).toBeNull();
    unmount();
    renderCompanion(land({ assetKind: "housing" }), "2012-06-01");
    expect(q()).toBeNull();
  });
  it("클릭 → 그 자산에 isDesignatedArea 패치", () => {
    const onChange = vi.fn();
    renderCompanion(land(), "2012-06-01", onChange);
    fireEvent.click(screen.getByTestId("nbl-designated-area-in-companion-1"));
    expect(onChange).toHaveBeenLastCalledWith({ isDesignatedArea: true });
  });
});
