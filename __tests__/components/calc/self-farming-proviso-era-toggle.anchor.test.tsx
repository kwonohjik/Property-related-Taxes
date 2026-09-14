/**
 * ⑤ UI anchor — §66④1호 단서 토글의 **문구가 양도일로 갈린다**.
 *
 * 엔진 breakdown은 `selfFarmingProvisoLabel()`로 시대를 가르는데 ⑤가 「가·나·다목」을 고정으로
 * 박아 두면, 2008.2.21. 이전 양도 사안에서 **화면과 산출근거가 서로 다른 조문을 인용**한다.
 * 두 층이 같은 경계 상수(`SELF_FARMING_PROVISO_3MOK_FROM`)를 쓰는지 여기서 고정한다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SelfFarmingIncorporationInput } from "@/components/calc/inputs/SelfFarmingIncorporationInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderInput(transferDate: string) {
  render(
    <SelfFarmingIncorporationInput
      useSelfFarmingIncorporation
      selfFarmingIncorporationDate="2000-01-01"
      selfFarmingIncorporationZone="residential"
      selfFarmingIncorporationLocation="metro_or_city"
      selfFarmingIncorporationProvisoException={false}
      selfFarmingStandardPriceAtIncorporation=""
      selfFarmingStandardPriceAtAcquisition=""
      selfFarmingStandardPriceAtTransfer=""
      onChange={vi.fn()}
      transferDate={transferDate}
    />,
  );
}

describe("§66④1호 단서 토글 — 시대별 문구", () => {
  it("P-1: 2026년 양도 → 제목에 「가·나·다목」", () => {
    renderInput("2026-06-01");
    expect(screen.getByText(/§66④1호 단서\(가·나·다목\) 해당/)).toBeTruthy();
  });

  it("P-2: 2007년 양도 → 목을 인용하지 않는다", () => {
    renderInput("2007-06-01");
    expect(screen.queryByText(/가·나·다목/)).toBeNull();
    expect(screen.getByText(/§66④1호 단서 해당/)).toBeTruthy();
  });

  it("P-3: 2007년 양도 → 설명이 「2008.2.21. 이전」 근거를 밝힌다", () => {
    renderInput("2007-06-01");
    expect(screen.getByText(/2008\.2\.21\. 이전 양도분은 단서에 목 구분이 없습니다/)).toBeTruthy();
  });

  it("P-4: 경계 — 2008-02-22은 현행 문구", () => {
    renderInput("2008-02-22");
    expect(screen.getByText(/§66④1호 단서\(가·나·다목\) 해당/)).toBeTruthy();
    cleanup();
    renderInput("2008-02-21");
    expect(screen.queryByText(/가·나·다목/)).toBeNull();
  });

  it("P-5: 양도일 미입력 → 현행 문구 (엔진 기본값과 같다)", () => {
    renderInput("");
    expect(screen.getByText(/§66④1호 단서\(가·나·다목\) 해당/)).toBeTruthy();
  });
});
