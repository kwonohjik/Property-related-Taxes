/**
 * @vitest-environment jsdom
 *
 * G1-13 — 부담부증여 §155⑳(§154⑩ 표준 경로, 0호·2019.2.12. 전 취득) 카드(⑤)와 ⑧은 주소(PNU)가 있으면
 * 엔진과 같은 「취득시 조정대상지역」(주소 판정)을 읽는다. 숨은 토글 저장값을 읽으면 엔진(코드 우선)과 반대로 안내·검증한다.
 *
 * 근거: 「소득세법 시행령」 제154조제1항 괄호(취득 당시 조정대상지역이면 거주 2년) · 제10항.
 * 이 anchor는 읽기 쪽 단일 진실만 고정한다 — 주소가 있을 때 토글을 어떻게 보일지(G7-6)는 다루지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const GANGNAM_PNU = "1168010100100120034"; // 2018-01-01 취득 당시 조정대상지역(2017.8.3. 지정)
const SEOGU_PNU = "2826010100100120034"; // 인천 서구 — 2018-01-01 취득 당시 조정대상지역 아님
const GIFT_DATE = "2025-06-01";
const REGULATED_TEXT = "이 주택은 조정대상지역 취득입니다.";
const NOT_REGULATED_TEXT = "이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.";

const RHE = {
  applyException: true,
  scenario: "B" as const,
  rentalUnits: [],
  priorResidenceTransferDate: "2023-01-10",
  standardPriceAtAcquisitionForPhrp: "150,000,000",
  standardPriceAtPriorTransfer: "250,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
  postRegistrationResidenceMonths: "",
  priorRentalExemptionHistory: "" as const,
  residenceTransitionUnderAddendum: false,
  residenceTransitionBasis: "",
  wasRegisteredRentalOrChildcare: true,
};

function item(bgt: Partial<BurdenedGiftTransferTaxInput>, pnu?: string): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    ...(pnu ? { estateAddress: { jibun: "테스트 주소 12-34", pnu } } : {}),
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2018-01-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 12,
      isUnregistered: false,
      rentalHousingException: RHE,
      ...bgt,
    },
  } as unknown as EstateItem;
}
const form = (it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate: GIFT_DATE, donor: "father", donorRelation: "lineal_ascendant_adult", giftItems: [it] }) as unknown as FormState;

async function route(it: EstateItem) {
  const res = await POST(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildGiftBurdenedTransferBody(it, form(it))),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as any)?.data?.result;
}

function Harness({ start }: { start: EstateItem }) {
  const [it, setIt] = useState(start);
  return <EstateBodyRealEstate item={it} onUpdate={setIt} valuationDate={GIFT_DATE} mode="gift" showCollateralDeductToggle={false} />;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const RENTAL_ERR = "거주기간 2년(24개월) 이상이 필요합니다";

describe("G1-13 — ⑤ 카드·⑧은 주소가 있으면 엔진과 같은 취득시 조정대상지역을 읽는다", () => {
  it("정방향 — 강남 PNU·저장값 없음: 엔진 불성립과 같게 ⑤ 「조정대상지역 취득」 · ⑧ 차단", async () => {
    const it = item({ wasRegulatedAtAcquisition: undefined }, GANGNAM_PNU);
    const r = await route(it);
    expect(r.isExempt).toBe(false); // 엔진: 2018 취득·조정대상지역·거주 12개월 → 불성립
    render(<Harness start={it} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(REGULATED_TEXT);
    expect(text).not.toContain(NOT_REGULATED_TEXT);
    expect(validateStep(1, form(it)) ?? "").toContain(RENTAL_ERR);
  });

  it("역방향 — 서구 PNU·저장값 true: 엔진 성립(§154⑩)과 같게 ⑧ 통과 · ⑤ 「조정대상지역 취득이 아니므로」", async () => {
    const it = item({ wasRegulatedAtAcquisition: true }, SEOGU_PNU);
    const r = await route(it);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true); // 엔진 성립
    render(<Harness start={it} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(NOT_REGULATED_TEXT);
    expect(text).not.toContain(REGULATED_TEXT);
    expect(validateStep(1, form(it))).toBeNull();
  });

  it("긍정 짝 — 주소 없음: 저장값을 그대로 따른다(false → 아님·통과 / true → 취득·⑧ 차단)", () => {
    const none = item({ wasRegulatedAtAcquisition: false });
    expect(validateStep(1, form(none))).toBeNull();
    render(<Harness start={none} />);
    expect(document.body.textContent ?? "").toContain(NOT_REGULATED_TEXT);
    cleanup();

    const on = item({ wasRegulatedAtAcquisition: true });
    expect(validateStep(1, form(on)) ?? "").toContain(RENTAL_ERR);
    render(<Harness start={on} />);
    expect(document.body.textContent ?? "").toContain(REGULATED_TEXT);
  });

  it("긍정 짝 — 강남 PNU·저장값 true: 주소 판정과 저장값이 같으면 결과도 같다(취득·⑧ 차단)", () => {
    const it = item({ wasRegulatedAtAcquisition: true }, GANGNAM_PNU);
    render(<Harness start={it} />);
    expect(document.body.textContent ?? "").toContain(REGULATED_TEXT);
    expect(validateStep(1, form(it)) ?? "").toContain(RENTAL_ERR);
  });
});
