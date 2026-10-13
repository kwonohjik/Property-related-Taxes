/**
 * ⑤ — 계산기 단건 일반 증여 화면의 「증여자와 계속 같은 세대」 위젯 (결정 #38-1) + 범위 밖 안내 (결정 #38-5)
 *
 * · 첫 자산의 증여 주택이면 판정 메뉴와 같은 칸(관계·계속 같은 세대·시작일)을 증여 블록 아래에 연다. 부담부증여 양도도 같다.
 * · 증여자 취득일은 증여 블록이 이미 받으므로 위젯에서 다시 묻지 않는다(같은 키 두 칸 금지) — 블록 안내가 「필수」로 바뀐다.
 * · 함께 양도하는 자산(첫 자산 아님)·토지·건물만 증여(D2)에는 열지 않는다(⑧·④와 같은 술어). 겸용주택은 연다(#38 후속). 다건 편집 임베드도 연다(#38-3).
 * · 범위 밖 안내(지분·부담부증여·같은 세대 매매·다른 보유 주택 목록)는 판정 메뉴와 계산기에 함께 나온다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { GiftedSameHouseholdField } from "@/components/calc/transfer/GiftedSameHouseholdField";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// 단건·다건 편집 경로 — 위젯은 경로와 무관하게 같다(#38-3).
const nav = vi.hoisted(() => ({ pathname: "/calc/transfer-tax" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

afterEach(() => {
  cleanup();
  nav.pathname = "/calc/transfer-tax";
});

const QUESTION = "증여자와 계속 같은 세대였습니까";
const OUT_OF_SCOPE = /지분만 증여받은 경우, 부담부증여로 받은 경우, 같은 세대원에게서 매수한 경우, 「다른 보유 주택 목록」/;

const giftHouse = (over: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind: "housing",
  acquisitionCause: "gift",
  acquisitionDate: "2025-06-01",
  donorAcquisitionDate: "2010-03-01",
  ...over,
});

function renderSection(asset: AssetForm, extra: { isNonPrimaryAsset?: boolean } = {}, onChange = vi.fn()) {
  render(
    <CompanionAcquisitionCauseSection
      asset={asset}
      onChange={onChange}
      transferDate="2026-02-16"
      isNewConstruction={false}
      {...extra}
    />,
  );
  return onChange;
}

describe("계산기 증여 블록 — 세대 사실 위젯", () => {
  it("[CW-1] 첫 자산 증여 주택 → 질문 · 범위 밖 안내가 보이고, 증여자 취득일 칸은 한 곳뿐이다", () => {
    const { container } = render(
      <CompanionAcquisitionCauseSection asset={giftHouse()} onChange={vi.fn()} transferDate="2026-02-16" isNewConstruction={false} />,
    );
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByTestId("gift-household-out-of-scope").textContent).toMatch(OUT_OF_SCOPE);
    expect(container.querySelectorAll('[data-field="donorAcquisitionDate"]').length).toBe(1);
    expect(screen.getByText(/필수 — 아래 증여자와의 세대 관계/)).toBeTruthy();
  });

  it("[CW-2] 부담부증여로 양도해도 묻는다", () => {
    renderSection(giftHouse({ transferType: "burdened_gift" }));
    expect(screen.getByText(QUESTION)).toBeTruthy();
  });

  it("[CW-3] 함께 양도하는 자산(첫 자산 아님)·토지·D2는 묻지 않는다 — 블록 안내는 「선택 입력」 그대로", () => {
    renderSection(giftHouse(), { isNonPrimaryAsset: true });
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByText(/선택 입력 —/)).toBeTruthy();
    cleanup();
    renderSection(giftHouse({ assetKind: "land" }));
    expect(screen.queryByText(QUESTION)).toBeNull();
    cleanup();
    renderSection(
      giftHouse({ hasSeperateLandAcquisitionDate: true, landAcquisitionCause: "purchase", landCauseHost: "gift" }),
    );
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("[CW-4] 「예」는 시작일 칸을 열고, 「아니오」는 시작일을 비운다", () => {
    const onChange = renderSection(giftHouse({ giftDonorRelation: "lineal" }));
    fireEvent.click(screen.getByLabelText(/예 — 계속 같은 세대/));
    expect(onChange).toHaveBeenCalledWith({ giftSameHousehold: "yes" });
    fireEvent.click(screen.getByLabelText(/아니오 — 세대가 달랐거나/));
    expect(onChange).toHaveBeenCalledWith({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" });
    cleanup();
    renderSection(giftHouse({ giftSameHousehold: "yes" }));
    expect(screen.getByText("세대가 이 주택 보유를 시작한 날")).toBeTruthy();
  });
});

describe("계산기 증여 블록 — 다건·겸용 화면", () => {
  it("[CW-6] 다건 편집에 임베드돼도 같은 칸을 묻는다(다건 ④⑫⑭가 같은 빌더·함수로 싣는다 — #38-3) · 단건과 같다(짝)", () => {
    renderSection(giftHouse());
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByText(/필수 — 아래 증여자와의 세대 관계/)).toBeTruthy();
    cleanup();
    nav.pathname = "/calc/transfer-tax/multi";
    renderSection(giftHouse());
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByText(/필수 — 아래 증여자와의 세대 관계/)).toBeTruthy();
    expect(screen.queryByText(/선택 입력 —/)).toBeNull();
  });

  it("[CW-7] 겸용주택을 증여받았어도 묻는다(겸용 엔진이 같은 leaf로 읽는다 — #38 후속) · 함께 양도하는 겸용이면 묻지 않는다(짝)", () => {
    renderSection(giftHouse({ isMixedUseHouse: true }));
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByText(/필수 — 아래 증여자와의 세대 관계/)).toBeTruthy();
    cleanup();
    renderSection(giftHouse({ isMixedUseHouse: true }), { isNonPrimaryAsset: true });
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});

describe("판정 메뉴 위젯 — 범위 밖 안내(결정 #38-5)", () => {
  it("[CW-5] 판정 메뉴 토글 안에도 같은 범위 밖 안내가 있고, 증여자 취득일 칸과 이월과세 안내는 판정 메뉴에만 있다", () => {
    render(<GiftedSameHouseholdField asset={giftHouse()} onChange={vi.fn()} />);
    expect(screen.getByTestId("gift-household-out-of-scope").textContent).toMatch(OUT_OF_SCOPE);
    expect(screen.getByTestId("one-house-donor-acq-date")).toBeTruthy();
    expect(screen.getByText(/이월과세 사안은 같은 사실로 계산기에서/)).toBeTruthy();
    cleanup();
    renderSection(giftHouse());
    expect(screen.queryByTestId("one-house-donor-acq-date")).toBeNull();
    expect(screen.queryByText(/이월과세 사안은 같은 사실로 계산기에서/)).toBeNull();
  });
});
