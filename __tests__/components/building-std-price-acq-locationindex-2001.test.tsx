/**
 * BuildingStdPriceForm — ≤2000 취득 위치지수 공시지가 2001.1.1 기준 정정 (anchor).
 *
 * 버그: 2000.12.31 이전 취득 건물의 위치지수는 국세청 고시 §6①에 따라 **2001.1.1 현재
 * 개별공시지가**로 산정해야 하나(location-index.ts:10-11,108-109), 폼이 취득연도 기준
 * 공시지가를 입력받아 엔진 위치지수 산정에 그대로 전달했다.
 *
 * 정정: ≤2000 취득 시 취득 공시지가 필드를 배치 모달(MultiPointBuildingStdPriceModal)과 동일하게
 * fixedYear=2001 + 토지기준시가 표시 숨김으로 전환.
 *
 * 계획서: docs/02-design/features/building-stdprice-acq-locationindex-2001-fix.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { resolveLocationIndex } from "@/lib/tax-engine/data/building-standard-price/location-index";

describe("A1 — 위치지수 수치 영향(공시지가 연도 오류 시 버킷 상이)", () => {
  it("2000 이전 취득: 취득연도(저가) vs 2001.1.1(고가) 공시지가가 다른 위치지수 버킷", () => {
    // 2000 이전 = 2001 위치지수표(5구간, 경계 [0,20만,50만,100만,500만] → [90,95,100,105,110]).
    // 취득연도(1997) 공시지가를 쓰면(버그) 낮은 버킷, 2001.1.1 공시지가(정정)는 높은 버킷.
    expect(resolveLocationIndex(1997, 1_200_000)).toBe(105); // 100만~500만 구간
    expect(resolveLocationIndex(1997, 6_000_000)).toBe(110); // 500만~ 구간
    // ⇒ 잘못된(취득연도) 저가 공시지가는 위치지수를 낮춰 취득 건물기준시가를 과소평가.
    expect(resolveLocationIndex(1997, 1_200_000)).not.toBe(resolveLocationIndex(1997, 6_000_000));
  });
});

describe("BuildingStdPriceForm — ≤2000 취득 위치지수 공시지가 2001.1.1 기준", () => {
  it("취득연도 1997(≤2000): 취득 공시지가가 2001.1.1 기준으로 고정 표시", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "1997",
          transferYear: "2026",
        }}
      />,
    );
    // fixedYear=2001 → 연도 셀렉트 "2001년 (기준)" 읽기전용 + placeholder "2001.1.1. 현재 공시지가"
    expect(screen.getByText("2001년 (기준)")).toBeTruthy();
    expect(screen.getByPlaceholderText("2001.1.1. 현재 공시지가")).toBeTruthy();
  });

  it("취득연도 2010(≥2001): 정상 모드 — 2001.1.1 고정 placeholder 없음(회귀)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "2010",
          transferYear: "2026",
        }}
      />,
    );
    // ≥2001 취득은 취득연도 기준 조회(현행 유지) → 2001.1.1 고정 placeholder 미노출
    expect(screen.queryByPlaceholderText("2001.1.1. 현재 공시지가")).toBeNull();
    expect(screen.queryByText("2001년 (기준)")).toBeNull();
  });
});
