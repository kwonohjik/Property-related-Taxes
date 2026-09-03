/**
 * anchor: 인가일 이후 **철거 전 사실상 주거용 사용** 기간 합산 (R8, 2026-09-03)
 *
 * ── 근거 ───────────────────────────────────────────────────────────
 * **사전-2019-법령해석재산-0739 [법령해석과-2546]** (생산 2021.07.23 · taxlaw.nts.go.kr 본문 실독):
 *   「관리처분계획의 인가일 이후에도 기존주택이 철거되지 않고 **사실상 주거용으로 사용**되고
 *    있는 경우에는 **해당기간을 1세대1주택 비과세 특례 적용을 위한 보유기간 및 거주기간에
 *    합산**하는 것이며, **사실상 주거용으로 사용되고 있는지 여부는 사실판단할 사항**입니다.」
 *
 * ── ⭐ 모델은 「기준 시점 이동」이 아니라 「기간 합산」이다 ─────────
 * R8 계획서는 이 예외를 「**양도일 기준**으로 판단한 사례」라 적었는데 **부정확**했다.
 * 합산 대상은 **철거 전 사실상 주거용 사용 기간**뿐이다 — 양도일까지 통째로 세면
 * 철거 후 기간까지 들어가 **과대 산정**된다. 그래서 입력은 「양도일」이 아니라 **사용 종료일**이다.
 *
 * ── ⚠️ 자동판정 금지 ──────────────────────────────────────────────
 * 국세청이 「사실판단할 사항」이라 못박았다. 엔진은 계속 `exemptionEligibleAtApproval`
 * **자기선언**(라디오)만 읽고, 이 두 필드는 **자동 제안 기간만** 정확하게 만든다(표시 전용·미송신).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

/** 취득 2018-01-01 · 인가 2019-03-01 ⇒ 인가일 기준 1년 2개월(미충족). */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    acquisitionDate: "2018-01-01",
    redevApprovalDate: "2019-03-01",
    ...over,
  };
}

function renderBlock(a: AssetForm) {
  render(
    <RedevelopmentBlock
      asset={a}
      onChange={vi.fn()}
      isOneHouseSingle
      wasRegulatedAtAcquisition={false}
    />,
  );
}

/** ③-c 카드의 자동 판정 줄 (그리드 밖 단독 박스). */
function autoLine(): string {
  return screen.getByText(/자동 판정:/).textContent ?? "";
}

describe("R8 — 인가일 이후 철거 전 사실상 주거용 사용 기간 합산", () => {
  it("P1: 토글 OFF — 자동 판정은 인가일까지만 센다 (원칙)", () => {
    renderBlock(asset());
    expect(autoLine()).toContain("미충족");
    expect(autoLine()).toContain("1년 2개월");
    expect(autoLine()).not.toContain("합산");
  });

  it("P2: 🔴 토글 ON + 사용 종료일 — 그 날까지 합산해 충족으로 바뀐다", () => {
    renderBlock(
      asset({
        redevPostApprovalHousingUse: "yes",
        redevPostApprovalHousingUseEndDate: "2020-02-01",
      }),
    );
    // 2018-01-01 ~ 2020-02-01 = 25개월 ≥ 24 ⇒ 충족
    expect(autoLine()).toContain("충족");
    expect(autoLine()).toContain("2년 1개월");
    expect(autoLine()).toContain("인가일 이후 사실상 주거용 사용 기간 합산");
  });

  it("P3: 종료일이 양도일이 아니라 **사용 종료일**이다 — 철거 후 기간은 안 센다", () => {
    /**
     * 같은 자산에서 종료일만 인가일 직후(2019-04-01)로 두면 1년 3개월이라 여전히 미충족이다.
     * 「양도일까지」 모델이었다면 양도일이 한참 뒤이므로 충족으로 뒤집혔을 것이다.
     */
    renderBlock(
      asset({
        redevPostApprovalHousingUse: "yes",
        redevPostApprovalHousingUseEndDate: "2019-04-01",
      }),
    );
    expect(autoLine()).toContain("미충족");
    expect(autoLine()).toContain("1년 3개월");
  });

  it("P4: 종료일이 인가일 이전이면 연장하지 않는다 (역행 방어)", () => {
    renderBlock(
      asset({
        redevPostApprovalHousingUse: "yes",
        redevPostApprovalHousingUseEndDate: "2018-06-01",
      }),
    );
    expect(autoLine()).toContain("1년 2개월"); // 인가일 기준 그대로
    expect(autoLine()).not.toContain("합산");
  });

  it("P5: 토글이 꺼져 있으면 저장된 종료일이 있어도 무시한다", () => {
    renderBlock(
      asset({
        redevPostApprovalHousingUse: "",
        redevPostApprovalHousingUseEndDate: "2020-02-01",
      }),
    );
    expect(autoLine()).toContain("미충족");
    expect(autoLine()).toContain("1년 2개월");
  });

  it("P6: 근거 예규가 카드에 인용된다", () => {
    renderBlock(asset());
    expect(screen.getByText(/사전2019-0739/)).toBeTruthy();
  });
});
