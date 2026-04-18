# law-research-v2 Planning Document

> **Summary**: korean-law-mcp 원본 수준으로 `/law` 법령 리서치의 정제 품질을 끌어올리기 위한 Phase A+B+C 전면 고도화 계획
>
> **Project**: korean-tax-calc
> **Version**: 0.1.0
> **Author**: kwonohjik
> **Date**: 2026-04-18
> **Status**: Draft
> **참조 분석**: 본 Plan은 병렬 Explore 에이전트가 수행한 [korean-law-mcp vs 자체 구현 Gap 분석] 결과(5대 격차)를 근거로 작성됨.

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 법제처 Open API 응답을 raw string으로 노출 · 검색 파라미터 활용도 < 20% · 판례 본문·참조조문이 비구조화되어 LLM이 재파싱해야 함 · 체인 시나리오 3개에 그쳐 실무 커버리지 부족 |
| **Solution** | 응답 구조화 파싱(항/호/목·주문/이유/참조조문) + Query Router(규칙 기반) + 체인 시나리오 8종 완비 + 법제처 API 파라미터 풀활용(ancYd/efYd/sort) + UI 하이라이트/아코디언/자동 조문 로드 |
| **Function/UX Effect** | 판례·법령 출력이 구간별 아코디언 + 참조조문 클릭 자동 로드로 변모. 자연어 질의만 입력해도 적절 도구 자동 선택. 검색 결과 노이즈 감소·최신 개정 우선 |
| **Core Value** | korean-law-mcp 원본과 동급 이상의 "정제된" 법령 리서치 경험을 KoreanTaxCalc 앱 내장으로 제공하여 세금 계산과 법령 확인을 한 화면에서 처리 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 자체 `/law` 출력 수준이 외부 MCP 원본 대비 낮다는 사용자 지적. 특히 참조 조문·판례 비구조화로 인한 LLM 환각·재파싱 부담 해결 |
| **WHO** | 세금 계산 앱 이용 중 법령·판례를 신속히 확인하려는 일반 납세자 + 심화 리서치가 필요한 세무 전문가·실무자 |
| **RISK** | 법제처 Open API 스키마 추가 의존 → 스키마 변동 시 파싱 실패 가능. `.legal-cache` 포맷 변경으로 기존 캐시 히트율 일시 하락. Query Router 오매칭 시 사용자가 원치 않는 탭 이동 |
| **SUCCESS** | (1) 판례 본문 5개 구간(주문/이유/판시/요지/참조) 분리 노출 (2) refLaws·refPrecedents 구조화 배열 반환 (3) 체인 시나리오 8종 동작 (4) Query Router 규칙 ≥ 10종 매칭 (5) 전체 테스트 통과율 100% |
| **SCOPE** | Phase A(구조화+UI 아코디언) → Phase B(시나리오 8종·API 파라미터 고도화) → Phase C(Query Router) 순차 진행. 외부 LLM 의존 없음 |

---

## 1. Overview

### 1.1 Purpose

KoreanTaxCalc의 `/law` 법령 리서치 기능이 korean-law-mcp(chrisryugj/korean-law-mcp) 원본 대비 "정제된 정보 수준 차이가 크다"는 사용자 피드백을 해소한다. 동일한 법제처 Open API를 쓰지만 응답을 **얼마나 깊이 구조화하고 UI에 풍부하게 노출하느냐**가 품질 격차의 본질이다.

### 1.2 Background

- 현재 `/law` 구조: API Route → `lib/korean-law/client.ts`(979줄) → 법제처 Open API → HTML strip + 부분 축약만 수행
- 5대 격차:
  1. **응답 구조화 부재** — `reasoning` 한 덩어리 문자열, `refLaws`가 쉼표 구분 string
  2. **Query Router 부재** — 탭 수동 선택에 의존
  3. **시나리오 3종만 구현** — 원본은 8종
  4. **API 파라미터 < 20% 활용** — `ancYd/efYd/sort/target=…` 등 미사용
  5. **UI 정적 렌더** — 하이라이트·가상 스크롤·원숫자 파싱 없음

