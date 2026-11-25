/**
 * ⑤ UI anchor — 재산세 Step 3 «같은 관할구역의 다른 토지(합산)» 칸 노출 경계(PSA-E4).
 * 노출 집합 = 엔진 술어(`propertyLandSplitRequiredFor`)가 정한다 — 칸 노출 ≡ ⑧ 요구 ≡ ⑫ 요구.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Step3 } from "@/components/calc/property/Step3";
import { INITIAL_FORM, type FormState } from "@/components/calc/property/shared";

afterEach(cleanup);

const land = (over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  publishedPrice: "300,000,000",
  ...over,
});
const SEP = { landTaxType: "separate_aggregate" as const, saZoningDistrict: "commercial", saBuildingFloorArea: "100", saBuildingPermit: "yes" as const };

const has = (id: string) => screen.queryByTestId(id) !== null;

describe("Step 3 합산 칸 노출", () => {
  it("직접 종합합산 — 종합합산 칸만", () => {
    render(<Step3 form={land({ landTaxType: "comprehensive_aggregate" })} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(true);
    expect(has("other-separate-aggregate-value")).toBe(false);
  });

  it("별도합산 전량 인정 — 별도합산 칸만", () => {
    render(<Step3 form={land({ ...SEP, saLandArea: "300" })} onChange={vi.fn()} />);
    expect(has("other-separate-aggregate-value")).toBe(true);
    expect(has("other-comprehensive-value")).toBe(false);
  });

  it("별도합산 + 면적 초과 이관 — 두 칸", () => {
    render(<Step3 form={land({ ...SEP, saLandArea: "1000", saZoningDistrict: "industrial" })} onChange={vi.fn()} />);
    expect(has("other-separate-aggregate-value")).toBe(true);
    expect(has("other-comprehensive-value")).toBe(true);
  });

  it("별도합산 철거 1년 초과 전량 이관 — 종합합산 칸만", () => {
    const year = new Date().getFullYear();
    render(
      <Step3
        form={land({ ...SEP, saLandArea: "300", saDemolished: true, saDemolishedDate: `${year - 2}-01-01` })}
        onChange={vi.fn()}
      />,
    );
    expect(has("other-comprehensive-value")).toBe(true);
    expect(has("other-separate-aggregate-value")).toBe(false);
  });

  it("분리과세·주택 — 칸 없음", () => {
    render(<Step3 form={land({ landTaxType: "separated" })} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(false);
    cleanup();
    render(<Step3 form={{ ...INITIAL_FORM, objectType: "housing" }} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(false);
    expect(has("other-separate-aggregate-value")).toBe(false);
  });

  it("입력 → onChange에 문자열 그대로(빈칸과 0을 구분해 전달)", () => {
    const onChange = vi.fn();
    render(<Step3 form={land({ landTaxType: "comprehensive_aggregate" })} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("other-comprehensive-value"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith({ otherComprehensiveValue: "0" });
  });
});
