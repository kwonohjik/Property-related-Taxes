/**
 * anchor — 가업상속공제 자산 §95④ 후단 **부분별 장기보유특별공제 표** (UI 계획서 transfer-fb-lthd-portion-gain.ui.plan.md §3.1 · UA-1~UA-5)
 *
 * 교재(이월과세5) 사례: 피상속인 2012.3.8. 토지 5억 취득 → 2022.4.10. 상속(시가 15억 · 적용률 70%) → 2026.10.15. 18억 양도 · 양도비 3천만.
 *   적용분 889,000,000 × 28% = 248,920,000 · 비적용분 81,000,000 × 8% = 6,480,000 · 합계 255,400,000 (손계산 — 엔진 출력 복사 아님).
 * 표는 엔진 `result.fbLthdDetail`을 **그대로 읽는다** — 화면이 값을 만들지 않는다.
 * 엔진을 정적 import로 두어 import가 테스트 타임아웃 안에서 평가되지 않게 한다(fb-imputed-capex-display 선례).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { FamilyBusinessLthdPortionTable } from "@/components/calc/results/transfer/FamilyBusinessLthdPortionTable";
import { lthdRateShownInPdf } from "@/lib/pdf/lthd-rate-label";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const R = makeMockRates();

interface Sample { n: number; d: number; ad: number; v: number; p: number; e: number; dep?: number; house?: boolean }
const S1: Sample = { n: 7, d: 10, ad: 500_000_000, v: 1_500_000_000, p: 1_800_000_000, e: 30_000_000 };
const S3: Sample = { ...S1, n: 1, d: 1 };
const S4: Sample = { n: 1, d: 2, ad: 100_000_000, v: 2_000_000_000, p: 1_600_000_000, e: 0 };
const S5: Sample = { n: 1, d: 2, ad: 300_000_000, v: 1_200_000_000, p: 2_000_000_000, e: 0, house: true };
const S8: Sample = { ...S1, dep: 50_000_000 };
/** 양도차익 상한 (PR #3678 리뷰 M-1) — 적용분 499,500,000 × 28% = 139,860,000이 양도차익 9,500,000을 넘는다 → 합계 9,500,000으로 제한 */
const SCAP: Sample = { n: 1, d: 2, ad: 1_000_000, v: 1_980_000_000, p: 1_000_000_000, e: 0 };

function run(s: Sample): TransferTaxResult {
  return calculateTransferTax(baseTransferInput({
    propertyType: s.house ? "housing" : "land",
    transferPrice: s.p,
    acquisitionPrice: s.v,
    acquisitionDate: new Date("2022-04-10"),
    transferDate: new Date("2026-10-15"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: new Date("2012-03-08"),
    isOneHousehold: !!s.house,
    householdHousingCount: s.house ? 1 : 0,
    residencePeriodMonths: s.house ? 48 : 0,
    expenses: 0,
    transferExpense: s.e,
    ...(s.dep ? { depreciationAmount: s.dep } : {}),
    reductions: [],
    annualBasicDeductionUsed: 0,
    familyBusinessInheritance: {
      decedentAcquisitionPrice: s.ad,
      inheritanceMarketValue: s.v,
      fbDeductionAppliedRate: s.n / s.d,
      inheritanceDate: "2022-04-10",
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: s.n * 100_000_000, businessEstateValue: s.d * 100_000_000 },
    },
  } as Partial<TransferTaxInput>), R);
}

const renderCard = (r: TransferTaxResult, withLthd = true) =>
  render(
    <FamilyBusinessImputedComparisonCard
      detail={r.familyBusinessDetail!}
      fbLthdDetail={withLthd ? r.fbLthdDetail : undefined}
      longTermHoldingDeduction={r.longTermHoldingDeduction}
    />,
  );
const cellText = (id: string) => screen.getByTestId(id).textContent?.trim();

