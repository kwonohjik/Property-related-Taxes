/**
 * @vitest-environment jsdom
 *
 * anchor(⑤ + ④⑫⑭) — §155⑥ 문화유산 주택 · §156의2⑦1호 후단의 **선언 경로** (C1-01 Phase 5)
 *
 * ## 🔴 두 축 모두 입력 경로가 없으면 엔진 경고만 뜨고 고칠 칸이 없다
 *
 * · §155⑥1호는 **비과세 자체가 미구현**이었다(권리 없이 2주택 문화유산 세대는 그냥 과세).
 * · §156의2⑦1호 후단(「일반주택은 **상속개시 당시 보유한 주택**으로 한정」)은 상속받은 것이
 *   **주택**인 갈래에도 걸리는데, Phase 3의 선언 카드는 상속받은 **권리**가 있을 때만 열렸다.
 *
 * memory `feedback_api_trigger_without_input_path_is_noop`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
/**
 * 🔄 §156의2⑦1호(P6-a)에 이어 **문화유산 축도 판정 메뉴로 갔다**(P6-b) — 이제 이 파일은
 *    계산기 `Step4`를 마운트하지 않는다. ④⑫⑭ 배관 describe만 leaf를 직접 부른다.
 */
import { Step2 as JudgmentStep2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { HouseEntryOneHouseFactsSection } from "@/components/calc/transfer/HouseEntryOneHouseFactsSection";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다(Phase 1 전례).
import "@/lib/api/transfer-tax-schema";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PresaleRightEntry, HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { readFileSync } from "node:fs";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

/**
 * 🔑 **공통 어간으로 잡는다.** 종전 세대 단위 토글은 「…천연기념물등 주택 **보유**」였고
 *    행 카드는 「…천연기념물등 주택 **(§155⑥1호)**」다. 어간으로 잡아야 「옮겼다」와
 *    「지웠다」를 같은 정규식으로 구별할 수 있다.
 */
const HERITAGE = /지정문화유산·국가등록문화유산·천연기념물등 주택/;
const INHERITED_SECTION = /상속 자산 — 1세대1주택 특례 요건/;

function rightEntry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2016-10-01",
    region: "capital",
    ...over,
  };
}

function houseEntry(over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2015-06-01",
    officialPrice: "300000000",
    isInherited: false,
    ...over,
  } as HouseEntry;
}

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a,
    ),
    transferDate: "2019-06-01",
    isOneHousehold: true,
    householdHousingCount: "2",
    ...over,
  };
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

/** 판정 메뉴 폼으로 감싼다 — 슈퍼셋이라 계산기 폼을 그대로 얹을 수 있다(Q-8). */
const judgmentForm = (f: TransferFormData) => ({ ...createInitialOneHouseJudgmentForm(), ...f });

/**
 * 🔄 **문화유산 축도 판정 메뉴로 갔다** (P6-b). 계산기 ③은 `mode="calc"`로 §155⑧·합가만
 *    그린다 — 이 토글은 §155⑥1호이고 중과 배제가 §167의10①15호(§154① 2요소)라 비과세
 *    판정을 경유한다.
 *
 * ⚠️ 「1주택 세대에는 뜨지 않는다」는 계산기에서 **공허하게 통과**한다(섹션 자체가 없으니
 *    항상 false). 그래서 세 건을 **함께** 옮긴다 — 부정형만 남기면 안전망이 아니다
 *    (`feedback_negative_anchor_needs_positive_twin`).
 */
/**
 * 🔄 **선언 칸이 다시 옮겨갔다 — 이제 명부 행이다** (D-6 · P7-3).
 *
 * 종전에는 판정 메뉴 ③의 **세대 단위 토글**이었다. 법문이 「문화유산주택과 일반주택을
 * **각각 1개씩** 소유」라 문화유산주택은 **보유 중인 다른 주택**이고, 「어느 주택인가」가
 * 정본이다 ⇒ `HouseEntry.oneHouseCulturalHeritage`.
 *
 * ⚠️ 옛 단언을 **지우지 않고 옮긴다** — 「선언 칸이 존재한다」가 어디에도 고정되지 않으면
 *    칸이 통째로 사라져도 초록이다([[feedback_shared_assertion_reversal_erases_sibling_net]]).
 */
