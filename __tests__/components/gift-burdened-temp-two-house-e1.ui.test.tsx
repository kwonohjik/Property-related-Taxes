/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — E-1 · 증여세 부담부증여 양도 경로에 §155①2호 새 입력 위젯이 **실제로 배선**됐는가
 *
 * 렌더 진입점은 증여세 마법사가 쓰는 `EstateBodyRealEstate`(mode="gift")다 — 증여일이
 * `valuationDate`로 들어와 `BurdenedGiftTransferSection` → `HousingFieldSet`까지 내려가는지를 본다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-1 | 결론을 바꾸는 증여(양도) 시기(2021-03-01)에만 블록이 뜬다 · 2023-06-01이면 없다(부정 짝) |
 * | UI-2 | 선언 라디오 → `burdenedGiftTransferTax.temporaryTwoHouse`에 patch, 두 날짜는 보존 |
 * | UI-3 | 날짜를 고쳐도 이미 받은 새 입력이 사라지지 않는다(종전 setter는 두 날짜로 덮어썼다) |
 * | UI-4 | 이 화면엔 보유 주택 목록이 없다 — 「목록에서 주소를 검색하면 자동 판정」 안내를 띄우지 않는다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

function item(tt: Record<string, unknown> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2015-01-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: true,
      residencePeriodMonths: 0,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2015-01-01"),
        newAcquisitionDate: new Date("2020-06-01"),
        ...tt,
      },
    },
  } as unknown as EstateItem;
}

const block = () => screen.queryByTestId("temp-two-house-regulated-block");
const radio = (name: string, value: string) =>
  document.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
const renderGift = (it: EstateItem, giftDate: string, onUpdate: (i: EstateItem) => void = () => {}) =>
  render(
    <EstateBodyRealEstate item={it} onUpdate={onUpdate} valuationDate={giftDate} mode="gift" showCollateralDeductToggle={false} />,
  );
const ttOf = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)![0] as EstateItem).burdenedGiftTransferTax!.temporaryTwoHouse as Record<string, unknown>;

describe("UI-1 노출 게이트 — 증여일(양도일) 기준", () => {
  it("증여 2021-03-01(조정→조정 단축 기한 시기) → 블록 · 전입일 칸이 뜬다", () => {
    renderGift(item(), "2021-03-01");
    expect(block()).not.toBeNull();
    expect(screen.queryByTestId("temp-two-house-move-in-date")).not.toBeNull();
  });
  it("부정 짝 — 증여 2023-06-01(본문 3년뿐) → 블록 없음", () => {
    renderGift(item(), "2023-06-01");
    expect(block()).toBeNull();
  });
});

describe("UI-2 선언 라디오 → 부담부증여 입력 patch", () => {
  it("신규 주택 「조정대상지역 아님」 → newHouseRegulatedAtAcquisition = no, 두 날짜 보존", () => {
    const onUpdate = vi.fn();
    renderGift(item(), "2021-03-01", onUpdate);
    fireEvent.click(radio("newHouseRegulatedAtAcquisition", "no")!);
    const tt = ttOf(onUpdate);
    expect(tt.newHouseRegulatedAtAcquisition).toBe("no");
    expect((tt.newAcquisitionDate as Date).toISOString().slice(0, 10)).toBe("2020-06-01");
    expect((tt.previousAcquisitionDate as Date).toISOString().slice(0, 10)).toBe("2015-01-01");
  });
});

describe("UI-3 날짜 수정이 새 입력을 지우지 않는다", () => {
  it("전입일이 있는 상태에서 신규 주택 취득일을 고쳐도 newHouseMoveInDate 보존", () => {
    const onUpdate = vi.fn();
    renderGift(item({ newHouseMoveInDate: "2021-01-01", prevHouseRegulatedAtNewAcquisition: "yes" }), "2021-03-01", onUpdate);
    // 「신규 주택 취득일」 FieldCard 안의 월 칸 — 라벨의 가장 가까운 div(FieldCard 루트)로 스코프한다
    //   (한 단계 위는 종전 주택 칸까지 포함해 엉뚱한 setter를 친다).
    const card = screen.getByText("신규 주택 취득일").closest("div")!;
    fireEvent.change(card.querySelector('input[aria-label="월"]')!, { target: { value: "07" } });
    const tt = ttOf(onUpdate);
    expect((tt.newAcquisitionDate as Date).toISOString().slice(0, 10)).toBe("2020-07-01");
    expect(tt.newHouseMoveInDate).toBe("2021-01-01");
    expect(tt.prevHouseRegulatedAtNewAcquisition).toBe("yes");
  });
  it("종전 주택 취득일을 고쳐도 보존", () => {
    const onUpdate = vi.fn();
    renderGift(item({ newHouseMoveInDate: "2021-01-01" }), "2021-03-01", onUpdate);
    const card = screen.getByText("종전 주택 취득일").closest("div")!;
    fireEvent.change(card.querySelector('input[aria-label="월"]')!, { target: { value: "02" } });
    const tt = ttOf(onUpdate);
    expect((tt.previousAcquisitionDate as Date).toISOString().slice(0, 10)).toBe("2015-02-01");
    expect(tt.newHouseMoveInDate).toBe("2021-01-01");
  });
});

describe("UI-4 보유 주택 목록 안내 없음", () => {
  it("선언 라디오는 뜨고, 목록 주소 자동 판정 안내는 없다", () => {
    renderGift(item(), "2021-03-01");
    expect(radio("newHouseRegulatedAtAcquisition", "yes")).not.toBeNull();
    expect(radio("prevHouseRegulatedAtNewAcquisition", "yes")).not.toBeNull();
    expect(block()!.textContent).not.toContain("보유 주택 목록");
  });
});
