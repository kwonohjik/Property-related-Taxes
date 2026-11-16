/**
 * @vitest-environment jsdom
 *
 * V-10 — 「2020.8.18. 전 멸실」 질문의 ⑤ 노출 · ④ 전송 · ⑧ 차단 · ⑫ 400이 같은 술어(`rentalUnitPreAddendaDemolitionInScope`)를 쓴다(3중 패턴).
 * 엔진 근거·판정: `__tests__/tax-engine/transfer/rental-155-23-pre-addenda-demolition-v10.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitPreAddendaDemolitionInScope } from "@/lib/calc/rental-unit-termination-scope";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema-rental-exception";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

/** 가목 다세대 · 단기 2015-03-01 등록 · 자동말소 · 의무기간 종료일 2019-03-01 입력 */
const unit = (over: Partial<Unit> = {}): Unit => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2015-03-01",
  rentalRegistrationDate: "2015-03-01",
  rentalRegisteredDate: "2015-03-01",
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  standardPriceAtRentalStart: "300,000,000",
  rentalInputMode: "direct",
  rentalMonths: "48",
  requirementsConfirmed: true,
  rentalAutoTermination: true,
  terminationReason: "auto",
  terminatedRegistrationType: "short_term",
  registrationCancellationDate: "2019-03-01",
  ...over,
});

const assetOf = (u: Unit): AssetForm => {
  const a = makeDefaultAsset(1);
  return { ...a, assetKind: "housing", rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [u] } } as AssetForm;
};
const payload = (u: Unit) => (toRentalHousingExceptionApi(assetOf(u)) as { rentalUnits: Record<string, unknown>[] }).rentalUnits[0];
const validate = (u: Unit) => validateRentalHousingException(assetOf(u).rentalHousingException, assetOf(u), 0, "자산 1", "2024-06-01", "facts");
const zodOk = (u: Unit) => rentalHousingExceptionSchema.safeParse(toRentalHousingExceptionApi(assetOf(u))).success;

/** 범위 격자 — 안·밖 */
const IN_SCOPE: Partial<Unit>[] = [{}, { registrationCancellationDate: "2020-08-18" }, { registrationCancellationDate: "2020-04-15" }];
const OUT_OF_SCOPE: Partial<Unit>[] = [
  { registrationCancellationDate: "2022-03-01", businessRegistrationDate: "2018-03-01", rentalRegistrationDate: "2018-03-01", rentalRegisteredDate: "2018-03-01" },
  { terminationReason: "voluntary", registrationCancellationDate: "2020-09-01" },
  { terminatedRegistrationType: "long_term_general" },
  { rentalAutoTermination: false },
];

describe("V-10 ⑤ 화면", () => {
  it("U-1 ★ 범위 안 → 질문이 보인다 · 범위 밖 → 없다", () => {
    for (const over of IN_SCOPE) {
      render(<RentalUnitCard unit={unit(over)} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
      expect(screen.getByTestId("rental-pre-addenda-demolished-0"), JSON.stringify(over)).toBeTruthy();
      expect(screen.getByTestId("rental-pre-addenda-demolished-hint-0").textContent).toContain("기획재정부 조세정책과-2231");
      cleanup();
    }
    for (const over of OUT_OF_SCOPE) {
      render(<RentalUnitCard unit={unit(over)} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
      expect(screen.queryByTestId("rental-pre-addenda-demolished-0"), JSON.stringify(over)).toBeNull();
      cleanup();
    }
  });
  it("U-2 「예」 → 기한 안내 아래에 말소 특례 미적용 문구", () => {
    render(<RentalUnitCard unit={unit({ preAddendaDemolished: "yes" })} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByTestId("rental-pre-addenda-demolished-fail-0").textContent).toContain("말소 특례를 적용하지 않습니다");
  });
});

describe("V-10 ④ 전송 · ⑧ 차단 · ⑫ 400 — 같은 격자", () => {
  it("A-1 ★ 범위 안 · 미답 → ④ 미전송 · ⑧ 차단 · ⑫ 400", () => {
    for (const over of IN_SCOPE) {
      const u = unit(over);
      expect(rentalUnitPreAddendaDemolitionInScope(u)).toBe(true);
      expect(payload(u).preAddendaDemolished).toBeUndefined();
      expect(String(validate(u))).toContain("2020.8.18. 전에 재건축·재개발 등으로 멸실된 주택인지 선택하세요");
      expect(zodOk(u)).toBe(false);
    }
  });
  it("A-2 ★ 범위 안 · 「예」/「아니오」 → true/false 전송 · ⑧ 통과(이 사유 없음) · ⑫ 통과", () => {
    for (const [ans, wire] of [["yes", true], ["no", false]] as const) {
      const u = unit({ preAddendaDemolished: ans });
      expect(payload(u).preAddendaDemolished).toBe(wire);
      expect(String(validate(u) ?? "")).not.toContain("멸실");
      expect(zodOk(u)).toBe(true);
    }
  });
  it("A-3 범위 밖 · stale 「예」 → ④ 미전송 · ⑧·⑫ 요구 없음", () => {
    for (const over of OUT_OF_SCOPE) {
      const u = unit({ ...over, preAddendaDemolished: "yes" });
      expect(rentalUnitPreAddendaDemolitionInScope(u), JSON.stringify(over)).toBe(false);
      expect(payload(u).preAddendaDemolished).toBeUndefined();
      expect(String(validate(u) ?? "")).not.toContain("멸실");
    }
  });
});
