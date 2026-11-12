/**
 * 「소득세법 시행령」 §155⑯ 지역 요건의 **판정 단위** — 「해당 공공기관 또는 법인이 이전한 시(특별자치시ㆍ광역시 및
 * 「제주특별자치도 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따라 설치된 행정시를 포함한다. 이하 이 항에서
 * 같다)ㆍ군 또는 이와 연접한 시ㆍ군의 지역」(MST 290841 §155⑯ 실독 2026-11-12).
 *
 * 단위는 **시·군**이다. 구는 단위가 아니다:
 *   · 광역시 → 광역시 전체가 한 「시」다(자치구·군을 모두 묶는다).
 *   · 일반구(수원시 장안구 등) → 소속 시(`resolveSigunguUnitCode`와 같은 규칙).
 *   · 특별자치시(세종)·행정시(제주시·서귀포시)·도의 시·군 → 코드 그대로.
 *
 * 🔴 재촌 판정 leaf(`sigungu-unit.ts`)를 그대로 쓰지 않는다 — §153③은 「구(자치구인 구를 말한다)」를 단위에 넣어
 *    광역시 자치구가 각자 단위지만, §155⑯은 구를 넣지 않아 광역시 전체가 하나다. 구 단위로 비교하면 같은 광역시 안의
 *    다른 구(대구 동구 → 달서구)가 「연접하지 않음」이 되어 5년 기한·1년 요건 면제가 사라졌다(2026-11-12 리뷰 E-1).
 *
 * 광역시 소속 군(달성·군위·기장·울주)을 광역시에 넣느냐는 결론을 바꾸지 않는다 — 모두 같은 광역시의 구와 경계를 맞대
 * 연접으로도 충족한다. 경계를 맞대지 않는 인천 강화·옹진은 수도권이라 ⑯의 이전지(수도권 밖)가 될 수 없다.
 *
 * 🟡 **전남광주통합특별시(시도 `12`, 2026.7.1. 설치)** — 옛 광주광역시 5개 자치구(동·서·남·북·광산)를 한 단위(`FORMER_GWANGJU_UNIT`)로,
 *    옛 전라남도 시·군은 각각 단위로 본다(사용자 결정 2026-11-12). 2026.7.1. 전 양도분은 광역시 그대로라 이 묶음이 곧 문언이다.
 *    그 뒤 양도분은 「전남광주통합특별시 설치를 위한 특별법」 §11①(다른 법령의 「광역시」에 통합특별시 포함)과 §11⑩(광역시·도
 *    규정이 다르면 자치구 구역엔 광역시, 시·군 구역엔 도 규정) 사이의 해석이라 확인이 필요하다 — 결론이 갈리면
 *    `relocationRegionReadingsDiverge`로 고지한다(`one-house/era-undetermined.ts`).
 *
 * 코드 체계: 5자리·10자리 모두 받는다. 단위 코드는 **5자리**로 돌려준다(광역시는 `"27000"`처럼 시도 2자리 + "000").
 *   예외: 옛 광주 5개 자치구 묶음은 실재 코드가 없어 문자열 키(`FORMER_GWANGJU_UNIT`)다 — 단위끼리 같은지 비교하는 데만 쓴다.
 */
import { SIGUNGU_CODES } from "@/lib/korean-law/sigungu-codes";
import { listSigunguCodesInUnit } from "./sigungu-unit";
import { resolveSigunguUnitCode } from "./sigungu-unit";

/** 광역시 시도코드 — 이 시도의 모든 구·군을 한 단위로 묶는다. (구 광주 `29`는 통합특별시 `12`로 바뀌어 코드표에 없다.) */
const METROPOLITAN_SIDO = new Set(["26", "27", "28", "30", "31"]);

/** 전남광주통합특별시 시도코드와 옛 광주광역시 자치구(동·서·남·북·광산 — `sigungu-codes.json`). */
const MERGED_SPECIAL_CITY_SIDO = "12";
const FORMER_GWANGJU_DISTRICTS = new Set(["12210", "12240", "12270", "12300", "12330"]);
/** 옛 광주 5개 자치구 묶음의 단위 키 — 실재하는 행정코드가 아니므로 숫자 코드 모양을 쓰지 않는다(코드표·감사와 섞이지 않게). */
const FORMER_GWANGJU_UNIT = "12:former-gwangju";
/** 전남광주통합특별시 설치일 — 「전남광주통합특별시 설치를 위한 특별법」 부칙(제21446호) 제1조 「2026년 7월 1일부터 시행」. */
export const MERGED_SPECIAL_CITY_START = new Date("2026-07-01");

/**
 * 통합특별시 구역의 읽기 — 기본은 `"gwangju_districts"`(사용자 결정). 나머지 둘은 결론이 갈리는지 보는 대조용이다.
 *   · `"whole"` — 특별법 §11① 문언대로 통합특별시 전체가 한 「시」
 *   · `"gu"` — 구 단위 그대로(종전 구현)
 */
