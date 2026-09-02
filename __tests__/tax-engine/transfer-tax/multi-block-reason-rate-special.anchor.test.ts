/**
 * D11-07 — 다건 차단 사유 문구가 코드와 어긋났다.
 *
 * `multi-transfer-tax-validate.ts`의 차단 문구는 「합산 계산에서는 **차감·세액감면이
 * 반영되지 않습니다**」였다. 도입 시점(`92e8feee`, 2026-06-12)에는 사실이었으나, 집계
 * 차감 지원(`62821310`, 2026-07-27)이 들어오면서 **차감형도 세액감면형도 반영된다**.
 *
 * 지금 실제로 소실되는 것은 **세율 특칙뿐**이고, **두 겹으로** 사라진다
 * (`calcTax` 진입 로그로 추적):
 *   ① `transfer-tax-aggregate-helpers.ts:354`(`assetTaxOf`)가 원본 `correctedSingleInput`을
 *      세율 입력으로 써 `forceFlatRate20`(§98①1호)·`suppressShortTermRate`
 *      (§98의3④·§98의5③·§98의6③)가 실리지 않는다.
 *   ② 그 자리에 플래그를 **심어도** 결정세액은 그대로다 —
 *      `transfer-tax-aggregate-pickers.ts:139`의 `calculatedTaxByGeneral`(전체 누진)과의
 *      **MAX**(§104⑤ 비교과세)가 20% 결과(83,500,000)를 누진값(141,060,000)으로 덮는다.
 *
 * ⇒ 뮤테이션으로 확인할 것: 세율 입력에 플래그를 심는 것만으로는 이 anchor가 **깨지지
 *   않는다**. 그것이 「배선만 이으면 된다」가 아님을 말해 준다.
 *
 * 🟡 관찰(범위 밖) — §104⑤ 본문은 「해당 과세기간에 … 자산을 **둘 이상** 양도하는 경우」인데
 *   집계는 자산 1건에도 이 MAX를 돌린다. 특칙 없는 입력에서는 두 값이 같아 무해하지만
 *   (그래서 도입 시 「13,083건 불변」이었다), 특칙이 끼면 결과가 갈린다. 별건.
 *
 * 이 anchor는 그 **출처 판별**을 고정한다 — 과세표준이 같은데 결정세액만 다르다면 원인은
 * 차감이 아니라 세율이다. 문구를 다시 바꾸려는 사람은 여기서 먼저 걸린다.
 *
 * ⚠️ 차단 자체는 다투지 않는다. 침묵 오산보다 명시 차단이 안전하다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** §98 미분양 국민주택 — 취득 1995-11-01~1997-12-31 창, 세율 20% 단일 강제 */
const R98 = {
  type: "unsold_98" as const,
  contractDate98: D("1996-06-01"),
  isResident98: true,
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true,
  isFirstBuyerNoOccupancy98: true,
  rentedFor5Years98: true,
};

function property(reductions: unknown[]) {
  return {
    ...baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("1996-06-01"),
      transferDate: D("2024-08-01"),
      householdHousingCount: 2,
      reductions: reductions as never,
    }),
    propertyId: "p1",
    propertyLabel: "p1",
  };
}

describe("D11-07 다건 미지원 사유 — 세율 특칙", () => {
  const single98 = calculateTransferTax(property([R98]) as never, rates);
  const singleNone = calculateTransferTax(property([]) as never, rates);
  const agg98 = calculateTransferTaxAggregate(
    { taxYear: 2024, annualBasicDeductionUsed: 0, properties: [property([R98]) as never] },
    rates,
  );

  it("D11-07-1: 단건은 §98① 20% 단일세율을 적용한다", () => {
    expect(single98.determinedTax).toBe(83_500_000);
    expect(single98.taxBase).toBe(417_500_000);
    // 과세표준 × 20% — 누진·중과세율 대체
    expect(single98.calculatedTax).toBe(83_500_000);
  });

  it("D11-07-2: 🔴 다건은 그 세율을 적용하지 못한다 — 감면 미선택 값과 원 단위까지 같다", () => {
    expect(agg98.determinedTax).toBe(141_060_000);
    expect(agg98.determinedTax).toBe(singleNone.determinedTax);
  });

  it("D11-07-3: 🔑 출처 판별 — **과세표준은 동일**하다 ⇒ 차감이 아니라 세율이 원인이다", () => {
    expect(agg98.taxBase).toBe(single98.taxBase);
    expect(agg98.taxBase).toBe(417_500_000);
    // 차감이 소실됐다면 과세표준부터 벌어졌을 것이다
    expect(agg98.determinedTax).not.toBe(single98.determinedTax);
  });

  it("D11-07-4: 🔴 차단 문구가 「차감·세액감면 미반영」이라고 말하지 않는다", () => {
    const reason = validateMultiSupportedMode({
      assets: [
        { assetKind: "housing", acquisitionDate: "1996-06-01", reductions: [{ type: "unsold_98" }] },
      ],
      transferDate: "2024-08-01",
    } as never);
    expect(reason).not.toBeNull();
    expect(reason).not.toContain("차감·세액감면이 반영되지 않습니다");
    expect(reason).toContain("세율 특칙");
    expect(reason).toContain("§98① 20% 단일세율");
  });

  it("D11-07-5: 차단 범위 표기가 실제 차단 집합을 담는다 (§99의3은 §99의2보다 뒤 조문)", () => {
    const reason = validateMultiSupportedMode({
      assets: [
        { assetKind: "housing", acquisitionDate: "2002-01-01", reductions: [{ type: "new_99_3" }] },
      ],
      transferDate: "2024-08-01",
    } as never);
    expect(reason).toContain("§99의3");
    // 종전 표기 「§98~§99의2 시리즈」는 §99의3·§99를 담지 못했다
    expect(reason).not.toContain("§98~§99의2 시리즈");
  });
});
