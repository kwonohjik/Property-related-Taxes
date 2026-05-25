# 작업 TODO — 현재 진행 + 잔존

> 정책: 각 작업 완료 시 본 TODO.md를 즉시 업데이트 후 다음 작업으로 이동
> 형식: `- [ ]` 미완료 / `- [x]` 완료

---

# 🔴 진행 중: PR-RD-5b — Vworld reverse-geocoding 클라이언트

> Plan: `docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md` v1
> 시작: 2026-05-24
> 예상: 5.5~6.5h

## 작업 목록 (8건)

- [x] **S1** Vworld API 사양 조사 (완료) — URL `https://api.vworld.kr/req/address`, params service=address·request=getAddress·type=both·point=lng,lat·format=json, 응답 `response.result[].structure.{level1,level2,level4L,level4LC}`, 한국 영역 33~39N·124~132E, Referer 헤더 필수 (기존 search route 패턴 활용)
- [x] **S2** API 프록시 라우트 — `app/api/address/reverse-geocode/route.ts` (130줄) — sanity check + Vworld 호출 + level4LC 추출 + 5단 응답 분기
- [x] **S3** Dexie v5 마이그레이션 — `lib/storage/db.ts`에 `reverseGeocodeCache` 테이블 + `ReverseGeocodeCacheRecord` 타입 + resetLocalDB 갱신 (기존 4 테이블 무변경, 회귀 0)
- [x] **S4** 클라이언트 헬퍼 — `lib/calc/vworld-reverse-geocode.ts` (178줄) — reverseGeocode() + resolveSigunguCode() PNU 우선 fallback + cacheKey() + purgeExpiredCache() + isReverseGeocodeError() type guard
- [x] **S6-VRG** anchor — `__tests__/lib/calc/vworld-reverse-geocode.test.ts` 14 PASS (VRG-1~10 + 10b + meta 2 + fetch-throw)
- [x] **S6-API** anchor — `__tests__/api/reverse-geocode.route.test.ts` 8 PASS (API-1~5 + 2b·2c·fetch-throw)
- [x] **S5** PropertyValuationForm 통합 — AddressSearch onChange async + resolveSigunguCode 자동 호출 + isFishing 분기 (estateSigunguCode / fishingAnchorSigunguCode) + 실패 silent fallback
- [x] **CV** 갭 분석 (갭 0건, anchor 초과달성) + typecheck 0 + 전체 회귀 4,893 PASS (+22 신규, 0 FAIL) + 한국어 커밋 + push

## 진행 현황

- 전체 작업: 8개
- 완료: 8개
- 미완료: 0개
- 상태: **완료 ✅**

## 자가 점검 체크리스트 (완료 보고 전)

- [x] 8 작업 모두 완료 + TODO.md `[x]` 갱신
- [x] typecheck 0 에러
- [x] 전체 vitest 회귀 0건 (4,871 → 4,893 PASS, +22 신규)
- [x] 신규 anchor 22건 PASS (VRG 14 + API 8, 계획 15건 초과달성)
- [x] 갭 분석 — 계획서 §2 산출물 4종 + 테스트 2종 = 6 파일 모두 commit
- [x] 14지점 ⑤ AddressSearch onChange 통합 확인
- [x] mirror-pattern — PNU 우선 → API fallback → 실패 silent (3층 일관)
- [x] 한국어 커밋 메시지 + push 완료
- [x] 미완료 0개 확인 후 완료 선언

---

# 🟡 잔존: PR-K — §54⑥ 평가심의위원회 신청 옵션 (보류)

> 별도 세션 대기. 본 PR-RD-5b 완료 후 또는 사용자 요청 시 진입.
> Plan: `docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md`
> Design: `docs/02-design/features/inheritance-unlisted-stock-evaluation-committee-section-54-6.engine.design.md`
> Total: 9일 / 6 sub-PR / 45 anchor

## 사전 준비 (Phase A-0)

- [ ] policy-check skill 호출 — 4정책 사전 인식 (enum-verification·mirror-pattern·dialog-data-discard·three-state-toggle)
- [ ] KoreanLaw MCP 재검증 — §54⑥·§49의2·§67·§68 인용 박스 (계획·디자인 첨부)

## PR-K-1: 엔진·타입 + 70~130% 범위 검증 (2일, anchor 13)