### 1.3 Related Documents

- Impact 분석 보고서(Explore 에이전트 산출): 본 Plan 상단 "참조 분석" 주석 참조
- 외부 레퍼런스: https://github.com/chrisryugj/korean-law-mcp (v3.3.1 기준)
- 기존 모듈: `lib/korean-law/client.ts`, `app/api/law/*`, `app/law/_components/*`
- CLAUDE.md `## 법령 리서치 (/law)` 섹션

---

## 2. Scope

### 2.1 In Scope

- [ ] 판례·결정례 본문 구조화 파싱 (주문/이유/판시사항/판결요지/참조조문/참조판례 필드 분리)
- [ ] 조문 본문 구조화 파싱 (항·호·목 트리 + 개정이력·참조조문 메타)
- [ ] 참조조문·참조판례 문자열 → 구조화 배열 변환 (`{lawName, articleNo, hangNo, hoNo}[]`)
- [ ] 원숫자 파싱 유틸(①②③ → 1/2/3) 도입
- [ ] 체인 시나리오 5종 추가: customs / manual / delegation / compliance / fta (기존 penalty/timeline/impact 유지)
- [ ] 법제처 Open API 파라미터 확장: `ancYd`(공포일자 범위), `efYd`(시행일자 범위), `sort`, `display`, `page`
- [ ] 검색 결과 관련도 재정렬 로직 개선 (현재 단순 점수 → 쿼리·법령 매칭 가중치 체계화)
- [ ] Query Router(정규식 규칙 기반) — `"민법 제750조"` → `get_law_text(jo=750)` 자동 매칭 ≥ 10종 패턴
- [ ] UI 개선: 판례 아코디언, 참조조문 클릭 시 자동 `get_law_text` 호출 모달, 검색 매치 하이라이트, 결과 리스트 가상 스크롤
- [ ] 캐시 포맷 v2 병행: 기존 `.legal-cache/*.json` 유지 + `*_v2.json` 신규 스키마 별도 저장
- [ ] 테스트: 단위(구조화 파서) + 통합(API Route) + E2E(체인·Query Router)

### 2.2 Out of Scope

