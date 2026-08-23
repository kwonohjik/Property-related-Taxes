/**
 * R-15 — §166 분기가 `acquisitionOverride`를 **되돌리지 않는다** (2026-08-23)
 *
 * ## 결함
 *
 * `transfer-tax.ts` STEP 0.65의 재개발 분기는 상속이면 취득가액을 §163⑨ 평가액으로 교체했다.
 * 그런데 그 앞 STEP 0.46(`resolveAcquisitionOverride`)의 계약은 「STEP 2 결정 결과를 **무시하고**
 * 본 값 강제」다 — 뒤에 오는 §166 분기가 그것을 **되돌리고 있었다**.
 *
 * 실제 발동 경로는 **가업상속공제 §97의2④**다. `applyFamilyBusinessCgtStep`이
 * `{ acquisitionOverride: imputedAcquisitionPrice }`로 `calculateTransferTax`를 **재귀 호출**하는데,
 * 그 재귀 입력(`inputWithoutFb`)은 `familyBusinessInheritance`만 제거하고 `inheritedAcquisition`과
 * `acquisitionCause: "inheritance"`를 **그대로 넘긴다** ⇒ §166 분기의 조건을 그대로 만족한다.
 *
 * ## 실측 (재개발APT · 양도 9억 · 피상속인 취득가 5억 · 상속개시일 평가액 1억 · 적용률 0.5)
 *
 * | | 의제세액 | 일반세액 |
 * |---|---|---|
 * | `inheritedAcquisition` 없음 | 135,133,664 | 211,178,735 |
 * | 있음 (**수정 전**) | **211,178,735** | 211,178,735 | ← 의제 산식이 일반과 같아졌다
 * | 있음 (수정 후) | 135,133,664 | 211,178,735 |
 *
 * 의제세액 **76,045,071원 과대**였다. 그리고 §18의2⑩ 공제액은
 * `max(0, 의제 − 일반)`이라 두 값이 같아지면 **공제 판정 자체가 무의미**해진다.
 *
 * **도달 가능한 활성 결함이었다** — ⑤ `FamilyBusinessInheritanceTransferSection`은
 * `acquisitionCause === "inheritance"`면 **assetKind 분기 없이** 렌더되고, ④⑫⑭ 배관도 모두 있으며,
 * 재개발APT·입주권 둘 다 ⑧ validate를 통과한다(실측).
 *
 * ## 법령
 *
 * 「소득세법」 **§97의2④**(mst 280405 실독)는 **법률 단서**로 취득가액을 의제한다:
 *
 * > 가업상속공제가 적용된 자산의 양도차익을 계산할 때 … **다만, 취득가액은 다음 각 호의 금액을
 * > 합한 금액으로 한다.** 1. 피상속인의 취득가액 × 가업상속공제적용률
 * > 2. 상속개시일 현재 해당 자산가액 × (1 − 가업상속공제적용률)
 *
 * §163⑨은 **시행령**이고 「법 §97①1호 가목을 적용할 때」의 규정이라 이 특례를 덮을 수 없다.
 * ⇒ override가 이기는 것이 법령 정합이다.
 *
 * ## ⛔ 주의
 *
 * override가 **없을 때** 그 블록은 no-op이다(`resolveInheritedRedevelopmentAcqPrice`가 반환하는
 * 값은 STEP 0.45가 이미 넣은 값과 항상 같다 — 상세는 `transfer-tax.ts` 주석). 그래서 R-10의
 * 뮤테이션 M-4(블록 통째 무력화)가 **10건 전부 통과**했다. 이 파일이 그 사각지대를 메운다.
 * 블록을 지우지 말 것 — 이제 override 가드가 그 유일한 실효 동작이다.
 *
 * ## 판별력 (뮤테이션 3회 실측)
 *
 * | 뮤테이션 | 결과 |
 * |---|---|
 * | M-16 override 가드 제거(결함 재현) | ✅ **O-01·O-02·O-03 3건 실패** |
 * | M-18 가드 반전(`!== undefined`) | ✅ **같은 3건 실패** |
 * | M-17 블록 통째 무력화 | 🔵 **5건 전부 통과 — 예상된 결과** |
 *
 * 🔑 **M-17이 통과하는 것이 곧 no-op 분석의 확증이다.** override가 없으면 이 블록이 무엇을 하든
 * 결과가 같다. 따라서 **O-05는 판별력이 없다** — 어떤 뮤테이션으로도 실패시킬 수 없는 구간을
 * 본다. 그럼에도 남기는 이유는 값(100,000,000)을 검증해 **가드 추가가 §163⑨ 경로를 과잉
 * 차단하지 않았음**을 문서화하고, 상류(STEP 0.45)가 바뀌면 잡히기 때문이다.
 * (이번 세션에서 「항상 참인 단언」 2건을 발견한 뒤로, 판별력 없는 케이스는 **그렇다고 명시**한다.)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const rates = makeMockRates();

/** §97의2④ 의제 취득가액 = 500,000,000 × 0.5 + 100,000,000 × 0.5 = 300,000,000 */
const IMPUTED_ACQ = 300_000_000;
/** 의제 산식 결정세액 — override가 살아 있을 때의 값 */
const CGT_UNDER_97_2_4 = 135_133_664;
/** 일반 산식 결정세액 — 상속개시일 평가액(1억) 기준 */
const CGT_UNDER_97 = 211_178_735;

