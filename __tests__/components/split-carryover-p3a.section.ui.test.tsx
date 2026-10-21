/**
 * P3 A ⑤ — 「토지는 다른 원인으로 취득」 원인 「이월과세(증여)」(소득세법 §97의2①) 화면 (2026-10-20)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §4.2·§4.3·§2.7(N1·N4·N5·N7)
 * `CompanionAcquisitionCauseSection`을 실제로 mount해(매매·신축 호스트) 라디오 3옵션 → `LandCarryoverCard` → 토지 취득일 읽기 전용(N7)을 잠근다.
 * ⑧이 이동시키는 앵커(`data-field`)가 화면에 **각 1개**인지, 증여 등기접수일 한 patch가 두 키를 함께 쓰는지(Q-8), H-4 손상값이 렌더를 깨지 않는지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { aAsset, type AHost } from "../calc/_helpers/split-carryover-a-form";

afterEach(() => {
  cleanup();
  seen.last = undefined; // 앞 테스트의 상태가 새지 않게
});

function mount(a: AssetForm, extra: { isNonPrimaryAsset?: boolean; hasCompanions?: boolean } = {}) {
  return render(
    <CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2025-06-30" isNewConstruction={a.acquisitionCause === "newConstruction"} {...extra} />,
  );
}

/** 마지막으로 적용된 상태 — 렌더 중 대입은 React Compiler 규칙 위반이라 이벤트(patch 적용) 시점에 기록한다. */
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
      isNewConstruction={a.acquisitionCause === "newConstruction"}
    />
  );
}

const ANCHORS = [
  "landAcquisitionCause",
  "landCarryover.giftRegistryDate",
  "landCarryover.donorAcquisitionDate",
  "landCarryover.donorAcquisitionPrice",
  "landCarryover.donorCapitalExpenditure",
  "landCarryover.giftTaxCalculated",
  "landCarryover.giftTaxBase",
  "landCarryover.donorRelation",
  "landAcquisitionPrice",
  "landAcquisitionDate",
] as const;

for (const host of ["purchase", "newConstruction"] as const satisfies readonly AHost[]) {
  describe(`P3 A ⑤ × ${host}`, () => {
    it("라디오 3옵션(상속·증여·이월과세(증여)) · 이월과세 선택 상태에서 토지 이월과세 카드 · N4·N5 고지", () => {
      const { container } = mount(aAsset(host));
      const radios = within(screen.getByTestId("land-acq-cause")).getAllByRole("radio");
      expect(radios.map((r) => r.getAttribute("value") ?? r.closest("label")?.textContent)).toHaveLength(3);
      expect(within(screen.getByTestId("land-acq-cause")).getByText("이월과세(증여)")).toBeTruthy();
      expect(screen.getByTestId("land-carryover-card")).toBeTruthy();
      // P5 — 1세대1주택 겹침 차단 안내(N4)는 없고, 토지만 증여의 세대 사실·배우자 예외 미질문 고지가 남는다
      expect(screen.queryByTestId("split-carryover-onehouse-notice")).toBeNull();
      expect(screen.getByTestId("split-carryover-household-note").textContent).toContain("토지만 증여받은 경우에는");
      expect(container.querySelector('[data-testid="split-carryover-companion-exists-note"]')).toBeNull();
    });

    it("⑧ 앵커가 화면에 각 1개", () => {
      const { container } = mount(aAsset(host));
      for (const f of ANCHORS) expect(container.querySelectorAll(`[data-field="${f}"]`).length, f).toBe(1);
    });

    it("토지 취득일 칸은 읽기 전용 + 증여 등기접수일 값 + N7 — 저장 칸에 옛 값이 남아도 등기접수일을 보인다", () => {
      mount(aAsset(host, { landAcquisitionDate: "2010-01-01" }));
      const land = screen.getByTestId("acq-date-land");
      const input = (land.querySelector("input") ?? land) as HTMLInputElement;
      expect(input.disabled || land.getAttribute("aria-disabled") === "true" || !!land.querySelector("input:disabled")).toBe(true);
      expect(land.textContent + (input.value ?? "")).toMatch(/2023/);
      expect(screen.getAllByTestId("land-carryover-date-note")).toHaveLength(1);
    });

    it("상속·증여 전용 칸이 없다 — 피상속인 취득일·영 §164④ 카드·「취득 당시 개별주택가격 미공시」·세대 사실 질문", () => {
      const { container } = mount(aAsset(host, { landDecedentAcquisitionDate: "1990-01-01" }));
      expect(container.querySelector('[data-field="landDecedentAcquisitionDate"]')).toBeNull();
      expect(container.textContent).not.toContain("취득 당시 개별주택가격 미공시");
      expect(container.querySelector('[data-field="landCarryover.donorSameHousehold"]')).toBeNull();
      expect(container.querySelector('[data-field="carryover.donorSameHousehold"]')).toBeNull();
    });

    it("함께 양도하는 다른 자산이 있으면 N8 · 두 번째 이후 자산이면 이월과세 옵션이 없다", () => {
      mount(aAsset(host), { hasCompanions: true });
      expect(screen.getByTestId("split-carryover-companion-exists-note")).toBeTruthy();
      cleanup();
      mount(aAsset(host, { landAcquisitionCause: "gift" }), { isNonPrimaryAsset: true });
      expect(within(screen.getByTestId("land-acq-cause")).queryByText("이월과세(증여)")).toBeNull();
      expect(screen.getByTestId("land-gift-carryover-notice").textContent).toContain("두 번째 이후 자산");
    });

    it("N1 — 원인 「증여」면 「이월과세(증여)」를 고르라는 고지(첫 자산)", () => {
      mount(aAsset(host, { landAcquisitionCause: "gift" }));
      const n1 = screen.getByTestId("land-gift-carryover-notice").textContent!;
      expect(n1).toContain("「이월과세(증여)」를 선택하세요");
      expect(n1).not.toContain("증여자 취득일");
      expect(screen.queryByTestId("land-carryover-card")).toBeNull();
    });

    it("Q-8 — 증여 등기접수일 입력 한 번이 landCarryover.giftRegistryDate와 landAcquisitionDate를 함께 쓴다 · 라디오 증여→이월과세 전환도 맞춘다", () => {
      render(<Harness initial={aAsset(host, { landAcquisitionCause: "gift", landAcquisitionDate: "2019-01-01" })} />);
      fireEvent.click(within(screen.getByTestId("land-acq-cause")).getByText("이월과세(증여)"));
      expect(seen.last!.landAcquisitionCause).toBe("carryover_gift");
      expect(seen.last!.landAcquisitionDate).toBe("2023-03-01");
      // DateInput은 연·월·일 3칸이다 — 연도 칸만 바꾸면 «2022-03-01»이 한 번 emit된다.
      const [year] = Array.from(screen.getByTestId("land-carryover-gift-date").querySelectorAll("input"));
      fireEvent.change(year, { target: { value: "2022" } });
      expect(seen.last!.landCarryover?.giftRegistryDate).toBe("2022-03-01");
      expect(seen.last!.landAcquisitionDate).toBe("2022-03-01");
    });

    it("토글 OFF는 원인만 비우고 이월과세 입력은 보존한다", () => {
      render(<Harness initial={aAsset(host)} />);
      const toggle = within(screen.getByTestId(host === "purchase" ? "land-part-cause-purchase" : "newconstruction-land-acq")).getAllByRole("switch")[0];
      fireEvent.click(toggle);
      expect(seen.last!.landAcquisitionCause).toBe("");
      expect(seen.last!.landCarryover?.donorAcquisitionPrice).toBe("100,000,000");
      expect(screen.queryByTestId("land-carryover-card")).toBeNull();
    });
  });
}

