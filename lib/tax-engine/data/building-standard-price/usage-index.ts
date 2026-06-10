/**
 * D3. 용도지수 ((연도, 용도번호) → 지수) — 레지스트리 + 디스패치
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 용도지수표」(이미지 PDF, 직접 판독).
 * PDF 실측(2026-06-10). 건축법 시행령 별표1 기준 용도 분류 + 지수.
 *
 * ★ **시대별로 번호 체계가 다름**(같은 용도라도 연도에 따라 번호·항목 수가 다름). 국세청이 건축법 용도분류
 *   개정에 맞춰 표를 재편하면서 항목 수·순서가 바뀌어 왔다. 단순 "BASE + override"는 **동일 번호 체계를
 *   공유하는 연도 구간 내에서만** 성립하므로, 번호 체계가 동일한 연도 묶음을 하나의 `UsageScheme`으로 정의하고
 *   레지스트리(SCHEMES)에서 연도로 디스패치한다. 각 스킴 정의는 `usage-index-schemes/scheme-*.ts` 로 분리.
 *   - **60항목 체계(2018~2026)**: scheme-60.ts. 일반용도 #1~60 + 기계식주차 #61. 장례식장 #44·동물전용장례식장 #45·동물화장 #43.
 *   - **59항목 체계(2015~2017)**: scheme-59.ts. 일반용도 #1~58 + 기계식주차 #59. 장례식장 #27(종합병원 직후)·동물전용 없음.
 *   - **61항목-2014 체계(2014)**: scheme-2014.ts. 일반용도 #1~60 + 기계식주차 #61. 고시원 #7·기타판매 #12·하역장 #51·캐노피 #53 별도.
 *   - **53항목 체계(2013)**: scheme-2013.ts. 일반용도 #1~52 + 기계식주차 #53. 단독주택 #2·다중주택 #3 분리, 유흥+무도장 통합 #14.
 *   - **51항목 체계(2012)**: scheme-2012.ts. 일반용도 #1~50 + 기계식주차 #51. 예식장 #17 단독·동물원+공연장+집회장 통합 #18.
 *   - **46항목 체계(2011)**: scheme-2011.ts. 일반용도 #1~46(#43 원본 건너뜀) + 기계식주차(2012 동일). 단란+유흥+유원+카지노+무도장 통합 #13·주점영업 #14.
 *   - **48항목 체계(2010)**: scheme-2010.ts. 일반용도 #1~47 + 기계식주차. 투전기업소 포함 통합위락 #14.
 *   - **45항목 체계(2009·2008)**: scheme-2009/2008.ts. 일반용도 #1~44 + 기계식주차 #45. 라벨 공유(LABELS_2009). ⚠️ 2008 #20~24 원본 인쇄 누락.
 *   - **44항목 체계(2007·2006·2005)**: scheme-2007/2006/2005.ts. 일반용도 #1~43 + 기계식주차 #44. 위락 #12 통합. 라벨 순서 연도별 상이(#26/#27·#10/#11) → 단독 스킴.
 *   - **41항목 체계(2003·2004)**: scheme-2003-2004.ts. 공통표. 일반용도 #1~40 + 기계식주차 #41. 목욕장 #28만 별도·냉장창고 통합. ⚠️ #30 화장시설 페이지 경계 누락.
 *   - **39항목 체계(2001·2002)**: scheme-2001-2002.ts. 공통표. 일반용도 #1~38 + 기계식주차 #39. #1 단독+아파트 통합·목욕장/냉장창고 통합.
 * ★ 기계식주차전용빌딩(각 체계 마지막 번호)은 일반 용도지수가 아닌 특수산식 → `mech-parking-formula.ts`(D9)에서 처리.
 *   본 파일의 용도지수는 일반 용도(maxGeneralNo 이하)만 다룬다.
 *
 * ⚠️ 전사 현황: 2001~2026 전 연도 확정. 미확정 셀(원본 결함·추정 금지): 2008 #20~24(인쇄 누락)·2003·2004 #30(페이지 경계 누락).
 */
