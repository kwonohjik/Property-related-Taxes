/**
 * anchor: 1990.8.30. 前 상속·증여 주택 — 취득당시 단가는 **범위 밖**이라 ④가 보내지 않는다 (Q11).
 *
 * 날짜를 1990.8.30. 이전으로 고치면 UI에서 「취득당시 개별공시지가」 칸이 사라지지만
 * **값은 남는다**(`HouseValuationSection.tsx` — isBefore1990 분기가 등급 위젯으로 바뀐다).
 * 그 값을 그대로 실으면 엔진이 §164④ 등급환산을 덮어쓴다
 * (`inheritance-house-valuation.ts:173` — 직접 입력값 우선, 경고만 남긴다).
 *
 * ⇒ 「범위 밖이면 보내지 않는다」. ⑧의 필수 판정도 같은 구간에서 등급 4필드만 요구하도록
 *   함께 뒤집었다(`sec164-required-fields.ts` — ④·⑧ 단일 소스).
 */
import { describe, it, expect } from "vitest";
import { buildInheritedHouseValuationPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const HOUSE_4 = {
  inhHouseValLandArea: "150",
  inhHouseValLandPricePerSqmAtTransfer: "3,000,000",
  inhHouseValLandPricePerSqmAtFirst: "1,500,000",
  inhHouseValHousePriceAtFirst: "400,000,000",
};

const GRADES = {
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1,100,000",
  pre1990GradeMode: "number" as const,
};

function house(over: Record<string, unknown>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    ...HOUSE_4,
    ...over,
  } as AssetForm;
}

function payload(over: Record<string, unknown>) {
  const out = buildInheritedHouseValuationPayload(house(over), "2024-06-01");
  return out.inheritedHouseValuation as Record<string, unknown> | undefined;
}

describe("§164⑤~⑦ — 1990 前 취득당시 단가 미송신", () => {
  it("🔑 1990 前: stale 단가가 남아 있어도 엔진에 보내지 않는다", () => {
    const p = payload({
      acquisitionDate: "1987-05-01",
      inheritanceStartDate: "1987-05-01",
      inhHouseValLandPricePerSqmAtInheritance: "250,000", // 화면에 없는데 남아 있던 값
      ...GRADES,
    });
    expect(p).toBeDefined();
    expect(p?.landPricePerSqmAtInheritance).toBeUndefined();
    // 등급환산 payload는 그대로 실린다 — 이것이 §164④의 정본 경로다.
    expect(p?.pre1990).toBeDefined();
  });

  it("1990 後: 단가를 그대로 보낸다 (종전과 같다)", () => {
    const p = payload({
      acquisitionDate: "1998-07-01",
      inheritanceStartDate: "1998-07-01",
      inhHouseValLandPricePerSqmAtInheritance: "250,000",
    });
    expect(p?.landPricePerSqmAtInheritance).toBe(250_000);
    expect(p?.pre1990).toBeUndefined();
  });

  it("🔑 1990 前 · 등급 미완성 + 단가만 → payload 자체가 만들어지지 않는다 (⑧이 먼저 막는다)", () => {
    const p = payload({
      acquisitionDate: "1987-05-01",
      inheritanceStartDate: "1987-05-01",
      inhHouseValLandPricePerSqmAtInheritance: "250,000",
    });
    expect(p).toBeUndefined();
  });
});
