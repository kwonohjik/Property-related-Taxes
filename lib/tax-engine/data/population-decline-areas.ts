/**
 * 인구감소지역·인구감소관심지역 시군구코드 상수 및 자동 판정 함수.
 * 행안부 고시(지방자치분권 및 지역균형발전에 관한 특별법 §2 12호·12호의2).
 *
 * ⏱️ 지정은 고시마다 바뀐다 — 판정은 **기준일**(호출부가 넘기는 취득일, 「취득 당시」 요건)로 한다(2026-11 리뷰 D-43·D-44).
 *    - 아래 두 집합: 고시 제2025-78호(2026.1.1. 시행) 기준 — 인구감소지역 89곳·관심지역 18곳.
 *    - 고시 제2026-61호(2026.10.20. 시행, 제2025-78호 폐지)로 세법 대상이 바뀐 곳은 `REDESIGNATION_2026_10_20` 증감분이다.
 *      부칙 제3조(「인구활력+지역」 — 기존 지정 유지)로 남은 곳은 바뀌지 않는다.
 *    - 수도권 접경지역 편입일(`CAPITAL_BORDER_FROM`) 전에는 그 시·군이 수도권(접경지역 제외)이라 다목 대상이 아니다.
 * 소령 §167의3①12 다목(인구감소지역)·라목(인구감소관심지역) 세컨드홈 특례 적용.
 *
 * ⚠️ 코드 체계: house.regionCode = PNU 앞 10자리(법정동코드)와 동일(Vworld 실측 전수 검증).
 *    강원특별자치도(2023.6.11~) 51·전북특별자치도(2024.1.18~) 52 시도코드 반영(구 42/45 폐기).
 *
 * ⚠️ 세법 필터(행안부 행정지정 ≠ 세법 적용대상):
 *    - 다목 1호 단서: 수도권(접경지역 아닌 지역) 또는 광역시(군 제외) 제외
 *      → 광역시 자치구(부산 동구·서구·영도구, 대구 남구·서구) 미수록.
 *        광역시의 군(대구 군위군)·수도권 접경(강화·옹진·연천·가평)은 포함.
 *      → 행안부 89곳 중 세법 적용 84곳.
 *    - 라목 1호 단서: 수도권 밖 + 광역시(군 제외) 제외(접경 예외 없음)
 *      → 수도권(경기 동두천·포천, 인천 동구)·광역시 자치구(부산 중구·금정구, 대전 동구·중구·대덕구, 광주 동구) 미수록.
 *      → 행안부 관심지역 18곳 중 세법 적용 9곳(강원4·전북1·경북2·경남2).
 */

import { hasAnySigunguAlias } from "@/lib/geo/sigungu-code-alias";

/**
 * 인구감소지역 시군구코드(법정동 5자리) 집합 — 소령 §167의3①12 다목 적용 대상(84곳).
 */
export const POPULATION_DECLINE_AREA_CODES = new Set<string>([
  // 대구광역시 (광역시의 군 — 다목 포함)
  "27720", // 군위군
  // 인천광역시 (수도권 접경 — 다목 포함)
  "28710", // 강화군
  "28720", // 옹진군
  // 경기도 (수도권 접경 — 다목 포함)
  "41820", // 가평군
  "41800", // 연천군
  // 강원특별자치도 (51)
  "51820", // 고성군
  "51230", // 삼척시
  "51800", // 양구군
  "51830", // 양양군
  "51750", // 영월군
  "51770", // 정선군
  "51780", // 철원군
  "51190", // 태백시
  "51760", // 평창군
  "51720", // 홍천군
  "51790", // 화천군
  "51730", // 횡성군
  // 충청북도 (43)
  "43760", // 괴산군
  "43800", // 단양군
  "43720", // 보은군
  "43740", // 영동군
  "43730", // 옥천군
  "43150", // 제천시
  // 충청남도 (44)
  "44150", // 공주시
  "44710", // 금산군
  "44230", // 논산시
  "44180", // 보령시
  "44760", // 부여군
  "44770", // 서천군
  "44810", // 예산군
  "44790", // 청양군
  "44825", // 태안군
  // 전북특별자치도 (52)
  "52790", // 고창군
  "52210", // 김제시
  "52190", // 남원시
  "52730", // 무주군
  "52800", // 부안군
  "52770", // 순창군
  "52750", // 임실군
  "52740", // 장수군
  "52180", // 정읍시
  "52720", // 진안군
  // 전라남도 (46)
  "46810", // 강진군
  "46770", // 고흥군
  "46720", // 곡성군
  "46730", // 구례군
  "46710", // 담양군
  "46780", // 보성군
  "46910", // 신안군
  "46870", // 영광군
  "46830", // 영암군
  "46890", // 완도군
  "46880", // 장성군
  "46800", // 장흥군
  "46900", // 진도군
  "46860", // 함평군
  "46820", // 해남군
  "46790", // 화순군
  // 경상북도 (47)
  "47830", // 고령군
  "47280", // 문경시
  "47920", // 봉화군
  "47250", // 상주시
  "47840", // 성주군
  "47170", // 안동시
  "47770", // 영덕군
  "47760", // 영양군
  "47210", // 영주시
  "47230", // 영천시
  "47940", // 울릉군
  "47930", // 울진군
  "47730", // 의성군
  "47820", // 청도군
  "47750", // 청송군
  // 경상남도 (48)
  "48880", // 거창군
  "48820", // 고성군
  "48840", // 남해군
  "48270", // 밀양시
  "48860", // 산청군
  "48720", // 의령군
  "48740", // 창녕군
  "48850", // 하동군
  "48730", // 함안군
  "48870", // 함양군
  "48890", // 합천군
]);

