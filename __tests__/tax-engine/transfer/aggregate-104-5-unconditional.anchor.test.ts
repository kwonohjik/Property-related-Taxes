/**
 * anchor: **§104⑤ 비교(1호 vs 2호 MAX)는 「둘 이상 양도」면 무조건이다** — 중과·단기 그룹은 요건이 아니다.
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * 법문(2019.12.31. 개정): 「해당 과세기간에 제94조제1항제1호ㆍ제2호 및 제4호에서 규정한 자산을
 * **둘 이상 양도하는 경우** 양도소득 산출세액은 다음 각 호의 금액 중 **큰 것** … 으로 한다」
 *   1호 — 해당 과세기간의 양도소득과세표준 **합계액**에 §55①의 세율을 적용한 산출세액
 *   2호 — §104①~④·⑦에 따라 계산한 **자산별** 산출세액 합계액(단서: 같은 호는 합산 후 호별 MAX)
 *
 * 종전 `computeGroupsAndComparison`은 `multi_house_surcharge`·`non_business_land`·`unregistered`·
 * `short_term` 그룹이 하나도 없으면 **비교 자체를 건너뛰고** 2호를 그대로 채택했다
 * (`comparedTaxApplied = "none"`). 그 단축은 법문에 근거가 없다 — `progressive` 그룹 **안에서**
 * 버킷이 갈리면(파트 자산 등) 1호가 더 커도 반영되지 않는 경로가 남는다.
 *
 * 📌 **세액 정정이 아니라 문언 정합이다.** 현재 어떤 입력에서도 값이 바뀌지 않는다(전체 13,083건 불변).
 *   구조적 이유: 1호는 §55① 누진이라 **최고 한계세율 45%**인데, 2호에서 떨어져 나갈 수 있는
 *   단일세율 호는 **40%·50%·60%·70%**뿐이라 대부분 45%를 웃돈다. 유일한 후보인 40%
 *   (§104①2호 비주택 1~2년)도 재현되지 않았다. ⇒ 잠복 경로를 없애는 것이 목적이다.
 *
 * ⚠️ **단일 자산에도 비교가 도는 편차는 이번에 건드리지 않았다** — 끄면 세액이 **내려갈** 수 있고
 *   (`calcTax`가 일반 단기 자산에서 §104① 후단을 수행하지 않아 이 MAX가 그것을 대신 공급 중),
 *   어느 쪽이 정답인지 미판정이다. B-3이 현행 동작을 고정만 해 둔다.
 *
 * 🔻 **이 파일은 게이트 회귀를 잡지 못한다 — 가드가 아니라 구조·문서 고정이다.**
 *   종전 게이트를 되돌려도 **4건 모두 통과**한다(2026-08-03 실측). 정정이 no-op이라 당연하다.
 *   잡으려면 「1호가 2호를 이기는 progressive-only 조합」이 필요한데, 6종(주택 70%·비주택 50%·
 *   비주택 40% 크기 조합 등)을 시도해 **구성하지 못했다**. 단일세율 호가 40%·50%·60%·70%뿐이라
 *   누진 한계세율 45%를 넘기 때문이다.
 *   ⇒ 이 파일의 역할은 ⓐ 게이트가 걸리던 국면(`progressive` 단독인데 그룹 **안에서** 버킷이 갈림)이
 *     **실재함**을 고정하고 ⓑ MAX 불변식과 표시 의미를 문서화하는 것이다.
 *     40% 버킷을 재현하는 입력을 찾으면 그때 **진짜 가드로 승격**한다.
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

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

/**
 * 토지·건물 분리취득 주택 — 건물 16년(§104①1호 누진) · 토지 10개월(§104①3호 70%).
 * `classifyRateGroup`은 **자산** 보유기간(건물 16년)으로 판정하므로 그룹은 `progressive`다.
 * ⇒ **중과·단기 그룹이 하나도 없는데 그룹 안에서 버킷이 갈리는** 상태 — 종전 게이트가 걸리던 국면.
 */
