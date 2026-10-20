/**
 * anchor — 신고서 양식 split-2col × 배율 초과 부수토지(비사업용 토지 파트) 열 반영 (표시 전용 · 세액 불변)
 *
 * 종전: `splitTwoColFinancials`가 `result.taxableGain / Σ파트 양도차익` **균일 비율**을 토지·건물에 곱했고 파트 장특은 `land/building.longTermDeduction`
 *       (초과분 `nonBusinessLandPart` 제외)이었다. 엔진은 #17-2에서 이내 토지 = max(0, 안분값 − 초과분) · 초과분 = 안분 없이 전액 과세 ·
 *       초과분 장특 = 표1로 갈라 echo한다 → 열 값이 echo와 어긋나고 열 합 ≠ 합계 열이었다(단일 15억 시료: 토지 열 과세 135,969,388 · 건물 열 156,887,754 · 장특 열 합 85,714,285 ≠ 합계 137,714,285).
 * 이제: 초과분이 있으면 엔진 echo를 읽는다. 초과분은 전용 열을 세우지 않고 **토지 열 안에서** 합산한다(겸용 4열 `fourPartFinancials`와 같은 규약 —
 *       취득가액·필요경비 칸이 토지 전체 기준이라 열 안에서 `양도가 − 취득가 − 필요경비 = 양도차익`이 성립하고 초과분 양도가·취득가를 따로 짓지 않는다).
 *       초과분이 없으면 종전 경로 그대로(아래 「불변」 블록이 수정 전 값을 고정).
 */
import { describe, it, expect } from "vitest";
import { calc, filingRows, sameDayInput, landFirstInput, LABEL, type Calc } from "./_helpers/filing-split-excess-fixture";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { COMBOS, SCN_N, run as runOwned } from "../tax-engine/transfer/_helpers/split-acq-display-fixture";

const N = (v: number | string | null | undefined) => v as number;

/** 열 합 = 합계 열 + 열 안 항등식 + echo 대조 — 시료와 무관한 불변식 */
function expectColumnsMatchEcho(r: Calc, price: number) {
  const sd = r.splitDetail!;
  const nb = sd.nonBusinessLandPart!;
  const rows = filingRows(r, price);
  const row = (l: string) => rows.get(l)!;

  // ① 파트 echo 대조 (균일 비율이 아니라 echo를 읽는다)
  expect(N(row(LABEL.taxable).land)).toBe((sd.land.taxableGainAfterProration ?? sd.land.gain) + (nb.taxableGainAfterProration ?? nb.gain));
  expect(N(row(LABEL.taxable).building)).toBe(sd.building.taxableGainAfterProration ?? sd.building.gain);
  expect(N(row(LABEL.lt).land)).toBe(sd.land.longTermDeduction + nb.longTermDeduction);
  expect(N(row(LABEL.lt).building)).toBe(sd.building.longTermDeduction);
  expect(N(row(LABEL.hold).land)).toBe((sd.land.holdingDeductionAmount ?? 0) + nb.longTermDeduction); // 초과분 장특은 표1 보유분 단독
  expect(N(row(LABEL.res).land)).toBe(sd.land.residenceDeductionAmount ?? 0);
  expect(N(row(LABEL.hold).building)).toBe(sd.building.holdingDeductionAmount ?? 0);
  expect(N(row(LABEL.res).building)).toBe(sd.building.residenceDeductionAmount ?? 0);

  // ② 열 합 = 합계 열 (과세·비과세·장특·보유분·거주분·양도소득금액)
  for (const l of [LABEL.gain, LABEL.exempt, LABEL.taxable, LABEL.lt, LABEL.hold, LABEL.res, LABEL.income]) {
    expect(N(row(l).land) + N(row(l).building), `${l.trim()} 열 합`).toBe(N(row(l).total));
  }
  // ③ 열 안 항등식 — 과세 + 비과세 = 전체 양도차익 · 보유분 + 거주분 = 장특 · 소득금액 = 과세 − 장특
  for (const c of ["land", "building"] as const) {
    expect(N(row(LABEL.taxable)[c]) + N(row(LABEL.exempt)[c]), `${c} 과세+비과세`).toBe(N(row(LABEL.gain)[c]));
    expect(N(row(LABEL.hold)[c]) + N(row(LABEL.res)[c]), `${c} 보유분+거주분`).toBe(N(row(LABEL.lt)[c]));
    expect(N(row(LABEL.income)[c]), `${c} 소득금액`).toBe(N(row(LABEL.taxable)[c]) - N(row(LABEL.lt)[c]));
  }
  // ④ 합계 열은 엔진 자산 값 그대로
  expect(N(row(LABEL.taxable).total)).toBe(r.taxableGain);
  expect(N(row(LABEL.lt).total)).toBe(r.longTermHoldingDeduction);
  expect(N(row(LABEL.income).total)).toBe(r.taxableGain - r.longTermHoldingDeduction);
  // ⑤ 열 구성은 그대로 합계·토지·건물 — 초과분 전용 열은 없다
  expect(deriveColumns(r).columns.map((c) => c.key)).toEqual(["total", "land", "building"]);
}

