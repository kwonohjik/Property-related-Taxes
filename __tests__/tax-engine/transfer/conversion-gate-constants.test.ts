/**
 * Phase A — 비주택→주택 용도변경 게이트 상수 2종
 *
 * 값 자체보다 **UTC 자정 규약**을 고정하는 것이 목적이다.
 * 엔진 날짜는 `toDate()`가 만든 UTC 자정 Date다. 상수를 로컬 자정(`T00:00:00`)으로 선언하면
 * 서버 시간대가 UTC 서쪽(미주)일 때 **시행일 당일 양도가 게이트에서 누락**된다.
 *
 * 설계: docs/02-design/features/non-housing-to-housing-conversion.engine.design.md §게이트 상수
 */
import { describe, it, expect } from "vitest";
import {
  LTHD_CONVERSION_95_5_CUTOFF,
  CONVERSION_EXEMPTION_CUTOFF,
} from "@/lib/tax-engine/tax-utils";

describe("용도변경 게이트 상수", () => {
  it("§95⑤·⑥ — 2025-01-01 (부칙 법률 제19933호 제7조)", () => {
    expect(LTHD_CONVERSION_95_5_CUTOFF.getUTCFullYear()).toBe(2025);
    expect(LTHD_CONVERSION_95_5_CUTOFF.getUTCMonth()).toBe(0);
    expect(LTHD_CONVERSION_95_5_CUTOFF.getUTCDate()).toBe(1);
  });

  // 🔁 OH-59(2026-09-26) — 대통령령 제34265호는 공포·시행 모두 2024-02-29(부칙 제1조 「공포한 날부터
  //    시행」 — 2024-03-01 예외는 별표 2 간이세액표뿐). 종전 2024-03-01은 오기였다.
  it("시행령 §154⑤ 단서 — 2024-02-29 (대통령령 제34265호)", () => {
    expect(CONVERSION_EXEMPTION_CUTOFF.getUTCFullYear()).toBe(2024);
    expect(CONVERSION_EXEMPTION_CUTOFF.getUTCMonth()).toBe(1);
    expect(CONVERSION_EXEMPTION_CUTOFF.getUTCDate()).toBe(29);
  });

  it("★ UTC 자정 — 시행일 당일 양도가 게이트를 통과한다", () => {
    // 엔진 input의 transferDate는 `toDate()`가 만든 UTC 자정 Date다 — 서버 시간대와 무관하다.
    const onCutoff = new Date("2025-01-01");
    expect(onCutoff >= LTHD_CONVERSION_95_5_CUTOFF).toBe(true);

    const dayBefore = new Date("2024-12-31");
    expect(dayBefore >= LTHD_CONVERSION_95_5_CUTOFF).toBe(false);

    const exemptOnCutoff = new Date("2024-02-29");
    expect(exemptOnCutoff >= CONVERSION_EXEMPTION_CUTOFF).toBe(true);

    const exemptDayBefore = new Date("2024-02-28");
    expect(exemptDayBefore >= CONVERSION_EXEMPTION_CUTOFF).toBe(false);
  });

  it("🔴 상수는 항상 **UTC** 자정이어야 한다 — 로컬 자정으로 선언하면 UTC 서쪽 서버에서 당일 양도가 누락된다", () => {
    const utcMidnight = new Date("2025-01-01");
    // 이것이 지켜야 할 불변식이다 — 실행 시간대와 무관하게 성립한다.
    expect(LTHD_CONVERSION_95_5_CUTOFF.getTime()).toBe(utcMidnight.getTime());
    expect(LTHD_CONVERSION_95_5_CUTOFF.getUTCHours()).toBe(0);
    expect(CONVERSION_EXEMPTION_CUTOFF.getUTCHours()).toBe(0);
  });
});
