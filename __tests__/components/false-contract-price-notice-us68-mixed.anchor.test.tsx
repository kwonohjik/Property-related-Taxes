/**
 * US-68 (리뷰 `unsold-98-series-review-2026-11.md`) — 소득세법 §91② 범위 밖 고지가 겸용주택 결과에서
 * 5년 후 소득금액 차감형 감면(§98의7·§98의3)이 있어도 뜨지 않던 문제.
 *
 * 단건·다건·일괄은 #3027이 노출 술어에 `incomeDeductionReducible`을 넘겨 고쳤다. 겸용 결과(`MixedUseTotalTaxSection`)만
 * 이 값을 넘기지 않았다. 부담부증여 카드는 API 변환이 `reductions: []`로 고정이라 감면 자체가 없다(아래 guard).
 *
 * 세액은 바뀌지 않는다(고지만 0건 → 1건).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const NOTICE = '[data-testid="false-contract-price-notice"]';
const noticeCount = (c: Element) => c.querySelectorAll(NOTICE).length;

const U983 = {
  type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: D("2009-06-15"),
  isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isUnsoldConfirmed983: true, isFirstContract983: true,
  isNotOccupiedAtContract983: true, isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
};
const U987 = {
  type: "unsold_98_7", contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: 300_000_000, standardPriceAtTransfer987: 400_000_000,
};

function run(over: Record<string, unknown>, acq: string, td: string) {
  const dates = { buildingAcquisitionDate: D(acq), landAcquisitionDate: D(acq) };
  return calcMixed(1_100_000_000, D(td), { ...mixedUseCase14(), isOneHouseExempt: false, ...dates, ...over } as unknown as MixedUseAssetInput, rates);
}
const view = (b: ReturnType<typeof run>, td: string) =>
  render(<MixedUseResultCard breakdown={b} formData={{ ...createDefaultTransferFormData(), transferDate: td } as never} />).container;

describe("US-68 겸용주택 — 5년 후 소득금액 차감형 감면 결과에도 §91② 고지가 뜬다", () => {
  it("대조: 감면 없는 과세 결과는 0건", () => {
    const b = run({}, "2009-08-01", "2022-02-16");
    expect(b.total.reductionAmount).toBe(0);
    expect(noticeCount(view(b, "2022-02-16"))).toBe(0);
  });

  it("§98의3 5년 후: 차감 > 0, reductionAmount 0, 고지 1건", () => {
    const ctl = run({}, "2009-08-01", "2022-02-16");
    const b = run({ reductions: [U983] }, "2009-08-01", "2022-02-16");
    expect(b.total.incomeDeduction?.reducibleIncome ?? 0).toBeGreaterThan(0);
    expect(b.total.reductionAmount).toBe(0);
    expect(b.total.totalPayable).toBeLessThan(ctl.total.totalPayable); // 엔진 계산 그대로(#3001) — 이 PR은 세액 불변
    expect(noticeCount(view(b, "2022-02-16"))).toBe(1);
  });

  it("§98의7 5년 후: 차감 > 0, reductionAmount 0, 고지 1건", () => {
    const b = run({ reductions: [U987] }, "2012-12-01", "2022-02-16");
    expect(b.total.reductionDetails?.unsold987Detail?.reducibleTransferIncome ?? 0).toBeGreaterThan(0);
    expect(b.total.reductionAmount).toBe(0);
    expect(noticeCount(view(b, "2022-02-16"))).toBe(1);
  });

  it("양도일 2011-06-30이면 차감형이어도 안 뜬다(시행일 게이트 유지)", () => {
    const b = run({ reductions: [U983] }, "2009-08-01", "2022-02-16");
    expect(noticeCount(view(b, "2011-06-30"))).toBe(0);
  });
});

describe("US-68 부담부증여 카드 — 감면 입력이 없는 경로", () => {
  it("API 변환이 reductions를 빈 배열로 고정한다 — 차감형 감면이 생기면 카드 배선(incomeDeductionReducible)을 함께 추가해야 한다", () => {
    const src = readFileSync(join(process.cwd(), "lib/calc/gift-burdened-transfer-api.ts"), "utf8");
    expect(src).toMatch(/reductions:\s*\[\]\s*as unknown\[\]/);
  });
});
