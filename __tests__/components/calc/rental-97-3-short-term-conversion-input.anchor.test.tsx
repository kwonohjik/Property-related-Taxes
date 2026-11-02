/**
 * anchor — §97의3 입력 화면: 단기→장기 변경신고 구분 (PR-C #3 ⑤)
 *
 * - 선택지는 `value`로 단언한다(__tests__/components/CLAUDE.md — 라벨 단언은 값 축을 못 지킨다).
 * - 「2020.7.10 이전」에서만 신고일·수리일 입력이 보인다. 다른 선택으로 바꾸면 두 날짜를 비운다(useEffect 아님 — onChange).
 * - 구 boolean(`isConvertedFromShortTerm`)은 `after`와 같은 의미로 함께 쓴다.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { radioValues, checkedRadioValue } from "../_helpers/radio-values";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderForm(over: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const value = { ...getReductionDefault("rental_97_3"), ...over } as never;
  const { container } = render(<Rental973InputForm value={value} onChange={onChange} transferDate="2026-04-01" />);
  return { container, onChange };
}

const NAME = "shortTermConversionMode_973";

describe("§97의3 단기→장기 변경신고 구분", () => {
  it("선택지 값 3종 · 기본 none", () => {
    const { container } = renderForm();
    expect(radioValues(container, NAME)).toEqual(["none", "before", "after"]);
    expect(checkedRadioValue(container, NAME)).toBe("none");
  });

  it("before에서만 신고일·수리일 입력이 보인다", () => {
    const none = renderForm();
    expect(none.container.querySelector('[data-field="reduction.rental_97_3.conversionReportedDate"]')).toBeNull();
    cleanup();
    const before = renderForm({ shortTermConversionMode: "before" });
    expect(before.container.querySelector('[data-field="reduction.rental_97_3.conversionReportedDate"]')).not.toBeNull();
    expect(before.container.querySelector('[data-field="reduction.rental_97_3.conversionAcceptedDate"]')).not.toBeNull();
  });

  it("after 선택 — 구 boolean을 함께 쓰고 날짜를 비운다", () => {
    const { container, onChange } = renderForm({
      shortTermConversionMode: "before",
      conversionReportedDate: "2019-05-01",
      conversionAcceptedDate: "2019-05-01",
    });
    const after = container.querySelector(`input[name^="${NAME}"][value="after"]`) as HTMLInputElement;
    fireEvent.click(after);
    expect(onChange).toHaveBeenCalledWith({
      shortTermConversionMode: "after",
      isConvertedFromShortTerm: true,
      conversionReportedDate: "",
      conversionAcceptedDate: "",
    });
  });

  it("before 선택 — 날짜를 지우지 않고 boolean은 false", () => {
    const { container, onChange } = renderForm();
    fireEvent.click(container.querySelector(`input[name^="${NAME}"][value="before"]`) as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith({ shortTermConversionMode: "before", isConvertedFromShortTerm: false });
  });

  it("구분 라디오는 「임대사업자 등록일」 입력 **앞**에 있다 (모드 토글은 영향 필드 직전 — 등록일의 의미를 바꾼다)", () => {
    const { container } = renderForm({ shortTermConversionMode: "before" });
    const html = container.innerHTML;
    const radioAt = html.indexOf(`name="${NAME}`);
    const regAt = html.indexOf('data-field="reduction.rental_97_3.registrationDate"');
    expect(radioAt).toBeGreaterThan(-1);
    expect(regAt).toBeGreaterThan(-1);
    expect(radioAt).toBeLessThan(regAt);
  });

  it("자동 산출 임대기간은 의제 개시일 기준 — 단기 등록 2016-03-01, 신고·수리 2019-05-01, 양도 2026-04-01 → 10년 1개월", () => {
    renderForm({
      registrationDate: "2016-03-01",
      rentalStartDate: "2016-03-01",
      shortTermConversionMode: "before",
      conversionReportedDate: "2019-05-01",
      conversionAcceptedDate: "2019-05-01",
    });
    expect(screen.getByText("10년 1개월")).toBeTruthy();
    expect(screen.getByTestId("rental973-effective-start").textContent).toBe("2016-03-01");
  });
});
