/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — E-1 후속 · 증여세 부담부증여 양도 경로에 1세대1주택 후속 입력이 **실제로 배선**됐는가
 *
 * 렌더 진입점은 증여세 마법사가 쓰는 `EstateBodyRealEstate`(mode="gift")다 — 증여일이 `valuationDate`로 들어와
 * `BurdenedGiftTransferSection` → `BurdenedGiftHousingFieldSet`까지 내려가는지를 본다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-R | 증여 주택 주소(PNU)가 있으면 「취득시 조정대상지역」 토글 대신 자동 판정 결과 · §155①2호 종전 주택도 자동 판정 |
 * | UI-P | §154① 단서 카드(1주택 맥락) → 4호 선택 시 4호 칸이 열리고 patch가 `burdenedGiftTransferTax`에 들어간다 |
 * | UI-F | §154⑤ 단서 재기산 — 증여 2022-03-01 · 1주택이면 열리고, 2022-05-10이면 없다 · 입력 patch |
 * | UI-X | 주택 여부를 끄면 후속 입력을 비운다 |
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
const click = (id: string) => fireEvent.click(screen.getByTestId(id));
function typeDate(container: HTMLElement, ymd: string) {
  const [y, m, d] = ymd.split("-");
  fireEvent.change(within(container).getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(within(container).getByLabelText("월"), { target: { value: m } });
  fireEvent.change(within(container).getByLabelText("일"), { target: { value: d } });
}

describe("UI-R 증여 주택 주소 → 조정대상지역 자동 판정", () => {
  it("★ 주소 PNU(강남) → 「취득시 조정대상지역」 토글 없음 · 취득일(2018-03-01) 기준 조정대상지역 표시", () => {
    render(<Harness start={item({}, { estateAddress: { pnu: GANGNAM_PNU } } as Partial<EstateItem>)} giftDate="2021-06-01" />);
    expect(has("bg-transfer-regulated-acq")).toBe(false);
    expect(screen.getByTestId("bg-transfer-regulated-acq-auto").textContent).toMatch(/^조정대상지역 — 소재지 주소로/);
    // 양도시 토글은 남는다(중과·단기세율 판정용) — 주소 기준 결과를 안내만 한다
    expect(screen.getByText(/소재지 주소로는 증여일 현재 조정대상지역입니다/)).toBeTruthy();
  });
  it("부정 짝 — 주소 없음이면 종전 토글 그대로 · 2017-08-02 취득이면 「조정대상지역 아님」", () => {
    render(<Harness start={item()} giftDate="2021-06-01" />);
    expect(screen.queryByTestId("bg-transfer-regulated-acq-auto")).toBeNull();
    expect(screen.getByText("취득시 조정대상지역")).toBeTruthy();
    cleanup();
    render(
      <Harness
        start={item({ acquisitionDate: new Date("2017-08-02") }, { estateAddress: { pnu: GANGNAM_PNU } } as Partial<EstateItem>)}
        giftDate="2021-06-01"
      />,
    );
    expect(screen.getByTestId("bg-transfer-regulated-acq-auto").textContent).toMatch(/^조정대상지역 아님/);
  });
  it("★ §155①2호 — 주소가 있으면 종전 주택 조정 여부는 선언 라디오 대신 자동 판정", () => {
    const tt = { previousAcquisitionDate: new Date("2015-01-01"), newAcquisitionDate: new Date("2020-06-01") };
    render(
      <Harness
        start={item({ householdHousingCount: 2, temporaryTwoHouse: tt }, { estateAddress: { pnu: GANGNAM_PNU } } as Partial<EstateItem>)}
        giftDate="2021-03-01"
      />,
    );
    expect(screen.getByTestId("temp-two-house-prev-regulated-auto").textContent).toContain("조정대상지역");
    expect(document.querySelector('input[name="prevHouseRegulatedAtNewAcquisition"]')).toBeNull();
    cleanup();
    render(<Harness start={item({ householdHousingCount: 2, temporaryTwoHouse: tt })} giftDate="2021-03-01" />);
    expect(screen.queryByTestId("temp-two-house-prev-regulated-auto")).toBeNull();
    expect(document.querySelector('input[name="prevHouseRegulatedAtNewAcquisition"]')).not.toBeNull();
  });
});

describe("UI-P §154① 단서 카드 (삭제 전 4호 OH-38 포함)", () => {
  it("★ 1주택 맥락 → 카드 · 4호 선택 → 4호 칸 · patch는 burdenedGiftTransferTax", () => {
    render(<Harness start={item()} giftDate="2021-06-01" />);
    expect(has("proviso-4ho-fields")).toBe(false);
    click("proviso-reason-rental_4ho");
    expect(bgtOf().provisoReason).toBe("rental_registration_4ho");
    expect(has("proviso-4ho-fields")).toBe(true);
    click("proviso-4ho-status-maintained");
    expect(bgtOf().proviso4hoStatus).toBe("maintained");
    // 다른 입력은 보존
    expect(bgtOf().standardPriceAtAcquisition).toBe(150_000_000);
  });
  it("부정 짝 — 1세대 1주택 OFF · 3주택이면 카드 없음", () => {
    render(<Harness start={item({ isOneHousehold: false })} giftDate="2021-06-01" />);
    expect(has("proviso-reason-rental_4ho")).toBe(false);
    cleanup();
    render(<Harness start={item({ householdHousingCount: 3 })} giftDate="2021-06-01" />);
    expect(has("proviso-reason-rental_4ho")).toBe(false);
  });
  it("일시적 2주택 맥락 → 카드는 있으나 4호는 없다(1·2가·3호만)", () => {
    const tt = { previousAcquisitionDate: new Date("2018-03-01"), newAcquisitionDate: new Date("2020-06-01") };
    render(<Harness start={item({ householdHousingCount: 2, temporaryTwoHouse: tt })} giftDate="2021-06-01" />);
    expect(has("proviso-reason-unavoidable")).toBe(true);
    expect(has("proviso-reason-rental_4ho")).toBe(false);
  });
});

describe("UI-F §154⑤ 단서 재기산 (OH-22)", () => {
  it("★ 증여 2022-03-01 · 1주택 → 섹션 · 있음/양도/2021-06-01/아니오 → patch + 미리보기", () => {
    render(<Harness start={item({ acquisitionDate: new Date("2015-03-01") })} giftDate="2022-03-01" />);
    expect(has("final-house-restart-section")).toBe(true);
    click("final-house-history-yes");
    click("final-house-kind-transfer");
    typeDate(screen.getByTestId("final-house-date-0"), "2021-06-01");
    click("final-house-temp-0-no");
    expect(bgtOf().finalHouseRestartHistory).toBe("yes");
    expect(bgtOf().finalHouseRestartDisposals).toMatchObject([
      { kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" },
    ]);
    expect(screen.getByTestId("final-house-restart-preview").textContent).toContain("2021-06-01부터 다시 셉니다");
  });
  it("부정 짝 — 증여 2022-05-10(단서 삭제 후) · 2주택이면 섹션 없음", () => {
    render(<Harness start={item({ acquisitionDate: new Date("2015-03-01") })} giftDate="2022-05-10" />);
    expect(has("final-house-restart-section")).toBe(false);
    cleanup();
    render(<Harness start={item({ acquisitionDate: new Date("2015-03-01"), householdHousingCount: 2 })} giftDate="2022-03-01" />);
    expect(has("final-house-restart-section")).toBe(false);
  });
});

describe("UI-X 주택 여부 OFF → 후속 입력 비움", () => {
  it("건물(주택 ON)에서 주택 여부를 끄면 §154① 단서·재기산 값이 사라진다", () => {
    render(
      <Harness
        start={item(
          {
            isHousing: true,
            provisoReason: "unavoidable",
            finalHouseRestartHistory: "no",
          },
          { category: "real_estate_building" } as Partial<EstateItem>,
        )}
        giftDate="2022-03-01"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /주택 여부/ }));
    expect(bgtOf().isHousing).toBeUndefined();
    expect(bgtOf().provisoReason).toBeUndefined();
    expect(bgtOf().finalHouseRestartHistory).toBeUndefined();
  });
});
