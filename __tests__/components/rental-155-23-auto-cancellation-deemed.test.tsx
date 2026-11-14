/**
 * @vitest-environment jsdom
 *
 * G-8 ⑤ — 말소일 칸이 말소 사유에 따라 무엇을 묻는지 · 2020.8.18. 전 자동말소 종료일 간주 기한 표시
 * (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` PR-1 · 엔진 anchor `rental-155-23-auto-cancellation-deemed.anchor.test.ts`).
 *
 * | # | 주장 |
 * |---|---|
 * | U-1 | 자동말소 → 라벨 「임대의무기간 종료일」 · hint 「등록증 말소 처리일이 아니라」 |
 * | U-2 | 자진말소 → 라벨 「말소 신청으로 등록이 말소된 날」 |
 * | U-3 | 자동말소 · 단기 · 종료일 2019-05-01 → 간주 문구 + 기한 2025-08-18(엔진과 같은 날) · rose 문구 없음 |
 * | U-4 | 자진말소 · 2019-05-01 → 간주 없음 · rose 「대상 아님」 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

const base: Unit = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2015-05-01",
  rentalRegistrationDate: "2015-05-01",
  rentalAutoTermination: true,
  terminatedRegistrationType: "short_term",
};

const renderCard = (unit: Unit, transferDate?: string) =>
  render(
    <RentalUnitCard unit={unit} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} transferDate={transferDate} />,
  );

describe("G-8 ⑤ 말소일 칸", () => {
  it("U-1 자동말소 → 임대의무기간 종료일을 묻는다", () => {
    renderCard({ ...base, terminationReason: "auto" });
    expect(screen.getByText("등록 말소일(임대의무기간 종료일)")).toBeTruthy();
    expect(screen.getByTestId("rental-cancellation-date-hint-0").textContent).toContain("등록증에 적힌 말소 처리일이 아니라");
  });

  it("U-2 자진말소 → 등록이 말소된 날을 묻는다", () => {
    renderCard({ ...base, terminationReason: "voluntary" });
    expect(screen.getByText("등록 말소일(말소 신청으로 등록이 말소된 날)")).toBeTruthy();
  });

  it("U-3 자동말소 · 단기 · 2019-05-01 → 2020.8.18. 간주 기한 2025-08-18", () => {
    renderCard({ ...base, terminationReason: "auto", registrationCancellationDate: "2019-05-01" }, "2025-06-01");
    const d = screen.getByTestId("rental-cancellation-deadline-0");
    expect(d.textContent).toContain("2025-08-18");
    expect(d.textContent).toContain("기한 안입니다");
    expect(screen.getByTestId("rental-cancellation-deemed-0").textContent).toContain("부칙 제7조");
    expect(d.textContent).not.toContain("말소 특례 대상이 아닙니다");
  });

  it("U-4 자진말소 · 2019-05-01 → 간주 없음 · 대상 아님", () => {
    renderCard({ ...base, terminationReason: "voluntary", registrationCancellationDate: "2019-05-01" }, "2024-03-01");
    expect(screen.queryByTestId("rental-cancellation-deemed-0")).toBeNull();
    expect(screen.getByTestId("rental-cancellation-deadline-0").textContent).toContain("말소 특례 대상이 아닙니다");
  });
});
