/**
 * NBL2611-C1 (V10-BX08) — 증축 일반건물 3자산 요약표: 토지가 사업용·비사업용 초과분 두 장으로 갈려도 표가 남는다.
 * 수정 전: 카드 4장 → `props.length !== 3` → 표가 통째로 사라졌다(증축 + 초과분).
 * + V10-BX06·V2-C2 고지가 「확인이 필요한 사항」 목록에 같은 문구로 실린다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";
import { NblExcessConfirmNotice } from "@/components/calc/transfer/NblExcessConfirmNotice";
import {
  NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE,
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
  gbExcessConfirmNotices,
  mergeGbExcessConfirmNotices,
} from "@/lib/tax-engine/nbl-confirm-notices";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

afterEach(cleanup);

type Card = Record<string, unknown> & { propertyId: string };
const card = (propertyId: string, label: string, v: Partial<Record<string, number>> = {}): Card => ({
  propertyId, propertyLabel: label, transferPrice: 0, acquisitionPrice: 0, necessaryExpense: 0, transferGain: 0, longTermHoldingDeduction: 0, income: 0,
  lossOffsetFromSameGroup: 0, lossOffsetFromOtherGroup: 0, incomeAfterOffset: 0, ...v,
});
const agg = (props: Card[]) => ({ properties: props, lossOffsetTable: [] }) as unknown as AggregateTransferResult;
const b1 = card("building1", "건물(3001)", { transferPrice: 300_000_000 });
const b2 = card("building2", "증축건물(3002)", { transferPrice: 200_000_000 });

describe("증축 3자산 요약표 × 토지 카드 구성", () => {
  it("★ 토지 사업용+초과분 4장 → 표가 남고 토지 열에 두 몫이 합쳐진다 (양도가 2.5억 + 3.5억 = 6억)", () => {
    render(<GeneralBuilding3WayTable aggregated={agg([
      card("land_business", "토지-사업용(1001)", { transferPrice: 250_000_000 }),
      card("land_nbl", "토지-비사업용초과분(1002)", { transferPrice: 350_000_000 }),
      b1, b2,
    ])} />);
    expect(screen.getByText(/일반건물 3-자산 요약/)).toBeTruthy();
    expect(screen.getAllByText("600,000,000").length).toBeGreaterThan(0);
    expect(screen.getByText(/사업용분\(1001\)과 비사업용 초과분\(1002\)을 합산/)).toBeTruthy();
  });

  it("전체 비사업용 3장(land_nbl 단독) → 표가 남는다 · 합산 안내는 없다", () => {
    render(<GeneralBuilding3WayTable aggregated={agg([card("land_nbl", "토지-비사업용(1001)", { transferPrice: 500_000_000 }), b1, b2])} />);
    expect(screen.getByText(/일반건물 3-자산 요약/)).toBeTruthy();
    expect(screen.queryByText(/비사업용 초과분\(1002\)을 합산/)).toBeNull();
  });
});

describe("R-c07-11 — 장기보유공제 행 표기 통일", () => {
  it("공제가 모두 0이면 토지·건물·합계 네 칸이 같은 «0»(△0 없음) · 공제가 있으면 △금액", () => {
    const row = () => screen.getByText("장기보유공제").closest("tr") as HTMLElement;
    const cells = () => Array.from(row().querySelectorAll("td")).slice(1).map((td) => td.textContent);
    render(<GeneralBuilding3WayTable aggregated={agg([card("land_nbl", "토지-비사업용(1001)", { transferPrice: 500_000_000 }), b1, b2])} />);
    expect(cells()).toEqual(["0", "0", "0", "0"]);
    cleanup();
    render(<GeneralBuilding3WayTable aggregated={agg([
      card("land_nbl", "토지-비사업용(1001)", { transferPrice: 500_000_000, longTermHoldingDeduction: 1_000 }), b1,
      card("building2", "증축건물(3002)", { transferPrice: 200_000_000, longTermHoldingDeduction: 500 }),
    ])} />);
    expect(cells()).toEqual(["△1,000", "0", "△500", "△1,500"]);
  });
});

describe("V10-BX06·V2-C2 — 확인 필요 고지 단일 소스", () => {
  it("초과분(비율 > 0)이 있을 때만 두 문구 · 한도 이내·없음은 빈 목록", () => {
    expect(gbExcessConfirmNotices({ nonBusinessRatio: 0.7 })).toEqual([NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE, NBL_STATE_AT_TRANSFER_APPLIED_NOTICE]);
    expect(gbExcessConfirmNotices({ nonBusinessRatio: 1 })).toHaveLength(2);
    expect(gbExcessConfirmNotices({ nonBusinessRatio: 0 })).toEqual([]);
    expect(gbExcessConfirmNotices(undefined)).toEqual([]);
  });

  it("여러 일반건물이어도 같은 문구는 한 번만", () => {
    expect(mergeGbExcessConfirmNotices([{ nonBusinessRatio: 0.2 }, { nonBusinessRatio: 1 }, { nonBusinessRatio: 0 }])).toHaveLength(2);
  });

  it("문구는 «판정하지 않았다»·«확인 필요»를 말하고 근거를 상수로 인용한다", () => {
    expect(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE).toContain("판정하지 않았습니다 — 확인 필요");
    expect(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE).toContain("부설주차장 설치기준면적 이내의 토지");
    expect(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE).toContain("지방세법 시행령 §101 ③");
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("양도일 현재의 상태로 판정해 소유기간 전체에 적용");
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("확인 필요");
  });

  it("결과 「확인이 필요한 사항」 목록에 그대로 실린다", () => {
    render(<CalculationWarningsCard warnings={mergeGbExcessConfirmNotices([{ nonBusinessRatio: 0.7 }])} />);
    expect(screen.getByText("확인이 필요한 사항")).toBeTruthy();
    expect(screen.getByText(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE)).toBeTruthy();
    expect(screen.getByText(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE)).toBeTruthy();
  });

  it("입력 화면 고지 — 일반건물은 두 문구 · 상업용건물(includeStateNotice=false)은 첫 문구만", () => {
    const { rerender } = render(<NblExcessConfirmNotice />);
    expect(screen.getByText(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE)).toBeTruthy();
    expect(screen.getByText(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE)).toBeTruthy();
    rerender(<NblExcessConfirmNotice includeStateNotice={false} />);
    expect(screen.getByText(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE)).toBeTruthy();
    expect(screen.queryByText(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE)).toBeNull();
  });
});
