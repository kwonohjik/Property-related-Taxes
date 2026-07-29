/**
 * anchor(d1·d2): 건축물대장 조회 버튼 게이트 완화 + 집합건물 floorArea 제외.
 *
 * d1(옵션 C): year 없어도 pnu만 있으면 버튼 활성(표제부는 시점 무관). year 있으면 구조·용도까지.
 * d2(D2-b): isCollectiveUnit이면 건축물대장 조회의 동 전체 totArea로 floorArea를 덮어쓰지 않음.
 * 계획서: building-register-lookup-year-gate-fix.plan.md · building-std-collective-unit-exclusive-area-fix.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { BuildingRegisterLookupField } from "../../components/calc/building-std-price/BuildingRegisterLookupField";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PNU = "4146310300106620000";

function mockFetchSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          structureKey: null,
          usageNo: null,
          confidence: null,
          floorArea: 12345.6, // 동 전체 연면적(집합건물이면 이 값으로 덮으면 안 됨)
          builtYear: 2010,
          floorsAbove: 20,
          floorsBelow: 2,
        },
      }),
    }),
  );
}

describe("d1 — 연도 게이트 완화", () => {
  it("pnu 있고 year 빈값이어도 버튼 활성", () => {
    render(
      <BuildingRegisterLookupField
        pnu={PNU}
        year=""
        taxType="transfer"
        disabled={false}
        onAutoFill={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "건축물대장 조회" })).not.toBeDisabled();
  });

  it("pnu 없으면 여전히 비활성", () => {
    render(
      <BuildingRegisterLookupField
        pnu=""
        year=""
        taxType="transfer"
        disabled={false}
        onAutoFill={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "건축물대장 조회" })).toBeDisabled();
  });
});

describe("d2(접근 B) — 집합건물이면 dong/ho로 전유공용 조회, route가 준 floorArea 반영", () => {
  it("isCollectiveUnit=true → dong/ho가 fetch URL에 포함 + route floorArea(전유+공용) 채움", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          structureKey: null,
          usageNo: null,
          confidence: null,
          floorArea: 118.49, // route가 전유+공용 합산해 반환한 세대 연면적
          builtYear: 2010,
          floorsAbove: 20,
          floorsBelow: 2,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAutoFill = vi.fn();
    render(
      <BuildingRegisterLookupField
        pnu={PNU}
        year="2025"
        taxType="transfer"
        disabled={false}
        isCollectiveUnit
        dong="201동"
        ho="3204"
        onAutoFill={onAutoFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건축물대장 조회" }));
    await waitFor(() => expect(onAutoFill).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("ho=3204");
    expect(url).toMatch(/dong=/); // 동은 URL 인코딩됨
    expect(onAutoFill.mock.calls[0][0].floorArea).toBe("118.49");
  });

  it("집합건물이나 route floorArea=null(조회 실패) → floorArea 미채움(수동)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            structureKey: null,
            usageNo: null,
            confidence: null,
            floorArea: null,
            builtYear: 2010,
            floorsAbove: 20,
            floorsBelow: 2,
          },
        }),
      }),
    );
    const onAutoFill = vi.fn();
    render(
      <BuildingRegisterLookupField
        pnu={PNU}
        year="2025"
        taxType="transfer"
        disabled={false}
        isCollectiveUnit
        dong="201동"
        ho="3204"
        onAutoFill={onAutoFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건축물대장 조회" }));
    await waitFor(() => expect(onAutoFill).toHaveBeenCalled());
    expect(onAutoFill.mock.calls[0][0].floorArea).toBeUndefined();
    expect(onAutoFill.mock.calls[0][0].builtYear).toBe("2010");
  });

  it("isCollectiveUnit=false(일반건축물) → 표제부 totArea floorArea 포함", async () => {
    mockFetchSuccess();
    const onAutoFill = vi.fn();
    render(
      <BuildingRegisterLookupField
        pnu={PNU}
        year="2025"
        taxType="transfer"
        disabled={false}
        onAutoFill={onAutoFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건축물대장 조회" }));
    await waitFor(() => expect(onAutoFill).toHaveBeenCalled());
    const patch = onAutoFill.mock.calls[0][0];
    expect(patch.floorArea).toBe("12345.6");
  });
});
