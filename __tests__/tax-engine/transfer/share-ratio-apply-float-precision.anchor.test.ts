/**
 * 지분 규약 `applyRatio` 부동소수 1원 과소 — 엔진 단위 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/share-ratio-apply-float-precision.plan.md §2·§3·§5
 *
 * 옛 식 `Math.floor(amount × ratio)`는 `ratio`가 이진 소수(0.7 → 0.6999…)라서 참값이 정수인 `amount × 7/10`에서 1이 깎인다.
 * UI 지분 입력은 백분율 한 칸(`OwnershipRatioInput`)이라 실제 비율은 항상 유한 소수 `P/100`이다 —
 * `getOwnershipRatio` = `parseFloat(P) / parseFloat("100")`. 아래 `uiRatio`가 그 경로를 그대로 흉내 낸다.
 *
 * ⚠️ `String(ratio)`가 짧은 십진 표현을 돌려주는 비율은 70%·35%·57%처럼 일부다. 소수 1~2자리 %(90.6 · 58.12)는
 *    `parseFloat(P) / 100`이 한두 ulp 어긋나 `String`이 17자리(`0.9059999999999999`)가 되는 경우가 약 27%다 —
 *    그래서 판정은 `String` 자릿수가 아니라 「10자리 이하 십진수와 2ulp 이내로 같은가」다(아래 «소수 % 전수» 가 고정).
 *
 * 기대값은 리터럴 + 테스트 안의 BigInt 오라클(엔진 함수와 구현이 겹치지 않는다)로 이중 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  applyRatio,
  computeEstimatedDeduction,
  computeLumpSumDeductionBase,
} from "@/lib/tax-engine/tax-utils";
import { scaleBurdenedGiftInfo } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 화면 입력 경로와 같은 비율 — `getOwnershipRatio` */
const uiRatio = (pct: string): number => Math.min(parseFloat(pct) / parseFloat("100"), 1);

/** 참값 floor(amount × P / 100) — P를 십진 문자열 그대로 정수화 */
function exactPct(amount: number, pct: string): number {
  const [a, b = ""] = pct.split(".");
  return Number((BigInt(amount) * BigInt(a + b)) / (100n * 10n ** BigInt(b.length)));
}
/** 옛 식 */
const oldApply = (amount: number, ratio: number) => Math.floor(amount * ratio);

