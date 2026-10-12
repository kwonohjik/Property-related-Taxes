/**
 * @vitest-environment jsdom
 *
 * ⑤ §155⑳ 임대주택 카드 — 「거주주택 양도일 현재 이 임대주택의 기준시가」 칸(영 §167의3①1호 · 결정 #20 C 후속).
 *
 * route anchor(`transfer.route.rental-155-20-unmet-restore-x1-1-g8-1.anchor.test.ts` L-*)는 폼 값을 직접 넣어 본다 — 화면에 칸이
 * 없으면 그 값은 영원히 비어 있고 route anchor는 그대로 초록이다. 이 파일이 칸의 존재와 범위(④와 같은 술어)를 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | LP-1 | 소재지가 가액기준 지역(청주)이면 칸이 있고, 입력하면 그 값이 저장된다 |
 * | LP-2 | 지역기준 지역(부산 광역시) · 주소 없음이면 칸이 없다 |
 * | LP-4 | 섹션 배선 — 카드를 그리는 `facts`(판정 메뉴 — 계산기가 넘겨받는 입력 경로)·`full`(부담부증여)에 칸이 있다.
 * |      | `calc`(계산기)는 카드 자체를 그리지 않는다(판정 메뉴에서 넘겨받는다) |
 * | LP-5 | 기존사업자(나목) 호에도 소재지 칸이 있고, 가액기준 지역이면 기준시가 칸도 열린다 — 종전에는 나목만 소재지 칸이 빠져 입력 경로가 없었다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { rentalUnitLowPriceInScope } from "@/lib/calc/rental-unit-low-price-scope";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

const LABEL = "거주주택 양도일 현재 이 임대주택의 기준시가";
const unitAt = (regionCode: string) => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2019-03-01",
  rentalRegistrationDate: "2019-03-01",
  region: "non-metro" as const,
  regionCode,
  rentalAddressJibun: regionCode ? "충청북도 청주시 상당구 문화동 1" : "",
});

function renderCard(regionCode: string, onChange = vi.fn()) {
  render(
    <RentalUnitCard
      unit={unitAt(regionCode)}
      index={0}
      onChange={onChange}
      onRemove={() => {}}
      canRemove={false}
      transferDate="2026-09-18"
    />,
  );
  return onChange;
}

describe("임대주택 카드 — 거주주택 양도일 현재 기준시가 칸 (영 §167의3①1호)", () => {
  it("LP-1 ★ 가액기준 지역(청주)이면 칸이 있고 입력값이 저장된다", () => {
    const onChange = renderCard("4311110100");
    expect(screen.getByText(LABEL)).toBeTruthy();
    // 위젯 = [공시가격 연도 Select · 기준시가 금액] — 금액 칸은 묶음 안의 마지막 input이다.
    const inputs = screen.getByText(LABEL).closest("div")!.parentElement!.querySelectorAll("input");
    const input = inputs[inputs.length - 1] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "200000000" } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0].officialPriceAtResidenceTransfer.replace(/,/g, "")).toBe("200000000");
  });
  it("LP-2 지역기준 지역(부산) · 주소 없음이면 칸이 없다 — ④ 전송 술어와 같다", () => {
    renderCard("2611010100");
    expect(screen.queryByText(LABEL)).toBeNull();
    cleanup();
    renderCard("");
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(rentalUnitLowPriceInScope({ regionCode: "2611010100" })).toBe(false);
    expect(rentalUnitLowPriceInScope({ regionCode: "" })).toBe(false);
    expect(rentalUnitLowPriceInScope({ regionCode: "4311110100" })).toBe(true);
  });

  for (const [mode, shown] of [["facts", true], ["full", true], ["calc", false]] as const) {
    it(`LP-4 섹션 mode="${mode}" → 칸 ${shown ? "있음" : "없음"}`, () => {
      const a = makeDefaultAsset(1);
      const rh = { ...a.rentalHousingException, applyException: true, scenario: "A" as const, rentalUnits: [unitAt("4311110100")] };
      render(
        <RentalHousingExceptionSection
          mode={mode}
          rh={rh}
          asset={{ ...a, assetKind: "housing", rentalHousingException: rh }}
          acquisitionDate="2015-01-01"
          transferDate="2026-09-18"
          onChangeResidence={() => {}}
          onChange={() => {}}
        />,
      );
      expect(screen.queryByText(LABEL) !== null).toBe(shown);
    });
  }

  it("LP-5 ★ 기존사업자(나목) 호 — 소재지 칸이 있고, 가액기준 지역이면 양도일 현재 기준시가 칸도 열린다", () => {
    render(
      <RentalUnitCard
        unit={{ ...unitAt("4311110100"), rentalCategory: "existing_business", businessRegistrationDate: "2003-01-01", rentalRegistrationDate: "2003-01-01" }}
        index={0}
        onChange={() => {}}
        onRemove={() => {}}
        canRemove={false}
        transferDate="2026-09-18"
      />,
    );
    expect(screen.getByTestId("rental-address-0")).toBeTruthy();
    expect(screen.getByText(LABEL)).toBeTruthy();
  });
});