/**
 * 인구감소관심지역 시군구코드(법정동 5자리) 집합 — 소령 §167의3①12 라목 적용 대상(9곳).
 * 행안부 관심지역 18곳 중 수도권·광역시 자치구 제외(라목 1호 단서).
 */
export const POPULATION_INTEREST_AREA_CODES = new Set<string>([
  // 강원특별자치도 (51)
  "51150", // 강릉시
  "51170", // 동해시
  "51210", // 속초시
  "51810", // 인제군
  // 전북특별자치도 (52)
  "52140", // 익산시
  // 경상북도 (47)
  "47130", // 경주시
  "47150", // 김천시
  // 경상남도 (48)
  "48220", // 통영시
  "48240", // 사천시
]);

/**
 * 법정동 코드(10자리)에서 시·군·구 코드(앞 5자리)를 추출한다.
 * @returns 시·군·구 5자리 코드. regionCode가 없거나 5자리 미만이면 null.
 */
export function toSigunguCode(regionCode?: string): string | null {
  if (!regionCode || regionCode.length < 5) return null;
  return regionCode.substring(0, 5);
}

/** 행정안전부 고시 제2026-61호 시행일 — 부칙 제1조 「2026년 10월 20일부터 시행」. */
export const POP_DECLINE_REDESIGNATION_2026_10_20 = new Date(Date.UTC(2026, 9, 20));

/**
 * 고시 제2026-61호로 세법 대상이 바뀐 시·군 — 그 전 지정(제2025-78호) 대비 증감.
 * - 동두천시: 관심지역(수도권이라 라목 제외) → 인구감소지역(수도권 접경 — 다목, 4억)
 * - 통영시: 관심지역(라목) → 인구감소지역(다목, 수도권 밖 9억)
 * - 예천군·칠곡군: 관심지역 신규(라목, 4억)
 * 금정구·부산 북구·인천 제물포구 등은 광역시 자치구라 세법 대상이 아니다(위 단서).
 */
const REDESIGNATION_2026_10_20 = {
  declineAdded: new Set<string>(["41250" /* 동두천시 */, "48220" /* 통영시 */]),
  interestAdded: new Set<string>(["47900" /* 예천군 */, "47850" /* 칠곡군 */]),
  interestRemoved: new Set<string>(["48220" /* 통영시 — 인구감소지역으로 */]),
};

/**
 * 수도권 접경지역 편입일 — 「접경지역 지원 특별법 시행령」 §2②1호(`TRANSFER.CAPITAL_BORDER_AREA_DECREE_2_2`).
 * 가평군은 2025.3.11. 시행본(대통령령 제35372호)에서 들어왔다 — 그 전 시행본(2024.6.8.)은 「고양시, 양주시, 동두천시, 포천시」뿐이다.
 * 편입 전에는 수도권(접경지역 제외) 소재라 다목(인구감소지역) 세법 대상이 아니다.
 */
export const CAPITAL_BORDER_FROM: Readonly<Record<string, Date>> = {
  "41820": new Date(Date.UTC(2025, 2, 11)), // 가평군
};

/** 그 시·군의 수도권 접경지역 편입일 — 편입 연혁이 없는 곳은 `undefined`. */
export function capitalBorderFromOf(regionCode: string | undefined): Date | undefined {
  const sgg = toSigunguCode(regionCode);
  return sgg ? CAPITAL_BORDER_FROM[sgg] : undefined;
}

/**
 * 「접경지역 지원 특별법」 제2조제1호의 접경지역 중 **수도권** 시·군 — 시행령 §2①(비무장지대·북방한계선과 잇닿은 시·군)·§2②(대통령령으로 정하는 시·군).
 * 고양시는 일반구 코드(덕양 41281·일산동 41285·일산서 41287)로만 온다. 가평군은 편입일(`CAPITAL_BORDER_FROM`)부터다.
 */
