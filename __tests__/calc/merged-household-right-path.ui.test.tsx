/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §89② 합가 예외의 **선언 경로** (C1-01 Phase 4)
 *
 * ## 🔴 1주택 세대에는 합가일 입력 경로가 **아예 없었다**
 *
 * 종전 합가일 칸은 `MergeDateSection` 하나뿐이고, 그것은 ③ 섹션 안에 있어
 * `householdHousingCount >= 2`일 때만 렌더된다. 그런데 §156의2⑧ 본문은 「**1주택과
 * 1조합원입주권**」부터 열거하므로 1주택 + 1권리 세대가 정면 대상이다
 * (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ⇒ 2채 미만에서는 새 카드가 합가일·선양도 칸을 **직접 소유**하고, 2채 이상이면 ③ 섹션이
 *   소유한 값을 읽기만 한다. 이 anchor가 그 **상호 배타**를 고정한다 — 둘이 동시에 뜨면
 *   같은 값을 두 곳에서 편집하게 된다.
 *
 * ## 🔄 마운트 화면이 **판정 메뉴로 옮겨졌다** (P6-a)
 *
 * 이 섹션은 계산기 `Step4`에서 판정 메뉴 ②(`app/calc/one-house-exemption/steps/Step2.tsx`)로
 * 이관됐다. **같은 컴포넌트**이므로 단언을 하나도 바꾸지 않고 마운트 화면만 옮긴다 —
 * 지우면 「카드가 사라진 것」과 「자리를 옮긴 것」이 구별되지 않는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const SECTION = /동거봉양·혼인 합가 세대 — 1세대1주택 특례/;
const KIND_LABEL = /합가 전 보유 구성/;

function rightEntry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2016-10-01",
    region: "capital",
    ...over,
  };
}

function form(over: Partial<TransferFormData> = {}): OneHouseJudgmentFormData {
  const base = { ...createDefaultTransferFormData(), ...createInitialOneHouseJudgmentForm() };
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a,
    ),
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: [rightEntry()],
    ...over,
  };
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

describe("가시성", () => {
  it("권리를 보유하지 않으면 뜨지 않는다 — §89②의 대상이 아니다", () => {
    render(<Step2 form={form({ presaleRights: [] })} onChange={() => {}} />);
    expect(shows(SECTION)).toBe(false);
  });

  it("★ 1주택 + 권리 → 카드가 열리고 **합가일 칸을 직접 제공**한다", () => {
    render(<Step2 form={form()} onChange={() => {}} />);
    expect(shows(SECTION)).toBe(true);
    expect(shows(/동거봉양 합가일/)).toBe(true);
    expect(shows(/혼인 합가일/)).toBe(true);
  });

  it("합가일이 없으면 보유 구성은 묻지 않는다 (원인 → 결과)", () => {
    render(<Step2 form={form()} onChange={() => {}} />);
    expect(shows(KIND_LABEL)).toBe(false);
  });

  it("★ 합가일을 넣으면 보유 구성 선택지와 선양도 토글이 열린다", () => {
    render(<Step2 form={form({ parentalCareMergeDate: "2020-03-01" })} onChange={() => {}} />);
    expect(shows(KIND_LABEL)).toBe(true);
    expect(shows(/합가 후 세대 내에서 먼저 양도하는 주택이다/)).toBe(true);
  });
});

