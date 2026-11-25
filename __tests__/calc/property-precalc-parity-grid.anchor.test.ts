/**
 * PSA-E4 후속 M3 — 계산 직전 재검증(⑧ `firstInvalidStep`) ↔ ⑫(Zod) 격자 전수 대조.
 *
 * 대상 4종(주택·건축물·선박·항공기 + 토지 3분류) × 단계별 결함 축을 자동 생성해 각 셀마다
 *   ⑧ 통과/차단  vs  ⑫(`buildPropertyTaxRequestBody` → `propertyTaxInputSchema`) 200/400  vs  엔진 던짐(422)
 * 을 짝지어 단언한다.
 *  - 「⑧ 통과 ∧ ⑫ 400」 = 화면은 통과시키는데 서버가 일반 문구로 막는 막다른 길 → 0건이어야 한다.
 *  - 「⑧ 통과 ∧ ⑫ 통과 ∧ 엔진 던짐」 = 같은 막다른 길 → 0건이어야 한다.
 *  - 「⑧ 차단 ∧ ⑫ 통과」 = 화면 전용 상태(토글·단계 선택)를 읽는 규칙 — ⑫가 볼 수 없는 값이라 허용하되
 *    **허용 사유를 이름 붙여 닫아 둔다**(ALLOWED_UI_ONLY). 새 사유가 생기면 이 목록을 보고 판단한다.
 */
import { describe, it, expect } from "vitest";
import {
  INITIAL_FORM,
  buildPropertyTaxRequestBody,
  firstInvalidStep,
  type FormState,
} from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";

type Axis = Partial<FormState>[];
const product = (base: Partial<FormState>, axes: Axis[]): Partial<FormState>[] =>
  axes.reduce<Partial<FormState>[]>(
    (acc, axis) => acc.flatMap((a) => axis.map((x) => ({ ...a, ...x }))),
    [base],
  );

const PRICE: Axis = [{ publishedPrice: "300,000,000" }, { publishedPrice: "" }];
const STALE_ONE_HOUSEHOLD: Axis = [{ isOneHousehold: false }, { isOneHousehold: true }];
const STALE_LAND: Axis = [{ landTaxType: "" }, { landTaxType: "separate_aggregate" }];
const CAP_NONLAND: Axis = [
  { taxCapMode: "direct", previousYearTax: "" },
  { taxCapMode: "direct", previousYearTax: "100,000" },
  { taxCapMode: "recompute", previousYearTaxBase: "" },
  { taxCapMode: "recompute", previousYearTaxBase: "100,000,000" },
];
const OTHER_VALUE: Axis = [
  { otherComprehensiveValue: "" },
  { otherComprehensiveValue: "0" },
  { otherComprehensiveValue: "100,000,000" },
];
const OTHER_SEP: Axis = [
  { otherSeparateAggregateValue: "" },
  { otherSeparateAggregateValue: "0" },
  { otherSeparateAggregateValue: "100,000,000" },
];
const YEAR = new Date().getFullYear();

/** 격자: [그룹 이름, 셀 목록] — 모든 셀은 INITIAL_FORM 위에 얹는다. */
const GRID: [string, Partial<FormState>[]][] = [
  ["건축물", product({ objectType: "building" }, [PRICE, STALE_ONE_HOUSEHOLD, STALE_LAND, CAP_NONLAND])],
  ["선박", product({ objectType: "vessel" }, [PRICE, STALE_ONE_HOUSEHOLD, CAP_NONLAND])],
  ["항공기", product({ objectType: "aircraft" }, [PRICE, STALE_ONE_HOUSEHOLD, CAP_NONLAND])],
  [
    "주택",
    product({ objectType: "housing" }, [
      PRICE,
      [{ taxCapMode: "direct" }, { taxCapMode: "recompute", previousYearTaxBase: "100,000,000" }],
      [
        { housingTaxCapEnabled: false },
        { housingTaxCapEnabled: true, housingPreviousYearTax: "" },
        { housingTaxCapEnabled: true, housingPreviousYearTax: "100,000" },
      ],
      [{ isUrbanArea: false }, { isUrbanArea: true }],
      [{ housingPreviousUrbanTax: "" }, { housingPreviousUrbanTax: "50,000" }],
    ]),
  ],
  [
    "토지-종합합산",
    product({ objectType: "land", landTaxType: "comprehensive_aggregate" }, [PRICE, OTHER_VALUE, CAP_NONLAND]),
  ],
  [
    "토지-별도합산-전량인정",
    product(
      { objectType: "land", landTaxType: "separate_aggregate", saZoningDistrict: "commercial", saLandArea: "300" },
      [
        PRICE,
        [{ saBuildingFloorArea: "100" }, { saBuildingFloorArea: "" }],
        OTHER_SEP,
        OTHER_VALUE,
        CAP_NONLAND,
      ],
    ),
  ],
  [
    "토지-별도합산-면적초과이관",
    product(
      {
        objectType: "land",
        landTaxType: "separate_aggregate",
        saZoningDistrict: "industrial",
        saLandArea: "1000",
        saBuildingFloorArea: "100",
      },
      [PRICE, OTHER_SEP, OTHER_VALUE, CAP_NONLAND],
    ),
  ],
  [
    "토지-별도합산-철거",
    product(
      {
        objectType: "land",
        landTaxType: "separate_aggregate",
        saZoningDistrict: "commercial",
        saLandArea: "300",
        saBuildingFloorArea: "100",
        saDemolished: true,
      },
      [
        [{ saDemolishedDate: "" }, { saDemolishedDate: `${YEAR - 2}-01-01` }, { saDemolishedDate: `${YEAR}-03-01` }],
        OTHER_SEP,
        OTHER_VALUE,
        [{ taxCapMode: "direct" }, { taxCapMode: "recompute", previousYearTaxBase: "100,000,000" }],
      ],
    ),
  ],
  [
    "토지-별도합산-필수칸결함",
    product({ objectType: "land", landTaxType: "separate_aggregate", otherSeparateAggregateValue: "0" }, [
      [{ saZoningDistrict: "" }, { saZoningDistrict: "commercial" }],
      [{ saLandArea: "" }, { saLandArea: "0" }, { saLandArea: "300" }],
      [{ saBuildingFloorArea: "" }, { saBuildingFloorArea: "100" }],
    ]),
  ],
  ["토지-유형미선택", product({ objectType: "land", landTaxType: "" }, [PRICE])],
  [
    "토지-분리과세",
    product({ objectType: "land", landTaxType: "separated" }, [
      PRICE,
      [{ stSeparatedType: "" }, { stSeparatedType: "farmland" }],
      [{ taxCapMode: "direct" }, { taxCapMode: "recompute", previousYearTaxBase: "100,000,000" }],
    ]),
  ],
];

