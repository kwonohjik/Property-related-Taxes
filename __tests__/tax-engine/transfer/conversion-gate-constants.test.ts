/**
 * Phase A — 비주택→주택 용도변경 게이트 상수 2종
 *
 * 값 자체보다 **UTC 파싱 함정**을 고정하는 것이 목적이다.
 * `new Date("2025-01-01")`은 UTC 자정으로 파싱되므로, KST 로컬 자정으로 만들어진
 * 양도일 Date와 `>=` 비교하면 **시행일 당일 양도가 게이트에서 누락**된다.
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
    expect(LTHD_CONVERSION_95_5_CUTOFF.getFullYear()).toBe(2025);
    expect(LTHD_CONVERSION_95_5_CUTOFF.getMonth()).toBe(0);
    expect(LTHD_CONVERSION_95_5_CUTOFF.getDate()).toBe(1);
  });

  it("시행령 §154⑤ 단서 — 2024-03-01 (대통령령 제34265호)", () => {
    expect(CONVERSION_EXEMPTION_CUTOFF.getFullYear()).toBe(2024);
    expect(CONVERSION_EXEMPTION_CUTOFF.getMonth()).toBe(2);
    expect(CONVERSION_EXEMPTION_CUTOFF.getDate()).toBe(1);
  });

  it("★ 로컬 자정 파싱 — 시행일 당일 양도가 게이트를 통과한다", () => {
    // 엔진 input의 transferDate는 `toDate()`가 만든 로컬 Date다.
    const onCutoff = new Date("2025-01-01T00:00:00");
    expect(onCutoff >= LTHD_CONVERSION_95_5_CUTOFF).toBe(true);

    const dayBefore = new Date("2024-12-31T00:00:00");
    expect(dayBefore >= LTHD_CONVERSION_95_5_CUTOFF).toBe(false);

    const exemptOnCutoff = new Date("2024-03-01T00:00:00");
    expect(exemptOnCutoff >= CONVERSION_EXEMPTION_CUTOFF).toBe(true);

    const exemptDayBefore = new Date("2024-02-29T00:00:00");
    expect(exemptDayBefore >= CONVERSION_EXEMPTION_CUTOFF).toBe(false);
  });

  it("🔴 UTC 파싱 함정 — 상수는 항상 **로컬** 자정이어야 한다", () => {
    const localMidnight = new Date("2025-01-01T00:00:00");

    // 이것이 지켜야 할 불변식이다 — TZ와 무관하게 성립한다.
    expect(LTHD_CONVERSION_95_5_CUTOFF.getTime()).toBe(localMidnight.getTime());
    expect(LTHD_CONVERSION_95_5_CUTOFF.getHours()).toBe(0);
    expect(CONVERSION_EXEMPTION_CUTOFF.getHours()).toBe(0);

    // 함정 자체는 UTC보다 앞선 TZ(KST 등)에서만 드러난다. CI는 Linux/UTC라
    // 그곳에서는 두 값이 같아져 반례가 성립하지 않으므로 조건부로만 확인한다.
    const utcParsed = new Date("2025-01-01"); // ← 'T00:00:00' 없음 = UTC 자정
    if (localMidnight.getTimezoneOffset() !== 0) {
      expect(LTHD_CONVERSION_95_5_CUTOFF.getTime()).not.toBe(utcParsed.getTime());
    }
  });
});
