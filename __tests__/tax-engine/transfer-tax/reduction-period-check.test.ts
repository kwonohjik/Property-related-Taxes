/**
 * 양도세 감면 시한 검증 헬퍼 — Round 9 매매계약일 우선 처리 anchor (2026-05-06)
 *
 * 13개 매매계약일 기준 조문(§99·§99의3·§98 시리즈·§97의2·§97의5·§99의2)이
 * 매매계약일을 우선 사용하고 acquisitionDate fallback이 정확히 동작하는지 검증.
 */

import { describe, it, expect } from "vitest";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import type { PeriodCheckContext } from "@/lib/tax-engine/transfer-reductions";

const transferDate = new Date("2023-02-16T00:00:00");

// ============================================================================
// §99의3 — 매매계약일 vs 잔금일 분리 케이스 (Round 9 핵심 anchor)
// ============================================================================

describe("§99의3 시한 검증 — 매매계약일 우선 (Round 9)", () => {
  it("매매계약 2001.5.24 + 잔금 2003.7.15 (시한 외) → 매매계약 시한 내로 통과 (★ Round 9 핵심)", () => {
    // 잔금만 보면 2003.7.15는 §99의3 시한(2003.6.30) 외 → 오판 가능
    // Round 9: 매매계약일 2001.5.24가 시한 내(2001.5.23~2003.6.30)이므로 통과
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2001-05-24T00:00:00"),
      acquisitionDate: new Date("2003-07-15T00:00:00"),
    };
    const r = checkReductionPeriod("new_99_3", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("매매계약 2003.7.1 (시한 외) + 잔금 2003.5.1 (시한 내) → 매매계약 우선 → 시한 외", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2003-07-01T00:00:00"),
      acquisitionDate: new Date("2003-05-01T00:00:00"),
    };
    const r = checkReductionPeriod("new_99_3", ctx);
    expect(r.inPeriod).toBe(false);
  });

  it("매매계약 미입력 + 잔금 2003.5.1 (시한 내) → fallback acquisitionDate 사용 → 시한 내", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2003-05-01T00:00:00"),
    };
    const r = checkReductionPeriod("new_99_3", ctx);
    expect(r.inPeriod).toBe(true);
  });
});

// ============================================================================
// §99 (IMF 1차) — 매매계약일 우선
// ============================================================================

describe("§99 IMF 1차 시한 검증 — 매매계약일 우선", () => {
  it("매매계약 1998.6.1 + 잔금 1999.10.1 (잔금만 보면 시한 외) → 매매계약 시한 내 통과", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("1998-06-01T00:00:00"),
      acquisitionDate: new Date("1999-10-01T00:00:00"),
    };
    const r = checkReductionPeriod("new_99", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("매매계약 2000.1.1 (시한 외) → 시한 외", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2000-01-01T00:00:00"),
      acquisitionDate: new Date("1999-06-01T00:00:00"),
    };
    const r = checkReductionPeriod("new_99", ctx);
    expect(r.inPeriod).toBe(false);
  });
});

// ============================================================================
// §97의2 신축임대 — 매매계약일 우선 (Round 9 정정)
// ============================================================================

describe("§97의2 시한 검증 — 매매계약일 우선 (Round 9 정정)", () => {
  it("매매계약 2001.10.1 (시한 내) + 취득 2002.6.1 (시한 외) → 매매계약 시한 내 통과", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2001-10-01T00:00:00"),
      acquisitionDate: new Date("2002-06-01T00:00:00"),
    };
    const r = checkReductionPeriod("rental_97_2", ctx);
    expect(r.inPeriod).toBe(true);
  });
});

// ============================================================================
// §97의5 — 매매계약일 우선 (Round 9 정정)
// ============================================================================

