/**
 * 화면 ↔ PDF parity anchor — 상장주식 평가조서(갑·을).
 *
 * 화면(Page1CoverSection·Page2DailyClosingTable)과 PDF(ListedStockBesshiPdfDocument)가
 * 동일 단일출처(listed-besshi-constants.ts + result.besshiData)를 사용함을 검증.
 *
 * 본 anchor는 react-pdf를 실제 렌더하지 않고(jsdom 제약), 양쪽 컴포넌트가 동일 데이터를
 * 받아 동일 라벨/숫자를 표시한다는 점만 화면 렌더로 검증.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Page1CoverSection } from "@/components/calc/inheritance/listed-stock/besshi/Page1CoverSection";
import { Page2DailyClosingTable } from "@/components/calc/inheritance/listed-stock/besshi/Page2DailyClosingTable";
import {
  LS_P1_LABELS,
  LS_P2_HEADERS,
} from "@/components/calc/inheritance/listed-stock/besshi/listed-besshi-constants";
import type { ListedStockBesshiData } from "@/lib/tax-engine/types/listed-stock-valuation.types";

const SAMPLE: ListedStockBesshiData = {
  page1: {
    companyName: "H사",
    representative: "김○○",
    companyAddress: "서울시 종로구 청운동",
    valuationDate: "2022-07-06",
    stockClass: "common",
    listingDate: "2010-01-15",
    isUnlistedShareSection: false,
  },
  page1Values: {
    closingAvg: 8452,
    perShareMajorShareholder: 8452,
    majorShareholderRate: 0,
  },
  page2: {
    beforeM1: [
      { no: 1, date: "2022-07-06", monthDay: "07월 06일", closing: 8360, label: "" },
    ],
    beforeM2: [
      { no: 1, date: "2022-06-05", monthDay: "06월 05일", closing: null, label: "일요일" },
    ],
    afterM1: [
      { no: 1, date: "2022-07-06", monthDay: "07월 06일", closing: 8360, label: "" },
    ],
    afterM2: [
      { no: 1, date: "2022-08-06", monthDay: "08월 06일", closing: null, label: "토요일" },
    ],
    beforeSubtotal: 350490,
    afterSubtotal: 359540,
    tradingDays: 84,
    closingSum: 710030,
    closingAverage: 8452,
  },
};

describe("화면 ↔ PDF 단일출처 라벨 정합 (constants 공유)", () => {
  it("Page1CoverSection은 LS_P1_LABELS 라벨을 사용", () => {
    const { getByTestId, container } = render(<Page1CoverSection besshi={SAMPLE} />);
    // ⑨ 값 8,452 (단일 출처 echo)
    expect(getByTestId("ls-besshi-p1-⑨").textContent).toContain("8,452");
    // ⑩ 값 = ⑨ (할증 0%) — 단일 source
    expect(getByTestId("ls-besshi-p1-⑩").textContent).toContain("8,452");
    // 갑지 제목
    expect(container.textContent).toContain(LS_P1_LABELS.formTitle);
  });

  it("Page2DailyClosingTable은 LS_P2_HEADERS 라벨 + page2 echo 값을 사용", () => {
    const { getByTestId, container } = render(<Page2DailyClosingTable page2={SAMPLE.page2} />);
    expect(container.textContent).toContain(LS_P2_HEADERS.formTitle);
    expect(container.textContent).toContain(LS_P2_HEADERS.leftGroupHeader);
    expect(container.textContent).toContain(LS_P2_HEADERS.rightGroupHeader);
    // 소계·일수·합계·평균 4행 — 단일 source 검증
    expect(getByTestId("ls-besshi-p2-subtotal-before").textContent).toContain("350,490");
    expect(getByTestId("ls-besshi-p2-subtotal-after").textContent).toContain("359,540");
    expect(getByTestId("ls-besshi-p2-tradingDays").textContent).toContain("84");
    expect(getByTestId("ls-besshi-p2-sum").textContent).toContain("710,030");
    expect(getByTestId("ls-besshi-p2-avg").textContent).toContain("8,452");
  });
});

describe("PDF 컴포넌트 import 검증 — react-pdf Document 객체 생성 가능", () => {
  it("ListedStockBesshiPdfDocument import 시 throw 없음", async () => {
    // 동적 import — jsdom 환경에서도 모듈 로드만 검증 (실제 렌더는 skip)
    const mod = await import("@/lib/pdf/ListedStockBesshiPdfDocument");
    expect(mod.ListedStockBesshiPdfDocument).toBeDefined();
    expect(typeof mod.ListedStockBesshiPdfDocument).toBe("function");
  });
});