import type { UsageScheme } from "./usage-index-schemes/types";
import { SCHEME_60 } from "./usage-index-schemes/scheme-60";
import { SCHEME_59 } from "./usage-index-schemes/scheme-59";
import { SCHEME_2014 } from "./usage-index-schemes/scheme-2014";
import { SCHEME_2013 } from "./usage-index-schemes/scheme-2013";
import { SCHEME_2012 } from "./usage-index-schemes/scheme-2012";
import { SCHEME_2011 } from "./usage-index-schemes/scheme-2011";
import { SCHEME_2010 } from "./usage-index-schemes/scheme-2010";
import { SCHEME_2009 } from "./usage-index-schemes/scheme-2009";
import { SCHEME_2008 } from "./usage-index-schemes/scheme-2008";
import { SCHEME_2007 } from "./usage-index-schemes/scheme-2007";
import { SCHEME_2006 } from "./usage-index-schemes/scheme-2006";
import { SCHEME_2005 } from "./usage-index-schemes/scheme-2005";
import { SCHEME_2003_2004 } from "./usage-index-schemes/scheme-2003-2004";
import { SCHEME_2001_2002 } from "./usage-index-schemes/scheme-2001-2002";

// 라벨 테이블 re-export (barrel·UI 하위 호환 유지)
export { USAGE_LABELS } from "./usage-index-schemes/scheme-60";
export { USAGE_LABELS_59 } from "./usage-index-schemes/scheme-59";

/** 전사 완료 스킴 레지스트리 (연도 중복 없음) */
const SCHEMES: ReadonlyArray<UsageScheme> = [
  SCHEME_60,
  SCHEME_59,
  SCHEME_2014,
  SCHEME_2013,
  SCHEME_2012,
  SCHEME_2011,
  SCHEME_2010,
  SCHEME_2009,
  SCHEME_2008,
  SCHEME_2007,
  SCHEME_2006,
  SCHEME_2005,
  SCHEME_2003_2004,
  SCHEME_2001_2002,
];

export const USAGE_INDEX_MIN_YEAR = 2001;
export const USAGE_INDEX_MAX_YEAR = 2026;

/** 연도 → 해당 스킴(미전사 = undefined) */
function schemeForYear(year: number): UsageScheme | undefined {
  return SCHEMES.find((s) => s.years.has(year));
}

/** 해당 연도 용도지수 전사 완료 여부 */
export function hasUsageIndexYear(year: number): boolean {
  return schemeForYear(year) !== undefined;
}

/**
 * (연도, 용도번호) → 용도지수(정수). 미전사 연도/미존재 번호 = undefined(검증 오류 처리).
 * 기계식주차(각 체계 maxGeneralNo+1)는 일반 용도지수 아님 → resolveMechParkingFormula(D9) 사용.
 * 용도번호는 해당 연도 체계 기준(연도군별 상이) — UI는 listUsageOptions(year)로 채울 것.
 */
export function resolveUsageIndex(year: number, usageNo: number): number | undefined {
  const scheme = schemeForYear(year);
  if (!scheme) return undefined;
  if (usageNo < 1 || usageNo > scheme.maxGeneralNo) return undefined;
  const override = scheme.overrides[year];
  if (override && usageNo in override) return override[usageNo];
  return scheme.baseIndex[usageNo];
}

/** UI 드롭다운용 — 해당 연도 용도 옵션(번호·표시명·지수). 기계식주차는 제외(별도 토글). */
export function listUsageOptions(
  year: number,
): ReadonlyArray<{ no: number; label: string; index: number }> {
  const scheme = schemeForYear(year);
  if (!scheme) return [];
  const out: { no: number; label: string; index: number }[] = [];
  for (let no = 1; no <= scheme.maxGeneralNo; no++) {
    const idx = resolveUsageIndex(year, no);
    if (idx !== undefined) out.push({ no, label: scheme.labels[no], index: idx });
  }
  return out;
}
