/**
 * anchor — 「소득세법 시행령」 §155① 후단: 종전 주택 일부가 수용된 뒤 잔존 주택을 양도하면 「종전의 주택 … 의 양도 또는 수용에
 * 포함」 ⇒ 처분기한(요건 B)을 수용일로도 판정한다 (2026-11-12 리뷰 E-5 · 사용자 결정: 기존 수용 단서 칸 재사용 · 수용이 신규 취득보다
 * 앞서도 적용).
 *
 * 기간 N은 양도일 연혁(`data/temporary-two-house-remnant-era.ts`): 2002.3.30.~ 2년 · 2012.6.29.~ 3년 · 2017.2.3.~ 5년.
 * §154①2호 후단(2013.2.15.~ 5년)과 다르다 — R-2가 그 차이를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { resolveTempTwoHouseRemnantYears } from "@/lib/tax-engine/data/temporary-two-house-remnant-era";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);

const judge = (o: {
  prev: string;
  next: string;
  transfer: string;
  expropriation?: string;
  notice?: string | null;
}) =>
  checkExemption(
    baseTransferInput({
      acquisitionDate: D(o.prev),
      transferDate: D(o.transfer),
      householdHousingCount: 2,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      temporaryTwoHouse: { previousAcquisitionDate: D(o.prev), newAcquisitionDate: D(o.next) },
      ...(o.expropriation
        ? {
            oneHouseExemptionProviso: {
              reason: "expropriation",
              expropriationDate: D(o.expropriation),
              ...(o.notice === null ? {} : { businessApprovalDate: D(o.notice ?? "2015-01-01") }),
            },
          }
        : {}),
    } as Partial<TransferTaxInput>) as OneHouseJudgeInput,
    rules,
    D("2021-01-01"),
  );

describe("§155① 후단 잔존 주택 (E-5)", () => {
  it("연혁 leaf — 경계일(시행본 실독): 2002-03-30 2년 · 2012-06-29 3년 · 2017-02-03 5년 · 그 전날은 앞 구간", () => {
    expect(resolveTempTwoHouseRemnantYears(D("2002-03-29"))).toBeUndefined();
    expect(resolveTempTwoHouseRemnantYears(D("2002-03-30"))).toBe(2);
    expect(resolveTempTwoHouseRemnantYears(D("2012-06-28"))).toBe(2);
    expect(resolveTempTwoHouseRemnantYears(D("2012-06-29"))).toBe(3);
    expect(resolveTempTwoHouseRemnantYears(D("2017-02-02"))).toBe(3);
    expect(resolveTempTwoHouseRemnantYears(D("2017-02-03"))).toBe(5);
  });

  // 종전 2010-01-01(고시일 2015-01-01 전 취득) · 신규 2019-01-01 → 처분기한 2022-01-03(1/1 공휴일 · 1/2 일요일 이월)
  const BASE = { prev: "2010-01-01", next: "2019-01-01", transfer: "2024-06-01" };

  it("R-1 2017.2.3. 이후: 일부 수용 2021-06-01(기한 안) · 잔존 양도 2024-06-01(기한 밖 · 수용일부터 5년 안) → 비과세", () => {
    expect(judge({ ...BASE, expropriation: "2021-06-01" }).isExempt).toBe(true);
  });

  it("R-1 대조: 수용 단서 없음 → 기한 밖 양도라 과세", () => {
    expect(judge(BASE).isExempt).toBe(false);
  });

  it("R-1 부정: 수용일도 기한 밖(2022-06-01) → 과세", () => {
    expect(judge({ ...BASE, expropriation: "2022-06-01" }).isExempt).toBe(false);
  });

  it("R-2 2012.6.29.~2017.2.2. 양도는 3년 — §154 후단(5년)을 쓰면 비과세가 되는 2016-12-01 양도가 과세", () => {
    // 종전 2008 · 신규 2011-01-01 → 처분기한 3년(2014-01-02) · 수용 2013-06-01(기한 안) · 3년 = 2016-06-01
    const s = { prev: "2008-01-01", next: "2011-01-01", expropriation: "2013-06-01", notice: "2012-01-01" };
    expect(judge({ ...s, transfer: "2016-05-31" }).isExempt).toBe(true);
    expect(judge({ ...s, transfer: "2016-12-01" }).isExempt).toBe(false);
  });

  it("R-3 고시일 모름(2006.2.9. 이후 양도 · 고시일 전 취득 요건) → 후단 불성립 → 과세", () => {
    expect(judge({ ...BASE, expropriation: "2021-06-01", notice: null }).isExempt).toBe(false);
  });

  it("R-4 수용이 신규 주택 취득보다 먼저(2018-06-01) — 사용자 결정으로 적용 → 비과세", () => {
    expect(judge({ ...BASE, transfer: "2023-06-01", expropriation: "2018-06-01" }).isExempt).toBe(true);
  });

  it("R-5 수용일 = 양도일(수용된 주택 자체의 양도) → 후단이 아니라 종전 경로 — 기한 밖이면 과세", () => {
    expect(judge({ ...BASE, expropriation: "2024-06-01" }).isExempt).toBe(false);
  });
});
