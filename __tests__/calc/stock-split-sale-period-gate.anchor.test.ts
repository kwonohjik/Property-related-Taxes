/**
 * 분할 매도 건이 «한 계산»에 담길 수 없는 기간에 걸치면 막는다 (2026-10-07 — 사용자 결정 3건)
 *
 * 엔진은 분할 모드를 양도일 하나(가장 이른 매도 lot)로 잰다. 종전 실측(probe): 매도 2026-05-10 + 2027-02-10 이
 * 경고 없이 계산됐다 — 기본공제 2,500,000 한 번(과세기간마다 연 250만 — 소득세법 §103①)·세율·대주주 판정 연도 하나.
 *
 *   PG-1  과세기간이 갈리면 차단(Step1 · ⑫ transferLots)
 *   PG-2  예정신고에서 반기가 갈리면 차단(Step3 · ⑫ filingType) / 확정신고는 통과(긍정 짝)
 *   PG-3  기타자산(§105①1호)은 달 단위 · 주식(2호)은 반기 단위
 *   PG-4  같은 해 대주주 기준 변경일(2020-04-01)을 사이에 두면 차단 / 같은 기준이면 통과
 *   PG-5  ⑧ ⇔ ⑫ — 같은 시나리오에서 차단 여부·위치가 같다
 *   PG-6  매도 1건(단일·lots-only 포함)은 대상 아님
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { validateStep1, validateStep3 } from "@/lib/calc/stock-transfer-tax-validate";
import { judgeSplitSalePeriods, splitSalePeriodMessage } from "@/lib/calc/stock-split-sale-period-gate";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

const GATE_PREFIXES = ["매도 건이 서로 다른 연도", "예정신고는 신고기간마다", "매도 건 사이에 대주주 판정 기준"];
const isGate = (m: string) => GATE_PREFIXES.some((p) => m.startsWith(p));

/** ⑧ — 이 게이트가 낸 오류의 (단계, 칸) */
function ui(f: StockTransferFormData): string[] {
  return [
    ...validateStep1(f).filter((e) => e.severity === "error" && isGate(e.message)).map((e) => `step1:${e.field}`),
    ...validateStep3(f).filter((e) => e.severity === "error" && isGate(e.message)).map((e) => `step3:${e.field}`),
  ].sort();
}
/** ⑫ — 이 게이트가 낸 issue 의 경로 */
function api(f: StockTransferFormData): string[] {
  const r = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
  if (r.success) return [];
  return r.error.issues.filter((i) => isGate(i.message)).map((i) => i.path.join(".")).sort();
}

const sales = (...dates: string[]): Partial<StockTransferFormData> => ({
  transferLots: dates.map((d, i) => ({ id: `t${i}`, transferDate: d, shareCount: "1000", perShareTransferPrice: "20000" })),
});
const OLD_LOTS: Partial<StockTransferFormData> = {
  acquisitionLots: [{ id: "a1", acquisitionDate: "2015-03-02", acquisitionCause: "purchase", shareCount: "20000", perShareAcquisitionPrice: "10000" }],
};

describe("PG-1 과세기간", () => {
  it("2026-05-10 + 2027-02-10 → Step1 매도 칸 · ⑫ transferLots", () => {
    const f = reportedSplitForm({ ...sales("2026-05-10", "2027-02-10"), filingType: "final" });
    expect(ui(f)).toEqual(["step1:transferLots"]);
    expect(api(f)).toEqual(["transferLots"]);
  });
});

describe("PG-2 예정신고 반기", () => {
  it("예정신고 · 상반기 + 하반기 → Step3 신고 유형 칸 · ⑫ filingType", () => {
    const f = reportedSplitForm({ ...sales("2026-05-10", "2026-08-10"), filingType: "preliminary" });
    expect(ui(f)).toEqual(["step3:filingType"]);
    expect(api(f)).toEqual(["filingType"]);
  });
  it("긍정 짝 — 확정신고 · 수정신고는 통과", () => {
    for (const filingType of ["final", "revised"] as const) {
      const f = reportedSplitForm({ ...sales("2026-05-10", "2026-08-10"), filingType });
      expect(ui(f)).toEqual([]);
      expect(api(f)).toEqual([]);
    }
  });
  it("긍정 짝 — 같은 반기면 예정신고도 통과", () => {
    const f = reportedSplitForm({ ...sales("2026-02-10", "2026-05-10"), filingType: "preliminary" });
    expect(ui(f)).toEqual([]);
    expect(api(f)).toEqual([]);
  });
});

