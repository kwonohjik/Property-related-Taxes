/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) NIT 묶음 1(c01~c03): 표시·문구 정리. 세액 불변.
 *
 *  - R-c01-17 PrintSelectionPanel — `pdfReady` 기본 true: PDF 버튼이 켜지고 사실과 다른 「로그인·저장 후」 안내가 없다.
 *  - R-c03-07 경정청구 카드 — 환급가산금 이율·청구기한 기간이 법령 상수(`REFUND_GAIN_RATE_ANNUAL` 등)에서 온다.
 *  - R-c03-10 환급 0원 안내에 「경정청구 실익」 판단 문구가 없다.
 *  - R-c03-12 공매·경락 카드 — 두 후보가 같은 금액이면 두 행 모두 「동일 금액」임을 적는다(아니면 적지 않는다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { TRANSFER_PRINT_SECTIONS, flattenPrintSectionIds } from "@/lib/print/transfer-print-sections";

afterEach(cleanup);

describe("R-c01-17 PrintSelectionPanel pdfReady 기본값", () => {
  it("pdfReady 미지정 + onPrintPdf → PDF 버튼 활성(항목 선택 시) · 「로그인·저장 후」 안내 없음", () => {
    const ids = new Set(flattenPrintSectionIds(TRANSFER_PRINT_SECTIONS));
    const { container } = render(
      <PrintSelectionPanel
        allGroups={TRANSFER_PRINT_SECTIONS}
        selectedIds={ids}
        availableIds={ids}
        onChange={() => {}}
        onPrintPdf={() => {}}
      />,
    );
    const pdfBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("선택 항목 PDF"));
    expect(pdfBtn).toBeTruthy();
    expect(container.textContent).not.toContain("로그인·저장 후");
    expect(container.textContent).not.toContain("로그인 후");
  });
});

describe("R-c03-07·10 AmendmentResultCard", () => {
  const detail = {
    correctionKind: "refund_claim",
    refundTax: 0,
    originalDeterminedTax: 1_000,
    amendedDeterminedTax: 1_000,
    claimDeadline: "2030-01-01",
    claimReasonType: "posterior",
    steps: [],
  } as never;

  it("환급 0원 안내 — 「경정청구 실익」 판단 문구 없음 · 이율·후발적 기간은 상수 값", () => {
    const { container } = render(<AmendmentResultCard detail={detail} fullTotalTax={1_000} />);
    const text = container.textContent ?? "";
    expect(text).toContain("환급액 없음 — 경정 결정세액이 당초 결정세액 이상입니다.");
    expect(text).not.toContain("실익");
    expect(text).toContain("청구기한 (후발적 3개월)");
    expect(text).toContain("연 3.1%)");
  });
});

describe("R-c03-12 AuctionValuationCard 동률", () => {
  const mk = (standardTotal: number, auctionPrice: number) => ({
    standardTotal,
    auctionPrice,
    chosen: Math.min(standardTotal, auctionPrice),
    denominator: Math.min(standardTotal, auctionPrice),
  });

  it("두 금액이 같으면 두 행 모두 「동일 금액」", () => {
    const { container } = render(<AuctionValuationCard detail={mk(420_000_000, 420_000_000)} />);
    expect(container.textContent?.match(/← 적용\(최솟값 · 동일 금액\)/g)).toHaveLength(2);
  });

  it("금액이 다르면 한 행만 「적용」 · 「동일 금액」 없음", () => {
    const { container } = render(<AuctionValuationCard detail={mk(500_000_000, 420_000_000)} />);
    expect(container.textContent?.match(/← 적용\(최솟값\)/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("동일 금액");
  });
});
