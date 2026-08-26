/**
 * F-05 Pre-Do anchor — VII-37 정상사용면적비율에 상·하한 검증이 없어 오입력이 그대로 배율이 된다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price-helpers.ts:663-664`
 *   if (features.normalUseRatio !== undefined)
 *     groupVII.push({ no: 37, rate: Math.round(features.normalUseRatio * 100) });
 *   → 입력을 그대로 지수화한다. 0~1 범위 검증이 엔진에도 `validateBuildingStdPriceForm`에도 없다.
 *   모달 입력은 max 없는 자유 `DecimalInput` 이고 hint 에 「0~1」이라고만 적혀 있다
 *   (`components/calc/building-std-price/AdjustmentRateModal.tsx:369-376`).
 *
 * 같은 파일의 형제 경로 `adjustmentFromNos` 는 도메인 밖 번호를 `BuildingStdPriceError` 로 차단한다
 * ⇒ 저장소 관행은 「도메인 밖 = 검증 오류」이고 비율 입력형만 예외였다.
 *
 * 법령: 국세청 「건물 기준시가 계산방법」 부속 조정률 고시 VII-37(정상 사용 면적비율)
 *   — **고시 본문 미확인**(전사본 `special-adjustment-rate.ts:147` 기준).
 *   위임근거는 「상속세 및 증여세법」 제61조 제1항 제2호.
 *   ⚠️ 「비율이므로 0 초과 1 이하」라는 것은 정의상 명백해 고시 확인 없이도 성립한다.
 *      다만 **하한을 0 초과로 볼지 0 이상으로 볼지**는 고시 문언에 달려 있다 — 아래 주석 참조.
 *
 * 실측(2026-08-26 · 상증 2025 · rc · 용도49 · 500㎡ · 공시지가 7,500,000):
 *   0.85  → 조정률 0.765 · 기준시가 1,171,500,000     (정상)
 *   85    → 조정률 76.5  · 기준시가 117,162,000,000   (**100배**)
 *   -0.5  → 조정률 -0.45 · 기준시가 -689,000,000      (**음수**)
 *   0.004 → 조정률 0     · 기준시가 0                 (Math.round 양자화 — F-41 축)
 *   0     → 조정률 0     · 기준시가 0
 *   네 경우 모두 validate 는 null(통과), warnings 는 빈 배열이었다.
 *
 * ⚠️ §1 은 **F-05 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { validateBuildingStdPriceForm, initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const BASE: BuildingStandardPriceInput = {
  taxType: "inheritance_gift",
  floorArea: 500,
  builtYear: 2020,
  valuationYear: 2025,
  valuation: { structureKey: "rc", usageNo: 49, landPricePerM2: 7_500_000 },
};

const withRatio = (normalUseRatio: number): BuildingStandardPriceInput => ({
  ...BASE,
  specialFeatures: { normalUseRatio },
});

describe("F-05 VII-37 정상사용면적비율 — §1 범위 밖 입력 차단 (수정 전 실패)", () => {
  it("백분율 오입력(85)은 검증 오류로 차단된다 — 현재는 기준시가 117,162,000,000(100배)", () => {
    expect(() => calcBuildingStandardPrice(withRatio(85))).toThrow(/정상 사용 면적비율/);
  });

  it("1 초과(1.5)는 검증 오류로 차단된다", () => {
    expect(() => calcBuildingStandardPrice(withRatio(1.5))).toThrow(/정상 사용 면적비율/);
  });

  it("음수(-0.5)는 검증 오류로 차단된다 — 현재는 기준시가가 음수가 된다", () => {
    expect(() => calcBuildingStandardPrice(withRatio(-0.5))).toThrow(/정상 사용 면적비율/);
  });

  /**
   * 0 은 「정상 사용 면적이 전혀 없다」는 뜻이고 결과는 기준시가 0원이 된다.
   * 평가로서 의미가 없고 조용한 0원은 오산과 구별되지 않으므로 하한을 **0 초과**로 잡는다.
   * 고시 문언이 0 을 허용한다면 이 단언을 완화할 것 — **고시 본문 미확인**.
   */
  it("0 은 검증 오류로 차단된다 — 현재는 경고 없이 기준시가 0원", () => {
    expect(() => calcBuildingStandardPrice(withRatio(0))).toThrow(/정상 사용 면적비율/);
  });
});

describe("F-05 VII-37 정상사용면적비율 — §2 정상 범위는 그대로 (수정 후에도 불변)", () => {
  it("0.85 → 조정률 0.765 · 기준시가 1,171,500,000", () => {
    const r = calcBuildingStandardPrice(withRatio(0.85));
    expect(r.valuation?.adjustmentRate).toBe(0.765);
    expect(r.valuation?.standardPrice).toBe(1_171_500_000);
  });

  it("1(전부 정상 사용) 은 허용된다 — 상한은 1 이하다", () => {
    expect(() => calcBuildingStandardPrice(withRatio(1))).not.toThrow();
  });

  it("VII-37 미입력이면 아무 영향이 없다", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE })).not.toThrow();
  });
});

