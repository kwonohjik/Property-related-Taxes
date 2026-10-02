/**
 * 별건 B3 잔여 — 상속개시일을 의제취득일 前 → 後로 고치면 「환산」 켜짐 래치가 꺼진다.
 *
 * 결함: 의제취득일 前 상속은 「환산」 토글(`pre1990Enabled`)이 환산 모드를 정한다. 켠 채 상속개시일만 後로 고치면
 *   그 맥락은 5칸이 항상 열려 **토글이 화면에서 사라지는데**(`sec164LandFieldsAlwaysOpen`) 켜짐 래치는 남아,
 *   ⑧이 환산 모드(`hasPre1990`)로 5칸 완비·양도시 기준시가를 별도로 요구한다 — 끌 방법이 없는 상태.
 *   취득원인 전환·복원 경로는 이미 정리했고(`sec164LandLatchClearPatch`), 남은 한 경로가 이 날짜 입력이다.
 *
 * ⚠️ `DateInput`은 연도를 덮어쓰는 동안 빈 문자열을 내보낸다(`buildDateStr`) — 빈 날짜는 pre-deemed가 아니라서
 *    그대로 술어에 넘기면 토글이 풀린다. 완성된 날짜일 때만 정리한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const preDeemedLatched = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-01-01",
    inheritanceStartDate: "1980-01-01",
    pre1990Enabled: true,
    ...over,
  }) as unknown as AssetForm;

function typeYear(asset: AssetForm, year: string) {
  const onChange = vi.fn();
  render(<CompanionAcqInheritanceBlock asset={asset} onChange={onChange} transferDate="2024-03-01" />);
  // 첫 DateInput = 상속개시일(두 번째는 피상속인 취득일)
  fireEvent.change(screen.getAllByLabelText("연도")[0], { target: { value: year } });
  return onChange;
}

describe("상속개시일 변경 — 켜짐 래치 정리", () => {
  it("🔑 前 → 後: pre1990Enabled=false 를 같은 patch에 싣는다", () => {
    const onChange = typeYear(preDeemedLatched(), "1989");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ acquisitionDate: "1989-01-01", inheritanceStartDate: "1989-01-01", pre1990Enabled: false });
  });

  it("긍정 짝: 前 안에서 고치면 래치를 건드리지 않는다 (토글이 환산 모드를 정한다)", () => {
    const onChange = typeYear(preDeemedLatched(), "1982");
    expect(onChange.mock.calls[0][0]).toMatchObject({ inheritanceStartDate: "1982-01-01" });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("pre1990Enabled");
  });

  it("긍정 짝: 연도를 덮어쓰는 중간 상태(빈 날짜)에서는 래치를 건드리지 않는다", () => {
    const onChange = typeYear(preDeemedLatched(), "1"); // 4자리 미만 → buildDateStr이 ""
    expect(onChange.mock.calls[0][0]).toMatchObject({ inheritanceStartDate: "" });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("pre1990Enabled");
  });

  it("긍정 짝: 이미 꺼져 있으면 patch에 싣지 않는다", () => {
    const onChange = typeYear(preDeemedLatched({ pre1990Enabled: false }), "1989");
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("pre1990Enabled");
  });

  it("긍정 짝: 토지가 아니면 건드리지 않는다", () => {
    const onChange = typeYear(preDeemedLatched({ assetKind: "housing" }), "1989");
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("pre1990Enabled");
  });
});