describe("UA-1 교재 사례 — 부분별 표 셀 값", () => {
  it("S1: 889,000,000·81,000,000 · 28%·8% · 248,920,000·6,480,000 · 합계 255,400,000", () => {
    const r = run(S1);
    expect(r.longTermHoldingDeduction).toBe(255_400_000); // 엔진 anchor와 같은 손계산 값
    renderCard(r);
    expect(screen.getByTestId("fb-lthd-portion-table")).toBeTruthy();
    expect(cellText("fb-lthd-applied-net")).toBe("1,239,000,000");
    expect(cellText("fb-lthd-applied-term")).toBe("350,000,000");
    expect(cellText("fb-lthd-applied-gain")).toBe("889,000,000");
    expect(cellText("fb-lthd-rest-net")).toBe("531,000,000");
    expect(cellText("fb-lthd-rest-term")).toBe("450,000,000");
    expect(cellText("fb-lthd-rest-gain")).toBe("81,000,000");
    expect(cellText("fb-lthd-applied-years")).toBe("14년");
    expect(cellText("fb-lthd-rest-years")).toBe("4년");
    expect(cellText("fb-lthd-applied-rate")).toBe("28%");
    expect(cellText("fb-lthd-rest-rate")).toBe("8%");
    expect(cellText("fb-lthd-applied-deduction")).toBe("248,920,000");
    expect(cellText("fb-lthd-rest-deduction")).toBe("6,480,000");
    expect(cellText("fb-lthd-gain-total")).toBe("970,000,000");
    expect(cellText("fb-lthd-total")).toBe("255,400,000");
    // 열 머리글 비율 — 입력칸·비교 카드와 같은 정수 분수 표기
    expect(cellText("fb-lthd-applied-head")).toContain("70.00%");
    expect(cellText("fb-lthd-rest-head")).toContain("30.00%");
    // 감가상각·12억 초과·거주분 행은 해당 없으면 그리지 않는다
    expect(screen.queryByTestId("fb-lthd-applied-depreciation")).toBeNull();
    expect(screen.queryByTestId("fb-lthd-applied-base")).toBeNull();
    expect(screen.queryByTestId("fb-lthd-residence")).toBeNull();
    expect(screen.queryByTestId("fb-lthd-loss-note")).toBeNull();
  });

  it("금액 칸은 고정폭·우측정렬·tabular-nums, 표 글자 크기는 한 가지, 「원」 접미·변수 약어 없음", () => {
    renderCard(run(S1));
    const table = screen.getByTestId("fb-lthd-portion-table");
    for (const id of ["fb-lthd-applied-gain", "fb-lthd-rest-deduction", "fb-lthd-total", "fb-lthd-gain-total"]) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toContain("font-mono");
      expect(cls).toContain("text-right");
      expect(cls).toContain("tabular-nums");
    }
    // 금액 칸만 크기를 바꾸면 합계와 구성요소의 자릿수가 어긋난다 — 표 안에 text-sm·text-base 금액 셀이 없다.
    expect(table.querySelectorAll("td.font-mono.text-sm, td.font-mono.text-base").length).toBe(0);
    const text = table.textContent ?? "";
    expect(text).not.toMatch(/\d원/);
    expect(text).not.toMatch(/P_F|Sum_A|floor/);
    expect(text).not.toMatch(/\d+(\.\d+)?%\s*×/); // 가중 «22% ×» 식 표기 금지
  });

  it("실효(가중) 공제율은 어디에도 없다 — 26.3%·26.33% 부재", () => {
    renderCard(run(S1));
    const text = screen.getByTestId("fb-lthd-portion-table").textContent ?? "";
    expect(text).not.toContain("26.3");
    expect(text).not.toContain("22%");
  });
});

