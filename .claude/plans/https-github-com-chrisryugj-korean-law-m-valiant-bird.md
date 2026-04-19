# 법령 리서치(/law) P0+P1 개선 플랜

## Context

사용자가 원본 MCP 프로젝트(https://github.com/chrisryugj/korean-law-mcp)를 직접 실행해 검색한 결과와, 우리 프로젝트 `/law` 페이지 검색 결과 사이에 **정제된 정보 수준의 체감 격차**가 있음을 보고했다. 갭 분석 결과 핵심 축약·검증·라우팅은 이미 원본과 동등하지만 다음 4개 영역에서 격차가 발생한다:

1. **별표/별지서식 본문 변환 미구현 (0%)** — 파일 메타만 반환, HWPX/PDF/XLSX를 Markdown으로 추출하지 않아 "별표 처분기준표", "절차 서식" 조회 시 빈 화면처럼 보임
2. **시나리오 4종 skeleton 상태 (3/7 만 full 구현)** — manual·delegation·compliance·fta 시나리오가 트리거는 되지만 전용 섹션 확장 로직 없음 → 복합 쿼리에 대해 일반 `full_research`로 폴백
3. **판례 페이지네이션 UI 미연결** — `totalCount`만 반환되고 "다음 페이지" 버튼이 실제로 연결되지 않음
4. **환각 방지 마커·No-Result 힌트 약함** — `[FAILED]/[NOT_FOUND]/[TIMEOUT]`만 있고 원본의 `[HALLUCINATION_DETECTED]` + LLM 경고 배너 포맷 없음; 결과 0건 시 다음 액션 힌트 없음

본 개선은 원본 MCP와의 정보 품질·UX 격차를 해소하는 **P0+P1 범위**이며, 사용자는 **서버측 Node 라이브러리 직접 파싱** 방식을 선택했다.

## Scope (확정)

- **P0**: 별표 본문 변환 + 시나리오 4종 full 구현
- **P1**: 판례 페이지네이션 UI 연결 + 실패 마커 표준화 + refLaws 중복 제거 + No-Result 힌트
- **제외**: discover_tools/execute_tool 메타 도구, display 동적 확장, 캐시 관리 UI (→ 후속 PDCA)

## Tasks

### Task 4 (선행) — 실패 마커 표준화 (~1d)

**목표**: 원본과 동일한 구조적 마커 + LLM 경고 배너 도입. Task 1·2에서 재사용.

**신설 파일**: `lib/korean-law/markers.ts`
```ts
export const MARKERS = {
  NOT_FOUND: { tag: "[NOT_FOUND]", banner: "해당 조회 결과 없음", icon: "🔍", bgClass: "bg-zinc-50 border-zinc-200" },
  HALLUCINATION_DETECTED: { tag: "[HALLUCINATION_DETECTED]", banner: "⚠️ LLM은 이 섹션을 추측·보완하지 마세요", icon: "⚠️", bgClass: "bg-amber-50 border-amber-300" },
  TIMEOUT: { tag: "[TIMEOUT]", banner: "조회 시간 초과", icon: "⏱️", bgClass: "bg-orange-50 border-orange-200" },
  FAILED: { tag: "[FAILED]", banner: "조회 실패", icon: "❌", bgClass: "bg-red-50 border-red-200" },
  NOT_CONVERTED: { tag: "[NOT_CONVERTED]", banner: "본문 변환 실패 — 원본 파일 다운로드", icon: "📎", bgClass: "bg-sky-50 border-sky-200" },
} as const;
```

**수정**: `lib/korean-law/chains.ts:69-117` `secOrSkip()` → `MARKERS` 상수 사용.

**추출**: `app/law/_components/SectionView.tsx` 신설 (현재 ChainResearchTab 내 인라인). 마커별 아이콘·배경·경고 배너 렌더.

### Task 1 — 별표 본문 변환 (~2.5d)

**신설 파일**: `lib/korean-law/annex-body-parser.ts`

**의존성 추가** (번들 영향 없음 — 서버 전용):
- `jszip` (HWPX 압축 해제)
- `fast-xml-parser` (HWPX XML 파싱)
- `pdf-parse` (PDF 텍스트)
- `xlsx` (이미 설치 확인 필요; 없으면 추가)

**함수 시그니처**:
```ts
export async function parseAnnexBody(
  url: string,
  fileType: "HWPX" | "PDF" | "XLSX" | "HWP" | "DOCX",
  cacheKey: string
): Promise<{ content: string; truncated: boolean; status: "ok" | "NOT_CONVERTED"; error?: string }>;
```

**캐시**: `.legal-cache/annex_body_{mst}_{annexNo}.md` TTL 30일. 기존 `readCache/writeCache` (client.ts:155-169) 재사용.

**크기 제한**: 50KB 초과 시 `compactBody(text, { headSize: 40000, tailSize: 10000 })` (기존 `lib/korean-law/compact.ts` 재사용).

**타입 확장** (`lib/korean-law/types.ts` `AnnexItem`):
```ts
interface AnnexItem {
  // 기존 필드...
  content?: string;
  truncated?: boolean;
  conversionStatus?: "ok" | "NOT_CONVERTED";
  conversionError?: string;
}
```

**신설 라우트**: `app/api/law/annex-content/route.ts` (`export const maxDuration = 30`). 기존 `/api/law/annexes`는 메타만 반환하고, 본문은 별도 lazy 호출 (UX 속도 유지).

**UI**: `app/law/_components/AnnexTab.tsx` — 별표 카드에 "본문 보기" 버튼 추가, 클릭 시 `/api/law/annex-content` 호출하여 Markdown 렌더 (기존 `react-markdown`).

**폴백**: 변환 실패 시 `NOT_CONVERTED` 마커 + 다운로드 링크 표시.

**테스트**: `__tests__/korean-law/annex-body-parser.test.ts` — 고정 fixture(HWPX/PDF/XLSX 각 1개). fetch mock.

**Feature Flag**: 환경변수 `LAW_ANNEX_BODY_ENABLED=true` (미설정 시 404, 탭 버튼 비활성).

### Task 2 — 시나리오 4종 full 구현 (~1.5d)

기존 skeleton 파일 확장 (`lib/korean-law/scenarios/`):

| 시나리오 | 조회 섹션 | 트리거 키워드 |
|---|---|---|
| `manual.ts` | 행정규칙(admrul) 5 + 해석례(expc) 5 + 자치법규(ordinances) 3 | 절차, 매뉴얼, 안내, 신청방법 |
| `delegation.ts` | 상위법 조문 + 시행령/규칙 + 행정규칙 트리 | 위임입법, 위임, 포괄위임 |
| `compliance.ts` | 헌재(cons) 위헌결정 + 행심 위법취소 + 조세심판 | 위헌, 규제준수, 컴플라이언스 |
| `fta.ts` | 조약(trty) + 관세해석례 + 조세심판(detc) | 관세, FTA, 조약, HS코드 |

**공통 규칙**: `Promise.allSettled`로 부분 실패 허용, 각 섹션 `secOrSkip()` 래핑하여 Task 4 마커 활용.

**수정**: `lib/korean-law/scenarios/index.ts` 레지스트리 + `detectScenarios()` 정규식 확장.

**테스트**: `__tests__/korean-law/chains.test.ts`에 각 시나리오별 detect + run 케이스 추가.

### Task 3 — 판례 페이지네이션 UI 연결 (~0.5d)

**수정**: `app/law/_components/DecisionSearchTab.tsx`

- `Pagination` 컴포넌트는 이미 import 되어 있으나 `handlePageChange`가 재검색 트리거 누락 — `useEffect([page])`로 재검색 호출 추가
- `totalPages = Math.ceil(totalCount / pageSize)` 계산
- `useSearchParams`/`router.replace`로 `?page=N` 쿼리 동기화 (deeplink)
- 진행 표시: "전체 33건 중 1/4 페이지"

**서버 변경 없음** — `/api/law/search-decisions`는 이미 `page`/`pageSize` 지원.

### Task 5 — refLaws 중복 제거 (~0.3d)

- `lib/korean-law/types.ts`: `refLaws` 필드에 `@deprecated — use refLawsStructured` JSDoc
- `lib/korean-law/client.ts` `getDecisionText()`: `refLawsStructured.length > 0`일 때 `refLaws = undefined` 처리
- `app/law/_components/DecisionSearchTab.tsx:476-499`: `structured ? chips : (refLaws ? legacy : null)` 형태로 tighten

### Task 6 — No-Result 힌트 (~0.5d)

`search-law/route.ts:27-32`의 `hint` 필드 패턴을 다음 라우트에 미러링:
- `app/api/law/search-decisions/route.ts`: 0건 시 `hint: "💡 다음: search_law('...') 또는 chain(full_research)"`
- `app/api/law/law-text/route.ts`: 조문 미존재 시 `hint: "💡 조문번호를 확인하거나 search_law로 법령 검색"`

**UI**: `LawSearchTab` / `DecisionSearchTab` 결과 0건 블록(`DecisionSearchTab.tsx:331-340`)에 힌트 배너 렌더.

## 실행 순서 & 의존관계

```
Task 4 (markers) ── [필수 선행] ──┬─→ Task 2 (시나리오)
                                  └─→ Task 1 (annex NOT_CONVERTED 사용)
Task 3, 5, 6 ── [독립, 병렬 가능]
```

**총 공수**: 약 6~7 dev-days (5 ~ 6일 사용자 추정과 정합)

## 수정·신설 파일 목록

**신설**
- `lib/korean-law/markers.ts`
- `lib/korean-law/annex-body-parser.ts`
- `app/api/law/annex-content/route.ts`
- `app/law/_components/SectionView.tsx`
- `__tests__/korean-law/annex-body-parser.test.ts`

**수정**
- `lib/korean-law/client.ts` (getDecisionText refLaws dedup, getAnnexes lazy body)
- `lib/korean-law/chains.ts` (secOrSkip → MARKERS)
- `lib/korean-law/types.ts` (AnnexItem, DecisionText 스키마)
- `lib/korean-law/scenarios/{manual,delegation,compliance,fta}.ts` (skeleton → full)
- `lib/korean-law/scenarios/index.ts` (레지스트리·detect)
- `app/api/law/{search-decisions,law-text}/route.ts` (hint 필드)
- `app/law/_components/{DecisionSearchTab,AnnexTab,ChainResearchTab,LawSearchTab}.tsx`
- `package.json` (jszip, fast-xml-parser, pdf-parse, xlsx)

## 롤백 전략

- **Task 1**: `LAW_ANNEX_BODY_ENABLED` env flag로 즉시 무력화. 캐시 `.legal-cache/annex_body_*` 삭제 안전.
- **Task 2**: `scenarios/index.ts` SCENARIOS 배열에서 해당 항목 제거 → skeleton 상태 복귀.
- **Task 3·5·6**: Git revert 단일 커밋 가능.
- **Task 4**: `markers.ts` 상수는 하위호환 — 기존 `[NOT_FOUND]` 문자열은 그대로 매칭.

## Verification (E2E 검증)

1. **환경 준비**: `npm install` → `.env.local`에 `KOREAN_LAW_OC=*` + `LAW_ANNEX_BODY_ENABLED=true` 설정
2. **Dev 서버**: `npm run dev` → `http://localhost:3000/law`
3. **Task 1 검증**: "별표·서식" 탭 → "소득세법 시행령" 검색 → 별표 카드 클릭 → Markdown 본문 렌더 확인. HWPX/PDF/XLSX 각 1건 이상 성공. 실패 시 `[NOT_CONVERTED]` 배너 + 다운로드 링크 표시.
4. **Task 2 검증**: "리서치 체인" 탭 →
   - "과태료 감경 조항이 있는 행정처분" → `compliance` 시나리오 자동 트리거, 헌재·행심 섹션 확장 확인
   - "관세 FTA 원산지 해석례" → `fta` 시나리오, 조약·관세해석 섹션 확인
   - "인허가 절차 매뉴얼" → `manual`, 행정규칙·해석례·자치법규 섹션 확인
   - "위임입법 현황" → `delegation`, 시행령·행정규칙 트리 확인
5. **Task 3 검증**: "판례·결정례" 탭 → "양도소득세" 검색(33건+) → 페이지네이션 버튼 클릭 → URL `?page=2` 반영 확인 → 새로고침 시 2페이지 복원.
6. **Task 4 검증**: 일부러 `KOREAN_LAW_OC` 비워 섹션 실패 유도 → `[FAILED]` 배너 + LLM 경고문 표시 확인. 존재하지 않는 조문 조회 → `[NOT_FOUND]` 표시.
7. **Task 5 검증**: 판례 상세(구조화 참조가 있는 사건) → refLaws 문자열 섹션이 숨겨지고 Chip만 표시되는지 DOM 확인.
8. **Task 6 검증**: "조재고등록세"(오타) 검색 → 힌트 배너 "💡 다음: ..." 렌더 확인.
9. **자동 테스트**: `npx vitest run __tests__/korean-law/` → 기존 테스트 + 신규 annex-body-parser 테스트 0 FAIL.
10. **회귀**: `npm test` 전체 339개 테스트 pass 유지 (양도세 등 계산 엔진 영향 없음).
