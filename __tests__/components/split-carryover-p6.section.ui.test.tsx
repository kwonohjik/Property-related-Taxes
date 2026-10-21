/**
 * P6 ⑤ 렌더 — 파트 카드의 «증여자 취득가액을 모름 — 환산취득가액» 토글·분자 칸·앵커 (2026-10-21)
 *
 * 설계: 계획서 `transfer-split-part-carryover-p6.plan.md` §5.2. A(토지만)·B(건물만)·C(둘 다)가 같은 카드(`SplitPartCarryoverCard`)를 쓴다.
 * 불변식: 토글은 파트당 1개(`{prefix}.partEstimated`) · 켜면 증여자 취득가액 칸 대신 «증여자 취득 당시 이 파트 기준시가» 칸(`{prefix}.donorStandardPriceAtAcquisition`) ·
 * 자본적지출 칸은 유지 · 「아직 지원하지 않습니다」 문구 없음 · 숫자 placeholder 없음 · 자산 전체 환산 토글(`useEstimatedAcquisition`)과 별개(잔재 비누출).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { LandCarryoverCard } from "@/components/calc/transfer/LandCarryoverCard";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import { aAsset } from "../calc/_helpers/split-carryover-a-form";
import { bAsset } from "../calc/_helpers/split-carryover-b-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const count = (c: HTMLElement, key: string) => c.querySelectorAll(`[data-field="${key}"]`).length;
const click = (testid: string) => fireEvent.click(within(screen.getByTestId(testid)).getByRole("switch"));

/** 패치를 상태에 반영하는 하네스 — 토글을 실제로 눌러 본다. */
function CHarness({ initial }: { initial: AssetForm }) {
  const [a, setA] = useState(initial);
  return <CompanionAcquisitionCauseSection asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2025-06-30" isNewConstruction={false} />;
}
function CardHarness({ initial, part }: { initial: AssetForm; part?: "building" }) {
  const [a, setA] = useState(initial);
  return <LandCarryoverCard asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2025-06-30" part={part} />;
}

