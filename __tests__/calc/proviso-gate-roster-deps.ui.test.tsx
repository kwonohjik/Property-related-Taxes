/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §154① 단서 카드가 **§155① 명부 파생을 따라 갱신되는가** (판정 메뉴 ②).
 *
 * ## 왜 판정 메뉴인가 — 계산기에서는 관측되지 않는다
 *
 * `provisoGate`는 「2주택 + §155① 성립」일 때 `temporary_two_house` 모드를 연다. 그런데
 * **계산기 `Step4.tsx`는 그 모드를 소비하지 않는다**(`:598`이 `mode === "one_house"`만 본다 —
 * §155① 블록은 P6-b에서 판정 메뉴로 이관됐다). ⇒ 이 축을 실제로 그리는 화면은 판정 메뉴뿐이다.
 *
 * ## 무엇을 고정하는가
 *
 * 취득일 **하나만** 바꿔 §155① 성립 ↔ 불성립을 뒤집었을 때 카드가 따라 바뀐다.
 * 두 시료는 `assets[0].acquisitionDate` 외 모든 값이 같다 — 그래야 이 축을 겨냥한다.
 *
 * 🔴 **`react-hooks/exhaustive-deps`가 이 저장소에서 경고를 내지 않는다**(실측 — 해당 파일
 *    lint가 미사용 import 4건만 보고). §155① 파생은 `useMemo` 안에서 명부·취득일·레거시
 *    표식을 읽으므로, deps가 빠지면 **린터는 조용하고 화면만 stale해진다**. 그 갭을 여기서 막는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

/**
 * 🔴 **명부를 모듈 상수로 고정한다 — 매번 새 배열을 만들면 구별력이 0이다.**
 *
 * `useMemo` deps에는 `form.houses`도 들어 있다. 시료가 호출마다 새 배열을 만들면 **참조가
 * 달라져** 그것만으로 재계산이 일어나고, 정작 겨냥한 **취득일 축**을 deps에서 지워도 통과한다
 * (뮤테이션 실측으로 두 번 확인했다). 같은 참조를 넘겨야 취득일 하나만 변수로 남는다.
 */
const HOUSES = [
  {
    id: "h2",
    region: "capital",
    acquisitionDate: "2020-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  },
];

/** 명부 1채(2020-01-01) + 양도주택 1채 = 2주택. 양도주택 취득일만 갈아 끼운다. */
function form(acquisitionDate: string): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate,
      },
    ],
    transferDate: "2026-06-01",
    isOneHousehold: true,
    houses: HOUSES,
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
}

describe("PGD — §154① 단서 카드가 명부 파생을 따라간다", () => {
  /**
   * 🔴 **`rerender`여야 한다 — `render`를 두 번 하면 구별력이 0이다.**
   *
   * 처음에 두 케이스를 각각 `render`했더니 **deps에서 취득일 축을 지워도 전건 통과**했다
   * (뮤테이션 실측). 새 `render`는 새 `useMemo`라 deps가 관여하지 않기 때문이다 —
   * deps 누락은 **같은 인스턴스가 다른 props를 받을 때만** 드러난다
   * ([[feedback_mutation_zero_discrimination_is_not_proof]]).
   */
  it("PGD-1 취득일이 바뀌면 §155① 성립 ↔ 불성립이 화면에 따라온다", () => {
    // ① 2018-01-01 < 2020-01-01 ⇒ 명부 행이 「나중 취득 1채」로 신규주택이 된다
    const { rerender } = render(<Step2 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("proviso-reason-none")).toBeTruthy();
    expect(screen.queryByText("일시적 2주택 특례 (§155①)")).toBeTruthy();

    // ② 같은 인스턴스에 취득일만 바꿔 넣는다 — 2022-01-01 > 2020-01-01 ⇒ 나중 취득 0채
    rerender(<Step2 form={form("2022-01-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("proviso-reason-none")).toBeNull();
    expect(screen.queryByText("일시적 2주택 특례 (§155①)")).toBeNull();
  });

  it("PGD-2 반대 방향도 따라온다 — 불성립 → 성립", () => {
    const { rerender } = render(<Step2 form={form("2022-01-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("proviso-reason-none")).toBeNull();

    rerender(<Step2 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("proviso-reason-none")).toBeTruthy();
  });
});
