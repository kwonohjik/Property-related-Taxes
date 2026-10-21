# 1세대1주택 AI 검토 도구 — 실시간 법령·해석례 조회와 원문 검증

- 작성: 2026-10-21 · 브랜치 `feat/one-house-ai-live-law` (워크트리 `Property-related-Taxes-ohlive`, origin/master 8636ae67a 기준 — **착수 전 최신 master로 rebase**: 2026-10-21 현재 origin/master는 f204df8f2)
- 범위: 하이브리드 AI 검토 도구(`lib/one-house-ai/`·`app/api/one-house-ai/`·`components/calc/one-house/OneHouseAi*`) + 이 기능이 기대는 **공용 법령 모듈 결함 2건**(§4 F-13·F-14 — Q-1 결정 대기)
- 판정의 정본은 그대로 결정론 엔진(`lib/tax-engine/one-house/judge.ts`)이다. 이 계획은 **엔진·판정 메뉴 입력·14지점을 건드리지 않는다.** 세액 불변 → 검증 깊이 L2(단, 외부 의존이 커서 V-n 레지스터를 유지한다).
- 줄 번호는 적지 않는다(머지 후 드리프트) — 착수 전 현행 코드로 재확인할 것.
- 자가 검토 1회차(2026-10-21) 결과는 §8. 초판에서 바뀐 판정은 본문에 「(정정)」으로 표시했다.

## 0. 사용자 결정 (2026-10-21)

| # | 질문 | 결정 |
|---|---|---|
| D-1 | 어느 단계에 쓰나 | 사실 추출 **과** 참고 의견 둘 다 |
| D-2 | 카드와의 관계 | 카드가 먼저 · **카드에 없을 때 실시간으로 보충** |
| D-3 | 검증 | 실시간 원문으로 검증 — **실존 확인 + 원문 발췌 + LLM 2차 대조** |
| D-4 | 「KoreanLaw MCP 사용」의 구현 | **앱 내장 `lib/korean-law`를 LLM 도구(tool use)로 노출**(원격 MCP 연결 아님) |
| D-5 | 추출 단계 조회 범위 | 원문 속 인용 대조 + **용어 정의 조문 조회 허용** |

### 결정 (자가 검토 중)

**Q-1 → (a) PR-0으로 먼저 고친다**(2026-10-21 사용자 결정). 채택 근거: 1주택 쟁점 조문이 시행령 §155⑯~㉒에 몰려 있어 (b)면 핵심 인용 대부분이 항 단위 검증을 못 받는다. 이 결정으로 3.0이 확정 범위가 되고, 3.2·3.3·3.5의 「Q-1 (b)면」 분기는 쓰지 않는다.

| # | 질문 | 선택지와 차이 | 권고 |
|---|---|---|---|
| **Q-1** ✅(a) | 공용 법령 모듈 결함 2건(F-13 「16항 이상 항 번호 소실」 · F-14 「`소득세법 시행령` 인용 미추출」)을 어떻게 다루나 | **(a) PR-0으로 먼저 고친다** — `lib/korean-law` 수정. `/law` 행위시법 패널의 §155 등 16항 이상 조문에 항 번호가 돌아오고, `/law` 인용 검증이 시행령 인용을 실제로 검사한다. 이 기능은 **항 단위** 검증·발췌가 가능해진다. 회귀 표면: `/law` 전반 · `verify:legal` 키워드 대조(실측 필요). **(b) 고치지 않는다** — 이 기능은 조문을 **조 단위까지만** 확인하고 항은 「항 확인 안 함」으로 표시한다. `/law` 결함은 별건으로 남는다 | (a) — 1주택 쟁점 조문이 시행령 §155⑯~㉒에 몰려 있어 (b)면 핵심 인용 대부분이 항 단위 검증을 못 받는다 |

## 1. 현행 (2026-10-21 master)

- 사실 추출 `POST /api/one-house-ai/extract` → `extractOneHouseFacts`(`lib/one-house-ai/extract.ts`): 도구 없는 단발 호출 · 구조화 출력.
- 참고 의견 `POST /api/one-house-ai/opinion` → `selectCards`(정규식 점수: 항 2 · 조 1 · 주제 3, 상위 10) → `generateOneHouseOpinion`: 도구 없는 단발 호출.
  보내지 않은 문서번호 인용은 route가 지우고 `droppedCitations`로 알린다. 의견의 조문 칸 `statutes`는 자유 문자열(「소득세법 시행령 §155①」 꼴)이다.
- 화면 상태는 메모리뿐이다(`OneHouseJudgmentCalculator`의 `useState` — `aiReview`). 저장소(IndexedDB)·store에 싣지 않는다 ⇒ 응답 필드를 늘려도 저장 마이그레이션은 없다.
- 카드: `~/tax-knowledge-private/cards/one-house/E###.json` **176건**(해석 140 · 심판·심사 29 · 판례 7) — 저장소 밖(교재 파생 칸 포함).
  P0(2026-10-06)에 KoreanLaw MCP `nts` 검색 + Playwright로 taxlaw 원문을 읽어 만들었다. **런타임 호출은 0건.**
- 앱 법령 모듈 `lib/korean-law/`(korean-law-mcp 이식 · 법제처 DRF · `.legal-cache/` 30일): 조문 `getLawText` · 행위시법 `getApplicableLaw` ·
  결정례 검색 `searchDecisions`(prec·ttSpecialDecc·expc…) · 본문 `getDecisionText` · 인용 환각 검증 `verifyCitations`(**현행 조문 기준** — `verifyOne`이 `getLawText`를 부른다).
  **국세청·기재부 해석 도메인은 없다**(`DECISION_DOMAINS`).
- 로컬 개발 서버 전용(`access-guard.ts`) · `ANTHROPIC_API_KEY` 필요 · 모델 `claude-opus-5-5`.

## 2. 실측 사실 (2026-10-21, 이 계획의 전제)