describe("🔑 ③ 섹션과 **상호 배타**로 합가일을 소유한다", () => {
  /**
   * 🔑 판정 메뉴는 주택 수를 **명부에서 파생**한다(`deriveJudgmentHouseCount` = 양도 대상 1 +
   *    `houses.length`). `householdHousingCount`를 직접 적으면 `withDerivedHouseCount`가
   *    덮어써 ③ 섹션이 열리지 않는다 — P6-a 이관 때 이 시료가 그렇게 한 번 빨개졌다.
   */
  const twoHouse = {
    houses: [
      {
        id: "h1",
        region: "capital" as const,
        acquisitionDate: "2018-01-01",
        officialPrice: "300000000",
        isInherited: false,
      },
    ] as TransferFormData["houses"],
    parentalCareMergeDate: "2020-03-01",
  } satisfies Partial<TransferFormData>;

  /**
   * 🔄 **소유자가 ① 세대 단계로 정리됐다** (2026-09-23 재배치).
   *
   * 종전에는 주택 수 ≥ 2에서 합가일 칸이 **두 벌** 떴다 — ①(`judgmentMergeDateOwnedByStep1`이
   * true)과 ③ 섹션(`TemporaryTwoHouseSection`의 `<MergeDateSection>`이 `full` 가드 **밖**).
   * 배타 규약(`one-house-judgment-section-scope.ts:26-32`)이 이 카드만 상대로 쓰고
   * 그 경로를 빠뜨린 탓이다. 판정 메뉴에서 ③ 섹션 쪽을 `hideMergeDate`로 끄면서 해소됐다.
   *
   * ⇒ 이 테스트가 지키는 것은 **이 카드가 제 합가일 칸을 렌더하지 않는다**는 한 가지다.
   *    ①이 실제로 소유한다는 것은
   *    `judgment-step-reorder-preconditions.ui.test.tsx` AN-2가 본다.
   */
  it("2채 이상이면 이 카드는 합가일 칸을 렌더하지 않는다 — ① 세대 단계가 소유한다", () => {
    render(<Step2 form={form(twoHouse)} onChange={() => {}} />);
    // 이 카드가 제공하는 「먼저 양도」 토글 문구가 없다 = 카드가 합가 축을 잡지 않았다.
    expect(shows(/합가 후 세대 내에서 먼저 양도하는 주택이다/)).toBe(false);
    // ③ 화면 어디에도 합가일 칸이 없다 — 중복이 사라졌다.
    expect(shows(/동거봉양 합가일/)).toBe(false);
    expect(shows(/세대 내 먼저 양도하는 주택/)).toBe(false);
  });

  it("★ 2채 이상에서도 보유 구성 선택지는 열린다 (⑧은 2주택 조합도 열거한다)", () => {
    render(<Step2 form={form(twoHouse)} onChange={() => {}} />);
    expect(shows(SECTION)).toBe(true);
    expect(shows(KIND_LABEL)).toBe(true);
  });
});

describe("갈래별 하위 요건 — 가목만 요건이 둘이다", () => {
  const merged = { parentalCareMergeDate: "2020-03-01" } as const;

  it("⭐ 가목(인가 최초 취득)은 **두 요건**을 각각 묻는다", () => {
    render(
      <Step2
        form={form({ ...merged, mergedHouseholdFirstHouseKind: "initial_right" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/사업시행계획 인가일 이후에 취득했다/)).toBe(true);
    expect(shows(/취득 후 1년 이상 거주했다/)).toBe(true);
  });

  it("나목(승계취득)은 「권리 취득 전부터 소유」 하나만 묻는다", () => {
    render(
      <Step2
        form={form({ ...merged, mergedHouseholdFirstHouseKind: "succeeded_right" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/그 권리를 취득하기 전부터 이 주택을 소유하고 있었다/)).toBe(true);
    expect(shows(/사업시행계획 인가일 이후에 취득했다/)).toBe(false);
  });

  it("다목(분양권)도 같은 하나만 묻는다", () => {
    render(
      <Step2
        form={form({ ...merged, mergedHouseholdFirstHouseKind: "presale_right" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/그 권리를 취득하기 전부터 이 주택을 소유하고 있었다/)).toBe(true);
  });

  it("3호·5호·해당없음은 하위 요건을 묻지 않는다", () => {
    for (const k of ["house_only", "right_only", "none"] as const) {
      render(
        <Step2 form={form({ ...merged, mergedHouseholdFirstHouseKind: k })} onChange={() => {}} />,
      );
      expect(shows(/그 권리를 취득하기 전부터 이 주택을 소유하고 있었다/), k).toBe(false);
      expect(shows(/취득 후 1년 이상 거주했다/), k).toBe(false);
      cleanup();
    }
  });
});
