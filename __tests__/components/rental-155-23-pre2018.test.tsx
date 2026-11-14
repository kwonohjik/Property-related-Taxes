/**
 * @vitest-environment jsdom
 *
 * V-6 — 「구 임대주택법」 임대 구분에서도 §155㉓ 말소를 입력·전송·검증한다(⑤·④·⑧ 3중 패턴).
 * 엔진 근거·leaf 단언: `__tests__/tax-engine/transfer/rental-155-23-pre2018.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitTerminationInScope } from "@/lib/calc/rental-unit-termination-scope";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

const unit = (over: Partial<Unit> = {}): Unit => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2010-10-01",
  rentalRegistrationDate: "2010-10-01",
  rentalRegisteredDate: "2010-10-01",
  rentalCategory: "pre_2018",
  rentalAcquisitionType: "purchase",
  standardPriceAtRentalStart: "300,000,000",
  rentalInputMode: "direct",
  rentalMonths: "60",
  requirementsConfirmed: true,
  rentalAutoTermination: true,
  terminationReason: "auto",
  terminatedRegistrationType: "short_term",
  registrationCancellationDate: "2015-10-01",
  ...over,
});

const assetOf = (u: Unit): AssetForm => {
  const a = makeDefaultAsset(1);
  return { ...a, assetKind: "housing", rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [u] } } as AssetForm;
};

describe("V-6 ⑤ 화면", () => {
  it("U-1 구 임대주택법 → 말소 토글이 보인다", () => {
    render(<RentalUnitCard unit={unit({ rentalAutoTermination: false })} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByText("자진말소 또는 자동말소로 임대사업자 등록이 말소된 임대주택입니다.")).toBeTruthy();
  });
  it("U-2 구 임대주택법 · 말소 ON → 등록 유형 칸에 「단기민간임대(4년)」 안내 · 장기일반은 안내 없음", () => {
    render(<RentalUnitCard unit={unit()} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByTestId("rental-terminated-type-pre2018-hint-0").textContent).toContain("0972");
    cleanup();
    render(<RentalUnitCard unit={unit({ rentalCategory: "long_general" })} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.queryByTestId("rental-terminated-type-pre2018-hint-0")).toBeNull();
  });
});

describe("V-6 ④ 전송", () => {
  it("A-1 구법 · 말소 ON → 말소 4필드를 보낸다", () => {
    expect(rentalUnitTerminationInScope(unit())).toBe(true);
    const p = (toRentalHousingExceptionApi(assetOf(unit())) as { rentalUnits: Record<string, unknown>[] }).rentalUnits[0];
    expect(p.rentalAutoTermination).toBe(true);
    expect(p.registrationCancellationDate).toBe("2015-10-01T00:00:00.000Z");
    expect(p.terminatedRegistrationType).toBe("short_term");
    expect(p.terminationReason).toBe("auto");
  });
});

describe("V-6 ⑧ 검증", () => {
  const v = (u: Unit) => validateRentalHousingException(assetOf(u).rentalHousingException, assetOf(u), 0, "자산 1", "2025-06-01", "facts");
  it("V-1 구법 · 말소 ON · 등록 유형 미선택 → 막는다", () => {
    expect(String(v(unit({ terminatedRegistrationType: "" as Unit["terminatedRegistrationType"] })))).toContain("등록 유형");
  });
  it("V-2 구법 · 말소 ON · 말소일 없음 → 막는다", () => {
    expect(String(v(unit({ registrationCancellationDate: "" })))).toContain("등록 말소일을 입력하세요");
  });
});
