/**
 * §27 단서 대습상속 할증 배제 — anchor (SI-01~07)
 *
 * Plan:   docs/00-pm/inheritance-section27-substitute-inheritance.plan.md
 * Design: docs/02-design/features/inheritance-section27-substitute-inheritance.engine.design.md
 *
 * 상증법 §27 단서: "다만, 「민법」 제1001조에 따른 대습상속의 경우에는 그러하지 아니하다."
 *   → isGenerationSkipBeneficiary 손자녀라도 대습상속(isSubstituteInheritance)이면 할증 전액 배제(30%·40% 모두).
 *
 * ⚠️ Pre-Do RED 예정: SI-02·03·04·07(대습 배제)은 현행(단서 미구현)에서 할증 > 0(RED), 정정 후 0/배제.
 *   SI-01·05·06(control)은 현행·정정 후 동일(GREEN 유지).
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";

interface GrandsonCfg {
  id: string;
  name: string;
  amount: number;
  minor?: boolean; // 미성년(40% 후보)
  genSkip?: boolean; // isGenerationSkipBeneficiary (기본 true)
  substitute?: boolean; // isSubstituteInheritance (§27 단서)
}

// 자녀(법정상속인) + 손자 수유자 N명 구성. 총 재산 = childAmount + Σ 손자.
function buildInput(grandsons: GrandsonCfg[], childAmount: number): InheritanceTaxInput {
  const child: Heir = {
    id: "heir-child",
    relation: "child",
    name: "자녀",
    birthDate: "1970-01-01",
    isHeir: true,
  };
  const heirs: Heir[] = [
    child,
    ...grandsons.map(
      (g) =>
        ({
          id: g.id,
          relation: "legatee",
          name: g.name,
          birthDate: g.minor ? "2018-01-01" : "1995-01-01",
          isHeir: false,
          isGenerationSkipBeneficiary: g.genSkip ?? true,
          isSubstituteInheritance: g.substitute ?? false,
        }) as Heir,
    ),
  ];
  const total = childAmount + grandsons.reduce((s, g) => s + g.amount, 0);
  const estateItems: EstateItem[] = [
    {
      id: "estate-1",
      category: "financial",
      name: "예금",
      marketValue: total,
      heirAllocations: [
        { heirId: "heir-child", amount: childAmount },
        ...grandsons.map((g) => ({ heirId: g.id, amount: g.amount })),
      ],
    },
  ];
  return {
    ...EXAMPLE_INPUT,
    deathDate: "2024-01-01",
    heirs,
    estateItems,
    preGiftsWithin10Years: [],
    debtItems: [],
    presumedItems: [],
    exemptions: [],
    deductionInput: {
      ...EXAMPLE_INPUT.deductionInput,
      spouseActualAmount: undefined,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: undefined,
      familyBusinessValue: undefined,
    },
    creditInput: { priorGifts: [], isFiledOnTime: false },
    isGenerationSkip: undefined,
    isMinorHeir: undefined,
    generationSkipAssetAmount: undefined,
  };
}

describe("§27 단서 대습상속 할증 배제 — anchor SI", () => {
  it("SI-01 손자 세대생략 + 대습 아님 → §27 할증 > 0 (본문 적용, control)", () => {
    const r = calcInheritanceTax(buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000 }], 6_000_000_000));
    expect(r.generationSkipSurcharge).toBeGreaterThan(0);
  });

  it("SI-02 손자 세대생략 + 대습 ON → §27 할증 0 (단서 배제)", () => {
    const r = calcInheritanceTax(buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000, substitute: true }], 6_000_000_000));
    expect(r.generationSkipSurcharge).toBe(0);
  });

  it("SI-03 미성년 손자 21억(40% 후보) + 대습 ON → §27 할증 0 (단서가 40%도 배제)", () => {
    const r = calcInheritanceTax(
      buildInput([{ id: "g1", name: "손자", amount: 2_100_000_000, minor: true, substitute: true }], 7_900_000_000),
    );
    expect(r.generationSkipSurcharge).toBe(0);
  });

  it("SI-04 복수 수유자 — 1명만 대습 → 대습자 0·나머지 > 0 (per-heir 독립)", () => {
    const r = calcInheritanceTax(
      buildInput(
        [
          { id: "g-sub", name: "대습손자", amount: 2_000_000_000, substitute: true },
          { id: "g-normal", name: "일반손자", amount: 2_000_000_000, substitute: false },
        ],
        6_000_000_000,
      ),
    );
    expect(r.generationSkipDetail).not.toBeNull();
    const rows = r.generationSkipDetail!.rows;
    const sub = rows.find((x) => x.heirId === "g-sub");
    const normal = rows.find((x) => x.heirId === "g-normal");
    expect(sub?.surcharge).toBe(0);
    expect(sub?.excludedBySubstitution).toBe(true);
    expect(normal?.surcharge).toBeGreaterThan(0);
    // 총할증 = 일반손자분만
    expect(r.generationSkipSurcharge).toBe(normal?.surcharge);
  });

  it("SI-05 gen-skip OFF + 대습 ON → 할증 0 (no-op, 방어)", () => {
    const r = calcInheritanceTax(
      buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000, genSkip: false, substitute: true }], 6_000_000_000),
    );
    expect(r.generationSkipSurcharge).toBe(0);
  });

  it("SI-06 회귀 — 대습 미설정(undefined)은 대습 false와 동일 결과", () => {
    const base = calcInheritanceTax(buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000, substitute: false }], 6_000_000_000));
    // substitute 미지정 → undefined (false와 동일)
    const omitted = calcInheritanceTax(buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000 }], 6_000_000_000));
    expect(omitted.generationSkipSurcharge).toBe(base.generationSkipSurcharge);
    expect(omitted.generationSkipSurcharge).toBeGreaterThan(0);
  });

  it("SI-07 전원 대습 → 할증 0 이어도 detail 非null + 배제 행 표시(소실 금지)", () => {
    const r = calcInheritanceTax(buildInput([{ id: "g1", name: "손자", amount: 2_000_000_000, substitute: true }], 6_000_000_000));
    expect(r.generationSkipSurcharge).toBe(0);
    expect(r.generationSkipDetail).not.toBeNull();
    const row = r.generationSkipDetail!.rows.find((x) => x.heirId === "g1");
    expect(row?.excludedBySubstitution).toBe(true);
  });
});
