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
 * | UI-G4 | §155④⑤ 합가 — 계산기와 같은 `MergeDateSection`이 세대 2주택 이상일 때 뜨고 patch가 `burdenedGiftTransferTax`에 들어간다 · 주택 여부 OFF면 비운다 |
 * | UI-G3 | §155⑯·⑱ — 판정 메뉴와 같은 `TempTwoHouseDeadlineExceptionInputs`가 세대 2주택 + 두 날짜일 때 뜨고 patch가 `temporaryTwoHouse`에 들어간다 · ⑯ 신규 주택 소재지는 E-1 잔여 B와 같은 칸(`newHouseRegionCode`) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
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

describe("UI-G3 §155⑯ 공공기관 이전 · §155⑱ 처분 지연 사유", () => {
  const tt = { previousAcquisitionDate: new Date("2015-01-01"), newAcquisitionDate: new Date("2020-01-01") };
  it("★ ⑯ 켜기 → 이전지·신규 주택 소재지 → 코드 저장 · 연접 판정 안내 / ⑱ 사유 선택 → disposalDelayReason", () => {
    render(<Harness start={item({ acquisitionDate: new Date("2015-01-01"), householdHousingCount: 2, temporaryTwoHouse: tt })} giftDate="2023-06-01" />);
    fireEvent.click(screen.getByRole("switch", { name: /공공기관·법인 지방이전 특례/ }));
    expect(bgtOf().temporaryTwoHouse?.publicInstitutionRelocation).toBe(true);
    const picks = screen.getAllByTestId("mock-address-pick");
    // 증여 주택 소재지 · 이전지 · 신규 주택 — ⑯이 켜지면 §155①2호 신규 주택 칸(E-1 잔여 B)은 닫혀 한 칸만 남는다
    expect(picks).toHaveLength(3);
    fireEvent.click(picks[1]);
    expect(bgtOf().temporaryTwoHouse?.relocatedSigunguCode).toBe("2826000000");
    fireEvent.click(screen.getAllByTestId("mock-address-pick")[2]);
    expect(bgtOf().temporaryTwoHouse).toMatchObject({ newHouseRegionCode: "2826010100", newHouseJibun: "인천광역시 서구 x" });
    expect(screen.getByTestId("relocation-region-verdict").textContent).toContain("이전한 시·군에 신규 주택이 소재합니다");
    fireEvent.click(screen.getByText("법원 경매 신청"));
    expect(bgtOf().temporaryTwoHouse?.disposalDelayReason).toBe("auction");
    // 다른 §155① 값은 보존
    expect(bgtOf().temporaryTwoHouse?.previousAcquisitionDate).toBeInstanceOf(Date);
  });
  it("부정 짝 — 세대 1주택이면 위젯 없음", () => {
    render(<Harness start={item({ householdHousingCount: 1, temporaryTwoHouse: tt })} giftDate="2023-06-01" />);
    expect(screen.queryByRole("switch", { name: /공공기관·법인 지방이전 특례/ })).toBeNull();
  });
});

describe("UI-G4 §155④⑤ 합가", () => {
  it("★ 세대 2주택 → 합가일·먼저 양도 → bgt에 계산기와 같은 이름으로 들어간다", () => {
    render(<Harness start={item({ householdHousingCount: 2 })} giftDate="2023-06-01" />);
    typeDate(screen.getByTestId("merge-date-marriage"), "2020-01-01");
    expect(bgtOf().marriageDate).toBe("2020-01-01");
    fireEvent.click(screen.getByRole("switch", { name: /세대 내 먼저 양도하는 주택/ }));
    expect(bgtOf().isFirstTransferredInMerge).toBe(true);
    expect(bgtOf().householdHousingCount).toBe(2);
  });
  it("부정 짝 — 세대 1주택이면 위젯 없음", () => {
    render(<Harness start={item({ householdHousingCount: 1 })} giftDate="2023-06-01" />);
    expect(screen.queryByTestId("merge-date-marriage")).toBeNull();
  });
  it("주택 여부를 끄면 합가 입력을 비운다", () => {
    render(
      <Harness
        start={item(
          { isHousing: true, householdHousingCount: 2, marriageDate: "2020-01-01", isFirstTransferredInMerge: true },
          { category: "real_estate_building" } as Partial<EstateItem>,
        )}
        giftDate="2023-06-01"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /주택 여부/ }));
    expect(bgtOf().marriageDate).toBeUndefined();
    expect(bgtOf().isFirstTransferredInMerge).toBeUndefined();
  });
});

describe("UI-G6 상속받은 자산 — 환산취득가액(K-5) 라디오 비활성 (⑧과 같은 술어)", () => {
  const land = (bgt: Partial<BurdenedGiftTransferTaxInput>) =>
    item(
      { isOneHousehold: undefined, householdHousingCount: undefined, residencePeriodMonths: undefined, valuationMode: "sangjeungbeop_market", ...bgt },
      { category: "real_estate_land" } as Partial<EstateItem>,
    );
  const k5 = () => screen.getByTestId("bg-acq-method-converted") as HTMLInputElement;
  it("★ 상속(개시 2018-03-01) → K-5 비활성 · 안내 문구", () => {
    render(<Harness start={land({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" })} giftDate="2021-06-01" />);
    expect(k5().disabled).toBe(true);
    expect(screen.getByText(/환산\(K-5\)을 쓸 수 없습니다/)).toBeTruthy();
  });
  it("부정 짝 — 매매면 K-5 활성", () => {
    render(<Harness start={land({})} giftDate="2021-06-01" />);
    expect(k5().disabled).toBe(false);
    expect(screen.queryByText(/환산\(K-5\)을 쓸 수 없습니다/)).toBeNull();
  });
});

describe("UI-G6c 양도세 계산기 부담부증여 블록 — 같은 술어로 환산 라디오 비활성", () => {
  const asset = (over: Record<string, unknown>) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "land",
      transferType: "burdened_gift",
      acquisitionDate: "2020-06-01",
      inheritanceStartDate: "2020-06-01",
      bgValuationMode: "sangjeungbeop_market",
      ...over,
    }) as AssetForm;
  const convertedRadio = () =>
    (screen.getByText("환산취득가액").closest("label") as HTMLElement).querySelector("input") as HTMLInputElement;
  it("★ 상속 → 환산 비활성 · 안내", () => {
    render(<BurdenedGiftBlock asset={asset({ acquisitionCause: "inheritance" })} onChange={() => {}} transferDate="2021-06-01" />);
    expect(convertedRadio().disabled).toBe(true);
    expect(screen.getByText(/상속개시일 현재 상증법 평가액이 취득가액이라 쓸 수 없습니다/)).toBeTruthy();
  });
  it("부정 짝 — 매매면 활성", () => {
    render(<BurdenedGiftBlock asset={asset({ acquisitionCause: "purchase" })} onChange={() => {}} transferDate="2021-06-01" />);
    expect(convertedRadio().disabled).toBe(false);
  });
});
