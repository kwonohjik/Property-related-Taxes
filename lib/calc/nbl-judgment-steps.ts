/**
 * 비사업용 토지 판정 메뉴 — 단계 라벨 정본 (오케스트레이터·사이드바가 **같은 배열**을 쓴다).
 *
 * 1주택 판정은 같은 배열이 두 벌이라 「한쪽만 고치면 갈린다」 주석이 붙어 있다 — 여기서는 한 곳에 둔다.
 * 파일명이 곧 화면 순서다(`app/calc/non-business-land/steps/Step{Land,Judge,Grace,Result}.tsx`).
 */
export const NBL_JUDGMENT_STEPS = ["토지 기본", "사업용 의제·지목", "부득이한 사유·편입일·의제일", "판정 결과"] as const;

/** 마지막(결과) 단계 인덱스 — 입력 단계는 0..RESULT-1. */
export const NBL_JUDGMENT_RESULT_STEP = NBL_JUDGMENT_STEPS.length - 1;
