/**
 * @vitest-environment jsdom
 *
 * Besshi1FormTable — 별지 제1호서식(가업상속공제신고서) 인적사항·수량/단가 셀 바인딩 RTL anchor
 * Plan: docs/00-pm/inheritance-besshi1-family-business-autofill.plan.md (Phase 1+2)
 *
 * 빌더(buildBesshi1Data) anchor가 데이터 도출을 검증하므로, 본 테스트는 FormTable이
 * Besshi1Data.* 를 실제 셀(testid)에 바인딩하는지(이전 &nbsp; 하드코딩 → 값) 검증.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Besshi1FormTable } from "@/components/calc/inheritance/deduction-besshi/Besshi1FormTable";
import type { Besshi1Data } from "@/lib/calc/deduction-besshi-data";

afterEach(cleanup);

const data: Besshi1Data = {
  businessName: "M 주식회사",
  bizNo: "123-45-67890",
  representativeName: "대표갑",
  residentId: "550101-1000000",
  openDate: "2000-03-15",
  industry: "제조업",
  isSme: true,
  isMedium: false,
  isListed: false,
  avgRevenue3Y: 10_000_000_000,
  operatingYears: 25,
  isMajorShareholder: true,
  decedentName: "홍피상",
  decedentResidentId: "350303-1000000",
  ceoTenure: "20년",
  shareRatio: "60%",
  heirName: "김배우",
  heirResidentNumber: "600202-2000000",
  heirEngagement: "5년",
  officerAppointDate: "2023-09-30",
  assetRows: [
    { kindLabel: "법인 주식", quantity: "10,000주", unitPrice: 50_000, amount: 500_000_000, note: "M 주식회사" },
  ],
  declaredAmount: 500_000_000,
  appliedCap: 40_000_000_000,
};

describe("Besshi1FormTable — 인적사항·수량/단가 셀 바인딩", () => {
  it("가 상호 · 다 피상속인 · 라 가업상속인 · 마 수량/단가가 셀에 표시", () => {
    render(<Besshi1FormTable data={data} />);
    expect(screen.getByTestId("b1-가-상호").textContent).toBe("M 주식회사");
    expect(screen.getByTestId("b1-다-성명").textContent).toBe("홍피상");
    expect(screen.getByTestId("b1-다-주민번호").textContent).toBe("350303-1000000");
    expect(screen.getByTestId("b1-라-성명").textContent).toBe("김배우");
    expect(screen.getByTestId("b1-라-주민번호").textContent).toBe("600202-2000000");
    expect(screen.getByTestId("b1-마-row-0-qty").textContent).toBe("10,000주");
    expect(screen.getByTestId("b1-마-row-0-unit").textContent).toContain("50,000");
    expect(screen.getByTestId("b1-마-row-0-amount").textContent).toContain("500,000,000");
  });

  it("Phase 3 — 가 사업자번호·대표자·개업일·업종 / 다 재직기간·지분율 / 라 종사기간·취임일 셀 표시", () => {
    render(<Besshi1FormTable data={data} />);
    expect(screen.getByTestId("b1-가-사업자번호").textContent).toBe("123-45-67890");
    expect(screen.getByTestId("b1-가-대표자").textContent).toBe("대표갑");
    expect(screen.getByTestId("b1-가-대표자주민번호").textContent).toBe("550101-1000000");
    expect(screen.getByTestId("b1-가-개업일").textContent).toBe("2000-03-15");
    expect(screen.getByTestId("b1-가-업종").textContent).toBe("제조업");
    expect(screen.getByTestId("b1-다-재직기간").textContent).toBe("20년");
    expect(screen.getByTestId("b1-다-지분율").textContent).toBe("60%");
    expect(screen.getByTestId("b1-라-종사기간").textContent).toBe("5년");
    expect(screen.getByTestId("b1-라-취임일").textContent).toBe("2023-09-30");
  });

  it("값 미입력 시 빈 칸 — undefined 필드는 공백(크래시 없음)", () => {
    const empty: Besshi1Data = {
      operatingYears: 10,
      assetRows: [{ kindLabel: "법인 주식", amount: 100_000_000 }],
      declaredAmount: 100_000_000,
    };
    render(<Besshi1FormTable data={empty} />);
    expect(screen.getByTestId("b1-다-성명").textContent?.trim()).toBe("");
    expect(screen.getByTestId("b1-라-주민번호").textContent?.trim()).toBe("");
    expect(screen.getByTestId("b1-마-row-0-qty").textContent?.trim()).toBe("");
  });
});
