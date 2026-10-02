/**
 * @vitest-environment jsdom
 *
 * ⑤ 소령 §167의3①3호 감면대상장기임대주택 입력 칸 — 양도 주택 섹션 · 명부 행 「특례 구분」 칩.
 *
 * ④ 어댑터 anchor(`tax-incentive-rental-3ho-wiring.anchor.test.ts`)는 폼 값을 **직접 만들어** 본다 —
 * 화면에 칸이 없으면 그 값은 영원히 undefined이고 어댑터 anchor는 그대로 초록이다
 * ([[feedback_required_field_needs_an_input_path]]). 이 파일이 칸의 존재와 OFF 리셋 규약을 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SellingHouseTaxIncentiveRentalSection } from "@/components/calc/transfer/SellingHouseTaxIncentiveRentalSection";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

const sw = (label: string) => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);
const SELLING_TOGGLE = "양도 주택이 조특법 감면 임대주택";
const ROW_CHIP = "조특법 감면 임대주택(3호)";

function makeHouse(overrides: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...overrides,
  };
}

describe("⑤ 양도 주택 3호 섹션", () => {
  it("TU-1 미선언이면 토글만 있고 세부 칸은 없다", () => {
    render(<SellingHouseTaxIncentiveRentalSection value={undefined} onChange={() => {}} />);
    expect(sw(SELLING_TOGGLE)).toHaveAttribute("data-unchecked");
    expect(sw("국민주택")).toBeNull();
  });

  it("TU-2 선언하면 임대기간·국민주택·아파트 칸이 뜨고, 아파트면 후단 매입 여부를 묻는다", () => {
    const { rerender } = render(
      <SellingHouseTaxIncentiveRentalSection
        value={{ taxIncentiveRental: { isTaxIncentiveRental: true } }}
        onChange={() => {}}
      />,
    );
    expect(sw(SELLING_TOGGLE)).toHaveAttribute("data-checked");
    expect(screen.getByText("임대기간 (년)")).toBeTruthy();
    expect(sw("국민주택")).not.toBeNull();
    expect(sw("임대주택이 아파트")).not.toBeNull();
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).toBeNull();

    rerender(
      <SellingHouseTaxIncentiveRentalSection
        value={{ taxIncentiveRental: { isTaxIncentiveRental: true, isApartment: true } }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).not.toBeNull();
    // 등록 유형은 매입이 확정된 뒤에만 묻는다(엔진 판정 순서)
    expect(screen.queryByText(/등록 유형/)).toBeNull();
  });

  it("TU-3 매입 → 장기일반이면 도시형 생활주택을, 아님이면 ⑪ 연장 기산일을 묻는다", () => {
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{
          taxIncentiveRental: {
            isTaxIncentiveRental: true,
            isApartment: true,
            isTaxIncentiveRentalPurchase: true,
            taxIncentiveRentalRegistrationType: "long_term_general",
            isUrbanLifeHousingApartment: false,
          },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/등록 유형/)).toBeTruthy();
    expect(screen.getByText(/도시형 생활주택인 아파트/)).toBeTruthy();
    // ⑪ 연장 사유는 3-state(모름·없음·있음) — 기본 「모름」이면 날짜 칸은 닫혀 있다
    expect(screen.getByTestId("apt-deadline-ext-status-tir-selling")).toBeTruthy();
    expect(screen.queryByText(/⑪3호 — 이전고시일/)).toBeNull();
  });

  it("TU-3b ⑪ 「연장 사유 있음」(또는 #1914 저장분: 날짜만 있음)이면 세 호 날짜 칸을 연다", () => {
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{
          taxIncentiveRental: {
            isTaxIncentiveRental: true,
            isApartment: true,
            isTaxIncentiveRentalPurchase: true,
            taxIncentiveRentalRegistrationType: "long_term_general",
            isUrbanLifeHousingApartment: false,
            taxIncentiveRentalAptDeadlineExtension: { relocationAnnouncementDate: "2027-06-01" },
          },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/⑪3호 — 이전고시일/)).toBeTruthy();
  });

  it("TU-4 2호가 켜져 있으면 임대기간·아파트 칸을 다시 그리지 않는다 (같은 사실 두 벌 금지)", () => {
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{
          longTermRental: { isLongTermRental: true, isApartment: true, rentalPeriodYears: "8" },
          taxIncentiveRental: { isTaxIncentiveRental: true },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("임대기간 (년)")).toBeNull();
    expect(sw("임대주택이 아파트")).toBeNull();
    // 아파트 여부는 2호 칸 값(true)으로 후단을 연다
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).not.toBeNull();
  });

  it("TU-5 토글을 끄면 묶음을 통째로 버린다 (남은 값이 ④로 새지 않는다)", () => {
    const onChange = vi.fn();
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{ isCulturalHeritage: true, taxIncentiveRental: { isTaxIncentiveRental: true, rentalPeriodYears: "6" } }}
        onChange={onChange}
      />,
    );
    (sw(SELLING_TOGGLE) as HTMLElement).click();
    expect(onChange).toHaveBeenCalledWith({ isCulturalHeritage: true, taxIncentiveRental: undefined });
  });
});

describe("⑤ 명부 행 「특례 구분」 3호 칩", () => {
  it("TU-6 기본(판정 메뉴)에서는 칩이 없다 — 계산기만 연다", () => {
    render(<HouseEntryEditor house={makeHouse()} onUpdate={() => {}} />);
    expect(sw(ROW_CHIP)).toBeNull();
  });

  it("TU-7 계산기에서는 칩이 있고, 켜면 임대기간·국민주택 칸이 뜬다", () => {
    const { rerender } = render(
      <HouseEntryEditor house={makeHouse()} onUpdate={() => {}} taxIncentiveRentalEnabled />,
    );
    expect(sw(ROW_CHIP)).toHaveAttribute("data-unchecked");
    expect(sw("국민주택")).toBeNull();
    rerender(
      <HouseEntryEditor house={makeHouse({ isTaxIncentiveRental: true })} onUpdate={() => {}} taxIncentiveRentalEnabled />,
    );
    expect(sw("국민주택")).not.toBeNull();
  });

  it("TU-8 칩 OFF는 3호 전용 사실을 지우되, 2호가 켜져 있으면 공유 칸(임대기간)을 남긴다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({ isTaxIncentiveRental: true, isLongTermRental: true, rentalPeriodYears: "6", isTaxIncentiveRentalPurchase: true })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw(ROW_CHIP) as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isTaxIncentiveRental: false, isTaxIncentiveRentalPurchase: undefined, rentalPeriodYears: "6" }),
    );
  });

  it("TU-9 2호 OFF도 3호가 켜져 있으면 임대기간을 지우지 않는다 (공유 칸 보존)", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({ isTaxIncentiveRental: true, isLongTermRental: true, rentalPeriodYears: "6" })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw("장기임대 등록주택") as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isLongTermRental: false, rentalPeriodYears: "6" }));
  });
});

/**
 * TU-10 판정 메뉴 **배선** — TU-6은 `HouseEntryEditor` 기본값만 본다(라이브러리 anchor ≠ 배선 증명,
 * [[feedback_library_anchor_does_not_prove_component_uses_it]]). 판정 메뉴 `Step2`가 `hideSellingHouseExclusion`을
 * 넘겨 `HousesListSection`이 `taxIncentiveRentalEnabled={false}`로 편집 창을 여는지를 화면째로 고정한다.
 *
 * 3호(소령 §167의3①3호)는 다주택 **중과 배제** 열거이고, 판정 route(`app/api/calc/one-house-exemption/route.ts`)는
 * 중과 엔진을 부르지 않으며 `isTaxIncentiveRental`을 읽는 엔진 코드는 `multi-house-surcharge*`뿐이다 —
 * 판정 메뉴에 칩을 두면 「입력해도 아무 데도 가지 않는 칸」이 된다(route 무영향은
 * `transfer.route.tax-incentive-rental-3ho-period-required.anchor.test.ts` P-4).
 */
