/**
 * P4 B ⑤ — 취득 원인 「이월과세(증여)」 + 「토지는 다른 원인으로 취득」(건물만 이월과세 + 토지 매매, 소득세법 §97의2①) 화면 (2026-10-21)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §5.2·§5.3·§2.7(N2′·N4·N5)
 * `CompanionAcquisitionCauseSection`을 실제로 mount해 토글 → 건물 이월과세 카드 → 매매 블록 건물 원인 모드(날짜 2열·건물 고정 칩)를 잠근다.
 * ⑧이 이동시키는 앵커(`data-field`)가 화면에 **각 1개**인지, 토글 ON/OFF가 한 patch인지, 자산 전체 이월과세 블록이 함께 뜨지 않는지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { bAsset, B_CARRYOVER } from "../calc/_helpers/split-carryover-b-form";

afterEach(() => {
  cleanup();
  seen.last = undefined;
});

function mount(a: AssetForm, extra: { isNonPrimaryAsset?: boolean; hasCompanions?: boolean } = {}) {
  return render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2025-06-30" isNewConstruction={false} {...extra} />);
}

const seen: { last?: AssetForm } = {};
function Harness({ initial }: { initial: AssetForm }) {
  const [a, setA] = useState(initial);
  return (
    <CompanionAcquisitionCauseSection
      asset={a}
      onChange={(p) =>
        setA((prev) => {
          const next = { ...prev, ...p };
          seen.last = next;
          return next;
        })
      }
      transferDate="2025-06-30"
      isNewConstruction={false}
    />
  );
}

/** 토글 OFF 상태의 이월과세 호스트 — 자산 전체 이월과세 입력만 있다. */
const off = () => bAsset({ hasSeperateLandAcquisitionDate: false, landCauseHost: "", landAcquisitionCause: "", landAcqMode: "", buildingAcqMode: "" });

const ANCHORS = [
  "landAcquisitionCause",
  "carryover.giftRegistryDate",
  "carryover.donorAcquisitionDate",
  "carryover.donorAcquisitionPrice",
  "carryover.donorCapitalExpenditure",
  "carryover.giftTaxCalculated",
  "carryover.giftTaxBase",
  "carryover.donorRelation",
  "landAcquisitionDate",
  "landAcquisitionPrice",
  "buildingAcquisitionPrice",
] as const;

