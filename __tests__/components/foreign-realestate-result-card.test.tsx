/** @vitest-environment jsdom */
/**
 * ⑦ 국외자산 부동산 결과 카드 — K-1 교재 사례 · 외국납부세액(세액공제·한도 초과) · 납세의무 없음 · 2건 기본공제 배분
 *
 * 숫자는 엔진을 실제로 돌린 결과다(손으로 만든 result 객체가 아니다) — 카드가 엔진 값을 그대로 보이는지, 엔진이 돌려준
 * `confirmationNeeded`·`warnings`가 하나도 빠지지 않는지, 법령 인용이 상수만 쓰는지를 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { ForeignRealEstateResultCard } from "@/components/calc/results/foreign-realestate/ForeignRealEstateResultCard";
import { ForeignRealEstateResultView } from "@/components/calc/results/foreign-realestate/ForeignRealEstateResultView";
import {
  CONFIRMATION_NOTICES,
  NOT_LIABLE_REASON_TEXT,
} from "@/components/calc/results/foreign-realestate/ForeignResultNotices";
import { aAsset, bAsset, ftax, k1Input, ratesAt } from "../tax-engine/foreign-realestate/_fixtures";

afterEach(cleanup);

const k1 = () => calc(k1Input(), ratesAt("2026-07-10"));
const text = (id: string) => screen.getByTestId(id).textContent ?? "";
const noop = () => {};

describe("K-1 교재 사례 — 숫자와 산식", () => {
  it("양도소득금액 437,000,000 · 기본공제 2,500,000 · 과세표준 434,500,000 · 산출세액 147,860,000 · 지방소득세 14,786,000 · 총 162,646,000", () => {
    render(<ForeignRealEstateResultCard result={k1()} />);
    expect(text("foreign-income-total")).toContain("437,000,000");
    expect(text("foreign-basic-deduction")).toContain("2,500,000");
    expect(text("foreign-tax-base")).toContain("434,500,000");
    expect(text("foreign-calculated-tax")).toContain("147,860,000");
    expect(text("foreign-local-tax")).toContain("14,786,000");
    expect(text("foreign-total-tax")).toContain("162,646,000");
    expect(text("foreign-result-total")).toBe("162,646,000");
  });

  it("각 환산 단계는 «외화 × 기준환율(일자) = 원»", () => {
    render(<ForeignRealEstateResultCard result={k1()} />);
    expect(text("foreign-gain-0-transfer")).toContain("USD 900,000 × 기준환율(2026-07-10) 1,100 =");
    expect(text("foreign-gain-0-transfer")).toContain("990,000,000");
    expect(text("foreign-gain-0-acquisition")).toContain("USD 400,000 × 기준환율(2022-01-15) 1,300 =");
    expect(text("foreign-gain-0-acquisition")).toContain("520,000,000");
    expect(text("foreign-gain-0-cost-0")).toContain("USD 30,000 × 기준환율(2026-07-10) 1,100 =");
    expect(text("foreign-gain-0-cost-0")).toContain("33,000,000");
  });

  it("양도차익 산식은 숫자 옆에 변수명 라벨이 붙고(약어·floor 없음) 0인 항은 적지 않는다", () => {
    render(<ForeignRealEstateResultCard result={k1()} />);
    const t = text("foreign-gain-0-gain");
    expect(t).toContain("양도가액 990,000,000 − 취득가액 520,000,000 − 양도비 33,000,000");
    expect(t).not.toContain("자본적지출");
    expect(t).not.toMatch(/floor|Math/);
    expect(text("foreign-gain-0-gain")).toContain("437,000,000");
  });

  it("장기보유특별공제는 0 행이 아니라 §118의8 단서 «적용 배제» 한 줄", () => {
    render(<ForeignRealEstateResultCard result={k1()} />);
    expect(text("foreign-gain-0-lthd")).toContain(`적용 배제 — ${TRANSFER_FOREIGN_RE.SECTION_118_8_MUTATIS_NO_LTHD} 단서`);
    expect(screen.getByTestId("foreign-gain-0-lthd").querySelector("[data-amount]")).toBeNull();
  });

  it("산출세액 산식: 과세표준 × 세율 − 누진공제 / 지방소득세: §92① 세율(10분의 1)", () => {
    render(<ForeignRealEstateResultCard result={k1()} />);
    expect(text("foreign-calculated-tax")).toContain("과세표준 434,500,000 × 세율 40% − 누진공제 25,940,000");
    expect(text("foreign-local-before")).toContain("과세표준 434,500,000 × 세율 4% − 누진공제 2,594,000");
    expect(text("foreign-local-tax")).toContain("10원 미만 절사");
    expect(screen.queryByTestId("foreign-local-credit")).toBeNull(); // 외국납부세액 없음 — §97③ 공제 행 없음
  });

  it("금액 칸은 font-mono tabular-nums 우측 정렬이다", () => {
    const { container } = render(<ForeignRealEstateResultCard result={k1()} />);
    const cells = container.querySelectorAll("[data-amount]");
    expect(cells.length).toBeGreaterThan(8);
    for (const c of cells) {
      expect(c.className).toMatch(/font-mono/);
      expect(c.className).toMatch(/tabular-nums/);
      expect(c.className).toMatch(/text-right/);
      expect(c.className).toMatch(/whitespace-nowrap/);
    }
  });
});

describe("확인 필요 — 엔진이 돌려준 것은 하나도 버리지 않는다", () => {
  it("K-1: confirmationNeeded 코드와 warnings 문구가 모두 «확인 필요» 카드로 보인다", () => {
    const r = k1();
    render(<ForeignRealEstateResultCard result={r} />);
    const box = screen.getByTestId("foreign-notices");
    for (const code of r.confirmationNeeded) expect(within(box).getByTestId(`foreign-confirm-${code}`).textContent).toContain("확인 필요");
    r.warnings.forEach((w, i) => expect(within(box).getByTestId(`foreign-warning-${i}`).textContent).toContain(w));
    expect(r.confirmationNeeded.length + r.warnings.length).toBeGreaterThan(0);
  });

  it("외국납부세액 한도 초과: 두 코드 + 한도 초과 경고 문구가 모두 보이고, 미공제 잔액이 경고색으로 보인다", () => {
    const r = calc(k1Input({ foreignTax: { method: "credit", items: [ftax("a1", 200_000, "2026-08-01", 1_000)] } }), ratesAt("2026-07-10"));
    expect(r.confirmationNeeded).toEqual(["LOCAL_TAX_WEIGHTING_NOT_EVALUATED", "FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY"]);
    expect(r.warnings.length).toBe(2);
    render(<ForeignRealEstateResultCard result={r} />);
    for (const code of r.confirmationNeeded) expect(screen.getByTestId(`foreign-confirm-${code}`)).toBeTruthy();
    r.warnings.forEach((w, i) => expect(screen.getByTestId(`foreign-warning-${i}`).textContent).toContain(w));
    // FTC: 한도 = 산출세액 × 해당 자산 양도소득금액 ÷ 합계
    // 나눗셈은 분수로 그려진다(분자: 해당 자산 양도소득금액 · 분모: 합계) — 두 숫자가 모두 보인다
    const limitText = text("foreign-ftc-limit-a1");
    expect(limitText).toContain("산출세액 147,860,000 ×");
    expect(limitText).toContain("해당 국외자산 양도소득금액 437,000,000");
    expect(limitText).toContain("국외자산 양도소득금액 합계 437,000,000");
    expect(screen.getByTestId("foreign-ftc-limit-a1").querySelector("span.inline-flex.flex-col")).not.toBeNull();
    expect(text("foreign-ftc-limit-a1")).toContain("147,860,000");
    expect(text("foreign-ftc-applied-a1")).toContain("147,860,000");
    expect(text("foreign-ftc-unapplied-a1")).toContain("52,140,000");
    expect(screen.getByTestId("foreign-ftc-unapplied-a1").querySelector("p")?.className).toMatch(/amber/);
    // 결정세액 = 산출세액 − 공제 = 0, 지방소득세는 §97③ 공제가 반영된다
    expect(text("foreign-determined-tax")).toContain("산출세액 147,860,000 − 외국납부세액 공제 147,860,000");
    expect(text("foreign-local-credit")).toContain("14,786,000");
  });

  it("외국납부세액 환산 행도 «외화 × 기준환율(납부일) = 원»", () => {
    const r = calc(k1Input({ foreignTax: { method: "credit", items: [ftax("a1", 10_000, "2026-08-01", 1_000)] } }), ratesAt("2026-07-10"));
    render(<ForeignRealEstateResultCard result={r} />);
    const box = screen.getByTestId("foreign-ftc-a1");
    expect(box.textContent).toContain("USD 10,000 × 기준환율(2026-08-01) 1,000 =");
    expect(box.textContent).toContain("10,000,000");
  });

  it("필요경비 산입방법: 산입한 외국납부세액이 양도차익 산식에 들어가고 세액공제 행은 없다", () => {
    const r = calc(k1Input({ foreignTax: { method: "expense", items: [ftax("a1", 10_000, "2026-08-01", 1_000)] } }), ratesAt("2026-07-10"));
    render(<ForeignRealEstateResultCard result={r} />);
    expect(text("foreign-gain-0-gain")).toContain("− 필요경비 산입 외국납부세액 10,000,000");
    expect(text("foreign-gain-0-fttax-0")).toContain("USD 10,000 × 기준환율(2026-08-01) 1,000 =");
    expect(screen.getByTestId("foreign-ftc-expense-note")).toBeTruthy();
    expect(screen.queryByTestId("foreign-ftc-a1")).toBeNull();
  });

  it("CONFIRMATION_NOTICES 키 = 엔진 confirmationNeeded 코드 전부(types.ts 소스 대조 — satisfies의 런타임 짝)", () => {
    const src = readFileSync(join(process.cwd(), "lib/tax-engine/foreign-realestate/types.ts"), "utf8");
    const block = src.slice(src.indexOf("export type ForeignRealEstateConfirmationCode"), src.indexOf("export type ForeignRealEstateNotLiableReason"));
    const codes = [...block.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    expect(codes.length).toBeGreaterThan(0);
    expect(Object.keys(CONFIRMATION_NOTICES).sort()).toEqual(codes);
  });

  it("카드가 모르는 코드(옛 이력·서버가 앞서간 경우)도 코드 그대로 «확인 필요»로 보인다", () => {
    const r = { ...k1(), confirmationNeeded: [...k1().confirmationNeeded, "FUTURE_CODE" as never] };
    render(<ForeignRealEstateResultCard result={r} />);
    expect(text("foreign-confirm-FUTURE_CODE")).toContain("FUTURE_CODE");
  });
});

describe("납세의무 없음 — 거주 5년 미만", () => {
  it("세액 0 · 사유 카드 · 세액 계산 섹션 없음 · 환산은 참고로 보인다", () => {
    const r = calc(k1Input({ domesticResidenceYears: 3 }), ratesAt("2026-07-10"));
    expect(r.taxCategory).toBe("not_liable");
    render(<ForeignRealEstateResultCard result={r} />);
    expect(text("foreign-not-liable")).toContain(TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE);
    expect(text("foreign-not-liable")).toContain(NOT_LIABLE_REASON_TEXT.RESIDENCE_UNDER_5_YEARS);
    expect(text("foreign-result-total")).toBe("0");
    expect(screen.queryByTestId("foreign-tax-calc")).toBeNull();
    expect(text("foreign-gain-0-transfer")).toContain("990,000,000");
  });

  it("출력 항목 선택 패널은 없는 «세액 계산» 서식을 고르게 두지 않는다", () => {
    const r = calc(k1Input({ domesticResidenceYears: 3 }), ratesAt("2026-07-10"));
    render(<ForeignRealEstateResultView result={r} onBack={noop} onGoToFirst={noop} onReset={noop} />);
    const panel = screen.getByTestId("print-selection-panel");
    expect(within(panel).queryByLabelText("과세표준·세액·외국납부세액·지방소득세")).toBeNull();
    expect(within(panel).getByLabelText("총 납부세액 요약")).toBeTruthy();
  });
});

describe("2건 — 기본공제 §118의7② 순서 배분", () => {
  it("먼저 양도한 자산(b: 3월)이 기본공제를 받는다 — 자산별 배분 · 양도일 순서가 보인다", () => {
    const r = calc(k1Input({ assets: [aAsset(), bAsset()] }), ratesAt("2026-07-10"));
    render(<ForeignRealEstateResultCard result={r} />);
    expect(text("foreign-gain-1-bd")).toContain("2,500,000");
    expect(text("foreign-gain-1-bd")).toContain("양도일 1번째");
    expect(text("foreign-gain-0-bd")).toContain("양도일 2번째");
    expect(text("foreign-gain-0-bd")).toMatch(/0$/); // a는 몫이 없다
    expect(text("foreign-basic-deduction")).toContain(TRANSFER_FOREIGN_RE.SECTION_118_7_DEDUCTION_ORDER);
    expect(text("foreign-income-total")).toContain("a 437,000,000 + b 100,000,000");
  });
});

describe("인쇄 — 접힘은 CSS로만 펼친다 · 선택 출력", () => {
  it("접힌 자산 본문은 hidden이지만 print:block이라 인쇄에는 나온다 · 토글 버튼은 print:hidden", () => {
    const { container } = render(<ForeignRealEstateResultCard result={k1()} />);
    const toggle = screen.getByRole("button", { name: /접기/ });
    expect(toggle.className).toMatch(/print:hidden/);
    fireEvent.click(toggle);
    const body = container.querySelector('[data-testid="foreign-asset-gain-0"] > div:nth-of-type(2)') as HTMLElement;
    expect(body.className).toMatch(/\bhidden\b/);
    expect(body.className).toMatch(/print:block/);
  });

  it("선택 항목에 없는 leaf는 인쇄에서만 빠진다(print:hidden) — 화면에는 그대로", () => {
    const { container } = render(<ForeignRealEstateResultCard result={k1()} selectedIds={new Set(["tax-calc"])} />);
    const cls = (id: string) => container.querySelector(`[data-print-id="${id}"]`)?.className ?? "";
    expect(cls("tax-calc")).not.toMatch(/print:hidden/);
    for (const id of ["summary", "asset-gain", "notices"]) expect(cls(id)).toMatch(/print:hidden/);
    expect(screen.getByTestId("foreign-result-total")).toBeTruthy(); // 화면 표시는 그대로
  });

  it("결과 화면의 선택 기본은 «전체 미선택» — 인쇄 버튼이 잠겨 있다", () => {
    render(<ForeignRealEstateResultView result={k1()} onBack={noop} onGoToFirst={noop} onReset={noop} />);
    expect((screen.getByTestId("print-selected-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("전체 선택"));
    expect((screen.getByTestId("print-selected-button") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("소스 가드", () => {
  const dir = join(process.cwd(), "components/calc/results/foreign-realestate");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  /** 주석 줄을 뺀 코드 */
  const code = (f: string) =>
    readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");

  it("법령 인용은 TRANSFER_FOREIGN_RE 상수만 쓴다 — 코드에 «§» 리터럴이 없다", () => {
    for (const f of files) expect(code(f), f).not.toContain("§");
  });

  it("변수 약어·floor()·native 체크박스/라디오가 없다", () => {
    for (const f of files) {
      expect(code(f), f).not.toMatch(/floor\(|Math\.floor/);
      expect(code(f), f).not.toMatch(/type="(checkbox|radio)"/);
    }
  });

  it("useEffect·isPrinting으로 인쇄 상태를 추적하지 않는다", () => {
    for (const f of files) expect(code(f), f).not.toMatch(/useEffect|isPrinting|beforeprint/);
  });
});