type MergedCityReading = "gwangju_districts" | "whole" | "gu";

function unitOf(code: string | undefined, reading: MergedCityReading): string | undefined {
  if (!code) return undefined;
  const five = code.slice(0, 5);
  if (five.length < 5) return five;
  const sido = five.slice(0, 2);
  if (METROPOLITAN_SIDO.has(sido)) return `${sido}000`;
  if (sido === MERGED_SPECIAL_CITY_SIDO) {
    if (reading === "whole") return `${sido}000`;
    if (reading === "gwangju_districts" && FORMER_GWANGJU_DISTRICTS.has(five)) return FORMER_GWANGJU_UNIT;
  }
  return resolveSigunguUnitCode(five);
}

/** §155⑯ 판정 단위 코드(5자리). 5자리 미만·빈 값은 입력 그대로(자동 추정 금지). */
export function resolveRelocationUnitCode(code: string | undefined): string | undefined {
  return unitOf(code, "gwangju_districts");
}

/** 같은 단위에 속한 시·군·구 코드 — 입력과 같은 자릿수로 돌려준다(연접 매트릭스는 구 단위 키). */
function listCodesInRelocationUnit(code: string, reading: MergedCityReading): string[] {
  const five = code.slice(0, 5);
  if (five.length < 5) return [code];
  const unit = unitOf(code, reading);
  const sido = five.slice(0, 2);
  if (!METROPOLITAN_SIDO.has(sido) && sido !== MERGED_SPECIAL_CITY_SIDO) return listSigunguCodesInUnit(code);
  const pad = code.length > 5 ? "0".repeat(code.length - 5) : "";
  return SIGUNGU_CODES.filter((s) => unitOf(s.code, reading) === unit).map((s) => s.code + pad);
}

/**
 * §155⑯ 「이전한 시·군 또는 이와 연접한 시·군」 판정.
 *
 * - `"same_unit"` — 같은 시·군(광역시면 같은 광역시)
 * - `"adjacent"` — 연접 시·군 (단위 안 구들의 연접을 union해 단위로 접는다)
 * - `"not_adjacent"` — 연접하지 않음
 * - `"no_matrix"` — 이전지의 연접 정보가 없어 판정할 수 없음(호출부는 자기선언을 유지한다)
 *
 * @param resolveRaw 구 단위 원본 연접 조회(`getAdjacentSigunguCodes`) — 입력과 같은 자릿수 코드로 부른다
 */
export function classifyRelocationRegion(
  relocatedCode: string,
  newHouseCode: string,
  resolveRaw: (sigunguCode: string) => readonly string[],
): RelocationRegionKind {
  return classifyUnder(relocatedCode, newHouseCode, resolveRaw, "gwangju_districts");
}

export type RelocationRegionKind = "same_unit" | "adjacent" | "not_adjacent" | "no_matrix";

function classifyUnder(
  relocatedCode: string,
  newHouseCode: string,
  resolveRaw: (sigunguCode: string) => readonly string[],
  reading: MergedCityReading,
): RelocationRegionKind {
  const from = unitOf(relocatedCode, reading);
  const to = unitOf(newHouseCode, reading);
  if (from === to) return "same_unit";
  const adjacent = new Set<string>();
  let anyMatrix = false;
  for (const member of listCodesInRelocationUnit(relocatedCode, reading)) {
    const raw = resolveRaw(member);
    if (raw.length > 0) anyMatrix = true;
    for (const r of raw) {
      const unit = unitOf(r, reading);
      if (unit && unit !== from) adjacent.add(unit);
    }
  }
  if (!anyMatrix) return "no_matrix";
  return to !== undefined && adjacent.has(to) ? "adjacent" : "not_adjacent";
}

/**
 * 통합특별시 구역의 읽기(옛 광주 5구 묶음 · 통합특별시 전체 · 구 단위)에 따라 ⑯ 지역 요건 결론이 갈리는가.
 * 두 코드 중 하나라도 통합특별시가 아니면 읽기가 결론에 닿지 않는다(false).
 */
export function relocationRegionReadingsDiverge(
  relocatedCode: string,
  newHouseCode: string,
  resolveRaw: (sigunguCode: string) => readonly string[],
): boolean {
  const inMerged = (c: string) => c.startsWith(MERGED_SPECIAL_CITY_SIDO);
  if (!inMerged(relocatedCode) && !inMerged(newHouseCode)) return false;
  const met = (reading: MergedCityReading) =>
    classifyUnder(relocatedCode, newHouseCode, resolveRaw, reading) !== "not_adjacent";
  const base = met("gwangju_districts");
  return met("whole") !== base || met("gu") !== base;
}