| # | 사실 | 근거 |
|---|---|---|
| F-1 | DRF `lawSearch.do?target=ntsCgmExpc`(국세청 법령해석)가 현재 OC로 **검색된다**. 응답에 `안건번호`·`해석일자`·`법령해석일련번호`·`법령해석상세링크`(taxlaw `ntstDcmId` 포함). 최신 문서 2026.09.21.(데이터기준 2026.10.03.)까지 있다. `search=2` 본문 검색도 된다(「공동상속주택 소수지분」 제목 73건 / 본문 107건) | curl probe |
| F-2 | `target=moefCgmExpc`(기획재정부)도 검색된다. **(정정)** 초판은 「1세대」 검색 최신이 2025.01.이라 최신성을 의심했다 — **검색어 탓이었다.** 「소득세」 2026.09.09. · 「양도」 2026.06.08. · 「주택」 2025.11.06.까지 있다. 안건번호에는 「기획재정부 」 접두사가 없다(`조세정책과-1901`). 완전성(taxlaw 대비 누락 여부)은 확인하지 못했다 — taxlaw 통합검색은 robots.txt 차단(F-16) | curl probe(검색어 5개 · `sort=ddes`) |
| F-3 | DRF `lawService.do?target=ntsCgmExpc` **본문은 막혀 있다** — 「미신청된 목록/본문에 대한 접근입니다」. KoreanLaw MCP도 `[NOT_SUPPORTED] … 'ntsCgmExpc'는 lawSearch.do 목록 조회만 지원`을 돌려준다 | curl · MCP |
| F-4 | taxlaw 상세 화면이 부르는 `POST https://taxlaw.nts.go.kr/action.do`(`actionId=ASIQTB002PR01`, `paramData={"dcmDVO":{"ntstDcmId":…}}`)를 **브라우저·쿠키 없이 재현하면 본문이 온다**. 경로는 `data.ASIQTB002PR01.*`: 문서번호 `dcmDVO.ntstDcmDscmCntn` · 제목 `ntstDcmTtl` · 일자 `ntstDcmRgtDt`(YYYYMMDD) · 요지 `ntstDcmGistCntn` · 회신 `ntstDcmCntn` · 사실관계·질의 등 `dcmHwpEditorDVOList[].dcmFleByte`(HTML) · 관련 조문 `dcmRltnStttList[]` | curl · node probe |
| F-5 | 심판·판례 상세(`/pd/USEPDA002P.do`)도 **같은 액션**이다. 단 심판·판례는 회신 칸이 「결정 내용은 붙임과 같습니다」뿐이고 **본문은 `dcmHwpEditorDVOList`에만** 있다(표본 10건 모두 4,700~12,900자) | Playwright 캡처 · node probe |
| F-6 | 응답 크기: **해석(qt)만** 문서당 약 2.1MB(`trilPsagList`가 대부분) · 심판·판례는 8~25KB. HTML 본문에 사용자 정의 영역 글리프(`󰠏`)가 섞인다 | node probe 30건 |
| F-7 | 카드 해석 140건 전부 DRF로 찾아진다 — 국세청식 114건(번호 대조, 일자 미대조) · 기재부식 26건(「기획재정부 」 접두사 제거 후 **번호 + 해석일자 일치**). 기재부 건도 링크는 taxlaw `qt` 상세 | python probe |
| F-8 | 카드 176건 **모두 실제 `ntstDcmId` 링크가 있다**. (첫 답변의 「34건 `00000000` 자리표시」는 앞자리 0 id를 grep이 잘못 잡은 오판 — 정정) | 전수 출력 |
| F-9 | SDK 0.135 `client.beta.messages.toolRunner` + `stream: true` + `output_config.format`(`betaZodOutputFormat`) + `fallbacks: "default"`(beta `server-side-fallback-2026-07-01`) + `max_iterations` 조합이 **동작한다** — 도구 1회 호출 후 최종 메시지에 `parsed_output`이 온다. `runner.done()`도 같은 parsed를 돌려준다 | 실호출 probe |
| F-10 | 같은 probe에서 모델은 도구 결과(「보유기간 2년」)에 **없는** 「조정대상지역 거주 2년」「12억 고가주택」을 덧붙였다 — 도구를 주어도 지식으로 보충한다. ⇒ D-3의 2차 대조가 필요하다는 실측 근거 | 실호출 probe |
| F-11 | KoreanLaw MCP는 claude.ai 커넥터다 — 로컬 설정(`~/.claude.json`)에 원격 URL이 없다. ⇒ D-4 | 설정 확인 |
| F-12 | **taxlaw 연속 호출**: 카드 30건(해석 20·심판 6·판례 4)을 0.5초 간격으로 → **30/30 성공**, 차단 없음, p50 0.72초 · 최대 1.3초. 받은 문서번호가 카드 docNo(`[…]` 꼬리 제거)와 **30/30 일치**, `ntstDcmRgtDt`가 카드 date와 30/30 일치 | node probe(V-3) |
| F-13 | 🔴 **공용 모듈 결함 — 16항 이상 항 번호.** DRF는 16항부터 항번호를 `<16>`·`<21>`로 준다(시행령 §155 현행 항 25개 중 ⑯ 이후 전부). 경로마다 다르게 망가진다: ① **시행본 경로**(`getApplicableLaw` → `fetchEflawArticle` → `formatArticleUnit` → `cleanHtml`의 `/<[^>]+>/g`)는 태그로 보고 **지운다** — `fullText`에 ⑮ 다음부터 항 번호가 없고, 이것을 `/law` 행위시법 패널(`ApplicableLawPanel` → `LawArticleBody`)이 그대로 보여 준다. ② **현행 경로**(`getLawText`)는 `<16>`을 **글자 그대로** 남긴다. 두 경로 모두 `verifyCitations`의 항 확인(원숫자 또는 「제N항」)이 16항 이상을 알아보지 못한다 — 본문 속 「제21항을 적용받은」 같은 상호참조와 우연히 맞을 때만 통과한다 | DRF 원응답 · `cleanHtml("<16>…")` probe · `getLawText` probe |
| F-14 | 🔴 **공용 모듈 결함 — 시행령 인용 미추출.** `extractCitations("소득세법 시행령 제155조 제20항")` → **0건**(`recoverLawName`이 공백 띄운 「소득세법 시행령」을 회복하지 못하고 skip). `§` 표기 「소득세법 시행령 §155①」은 법령명이 「시행령」으로 잡히고, 「§155⑳」은 항이 빠진다(`lib/legal-verification/citation-parser.ts`의 항 패턴이 `[①-⑩]`). 「소득세법 §89①3호」·「조세특례제한법 제99조의2」는 정상 | tsx probe |
| F-15 | 현행 시행령 §155의 장기임대주택 항은 **㉑**이다(카드 다수는 당시 법령 기준 「§155⑳」). ⇒ 조문 검증은 반드시 **양도일(또는 문서 일자) 시행본** 기준이어야 하고, 현행 기준 「없음」은 환각이 아닐 수 있다 | DRF 원응답 |
| F-16 | taxlaw `robots.txt`는 `/is/USEISA001M.do`·`/is/USEISA003M.do`(통합검색)만 Disallow한다. `action.do`는 대상이 아니다. ⇒ 검색은 DRF, 본문만 taxlaw. 사이트 이용약관 본문은 확인하지 못했다 | curl |
| F-17 | **DRF 세무 판례는 본문을 못 받는다.** `searchDecisions("1세대1주택 비과세","prec")` 상위 6건 모두 출처 「국세법령정보시스템」이고 `getDecisionText`가 6/6 「(본문 제공 불가)」. 검색 결과에 `ntstDcmId`도 없다 → taxlaw로 우회할 id가 없다. 조세심판(`ttSpecialDecc`)은 6/6 본문 정상 | tsx probe(V-6) |
| F-18 | `getApplicableLaw` 지연: 처음 조회(법령별 연혁 목록 포함) **0.67~6.6초/건**, 캐시 적중 1~3ms. 시행령 §155 시행본 본문은 8,299~12,506자 | tsx probe(V-2) |
| F-19 | 정제 품질: 표본 6건에서 「태그 제거 + 엔터티 복원 + PUA 제거」 결과가 P0 원문 덤프(15자 이상 한글 줄)의 70~91%를 포함했다. 본 누락 줄은 모두 수집기 머리말(QUERY·MATCH)·제목·등록일자였다(E001은 누락 9줄 중 4줄만 봤다). PUA 잔존 0 | node probe(V-4) |

## 3. 설계

### 3.0 공용 법령 모듈 결함 수정 (PR-0 — Q-1 (a)일 때만)

1. **항 번호 보존(F-13)**: 시행본 경로(`formatArticleUnit`)에서 항번호가 `<NN>`이면 원숫자(⑯~⑳ U+246F~2473 · ㉑~㉟ U+3251~325F)로 바꾼 뒤 태그 제거를 한다 — `cleanHtml` 전역 치환은 본문 속 `<` 사용 예까지 건드리므로 피한다. `compact.ts`의 같은 이름 함수도 확인한다. **(정정 — 설계 검토)** 초안은 현행 경로(`getLawText`)도 원숫자로 통일하려 했다 — 기각. 현행 경로는 `lib/legal-verification/korean-law-client.ts`의 `fetchArticle`로 `verify:legal`과 같은 함수이고, `<16>`이 지워지지 않고 남아 있다. ⇒ 현행 경로는 그대로 두고, **읽는 쪽**(`verifyHangInBody`·이 기능의 항 자르기)이 원숫자와 `<NN>` 둘 다 받는다. 시행본 조문 캐시는 키 버전을 올린다(옛 캐시가 항 번호 없는 본문을 돌려준다).
2. **시행령 인용 추출(F-14)**: `recoverLawName`이 「X법 시행령」「X법 시행규칙」(공백 1칸)을 한 이름으로 회복한다. `§` 표기의 ⑪ 이상 항은 **`extractCitations` 안에서** 원문 조각을 다시 읽어 보충한다. **(정정 — 설계 검토)** 초안은 `citation-parser.ts`의 항 패턴을 넓히려 했다 — 기각. 그 파서는 `verify:legal`(`verifier.ts`)·법령 검증 커버리지 게이트(`coverage.ts` → `legal-verification-coverage-complete.test.ts`)·캐시 예열 스크립트가 함께 쓴다. 항이 새로 잡히면 커버리지 키가 바뀌어 게이트가 움직일 수 있다.
3. 회귀: `__tests__/korean-law/`(verify-citations·review-*.anchor 등) · 시행본 경로 소비자(`formatArticleUnit`은 `applicable-law.ts`만 쓴다 → `/law` 행위시법 패널·`/api/law/applicable-law`) · `/law` E2E fixture(`e2e/_helpers/law-api-mock.ts`)가 16항 이상 조문을 쓰는지 확인. `verify:legal`은 현행 경로·`citation-parser`를 건드리지 않으므로 대상이 아니다 — 그래도 PR-0 전후 1회씩 돌려 「변화 없음」을 실측으로 남긴다.
4. anchor: `<16>`·`<21>` 항이 원숫자로 남는다 · 「소득세법 시행령 제155조 제20항」 추출 1건 · 「소득세법 시행령 §155⑳」 → 법령명 「소득세법 시행령」·항 20. 각 anchor에 대응 mutation(P-1·P-2, §6).