describe("① 사용자 보고 시료 — 단일 15억 · 같은 날 취득 · 토지 500㎡ · 정착 100㎡(한도 300㎡) · 양도 2026-02-16 (#17-2 anchor 시료)", () => {
  const r = calc(sameDayInput("2026-02-16", 1_500_000_000, 500));
  const rows = filingRows(r, 1_500_000_000);

  it("전제 — 이내 토지 과세 0(0 하한) · 초과분 185,714,286 · 건물 107,142,857", () => {
    const sd = r.splitDetail!;
    expect(sd.land.taxableGainAfterProration).toBe(0);
    expect(sd.nonBusinessLandPart!.taxableGainAfterProration).toBe(185_714_286);
    expect(sd.building.taxableGainAfterProration).toBe(107_142_857);
    expect(sd.nonBusinessLandPart!.longTermDeduction).toBe(52_000_000);
    expect(r.taxableGain).toBe(292_857_143);
  });

  it("과세대상 양도차익 — 토지 열 185,714,286(이내 0 + 초과 185,714,286) · 건물 열 107,142,857 (종전 135,969,388 · 156,887,754)", () => {
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 185_714_286, building: 107_142_857, total: 292_857_143 });
  });

  it("비과세 양도차익 — 토지 278,571,429 · 건물 428,571,428 (종전 328,316,327 · 378,826,531)", () => {
    expect(rows.get(LABEL.exempt)).toMatchObject({ land: 278_571_429, building: 428_571_428, total: 707_142_857 });
  });

  it("장기보유특별공제 — 토지 열 52,000,000(초과분 표1) · 건물 85,714,285 · 합 137,714,285 (종전 열 합 85,714,285 ≠ 합계)", () => {
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 52_000_000, building: 85_714_285, total: 137_714_285 });
    expect(rows.get(LABEL.hold)).toMatchObject({ land: 52_000_000, building: 42_857_143, total: 94_857_143 }); // 초과분은 보유분 — 합계 열도 종전엔 42,857,143
    expect(rows.get(LABEL.res)).toMatchObject({ land: 0, building: 42_857_142, total: 42_857_142 });
  });

  it("양도소득금액 — 토지 133,714,286 · 건물 21,428,572 · 합 155,142,858 (종전 열 합 207,142,857 ≠ 합계 155,142,858)", () => {
    expect(rows.get(LABEL.income)).toMatchObject({ land: 133_714_286, building: 21_428_572, total: 155_142_858 });
  });

  it("취득가액·필요경비·양도가액은 토지 전체 기준 그대로 — 열 안 `양도가 − 취득가 − 필요경비 = 양도차익`", () => {
    for (const c of ["land", "building"] as const) {
      expect(N(rows.get("양도가액")![c]) - N(rows.get("취득가액")![c]) - N(rows.get("필요경비")![c])).toBe(N(rows.get(LABEL.gain)![c]));
    }
  });

  it("불변식 묶음(echo 대조 · 열 합 · 열 안 항등식 · 합계 열)", () => expectColumnsMatchEcho(r, 1_500_000_000));
});

