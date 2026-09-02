/**
 * anchor: §104⑤ 비교과세 MAX를 **단일 자산에서도 무조건** 돌리는 것이 맞다 (2026-09-02 종결)
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * `transfer-tax-aggregate-pickers.ts`에 「단일 자산(`properties.length === 1`)에도 비교가
 * 도는 것은 §104⑤ 문언(「둘 이상 양도하는 경우」)과 어긋난다 — **미판정**」이 오래 남아 있었다.
 * 그 주석의 보류 근거(「`calcTax`가 §104① 후단을 수행하지 않아 이 MAX가 대신 공급한다」)는
 * **stale**이었다 — 후단은 2026-08-11 `f58f29df`에서 `compareWithClause1`로 구현됐고 주석은
 * 그보다 앞선다. 결론은 유지되지만 **이유가 둘 다 바뀐다**. 이 anchor가 그 둘을 잠근다.
 *
 * ❌ **재제안 금지 — 「자산 1건이면 §104⑤ MAX를 끈다」.**
 *   ①에서 과소과세가 되고(실측 9,590,000원), ②에서는 아무 효과가 없다.
 *   「자산 1건이라 §104⑤ 미적용」은 계획서
 *   `transfer-104-5-proviso-mixed-use-rate-gaps.plan.md` D-8에서 **이미 기각**된 독법이다.
 *
 * ── 근거 ───────────────────────────────────────────────────────────
 * [법문] §104⑤ 본문(법제처 MST 267581 실측):
 *   「해당 과세기간에 제94조제1항제1호ㆍ제2호 및 제4호에서 규정한 자산을 **둘 이상 양도하는 경우**
 *    양도소득 산출세액은 다음 각 호의 금액 중 **큰 것** … 으로 한다. 이 경우 제2호의 금액을
 *    계산할 때 제1항제8호 및 제9호의 자산은 동일한 자산으로 보고, **한 필지의 토지**가
 *    제104조의3에 따른 비사업용 토지와 그 외의 토지로 구분되는 경우에는 **각각을 별개의
 *    자산으로 보아** 양도소득 산출세액을 계산한다.」
 *
 * ⇒ ① 파트로 갈리는 자산은 후단의 **의제**로 「둘 이상」이 충족된다(2018.4.1. 양도분~).
 *   ② 파트가 없는 자산은 `calcTax`의 모든 분기가 §55① 누진 이상을 내므로 MAX가 **구조적 no-op**.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: "A",
    propertyLabel: "A",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

/** 「비교과세 (§104⑤)」 step의 두 후보를 읽는다 — 표시 문자열이 유일한 관측 지점이다. */
function comparison(r: ReturnType<typeof agg>): { byGroups: number; byGeneral: number } {
  const step = r.steps?.find((s) => s.label?.includes("비교과세"));
  const m = step?.formula?.match(/세율군별 ([\d,]+) vs 전체누진 ([\d,]+)/);
  if (!m) throw new Error(`비교과세 step을 찾지 못했다: ${step?.formula ?? "(step 없음)"}`);
  return {
    byGroups: Number(m[1].replace(/,/g, "")),
    byGeneral: Number(m[2].replace(/,/g, "")),
  };
}

/**
 * 주택 부수토지 배율 초과 → **부분** 비사업용(§104의3①5호).
 * 수도권 일반주거 3배 ⇒ 허용 = 건물바닥 × 3. 전체가 그보다 크면 초과분이 비사토가 된다.
 */
