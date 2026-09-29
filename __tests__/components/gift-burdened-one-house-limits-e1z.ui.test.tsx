/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — E-1 한계(e1z) · 증여세 부담부증여 양도 경로에 남은 입력이 **실제로 배선**됐는가
 *
 * 렌더 진입점은 증여세 마법사가 쓰는 `EstateBodyRealEstate`(mode="gift")다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`). G1(상속받은 토지·비주택 건물)은
 * `gift-burdened-one-house-remaining-e1r.ui.test.tsx`의 UI-G1에 있다.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-G2 | §155의3 상생임대주택 — 판정 메뉴와 같은 `WinWinRentalSpecialField`가 1세대 1주택 ON일 때만 뜨고 patch가 `burdenedGiftTransferTax`에 들어간다 · 주택 여부 OFF면 비운다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

/** 주소 검색 모킹 — 버튼을 누르면 인천 서구 PNU(2020-06-19 조정 지정)를 고른 것과 같다 */
vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: ({ onChange }: { onChange: (v: Record<string, string>) => void }) => (
    <button
      type="button"
      data-testid="mock-address-pick"
      onClick={() =>
        onChange({ road: "", jibun: "인천광역시 서구 x", building: "", detail: "", lng: "", lat: "", pnu: "2826010100100010000" })
      }
    />
  ),
}));

afterEach(cleanup);

const GANGNAM_PNU = "1168010100100120034";

function item(bgt: Partial<BurdenedGiftTransferTaxInput> = {}, over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2018-03-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...bgt,
    },
    ...over,
  } as unknown as EstateItem;
}

let latest: EstateItem | undefined;
function Harness({ start, giftDate }: { start: EstateItem; giftDate: string }) {
  const [it, setIt] = useState(start);
  return (
    <EstateBodyRealEstate
      item={it}
      onUpdate={(next) => {
        latest = next;
        setIt(next);
      }}
      valuationDate={giftDate}
      mode="gift"
      showCollateralDeductToggle={false}
    />
  );
}
const bgtOf = () => latest!.burdenedGiftTransferTax!;
const has = (id: string) => screen.queryByTestId(id) !== null;
function typeDate(container: HTMLElement, ymd: string) {
  const [y, m, d] = ymd.split("-");
  fireEvent.change(within(container).getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(within(container).getByLabelText("월"), { target: { value: m } });
  fireEvent.change(within(container).getByLabelText("일"), { target: { value: d } });
}



describe("UI-G2 §155의3 상생임대주택", () => {
  it("★ 1세대 1주택 ON → 위젯 · 토글 ON → 체결일·인상률·기간이 bgt에 판정 메뉴와 같은 이름으로 들어간다", () => {
    render(<Harness start={item()} giftDate="2024-06-01" />);
    fireEvent.click(screen.getByRole("switch", { name: /상생임대주택 특례/ }));
    expect(bgtOf().winWinRentalSpecial).toBe(true);
    typeDate(screen.getByTestId("ww-contract-date"), "2022-01-10");
    expect(bgtOf().winWinRentalContractDate).toBe("2022-01-10");
    fireEvent.change(screen.getByTestId("ww-increase-rate"), { target: { value: "3" } });
    expect(bgtOf().winWinRentalIncreaseRatePct).toBe("3");
    fireEvent.change(screen.getByLabelText("직전임대차 임대기간"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("상생임대차 임대기간"), { target: { value: "25" } });
    expect(bgtOf().winWinRentalPriorLeaseMonths).toBe("24");
    expect(bgtOf().winWinRentalLeaseMonths).toBe("25");
    // 다른 입력은 보존
    expect(bgtOf().standardPriceAtAcquisition).toBe(150_000_000);
    expect(bgtOf().residencePeriodMonths).toBe(0);
  });
  it("부정 짝 — 1세대 1주택 OFF면 위젯 없음", () => {
    render(<Harness start={item({ isOneHousehold: false })} giftDate="2024-06-01" />);
    expect(screen.queryByRole("switch", { name: /상생임대주택 특례/ })).toBeNull();
  });
  it("주택 여부를 끄면 상생임대 입력을 비운다", () => {
    render(
      <Harness
        start={item(
          { isHousing: true, winWinRentalSpecial: true, winWinRentalContractDate: "2022-01-10", winWinRentalLeaseMonths: "24" },
          { category: "real_estate_building" } as Partial<EstateItem>,
        )}
        giftDate="2024-06-01"
      />,
    );
    expect(screen.queryByRole("switch", { name: /상생임대주택 특례/ })).not.toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /주택 여부/ }));
    expect(bgtOf().winWinRentalSpecial).toBeUndefined();
    expect(bgtOf().winWinRentalContractDate).toBeUndefined();
    expect(bgtOf().winWinRentalLeaseMonths).toBeUndefined();
    expect(screen.queryByRole("switch", { name: /상생임대주택 특례/ })).toBeNull();
  });
});