function build(o: {
  propertyType: "redevelopment_apt" | "right_to_move_in" | "housing";
  withInherited: boolean;
  withFb?: boolean;
}): TransferTaxInput {
  const isRedev = o.propertyType !== "housing";
  return baseTransferInput({
    propertyType: o.propertyType,
    acquisitionCause: "inheritance",
    transferPrice: 900_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2020-01-01"),
    acquisitionPrice: 100_000_000,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...(isRedev
      ? {
          redevelopment:
            o.propertyType === "right_to_move_in"
              ? { ...case44RedevelopmentInfo(), subject: "right" as const }
              : case44RedevelopmentInfo(),
        }
      : {}),
    ...(o.withInherited
      ? {
          inheritedAcquisition: {
            inheritanceDate: new Date("2020-01-01"),
            assetKind: "house_apart",
            reportedValue: 100_000_000,
            reportedMethod: "supplementary",
          },
        }
      : {}),
    ...(o.withFb !== false
      ? {
          familyBusinessInheritance: {
            decedentAcquisitionPrice: 500_000_000,
            inheritanceMarketValue: 100_000_000,
            fbDeductionAppliedRate: 0.5,
            inheritanceDate: "2020-01-01",
          },
        }
      : {}),
  }) as TransferTaxInput;
}

describe("R-15 — §166 분기가 §97의2④ override를 되돌리지 않는다", () => {
  it("[O-01] 재개발APT + §163⑨ + 가업상속 → 의제세액이 §163⑨ 없을 때와 같다", () => {
    const withInh = calculateTransferTax(
      build({ propertyType: "redevelopment_apt", withInherited: true }),
      rates,
    );
    const withoutInh = calculateTransferTax(
      build({ propertyType: "redevelopment_apt", withInherited: false }),
      rates,
    );

    expect(withInh.familyBusinessDetail?.imputedAcquisitionPrice).toBe(IMPUTED_ACQ);
    // 종전 결함: 211,178,735 (일반 산식과 동일해졌다)
    expect(withInh.familyBusinessDetail?.cgtUnderSection97_2_4).toBe(CGT_UNDER_97_2_4);
    expect(withInh.familyBusinessDetail?.cgtUnderSection97).toBe(CGT_UNDER_97);
    // §163⑨ 유무가 의제 산식을 바꾸면 안 된다 — override가 이기기 때문이다.
    expect(withInh.familyBusinessDetail?.cgtUnderSection97_2_4).toBe(
      withoutInh.familyBusinessDetail?.cgtUnderSection97_2_4,
    );
  });

  /**
   * 입주권은 §166①(인가전·인가후 2분할), 완공APT는 §166②라 **산식이 달라 세액도 다르다**.
   * 그러므로 O-01의 상수와 비교하지 않고 **자기 자신의 §163⑨ 유무**로 비교한다 —
   * 계약은 「값이 얼마인가」가 아니라 「§163⑨이 override를 흔들지 않는가」이기 때문이다.
   */
  it("[O-02] 입주권도 같다 — 같은 §166 분기를 탄다", () => {
    const withInh = calculateTransferTax(
      build({ propertyType: "right_to_move_in", withInherited: true }),
      rates,
    );
    const withoutInh = calculateTransferTax(
      build({ propertyType: "right_to_move_in", withInherited: false }),
      rates,
    );

    expect(withInh.familyBusinessDetail?.imputedAcquisitionPrice).toBe(IMPUTED_ACQ);
    expect(withInh.familyBusinessDetail?.cgtUnderSection97_2_4).toBe(
      withoutInh.familyBusinessDetail?.cgtUnderSection97_2_4,
    );
    // 완공APT(§166②)와 다른 값이어야 한다 — 같으면 분기가 잘못 잡힌 것이다.
    expect(withInh.familyBusinessDetail?.cgtUnderSection97_2_4).not.toBe(CGT_UNDER_97_2_4);
  });

  it("[O-03] 의제 산식이 최종 양도차익에도 반영된다 (detail만 맞고 본계산이 틀리는 것 방지)", () => {
    const withInh = calculateTransferTax(
      build({ propertyType: "redevelopment_apt", withInherited: true }),
      rates,
    );
    const withoutInh = calculateTransferTax(
      build({ propertyType: "redevelopment_apt", withInherited: false }),
      rates,
    );
    expect(withInh.transferGain).toBe(withoutInh.transferGain);
  });

  it("[O-04] 비-재개발(주택)은 종전에도 정상이었다 — 회귀 방어", () => {
    const withInh = calculateTransferTax(
      build({ propertyType: "housing", withInherited: true }),
      rates,
    );
    const withoutInh = calculateTransferTax(
      build({ propertyType: "housing", withInherited: false }),
      rates,
    );
    expect(withInh.familyBusinessDetail?.cgtUnderSection97_2_4).toBe(
      withoutInh.familyBusinessDetail?.cgtUnderSection97_2_4,
    );
  });

  /**
   * 가드가 **override 있을 때만** 걸려야 한다. 가업상속이 없으면 §163⑨ 경로는 종전대로 살아 있다
   * (R-10에서 확정한 「§163⑨ > `redevActualAcquisitionPrice`」 우선순위).
   *
   * ⚠️ **이 케이스는 판별력이 없다** — override가 없는 구간은 no-op이라 M-16·M-17·M-18 어느
   *   뮤테이션으로도 실패하지 않는다(위 표). 값 검증과 상류(STEP 0.45) 회귀 감지가 존재 이유다.
   */
  it("[O-05] 가업상속 없음 → §163⑨ 값이 그대로 유지된다 (과잉 차단 방지 · 판별력 없음)", () => {
    const r = calculateTransferTax(
      build({ propertyType: "redevelopment_apt", withInherited: true, withFb: false }),
      rates,
    );
    expect(r.familyBusinessDetail).toBeUndefined();
    // §163⑨ 평가액 100,000,000이 종전자산 취득가액으로 채택된다.
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(100_000_000);
  });
});
