// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-1b — ⑦ 결과 카드 anchor: 나대지 구간 선언의 근거 해석(echo `basisOutcome`·`basis`·`foldReason`)이 구간표 «재산세 구분» 열에 보인다.
 * 입력은 엔진 계획서 §5 표(`E3B_ROWS` · raw → ⑭ 매퍼 → 엔진)를 그대로 쓴다 — 가공한 echo가 아니라 실제 엔진 결과를 렌더한다. JSON 왕복(날짜가 문자열) 한 건 포함.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { E3B_ROWS, e3bRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const judgeRow = (id: string): NonBusinessLandJudgment => judgeNonBusinessLand(buildNblEngineInput(e3bRowRaw(E3B_ROWS.find((r) => r.id === id)!) as never)!, R);
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ") ?? "";

describe("⑦ 구간표 — 나대지 구간 선언의 «재산세 구분» 문구", () => {
  it("R1: 신축 앞 나대지 = 공지상태 별도합산(한도 이내) → 「별도합산(나대지 — 공지상태 근거)」 · 사업용 3,437일 · 사업용 토지 판정 · 수용 고지 1회", () => {
    const r = mount(judgeRow("R1"));
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain("2014-01-02 ~ 2023-05-31");
    expect(text(rows[0])).toContain("없음");
    expect(text(rows[0])).toContain("별도합산(나대지 — 공지상태 근거)");
    expect(text(rows[0])).toContain("사업용");
    expect(text(rows[0])).not.toContain("비사업용");
    expect(text(rows[1])).toContain("별도합산");
    expect((r.container.textContent ?? "").split(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE).length - 1).toBe(1);
  });

  it("R1b·R1c: 분리과세·비과세 근거도 구간표에 근거가 보인다", () => {
    expect(text(mount(judgeRow("R1b")).getByTestId("nbl-state-history-interval-0"))).toContain("분리과세(나대지 — 분리과세대상 근거)");
    cleanup();
    expect(text(mount(judgeRow("R1c")).getByTestId("nbl-state-history-interval-0"))).toContain("비과세·면제(나대지 — 비과세·면제 토지 근거)");
  });

  it("R2: 근거 «모름» → 「종합합산(나대지 — 근거 모름 · 확인 필요)」 · 비사업용 · 접힘 고지 · R2b 미선택은 «근거 미선택»", () => {
    const r = mount(judgeRow("R2"));
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(나대지 — 근거 모름 · 확인 필요)");
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("비사업용");
    expect(r.container.textContent).toContain(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
    cleanup();
    expect(text(mount(judgeRow("R2b")).getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(나대지 — 근거 미선택 · 확인 필요)");
  });

  it("R3·R2e: 면적한도 일부 초과·모름 → 「종합합산(나대지 — 면적한도 … · 확인 필요)」 + 면적한도 고지(수용 고지는 없다)", () => {
    const r3 = mount(judgeRow("R3"));
    expect(text(r3.getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(나대지 — 면적한도 일부 초과 · 확인 필요)");
    expect(r3.container.textContent).toContain(NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE);
    expect(r3.container.textContent).not.toContain(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
    cleanup();
    expect(text(mount(judgeRow("R2e")).getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(나대지 — 면적한도 모름 · 확인 필요)");
  });

  it("R1d(선언 없음): 종전 표시 그대로 — 근거·확인 필요 문구가 없다(기존 이력 byte-identical)", () => {
    const r = mount(judgeRow("R1d"));
    const t0 = text(r.getByTestId("nbl-state-history-interval-0"));
    expect(t0).toContain("종합합산");
    expect(t0).not.toContain("나대지 —");
    expect(t0).not.toContain("확인 필요");
  });

  it("R19: 나대지 위 구분 변경 «모름» → 종전 「종합합산(모름 — 확인 필요)」(선언 근거가 없는 구간)", () => {
    expect(text(mount(judgeRow("R19")).getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(모름 — 확인 필요)");
  });

  it("와이어 경유(JSON — 날짜가 문자열): R1도 같은 문구를 그린다", () => {
    const j = JSON.parse(JSON.stringify(judgeRow("R1"))) as NonBusinessLandJudgment;
    expect(text(mount(j).getByTestId("nbl-state-history-interval-0"))).toContain("별도합산(나대지 — 공지상태 근거)");
  });
});