- 자체 LLM 요약·생성 기능 (외부 LLM 의존 금지 원칙)
- 별표(.hwp/.pdf) 내부 텍스트 파싱 (바이너리 파싱 제외, 링크·메타만)
- `/law` 외의 세금 계산 플로우 변경
- 법제처 Open API 외 다른 법령 데이터 소스 통합
- 오프라인 법령 DB 구축

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `lib/korean-law/parsers/` 신규 생성 — 판례·조문·참조조문 각각의 구조화 파서 순수 함수로 분리 | High | Pending |
| FR-02 | 판례 본문 응답을 `{holdings, summary, ruling, reasoning, refLaws[], refPrecedents[]}` 객체로 반환하도록 `getDecisionText` 리턴 타입 개편 | High | Pending |
| FR-03 | 조문 응답에서 `{조번호, 제목, 항[{번호, 내용, 호[{번호, 내용, 목[]}]}]}` 트리 구조 파싱 | High | Pending |
| FR-04 | refLaws·refPrecedents를 `LawRef[]`·`PrecedentRef[]` 배열로 변환하는 파서 구현 (기존 `densifyLawRefs` 대체 아닌 확장) | High | Pending |
| FR-05 | 원숫자(①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮) 파싱 유틸 `parseCircledNumber()` 추가 | High | Pending |
| FR-06 | 체인 시나리오 5종 추가: `customs`(관세3법+FTA), `manual`(공무원 매뉴얼), `delegation`(위임입법 미이행), `compliance`(조례 상위법 적합성), `fta`(FTA 조약·세율표) | Medium | Pending |
| FR-07 | 법제처 API 파라미터 확장 (ancYd/efYd/sort/target 추가) — `doLawNameSearch` / `searchDecisions` 시그니처 보강 | High | Pending |
| FR-08 | 관련도 점수 개선: `TAX_CORE_LAWS` 가중치 상향, 법명 완전일치 +300, 단어 매칭 가변 가중(길이 비례) | Medium | Pending |
| FR-09 | Query Router(`lib/korean-law/query-router.ts`): 정규식 패턴 ≥ 10종으로 자연어 질의 → 적합 도구+파라미터 자동 추출 | High | Pending |
| FR-10 | `/law` UI 판례 탭에 아코디언 렌더러 도입 (shadcn/ui `<Accordion>`) — 6개 구간 각각 접기/펼치기 | High | Pending |
| FR-11 | 참조조문 칩 클릭 시 `get_law_text` 자동 호출 모달 (shadcn/ui `<Dialog>`) | High | Pending |
| FR-12 | 검색 결과 리스트에 쿼리 매치 하이라이트 (`<mark>`) 적용 | Medium | Pending |
| FR-13 | 100개 이상 결과 시 가상 스크롤(@tanstack/react-virtual) 적용 | Low | Pending |
| FR-14 | 캐시 포맷 v2 병행: `safeCacheKey` 결과에 `_v2` 서픽스 추가한 신규 파일로 구조화 응답 저장. 기존 캐시 유지·읽기 폴백 | High | Pending |
| FR-15 | Query Router 오매칭 시 사용자가 되돌릴 수 있는 "라우팅 해제" UI 토글 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | Query Router 매칭 < 5ms, 구조화 파서 < 50ms per 응답 | vitest benchmark + performance.now() |
| Compatibility | 기존 `.legal-cache/*.json` 무효화 없음, 기존 API 엔드포인트 하위호환 | 통합 테스트로 기존 캐시·라우트 재검증 |
| Test Coverage | 신규 파서·라우터 단위 테스트 ≥ 90%, 체인 8종 모두 통합 테스트 작성 | `npm test` 커버리지 |
| Security | 법제처 API 키 누수 방지, 사용자 쿼리 XSS 필터링(하이라이트 구현 시) | 코드 리뷰 + 기존 rate-limit 유지 |
| Accessibility | 아코디언·모달 WAI-ARIA 준수, 키보드 내비게이션 | shadcn/ui 기본 + Axe DevTools |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 판례 본문 응답이 6개 구간 필드로 분리되어 JSON 반환
- [ ] refLaws·refPrecedents가 구조화 배열로 반환되고, 배열 요소 클릭 시 자동 조문 로드 동작
- [ ] Query Router 규칙 ≥ 10종 구현, 대표 자연어 질의 20건 테스트 통과
- [ ] 체인 시나리오 8종 모두 `/api/law/chain` 통해 호출 가능
- [ ] 법제처 API 파라미터 `ancYd/efYd/sort` 활용한 검색 동작
- [ ] UI: 판례 아코디언, 참조조문 모달, 하이라이트 3종 모두 `/law` 화면에서 시각 확인
- [ ] 기존 `.legal-cache` 유지 + v2 캐시 신규 생성 모두 확인
- [ ] 모든 신규 모듈 단위 테스트 통과
- [ ] E2E 테스트(`scripts/e2e-law-research.mjs` 확장) 통과
- [ ] `npm run lint` · `npm run build` · `npm test` 통과
- [ ] CLAUDE.md `## 법령 리서치 (/law)` 섹션 갱신

### 4.2 Quality Criteria

