// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-③ B (UI-B-2) — ⑦ 결과 카드 anchor: 기타토지 카드의 구간표에서 **주택 구간 행만** 변형된다(구간 echo `buildingKind: "house"` + `houseCheck`).
 * 입력은 엔진 계획서 B 표(`E3D_B_ROWS` · raw → ⑭ 매퍼 → 엔진)를 그대로 쓴다 — 가공한 echo가 아니라 실제 엔진 결과를 렌더한다.
 * 표 전체 제목·열 라벨은 종전(건축물 유무·재산세 구분) 그대로이고, 주택 구간 행의 «건축물» 칸 «있음(주택)» · 근거 열 = 엔진 echo `houseCheck`(재계산 없음).
 * 주택 구간이 없는 기타토지 결과(철거 행 «그 밖»)는 종전과 byte-identical.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { E3D_B_ROWS, e3dBRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3b-table";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const judgeRow = (id: string, opts: { disguise?: "separate" | "unknown" } = {}): NonBusinessLandJudgment =>
  judgeNonBusinessLand(buildNblEngineInput(e3dBRowRaw(E3D_B_ROWS.find((r) => r.id === id)!, opts) as never)!, R);
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ") ?? "";

describe("⑦ 구간표 — 기타토지 표 안의 주택 구간 행 변형(B)", () => {
  it("B1(철거 2021-01-01 · 정착 200 · 이내): 표 제목·열 라벨은 기타토지 그대로 + 주택 근거 열 · 첫 행 «있음(주택)» + 엔진 echo의 허용 면적 · 꼬리(나대지)는 종전 문구", () => {
    const r = mount(judgeRow("B-M1"));
    const period = r.getByTestId("nbl-state-history-period");
    expect(period.textContent).toContain("기간 분석 — 소유기간 중 건축물 유무·재산세 구분 이력 반영");
    expect(period.textContent).not.toContain("소유기간 중 주택 신축·멸실 이력 반영");
    expect(r.getByTestId("nbl-state-history-intervals").textContent).toContain("재산세 구분 · 배율 판정");
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    const houseRow = rows.find((row) => text(row).includes("있음(주택)"))!;
    expect(houseRow, "주택 구간 행이 있다").toBeDefined();
    expect(text(houseRow)).toContain("정착면적 200㎡");
    expect(text(houseRow)).toContain("수도권 밖 도시 5배");
    expect(text(houseRow)).toContain("허용 면적 1,000㎡");
    expect(text(houseRow)).toContain("토지 면적 1,000㎡");
    expect(text(houseRow)).toContain("배율 이내");
    expect(text(houseRow)).not.toContain("비사업용");
    // 나대지 꼬리 행은 «주택» 변형이 아니다
    const tail = rows[rows.length - 1];
    expect(text(tail)).not.toContain("있음(주택)");
    expect(text(tail)).not.toContain("정착면적");
  });

  it("B1b(정착 199.99 → 허용 999.95 < 1,000 · 초과 0.05㎡): «초과 0.05㎡» 그대로 · 그 구간 비사업용 + 엔진 `HOUSE_EXCEEDED_NOTICE`가 주의사항에 있다", () => {
    const r = mount(judgeRow("B1b"));
    const houseRow = r.getAllByTestId(/^nbl-state-history-interval-\d+$/).find((row) => text(row).includes("있음(주택)"))!;
    expect(text(houseRow)).toContain("허용 면적 999.95㎡");
    expect(text(houseRow)).toContain("초과 0.05㎡");
    expect(text(houseRow)).toContain("비사업용");
    expect(r.container.textContent).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  });

  it("B6(직접 API — 정착면적 빈칸): 「정착면적을 확인하지 못해 비사업용으로 봄」", () => {
    const r = mount(judgeRow("B6"));
    const houseRow = r.getAllByTestId(/^nbl-state-history-interval-\d+$/).find((row) => text(row).includes("있음(주택)"))!;
    expect(text(houseRow)).toContain("정착면적을 확인하지 못해 비사업용으로 봄");
  });

  it("와이어 경유(JSON — 날짜가 문자열): B1도 같은 문구를 그린다", () => {
    const j = JSON.parse(JSON.stringify(judgeRow("B-M1"))) as NonBusinessLandJudgment;
    const houseRow = mount(j).getAllByTestId(/^nbl-state-history-interval-\d+$/).find((row) => text(row).includes("있음(주택)"))!;
    expect(text(houseRow)).toContain("허용 면적 1,000㎡");
  });
});

describe("주택 구간이 없는 기타토지 결과는 종전과 byte-identical(Anchor 9)", () => {
  it("«그 밖» 철거 행(별도합산 위장): «있음(주택)»·배율 판정 열 없음 · 제목·열 라벨 종전", () => {
    const r = mount(judgeRow("B-M1", { disguise: "separate" }));
    expect(r.getByTestId("nbl-state-history-intervals").textContent).not.toContain("배율 판정");
    expect(r.getByTestId("nbl-state-history-intervals").textContent).not.toContain("있음(주택)");
    expect(r.getByTestId("nbl-state-history-period").textContent).toContain("소유기간 중 건축물 유무·재산세 구분 이력 반영");
  });
});