describe("③ 12억 이하(전액 비과세 + 초과분) · 고가(L'>X) · 경계", () => {
  it("10억(12억 이하) — 이내 토지·건물 과세 0, 초과분만 과세: 토지 열 85,714,286 · 건물 열 0 · 장특 24,000,000(토지 열) (종전 36,734,694 · 48,979,591 · 장특 0/0)", () => {
    const r = calc(sameDayInput("2026-02-16", 1_000_000_000, 500));
    expect(r.isPartialExempt).toBe(false); // 안분 대상 아님 — 이내 토지·건물은 전액 비과세
    const rows = filingRows(r, 1_000_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 85_714_286, building: 0, total: 85_714_286 });
    expect(rows.get(LABEL.exempt)).toMatchObject({ land: 128_571_429, building: 285_714_285, total: 414_285_714 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 24_000_000, building: 0, total: 24_000_000 });
    expect(rows.get(LABEL.income)).toMatchObject({ land: 61_714_286, building: 0, total: 61_714_286 });
    expectColumnsMatchEcho(r, 1_000_000_000);
  });

  it("30억(L'>X · 이내 토지 242,857,143 > 0) — 토지 열 = 이내 242,857,143 + 초과 485,714,286 = 728,571,429", () => {
    const r = calc(sameDayInput("2026-02-16", 3_000_000_000, 500));
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(242_857_143);
    const rows = filingRows(r, 3_000_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 728_571_429, building: 771_428_571, total: 1_500_000_000 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 330_285_714, building: 617_142_856, total: 947_428_570 }); // 194,285,714 + 136,000,000
    expect(rows.get(LABEL.income)).toMatchObject({ land: 398_285_715, building: 154_285_715, total: 552_571_430 });
    expectColumnsMatchEcho(r, 3_000_000_000);
  });

  it("20억 경계(L'=X → 이내 토지 0) — 열 값이 종전과 같은 합이어도 장특·소득금액은 echo로 정정", () => {
    const r = calc(sameDayInput("2026-02-16", 2_000_000_000, 500));
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
    const rows = filingRows(r, 2_000_000_000);
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 80_000_000, building: 251_428_571, total: 331_428_571 });
    expect(rows.get(LABEL.income)).toMatchObject({ land: 205_714_286, building: 62_857_143, total: 268_571_429 });
    expectColumnsMatchEcho(r, 2_000_000_000);
  });

  it("양도차손 파트(토지 −291,223,404) — 초과분 차손 파트(−116,489,362)가 서도 열이 엔진 echo(이내 토지 0 · 건물 과세 258,244,680)를 읽는다", () => {
    const r = calc(sameDayInput("2026-02-16", 1_500_000_000, 500, {
      standardPriceAtAcquisition: 470_000_000, standardPricePerSqmAtAcquisition: 900_000, buildingStandardPriceAtAcquisition: 20_000_000,
      landStandardPriceAtTransfer: 100_000_000, buildingStandardPriceAtTransfer: 700_000_000,
    }));
    expect(r.splitDetail!.land.gain).toBe(-291_223_404);
    // 🔁 토지 차손도 배율 초과분(200/500㎡)을 비사업용 토지 차손으로 떼어 전액 과세분으로 둔다(사용자 결정 2026-10-20 A안 — 종전 토지 차손을 0으로 잘라 초과분 0).
    //   초과분 floor(−291,223,404 × 0.4) = −116,489,362 · 이내분 min(0, 안분 floor(−291,223,404 × 3/15) = −58,244,681 − 초과분) = 0(초과분 차손이 더 커 0 — 이익의 「없는 것으로 본다」와 대칭)
    expect(r.splitDetail!.nonBusinessLandPart!.gain).toBe(-116_489_362);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
    const rows = filingRows(r, 1_500_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: -116_489_362, building: 258_244_680, total: 141_755_318 }); // 종전 토지 0 · 합계 258,244,680
    // 비과세 양도차익은 열 안 항등식(과세 + 비과세 = 전체)이 우선 — 손실 열은 음수로 남고 열 합 = 합계
    expect(N(rows.get(LABEL.exempt)!.land) + N(rows.get(LABEL.exempt)!.building)).toBe(N(rows.get(LABEL.exempt)!.total));
    expectColumnsMatchEcho(r, 1_500_000_000);
  });
});

