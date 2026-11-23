// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-③ A (UI-A-2) — ⑦ 결과 카드 anchor: 주택부수토지 카드의 구간표 변형(구간 echo `buildingKind: "house"` + `houseCheck`).
 * 입력은 엔진 계획서 §6.1 표(`E3D_A_ROWS` · raw → ⑭ 매퍼 → 엔진)를 그대로 쓴다 — 가공한 echo가 아니라 실제 엔진 결과를 렌더한다. JSON 왕복(날짜가 문자열) 한 건 포함.
 * 허용 면적·배율은 엔진이 낸 값(`houseCheck`)을 그대로 읽는다 — 카드가 재계산하지 않는다(숫자 옆 변수명 라벨 · 약어·floor 없음).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { E3D_A_ROWS, e3dARowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const judgeRow = (id: string): NonBusinessLandJudgment => judgeNonBusinessLand(buildNblEngineInput(e3dARowRaw(E3D_A_ROWS.find((r) => r.id === id)!) as never)!, R);
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ") ?? "";

describe("⑦ 구간표 — 주택 변형", () => {
  it("M15: 구간 2개(나대지 → 주택) · 제목·열 라벨 «주택» · 나대지 구간 비사업용 / 꼬리(양도일 현재 주택) 사업용", () => {
    const r = mount(judgeRow("M15"));
    expect(r.getByTestId("nbl-state-history-period").textContent).toContain("소유기간 중 주택 신축·멸실 이력 반영");
    expect(r.getByTestId("nbl-state-history-intervals").textContent).toContain("재산세 구분 · 배율 판정");
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain("2014-01-02 ~ 2023-05-31");
    expect(text(rows[0])).toContain("없음(나대지)");
    expect(text(rows[0])).toContain("비사업용");
    expect(text(rows[1])).toContain("2023-06-01 ~ 2023-12-31");
    expect(text(rows[1])).toContain("있음");
    expect(text(rows[1])).toContain("양도일 현재 주택");
    expect(text(rows[1])).toContain("사업용");
    expect(text(rows[1])).not.toContain("비사업용");
  });

  it("H3b(구옥 정착 100 — 이내): 과거 주택 구간 «정착면적 100㎡ × … = 허용 면적 500㎡ ≥ 토지 면적 500㎡ → 배율 이내» 그대로 · 사업용", () => {
    const r = mount(judgeRow("H3b"));
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain("정착면적 100㎡");
    expect(text(rows[0])).toContain("수도권 밖 도시 5배");
    expect(text(rows[0])).toContain("허용 면적 500㎡");
    expect(text(rows[0])).toContain("토지 면적 500㎡");
    expect(text(rows[0])).toContain("배율 이내");
    expect(text(rows[0])).toContain("사업용");
    expect(text(rows[0])).not.toContain("비사업용");
    expect(text(rows[1])).toContain("없음(나대지)");
  });

  it("H3f(구옥 정착 50 — 초과): «허용 면적 250㎡ < 토지 면적 500㎡ (초과 250㎡) → … 비사업용» + 엔진 `HOUSE_EXCEEDED_NOTICE`가 주의사항에 있다", () => {
    const r = mount(judgeRow("H3f"));
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(text(rows[0])).toContain("허용 면적 250㎡");
    expect(text(rows[0])).toContain("초과 250㎡");
    expect(text(rows[0])).toContain("비사업용");
    expect(r.container.textContent).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  });

  it("H3e(직접 API — 정착면적 빈칸): 「정착면적을 확인하지 못해 비사업용으로 봄 — 확인 필요」", () => {
    const r = mount(judgeRow("H3e"));
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("정착면적을 확인하지 못해 비사업용으로 봄");
  });

  it("와이어 경유(JSON — 날짜가 문자열): H3b도 같은 문구를 그린다", () => {
    const j = JSON.parse(JSON.stringify(judgeRow("H3b"))) as NonBusinessLandJudgment;
    expect(text(mount(j).getByTestId("nbl-state-history-interval-0"))).toContain("허용 면적 500㎡");
  });

  it("입력 미리보기 = 결과 표: 같은 leaf 문구 함수(`houseCheckText`)가 두 곳에서 같은 숫자를 낸다 — 엔진 echo의 houseCheck를 그대로 쓴다", async () => {
    const { houseCheckText } = await import("@/lib/calc/nbl-house-interval-text");
    const j = judgeRow("H3b");
    const iv = j.periodEvaluation?.stateHistory?.intervals[0];
    expect(iv?.houseCheck).toBeDefined();
    expect(text(mount(j).getByTestId("nbl-state-history-interval-0"))).toContain(houseCheckText(iv!.houseCheck!));
  });
});

describe("기타토지 구간표는 변하지 않는다(buildingKind 키 부재 = 종전과 byte-identical)", () => {
  it("기타토지 이력 결과(E3-1b R1)는 제목·열 라벨이 종전 그대로 «건축물 유무·재산세 구분»", async () => {
    const { E3B_ROWS, e3bRowRaw } = await import("@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table");
    const j = judgeNonBusinessLand(buildNblEngineInput(e3bRowRaw(E3B_ROWS.find((r) => r.id === "R1")!) as never)!, R);
    const r = mount(j);
    expect(r.getByTestId("nbl-state-history-period").textContent).toContain("소유기간 중 건축물 유무·재산세 구분 이력 반영");
    expect(r.getByTestId("nbl-state-history-intervals").textContent).not.toContain("배율 판정");
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("없음");
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).not.toContain("나대지)");
  });
});
