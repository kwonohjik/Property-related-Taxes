/**
 * 감사 결함 회귀 테스트 — period-check.ts:73 (§97의5 시한 fallback)
 *
 * 결함 ref: lib/tax-engine/transfer-reductions/period-check.ts:73
 * 그룹: redux-rental-router / legal-accuracy / high
 *
 * 결함 요지: rental_97_5 규칙의 시한 fallback 이
 *   `before(c.contractDate ?? c.registrationDate ?? c.acquisitionDate, 2018-12-31)`
 * 로, 매매계약일(contractDate) 미입력 시 임대사업자 등록일(registrationDate)을
 * 취득일(acquisitionDate)보다 우선 사용했다.
 *
 * 법령 근거: 조특법 §97의5①1호 — "2018.12.31까지 …매입임대주택… 을 취득
 * (2018.12.31까지 매매계약을 체결하고 계약금을 납부한 경우를 포함한다)".
 * 시한 기준은 취득/매매계약이며 임대사업자 등록일이 아니다.
 * 등록은 취득일로부터 3개월 이내(§97의5①1호)여야 하므로 registrationDate ≥ acquisitionDate 가
 * 항상 성립 → fallback 에 registrationDate 를 acquisitionDate 앞에 두면 시한 판정을 뒤로만 밀어
 * false-rejection(불리) 만 유발한다.
 *
 * 기대값은 법령(§97의5①1호)에서 독립 도출:
 *  - 취득일 ≤ 2018-12-31 이면 (매매계약 미입력 시) 시한 내(true) 여야 한다.
 *  - 취득일 > 2018-12-31 이면 (매매계약 미입력 시) 시한 외(false) 여야 한다.
 *  - 등록일은 시한 판정에 어떤 영향도 주어서는 안 된다.
 */

import { describe, it, expect } from "vitest";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import type { PeriodCheckContext } from "@/lib/tax-engine/transfer-reductions";

const transferDate = new Date("2023-02-16");

describe("§97의5 시한 fallback — registrationDate 제외 (감사 결함 수정)", () => {
  it("[결함 재현] 매매계약 미입력 + 취득 2018-12-01(시한 내) + 등록 2019-01-15(시한 외) → 시한 내(true)", () => {
    // 취득 2018-12-01 은 §97의5 sunset(2018.12.31) 이내 → 적격.
    // 등록 2019-01-15 는 취득 후 3개월 이내(적격)이지만 sunset(12.31) 이후 값이다.
    // 등록일이 시한 판정에 쓰이면 부당하게 false 가 된다 → 반드시 true.
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2018-12-01"),
      registrationDate: new Date("2019-01-15"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(true);
    expect(r.failReason).toBeUndefined();
  });

  it("등록일이 시한 판정에 영향 없음: 취득 2018-12-01(시한 내) + 등록 2020-06-01(sunset 훨씬 이후) → 여전히 시한 내(true)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2018-12-01"),
      registrationDate: new Date("2020-06-01"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("매매계약 미입력 + 취득 2019-02-01(시한 외) → 시한 외(false) (등록일로 앞당겨지지 않음)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2019-02-01"),
      registrationDate: new Date("2019-03-01"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(false);
    expect(r.failReason).toContain("2018.12.31");
  });

  it("취득 시한 경계일 2018-12-31 (매매계약 미입력) → 폐구간 포함 → 시한 내(true)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: undefined,
      acquisitionDate: new Date("2018-12-31"),
      registrationDate: new Date("2019-02-28"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("[기존 동작 보존] 매매계약 2018-12-01(시한 내) + 등록 2019-03-01(시한 외) → 매매계약 우선 → 시한 내(true)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2018-12-01"),
      registrationDate: new Date("2019-03-01"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(true);
  });

  it("[기존 동작 보존] 매매계약 2019-01-01(시한 외) → 시한 외(false)", () => {
    const ctx: PeriodCheckContext = {
      transferDate,
      contractDate: new Date("2019-01-01"),
    };
    const r = checkReductionPeriod("rental_97_5", ctx);
    expect(r.inPeriod).toBe(false);
  });
});
