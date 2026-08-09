/**
 * Phase A — `calcUsagePeriodInfo` leaf 추출 후 동작 불변 확인
 *
 * 추출 목적은 **클라이언트가 직접 import**할 수 있게 하는 것이다(§95⑤ UI 미리보기가
 * 산식을 재구현하지 않도록). 겸용주택 시간분할 경로의 기존 동작은 그대로여야 한다.
 *
 * 설계: docs/02-design/features/non-housing-to-housing-conversion.engine.design.md §헬퍼 1
 */
import { describe, it, expect } from "vitest";
import { calcUsagePeriodInfo } from "@/lib/tax-engine/usage-period-info";

describe("calcUsagePeriodInfo — leaf 추출 후", () => {

  it("PDF 사례 30 — 비주택 4년 / 주택 3년 (완성연수)", () => {
    const info = calcUsagePeriodInfo(
      new Date("2018-02-10"),
      new Date("2022-11-25"),
      new Date("2026-01-27"),
    );

    expect(info).not.toBeNull();
    expect(info!.t1HoldingYears).toBe(4); // 4년 9개월 14일
    expect(info!.t2HoldingYears).toBe(3); // 3년 2개월 1일
  });

  it("C-8·C-9 방어 — 용도변경일이 구간 밖이면 null", () => {
    const acq = new Date("2018-02-10");
    const transfer = new Date("2026-01-27");

    expect(calcUsagePeriodInfo(acq, undefined, transfer)).toBeNull();
    expect(calcUsagePeriodInfo(acq, acq, transfer)).toBeNull(); // 취득일 당일
    expect(calcUsagePeriodInfo(acq, new Date("2017-01-01"), transfer)).toBeNull(); // 취득일 이전
    expect(calcUsagePeriodInfo(acq, transfer, transfer)).toBeNull(); // 양도일 당일
    expect(calcUsagePeriodInfo(acq, new Date("2027-01-01"), transfer)).toBeNull(); // 양도일 이후
  });

  it("일수·시간비례 연수는 365.25 기준으로 계속 산출된다 (겸용주택 안분용)", () => {
    const info = calcUsagePeriodInfo(
      new Date("2020-01-01"),
      new Date("2022-01-01"),
      new Date("2024-01-01"),
    );

    expect(info!.t1Days + info!.t2Days).toBe(info!.totalDays);
    expect(info!.t1Years).toBeCloseTo(info!.t1Days / 365.25, 10);
    expect(info!.t2Years).toBeCloseTo(info!.t2Days / 365.25, 10);
  });
});