describe("F-05 VII-37 정상사용면적비율 — §3 ⑧ validation 과 엔진이 같은 술어를 쓴다 (수정 전 실패)", () => {
  /**
   * 「UI 통과 ↔ 엔진 차단」 모순을 막는 것이 이 축의 핵심이다.
   * validate 가 통과시킨 입력을 엔진이 throw 하면 사용자는 폼에서 고칠 수단이 없다.
   */
  const formWith = (ratio: number) => ({
    ...initialBuildingStdPriceForm,
    taxType: "inheritance_gift" as const,
    builtYear: "2020",
    valuationYear: "2025",
    eventDate: "2025-06-01",
    floorArea: "500",
    valStructureKey: "rc",
    valUsageNo: "49",
    valLandPrice: "7500000",
    adjustmentMode: "features" as const,
    adjustmentFeatures: { normalUseRatio: ratio },
  });

  it("validate 가 백분율 오입력(85)을 차단한다", () => {
    expect(validateBuildingStdPriceForm(formWith(85)) ?? "").toMatch(/정상 사용 면적비율/);
  });

  it("validate 가 음수(-0.5)를 차단한다", () => {
    expect(validateBuildingStdPriceForm(formWith(-0.5)) ?? "").toMatch(/정상 사용 면적비율/);
  });

  it("validate 는 정상 범위(0.85)를 차단하지 않는다", () => {
    expect(validateBuildingStdPriceForm(formWith(0.85)) ?? "").not.toMatch(/정상 사용 면적비율/);
  });
});

describe("F-41 VII-37 — §4 비율을 그대로 조정률로 적용한다 (수정 전 실패)", () => {
  /**
   * ✅ **고시 본문 확보(2026-08-26) — 국세청 고시 제2025-39호 제11조 구분 VII 번호 37**
   *    적용대상: "화재, 지진 등의 원인에 의하여 건물의 일부가 훼손 또는 사용되지 않는 경우 →
   *    **정상적으로 사용되는 면적비율을 조정률로 적용한다**"
   *    지수 칸이 다른 항목처럼 정수(90·80·60·30·0)가 아니라 **「정상 사용 비율」** 로 적혀 있다
   *    ⇒ 비율 그 자체가 조정률이며, 정수 퍼센트로 양자화할 근거가 없다.
   *
   * 🔴 종전 구현은 `Math.round(features.normalUseRatio * 100)` 으로 **정수 퍼센트에 억지로 끼웠다.**
   *    실측(연면적 2,000㎡ — II 연면적이 100(중립)이라 VII-37 단독으로 관측된다):
   *      0.855  → 0.86   (+0.585%)
   *      0.845  → 0.85   (+0.592%)
   *      0.3333 → 0.33   (−0.990%)
   *      0.125  → 0.13   (**+4.000%**)
   *      0.004  → 0      (**−100% · 기준시가 0원**)
   *    방향이 양쪽으로 갈리고, 0.005 미만은 조정률 0이 되어 기준시가가 통째로 0이 됐다.
   */

  /** 연면적 2,000㎡ ⇒ II 연면적 #10 = 100(중립) ⇒ 조정률 = VII-37 단독 */
  const isolated = (normalUseRatio: number): BuildingStandardPriceInput => ({
    ...BASE,
    floorArea: 2000,
    specialFeatures: { normalUseRatio },
  });

  it.each([[0.855], [0.845], [0.3333], [0.125], [0.004], [0.999]])(
    "비율 %s 가 그대로 조정률이 된다",
    (r) => {
      expect(calcBuildingStandardPrice(isolated(r)).valuation?.adjustmentRate).toBe(r);
    },
  );

  it("0.005 미만도 기준시가가 0이 되지 않는다 — 종전에는 양자화로 0원이었다", () => {
    const r = calcBuildingStandardPrice(isolated(0.004));
    expect(r.valuation?.adjustmentRate).toBe(0.004);
    expect(r.valuation?.standardPrice).toBeGreaterThan(0);
  });

  it("정수 퍼센트 비율은 종전과 동일 (역방향 가드)", () => {
    expect(calcBuildingStandardPrice(isolated(0.85)).valuation?.adjustmentRate).toBe(0.85);
    expect(calcBuildingStandardPrice(isolated(0.3)).valuation?.adjustmentRate).toBe(0.3);
  });

  it("다른 구분과 곱해질 때도 정확하다 — 500㎡(II #9 = 90) × VII-37 0.855", () => {
    // 0.9 × 0.855 = 0.7695
    expect(
      calcBuildingStandardPrice({ ...BASE, specialFeatures: { normalUseRatio: 0.855 } }).valuation
        ?.adjustmentRate,
    ).toBe(0.7695);
  });
});
