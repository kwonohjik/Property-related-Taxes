# 법령 리서치 고도화 Plan — chrisryugj/korean-law-mcp 벤치마크 이식

## Context

현재 `/law` 법령 리서치는 chrisryugj/korean-law-mcp 초기 버전을 포팅해 약 70–75% 구현 상태이지만, 실제 검색·정제·출력 품질이 원본 MCP(v3.5.4, 16 공개 도구 / 89 내부 도구)에 비해 부족하다는 사용자 피드백이 확인됐다.

**목표**: 부동산 세법 리서치(양도세·상속세·증여세·취득세·재산세·종부세) 품질을 MCP 수준까지 끌어올려, LLM 환각 차단·조문 구조화·판례 축약·세법 특화 옵션을 모두 지원한다. Next.js App Router + 파일 캐시 아키텍처를 유지하면서 순수 TS 모듈 확장으로 이식한다.

**핵심 격차 (Top 10)** — 외부 조사 요약
1. `verify_citations` 부재 — LLM 출력의 "소득세법 제89조" 류 인용을 병렬 실존 검증(✓/✗/⚠) + `[HALLUCINATION_DETECTED]` 마커 누락
2. 체인 부분 실패 노이즈 — `secOrSkip` 마커(`▶ 섹션명 [NOT_FOUND] ⚠️ LLM은 추측 금지`) 부재
3. 관련도 재정렬 불완전 — "민법" → "난민법" 상위 노출 위험 잔존
4. Fuzzy 3단 fallback + 세법 불용어 제거가 단순
5. 토큰 74% 절감 4단 콤보(compactBody + densify + stripRepeatedSummary + **compactLongSections**) 중 마지막 누락
6. 원숫자 항번호 ①②③…⑳ 파싱 없음 — 법제처 API가 항 번호를 원숫자로 반환하는 경우 "제1항" 매칭 실패
7. 별표 파일 실제 파싱(HWPX/PDF/XLSX → Markdown) 부재 — 링크만 반환
8. 자연어 날짜 범위 파서(`최근 3년`, `2020년부터`) 없음
9. 17 도메인 통합의 세법 특화 옵션 passthrough(`cls, gana, dpaYd, rslYd` — 조세심판원) 미노출
10. Scenario 확장 7종(`penalty/timeline/impact/delegation/compliance/manual/customs`) 미구현

## 구현 전략 — 3-Tier Phased Rollout

### Tier 1. 품질·정확성 핵심 (필수)
환각 차단·조문 파싱·부분실패 마커는 세법 안내의 신뢰성에 직접 영향. 최우선 이식.

#### 1.1 `lib/korean-law/article-parser.ts` **신규 생성**
- 조문 → 항 → 호 → 목 재귀 평탄화 (`flattenContent`)
- `parseHangNumber()`: `①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳` → 1~20 매핑 + 일반 숫자 fallback
- `formatArticleUnit()`: 조문 헤더 정규식 `/^(제\d+조(?:의\d+)?\s*(?:\([^)]+\))?)/` 중복 제거
- HTML cleanup 순서 재정의(`&amp;`를 마지막) — 현재 `compact.ts:cleanHtml()`을 이쪽으로 이동·확장
- 참조: upstream `src/lib/article-parser.ts` (159줄)

#### 1.2 `lib/korean-law/verify-citations.ts` **신규 생성**
현재 chains.ts:152-190 `documentReview`의 로직을 독립 모듈로 승격 + 강화:
- 패턴 확장: `/제\d+조(?:의\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?/`
- 직전 30자 역추적으로 법령명 회복 (stopword 20+ 접두사 제거: "또한|따라서|해당|...")
- dedup key `${lawName}::${joCode}::${hang}::${ho}`
- Promise.all 병렬 검증 → 3분류(`✓ 실존 / ✗ NOT_FOUND(환각) / ⚠ API 실패`)
- hang 지정 시 `parseHangNumber` 원숫자 매칭
- 응답 헤더 마커: `[HALLUCINATION_DETECTED] / [PARTIAL_VERIFIED] / [VERIFIED]`
- `isError: true` 플래그로 환각 감지 시 UI 경고 배너
- 신규 API: `app/api/law/verify-citations/route.ts` (POST)
- 참조: upstream `src/tools/verify-citations.ts` (251줄)