**PR-0 구현 결과(2026-10-22)**
- 변경: `article-parser.ts`(`circledHangMark`·`circledHangNumber` 신설 · `hangContentWithMark`) · `applicable-law.ts`(캐시 키 `eflaw_article_v2_`) · `verify-citations.ts`(`recoverLawName` 시행령·시행규칙 · `§` 갈래 공식 이름 · ⑪ 이상 항 보충 · `verifyHangInBody` ①~㉟ + `<N>`(N≥16)). `toCircledDigit`·`lib/legal-verification/`은 무변경(설계 §2.1 구현 정정).
- anchor: `__tests__/korean-law/hang16-circled.test.ts`(실응답 fixture `fixtures/eflaw-income-tax-decree-155-20261001.json`) · `verify-citations.test.ts` +8건. 수정 전 5건 실패 확인 → 수정 후 통과.
- mutation: P-1(꺾쇠 변환 제거) → hang16 1건만 실패 · P-2(시행령 회복 제거) → 4건 실패 · `<N>` 인식 제거 → 1건 · `§` 항 보충 제거 → 2건. 모두 해당 anchor만 실패.
- 실호출: `getApplicableLaw("소득세법 시행령","제155조")` 2026-10-01·2016-03-31 시행본 모두 ⑯ 이후 항 번호 보존(각 ㉕·㉓까지) · `verifyCitations`가 §155 ㉑항·⑳항 verified, 30항 not_found.
- 정적 리뷰(bkit:code-analyzer) 반영 — Medium 2 · Low 2:
  - 「§155⑳·§155①」처럼 raw가 다음 인용까지 붙으면 `parseCitation`이 뒤의 ①을 항으로 잡아 ⑳이 검증되지 않았다 → 「§N」 바로 뒤 원숫자를 우선한다.
  - 「상속세 및 증여세법 시행령」이 「증여세법 시행령」으로 잘렸다 → 시행령·시행규칙 갈래는 「X 및 Y법」을 통째로 읽는다. 잘린 이름도 실호출 조회는 맞는 법령으로 `verified`였다(오탐 아님 · 표시 오류).
  - 「소득세법  시행령」(공백 두 칸) 허용 · 배열형 항내용 테스트 추가.
  - 각 수정에 anchor 추가(수정 전 실패 확인) · 우선순위 되돌림 mutation → 3건 실패 · 「및」 갈래 제거 → 1건 실패.
- 기록만(별건): ① `cleanHtml`이 항 안의 꺾쇠 주석(「삭제 <2022.2.15>」·「<개정 …>」)도 지운다 — 기존 동작. ② 본법 인용 「상속세 및 증여세법 제18조」는 여전히 「증여세법」으로 잡힌다(기존 `LAW_NAME_RE` — 조회는 `verified`). ③ `parseHangNumber`는 ㉑ 이상을 NaN으로 돌려준다(`CIRCLED_DIGIT_MAP` ⑳까지 — 이번 경로는 `circledHangNumber`를 쓴다). ④ `article-parser.ts` 머리 주석의 원숫자 코드 범위 「2487~2498」은 실제 U+2460~2473이다. ⑤ raw에 붙은 뒤 인용(「·§155①」)은 따로 추출되지 않는다 — 기존 `SHORTHAND_RE` 동작.

### 3.1 데이터 계층 — `lib/korean-law/`에 두 클라이언트 추가 (기존 도메인 목록은 건드리지 않는다)

`DECISION_DOMAINS`에 넣으면 `/law` 화면 드롭다운·Zod enum·라우터까지 번진다. 이 기능에 필요한 것은 검색·본문 두 함수뿐이라 **별 파일**로 둔다.

1. `client-cgm-expc.ts` — `searchTaxInterpretations(query, { source: "nts" | "moef", bodySearch?, page?, display? })`
   - `fetchJson("lawSearch.do", { target: ntsCgmExpc|moefCgmExpc, sort: "ddes", … })` · 캐시 30일(기존 `readCacheNonEmpty`/`writeCacheNonEmpty`).
   - 결과: `{ docNo(안건번호 원문), title, date(YYYY.MM.DD.), agency, drfId, ntstDcmId | null, url }` — `ntstDcmId`는 `법령해석상세링크`에서 뽑는다.
   - `findInterpretationByDocNo(docNo, date?)` — **(정정) 쓰임은 추출 단계의 원문 속 번호 대조(3.3)뿐이다.** 카드 검증에는 쓰지 않는다(3.5). 「기획재정부 」 접두사·`[…]` 꼬리 정규화(F-7), 일자 있으면 일자까지 일치해야 채택(생산일자 불일치 대체 매칭은 P0에서 13/13 오매칭이었다).
2. `client-taxlaw.ts` — `getTaxlawDocument(ntstDcmId)`
   - `POST action.do`(F-4) · 타임아웃 10초 · 재시도 1회 · 호출 간격은 F-12 범위(동시성 1~2)로 충분 · **필요한 칸만 잘라** 캐시(2MB 원본을 캐시하지 않는다, F-6).
   - 결과: `{ ntstDcmId, docNo, title, date, gist, answer, body(dcmHwpEditorDVOList — HTML→텍스트, PUA 글리프 제거, F-19), relatedStatutes[], url }`. 심판·판례는 `answer`가 비어 있는 것과 같으므로 본문을 반드시 싣는다(F-5).
   - 비정상 응답(`status !== "SUCCESS"`·`dcmDVO` 없음·HTML 오류 페이지)은 `LawApiError("UPSTREAM")`.
   - ⚠ 문서화되지 않은 내부 엔드포인트다. 바뀌면 이 파일 하나만 고친다. 호출부는 실패를 「확인 불가」로 다룬다(3.5).
3. **문서번호 정규화 키 `docKey(docNo)` — 한 함수로만 비교한다.** 표기가 출처마다 다르다: 카드 `서면-2016-법령해석재산-3189 [법령해석과-2507]` / taxlaw `서면-2016-법령해석재산-3189` / DRF 기재부 `조세정책과-1901`(카드는 `기획재정부 조세정책과-1199 […]`) / DRF 심판 `조심 2025중4302`(카드는 `조심-2010-서-1322`). 키 = `[…]` 꼬리·「기획재정부 」 접두사·공백·하이픈 제거. 인용 가능 집합(3.2)·카드–실시간 중복 제거(3.4)·검증 대조(3.5)가 모두 이 키를 쓴다. 테스트는 카드 docNo 실표기 전 종류(위 4종 + `서면인터넷방문상담4팀-977`·`재일46014-1748`·`심사양도2002-0086`·`대법원-2007-두-8973`)로.

