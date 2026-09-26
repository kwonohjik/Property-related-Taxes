/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·⑦) — 리뷰 C2 레인 화면 배선. ④·⑧·route 축은 `one-house-judgment-c2.anchor.test.ts`.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | OH-18 | ② 화면에 상속·동일세대 통산 칸이 있고, 그 입력이 **실제 위젯에서** ④ 본문까지 간다 |
 * | OH-28 | ③ 화면에 §99의4·§98의9 칸이 있고, 선언이 `assets[0].reductions`에 쓰여 ④ 본문까지 간다 |
 * | ⑦ | 결과 화면이 통산 명세와 불성립 사유를 보여 준다 |
 * | OH-32형(계산기) | 계산기 ① 소재지 「지우기」가 이전 `regionCode`를 남기지 않는다 |
 *
 * 🔴 라이브러리 anchor만으로는 화면이 그 필드를 쓰는지 증명하지 못한다
 *    (`feedback_library_anchor_does_not_prove_component_uses_it`) — 실제 컴포넌트를 렌더해 클릭한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function form(over: Record<string, unknown> = {}, assetOver: Partial<AssetForm> = {}): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    houses: [],
    presaleRights: [],
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2023-12-01", ...assetOver }],
    ...over,
  } as unknown as OneHouseJudgmentFormData;
}

// 🔑 접근성 이름에 카드 설명이 이어 붙는다(Switch가 <label> 안에 있다) — 앞머리로 찾는다.
/** 상위 store가 하는 일 — 화면이 돌려준 patch를 폼에 얕게 합친다. */
const apply = (f: OneHouseJudgmentFormData, p: Partial<OneHouseJudgmentFormData>) =>
  ({ ...f, ...p }) as OneHouseJudgmentFormData;

const toggle = (name: string | RegExp) => fireEvent.click(screen.getByRole("switch", { name }));

describe("OH-18 ⑤ — ② 화면의 상속·동일세대 통산 칸", () => {
  it("[C2-18-UI-a] 「상속받은 주택」 → 「동일세대」를 켜고 개시일을 넣으면 ④ 본문에 통산이 실린다", () => {
    let f = form();
    const { rerender } = render(<Step3 form={f} onChange={(p) => (f = apply(f, p))} />);

    toggle("상속받은 주택입니다");
    expect(f.assets[0].acquisitionCause).toBe("inheritance");
    rerender(<Step3 form={f} onChange={(p) => (f = apply(f, p))} />);

    toggle(/^상속개시 당시 피상속인과 동일세대였습니다/);
    rerender(<Step3 form={f} onChange={(p) => (f = apply(f, p))} />);

    // DateInput은 연·월·일 세 칸이다 — 실제 사용자처럼 차례로 채운다.
    const [y, m, d] = Array.from(
      screen.getByTestId("one-house-cohabitation-start").querySelectorAll("input"),
    );
    fireEvent.change(y, { target: { value: "2010" } });
    fireEvent.change(m, { target: { value: "01" } });
    fireEvent.change(d, { target: { value: "01" } });

    const body = buildOneHouseExemptionApiBody(f);
    expect(body.acquisitionCause).toBe("inheritance");
    expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
    expect(body.decedentCohabitationHoldingStartDate).toBe("2010-01-01");
  });

  it("[C2-18-UI-b] 「상속받은 주택」을 끄면 통산 값을 함께 지운다(숨은 값이 ④로 새지 않는다)", () => {
    let f = form({}, {
      acquisitionCause: "inheritance",
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2010-01-01",
      decedentCohabitationResidenceMonths: "150",
    } as Partial<AssetForm>);
    render(<Step3 form={f} onChange={(p) => (f = apply(f, p))} />);
    toggle("상속받은 주택입니다");
    expect(f.assets[0].acquisitionCause).toBe("purchase");
    expect(f.assets[0].decedentSameHouseholdBeforeInheritance).toBe(false);
    expect(f.assets[0].decedentCohabitationHoldingStartDate).toBe("");
  });

  it("[C2-18-UI-c] 양도 대상이 조합원입주권이면 칸을 띄우지 않는다(④·⑧과 같은 게이트)", () => {
    render(<Step3 form={form({}, { assetKind: "right_to_move_in" } as Partial<AssetForm>)} onChange={() => {}} />);
    expect(screen.queryByRole("switch", { name: "상속받은 주택입니다" })).toBeNull();
  });
});

