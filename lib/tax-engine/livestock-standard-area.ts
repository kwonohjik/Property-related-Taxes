/**
 * 축산용 토지 기준면적 — **세목 중립 정본**
 *
 * ## 두 세목이 같은 표를 쓴다
 *
 * | 세목 | 근거 | 용도 |
 * |---|---|---|
 * | 양도세 | 「소득세법 시행령」 [별표 1의3] (§168조의10③ 위임) | 비사업용 토지 판정 |
 * | 재산세 | 「지방세법 시행령」 §102①3호 [표] | 분리과세 대상 범위 |
 *
 * 2026-08-06에 두 원문을 대조한 결과 **값·비고가 완전히 동일**하다(9종 × 축사·부대시설·초지·
 * 사료포, 비고의 말·노새·당나귀/친칠라/개/여우 포함까지). 사본을 두면 한쪽만 개정될 때 갈리므로
 * 1두당 표는 여기 한 벌만 둔다.
 *
 * ## ⚠️ 두수 산정은 **공유하지 않는다** — 세목별로 다르다
 *
 * | 세목 | 두수 산정 |
 * |---|---|
 * | 재산세 | 「과세기준일이 속하는 해의 **직전 연도**」 기준 · **연중 최고** 마릿수 (§102①3호 본문) |
 * | 양도세 | 최근 3~6 과세기간 중 납세자가 선택한 기간의 최고사육두수 **평균** (별표1의3 2호) |
 *
 * ⇒ 이 모듈은 **1두(수)당 면적**만 제공한다. 두수를 어떻게 구할지는 각 세목 모듈의 몫이다.
 *
 * ## 기준면적은 **보유한 시설만** 더한다
 *
 * 표의 4개 열(축사·부대시설·초지·사료포)은 **각 항목별 인정 한도**다. 그 농장에 없는 시설의
 * 몫까지 얹으면 근거 없이 한도가 커진다 — 반대로 있는 것을 빼면 근거 없이 좁아진다.
 *
 *   기준면적 = 축사 + (부대시설 有) + (초지 有) + (사료포 有)
 *
 * 열 묶음 제목의 「축사 **및** 부대시설」·「초지 **또는** 사료포」는 통상적인 구성을 적은
 * 이름표다 — 축사와 부대시설은 대개 함께 있고, 사료 공급은 방목(초지) **아니면** 재배(사료포)로
 * 갈린다. **접속사가 산식을 정하는 것이 아니라** 실제 보유 여부가 정한다.
 *
 * ⚠️ 축사는 축산업의 전제이므로 **항상 포함**한다. 나머지 셋은 호출부가 보유 여부를 받아 넘긴다
 * (`facilities` 필수 인자 — 기본값을 두지 않는다. 어느 쪽으로 가정하든 세액이 달라진다).
 */

/** 1두(수)당 기준면적 — 별표 원값 */
export interface LivestockStandard {
  /** 가축두수 단위 (표 「가축두수」 열: 1·5·10·100) */
  perUnit: number;
  /** 축사 (㎡) */
  barn: number;
  /** 부대시설 (㎡) */
  facility: number;
  /** 초지 (㎡ — 표는 헥타르, ×10,000 하여 저장. 부동소수 누적 회피) */
  grasslandM2: number;
  /** 사료포·사료밭 (㎡ — 표는 헥타르, ×10,000) */
  fodderM2: number;
}

/**
 * 축산용 토지 기준면적 정본 (9종).
 *
 * 키는 축종 + 사업(한우는 사육/비육 구분). 비고의 포함 축종:
 * 한우 사육 = 말·노새·당나귀 / 토끼 = 친칠라 / 돼지 = 개 / 밍크 = 여우.
 */