describe("UA-2 분기 — r=1 · 차손 · 구 이력", () => {
  it("S3 (r=1): 비적용분 열 «—», 합계 = 적용분", () => {
    const r = run(S3);
    renderCard(r);
    for (const id of ["net", "term", "gain", "years", "rate", "deduction"]) {
      expect(cellText(`fb-lthd-rest-${id}`)).toBe("—");
    }
    expect(cellText("fb-lthd-applied-deduction")).toBe("355,600,000");
    expect(cellText("fb-lthd-total")).toBe("355,600,000");
  });

  it("S4 (비적용분 차손): 양도차손 표시 · 공제 0 · 확인 필요 고지", () => {
    const r = run(S4);
    expect(r.fbLthdDetail!.lossSlice).toBe("heir");
    renderCard(r);
    expect(cellText("fb-lthd-rest-gain")).toBe("-200,000,000");
    expect(cellText("fb-lthd-rest-rate")).toBe("0%");
    expect(cellText("fb-lthd-rest-deduction")).toBe("0");
    expect(cellText("fb-lthd-applied-gain")).toBe("750,000,000");
    expect(cellText("fb-lthd-applied-rate")).toBe("28%");
    expect(cellText("fb-lthd-applied-deduction")).toBe("210,000,000");
    // 합계 행: 양도차익 합계는 G(550,000,000) 그대로, 공제액 합계는 엔진 값
    expect(cellText("fb-lthd-gain-total")).toBe("550,000,000");
    expect(cellText("fb-lthd-total")).toBe("210,000,000");
    // 양수 부분 전액(750,000,000)이 전체 양도차익(550,000,000)보다 크지만 12억 초과 안분이 없어 기준액 = 양도차익 → 별도 행 없음
    expect(screen.queryByTestId("fb-lthd-applied-base")).toBeNull();
    expect(cellText("fb-lthd-loss-note")).toContain("비적용분은 양도차손");
    expect(cellText("fb-lthd-loss-note")).toContain("확인 필요");
    // 엔진 고지가 warnings에도 실린다
    expect(r.warnings?.some((w) => w.includes("양도차손"))).toBe(true);
  });

  it("옛 결과(echo 없음) → 표 미렌더, 기존 행 보존", () => {
    const r = run(S1);
    renderCard(r, false);
    expect(screen.queryByTestId("fb-lthd-portion-table")).toBeNull();
    expect(screen.getByText("피상속인 원취득가액")).toBeTruthy();
  });

  it("basis가 slice_gain이 아니면 그리지 않는다", () => {
    const d = { ...run(S1).fbLthdDetail!, basis: "proportional" as const };
    const { container } = render(<FamilyBusinessLthdPortionTable detail={d} totalDeduction={1} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("UA-2b 양도차익 상한 — 합계 행은 제한 후 금액, «양도차익 범위로 제한» 안내", () => {
  it("SCAP: 부분 공제액은 제한 전 값 · 합계 = 엔진 값 9,500,000 · 안내 1줄 · 차손 안내도 함께", () => {
    const r = run(SCAP);
    expect(r.fbLthdDetail!.cappedToGain).toBe(true);
    renderCard(r);
    expect(cellText("fb-lthd-applied-deduction")).toBe("139,860,000");
    expect(cellText("fb-lthd-gain-total")).toBe("9,500,000");
    expect(cellText("fb-lthd-total")).toBe("9,500,000");
    expect(cellText("fb-lthd-capped-note")).toContain("양도차익 범위로 제한");
    expect(cellText("fb-lthd-capped-note")).toContain("확인 필요");
    expect(screen.getByTestId("fb-lthd-loss-note")).toBeTruthy();
  });

  it("제한이 없는 사례(S1·S4)에는 안내가 없다", () => {
    renderCard(run(S1));
    expect(screen.queryByTestId("fb-lthd-capped-note")).toBeNull();
    cleanup();
    renderCard(run(S4));
    expect(screen.queryByTestId("fb-lthd-capped-note")).toBeNull();
  });
});

describe("UA-3 표2·감가상각 — 행 가시 조건", () => {
  it("S5 (고가주택 표2): 공제 기준액(12억 초과 안분 후) 행 + 거주기간 공제분 행", () => {
    const r = run(S5);
    renderCard(r);
    expect(cellText("fb-lthd-applied-gain")).toBe("850,000,000");
    expect(cellText("fb-lthd-applied-base")).toBe("340,000,000");
    expect(cellText("fb-lthd-rest-base")).toBe("160,000,000");
    expect(cellText("fb-lthd-residence")).toBe("80,000,000");
    expect(cellText("fb-lthd-total")).toBe("241,600,000");
  });

  it("S8 (감가상각비 5천만): 취득가액 항에서 차감되는 부분만 별도 행", () => {
    const r = run(S8);
    renderCard(r);
    // 감가상각비 5천만을 취득가액 두 항(3.5억·4.5억) 비율로 나눈 몫 — 적용분 21,875,000 · 비적용분 28,125,000
    expect(cellText("fb-lthd-applied-depreciation")).toBe("21,875,000");
    expect(cellText("fb-lthd-rest-depreciation")).toBe("28,125,000");
    // 몫 − (취득가액 항 − 감가상각비) = 양도차익
    expect(1_239_000_000 - (350_000_000 - 21_875_000)).toBe(910_875_000);
    expect(cellText("fb-lthd-applied-gain")).toBe("910,875,000");
  });
});

describe("UA-4 엔진 → 화면 합계 일치", () => {
  it.each([["S1", S1], ["S3", S3], ["S4", S4], ["S5", S5], ["S8", S8]] as const)(
    "%s: 부분 공제액 + 거주분 = 표 합계 = 엔진 장기보유특별공제 = 장특 step 금액 · 부분 양도차익 합 = transferGain",
    (_n, s) => {
      const r = run(s);
      const d = r.fbLthdDetail!;
      const stepAmount = r.steps.find((x) => x.label.includes("장기보유"))!.amount;
      expect(d.decedentSlice.deduction + d.heirSlice.deduction + d.residenceDeduction).toBe(r.longTermHoldingDeduction);
      expect(stepAmount).toBe(r.longTermHoldingDeduction);
      expect(d.decedentSlice.gain + d.heirSlice.gain).toBe(r.transferGain);
      renderCard(r);
      expect(cellText("fb-lthd-total")).toBe(r.longTermHoldingDeduction.toLocaleString("ko-KR"));
      expect(cellText("fb-lthd-gain-total")).toBe(r.transferGain.toLocaleString("ko-KR"));
      cleanup();
    },
  );

  it("S1 계산 단계 문구: 부분별 양도차익 × 부분별 공제율 · 가중 22%·보유기간 4년 6개월 부재", () => {
    const f = run(S1).steps.find((x) => x.label.includes("장기보유"))!.formula ?? "";
    expect(f).toContain("889,000,000 × 28%");
    expect(f).toContain("81,000,000 × 8%");
    expect(f).toContain("255,400,000");
    expect(f).toContain("§95④ 후단");
    expect(f).not.toContain("× 22%");
    expect(f).not.toContain("보유기간 4년 6개월");
  });
});

describe("UA-5 PDF 장특 라벨 — 부분별 율이면 (%) 생략", () => {
  it("fbLthdDetail 있으면 라벨에 율을 붙이지 않는다 · 없으면 종전", () => {
    expect(lthdRateShownInPdf({ fbLthdDetail: {} }, true)).toBe(false);
    expect(lthdRateShownInPdf({}, true)).toBe(true);
    expect(lthdRateShownInPdf({}, false)).toBe(false); // 합산 어댑터는 종전대로 율 없음
  });
});

describe("표 안 요소 접근성", () => {
  it("머리글 행과 두 열 머리글이 있다", () => {
    renderCard(run(S1));
    const table = screen.getByTestId("fb-lthd-portion-table");
    expect(within(table).getAllByRole("columnheader").length).toBe(3);
  });
});
