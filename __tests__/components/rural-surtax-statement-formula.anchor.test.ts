/**
 * anchor — 상세 명세서 농어촌특별세 행 산식(결과뷰 리뷰 R-c05-09). 표시 전용 — 금액·근거 배지는 바뀌지 않는다.
 *
 * 종전: 산식이 늘 「(감면 전 산출세액 − 감면 후 산출세액) × 20% = X (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)」라
 * 세액감면형(§77·§98의7 5년 이내 등 「감면세액 × 20%」 · 근거 §5①1호)에서도 차감형 꼬리표가 붙었고, 0원일 때도 같은 문구였다.
 * 지금: 엔진 농특세 단계의 산식을 그대로 쓴다(단계 금액 합 = 값일 때만) · 0원이면 「해당 없음」.
 * 시료는 `us83-us85-us69-citation-sources.anchor.test.ts`와 같다(§98의7 — 5년 이내 세액감면형 / 5년 후 소득금액 차감형).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildSurtaxAndLocalTaxItems } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementHelpers";

const UNSOLD_987 = {
  type: "unsold_98_7" as const,
  contractDate987: new Date("2012-10-15"),
  acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000,
  standardPriceAt5Years987: 300_000_000,
  standardPriceAtTransfer987: 400_000_000,
};

const run = (transferDate: string, reductions: unknown[] = [UNSOLD_987]) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2013-01-15"),
      transferDate: new Date(transferDate),
      householdHousingCount: 2,
      reductions: reductions as never,
    }),
    makeMockRates(),
  );

const rural = (r: ReturnType<typeof run>) => {
  const items = new Map<string, StatementItem>();
  buildSurtaxAndLocalTaxItems(items, r, 0);
  return items.get("ruralSurtax")!;
};

describe("R-c05-09 농어촌특별세 산식 — 엔진 단계 산식", () => {
  it("RS-1 세액감면형(5년 이내) — 「감면세액 × 20%」 · 차감형 꼬리표 없음", () => {
    const r = run("2016-08-01");
    const item = rural(r);
    const step = r.steps.find((s) => s.label.includes("농어촌특별세"))!;
    expect(item.legalBasis).toBe(TRANSFER.RURAL_SURTAX_REDUCTION);
    expect(item.value).toBe(step.amount);
    expect(item.formula).toBe(step.formula);
    expect(item.formula).toMatch(/^감면세액 [\d,]+ × 20% = [\d,]+$/);
    expect(item.formula).not.toContain("소득금액차감");
  });

  it("RS-2 소득금액 차감형(5년 후) — 감면 전·후 산출세액 숫자 산식", () => {
    const r = run("2022-08-01");
    const item = rural(r);
    expect(item.value).toBe(9_171_000);
    expect(item.formula).toMatch(/^\(감면 전 산출세액 [\d,]+ − 감면 후 산출세액 [\d,]+\) × 20% = 9,171,000$/);
  });

  it("RS-3 감면 없음(0원) — 「해당 없음」", () => {
    const item = rural(run("2022-08-01", []));
    expect(item.value).toBe(0);
    expect(item.formula).toBe("해당 없음");
  });

  it("RS-4 엔진 단계가 없으면(집계 어댑터) 종전 문구로 대신한다", () => {
    const r = run("2022-08-01");
    const item = (() => {
      const items = new Map<string, StatementItem>();
      buildSurtaxAndLocalTaxItems(items, { ...r, steps: [] }, 0, 1_234_000);
      return items.get("ruralSurtax")!;
    })();
    expect(item.formula).toBe("(감면 전 산출세액 − 감면 후 산출세액) × 20% = 1,234,000 (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)");
  });
});