export const LIVESTOCK_STANDARD: Readonly<Record<string, LivestockStandard>> = Object.freeze({
  hanwoo_breeding:  { perUnit: 1,   barn: 7.5, facility: 5,  grasslandM2: 5000, fodderM2: 2500 }, // 한우(육우) 사육사업
  hanwoo_fattening: { perUnit: 1,   barn: 7.5, facility: 5,  grasslandM2: 2000, fodderM2: 1000 }, // 한우(육우) 비육사업
  dairy:            { perUnit: 1,   barn: 11,  facility: 7,  grasslandM2: 5000, fodderM2: 2500 }, // 유우(젖소) 목장사업
  sheep:            { perUnit: 10,  barn: 8,   facility: 3,  grasslandM2: 5000, fodderM2: 2500 }, // 양 목장사업
  deer:             { perUnit: 10,  barn: 66,  facility: 16, grasslandM2: 5000, fodderM2: 2500 }, // 사슴 목장사업
  rabbit:           { perUnit: 100, barn: 33,  facility: 7,  grasslandM2: 2000, fodderM2: 1000 }, // 토끼 사육사업
  pig:              { perUnit: 5,   barn: 50,  facility: 13, grasslandM2: 0,    fodderM2: 0 },    // 돼지 양돈사업
  poultry:          { perUnit: 100, barn: 33,  facility: 16, grasslandM2: 0,    fodderM2: 0 },    // 가금 양계사업
  mink:             { perUnit: 5,   barn: 7,   facility: 7,  grasslandM2: 0,    fodderM2: 0 },    // 밍크 사육사업
});

/** 사용자에게 보일 축종 라벨 — 표의 「구분 · 사업」 열 그대로 */
export const LIVESTOCK_LABELS: Readonly<Record<string, string>> = Object.freeze({
  hanwoo_breeding:  "한우(육우) 사육사업 — 말·노새·당나귀 포함",
  hanwoo_fattening: "한우(육우) 비육사업",
  dairy:            "젖소(유우) 목장사업",
  sheep:            "양 목장사업",
  deer:             "사슴 목장사업",
  rabbit:           "토끼 사육사업 — 친칠라 포함",
  pig:              "돼지 양돈사업 — 개 포함",
  poultry:          "가금 양계사업",
  mink:             "밍크 사육사업 — 여우 포함",
});

/** 부대시설·초지·사료포 보유 여부 — 축사는 축산업의 전제이므로 항상 포함한다. */
export interface LivestockFacilities {
  /** 부대시설 보유 */
  hasFacility: boolean;
  /** 초지 보유 (방목) */
  hasGrassland: boolean;
  /** 사료포·사료밭 보유 (사료 재배) */
  hasFodder: boolean;
}

/** 1두(수)당 기준면적 (㎡) — 축사 + 보유한 시설분 */
export function perUnitStandardArea(s: LivestockStandard, f: LivestockFacilities): number {
  return (
    s.barn +
    (f.hasFacility ? s.facility : 0) +
    (f.hasGrassland ? s.grasslandM2 : 0) +
    (f.hasFodder ? s.fodderM2 : 0)
  );
}

/**
 * 축종·사육두수·보유 시설로 축산용 토지 기준면적(㎡)을 계산한다.
 *
 * 기준면적 = (축사 + 보유 시설분) × 사육두수 ÷ 가축두수 단위.
 * 곱셈을 먼저 수행해 부동소수 누적을 피한다.
 *
 * @param livestockType `LIVESTOCK_STANDARD` 키 (예: "hanwoo_breeding")
 * @param count         사육두수(수)
 * @param facilities    부대시설·초지·사료포 보유 여부 — **필수**. 기본값을 두면 없는 시설의
 *                      몫을 얹거나 있는 것을 빼게 되고 그대로 세액이 틀어진다.
 * @returns 기준면적 (㎡). 미등재 축종이면 **0** — 호출부가 「추정 금지」로 처리할 것.
 */
export function computeLivestockStandardArea(
  livestockType: string,
  count: number,
  facilities: LivestockFacilities,
): number {
  const s = LIVESTOCK_STANDARD[livestockType];
  if (!s) return 0;
  return (perUnitStandardArea(s, facilities) * count) / s.perUnit;
}

/** 표시용 — 기준면적에 포함된 항목 이름 (사용자가 무엇이 반영됐는지 검증할 수 있게) */
export function includedFacilityLabels(f: LivestockFacilities): string[] {
  return [
    "축사",
    ...(f.hasFacility ? ["부대시설"] : []),
    ...(f.hasGrassland ? ["초지"] : []),
    ...(f.hasFodder ? ["사료포"] : []),
  ];
}
