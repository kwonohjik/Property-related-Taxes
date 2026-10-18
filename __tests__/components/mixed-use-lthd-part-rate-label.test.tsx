/**
 * 겸용 결과 카드·계산 단계의 「장기보유공제 (표N, 율)」 라벨 — 토지·건물 공제율이 다르면 파트별 표·율로 적는다.
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-filing-lthd-part-split.plan.md §8
 *
 * 종전: 주택분은 건물 기준 율, 상가분은 긴 보유연수 기준 율 하나였다 — B(건물 2023·거주 3년)는 주택분 「표2, 24%」인데
 *   토지분은 통칙 95-0…1로 표1 30%였고, 상가분 「표1, 30%」인데 건물분은 6%였다.
 * 판정은 상세명세서와 같은 `mixedPartLthdRates` 하나다.
 *
 * 픽스처: CASE14(토지 1992-01-01) · 30억 · 양도 2026-06-01 · mock 세율.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const engine = (over: Partial<MixedUseAssetInput>) =>
  calc(3_000_000_000, D("2026-06-01"), { ...mixedUseCase14(), ...over } as MixedUseAssetInput, makeMockRates());
const stepLabel = (r: MixedUseGainBreakdown, id: string) =>
  r.steps.find((s) => s.id === id)?.values.find((v) => v.label.startsWith("장기보유공제"))?.label;

describe("겸용 장특 라벨 — 계산 단계", () => {
  it("B — 주택분 토지 표1 30% · 건물 표2 24%, 상가분 토지 30% · 건물 6%", () => {
    const r = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    expect(stepLabel(r, "step-5-housing")).toBe("장기보유공제 (토지 표1 30% · 건물 표2 24%)");
    expect(stepLabel(r, "step-7-commercial")).toBe("장기보유공제 (토지 표1 30% · 건물 표1 6%)");
  });

  it("A — 주택분은 같은 율(56%)이라 종전 그대로, 상가분은 파트별", () => {
    const r = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 });
    expect(stepLabel(r, "step-5-housing")).toBe("장기보유공제 (표2, 56%)");
    expect(stepLabel(r, "step-7-commercial")).toBe("장기보유공제 (토지 표1 30% · 건물 표1 14%)");
  });

  it("토지·건물 동시 취득(1992) — 둘 다 종전 그대로", () => {
    const r = engine({ buildingAcquisitionDate: D("1992-01-01"), residencePeriodYears: 7 });
    expect(stepLabel(r, "step-5-housing")).toBe("장기보유공제 (표2, 68%)");
    expect(stepLabel(r, "step-7-commercial")).toBe("장기보유공제 (표1, 30%)");
  });
});

describe("겸용 장특 라벨 — 결과 카드", () => {
  it("B — 주택분·상가분 라벨과 산식이 파트별, 토지분 통칙 근거", () => {
    const r = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    const { container } = render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getByText("장기보유공제 (토지 표1 30.00% · 건물 표2 24.00%)")).toBeInTheDocument();
    expect(screen.getByText("장기보유공제 (토지 표1 30.00% · 건물 표1 6.00%)")).toBeInTheDocument();
    const txt = container.textContent ?? "";
    expect(txt).toContain(
      "토지분 48,307,382 × 30.00% = 14,492,214 + 건물분 234,812,452 × 24.00% = 56,354,988 — 토지분은 주택보다 먼저 취득해 표1·표2 중 큰 공제율(소득세법 기본통칙 95-0…1)",
    );
    expect(txt).toContain("토지분 843,267,352 × 30.00%(보유 34년) = 252,980,205 + 건물분 33,845,667 × 6.00%(보유 3년) = 2,030,740");
  });

  it("C 표1 — 주택분 토지 30% · 건물 14%, 통칙 근거 없음", () => {
    const r = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 0 });
    const { container } = render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getAllByText("장기보유공제 (토지 표1 30.00% · 건물 표1 14.00%)")).toHaveLength(2);
    const txt = container.textContent ?? "";
    expect(txt).toContain("토지분 48,307,382 × 30.00% = 14,492,214 + 건물분 234,812,452 × 14.00% = 32,873,743");
    expect(txt).not.toContain("토지분은 주택보다 먼저 취득해");
  });

  it("토지·건물 동시 취득 — 종전 라벨·산식 그대로", () => {
    const r = engine({ buildingAcquisitionDate: D("1992-01-01"), residencePeriodYears: 7 });
    const { container } = render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getByText("장기보유공제 (표2, 68.00%)")).toBeInTheDocument();
    expect(screen.getByText("장기보유공제 (표1, 30.00%)")).toBeInTheDocument();
    expect(container.textContent).toContain("보유연수×2% (최대 30%) — 토지/건물 별 보유연수 적용");
  });

  it("파트 echo가 없는 옛 결과 — 종전 라벨", () => {
    const r = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    delete r.housingPart.partLthd;
    delete r.commercialPart.partLthd;
    render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getByText("장기보유공제 (표2, 24.00%)")).toBeInTheDocument();
    expect(screen.getByText("장기보유공제 (표1, 30.00%)")).toBeInTheDocument();
  });
});
