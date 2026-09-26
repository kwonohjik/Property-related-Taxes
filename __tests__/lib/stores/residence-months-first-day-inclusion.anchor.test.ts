/**
 * anchor — §154⑥ 거주기간은 「전입일부터 전출일까지」 **초일 산입** (리뷰 OH-45 · 계획서 §1 유형 D)
 *
 * 서면4팀-82(2006.1.19): 「거주기간의 계산은 … 전입일자부터 전출일까지의 기간에 의하는 것이며,
 * 그 기간의 초일을 산입하는 것」 — 사실관계 2001.11.9. 전입 → 2003.11.8. 전출 = 2년.
 * 집행기준 89-154-20도 같다. 2/29 전입은 민법 §160③으로 이듬해 2/28 전출이 1년이다.
 *
 * 종전 `diffMonthsClamped`는 전출일의 「일」이 전입일보다 작으면 한 달을 빼서(초일 불산입)
 * 응당일 전날 전출을 한 달 적게 셌다 → §154① 거주 2년·§154①3호 1년·표2 거주분이 한 단계 낮았다.
 *
 * ⚠️ 임대기간(§155⑳ — `sumRentalMonths`)은 **바꾸지 않는다**(계획서 §6.1 Q-2). 마지막 블록이 그 경계를
 *    고정한다 — 두 축이 한 함수를 공유하던 구조라 한쪽만 바뀌었는지 여기서 확인한다.
 */
import { describe, it, expect } from "vitest";
import {
  clampResidenceToHousingPeriod,
  deriveResidencePeriodMonths,
  sumResidenceMonths,
  type ResidencePeriod,
} from "@/lib/stores/calc-wizard-asset-residence";
import { sumRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import { residenceMonthsOfAsset } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const P = (moveInDate: string, moveOutDate: string): ResidencePeriod => ({ moveInDate, moveOutDate });
const interval = (periods: ResidencePeriod[]) => ({
  residenceInputMode: "interval" as const,
  residencePeriods: periods,
  residencePeriodMonthsAsset: "0",
});

describe("거주 구간 개월 — 초일 산입", () => {
  it("🔴 응당일 전날 전출(2020-03-10~2022-03-09) = 24개월(2년)", () => {
    expect(sumResidenceMonths([P("2020-03-10", "2022-03-09")], "")).toBe(24);
  });
  it("✅ 부정 짝 — 이틀 전 전출(~2022-03-08) = 23개월", () => {
    expect(sumResidenceMonths([P("2020-03-10", "2022-03-08")], "")).toBe(23);
  });
  it("🔴 2/29 전입 → 2021-02-28 전출 = 12개월(§154①3호 1년)", () => {
    expect(sumResidenceMonths([P("2020-02-29", "2021-02-28")], "")).toBe(12);
  });
  it("🔴 서면4팀-82 사실관계(2001-11-09~2003-11-08) = 24개월", () => {
    expect(sumResidenceMonths([P("2001-11-09", "2003-11-08")], "")).toBe(24);
  });
  it("계산기·판정 메뉴 공용 leaf도 같은 값", () => {
    expect(deriveResidencePeriodMonths(interval([P("2020-03-10", "2022-03-09")]), "2022-06-01", "0")).toBe(24);
  });
  it("🔴 용도변경 클램프 경로(§154⑤ 단서) — 주거용 사용일 2020-03-10부터 = 24개월", () => {
    const r = clampResidenceToHousingPeriod(
      interval([P("2019-01-01", "2022-03-09")]),
      "2022-06-01",
      "0",
      "2020-03-10",
    );
    expect(r.months).toBe(24);
  });
  it("🔴 결과 명세서 재집계도 입력 경로와 같은 값", () => {
    const asset = interval([P("2020-03-10", "2022-03-09")]) as unknown as AssetForm;
    expect(residenceMonthsOfAsset(asset, "2022-06-01")).toBe(24);
  });
});

describe("Q-2 — 임대기간은 종전 방식 유지", () => {
  it("같은 구간이라도 임대는 23개월(종전 whole-month)", () => {
    expect(sumRentalMonths([{ start: "2020-03-10", end: "2022-03-09" }])).toBe(23);
  });
});
