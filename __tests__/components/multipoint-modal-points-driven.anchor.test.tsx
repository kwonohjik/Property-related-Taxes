/**
 * P2 anchor — 배치 모달이 **호출부가 준 `points`대로** 화면을 구성하는가.
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.1 (L-1~L-3)
 *
 * 범용화 전 실측된 결함 3종을 고정한다:
 *   L-1 `points[].label`이 dead prop이라 상가 맥락에서도 "최초공시일"이 나왔다
 *   L-2 결과·적용 영역이 3행 하드코딩이라 2시점 호출 시 빈 행이 남았다
 *   L-3 버튼·제목·계산 버튼에 "3시점" 문자열이 하드코딩돼 2시점에서 오표기됐다
 *
 * ※ 결과 영역(계산 후)의 points-driven 렌더는 구조·용도 Select(Radix) 조작이 필요해
 *   RTL로 재현하기 어렵다 — P3의 E2E에서 커버한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MultiPointBuildingStdPriceModal } from "../../components/calc/building-std-price/MultiPointBuildingStdPriceModal";

afterEach(cleanup);

/** 상가 「소득세법 시행령」 제164조 제6항 3시점 — 최초고시 라벨이 PHD와 다르다. */
const commercialPoints = [
  { key: "acquisition" as const, label: "취득시", year: 2000, landPricePerM2: "" },
  { key: "firstDisclosure" as const, label: "최초고시(2005)", year: 2005, landPricePerM2: "" },
  { key: "transfer" as const, label: "양도시", year: 2026, landPricePerM2: "" },
];

/** 일반건물 2시점 */
const twoPoints = [
  { key: "acquisition" as const, label: "취득시", year: 2010, landPricePerM2: "" },
  { key: "transfer" as const, label: "양도시", year: 2025, landPricePerM2: "" },
];

describe("L-3 — 시점 수 문구는 points.length를 따른다", () => {
  it("2시점 호출 → 런처·제목·계산 버튼이 모두 '2시점'", () => {
    render(<MultiPointBuildingStdPriceModal points={twoPoints} onApply={() => {}} />);
    const launcher = screen.getByText("2시점 건물기준시가 일괄 계산");
    fireEvent.click(launcher);
    expect(screen.getByText("2시점 건물 기준시가 일괄 계산")).toBeTruthy(); // DialogTitle
    expect(screen.getByText("2시점 계산하기")).toBeTruthy();
    expect(screen.getByText("건물 정보 (2시점 공통)")).toBeTruthy();
  });

  it("3시점 호출 → '3시점' (기존 PHD·상속 호출부 회귀 0)", () => {
    render(<MultiPointBuildingStdPriceModal points={commercialPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.getByText("3시점 계산하기")).toBeTruthy();
  });
});

describe("L-2 — 공시지가 입력은 points만큼만 렌더된다", () => {
  it("2시점 호출 시 최초공시 행이 없다", () => {
    render(<MultiPointBuildingStdPriceModal points={twoPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));
    expect(screen.getByText(/취득시 \(2010년\) 공시지가/)).toBeTruthy();
    expect(screen.getByText(/양도시 \(2025년\) 공시지가/)).toBeTruthy();
    expect(screen.queryByText(/최초공시/)).toBeNull();
    expect(screen.queryByText(/최초고시/)).toBeNull();
  });
});

describe("L-1 — 시점 라벨은 호출부 label을 쓴다", () => {
  it("상가 맥락: 최초고시(2005) — PHD 용어 '최초공시일'이 나오지 않는다", () => {
    render(<MultiPointBuildingStdPriceModal points={commercialPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.getByText(/최초고시\(2005\) \(2005년\) 공시지가/)).toBeTruthy();
    expect(screen.queryByText(/최초공시일/)).toBeNull();
  });

  it("취득 ≤2000 전용 행(2001년 기준)도 호출부 라벨을 쓴다", () => {
    render(<MultiPointBuildingStdPriceModal points={commercialPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    // 취득 2000 → 2001.1.1 기준 공시지가 전용 행
    expect(screen.getByText("취득시 (2001년 기준) 공시지가")).toBeTruthy();
  });

  it("PHD 맥락: 최초공시일 라벨 유지 (회귀 0)", () => {
    const phdPoints = [
      { key: "acquisition" as const, label: "취득시", year: 2003, landPricePerM2: "" },
      { key: "firstDisclosure" as const, label: "최초공시일", year: 2006, landPricePerM2: "" },
      { key: "transfer" as const, label: "양도시", year: 2025, landPricePerM2: "" },
    ];
    render(<MultiPointBuildingStdPriceModal points={phdPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.getByText(/최초공시일 \(2006년\) 공시지가/)).toBeTruthy();
  });
});

describe("L-4 — 소재지·건축물대장 조회가 배치 모달에 있다", () => {
  it("소재지 카드와 건축물대장 조회 버튼이 렌더된다", () => {
    render(<MultiPointBuildingStdPriceModal points={commercialPoints} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.getByText("소재지 (공시지가·건축물대장 조회용)")).toBeTruthy();
    expect(screen.getByText("건축물대장 조회")).toBeTruthy();
  });
});
