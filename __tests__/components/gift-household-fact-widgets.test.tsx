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
      donorPriorHouseholdResidenceMonths=""
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
    expect(onRelationChange).toHaveBeenCalledWith({
      donorSameHousehold: "no",
      donorHouseholdHoldingStartDate: "",
      donorPriorHouseholdResidenceMonths: "",
    });
  });

  it("[W-3] 시작일 칸은 「예」일 때만 있다(긍정 짝)", () => {
    renderSection({ donorSameHousehold: "no" });
    expect(screen.queryByText("세대가 이 주택 보유를 시작한 날")).toBeNull();
    cleanup();
    renderSection({ donorSameHousehold: "yes" });
    expect(screen.getByText("세대가 이 주택 보유를 시작한 날")).toBeTruthy();
  });
});

describe("증여 전 동일세대 거주기간 칸 (결정 #38-7) — 「예」일 때만 열린다", () => {
  const MONTHS = "증여 전 동일세대 거주기간";
  const gift = (yes: boolean) => ({
    assetId: "a1",
    acquisitionCause: "gift" as const,
    donorAcquisitionDate: "2018-01-01",
    giftDonorRelation: "lineal" as const,
    giftSameHousehold: (yes ? "yes" : "no") as AssetForm["giftSameHousehold"],
    giftHouseholdHoldingStartDate: "2019-03-01",
    giftPriorHouseholdResidenceMonths: "12",
    giftDonorDeceased: false,
  });
  it("[PR-W1] 판정 메뉴·계산기 증여 칸 — 「예」면 칸이 열리고 현재 값을 보이며, 입력하면 문자열로 올린다 · 「아니오」면 없다(긍정 짝)", () => {
    const onChange = vi.fn();
    render(<GiftedSameHouseholdField asset={gift(true)} onChange={onChange} />);
    expect(screen.getByText(MONTHS)).toBeTruthy();
    const input = screen.getByLabelText(MONTHS) as HTMLInputElement;
    expect(input.value).toBe("12");
    fireEvent.change(input, { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith({ giftPriorHouseholdResidenceMonths: "30" });
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ giftPriorHouseholdResidenceMonths: "" });
    cleanup();
    render(<GiftedSameHouseholdField asset={gift(false)} onChange={vi.fn()} />);
    expect(screen.queryByText(MONTHS)).toBeNull();
  });
  it("[PR-W2] 이월과세 폼 — 같은 칸 · 「예」일 때만", () => {
    const { onRelationChange } = renderSection({ donorSameHousehold: "yes", donorPriorHouseholdResidenceMonths: "8" });
    expect(screen.getByText(MONTHS)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(MONTHS), { target: { value: "9" } });
    expect(onRelationChange).toHaveBeenCalledWith({ donorPriorHouseholdResidenceMonths: "9" });
    cleanup();
    renderSection({ donorSameHousehold: "no" });
    expect(screen.queryByText(MONTHS)).toBeNull();
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
  it("증여자 사망 · 비주택 → 묻지 않는다 — 관계 「그 외」는 묻는다(결정 #38-2, 판정 메뉴와 같은 필수 질문)", () => {
    expect(carryoverHouseholdFactVisible(a({ donorRelation: "other" }))).toBe(true);
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
    giftPriorHouseholdResidenceMonths: "",
    giftDonorDeceased: false,
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

describe("증여자 사망·이혼 후 재결합 입력 (결정 #34 조건 · #38-6)", () => {
  const base = {
    assetId: "a1",
    acquisitionCause: "gift" as const,
    donorAcquisitionDate: "2010-03-01",
    giftDonorRelation: "spouse" as AssetForm["giftDonorRelation"],
    giftSameHousehold: "" as AssetForm["giftSameHousehold"],
    giftHouseholdHoldingStartDate: "",
    giftPriorHouseholdResidenceMonths: "",
    giftDonorDeceased: false,
  };
  const QUESTION_TITLE = /증여자와 계속 같은 세대였습니까/;

  it("[DR-W1] 판정 메뉴 — 사망 토글은 관계가 있어야 켠다 · 문언이 관계별로 다르다(배우자=사망으로 혼인관계 소멸)", () => {
    render(<GiftedSameHouseholdField asset={base} onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: /사망으로 혼인관계가 소멸되었습니다/ })).toBeTruthy();
    cleanup();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "lineal" }} onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: /양도 전에 증여자가 사망했습니다/ })).toBeTruthy();
    cleanup();
    // 관계 미선택이면 켤 수 없다
    const onChange = vi.fn();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "" }} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: /양도 전에 증여자가 사망했습니다/ });
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[DR-W2] 사망을 켜면 「계속 같은 세대」 질문을 띄우지 않는다 · 꺼져 있으면 띄운다(긍정 짝)", () => {
    const onChange = vi.fn();
    render(<GiftedSameHouseholdField asset={base} onChange={onChange} />);
    expect(screen.getAllByText(QUESTION_TITLE).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("switch", { name: /사망으로 혼인관계가 소멸되었습니다/ }));
    expect(onChange).toHaveBeenCalledWith({ giftDonorDeceased: true });
    cleanup();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorDeceased: true }} onChange={vi.fn()} />);
    expect(screen.queryByText(QUESTION_TITLE)).toBeNull();
  });

  it("[DR-W3] 재결합 선택지는 배우자 증여에만 있다 · 고르면 시작일을 비운다", () => {
    const onChange = vi.fn();
    render(<GiftedSameHouseholdField asset={base} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/아니오 — 증여 뒤 이혼했다가 같은 사람과 재결합/));
    expect(onChange).toHaveBeenCalledWith({
      giftSameHousehold: "rejoined",
      giftHouseholdHoldingStartDate: "",
      giftPriorHouseholdResidenceMonths: "",
    });
    cleanup();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "lineal" }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/이혼했다가 같은 사람과 재결합/)).toBeNull();
    // 「아니오」는 그대로 있다
    expect(screen.getByLabelText(/아니오 — 세대가 달랐거나/)).toBeTruthy();
  });

  it("[DR-W4] 관계를 바꾸면 사망·재결합 답을 함께 비운다 — 배우자로 바꾸면 재결합 답은 유지", () => {
    const onChange = vi.fn();
    render(
      <GiftedSameHouseholdField
        asset={{ ...base, giftSameHousehold: "rejoined", giftDonorDeceased: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("직계존비속"));
    expect(onChange).toHaveBeenCalledWith({ giftDonorRelation: "lineal", giftDonorDeceased: false, giftSameHousehold: "" });
    cleanup();
    const keep = vi.fn();
    render(<GiftedSameHouseholdField asset={{ ...base, giftDonorRelation: "lineal", giftSameHousehold: "yes" }} onChange={keep} />);
    fireEvent.click(screen.getByLabelText("배우자"));
    expect(keep).toHaveBeenCalledWith({ giftDonorRelation: "spouse", giftDonorDeceased: false });
  });

  it("[DR-W5] 이월과세 폼 — 재결합 선택지는 배우자에만 · 고르면 시작일을 비운다", () => {
    const { onRelationChange } = renderSection();
    fireEvent.click(screen.getByLabelText(/아니오 — 증여 뒤 이혼했다가 같은 사람과 재결합/));
    expect(onRelationChange).toHaveBeenCalledWith({
      donorSameHousehold: "rejoined",
      donorHouseholdHoldingStartDate: "",
      donorPriorHouseholdResidenceMonths: "",
    });
    cleanup();
    renderSection({ donorRelation: "lineal" });
    expect(screen.queryByLabelText(/이혼했다가 같은 사람과 재결합/)).toBeNull();
  });

  it("[DR-W6] 이월과세 폼 — 관계가 배우자가 아니게 되면 재결합 답을 비운다 · 배우자로 바꿀 때는 비우지 않는다(긍정 짝)", () => {
    const { onRelationChange } = renderSection({ donorSameHousehold: "rejoined" });
    fireEvent.click(screen.getByLabelText("직계존비속"));
    expect(onRelationChange).toHaveBeenCalledWith(
      expect.objectContaining({ donorRelation: "lineal", donorSameHousehold: "" }),
    );
    cleanup();
    const second = renderSection({ donorRelation: "lineal", donorSameHousehold: "yes" });
    fireEvent.click(screen.getByLabelText("배우자"));
    const patch = second.onRelationChange.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.donorRelation).toBe("spouse");
    expect("donorSameHousehold" in patch).toBe(false);
  });
});
