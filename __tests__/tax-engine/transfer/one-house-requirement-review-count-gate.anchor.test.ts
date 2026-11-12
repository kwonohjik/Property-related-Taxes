/**
 * anchor — 요건 검토표의 §155① 행 주택 수 게이트는 판정 본체(E-3)와 같다 (2026-11-12 리뷰 J-2).
 *
 * 상속주택 두 풀이 모두 제외되는 세대(`inheritedHouseExclusionCount: 2`)는 세 특례가 겹쳐 §155①이 성립하지 않는다
 * (`twoHouseSpecialCountHolds`). 검토표가 원시 `householdHousingCount === 2`로 열면 「과세 배지 아래 전 요건 충족」이
 * 나온다 — 이 파일 머리 주석이 금지하는 모양이다.
 *
 * 시료: 종전 2019-06-01 · 신규 2022-01-01 · 양도 2024-06-01(기한 안) · 비조정 · 2주택.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);

const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(
    baseTransferInput({
      householdHousingCount: 2,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      temporaryTwoHouse: { previousAcquisitionDate: D("2019-06-01"), newAcquisitionDate: D("2022-01-01") },
      ...over,
    }) as OneHouseJudgeInput,
    rules,
    D("2021-01-01"),
  );

describe("J-2 — 요건 검토표 §155① 행은 E-3와 같은 주택 수 게이트", () => {
  it("대조: 상속주택 제외 없음 → 비과세 · 검토표 scheme 155-1", () => {
    const r = judge({});
    expect(r.isExempt).toBe(true);
    expect(r.requirementReview?.scheme).toBe("155-1-temporary-two-house");
  });

  it("상속주택 두 풀 모두 제외(세 특례) → 과세이고 §155① 검토표를 싣지 않는다", () => {
    const r = judge({ inheritedHouseExclusionCount: 2 });
    expect(r.isExempt).toBe(false);
    expect(r.requirementReview?.scheme).not.toBe("155-1-temporary-two-house");
  });
});