const CAPITAL_BORDER_SIGUNGU = new Set<string>([
  "28710", "28720", // 인천 강화군·옹진군(§2①1호)
  "41570", "41480", "41800", // 경기 김포시·파주시·연천군(§2①2호)
  "41281", "41285", "41287", "41630", "41250", "41650", "41820", // 경기 고양시·양주시·동두천시·포천시·가평군(§2②1호)
]);
const CAPITAL_SIDO = new Set(["11", "28", "41"]);
const METRO_CITY_SIDO = new Set(["26", "27", "28", "29", "30", "31"]);

/**
 * 인구감소지역(관심지역)으로 지정돼도 세법이 **소재지로 빼는** 곳인가 — 조특령 §68의2①1호 가목 1)·2), 2호 가목 본문·1)
 * (소득세법 시행령 §167의3①12호 다·라목의 같은 단서). 소재지 사실이므로 ④ 토글(「인구감소지역 소재」)로 덮을 수 없다(D-50 (b)).
 * - 인구감소지역(decline): 수도권(접경지역 제외) · 광역시(군 제외)
 * - 인구감소관심지역(interest): 수도권(본문 「수도권 밖의 지역으로서」) · 광역시(군 제외)
 * 광역시의 군은 시·군·구 코드 셋째 자리가 7이다(부산 기장 26710 · 대구 달성 27710·군위 27720 · 인천 강화 28710·옹진 28720 · 울산 울주 31710).
 * @returns 빼는 사유(고지 문구용) — 빼지 않으면 `null`. 코드가 없으면 판단하지 않는다(`null`).
 */
export function populationDeclineLocationExcluded(
  regionCode: string | undefined,
  kind: "decline" | "interest",
  asOf: Date | string,
): "metro_district" | "capital" | null {
  const sgg = toSigunguCode(regionCode);
  if (!sgg) return null;
  const sido = sgg.slice(0, 2);
  if (METRO_CITY_SIDO.has(sido) && sgg[2] !== "7") return "metro_district";
  if (!CAPITAL_SIDO.has(sido)) return null;
  if (kind === "interest") return "capital";
  const borderFrom = CAPITAL_BORDER_FROM[sgg];
  const border = CAPITAL_BORDER_SIGUNGU.has(sgg) && !(borderFrom && toTime(asOf) < borderFrom.getTime());
  return border ? null : "capital";
}

const toTime = (asOf: Date | string) => (typeof asOf === "string" ? Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`) : asOf.getTime());

/**
 * 시군구코드로 인구감소지역/관심지역 종류를 자동 판정한다.
 * @param asOf 판정 기준일 — 「취득 당시」 요건이므로 호출부는 **취득일**을 넘긴다. 문자열이면 `YYYY-MM-DD`.
 *   기준일을 모르는 화면 표시 fallback만 `undefined`를 넘긴다 — 현행(가장 늦은) 지정으로 본다.
 * @returns `{ kind }` — "decline"(다목·수도권밖 9억/수도권접경 4억)·"interest"(라목·4억)·null(해당 없음).
 *   가액 한도는 호출부(count.ts popCap)가 kind + 수도권 여부로 결정(여기서 한도 반환 안 함).
 */
export function classifyPopulationDeclineArea(
  regionCode: string,
  asOf: Date | string | undefined,
): {
  kind: "decline" | "interest" | null;
} {
  const sgg = toSigunguCode(regionCode);
  if (!sgg) return { kind: null };
  const t = asOf === undefined ? Number.POSITIVE_INFINITY : toTime(asOf);
  const borderFrom = CAPITAL_BORDER_FROM[sgg];
  if (borderFrom && t < borderFrom.getTime()) return { kind: null };
  const redesignated = t >= POP_DECLINE_REDESIGNATION_2026_10_20.getTime();
  // 위 두 집합은 **구 코드**(전남 46·광주 29)로 작성돼 있는데 주소검색 PNU는 현행(12)을 준다.
  //   행정구역 개편(전남·광주 통합, 시행 2026-07-01)으로 코드가 바뀌었을 뿐 지역 실체는 같으므로
  //   구·신 코드를 모두 훑는다. 집합을 신 코드로 치환하면 저장된 이력·수동 입력이 깨진다
  //   (계획서 sigungu-code-system-drift D-2 — 실측 +388,410,000 과다과세).
  if (hasAnySigunguAlias(POPULATION_DECLINE_AREA_CODES, sgg)) return { kind: "decline" };
  if (redesignated && REDESIGNATION_2026_10_20.declineAdded.has(sgg)) return { kind: "decline" };
  if (redesignated && REDESIGNATION_2026_10_20.interestAdded.has(sgg)) return { kind: "interest" };
  if (hasAnySigunguAlias(POPULATION_INTEREST_AREA_CODES, sgg) && !(redesignated && REDESIGNATION_2026_10_20.interestRemoved.has(sgg))) {
    return { kind: "interest" };
  }
  return { kind: null };
}