describe("OH-28 ⑤ — ③ 화면의 조특법 §99의4·§98의9 칸", () => {
  it("[C2-28-UI-a] §99의4를 켜면 `assets[0].reductions`에 쓰이고 ④ 본문에 실린다 — 다른 선언은 보존", () => {
    const other = { type: "self_farming", farmingYears: "8" };
    let f = form({}, { reductions: [other] } as unknown as Partial<AssetForm>);
    render(<Step2 form={f} onChange={(p) => (f = apply(f, p))} />);
    toggle(/농어촌주택·고향주택 — 조특법 §99의4/);
    const types = f.assets[0].reductions.map((r) => r.type);
    expect(types).toEqual(["self_farming", "new_99_4_rural"]);
    expect((buildOneHouseExemptionApiBody(f).reductions as { type: string }[]).map((r) => r.type)).toEqual([
      "new_99_4_rural",
    ]);
  });

  it("[C2-28-UI-b] §98의9를 켜면 준공후미분양 선언이 쓰인다", () => {
    let f = form();
    render(<Step2 form={f} onChange={(p) => (f = apply(f, p))} />);
    toggle(/준공후미분양주택 — 조특법 §98의9/);
    expect(f.assets[0].reductions.map((r) => r.type)).toEqual(["unsold_98_9"]);
  });

  it("[C2-28-UI-c] 양도 대상이 조합원입주권이면 칸을 띄우지 않는다", () => {
    render(<Step2 form={form({}, { assetKind: "right_to_move_in" } as Partial<AssetForm>)} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-special-tax-exclusion")).toBeNull();
  });
});

describe("⑦ 결과 화면", () => {
  const base = {
    judgment: {
      isExempt: false,
      pending: [],
      undetermined: [],
      unmetExceptions: [],
      appliedExceptions: [],
      legalBasis: [],
    },
    houseCount: { total: 2, countedForExemption: 2, excluded: [] },
  } as unknown as OneHouseExemptionResponse;

  it("[C2-R-a] 불성립 §99의4 선언의 사유를 보여 준다", () => {
    const r = {
      ...base,
      houseCount: {
        ...base.houseCount,
        notApplied: [{ label: "농어촌주택등 — 요건 미충족으로 주택 수에서 빼지 않음", legalBasis: "조특법 §99의4 (농어촌주택)", reasons: ["취득 당시 기준시가 합계가 한도(3억)를 초과합니다"] }],
      },
    } as unknown as OneHouseExemptionResponse;
    render(<OneHouseJudgmentResultView result={r} />);
    expect(screen.getByTestId("one-house-count-not-applied").textContent).toContain("3억");
  });

  it("[C2-R-b] 동일세대 상속 통산 명세 — 선언했을 때만", () => {
    const { rerender } = render(<OneHouseJudgmentResultView result={base} />);
    expect(screen.queryByTestId("one-house-inherited-consolidation")).toBeNull();
    rerender(
      <OneHouseJudgmentResultView
        result={{ ...base, inheritedPeriodConsolidation: { holdingStartDate: "2010-01-01", residenceMonths: 150 } }}
      />,
    );
    const t = screen.getByTestId("one-house-inherited-consolidation").textContent ?? "";
    expect(t).toContain("2010-01-01");
    expect(t).toContain("150개월");
  });
});

describe("계산기 ① 소재지 「지우기」 → regionCode 해제 (C1 OH-32 후속)", () => {
  const GANGNAM = "1168010100";
  const renderBasic = (onChange: (p: Partial<AssetForm>) => void, over: Partial<AssetForm> = {}) =>
    render(
      <AssetSectionBasic
        asset={{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          addressRoad: "서울 강남구 테헤란로 1",
          addressJibun: "서울 강남구 역삼동 1-1",
          regionCode: GANGNAM,
          ...over,
        } as AssetForm}
        onChange={onChange}
        isMultiBundled={false}
        onAddAsset={vi.fn()}
        showFormDates={false}
        transferDate="2024-06-01"
        filingDate=""
        filingOverdue={false}
        filingDeadline=""
        onFormChange={vi.fn()}
      />,
    );

  it("[C2-32c-a] 「지우기」 → regionCode가 빈다", async () => {
    const patches: Partial<AssetForm>[] = [];
    renderBasic((p) => patches.push(p));
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    await Promise.resolve();
    expect(patches.at(-1)?.regionCode).toBe("");
  });

  it("[C2-32c-b] 긍정 짝 — 상세주소만 고치면 regionCode를 건드리지 않는다(같은 물건)", async () => {
    const patches: Partial<AssetForm>[] = [];
    renderBasic((p) => patches.push(p));
    fireEvent.change(screen.getByPlaceholderText(/상세/), { target: { value: "101동 1001호" } });
    await Promise.resolve();
    expect(patches.at(-1)?.addressDetail).toBe("101동 1001호");
    expect(patches.at(-1)).not.toHaveProperty("regionCode");
  });
});

describe("OH-05 계산기 ⑤ — 넘겨받은 대체주택 선언의 표시가 ④ 게이트와 같다", () => {
  const specials = {
    replacementHouseSpecial: true,
    replBusinessApprovalDate: "2020-01-01",
    replCompletionDate: "2026-12-31",
    replResidenceMonths: "14",
    replWillResideNewHouse: true,
  } as unknown as Parameters<typeof ImportedOneHouseFactsCard>[0]["specials"];

  it("[C2-05-UI-a] 게이트가 닫히면 「계산에 쓰지 않습니다」를 적는다", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials} replacementHouseApplies={false} />);
    expect(screen.getByTestId("imported-one-house-facts").textContent).toContain("계산에 쓰지 않습니다");
  });

  it("[C2-05-UI-b] 긍정 짝 — 게이트가 열리면 「선언함」만 적는다", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials} replacementHouseApplies />);
    const t = screen.getByTestId("imported-one-house-facts").textContent ?? "";
    expect(t).toContain("선언함");
    expect(t).not.toContain("계산에 쓰지 않습니다");
  });
});