describe("⑤ §155⑥1호 문화유산 주택 — **명부 행**에 선언 칸이 있다", () => {
  it("★ 행 편집기에 토글이 있다", () => {
    render(<HouseEntryOneHouseFactsSection house={houseEntry()} onUpdate={() => {}} />);
    expect(shows(HERITAGE)).toBe(true);
  });

  it("★ 토글이 행 값을 실제로 반영한다 — 라벨만 있고 배선이 없으면 안 된다", () => {
    const label = "지정문화유산·국가등록문화유산·천연기념물등 주택 (§155⑥1호)";
    /** ToggleCard의 Switch는 `aria-label={title}`을 단다(`components/calc/inputs/ToggleCard.tsx`). */
    const sw = () => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`)!;
    const { rerender } = render(
      <HouseEntryOneHouseFactsSection house={houseEntry()} onUpdate={() => {}} />,
    );
    expect(sw()).toHaveAttribute("data-unchecked");
    rerender(
      <HouseEntryOneHouseFactsSection
        house={houseEntry({ oneHouseCulturalHeritage: true })}
        onUpdate={() => {}}
      />,
    );
    expect(sw()).toHaveAttribute("data-checked");
  });

  /**
   * 🔑 **「각각 1개씩」은 이제 화면이 아니라 엔진이 본다**(사실/규칙 분리 — 계획서 §5.10).
   *    행은 「이 주택이 문화유산인가」라는 **사실**만 받고, 2주택 요건은
   *    `transfer-tax-exemption.ts:374`의 `householdHousingCount === 2`가 지킨다.
   *    그 게이트가 살아 있음을 여기서 고정한다 — 없어지면 1주택에도 특례가 붙는다.
   */
  it("★ 2주택 요건은 엔진 게이트가 지킨다 — 화면 게이트로 옮기지 않았다", () => {
    const src = readFileSync("lib/tax-engine/transfer-tax-exemption.ts", "utf8");
    expect(src).toMatch(/input\.householdHousingCount === 2\s*&&\s*\n?\s*input\.culturalHeritageHouse === true/);
  });

  /** 판정 메뉴 ③에는 **더 이상 없다** — 이중 입력 금지(같은 PR에서 뺐다). */
  it("★ 판정 메뉴 세대 단위 토글은 제거됐다", () => {
    render(
      <JudgmentStep2
        form={judgmentForm(form({ houses: [houseEntry()] }))}
        onChange={() => {}}
      />,
    );
    expect(shows(HERITAGE)).toBe(false);
  });
});


describe("⑤ §156의2⑦1호 후단 — 상속받은 **주택** 갈래도 선언 칸을 연다", () => {
  it("🔴 종전에는 상속받은 **권리**가 있을 때만 열렸다", () => {
    render(
      <JudgmentStep2
        form={judgmentForm(form({ houses: [houseEntry({ isInherited: true })], presaleRights: [rightEntry()] }))}
        onChange={() => {}}
      />,
    );
    expect(shows(INHERITED_SECTION)).toBe(true);
    expect(shows(/양도하는 주택을 상속개시 당시 이미 보유하고 있었다/)).toBe(true);
  });

  it("🔑 권리가 없으면 §89② 자체가 적용되지 않으므로 열지 않는다", () => {
    render(
      <JudgmentStep2
        form={judgmentForm(form({ houses: [houseEntry({ isInherited: true })] }))}
        onChange={() => {}}
      />,
    );
    expect(shows(INHERITED_SECTION)).toBe(false);
  });

  it("🔑 상속주택도 상속권리도 없으면 열지 않는다 (관계없는 세대에 강요 금지)", () => {
    render(<JudgmentStep2 form={judgmentForm(form({ presaleRights: [rightEntry()] }))} onChange={() => {}} />);
    expect(shows(INHERITED_SECTION)).toBe(false);
  });
});

describe("④⑫⑭ §155⑥ 배관", () => {
  const primary = createDefaultTransferFormData().assets[0];

  it("★ 선언하면 payload에 실린다", () => {
    const payload = buildHouseholdSpecialPayload(
      form({ culturalHeritageHouseSpecial: true }),
      primary,
    ) as Record<string, unknown>;
    expect(payload.culturalHeritageHouse).toBe(true);
  });

  it("미선언은 키 자체를 만들지 않는다 (Zod optional 계약)", () => {
    const payload = buildHouseholdSpecialPayload(form(), primary) as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain("culturalHeritageHouse");
  });

  it("🔑 ⑭ 단건·다건 route 둘 다 엔진 입력으로 매핑한다", () => {
    // 다건 route는 **명시 매핑**이라 적지 않으면 조용히 사라진다.
    expect(readFileSync("app/api/calc/transfer/engine-input.ts", "utf8")).toContain(
      "culturalHeritageHouse: data.culturalHeritageHouse",
    );
    expect(readFileSync("app/api/calc/transfer/multi/route.ts", "utf8")).toContain(
      "culturalHeritageHouse: p.culturalHeritageHouse",
    );
  });
});
