/**
 * @vitest-environment jsdom
 *
 * ⑤ 양도 주택 §167의3①2호 장기임대 선언 칸 — `SellingHouseLongTermRentalSection`.
 *
 * ## 왜 필요한가
 *
 * ④ 어댑터 anchor(`selling-house-long-term-rental-surcharge.anchor.test.ts`)는
 * `sellingHouseExclusion.longTermRental`을 **직접 만들어** 페이로드를 본다. 화면에 선언 칸이
 * 없으면 그 필드는 영원히 `undefined`이고 어댑터 anchor는 그대로 초록이다
 * ([[feedback_required_field_needs_an_input_path]]).
 *
 * ## 세액이 걸린 칸이다
 *
 * 실측(조정지역 · 양도 2026-09-18): 3주택 354,541,000 → 141,966,000(**−212,575,000**),
 * 2주택 299,816,000 → 141,966,000(**−157,850,000**).
 *
 * ## ⚠️ 제목이 명부 행과 겹친다 — 스코프로 갈린다
 *
 * 「임대사업자 정식 등록」은 `HouseEntryEditor`(모달)에도 있다.
 * `e2e/transfer-multi-house-detail.spec.ts:66`이 **`dialog.getByText(..., {exact:true})`**로
 * 스코프를 걸어 두어 페이지 레벨인 이 섹션과 부딪히지 않는다
 * ([[feedback_new_widget_breaks_uniqueness_selectors]]). 경고 배너의 `data-testid`는
 * `selling-` 접두사로 따로 뒀다 — SR-5가 두 사실을 함께 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

const ON: SellingExclusion = { longTermRental: { isLongTermRental: true } };

const sw = (label: string) =>
  document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);

const TOGGLE = "양도 주택이 등록 장기임대주택";

describe("⑤ 양도 주택 장기임대 — 선언 칸이 화면에 있다", () => {
  it("SR-1 토글이 렌더된다 (미선언 상태)", () => {
    render(<SellingHouseLongTermRentalSection value={undefined} onChange={() => {}} />);
    expect(sw(TOGGLE)).toHaveAttribute("data-unchecked");
  });

  it("SR-2 값이 토글에 반영된다 — 라벨만 있고 배선이 없으면 안 된다", () => {
    const { rerender } = render(
      <SellingHouseLongTermRentalSection value={undefined} onChange={() => {}} />,
    );
    expect(sw(TOGGLE)).toHaveAttribute("data-unchecked");
    rerender(<SellingHouseLongTermRentalSection value={ON} onChange={() => {}} />);
    expect(sw(TOGGLE)).toHaveAttribute("data-checked");
  });

  it("SR-3 OFF면 세부 입력이 뜨지 않는다 (9유형·아파트·등록)", () => {
    render(<SellingHouseLongTermRentalSection value={undefined} onChange={() => {}} />);
    expect(sw("임대주택이 아파트")).toBeNull();
    expect(sw("임대사업자 정식 등록")).toBeNull();
    expect(screen.queryByText(/장기임대주택 유형/)).toBeNull();
  });

  it("SR-4 ON이면 9유형 매트릭스가 함께 뜬다 (명부 행 위젯 재사용)", () => {
    render(<SellingHouseLongTermRentalSection value={ON} onChange={() => {}} />);
    expect(sw("임대주택이 아파트")).not.toBeNull();
    expect(sw("임대사업자 정식 등록")).not.toBeNull();
    expect(screen.queryAllByText(/장기임대주택 유형/).length).toBeGreaterThan(0);
    // 사목(G)은 양도 주택 전용 목이다 — 선택지에 반드시 있어야 한다.
    expect(screen.queryAllByText(/사\. 자진·자동 말소 후 양도/).length).toBeGreaterThan(0);
  });

  it("SR-5 등록 미완비 경고의 testid가 명부 행과 **다르다** (형제 셀렉터 유일성)", () => {
    render(<SellingHouseLongTermRentalSection value={ON} onChange={() => {}} />);
    expect(screen.queryByTestId("selling-rental-registration-incomplete-warning")).not.toBeNull();
    // 명부 행의 testid는 이 화면에 등장하면 안 된다.
    expect(screen.queryByTestId("rental-registration-incomplete-warning")).toBeNull();
  });

  it("SR-6 등록이 완비되면 경고가 사라진다 (엔진 술어와 같은 판정)", () => {
    render(
      <SellingHouseLongTermRentalSection
        value={{
          longTermRental: {
            isLongTermRental: true,
            isRegisteredRental: true,
            rentalRegistrationDate: "2017-01-01",
            businessRegistrationDate: "2017-01-01",
          },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("selling-rental-registration-incomplete-warning")).toBeNull();
  });

  it("SR-7 토글을 끄면 묶음을 통째로 버린다 (끈 뒤 남은 값이 ④로 새지 않는다)", () => {
    const onChange = vi.fn();
    render(
      <SellingHouseLongTermRentalSection
        value={{ isCulturalHeritage: true, longTermRental: { isLongTermRental: true, rentalType: "E" } }}
        onChange={onChange}
      />,
    );
    (sw(TOGGLE) as HTMLElement).click();
    expect(onChange).toHaveBeenCalledWith({ isCulturalHeritage: true, longTermRental: undefined });
  });
});
