# lib/korean-law/ — 법령 리서치 (`/law`)

법제처 Open API 직접 호출(`KOREAN_LAW_OC`). Routes `app/api/law/{search-law,law-text,article,search-decisions,decision-text,annexes,annex-content,chain,route-router,applicable-law,impact-map,cite-check,verify-citations}/route.ts`. Client barrel `lib/korean-law/client.ts`(5파일). 별칭 다수 `aliases.ts`. 캐시 `.legal-cache/` 30일 TTL(`client-core.ts:21` — 주말·야간 API 차단 완화). 단 **행위시법 버전 목록은 1일**(새 개정이 30일간 안 보이면 시행일 이후 기준일을 옛 조문으로 답한다) + 법제처 실패 시 만료 목록 fallback.

- **통합 검색 + Query Router**(`lib/korean-law/router/query-router.ts`): 자연어 질의를 정규식 패턴으로 도구 자동 라우팅. 우선순위 0=행위시법(`applicable_law`)·개정신구대조(`amendment_article`)·영향분석(`impact_map`)·조문 인용 판례(`article_decisions` — 「소득세법 제89조 판례」→ 판례 탭 `"소득세법 제89조"` 본문 구절 검색), 1=조문(제 포함), 2=조문(제 생략), 10~=개정·판례·별표 등. `UnifiedSearchBar`→`/api/law/route-router`→`LawResearchClient` 탭 전환. 결정례 검색어를 큰따옴표로 감싸면 사건명이 아니라 **본문 구절 검색**(DRF `search=2`)이다(`phrase-query.ts`).
- **v4.4 고도화(korean-law-mcp 동급)**:
  - **행위시법**(`applicable-law.ts`): 기준일 시행 조문 + 부칙 경과규정. 법제처 `target=eflaw`(시행일자별)·연혁. `ApplicableLawPanel`. 부칙 발췌는 조문 전용(`articleSpecific`) 우선. "2021년 시행 소득세법 89조".
  - **신구대조**(`time-travel.ts`): `compareLatestAmendment`(distinct MST 거슬러 실제 변경 탐색)·LCS `diffLines`. `amendment_track` 체인 `diff` 섹션 + `LawDiffView`. "소득세법 89조 개정".
  - **현행성 라벨**: 조문 표시 지점에 `CurrentLawBadge`([현행]). 과거 시점은 행위시법 [연혁].
- 구조화 참조조문(`parsers/ref-parser.ts` `LawRef[]`)·시나리오 8종(`scenarios/`)·판례 13도메인(`DECISION_DOMAINS` — 조세심판원 재결 `ttSpecialDecc` 포함).

E2E(`law-*.spec.ts`)의 법제처 mock·fixture 규칙: [e2e/CLAUDE.md](../../e2e/CLAUDE.md) §5.
