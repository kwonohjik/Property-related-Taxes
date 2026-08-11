/**
 * Pre-Do anchor — 배치 모달 「공시지가 기준연도」 축 분리 (버그 ②) + 조회 탈출구 (버그 ①).
 *
 * ## 왜 두 축인가
 *
 * `points[].year`는 **건물기준시가 고시 체계 연도**다 — 구조·용도 코드표가 그 해 체계를 따른다
 * (2001 #21 ↔ 2005 #22 ↔ 2026 #28이 같은 오피스텔). 반면 위치지수에 쓰는 **개별공시지가의
 * 기준연도**는 매년 5/31 공시라 그 이전 날짜면 **전년도**다(`recommendLandPriceYear`).
 *
 * 실측 결함: 양도일 2026-02-19 → 모달 라벨이 "양도시 (2026년) 공시지가"인데, 그 칸에 채워진
 * 값은 상위 화면이 **2025년** 기준으로 조회한 공시지가였다. 라벨과 값의 연도가 어긋난다.
 *
 * L-Y3은 상위 값을 그대로 쓸 수 없는 시점(토지·건물 취득일 상이)의 탈출구를 고정한다 —
 * 빈 칸만 남기면 사용자가 그 연도 공시지가를 구할 경로가 없다(dead-end 금지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MultiPointBuildingStdPriceModal } from "../../components/calc/building-std-price/MultiPointBuildingStdPriceModal";

afterEach(cleanup);

const open = () => fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));

describe("L-Y1 — 공시지가 라벨은 landPriceYear를 따른다(고시 체계 연도와 별개 축)", () => {
  it("건물 취득 2022 · 양도 2026-02-19 → 공시지가 라벨은 2021·2025", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={[
          { key: "acquisition", label: "취득시", year: 2022, landPriceYear: 2021, landPricePerM2: "" },
          { key: "transfer", label: "양도시", year: 2026, landPriceYear: 2025, landPricePerM2: "" },
        ]}
        onApply={() => {}}
      />,
    );
    open();
    expect(screen.getByText(/취득시 \(2021년\) 공시지가/)).toBeTruthy();
    expect(screen.getByText(/양도시 \(2025년\) 공시지가/)).toBeTruthy();
    expect(screen.queryByText(/취득시 \(2022년\) 공시지가/)).toBeNull();
    expect(screen.queryByText(/양도시 \(2026년\) 공시지가/)).toBeNull();
  });

  it("구조·용도 체계 연도는 landPriceYear에 끌려가지 않는다(year 유지)", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={[
          { key: "acquisition", label: "취득시", year: 2022, landPriceYear: 2021, landPricePerM2: "" },
          { key: "transfer", label: "양도시", year: 2026, landPriceYear: 2025, landPricePerM2: "" },
        ]}
        onApply={() => {}}
      />,
    );
    open();
    expect(screen.getByText("취득당시 (구조·용도 — 2022년 체계)")).toBeTruthy();
    expect(screen.getByText("양도당시 (구조·용도 — 2026년 체계)")).toBeTruthy();
  });
});

describe("L-Y2 — landPriceYear 미주입 시 year로 대체(종전 호출부 회귀 0)", () => {
  it("year만 준 호출부는 종전 라벨 그대로", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={[
          { key: "acquisition", label: "취득시", year: 2010, landPricePerM2: "" },
          { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
        ]}
        onApply={() => {}}
      />,
    );
    open();
    expect(screen.getByText(/취득시 \(2010년\) 공시지가/)).toBeTruthy();
    expect(screen.getByText(/양도시 \(2025년\) 공시지가/)).toBeTruthy();
  });
});

describe("L-Y3 — lookupLandPrice 시점은 조회 필드 + 사유 안내", () => {
  const withLookup = (
    <MultiPointBuildingStdPriceModal
      points={[
        {
          key: "acquisition",
          label: "취득시",
          year: 2022,
          landPriceYear: 2021,
          landPricePerM2: "",
          lookupLandPrice: true,
          landPriceHint: "토지 취득일과 건물 취득일이 달라 자동으로 채우지 않았습니다.",
        },
        { key: "transfer", label: "양도시", year: 2026, landPriceYear: 2025, landPricePerM2: "5,627,000" },
      ]}
      onApply={() => {}}
      jibun="석관동 192-23"
    />
  );

  it("조회 필드(기준연도 고정) + 사유 hint가 뜬다", () => {
    render(withLookup);
    open();
    expect(screen.getByText("취득시 (2021년) 공시지가")).toBeTruthy();
    expect(
      screen.getByText(/토지 취득일과 건물 취득일이 달라 자동으로 채우지 않았습니다\./),
    ).toBeTruthy();
    // Vworld 조회 버튼이 이 시점에 존재한다(값을 구할 경로 보장)
    expect(screen.getAllByText("공시지가 조회").length).toBeGreaterThan(0);
  });

  it("양성 대조군 — lookupLandPrice 없는 시점은 종전 라벨·prefill 유지", () => {
    render(withLookup);
    open();
    expect(screen.getByText(/양도시 \(2025년\) 공시지가/)).toBeTruthy();
    expect(screen.getByDisplayValue("5,627,000")).toBeTruthy();
  });
});