- [ ] 신규 코드 테스트 커버리지 ≥ 90%
- [ ] Zero ESLint errors, zero TypeScript errors
- [ ] 번들 크기 증가 ≤ 50KB (@tanstack/react-virtual 제외)
- [ ] Lighthouse 접근성 점수 ≥ 95 (판례 아코디언 포함 페이지)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 법제처 Open API XML·JSON 스키마 변동으로 구조화 파서 실패 | High | Medium | (1) raw response도 `original` 필드로 항상 유지 (2) 파서 실패 시 기존 문자열 반환 폴백 (3) 계약 테스트(contract test)로 회귀 감지 |
| 캐시 포맷 병행으로 디스크 사용량 2배 증가 | Medium | High | (1) `.legal-cache/` TTL 7일 유지로 자연 정리 (2) v2 캐시 크기 모니터링 (3) 장기 안정화 후 v1 일괄 정리 정책 문서화 |
| Query Router 정규식 오매칭 — 사용자가 원치 않는 도구로 이동 | Medium | Medium | (1) 라우팅 결과를 토스트로 즉시 고지 + "라우팅 해제" 토글(FR-15) (2) 패턴별 테스트 케이스 ≥ 3건 필수 |
| 체인 시나리오 8종 중 일부(customs·fta)가 법제처 API만으로는 데이터 부족 | Medium | High | (1) 시나리오별 `NOT_APPLICABLE` 마커 반환 (2) 원본 korean-law-mcp 구현을 참고하여 보조 API(관세청) 필요 시 Out-of-Scope 문서화 |
| UI 가상 스크롤 도입으로 접근성·SEO 퇴행 | Low | Low | (1) 검색 결과 ≤ 50개인 일반 케이스는 비가상 스크롤 유지 (2) `role="list"` 및 aria 속성 보장 |
| 판례 아코디언 6개 구간이 비어있을 때 빈 섹션 노출로 혼란 | Low | Medium | 빈 구간은 렌더링 생략 + "데이터 없음" 플레이스홀더 대신 토글 자체를 숨김 |
| `densifyLawRefs` 등 기존 포맷팅 유틸 호출부 다수 변경 필요 | Medium | Medium | 기존 유틸 유지 + 신규 `parseLawRefs()` 병행. UI에서 점진 마이그레이션 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/korean-law/client.ts` | Library | `getDecisionText`/`getLawText`/`searchLaw` 리턴 타입 확장 (기존 필드 유지+신규 구조화 필드 추가) |
| `lib/korean-law/types.ts` | Type | `DecisionDetail`, `LawArticle`, `LawRef`, `PrecedentRef` 타입 정의 추가 |
| `lib/korean-law/chains.ts` | Library | 시나리오 5종 등록 + 기존 3종 유지. 체인 오케스트레이터 시그니처 변경 없음 |
| `lib/korean-law/parsers/` | New Dir | `decision-parser.ts`, `article-parser.ts`, `ref-parser.ts`, `circled-number.ts` 신규 |
| `lib/korean-law/query-router.ts` | New File | 정규식 패턴 매칭 라우터 |
| `lib/korean-law/scenarios/` | Dir | customs.ts, manual.ts, delegation.ts, compliance.ts, fta.ts 신규 |
| `app/api/law/*/route.ts` | API | 구조화 응답 반환으로 JSON 스키마 확장 (하위호환) |
| `app/api/law/route-router/route.ts` | New API | Query Router 엔드포인트 (UI → POST 받아 라우팅 결정 반환) |
| `app/law/_components/*.tsx` | UI | 판례 탭 아코디언화, 참조조문 모달, 하이라이트, 가상 스크롤 |
| `.legal-cache/*_v2.json` | Cache | 신규 포맷 캐시 파일 (기존 파일 유지) |
| `__tests__/korean-law/parsers.test.ts` | Test | 구조화 파서 단위 테스트 |
| `__tests__/korean-law/query-router.test.ts` | Test | 라우터 패턴 테스트 |
| `scripts/e2e-law-research.mjs` | Test | 체인 8종·구조화 응답 E2E 확장 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `getDecisionText` | READ | `app/api/law/decision-text/route.ts` | **Needs verification** — 추가 필드는 optional이므로 기존 응답 형태 유지 (하위호환) |
| `getDecisionText` | READ | `app/law/_components/DecisionDetail.tsx` | Breaking (의도된) — 신규 필드 활용하도록 UI 리팩토링 필요 |
| `searchLaw` / `searchLawMany` | READ | `app/api/law/search-law/route.ts`, `lib/legal-verification/korean-law-client.ts` | None — 신규 파라미터는 optional |
| `getLawText` | READ | `app/api/law/law-text/route.ts`, 추후 참조조문 모달 | None — 기존 플랫 응답 유지 + 트리 필드 추가 |
| `runChain` | READ | `app/api/law/chain/route.ts` | None — 신규 시나리오는 등록만 추가 |
| `.legal-cache/*` | READ/WRITE | `lib/korean-law/client.ts` readCache/writeCache | None — v1 파일 계속 유지, v2는 별도 |
| `densifyLawRefs` | TRANSFORM | `lib/korean-law/compact.ts` | None — 기존 유틸 유지, 신규 `parseLawRefs` 추가 |

### 6.3 Verification

- [ ] 모든 API Route 하위호환 확인 (기존 필드 유지, 신규 필드는 optional)
- [ ] `lib/legal-verification/korean-law-client.ts` 연동 정상 (verify-citations 기능)
- [ ] 기존 캐시 파일 삭제 없이 계속 히트
- [ ] 기존 테스트(`__tests__/korean-law/**`, `__tests__/lib/**`) 무수정 통과

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| Starter | 단일 폴더 구조 | 정적 사이트 | ☐ |
| **Dynamic** | feature 기반 + Supabase + Route Handler | 본 프로젝트 (KoreanTaxCalc 기존 구조) | ☑ |
| Enterprise | DI·마이크로서비스 | 대규모 시스템 | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Parser Strategy | 정규식 / XML parser / Zod runtime validation | **정규식 + Zod** | 법제처 응답이 XML·JSON 혼재하고 스키마가 비공식 → 정규식으로 유연 처리 + Zod로 출력 타입 보증 |
| Router Approach | 규칙(정규식) / LLM / 하이브리드 | **규칙 기반** | 외부 LLM 비의존 원칙 + 지연·비용 없음 + 테스트 용이 |
| Accordion UI | shadcn/ui Accordion / 자체 구현 / Radix 직접 | **shadcn/ui Accordion** | 프로젝트 기존 컴포넌트 정책(`components/ui/*`)과 일치, 접근성 기본 제공 |
| Cache Format Migration | 즉시 교체 / 병행(v2 suffix) / 마이그레이션 스크립트 | **병행(v2 suffix)** | 롤백 용이, 기존 7일 TTL 자연 만료로 디스크 점유 제어 |
| Ref Link Behavior | 클릭 시 모달 / 새 탭 이동 / 현재 탭 이동 | **모달** | 리서치 맥락 유지 (현재 판례를 보면서 참조 조문 확인) |
| Virtual Scroll | react-window / @tanstack/react-virtual / 미도입 | **@tanstack/react-virtual** | React 19 호환 검증·프로젝트 기술 스택(tanstack 계열)과 일관 |
| Scenario Count | 3(현재) / 8(원본) / 5(세법 특화) | **8(원본 전체)** | 사용자 결정 — 일반 법령 리서치 완성도 확보 |
| Testing Framework | vitest(기존) | **vitest** | 기존 테스트 프레임워크 유지 |

### 7.3 Clean Architecture Approach

```
Dynamic 레벨 유지 + 2-레이어 원칙 준수

lib/korean-law/
├── client.ts                 # Orchestrator (API 호출 + 캐시 + 파서 조합)
├── parsers/                  # Pure functions (테스트 용이)
│   ├── decision-parser.ts    # 판례 본문 → 6개 구간
│   ├── article-parser.ts     # 조문 → 항·호·목 트리
│   ├── ref-parser.ts         # 참조조문/판례 문자열 → 구조화 배열
│   └── circled-number.ts     # 원숫자 파싱 유틸
├── query-router.ts           # 정규식 패턴 → 도구 선택 (Pure)
├── scenarios/                # 체인 시나리오 (기존 3 + 신규 5)
│   ├── penalty.ts (기존)
│   ├── timeline.ts (기존)
│   ├── impact.ts (기존)
│   ├── customs.ts (신규)
│   ├── manual.ts (신규)
│   ├── delegation.ts (신규)
│   ├── compliance.ts (신규)
│   └── fta.ts (신규)
├── chains.ts                 # 시나리오 조합 오케스트레이터
├── aliases.ts (기존)
├── compact.ts (기존, 유지)
├── search-normalizer.ts      # 관련도 점수 개선
└── types.ts                  # 신규 타입 추가

app/api/law/
├── search-law/route.ts       # ancYd/efYd/sort 파라미터 확장
├── decision-text/route.ts    # 구조화 응답 반환
├── law-text/route.ts         # 트리 응답 반환
├── chain/route.ts            # 8종 시나리오
├── route-router/route.ts     # 신규 Query Router 엔드포인트
└── ...

app/law/_components/
├── DecisionDetail.tsx        # 아코디언화
├── RefLawChip.tsx            # 신규 — 참조조문 칩 + 모달 트리거
├── ArticleModal.tsx          # 신규 — get_law_text 자동 로드 모달
├── HighlightedText.tsx       # 신규 — 쿼리 하이라이트
└── VirtualizedList.tsx       # 신규 — 가상 스크롤 래퍼
```

---

## 8. Implementation Phases

> Design 단계에서 Session Guide로 세분화 예정. Plan에서는 Phase별 목표·주요 산출물만 정리.

### 8.1 Phase A — 구조화 파싱 + UI 아코디언 (즉효, 2-3일 추정)

**목표**: 응답 품질 격차의 본질인 "비구조화"를 해소하고 즉시 체감 가능한 UI 개선 동반.

**주요 작업**:
1. `lib/korean-law/parsers/*` 4종 신규 작성 + 단위 테스트
2. `types.ts`에 `DecisionDetail`, `LawArticle`, `LawRef`, `PrecedentRef` 추가
3. `client.ts`의 `getDecisionText`/`getLawText` 리턴 타입 확장 (기존 필드 유지 + optional 신규 필드)
4. `app/api/law/decision-text/route.ts`, `law-text/route.ts` 구조화 응답 반환
5. `/law` 판례 탭 아코디언 리팩토링 (shadcn/ui Accordion)
6. 참조조문 칩 + 모달(ArticleModal) 구현
7. 검색 매치 하이라이트(HighlightedText) 도입
8. 캐시 포맷 v2 suffix 도입 (`readCache`/`writeCache` 확장)

**Exit Criteria**: 판례 본문 구간 6개 아코디언 동작, refLaws 칩 클릭 시 조문 모달 로드.

### 8.2 Phase B — 시나리오 8종 + API 파라미터 풀활용 (3-4일 추정)

**목표**: 실무 커버리지 확대 및 검색 정확도 향상.

**주요 작업**:
1. `lib/korean-law/scenarios/` 5종 신규 작성 (customs/manual/delegation/compliance/fta)
2. `chains.ts`에 등록 + 기존 8개 체인 오케스트레이터와 연결
3. `doLawNameSearch`, `searchDecisions` 시그니처에 `ancYd`, `efYd`, `sort`, `target` 추가
4. `search-normalizer.ts` 관련도 점수 체계 개선 (`TAX_CORE_LAWS` 가중치 상향 + 길이 비례)
5. 검색 결과 가상 스크롤(@tanstack/react-virtual) 도입 (결과 > 50개 시)
6. 시나리오 통합 테스트 8종 작성

**Exit Criteria**: `/api/law/chain`으로 8종 시나리오 호출 가능, 공포일·시행일 필터 UI 노출.

### 8.3 Phase C — Query Router (2-3일 추정)

**목표**: 자연어 질의 → 적합 도구·파라미터 자동 라우팅으로 UX 마무리.

**주요 작업**:
1. `lib/korean-law/query-router.ts` — 정규식 패턴 ≥ 10종 구현
   - `"{법령명} 제{N}조"` → get_law_text
   - `"개정|연혁|신구대조"` → chain_amendment_track
   - `"과태료|벌칙|감경"` → chain_action_basis + penalty scenario
   - `"판례|판결|선고"` → search_decisions
   - `"별표|서식"` → get_annexes
   - `"위임|하위법령"` → chain_full_research + delegation
   - `"조례|지방"` → chain_ordinance_compare + compliance
   - `"관세|FTA"` → chain_full_research + customs/fta
   - `"시행일|효력|개정일"` → sort + efYd 필터
   - `"{법령명}만"` (법령명 단독) → search_law
2. `app/api/law/route-router/route.ts` 신규 엔드포인트 — POST body `{query}` 받아 `{tool, params, reason}` 반환
3. `/law` 상단에 통합 검색창 추가 — 입력 시 라우터 호출 → 해당 탭 자동 전환 + 토스트로 "라우팅 사유" 고지
4. "라우팅 해제" 토글 (FR-15)
5. 단위 테스트(≥ 20 패턴 케이스) + E2E 테스트

**Exit Criteria**: 통합 검색창에서 10종 이상의 자연어 패턴이 정확한 도구로 라우팅됨.

---

## 9. Convention Prerequisites

### 9.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 컨벤션 보유 (법령 조문 상수·2-레이어·정수 연산 등)
- [x] TypeScript strict mode
- [x] ESLint 설정
- [x] shadcn/ui 기반 UI 컴포넌트 정책
- [x] vitest 테스트 프레임워크

### 9.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 파서 네이밍 | 미정 | `parse<도메인>(raw): ParsedX` 패턴 통일 | High |
| 시나리오 네이밍 | `penalty/timeline/impact` 존재 | 신규 5종도 파일명=시나리오키=export 함수명 일관 | High |
| Query Router 패턴 우선순위 | 미정 | 패턴 객체에 `priority: number` 필드 + 높은 숫자 우선 | High |
| 캐시 키 suffix | 미정 | v2 포맷: `<기존키>_v2` 단일 서픽스만 사용 | Medium |
| Error handling | `LawApiError` 존재 | 파서 실패 시 `LawParseError(original: string)` 신규 도입 | Medium |

### 9.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `KOREAN_LAW_OC` | 법제처 Open API 인증키 (기존) | Server | ☑ (이미 존재) |

신규 환경변수 없음.

---

## 10. Next Steps

1. [ ] **이 Plan 최종 승인**: 사용자 리뷰
2. [ ] `/pdca design law-research-v2` — Design 문서 3종 아키텍처 옵션 제시 후 선택 (Plan Architecture Decisions는 이미 확정됨 → Design에서는 세부 모듈 분할·API 계약·데이터 흐름도에 집중)
3. [ ] `/pdca do law-research-v2 --scope phase-a` → Phase A 구현
4. [ ] Phase A 완료 후 Check → Phase B 진행
5. [ ] Phase B 완료 후 Check → Phase C 진행
6. [ ] 최종 Check ≥ 90% → QA → Report

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-18 | 초기 드래프트 — Explore 에이전트 병렬 Gap 분석 기반 + 사용자 의사결정 4회 반영 (Phase A+B+C, 규칙 기반 라우터, 시나리오 8종, 캐시 v2 병행, 판례 아코디언, 참조조문 모달 자동 로드) | kwonohjik |