#### 1.3 `lib/korean-law/chains.ts` **수정**
- `secOrSkip(heading, fn)` 헬퍼 추가: 에러 캐치 후 `{ kind: "note", heading, note: "[NOT_FOUND] / [FAILED] ⚠️ 이 섹션은 조회 실패 — LLM은 내용을 추측/생성하지 마세요." }` 삽입
- 모든 체인의 `Promise.all`을 `Promise.allSettled`로 전환 → `secOrSkip` 적용
- `documentReview`를 `verify-citations.ts`로 위임 (중복 제거)

#### 1.4 `lib/korean-law/compact.ts` **수정**
- `compactLongSections(text, headers[], options)` 추가: 섹션 헤더 12종(`이유, 전문, 결정내용, 본문, 회답, 재결이유, 판결이유, 판례내용, 심판요지, 의결내용, 결정이유, 조문내용`) 중 **마지막** 매칭의 body만 `compactBody` 적용
- `ALREADY_COMPACTED` set(`["prec","detc","expc"]` 등 자체 compact 도메인 skip)
- `client.ts:getDecisionText`에서 `full=false` && 도메인이 `ALREADY_COMPACTED` 밖일 때 post-process

### Tier 2. 세법 특화 & UX (고영향)

#### 2.1 `lib/korean-law/client.ts` **수정** — 조세심판원 options passthrough
- `searchDecisions(query, domain, page, size, options?)` 시그니처 확장
- domain === "ppc"(조세심판원) 시 `options: { cls, gana, dpaYd, rslYd }` 머지 허용
- domain === "prec" 시 `options: { curt, caseNumber, fromDate, toDate }` 허용
- UI 측 `DecisionSearchTab.tsx`에 도메인별 고급 옵션 접히는 패널 추가

#### 2.2 `lib/korean-law/date-parser.ts` **신규 생성**
- `parseDateRange(query)`: "최근 3년|2020년부터|작년|올해 상반기|지난달" → `{ fromDate?: YYYYMMDD, toDate?: YYYYMMDD, cleanedQuery: string }`
- DecisionSearchTab에서 쿼리 전처리 훅
- 참조: upstream `src/lib/date-parser.ts` (196줄)

#### 2.3 `lib/korean-law/search-normalizer.ts` **수정**
- `KEYWORD_EXPANSIONS` 사전 추가 (세법 특화):
  - `양도세 ↔ 양도소득세`, `취득세 ↔ 지방세법`, `종부세 ↔ 종합부동산세`, `상증세 ↔ 상속세및증여세법`, `고가주택 ↔ 12억/조정대상지역`, `장특 ↔ 장기보유특별공제` 등 약 30+ 매핑
- `stripNonLawKeywords` 3단 fallback 강화 — 현재 regex 1회만 → 2단계(법령명 regex 직접 추출 `[가-힣]+(법|시행령|시행규칙|규칙|규정|령)`) 추가
- `scoreLawRelevance` 튜닝: 세법 본법 우선(`소득세법·지방세법·상증법·조특법`) 추가 `+10`

#### 2.4 Scenario 확장 3종 (세법 실무 직결)
`lib/korean-law/scenarios/` 신규 디렉터리:
- `penalty.ts`: 가산세·과태료 감경 판례 자동 수집(`chain_action_basis`에 첨부) — "감경|정당한 사유|불가피|경정청구" 키워드 확장
- `timeline.ts`: 세법 개정 시점별 판례·해석례 매핑(`chain_amendment_track`에 첨부)
- `impact.ts`: 개정 전후 영향도 분석(`chain_law_system`에 첨부)
- `detectScenario(query, chainType)`: 쿼리 regex 매칭으로 자동 트리거
- 참조: upstream `src/tools/scenarios/` (87줄 index + 7개 시나리오)

### Tier 3. 인프라·안정성 (배포 전 필수)

#### 3.1 `lib/korean-law/fetch-with-retry.ts` **신규 생성**
- `fetchJsonWithRetry(url, { timeout=30000, retries=3, baseDelay=1000, retryOn=[429,503,504] })`
- `AbortController` timeout
- `Retry-After` 헤더 우선, 없으면 **지수 백오프 + jitter**(`baseDelay * 2^attempt * (1 + Math.random()*0.5)`)
- `maskSensitiveUrl()` — `?OC=KEY` → `?OC=***`로 에러 메시지 마스킹 (보안)
- `client.ts:fetchJson` 전체를 이쪽으로 대체
- 참조: upstream `src/lib/fetch-with-retry.ts` (119줄)

#### 3.2 HTML 오류 페이지 감지
- `client.ts`에 `checkHtmlError(body)` 추가: 응답 시작이 `<!DOCTYPE html` / `<html`이면 API 파라미터 오류로 판정 → `LawApiError("UPSTREAM")` + 재시도 힌트 동봉

