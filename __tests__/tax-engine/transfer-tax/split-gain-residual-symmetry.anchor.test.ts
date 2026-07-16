/**
 * 토지/건물 분리(§166⑥) — 한쪽만 입력 시 잔액 대칭화 anchor.
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (A-0·A-4·A-5·A-6)
 *
 * 버그: 3쌍(양도가액·취득가액·자본적지출)이 전부 `land ?? floor(total×ratio)` / `building ?? (total − land)`
 * 비대칭 구조다. **건물만 입력하면** 토지가 비율로 채워져 **합계가 총액과 어긋난다**.
 * 취득가액은 더 나빠서 `input.buildingAcquisitionPrice`를 **아예 읽지 않는다**(죽은 필드).
 *
 * 수정: 입력 우선 → 한쪽만 있으면 반대쪽은 **잔액** → 둘 다 없으면 기준시가 비율 안분(§166⑥).
 * 잔액은 안분(fallback)이 아니라 **확정 도출**이다 — 총액이 필수 입력이므로 산수로 유일하게 결정된다.
 *
 * 안분 비율: landRatio = 600,000 / 1,000,000 = 0.6
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const base = {
  propertyType: "housing",
  acquisitionDate: new Date("2010-03-01"),
  landAcquisitionDate: new Date("2005-06-10"),
  transferDate: new Date("2026-02-16"),
  transferPrice: 1_000_000_000,
  acquisitionPrice: 400_000_000,
  acquisitionMethod: "actual",
  standardPricePerSqmAtAcquisition: 10_000,
  acquisitionArea: 60,
  standardPriceAtAcquisition: 1_000_000,
  standardPriceAtTransfer: 2_000_000,
  expenses: 0,
} as unknown as TransferTaxInput;

const run = (over: Partial<TransferTaxInput>) =>
  calcSplitGain({ ...base, ...over } as TransferTaxInput)!;

describe("split — 양도가액 잔액 대칭화 (A-4)", () => {
  it("케이스 1: 둘 다 미입력 → 기준시가 비율 안분 6억 / 4억 (회귀 방어)", () => {
    const r = run({});
    expect(r.land.transferPrice).toBe(600_000_000);
    expect(r.building.transferPrice).toBe(400_000_000);
  });

  it("케이스 2: 토지만 7억 → 건물 = 잔액 3억 (회귀 방어 — 이미 정상)", () => {
    const r = run({ landTransferPrice: 700_000_000 });
    expect(r.land.transferPrice).toBe(700_000_000);
    expect(r.building.transferPrice).toBe(300_000_000);
    expect(r.land.transferPrice + r.building.transferPrice).toBe(1_000_000_000);
  });

  it("케이스 3: 🔴 건물만 3억 → 토지 = 잔액 7억 (현행: 6억 → 합계 9억)", () => {
    const r = run({ buildingTransferPrice: 300_000_000 });
    expect(r.building.transferPrice).toBe(300_000_000);
    expect(r.land.transferPrice, "토지 = 총양도가 − 건물(잔액)").toBe(700_000_000);
    expect(
      r.land.transferPrice + r.building.transferPrice,
      "합계는 총양도가액과 일치해야 함",
    ).toBe(1_000_000_000);
  });

  it("케이스 5: 둘 다 입력 → 그대로 사용", () => {
    const r = run({ landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 });
    expect(r.land.transferPrice).toBe(700_000_000);
    expect(r.building.transferPrice).toBe(300_000_000);
  });
});

describe("split — 취득가액 잔액 대칭화 + buildingAcquisitionPrice 소생 (A-5)", () => {
  it("케이스 1-a: 둘 다 미입력 → 비율 안분 2.4억 / 1.6억 (회귀 방어)", () => {
    const r = run({});
    expect(r.land.acquisitionPrice).toBe(240_000_000);
    expect(r.building.acquisitionPrice).toBe(160_000_000);
  });

  it("케이스 C: 토지만 2.5억 → 건물 = 잔액 1.5억 (회귀 방어 — 이미 정상)", () => {
    const r = run({ landAcquisitionPrice: 250_000_000 });
    expect(r.land.acquisitionPrice).toBe(250_000_000);
    expect(r.building.acquisitionPrice).toBe(150_000_000);
  });

  it("케이스 4: 🔴 건물만 1.5억 → 토지 = 잔액 2.5억 (현행: 입력 완전 무시)", () => {
    const r = run({ buildingAcquisitionPrice: 150_000_000 });
    expect(r.building.acquisitionPrice, "buildingAcquisitionPrice는 죽은 필드였다").toBe(
      150_000_000,
    );
    expect(r.land.acquisitionPrice, "토지 = 총취득가 − 건물(잔액)").toBe(250_000_000);
    expect(r.land.acquisitionPrice + r.building.acquisitionPrice).toBe(400_000_000);
  });

  it("케이스 5-a: 둘 다 입력 → 그대로 사용 (건물 입력이 살아있어야 함)", () => {
    const r = run({ landAcquisitionPrice: 250_000_000, buildingAcquisitionPrice: 150_000_000 });
    expect(r.land.acquisitionPrice).toBe(250_000_000);
    expect(r.building.acquisitionPrice).toBe(150_000_000);
  });

  it("케이스 7: 감정가액 — 실거래가와 동일 구조(직접 입력 우선 + 잔액)", () => {
    const r = run({
      acquisitionMethod: "appraisal",
      appraisalValue: 400_000_000,
      acquisitionPrice: 0,
      landAcquisitionPrice: 250_000_000,
    });
    expect(r.land.acquisitionPrice).toBe(250_000_000);
    expect(r.building.acquisitionPrice).toBe(150_000_000);
  });
});

describe("🔴 split — 자본적지출: 총액 0(정상 경로)에서는 독립 입력", () => {
  // `input.expenses`는 deprecated `directExpenses`에서 온다(transfer-tax-api.ts:224-229).
  // 신규 입력은 capitalExpenditure로 가므로 **정상 경로에선 expenses = 0**이다.
  // 그때 토지/건물 자본적지출 칸은 "총액의 안분"이 아니라 **독립 입력**이며,
  // 잔액 규칙(0 − 입력값)을 적용하면 음수가 되어 반대편 공제를 상쇄한다(= 공제 소멸, 세액 과대).
  it("expenses=0 + 건물만 3천만 → 토지는 0 (음수 금지)", () => {
    const r = run({ expenses: 0, buildingDirectExpenses: 30_000_000 });
    expect(r.land.directExpenses, "잔액 규칙을 적용하면 -3천만이 되어 공제가 소멸한다").toBe(0);
    expect(r.building.directExpenses).toBe(30_000_000);
  });

  it("expenses=0 + 건물만 3천만 → 총 양도차익이 3천만 공제된다", () => {
    const withExp = run({ expenses: 0, buildingDirectExpenses: 30_000_000 });
    const noExp = run({ expenses: 0 });
    const deducted =
      noExp.land.gain + noExp.building.gain - (withExp.land.gain + withExp.building.gain);
    expect(deducted, "자본적지출 3천만이 실제로 차감되어야 함").toBe(30_000_000);
  });

  it("expenses=0 + 둘 다 미입력 → 0/0", () => {
    const r = run({ expenses: 0 });
    expect(r.land.directExpenses).toBe(0);
    expect(r.building.directExpenses).toBe(0);
  });
});

describe("split — 자본적지출 잔액 대칭화 (A-6, legacy expenses > 0 한정)", () => {
  // 총 expenses 1억 · landRatio 0.6 → 미입력 시 6천만 / 4천만
  // ⚠️ expenses > 0은 legacy `directExpenses` 마이그레이션 데이터에서만 발생한다.
  const EXPENSES = { expenses: 100_000_000 };

  it("케이스 12-a: 둘 다 미입력 → 비율 안분 6천만 / 4천만 (회귀 방어)", () => {
    const r = run(EXPENSES);
    expect(r.land.directExpenses).toBe(60_000_000);
    expect(r.building.directExpenses).toBe(40_000_000);
  });

  it("케이스 12: 🔴 건물만 3천만 → 토지 = 잔액 7천만 (현행: 6천만 → 합계 9천만)", () => {
    const r = run({ ...EXPENSES, buildingDirectExpenses: 30_000_000 });
    expect(r.building.directExpenses).toBe(30_000_000);
    expect(r.land.directExpenses, "토지 = 총경비 − 건물(잔액)").toBe(70_000_000);
    expect(
      r.land.directExpenses + r.building.directExpenses,
      "합계는 총 자본적지출과 일치해야 함",
    ).toBe(100_000_000);
  });

  it("케이스 12-b: 토지만 7천만 → 건물 = 잔액 3천만 (회귀 방어 — 이미 정상)", () => {
    const r = run({ ...EXPENSES, landDirectExpenses: 70_000_000 });
    expect(r.land.directExpenses).toBe(70_000_000);
    expect(r.building.directExpenses).toBe(30_000_000);
  });

  it("⚠️ explicitDirect 오염 방지: 건물만 입력 시 토지 swap 자격은 여전히 '미입력'", () => {
    // splitPair가 채운 토지 계산값을 explicitDirect로 넘기면 swap 발화 조건이 뒤바뀐다.
    // 입력 원본(input.landDirectExpenses !== undefined)을 그대로 봐야 한다.
    const r = run({
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated",
      acquisitionPrice: 0,
      expenses: 900_000_000,
      buildingDirectExpenses: 10_000_000, // 건물만 명시
    });
    // 토지는 사용자가 명시하지 않았으므로 swap 자격 없음 → 본문(개산공제만)
    expect(r.land.swapApplied ?? false, "미입력 토지에 swap이 붙으면 안 됨").toBe(false);
  });
});
