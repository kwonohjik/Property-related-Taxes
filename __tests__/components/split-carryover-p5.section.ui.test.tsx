/**
 * P5 ⑤ — 파트 이월과세 × 1세대1주택(소득세법 §97의2②2호) 화면 (2026-10-21)
 *
 * 계획: docs/00-pm/transfer-split-part-carryover-p5.plan.md §6 Q3·Q4
 *   · 1세대1주택 겹침 차단 안내(N4)는 없다 — 엔진이 ②2호를 판정해 계산한다.
 *   · 세대 사실(증여자와 계속 같은 세대)은 C·B만 묻는다(건물이 증여받은 주택). A(토지만)는 묻지 않고 고지한다.
 *   · 배우자 예외는 C(통째 증여)만 묻는다. B는 묻지 않고 고지한다.
 * 앵커(`data-field`)는 ⑧이 이동시키는 키와 같고 화면에 각 1개다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import { bAsset, B_CARRYOVER } from "../calc/_helpers/split-carryover-b-form";
import { aAsset } from "../calc/_helpers/split-carryover-a-form";

afterEach(cleanup);
const mount = (a: AssetForm) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2025-06-30" isNewConstruction={false} />);

const SPOUSE_FACT_TEXT = "증여일 현재 배우자(증여자) 세대가 이 주택 1채만 보유";
const count = (c: HTMLElement, key: string) => c.querySelectorAll(`[data-field="${key}"]`).length;

describe("P5 ⑤ — 1세대1주택 겹침 차단 안내 없음", () => {
  it.each([
    ["C", () => cAsset()],
    ["A", () => aAsset("purchase")],
    ["B", () => bAsset()],
  ] as const)("%s: «아직 계산하지 못합니다» 안내(N4)가 없다", (_, make) => {
    const { container } = mount(make());
    expect(screen.queryByTestId("split-carryover-onehouse-notice")).toBeNull();
    expect(container.textContent).not.toContain("판정 대상인 양도는 아직 계산하지 못합니다");
  });
});

describe("P5 ⑤ — 세대 사실(Q3)", () => {
  it("C: 세대 사실 질문이 열린다 — 앵커 carryover.donorSameHousehold 1개 · 미반영 고지(N5)는 없다", () => {
    const { container } = mount(cAsset());
    expect(count(container, "carryover.donorSameHousehold")).toBe(1);
    expect(screen.queryByTestId("split-carryover-household-note")).toBeNull();
  });

  it("C: «예»면 세대 보유 시작일·증여 전 거주 개월 칸이 열린다(앵커 각 1개)", () => {
    const { container } = mount(cAsset({ carryover: { ...cAsset().carryover, donorSameHousehold: "yes" } }));
    expect(count(container, "carryover.donorHouseholdHoldingStartDate")).toBe(1);
    expect(count(container, "carryover.donorPriorHouseholdResidenceMonths")).toBe(1);
  });

  it("B: 세대 사실 질문이 열린다(건물 이월과세 카드 안) — 앵커 1개", () => {
    const { container } = mount(bAsset());
    expect(count(container, "carryover.donorSameHousehold")).toBe(1);
  });

  it("A: 세대 사실은 묻지 않는다(건물은 본인 취득) · 고지 문구", () => {
    const { container } = mount(aAsset("purchase"));
    expect(count(container, "carryover.donorSameHousehold")).toBe(0);
    expect(count(container, "landCarryover.donorSameHousehold")).toBe(0);
    expect(screen.getByTestId("split-carryover-household-note").textContent).toContain("토지만 증여받은 경우에는 증여자와의 세대 사실과 배우자 예외");
  });
});

describe("P5 ⑤ — 배우자 예외(Q4)", () => {
  it("C + 관계 배우자: 배우자 예외 질문이 열린다", () => {
    const { container } = mount(cAsset({ carryover: { ...cAsset().carryover, donorRelation: "spouse" } }));
    expect(container.textContent).toContain(SPOUSE_FACT_TEXT);
  });

  it("B + 관계 배우자: 묻지 않는다 · 고지 문구", () => {
    const { container } = mount(bAsset({ carryover: { ...B_CARRYOVER, donorRelation: "spouse" } }));
    expect(container.textContent).not.toContain(SPOUSE_FACT_TEXT);
    expect(screen.getByTestId("split-carryover-household-note").textContent).toContain("건물만 증여받은 경우에는 배우자 예외");
  });

  it("A + 관계 배우자: 묻지 않는다", () => {
    const a = aAsset("purchase");
    const { container } = mount({ ...a, landCarryover: { ...a.landCarryover!, donorRelation: "spouse" } } as AssetForm);
    expect(container.textContent).not.toContain(SPOUSE_FACT_TEXT);
  });
});