const splitAsset = (id: string) =>
  item(id, {
    propertyType: "housing",
    acquisitionDate: D("2010-01-01"),
    landAcquisitionDate: D("2025-08-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 100_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
  } as Partial<TransferTaxItemInput>);

const plain = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    isNonBusinessLand: false,
  });

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("§104⑤ — 1호·2호 MAX는 무조건 수행된다", () => {
  it("B-1: **중과·단기 그룹이 없어도** 1호가 계산되고 MAX가 적용된다", () => {
    const r = agg([splitAsset("S"), plain("P", 300_000_000)]);

    // 세율군은 `progressive` 하나뿐 — 종전 게이트가 비교를 건너뛰던 조건이다.
    expect(r.groupTaxes.map((g) => g.group)).toEqual(["progressive"]);

    // 그런데 그룹 **안에서** 버킷이 갈린다(토지 70% / 건물·토지2 누진).
    // ⇒ 2호(자산별·호별)와 1호(합계액 누진)가 실제로 다른 값을 낸다.
    expect(r.calculatedTaxByGroups).toBe(361_660_000);
    expect(r.calculatedTaxByGeneral).toBe(276_540_000);
    expect(r.calculatedTaxByGeneral).not.toBe(r.calculatedTaxByGroups);

    // **불변식** — 결정 산출세액은 언제나 두 호의 MAX다(게이트로 건너뛰지 않는다).
    expect(r.calculatedTax).toBe(
      Math.max(r.calculatedTaxByGroups, r.calculatedTaxByGeneral),
    );
    expect(r.calculatedTax).toBe(361_660_000);
  });

  it("B-2: 표시(`comparedTaxApplied`) 의미는 보존 — 중과·단기 없이 2호가 이기면 `\"none\"`", () => {
    // UI 배지·PDF가 `"none"`을 「중과·단기 없음 → 비교 불필요」로 읽는다
    // (`MultiTransferTaxSummaryCard.tsx:119·147` · `ResultPdfDocument.tsx:304`).
    // 계산은 무조건 MAX로 바꾸되 **표시는 종전 그대로** 둬 UI 리플을 0으로 만든다.
    const r = agg([splitAsset("S"), plain("P", 300_000_000)]);
    expect(r.comparedTaxApplied).toBe("none");

    // 중과 자산이 섞이면 종전대로 `"groups"`/`"general"`.
    const withSurcharge = agg([
      plain("P", 300_000_000),
      item("M", {
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        acquisitionPrice: 0,
        transferPrice: 400_000_000,
        isRegulatedArea: true,
        householdHousingCount: 3,
      }),
    ]);
    expect(withSurcharge.comparedTaxApplied).toBe("groups");
    expect(withSurcharge.calculatedTax).toBe(
      Math.max(withSurcharge.calculatedTaxByGroups, withSurcharge.calculatedTaxByGeneral),
    );
  });

  it("B-3: 단일 자산 편차는 **현행 고정**(미판정) — 비교가 돌고 MAX가 적용된다", () => {
    // §104⑤은 「둘 이상 양도」가 요건이라 문언상 미적용이 맞지만, 끄면 세액이 내려갈 수 있다 —
    // `calcTax`가 일반 단기 자산에서 §104① 후단(1호 누진 vs 단기 중 큰 것)을 수행하지 않아
    // 지금은 이 MAX가 그 비교를 대신 공급하고 있다. 바꾸려면 법령 검토가 선행이다.
    const r = agg([plain("P", 300_000_000)]);
    expect(r.calculatedTax).toBe(
      Math.max(r.calculatedTaxByGroups, r.calculatedTaxByGeneral),
    );
  });

  it("B-4: 모든 자산이 같은 호면 1호 = 2호 (MAX가 무해함을 확증)", () => {
    // `progressive` 자산만 있고 버킷이 하나면 합산 과세표준이 곧 1호 과세표준이라 값이 같다.
    // 게이트 제거가 이 다수 경로에서 no-op임을 고정한다.
    const r = agg([plain("P1", 300_000_000), plain("P2", 200_000_000)]);
    expect(r.groupTaxes.map((g) => g.group)).toEqual(["progressive"]);
    expect(r.calculatedTaxByGroups).toBe(r.calculatedTaxByGeneral);
    expect(r.comparedTaxApplied).toBe("none");
  });
});