describe("C — 토지·건물 카드 각자 토글", () => {
  it("OFF(기본): 토글 2개 · 증여자 취득가액 칸 2개 · 분자 칸 없음 · «아직 지원하지 않» 문구 없음 · 자산 전체 환산 토글 없음", () => {
    const { container } = render(<CHarness initial={cAsset()} />);
    expect(screen.getByTestId("split-carryover-land-estimated")).toBeTruthy();
    expect(screen.getByTestId("split-carryover-building-estimated")).toBeTruthy();
    for (const k of ["landCarryover.partEstimated", "carryover.partEstimated", "landCarryover.donorAcquisitionPrice", "carryover.donorAcquisitionPrice"]) expect(count(container, k), k).toBe(1);
    for (const k of ["landCarryover.donorStandardPriceAtAcquisition", "carryover.donorStandardPriceAtAcquisition"]) expect(count(container, k), k).toBe(0);
    expect(container.textContent).not.toContain("아직 지원하지 않");
    expect(container.textContent).toContain("«환산취득가액»을 켜세요");
    expect(screen.queryByText("환산취득가 사용")).toBeNull();
  });

  it("토지 토글 ON: 토지는 분자 칸(증여자 취득가액 칸 대체) · 건물은 그대로 · 자본적지출 칸 유지 · 산식 안내 · 분모 안내", () => {
    const { container } = render(<CHarness initial={cAsset()} />);
    click("split-carryover-land-estimated");
    expect(count(container, "landCarryover.donorStandardPriceAtAcquisition")).toBe(1);
    expect(count(container, "landCarryover.donorAcquisitionPrice")).toBe(0);
    expect(count(container, "landCarryover.donorCapitalExpenditure")).toBe(1);
    expect(count(container, "carryover.donorAcquisitionPrice")).toBe(1);
    expect(count(container, "carryover.donorStandardPriceAtAcquisition")).toBe(0);
    const note = screen.getByTestId("split-carryover-land-estimated-note").textContent!;
    expect(note).toContain("환산취득가액 = 이 토지의 양도가액");
    const card = screen.getByTestId("split-carryover-land-card");
    expect(card.textContent).toContain("증여자 취득 당시 이 파트 기준시가");
    expect(card.textContent).toContain("양도시 기준시가(토지분)");
    expect(card.textContent).toContain("개별공시지가 고시(1990.8.30.) 전");
    expect(card.textContent).toContain("상속·증여로 취득했거나");
    // placeholder 숫자 예시 금지 — 분자 칸에 placeholder가 없다
    const input = screen.getByTestId("split-carryover-land-donor-std-price") as HTMLInputElement;
    expect(input.getAttribute("placeholder") ?? "").not.toMatch(/\d/);
  });

  it("건물 토글 ON → OFF: 가액 칸으로 복귀 · 입력했던 가액 값은 보존", () => {
    const seed = cAsset();
    const { container } = render(<CHarness initial={seed} />);
    click("split-carryover-building-estimated");
    expect(count(container, "carryover.donorStandardPriceAtAcquisition")).toBe(1);
    expect(count(container, "carryover.donorAcquisitionPrice")).toBe(0);
    click("split-carryover-building-estimated");
    expect(count(container, "carryover.donorAcquisitionPrice")).toBe(1);
    expect((screen.getByTestId("split-carryover-building-donor-price") as HTMLInputElement).value).toBe("50,000,000");
  });

  it("위→아래 = 계산 순서: 증여자 취득일 → 환산 토글 → 분자(또는 가액) → 자본적지출", () => {
    const { container } = render(<CHarness initial={cAsset({ landCarryover: { ...cAsset().landCarryover, partEstimated: true } })} />);
    const idx = ["landCarryover.donorAcquisitionDate", "landCarryover.partEstimated", "landCarryover.donorStandardPriceAtAcquisition", "landCarryover.donorCapitalExpenditure"].map((k) =>
      Array.from(container.querySelectorAll("[data-field]")).findIndex((el) => el.getAttribute("data-field") === k),
    );
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("건물 카드 인계 안내 — 환산용 기준시가도 자산 전체 입력과 같은 칸임을 말한다", () => {
    render(<CHarness initial={cAsset()} />);
    expect(screen.getByTestId("split-carryover-building-inherited-note").textContent).toContain("환산용 기준시가");
  });

  it("지분(공유) 양도면 분자 hint에 «지분율로 나누지 말고» 안내 · 아니면 없음", () => {
    render(<CHarness initial={cAsset({ landCarryover: { ...cAsset().landCarryover, partEstimated: true }, ownershipNumerator: "1", ownershipDenominator: "2" })} />);
    expect(screen.getByTestId("split-carryover-land-card").textContent).toContain("지분율로 나누지 말고");
    cleanup();
    render(<CHarness initial={cAsset({ landCarryover: { ...cAsset().landCarryover, partEstimated: true } })} />);
    expect(screen.getByTestId("split-carryover-land-card").textContent).not.toContain("지분율로 나누지 말고");
  });
});

describe("A·B — LandCarryoverCard가 같은 카드를 쓴다", () => {
  it("A 토지: 토글 1개 · ON이면 분자 칸 · 가액 칸 대체", () => {
    const { container } = render(<CardHarness initial={aAsset("purchase")} />);
    expect(count(container, "landCarryover.partEstimated")).toBe(1);
    expect(count(container, "landCarryover.donorAcquisitionPrice")).toBe(1);
    click("split-carryover-land-estimated");
    expect(count(container, "landCarryover.donorStandardPriceAtAcquisition")).toBe(1);
    expect(count(container, "landCarryover.donorAcquisitionPrice")).toBe(0);
    expect(container.textContent).not.toContain("아직 지원하지 않");
  });
  it("B 건물: 토글 1개 · ON이면 분자 칸(carryover.*) · 건물 hint는 건물 기준시가", () => {
    const { container } = render(<CardHarness initial={bAsset()} part="building" />);
    expect(count(container, "carryover.partEstimated")).toBe(1);
    click("split-carryover-building-estimated");
    expect(count(container, "carryover.donorStandardPriceAtAcquisition")).toBe(1);
    expect(count(container, "carryover.donorAcquisitionPrice")).toBe(0);
    expect(screen.getByTestId("split-carryover-building-card").textContent).toContain("건물 기준시가 (물건 전체 값)");
    expect(screen.getByTestId("split-carryover-building-card").textContent).toContain("건물 기준시가 고시 전");
  });
});

describe("토글 → 패치", () => {
  it("켜면 파트 서브폼에 partEstimated:true만 얹는다 — 자산 전체 환산 필드(useEstimatedAcquisition·estimationMode)는 건드리지 않는다", () => {
    const onChange = vi.fn();
    render(<CompanionAcquisitionCauseSection asset={cAsset()} onChange={onChange} transferDate="2025-06-30" isNewConstruction={false} />);
    click("split-carryover-land-estimated");
    const patch = onChange.mock.calls[0][0] as { landCarryover: Record<string, unknown> };
    expect(patch.landCarryover.partEstimated).toBe(true);
    expect(patch.landCarryover.useEstimatedAcquisition).toBe(false);
    expect(patch.landCarryover.estimationMode).toBeNull();
  });
});
