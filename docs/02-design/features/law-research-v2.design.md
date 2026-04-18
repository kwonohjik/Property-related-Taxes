# law-research-v2 Design Document

> **Summary**: `lib/korean-law/` 전면 레이어화(core/parsers/router/scenarios/presenters)를 통한 Clean Architecture 기반 법령 리서치 고도화 설계
>
> **Project**: korean-tax-calc
> **Version**: 0.1.0
> **Author**: kwonohjik

> **Date**: 2026-04-18
> **Status**: Draft
> **Planning Doc**: [law-research-v2.plan.md](../../01-plan/features/law-research-v2.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | Schema Definition | N/A (법제처 API 스키마는 외부 정의) |
| Phase 2 | Coding Conventions | ✅ CLAUDE.md `## Architecture — 2-Layer Tax Engine` 준수 |
| Phase 3 | Mockup | N/A (기존 `/law` UI 확장) |
| Phase 4 | API Spec | ✅ 본 문서 §4 참조 |

---

## Context Anchor

> Plan 문서에서 복사. Design→Do 전환 시 전략 맥락 유지 목적.

| Key | Value |
|-----|-------|
| **WHY** | 자체 `/law` 출력이 외부 MCP 원본 대비 낮음 — 참조조문 비구조화로 LLM 환각·재파싱 부담 |
| **WHO** | 일반 납세자 + 세무 실무자 |
| **RISK** | 법제처 스키마 변동 · 캐시 2배 증가 · 라우터 오매칭 · Option B 리팩토링 파급 |
| **SUCCESS** | 판례 6구간 분리 / refLaws 배열화 / 시나리오 8종 / 라우터 10+패턴 / 테스트 100% |
| **SCOPE** | Phase A(구조화+UI) → B(시나리오+API) → C(Router) |

---

## 1. Overview

### 1.1 Design Goals

1. **레이어 분리**: Presentation → Application → Domain ← Infrastructure 의존 방향 준수
2. **순수 함수 극대화**: parsers/router/scenarios를 외부 I/O 없는 순수 함수로 작성 → 테스트 용이
3. **하위 호환성**: 기존 `/api/law/*` 엔드포인트와 외부 소비자(`lib/legal-verification/*`)는 무중단
4. **점진 마이그레이션**: Phase A→B→C 순차 진행이 가능하도록 인터페이스 먼저 고정, 구현은 단계적
5. **LLM 환각 방지**: `NOT_FOUND` 마커·구조화 응답·참조조문 배열화로 재파싱 부담 제거

### 1.2 Design Principles

- **Single Responsibility**: 파일 하나가 하나의 책임만 가짐 (예: `decision-parser.ts`는 판례 본문 파싱만)
- **Dependency Inversion**: Application(chains)은 Infrastructure(api-client)에 직접 의존하지 않고 Domain 인터페이스를 통해 주입받음
- **Open/Closed**: 시나리오 추가 시 기존 코드 무수정 (시나리오 레지스트리 패턴)
- **Fail Loud for LLM**: 조회 실패 시 조용한 skip 대신 `[NOT_FOUND]` 마커 명시
- **Pure Engine 우선**: tax-engine과 동일하게 순수 함수로 작성 → 테스트 시 mock 최소화

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| Approach | client.ts 내부 직접 추가 | 전면 레이어화 | 신규 모듈만 분리 |
| New Files | ~8 | ~25 | ~15 |
| Modified Files | 5 | 15+ | 8 |
| Complexity | Low | High | Medium |
| Maintainability | Medium | **High** | High |
| Effort | 5-6일 | **9-11일** | 7-8일 |
| Risk | Low (결합 有) | Low (레이어 분리) | Low (균형) |

**Selected**: **Option B — Clean Architecture**
**Rationale**: 사용자 결정 — 법령 리서치는 판례·법령·체인·라우팅 등 다양한 관심사가 얽혀 있어 장기적으로 레이어 분리가 유지보수성·테스트성에 핵심 이득. tax-engine이 이미 2-레이어로 분리된 프로젝트 패턴과 일관된 확장.

---

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                               │
│                                                                          │
│  app/law/page.tsx                                                        │
│    ├─ app/law/_components/UnifiedSearchBar.tsx   (신규 — 라우팅 검색창)    │
│    ├─ app/law/_components/LawSearchTab.tsx                                │
│    ├─ app/law/_components/DecisionTab.tsx                                 │
│    │    └─ DecisionAccordion.tsx  (신규 — 6구간 아코디언)                  │
│    │         └─ RefLawChip.tsx    (신규 — 참조조문 칩)                     │
│    │              └─ ArticleModal.tsx  (신규 — 조문 자동 로드 모달)         │
│    ├─ app/law/_components/AnnexTab.tsx                                    │
│    ├─ app/law/_components/ChainTab.tsx   (8종 시나리오 선택)                │
│    ├─ app/law/_components/VerifyCitationsTab.tsx                          │
│    ├─ app/law/_components/HighlightedText.tsx  (신규)                      │
│    └─ app/law/_components/VirtualizedResultList.tsx  (신규)                │
│                                                                          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ fetch
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER                               │
│                                                                          │
│  app/api/law/                                                            │
│    ├─ search-law/route.ts       (ancYd/efYd/sort 파라미터 확장)           │
│    ├─ law-text/route.ts          (트리 응답 반환)                          │
│    ├─ search-decisions/route.ts                                           │
│    ├─ decision-text/route.ts     (6구간 구조화 응답)                        │
│    ├─ annexes/route.ts                                                    │
│    ├─ chain/route.ts             (8종 시나리오 라우팅)                      │
│    ├─ route-router/route.ts      (신규 — Query Router 엔드포인트)           │
│    ├─ verify-citations/route.ts                                           │
│    └─ _helpers.ts                (공통 rate-limit·에러 매핑)               │
│                                                                          │
│  lib/korean-law/application/                                             │
│    ├─ chains.ts                  (시나리오 오케스트레이터, 8종 등록)         │
│    ├─ services/                                                          │
│    │    ├─ decision-service.ts   (getDecisionText orchestration)          │
│    │    ├─ law-service.ts        (getLawText orchestration)               │
│    │    └─ search-service.ts     (searchLaw orchestration)                │
│    └─ index.ts                   (public API facade)                     │
│                                                                          │
└──────────┬──────────────────────┬──────────────────────┬─────────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│   DOMAIN LAYER       │ │   DOMAIN LAYER       │ │ INFRASTRUCTURE LAYER │
│   (Pure Functions)   │ │   (Pure Functions)   │ │  (I/O + External)    │
│                      │ │                      │ │                      │
│ lib/korean-law/      │ │ lib/korean-law/      │ │ lib/korean-law/      │
│ parsers/             │ │ router/              │ │ core/                │
│  ├decision-parser.ts │ │  ├query-router.ts    │ │  ├api-client.ts      │
│  ├article-parser.ts  │ │  ├patterns.ts        │ │  ├fetch-with-retry.ts│
│  ├ref-parser.ts      │ │  └extractors.ts      │ │  └http-types.ts      │
│  └circled-number.ts  │ │                      │ │                      │
│                      │ │ lib/korean-law/      │ │ lib/korean-law/      │
│ lib/korean-law/      │ │ scenarios/           │ │ cache/               │
│ normalize/           │ │  (기존 3 + 신규 5)    │ │  ├file-cache.ts      │
│  ├aliases.ts          │ │  ├penalty.ts         │ │  ├cache-key.ts      │
│  ├search-normalizer.ts│ │  ├timeline.ts        │ │  └cache-versions.ts │
│  ├tax-expander.ts    │ │  ├impact.ts          │ │     (v1/v2 병행)     │
│  └relevance-score.ts │ │  ├customs.ts   (신규) │ │                      │
│                      │ │  ├manual.ts    (신규) │ │ lib/korean-law/      │
│ lib/korean-law/      │ │  ├delegation.ts(신규) │ │ presenters/          │
│ types/               │ │  ├compliance.ts(신규) │ │  ├decision-         │
│  ├api-types.ts       │ │  ├fta.ts       (신규) │ │   presenter.ts       │
│  ├domain-types.ts    │ │  └registry.ts        │ │  └highlight-         │
│  ├error-types.ts     │ │   (동적 시나리오 등록) │ │   presenter.ts       │
│  └zod-schemas.ts     │ │                      │ │                      │
│                      │ │ lib/korean-law/      │ │                      │
│ lib/korean-law/      │ │ compact/             │ │                      │
│ verify/              │ │  ├densify-law-refs.ts│ │                      │
│  └citation-          │ │  ├densify-         │ │                      │
│   verifier.ts        │ │   precedent-refs.ts  │ │                      │
│                      │ │  └compact-body.ts    │ │                      │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                   │
│   법제처 Open API (lawSearch.do, lawService.do, prec, …)                  │
│   .legal-cache/ 파일 시스템 (v1 json + v2 json)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

#### 케이스 1: 판례 본문 조회 (구조화 응답)

```
User clicks precedent id
   ↓
[Presentation] DecisionTab.tsx → fetch POST /api/law/decision-text
   ↓
[Application] decision-text/route.ts
   ├─ Zod 입력 검증
   ├─ rate-limit
   └─ DecisionService.getDecisionText(id, domain)
         ↓
         [Application] services/decision-service.ts
            ├─ [Infrastructure] cache/file-cache.ts  — 캐시 조회 (v2 우선, v1 폴백)
            │    └─ cache hit? 반환
            ├─ [Infrastructure] core/api-client.ts
            │    └─ fetchJson("lawService.do", params)  ← 법제처 API 호출
            └─ [Domain] parsers/decision-parser.ts
                 ├─ cleanHtml(raw)
                 ├─ parseCaseSections(raw) → {holdings, summary, ruling, reasoning}
                 ├─ parseLawRefs(refLawsRaw) → LawRef[]   ← 구조화 배열
                 └─ parsePrecedentRefs(refPrecRaw) → PrecedentRef[]
         ↓
         Zod로 출력 검증 (DecisionDetailSchema)
         ↓
         [Infrastructure] cache/file-cache.ts  — v2 포맷으로 저장
         ↓
   반환: DecisionDetail 구조화 객체
   ↓
[Presentation] DecisionAccordion이 6구간 렌더, RefLawChip[] 배치
```

#### 케이스 2: Query Router 라우팅

```
User types "민법 제750조 불법행위"
   ↓
[Presentation] UnifiedSearchBar.tsx → fetch POST /api/law/route-router
   ↓
[Application] route-router/route.ts
   └─ [Domain] router/query-router.ts
         ├─ normalizeQuery(input)  ← search-normalizer 호출
         ├─ matchPatterns(normalized)  ← 10+ 정규식 패턴 순회
         │    └─ 최우선 매칭: "specific_article"
         │         ├─ extractLawName() = "민법"
         │         └─ extractArticleNumber() = "750"
         └─ 반환: {tool: "get_law_text", params: {query: "민법", jo: 750}, reason: "..."}
   ↓
[Presentation] UnifiedSearchBar가 응답 받아:
   - 토스트에 reason 노출
   - LawSearchTab으로 자동 전환
   - 파라미터 프리필 후 조회 트리거
```

#### 케이스 3: 체인 시나리오 실행 (customs 예시)

```
User selects "관세 FTA 리서치" chain with query "FTA 관세율"
   ↓
[Application] chain/route.ts
   └─ chains.runChain({type: "customs", query, rawText?})
         ↓
         [Application] chains.ts
            ├─ Step 1: searchLaw("관세법") — 관세3법 병렬 조회
            ├─ Step 2: scenarios/customs.ts 실행
            │    └─ Promise.all([
            │         searchAdminRules("관세 FTA"),
            │         searchOrdinances("관세"),
            │         searchDecisions("관세 FTA", domain="tax_tribunal")
            │       ])
            ├─ 각 결과에 secOrSkip() 적용 → [NOT_FOUND] 마커 부착 또는 섹션 병합
            └─ 반환: {sections: [{title, text, status}], raw: {...}}
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Presentation components | `fetch('/api/law/*')` | API 호출 (직접 Infrastructure 접근 금지) |
| API routes (`app/api/law/*`) | `lib/korean-law/application/*` | 비즈니스 로직 위임 |
| `application/services/*` | `domain/parsers/*`, `domain/router/*`, `domain/types/*`, `infrastructure/core/*`, `infrastructure/cache/*` | 오케스트레이션 |
| `application/chains.ts` | `domain/scenarios/*`, `application/services/*` | 시나리오 조합 |
| `domain/parsers/*` | `domain/types/*` only | 순수 변환 (외부 의존 금지) |
| `domain/router/*` | `domain/normalize/*`, `domain/types/*` | 순수 패턴 매칭 |
| `domain/scenarios/*` | `domain/types/*`, `application/services/*` (DI) | 체인 로직 |
| `infrastructure/core/*` | `fetch`, `domain/types/error-types.ts` | 법제처 API 실제 호출 |
| `infrastructure/cache/*` | `node:fs`, `domain/types/*` | 파일 시스템 캐시 |
| `lib/legal-verification/korean-law-client.ts` | `lib/korean-law/application/index.ts` (facade) | 하위호환 |

**의존 규칙**:
- Presentation은 Application만 (Infrastructure 직접 접근 금지)
- Domain은 외부 의존 없음 (Zod는 허용 — 타입 런타임 검증 목적)
- Infrastructure는 Domain 타입만 import (역방향 금지)

---

## 3. Data Model

### 3.1 핵심 도메인 타입

```typescript
// lib/korean-law/domain/types/domain-types.ts

// — 판례 본문 6구간 구조화 —
export interface DecisionDetail {
  id: string;
  domain: DecisionDomain;
  title: string;
  court?: string;
  caseType?: string;           // 민사/형사/세무/행정 등
  judgmentType?: string;       // 판결/결정/명령
  caseNo?: string;             // 사건번호
  date?: string;
  sections: DecisionSections;  // 6구간 구조화
  refLaws: LawRef[];           // 배열화
  refPrecedents: PrecedentRef[];
  sourceUrl?: string;
  original?: {                 // 파서 실패 폴백용 raw
    reasoning?: string;
    refLaws?: string;
    refPrecedents?: string;
  };
}

export interface DecisionSections {
  holdings?: string;    // 판시사항
  summary?: string;     // 판결요지
  ruling?: string;      // 주문
  reasoning?: string;   // 이유 (compactBody 적용된 상태)
  dissent?: string;     // 소수의견 (있는 경우만)
  full?: string;        // full=true 요청 시 전문
}

// — 참조조문 구조화 —
export interface LawRef {
  raw: string;                 // 원본 텍스트 "구 소득세법 제94조 제1항 제1호"
  lawName: string;             // "소득세법" (구/신 prefix 제거 + 정식명)
  isPrior: boolean;            // "구" 여부
  articleNo?: number;          // 94
  articleSubNo?: number;       // 제94조의2의 "2"
  hangNo?: number;             // 1
  hoNo?: number;               // 1
  mokNo?: string;              // "가", "나" 등
}

// — 참조판례 구조화 —
export interface PrecedentRef {
  raw: string;
  court: string;               // "대법원", "서울고등법원" 등
  date: string;                // "2020.3.26"
  caseNo: string;              // "2018두56077"
  judgmentType?: string;       // "판결", "결정"
}

// — 조문 트리 구조화 —
export interface LawArticle {
  articleNo: number;
  articleSubNo?: number;       // 제N조의M
  title: string;
  hang: LawHang[];
  effectiveDate?: string;
  amendmentHistory?: string[]; // 개정이력 요약
}

export interface LawHang {
  hangNo: number;              // ① → 1 (원숫자 파싱됨)
  content: string;
  ho?: LawHo[];
}

export interface LawHo {
  hoNo: number;
  content: string;
  mok?: LawMok[];
}

export interface LawMok {
  mokKey: string;              // "가", "나", "다"
  content: string;
}

// — Query Router 라우팅 결과 —
export interface RouteResult {
  tool: RouterTool;
  params: Record<string, unknown>;
  reason: string;
  patternName: string;
  priority: number;
  confidence: "high" | "medium" | "low";
}

export type RouterTool =
  | "search_law"
  | "get_law_text"
  | "search_decisions"
  | "get_decision_text"
  | "get_annexes"
  | "chain_full_research"
  | "chain_amendment_track"
  | "chain_action_basis"
  | "chain_ordinance_compare"
  | "verify_citations";

// — 체인 시나리오 결과 —
export interface ChainSection {
  title: string;
  text: string;
  status: "ok" | "not_found" | "failed";
  errorDetail?: string;        // [NOT_FOUND] 마커 구현용
}

export interface ChainResult {
  type: ChainType;
  sections: ChainSection[];
  raw?: Record<string, unknown>;
}

export type ChainType =
  | "full_research"
  | "amendment_track"
  | "action_basis"
  | "ordinance_compare"
  | "document_review"
  | "dispute_prep"
  | "law_system"
  | "procedure_detail";
```

### 3.2 타입 간 관계

```
DecisionDetail
 ├── DecisionSections (6구간)
 ├── LawRef[]          ┐
 │    └── articleNo    ├─ ArticleModal에서 get_law_text 호출 시 사용
 │    └── hangNo       │
 └── PrecedentRef[]    ┘

LawArticle
 └── LawHang[]
      └── LawHo[]
           └── LawMok[]
```

### 3.3 Zod 스키마 (런타임 검증)

```typescript
// lib/korean-law/domain/types/zod-schemas.ts
import { z } from "zod";

export const LawRefSchema = z.object({
  raw: z.string(),
  lawName: z.string(),
  isPrior: z.boolean(),
  articleNo: z.number().int().positive().optional(),
  articleSubNo: z.number().int().positive().optional(),
  hangNo: z.number().int().positive().optional(),
  hoNo: z.number().int().positive().optional(),
  mokNo: z.string().optional(),
});

export const DecisionDetailSchema = z.object({
  id: z.string(),
  domain: DecisionDomainSchema,
  title: z.string(),
  // ... (상단 타입과 1:1 매핑)
});
```

→ `application/services/decision-service.ts`의 반환 직전 `DecisionDetailSchema.parse()`로 출력 검증.

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth | 변경 사항 |
|--------|------|-------------|------|----------|
| GET/POST | `/api/law/search-law` | 법령 검색 | ❌ | `ancYd`, `efYd`, `sort`, `target` 파라미터 추가 (optional) |
| POST | `/api/law/law-text` | 조문 조회 | ❌ | 응답에 `tree: LawArticle` 추가 (optional, 하위호환) |
| POST | `/api/law/search-decisions` | 판례/결정례 검색 | ❌ | 기존 유지 + `ancYd/efYd` 추가 |
| POST | `/api/law/decision-text` | 판례 본문 | ❌ | **Breaking(의도)**: 응답에 `sections`, `refLaws[]`, `refPrecedents[]` 추가 (기존 문자열 필드도 유지) |
| POST | `/api/law/annexes` | 별표·서식 | ❌ | 기존 유지 |
| POST | `/api/law/chain` | 체인 리서치 | ❌ | 지원 타입 3종 → **8종 확장** |
| POST | `/api/law/route-router` | **신규**: 자연어 쿼리 라우팅 | ❌ | Query Router 결과 반환 |
| POST | `/api/law/verify-citations` | 인용 환각 검증 | ❌ | 기존 유지 + 정확도 개선 |

### 4.2 Detailed Specification

#### `POST /api/law/decision-text` (구조화 확장)

**Request:**
```json
{
  "id": "616011",
  "domain": "precedent",
  "full": false
}
```

**Response (200 OK, v2 포맷):**
```json
{
  "id": "616011",
  "domain": "precedent",
  "title": "양도소득세부과처분취소",
  "court": "대법원",
  "caseType": "세무",
  "judgmentType": "판결",
  "caseNo": "2018두56077",
  "date": "2020-03-26",
  "sections": {
    "holdings": "…",
    "summary": "…",
    "ruling": "…",
    "reasoning": "⋯ 중략 1,980자 …"
  },
  "refLaws": [
    {
      "raw": "구 소득세법 제94조 제1항 제1호",
      "lawName": "소득세법",
      "isPrior": true,
      "articleNo": 94,
      "hangNo": 1,
      "hoNo": 1
    },
    {
      "raw": "제95조 제1항",
      "lawName": "소득세법",
      "isPrior": false,
      "articleNo": 95,
      "hangNo": 1
    }
  ],
  "refPrecedents": [
    {
      "raw": "대법원 2020.3.26. 2018두56077",
      "court": "대법원",
      "date": "2020-03-26",
      "caseNo": "2018두56077"
    }
  ],
  "sourceUrl": "https://www.law.go.kr/…",
  "original": {
    "reasoning": "… 원본 이유 …",
    "refLaws": "… 원본 참조조문 문자열 …"
  }
}
```

**하위호환**:
- 기존 `holdings`, `summary`, `reasoning`, `ruling`, `refLaws`(문자열), `refPrecedents`(문자열) 필드도 계속 반환 (기존 UI·legal-verification이 의존).
- 신규 UI는 `sections.*` 및 `refLaws[]` 배열 사용.

**Error Responses:**
- `400`: `error.code = "VALIDATION_ERROR"`, fieldErrors 포함
- `404`: `error.code = "NOT_FOUND"`, `error.detail = "법제처 API에서 본문 미제공 (하급심·국세법령정보시스템 출처 가능)"`
- `429`: rate-limit
- `502`: `error.code = "UPSTREAM"` — 법제처 API 오류 (재시도 3회 후)

#### `POST /api/law/route-router` (신규)

**Request:**
```json
{
  "query": "민법 제750조 불법행위"
}
```

**Response (200 OK):**
```json
{
  "tool": "get_law_text",
  "params": { "query": "민법", "jo": 750 },
  "reason": "법령명 + 조문번호 패턴 매칭 → 해당 조문 직접 조회",
  "patternName": "specific_article",
  "priority": 1,
  "confidence": "high"
}
```

**매칭 실패 시 (confidence=low):**
```json
{
  "tool": "search_law",
  "params": { "query": "민법 제750조 불법행위" },
  "reason": "특정 패턴 미매칭 → 일반 법령 검색으로 폴백",
  "patternName": "fallback_search_law",
  "priority": 999,
  "confidence": "low"
}
```

#### `POST /api/law/chain` (8종 확장)

**Request:**
```json
{
  "type": "customs",
  "query": "FTA 관세율",
  "rawText": "optional context"
}
```

**지원 type 값** (8종):
- `full_research`, `amendment_track`, `action_basis`, `ordinance_compare` (기존 4종)
- `document_review`, `dispute_prep`, `law_system`, `procedure_detail` (기존 일부)
- 시나리오는 별도로 `type=action_basis` + scenario=`penalty|customs|manual|delegation|compliance|fta|timeline|impact` 조합으로도 호출 가능

> 상세 타입은 `lib/korean-law/domain/types/domain-types.ts`의 `ChainType` 유니언 참조.

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header: [로고]   [홈]  [계산기]  [법령 리서치]   [로그인]             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 🔍 통합 검색창 (Query Router)                                  │ │
│  │   [입력창........................................] [검색]       │ │
│  │   💡 예: "민법 제750조", "양도소득세 개정", "관세 FTA"          │ │
│  │   ☐ 라우팅 해제 (탭 수동 선택)                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─────┬─────┬──────┬──────┬──────────┐                            │
│  │ 법령  │ 판례 │ 별표  │ 체인 │ 인용검증  │   ← Tab                  │
│  └─────┴─────┴──────┴──────┴──────────┘                            │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  (선택된 탭 내용)                                               │ │
│  │                                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 User Flow

#### Flow A: Query Router 기반
```
홈 → 법령 리서치 → 통합 검색창 입력 "민법 제750조"
   → [토스트: "법령명+조문번호 패턴 감지 → 조문 조회"]
   → 법령 탭 자동 전환 + 파라미터 프리필
   → 결과 리스트 (하이라이트 적용)
   → 항목 클릭 → 조문 트리 표시 (항·호·목)
```

#### Flow B: 판례 상세 탐색
```
홈 → 법령 리서치 → 판례 탭 → 검색 "양도소득세"
   → 결과 리스트 (가상 스크롤)
   → 판례 클릭 → 아코디언 열림
      ├─ 판시사항 (접힘)
      ├─ 판결요지 (펼침)
      ├─ 주문 (접힘)
      ├─ 이유 (펼침, 축약)
      ├─ 참조조문 (펼침) → [민법 제750조] 칩 클릭
      │                   → 모달: 조문 본문 자동 로드
      └─ 참조판례 (펼침) → [대법원 2020.3.26.] 칩 클릭
                          → 모달: 판례 본문 자동 로드
```

#### Flow C: 체인 리서치
```
홈 → 법령 리서치 → 체인 탭 → 시나리오 선택 (8종 중)
   → 쿼리 입력 "FTA 관세율" → 실행
   → 섹션별 결과 표시
      ├─ ✅ 관세법
      ├─ ⚠ [NOT_FOUND] FTA 조약 세율표 (사유: 법제처 API 미제공)
      └─ ✅ 관세 심판례
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `UnifiedSearchBar` | `app/law/_components/` | 통합 검색창, Query Router 호출, 탭 자동 전환 (신규) |
| `DecisionAccordion` | `app/law/_components/` | 6구간 아코디언 렌더 (신규) |
| `RefLawChip` | `app/law/_components/` | 참조조문 칩 — 클릭 시 ArticleModal 트리거 (신규) |
| `RefPrecedentChip` | `app/law/_components/` | 참조판례 칩 — 클릭 시 판례 본문 모달 (신규) |
| `ArticleModal` | `app/law/_components/` | 조문 자동 로드 모달 (shadcn Dialog) (신규) |
| `PrecedentModal` | `app/law/_components/` | 판례 본문 모달 (신규) |
| `HighlightedText` | `app/law/_components/` | 쿼리 매치 부분에 `<mark>` (신규) |
| `VirtualizedResultList` | `app/law/_components/` | @tanstack/react-virtual 래퍼 (신규) |
| `NotFoundSection` | `app/law/_components/` | `[NOT_FOUND]` 마커 전용 렌더 (신규) |
| `ChainScenarioPicker` | `app/law/_components/` | 8종 시나리오 선택 UI (신규) |
| `LawSearchTab` | `app/law/_components/` | 법령 검색 탭 (수정 — 하이라이트·가상 스크롤 적용) |
| `DecisionTab` | `app/law/_components/` | 판례 탭 (수정 — 아코디언·모달 통합) |
| `AnnexTab` | `app/law/_components/` | 별표 탭 (경미한 수정) |
| `ChainTab` | `app/law/_components/` | 체인 탭 (수정 — 8종 지원) |
| `VerifyCitationsTab` | `app/law/_components/` | 인용 검증 탭 (유지) |

### 5.4 Page UI Checklist

#### `/law` (법령 리서치 메인)

- [ ] 통합 검색창: `<input>` + "검색" 버튼, placeholder 표시, Ctrl+K 포커스
- [ ] 검색창 하단 예시 3개 칩 표시 ("민법 제750조", "양도소득세 개정", "관세 FTA")
- [ ] 라우팅 해제 토글(Switch) — 켜면 탭 수동 선택 유지
- [ ] 라우팅 성공 시 Sonner 토스트로 `reason` 노출
- [ ] 5개 탭(Tabs): 법령, 판례, 별표, 체인, 인용검증
- [ ] 각 탭의 현재 쿼리 표시 badge

#### 법령 탭 (LawSearchTab)

- [ ] 검색창 + 고급 필터 dropdown (공포일 `ancYd` 범위, 시행일 `efYd` 범위, 정렬 `sort`)
- [ ] 검색 결과 리스트 — 결과 수 표시
- [ ] 결과 >= 100건 시 가상 스크롤 활성화 (VirtualizedResultList)
- [ ] 결과 항목: 법령명(쿼리 하이라이트), 공포일자, 시행일자, 상태(시행중/폐지) 배지
- [ ] 결과 항목 클릭 → 조문 트리 모달 (ArticleModal)
- [ ] 조문 트리: 항(①②…), 호(1.2.…), 목(가.나.…) 들여쓰기 렌더
- [ ] 빈 결과 시 "검색어 제안" 칩 3개 표시

#### 판례 탭 (DecisionTab)

- [ ] 검색창 + 도메인 dropdown (17종: 대법원 민사/형사/세무/행정/가사 등 + 헌재 + 해석례 + 행심 + 조세심판)
- [ ] 결과 리스트 (가상 스크롤)
- [ ] 결과 항목: 제목(하이라이트), 법원, 사건번호, 판결일
- [ ] 결과 클릭 → DecisionAccordion 열림
- [ ] 아코디언 6구간: 판시사항 / 판결요지 / 주문 / 이유 / 참조조문 / 참조판례
- [ ] 빈 구간은 렌더 생략 (토글 자체 숨김)
- [ ] `full=true` 요청 토글 — 이유 전문 표시
- [ ] 참조조문 구간: `RefLawChip` 배열 (각 칩: "민법 제750조 ①항 1호" 등)
- [ ] 칩 클릭 → ArticleModal 로드
- [ ] 참조판례 구간: `RefPrecedentChip` 배열
- [ ] 칩 클릭 → PrecedentModal 로드

#### 체인 탭 (ChainTab)

- [ ] ChainScenarioPicker — 8종 시나리오 카드 선택 UI
- [ ] 각 카드: 이름, 설명, 예상 조회 API 수
- [ ] 쿼리 입력 + 선택 사항 입력(rawText)
- [ ] 실행 버튼
- [ ] 결과: 섹션별 카드(status=ok/not_found/failed 구분 색상)
- [ ] `[NOT_FOUND]` 섹션: NotFoundSection 렌더 — "이 섹션은 조회 실패 · LLM은 추측 금지" 안내 포함

#### 별표 탭 (AnnexTab) — 경미한 수정

- [ ] 결과 항목: 별표번호, 제목, 파일타입 배지(hwp/pdf/xlsx), 다운로드 링크
- [ ] 검색 매치 하이라이트 적용

#### 인용 검증 탭 (VerifyCitationsTab) — 유지

- [ ] 텍스트 입력 → 결과: ✓/⚠/✗ 아이콘별 인용 목록
- [ ] ✓ 실존 조문은 RefLawChip 동일 패턴으로 클릭 가능

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | HTTP | Message | Cause | Handling |
|------|:-:|---------|-------|----------|
| `VALIDATION_ERROR` | 400 | "요청 형식이 올바르지 않습니다" | Zod 스키마 위반 | fieldErrors를 UI에 렌더 |
| `NOT_FOUND` | 404 | "법제처 API에서 데이터를 찾을 수 없습니다" | API가 빈 응답 또는 "없음" 메시지 | `[NOT_FOUND]` 마커 섹션 표시, LLM 추측 금지 문구 포함 |
| `PARSE_ERROR` | 200 (부분성공) | "응답 일부 구조화 실패" | 파서 실패 — raw 필드는 반환 | `original.*` 문자열 노출, 구조화 필드 생략 |
| `UPSTREAM` | 502 | "법제처 서버 오류 — 잠시 후 재시도" | API 500/503 또는 timeout | 3회 재시도 후 사용자 안내 토스트 |
| `API_KEY_MISSING` | 500 | "서비스 구성 오류" | `KOREAN_LAW_OC` 미설정 | 관리자 로그, 사용자는 "일시 오류" 안내 |
| `RATE_LIMITED` | 429 | "너무 많은 요청 — 잠시 후 재시도" | IP당 분당 30회 초과 | Retry-After 토스트 |
| `ROUTER_LOW_CONFIDENCE` | 200 | "일반 검색으로 폴백" | Query Router 매칭 실패 | confidence=low + fallback=search_law 반환 |

### 6.2 Error Response Format

```typescript
// lib/korean-law/domain/types/error-types.ts
export interface LawApiErrorResponse {
  error: {
    code: LawApiErrorCode;
    message: string;          // 사용자 친화적
    detail?: string;          // 기술 상세 (개발자용)
    fieldErrors?: Record<string, string[]>;
    retryAfter?: number;      // 429 전용
    originalFallback?: string;// PARSE_ERROR 시 원문
  };
}
```

### 6.3 LLM 환각 방지 패턴 (`[NOT_FOUND]`)

체인 시나리오가 부분 실패할 때 섹션 하나가 실패해도 전체 체인은 계속.
실패 섹션은 다음 포맷으로 마킹:

```
▶ 참조 조문 [NOT_FOUND / FAILED]
   ⚠️ 이 섹션은 조회 실패 — LLM은 내용을 추측·생성하지 마세요.
   사유: 법제처 API가 이 결정의 본문을 JSON으로 제공하지 않습니다.
```

→ UI에서도 `NotFoundSection` 컴포넌트로 시각 구분 (회색 배경 + 경고 아이콘).

---

## 7. Security Considerations

- [x] **Input validation**: Zod 스키마로 모든 `/api/law/*` 입력 검증 (기존 + 신규 `route-router`)
- [x] **XSS 방지**: `HighlightedText`는 사용자 쿼리를 regex-escape 후 `<mark>` 주입. raw HTML 렌더 금지 (shadcn 기본 안전)
- [x] **SSRF 방지**: 법제처 API URL은 상수로 고정, 사용자 입력은 쿼리 파라미터로만 전달
- [x] **Rate limiting**: 기존 `lib/api/rate-limit.ts` 유지 (IP당 분당 30회). `route-router` 도 동일 적용
- [x] **API Key 보호**: `KOREAN_LAW_OC`는 서버 사이드에서만 참조, 응답에 포함 금지
- [x] **Cache path traversal**: `safeCacheKey()`가 영숫자·한글·언더스코어·하이픈만 허용 → 파일 경로 주입 불가
- [x] **HTTPS enforcement**: Next.js 기본 + Vercel 배포 시 자동
- [x] **Sensitive data**: 법령·판례는 공개 정보, 사용자별 데이터 저장 없음

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: API Tests | 8개 `/api/law/*` endpoint — status, 파라미터, 응답 스키마 | vitest + node-fetch | Do |
| L2: UI Action Tests | 각 탭·모달·아코디언·칩·라우팅 동작 | Playwright | Do |
| L3: E2E Scenario Tests | Query Router → 탭 전환 → 판례 상세 → 참조조문 모달 등 풀 플로우 | Playwright | Do |
| Unit: Parsers | decision/article/ref/circled-number 순수 함수 | vitest | Do |
| Unit: Router | 10+ 패턴 · 20+ 쿼리 케이스 | vitest | Do |
| Integration: Scenarios | 8종 시나리오 · 부분 실패 시 `[NOT_FOUND]` 마커 검증 | vitest + MSW (API mock) | Do |

### 8.2 L1: API Test Scenarios

| # | Endpoint | Method | Test Description | Expected | 
|---|----------|--------|-----------------|----------|
| 1 | `/api/law/search-law` | POST | 기본 검색 (기존 호환) | 200, `data.length > 0` |
| 2 | `/api/law/search-law` | POST | `ancYd=20240101,20241231` 필터 | 200, 모든 결과가 2024년 공포 |
| 3 | `/api/law/search-law` | POST | `sort=date_desc` | 200, 공포일 내림차순 |
| 4 | `/api/law/decision-text` | POST | 구조화 응답 확인 | 200, `sections.holdings` 문자열, `refLaws` 배열 |
| 5 | `/api/law/decision-text` | POST | `refLaws[0]`이 `{lawName, articleNo}` 객체 | 200, 스키마 일치 |
| 6 | `/api/law/decision-text` | POST | 본문 미제공 케이스 | 200, `sections` 비어있고 `error.code = NOT_FOUND` 또는 `original.reasoning` 존재 |
| 7 | `/api/law/law-text` | POST | 조문 트리 응답 | 200, `tree.hang[0].hangNo = 1` |
| 8 | `/api/law/chain` | POST | `type=customs` 8종 시나리오 | 200, `sections` 배열 |
| 9 | `/api/law/chain` | POST | 부분 실패 시나리오 | 200, 일부 section `status=not_found` |
| 10 | `/api/law/route-router` | POST | `"민법 제750조"` | 200, `tool=get_law_text, params.jo=750` |
| 11 | `/api/law/route-router` | POST | `"양도소득세 개정"` | 200, `tool=chain_amendment_track` |
| 12 | `/api/law/route-router` | POST | `"일반 질의"` | 200, `confidence=low, tool=search_law` (폴백) |
| 13 | `/api/law/route-router` | POST | 빈 query | 400, VALIDATION_ERROR |
| 14 | Rate limit 검증 | — | 31회/분 | 429, Retry-After 헤더 |
| 15 | `/api/law/verify-citations` | POST | `"형법 제9999조"` | 200, ✗ 표기 + 조문 존재 범위 |

### 8.3 L2: UI Action Test Scenarios

| # | Page | Action | Expected Result |
|---|------|--------|----------------|
| 1 | `/law` | 통합 검색창 입력 "민법 제750조" + 엔터 | 법령 탭 자동 전환, 토스트 "법령명+조문번호 패턴 감지" |
| 2 | `/law` | 라우팅 해제 토글 ON 후 검색 | 탭 자동 전환 없음, 일반 검색 수행 |
| 3 | `/law` (판례 탭) | 판례 클릭 | DecisionAccordion 열림, 6구간 렌더 |
| 4 | `/law` (판례 탭) | RefLawChip "민법 제750조" 클릭 | ArticleModal 열림, 조문 본문 표시 |
| 5 | `/law` (판례 탭) | 빈 구간 확인 | 빈 구간 토글 자체가 숨김 처리 |
| 6 | `/law` (체인 탭) | customs 시나리오 실행 | 섹션별 카드 + 일부 `[NOT_FOUND]` 표시 |
| 7 | `/law` (법령 탭) | 검색 결과 100건 이상 | VirtualizedResultList 활성화, 스크롤 부드러움 |
| 8 | `/law` (법령 탭) | 고급 필터 `ancYd` 입력 | URL 쿼리 파라미터에 반영, 결과 갱신 |
| 9 | `/law` (법령 탭) | 검색 결과 항목에 쿼리 하이라이트 | `<mark>` 적용 부분 시각 확인 |

### 8.4 L3: E2E Scenario Test Scenarios

| # | Scenario | Steps | Success Criteria |
|---|----------|-------|-----------------|
| 1 | 통합 검색 풀 플로우 | `/law` 방문 → 검색 "민법 제750조 불법행위" → 토스트 확인 → 법령 탭 이동 → 첫 결과 클릭 → 조문 트리 확인 | 모든 단계 에러 없이 완료 |
| 2 | 판례 리서치 풀 플로우 | 판례 탭 → 검색 "양도소득세" → 결과 클릭 → 아코디언 확장 → RefLawChip 클릭 → ArticleModal → RefPrecedentChip 클릭 → PrecedentModal | 다중 모달 중첩·닫기 동작, 각 모달에 실제 데이터 로드 |
| 3 | 체인 리서치 | 체인 탭 → fta 시나리오 선택 → 쿼리 "FTA 관세율" → 실행 → 결과 섹션 5개 이상 렌더, 최소 1개는 `[NOT_FOUND]` 마커 |
| 4 | 라우팅 오매칭 복구 | 애매한 쿼리 입력 → 잘못된 탭 전환 감지 → 라우팅 해제 토글 → 일반 검색으로 재시도 | 사용자가 오매칭을 쉽게 되돌림 |
| 5 | 가상 스크롤 성능 | 판례 탭 → 광범위 쿼리 → 결과 200건 이상 → 스크롤 Top↔Bottom 왕복 | 60fps 유지, 항목 중복 렌더 없음 |
| 6 | 인용 검증 | 인용 검증 탭 → `"민법 제750조, 형법 제9999조"` 입력 → 결과: ✓ 민법, ✗ 형법 | 실존 조문/비존재 조문 구분 |

### 8.5 Seed Data Requirements

법령·판례는 법제처 Open API에서 실시간 조회. 테스트용 고정 데이터:

| Entity | Location | Purpose |
|--------|----------|---------|
| Mock 판례 본문 JSON (3건) | `__tests__/fixtures/decisions/*.json` | 파서 단위 테스트용 — 민사·세무·헌재 샘플 |
| Mock 조문 JSON (2건) | `__tests__/fixtures/articles/*.json` | article-parser 테스트 |
| Mock 체인 응답 | `__tests__/fixtures/chains/*.json` | chains 통합 테스트 |
| Router 쿼리 케이스 CSV | `__tests__/fixtures/router/queries.csv` | 20+ 쿼리 × 기대 결과 |

---

## 9. Clean Architecture

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | UI 컴포넌트, 탭, 모달, 아코디언 | `app/law/_components/**`, `app/law/page.tsx` |
| **Application** | API routes, services, chains orchestration | `app/api/law/**/route.ts`, `lib/korean-law/application/**` |
| **Domain** | 타입, 파서, 라우터, 시나리오, 정규화, 인용검증 (순수 함수) | `lib/korean-law/domain/**` |
| **Infrastructure** | 법제처 API 호출, 캐시, Presenter 가공 | `lib/korean-law/infrastructure/**` |

### 9.2 Dependency Rules

```
┌───────────────────────────────────────────────────────────────┐
│                   Dependency Direction                         │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Presentation ──→ Application ──→ Domain ←── Infrastructure   │
│                       │                                       │
│                       └──→ Infrastructure (via DI)            │
│                                                               │
│  Rule:                                                        │
│    1. Presentation은 fetch로 Application만 호출                │
│    2. Application은 Domain과 Infrastructure 모두 조합          │
│    3. Domain은 외부 의존 없음 (Zod는 허용)                     │
│    4. Infrastructure는 Domain 타입만 import                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 9.3 File Import Rules

| From | Can Import | Cannot Import |
|------|-----------|---------------|
| `app/law/_components/**` | `lib/korean-law/application/index.ts`의 public types, `components/ui/*` | `lib/korean-law/infrastructure/**`, `lib/korean-law/domain/**` 직접 |
| `app/api/law/**/route.ts` | `lib/korean-law/application/**` | `lib/korean-law/infrastructure/**` 직접 |
| `lib/korean-law/application/**` | `lib/korean-law/domain/**`, `lib/korean-law/infrastructure/**` | `app/**` |
| `lib/korean-law/domain/**` | `zod`만 | `node:*`, `fs`, fetch, `app/**`, `infrastructure/**` |
| `lib/korean-law/infrastructure/**` | `lib/korean-law/domain/**`, `node:fs`, external APIs | `application/**`, `app/**` |

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `UnifiedSearchBar` | Presentation | `app/law/_components/UnifiedSearchBar.tsx` |
| `DecisionAccordion` | Presentation | `app/law/_components/DecisionAccordion.tsx` |
| `ArticleModal` | Presentation | `app/law/_components/ArticleModal.tsx` |
| `route-router/route.ts` | Application | `app/api/law/route-router/route.ts` |
| `decision-service.ts` | Application | `lib/korean-law/application/services/decision-service.ts` |
| `chains.ts` | Application | `lib/korean-law/application/chains.ts` |
| `decision-parser.ts` | Domain | `lib/korean-law/domain/parsers/decision-parser.ts` |
| `query-router.ts` | Domain | `lib/korean-law/domain/router/query-router.ts` |
| `customs.ts` (scenario) | Domain | `lib/korean-law/domain/scenarios/customs.ts` |
| `domain-types.ts` | Domain | `lib/korean-law/domain/types/domain-types.ts` |
| `api-client.ts` | Infrastructure | `lib/korean-law/infrastructure/core/api-client.ts` |
| `file-cache.ts` | Infrastructure | `lib/korean-law/infrastructure/cache/file-cache.ts` |
| `decision-presenter.ts` | Infrastructure | `lib/korean-law/infrastructure/presenters/decision-presenter.ts` |

---

## 10. Coding Convention Reference

CLAUDE.md의 프로젝트 컨벤션 + tax-engine 2-레이어 원칙 + 추가 규칙:

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| Components | PascalCase | `DecisionAccordion`, `RefLawChip` |
| Functions | camelCase | `parseDecision()`, `matchPatterns()` |
| Constants | UPPER_SNAKE_CASE | `ROUTER_PATTERNS`, `MAX_DISPLAY` |
| Types/Interfaces | PascalCase | `DecisionDetail`, `RouteResult` |
| Files (component) | PascalCase.tsx | `DecisionAccordion.tsx` |
| Files (util) | kebab-case.ts | `decision-parser.ts`, `query-router.ts` |
| Folders | kebab-case | `lib/korean-law/domain/parsers/` |

### 10.2 Import Order

```typescript
// 1. External
import { z } from "zod";

// 2. Internal absolute — Domain types first
import type { DecisionDetail, LawRef } from "@/lib/korean-law/domain/types/domain-types";

// 3. Internal absolute — Application
import { decisionService } from "@/lib/korean-law/application/services/decision-service";

// 4. Internal absolute — Infrastructure (only from application/infrastructure layers)
import { fileCache } from "@/lib/korean-law/infrastructure/cache/file-cache";

// 5. Relative
import { parseLawRefs } from "./ref-parser";
```

### 10.3 Environment Variables

| Variable | Purpose | Scope |
|----------|---------|-------|
| `KOREAN_LAW_OC` | 법제처 Open API 인증키 (기존) | Server only |

신규 환경변수 없음.

### 10.4 This Feature's Conventions

| Item | Convention |
|------|-----------|
| Parser naming | `parse{Entity}(raw): Parsed{Entity}` — 반환 실패 시 `null` 금지, `PARSE_ERROR` throw |
| Scenario naming | 파일명 = scenario key = export 함수명. `scenarios/{key}.ts`에서 `export async function runScenario(...)` |
| Router patterns | `ROUTER_PATTERNS` 배열에 `{name, regex, priority, tool, extract, reason}` 객체. 우선순위 낮은 숫자 = 높은 순위 |
| Cache key v2 | `${v1_key}_v2` suffix (단일) |
| Error handling | 도메인 레이어: Error throw. Application 레이어: `LawApiErrorResponse`로 변환 |
| Test co-location | parsers는 `__tests__/korean-law/parsers/*.test.ts`, scenarios는 `__tests__/korean-law/scenarios/*.test.ts` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
lib/korean-law/
├── application/
│   ├── index.ts                      # Public API facade (기존 호환)
│   ├── chains.ts                     # 체인 오케스트레이터 (8종)
│   └── services/
│       ├── decision-service.ts       # getDecisionText 오케스트레이션
│       ├── law-service.ts            # getLawText 오케스트레이션
│       ├── search-service.ts         # searchLaw 오케스트레이션
│       └── annex-service.ts          # getAnnexes 오케스트레이션
│
├── domain/
│   ├── types/
│   │   ├── api-types.ts              # 법제처 API 원시 응답 타입
│   │   ├── domain-types.ts           # DecisionDetail, LawRef, RouteResult 등
│   │   ├── error-types.ts            # LawApiError, LawParseError
│   │   └── zod-schemas.ts            # 런타임 검증 스키마
│   ├── parsers/
│   │   ├── decision-parser.ts        # 판례 본문 → 6구간
│   │   ├── article-parser.ts         # 조문 → 트리
│   │   ├── ref-parser.ts             # 참조조문/판례 문자열 → 배열
│   │   ├── circled-number.ts         # ①②③ 파싱
│   │   └── __internals__/           # 파서 내부 helper
│   ├── router/
│   │   ├── query-router.ts           # 메인 라우터 함수
│   │   ├── patterns.ts               # ROUTER_PATTERNS 레지스트리
│   │   └── extractors.ts             # extractLawName, extractArticleNumber
│   ├── scenarios/
│   │   ├── registry.ts               # 시나리오 동적 등록
│   │   ├── penalty.ts   (기존)
│   │   ├── timeline.ts  (기존)
│   │   ├── impact.ts    (기존)
│   │   ├── customs.ts   (신규)
│   │   ├── manual.ts    (신규)
│   │   ├── delegation.ts(신규)
│   │   ├── compliance.ts(신규)
│   │   └── fta.ts       (신규)
│   ├── normalize/
│   │   ├── aliases.ts                # 법령 약칭 사전 (기존)
│   │   ├── search-normalizer.ts      # 쿼리 정규화 (기존 + 개선)
│   │   ├── tax-expander.ts           # 세법 키워드 확장 (기존)
│   │   └── relevance-score.ts        # 관련도 점수 (개선)
│   ├── verify/
│   │   └── citation-verifier.ts      # 인용 환각 검증 (기존 이전)
│   └── compact/
│       ├── densify-law-refs.ts       # 기존 compact.ts 분할
│       ├── densify-precedent-refs.ts
│       └── compact-body.ts
│
└── infrastructure/
    ├── core/
    │   ├── api-client.ts             # 기존 client.ts의 fetchJson/doLawNameSearch 추출
    │   ├── fetch-with-retry.ts       # 기존
    │   └── http-types.ts
    ├── cache/
    │   ├── file-cache.ts             # readCache/writeCache
    │   ├── cache-key.ts              # safeCacheKey
    │   └── cache-versions.ts         # v1/v2 병행 라우터
    └── presenters/
        ├── decision-presenter.ts     # UI용 가공 (하위호환 문자열 필드 생성)
        └── highlight-presenter.ts    # 하이라이트 메타 생성

app/api/law/
├── _helpers.ts                       # 기존 (rate-limit, error mapper)
├── search-law/route.ts               # (수정)
├── law-text/route.ts                 # (수정)
├── search-decisions/route.ts         # (수정)
├── decision-text/route.ts            # (수정 — 구조화 응답)
├── annexes/route.ts
├── chain/route.ts                    # (수정 — 8종)
├── route-router/route.ts             # (신규)
└── verify-citations/route.ts

app/law/_components/
├── UnifiedSearchBar.tsx              (신규)
├── DecisionAccordion.tsx             (신규)
├── RefLawChip.tsx                    (신규)
├── RefPrecedentChip.tsx              (신규)
├── ArticleModal.tsx                  (신규)
├── PrecedentModal.tsx                (신규)
├── HighlightedText.tsx               (신규)
├── VirtualizedResultList.tsx         (신규)
├── NotFoundSection.tsx               (신규)
├── ChainScenarioPicker.tsx           (신규)
├── LawSearchTab.tsx                  (수정)
├── DecisionTab.tsx                   (수정)
├── AnnexTab.tsx                      (경미)
├── ChainTab.tsx                      (수정)
└── VerifyCitationsTab.tsx
```

### 11.2 Implementation Order

1. [ ] **타입·에러·Zod 스키마 정의** — `domain/types/**` 먼저 고정 (모든 하위 모듈의 계약)
2. [ ] **Infrastructure 레이어 마이그레이션** — 기존 `client.ts` → `core/api-client.ts` + `cache/*` + `fetch-with-retry.ts` 추출
3. [ ] **Domain 파서 구현** — decision/article/ref/circled-number 순서 (단위 테스트 동반)
4. [ ] **Application services 구성** — decision-service, law-service, search-service (DI 패턴)
5. [ ] **API Routes 수정** — decision-text, law-text 부터 구조화 응답 전환
6. [ ] **UI Phase A 구현** — DecisionAccordion, RefLawChip, ArticleModal, HighlightedText
7. [ ] **scenarios 신규 5종 + chains.ts 8종 확장** (Phase B)
8. [ ] **API 파라미터 확장** — ancYd/efYd/sort 반영 (Phase B)
9. [ ] **VirtualizedResultList** (Phase B)
10. [ ] **Query Router 구현** — patterns 10+종 + 단위 테스트 (Phase C)
11. [ ] **`/api/law/route-router` 구현 + UnifiedSearchBar UI** (Phase C)
12. [ ] **E2E 테스트 (scripts/e2e-law-research.mjs 확장)**
13. [ ] **하위호환 facade(`application/index.ts`) 검증** — `lib/legal-verification/*` 연동 정상
14. [ ] **CLAUDE.md `## 법령 리서치 (/law)` 섹션 갱신**

### 11.3 Session Guide

> `/pdca do law-research-v2 --scope {key}` 로 세션당 한 모듈씩 진행.

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 타입·에러·Zod 스키마 정의 | `phase-a-types` | domain/types/** 고정 — 모든 모듈 계약 | 15-20 |
| Infrastructure 마이그레이션 | `phase-a-infra` | core/api-client, cache, fetch-with-retry 추출 | 30-35 |
| Domain 파서 4종 + 단위 테스트 | `phase-a-parsers` | decision/article/ref/circled-number | 40-50 |
| Application services 구성 | `phase-a-services` | decision/law/search/annex service | 20-25 |
| API Routes 구조화 응답 전환 | `phase-a-api` | decision-text, law-text 우선 | 20-25 |
| UI Phase A (아코디언·모달·하이라이트) | `phase-a-ui` | DecisionAccordion 외 6종 | 40-50 |
| 시나리오 5종 + chains.ts 확장 | `phase-b-scenarios` | customs/manual/delegation/compliance/fta | 35-45 |
| API 파라미터 확장 + 가상 스크롤 | `phase-b-api-vs` | ancYd/efYd/sort + VirtualizedResultList | 25-30 |
| Query Router + UnifiedSearchBar | `phase-c-router` | patterns + route-router + UI | 40-50 |
| E2E + 회귀 테스트 | `phase-c-e2e` | scripts/e2e-law-research.mjs 확장 | 15-20 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| 1 | Plan + Design | 전체 | 30-35 (완료) |
| 2 | Do | `--scope phase-a-types,phase-a-infra` | 45-55 |
| 3 | Do | `--scope phase-a-parsers` | 40-50 |
| 4 | Do | `--scope phase-a-services,phase-a-api` | 40-50 |
| 5 | Do | `--scope phase-a-ui` | 40-50 |
| 6 | Check (Phase A) | Phase A 전체 | 20-30 |
| 7 | Do | `--scope phase-b-scenarios` | 35-45 |
| 8 | Do | `--scope phase-b-api-vs` | 25-30 |
| 9 | Check (Phase B) | Phase B 전체 | 20-25 |
| 10 | Do | `--scope phase-c-router` | 40-50 |
| 11 | Do | `--scope phase-c-e2e` | 15-20 |
| 12 | Check + QA + Report | 전체 | 30-40 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-18 | 초기 드래프트 — Option B Clean Architecture 선택. lib/korean-law/를 application/domain/infrastructure 레이어로 재구조화. 10종 Module Map + 12 Session Plan. | kwonohjik |
