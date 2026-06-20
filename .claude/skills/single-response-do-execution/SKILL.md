---
name: single-response-do-execution
description: 다단계 구현(Do)을 단일 응답 내에서 끝까지 완주하는 실행 규율 계약 — TODO.md 체크박스 생명주기 + 작업별 갱신 + 갭 분석 + 완료 카운트 게이트 + 중간 종료 금지 + BLOCKER 프로토콜 + 커밋 전 코드 품질 정적 검토 게이트 + 커밋 위생. 거짓 완료 보고와 "Phase A 완료, B 시작합니다" 후 자율 중단을 차단한다. 사용자가 "구현 시작, 단일 응답으로 완주" 또는 다단계 코드 작업을 TODO 추적과 함께 지시할 때 적용.
trigger: 구현 시작, 단일 응답 완주, TODO 작성, todo.md, 완주, 미완료 0, 갭 분석, 끝까지 구현, do 실행, single response, implementation loop, 완료 게이트, 커밋하고 푸시, 9단계 구현, 코드 품질 검토, 커밋 전 품질 게이트, code review
---

# single-response-do-execution — Do 단일 응답 실행 규율

계획·설계가 끝난 기능을 **하나의 응답 안에서 끝까지 구현**하는 실행 계약. "구현 시작" 자체보다 **자율 중단·거짓 완료를 막는 규율**이 핵심 가치다. (워크플로 3종: `plan-design-self-review-loop` → `pre-do-anchor-verification` → 본 스킬)

## 적용 시점

- 사용자가 "단일 응답으로 완주", "끝까지 구현", "미완료 0까지" 지시
- 다단계(Phase A~H) 코드 작업을 TODO 추적과 함께 요청
- 설계 문서가 이미 있고 Do만 남았을 때

## 적용 금지

- 탐색·조사·계획 단계 (코드 산출 없음)
- 단일 파일 1줄 변경
- 사용자가 단계별 확인·승인을 원하는 작업

## 표준 10단계

```
1. TODO.md 체크박스로 전 작업 작성 ([ ] 미완료 / [x] 완료)
2. 구현 시작 — 각 작업 완료 시 TODO.md 갱신 후 다음 + 계획↔구현 갭 분석
3. 미구현 작업 계속
4. 완료 보고 전 현황 출력: 전체 N / 완료 M / 미완료 (N-M). 미완료≠0이면 완료 선언 금지
5. 단일 응답 내 완주 강제 — Phase 구분이 있어도 응답 끊지 않음
6. 종료 조건 = (a) 전 항목 [x] + 4번 출력 + 9번 품질 검토 통과  OR  (b) 진짜 BLOCKER
7. 금지된 종료 패턴 자가 차단
8. 자가 점검 루프 — 매 tool call 직전 "미완료>0?" → YES면 텍스트 없이 즉시 다음 tool call
9. 코드 품질 정적 검토 (커밋 전 게이트) — 전 항목 [x] 후 /code-review 또는 bkit:code-analyzer로 변경 diff 검토. High/Medium 이슈는 수정 후 재검토(loop), Low/Nit은 기록
10. 커밋·푸시 (커밋 메시지 한국어, TODO.md 제외)
```

## TODO.md 생명주기 (강제)

- **gitignore 확인**: TODO.md는 보통 gitignore — 커밋에서 자동 제외(`git check-ignore TODO.md`). `git restore`가 추적 파일을 되돌려도 TODO는 안전.
- **stale 덮어쓰기**: 이전 기능의 TODO가 남아 있으면 Read 후 현재 기능으로 전면 교체.
- **작업별 즉시 갱신**: 한 작업 끝나면 그 즉시 `[ ]`→`[x]`. 배치 미루지 않음.

## 종료 조건 (둘 중 하나만)

**(a) 정상 완료**
- TODO 전 항목 `[x]`
- 현황 출력: `전체 N / 완료 M / 미완료 (N-M)`, 미완료 0
- **코드 품질 정적 검토 통과** (High/Medium 0 또는 수정 완료 — 아래 게이트)
- 커밋·푸시 완료

**(b) BLOCKER** — `BLOCKER: <사유>` 명시 후 종료. 허용 사유만:
- 사용자 결정 필요 (애매한 분기·승인)
- 외부 자원 접근 불가 / 권한 거부
- **외부 미커밋 변경이 작업 트리에서 진행 중** (이번 세션: filing-form-9 1,212줄 삭제 감지 → 중단·재확인·사용자 안정화 대기. memory `feedback_external_concurrent_edit_stale_read`)

## 금지된 종료 패턴 (감지 시 자가 차단)

