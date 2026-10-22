/**
 * 1세대1주택 AI 사실 추출 — 소재지 코드 칸은 AI가 채우지 않는다(계획서 one-house-ai-recorded-leftovers §3.3-1 · Q-3 a).
 *
 * 화면은 이 칸들을 주소 검색 결과로만 채운다. 모델 지식으로 만든 코드는 체계가 다를 수 있다 — 재관측에서 「나주」를
 * 옛 전남 체계 `4617000000`으로 넣었는데, 연접 표(`lib/geo/administrative-district-adjacency.json`)는 전남·광주 통합
 * 체계(시도 12)라 그 코드가 없어 §155⑯ 연접 판정이 「자동 판정 불가」로 빠졌다. 법정동 코드(`regionCode`)는 조정대상지역
 * 판정(`isRegulatedByBjdCode`)에 쓰여 틀리면 판정이 뒤집힌다.
 *
 * 그래서 서버가 추출 결과에서 코드 사실을 빼고 같은 경로의 질문으로 바꾼다(지시문에만 맡기면 실행마다 흔들렸다).
 * `coerceValue`에서 막지 않는 이유: 평가셋 손 매핑이 같은 함수로 코드 값을 검증한다.
 */
import { catalogKeyOf, parsePath } from "./apply-extraction";
import type { OneHouseExtraction } from "./extraction-schema";
import { ONE_HOUSE_FIELD_CATALOG } from "./field-catalog";

/** 주소 검색으로만 채우는 코드 칸(필드 사전 키) — 사전의 `kind: "string"` 칸 전부다(테스트가 묶는다) */
export const ADDRESS_CODE_PATHS: ReadonlySet<string> = new Set([
  "asset.regionCode",
  "houses[].regionCode",
  "relocatedSigunguCode",
  "newHouseSigunguCode",
]);

function codeKeyOf(path: string): string | null {
  const segs = parsePath(path);
  const key = segs ? catalogKeyOf(segs) : null;
  return key && ADDRESS_CODE_PATHS.has(key) ? key : null;
}

/** 추출 결과에서 코드 사실을 빼고, 아직 묻지 않은 경로면 「주소 검색으로 입력」 질문을 더한다 */
export function withoutAddressCodes(extraction: OneHouseExtraction): OneHouseExtraction {
  const dropped = extraction.facts.filter((f) => codeKeyOf(f.path));
  if (dropped.length === 0) return extraction;
  const asked = new Set(extraction.missingFacts.map((m) => m.path));
  const questions = dropped
    .filter((f) => !asked.has(f.path))
    .map((f) => {
      const label = ONE_HOUSE_FIELD_CATALOG.find((s) => s.path === codeKeyOf(f.path))?.label ?? f.path;
      return {
        path: f.path,
        question: `「${label}」 칸은 화면의 주소 검색으로 입력하세요 — AI는 원문의 지명(「${f.evidence}」)으로 소재지 코드를 채우지 않습니다.`,
        why: "소재지 코드는 조정대상지역·연접 시·군 판정에 쓰여 주소 검색 결과로만 넣습니다.",
      };
    });
  return {
    ...extraction,
    facts: extraction.facts.filter((f) => !codeKeyOf(f.path)),
    missingFacts: [...extraction.missingFacts, ...questions],
  };
}