### 3.2 LLM 도구 — `lib/one-house-ai/law-tools.ts` (`betaZodTool`)

| 도구 | 입력 | 실행 | 반환(LLM에게) |
|---|---|---|---|
| `lookup_statute` | lawName · article(「제155조」) · paragraph?(정수) · baseDate?(YYYY-MM-DD) | baseDate 있으면 `getApplicableLaw`(그 날 시행본) · 없으면 `getLawText`(현행) | 조문 제목 · **paragraph가 있으면 그 항만**(원숫자 경계로 자름 — Q-1 (b)면 조 전체를 상한까지) · 시행본 시행일 · 현행과 같은지(`sameAsCurrentText`) |
| `search_interpretations` | query(≤40자) · source(nts·moef·tax_tribunal) · bodySearch? | nts·moef → 3.1-1 · tax_tribunal → `searchDecisions(…, "ttSpecialDecc")` | 목록(문서번호·제목·일자·id) — **본문 없음** |
| `read_interpretation` | source · id(ntstDcmId 또는 DRF id) | nts·moef → `getTaxlawDocument` · 심판 → `getDecisionText(id, "ttSpecialDecc", { full: true })` | 문서번호·일자·요지·회신·본문(상한 N자) |

- **(정정) 판례(`precedent`)는 실시간 출처에서 뺀다.** 세무 판례는 DRF 본문이 막혀 있고 taxlaw로 우회할 id도 없어(F-17) 읽을 수 없다 — 읽지 못한 문서는 인용할 수 없으므로 검색만 비용이다. 판례는 카드 7건으로만 다룬다. 도구 설명에 「판례는 검색할 수 없다」를 적는다.
- 도구 결과는 서버가 **조회 기록**(`LawLookup[]` = 도구·입력·성공/실패·문서번호·url)으로 모아 응답에 싣는다 — 실패도 싣는다(성공만 담으면 실패 사유가 사라진다).
- **인용 가능 집합 = 보낸 카드 ∪ 이번 호출에서 `read_interpretation`이 성공한 문서**(`docKey` 비교). 검색 목록에만 나온 문서는 인용할 수 없다. route의 `droppedCitations` 필터를 이 집합으로 바꾼다.
- **검색어 개인정보**: 검색어는 법령 용어·쟁점 구절만 쓰라고 도구 설명에 적고, 서버는 40자 초과·연속 숫자 6자리 이상(주민번호·전화번호 꼴)이 든 검색어를 `is_error`로 거절한다 — 원문의 성명·주소가 법제처로 나가는 것을 막는다.
- 상한: `max_iterations` — 추출 4 · 의견 8(V-7에서 실측 후 조정). 도구 오류는 `is_error` 결과로 돌려 모델이 계속 진행하게 하고, 기록에 남긴다.
- 스트리밍 요청의 클라이언트 도구이므로 `eager_input_streaming: true`를 켠다 — `betaZodTool`이 입력을 스키마로 검증한다.

### 3.3 사실 추출 단계 (D-1·D-5)

1. **원문 속 인용 대조 — 결정론, LLM 무관.** 추출 route가 원문에서
   - 조문 인용 → `extractCitations`(Q-1 (a) 수정 후) → **원문에 양도일이 있으면 그 날 시행본**(`getApplicableLaw`), 없으면 현행으로 실존·항 확인.
   - 해석례 문서번호(정규식: `서면-YYYY-…-N` · `사전-…` · `기준-…` · `재산세과-N` · `부동산납세과-N` · `기획재정부 재산세제과-N` · `조심-YYYY-서-N` 등 F-7 표기) → `findInterpretationByDocNo`
   를 돌려 `sourceCitations[]`로 응답에 싣는다.
   - **(정정) 라벨은 「환각」이 아니다** — 원문은 사용자가 붙여 넣은 글이다. `확인됨` / `찾지 못함` / `확인 불가(조회 실패)`. 현행 기준으로만 본 「찾지 못함」에는 「현행에 없음 — 과거 조문일 수 있음」을 붙인다(F-15). 문서번호 「찾지 못함」에는 「표기가 다를 수 있음」을 붙인다(교재식 약식 번호 `재산-123` 등은 DRF 안건번호와 표기가 다르다).
2. **용어 정의 조문 조회 — `lookup_statute` 하나만** 추출 LLM에 준다(해석례 도구는 주지 않는다).
   - 프롬프트 규칙 추가: 조문 조회는 **칸의 뜻(용어의 법적 정의)을 확인할 때만** 쓴다. 칸의 **값**은 여전히 원문 `evidence`가 있어야 넣는다 — 조문으로 사실을 만들지 않는다(「적힌 사실만」 원칙 유지). 조회로 판단이 갈리는 사정은 `notes`에 「…(소득세법 시행령 §155⑳ 조회)」처럼 적는다.
   - 기준일: 원문에 양도일이 있으면 그 날, 없으면 현행.
3. 응답 `OneHouseAiExtractData`에 `lawLookups` · `sourceCitations` 추가. 화면(`OneHouseAiExtractDialog`)은 메모 아래에 두 목록을 보여 준다(링크 포함). 적용 후 남기는 `OneHouseAiReview`(현재 `facts·questions·notes·issues` + `sourceText`)에도 싣는다.

### 3.4 참고 의견 단계 (D-1·D-2)

1. 카드 고르기(`selectCards`)는 그대로 먼저 한다.
2. 의견 LLM에 3.2 도구 셋을 모두 주고, 시스템 프롬프트 원칙 3(「받은 카드 docNo로만 인용」)을 바꾸고 규칙을 더한다:
   - **카드가 답하지 못하는 쟁점에 한해** 검색한다(카드 0건이면 검색하라고 명시). 카드와 같은 쟁점을 다시 검색하지 않는다.
   - 인용은 카드 또는 **본문을 읽은** 문서만.
   - **(정정) 조문 확인은 「필요할 때」로 둔다.** 초판은 「조문은 양도일 시행본으로 `lookup_statute`해 확인한 뒤 쓴다」를 강제했다 — 조문 5~10건이면 반복 상한 8을 조회만으로 소진하고(F-18 처음 조회 최대 6.6초/건), 같은 확인을 검증 단계(3.5)가 결정론으로 한다. 보증은 3.5가 맡는다.
   - 도구 결과·카드에 없는 사실·법령 내용을 지식으로 덧붙이지 않는다(F-10) — 필요하면 `factsToConfirm`.
   - 시스템 프롬프트·도구 정의는 고정을 유지한다(캐시 — 도구 정의가 시스템 프롬프트 앞에 놓인다). 카드 수·양도일 등 가변 값은 사용자 메시지에.
3. 출력 스키마:
   - `points[].citedDocNos` 유지 · 서버가 각 인용에 출처(`card` | `live`)·url을 붙여 `OneHouseAiOpinionData.citations`로 돌려준다. `cards` 목록에 더해 `liveDocs`(읽은 문서의 공개 서지) 추가. 실시간 문서가 카드와 `docKey`가 같으면 카드로 표시한다.
   - **(정정) `points[].statutes`를 구조화한다** — `{ law: string, article: number, articleSub?: number, paragraph?: number, item?: number }`. 자유 문자열을 다시 파싱하면 F-14 결함을 그대로 밟는다(「시행령 §155⑳」 → 법령명 「시행령」·항 없음). 화면 표시는 서버·화면 공용 포맷 함수(「소득세법 시행령 §155⑳」)로. 영향: `opinion-schema.ts` · `opinion-prompt.ts` 원칙 7 · `OneHouseAiOpinionPanel`(statutes 표시) · 테스트 2곳(`__tests__/components/one-house/one-house-ai-opinion-panel.test.tsx` · `__tests__/api/one-house-ai-opinion-route.test.ts`).

### 3.5 검증 단계 (D-3) — 별도 route `POST /api/one-house-ai/verify`

