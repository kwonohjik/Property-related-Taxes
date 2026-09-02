/**
 * 「지방세법 시행령」 제101조 제2항 용도지역별 적용배율 — **전 세목 단일 정본**.
 *
 * ## 조문 구조 (법제처 원문)
 *
 * **제101조 제1항** — 법 제106조 제1항 제2호 가목의 "건축물의 부속토지"
 *   - **제1호**: 특별시·광역시(군 제외)·특별자치시·특별자치도 및 시지역의 **공장용** 건축물
 *     부속토지 = 바닥면적(건축물 외 시설은 수평투영면적) × **제2항 적용배율**.
 *     단 읍·면지역 / 「산업입지 및 개발에 관한 법률」 산업단지 /
 *     「국토의 계획 및 이용에 관한 법률」 공업지역은 제외(→ 분리과세 §102 영역).
 *   - **제2호**: 제1호 공장용을 **제외한** 건축물 부속토지 = 바닥면적 × **제2항 적용배율**.
 *     단 가목(법 §106①3호 다목 토지 안의 건축물 부속토지)·나목(건축물 시가표준액이 부속토지
 *     시가표준액의 100분의 2 미달 시 그 바닥면적을 제외한 부속토지)은 제외.
 *   - 제1항 단서 — 허가 등을 받지 않은 건축물, 사용승인을 받지 않고 사용 중인 건축물의
 *     부속토지는 전부 제외.
 *
 * **제2항 [표]** — 제1항에 적용할 용도지역별 적용배율
 *
 * | 구분 | 용도지역별 | 적용배율 |
 * |---|---|---|
 * | 도시지역 | 1. 전용주거지역 | 5배 |
 * | 도시지역 | 2. 준주거지역·상업지역 | 3배 |
 * | 도시지역 | 3. 일반주거지역·공업지역 | 4배 |
 * | 도시지역 | 4. 녹지지역 | 7배 |
 * | 도시지역 | 5. 미계획지역 | 4배 |
 * | — | 도시지역 외의 용도지역 | 7배 |
 *
 * ⚠️ **제2항에는 호(號)가 없다** — 표 안의 1~5는 도시지역 세부 구분이다.
 * 종전 코드가 인용하던 "§101②1호"·"§101②2호"는 §101①2호·§101①1호의 오기였다.
 *
 * ## 사용 범위
 *
 * | 세목 | 경로 | 근거 체인 |
 * |---|---|---|
 * | 양도세 | 건축물(비주택) 부수토지 비사업용 판정 | 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 이 표 |
 * | 재산세 | 별도합산 기준면적 / 초과분 종합합산 전환 | 「지방세법」 §106①2호 → 이 표 |
 *
 * ⚠️ **수도권 축이 없다** — 용도지역만으로 결정된다. 「소득세법 시행령」 제168조의12
 * (**주택** 부수토지 배율)와 결정적으로 다르며, 두 표는 22개 조합 중 19개가 어긋난다.
 * 주택 부수토지는 `non-business-land/urban-area.ts`의 `getHousingMultiplier`를 쓴다.
 *
 * ⚠️ 법제처 Open API는 조문 안에 삽입된 표를 반환하지 않으므로 이 파일이 유일한 정본이다.
 * 개정 시 `__tests__/tax-engine/local-tax-zone-multiplier.anchor.test.ts`가 먼저 깨진다.
 *
 * ⚠️ 세분 전 주거지역(`residential`)은 표에 대응 항목이 **없어 의도적으로 미등재**다 —
 * 전용(5배)·일반(4배)·준주거(3배)가 모두 다르므로 통합 키로는 배율을 결정할 수 없다.
 * 조회 결과 `undefined` = "배율 결정 불가"이며, 호출부가 차단해야 한다(추정 배율 적용 금지).
 */

