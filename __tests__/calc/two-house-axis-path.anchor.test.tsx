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
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
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

const HERITAGE = /지정문화유산·국가등록문화유산·천연기념물등 주택 보유/;
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

describe("⑤ §155⑥1호 문화유산 주택 — 선언 칸이 화면에 있다", () => {
  it("★ 2주택 세대의 특례 섹션에 토글이 있다", () => {
    render(<Step4 form={form()} onChange={() => {}} />);
    expect(shows(HERITAGE)).toBe(true);
  });

  it("★ 토글이 폼 값을 실제로 반영한다 — 라벨만 있고 배선이 없으면 안 된다", () => {
    const label = "지정문화유산·국가등록문화유산·천연기념물등 주택 보유 (§155⑥1호)";
    /** ToggleCard의 Switch는 `aria-label={title}`을 단다(`components/calc/inputs/ToggleCard.tsx`). */
    const sw = () => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`)!;
    const { rerender } = render(<Step4 form={form()} onChange={() => {}} />);
    expect(sw()).toHaveAttribute("data-unchecked");
    rerender(<Step4 form={form({ culturalHeritageHouseSpecial: true })} onChange={() => {}} />);
    expect(sw()).toHaveAttribute("data-checked");
  });

  it("1주택 세대에는 뜨지 않는다 — 「각각 1개씩」이 성립하지 않는다", () => {
    render(<Step4 form={form({ householdHousingCount: "1" })} onChange={() => {}} />);
    expect(shows(HERITAGE)).toBe(false);
  });
});

describe("⑤ §156의2⑦1호 후단 — 상속받은 **주택** 갈래도 선언 칸을 연다", () => {
  it("🔴 종전에는 상속받은 **권리**가 있을 때만 열렸다", () => {
    render(
      <Step4
        form={form({ houses: [houseEntry({ isInherited: true })], presaleRights: [rightEntry()] })}
        onChange={() => {}}
      />,
    );
    expect(shows(INHERITED_SECTION)).toBe(true);
    expect(shows(/양도하는 주택을 상속개시 당시 이미 보유하고 있었다/)).toBe(true);
  });

  it("🔑 권리가 없으면 §89② 자체가 적용되지 않으므로 열지 않는다", () => {
    render(
      <Step4 form={form({ houses: [houseEntry({ isInherited: true })] })} onChange={() => {}} />,
    );
    expect(shows(INHERITED_SECTION)).toBe(false);
  });

  it("🔑 상속주택도 상속권리도 없으면 열지 않는다 (관계없는 세대에 강요 금지)", () => {
    render(<Step4 form={form({ presaleRights: [rightEntry()] })} onChange={() => {}} />);
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
