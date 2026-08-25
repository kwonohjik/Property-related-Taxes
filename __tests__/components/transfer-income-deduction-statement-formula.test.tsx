/**
 * 3단계 상세명세 「소득금액 감면대상」 행 — 값 인라인 산식 anchor (PR-3 · D-1·D-2·D-4)
 *
 * 제보(2026-08-25): §99의2 감면을 입력했는데 3단계 행에 값이 없는 일반 문구만 나왔다.
 *   「양도소득금액 × (5년시점 − 취득시 공시가격)/(양도시 − 취득시 공시가격)」
 * 종전에는 §99의3만 값 인라인 빌더를 썼고 나머지 소득금액차감 조문은 상수 JSX로 갔다.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildIncomeDeductionReducibleFormula,
  type IncomeDeductionFormulaSource,
} from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";

/** ReactNode(문자열 또는 엘리먼트)를 공백 정규화된 텍스트로 만든다. */
function text(node: unknown): string {
  if (typeof node === "string") return node.replace(/\s+/g, " ");
  return renderToStaticMarkup(node as React.ReactElement)
    .replace(/<[^>]*>/g, " ")
    .replace(/&minus;/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}

/** 제보 케이스 실측값 — 취득 121,191,049 / 5년 112,969,780 / 양도 126,887,420 (neg_pos) */
const REPORTED: IncomeDeductionFormulaSource = {
  articleLabel: "§99의2",
  isWithin5Years: false,
  reducibleTransferIncome: 0,
  transferIncomeApplied: 11_210_000,
  standardPriceAtAcquisition: 121_191_049,
  standardPriceAt5Years: 112_969_780,
  standardPriceAtTransfer: 126_887_420,
  signCase: "neg_pos",
};

describe("D-1·D-4 제보 케이스 — 감면 0이어도 값과 사유를 보인다", () => {
  it("실제 기준시가 3개가 산식에 대입된다", () => {
    const t = text(buildIncomeDeductionReducibleFormula(REPORTED, 11_210_000));
    expect(t).toContain("양도소득금액 11,210,000");
    expect(t).toContain("112,969,780");
    expect(t).toContain("121,191,049");
    expect(t).toContain("126,887,420");
  });

  it("분자·분모의 차액까지 계산되어 보인다", () => {
    const t = text(buildIncomeDeductionReducibleFormula(REPORTED, 11_210_000));
    expect(t).toContain("-8,221,269"); // 112,969,780 − 121,191,049
    expect(t).toContain("5,696,371"); // 126,887,420 − 121,191,049
  });

  it("🔴 0인 사유가 함께 표시된다 (결과만 0이면 왜 0인지 알 수 없다)", () => {
    const t = text(buildIncomeDeductionReducibleFormula(REPORTED, 11_210_000));
    expect(t).toContain("= 0");
    expect(t).toContain("5년이 되는 날의 기준시가가 취득 당시 기준시가보다 낮아");
    expect(t).toContain("§99의2");
  });
});

describe("D-1 정상 안분·전액 차감", () => {
  it("정상 안분(all_positive)은 결과값까지 산식에 들어간다", () => {
    const t = text(
      buildIncomeDeductionReducibleFormula(
        {
          articleLabel: "§98의7",
          isWithin5Years: false,
          reducibleTransferIncome: 50_000_000,
          transferIncomeApplied: 100_000_000,
          standardPriceAtAcquisition: 200_000_000,
          standardPriceAt5Years: 300_000_000,
          standardPriceAtTransfer: 400_000_000,
        },
        100_000_000,
      ),
    );
    expect(t).toContain("양도소득금액 100,000,000");
    expect(t).toContain("100,000,000"); // 분자 300,000,000 − 200,000,000
    expect(t).toContain("200,000,000"); // 분모 400,000,000 − 200,000,000
    expect(t).toContain("= 50,000,000");
    expect(t).toContain("§98의7");
  });

  it("5년 이내 양도는 전액 차감으로 서술된다", () => {
    const t = text(
      buildIncomeDeductionReducibleFormula(
        {
          articleLabel: "§99",
          isWithin5Years: true,
          reducibleTransferIncome: 30_000_000,
          transferIncomeApplied: 30_000_000,
        },
        30_000_000,
      ),
    );
    expect(t).toContain("30,000,000 전액 차감");
    expect(t).toContain("5년 이내");
  });
});

describe("D-3 §99 재개발 변형 — 분모가 종전주택 취득시 기준시가", () => {
  it("분모 라벨과 값이 종전주택 기준으로 바뀐다", () => {
    const t = text(
      buildIncomeDeductionReducibleFormula(
        {
          articleLabel: "§99",
          isWithin5Years: false,
          reducibleTransferIncome: 25_000_000,
          transferIncomeApplied: 100_000_000,
          standardPriceAtAcquisition: 200_000_000,
          standardPriceAt5Years: 250_000_000,
          standardPriceAtTransfer: 400_000_000,
          previousHouseStdPriceApplied: 200_000_000,
        },
        100_000_000,
      ),
    );
    expect(t).toContain("종전주택 취득시 200,000,000");
  });
});

describe("🔴 구별력 — echo 없는 구 저장 이력", () => {
  it("기준시가가 없으면 값 없는 문구로 fallback한다", () => {
    const t = text(
      buildIncomeDeductionReducibleFormula(
        {
          articleLabel: "§99의2",
          isWithin5Years: false,
          reducibleTransferIncome: 0,
        },
        11_210_000,
      ),
    );
    expect(t).toContain("감면 대상 없음");
    expect(t).not.toContain("기준시가 112,969,780");
  });
});