describe("§97의5 시한 검증 — 매매계약일 우선 (Round 9 정정)", () => {
  it("매매계약 2018.12.1 (시한 내) + 등록 2019.3.1 (시한 외) → 매매계약 시한 내 통과", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2018-12-01T00:00:00"),
      registrationDate: new Date("2019-03-01T00:00:00"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("매매계약 2019.1.1 (시한 외) → 시한 외", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2019-01-01T00:00:00"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(false);
  });
});

// ============================================================================
// §99의2 — 매매계약일만 (acquisitionDate fallback X)
// ============================================================================

describe("§99의2 시한 검증 — 매매계약일 전용", () => {
  it("매매계약 2013.5.1 → 시한 내", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2013-05-01T00:00:00"),
    };
    const r = checkReductionPeriod("unsold_99_2", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("매매계약 2014.1.1 (시한 외) → 시한 외", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2014-01-01T00:00:00"),
    };
    const r = checkReductionPeriod("unsold_99_2", ctx);
    expect(r.inPeriod).toBe(false);
  });

  it("매매계약 미입력 → 시한 외 (fallback 없음)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2013-05-01T00:00:00"), // §99의2는 contractDate 전용 → 무시
    };
    const r = checkReductionPeriod("unsold_99_2", ctx);
    expect(r.inPeriod).toBe(false);
  });
});

// ============================================================================
// §99의4 농어촌·고향주택 — 취득일 기준 (계약일 무관)
// ============================================================================

describe("§99의4 (농어촌·고향) 시한 검증 — 취득일 전용", () => {
  it("취득 2010.6.1 → 시한 내 (계약일 무관)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      acquisitionDate: new Date("2010-06-01T00:00:00"),
      contractDate: new Date("2003-01-01T00:00:00"), // 시한 외이지만 무시됨
    };
    const r = checkReductionPeriod("new_99_4_rural", ctx);
    expect(r.inPeriod).toBe(true);
  });

  // D-1 정정 (2026-06-11): §99의4 시한 기준은 "농어촌주택등 취득일"인데 PeriodCheckContext의
  // acquisitionDate는 양도하는 일반주택 취득일 → period-check는 낙관 통과로 변경.
  // 정확한 시한 판정은 evaluateNew994(new-99-4.test.ts A-5)가 ruralHouseAcquisitionDate로 수행.
  it("D-1: 자산(일반주택) 취득일이 시한 외여도 낙관 통과 — 농어촌주택 취득일 기준은 evaluator 판정", () => {
    const rural = checkReductionPeriod("new_99_4_rural", {
      transferDate,
      acquisitionDate: new Date("2003-07-01T00:00:00"), // 일반주택 취득일 — 시한 판정에 미사용
    });
    expect(rural.inPeriod).toBe(true);

    const hometown = checkReductionPeriod("new_99_4_hometown", {
      transferDate,
      acquisitionDate: new Date("2008-12-31T00:00:00"),
    });
    expect(hometown.inPeriod).toBe(true);
  });
});

// ============================================================================
// §98의9 — 취득일 기준 (2024 신설)
// ============================================================================

describe("§98의9 시한 검증 — 취득일 전용 (2024 신설)", () => {
  it("취득 2024.6.1 (시한 내, 2024.1.10~2026.12.31) → 시한 내", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      acquisitionDate: new Date("2024-06-01T00:00:00"),
    };
    const r = checkReductionPeriod("unsold_98_9", ctx);
    expect(r.inPeriod).toBe(true);
  });

  // D-1' 정정 (2026-06-11): §98의9 시한 기준은 "준공후미분양주택 취득일"인데 PeriodCheckContext의
  // acquisitionDate는 양도하는 종전주택 취득일 → period-check는 낙관 통과로 변경.
  // 정확한 시한 판정은 evaluateUnsold989(unsold-98-9.test.ts A-5)가 수행.
  it("D-1': 자산(종전주택) 취득일이 시한 외여도 낙관 통과 — 미분양 취득일 기준은 evaluator 판정", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      acquisitionDate: new Date("2024-01-09T00:00:00"), // 종전주택 취득일 — 시한 판정에 미사용
    };
    const r = checkReductionPeriod("unsold_98_9", ctx);
    expect(r.inPeriod).toBe(true);
  });
});