/** 「지방세법 시행령」 제101조 제2항 표에 대응하는 용도지역 키. */
export type LocalTaxZoneKey =
  | "exclusive_residential" // 도시지역 1. 전용주거지역
  | "semi_residential" //     도시지역 2. 준주거지역
  | "commercial" //           도시지역 2. 상업지역
  | "general_residential" //  도시지역 3. 일반주거지역
  | "industrial" //           도시지역 3. 공업지역
  | "green" //                도시지역 4. 녹지지역
  | "unplanned" //            도시지역 5. 미계획지역
  | "management" //           도시지역 외 — 관리지역
  | "agriculture_forest" //   도시지역 외 — 농림지역
  | "natural_env" //          도시지역 외 — 자연환경보전지역
  | "undesignated"; //        도시지역 외 — 용도 미지정

/**
 * 제101조 제2항 [표] 적용배율 — 정본 맵.
 *
 * 키는 「소득세법 시행령」 계열 `ZoneType`(양도세 비사업용 판정)과 이름을 맞췄다.
 * 재산세 계열의 레거시 키(`agricultural`·`nature_preserve`)는 `ZONE_KEY_ALIAS`가 흡수한다.
 */
export const LOCAL_TAX_ZONE_AREA_MULTIPLIER: Record<LocalTaxZoneKey, number> = {
  exclusive_residential: 5,
  semi_residential: 3,
  commercial: 3,
  general_residential: 4,
  industrial: 4,
  green: 7,
  unplanned: 4,
  management: 7,
  agriculture_forest: 7,
  natural_env: 7,
  undesignated: 7,
};

/**
 * 세목별 레거시 키 → 정본 키.
 *
 * 재산세 엔진은 농림지역을 `agricultural`, 자연환경보전지역을 `nature_preserve`로 부른다.
 * 둘 다 "도시지역 외의 용도지역" 7배로 값이 같아 rename하지 않고 별칭으로 흡수한다.
 */
const ZONE_KEY_ALIAS: Record<string, LocalTaxZoneKey> = {
  agricultural: "agriculture_forest",
  nature_preserve: "natural_env",
  // 「지방세법 시행령」 §101② 배율표는 녹지지역을 세분하지 않는다(7배 단일).
  // 보전녹지 구분은 「소득세법 시행령」 §168의9①2호 단서에만 필요하므로 여기선 흡수한다.
  conservation_green: "green",
};

/** 배율 산정 근거를 화면·경고문에 표시할 때 쓰는 용도지역 한국어 명칭. */
export const LOCAL_TAX_ZONE_LABEL: Record<LocalTaxZoneKey, string> = {
  exclusive_residential: "전용주거지역",
  semi_residential: "준주거지역",
  commercial: "상업지역",
  general_residential: "일반주거지역",
  industrial: "공업지역",
  green: "녹지지역",
  unplanned: "미계획지역",
  management: "관리지역",
  agriculture_forest: "농림지역",
  natural_env: "자연환경보전지역",
  undesignated: "용도 미지정",
};

/** 임의 문자열 용도지역 키를 정본 키로 정규화한다. 표 미등재는 `undefined`. */
export function normalizeLocalTaxZoneKey(zone: string): LocalTaxZoneKey | undefined {
  const canonical = ZONE_KEY_ALIAS[zone] ?? (zone as LocalTaxZoneKey);
  return canonical in LOCAL_TAX_ZONE_AREA_MULTIPLIER ? canonical : undefined;
}

/**
 * 용도지역별 적용배율 조회 — **전 세목 단일 진입점**.
 *
 * @returns 표 미등재 용도지역(세분 전 `residential` 등)은 `undefined`.
 *          호출부는 추정 배율로 대체하지 말고 차단해야 한다.
 */
export function getZoneAreaMultiplier(
  zone: string,
): { multiplier: number; label: string; detail: string } | undefined {
  const key = normalizeLocalTaxZoneKey(zone);
  if (!key) return undefined;

  const multiplier = LOCAL_TAX_ZONE_AREA_MULTIPLIER[key];
  const label = LOCAL_TAX_ZONE_LABEL[key];
  return {
    multiplier,
    label,
    detail: `${label} ${multiplier}배 (「지방세법 시행령」 제101조 제2항)`,
  };
}
