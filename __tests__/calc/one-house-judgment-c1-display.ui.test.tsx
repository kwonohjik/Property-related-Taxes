/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 판정 메뉴 ③ 보유 주택 화면의 **노출·요건 카드** 결함 (리뷰 C1 레인)
 *
 * | # | 결함 | 무엇을 고정하나 |
 * |---|---|---|
 * | OH-05 | 1주택 + 조합원입주권에서 §156의2⑤ 대체주택 칸이 숨는다 | 그 세대에 토글이 **뜬다** · 입주권 없는 1주택에는 뜨지 않는다 |
 * | OH-56 | 요건 카드가 안 쓰이는 폼-전역 거주기간(0)을 읽는다 | 자산-수준 거주 24개월 + 3호 → 1년 요건 면제·「충족」 |
 * | OH-57 | 요건 카드가 §155⑯ 비연접을 무시하고 5년으로 「충족」 | 비연접이면 3년 기한 · 「미충족」 · 연접이면 5년 |
 *
 * ⚠️ 판정 카드 단언은 **렌더된 화면**으로 본다 — `judgeTempTwoHouseFromForm`을 직접 부르면
 *    Step2가 그 함수에 **무엇을 넘기는지**(OH-56의 결함 자리)를 증명하지 못한다
 *    (`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const houseRow = (id: string, acquisitionDate: string) => ({
  id,
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
});

function form(over: Record<string, unknown> = {}, assetOver: Partial<AssetForm> = {}): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    houses: [],
    presaleRights: [],
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2023-03-01", ...assetOver }],
    ...over,
  } as unknown as OneHouseJudgmentFormData;
}

const REPL_TOGGLE = /대체주택 비과세 특례 해당/;

describe("OH-05 ⑤ — §156의2⑤ 대체주택 칸의 노출", () => {
  it("[C1-05-UI-a] 1주택 + 조합원입주권 1개(법령 기본 사례) → 대체주택 토글이 뜬다", () => {
    render(
      <Step2
        form={form({
          presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2012-01-01", region: "capital" }],
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(REPL_TOGGLE).length).toBeGreaterThan(0);
  });

  it("[C1-05-UI-b] 긍정 짝(부정형) — 입주권 없는 1주택에는 뜨지 않는다", () => {
    render(<Step2 form={form()} onChange={() => {}} />);
    expect(screen.queryAllByText(REPL_TOGGLE)).toHaveLength(0);
  });

  it("[C1-05-UI-c] 2주택이면 종전대로 일시적 2주택 섹션 안에 뜬다(한 벌만)", () => {
    render(<Step2 form={form({ houses: [houseRow("h1", "2018-01-01")] })} onChange={() => {}} />);
    expect(screen.queryAllByText(REPL_TOGGLE)).toHaveLength(1);
  });
});

describe("OH-56 요건 카드의 거주기간 — 자산-수준 값을 읽는다", () => {
  /**
   * 양도주택 2020-01-01 취득 · 자산-수준 거주 24개월(직접 입력) · 신규주택 2020-06-01(1년 미경과)
   * · 2022-06-01 양도 · §154① 단서 3호(부득이). 3호는 1년 이상 거주가 요건이라 1년 요건이 면제된다.
   */
  const f = (residencePeriodMonthsAsset: string) =>
    form(
      {
        transferDate: "2022-06-01",
        houses: [houseRow("h-new", "2020-06-01")],
        provisoReason: "unavoidable",
        residencePeriodMonths: "0", // 폼-전역 옛 필드 — 이 화면의 위젯은 쓰지 않는다
      },
      { acquisitionDate: "2020-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset },
    );

  it("[C1-56a] 자산-수준 24개월 → 1년 요건 면제 · 「요건 충족」", () => {
    render(<Step2 form={f("24")} onChange={() => {}} />);
    expect(screen.getByText("일시적 2주택 특례 요건 충족")).toBeInTheDocument();
    expect(screen.getByTestId("temp-two-house-verdict").textContent).toContain("§154① 단서 사유로 1년 요건 면제");
  });

  it("[C1-56b] 긍정 짝 — 자산-수준 0개월이면 3호가 성립하지 않아 「요건 A 미충족」", () => {
    render(<Step2 form={f("0")} onChange={() => {}} />);
    expect(screen.getByText("일시적 2주택 특례 요건 미충족")).toBeInTheDocument();
    expect(screen.getByTestId("temp-two-house-verdict").textContent).toContain("미충족 · 요건 A");
  });
});

describe("OH-57 요건 카드의 처분기한 — §155⑯ 지역 요건을 엔진과 같이 본다", () => {
  /** 양도주택 2018-01-01 · 신규 2022-03-01 · 2026-06-01 양도 · ⑯ ON. */
  const f = (newHouseSigunguCode: string) =>
    form(
      {
        transferDate: "2026-06-01",
        contractTotalPrice: "900000000",
        houses: [houseRow("h-new", "2022-03-01")],
        publicInstitutionRelocation: true,
        relocatedSigunguCode: "4111700000", // 수원시 영통구
        newHouseSigunguCode,
      },
      { acquisitionDate: "2018-01-01" },
    );

  it("[C1-57a] 비연접(제주시) → 3년 기한(2025-03-01) · 「요건 미충족」", () => {
    render(<Step2 form={f("5011000000")} onChange={() => {}} />);
    expect(screen.getByText("일시적 2주택 특례 요건 미충족")).toBeInTheDocument();
    const card = screen.getByTestId("temp-two-house-verdict").textContent ?? "";
    expect(card).toContain("처분기한 2025-03-01");
    expect(card).toContain("3년 내 종전주택 양도");
  });

  it("[C1-57b] 긍정 짝 — 이전한 시·군과 같으면 5년 기한(2027-03-01) · 「요건 충족」", () => {
    render(<Step2 form={f("4111700000")} onChange={() => {}} />);
    expect(screen.getByText("일시적 2주택 특례 요건 충족")).toBeInTheDocument();
    const card = screen.getByTestId("temp-two-house-verdict").textContent ?? "";
    expect(card).toContain("처분기한 2027-03-01");
    expect(card).toContain("5년 내 종전주택 양도");
  });
});
