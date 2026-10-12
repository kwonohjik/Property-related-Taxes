/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴 Step3 「증여받은 주택」 세대 사실 → 2-C 취득 당시 조정대상지역 자동 판정 (결정 #38 위생).
 *
 * Step3의 giftBasis 일자 변환을 `lib/api/date-coerce`(`toOptionalDate`)로 바꾸면서, 완성된 일자에서는 종전 `new Date`와
 * **같은 판정**임을 고정한다. 같은 세대로 확인되면 「취득 당시」는 세대 보유 시작일과 증여일 **둘 다** 지정 중일 때만 해당이다
 * (엔진 leaf `resolveGiftResidenceDates` all 모드).
 *
 * 서울 마포(1144010100) — 2017-08-03 지정 · 2023-01-05 해제.
 *
 * | # | 사실 | 기준일 | 판정 |
 * |---|---|---|---|
 * | G-1 | 같은 세대(예) · 시작일 2016-01-01(지정 전) · 증여일 2022-06-01(지정 중) | 시작일 | 미해당 |
 * | G-2 | 아니오 | 증여일 | 해당 |
 * | G-3 | 예 · 시작일 공란 | 증여일(통산 불성립) | 해당 |
 * | G-4 | 예 · 시작일 2018-01-10(지정 중) · 증여일 2022-06-01(지정 중) | 둘 다 지정 중 | 해당 |
 * | G-5 | 예 · 입력 중 미완성 시작일(2016-00-01) | 통산 불성립 → 증여일 | 해당 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const MAPO = "1144010100";

const form = (giftSameHousehold: "yes" | "no", giftHouseholdHoldingStartDate: string): OneHouseJudgmentFormData => {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate: "2025-06-15",
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionDate: "2022-06-01",
        acquisitionCause: "gift",
        giftDonorRelation: "lineal",
        donorAcquisitionDate: "2010-01-01",
        giftSameHousehold,
        giftHouseholdHoldingStartDate,
        regionCode: MAPO,
      },
    ],
  } as OneHouseJudgmentFormData;
};

const verdict = (f: OneHouseJudgmentFormData) => {
  render(<Step3 form={f} onChange={() => {}} />);
  const text = screen.getByTestId("one-house-regulated-auto").textContent ?? "";
  cleanup();
  return text;
};

describe("Step3 증여받은 주택 — 취득 당시 조정대상지역 자동 판정", () => {
  it("[G-1] 같은 세대 + 지정 전 세대 보유 시작일 → 미해당 · [G-2] 부정 짝: 아니오 → 증여일 기준 해당", () => {
    expect(verdict(form("yes", "2016-01-01"))).toMatch(/취득 당시 조정대상지역 미해당/);
    expect(verdict(form("no", "2016-01-01"))).toMatch(/취득 당시 조정대상지역 해당/);
  });
  it("[G-3] 「예」인데 시작일 공란이면 통산하지 않는다 → 증여일 기준 해당", () => {
    expect(verdict(form("yes", ""))).toMatch(/취득 당시 조정대상지역 해당/);
  });
  it("[G-4] 시작일·증여일 모두 지정 중 → 해당", () => {
    expect(verdict(form("yes", "2018-01-10"))).toMatch(/취득 당시 조정대상지역 해당/);
  });
  it("[G-5] 입력 중 미완성 시작일(2016-00-01)은 통산하지 않는다 → 증여일 기준 해당", () => {
    expect(verdict(form("yes", "2016-00-01"))).toMatch(/취득 당시 조정대상지역 해당/);
  });
});
