/**
 * S15-14 anchor — 「소득세법 시행령」 §155⑱(§155① 본문 괄호 「제18항에 따른 사유에 해당하는 경우를 포함한다」)의 양도일 연혁.
 *
 * 원문 확인(법제처 DRF · KoreanLaw MCP, 2026-10-11):
 *   - 2017.2.3.~2022.2.14. 시행본 ⑱(MST 191522 · 214261 · 229391): 「…다른 주택을 취득한 날부터 3년이 되는 날 현재 다음 각 호의 어느 하나에
 *     해당하는 경우로서 **해당 각 호의 매각 등의 방법으로 양도하는 경우**를 말한다」 — 이 문구는 대통령령 제32420호(2022.2.15. 시행,
 *     MST 240311)에서 빠졌고, 같은 영 부칙 제2조② 「양도소득세에 관한 개정규정은 … 시행일 이후 양도하는 경우부터 적용한다」.
 *   - 2017.2.3. 전: 「소득세법 시행규칙」 §72① 「…다른 주택을 취득한 날부터 N년이 되는 날 현재 다음 각 호의 어느 하나에 해당하는 경우로서
 *     **해당 각 호의 어느 하나의 방법에 따라 양도된 경우**」(2002.2.1. · 2009.9.2. · 2011.8.3. · 2012.2.28. · 2016.3.16. 시행본 확인).
 *   - 호별 신설: 4호(현금청산금 소송) — 규칙 제265호(2012.2.28.) 부칙 제2조② 「시행 후 최초로 양도하는 분부터」 · 5호(매도청구소송) —
 *     제30395호(2020.2.11.) · 수용재결 추가 — 제31442호(2021.2.17.), 둘 다 부칙 제2조② 「시행 이후 양도하는 분부터」.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDisposalDelay,
  isDisposalDelayReasonAvailable,
  isDisposalDelayMethodRequired,
} from "@/lib/tax-engine/data/temporary-two-house-delay-era";
import { judgeTemporaryTwoHouseTiming } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { qualifiesOldClause8TemporaryTwoHouse } from "@/lib/tax-engine/data/surcharge-old-clauses-era";

const D = (s: string) => new Date(s);

describe("방법 요건 — 2022-02-15 전 양도분에만", () => {
  it("2022-02-14 양도는 방법 요건이 있고 2022-02-15 양도는 없다(제32420호 부칙 제2조②)", () => {
    expect(isDisposalDelayMethodRequired(D("2022-02-14"))).toBe(true);
    expect(isDisposalDelayMethodRequired(D("2022-02-15"))).toBe(false);
    expect(isDisposalDelayMethodRequired(D("2023-06-01"))).toBe(false);
  });
  it("검증한 가장 이른 시행본(2002-02-01) 전에는 요건을 단정하지 않는다", () => {
    expect(isDisposalDelayMethodRequired(D("2002-01-31"))).toBe(false);
    expect(isDisposalDelayMethodRequired(D("2002-02-01"))).toBe(true);
  });
  it("방법 요건이 있는 양도일: 방법 확인(true)일 때만 사유가 기한을 치유한다 — 미확인·false는 모두 불성립 + 확인 필요", () => {
    const base = { reason: "kamco" as const, transferDate: D("2021-06-01") };
    expect(resolveDisposalDelay({ ...base, disposedByThatMethod: true }).applied).toBe(true);
    const unknown = resolveDisposalDelay({ ...base });
    expect(unknown.applied).toBe(false);
    expect(unknown.methodPending).toBe(true);
    const no = resolveDisposalDelay({ ...base, disposedByThatMethod: false });
    expect(no.applied).toBe(false);
    expect(no.methodPending).toBe(true);
  });
  it("방법 요건이 없는 양도일: 사유만으로 치유(현행 문언) — 방법 입력은 무시", () => {
    expect(resolveDisposalDelay({ reason: "kamco", transferDate: D("2023-06-01") }).applied).toBe(true);
    expect(resolveDisposalDelay({ reason: "kamco", disposedByThatMethod: false, transferDate: D("2023-06-01") }).applied).toBe(true);
  });
  it("사유가 없으면 아무것도 치유하지 않는다", () => {
    expect(resolveDisposalDelay({ transferDate: D("2021-06-01"), disposedByThatMethod: true }).applied).toBe(false);
  });
});

describe("호별 신설 시기 — 양도일 기준", () => {
  it("1~3호(한국자산관리공사 · 경매 · 공매)는 검증한 전 구간에 있다", () => {
    for (const r of ["kamco", "auction", "public_sale"] as const) {
      expect(isDisposalDelayReasonAvailable(r, D("2005-01-01"))).toBe(true);
      expect(isDisposalDelayReasonAvailable(r, D("2024-01-01"))).toBe(true);
    }
  });
  it("4호(현금청산금 소송)는 2012-02-28 양도분부터", () => {
    expect(isDisposalDelayReasonAvailable("cash_settlement_suit", D("2012-02-27"))).toBe(false);
    expect(isDisposalDelayReasonAvailable("cash_settlement_suit", D("2012-02-28"))).toBe(true);
  });
  it("5호(수용재결·매도청구소송)는 2020-02-11 양도분부터", () => {
    expect(isDisposalDelayReasonAvailable("expropriation_suit", D("2020-02-10"))).toBe(false);
    expect(isDisposalDelayReasonAvailable("expropriation_suit", D("2020-02-11"))).toBe(true);
  });
  it("없던 호를 고르면 방법을 확인해도 치유하지 않는다", () => {
    const r = resolveDisposalDelay({ reason: "expropriation_suit", disposedByThatMethod: true, transferDate: D("2019-06-01") });
    expect(r.applied).toBe(false);
    expect(r.reasonUnavailable).toBe(true);
  });
});

describe("judgeTemporaryTwoHouseTiming — 요건 B(처분기한)에 연혁이 반영된다", () => {
  // 종전 2015-01-01 · 신규 2018-03-01 → 3년 말일 2021-03-02 · 양도 2021-06-01(기한 경과)
  const late = {
    previousAcquisitionDate: D("2015-01-01"),
    newAcquisitionDate: D("2018-03-01"),
    transferDate: D("2021-06-01"),
    deadlineYears: 3,
    oneYearWaived: false,
  };
  it("사유만 있고 방법 미확인이면 기한 경과 그대로 불성립", () => {
    expect(judgeTemporaryTwoHouseTiming({ ...late, disposalDelayReason: "kamco" }).overall).toBe(false);
  });
  it("방법까지 확인하면 성립 (양성 짝)", () => {
    expect(judgeTemporaryTwoHouseTiming({ ...late, disposalDelayReason: "kamco", disposalDelayDisposedByThatMethod: true }).overall).toBe(true);
  });
  it("2022-02-15 이후 양도는 사유만으로 성립(현행 문언 — 대조)", () => {
    expect(
      judgeTemporaryTwoHouseTiming({ ...late, transferDate: D("2023-06-01"), disposalDelayReason: "kamco" }).overall,
    ).toBe(true);
  });
  it("기한 안 양도는 사유와 무관하게 성립", () => {
    expect(judgeTemporaryTwoHouseTiming({ ...late, transferDate: D("2021-01-15") }).overall).toBe(true);
  });
});

describe("구 §167의10①8호(중과 배제) — 같은 술어를 쓴다", () => {
  // 「3년이 지난 경우로서 제155조제18항 각 호의 어느 하나에 해당하는 경우를 포함」 — ⑱ 자체의 요건(연혁)을 따른다.
  const base = {
    isOneHousehold: true,
    householdHousingCount: 2,
    transferDate: D("2021-06-01"),
    temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2018-03-01") },
  };
  const withDelay = (extra: Record<string, unknown>) => ({
    ...base,
    temporaryTwoHouse: { ...base.temporaryTwoHouse, disposalDelayReason: "kamco" as const, ...extra },
  });
  it("사유만(방법 미확인) → 불성립", () => {
    expect(qualifiesOldClause8TemporaryTwoHouse(withDelay({}))).toBe(false);
  });
  it("방법 확인 → 성립 (양성 짝)", () => {
    expect(qualifiesOldClause8TemporaryTwoHouse(withDelay({ disposalDelayDisposedByThatMethod: true }))).toBe(true);
  });
});
