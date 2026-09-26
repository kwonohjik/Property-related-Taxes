/**
 * anchor (A3 · A2a 후속 확인) — 겸용 컴패니언 파트 카드가 §89② 판정 입력(`presaleRights`·
 * `rightThreeYearException`)을 **주택 카드까지** 싣는가.
 *
 * A2a PR #1793 비고 7: 「겸용 컴패니언(`mixed-use-part-cards.ts`)에는 `rightThreeYearException`을
 * 전달하지 않았다 — 후속 확인」. 실측 결과 파트 카드는 `companionEngine`(route가 `engineInput`·
 * `buildCompanionEngineInputs`로 만든 item)을 **스프레드**하므로 두 필드가 그대로 따라온다 —
 * 겸용 서브엔진 입력(`buildMixedUseAssetInput`)에는 없지만, §89②는 서브엔진이 아니라 **카드마다 도는
 * 단건 엔진**이 판정한다. 이 anchor는 그 스프레드가 끊기면(중화 목록에 추가되는 등) 조용히 사라지는
 * 것을 막는다.
 *
 * 🔴 판정까지 확인: 3년 초과 + 2022-02-15 이후 취득 권리 + ④ 선언(신축 완성 전 양도)이 있으면
 *    주택 카드의 §89② 판정이 `exception_met`, 선언이 없으면 `undetermined`로 갈린다.
 */
import { describe, it, expect } from "vitest";
import { buildMixedUsePartCards, MIXED_USE_PART_IDS } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const rates = makeMockRatesWithHouseEngine();
const TD = new Date("2026-06-01");
const PRICE = 1_500_000_000;
const RIGHT: PresaleRight = {
  id: "r1",
  type: "redevelopment_right",
  acquisitionDate: new Date("2022-06-01"),
  region: "capital",
};

function companion(over: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    propertyId: "c1",
    propertyLabel: "자산 2",
    propertyType: "housing",
    transferPrice: PRICE,
    acquisitionPrice: 0,
    expenses: 0,
    transferDate: TD,
    acquisitionDate: new Date("2015-03-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    useEstimatedAcquisition: false,
    isNonBusinessLand: false,
    reductions: [],
    presaleRights: [RIGHT],
    ...over,
  } as TransferTaxItemInput;
}

function housingCards(item: TransferTaxItemInput) {
  const asset = { ...mixedUseCase14(), landAcquisitionDate: new Date("2015-03-01"), buildingAcquisitionDate: new Date("2015-03-01") };
  const cards = buildMixedUsePartCards(item, asset, PRICE, TD, rates, "c1", "자산 2");
  return cards.filter(
    (c) =>
      c.propertyId.startsWith(MIXED_USE_PART_IDS.housingLand) ||
      c.propertyId.startsWith(MIXED_USE_PART_IDS.housingBuilding),
  );
}

describe("겸용 파트 카드 — §89② 입력 전달", () => {
  const exception = { kind: "before_completion" as const, movedInWithin3Years: true, residedOneYearOrMore: true };

  it("주택 카드 2장 모두 presaleRights·rightThreeYearException을 싣는다", () => {
    const cards = housingCards(companion({ rightThreeYearException: exception as never }));
    expect(cards).toHaveLength(2);
    for (const c of cards) {
      expect(c.presaleRights).toEqual([RIGHT]);
      expect(c.rightThreeYearException).toEqual(exception);
    }
  });

  it("🔴 카드 단건 엔진의 §89② 판정이 선언에 따라 갈린다 — 선언 있음: exception_met / 없음: undetermined", () => {
    const withDecl = housingCards(companion({ rightThreeYearException: exception as never }))[1];
    const noDecl = housingCards(companion())[1];
    // 카드 item을 그대로 넘긴다 — 단건 엔진 `checkExemption`이 부르는 것과 같은 술어·같은 입력이다.
    expect(resolveArticle89Clause2(withDecl as never, undefined).status).toBe("exception_met");
    expect(resolveArticle89Clause2(noDecl as never, undefined).status).toBe("undetermined");
  });
});
