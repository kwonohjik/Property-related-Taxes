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

describe("d2 — 집합건물이면 동 전체 연면적으로 floorArea 덮어쓰기 제외", () => {
  it("isCollectiveUnit=true → onAutoFill patch에 floorArea 없음", async () => {
    mockFetchSuccess();
    const onAutoFill = vi.fn();
    render(
      <BuildingRegisterLookupField
        pnu={PNU}
        year="2025"
        taxType="transfer"
        disabled={false}
        isCollectiveUnit
        onAutoFill={onAutoFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건축물대장 조회" }));
    await waitFor(() => expect(onAutoFill).toHaveBeenCalled());
    const patch = onAutoFill.mock.calls[0][0];
    expect(patch.floorArea).toBeUndefined();
    // 나머지 유용 필드는 채워짐
    expect(patch.builtYear).toBe("2010");
  });

  it("isCollectiveUnit=false(일반건축물) → floorArea 포함", async () => {
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
