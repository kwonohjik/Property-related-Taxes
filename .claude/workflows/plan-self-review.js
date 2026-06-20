export const meta = {
  name: 'plan-self-review',
  description: 'plan.md 입력 → 엔진·UI 설계 생성 + 13단계 자가검증(독립 검토자 5카테고리 · 핵심 max effort · 정정·재검토)',
  whenToUse: 'plan.md 작성 직후. 워크플로가 엔진설계·UI설계를 생성하고, 작성자 확인편향을 끊기 위해 독립 에이전트가 생성→검토→정정→재검토를 다중 사이클로 강제.',
  phases: [
    { title: 'Plan 검토' },
    { title: 'Plan 정정·재검토' },
    { title: 'Engine 생성', model: 'opus' },
    { title: 'Engine 검토' },
    { title: 'Engine 정정·재검토' },
    { title: '통합비교' },
    { title: 'UI 생성', model: 'opus' },
    { title: 'UI 검토' },
    { title: 'UI 정정·재검토' },
    { title: '종합 합성', model: 'opus' },
  ],
}

// ── args ──────────────────────────────────────────────────────────────────────
//   feature           : 세목 슬러그 (예: 'gift-xxx')                      [필수]
//   planDoc           : 입력 plan.md 경로 (이미 존재)                      [필수]
//   engineDesignDoc   : 생성할 엔진 설계 문서 출력 경로                    [필수]
//   uiDesignDoc       : 생성할 UI 설계 문서 출력 경로                      [선택, 엔진전용이면 생략]
//   engineAgent       : 엔진설계 생성에 쓸 도메인 시니어 agentType         [선택]
//   uiAgent           : UI설계 생성에 쓸 UI 시니어 agentType               [선택]
if (!args || !args.planDoc || !args.engineDesignDoc) {
  throw new Error(
    'plan-self-review: args.planDoc(입력)·args.engineDesignDoc(생성 출력경로) 필수. ' +
    "예: { feature:'gift-xxx', planDoc:'docs/00-pm/gift-xxx.plan.md', " +
    "engineDesignDoc:'docs/02-design/features/gift-xxx.engine.design.md', " +
    "uiDesignDoc:'docs/02-design/features/gift-xxx.ui.design.md', " +
    "engineAgent:'inheritance-gift-tax-senior', uiAgent:'inheritance-gift-tax-ui-senior' }"
  )
}
const FEATURE = args.feature || '(미지정)'

// ── 공통 스키마 ───────────────────────────────────────────────────────────────
const FINDING = {
  type: 'object',
  required: ['category', 'severity', 'location', 'issue', 'fix'],
  properties: {
    category: { type: 'string', enum: ['오류', '누락', '모순', '개선', 'UI누락'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    location: { type: 'string', description: 'file:line 또는 섹션·표 위치' },
    issue: { type: 'string' },
    fix: { type: 'string', description: '구체적 수정안' },
    legalBasis: { type: 'string', description: '관련 법령 조문(KoreanLaw로 검증된 것만)' },
  },
}
const REVIEW_SCHEMA = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: FINDING } } }
const GEN_SCHEMA = {
  type: 'object',
  required: ['outPath', 'summary'],
  properties: { outPath: { type: 'string' }, summary: { type: 'string' }, keyDecisions: { type: 'array', items: { type: 'string' } } },
}
const APPLIED_SCHEMA = {
  type: 'object',
  required: ['changes'],
  properties: {
    changes: { type: 'array', items: { type: 'object', required: ['location', 'reason'], properties: { location: { type: 'string' }, reason: { type: 'string' } } } },
    unresolved: { type: 'array', items: { type: 'string' } },
  },
}
const RECHECK_SCHEMA = {
  type: 'object',
  required: ['resolved', 'remaining', 'newIssues'],
  properties: { resolved: { type: 'array', items: { type: 'string' } }, remaining: { type: 'array', items: FINDING }, newIssues: { type: 'array', items: FINDING } },
}
const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['verdict', 'mustFix', 'residual', 'note'],
  properties: {
    verdict: { type: 'string', enum: ['clean', 'needs-fix', 'blocked'] },
    mustFix: { type: 'array', items: FINDING },
    residual: { type: 'array', items: FINDING },
    note: { type: 'string' },
  },
}

// ── 5 검토 카테고리 (핵심은 max effort) ───────────────────────────────────────
const CATEGORIES = [
  { key: '오류', effort: 'max', focus: '법령 산식 오류, 잘못된 조문 인용, 세율·공제·임계 수치 오류, anchor 기대값 불일치' },
  { key: '모순', effort: 'max', focus: '문서 내·문서 간 모순, plan↔design 불일치, UI 표시순서↔계산 로직순서 모순, fallback 3중 불일치' },
  { key: '누락', effort: 'high', focus: '법령 본문·단서·각호 케이스 누락, 14 동기화 지점 누락, 경계조건·일몰·부칙 누락' },
  { key: 'UI누락', effort: 'high', focus: '엔진 input·result 필드 ↔ UI 위젯·사이드바 합계·결과 카드 산식·validation 동기화 누락' },
  { key: '개선', effort: 'medium', focus: 'Simplicity First 위반 — 과복잡·추측성 유연성·요청범위 밖 기능·단일사용 추상화' },
]