- [x] `lib/tax-engine/property-valuation/evaluation-committee-section-54-6.ts` 생성 (~150줄)
- [x] EvaluationCommitteeMethod 타입 정의 ("clm"|"dcf"|"ddm"|"other")
- [x] METHOD_LABEL Record<EvaluationCommitteeMethod, string> 4종 강제
- [x] EvaluationCommitteeInput 타입
- [x] EvaluationCommitteeResult 타입
- [x] validatePerShareRange(supplementary, taxpayer) 헬퍼
- [x] applyEvaluationCommittee(input, supplementary) 진입점
- [x] UnlistedStockValuationInput.evaluationCommittee?
- [x] UnlistedStockValuationResult.evaluationCommitteeApplied?
- [x] unlisted-orchestrator.ts — applyEvaluationCommittee 호출
- [x] appliedRules "상증령 §54⑥ + §49의2" 푸시
- [x] 본 결과 무변경 보장
- [x] anchor K-1-1 ~ K-1-13 (13건, 14 PASS — validatePerShareRange 헬퍼 추가)
- [x] PR-K-1 커밋·푸시 (commit efad8b9)

## PR-K-2: Zod schema + validate (0.5일, anchor 4)

- [x] unlisted-stock-valuation-v2.schema.ts — evaluationCommittee 필드 추가
- [x] method enum + taxpayerPerShareValuation + methodNotes + evaluatorOrganization
- [x] superRefine — "other" + methodNotes 누락 차단 (§49의2⑤2호)
- [x] anchor K-2-1 ~ K-2-4 (5건 PASS — 회귀 1 포함)
- [x] PR-K-2 커밋·푸시 (commit 512b1c7)

## PR-K-3: UI 토글·입력 폼 (2일, anchor 6)

- [x] EvaluationCommitteeToggle.tsx 생성 (190줄)
- [x] ToggleCard emerald + RadioCardGroup 4옵션
- [x] CurrencyInput·textarea·input
- [x] 토글 ON→OFF 데이터 폐기 Dialog (rose-600 + 입력값 있을 때만)
- [x] UnlistedStockV2Card 섹션 5-C 통합
- [x] anchor K-3-1 ~ K-3-6 (7건 PASS — 회귀 1 포함)
- [x] PR-K-3 커밋·푸시 (commit 049139c)

## PR-K-4: Range Indicator + 결과 카드 (1.5일, anchor 9)

- [x] EvaluationCommitteeRangeIndicator.tsx 생성 (115줄)
- [x] EvaluationCommitteeResultCard.tsx 생성 (160줄)
- [x] inheritanceApplicationDeadline + giftApplicationDeadline + daysUntilDeadline 헬퍼 (lib/calc/evaluation-committee-deadline.ts)
- [x] formatLocalDate helper — toISOString UTC drift 회피 (KST)
- [x] anchor K-4-1 ~ K-4-9 (10건 PASS — 헬퍼 1 포함)
- [x] PR-K-4 커밋·푸시 (commit dcbff49)

## PR-K-5: 신고서 안내 카드 (1일, anchor 3)

- [x] EvaluationCommitteeFilingGuideCard.tsx 생성 (125줄)
- [x] §49의2⑤2호 첨부 자료 3종 체크리스트 (가·나·다)
- [x] §49의2④ 기한 안내 (상속 4/1개월 · 증여 70/20일 분기)
- [x] §49의2⑦ 심의 고려사항 3종
- [x] §49의2⑨ 신용평가전문기관 안내 (amber tone — 수수료 납세자 부담)
- [x] anchor K-5-1 ~ K-5-3 (4건 PASS — 회귀 1 포함)
- [x] PR-K-5 커밋·푸시 (commit c077381)

## PR-K-6: RTL 통합 + 14지점 점검 + 전체 회귀 (2일, anchor 10)

- [x] 14 동기화 지점 grep 자가검증 (①~⑭ 모두 ✅)
- [x] anchor K-6-1 ~ K-6-10 (10건 PASS)
- [ ] 브라우저 수동 확인 (후속 PR 또는 사용자 검증)
- [x] PR-K-6 커밋·푸시 (commit 0256333)

## PR-K 전체 DoD

- [x] 6 sub-PR 모두 완료 (efad8b9 / 512b1c7 / 049139c / dcbff49 / c077381 / 0256333)
- [x] 45+ anchor 모두 통과 (실제 50건: K-1 14 + K-2 5 + K-3 7 + K-4 10 + K-5 4 + K-6 10)
- [x] 기존 회귀 0건 (4,791 → 4,871 누적 +80, FAIL 0)
- [x] TypeScript 0건
- [x] 800줄 정책 (모든 신규 파일 ≤ 250줄)
- [x] KoreanLaw MCP 인용 박스 (§54⑥·§49의2④⑤⑦⑨·§67·§68)
- [ ] 브라우저 수동 확인 (후속)
- [x] 3대 정책 위반 0건 (useEffect 미러링·자동 안분·fallback 비동기화 모두 없음)
