/**
 * ⑤ RentalExclusion8NaFields — 칸 표시가 ⑧·④와 같은 술어(na8Asks)를 따르는지, 조정대상지역 자동 판정 문구.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RentalExclusion8NaFields } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import { makeProperty, useComprehensiveWizardStore, defaultFormData } from "@/lib/stores/comprehensive-wizard-store";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

const prop = (over: Partial<PropertyEntry>): PropertyEntry => ({
  ...makeProperty(),
  exclusionType: "private_purchase_rental_long",
  rentalRegistrationType: "private_purchase_long",
  rentalRegistrationDate: "2020-01-10",
  ...over,
});
const show = (p: PropertyEntry, type = "private_purchase_long") =>
  render(<RentalExclusion8NaFields property={p} registrationType={type} onUpdate={() => {}} />);

describe("RentalExclusion8NaFields", () => {
  afterEach(cleanup);
  beforeEach(() => {
    useComprehensiveWizardStore.setState({
      formData: { ...defaultFormData, assessmentYear: "2026", taxpayerType: "individual" },
    } as never);
  });

  it("개인 8호: 취득일·변경신고 칸 · 취득 전엔 보유 주택 칸 없음", () => {
    show(prop({}));
    expect(screen.getByTestId("comprehensive-8na-acquisition-date")).toBeTruthy();
    expect(screen.getByTestId("comprehensive-8na-converted")).toBeTruthy();
    expect(screen.queryByTestId("comprehensive-8na-household-owned")).toBeNull();
    expect(screen.queryByTestId("comprehensive-8na-business-application-date")).toBeNull();
  });

  it("2021 취득·보유 → 조정대상지역 자동 판정 문구(광진구 재지정 공고일)", () => {
    show(prop({ rentalAcquisitionDate: "2021-03-01", householdOwnedAtAcquisition: "yes", pnu: "1121510500100010000" }));
    expect(screen.getByTestId("comprehensive-8na-household-owned")).toBeTruthy();
    expect(screen.getByTestId("comprehensive-8na-regulated").textContent).toContain("공고일 2025-10-16");
  });

  it("법인 8호: 세무서 신청일 칸 · 취득일 칸 없음", () => {
    useComprehensiveWizardStore.setState({
      formData: { ...defaultFormData, assessmentYear: "2026", taxpayerType: "corporate" },
    } as never);
    show(prop({ rentalRegistrationDate: "2021-03-10" }));
    expect(screen.getByTestId("comprehensive-8na-business-application-date")).toBeTruthy();
    expect(screen.queryByTestId("comprehensive-8na-acquisition-date")).toBeNull();
    expect(screen.getByTestId("comprehensive-8na-apartment")).toBeTruthy();
  });

  it("8호·7호 밖 유형(공공매입)은 아무것도 그리지 않는다", () => {
    const { container } = show(prop({ rentalRegistrationType: "public_purchase" }), "public_purchase");
    expect(container.innerHTML).toBe("");
  });
});
