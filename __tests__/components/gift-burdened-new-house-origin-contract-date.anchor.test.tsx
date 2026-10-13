/**
 * @vitest-environment jsdom
 *
 * 증여 부담부증여 ⑤ — 권리 유래 신규 주택이면 「매매계약 체결·계약금 지급일」 칸이 사라지고 권리 취득일로 판정한다는 안내가 뜬다 (결정 #43-4 · 리뷰 S1).
 * ④(`eraFormWithOriginDates`)가 계약일 칸을 권리 취득일로 덮으므로, 칸을 그대로 열면 사용자 입력이 조용히 버려진다.
 * 양도세 판정 메뉴(`TemporaryTwoHouseSection`)와 같은 술어(`contractDateFromRightOrigin`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousingFieldSet } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftHousingFieldSet";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

afterEach(cleanup);

type TT = NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>;

/** 2019-12-17 체제(신규 2020-06-01 · 증여 2021-03-01) — 조정 여부 칸(계약일 칸 포함)이 열리는 시기 */
const bgtOf = (origin: Partial<TT>): BurdenedGiftTransferTaxInput =>
  ({
    acquisitionDate: new Date("2015-01-01"),
    isOneHousehold: true,
    householdHousingCount: 2,
    isRegulatedArea: true,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date("2020-06-01"),
      ...origin,
    },
  }) as BurdenedGiftTransferTaxInput;

function renderWith(origin: Partial<TT>) {
  const item = { id: "a", category: "real_estate_apartment", name: "아파트", standardPrice: 3e8 } as EstateItem;
  render(
    <HousingFieldSet
      bgt={bgtOf(origin)}
      set={vi.fn()}
      referenceDate="2021-03-01"
      stdPriceLabel="x"
      stdPriceHint="x"
      transferStdPrice={undefined}
      onTransferStdPriceChange={vi.fn()}
      transferStdPriceLabel="x"
      isLand={false}
      item={item}
      transferDate="2021-03-01"
    />,
  );
}

describe("S1 계약일 칸 — 권리 유래 경위", () => {
  it("분양권·승계 입주권·원조합원(상가·토지)이면 계약일 칸이 없고 권리 취득일 안내가 뜬다", () => {
    for (const kind of ["presale", "successor_right", "original_member_non_house"] as const) {
      renderWith({ newHouseOriginKind: kind, newHouseRightAcquisitionDate: "2019-04-01" });
      expect(screen.queryByTestId("temp-two-house-new-contract-date"), kind).toBeNull();
      const note = screen.getByTestId("temp-two-house-contract-date-from-row");
      expect(note.textContent).toContain("2019-04-01");
      expect(note.textContent).toContain("신규 주택 취득 경위 질문");
      cleanup();
    }
  });
  it("부정 짝 — 미답·일반·모름이면 계약일 칸이 그대로 열린다", () => {
    // 일반·모름에 권리 취득일이 남아 있어도(저장값) 계약일 칸을 덮지 않는다 — 경위가 날짜의 의미를 정한다
    for (const origin of [{}, { newHouseOriginKind: "general", newHouseRightAcquisitionDate: "2019-04-01" }, { newHouseOriginKind: "unknown", newHouseRightAcquisitionDate: "2019-04-01" }] as const) {
      renderWith(origin as Partial<TT>);
      expect(screen.queryByTestId("temp-two-house-new-contract-date")).not.toBeNull();
      expect(screen.queryByTestId("temp-two-house-contract-date-from-row")).toBeNull();
      cleanup();
    }
  });
  it("권리 취득일을 아직 입력하지 않았으면 계약일 칸을 닫지 않는다(덮을 값이 없다)", () => {
    renderWith({ newHouseOriginKind: "presale" });
    expect(screen.queryByTestId("temp-two-house-new-contract-date")).not.toBeNull();
  });
});