describe("P4 B ⑤", () => {
  it("토글 OFF — 자산 전체 이월과세 블록(증여 당시 평가액 칸 포함)이 있고 B 카드는 없다", () => {
    const { container } = mount(off());
    expect(screen.getByTestId("land-part-cause-building-cause")).toBeTruthy();
    expect(container.querySelector('[data-testid="building-carryover-card"]')).toBeNull();
    expect(container.querySelectorAll('[data-field="carryover.giftDateValuation"]').length).toBe(1);
  });

  it("토글 ON — 건물 이월과세 카드 · N4·N5 · 자산 전체 블록 대신(증여 당시 평가액·C 토글·세대 사실 없음)", () => {
    const { container } = mount(bAsset());
    expect(screen.getByTestId("building-carryover-card")).toBeTruthy();
    // P5 — 1세대1주택 겹침 차단 안내(N4)는 없고, 건물만 증여의 배우자 예외 미적용 고지가 남는다
    expect(screen.queryByTestId("split-carryover-onehouse-notice")).toBeNull();
    expect(screen.getByTestId("split-carryover-household-note").textContent).toContain("건물만 증여받은 경우에는 배우자 예외");
    expect(container.querySelector('[data-field="carryover.giftDateValuation"]')).toBeNull();
    expect(container.querySelector('[data-testid="carryover-donor-split-toggle"]')).toBeNull();
    expect(container.querySelectorAll('[data-field="carryover.donorSameHousehold"]').length).toBe(1); // P5 — 세대 사실을 묻는다(건물 카드 안 한 곳)
    expect(container.querySelector('[data-testid="split-carryover-companion-exists-note"]')).toBeNull();
  });

  it("⑧ 앵커가 화면에 각 1개", () => {
    const { container } = mount(bAsset());
    for (const f of ANCHORS) expect(container.querySelectorAll(`[data-field="${f}"]`).length, f).toBe(1);
  });

  it("건물 취득일 칸은 읽기 전용 + 증여 등기접수일 값 — 저장 칸에 옛 값이 남아도 등기접수일을 보인다 · 건물은 고정 칩", () => {
    mount(bAsset({ acquisitionDate: "2010-01-01" }));
    const b = screen.getByTestId("acq-date-building");
    const input = (b.querySelector("input") ?? b) as HTMLInputElement;
    expect(input.disabled || !!b.querySelector("input:disabled")).toBe(true);
    expect(b.textContent + (input.value ?? "")).toMatch(/2023/);
    expect(b.textContent + (input.value ?? "")).not.toMatch(/2010/);
    expect(screen.getAllByTestId("building-carryover-date-note")).toHaveLength(1);
    expect(screen.getByTestId("part-acq-mode-building-fixed").textContent).toContain("이월과세 건물");
  });

  it("토지는 매매 — 토지 날짜 칸은 입력 가능하고 토지 파트 방식 라디오가 있다", () => {
    const { container } = mount(bAsset());
    const land = screen.getByTestId("acq-date-land");
    expect(land.querySelector("input:disabled")).toBeNull();
    expect(container.querySelector('[data-testid="part-acq-mode-building"]')).toBeNull();
  });

  it("토글 ON 한 번의 patch로 다섯 키를 쓰고 이월과세 입력은 보존한다 → OFF도 한 patch", () => {
    render(<Harness initial={off()} />);
    fireEvent.click(within(screen.getByTestId("land-part-cause-building-cause")).getAllByRole("switch")[0]);
    expect(seen.last).toMatchObject({ landAcquisitionCause: "purchase", landCauseHost: "carryover_gift", hasSeperateLandAcquisitionDate: true, buildingAcqMode: "actual" });
    expect(seen.last!.carryover).toEqual(B_CARRYOVER);
    expect(screen.getByTestId("building-carryover-card")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("land-part-cause-building-cause")).getAllByRole("switch")[0]);
    expect(seen.last).toMatchObject({ landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false });
    expect(seen.last!.carryover).toEqual(B_CARRYOVER);
  });

  it("상호 잠금 — C(증여자가 토지·건물을 다른 날 취득)가 켜져 있으면 B 토글을 켤 수 없다 · 소유자 분리도 같다", () => {
    for (const patch of [{ carryoverDonorSplit: true }, { selfOwns: "building_only" }]) {
      cleanup();
      mount({ ...off(), ...patch } as AssetForm);
      const sw = within(screen.getByTestId("land-part-cause-building-cause")).getAllByRole("switch")[0];
      expect(sw.hasAttribute("disabled") || sw.getAttribute("aria-disabled") === "true", JSON.stringify(patch)).toBe(true);
    }
    // 긍정 짝 — 둘 다 없으면 켤 수 있다
    cleanup();
    mount(off());
    const sw = within(screen.getByTestId("land-part-cause-building-cause")).getAllByRole("switch")[0];
    expect(sw.hasAttribute("disabled") || sw.getAttribute("aria-disabled") === "true").toBe(false);
  });

  it("함께 양도 자산 — 첫 자산이면 N8 안내 · 두 번째 이후 자산은 OFF면 토글이 없고 ON 잔재면 끌 수 있게 남는다", () => {
    mount(bAsset(), { hasCompanions: true });
    expect(screen.getByTestId("split-carryover-companion-exists-note")).toBeTruthy();
    cleanup();
    const { container } = mount(off(), { isNonPrimaryAsset: true });
    expect(container.querySelector('[data-testid="land-part-cause-building-cause"]')).toBeNull();
    cleanup();
    mount(bAsset(), { isNonPrimaryAsset: true });
    expect(screen.getByTestId("land-part-cause-building-cause")).toBeTruthy();
  });

  it("부담부증여 양도 — OFF면 토글을 열지 않는다", () => {
    const { container } = mount({ ...off(), transferType: "burdened_gift" } as AssetForm);
    expect(container.querySelector('[data-testid="land-part-cause-building-cause"]')).toBeNull();
  });

  it("고시 전 증여(2005.4.30. 전) — 날짜 영역에 ⑧과 같은 안내", () => {
    mount(bAsset({ carryover: { ...B_CARRYOVER, giftRegistryDate: "2005-04-29" }, landAcquisitionDate: "1999-01-01" }));
    expect(screen.getAllByTestId("building-cause-date-notice").map((n) => n.textContent).join()).toContain("2005.4.30. 전이면");
  });

  it("건물 기준시가 고시 전 카드·주택별 최초공시일 진입 카드는 열지 않는다(B는 그 비교를 받지 않는다)", () => {
    // 저장 칸 건물 취득일 잔재(2006)가 있어도 — D2라면 진입 카드가 열리는 날짜다
    const { container } = mount(bAsset({ acquisitionDate: "2006-01-01", carryover: { ...B_CARRYOVER, giftRegistryDate: "2006-01-01" } }));
    expect(container.querySelector('[data-testid="house-first-disclosure-entry"]')).toBeNull();
    expect(container.querySelector('[data-testid="building-sec164-card"]')).toBeNull();
  });

  it("별개 취득 판정(매매 블록) — 토지·건물 모두 실가면 취득시 기준시가 칸이 없다(④·⑧과 같은 판정) · 긍정 짝: 토지 환산이면 연다", () => {
    const { container } = mount(bAsset({ acquisitionDate: "" }));
    expect(container.querySelectorAll('[data-field="buildingStandardPriceAtAcq"]').length).toBe(0);
    cleanup();
    const est = mount(bAsset({ acquisitionDate: "", landAcqMode: "estimated" }));
    expect(est.container.querySelectorAll('[data-field="standardPricePerSqmAtAcq"], [data-field="buildingStandardPriceAtAcq"]').length).toBeGreaterThan(0);
  });
});
