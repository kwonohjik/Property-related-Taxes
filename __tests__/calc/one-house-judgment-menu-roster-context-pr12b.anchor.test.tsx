/**
 * PR12b anchor — 1세대1주택 비과세 **판정 메뉴**의 ③ 명부가 계산기 문맥을 말하지 않는다 (S14a-9 · S14a-12 · S10-9).
 *
 * 판정 route는 중과 엔진을 부르지 않는다. 그런데 계산기와 같이 쓰는 `HousesListSection`·`HouseEntryEditor`가
 *  - S14a-9  중과 전용 입력(조특법 감면주택 5호 칩·준공후미분양 칩·준공일 칸·④ 특수 배제 사유)과 「조특법 감면」 배지를 그대로 냈다.
 *            같은 미분양주택 사실을 5호 칩으로 넣으면 사유 없이 과세, ⑥ 주택 수 제외로 넣으면 비과세가 되는데도 5호 쪽이 반영된 것처럼 보였다.
 *  - S14a-12 머리말 「(정밀 중과세 판정용, 선택)」·빈 상태 「주택 추가 시 정밀 주택 수 산정」·C-1 「① 세대 보유 주택 수는 목록이 비어
 *            있을 때만」을 냈다. 명부가 판정 주택 수의 유일한 출처인 화면에서 「선택」이라 안내한 것이다(확인 칸은 두지 않기로 한 결정).
 *  - S10-9   「보유한 분양권·조합원입주권이 없습니다」 확인 토글을 냈다. 판정 route는 그 값을 true로 고정하므로 어디에도 쓰이지 않는 칸이다.
 *
 * 판정값은 바뀌지 않는다 — 표시 항목이다. 짝: 계산기(`judgmentMenu` 미지정)는 전부 그대로다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeHouse } from "./one-house-rulings/harness";

afterEach(cleanup);

const sw = (label: string) => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);
const text = (c: HTMLElement) => (c.textContent ?? "").replace(/\s+/g, " ");
const badge = (label: string) => Array.from(document.querySelectorAll("span")).some((s) => s.textContent === label);

function judgmentForm(over: Record<string, unknown> = {}, kind = "housing"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2021-12-12",
    contractTotalPrice: "800000000",
    assets: [{ ...f.assets[0], assetKind: kind, acquisitionDate: "2005-01-01" }],
    presaleRights: [],
    houses: [],
    ...over,
  } as unknown as OneHouseJudgmentFormData;
}
function calcForm(over: Record<string, unknown> = {}) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.transferDate = "2021-12-12";
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2005-01-01" };
  return Object.assign(f, { presaleRights: [], houses: [], householdHousingCount: "1", ...over });
}
const UNSOLD = () => makeHouse("u", { region: "non_capital", acquisitionDate: "2009-06-01", isUnsoldHousing: true, isUnsoldNewHouse: true, completionDate: "2024-03-01" });
const openEditor = () => fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));

describe("S14a-9 판정 메뉴 행 편집 — 중과 전용 입력과 「조특법 감면」 배지가 없다", () => {
  it("명부 표: 5호 사실이 켜진 행에도 「조특법 감면」 배지를 달지 않는다", () => {
    render(<Step2 form={judgmentForm({ houses: [UNSOLD()] })} onChange={() => {}} />);
    expect(badge("조특법 감면")).toBe(false);
  });

  it("편집 창: 5호 칩·준공후미분양 칩·준공일 칸·신축 특례 경고·④ 특수 배제 사유가 없다", () => {
    render(<Step2 form={judgmentForm({ houses: [UNSOLD()] })} onChange={() => {}} />);
    openEditor();
    expect(sw("장기임대 등록주택")).not.toBeNull(); // 짝 — 편집 창이 실제로 열렸다
    expect(sw("조특법 감면주택(5호)")).toBeNull();
    expect(sw("준공후미분양")).toBeNull();
    const t = text(document.body);
    expect(t).not.toContain("소형신축 특례 준공일 요건");
    expect(t).not.toContain("신축·준공후미분양 특례 판정에는");
    expect(t).not.toContain("특수 배제 사유");
  });

  it("긍정 짝: 비과세 축 입력 경로(⑥ 주택 수 제외 · ⑤ 비과세 특례 사실)는 그대로 있다", () => {
    render(<Step2 form={judgmentForm({ houses: [UNSOLD()] })} onChange={() => {}} />);
    openEditor();
    const t = text(document.body);
    expect(t).toContain("주택 수 제외 (조특법)");
    expect(t).toContain("취득일");
  });

  it("막다른 길 방지: ④ 값이 이미 담긴 행(옛 저장 상태)에서는 끌 수 있게 ④를 연다", () => {
    const stale = makeHouse("u", { isUnavoidableReason: true });
    render(<Step2 form={judgmentForm({ houses: [stale] })} onChange={() => {}} />);
    openEditor();
    expect(text(document.body)).toContain("특수 배제 사유");
    expect(sw("부득이한 사유 취득 주택")).not.toBeNull();
  });

  it("대조(계산기): 같은 행에 5호 칩·준공후미분양 칩·준공일 칸·④·배지가 그대로 있다", () => {
    render(<HousesListSection form={calcForm({ houses: [UNSOLD()] })} onChange={() => {}} />);
    expect(badge("조특법 감면")).toBe(true);
    openEditor();
    expect(sw("조특법 감면주택(5호)")).not.toBeNull();
    expect(sw("준공후미분양")).not.toBeNull();
    const t = text(document.body);
    expect(t).toContain("소형신축 특례 준공일 요건");
    expect(t).toContain("특수 배제 사유");
  });
});

describe("S14a-12 판정 메뉴 명부 머리말·안내 — 계산기 문맥을 말하지 않는다", () => {
  it("0행: 「정밀 중과세 판정용, 선택」·「정밀 주택 수 산정」이 없고 비우면 없음으로 판정한다고 말한다", () => {
    const { container } = render(<Step2 form={judgmentForm()} onChange={() => {}} />);
    const t = text(container);
    expect(t).toContain("다른 보유 주택 목록");
    expect(t).not.toContain("정밀 중과세 판정용");
    expect(t).not.toContain("정밀 주택 수 산정이 적용됩니다");
    expect(t).toContain("비워 두면 다른 주택이 없는 것으로 판정합니다");
  });

  it("1행: C-1 안내가 「① 세대 보유 주택 수」·「중과 2주택·3주택 판정」을 말하지 않고 비과세 판정이라고만 한다", () => {
    const { container } = render(
      <Step2 form={judgmentForm({ houses: [makeHouse("S", { acquisitionDate: "2010-01-01" })] })} onChange={() => {}} />,
    );
    const t = text(container);
    expect(t).toContain("세대 주택 수는 이 다른 보유 주택 목록 기준으로 산정됩니다"); // 짝 — 안내 카드는 남는다
    expect(t).not.toContain("목록이 비어 있을 때만 사용됩니다");
    expect(t).not.toContain("중과 2주택·3주택 판정");
    expect(t).toContain("1세대1주택 비과세 판정");
  });

  it("대조(계산기): 0행 머리말·빈 상태, 1행 C-1 안내가 그대로 있다", () => {
    const zero = render(<HousesListSection form={calcForm()} onChange={() => {}} />);
    const t0 = text(zero.container);
    expect(t0).toContain("(정밀 중과세 판정용, 선택)");
    expect(t0).toContain("주택 추가 시 정밀 주택 수 산정이 적용됩니다");
    zero.unmount();
    const one = render(
      <HousesListSection form={calcForm({ houses: [makeHouse("S", { acquisitionDate: "2010-01-01" })], householdHousingCount: "2" })} onChange={() => {}} />,
    );
    const t1 = text(one.container);
    expect(t1).toContain("목록이 비어 있을 때만 사용됩니다");
    expect(t1).toContain("중과 2주택·3주택 판정");
  });
});

describe("S10-9 판정 메뉴 ③ — 분양권·입주권 「없음」 확인 토글이 없다", () => {
  for (const kind of ["housing", "right_to_move_in"]) {
    it(`${kind} · 권리 0행 → 토글 없음, 평문 「없음」`, () => {
      const { container } = render(<Step2 form={judgmentForm({}, kind)} onChange={() => {}} />);
      expect(container.querySelectorAll('[data-field="householdNoPresaleRightsConfirmed"]').length).toBe(0);
      expect(text(container)).not.toContain("보유한 분양권·조합원입주권이 없습니다");
      expect(text(container)).toContain("분양권·입주권");
    });
  }

  it("대조(계산기): 같은 0행에서 확인 토글이 ⑧ 관문으로 그대로 있다", () => {
    const { container } = render(<HousesListSection form={calcForm()} onChange={() => {}} />);
    expect(container.querySelectorAll('[data-field="householdNoPresaleRightsConfirmed"]').length).toBe(1);
    expect(text(container)).toContain("보유한 분양권·조합원입주권이 없습니다");
  });
});