#### 3.3 NOT_FOUND 시 키워드 간소화 힌트
- `searchLaw(query)` NOT_FOUND 응답에 `hint: "키워드 '${keywords[0]}' 로 재시도해 보세요"` 자동 첨부

### Tier 4. 별표 파일 — PDF 경량 파싱 (확정 스코프)

사용자 결정: **옵션 B (PDF만 경량 지원)** 채택.

- `pdfjs-dist` 의존성 추가 (이미 React 19와 호환, SSR 사용)
- `lib/korean-law/annex-pdf-parser.ts` 신규: PDF 버퍼 → 페이지별 텍스트 추출(라인 단위 정렬) → 캐시
- API `app/api/law/annexes/parse/route.ts` 신규(POST, `{ annexId, fileUrl }`) — 파일 다운로드 → PDF 판정(Content-Type / magic bytes `%PDF-`) → 파싱 → Markdown 유사 텍스트 반환
- HWPX/HWP5/XLSX/DOCX는 **링크+파일 형식 배지·용량 표시**만 추가
- AnnexTab UI: PDF는 "본문 보기" 토글(펼치면 텍스트 인라인), 그 외는 기존 다운로드 유지
- 캐시 키: `annex_pdf_text_${annexId}.txt`, TTL 30일
- **범위 한계**: 표 구조 복원은 하지 않음(라인 텍스트만). 종부세 별표·소득세법 별표 중 PDF로 제공되는 건만 텍스트화.

**리스크 완화**: `pdfjs-dist`는 Vercel Serverless 함수에서 50MB 번들 제약을 넘을 가능성 — `dynamic import`로 라우트 내부 lazy load + Next.js `experimental.serverComponentsExternalPackages`에 추가.

### 변경 파일 요약

| 파일 | 동작 | Tier | 추정 라인 |
|---|---|---|---|
| `lib/korean-law/article-parser.ts` | 신규 | 1 | +180 |
| `lib/korean-law/verify-citations.ts` | 신규 | 1 | +260 |
| `lib/korean-law/chains.ts` | 수정(secOrSkip) | 1 | +60 |
| `lib/korean-law/compact.ts` | 확장 | 1 | +70 |
| `lib/korean-law/client.ts` | options passthrough + retry | 2,3 | +90 |
| `lib/korean-law/date-parser.ts` | 신규 | 2 | +200 |
| `lib/korean-law/search-normalizer.ts` | 확장 | 2 | +80 |
| `lib/korean-law/scenarios/index.ts` | 신규 | 2 | +90 |
| `lib/korean-law/scenarios/{penalty,timeline,impact}.ts` | 신규 | 2 | +300 |
| `lib/korean-law/fetch-with-retry.ts` | 신규 | 3 | +120 |
| `app/api/law/verify-citations/route.ts` | 신규 | 1 | +60 |
| `app/law/_components/DecisionSearchTab.tsx` | 고급옵션 UI | 2 | +80 |
| `app/law/_components/ChainResearchTab.tsx` | scenario 뱃지 | 2 | +40 |
| `app/law/_components/VerifyCitationsTab.tsx` | 신규 탭 | 1 | +130 |
| `app/law/_components/LawResearchClient.tsx` | 5번째 탭 추가 | 1 | +10 |
| `__tests__/korean-law/verify-citations.test.ts` | 신규 | 1 | +150 |
| `__tests__/korean-law/article-parser.test.ts` | 신규 | 1 | +120 |
| `__tests__/korean-law/date-parser.test.ts` | 신규 | 2 | +80 |
| `__tests__/korean-law/chains.test.ts` | 확장 | 1 | +80 |

**총 추정: 신규 ~9 파일, 수정 ~6 파일, +2,200 라인**

## 재사용 대상 (신규 금지)

- `parseCitation` — `lib/legal-verification/citation-parser.ts` 재사용 (인용 문자열 → `{lawFullName, articleNo}` 파싱)
- `resolveLawAlias` — `lib/korean-law/aliases.ts` (84 엔트리, MCP 52 엔트리보다 풍부 — 유지)
- `normalizeArticleNo` — `lib/korean-law/client.ts` (이미 정규화 로직 존재)
- `safeCacheKey`, `readCache`, `writeCache` — `lib/korean-law/client.ts` 기존 파일 캐시
- `LawApiError`, `mapErrorToResponse` — `app/api/law/_helpers.ts` 에러 매핑 유지

## 테스트·검증 전략