- "Phase X 완료. 다음 Phase로 진행하겠습니다." → 멈추지 말고 즉시 다음 tool call
- "중간 점검을 위해 여기서 일단 보고드립니다." → 금지
- "Phase별로 나눠 진행이 안전할 것 같습니다." → 사용자 지시 위반
- context/토큰 우려 자율 분할 → 금지 (사용자가 명시 안 함)

## Do 중 발견은 즉시 환류

- 설계와 다른 결정(회귀 회피·정확도)은 **갭 분석에서 설계·계획 문서를 구현에 맞춰 갱신** — 문서-구현 드리프트 0.
- 타입 에러·시그니처 불일치는 발견 즉시 수정 후 진행 (tsc는 H 단계 일괄 + 중간 점검).

## effort 배치 (구현 최적화)

단일 응답 Do는 **한 턴 = 고정 effort**다 — 메인 루프에선 응답 도중 effort를 못 바꾼다. 따라서 "단계별 max"는 불가능하고, 최적은 **baseline 선택 + 커널 위임**이다.

- **Do는 fan-out 금지** (Plan/Check와 반대): 구현은 14 동기화 지점·공유 타입·헬퍼가 얽혀 **단일 컨텍스트 응집**이 정확도를 좌우한다. 서브에이전트로 쪼개면 부분 컨텍스트 탓에 wiring 침묵 누락. 메인 루프에서 완주한다.
- **baseline = high (max 아님)**: 완주가 제1목표. max는 기계적 단계(타입·import·Zod·14지점 wiring)까지 과사고시켜 토큰·컨텍스트를 소모, 단일 응답 완주를 위협. 정확도 핵심 추론은 선행 단계(`plan-design-self-review-loop`·`pre-do-anchor-verification`)에서 max로 이미 끝났다는 전제.
- **커널만 max로 위임**: Do 중 새로 나온 어려운 정확성 계산(법령 산식 재유도·anchor 기대값 산정·경계조건 판정)은 메인 턴 effort를 올리지 말고, 그 한 건만 `effort:'max'` 서브에이전트(Agent/Workflow)로 위임 → 결과만 받아 wiring, 메인 Do는 계속 진행.
- **9단계 품질 게이트 = high~max**: `/code-review`는 high 이상, 법령 정합 의심 구간은 max 검토자에 위임.
- **선행 전제 강제**: Do 진입 전 anchor가 통과·동결돼 있어야 baseline high가 안전. anchor 미확보면 effort를 올리는 게 아니라 **Do를 멈추고 `pre-do-anchor-verification`로 복귀**한다.

## 코드 품질 게이트 (완료 후 · 커밋 전, 강제 — 9단계)

전 항목 `[x]` 도달 후, **커밋 전에** 변경 코드를 정적 검토한다. anchor·vitest(기능 검증)는 이미 Do에 포함되므로, 이 게이트는 그 위에 얹는 **품질·버그·보안 정적 검토**다.

- **도구**: `/code-review` (변경 diff 버그·간결성 리뷰) 또는 `bkit:code-analyzer` (품질·보안·아키텍처 준수). 규모가 크면 `bkit:gap-detector`로 설계↔구현 갭도 확인.
- **범위(Surgical)**: 이번 작업이 추가·변경한 코드만 검토. 기존 무관 코드 이슈는 **기록만**, 수정 금지.
- **처리**: High/Medium 이슈는 **수정 후 재검토(loop)**. Low/Nit은 기록만 하고 진행. 이슈를 숨기고 통과시키는 거짓 통과 금지.
- **순서**: 품질 검토 → 이슈 수정 → tsc·test 재확인 → 커밋. 품질 검토를 커밋 후로 미루지 않는다.

## 커밋 위생 (10단계)

- 명시 경로로 `git add` (TODO.md·lock 파일·미관련 변경 제외)
- 커밋 메시지 한국어 + Co-Authored-By
- pre-commit(eslint --fix)·pre-push(tsc+test) 훅 통과 확인

## 성과 기준

- 단일 응답 내 미완료 0 도달 (이번 세션 19/19)
- 회귀 0 (전체 test PASS)
- 코드 품질 정적 검토 High/Medium 0 (또는 수정 완료) 후 커밋
- 거짓 완료 보고 0 / 무단 중간 종료 0

## 관련

- `plan-design-self-review-loop` (선행 Plan/Design 검토)
- `pre-do-anchor-verification` (Do 진입 전 anchor)
- `/code-review` · `bkit:code-analyzer` (9단계 코드 품질 게이트 도구)
- memory `feedback_external_concurrent_edit_stale_read` (BLOCKER (b) 트리거)
- memory `feedback_pdca_session_efficiency` (UI 중단 5원인 사전 차단)
