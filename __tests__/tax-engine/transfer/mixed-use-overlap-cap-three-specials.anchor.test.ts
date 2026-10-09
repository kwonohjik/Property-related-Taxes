/**
 * 겸용주택 경로의 §155 특례 중첩 상한 — 두 개까지 (`inheritedHouseExclusionCount`).
 *
 * 단건 경로의 같은 상한은 `one-house-overlap-cap-three-specials.anchor.test.ts`가 지킨다. 겸용 경로는 §155②③ 상속주택
 * 제외 수를 판정 입력(`transfer-tax-mixed-use-exemption.ts` `inheritedHouseExclusionCount`)으로 따로 넘기는데,
 * 그 전달을 지워도 실패하는 테스트가 없었다(2026-10-09 뮤테이션 probe — 엔진·계산·API 23,318건 전부 통과).
 *
 * 두 특례가 겹친 3주택(①+④ — 사전-2025-법규재산-1240)은 인정하고, §155②③ 상속주택 제외까지 더한 세 특례는
 * 인정한 해석이 확인되지 않아 불허한다(사전-2016-법령해석재산-0584 · 조심-2021-중-5977 — 2026-10-06 사용자 결정).
 *
 * | # | 조합 | 기대 |
 * |---|---|---|
 * | MX-1 | ①+④(겸용 + 합가 전 상대 쪽 1 + 합가 후 신규 1) | 비과세 — 긍정 짝 |
 * | MX-2 | ②+①+④(MX-1 + 별도세대 상속주택) | 과세 — 상속주택을 빼도 세 특례라 의제 불성립 |
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const TRANSFER = D("2026-06-01");
const PRICE = 1_000_000_000; // 12억 이하 — 비과세면 주택분 전액 비과세

/** 겸용주택(1997 신축 — 양도) · 합가 전 상대 쪽 1채(2012) · 합가 후 신규 1채(2024-02-01) */
const SELLING = makeHouseInfo("selling", { acquisitionDate: D("1997-09-12"), mergeOrigin: "seller_side" });
const COUNTERPART = makeHouseInfo("b", { acquisitionDate: D("2012-01-01"), mergeOrigin: "counterpart_side" });
const NEW = makeHouseInfo("n", { acquisitionDate: D("2024-02-01") });
/** 별도세대 피상속인으로부터 2019년 상속 — 겸용주택(1997)이 상속개시 당시 보유 일반주택이라 §155②로 빠진다. */
const INHERITED = makeHouseInfo("i", {
  acquisitionDate: D("2019-06-01"),
  isInherited: true,
  inheritedDate: D("2019-06-01"),
  decedentSameHouseholdAtInheritance: false,
  mergeOrigin: "seller_side",
});

function run(extra: HouseInfo[]) {
  const houses = [SELLING, COUNTERPART, NEW, ...extra];
  return calcMixedUseTransferTax(
    PRICE,
    TRANSFER,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      isOneHousehold: true,
      householdHousingCountForExclusion: houses.length,
      temporaryTwoHouse: { previousAcquisitionDate: D("1997-09-12"), newAcquisitionDate: D("2024-02-01") },
      isFirstTransferredInMerge: true,
      multiHouse: {
        houses,
        sellingHouseId: "selling",
        presaleRights: [],
        isOneHousehold: true,
        isRegulatedArea: false,
        parentalCareMerge: { mergeDate: D("2022-01-01") },
      },
      inheritedHouseExclusion: {
        generalHouseGiftedFromDecedentWithin2yr: undefined,
        generalHouseGiftDate: undefined,
        generalHouseRightAtInheritance: undefined,
      },
    } as MixedUseAssetInput,
    makeMockRates(),
  );
}

describe("겸용주택 — §155 특례 중첩 상한", () => {
  it("MX-1 ①+④ → 주택분 12억 이하 비과세(긍정 짝)", () => {
    const r = run([]);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(r.housingPart.incomeAmount).toBe(0);
  });

  it("MX-2 ②+①+④ → 상속주택을 빼고 3주택이어도 세 특례라 과세", () => {
    const r = run([INHERITED]);
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(r.housingPart.incomeAmount).toBeGreaterThan(0);
  });
});
