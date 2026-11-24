// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-④ — ⑦ 결과 카드 anchor: 13호(무주택 1세대 1필지 나지) 적용 기간 블록(echo `periodEvaluation.vacantLot`) · 구간표 «재산세 구분» 접미(echo `vacantLotDays`) ·
 * 이력 OFF + 행 입력(basis `usage_periods`)에서 «양도일 현재 상태를 소유기간 전체에 적용» 거짓 안내가 나오지 않는다(V-10 · R-3) · echo 없는 기존 표는 바이트 동일.
 * 입력은 엔진 표(`E3E_ALL_ROWS` — raw → ⑭ 매퍼 → 엔진)를 그대로 렌더한다 — 가공한 echo가 아니다. JSON 왕복(날짜가 문자열) 포함.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { E3E_ALL_ROWS, e3eRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-4-table";

afterEach(cleanup);

const judgeRow = (id: string, opts: { houseRows?: boolean } = {}): NonBusinessLandJudgment =>
  judgeNonBusinessLand(buildNblEngineInput(e3eRowRaw(E3E_ALL_ROWS.find((r) => r.id === id)!, opts) as never)!, R);
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => (el.textContent?.replace(/\s+/g, " ") ?? "").trim();
const roundTrip = (j: NonBusinessLandJudgment) => JSON.parse(JSON.stringify(j)) as NonBusinessLandJudgment;
const STATE_AT_TRANSFER_NOTICE = "nbl-period-state-at-transfer-notice";

describe("⑦ 13호 적용 기간 블록 — echo `vacantLot`", () => {
  it("X1(이력 경로 · 주택 소유 365일): 13호로 사업용에 센 기간 2,190일 · 제외 365일 · 구간 · 범위 문구(건축물 없던 구간)", () => {
    const r = mount(judgeRow("X1"));
    expect(text(r.getByTestId("nbl-vacant-lot-period-summary"))).toBe("무주택1세대 1필지 나지 (13호)로 사업용에 센 기간 2,190일 · 세대 주택 소유로 제외한 기간 365일");
    expect(text(r.getByTestId("nbl-vacant-lot-period-scope"))).toContain("건축물이 없던 구간");
    expect(text(r.getByTestId("nbl-vacant-lot-period-0"))).toBe("2014-01-02 ~ 2019-12-31 2,190일");
  });
  it("W2(이력 OFF + 행): 블록이 보이고(소유기간 중 무주택 기간) «양도일 현재 상태를 소유기간 전체에 적용» 거짓 안내는 없다(V-10)", () => {
    const r = mount(judgeRow("W2"));
    expect(text(r.getByTestId("nbl-vacant-lot-period-summary"))).toContain("2,190일 · 세대 주택 소유로 제외한 기간 1,461일");
    expect(text(r.getByTestId("nbl-vacant-lot-period-scope"))).toBe("소유기간 가운데 세대가 주택을 소유하지 않은 기간입니다.");
    expect(r.queryByTestId(STATE_AT_TRANSFER_NOTICE)).toBeNull();
    expect(r.container.textContent).not.toContain("양도일 현재의 이용 상태를 소유기간 전체에 적용");
  });
  it("W0(이력 OFF · 행 없음 — 현행): 블록 없음 · 종전 «양도일 현재 상태» 안내 그대로(echo 없는 결과는 바이트 동일)", () => {
    const r = mount(judgeRow("W0"));
    expect(r.queryByTestId("nbl-vacant-lot-period")).toBeNull();
    expect(r.getByTestId(STATE_AT_TRANSFER_NOTICE).textContent).toContain("양도일 현재의 이용 상태를 소유기간 전체에 적용해 판정했습니다");
  });
  it("D1(11호 다목) · C5(부분 면적 — 이력 미적용): 13호가 구간을 정하지 않아 블록 없음", () => {
    for (const id of ["D1", "C5", "N1b"]) {
      expect(mount(judgeRow(id)).queryByTestId("nbl-vacant-lot-period"), id).toBeNull();
      cleanup();
    }
  });
  it("JSON 왕복(날짜가 문자열)도 같은 블록을 그린다", () => {
    expect(text(mount(roundTrip(judgeRow("X1"))).getByTestId("nbl-vacant-lot-period-0"))).toBe("2014-01-02 ~ 2019-12-31 2,190일");
  });
});

describe("⑦ 구간표 «재산세 구분» 접미 — echo `vacantLotDays`", () => {
  it("H2(신축으로 끝 · 앞 나지 3,437일 13호 인정): 앞 구간 행에만 «무주택1세대 1필지 나지 (13호) 인정 3,437일»", () => {
    const r = mount(judgeRow("H2"));
    expect(text(r.getByTestId("nbl-state-history-interval-0-vacant-lot"))).toBe("· 무주택1세대 1필지 나지 (13호) 인정 3,437일");
    expect(r.queryByTestId("nbl-state-history-interval-1-vacant-lot")).toBeNull();
  });
  it("H1(철거 · 꼬리 나지만): 꼬리 행에 접미 214일 · 건물 구간 행은 없다", () => {
    const r = mount(judgeRow("H1"));
    expect(r.queryByTestId("nbl-state-history-interval-0-vacant-lot")).toBeNull();
    expect(text(r.getByTestId("nbl-state-history-interval-1-vacant-lot"))).toContain("인정 214일");
  });
  it("호 없음(C1p)·11호(D1): 접미 없음 — echo 없는 기존 표는 종전과 바이트 동일", () => {
    for (const id of ["C1p", "D1", "C3p"]) {
      const r = mount(judgeRow(id));
      expect(r.container.querySelector('[data-testid$="-vacant-lot"]'), id).toBeNull();
      cleanup();
    }
  });
  it("13호 행(H0 이력 OFF 하위호환)은 이력 구간표 자체가 없다", () => {
    expect(mount(judgeRow("H0")).queryByTestId("nbl-state-history-intervals")).toBeNull();
  });
});

describe("L-1 — 660㎡ 초과 + 꼬리 나지 + 행 + 유예: 기간 분석 수치(유예 재판정 기준)와 13호 구간이 달라 보이는 이유를 밝힌다(세액·판정 불변)", () => {
  const raw = (over: Record<string, unknown>) => ({
    nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
    acquisitionArea: "900", acquisitionDate: "2014-01-01", transferDate: "2024-01-01",
    nblOtherRelatedBusinessType: "vacant_lot_1household", nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false, nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [],
    nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }],
    ...over,
  });
  const judge = (r: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(r as never)!, R);

  it("재현: 900㎡ + 행 2023-01-01~ + 유예 → 구간 3,286일 · 기간 분석 730일(유예 재판정) · 유예 재판정 문구가 블록에 나온다", () => {
    const j = judge(raw({ nblOtherHouseholdHousePeriods: [{ startDate: "2023-01-01" }] }));
    expect(j.periodEvaluation?.vacantLot?.intervals.map((i) => i.days)).toEqual([3286]);
    expect(j.effectiveBusinessDays).toBe(730);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-vacant-lot-period-summary"))).toContain("3,286일");
    const g = text(r.getByTestId("nbl-vacant-lot-period-grace-judged"));
    expect(g).toContain("유예기간 730일(소유기간 3,651일 중)");
    expect(g).toContain("기간 분석»의 사업용 일수·비율은 이 재판정 기준");
  });
  it("세액 불변: 같은 입력에서 행 유무와 무관하게 판정·사업용 일수·면적 안분이 같다(행은 13호 echo만 더한다)", () => {
    const a = judge(raw({ nblOtherHouseholdHousePeriods: [{ startDate: "2023-01-01" }] }));
    const b = judge(raw({}));
    expect([a.isNonBusinessLand, a.effectiveBusinessDays, a.areaProportioning?.nonBusinessRatio]).toEqual([b.isNonBusinessLand, b.effectiveBusinessDays, b.areaProportioning?.nonBusinessRatio]);
  });
  it("유예가 없거나 600㎡(유예 재판정 없음)면 문구가 없다", () => {
    const r = mount(judge(raw({ acquisitionArea: "600", nblGracePeriods: [], nblOtherHouseholdHousePeriods: [{ startDate: "2023-01-01" }] })));
    expect(r.queryByTestId("nbl-vacant-lot-period-grace-judged")).toBeNull();
  });
});