describe("④ 연혁 시료 — 양도일 2020(표2 단일축 · 거주분 0) · 2021-06-10(고가 기준 9억) · 2024 · 2026", () => {
  it("2020-06-10 · 토지 900㎡(영 §154⑦ 전 도시지역 일률 5배 → 한도 500㎡) — 보유분만 · 토지 열 176,470,588 · 장특 28,235,294", () => {
    const r = calc(sameDayInput("2020-06-10", 1_500_000_000, 900));
    const rows = filingRows(r, 1_500_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 176_470_588, building: 241_176_470, total: 417_647_058 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 28_235_294, building: 154_352_940, total: 182_588_234 });
    expect(rows.get(LABEL.res)).toMatchObject({ land: 0, building: 0, total: 0 });
    expectColumnsMatchEcho(r, 1_500_000_000);
  });

  it.each([
    ["2021-06-10", 1_500_000_000, 700], // 2022.1.1. 전 양도 — 도시지역 일률 5배(한도 500㎡) → 700㎡면 초과 200㎡
    ["2024-06-10", 1_500_000_000, 500],
    ["2026-02-16", 1_500_000_000, 500],
  ])("%s %i · 토지 %i㎡ — 불변식 묶음", (td, price, area) => {
    const r = calc(sameDayInput(td, price, area));
    expect(r.splitDetail!.nonBusinessLandPart).toBeDefined();
    expectColumnsMatchEcho(r, price);
  });

  it("2024-06-10 15억 — 토지 열 장특 44,571,428(초과분 표1) · 합 130,285,713", () => {
    const rows = filingRows(calc(sameDayInput("2024-06-10", 1_500_000_000, 500)), 1_500_000_000);
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 44_571_428, building: 85_714_285, total: 130_285_713 });
    expect(rows.get(LABEL.income)).toMatchObject({ land: 141_142_858, building: 21_428_572, total: 162_571_430 });
  });
});

describe("⑤ 토지 먼저 취득(별개취득) — 같은 날 취득이 아닌 경로도 같은 echo", () => {
  it.each([[2_000_000_000], [1_000_000_000], [3_000_000_000]])("%i — 불변식 묶음", (price) => {
    const r = calc(landFirstInput(price));
    expect(r.splitDetail!.nonBusinessLandPart).toBeDefined();
    expectColumnsMatchEcho(r, price);
  });

  it("20억 — 토지 열 장특 280,509,090(이내 242,327,272 + 초과 38,181,818) · 소득금액 279,490,910 (기본통칙 95-0…1 반영 전 장특 297,818,181 · 소득금액 262,181,819 / 그 전 종전 장특 259,636,363)", () => {
    const rows = filingRows(calc(landFirstInput(2_000_000_000)), 2_000_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 560_000_000, building: 120_000_000, total: 680_000_000 }); // 종전과 같다(L'≥X에서 균일 비율이 우연히 일치)
    // 🔁 토지(15년)가 건물(9년)보다 오래돼 토지분 = max(표1 30%, 표2 56%) = 56%(종전 토지 자신의 15년 표2 60%): 이내 432,727,273 × 56% = 242,327,272
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 280_509_090, building: 67_200_000, total: 347_709_090 });
    expect(rows.get(LABEL.income)).toMatchObject({ land: 279_490_910, building: 52_800_000, total: 332_290_910 });
  });

  it("10억(12억 이하) — 토지 열 54,545,454 · 건물 열 0 (종전 46,753,246 · 7,792,207)", () => {
    const rows = filingRows(calc(landFirstInput(1_000_000_000)), 1_000_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 54_545_454, building: 0, total: 54_545_454 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 16_363_636, building: 0, total: 16_363_636 });
  });
});