const PROJECT_RULES =
  '프로젝트 규칙(반드시 적용):\n' +
  '- 법령 인용(조문·세율·공제 수치)은 KoreanLaw MCP로 위임 체인 끝(본칙·시행령·시행규칙)까지 추적해 검증. 추정 인용은 반드시 "확인 필요"로 표기, 단정 금지.\n' +
  '- 누락 검토는 관련 법령 본문·단서·각호를 전수 enumerate한 뒤 문서와 1:1 대조.\n' +
  '- 14개 동기화 지점(폼·initial·normalize·API변환·UI위젯·사이드바·결과카드·validation + Zod·Route·Date변환) 누락 점검.\n' +
  '- 수치·동작 주장은 추정 금지 — 실제 문서/법령 값만 인용. 미확인은 "확인 필요".\n' +
  '- 납세자 유불리·절감 표현 금지(법령 정확성 중립). Surgical Changes·Simplicity First 준수.'

// ── 헬퍼: 설계 문서 생성 (도메인 시니어 agentType, max effort) ────────────────
async function generateDoc(outPath, kind, sources, agentType, phaseName) {
  const tmplHint =
    kind === '엔진'
      ? 'docs/02-design/features/_template.engine.design.md 와 기존 *.engine.design.md 를 참고해 동일 구조로.'
      : 'docs/02-design/features/_new-tax-ui-kickoff.checklist.md 와 기존 *.ui.design.md 를 참고해 동일 구조로. 14개 동기화 지점을 명시.'
  const opts = { label: `생성:${kind}설계`, phase: phaseName, schema: GEN_SCHEMA, effort: 'max' }
  if (agentType) opts.agentType = agentType
  return agent(
    `당신은 ${kind} 설계 담당입니다. 입력 문서를 Read로 정독한 뒤, ${kind} 설계 문서를 작성해 ${outPath} 에 Write로 저장하세요.\n` +
      `입력: ${sources.join(', ')}\n` +
      `포맷: ${tmplHint}\n\n` +
      PROJECT_RULES +
      `\n\n케이스 매트릭스(법령 본문·단서·각호 전수)·anchor 기대값·산식을 반드시 포함. 저장 후 outPath와 핵심 설계 결정 요약을 반환.`,
    opts
  )
}

// ── 헬퍼: 한 문서를 5 독립 검토자로 백지 검토 ─────────────────────────────────
async function reviewDoc(docPath, docLabel, phaseName) {
  const results = await parallel(
    CATEGORIES.map((c) => () =>
      agent(
        `당신은 독립 검토자입니다. 이 설계 문서를 작성하지 않았으며 백지에서 비판적으로 검토합니다(작성자 확인편향 차단이 목적).\n` +
          `대상: ${docPath} (${docLabel}) — 먼저 Read로 전문을 읽으세요.\n` +
          `검토 카테고리: 【${c.key}】 — ${c.focus}\n\n` +
          PROJECT_RULES +
          `\n\n각 발견에 정확한 위치(file:line 또는 섹션/표)·심각도·구체적 수정안을 제시. 해당 카테고리에 결함이 없으면 findings를 빈 배열로 반환.`,
        { label: `검토:${docLabel}:${c.key}`, phase: phaseName, schema: REVIEW_SCHEMA, effort: c.effort }
      )
    )
  )
  return results.filter(Boolean).flatMap((r) => r.findings)
}

// ── 헬퍼: critical/high만 정정 → 독립 재검토 ──────────────────────────────────
async function correctAndRecheck(docPath, docLabel, findings, phaseName) {
  const actionable = findings.filter((f) => f.severity === 'critical' || f.severity === 'high')
  if (!actionable.length) {
    log(`${docLabel}: critical/high 발견 없음 — 정정 단계 생략`)
    return { applied: { changes: [], unresolved: [] }, recheck: { resolved: [], remaining: [], newIssues: [] } }
  }
  const applied = await agent(
    `당신은 정정 담당입니다. 대상 문서 ${docPath} 를 Read한 뒤, 아래 발견사항(critical/high)을 Edit로 문서에 반영하세요.\n` +
      `발견사항:\n${JSON.stringify(actionable, null, 2)}\n\n` +
      `규칙(Surgical Changes): 발견된 결함만 수정. 인접 내용·포맷 임의 개선 금지. 수치 수정은 KoreanLaw MCP로 본칙 재확인. 반영 못 한 항목은 unresolved에.`,
    { label: `정정:${docLabel}`, phase: phaseName, schema: APPLIED_SCHEMA, effort: 'high' }
  )
  const recheck = await agent(
    `당신은 독립 재검토자입니다(앞선 검토·정정에 미관여). 정정된 문서 ${docPath} 를 Read하세요.\n` +
      `아래 발견사항이 실제로 해소됐는지 검증하고, 정정 과정에서 생긴 새 오류·모순이 있는지 확인하세요.\n` +
      `검증 대상:\n${JSON.stringify(actionable, null, 2)}\n\n` +
      `법령 수치 수정은 KoreanLaw MCP로 재확인. resolved/remaining/newIssues로 보고.`,
    { label: `재검토:${docLabel}`, phase: phaseName, schema: RECHECK_SCHEMA, effort: 'max' }
  )
  return { applied, recheck }
}

