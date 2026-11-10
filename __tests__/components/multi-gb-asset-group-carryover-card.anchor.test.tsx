/**
 * anchor(⑦ 다건) — 연간 합산 일반건물 결과 행은 그 물건의 부담부증여 × 이월과세 [A]/[B] 비교 카드를 그린다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 GB-BG-CO).
 *
 * echo 키는 자산 id, 지분은 복합 접미사(`<자산id>.<지분번호>`)다 — 자산 부분이 이 행의 자산 id인 단위만 그린다(`p10`은 `p1`의 것이 아니다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MultiGbAssetGroup } from "@/components/calc/results/MultiGbAssetGroup";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

const unit = (assetLabel: string) => ({
  assetLabel,
  isEligible: true,
  applicablePeriodYears: 5,
  adoptedScenario: "A",
  determinedTaxA: 61_874_000,
  determinedTaxB: 58_964_720,
  donorAcquisitionDate: "2019-01-01",
  giftTaxAmount: 0,
  scenarioA: { parts: [], landHoldingStartDate: "2019-01-01", buildingHoldingStartDate: "2019-01-01" },
  scenarioB: { parts: [], landHoldingStartDate: "2021-06-01", buildingHoldingStartDate: "2021-06-01" },
});

describe("MultiGbAssetGroup — 부담부증여 × 이월과세 비교 카드", () => {
  afterEach(cleanup);
  it("이 물건의 단위(자산 id · 지분 복합 접미사)만 자산별 카드로 그린다", () => {
    const result = {
      burdenedGiftCarryoverUnits: { "p1.1": unit("지분 2"), p10: unit("다른 물건"), "p10.0": unit("다른 물건 지분") },
    } as unknown as AggregateTransferResult;
    render(<MultiGbAssetGroup result={result} formPropertyId="p1" cards={[]} />);
    const cards = screen.getAllByTestId("gb-bg-carryover-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("이월과세 비교과세 결과 — 지분 2");
    // 연간 합산 A·B는 신고 전체 결정세액이다 — 「큰 금액」 단건 문구를 쓰지 않는다(자산별 카드)
    expect(screen.queryByTestId("gb-bg-carryover-filing-tax")).toBeNull();
  });

  it("단위가 없으면 카드를 그리지 않는다", () => {
    render(<MultiGbAssetGroup result={{} as AggregateTransferResult} formPropertyId="p1" cards={[]} />);
    expect(screen.queryByTestId("gb-bg-carryover-card")).toBeNull();
    expect(screen.queryByTestId("donor-built-penalty-card")).toBeNull();
  });

  it("당초 증여자 신축·증축 §114조의2 echo(트랙 GB-BG-CO-DNB) — 이 물건 키의 것만 단건과 같은 카드로 그린다", () => {
    const applied = { applied: true, buildingType: "new", constructionDate: "2022-01-10", fifthAnniversary: "2027-01-10", base: 50_000_000, penalty: 2_500_000, burdenedGift: { method: "estimated" } };
    const result = {
      donorBuiltPenaltyByAsset: {
        p1: { label: "건1", echo: applied },
        p10: { label: "다른 물건", echo: { applied: false, notAppliedReason: "scenario_b", buildingType: "new", constructionDate: "2022-01-10" } },
      },
    } as unknown as AggregateTransferResult;
    render(<MultiGbAssetGroup result={result} formPropertyId="p1" cards={[]} />);
    const cards = screen.getAllByTestId("donor-built-penalty-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-applied")).toBe("true");
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toContain("2,500,000");
  });
});
