/**
 * @vitest-environment jsdom
 *
 * 분양권·입주권 행의 지역 구분 — 소재지 법정동코드가 있으면 엔진(`isPresaleRightCounted`)이 코드로 분류하므로
 * 화면도 같은 분류를 읽기 전용으로 보여 준다(3중 패턴). 코드가 없을 때만 3택 라디오.
 * 계획서: docs/00-pm/multi-house-surcharge-eupmyeon-region.plan.md §4.4 (Q-3)
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | W-1 | ⑤ | 화도읍 코드 → 「가액기준(3억 이하 불산입)」 자동 판정 · 라디오 없음 |
 * | W-2 | ⑤ | 코드 없음 → 3택 라디오 + 읍·면 안내 |
 * | P-1 | ④→⑭ | 코드가 엔진 입력에 닿고, 「수도권」 선택이 남아 있어도 코드 분류로 불산입 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { isPresaleRightCounted } from "@/lib/tax-engine/multi-house-surcharge-count";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const HWADO_EUP = "4136025621"; // 경기 남양주시 화도읍 마석우리

const entry = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
  id: "p",
  type: "presale_right",
  acquisitionDate: "2022-03-01",
  region: "capital",
  regionCriteria: "REGION",
  rightValue: "200000000",
  ...over,
} as PresaleRightEntry);

describe("⑤ 지역 구분 표시", () => {
  it("W-1 화도읍 코드 → 가액기준 자동 판정 · 라디오 없음", () => {
    render(<PresaleRightsSection rights={[entry({ regionCode: HWADO_EUP })]} onChange={vi.fn()} primaryKind="housing" />);
    expect(screen.getByText("가액기준(3억 이하 불산입)")).toBeTruthy();
    expect(screen.getByText("소재지 주소에서 자동 판정")).toBeTruthy();
    expect(screen.queryByText("광역시·세종")).toBeNull();
  });

  it("W-2 코드 없음 → 3택 라디오와 읍·면 안내", () => {
    render(<PresaleRightsSection rights={[entry()]} onChange={vi.fn()} primaryKind="housing" />);
    expect(screen.getByText("광역시·세종")).toBeTruthy();
    expect(screen.getByText(/군·읍·면은 「그 외 지방」입니다/)).toBeTruthy();
  });
});

describe("④→⑫→⑭ 엔진 입력", () => {
  it("P-1 「수도권」 선택이 남은 화도읍 2억 분양권 → 코드 분류로 주택 수 불산입", () => {
    const payload = buildPresaleRightsPayload("housing", [entry({ regionCode: HWADO_EUP })]) ?? [];
    const parsed = payload.map((p) => presaleRightSchema.parse(p));
    const engine = mapPresaleRightsToEngine(parsed, "2026-07-01")![0];
    expect(engine.regionCode).toBe(HWADO_EUP);
    expect(isPresaleRightCounted(engine, new Date("2021-01-01"))).toBe(false);
  });
});
