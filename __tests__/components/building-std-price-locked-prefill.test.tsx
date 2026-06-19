/**
 * BuildingStdPriceForm — 세목 고정(라디오 숨김) + 소재지 prefill 검증.
 *
 * 자산 카드 모달에서 호출 세목(lockedTaxType)을 고정하고 부모 주소를 prefill하여
 * 시점 오선택·소재지 이중입력을 방지. 독립 페이지(미지정)는 라디오 유지(회귀).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";

const ADDR = {
  road: "서울특별시 서초구 남부순환로297나길 13",
  jibun: "방배동 593-64",
  building: "방배동 아파트",
  detail: "",
  lng: "126.993824",
  lat: "37.475198",
};

describe("BuildingStdPriceForm — 세목 고정 + 소재지 prefill", () => {
  it("lockedTaxType 지정 시 세목 라디오 숨김 + 부모 주소 prefill", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="inheritance_gift"
        initialAddress={ADDR}
        onResult={() => {}}
      />,
    );
    // 세목 라디오 숨김
    expect(screen.queryByText("양도(취득·양도 2시점)")).toBeNull();
    expect(screen.queryByText("상속·증여(1시점)")).toBeNull();
    // 소재지 검색창에 부모 주소 자동 채움
    expect(screen.getByDisplayValue(ADDR.road)).toBeTruthy();
  });

  it("lockedTaxType 미지정(독립 페이지) 시 세목 라디오 노출 — 회귀", () => {
    render(<BuildingStdPriceForm onResult={() => {}} />);
    expect(screen.getByText("양도(취득·양도 2시점)")).toBeTruthy();
    expect(screen.getByText("상속·증여(1시점)")).toBeTruthy();
  });
});