### 단위 테스트 (vitest, 네트워크 없음)
1. `article-parser.test.ts` — 조문 파싱 + ①②③ 매핑 20+ 케이스
2. `verify-citations.test.ts` — mocked `getLawText`로 3분류 검증 + `[HALLUCINATION_DETECTED]` 마커
3. `date-parser.test.ts` — "최근 3년", "작년 상반기", 경계 케이스 30+
4. `chains.test.ts` — `secOrSkip` 부분 실패 시나리오 (mocked)
5. 기존 339 테스트 회귀 확인 (`npm test`)

### 통합 검증
```bash
npm run dev
# .env.local에 KOREAN_LAW_OC=<본인키> 확인
open http://localhost:3000/law
```

**체크리스트:**
- [ ] 법령 탭: "민법" 검색 시 정확 매칭이 상위 (scoreLawRelevance 작동)
- [ ] 판례 탭: "조세심판원" 도메인 선택 시 `cls/gana` 옵션 노출
- [ ] 판례 탭: "최근 3년 양도세 중과" 입력 → 날짜 자동 추출 (2023–2026)
- [ ] 판례 본문: 10KB+ 판결문에 "⋯ 중략 N자 ⋯" 표시 + 전문 보기 토글
- [ ] 조문 본문: "소득세법 제104조" 조회 → ①②③④ 항 번호 정상 렌더
- [ ] 체인 탭: 일부 API 실패 시 해당 섹션만 `[NOT_FOUND] ⚠️ LLM 추측 금지` 배너
- [ ] 인용 검증 탭(신규): "소득세법 제1234조 제99항" 입력 → `[HALLUCINATION_DETECTED]` 헤더 + ✗ 마킹

### E2E (기존 스크립트 확장)
```bash
node scripts/e2e-law-research.mjs
# 인용 검증 탭 시나리오 5개 추가
```

## 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| stripNonLawKeywords가 세법 키워드("양도/상속/증여/취득") 과제거 | 3단 fallback의 마지막 단계로만 적용, 원본 쿼리 우선 |
| verify-citations 병렬 호출이 rate limit 30/min 초과 | 단일 요청 내 max 20 citation 제한, 초과 시 경고 |
| 조세심판원 options는 법제처 API 문서화 부실 | upstream 코드 그대로 이식 + dev 환경 수동 검증 |
| Tier 4 kordoc 도입 시 Vercel 함수 크기 초과 가능 | 별표 파싱은 별도 worker 혹은 Phase 2로 분리 |

## 구현 순서 (확정)

**사용자 확정 스코프**: Tier 1 + 2 + 3 + 4(PDF 경량) 모두 진행.

1. **Sprint 1** (Tier 1 품질·환각 방지)
   - `lib/korean-law/article-parser.ts` 신규 (①②③ 포함)
   - `lib/korean-law/verify-citations.ts` 신규 + `app/api/law/verify-citations/route.ts`
   - **`app/law/_components/VerifyCitationsTab.tsx` 신규 (5번째 탭)** — 사용자 확정
   - `LawResearchClient.tsx`에 탭 추가
   - `chains.ts` secOrSkip 전환 + `compact.ts:compactLongSections`
   - 단위 테스트 3종
2. **Sprint 2** (Tier 2 세법 UX)
   - `client.ts` 도메인별 options passthrough (조세심판원 cls/gana/dpaYd)
   - `date-parser.ts` + DecisionSearchTab 날짜 자동 추출
   - `search-normalizer.ts` KEYWORD_EXPANSIONS 세법 사전 + 3단 fallback 강화
   - `scenarios/` 3종(penalty/timeline/impact) + ChainResearchTab 뱃지
3. **Sprint 3** (Tier 3 인프라·보안)
   - `fetch-with-retry.ts` 신규 + `client.fetchJson` 대체
   - HTML 오류 페이지 감지 + 키워드 간소화 힌트
   - `maskSensitiveUrl` 전면 적용
4. **Sprint 4** (Tier 4 PDF 별표)
   - `pdfjs-dist` 의존성 추가
   - `annex-pdf-parser.ts` + `/api/law/annexes/parse`
   - AnnexTab PDF 토글 UI

## Out of Scope (이 Plan 제외)

- MCP 서버화 (원본과 달리 우리는 Next.js 내장 API로 충분)
- `execute_tool` 메타 프록시 (내부 73 도구 노출 불필요)
- 헌법재판소·행정심판위원회 등 비세법 도메인의 UI 최적화
- 한글 OCR 오타 교정 사전 확장 (현재 12개 → upstream 동일 수준 유지)
- bkend.ai MCP 연동 (별도 PDCA feature)