function partialNblDetails(landArea: number) {
  return {
    landType: "housing_site" as const,
    landArea,
    zoneType: "general_residential" as const,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-06-01"),
    housingFootprint: 100,
    isMetropolitanArea: true,
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

describe("§104⑤ 단일 자산 MAX — ① 파트 분할은 「둘 이상」이 의제로 충족된다", () => {
  it("S104-1: 🔴 부분 비사토 1필지(대지 400㎡·차익 6억) — 전체누진이 이긴다 (MAX가 실효)", () => {
    const r = agg([
      item({
        propertyType: "land",
        transferPrice: 600_000_000,
        isNonBusinessLand: true,
        nonBusinessLandDetails: partialNblDetails(400),
      } as Partial<TransferTaxItemInput>),
    ]);
    const c = comparison(r);
    expect(c.byGroups).toBe(151_670_000);
    expect(c.byGeneral).toBe(161_260_000);
    // 파트가 낮은 누진 구간을 두 번 타서 세율군별이 더 작아진다 — MAX를 끄면 이만큼 과소과세.
    expect(c.byGeneral - c.byGroups).toBe(9_590_000);
  });

  it("S104-2: 같은 자산에서 채택값이 실제로 전체누진이다 (MAX가 표시가 아니라 세액을 바꾼다)", () => {
    const r = agg([
      item({
        propertyType: "land",
        transferPrice: 600_000_000,
        isNonBusinessLand: true,
        nonBusinessLandDetails: partialNblDetails(400),
      } as Partial<TransferTaxItemInput>),
    ]);
    const step = r.steps?.find((s) => s.label?.includes("비교과세"));
    expect(step?.amount).toBe(161_260_000);
    expect(step?.formula).toContain("전체누진");
  });

  it("S104-3: 배율 이내(대지 300㎡)면 파트가 갈리지 않아 divergence가 없다 (대조군)", () => {
    const r = agg([
      item({
        propertyType: "land",
        transferPrice: 600_000_000,
        isNonBusinessLand: true,
        nonBusinessLandDetails: partialNblDetails(300),
      } as Partial<TransferTaxItemInput>),
    ]);
    const c = comparison(r);
    expect(c.byGroups).toBeGreaterThanOrEqual(c.byGeneral);
  });
});

describe("§104⑤ 단일 자산 MAX — ② 파트 없는 자산에서는 구조적 no-op", () => {
  /**
   * `calcTax`의 모든 분기가 §55① 누진 이상을 낸다:
   *   · 누진 호(1호) — 동일
   *   · 8호(비사토)·§104⑦(중과) — 「누진 + 가산」이라 항등식으로 이상
   *   · 2·3호(단기)·10호(미등기) — `compareWithClause1`이 1호와 비교해 **큰 것**을 취한다
   * 기록 1건이면 `groupTaxBase == generalTaxBase`이므로 `byGroups >= byGeneral`이 항상 성립.
   */
  const kinds: Array<[string, (g: number) => Partial<TransferTaxItemInput>]> = [
    ["사업용토지 11년(1호 누진)", (g) => ({ propertyType: "land", transferPrice: g })],
    ["비사토 11년(8호)", (g) => ({ propertyType: "land", transferPrice: g, isNonBusinessLand: true })],
    ["미등기(10호 70%)", (g) => ({ propertyType: "land", transferPrice: g, isUnregistered: true })],
    ["토지 19개월(2호 40%)", (g) => ({ propertyType: "land", transferPrice: g, acquisitionDate: D("2024-11-01") })],
    ["토지 8개월(3호 50%)", (g) => ({ propertyType: "land", transferPrice: g, acquisitionDate: D("2025-10-01") })],
    ["주택 19개월(2호 60%)", (g) => ({ propertyType: "housing", transferPrice: g, acquisitionDate: D("2024-11-01") })],
    ["주택 8개월(3호 70%)", (g) => ({ propertyType: "housing", transferPrice: g, acquisitionDate: D("2025-10-01") })],
    ["조정 3주택(§104⑦)", (g) => ({ propertyType: "housing", transferPrice: g, isRegulatedArea: true, householdHousingCount: 3 })],
  ];

  /**
   * 1,318,800,000은 **40% 단일세율 ↔ §55① 누진의 역전 경계**다
   * (`0.45T − 65,940,000 > 0.4T ⟺ 0.05T > 65,940,000`). 후단이 없으면 이 위에서 divergence가
   * 생기므로, 경계 **양옆**을 반드시 포함한다.
   */
  const bases = [100_000_000, 1_000_000_000, 1_318_800_000, 1_500_000_000, 3_000_000_000];

  for (const [name, f] of kinds) {
    it(`S104-4 ${name}: 전 구간에서 byGroups >= byGeneral (MAX 무효과)`, () => {
      for (const b of bases) {
        const c = comparison(agg([item(f(b))]));
        expect(
          c.byGroups,
          `${name} @ ${b.toLocaleString()} — 세율군별 ${c.byGroups.toLocaleString()} < 전체누진 ${c.byGeneral.toLocaleString()}`,
        ).toBeGreaterThanOrEqual(c.byGeneral);
      }
    });
  }

  it("S104-5: 🔑 no-op의 원인은 §104① 후단이다 — 역전 경계값을 고정한다", () => {
    /**
     * 뮤테이션으로 인과를 확인했다(2026-09-02): 단기 경로의 `compareWithClause1` 호출을 끄면
     * 「토지 19개월 40%」에서 divergence가 살아나고 경계가 **정확히 1,318,800,000**이다
     * (그 값에서 차이 0 · 15억 +9,060,000 · 20억 +34,060,000).
     * 여기서는 후단이 살아 있으므로 경계 위에서도 **세율군별이 이긴다** — 후단이 이미
     * 1호 누진을 채택했기 때문이다.
     */
    const above = comparison(agg([item({ propertyType: "land", transferPrice: 2_000_000_000, acquisitionDate: D("2024-11-01") })]));
    expect(above.byGroups).toBe(834_060_000); // = 누진(1호). 40% 단일세율 800,000,000이 아니다.
    expect(above.byGeneral).toBe(834_060_000);
    expect(above.byGroups).toBe(above.byGeneral);
  });
});
