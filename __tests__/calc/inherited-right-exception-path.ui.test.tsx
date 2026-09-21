/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §89② 상속 권리 예외의 **선언 경로** (C1-01 Phase 3)
 *
 * 요건이 9개(권리 7 + 세대 2)라 화면이 없으면 엔진은 영원히 `undetermined`에 머문다.
 *
 * ## 🔑 조문마다 순위 단계 수가 다르다
 *
 * 입주권 §156의2⑥은 **3단계**(소유기간 → 거주기간 → 상속인 선택), 분양권 §156의3④은
 * **2단계**(소유기간 → 상속인 선택)다. 안내 문구가 종류에 따라 갈리는지 여기서 고정한다 —
 * 한 문구로 묶으면 사용자가 없는 단계를 찾는다.
 *
 * ## ⚠️ ⑮ 선택은 조건부로만 뜬다
 *
 * ⑮은 「피상속인이 주택 없이 **두 종류를 모두** 남긴 경우」의 규정이다. 그 사실이 선언되지
 * 않았는데 선택지를 띄우면 관계없는 결정을 강요하게 된다.
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

/**
 * 🔴 2026-08-26 정정(Phase 5) — 제목이 「상속받은 **권리**」에서 「상속 **자산**」으로 바뀌었다.
 *    §156의2⑦1호·§156의3⑤1호는 상속받은 것이 **주택**인 갈래도 같은 후단 요건을 요구하므로
 *    이 섹션이 두 갈래를 함께 담는다.
 */
const SECTION = /상속 자산 — 1세대1주택 특례 요건/;

function rightEntry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2016-10-01",
    region: "capital",
    ...over,
  };
}

function form(
  rights: PresaleRightEntry[],
  over: Partial<TransferFormData> = {},
): OneHouseJudgmentFormData {
  const base = { ...createDefaultTransferFormData(), ...createInitialOneHouseJudgmentForm() };
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a,
    ),
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: rights,
    ...over,
  };
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

describe("상속 권리 요건 ⑤ — 가시성", () => {
  it("★ 「상속받은 권리」를 체크하면 권리 항목 안에 요건 블록이 열린다", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(/상속 권리 인정 요건/)).toBe(true);
    expect(shows(/피상속인이 상속개시 당시 주택을 보유/)).toBe(true);
    expect(shows(/상속개시 당시 피상속인과 동일세대/)).toBe(true);
  });

  it("체크하지 않으면 열리지 않는다", () => {
    render(<Step2 form={form([rightEntry()])} onChange={() => {}} />);
    expect(shows(/상속 권리 인정 요건/)).toBe(false);
    expect(shows(SECTION)).toBe(false);
  });

  it("★ 세대·일반주택 축 섹션도 함께 열린다", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(SECTION)).toBe(true);
    expect(shows(/양도하는 주택을 상속개시 당시 이미 보유하고 있었다/)).toBe(true);
  });
});

describe("🔑 순위 안내가 권리 종류에 따라 갈린다", () => {
  it("조합원입주권 — **3단계**(소유기간→거주기간→선택)", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(/소유기간→거주기간→선택/)).toBe(true);
  });

  it("분양권 — **2단계**(소유기간→선택). 거주기간 단계가 없다", () => {
    render(
      <Step2
        form={form([rightEntry({ type: "presale_right", isInherited: true })])}
        onChange={() => {}}
      />,
    );
    expect(shows(/소유기간→선택/)).toBe(true);
    expect(shows(/소유기간→거주기간→선택/)).toBe(false);
  });

  it("🔑 「다른 종류의 권리」 문구도 종류에 따라 갈린다", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(/피상속인이 상속개시 당시 분양권을 보유/)).toBe(true);
    cleanup();
    render(
      <Step2
        form={form([rightEntry({ type: "presale_right", isInherited: true })])}
        onChange={() => {}}
      />,
    );
    expect(shows(/피상속인이 상속개시 당시 조합원입주권을 보유/)).toBe(true);
  });
});

describe("조건부 하위 입력", () => {
  it("공동상속을 체크해야 「최대지분」을 묻는다", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(/상속지분이 가장 큰 상속인/)).toBe(false);
    cleanup();
    render(
      <Step2
        form={form([rightEntry({ isInherited: true, isCoInherited: true })])}
        onChange={() => {}}
      />,
    );
    expect(shows(/상속지분이 가장 큰 상속인/)).toBe(true);
  });

  it("동일세대를 체크해야 단서의 예외를 묻는다", () => {
    render(
      <Step2
        form={form([rightEntry({ isInherited: true, decedentSameHouseholdAtInheritance: true })])}
        onChange={() => {}}
      />,
    );
    expect(shows(/동거봉양 합가 전부터 보유하던 주택이 전환된 것/)).toBe(true);
  });

  it("⭐ ⑮ 선택은 「피상속인이 다른 종류의 권리를 보유」했을 때만 뜬다", () => {
    render(<Step2 form={form([rightEntry({ isInherited: true })])} onChange={() => {}} />);
    expect(shows(/피상속인이 남긴 권리 중 상속받은 것으로 선택/)).toBe(false);
    cleanup();
    render(
      <Step2
        form={form([
          rightEntry({ isInherited: true, decedentOwnedOtherRightTypeAtDeath: true }),
        ])}
        onChange={() => {}}
      />,
    );
    expect(shows(/피상속인이 남긴 권리 중 상속받은 것으로 선택/)).toBe(true);
  });
});
