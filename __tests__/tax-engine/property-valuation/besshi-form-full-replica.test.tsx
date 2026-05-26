/**
 * @vitest-environment jsdom
 *
 * 별지 제4호 부표3 PDF 완전 재현 — anchor 13건
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md
 *
 * 사례 6 PDF anchor (PDF page 7~9 / 별지 제1·2·4·5·6쪽):
 *   - 제1쪽 3.1주당 가액 ⑥=10,910 / ⑨=13,092 / 총 340,392,000
 *   - 제2쪽 4.순자산가액 ⑧=2,503,037,370 / ⑲=2,013,685,670 / 마=489,351,700
 *   - 제4쪽 5.평가차액 ① 합계=107,324,150 / ② 합계=15,775,800
 *   - 제5쪽 6.영업권 가=58,341,511 / 마=48,935,170 / 자=0
 *   - 제6쪽 7.순손익액 차=11,660
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BesshiForm4Buppyo3PrintView } from "@/components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetOnlyReason,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

// 사례 6 입력 (case-5a-integration.test.ts 동일 — single source)
const case6Input: UnlistedStockValuationInput = {
  corpName: "㈜향기",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2024-01-20"),
  faceValuePerShare: 5_000,
  totalShares: 50_000,
  ownedShares: 26_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 2_476_889_520,
    assetValuationDelta: 91_548_350,
    corpTaxReservedAmount: 0,
    paidInCapitalIncrease: 0,
    otherEarnedRights: 0,
    prepaidExpenses: 65_400_500,
    preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 1_833_780_000,
    corporateTaxPayable: 32_627_890,
    farmingSurtax: 0,
    localIncomeTax: 3_262_780,
    dividendPayable: 0,
    retirementProvision: 445_785_000,
    otherProvision: 0,
    reserveExcluded: 0,
    allowanceExcluded: 301_770_000,
    deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: true,
  companySize: "large",
};

function expand(): void {
  // 토글 펼치기 — 양식 인쇄 미리보기 버튼 (data-testid 강제)
  fireEvent.click(screen.getByTestId("besshi-form-toggle"));
}

// ============================================================
// F-1: 사례 6 4축 일치 (testid 동결 + 숫자 텍스트)
// ============================================================

describe("[F-1] 사례 6 — 4축 1:1 재현", () => {
  it("제1쪽 셀번호 testid + 사례 6 anchor", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(screen.getByTestId("p1-③")).toHaveTextContent("489,351,700");
    expect(screen.getByTestId("p1-⑥")).toHaveTextContent("10,910");
    expect(screen.getByTestId("p1-⑨")).toHaveTextContent("13,092");
    expect(screen.getByTestId("p1-총")).toHaveTextContent("340,392,000");
  });

  it("제2쪽 자산총액·부채총액·다·라·마", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(screen.getByTestId("p2-①")).toHaveTextContent("2,476,889,520");
    expect(screen.getByTestId("p2-②")).toHaveTextContent("91,548,350");
    expect(screen.getByTestId("p2-⑥")).toHaveTextContent("65,400,500");
    expect(screen.getByTestId("p2-⑧")).toHaveTextContent("2,503,037,370");
    expect(screen.getByTestId("p2-⑨")).toHaveTextContent("1,833,780,000");
    expect(screen.getByTestId("p2-⑩")).toHaveTextContent("32,627,890");
    expect(screen.getByTestId("p2-⑭")).toHaveTextContent("445,785,000");
    expect(screen.getByTestId("p2-⑰")).toHaveTextContent("301,770,000");
    expect(screen.getByTestId("p2-⑲")).toHaveTextContent("2,013,685,670");
    expect(screen.getByTestId("p2-다")).toHaveTextContent("489,351,700");
    expect(screen.getByTestId("p2-라")).toHaveTextContent("0");
    expect(screen.getByTestId("p2-마")).toHaveTextContent("489,351,700");
  });

  it("제5쪽 영업권 가~자 9행", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(screen.getByTestId("p5-가")).toHaveTextContent("58,341,511");
    expect(screen.getByTestId("p5-가-①")).toHaveTextContent("76,842,660");
    expect(screen.getByTestId("p5-가-②")).toHaveTextContent("62,416,500");
    expect(screen.getByTestId("p5-가-③")).toHaveTextContent("5,311,910"); // △ 표기 포함
    expect(screen.getByTestId("p5-나")).toHaveTextContent("29,170,755");
    expect(screen.getByTestId("p5-다")).toHaveTextContent("489,351,700");
    expect(screen.getByTestId("p5-라")).toHaveTextContent("10");
    expect(screen.getByTestId("p5-마")).toHaveTextContent("48,935,170");
    expect(screen.getByTestId("p5-바")).toHaveTextContent("5");
    expect(screen.getByTestId("p5-사")).toHaveTextContent("0");
    expect(screen.getByTestId("p5-아")).toHaveTextContent("0");
    expect(screen.getByTestId("p5-자")).toHaveTextContent("0");
  });
});

// ============================================================
// F-2a~d: §55③ 영업권 자동배제 4종 badge
// ============================================================

describe("[F-2] §55③ 영업권 자동배제 4종 badge", () => {
  it("F-2a: liquidation (1호 청산) badge", () => {
    const input = { ...case6Input, netAssetOnlyReason: "liquidation" as const };
    render(<BesshiForm4Buppyo3PrintView input={input} />);
    expand();
    expect(screen.getByTestId("p5-excluded-badge")).toHaveTextContent(/청산절차 진행/);
  });

  it("F-2b: real_estate_80 (2호 본문 부동산 80%) badge", () => {
    const input = { ...case6Input, isRealEstateHeavy: true, netAssetOnlyReason: "real_estate_80" as const };
    render(<BesshiForm4Buppyo3PrintView input={input} />);
    expand();
    expect(screen.getByTestId("p5-excluded-badge")).toHaveTextContent(/부동산 80%/);
  });

  it("F-2c: lt3y (2호 단서 사업 3년 미만·휴폐업) badge", () => {
    const input = { ...case6Input, netAssetOnlyReason: "lt3y" as const };
    render(<BesshiForm4Buppyo3PrintView input={input} />);
    expand();
    expect(screen.getByTestId("p5-excluded-badge")).toHaveTextContent(/사업개시 3년 미만/);
  });

  it("F-2d: continuous_loss_3y (3호 직전 3년 결손) badge", () => {
    const input = { ...case6Input, isContinuousLossLastThreeYears: true };
    render(<BesshiForm4Buppyo3PrintView input={input} />);
    expand();
    expect(screen.getByTestId("p5-excluded-badge")).toHaveTextContent(/직전 3년 계속 결손/);
  });
});

// ============================================================
// F-3: 영업권 > 0 시나리오
// ============================================================

describe("[F-3] 영업권 > 0 시나리오", () => {
  it("가-마 > 0 + 자동배제 없음 → 자.영업권 > 0 표시", () => {
    // 사례 가공: 순손익 매우 큰 케이스 → 가 가중평균이 마(자기자본×10%)보다 큼
    const input: UnlistedStockValuationInput = {
      ...case6Input,
      fiscalYears: [
        { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 500_000_000 },
      ],
    };
    render(<BesshiForm4Buppyo3PrintView input={input} />);
    expand();
    const goodwill = screen.getByTestId("p5-자").textContent || "";
    const goodwillNum = parseInt(goodwill.replace(/[^0-9-]/g, ""), 10);
    expect(goodwillNum).toBeGreaterThan(0);
  });
});

// ============================================================
// F-4·F-5·F-6: 자기일관성 anchor (tolerance ≤ 1원)
// ============================================================

describe("[F-4·F-5·F-6] Page2 자기일관성", () => {
  function parseAmount(testid: string): number {
    // 마지막 2개 td(차감·가산 금액 컬럼) 중 비어있지 않은 셀 파싱
    // — 라벨에 포함된 숫자(예: "제5쪽 6.자") 제외
    const row = screen.getByTestId(testid);
    const cells = row.querySelectorAll("td");
    // 뒤에서 두 칸을 비교 — 비어있지 않은 셀이 금액
    const amountCells = Array.from(cells).slice(-2);
    let text = "";
    for (const cell of amountCells) {
      const t = cell.textContent?.trim() || "";
      if (t.length > 0) {
        text = t;
        break;
      }
    }
    const isNegative = text.includes("△");
    const num = parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
    return isNegative ? -num : num;
  }

  it("F-4: 자산총액 ⑧ === (①+②+③+④+⑤) − (⑥+⑦), tolerance ≤ 1원", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    const sum =
      (parseAmount("p2-①") + parseAmount("p2-②") + parseAmount("p2-③") +
        parseAmount("p2-④") + parseAmount("p2-⑤")) -
      (parseAmount("p2-⑥") + parseAmount("p2-⑦"));
    expect(Math.abs(parseAmount("p2-⑧") - sum)).toBeLessThanOrEqual(1);
  });

  it("F-5: 부채총액 ⑲ === (⑨+⑩+⑪+⑫+⑬+⑭) − (⑮+⑯+⑰+⑱), tolerance ≤ 1원", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    const sum =
      (parseAmount("p2-⑨") + parseAmount("p2-⑩") + parseAmount("p2-⑪") +
        parseAmount("p2-⑫") + parseAmount("p2-⑬") + parseAmount("p2-⑭")) -
      (parseAmount("p2-⑮") + parseAmount("p2-⑯") + parseAmount("p2-⑰") + parseAmount("p2-⑱"));
    expect(Math.abs(parseAmount("p2-⑲") - sum)).toBeLessThanOrEqual(1);
  });

  it("F-6: 마 === 다 + 라 (사례 6)", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(parseAmount("p2-마")).toBe(parseAmount("p2-다") + parseAmount("p2-라"));
  });
});

// ============================================================
// F-7: 가중평균 산식 자기일관성
// ============================================================

describe("[F-7] 영업권 가 = 가중평균 산식", () => {
  it("가 = floor((①×3 + ②×2 + ③×1) / 6), tolerance ≤ 1원", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    const expected = Math.floor((76_842_660 * 3 + 62_416_500 * 2 + -5_311_910 * 1) / 6);
    // 마지막 td(금액 컬럼)만 파싱 — 라벨 "(① ×3 + ② ×2 + ③ ×1) ÷ 6" 숫자 제외
    const row = screen.getByTestId("p5-가");
    const cells = row.querySelectorAll("td");
    const lastCell = cells[cells.length - 1];
    const text = lastCell?.textContent || "";
    const actual = parseInt(text.replace(/[^0-9]/g, ""), 10);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
    expect(expected).toBe(58_341_511);
  });
});

// ============================================================
// F-8·F-9: 사례 1·5 회귀 smoke test (별지 양식 컴포넌트가 다른 시나리오 입력에 정상 렌더)
// ============================================================

describe("[F-8] 사례 1 회귀 — 순손익가치만 시나리오", () => {
  it("자본금 변동 없는 3년 사업연도 — 컴포넌트 정상 렌더", () => {
    const case1Input: UnlistedStockValuationInput = {
      corpName: "△△기계(주)",
      businessStartDate: new Date("2001-03-01"),
      evaluationDate: new Date("2022-06-30"),
      faceValuePerShare: 5_000,
      totalShares: 180_000,
      ownedShares: 100_000,
      isRealEstateHeavy: false,
      fiscalYears: [
        { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 120_000_000 },
        { fiscalYearLabel: "2020", fiscalYearEndDate: new Date("2020-12-31"), taxableIncome: 110_000_000 },
        { fiscalYearLabel: "2019", fiscalYearEndDate: new Date("2019-12-31"), taxableIncome: 80_000_000 },
      ],
      capitalChanges: [],
      netAssetValueRaw: {
        bsTotalAssets: 1_000_000_000,
        assetValuationDelta: 0,
        corpTaxReservedAmount: 0,
        paidInCapitalIncrease: 0,
        otherEarnedRights: 0,
        prepaidExpenses: 0,
        preGiftRetainedEarnings: 0,
        bsTotalLiabilities: 500_000_000,
        corporateTaxPayable: 0,
        farmingSurtax: 0,
        localIncomeTax: 0,
        dividendPayable: 0,
        retirementProvision: 0,
        otherProvision: 0,
        reserveExcluded: 0,
        allowanceExcluded: 0,
        deferredTaxAdjustment: 0,
      },
      isContinuousLossLastThreeYears: false,
      capitalizationRate: 0.10,
      isMaxShareholder: false,
      companySize: "large",
    };
    render(<BesshiForm4Buppyo3PrintView input={case1Input} />);
    expand();
    // 별지 양식이 정상 렌더 — 제1쪽 발행주식 + 제2쪽 자산총액 ⑧ + 제5쪽 영업권 자
    expect(screen.getByTestId("p1-①")).toHaveTextContent("180,000주");
    expect(screen.getByTestId("p2-⑧")).toBeInTheDocument();
    expect(screen.getByTestId("p5-자")).toBeInTheDocument();
  });
});

describe("[F-9] 사례 5 회귀 — 최대주주 중소기업 할증배제 시나리오", () => {
  it("companySize=small + isMaxShareholder=true → ⑦ 표시·⑧ 미표시", () => {
    const case5Input: UnlistedStockValuationInput = {
      ...case6Input,
      isMaxShareholder: true,
      companySize: "small", // 중소기업 → 할증 ×100% (배제)
    };
    render(<BesshiForm4Buppyo3PrintView input={case5Input} />);
    expand();
    // 중소기업 할증배제 → ⑦(비최대주주) 표시 분기. premiumRate = 0
    // (Page1CoverSection: premiumRate > 0 ? ⑧ : ⑦)
    expect(screen.queryByTestId("p1-⑧")).not.toBeInTheDocument();
    expect(screen.getByTestId("p1-⑦")).toBeInTheDocument();
  });
});

// ============================================================
// F-10: print page-break 4곳 존재 (DOM-only, jsdom 한계)
// ============================================================

describe("[F-10] print:break-before-page 4곳", () => {
  it("DOM에 break-before-page 노드 4개", () => {
    const { container } = render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    const breakNodes = container.querySelectorAll('[class*="break-before-page"]');
    expect(breakNodes.length).toBe(4);
  });
});

// ============================================================
// AC-6: 제1쪽 2번 §54④ 6행 체크박스 (2025.07.10 양식)
// ============================================================

describe("[AC-6] 제1쪽 2번 순자산만평가 6행 체크박스", () => {
  const reasons: [UnlistedNetAssetOnlyReason, string][] = [
    ["liquidation", "가"],
    ["lt3y", "나"],
    ["real_estate_80", "라"],
    ["stock_holding_80", "마"],
    ["remaining_3y", "바"],
  ];

  it.each(reasons)("%s 선택 → %s행 [v]", (reason, code) => {
    render(<BesshiForm4Buppyo3PrintView input={{ ...case6Input, netAssetOnlyReason: reason }} />);
    expand();
    expect(screen.getByTestId(`p1-2-${code}`)).toHaveTextContent("[v]");
  });

  it("다(2018.2.13. 삭제)행은 항상 '—'", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(screen.getByTestId("p1-2-다")).toHaveTextContent("—");
  });

  it("사유 미선택(undefined)에도 6행 상시 표시 — 활성행 [ ]", () => {
    render(<BesshiForm4Buppyo3PrintView input={case6Input} />);
    expand();
    expect(screen.getByTestId("p1-2-가")).toHaveTextContent("[ ]");
    expect(screen.getByTestId("p1-2-바")).toHaveTextContent("[ ]");
  });
});

// ============================================================
// AC-9: 제1쪽 1번 사업자등록번호·자본금 (C-9)
// ============================================================

describe("[AC-9] 제1쪽 1번 사업자번호·자본금 표시", () => {
  it("입력값 표시", () => {
    render(
      <BesshiForm4Buppyo3PrintView
        input={{ ...case6Input, businessRegistrationNumber: "123-45-67890", capital: 250_000_000 }}
      />,
    );
    expand();
    expect(screen.getByTestId("p1-①")).toHaveTextContent("250,000,000"); // 자본금 (① 행)
    expect(screen.getByText("123-45-67890")).toBeTruthy();
  });
});

// ============================================================
// RV-2: sessionStorage 복원으로 Date 필드가 string화된 입력에도
//        BesshiForm이 크래시 없이 렌더되고 PDF 버튼이 살아있다 (F-2·F-8 정규화).
//
// 현행(정규화 전) 크래시 1차 지점 = UnlistedStockBesshiPdfDownloadButton(try/catch 밖)의
// useMemo(generateBesshiPdfFilename) → string.toISOString() TypeError.
// (lib/api/date-coerce.ts toDate 정규화 적용 시 통과)
// ============================================================

describe("[RV-2] string화된 Date 필드 복원 입력 — 크래시 없이 렌더", () => {
  // sessionStorage(JSON) 복원 후 Date가 ISO string으로 도달하는 상황 재현.
  // 타입상 Date지만 런타임은 string — as unknown as Date 캐스팅으로 복원본 모사.
  const restoredInput: UnlistedStockValuationInput = {
    ...case6Input,
    corpName: "㈜복원", // PDF 버튼 disabled 가드 통과 (corpName.trim())
    evaluationDate: "2024-01-20" as unknown as Date,
    businessStartDate: "2000-01-01" as unknown as Date,
    fiscalYears: case6Input.fiscalYears.map((fy) => ({
      ...fy,
      fiscalYearEndDate: (fy.fiscalYearEndDate instanceof Date
        ? fy.fiscalYearEndDate.toISOString().slice(0, 10)
        : fy.fiscalYearEndDate) as unknown as Date,
    })) as UnlistedStockValuationInput["fiscalYears"],
  };

  it("string evaluationDate 복원 입력 → toggle 렌더 (toISOString 크래시 없음)", () => {
    render(<BesshiForm4Buppyo3PrintView input={restoredInput} />);
    expect(screen.getByTestId("besshi-form-toggle")).toBeTruthy();
  });

  it("정규화로 평가기준일이 Date 변환되어 표시 (string→Date)", () => {
    // PDF 버튼은 dynamic({ssr:false})라 jsdom 미로드 → 버튼 testid 대신
    // Page1 ② 평가기준일이 정상 표시되는지로 정규화(safe 전달) 검증.
    render(<BesshiForm4Buppyo3PrintView input={restoredInput} />);
    expand();
    expect(screen.getByTestId("p1-②")).toHaveTextContent("2024-01-20");
  });

  it("펼친 미리보기에서 1주당 가액이 정상 표시 (string→Date 변환 후 사례 6 산출)", () => {
    render(<BesshiForm4Buppyo3PrintView input={restoredInput} />);
    expand();
    // 제1쪽 ③ 순자산가액 — 정규화 성공 시 사례 6과 동일 산출
    expect(screen.getByTestId("p1-③")).toHaveTextContent("489,351,700");
  });
});

// ============================================================
// RV-6: 미완성 입력(주식수 0 + date undefined/string)에도 크래시 없이
//        안내만 렌더되고 PDF 버튼은 disabled (F-8 회귀 방어 — try/catch fallback).
// ============================================================

describe("[RV-6] 미완성 입력 — 입력 단계 크래시 없음 (F-8 회귀 방어)", () => {
  const incompleteUndefined: UnlistedStockValuationInput = {
    ...case6Input,
    totalShares: 0,
    ownedShares: 0,
    corpName: "",
    evaluationDate: undefined as unknown as Date,
  };
  const incompleteStringDate: UnlistedStockValuationInput = {
    ...case6Input,
    totalShares: 0,
    ownedShares: 0,
    corpName: "",
    evaluationDate: "2024-01-20" as unknown as Date,
  };

  it("주식수 0 + evaluationDate undefined → 크래시 없이 toggle 렌더", () => {
    render(<BesshiForm4Buppyo3PrintView input={incompleteUndefined} />);
    expect(screen.getByTestId("besshi-form-toggle")).toBeTruthy();
  });

  it("주식수 0 + string date → 크래시 없이 toggle 렌더", () => {
    render(<BesshiForm4Buppyo3PrintView input={incompleteStringDate} />);
    expect(screen.getByTestId("besshi-form-toggle")).toBeTruthy();
  });

  it("미완성 입력(date undefined) → 펼침 시 평가기준일 '-' (Page1 방어, 크래시 없음)", () => {
    render(<BesshiForm4Buppyo3PrintView input={incompleteUndefined} />);
    expand();
    expect(screen.getByTestId("p1-②")).toHaveTextContent("-");
  });
});