describe("PG-3 기간 단위(§105①1호 달 · 2호 반기)", () => {
  const base = { saleDates: ["2026-04-10", "2026-05-10"], filingType: "preliminary" };
  it("기타자산 — 4월·5월은 다른 기간", () => {
    const v = judgeSplitSalePeriods({ ...base, marketType: "other_asset" });
    expect(v).toEqual([{ code: "preliminary_period", clause: "105-1-1", periods: ["2026년 4월", "2026년 5월"] }]);
    expect(splitSalePeriodMessage(v[0])).toContain("§105①1호");
  });
  it("주식 — 같은 상반기", () => {
    expect(judgeSplitSalePeriods({ ...base, marketType: "unlisted" })).toEqual([]);
  });
});

describe("PG-4 대주주 기준 변경일", () => {
  it("비상장 2020-03-10 + 2020-05-10 (2020-04-01 시총 15억 → 10억) → Step1 매도 칸 · ⑫ transferLots", () => {
    const f = reportedSplitForm({ ...OLD_LOTS, ...sales("2020-03-10", "2020-05-10"), priorYearEndDate: "2019-12-31", filingType: "final" });
    expect(judgeSplitSalePeriods({ saleDates: ["2020-03-10", "2020-05-10"], marketType: "unlisted", filingType: "final" }))
      .toEqual([{ code: "major_threshold", boundary: "2020-04-01" }]);
    expect(ui(f)).toEqual(["step1:transferLots"]);
    expect(api(f)).toEqual(["transferLots"]);
  });
  it("긍정 짝 — 기준이 같은 구간이면 통과", () => {
    const f = reportedSplitForm({ ...OLD_LOTS, ...sales("2020-05-10", "2020-06-10"), priorYearEndDate: "2019-12-31", filingType: "final" });
    expect(ui(f)).toEqual([]);
    expect(api(f)).toEqual([]);
  });
  it("기타자산은 대주주 임계 축이 없다", () => {
    expect(judgeSplitSalePeriods({ saleDates: ["2020-03-10", "2020-05-10"], marketType: "other_asset", filingType: "final" })).toEqual([]);
  });
});

describe("PG-5 ⑧ ⇔ ⑫", () => {
  const grid: [string, Partial<StockTransferFormData>][] = [
    ["연도+반기(예정)", { ...sales("2026-11-10", "2027-02-10"), filingType: "preliminary" }],
    ["반기+기준 변경(예정)", { ...OLD_LOTS, ...sales("2020-03-10", "2020-08-10"), priorYearEndDate: "2019-12-31", filingType: "preliminary" }],
    ["무위반", { ...sales("2026-05-10", "2026-05-20"), filingType: "preliminary" }],
  ];
  it.each(grid)("%s", (_l, o) => {
    const f = reportedSplitForm(o);
    expect(ui(f).map((s) => s.split(":")[1]).sort()).toEqual(api(f));
  });
  it("연도가 갈리면 그 축 하나만 낸다(나머지는 과세기간별로 나눈 뒤의 문제)", () => {
    expect(api(reportedSplitForm({ ...sales("2026-11-10", "2027-02-10"), filingType: "preliminary" }))).toEqual(["transferLots"]);
  });
});

describe("PG-6 매도 1건", () => {
  it("분할 매도 1건 · 일자 미입력 lot 은 무시", () => {
    expect(judgeSplitSalePeriods({ saleDates: ["2026-05-10", ""], marketType: "unlisted", filingType: "preliminary" })).toEqual([]);
    expect(ui(reportedSplitForm())).toEqual([]);
  });
});