// ── 13단계 루프 ───────────────────────────────────────────────────────────────
log(`plan-self-review 시작 — feature=${FEATURE} (입력: ${args.planDoc})`)
const bundle = { feature: FEATURE, plan: null, engineGen: null, engine: null, cross: null, uiGen: null, ui: null }

// 1~2. 계획 검토 ×2 (입력 plan 검토 → 정정 → 재검토)
phase('Plan 검토')
const planFindings = await reviewDoc(args.planDoc, '계획서', 'Plan 검토')
phase('Plan 정정·재검토')
bundle.plan = { findings: planFindings, ...(await correctAndRecheck(args.planDoc, '계획서', planFindings, 'Plan 정정·재검토')) }

// 3. 엔진설계 생성
phase('Engine 생성')
bundle.engineGen = await generateDoc(args.engineDesignDoc, '엔진', [args.planDoc], args.engineAgent, 'Engine 생성')

// 4~5. 엔진설계 검토 ×2
phase('Engine 검토')
const engFindings = await reviewDoc(args.engineDesignDoc, '엔진 설계서', 'Engine 검토')
phase('Engine 정정·재검토')
bundle.engine = { findings: engFindings, ...(await correctAndRecheck(args.engineDesignDoc, '엔진 설계서', engFindings, 'Engine 정정·재검토')) }

// 6. 통합비교 (plan ↔ engine)
phase('통합비교')
bundle.cross = await agent(
  `plan ↔ engine 설계 정합을 비교합니다. 두 문서를 Read: ${args.planDoc}, ${args.engineDesignDoc}.\n` +
    `점검: (1) 계획의 모든 요구·케이스가 엔진 설계에 반영됐는가, (2) 엔진 설계가 계획에 없는 범위를 임의 추가했는가(Surgical Changes 위반), (3) 산식·세율·공제·임계가 plan과 일치하는가.\n\n` +
    PROJECT_RULES +
    `\n\n불일치를 findings로 보고.`,
  { label: '통합비교:plan↔engine', phase: '통합비교', schema: REVIEW_SCHEMA, effort: 'max' }
)

// 7. UI설계 생성 (선택) → 8~9. 검토·정정·재검토
if (args.uiDesignDoc) {
  phase('UI 생성')
  bundle.uiGen = await generateDoc(args.uiDesignDoc, 'UI', [args.planDoc, args.engineDesignDoc], args.uiAgent, 'UI 생성')
  phase('UI 검토')
  const uiFindings = await reviewDoc(args.uiDesignDoc, 'UI 설계서', 'UI 검토')
  phase('UI 정정·재검토')
  bundle.ui = { findings: uiFindings, ...(await correctAndRecheck(args.uiDesignDoc, 'UI 설계서', uiFindings, 'UI 정정·재검토')) }
}

// 10. 종합 합성 (max effort)
phase('종합 합성')
const summary = await agent(
  `당신은 수석 검토자입니다. 아래는 ${FEATURE} 설계 생성·검증 결과입니다.\n` +
    `${JSON.stringify(bundle, null, 2)}\n\n` +
    `할 일:\n` +
    `1. 재검토(recheck)의 remaining/newIssues·통합비교 findings 중 critical/high를 mustFix로 집계.\n` +
    `2. medium/low·개선은 residual로 분리.\n` +
    `3. 미해소 critical/high가 있으면 verdict=blocked, mustFix가 0·newIssues 없으면 clean, 그 외 needs-fix.\n` +
    `4. note에: 생성·정정으로 문서 파일이 실제 작성/편집됐으니 git diff로 확인할 것, mustFix를 Do 진입 전 처리할 것을 명시.\n` +
    `추정 금지 — bundle에 실제로 있는 항목만 인용.`,
  { label: '종합 합성', phase: '종합 합성', schema: SUMMARY_SCHEMA, effort: 'max' }
)

log(`plan-self-review 완료 — verdict=${summary.verdict}, mustFix=${summary.mustFix.length}건`)
return { feature: FEATURE, summary, bundle }