describe("applyRatio — 백분율 입력(유한 소수)은 참값과 같다", () => {
  it("전제: 아래 사례는 모두 옛 식이 1원 과소다 (전제가 깨지면 anchor가 의미를 잃는다)", () => {
    const cases: [number, string, number][] = [
      [1_518_341_200, "70", 1_062_838_840],
      [170_000_000, "70", 119_000_000],
      [170_000_000, "35", 59_500_000],
      [100_000_000, "57", 57_000_000],
      [100_000_000, "90.6", 90_600_000],
      [100_000_000, "58.12", 58_120_000],
    ];
    for (const [x, p, want] of cases) {
      expect(exactPct(x, p), `${x}×${p}% 참값`).toBe(want);
      expect(oldApply(x, uiRatio(p)), `${x}×${p}% 옛 식(1원 과소)`).toBe(want - 1);
    }
  });

  it("🔴 70% — 1,518,341,200 → 1,062,838,840 (옛 …839)", () => {
    expect(applyRatio(1_518_341_200, uiRatio("70"))).toBe(1_062_838_840);
  });
  it("🔴 70% · 35% · 57% — 정수 %", () => {
    expect(applyRatio(170_000_000, uiRatio("70"))).toBe(119_000_000);
    expect(applyRatio(170_000_000, uiRatio("35"))).toBe(59_500_000);
    expect(applyRatio(100_000_000, uiRatio("57"))).toBe(57_000_000);
  });
  it("🔴 90.6% — 소수 1자리 % (parseFloat(90.6)/100 = 0.9059999999999999, String 16자리)", () => {
    expect(String(uiRatio("90.6")).split(".")[1].length).toBeGreaterThan(10); // String 자릿수만으로는 못 고친다는 전제
    expect(applyRatio(100_000_000, uiRatio("90.6"))).toBe(90_600_000);
  });
  it("🔴 58.12% — 소수 2자리 %", () => {
    expect(applyRatio(100_000_000, uiRatio("58.12"))).toBe(58_120_000);
  });

  it("🔑 정수 % 1~99 × 금액 격자 전수 — 참값과 1건도 다르지 않다", () => {
    const amounts = [1, 7, 99, 1_000, 123_456_789, 170_000_000, 1_518_341_200, 4_999_999_999, 5_000_000_000];
    let bad = 0;
    for (let p = 1; p <= 99; p++) for (const x of amounts) if (applyRatio(x, uiRatio(String(p))) !== exactPct(x, String(p))) bad++;
    expect(bad).toBe(0);
  });
  it("🔑 소수 1자리 % (0.1~99.9) 전수 × 금액 격자", () => {
    const amounts = [100_000_000, 110_000_000, 170_000_000, 1_518_341_200];
    let bad = 0;
    for (let t = 1; t <= 999; t++) {
      const p = (t / 10).toFixed(1);
      for (const x of amounts) if (applyRatio(x, uiRatio(p)) !== exactPct(x, p)) bad++;
    }
    expect(bad).toBe(0);
  });
  it("🔑 소수 2자리 % (0.01~99.99) 전수 × 금액 격자", () => {
    const amounts = [100_000_000, 121_930_000, 170_000_000, 1_518_341_200];
    let bad = 0;
    for (let t = 1; t <= 9999; t++) {
      const p = (t / 100).toFixed(2);
      for (const x of amounts) if (applyRatio(x, uiRatio(p)) !== exactPct(x, p)) bad++;
    }
    expect(bad).toBe(0);
  });
  it("🔑 소수 4자리 % (33.3333 · 66.6667 등) 표본", () => {
    let bad = 0;
    for (let t = 1; t <= 99_999; t += 7) {
      const p = (t / 1000).toFixed(4);
      for (const x of [100_000_000, 900_000_000, 1_518_341_200]) if (applyRatio(x, uiRatio(p)) !== exactPct(x, p)) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe("applyRatio — 레거시 분자/분모(순환 소수)는 현행 값을 유지한다", () => {
  it("1/3 · 2/3 — 참값과 같고 옛 식과도 같다 (십진 정확 방식은 1 과소가 나는 지점)", () => {
    expect(applyRatio(300_000_000, 1 / 3)).toBe(100_000_000);
    expect(applyRatio(900_000_000, 2 / 3)).toBe(600_000_000);
    expect(applyRatio(3_000_000, 1 / 3)).toBe(1_000_000);
    for (const x of [1, 100, 999_999_999, 5_000_000_000]) {
      expect(applyRatio(x, 1 / 3)).toBe(oldApply(x, 1 / 3));
      expect(applyRatio(x, 2 / 3)).toBe(oldApply(x, 2 / 3));
    }
  });
  it("그 밖의 순환 소수 분수(6/11 · 3/7 · 1/7 · 15/26)는 옛 식과 같은 값 (이 PR이 건드리지 않는 갈래)", () => {
    for (const [n, d] of [[6, 11], [3, 7], [1, 7], [15, 26]]) {
      for (const x of [100_000_000, 700_000_000, 1_518_341_200]) {
        expect(applyRatio(x, n / d)).toBe(oldApply(x, n / d));
      }
    }
  });
});

describe("applyRatio — 경계 10자리", () => {
  it("🔑 소수 10자리 비율은 십진 정확: 1000억 × 0.1250105777 = 12,501,057,770 (옛 …769)", () => {
    expect(oldApply(100_000_000_000, 0.1250105777)).toBe(12_501_057_769);
    expect(applyRatio(100_000_000_000, 0.1250105777)).toBe(12_501_057_770);
  });
  it("🔑 소수 11자리 비율은 현행 float 식 그대로: 1000억 × 0.12500020381 → …380 (참값 …381, 의도된 한계)", () => {
    expect(oldApply(100_000_000_000, 0.12500020381)).toBe(12_500_020_380);
    expect(applyRatio(100_000_000_000, 0.12500020381)).toBe(12_500_020_380);
  });
  it("비율 1 · 0 · 0.5", () => {
    expect(applyRatio(1_518_341_200, 1)).toBe(1_518_341_200);
    expect(applyRatio(1_518_341_200, 0)).toBe(0);
    expect(applyRatio(1_518_341_201, 0.5)).toBe(759_170_600);
  });
});

describe("applyRatio — 정수가 아닌 금액·음수 금액", () => {
  it("비정수 amount는 현행 float 식 그대로", () => {
    expect(applyRatio(1234.5, 0.7)).toBe(oldApply(1234.5, 0.7));
    expect(applyRatio(10.5, 0.2)).toBe(oldApply(10.5, 0.2));
    expect(applyRatio(0.1, 0.3)).toBe(oldApply(0.1, 0.3));
  });
  it("비정상 비율(NaN · ±Infinity · 1e300)은 현행 float 식 그대로 — 십진화가 BigInt 예외를 던지지 않는다", () => {
    expect(applyRatio(5, Number.NaN)).toBeNaN();
    expect(applyRatio(5, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(applyRatio(5, Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(applyRatio(3, 1e300)).toBe(oldApply(3, 1e300));
  });
  it("안전정수를 넘는 amount · NaN · Infinity도 현행 float 식 그대로", () => {
    expect(applyRatio(2 ** 60, 0.7)).toBe(oldApply(2 ** 60, 0.7));
    expect(applyRatio(Number.NaN, 0.7)).toBeNaN();
    expect(applyRatio(Number.POSITIVE_INFINITY, 0.7)).toBe(Number.POSITIVE_INFINITY);
  });
  it("🔑 음수 amount — BigInt 나눗셈은 0 방향 절사라 floor로 보정한다 (−1 × 0.3 → −1, −10 × 0.7 → −7)", () => {
    expect(applyRatio(-1, 0.3)).toBe(-1);
    expect(applyRatio(-10, 0.7)).toBe(-7);
    expect(applyRatio(-1_518_341_200, 0.7)).toBe(-1_062_838_840);
    expect(applyRatio(-170_000_001, 0.7)).toBe(Math.floor(-119_000_000.7));
  });
});

describe("computeLumpSumDeductionBase / computeEstimatedDeduction — 개산공제 base (영 §163⑥)", () => {
  it("🔴 지분 70%: 1,518,341,200 → 지분 기준시가 1,062,838,840 (옛 …839)", () => {
    expect(computeLumpSumDeductionBase(1_518_341_200, uiRatio("70"))).toBe(1_062_838_840);
  });
  it("지분 100%는 그대로", () => {
    expect(computeLumpSumDeductionBase(1_518_341_200, 1)).toBe(1_518_341_200);
  });
  it("🔴 개산공제 = 지분 기준시가 × 3% — 170,000,000 × 70% × 3% = 3,570,000 (옛 base 118,999,999 → 3,569,999)", () => {
    expect(computeLumpSumDeductionBase(170_000_000, uiRatio("70"))).toBe(119_000_000);
    expect(computeEstimatedDeduction(170_000_000, 0.03, uiRatio("70"))).toBe(3_570_000);
  });
});

describe("scaleBurdenedGiftInfo — 부담부증여 평가 지분 축소 (burdened-gift-valuation.ts)", () => {
  const info = {
    landStdPriceAtTransfer: 170_000_000,
    buildingStdPriceAtTransfer: 100_000_000,
    landStdPriceAtAcquisition: 1_518_341_200,
    buildingStdPriceAtAcquisition: 110_000_000,
    giftBuildingStdPriceAtTransfer: 170_000_000,
    marketValueAtTransfer: 100_000_000,
    actualAcquisitionTotal: 170_000_000,
    rightValuation: { memberRightsValue: 170_000_000, paidInstallments: 100_000_000, premium: 110_000_000 },
  } as unknown as BurdenedGiftInfo;

  it("🔴 70% — 기준시가 4개·평가액이 참값(리터럴)이다", () => {
    const s = scaleBurdenedGiftInfo(info, uiRatio("70"));
    expect(s.landStdPriceAtTransfer).toBe(119_000_000);
    expect(s.buildingStdPriceAtTransfer).toBe(70_000_000);
    expect(s.landStdPriceAtAcquisition).toBe(1_062_838_840);
    expect(s.buildingStdPriceAtAcquisition).toBe(77_000_000);
    expect(s.giftBuildingStdPriceAtTransfer).toBe(119_000_000);
    expect(s.marketValueAtTransfer).toBe(70_000_000);
    expect(s.actualAcquisitionTotal).toBe(119_000_000);
  });
  it("🔴 조합원입주권 3항 — 합이 floor(총액 × 지분율)와 같다 (잔액 흡수)", () => {
    const s = scaleBurdenedGiftInfo(info, uiRatio("70"));
    const rv = s.rightValuation!;
    expect(rv.memberRightsValue).toBe(119_000_000);
    expect(rv.paidInstallments).toBe(70_000_000);
    expect(rv.memberRightsValue + rv.paidInstallments + rv.premium).toBe(exactPct(380_000_000, "70"));
  });
});
