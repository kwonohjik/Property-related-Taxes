/**
 * @vitest-environment jsdom
 *
 * 조특법 §71의2① 인구감소지역주택 위젯 (결정 #42 · S14a-4) — 엔진·route는 `__tests__/tax-engine/transfer/population-decline-71-2.anchor.test.ts`.
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | 적용 토글이 없고 과거 사실 질문(1채 보유·증여)만 있다 — 고르면 같은 칸으로 올라간다 |
 * | W-2 | 「양도 주택이 늦게 기록된 경우」에만 권리 유래 질문이 열리고, 「예」일 때만 날짜 칸이 열린다 |
 * | W-3 | 신고서 제출은 요건이 아니라 안내다(질문·게이트 없음) |
 * | W-4 | 상속·증여로 받은 행에서만 「피상속인·증여자는 별도세대였는가」를 묻고, 고르면 같은 칸으로 올라간다(결정 #42-2) |
 * | E-1 | 편집 모달은 후보 행(취득일 창 + 인구감소지역)에서 `popDeclineEnabled`일 때만 그린다 |
 * | E-2 | ④ 세컨드홈 카드 문구가 중과 주택 수 전용임을 밝힌다 |
 * | E-3 | 계산기 명부(`HousesListSection`)는 주택 양도와 **조합원입주권 양도**에서 질문을 연다 — 분양권 양도는 닫는다(결정 #42) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryPopDeclineBlock } from "@/components/calc/transfer/HouseEntryPopDeclineBlock";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { HouseEntrySpecialExclusionSection } from "@/components/calc/transfer/HouseEntrySpecialExclusionSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "p",
    region: "non_capital",
    regionCode: "5176025021",
    acquisitionDate: "2024-03-01",
    officialPrice: "200000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

describe("W-1 과거 사실 질문", () => {
  it("적용 여부를 고르는 토글은 없고 질문만 있다", () => {
    render(<HouseEntryPopDeclineBlock house={row()} onUpdate={vi.fn()} sellingAcquisitionDate="2023-06-01" />);
    expect(screen.getByTestId("house-row-pop-decline-sole")).toBeTruthy();
    expect(screen.getByTestId("house-row-pop-decline-gift")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("고르면 같은 칸으로 올라간다 (모름도 하나의 답)", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryPopDeclineBlock house={row()} onUpdate={onUpdate} sellingAcquisitionDate="2023-06-01" />);
    fireEvent.click(screen.getByTestId("house-row-pop-decline-sole-yes"));
    expect(onUpdate).toHaveBeenLastCalledWith({ popDeclSoleAtAcquisition: "yes" });
    fireEvent.click(screen.getByTestId("house-row-pop-decline-gift-unknown"));
    expect(onUpdate).toHaveBeenLastCalledWith({ popDeclAcquiredByGift: "unknown" });
  });
});

describe("W-2 권리 유래 질문", () => {
  it("양도 주택이 이 행보다 먼저 취득됐으면 묻지 않는다", () => {
    render(<HouseEntryPopDeclineBlock house={row()} onUpdate={vi.fn()} sellingAcquisitionDate="2023-06-01" />);
    expect(screen.queryByTestId("house-row-pop-decline-prior-right-block")).toBeNull();
  });
  it("양도 주택이 같거나 늦게 취득됐으면 묻고, 「예」일 때만 날짜 칸이 열린다", () => {
    const { rerender } = render(<HouseEntryPopDeclineBlock house={row()} onUpdate={vi.fn()} sellingAcquisitionDate="2024-06-01" />);
    expect(screen.queryByTestId("house-row-pop-decline-prior-right-block")).not.toBeNull();
    expect(screen.queryByTestId("house-row-pop-decline-prior-right-date")).toBeNull();
    rerender(
      <HouseEntryPopDeclineBlock house={row({ popDeclPriorRight: "yes" })} onUpdate={vi.fn()} sellingAcquisitionDate="2024-06-01" />,
    );
    expect(screen.queryByTestId("house-row-pop-decline-prior-right-date")).not.toBeNull();
  });
  it("「예」가 아니면 낡은 날짜를 함께 지운다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryPopDeclineBlock
        house={row({ popDeclPriorRight: "yes", popDeclPriorRightDate: "2023-12-01" })}
        onUpdate={onUpdate}
        sellingAcquisitionDate="2024-06-01"
      />,
    );
    fireEvent.click(screen.getByTestId("house-row-pop-decline-prior-right-no"));
    expect(onUpdate).toHaveBeenLastCalledWith({ popDeclPriorRight: "no", popDeclPriorRightDate: undefined });
  });
});

describe("W-4 피상속인·증여자 세대 질문 (결정 #42-2)", () => {
  const donorBlock = () => screen.queryByTestId("house-row-pop-decline-donor-block");
  it("증여·상속이 아니면 묻지 않는다", () => {
    render(<HouseEntryPopDeclineBlock house={row()} onUpdate={vi.fn()} />);
    expect(donorBlock()).toBeNull();
    cleanup();
    render(<HouseEntryPopDeclineBlock house={row({ popDeclAcquiredByGift: "no" })} onUpdate={vi.fn()} />);
    expect(donorBlock()).toBeNull();
    cleanup();
    render(<HouseEntryPopDeclineBlock house={row({ popDeclAcquiredByGift: "unknown" })} onUpdate={vi.fn()} />);
    expect(donorBlock()).toBeNull();
  });
  it("증여 「예」면 증여자 · 상속 행이면 피상속인을 묻는다", () => {
    render(<HouseEntryPopDeclineBlock house={row({ popDeclAcquiredByGift: "yes" })} onUpdate={vi.fn()} />);
    expect(donorBlock()?.textContent).toContain("증여자");
    cleanup();
    render(<HouseEntryPopDeclineBlock house={row({ isInherited: true })} onUpdate={vi.fn()} />);
    expect(donorBlock()?.textContent).toContain("피상속인");
  });
  it("고르면 같은 칸으로 올라간다 (같은 세대·모름도 하나의 답)", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryPopDeclineBlock house={row({ popDeclAcquiredByGift: "yes" })} onUpdate={onUpdate} />);
    for (const v of ["separate", "same", "unknown"]) {
      fireEvent.click(screen.getByTestId(`house-row-pop-decline-donor-${v}`));
      expect(onUpdate).toHaveBeenLastCalledWith({ popDeclDonorHousehold: v });
    }
  });
  it("증여 답을 「예」에서 바꾸면(상속 행이 아닐 때) 낡은 세대 답을 함께 지운다 · 상속 행이면 남긴다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryPopDeclineBlock house={row({ popDeclAcquiredByGift: "yes", popDeclDonorHousehold: "same" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-pop-decline-gift-no"));
    // toHaveBeenLastCalledWith는 undefined 키를 없는 키와 같게 본다 — 지우는 키가 실제로 실렸는지 키 목록으로 본다
    expect(onUpdate).toHaveBeenLastCalledWith({ popDeclAcquiredByGift: "no", popDeclDonorHousehold: undefined });
    expect(Object.keys(onUpdate.mock.lastCall![0])).toContain("popDeclDonorHousehold");
    cleanup();
    const onUpdate2 = vi.fn();
    render(<HouseEntryPopDeclineBlock house={row({ isInherited: true, popDeclAcquiredByGift: "yes", popDeclDonorHousehold: "same" })} onUpdate={onUpdate2} />);
    fireEvent.click(screen.getByTestId("house-row-pop-decline-gift-no"));
    expect(onUpdate2).toHaveBeenLastCalledWith({ popDeclAcquiredByGift: "no" });
    expect(Object.keys(onUpdate2.mock.lastCall![0])).not.toContain("popDeclDonorHousehold");
  });
});

describe("W-3 신고서는 안내", () => {
  it("신고 안내 문구가 있고 신고서에 대한 질문은 없다", () => {
    render(<HouseEntryPopDeclineBlock house={row()} onUpdate={vi.fn()} />);
    expect(screen.getByTestId("house-row-pop-decline-filing-notice").textContent).toContain("과세특례신고서");
    expect(screen.getByTestId("house-row-pop-decline-filing-notice").textContent).toContain("요건이 아니라");
  });
});

describe("E-1 편집 모달 배선", () => {
  it("후보 행 + popDeclineEnabled일 때만 그린다", () => {
    render(<HouseEntryEditor house={row()} onUpdate={vi.fn()} popDeclineEnabled sellingAcquisitionDate="2023-06-01" />);
    expect(screen.queryByTestId("house-row-pop-decline-intro")).not.toBeNull();
    cleanup();
    render(<HouseEntryEditor house={row()} onUpdate={vi.fn()} sellingAcquisitionDate="2023-06-01" />);
    expect(screen.queryByTestId("house-row-pop-decline-intro")).toBeNull();
    cleanup();
    // 후보가 아닌 행(서울 · 인구감소지역 아님)
    render(<HouseEntryEditor house={row({ regionCode: "1135010500" })} onUpdate={vi.fn()} popDeclineEnabled />);
    expect(screen.queryByTestId("house-row-pop-decline-intro")).toBeNull();
  });
});

describe("E-2 ④ 세컨드홈 카드", () => {
  it("중과 주택 수 전용이라고 밝히고 §71의2는 명부에서 자동 판정한다고 안내한다", () => {
    render(<HouseEntrySpecialExclusionSection house={row({ isPopulationDeclineArea: true })} onUpdate={vi.fn()} />);
    expect(screen.getByText(/중과 주택 수 전용/)).toBeTruthy();
    expect(screen.getByText(/§71의2 인구감소지역주택/)).toBeTruthy();
  });
});

describe("E-3 계산기 명부 — 양도 자산별 노출 (결정 #42 「입주권 양도(§89①4호)에도 적용」)", () => {
  const calcForm = (kind: string) => {
    const f = createDefaultTransferFormData();
    f.isOneHousehold = true;
    f.transferDate = "2026-06-15";
    f.assets[0] = { ...f.assets[0], assetKind: kind as never, acquisitionDate: "2010-03-15" };
    return Object.assign(f, { presaleRights: [], houses: [row()], householdHousingCount: "1" });
  };
  it.each([
    ["housing", true],
    ["right_to_move_in", true],
    ["presale_right", false],
  ])("양도 자산 %s → 질문 %s", (kind, shown) => {
    render(<HousesListSection form={calcForm(kind)} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.queryByTestId("house-row-pop-decline-intro") !== null).toBe(shown);
  });
});
