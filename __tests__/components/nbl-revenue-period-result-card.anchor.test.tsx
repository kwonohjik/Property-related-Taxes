// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-② — ⑦ 결과 카드 anchor: 영위 기간 ON이면 과세기간별 수입금액비율 표(`NblRevenuePeriodTable`)가 보이고, OFF는 표가 없다(기존 구간표 불변).
 * 입력은 엔진 케이스 표(`E3C_ROWS` · raw → ⑭ 매퍼 → 엔진)를 그대로 쓴다 — 가공한 echo가 아니라 실제 엔진 결과를 렌더한다. 한 건은 JSON 왕복(날짜가 문자열 — 화면이 받는 모양).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { E3C_ROWS, e3cRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";

afterEach(cleanup);

const judgeRow = (id: string, on = true): NonBusinessLandJudgment => judgeNonBusinessLand(buildNblEngineInput(e3cRowRaw(E3C_ROWS.find((r) => r.id === id)!, on) as never)!, R);
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ") ?? "";
const roundTrip = (j: NonBusinessLandJudgment): NonBusinessLandJudgment => JSON.parse(JSON.stringify(j));

describe("⑦ 과세기간별 판정 표 — 영위 기간 ON", () => {
  it("M9′: 연도 3행(2022 행 · 2023 직전 · 2024 당해) · 영위 2022-12-01 ~ 양도일 · 모두 충족 · 사업용 구간 · 합계 577일", () => {
    const r = mount(judgeRow("M9p"));
    expect(r.getByTestId("nbl-revenue-period-result")).toBeTruthy();
    expect(text(r.getByTestId("nbl-revenue-period-result-operating"))).toBe("소유기간 중 영위 기간 2022-12-01 ~ 2024-06-29 (577일)");
    expect(r.getAllByTestId(/^nbl-revenue-period-result-year-\d{4}$/).map((e) => e.getAttribute("data-testid"))).toEqual([
      "nbl-revenue-period-result-year-2022", "nbl-revenue-period-result-year-2023", "nbl-revenue-period-result-year-2024",
    ]);
    const y2022 = text(r.getByTestId("nbl-revenue-period-result-year-2022"));
    expect(y2022).toContain("31일 / 365일"); // 영위일수 / 총일수
    expect(y2022).toContain("7,064,516"); // 연환산 후 연간수입금액(600,000 × 365/31)
    expect(text(r.getByTestId("nbl-revenue-period-result-year-2022-verdict"))).toBe("충족");
    expect(text(r.getByTestId("nbl-revenue-period-result-year-2024"))).toContain("182일 / 366일"); // 윤년 총일수
    expect(text(r.getByTestId("nbl-revenue-period-result-total"))).toContain("577일");
    expect(text(r.getByTestId("nbl-revenue-period-result-intervals"))).toContain("2022-12-01 ~ 2024-06-29");
    expect(r.queryByTestId("nbl-revenue-period-result-unknown")).toBeNull();
  });

  it("M11′: 폐업 2021-06-01 — 영위 일수 2,707 · 2021 영위 151일 · 양도연도·직전은 영위일이 없어 표에 없다 · 사업용 판정", () => {
    const r = mount(judgeRow("M11p"));
    expect(text(r.getByTestId("nbl-revenue-period-result-operating"))).toBe("소유기간 중 영위 기간 2014-01-02 ~ 2021-05-31 (2,707일)");
    expect(r.getAllByTestId(/^nbl-revenue-period-result-year-\d{4}$/)).toHaveLength(8);
    expect(r.queryByTestId("nbl-revenue-period-result-year-2024")).toBeNull();
    expect(text(r.getByTestId("nbl-revenue-period-result-year-2021"))).toContain("151일 / 365일");
    expect(text(r.getByTestId("nbl-revenue-period-result-total"))).toContain("2,707일");
    expect(r.getByText("사업용 토지 — 일반세율이 적용됩니다.")).toBeTruthy();
  });

  it("C10b: 2022 행 누락 = 모름 → «모름 — 불통과» 행 · 모름 연도 문장(확인 필요) · 사업용 일수 0", () => {
    const r = mount(judgeRow("C10b"));
    expect(text(r.getByTestId("nbl-revenue-period-result-year-2022-verdict"))).toBe("모름 — 불통과");
    expect(text(r.getByTestId("nbl-revenue-period-result-year-2022"))).toContain("0일");
    expect(text(r.getByTestId("nbl-revenue-period-result-unknown"))).toContain("2022년");
    expect(text(r.getByTestId("nbl-revenue-period-result-unknown"))).toContain("확인 필요");
  });

  it("V7d: 영위 통산 730일 < 요구 731일 → 10호 유예 제외 문장(기산일·통산·요구 일수)", () => {
    const r = mount(judgeRow("V7d"));
    const g = text(r.getByTestId("nbl-revenue-period-result-grace10"));
    expect(g).toContain("10호");
    expect(g).toContain("2024-03-01");
    expect(g).toContain("730일");
    expect(g).toContain("731일");
  });

  it("JSON 왕복(날짜가 문자열)에도 같은 표가 그려진다 — 화면이 받는 모양", () => {
    const j = judgeRow("M11p");
    const a = mount(j);
    const before = text(a.getByTestId("nbl-revenue-period-result"));
    cleanup();
    const b = mount(roundTrip(j));
    expect(text(b.getByTestId("nbl-revenue-period-result"))).toBe(before);
  });

  it("표 열 라벨은 한국어 풀어쓰기 — 변수 약어(P_·Sum_)·floor() 없음 · 영위일수/사업용 일수 차이 설명이 붙는다", () => {
    const t = text(mount(judgeRow("M9p")).getByTestId("nbl-revenue-period-result"));
    for (const col of ["과세기간", "영위일수", "연간수입금액(연환산 후)", "당해 비율", "합산 비율(당해+직전)", "기준 비율", "수입금액비율", "사업용 일수"]) expect(t).toContain(col);
    expect(t).not.toMatch(/\bP_|\bSum_|floor\(/);
    expect(t).toContain("1일 차이가 날 수 있습니다");
  });
});

describe("⑦ 영위 기간 OFF — 표가 없다 · 기존 카드 불변", () => {
  it("OFF(M9′ 현행): 표 없음 · 구간표 없음", () => {
    const r = mount(judgeRow("M9p", false));
    expect(r.queryByTestId("nbl-revenue-period-result")).toBeNull();
    expect(r.queryByTestId("nbl-state-history-period")).toBeNull();
  });
});
