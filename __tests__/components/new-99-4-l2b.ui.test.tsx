/**
 * §99의4 리뷰 후속 L2b — ⑤ 입력 화면 · ⑦ 결과 카드 · 판정 메뉴 명세
 *
 * - ⑤ 면적 칸은 범위 안에서만(대지 2021.1.1. 전 양도 · 주택 2017.1.1. 전 양도) · 연접 예/아니오/모름 · 수도권 행 모순 안내(NH-20)
 * - ⑦ 적용 한도 echo(Q-9 (a)) · 「확인 필요」 고지(Q-4·Q-5 (c))
 * - 판정 메뉴 `buildOneHouseCountBreakdown` 제외 명세에 같은 문장(notes)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { New994DetailCard } from "@/components/calc/results/transfer/New994DetailCard";
import { buildOneHouseCountBreakdown } from "@/lib/tax-engine/one-house/house-count";
import { evaluateNew994 } from "@/lib/tax-engine/transfer-reductions/new-99-4";

afterEach(cleanup);

const value = (over: Record<string, unknown> = {}) =>
  ({
    type: "new_99_4_rural",
    houseId: "r",
    ruralHouseAcquisitionDate: "",
    ruralHouseStdPrice: "150000000",
    isRegisteredHanok: false,
    adjacentArea994: "",
    meetsLocationRequirement: false,
    ...over,
  }) as never;

const view = (transferDate: string, acq: string, over: Record<string, unknown> = {}, rowOver: Record<string, unknown> = {}) => {
  const patches: Record<string, unknown>[] = [];
  render(
    <New994InputForm
      value={value(over)}
      onChange={(p) => patches.push(p as Record<string, unknown>)}
      transferDate={transferDate}
      rowFacts={{ acquisitionDate: acq, jibun: "", exclusiveArea: "84.5", ...rowOver }}
    />,
  );
  return patches;
};

describe("⑤ 입력 화면", () => {
  it("2019 양도: 대지면적 칸만 · 2016 양도 × 2014 취득: 주택 유형까지 · 2024 양도: 면적 칸 없음", () => {
    view("2019-06-01", "2015-03-01");
    expect(screen.getByTestId("new994-land-area")).toBeTruthy();
    expect(screen.queryByTestId("new994-house-type-other")).toBeNull();
    cleanup();
    view("2016-06-01", "2014-03-01", { ruralHouseType994: "multi_unit" });
    expect(screen.getByTestId("new994-house-type-other")).toBeTruthy();
    // 공동주택 전용면적은 행 값을 읽기 전용으로 보인다
    expect(screen.getByTestId("new994-row-exclusive-area").textContent).toContain("84.5");
    cleanup();
    view("2024-06-01", "2015-03-01");
    expect(screen.queryByTestId("new994-size-fields")).toBeNull();
  });

  it("연접 질문 — 기본 선택 없음, 「모름」을 고르면 adjacentArea994 = unknown", () => {
    const patches = view("2024-06-01", "2015-03-01");
    const unknown = screen.getByTestId("new994-adjacent-unknown") as HTMLInputElement;
    expect(unknown.checked).toBe(false);
    expect((screen.getByTestId("new994-adjacent-no") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(unknown);
    expect(patches.at(-1)).toMatchObject({ adjacentArea994: "unknown" });
  });

  it("수도권 행(양평) + 소재지 ON → 안내 카드 · [짝] 소재지 OFF면 없음", () => {
    view("2025-06-02", "2018-05-01", { meetsLocationRequirement: true }, { regionCode: "4183025000" });
    expect(screen.getByTestId("new994-capital-conflict").textContent).toContain("수도권으로 조회됩니다");
    cleanup();
    view("2025-06-02", "2018-05-01", { meetsLocationRequirement: false }, { regionCode: "4183025000" });
    expect(screen.queryByTestId("new994-capital-conflict")).toBeNull();
  });
});

const D = (s: string) => new Date(s);
const hanok = evaluateNew994({
  id: "new_99_4_rural",
  generalHouseAcquisitionDate: D("2010-01-01"),
  transferDate: D("2024-06-01"),
  ruralHouseAcquisitionDate: D("2012-05-01"),
  ruralHouseStdPrice: 350_000_000,
  isRegisteredHanok: true,
  adjacentArea994: "no",
  meetsLocationRequirement: true,
});

describe("⑦ 결과 카드 · 판정 메뉴", () => {
  it("적용 한도 4억(근거)과 한옥 「확인 필요」 고지", () => {
    render(<New994DetailCard detail={hanok} />);
    expect(screen.getByTestId("new994-applied-limit").textContent).toContain("4억 이하");
    expect(screen.getByTestId("new994-applied-limit").textContent).toContain("조특령 §99의4⑭");
    expect(screen.getByTestId("new994-notices").textContent).toContain("2014.1.1. 전 구입한 등록 한옥");
  });

  it("판정 메뉴 제외 명세에 같은 적용 한도·고지가 notes로 실린다", () => {
    const detail = { ...hanok, houseId: "r" } as never;
    const b = buildOneHouseCountBreakdown({
      total: 2,
      houseCountExclusion: { appliedList: [detail], new994Detail: detail, unsold989Detail: undefined, details: [detail] } as never,
      specialHouseExclusion: { entries: [] } as never,
      inheritedExclusion: { excludedHouses: [], coveredBySpecialActHouseIds: [] } as never,
    });
    expect(b.excluded[0].notes?.[0]).toContain("적용 한도: 취득 당시 기준시가 합계 4억 이하");
    expect(b.excluded[0].notes?.[1]).toContain("확인 필요");
  });
});
