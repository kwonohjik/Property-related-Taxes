/**
 * P2 C ⑤ 렌더 — 토글·파트 카드·고지·앵커 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §3.2 · §2.6
 * 불변식: 토글 OFF 화면은 종전 그대로(`CarryoverGiftBlock` 비-파트 경로 불변). ON이면 자산 전체 1벌 입력(증여자 취득일·환산 토글·증여 당시 평가액)이 파트 카드로 바뀐다.
 * 앵커(`data-field`)는 ⑧이 이동시키는 키와 같고 화면에 각 1개다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const noop = () => {};
const mount = (a: AssetForm, extra: { isNonPrimaryAsset?: boolean; hasCompanions?: boolean } = {}) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={noop} transferDate="2025-06-30" isNewConstruction={false} {...extra} />);

describe("⑤ C 화면", () => {
  it("ON: 파트 카드 2장 · 증여세 카드 · N4·N5 · 환산 토글·증여 당시 평가액 없음 · 앵커 각 1개 · PHD/APD 옵션 없음", () => {
    const { container } = mount(cAsset());
    expect(screen.getByTestId("split-carryover-land-card")).toBeTruthy();
    expect(screen.getByTestId("split-carryover-building-card")).toBeTruthy();
    // P5 — 1세대1주택 겹침 차단 안내(N4)·세대 사실 미반영 고지(N5)는 없다(②2호를 엔진이 판정 · 세대 사실을 묻는다)
    expect(screen.queryByTestId("split-carryover-onehouse-notice")).toBeNull();
    expect(screen.queryByTestId("split-carryover-household-note")).toBeNull();
    expect(screen.queryByText("환산취득가 사용")).toBeNull();
    expect(screen.queryByText("증여 당시 평가액")).toBeNull();
    expect(container.textContent).not.toContain("취득 당시 개별주택가격 미공시");
    expect(container.textContent).toContain("증여자와 같은 세대 여부"); // P5 — 세대 사실 질문을 묻는다(건물이 증여받은 주택)
    for (const key of [
      "carryoverDonorSplit", "carryover.giftRegistryDate", "landCarryover.donorAcquisitionDate", "landCarryover.donorAcquisitionPrice", "landCarryover.donorCapitalExpenditure",
      "landAcquisitionPrice", "carryover.donorAcquisitionDate", "carryover.donorAcquisitionPrice", "carryover.donorCapitalExpenditure", "buildingAcquisitionPrice",
      "carryover.giftTaxCalculated", "carryover.giftTaxBase",
    ]) {
      expect(container.querySelectorAll(`[data-field="${key}"]`).length, key).toBe(1);
    }
    // 위→아래 = 계산 순서: 등기접수일 → 토글 → 토지 → 건물 → 증여세
    const order = ["carryover.giftRegistryDate", "carryoverDonorSplit", "landCarryover.donorAcquisitionDate", "carryover.donorAcquisitionDate", "carryover.giftTaxBase"].map((k) =>
      Array.from(container.querySelectorAll("[data-field]")).findIndex((el) => el.getAttribute("data-field") === k),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("ON: 배우자 예외 사실(§97의2②2호 · 증여일 현재 1세대1주택) 질문을 묻는다 — P5부터 ④가 사건에 싣는다(통째 증여 C만)", () => {
    const spouse = { carryover: { ...cAsset().carryover, donorRelation: "spouse" } };
    const { container } = mount(cAsset(spouse));
    expect(container.textContent).toContain("증여일 현재 배우자(증여자) 세대가 이 주택 1채만 보유");
    cleanup();
    // 짝 — OFF(자산 전체)도 종전대로 묻는다
    const off = mount(cAsset({ ...spouse, carryoverDonorSplit: false }));
    expect(off.container.textContent).toContain("증여일 현재 배우자(증여자) 세대가 이 주택 1채만 보유");
  });

  it("저장 토글 ON인데 술어가 거짓(소유자 분리·부담부증여)이면 «지금 조건에서는 적용되지 않음» 한 줄 — 정상 ON·OFF에는 없다", () => {
    mount(cAsset());
    expect(screen.queryByTestId("carryover-donor-split-inactive")).toBeNull();
    cleanup();
    mount(cAsset({ selfOwns: "building_only" }));
    expect(screen.getByTestId("carryover-donor-split-inactive").textContent).toContain("토지·건물 소유자가 다른 자산");
    cleanup();
    mount(cAsset({ transferType: "burdened_gift" }));
    expect(screen.getByTestId("carryover-donor-split-inactive").textContent).toContain("부담부증여 양도");
    cleanup();
    mount(cAsset({ carryoverDonorSplit: false, selfOwns: "building_only" }));
    expect(screen.queryByTestId("carryover-donor-split-inactive")).toBeNull();
  });

  it("OFF: 종전 화면 — 환산 토글·증여 당시 평가액이 있고 파트 카드·N4·N5는 없다(회귀 0)", () => {
    mount(cAsset({ carryoverDonorSplit: false }));
    expect(screen.getByText("환산취득가 사용")).toBeTruthy();
    expect(screen.getByText("증여 당시 평가액")).toBeTruthy();
    expect(screen.queryByTestId("split-carryover-land-card")).toBeNull();
    expect(screen.queryByTestId("split-carryover-onehouse-notice")).toBeNull();
    expect(screen.getByTestId("carryover-donor-split-toggle")).toBeTruthy();
  });

  it("토글을 놓을 수 없는 자산(토지·일반건물·겸용)은 토글이 없다", () => {
    for (const patch of [{ assetKind: "land" }, { assetKind: "general_building" }, { isMixedUseHouse: true }]) {
      const { container, unmount } = mount(cAsset({ carryoverDonorSplit: false, ...patch }));
      expect(container.querySelector('[data-testid="carryover-donor-split-toggle"]'), JSON.stringify(patch)).toBeNull();
      unmount();
    }
  });

  it("소유자 분리·부담부증여면 꺼진 토글은 잠기고 사유가 보인다(끄는 방향은 허용)", () => {
    const off = cAsset({ carryoverDonorSplit: false, selfOwns: "building_only" });
    const { container } = mount(off);
    const t = container.querySelector('[data-testid="carryover-donor-split-toggle"]') as HTMLElement;
    expect(t.getAttribute("data-disabled")).not.toBeNull();
    expect(within(t).getByText(/토지·건물 소유자가 다른 자산에는 쓸 수 없습니다/)).toBeTruthy();
    cleanup();
    // 이미 켜진 채 잔재(소유자 분리 ON)면 술어가 «없음»으로 읽어 파트 카드가 사라진다 — 토글은 끌 수 있다
    mount(cAsset({ selfOwns: "building_only" }));
    expect(screen.queryByTestId("split-carryover-land-card")).toBeNull();
    const t2 = screen.getByTestId("carryover-donor-split-toggle");
    expect(t2.getAttribute("data-disabled")).toBeNull();
  });

  it("함께 양도 자산(isNonPrimaryAsset)에는 토글 대신 N6, 파트 카드 없음 — 잔재 토글이 켜져 있어도", () => {
    mount(cAsset({ carryoverDonorSplit: true }), { isNonPrimaryAsset: true });
    expect(screen.queryByTestId("carryover-donor-split-toggle")).toBeNull();
    expect(screen.getByTestId("split-carryover-companion-note").textContent).toContain("두 번째 이후 자산에는 토지·건물 파트 이월과세를 쓸 수 없습니다");
    expect(screen.queryByTestId("split-carryover-land-card")).toBeNull();
  });

  it("함께 양도 자산이 있으면 첫 자산에 N8(hasCompanions) — 없으면 없다", () => {
    mount(cAsset(), { hasCompanions: true });
    expect(screen.getByTestId("split-carryover-companion-exists-note").textContent).toContain("함께 양도하는 다른 자산이 있으면");
    cleanup();
    mount(cAsset(), { hasCompanions: false });
    expect(screen.queryByTestId("split-carryover-companion-exists-note")).toBeNull();
  });

  it("C 화면은 수증자 파트 자본적지출 + 축 A(양도가액 구분)를 같이 낸다 — 파트 칸이 화면에 있어야 ⑧의 자본적지출 안내가 막다른 길이 아니다", () => {
    mount(cAsset());
    expect(screen.getByTestId("carryover-parts-sale-axis")).toBeTruthy();
    expect(screen.getByTestId("split-part-land-capex")).toBeTruthy();
    expect(screen.getByTestId("split-part-building-capex")).toBeTruthy();
  });
});