describe("② 초과분 없는 시료는 종전과 같다 — 수정 전 출력을 박아 고정(균일 비율 경로 유지)", () => {
  it("15억 · 토지 300㎡(한도와 같음 → 초과 0) — 수정 전 값 그대로(건물 열 잔액 흡수 3칸만 +1·−1 — 별건 ②)", () => {
    const r = calc(sameDayInput("2026-02-16", 1_500_000_000, 300));
    expect(r.splitDetail!.nonBusinessLandPart).toBeUndefined();
    const rows = filingRows(r, 1_500_000_000);
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 105_555_555, building: 94_444_445, total: 200_000_000 });
    expect(rows.get(LABEL.exempt)).toMatchObject({ land: 422_222_224, building: 377_777_776, total: 800_000_000 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 84_444_444, building: 75_555_555, total: 159_999_999 });
    expect(rows.get(LABEL.hold)).toMatchObject({ land: 42_222_222, building: 37_777_778, total: 80_000_000 });
    expect(rows.get(LABEL.res)).toMatchObject({ land: 42_222_222, building: 37_777_777, total: 79_999_999 });
    expect(rows.get(LABEL.income)).toMatchObject({ land: 21_111_111, building: 18_888_890, total: 40_000_001 });
  });

  it("초과분이 없으면 초과분 각주도 없다 — 취득가액 행 외 roseNotes 없음", () => {
    const r = calc(sameDayInput("2026-02-16", 1_500_000_000, 300));
    const { mode } = deriveColumns(r);
    expect(mode).toBe("split-2col");
    // 균일 비율 경로 — 같은 입력에 면적만 달라 초과가 생기면 각주가 생기는 것과 대조(아래 RTL 테스트에서 문구 확인)
    expect(r.splitDetail!.nonBusinessLandPart).toBeUndefined();
  });

  it("균일 비율 경로 — 건물 열이 합계 잔액을 흡수한다: 건물 열 과세 3,410,680(종전 3,410,679) · 열 합 = 합계 열(과세·비과세·소득금액·감면후 4행)", () => {
    // 종전에는 합계 비율을 파트마다 floor해 열 합이 합계보다 1원 작았다(이 테스트가 그 값을 고정하고 있었다 — 별건 ②).
    // 지금은 토지 열 floor · 건물 열 = 합계 − 토지 열(§155⑳ 경로 `rentalSplitTwoColFinancials`와 같은 규약). 토지 열은 종전과 같다.
    const r = calc(sameDayInput("2026-02-16", 1_210_000_000, 300, {
      standardPriceAtAcquisition: 550_000_000, standardPricePerSqmAtAcquisition: 800_000, buildingStandardPriceAtAcquisition: 150_000_000,
    }));
    expect(r.splitDetail!.nonBusinessLandPart).toBeUndefined();
    const rows = filingRows(r, 1_210_000_000);
    const sd = r.splitDetail!;
    const ratio = r.taxableGain / (sd.land.gain + sd.building.gain);
    expect(N(rows.get(LABEL.taxable)!.land)).toBe(Math.floor(sd.land.gain * ratio));
    expect(N(rows.get(LABEL.taxable)!.building)).toBe(3_410_680);
    for (const label of [LABEL.taxable, LABEL.exempt, LABEL.income, "감면후 소득금액"]) {
      const row = rows.get(label)!;
      expect(N(row.land) + N(row.building), label).toBe(N(row.total));
    }
  });

  it("잔액 흡수는 두 파트를 모두 소유할 때만 — 한 파트만 소유하면 합계 열이 그 파트 하나라 건물 열을 «합계 − 토지 열»로 만들지 않는다", () => {
    // 가드를 빼면 건물만 소유(N·AE)에서 건물 열이 111,000,000 → −364,000,000, 토지만 소유에서 0이 된다(실측).
    for (const [own, building] of [["building_only", 111_000_000], ["land_only", 111_000_000]] as const) {
      const r = runOwned(SCN_N, COMBOS.AE, { selfOwns: own } as never);
      const { mode } = deriveColumns(r);
      expect(mode).toBe("split-2col");
      const v = buildRows(r, mode, undefined, undefined, SCN_N.price).find((x) => x.label === LABEL.taxable)!.values;
      expect(N(v.building), own).toBe(building);
    }
  });

  it("균일 비율 경로 스캔 — 양도가 12억 초과 구간 1원 단위 이웃까지 4행 열 합 = 합계 열", () => {
    const misses: string[] = [];
    let checked = 0;
    for (const base of [1_210_000_000, 1_333_333_333, 1_500_000_000, 1_777_777_777, 2_345_678_901]) {
      for (const d of [0, 1, 2, 3, 7]) {
        const price = base + d;
        const r = calc(sameDayInput("2026-02-16", price, 300, {
          standardPriceAtAcquisition: 550_000_000, standardPricePerSqmAtAcquisition: 800_000, buildingStandardPriceAtAcquisition: 150_000_000,
        }));
        if (r.splitDetail?.nonBusinessLandPart || deriveColumns(r).mode !== "split-2col") continue;
        checked++;
        const rows = filingRows(r, price);
        for (const label of [LABEL.taxable, LABEL.exempt, LABEL.income, "감면후 소득금액"]) {
          const row = rows.get(label)!;
          if (N(row.land) + N(row.building) !== N(row.total)) misses.push(`${price} ${label}`);
        }
      }
    }
    expect(checked).toBe(25);
    expect(misses).toEqual([]);
  });
});

