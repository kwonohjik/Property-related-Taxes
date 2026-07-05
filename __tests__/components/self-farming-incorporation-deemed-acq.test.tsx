/**
 * SelfFarmingIncorporationInput — 의제취득(≤1985.1.1) 취득시 기준시가 자산 자동·읽기전용 (작업 4·5)
 *
 * - 앱은 1985.1.1 미만 취득일을 "1985-01-01"로 클램핑하므로 판정은 `<=` (죽은 조건 `<` 방지).
 * - 의제취득 시: 개별공시지가 부재 → 연도 드롭다운·조회 숨김 + 자산-수준 취득시 기준시가 읽기전용 표시.
 * - 표시값은 엔진 fallback 식(`reduction ?? asset`)과 동일 미러 → 표시≠엔진 drift 방지.
 *
 * 계획: docs/00-pm/transfer-self-farming-incorporation-ui-fixes.plan.md
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SelfFarmingIncorporationInput } from "@/components/calc/inputs/SelfFarmingIncorporationInput";

afterEach(cleanup);

const baseProps = {
  useSelfFarmingIncorporation: true, // 토글 ON — children 렌더
  selfFarmingIncorporationDate: "2023-02-14",
  selfFarmingIncorporationZone: "" as const,
  selfFarmingStandardPriceAtIncorporation: "",
  selfFarmingStandardPriceAtAcquisition: "",
  selfFarmingStandardPriceAtTransfer: "",
  onChange: () => {},
  jibun: "경상남도 거제시 장승포동 24",
  landAreaM2: "661",
  transferDate: "2026-01-12",
};

describe("[DEEMED-ACQ] SelfFarming 의제취득 취득시 기준시가 읽기전용", () => {
  it("DA-1: 의제취득(1985-01-01) + 자산값 존재 → 읽기전용 자산값 표시 + 취득시 조회 UI 숨김", () => {
    render(
      <SelfFarmingIncorporationInput
        {...baseProps}
        acquisitionDate="1985-01-01"
        assetStandardPriceAtAcq="24126500"
      />,
    );

    // 읽기전용 자산값 + 의제취득 안내
    expect(screen.getByText("24,126,500")).toBeTruthy();
    expect(screen.getByText(/1985\.1\.1\. 이전 취득\(취득시기 의제\)/)).toBeTruthy();

    // 취득시 조회 UI 숨김 → 편입시·양도시 2개만 조회 버튼 (취득시 없음)
    expect(screen.getAllByRole("button", { name: /공시가격 조회/ })).toHaveLength(2);
  });

  it("DA-2: 의제취득 + reduction 잔존값 우선 표시 (엔진 fallback 미러 — drift 방지)", () => {
    render(
      <SelfFarmingIncorporationInput
        {...baseProps}
        selfFarmingStandardPriceAtAcquisition="30000000"
        acquisitionDate="1985-01-01"
        assetStandardPriceAtAcq="24126500"
      />,
    );
    // reduction 값(30,000,000)이 asset값보다 우선 — 엔진 `reduction ?? asset`과 동일
    expect(screen.getByText("30,000,000")).toBeTruthy();
  });

  it("DA-3: 의제취득 + 자산값 없음 → 자산 입력 유도 안내", () => {
    render(
      <SelfFarmingIncorporationInput
        {...baseProps}
        acquisitionDate="1985-01-01"
        assetStandardPriceAtAcq={undefined}
      />,
    );
    expect(screen.getByText(/자산 목록에서 취득시 기준시가/)).toBeTruthy();
  });

  it("DA-4: 비의제(1990-06-01) → 취득시 StandardPriceInput 유지(조회 버튼 3개)", () => {
    render(
      <SelfFarmingIncorporationInput
        {...baseProps}
        acquisitionDate="1990-06-01"
        assetStandardPriceAtAcq="24126500"
      />,
    );
    // 편입시·취득시·양도시 3개 모두 조회 버튼 존재
    expect(screen.getAllByRole("button", { name: /공시가격 조회/ })).toHaveLength(3);
    // 의제취득 안내 없음
    expect(screen.queryByText(/취득시기 의제/)).toBeNull();
  });
});
