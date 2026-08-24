/**
 * anchor F20 — 겸용주택 §104⑤2호 파트 세액에 **§104① 후단**이 내장된다.
 *
 * ── 조문 ─────────────────────────────────────────────────────────────────
 * 「소득세법」 **제104조 제1항 후단**: "하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에
 * **해당**할 때에는 해당 세율을 적용하여 계산한 양도소득 **산출세액 중 큰 것**을 그 세액으로 한다."
 *   · 1호 = §94①1호·2호·4호 자산 → **§55①**에 따른 세율(보유기간 한정 없음)
 *   · 2호 = 1년 이상 2년 미만 40%(주택·조합원입주권·분양권 60%)
 * 겸용의 상가토지분·상가건물분은 §94①1호 자산이라 보유 1~2년이면 **1호와 2호에 동시 해당**한다.
 *
 * 「소득세법」 **제104조 제5항 제2호 본문**: "제1항부터 제4항까지 및 제7항의 **규정에 따라
 * 계산한** 자산별 양도소득 산출세액 합계액" ⇒ 파트 세액에 후단이 **내장**되어야 한다.
 * (⑤ 본문의 1호·2호 MAX로는 구제되지 않는다 — 1호는 "합계액에 §55①"이라는 별개 규정이다.)
 *
 * ── 결함 ─────────────────────────────────────────────────────────────────
 * `buildTotalTax`의 clause2는 §104⑦ 가산이 붙는 파트만 MAX를 수행하고, 순수 단기 파트는
 * 같은 세율끼리 한 버킷으로 묶어 `applyRate(버킷합계, r)` 한 줄로 끝냈다 — **비교가 없었다**.
 *
 * ── ⛔ 채택하지 않은 수정 ────────────────────────────────────────────────
 * 「단일세율 **버킷** 세액을 max(applyRate, 누진)로」는 **금지**다. 후단의 단위는
 * 「**하나의 자산**」이고 누진세액은 볼록(P(Σbᵢ) ≥ ΣP(bᵢ))이라, 버킷 합계 기준 비교는
 * 조문이 허용하지 않는 합산 효과를 만들어 **과다과세**가 된다. B-1이 그 경계를 고정한다.
 *
 * ── 실측(buildTotalTax 직접 호출) ────────────────────────────────────────
 * 역전 경계: §55① 최고구간 0.45B − 65,940,000 > 0.4B ⇔ **B > 1,318,800,000**.
 * 50%(1년 미만 비주택)·60%·70%(주택)는 누진에 지지 않는다.
 */
import { describe, it, expect } from "vitest";
import { buildTotalTax } from "@/lib/tax-engine/transfer-tax-mixed-use-totals";
import { calculateProgressiveTax } from "@/lib/tax-engine/tax-utils";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates } from "../_helpers/mock-rates";

const { brackets } = parseRatesFromMap(makeMockRates());
const BASIC = 2_500_000;

describe("F20 — 단기 파트에 §104① 후단(1호 vs 2·3호 MAX)이 걸린다", () => {
  it("🔴 A-1 상가토지 파트 과세표준이 역전점을 넘으면 §55① 누진이 채택된다", () => {
    // 주택(60%) 파트가 clause2를 clause1 위로 끌어올려 ⑤ 본문 MAX가 구제하지 못하는 조합.
    const t = buildTotalTax(
      1_000_000_000, // 주택분 양도소득금액
      1_500_000_000, // 상가분 합계
      0,
      brackets,
      BASIC,
      [
        { kind: "housing", income: 1_000_000_000, holdingYears: 1 },
        { kind: "commercial_land", income: 1_500_000_000, holdingYears: 1 },
        { kind: "commercial_building", income: 0, holdingYears: 1 },
      ],
      false,
    );
    // 기본공제는 최고세율(60%) 파트에 전액 귀속 → 주택 base 997,500,000
    const housingTax = Math.floor(997_500_000 * 0.6); // 598,500,000
    const landFlat = Math.floor(1_500_000_000 * 0.4); // 600,000,000
    const landProgressive = calculateProgressiveTax(1_500_000_000, brackets); // 609,060,000
    expect(landProgressive).toBeGreaterThan(landFlat); // 역전 성립 확인
    expect(t.rateBasis).toBe("clause2");
    // 수정 전 1,198,500,000 (= 598,500,000 + 600,000,000, 비교 없음) — 9,060,000 과소
    expect(t.transferTax).toBe(housingTax + landProgressive);
    expect(t.transferTax).toBe(1_207_560_000);
    expect(t.localTax).toBe(120_756_000);
  });

  it("🔴 A-2 역전점 **아래**에서는 단기세율이 그대로 남는다(과다과세 금지)", () => {
    const t = buildTotalTax(
      1_000_000_000,
      2_000_000_000,
      0,
      brackets,
      BASIC,
      [
        { kind: "housing", income: 1_000_000_000, holdingYears: 1 },
        { kind: "commercial_land", income: 1_200_000_000, holdingYears: 1 },
        { kind: "commercial_building", income: 800_000_000, holdingYears: 1 },
      ],
      false,
    );
    // 파트별로는 둘 다 40% 승 (1.2b: 480,000,000 > 474,060,000 / 800m: 320,000,000 > 300,060,000)
    expect(t.transferTax).toBe(598_500_000 + 480_000_000 + 320_000_000);
    expect(t.transferTax).toBe(1_398_500_000);
  });

  it("⛔ B-1 **버킷 합계**로 비교하지 않는다 — 볼록성 때문에 과다과세가 된다", () => {
    // A-2와 같은 입력. 상가 버킷 합계 2,000,000,000의 누진세액은 834,060,000으로
    // 파트별 합(800,000,000)보다 크다. 버킷 MAX를 채택하면 1,432,560,000이 되는데,
    // §104① 후단의 단위는 「하나의 자산」이라 그 합산은 조문 근거가 없다.
    const bucketProgressive = calculateProgressiveTax(2_000_000_000, brackets);
    expect(bucketProgressive).toBe(834_060_000);
    const t = buildTotalTax(
      1_000_000_000,
      2_000_000_000,
      0,
      brackets,
      BASIC,
      [
        { kind: "housing", income: 1_000_000_000, holdingYears: 1 },
        { kind: "commercial_land", income: 1_200_000_000, holdingYears: 1 },
        { kind: "commercial_building", income: 800_000_000, holdingYears: 1 },
      ],
      false,
    );
    expect(t.transferTax).not.toBe(598_500_000 + bucketProgressive); // 1,432,560,000 금지
  });

  it("B-2 주택 단기세율(60%)은 §55① 누진에 지지 않는다 — 무해성", () => {
    const t = buildTotalTax(
      3_000_000_000,
      0,
      0,
      brackets,
      BASIC,
      [{ kind: "housing", income: 3_000_000_000, holdingYears: 1 }],
      false,
    );
    expect(t.transferTax).toBe(Math.floor(2_997_500_000 * 0.6));
    expect(t.transferTax).toBe(1_798_500_000);
  });

  it("B-3 §104⑦ 중과 파트는 종전 규칙 그대로 — 누진+가산이 항상 1호 이상", () => {
    const t = buildTotalTax(
      2_000_000_000,
      0,
      0,
      brackets,
      BASIC,
      [{ kind: "housing", income: 2_000_000_000, holdingYears: 5, surchargeAddon: 0.3 }],
      false,
    );
    const base = 1_997_500_000;
    expect(t.transferTax).toBe(
      calculateProgressiveTax(base, brackets) + Math.floor(base * 0.3),
    );
  });
});