describe("⑥ §155⑳ 특례(isRH) + 초과분 — 파트 echo를 읽는다(합계 열 의미: 과세대상 양도차익 = 전체 양도차익)", () => {
  it("특례 적용 자산 — 종전: 균일 비율(토지 273,651,337 · 건물 58,639,572)·장특 열 0 · 열 합 ≠ 합계 → 지금: 파트 echo, 열 합 = 합계 열", () => {
    const rentalException = {
      applyException: true, scenario: "A",
      rentalUnits: [{
        businessRegistrationDate: new Date("2018-06-01"), rentalRegistrationDate: new Date("2018-06-01"), rentalCategory: "long_general",
        rentalAcquisitionType: "purchase", isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
        hasMinimumUnits: false, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
      }],
    };
    const r = calc({ ...landFirstInput(2_000_000_000), rentalHousingException: rentalException, householdHousingCount: 2 } as never);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.splitDetail!.nonBusinessLandPart).toBeDefined();
    const rows = filingRows(r, 2_000_000_000);
    // 합계 열 의미(특례): 과세대상 양도차익 = 전체 양도차익 · 비과세 양도차익 0
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 1_400_000_000, building: 300_000_000, total: 1_700_000_000 });
    expect(rows.get(LABEL.exempt)).toMatchObject({ land: 0, building: 0, total: 0 });
    // 장특 = 파트 echo — 이내 토지 1,272,727,273 × 56% = 712,727,272 + 초과분 표1 38,181,818 / 건물 300,000,000 × 56% = 168,000,000 / 합 918,909,090(종전 열 0 · 0)
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 750_909_090, building: 168_000_000, total: 918_909_090 });
    // 양도소득금액(§95①) = 열 안 양도차익 − 장특 — 합 781,090,910
    expect(rows.get(LABEL.income)).toMatchObject({ land: 649_090_910, building: 132_000_000, total: 781_090_910 });
    // 감면후 소득금액 = 특례 후 과세대상: 이내 토지 190,400,001 + 초과분 89,090,909 / 건물 52,800,000 / 합 332,290,910 (일반 경로와 같은 파트 값)
    expect(rows.get("감면후 소득금액")).toMatchObject({ land: 279_490_910, building: 52_800_000, total: 332_290_910 });
  });
});

