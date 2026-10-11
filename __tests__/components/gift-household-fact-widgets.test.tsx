/**
 * @vitest-environment jsdom
 *
 * ⑤ — 증여자와 계속 같은 세대 입력 위젯 (결정 #33·#34·#38)
 *  · 이월과세 폼: `CarryoverGiftExclusionSection`의 필수 질문 (노출은 호출부가 정한 `showHouseholdFact`)
 *  · 판정 메뉴: `GiftedSameHouseholdField` 토글 + 관계별 질문 문구
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { CarryoverGiftExclusionSection } from "@/components/calc/transfer/CarryoverGiftExclusionSection";
import { GiftedSameHouseholdField } from "@/components/calc/transfer/GiftedSameHouseholdField";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { carryoverHouseholdFactVisible } from "@/lib/calc/transfer-tax-api-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const QUESTION = /계속 같은 세대/;

function renderSection(over: Partial<React.ComponentProps<typeof CarryoverGiftExclusionSection>> = {}) {
  const onRelationChange = vi.fn();
  render(
    <CarryoverGiftExclusionSection
      exclusionDeclared={CARRYOVER_DEFAULTS.exclusionDeclared}
      onChange={vi.fn()}
      donorRelation="spouse"
      donorDeceased={false}
      spouseGiftOneHouseAtGiftDate={false}
      donorSameHousehold=""
      donorHouseholdHoldingStartDate=""
      donorAcquisitionDate="2010-03-01"
      showHouseholdFact
      showSpouseOneHouseFact
      giftRegistryDate="2025-06-01"
      assetId="a1"
      onRelationChange={onRelationChange}
      {...over}
    />,
  );
  return { onRelationChange };
}

describe("이월과세 폼 — 증여자와 같은 세대 질문", () => {
  it("[W-1] 노출 게이트가 켜지면 질문이 보이고, 꺼지면(사망·비주택·그 외 관계) 보이지 않는다", () => {
    renderSection();
    expect(screen.getAllByText(QUESTION).length).toBeGreaterThan(0);
    cleanup();
    renderSection({ showHouseholdFact: false });
    expect(screen.queryByText(/증여자와 같은 세대 여부/)).toBeNull();
  });

  it("[W-2] 「예」는 시작일 칸을 열고 「아니오」는 시작일을 비운다", () => {
    const { onRelationChange } = renderSection();
    fireEvent.click(screen.getByLabelText(/예 — 계속 같은 세대/));
    expect(onRelationChange).toHaveBeenCalledWith({ donorSameHousehold: "yes" });
    fireEvent.click(screen.getByLabelText(/아니오 — 세대가 달랐거나/));
    expect(onRelationChange).toHaveBeenCalledWith({ donorSameHousehold: "no", donorHouseholdHoldingStartDate: "" });
  });

  it("[W-3] 시작일 칸은 「예」일 때만 있다(긍정 짝)", () => {
    renderSection({ donorSameHousehold: "no" });
    expect(screen.queryByText("세대가 이 주택 보유를 시작한 날")).toBeNull();
    cleanup();
    renderSection({ donorSameHousehold: "yes" });
    expect(screen.getByText("세대가 이 주택 보유를 시작한 날")).toBeTruthy();
  });
});

describe("carryoverHouseholdFactVisible — ⑤·⑧·④ 공용 술어", () => {
  const a = (over: Partial<AssetForm["carryover"]> & { assetKind?: AssetForm["assetKind"] } = {}): AssetForm => {
    const { assetKind, ...c } = over;
    return {
      ...makeDefaultAsset(1),
      assetKind: assetKind ?? "housing",
      acquisitionCause: "carryover_gift",
      carryover: { ...CARRYOVER_DEFAULTS, donorRelation: "spouse", ...c } as AssetForm["carryover"],
    } as AssetForm;
  };
  it("주택 · 생존 · 배우자/직계/관계 미선택 → 묻는다", () => {
    expect(carryoverHouseholdFactVisible(a())).toBe(true);
    expect(carryoverHouseholdFactVisible(a({ donorRelation: "lineal" }))).toBe(true);
    expect(carryoverHouseholdFactVisible(a({ donorRelation: "" }))).toBe(true); // 관계 미선택이 구멍이 되지 않는다
  });
  it("그 외 관계 · 증여자 사망 · 비주택 → 묻지 않는다", () => {
    expect(carryoverHouseholdFactVisible(a({ donorRelation: "other" }))).toBe(false);
    expect(carryoverHouseholdFactVisible(a({ donorDeceased: true }))).toBe(false);
    expect(carryoverHouseholdFactVisible(a({ assetKind: "land" }))).toBe(false);
  });
});

describe("판정 메뉴 — GiftedSameHouseholdField", () => {
  const base = {
    assetId: "a1",
    acquisitionCause: "gift" as const,
    donorAcquisitionDate: "",
    giftDonorRelation: "" as const,
    giftSameHousehold: "" as const,
    giftHouseholdHoldingStartDate: "",
  };

  it("[W-4] 토글을 켜면 원인 gift, 끄면 purchase + 세대 값을 비운다", () => {
    const onChange = vi.fn();
    render(<GiftedSameHouseholdField asset={{ ...base, acquisitionCause: "purchase" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /증여받은 주택입니다/ }));
    expect(onChange).toHaveBeenCalledWith({ acquisitionCause: "gift" });
    cleanup();
    const off = vi.fn();
    render(<GiftedSameHouseholdField asset={base} onChange={off} />);
    fireEvent.click(screen.getByRole("switch", { name: /증여받은 주택입니다/ }));
    expect(off).toHaveBeenCalledWith(
      expect.objectContaining({ acquisitionCause: "purchase", giftSameHousehold: "", giftHouseholdHoldingStartDate: "", donorAcquisitionDate: "" }),
    );
  });

  it("[W-5] 질문 문구가 관계별로 다르다 — 배우자는 혼인 유지, 그 밖은 같은 주소·생계", () => {
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "spouse" }} onChange={vi.fn()} />);
    expect(screen.getByText(/혼인이 유지되었습니까/)).toBeTruthy();
    cleanup();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "lineal" }} onChange={vi.fn()} />);
    expect(screen.queryByText(/혼인이 유지되었습니까/)).toBeNull();
    expect(screen.getByText(/같은 주소에서 생계를 같이 하는 같은 세대/)).toBeTruthy();
  });
});
