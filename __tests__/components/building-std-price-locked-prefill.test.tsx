/**
 * BuildingStdPriceForm — 세목 고정(라디오 숨김) + 소재지 prefill 검증.
 *
 * 자산 카드 모달에서 호출 세목(lockedTaxType)을 고정하고 부모 주소를 prefill하여
 * 시점 오선택·소재지 이중입력을 방지. 독립 페이지(미지정)는 라디오 유지(회귀).
 *
 * + 자산 폼 값 자동입력(prefill) 검증 — 연면적·토지면적·취득/양도 연도·일자.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";

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

  it("transferSectionLabel(PHD) 시 둘째 시점 섹션 라벨 override + 취득 시점 유지", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        transferSectionLabel="최초고시 시점"
        onResult={() => {}}
      />,
    );
    // 취득 시점 + 둘째 시점(최초고시 시점) 2시점 모두 렌더 — "양도 시점" 라벨은 대체
    expect(screen.getByText("취득 시점")).toBeTruthy();
    expect(screen.getByText("최초고시 시점")).toBeTruthy();
    expect(screen.queryByText("양도 시점")).toBeNull();
    // 공동주택 환산 토글은 PHD 맥락에서 숨김
    expect(screen.queryByText("공동주택 고시 전 취득 (취득당시 기준시가 환산)")).toBeNull();
  });
});

describe("BuildingStdPriceForm — 자산 폼 값 자동입력(prefill)", () => {
  it("initialForm 주입 시 연면적·토지면적·취득연도·양도연도가 폼에 반영", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "1997",
          acquisitionEventDate: "1997-07-12",
          transferYear: "2026",
          eventDate: "2026-02-16",
        }}
      />,
    );
    // 연면적·토지면적(DecimalInput) 값 반영
    expect(screen.getByDisplayValue("283.06")).toBeTruthy();
    expect(screen.getByDisplayValue("78.01")).toBeTruthy();
    // 취득·양도 연도(YearSelect trigger에 "YYYY년"으로 표시)
    expect(screen.getByText("1997년")).toBeTruthy();
    expect(screen.getByText("2026년")).toBeTruthy();
  });

  it("결정2 우선순위 — prefill이 restoredForm보다 우선(뒤 spread)", () => {
    // BuildingStdPriceModalButton의 병합 `{ ...restoredForm, ...prefillForm }`을
    // Form 레벨에서 재현: 같은 키를 뒤 spread 값이 이긴다.
    const restoredForm = { floorArea: "100" };
    const prefillForm = { floorArea: "283.06" };
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{ ...restoredForm, ...prefillForm }}
      />,
    );
    expect(screen.getByDisplayValue("283.06")).toBeTruthy();
    expect(screen.queryByDisplayValue("100")).toBeNull();
  });
});

describe("BuildingStdPriceModalButton — prefill 변환·병합 통합", () => {
  it("prefill 지정 시 모달 오픈하면 연면적·토지면적·날짜에서 파생한 연도 반영", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionDate: "1997-07-12",
          transferDate: "2026-02-16",
        }}
        onApplyBoth={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    // 연면적·토지면적 자동 채움
    expect(await screen.findByDisplayValue("283.06")).toBeTruthy();
    expect(screen.getByDisplayValue("78.01")).toBeTruthy();
    // 날짜에서 파생한 취득연도(1997년)·양도연도(2026년)
    expect(screen.getByText("1997년")).toBeTruthy();
    expect(screen.getByText("2026년")).toBeTruthy();
  });

  it("빈 값(floorArea 미지정)은 미주입 — 필드 비어있음", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{ landAreaM2: "78.01", acquisitionDate: "1997-07-12" }}
        onApplyBoth={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    expect(await screen.findByDisplayValue("78.01")).toBeTruthy();
    // floorArea 미주입 → "283.06" 같은 값 없음(빈 연면적 필드)
    expect(screen.queryByDisplayValue("283.06")).toBeNull();
  });
});
