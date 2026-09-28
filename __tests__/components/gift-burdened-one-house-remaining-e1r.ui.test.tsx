/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — E-1 잔여 · 증여세 부담부증여 양도 경로에 남은 입력이 **실제로 배선**됐는가
 *
 * 렌더 진입점은 증여세 마법사가 쓰는 `EstateBodyRealEstate`(mode="gift")다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-A | 「양도시 조정대상지역」 토글 — 주소가 있고 안 만졌으면 주소 판정으로 켜져 있다 · 만지면 그 값(false 포함)을 저장한다 |
 * | UI-D | 상속받은 주택 위젯(판정 메뉴와 같은 `InheritedSameHouseholdField`) → patch가 `burdenedGiftTransferTax`에 들어간다 · 주택 여부 OFF면 비운다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
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


describe("UI-D 상속받은 주택 (§104②1호 · §154⑧3호)", () => {
  it("★ 토글 ON → 피상속인 취득일 · 동일세대 ON → 개시일·개월 → bgt에 계산기와 같은 이름으로 들어간다", () => {
    render(<Harness start={item({ acquisitionDate: new Date("2020-06-01") })} giftDate="2021-06-01" />);
    expect(has("one-house-decedent-acq-date")).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: /상속받은 주택입니다/ }));
    expect(bgtOf().acquisitionCause).toBe("inheritance");
    typeDate(screen.getByTestId("one-house-decedent-acq-date"), "2010-01-01");
    expect(bgtOf().decedentAcquisitionDate).toBe("2010-01-01");
    fireEvent.click(screen.getByRole("switch", { name: /피상속인과 동일세대/ }));
    expect(bgtOf().decedentSameHouseholdBeforeInheritance).toBe(true);
    typeDate(screen.getByTestId("one-house-cohabitation-start"), "2012-01-01");
    expect(bgtOf().decedentCohabitationHoldingStartDate).toBe("2012-01-01");
    fireEvent.change(screen.getByLabelText("상속개시 전 동일세대 거주기간"), { target: { value: "60" } });
    expect(bgtOf().decedentCohabitationResidenceMonths).toBe("60");
    // 다른 입력은 보존
    expect(bgtOf().standardPriceAtAcquisition).toBe(150_000_000);
    expect(bgtOf().acquisitionDate).toBeInstanceOf(Date);
  });
  it("부정 짝 — 토글 OFF → 원인 매매 · 통산 값 비움", () => {
    render(
      <Harness
        start={item({
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2010-01-01",
          decedentSameHouseholdBeforeInheritance: true,
          decedentCohabitationHoldingStartDate: "2012-01-01",
          decedentCohabitationResidenceMonths: "60",
        })}
        giftDate="2021-06-01"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /상속받은 주택입니다/ }));
    expect(bgtOf().acquisitionCause).toBe("purchase");
    expect(bgtOf().decedentSameHouseholdBeforeInheritance).toBe(false);
    expect(bgtOf().decedentCohabitationHoldingStartDate).toBe("");
  });
  it("비주택 건물에는 없다 · 주택 여부를 끄면 상속 값을 비운다", () => {
    render(
      <Harness
        start={item(
          { isHousing: true, acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" },
          { category: "real_estate_building" } as Partial<EstateItem>,
        )}
        giftDate="2021-06-01"
      />,
    );
    expect(screen.queryByRole("switch", { name: /상속받은 주택입니다/ })).not.toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /주택 여부/ }));
    expect(bgtOf().acquisitionCause).toBeUndefined();
    expect(bgtOf().decedentAcquisitionDate).toBeUndefined();
    expect(screen.queryByRole("switch", { name: /상속받은 주택입니다/ })).toBeNull();
  });
});

describe("UI-A 「양도시(증여일) 조정대상지역」 토글 ↔ 증여 주택 주소", () => {
  const regulated = () => screen.getByRole("switch", { name: /양도시\(증여일\) 조정대상지역/ });
  it("★ 강남 주소 · 안 만짐 → 켜져 있고(주소 판정) 자동 판정 안내 · 끄면 false를 저장한다(주소보다 우선)", () => {
    render(<Harness start={item({}, { estateAddress: { pnu: GANGNAM_PNU } } as Partial<EstateItem>)} giftDate="2021-06-01" />);
    expect(regulated().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/소재지 주소로 증여일 현재 조정대상지역으로 자동 판정/)).toBeTruthy();
    fireEvent.click(regulated());
    expect(bgtOf().isRegulatedArea).toBe(false);
    expect(regulated().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/직접 선택한 값으로 판정합니다/)).toBeTruthy();
  });
  it("부정 짝 — 주소 없음이면 꺼져 있다(종전 그대로) · 증여일이 지정 전(2017-08-02)이면 주소 판정도 「아님」", () => {
    render(<Harness start={item()} giftDate="2021-06-01" />);
    expect(regulated().getAttribute("aria-checked")).toBe("false");
    cleanup();
    render(<Harness start={item({}, { estateAddress: { pnu: GANGNAM_PNU } } as Partial<EstateItem>)} giftDate="2017-08-02" />);
    expect(regulated().getAttribute("aria-checked")).toBe("false");
  });
});