describe("TU-10 판정 메뉴 Step2 — 명부 편집 창에 3호 칩이 없다 (계산기 명부에는 있다)", () => {
  it("판정 메뉴: 편집 창을 열어도 3호 칩 없음", async () => {
    const { Step2 } = await import("@/app/calc/one-house-exemption/steps/Step2");
    const { createInitialOneHouseJudgmentForm } = await import("@/lib/stores/one-house-judgment-form.types");
    const f = createInitialOneHouseJudgmentForm();
    const form = {
      ...f,
      isOneHousehold: true,
      transferDate: "2026-03-01",
      assets: [{ ...f.assets[0], assetKind: "housing" as const, acquisitionDate: "2015-01-01" }],
      houses: [makeHouse()],
    };
    render(<Step2 form={form} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(sw("장기임대 등록주택")).not.toBeNull(); // 편집 창이 실제로 열렸다(짝 단언)
    expect(sw(ROW_CHIP)).toBeNull();
  });

  it("계산기: 같은 명부 섹션(숨김 prop 없음)에서는 3호 칩이 있다", async () => {
    const { HousesListSection } = await import("@/app/calc/transfer-tax/steps/step4-sections/HousesListSection");
    const { createDefaultTransferFormData } = await import("@/lib/stores/calc-wizard-store");
    render(<HousesListSection form={{ ...createDefaultTransferFormData(), houses: [makeHouse()] }} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(sw(ROW_CHIP)).not.toBeNull();
  });
});
