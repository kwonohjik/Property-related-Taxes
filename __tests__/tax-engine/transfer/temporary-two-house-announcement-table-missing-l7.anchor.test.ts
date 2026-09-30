/**
 * anchor — L-7 · 공고일 표(`PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES`)에 신규 주택 지정 구간의 시작일이
 * **없을 때** — 영 §167의10①11호 경로(`multi-house-surcharge-exclusion.ts`)와 같은 규약:
 * 「공고가 있은 날 이전」 제외를 판정하지 않고(종전 동작 — 계약일 효력 판정만) 경고한다.
 *
 * 실제 명부의 시작일은 전부 표에 있다(`regulated-area-governing-designation.test.ts` 커버리지 단언) — 이 경로는
 * 명부에 새 차수를 append하고 표를 갱신하지 않은 경우만 탄다. 그래서 표에서 2020-06-19를 뺀 mock으로 관측한다.
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
import { resolveRegulatedAtNewAcquisition } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
const d = (s: string) => new Date(s);
const CJ = "4311110100";
const GANGNAM = "1168010100";
const ID = "155-1-regulated-announcement-date-unverified";

const at = (contract: string, transfer: string, newCode = CJ): TransferTaxInput =>
  baseTransferInput({
    householdHousingCount: 2,
    acquisitionDate: d("2019-02-21"),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    regionCode: CJ,
    temporaryTwoHouse: {
      previousAcquisitionDate: d("2019-02-21"),
      newAcquisitionDate: d("2020-06-30"),
      newHouseRegionCode: newCode,
      newHouseContractDate: d(contract),
    },
  });
const ids = (i: TransferTaxInput) => checkExemption(i as OneHouseJudgeInput, rules, d("2026-09-30")).undetermined.map((u) => u.id);

describe("L-7 공고일 표에 시작일이 없을 때 — 종전 동작 + 경고", () => {
  it("계약 = 2020-06-19 → 제외를 판정하지 않음(조정 취득 → 2년 → 과세) + 판정 보류 고지·계산기 경고", () => {
    const i = at("2020-06-19", "2022-12-01");
    const reg = resolveRegulatedAtNewAcquisition(i);
    expect(reg).toMatchObject({ next: true, bothRegulated: true });
    expect(reg.announcementWarning).toContain("효력 2020-06-19");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(false);
    expect(ids(i)).toContain(ID);
    expect(calculateTransferTax(i, mockRates).warnings?.some((w) => w.includes("공고일 표에 없어"))).toBe(true);
  });

  it("부정 짝 — 결론을 바꾸지 않는 양도 시기(2023-01-12 이후)면 경고하지 않는다", () => {
    expect(ids(at("2020-06-19", "2023-06-01"))).not.toContain(ID);
  });

  it("부정 짝 — 표에 있는 시작일(강남 2017-08-03)이면 경고 없음", () => {
    const i = at("2020-06-19", "2022-12-01", GANGNAM);
    expect(resolveRegulatedAtNewAcquisition(i).announcementWarning).toBeUndefined();
    expect(ids(i)).not.toContain(ID);
  });
});