describe("H-4 회귀 — 저장값이 화면을 깨지 않는다", () => {
  for (const host of ["purchase", "newConstruction"] as const) {
    it(`${host}: 손상값(\"foo\")은 토글 꺼짐으로 렌더`, () => {
      const { container } = mount(aAsset(host, { landAcquisitionCause: "foo" }));
      const id = host === "purchase" ? "land-part-cause-purchase" : "newconstruction-land-acq";
      expect(within(screen.getByTestId(id)).getAllByRole("switch")[0]).not.toBeChecked();
      expect(container.querySelector('[data-testid="land-carryover-card"]')).toBeNull();
    });
    it(`${host}: 이월과세 서브폼 없이 원인만 저장된 이력(\"carryover_gift\")도 렌더 — 빈 이월과세 카드가 열린다`, () => {
      mount(aAsset(host, { landCarryover: undefined }));
      expect(screen.getByTestId("land-carryover-card")).toBeTruthy();
    });
  }
});

describe("숨은 이전 형식 필요경비 — ⑤ 기준시가 카드 게이팅이 ④(expenses 0)와 같은 인자를 읽는다", () => {
  // 매매 호스트만 — 신축 호스트는 매매 블록이 마운트되지 않아 이 카드가 원래 없다(D1 신축 + 숨은 잔재의 ⑧ 요구는 별건 결함).
  for (const host of ["purchase"] as const) {
    it(`${host}: A면 건물 취득시 기준시가 카드를 열지 않는다 — 긍정 짝: 같은 잔재로 토지 증여(D1)면 연다`, () => {
      const legacy = { directExpenses: "5,000,000", transferExpense: "1,000,000" };
      // ⑧이 이동시키는 앵커(`data-field`)로 센다 — 카드 testid는 양도시 칸 동거 여부에 따라 갈린다.
      const stdField = (c: HTMLElement) => c.querySelectorAll('[data-field="buildingStandardPriceAtAcq"]').length;
      expect(stdField(mount(aAsset(host, legacy)).container)).toBe(0);
      cleanup();
      expect(stdField(mount(aAsset(host, { ...legacy, landAcquisitionCause: "gift" })).container)).toBe(1);
    });
  }
});

describe("별개 취득 판정 — ⑤가 ④·⑧과 같다(매매 블록이 `landCarryover`까지 넘긴다)", () => {
  it("purchase: A면 자산 전체 「취득가액 산정 방식·취득가액」 칸이 없다 — 긍정 짝: 취득일 분리 없는 매매는 있다", () => {
    const axisA = (c: HTMLElement) => c.querySelectorAll('[data-field="fixedAcquisitionPrice"], [data-field="useEstimatedAcquisition"]').length;
    expect(axisA(mount(aAsset("purchase")).container)).toBe(0);
    cleanup();
    expect(axisA(mount(aAsset("purchase", { hasSeperateLandAcquisitionDate: false, landAcquisitionCause: "", landCauseHost: "" })).container)).toBeGreaterThan(0);
  });
});