/**
 * 「⑧ 차단 ∧ ⑫ 통과」를 허용하는 사유 — ⑫가 볼 수 없는 화면 상태를 읽는 규칙. (이름 붙여 닫는다)
 *  - blank-price: 공시가격 빈칸은 ④가 0으로 보낸다 — 화면은 입력을 요구한다.
 *  - housing-cap-toggle: 부칙 제15조 토글 ON인데 직전 본세 빈칸 — 토글은 UI 전용 상태라 ⑫에는 «상한 없음» 입력으로 보인다.
 *  - separated-type: 분리과세 유형 라디오 미선택 — 유형은 와이어에 `separateTaxationItem`이 없는 것으로만 보인다.
 */
function uiOnlyReason(form: FormState): string | null {
  if (!form.publishedPrice) return "blank-price";
  if (form.objectType === "housing" && form.housingTaxCapEnabled) return "housing-cap-toggle";
  if (form.objectType === "land" && form.landTaxType === "separated" && !form.stSeparatedType) return "separated-type";
  return null;
}

describe("⑧(firstInvalidStep) ↔ ⑫(Zod) 격자", () => {
  const cells = GRID.flatMap(([group, list]) =>
    list.map((p, i) => ({ id: `${group}#${i}`, form: { ...INITIAL_FORM, ...p } as FormState })),
  );

  it("격자 규모 — 셀 수가 줄면 축이 빠진 것", () => {
    expect(cells.length).toBeGreaterThanOrEqual(400);
  });

  it("⑧ 통과 ∧ ⑫ 400 = 0건 (화면 통과 → 서버 일반 문구 막다른 길 없음)", () => {
    const dead = cells.filter(({ form }) => {
      if (firstInvalidStep(form)) return false;
      return !propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form)).success;
    });
    expect(dead.map((c) => c.id)).toEqual([]);
  });

  it("⑧ 통과 ∧ ⑫ 통과 ∧ 엔진 던짐 = 0건 (화면·Zod 통과 → 422 막다른 길 없음)", () => {
    const thrown: string[] = [];
    for (const { id, form } of cells) {
      if (firstInvalidStep(form)) continue;
      const z = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
      if (!z.success) continue;
      try {
        calculatePropertyTax(z.data as PropertyTaxInput);
      } catch {
        thrown.push(id);
      }
    }
    expect(thrown).toEqual([]);
  });

  it("⑧ 차단 ∧ ⑫ 통과는 이름 붙인 화면 전용 사유로만 존재한다", () => {
    const unexplained = cells.filter(({ form }) => {
      if (!firstInvalidStep(form)) return false;
      if (propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form)).success === false) return false;
      return uiOnlyReason(form) === null;
    });
    expect(unexplained.map((c) => c.id)).toEqual([]);
  });

  it("⑫ 400이면 ⑧도 차단 — 같은 셀에서 둘이 같은 방향 (⑫ 400 ⇒ ⑧ 차단)", () => {
    const loose = cells.filter(({ form }) => {
      const z = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
      return !z.success && firstInvalidStep(form) === null;
    });
    expect(loose.map((c) => c.id)).toEqual([]);
  });
});
