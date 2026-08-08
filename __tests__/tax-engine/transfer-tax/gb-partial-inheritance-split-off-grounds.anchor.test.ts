/**
 * anchor: **부분 상속 × 분리 OFF**(V-5) 차단의 근거 — 상속 평가액이 계산에 도달하지 않는다
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-2
 *
 * ## 서술 정정 — 「이중계상」이 아니라 **소실**이다
 *
 * §9-6과 `transfer-tax-validate-gb.ts`의 종전 주석은 차단 사유를 「비상속 파트의 취득가액이
 * 자산 단위 총액으로만 들어와 **이중계상**이 된다」고 적었다. 실측하면 이중으로 세는 일은
 * 일어나지 않는다 — 상속 평가액이 **아예 쓰이지 않는다**.
 *
 * 실가 경로(`general-building-route-actual.ts`)의 분기는 셋이다:
 *   · `acquisitionByInheritance && buildingAcquisitionByInheritance` → 평가액 직접 배정 (C1, **둘 다** 상속)
 *   · `hasBothPartPrices`(두 파트 가액이 **둘 다** 있음) → 안분 없이 직접 배정
 *   · 그 밖 → 자산 단위 총액을 취득시 기준시가 비율로 안분
 *
 * **부분** 상속 + 분리 OFF는 앞의 두 AND 게이트가 모두 false다 — 상속 파트에는 평가액이
 * 실리지만 비상속 파트에는 파트 칸 자체가 화면에 없어 값이 없다. ⇒ 세 번째로 떨어져
 * 상속 평가액이 통째로 버려진다.
 *
 * ## 왜 차단이 정답인가
 *
 * 고칠 대상이 「엔진의 배정 규칙」이 아니라 **입력 모델**이기 때문이다. 분리 OFF의 취득가액
 * 칸은 「토지·건물 **일괄**」이라는 하나의 뜻을 갖는다. 부분 상속에서 그 칸을 「비상속 파트의
 * 취득가액」으로 다시 읽으면 같은 필드가 문맥에 따라 두 의미가 되어 ④ API 변환·⑧ validate와
 * 어긋난다(3중 mirror). 게다가 부분 상속이면 두 파트의 취득 시점이 **실제로 다르므로**
 * 「토지·건물 취득일 다름」이 사실에 맞는 입력이다(「소득세법」 제95조 제4항).
 *
 * ⚠️ **이 테스트가 뒤집히면 차단을 재검토하라는 신호다.** 아래 「소실」이 사라지도록 엔진이
 *    바뀌었다면 V-5의 전제가 없어진 것이다 — 그때는 이 파일과 validate를 함께 고친다.
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 토지만 2005 상속(평가액 5억) · 건물은 2005 매매(실가 3억) · 2026 양도 16.2억. */
function run(over: Record<string, unknown>) {
  return calculateGeneralBuildingActualTransfer(
    {
      totalTransferPrice: 1_620_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2005-05-01"),
      landArea: 205,
      buildingFootprintArea: 135,
      transferLandPricePerSqm: 5_514_000,
      transferBuildingStdPrice: 259_072_400,
      acquisitionLandPricePerSqm: 2_800_000,
      acquisitionBuildingStdPrice: 2_814_470,
      zoneType: "commercial",
      isMetropolitan: false,
      isUnregistered: false,
      actualExpenses: 0,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      ...over,
    } as never,
    2026,
    undefined,
    [],
    rates,
  );
}

const partAcq = (r: ReturnType<typeof run>, kind: "land" | "building") =>
  r.apportionment.apportioned.find((a) => a.assetKind === kind)?.allocatedAcquisitionPrice;

describe("V5-1 부분 상속 × 분리 OFF — 상속 평가액이 계산에 도달하지 않는다", () => {
  /** 상속 신호와 평가액을 모두 실어 보낸 분리 OFF payload. */
  const partialOff = {
    acquisitionByInheritance: true,
    inheritedLandValue: 500_000_000,
    landAcquisitionPrice: 500_000_000,
    actualAcquisitionPrice: 800_000_000,
  };

  it("상속 신호가 아예 없는 경우와 결과가 **완전히 같다** (= 평가액 소실)", () => {
    const withInheritance = run(partialOff);
    const withoutInheritance = run({ actualAcquisitionPrice: 800_000_000 });

    expect(partAcq(withInheritance, "land")).toBe(796_096_533);
    expect(partAcq(withInheritance, "building")).toBe(3_903_467);
    // 평가액 5억이 배정되지 않고 자산 단위 8억이 취득시 기준시가 비율로 안분됐다.
    expect(partAcq(withInheritance, "land")).toBe(partAcq(withoutInheritance, "land"));
    expect(partAcq(withInheritance, "building")).toBe(partAcq(withoutInheritance, "building"));
    expect(withInheritance.aggregated.calculatedTax).toBe(
      withoutInheritance.aggregated.calculatedTax,
    );
  });

  it("사용자가 「건물 취득가액만」 넣으면 147,000,000원 과대과세가 된다", () => {
    /**
     * 상속 파트는 전용 칸(상속개시일 평가액)에 이미 넣었으므로, 남은 자산 단위 칸에는
     * 건물분 3억만 넣는 것이 자연스럽다. 그러면 그 3억이 **토지·건물 전체로** 안분되어
     * 토지 취득가액이 평가액 5억 대신 2.98억이 된다.
     */
    const buildingOnly = run({ ...partialOff, actualAcquisitionPrice: 300_000_000 });
    // 분리 ON 상당 — 두 파트 가액이 모두 실려 안분 없이 직접 배정되는 정상 경로.
    const separateOn = run({
      acquisitionByInheritance: true,
      inheritedLandValue: 500_000_000,
      landAcquisitionPrice: 500_000_000,
      buildingAcquisitionPrice: 300_000_000,
    });

    expect(partAcq(separateOn, "land")).toBe(500_000_000);
    expect(partAcq(separateOn, "building")).toBe(300_000_000);
    expect(partAcq(buildingOnly, "land")).toBe(298_536_200);
    expect(
      buildingOnly.aggregated.calculatedTax - separateOn.aggregated.calculatedTax,
    ).toBe(147_000_000);
  });
});

describe("V5-2 ⑧ validate — 부분 상속은 분리 ON을 요구한다", () => {
  const base = {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "purchase", // 부분 상속 — 건물은 매매
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    publishedValueAtInheritance: "500000000",
    landAcquisitionDate: "2005-05-01",
    acquisitionDate: "2005-05-01",
    decedentAcquisitionDate: "1990-01-01",
    gbLandArea: "205",
    gbBuildingFootprintArea: "135",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    fixedAcquisitionPrice: "800000000",
  };

  it("분리 OFF → 차단", () => {
    const v = validateGeneralBuildingAsset(
      { ...base, hasSeperateLandAcquisitionDate: false } as never,
      "자산1",
      "2026-02-16",
    );
    expect(v).toMatch(/한쪽만 상속으로 취득했다면/);
  });

  it("분리 ON + 파트별 취득가액 → 통과 (안내가 가리키는 목적지가 실제로 열려 있다)", () => {
    const v = validateGeneralBuildingAsset(
      {
        ...base,
        hasSeperateLandAcquisitionDate: true,
        acquisitionDate: "2020-05-01", // 건물 취득일 — 부분 상속이면 실제로 다르다
        buildingAcquisitionPrice: "300000000",
      } as never,
      "자산1",
      "2026-02-16",
    );
    expect(v).toBeNull();
  });
});