**(정정) 별도 route의 근거.** 초판은 「의견 route 안에서 하면 `maxDuration`(120초)을 넘길 수 있다」를 들었다 — 틀렸다. `maxDuration`은 배포 플랫폼이 읽는 값이고(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`), 이 도구는 로컬 개발 서버 전용이다. 근거는 **① 의견을 먼저 보여 주고 검증은 뒤따라 채운다 ② 재검증만 따로 돌린다** 두 가지다. 화면이 의견을 받은 직후 **자동으로** 호출한다(「원문 검증 중」 표시).

입력: `{ form.transferDate, opinion, citations }`. 서버는 카드 docNo를 **서버의 카드 저장소에서 다시 찾아** `ntstDcmId`를 얻는다(화면이 보낸 url을 믿지 않는다). 실시간 문서는 의견 응답이 준 id를 쓴다.

1. **결정론 단계**(서버, LLM 없음)
   - 조문: 의견의 모든 `statutes[]`(구조화) → 양도일 기준 `getApplicableLaw`로 실존·항 존재(Q-1 (b)면 조까지)·현행과 같은지. 동시성 4(`verifyCitations`와 같은 상한, F-18). 결과 `verified` / `not_found` / `failed`. 양도일이 없으면 현행 기준으로 하고 그 사실을 표시한다.
   - 해석례: **(정정)** 인용 가능 집합 필터(3.2)를 거친 인용만 남으므로 「지어낸 번호」는 여기 오지 않는다 — 초판의 「not_found(환각)이면 지운다」 분기는 해석례에 대해서는 도달하지 않는다. 해석례 단계의 일은 **원문을 다시 받는 것**과 **id 어긋남 감지**다: 카드·실시간 모두 `getTaxlawDocument(ntstDcmId)`(심판 실시간은 `getDecisionText`) → 받은 문서번호·일자가 `docKey`·일자로 맞는지(F-12에서 30/30 일치). 어긋나면 `mismatch`로 표시하고 2차 대조에 보내지 않는다.
   - 조문 `not_found`는 의견에서 그 조문을 지우지 않고 「시행본에 없음」으로 표시한다(판단은 사용자). `failed`(조회 실패)는 **통과로 치지 않는다** — 「확인 불가」.
2. **LLM 2차 대조**(도구 없음 · 구조화 출력 · effort high)
   - 입력: 쟁점별 의견 문장 + 그 쟁점이 인용한 원문 발췌(해석례 요지·회신·본문 일부 · 조문은 인용 항). **카드 요약이 아니라 방금 받은 원문**을 준다.
   - 출력: 쟁점마다 `support: supported | partial | not_supported | cannot_verify` · 한두 문장 사유 · 원문에 없는 주장이 있으면 그 구절.
   - 원문을 못 받은 쟁점·인용이 없는 쟁점은 LLM에 보내지 않고 `cannot_verify`.
3. 화면(`OneHouseAiOpinionPanel`): 쟁점마다 배지(원문 일치 · 일부 일치 · 원문과 다름 · 확인 불가) + 펼치면 원문 발췌·링크. 「원문과 다름」은 숨기지 않고 경고로 보여 준다(판단은 사용자 — 톤은 설계 문서 §4). 비용 표시는 의견·검증 합산. 검증 결과도 그 검증을 낳은 의견에만 붙는다(의견이 바뀌면 버린다 — 의견이 result에만 붙는 현행 규칙과 같다).

### 3.6 실패·비용·공개

- 외부 조회 실패(법제처 주말·야간 차단, taxlaw 변경)는 도구 `is_error` → 모델은 카드만으로 계속, 검증은 「확인 불가」. 어떤 경우에도 조회 실패를 「검증 통과」로 바꾸지 않는다(부정형 단언 — anchor + mutation P-5, §6).
- 비용: 도구 루프는 반복마다 usage가 쌓인다 — 반복별 usage를 합산해 기존 `OneHouseAiUsageCost`(`{ input, cacheRead, cacheWrite, output }`)에 넘긴다. 모델은 마지막 반복의 `model`(fallback이면 바뀔 수 있다).
- 화면에 보이는 실시간 자료는 **공개 원문**(국세청·법제처)이다. 교재 파생 카드 칸은 지금처럼 화면에 내지 않는다.
- 접근 게이트·rate limit은 기존과 같다(로컬 개발 서버 전용). verify route도 같은 게이트를 건다.

## 4. 미검증 레지스터 (V-n)

| # | 항목 | 상태 · 판정 근거 | 설계 영향 |
|---|---|---|---|
| V-1 | toolRunner + 구조화 출력 | ✅ F-9 | — |
| V-2 | `getApplicableLaw` 지연 | ✅ F-18 — 처음 0.67~6.6초/건, 캐시 1~3ms. 부칙 생략 불필요 · 동시성 4 · 의견 단계 조문 확인 강제 철회(3.4) | 반영 완료 |
| V-3 | taxlaw 연속 호출 차단·지연 | ✅ F-12 — 30/30 성공, 차단 없음. robots.txt 대상 아님(F-16). ⏳ **이용약관 본문은 미확인** — 설계 영향 없음(내부 도구 · 저빈도 · 캐시) | 없음 |
| V-4 | HTML 정제 | ✅ F-19 — 단순 정제로 충분. ⏳ E001 나머지 누락 5줄은 PR-1 fixture 작성 때 확인 | 없음 |
| V-5 | 기재부 DRF 최신성 | ✅ F-2 정정 — 2026.09.까지 있음. ⏳ 완전성은 확인 불가(taxlaw 검색 robots 차단) — 도구 설명·화면에 「기재부 해석은 법제처 수록분만 검색」을 적는다 | 문구 1줄 |
| V-6 | 심판·판례 본문 경로 | ✅ F-17 — 심판 DRF 본문 6/6 정상 · 세무 판례 DRF 본문 0/6 · id 없음 ⇒ 실시간 판례 제외(3.2) | 반영 완료 |
| V-7 | 도구 루프 비용·시간 — 카드 0건 사례 / 카드 충분 사례 각 1회 | ✅ 2026-10-22 실호출(route 직접 호출). 아래 표. 카드 충분 사례가 카드 10장을 받고도 검색 8회(그중 0건 6회 — 긴 구절을 제목 검색에 넣음)였다 ⇒ **요청당 검색 4회 상한** + 「핵심어 2~4개 · 0건이면 본문 검색 1회」 도구 설명 | 상한 값만(구조 불변) |
| V-8 | 추출 LLM이 `lookup_statute` 결과로 칸 값을 만들어 내지 않는가(D-5 위험) | ✅ 1차(2026-10-22 오전) 용어 경계 원문 3건: 28칸 모두 원문 근거 · 조문 조회 0회 → 「조회했을 때」는 미관측이었다. ✅ **재관측(같은 날)**: 조문 정의가 갈리는 원문 4건 × 2라운드(그대로 · 「조문 확인」 요청 한 줄)에서 조회 5회. 근거를 지어낸 칸은 0이었지만 **경계 3회**가 나왔다 — 「중증질환자로 등록」을 §155④ 정의를 거쳐 `parentalCareParentAge = care_benefit`으로(2회, 특례 성립 방향), 「취득한 아파트」를 §155⑳의 「매입임대」 틀로 `rentalAcquisitionType = purchase`로(1회). 조회와 무관하게 원문에 없는 사업자등록일을 등록일로 채우기도 했다 ⇒ **추출 규칙 11~13 추가**(조문 정의·해석으로 이어야만 되는 값은 넣지 않고 묻는다 · 따로 적히지 않은 날짜를 다른 날짜로 채우지 않는다 · 질의 문장은 「선언」 칸에만). 같은 8회 + 회귀 3건 재실행: 경계 값 3종·날짜 추정 모두 비우고 질문으로 돌림, 77칸 전부 원문 근거, 조회 7회. 회귀 E176 9→7칸 · E089 9→7칸(날짜 없는 칸을 질문으로) · E139 10→11칸 | 도구 유지(철회 불필요) |
| V-9 | Q-1 (a)의 회귀 표면 — `/law` 행위시법 E2E fixture가 16항 이상 조문을 쓰는가 · PR-0 전후 `verify:legal` 결과가 같은가 | ✅ PR-0(2026-10-22): E2E 법령 fixture(`e2e/_fixtures/law/`)는 route 응답 mock이고 `<16>` 표기를 담은 파일이 없다 · `verify:legal` 수정 전 421 통과/0/0 → 수정 후 같은 421건, 항목별 결과 diff 0 | 없음 |

## 5. 작업 분할 (PR)

| PR | 내용 | 검증 |
|---|---|---|
| PR-0 | (Q-1 (a)일 때) 공용 법령 모듈 결함 2건 — 3.0 | `npx vitest run __tests__/korean-law/` · `npm run verify:legal` · P-1·P-2 |
| PR-1 | `client-cgm-expc.ts` · `client-taxlaw.ts` · `docKey` + 단위 테스트(**실응답 원문 fixture** — 손으로 만든 JSON 금지, CLAUDE.md 법제처 fixture 규칙. 해석 응답은 2.1MB라 **`trilPsagList`만 뺀 실응답**을 쓰고 나머지 칸은 원문 그대로 둔다 · 공개 문서만 · 교재 문구 없음) | vitest |
| PR-2 | `law-tools.ts` · 의견 단계 도구 루프(3.4) · 인용 가능 집합 · `statutes` 구조화 · 응답 `citations`·`liveDocs`·`lawLookups` · 화면 조회 기록 | vitest(도구 실행·필터 — LLM은 mock) · P-3·P-4 · V-7 실호출 |
| PR-3 | `/api/one-house-ai/verify`(3.5 결정론 + LLM 2차) · 패널 배지·발췌 | vitest(결정론 분기 전부·LLM mock) · P-5·P-6 · 실호출 1회 |
| PR-4 | 추출 단계(3.3) 원문 인용 대조 + `lookup_statute` · 대화창 표시 | vitest · V-8 |

- 각 PR: `npx tsc --noEmit` · `npx vitest run __tests__/lib/one-house-ai/ __tests__/api/one-house-ai-extract-route.test.ts __tests__/api/one-house-ai-opinion-route.test.ts __tests__/components/one-house/ __tests__/korean-law/` · 브라우저 확인(Playwright — 원문 붙여 넣기 → 추출 → 판정 → 의견 → 검증 배지, Network 탭 응답 확인).
  (정정 — 초판의 `__tests__/lib/korean-law/`는 `sigungu-codes.test.ts`만 있는 다른 폴더다. 법령 모듈 테스트는 `__tests__/korean-law/`, route 테스트는 `__tests__/api/`에 있다.)
- vitest는 외부 호출을 하지 않는다(fetch mock + fixture — `vi.stubGlobal` 등을 쓰는 파일은 `vitest.config.ts`가 `node-isolated`로 보낸다). 실호출은 PR 설명에 결과·비용과 함께 적는다.
- 파일 크기: 새 파일은 각 ≤300줄 목표. 기존 route 2개는 102·148줄, 패널 184줄이라 여유 있음.

### 5.1 구현 결과 — PR-1~PR-4 (2026-10-22)

**(정정) PR 분할**: 계획은 PR-1~PR-4 네 개였다. 구현 당일 개발 Mac의 부하 평균이 90~105(다른 워크트리 테스트)여서 타입 검사 한 번이 14분, pre-push 전체 테스트가 그 몇 배였다. 사용자 지시(「계획서 끝까지 단일 응답 완주 · 필요하면 머지」)에 따라 **PR 하나에 커밋을 단계별로 나눠** 올렸다 — 리뷰 단위는 커밋으로 남는다.

구현이 설계와 달라진 점(설계 문서도 함께 고쳤다):
- PR-1 실측 추가
  - DRF 목록의 `ntstDcmId`는 `2000…` 체계로, 카드의 `0100…`와 다르지만 taxlaw 본문 요청이 둘 다 받는다(3건 실측).
  - 없는 id는 `SUCCESS` + `dcmDVO: null`로 온다 → null. 「없음」은 캐시하지 않는다(정적 리뷰 반영 · 0건 미캐시 정책).
  - DRF 응답 루트가 없거나 `resultCode`가 `00`이 아니면 「0건」이 아니라 실패로 처리한다(정적 리뷰 High).
  - 문서번호 검색은 부분 일치다(「조세정책과-69」 → -695·-697) → `docKey` 일치만 채택. 결과가 한 쪽(100건)을 넘었는데 못 찾으면 「없음」이 아니라 확인 불가로 처리한다.
  - 일자를 해석하지 못하면 일자 조건을 버리지 않고 오류로 처리한다. 화면 표기 `YYYY-MM-DD`도 받는다.
  - 상세 링크는 `https://taxlaw.nts.go.kr/`만 받는다(href 주입 방지).
  - fixture: 국세청 직원 내부 id 칸 28곳을 `SENSITIVE_STAFF_ID`로 가렸다(기존 fixture의 `SENSITIVE_*` 선례).
  - 실호출: 카드 문서번호 찾기 20/20 · 본문 15/15(번호·일자 일치) · 캐시 파일 최대 20KB.
- PR-2
  - 공통 상수·오류는 `lib/one-house-ai/model.ts`로 옮겼다. `extract.ts`가 재수출해 기존 import 경로를 유지한다. `extract`↔`tool-run` 순환을 끊기 위해서다.
  - `ReadDoc`에는 발췌를 싣지 않는다. 검증 단계가 원문을 다시 받는다.
  - 결과 보기를 `OneHouseAiOpinionView.tsx`로 분리했다. 조회 기록은 `OneHouseAiLawLookups.tsx`로 의견과 추출이 함께 쓴다.
  - `maxDuration`은 그대로(120)다. 로컬 전용 도구라 적용되지 않는다(R-7).
- PR-3
  - 2차 대조는 도구 없는 단발 호출 `runStructured`로 한다.
  - 2차 대조 호출이 실패해도 결정론 결과는 돌려준다. 쟁점은 확인 불가다.
  - 배지는 `OneHouseAiVerifyBadge.tsx`에 둔다. 비용은 같은 모델일 때 의견과 검증을 합산한다.
- PR-4
  - 원문 속 해석례 번호는 국세청·기재부 해석만 대조한다. 조세심판·판례 번호는 DRF로 번호 조회가 되지 않아 대조 대상에서 뺐다.
  - 원문 대조는 **추출된 양도일**을 기준일로 쓴다.

### 5.2 실호출 결과 (2026-10-22 · route·함수 직접 호출 · 부하 평균 90~105 상태라 시간은 과대)

| 사례 | 소요 | 비용(정가 추정) | 조회 | 결과 |
|---|---|---|---|---|
| 의견 A — 카드 충분(일시적 2주택·분양권, 카드 10장) | 93초 | $0.94(입력 187k) | 검색 8(0건 6) · 본문 2 · 조문 1 | 인용 카드 1 + 실시간 1 · 지운 인용 0 |
| 검증 — A의 의견 | 28초 | $0.10 | 조문 4건 시행본 재조회(§156의3⑩ 포함 전부 확인됨) · 해석례 2건 원문 받음 | 쟁점 3건 모두 「원문 일치」 |
| 의견 B — 카드 0건(공동상속 소수지분 → 조합원입주권) | 38초 | $0.13 | 검색 2 · 조문 2 · 본문 1 | 읽은 1건만 인용 · 결론 「달라질 수 있음」 |
| 추출 ×3(E176·E089·E139 원문) | 30~45초 | $0.08~0.39 | 조문 0 | 28칸 근거 전부 원문 구절 |

- A의 비용은 반복마다 다시 보내는 입력이 대부분이다 → 검색 상한 4회로 줄였다(재측정은 하지 않았다).
- 정적 리뷰(PR-2~4) 반영 — Medium 2:
  - 의견을 다시 받는 중에 옛 검증이 새 의견의 결과·로딩 표시를 덮던 경합 → 의견 단위로 묶었다. anchor와 mutation으로 확인했다.
  - 한 쟁점의 인용 중 일부만 확인됐는데 「원문 일치」가 나오던 것 → 최대 「일부 일치」로 낮춘다. anchor와 mutation으로 확인했다.
- 정적 리뷰 반영 — Low:
  - 화면 문서번호 대조를 `docKey`로 바꿨다.
  - 문서번호가 빈 문서는 읽은 문서로 치지 않는다.
  - 검색어 보호 기준을 하이픈만 지운 9자리 이상으로 바꿨다(날짜 허용).
- 기록만:
  - 응답 본문 파싱 실패가 「네트워크를 확인하세요」로 안내된다. 성공으로 둔갑하지는 않는다.
  - 추출 뒤 원문을 고치고 적용하면 참고 의견에 넘어가는 원문이 바뀐다. 이번 변경 전부터 있던 동작이다.

## 6. 안전망 (mutation probe)

**착수 전 실측(2026-10-21)**: 의견 route의 인용 필터(`known.has(d)`)를 `true`로 바꾸면 `__tests__/api/one-house-ai-opinion-route.test.ts`의 「관련 카드만 넣고, 받지 않은 문서번호 인용은 지우며…」 **1건만** 실패한다(`__tests__/lib/one-house-ai/` 74건은 전부 통과). ⇒ PR-2가 이 필터를 바꿀 때 그 테스트의 의도(받지 않은 번호 삭제)를 유지하고, 새 집합의 양쪽 경계를 anchor로 더한다.

| P-n | 무력화 대상 | 실패해야 할 anchor |
|---|---|---|
| P-1 | (PR-0) `<NN>` → 원숫자 변환 제거 | 16항 이상 항 번호 보존 |
| P-2 | (PR-0) `recoverLawName`의 「X법 시행령」 분기 제거 | 시행령 인용 추출 |
| P-3 | (PR-2) 인용 가능 집합에 「검색만 한 문서」를 넣음 | 검색 목록에만 나온 번호는 지운다 |
| P-4 | (PR-2) 인용 가능 집합에서 「읽은 문서」를 뺌 | 본문을 읽은 문서 인용은 남긴다 |
| P-5 | (PR-3) 조회 실패(`failed`)를 `verified`로 집계 | 조회 실패는 「확인 불가」 — 통과로 치지 않는다 |
| P-6 | (PR-3) 문서번호·일자 대조 생략 | id 어긋남은 `mismatch`, 2차 대조에 보내지 않는다 |

**구현 후 실측(2026-10-22)** — 6종 모두 해당 anchor만 실패했다.

| P | 결과 |
|---|---|
| P-1 | 1건 실패 |
| P-2 | 4건 실패 |
| P-3 | 2건 실패 |
| P-4 | 1건 실패 |
| P-5 | 1건 실패 |
| P-5b | 2건 실패 |
| P-6 | 1건 실패 |

P-5b는 「받지 못한 원문도 2차 대조로 보냄」이다. 리뷰 반영분 2종(검증 경합 가드 제거 · 일부 확인 쟁점 상한 제거)도 각각 해당 anchor 1건만 실패했다. PR-1 클라이언트 mutation 5종(번호 대조 제거 · 일자 대조 제거 · 실패를 없음으로 · 없음 처리 제거 · status 검사 제거)도 모두 잡혔다. 처음에는 status 검사 제거가 살아남아 테스트를 보강했다.

## 7. 범위 밖 (하지 않는 것)

- 판정 엔진·판정 메뉴 입력·14지점 변경 — 없음.
- 카드 재작성·교재 자료 커밋 — 없음(카드는 그대로 읽기 전용).
- `/law` 화면에 국세청 해석 탭 추가 — 이 기능과 별건(필요하면 3.1 클라이언트를 재사용해 따로).
- 원격 KoreanLaw MCP 연결 — D-4로 기각.
- 실시간 판례 검색 — F-17로 불가(카드 판례 7건만).

## 8. 자가 검토 기록 (plan-design-self-review-loop)

### 1회차 (STEP 1~4, 2026-10-21)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| R-1 | 오류 | Critical | `lib/korean-law/verify-citations.ts` `recoverLawName` · `lib/legal-verification/citation-parser.ts` 항 패턴 | 초판 3.3·3.5가 기댄 인용 추출이 「소득세법 시행령 제155조 제20항」을 0건으로, 「§155⑳」을 법령명 「시행령」·항 없음으로 읽는다(F-14) — 검증이 **조용히 0건 통과** | 의견 `statutes` 구조화(3.4) · 원문 대조는 PR-0 수정 후(3.0) · Q-1 |
| R-2 | 오류 | Critical | `lib/korean-law/article-parser.ts` `cleanHtml`(시행본) · `lib/legal-verification/korean-law-client.ts` `fetchArticle`(현행) | DRF `<16>` 항번호가 시행본 경로에서 지워지고 현행 경로에서는 `<16>` 그대로 남는다(F-13) — 1주택 핵심 항(§155⑯~㉒)의 항 단위 검증·발췌 불가, `/law` 행위시법 패널 결함 | 3.0 · Q-1 |
| R-3 | 오류 | High | 3.3-1 | `verifyCitations`는 현행 조문 기준 — 과거 조문 인용을 「환각」으로 표시(F-15: 장기임대 ⑳→㉑) | 양도일 시행본 기준 · 라벨 「확인됨/찾지 못함/확인 불가」 + 「현행에 없음 — 과거 조문일 수 있음」 |
| R-4 | 모순 | High | 3.5-1 해석례 | 인용 가능 집합 필터 뒤라 「지어낸 번호」 분기는 도달 불가 · 카드 확인에 `findInterpretationByDocNo`는 불필요(F-8·F-12) | 원문 재수신 + id 어긋남 감지로 재정의 · `findInterpretationByDocNo`는 3.3 전용 |
| R-5 | 누락 | High | 3.2 `precedent` | 세무 판례는 DRF 본문 0/6 · id 없음(F-17) — 읽을 수 없어 인용도 못 하는 출처 | 실시간 판례 제외 |
| R-6 | 누락 | High | 3.1 · 3.2 · 3.5 | 출처마다 문서번호 표기가 다른데 비교 규칙이 없다 | `docKey` 단일 함수 + 실표기 테스트 |
| R-7 | 오류 | Medium | 3.5 머리 | `maxDuration` 근거 — 배포 플랫폼 값이라 로컬 전용 도구에는 무관 | 근거를 「의견 먼저 표시 · 재검증 단독 실행」으로 |
| R-8 | 모순 | Medium | 3.4-2 | 조문 확인 강제가 반복 상한 8과 충돌, 3.5와 중복 | 「필요할 때」로 완화 |
| R-9 | 오류 | Medium | F-2 · V-5 | 기재부 최신성 의심은 검색어 탓 | F-2 정정 · V-5 해소 |
| R-10 | 정책위반 | Medium | 3.2 | LLM 검색어에 원문 성명·주소가 실려 법제처로 나갈 수 있다 | 도구 설명 규칙 + 40자·연속 숫자 6자리 서버 거절 |
| R-11 | 오류 | Medium | 5 검증 명령 | `__tests__/lib/korean-law/`는 다른 폴더 · route·패널 테스트 누락 | 실제 경로로 |
| R-12 | 누락 | Medium | 3.6 · 5 | 부정형 단언(「조회 실패를 통과로 바꾸지 않는다」)·필터 변경에 안전망 계획 없음 | §6 P-1~P-6 · 착수 전 실측 기록 |
| R-13 | 개선 | Medium | 3.2 `lookup_statute` | §155 시행본 8,299~12,506자 — 통째로 주면 토큰 낭비 | `paragraph` 입력 · 그 항만 반환 |
| R-14 | 누락 | Low | 3.1-2 | 심판·판례는 회신 칸이 빈 셈(F-5) | 본문 필수 |
| R-15 | 개선 | Low | 5 PR-1 | 해석 응답 2.1MB fixture | `trilPsagList`만 뺀 실응답 |
| R-16 | 개선 | Low | 3.2 | 스트리밍 + 클라이언트 도구 | `eager_input_streaming: true` |
| R-17 | 누락 | Low | 머리 | 워크트리 기준이 origin/master보다 2커밋 뒤 | rebase 명시 |

**판정 뒤집힘 4건**: R-4(해석례 검증의 역할) · R-5(실시간 판례 제외) · R-7(별도 route 근거) · R-8(조문 확인 강제 철회). 초판 사실 정정 1건: F-2.

### 재검토 (STEP 3 — 정정 파급)

정정으로 바뀐 이름: `statutes`(구조화) · `docKey` · `precedent`(삭제) · `findInterpretationByDocNo`(용도 축소) · `paragraph`(신규 입력).

- `statutes` 참조처 실측(grep): `opinion-schema.ts` · `OneHouseAiOpinionPanel.tsx`(표시) · 테스트 2곳 — 3.4-3에 전부 적었다. 프롬프트 원칙 7(조문 표기)도 같이 바꾼다.
- `precedent` 삭제 → 3.2 표 · §7에 반영. 카드 판례 7건은 그대로 인용 가능(3.5 해석례 단계가 `ntstDcmId`로 원문을 받는다 — F-12 판례 4/4 성공).
- `findInterpretationByDocNo` → 3.1-1·3.3-1·3.5-1 세 곳의 서술이 서로 맞는다.
- `paragraph` → Q-1 (b)이면 항 자르기를 못 한다 — 3.2 표에 분기를 적었다.
- **정정 1건**: 1회차 R-2는 「`/law` 화면에서 항 번호가 사라진다」고 적었다 — **불완전했다.** `getLawText`를 실측하니 현행 경로는 `<16>`을 글자 그대로 남겼다. 지우는 것은 시행본 경로뿐이다 ⇒ F-13·R-2·Q-1·3.0-1을 「두 경로가 다르게 망가진다」로 고쳤다. 방향(PR-0에서 고친다)은 그대로다. (「둘 다 원숫자로 통일」은 설계 검토 D-1에서 다시 기각 — 아래.)
- 그 밖의 새 문제 0건.

1회차 종료 시 verdict는 `blocked`(Q-1 미결정)였다 → 2026-10-21 Q-1 (a) 결정.

### 설계 문서 (STEP 5~9)

산출물 게이트 조건 1(여러 PR — PR-0~PR-4) 충족 → [`docs/02-design/features/one-house-ai-live-law.design.md`](../02-design/features/one-house-ai-live-law.design.md) 생성(타입·시그니처·프롬프트 문안·화면 배치·테스트·상수).

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| D-1 | 오류 | High | 설계 §2.1 초안 「`client-law.ts` 현행 조립부」 | `getLawText`의 조립은 `lib/legal-verification/korean-law-client.ts`의 `fetchArticle`이다 — `verify:legal`과 같은 함수. 현행 경로까지 원숫자로 통일하면 법령 검증 파이프라인이 회귀 표면이 된다 | **현행 경로 무변경** · 읽는 쪽(`verifyHangInBody`·`sliceParagraph`)이 원숫자와 `<NN>`을 둘 다 받는다(3.0-1 정정) |
| D-2 | 정책위반 | Medium | 설계 §4 배지 톤 | `tones.ts`의 rose는 「지역·지정」 의미(파일 머리 주석·components/calc/CLAUDE.md 톤 표) | 「원문과 다름」은 같은 컴포넌트군의 `role="alert"` 경고 문구 패턴 |
| D-3 | 오류 | High | 3.0-2 초안 「`citation-parser.ts` 항 패턴 확장」 | 그 파서는 `verifier.ts`(verify:legal)·`coverage.ts`(커버리지 게이트 테스트)·`scripts/warmup-legal-cache.ts`가 함께 쓴다 — 항이 새로 잡히면 커버리지 키가 바뀐다 | `citation-parser` 무변경 · `extractCitations` 안에서 ⑪ 이상 항 보충(3.0-2 정정) |
| D-4 | 누락 | Medium | 설계 §2.1 | 시행본 조문 캐시가 옛 포맷(항 번호 없음)이면 개발 환경만 옛 결과로 통과한다 | 캐시 키 버전 접미사(`_v3` 선례) |
| D-5 | 누락 | Low | 설계 §2.3 | `betaZodTool` 옵션에 `eager_input_streaming`이 없다(SDK `helpers/beta/zod.d.ts`) · 도구 오류 표준은 `ToolError`(`lib/tools/ToolError`) | 반환 객체에 붙이고 실호출 확인 · 오류는 `ToolError` |
| D-6 | 개선 | Low | 설계 §1 | 패널 184줄에 배지·발췌·조회 기록을 더하면 300줄 초과 | `OneHouseAiOpinionView` 선분리(동작 무변경 이동) |
| D-7 | UI누락 | Low | 설계 §4 | 375px 넘침·펼치기 패턴 미기재 | `flex-wrap`·`break-words` · 기존 `<details>` 패턴 |

**판정 뒤집힘 2건**: D-1(현행 경로 통일 기각) · D-3(`citation-parser` 수정 기각). 둘 다 「공용 결함을 고친다」는 Q-1 방향은 유지하고 **고치는 자리**를 좁혔다.

재검토(STEP 8, 파급): 바뀐 이름 「현행 경로」·「citation-parser」·「rose」를 두 문서에서 grep — 계획 3.0-1·3.0-2·3.0-3·3.5-3·R-2·V-9, 설계 §1·§2.1·§2.3(`sliceParagraph`)·§4·§5 PR-0 행을 모두 맞췄다. `toCircledDigit`·`parseHangNumber`의 다른 소비자는 없다(grep — `verify-citations.ts`만). `formatArticleUnit` 소비자는 `applicable-law.ts`뿐이다. 새 문제 0건.

### 통합 비교 (STEP 10~11)

| 정합 축 | 계획 | 설계 | 판정 |
|---|---|---|---|
| 클라이언트 시그니처(검색·본문·`docKey`) | 3.1 | §2.2 | ✓ |
| 도구 입력(`paragraph`·source 3종) · 판례 제외 | 3.2 | §2.3 · §3.1 고정 문구 | ✓ |
| `statutes` 구조화 · 영향 파일 4곳 | 3.4-3 | §2.3 · §5 | ✓ |
| 검증 요청·응답 · 카드 id를 서버가 다시 찾음 | 3.5 | §2.4 | ✓ |
| 원문 대조 라벨(확인됨/찾지 못함/확인 불가 + note) | 3.3-1 | §2.5 | ✓ |
| 부정형 단언 → mutation | 3.6 · §6 P-1~P-6 | §5 mutation 열 | ✓ |
| 테스트 경로 | §5 | §5 | ✓ |
| 14 동기화 지점 | 해당 없음(엔진 input/result 무변경) | — | ✓ — PR마다 `git diff --stat`에 `lib/tax-engine/`·`lib/calc/` 없음을 확인한다 |

### UI 설계 (STEP 12~13)

새 UI 요소 5개(배지·발췌·실시간 문서·조회 기록·원문 인용 대조)로 게이트 조건 2에 닿지만, 배치는 설계 문서 §4 한 절로 충분해 **별 UI 문서는 만들지 않았다**(같은 내용의 문서를 둘로 나누지 않는다). §4 검토 결과는 D-2·D-7.

### verdict: `clean`

- 미해소 Critical/High 0 · 재검토 새 문제 0 · Q-1 결정됨
- 남은 V-n: V-3·V-4·V-5의 일부(설계 영향 없음), V-7·V-8·V-9(각 PR 안에서 닫힘)
- 판정 뒤집힘 합계 6건(계획 4 · 설계 2) · 안전망 실측 1건(인용 필터 → 1건 실패)
- 다음: `pre-do-anchor-verification` → PR-0 착수.
