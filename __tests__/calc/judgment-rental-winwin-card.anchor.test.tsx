/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴 ⑳ 카드 ③ 거주요건이 **상생임대주택(§155의3①) 면제를 엔진과 같게** 표시한다 (V-8).
 *
 * 종전: Step3가 카드에 `residenceFacts`를 넘기지 않아, 엔진은 ⑳ 성립·비과세(상생임대로 거주요건 면제)인데
 * 카드는 「✗ 미충족 — 현재 0개월」을 띄웠다. ⑧도 `false` 고정이었다.
 *
 * | # | 입력 | 엔진 ⑳ | 카드 거주 행 |
 * |---|---|---|---|
 * | W-1 | 상생임대 · 2025 양도 | 성립 · 비과세 | 상생임대 면제 · ✓ 충족 |
 * | W-2 | 상생임대 · 2027 양도(종료일 입력) | 성립 · 비과세 | 상생임대 면제 · ✓ 충족 |
 * | W-3 | 상생임대 · 2028 양도(2026 개정 양도기한 경과) | 불성립 | ✗ 미충족 |
 * | W-4 | 상생임대 없음 · 2025 양도 | 불성립 | ✗ 미충족 |
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { render, cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({
  ...(await o<typeof import("@/lib/db/tax-rates")>()),
  preloadTaxRates: vi.fn(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep2, validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const unit = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2015-01-01",
  rentalRegistrationDate: "2015-01-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "110",
  requirementsConfirmed: true,
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
};
const rh = {
  ...makeDefaultAsset(1).rentalHousingException,
  applyException: true,
  scenario: "A",
  priorRentalExemptionHistory: "none",
  rentalUnits: [unit],
  phrp154_10Answer: "no",
} as AssetForm["rentalHousingException"];
const WIN = {
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "5",
  winWinRentalPriorLeaseMonths: "24",
  winWinRentalLeaseMonths: "24",
};

/** 본인 거주 0개월 · 명부에 장기임대 1호(A) — 거주요건만 상생임대 면제 여부로 갈린다. */
function jf(win: boolean, transferDate: string, extra: Record<string, unknown> = {}): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    ...oneHouseJudgmentExtraDefaults,
    ...(win ? WIN : {}),
    ...extra,
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2021-01-04",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "0",
        rentalHousingException: rh,
      },
    ],
    transferDate,
    contractTotalPrice: "800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [
      {
        ...createHouseEntry("rt"),
        acquisitionDate: "2015-01-01",
        region: "non_capital",
        regionCode: "4682025021",
        officialPrice: "250000000",
        isApartment: false,
        acquisitionOrigin: "general",
        isLongTermRental: true,
        rentalType: "A",
        rentalStartOfficialPrice: "250000000",
        rentalRegistrationDate: "2015-01-01",
        rentalStartDate: "2015-01-01",
      },
    ],
    householdHousingCount: "2",
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
}

async function judge(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

/** ⑳ 카드 ③ 실시간 충족 표시의 거주 행 — 라벨과 판정 칸. */
function residenceRow(container: HTMLElement) {
  const label = [...container.querySelectorAll("span")].find((s) =>
    (s.textContent ?? "").startsWith("거주주택 거주기간"),
  );
  expect(label).toBeTruthy();
  return { label: label!.textContent ?? "", verdict: label!.nextElementSibling?.textContent ?? "" };
}

const LEASE_END = { winWinRentalLeaseEndDate: "2024-03-01" };
const CASES = [
  { id: "W-1", f: () => jf(true, "2025-03-03"), passed: true },
  { id: "W-2", f: () => jf(true, "2027-06-01", LEASE_END), passed: true },
  { id: "W-3", f: () => jf(true, "2028-06-01", LEASE_END), passed: false },
  { id: "W-4", f: () => jf(false, "2025-03-03"), passed: false },
] as const;

describe("V-8 판정 메뉴 ⑳ 카드 거주 행 = 엔진 ⑳ 판정", () => {
  for (const c of CASES) {
    it(`${c.id} 엔진 ⑳ ${c.passed ? "성립" : "불성립"} ↔ 카드 ${c.passed ? "✓" : "✗"}`, async () => {
      const f = c.f();
      expect([...validateStep2(f), ...validateStep3(f)].filter((e) => e.severity === "error")).toEqual([]);

      const d = await judge(f);
      expect(d.rentalHousingException.passed).toBe(c.passed);
      expect(d.judgment.isExempt).toBe(c.passed);

      const { container } = render(<Step3 form={f} onChange={() => {}} />);
      const row = residenceRow(container);
      expect(row.verdict.startsWith(c.passed ? "✓ 충족" : "✗ 미충족")).toBe(true);
      expect(row.label.includes("상생임대주택이라 적용하지 않음")).toBe(c.passed);
    });
  }
});
