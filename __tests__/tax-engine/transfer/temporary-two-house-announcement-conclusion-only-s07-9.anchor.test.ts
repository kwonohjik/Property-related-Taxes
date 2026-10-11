/**
 * anchor — #32(S07-9) 조정대상지역 공고일 표 미확인 고지 — 결론을 가를 때만
 *
 * 공고일 표(`PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES`)에 신규 주택 지정 구간의 시작일이 없으면 「공고가 있은 날 이전」 취득·계약 제외를
 * 판정하지 않는다(조정 취득으로 읽는 불성립 독법). 그 독법이 비과세 결론을 바꿀 때만 판정 보류로 고지한다 — 제외를 적용해도(= 한쪽만 조정이라 3년)
 * 같은 결론이면 알릴 것이 없다. 표에서 2020-06-19를 뺀 mock으로 관측한다(L-7 anchor와 같은 방법).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/tax-engine/legal-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/legal-codes")>();
  const dates = { ...actual.PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES };
  delete (dates as Record<string, string>)["2020-06-19"];
  return {
    ...actual,
    PRE_DESIGNATION_CONTRACT_EXCLUSION: { ...actual.PRE_DESIGNATION_CONTRACT_EXCLUSION, ANNOUNCEMENT_DATES: dates },
  };
});

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
const d = (s: string) => new Date(s);
const CJ = "4311110100";
const ID = "155-1-regulated-announcement-date-unverified";

const at = (prevAcq: string, contract: string, transfer: string): TransferTaxInput =>
  baseTransferInput({
    householdHousingCount: 2,
    acquisitionDate: d(prevAcq),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    regionCode: CJ,
    temporaryTwoHouse: {
      previousAcquisitionDate: d(prevAcq),
      newAcquisitionDate: d("2020-06-30"),
      newHouseRegionCode: CJ,
      newHouseContractDate: d(contract),
    },
  });
const ids = (i: TransferTaxInput) => checkExemption(i as OneHouseJudgeInput, rules, d("2026-09-30")).undetermined.map((u) => u.id);

describe("#32 공고일 표 미확인 고지 — 결론이 갈릴 때만", () => {
  it("P1 결론이 갈린다 — 제외를 적용하면 3년 비과세, 적용하지 않으면 2년 과세 → 고지 (L-7 회귀)", () => {
    const i = at("2019-02-21", "2020-06-19", "2022-12-01");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(false);
    expect(ids(i)).toContain(ID);
  });

  it("P2 ★ 결론이 같다 — 종전주택 취득 후 1년이 안 돼 신규 취득한 세대(요건 A 불성립)는 어느 독법이든 과세 → 고지 없음 (종전: 항상 고지)", () => {
    const i = at("2020-06-10", "2020-06-19", "2022-12-01");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(false);
    expect(ids(i)).not.toContain(ID);
  });

  it("P3 부정 짝 — 결론을 바꾸지 않는 양도 시기(2023-01-12 이후)면 고지 없음", () => {
    expect(ids(at("2019-02-21", "2020-06-19", "2023-06-01"))).not.toContain(ID);
  });
});
