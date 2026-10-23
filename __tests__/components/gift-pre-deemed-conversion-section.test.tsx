/**
 * 의제취득일(1985.1.1.) 전 증여 — ③ 입력 카드 화면 (PR-5 · 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §16).
 *
 * - 카드는 증여 화면(`CompanionAcquisitionCauseSection`)에 뜬다 — 술어 `isGiftPreDeemedConversionAsset`(④ 전송 게이트와 같다).
 * - 토지 등급(②)이 다 차면 분자 칸은 자동값(②와 같은 값)을 보여 주고 잠긴다 — ④·엔진이 쓰는 값과 같다.
 * - 1985 전 증여 상가는 환산 토글 블록이 없다(Q-13) — ③은 이 카드로 받는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const gift = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "1980-03-01",
    donorAcquisitionDate: "1975-01-01",
    acquisitionArea: "184.2",
    ...over,
  }) as AssetForm;

const cause = (a: AssetForm) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} />);

describe("③ 카드 노출", () => {
  it("1980 증여 토지 → 카드 · 분자·분모 두 칸", () => {
    cause(gift());
    const card = screen.getByTestId("gift-pre-deemed-conversion");
    expect(card.querySelector('[data-field="standardPriceAtAcq"] input')).not.toBeNull();
    expect(card.querySelector('[data-field="standardPriceAtTransfer"] input')).not.toBeNull();
    // 증여는 등급 입력이 카드 위(§164④ 섹션)에 있다 — 「아래」가 아니라 「위」로 안내한다
    expect(within(card).getByText(/위 §164④ 토지등급을 모두 입력하면/)).toBeTruthy();
  });

  it("부담부증여(기준시가 평가) → 의제취득일 기준시가 카드 (계획서 §18 Q-25 — 종전에는 카드 없음)", () => {
    cause(gift({ transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard" }));
    const card = screen.getByTestId("gift-pre-deemed-conversion");
    expect(within(card).getByText("의제취득일(1985.1.1.) 전 증여 — 의제취득일 기준시가")).toBeTruthy();
    // 양도시 기준시가는 부담부증여 양도정보 칸이 받는다 — 여기 중복하지 않는다
    expect(within(card).queryByText("양도시 기준시가")).toBeNull();
  });

  it("1988 증여 · 상속 → 카드 없음", () => {
    for (const a of [
      gift({ acquisitionDate: "1988-03-01" }),
      gift({ acquisitionCause: "inheritance", inheritanceStartDate: "1980-03-01" }),
    ]) {
      cause(a);
      expect(screen.queryByTestId("gift-pre-deemed-conversion")).toBeNull();
      cleanup();
    }
  });

  it("🔴 등급 5칸이 차면 분자는 자동값(잠금)이다 — 래치(`pre1990Enabled`) 없이도(증여 등급 입력은 래치를 켜지 않는다)", () => {
    cause(
      gift({
        pre1990GradeMode: "number",
        pre1990Grade_atAcq: "200",
        pre1990Grade_current: "218",
        pre1990Grade_prev: "218",
        pre1990PricePerSqm_1990: "1100000",
        standardPriceAtAcq: "900000000",
      }),
    );
    const card = screen.getByTestId("gift-pre-deemed-conversion");
    const input = card.querySelector('[data-field="standardPriceAtAcq"] input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.value).not.toBe("900,000,000");
    expect(within(card).getByText("의제취득일 시점 기준시가 직접 입력")).toBeTruthy();
  });

  it("🔴 증여 단독주택 — 3시점 양도 당시 개별주택가격이 있으면 분모는 자동값(잠금)이다(④가 store 분모를 싣지 않는 것과 같은 판정)", () => {
    cause(
      gift({
        assetKind: "housing",
        inhHouseValUseHousePriceOverride: true,
        inhHouseValHousePriceAtInheritanceOverride: "150000000",
        inhHouseValHousePriceAtTransfer: "400000000",
        standardPriceAtAcq: "999",
        standardPriceAtTransfer: "300000000",
      }),
    );
    const card = screen.getByTestId("gift-pre-deemed-conversion");
    const atAcq = card.querySelector('[data-field="standardPriceAtAcq"] input') as HTMLInputElement;
    const atTransfer = card.querySelector('[data-field="standardPriceAtTransfer"] input') as HTMLInputElement;
    expect([atAcq.disabled, atAcq.value]).toEqual([true, "150,000,000"]);
    expect([atTransfer.disabled, atTransfer.value]).toEqual([true, "400,000,000"]);
  });
});

describe("상가 환산 토글 (Q-13)", () => {
  const section = (a: AssetForm) =>
    render(
      <AssetSectionAcquisition
        asset={a}
        onChange={() => {}}
        transferDate="2023-02-16"
        isNewConstruction={false}
        isPrimary
        splitMode="none"
        onFractionalToggle={() => {}}
        isFirst
        hasSiblings={false}
      />,
    );

  it("1980 증여 상가 → 「환산취득가 사용」 없음 · ③ 카드 있음", () => {
    section(gift({ assetKind: "commercial_building" }));
    expect(screen.queryByText("환산취득가 사용")).toBeNull();
    expect(screen.getByTestId("gift-pre-deemed-conversion")).toBeTruthy();
  });

  it("1990 증여 상가 → 토글은 종전대로 있다(⑧이 막는 영역 · 회귀 0)", () => {
    section(gift({ assetKind: "commercial_building", acquisitionDate: "1990-03-01" }));
    expect(screen.queryAllByText("환산취득가 사용").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("gift-pre-deemed-conversion")).toBeNull();
  });
});
