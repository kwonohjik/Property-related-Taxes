export const meta = {
  name: 'plan-self-review',
  description: '[폐기됨 → plan-design-self-review-loop 스킬 사용] 계획·설계 13단계 자가검토 워크플로는 은퇴했습니다.',
  whenToUse:
    '사용 금지. 계획·설계 자가검토는 plan-design-self-review-loop 스킬을 쓰세요(fork 기반 — 더 빠르고, findings 스키마·verdict 게이트가 스킬로 이관됨).',
  phases: [],
}

// ── 폐기 (2026-07-10) ──────────────────────────────────────────────────────────
// 이 워크플로는 같은 '13단계 자가검토'를 하는 fork 기반 스킬
// (plan-design-self-review-loop)과 중복이며, 아래 이유로 은퇴했습니다.
//
//  1. Workflow가 spawn하는 agent()는 전부 fresh — 메인 대화 컨텍스트를 상속하지
//     못해 리뷰 대상 문서를 매번 cold Read해야 한다. fork는 Workflow 내부에서
//     호출할 수 없어(중첩 workflow throw) 이 재-Read 낭비를 워크플로로 제거할 수 없다.
//  2. 이 도구의 최대 wall-clock 병목은 매 실행 opus/max로 설계 문서 2건을 새로
//     '생성'하는 output-bound 구간이며, 이는 리뷰 도구가 아니라 Design 딜리버러블이다.
//  3. 워크플로 고유값(findings JSON 스키마·결정적 verdict 게이트)은
//     plan-design-self-review-loop 스킬(SKILL.md)로 이관 완료 — 폐기는 '이관'이지 회귀가 아니다.
//
// 근거: memory feedback_plan_design_self_review_over_workflow · SKILL.md v3.
throw new Error(
  'plan-self-review 워크플로는 2026-07-10 폐기됨(deprecated).\n' +
    '→ 계획·설계 13단계 자가검토: plan-design-self-review-loop 스킬을 사용하세요.\n' +
    '→ 설계 문서 "생성"이 필요하면 docs/00-pm/feature-workflow.md의 엔진+UI 시니어 병렬 호출.\n' +
    '이유: fork는 Workflow 내부 호출 불가라 컨텍스트 상속·문서 재-Read 제거를 워크플로로 재현할 수 없음. ' +
    'findings 스키마·verdict 게이트는 SKILL.md로 이관됨.'
)
