/**
 * @vitest-environment jsdom
 *
 * D45 ⑤ — 이월과세 적용배제 섹션.
 * - ②2호 자기선언 토글이 없다(자동 판정).
 * - 배우자 예외 사실 문항은 배우자일 때 · 일반건물이 아닐 때만 보인다(④가 GB에는 싣지 않는다).
 * - 옛 이력의 레거시 선언이면 안내 + 「자동 판정으로 전환」 버튼 → 레거시 플래그를 지운다(Q-3).
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { CarryoverGiftExclusionSection } from "@/components/calc/transfer/CarryoverGiftExclusionSection";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const SPOUSE_FACT = "증여일 현재 1세대1주택이던 주택을 배우자로부터 증여받았습니다";

function renderSection(over: Partial<React.ComponentProps<typeof CarryoverGiftExclusionSection>> = {}) {
  const onChange = vi.fn();
  const onRelationChange = vi.fn();
  render(
    <CarryoverGiftExclusionSection
      exclusionDeclared={CARRYOVER_DEFAULTS.exclusionDeclared}
      onChange={onChange}
      donorRelation="spouse"
      donorDeceased={false}
      spouseGiftOneHouseAtGiftDate={false}
      showSpouseOneHouseFact
      giftRegistryDate="2023-06-01"
      assetId="a1"
      onRelationChange={onRelationChange}
      {...over}
    />,
  );
  return { onChange, onRelationChange };
}

describe("D45 ⑤ CarryoverGiftExclusionSection", () => {
  it("U-1 ②2호 자기선언 토글이 없다 — 자동 판정 안내만 있다", () => {
    renderSection();
    expect(screen.queryByText(/② 2호 — 1세대1주택 비과세 해당/)).toBeNull();
    expect(screen.getByText(/입력한 사실로 자동 판정합니다/)).toBeTruthy();
  });

  it("U-2 배우자 예외 문항: 배우자 + 비-GB에서만 · 체크하면 사실을 패치한다", () => {
    const { onRelationChange } = renderSection();
    fireEvent.click(screen.getByText(SPOUSE_FACT));
    expect(onRelationChange).toHaveBeenCalledWith({ spouseGiftOneHouseAtGiftDate: true });
    cleanup();
    renderSection({ donorRelation: "lineal" });
    expect(screen.queryByText(SPOUSE_FACT)).toBeNull();
    cleanup();
    renderSection({ showSpouseOneHouseFact: false });
    expect(screen.queryByText(SPOUSE_FACT)).toBeNull();
  });

  it("U-3 관계를 바꾸면 배우자 예외 사실도 함께 초기화한다", () => {
    const { onRelationChange } = renderSection();
    fireEvent.click(screen.getByText("직계존비속"));
    expect(onRelationChange).toHaveBeenCalledWith({
      donorRelation: "lineal",
      donorDeceased: false,
      spouseGiftOneHouseAtGiftDate: false,
    });
  });

  it("U-4 레거시 선언이면 안내 + 「자동 판정으로 전환」 → 레거시 플래그 false", () => {
    const { onChange } = renderSection({
      exclusionDeclared: { ...CARRYOVER_DEFAULTS.exclusionDeclared, legacyOneHouseExemptionDeclared: true },
    });
    expect(screen.getByText(/저장 당시 직접 선언한/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "자동 판정으로 전환" }));
    expect(onChange).toHaveBeenCalledWith({ legacyOneHouseExemptionDeclared: false });
  });

  it("U-5 배선: CarryoverGiftBlock이 일반건물에서는 배우자 예외 문항을 숨긴다(④ GB 미전송과 일치)", () => {
    const asset = (assetKind: string) => ({
      ...createDefaultTransferFormData().assets[0],
      assetKind,
      acquisitionCause: "carryover_gift",
      carryover: { ...CARRYOVER_DEFAULTS, donorRelation: "spouse" as const },
    });
    render(<CarryoverGiftBlock asset={asset("housing") as never} transferDate="2026-02-16" onChange={vi.fn()} />);
    expect(screen.queryByText(SPOUSE_FACT)).not.toBeNull();
    cleanup();
    render(<CarryoverGiftBlock asset={asset("general_building") as never} transferDate="2026-02-16" onChange={vi.fn()} />);
    expect(screen.queryByText(SPOUSE_FACT)).toBeNull();
  });

  it("U-6 ⑦ 결과 카드: ②2호 출처(레거시 선언 / 엔진 자동)와 배우자 예외를 표시한다", () => {
    const detail = (co: Record<string, unknown>, gift = "2025-06-01") =>
      calculateTransferTax(
        baseTransferInput({
          propertyType: "housing",
          transferPrice: 1_500_000_000,
          transferDate: new Date("2026-02-16"),
          acquisitionDate: new Date(gift),
          isOneHousehold: true,
          householdHousingCount: 1,
          acquisitionCause: "carryover_gift",
          carryoverTaxation: {
            giftRegistryDate: new Date(gift),
            donorAcquisitionDate: new Date("2000-06-01"),
            donorAcquisitionPrice: 10_000_000,
            useEstimatedAcquisition: false,
            giftTaxAmount: 0,
            giftDateValuation: 1_500_000_000,
            ...co,
          },
        } as Partial<TransferTaxInput>),
        makeMockRates(),
      ).carryoverTaxationDetail!;

    render(<CarryoverComparisonCard detail={detail({})} />);
    expect(screen.getByText(/이월과세 적용배제 — 엔진 자동 판정/)).toBeTruthy();
    cleanup();
    render(<CarryoverComparisonCard detail={detail({ exclusionDeclared: { legacyOneHouseExemptionDeclared: true } }, "2023-06-01")} />);
    expect(screen.getByText(/이월과세 적용배제 — 저장 당시 사용자 선언/)).toBeTruthy();
    cleanup();
    render(<CarryoverComparisonCard detail={detail({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true })} />);
    expect(screen.getByText(/배우자 예외/)).toBeTruthy();
  });
});
