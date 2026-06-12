# law-research-v3 Planning Document

> **Summary**: `/law` 법령 리서치를 업스트림 korean-law-mcp **v4.4.0** 수준으로 재고도화 — 행위시법 판단(applicable_law)·두 시점 신구대조(time_travel)·판례 생사 확인(cite_check)·조문 영향 그래프(impact_map)·법령 현행성 가드 5대 신기능
>
> **Project**: korean-tax-calc
> **Version**: 0.1.0
> **Author**: kwonohjik
> **Date**: 2026-06-12
> **Status**: Draft
> **Worktree**: `.claude/worktrees/koreanlaw-imp` (`feat/koreanlaw-imp`, dev 3002 / E2E 3102)
> **선행 사이클**: law-research-v2 (2026-04-19 완료, Match Rate 97%) — 업스트림 **v3.3.1** 기준 5대 격차 해소

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | v2가 동급화한 기준점(v3.3.1, 2026-04) 이후 업스트림이 **v4.4.0**까지 진화. v4.0(영향 그래프·시점 비교)·v4.3(판례 생사·행위시법) 킬러 기능 4종이 우리 구현에 부재. 특히 **행위시법 판단**은 양도일·상속개시일 "당시 시행 법령"을 다루는 세금 앱의 본질적 니즈인데 미지원 |
| **Solution** | 5개 독립 Phase: (A) applicable_law 행위시법 판단 (B) amendment_track의 "Phase 2 예정" 안내문을 실제 두 시점 신구대조로 완성 (C) cite_check 판례 후속 인용 확인 (D) impact_map 조문 역방향 영향 탐색 (E) 현행성 가드 라벨 + v2 잔여 정리 |
| **Function/UX Effect** | "2021년 시행 소득세법 89조" 질의 → 그 시점 시행 조문 + 부칙 경과규정 / 개정 전후 본문 diff / 판례에 "후속 인용 검토" 배지 / 조문 클릭 한 번으로 관련 판례·해석례·자치법규 역추적 |
| **Core Value** | 세금 계산(과세시점 법령)과 법령 리서치(현행 법령)의 간극 해소 — 업스트림 동급 + 세법 특화 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 사용자 지시: "korean-law mcp 수준으로 리서치 품질 고도화". 업스트림 v4.4.0 실사(README) + 로컬 grep 실측으로 갭 5종 확정 |
| **WHO** | 과거 과세연도 법령을 확인해야 하는 세무 실무자(행위시법·신구대조) + 판례 신뢰성 검증이 필요한 리서처(생사 확인·영향 그래프) |
| **RISK** | 법제처 시행일자별(eflaw)·연혁 API의 정확한 파라미터 **미확인** — Do 전 probe 필수. 판례 생사 판정은 키워드 휴리스틱이라 오탐 가능 → 단정 표현 금지(법령 정확성 최우선 정책). API 호출량 증가(영향 그래프는 다건 검색) → 캐시·rate limit 설계 필요 |
| **SUCCESS** | Phase별 SC 충족 + 신규 모듈 단위 테스트 + Playwright E2E + 기존 167 korean-law 테스트 무회귀 |
| **SCOPE** | Phase A→B→C→D→E 권장 순서, **각 Phase 독립 1 PR** (선행 Phase 미머지여도 진행 가능하게 모듈 분리). 외부 LLM 의존 없음(v2 원칙 유지). 세금 엔진(`lib/tax-engine/`) 무관 — 14 동기화 지점 비대상 |

---

## 1. 현황 실측 (2026-06-12, 전 항목 검증 완료)

### 1.1 이미 업스트림 동급인 것 (재작업 금지)

| 영역 | 근거 |
|---|---|
| 판례 도메인 **17종** (조세심판원 `ppc` 포함) | `lib/korean-law/types.ts:23-41` `DECISION_DOMAINS` — prec·detc·expc·admrul·ppc·fsc·ftc·nlrc·kcc·pipc·oia·acr·ordin·public·nhrc·trty·lawnkor |
| 체인 **8종** (law_system·document_review 포함) | `types.ts:249-258` `CHAIN_TYPES` — 업스트림 v4.4 `legal_research` 8 task와 1:1 동일 |
| 시나리오 자동 확장 8종 | `lib/korean-law/scenarios/` 8파일 + `chains.ts` `detectScenarios` 부착 |
| 판례 응답 축약 (업스트림 74% 절감 대응) | `lib/korean-law/compact.ts` — upstream decision-compact.ts 이식 명시 |
| 별표 본문 파싱 | `annex-body-parser.ts`(348줄) + `annex-pdf-parser.ts`(182줄) + `app/api/law/annexes/parse` |
| Query Router 13종·구조화 참조·아코디언·칩·모달 | v2 완료 + 2026-06-12 PR #148(조문 팝업·제 생략 패턴) |

### 1.2 갭 확정 (v4.4.0 대비 미구현 — grep 실측 0건)

| # | 업스트림 기능 (도입 버전) | 우리 상태 (근거) | 세금 앱 적합도 |
|---|---|---|---|
| **G1** | `applicable_law` — 기준일에 시행 중이던 조문 특정 + 부칙 경과규정 자동 발췌 (v4.3) | 미구현. 법제처 API `target: "law"` 단일 사용(`client-law.ts:183`) — 시행일자별(eflaw)·연혁 미사용. "부칙\|경과규정" grep 0건 | ★★★ 최고 — 양도일·상속개시일·취득일 당시 법령이 세액 결정 |
| **G2** | `time_travel` — 두 시점 본문 자동 diff (v4.0) | 미구현. `amendment_track` 체인이 "개정 전문 대조는 **Phase 2에서 제공 예정**" 안내문만 반환(`chains.ts:240-243`) — 공포 이력 5건 + 판례 타임라인 수준 | ★★★ — 세법 개정 추적은 단골 질의 (라우터 `amendment_track` 패턴 기연결) |
| **G3** | `cite_check` — 판례 생사 확인: 후속 인용 역추적으로 변경·폐기 감지, 한국형 Shepard's (v4.3) | 미구현 (grep 0건) | ★★ — 폐기된 판례 인용 방지 |
| **G4** | `impact_map` — 조문 영향 그래프: 판례·해석례·자치법규 역방향 탐색 + 다이어그램 (v4.0) | 미구현 (grep 0건) | ★★ — 조문 개정 파급 확인 |
| **G5** | 법령 현행성 가드 — `[현행]` / `⚠️[연혁-과거버전]` 라벨 (v4.4) | 미구현. "현행\|연혁" grep 0건 (`markers.ts`·`client-law.ts`) | ★★ — G1·G2와 동일 데이터로 소규모 구현 |

비적용 판정: 업스트림 v4.4의 도구 통폐합(9개 노출)은 **MCP 컨텍스트 절감** 목적 — 우리는 웹 UI라 무관. HWPX·XLSX kordoc 변환은 기존 별표 파서로 대체 충분.

### 1.3 v2 잔여 이월 항목 (전부 Low — Phase E에서 선택 처리)

가상 스크롤(FR-13)·NotFoundSection 분리·CLAUDE.md `/law` 섹션 갱신·application 레이어 분리 (출처: `docs/04-report/law-research-v2.report.md` §4.1).

---

## 2. Scope

### 2.1 In Scope — Phase별

#### Phase A — 행위시법 판단 (G1) ★최우선

- [ ] **A-1** `lib/korean-law/applicable-law.ts` 신규 — `getApplicableLaw(lawName, articleNo, baseDate)`: 기준일에 시행 중이던 법령 버전 식별 → 해당 버전 조문 본문 + 시행일·공포일 메타 반환
- [ ] **A-2** 부칙 경과규정 발췌 — 기준일 전후 개정 법률의 부칙에서 해당 조문 관련 경과규정 추출(키워드: "종전의 규정", "경과조치", 조문번호 매칭)
- [ ] **A-3** `app/api/law/applicable-law/route.ts` — GET, Zod 스키마, `.legal-cache` 캐시, rate limit(`_helpers.ts` 재사용)
- [ ] **A-4** UI: 법령·조문 탭에 "기준일 시점 조회" 옵션(DateInput) + 결과에 `[현행]`/`[연혁 YYYY.MM.DD 시행]` 라벨 + 부칙 섹션
- [ ] **A-5** Query Router 패턴 — "2021년 시행 소득세법 89조", "2020.5.1 당시 소득세법 89조" → `applicable_law` 라우팅 (기존 `date-parser.ts` 재사용)

#### Phase B — 두 시점 신구대조 (G2)

- [ ] **B-1** `lib/korean-law/time-travel.ts` 신규 — `compareLawVersions(lawName, articleNo, dateA, dateB)`: 두 시점 시행 본문 확보(Phase A 모듈 재사용) → 라인 단위 diff(추가/삭제/변경)
- [ ] **B-2** `amendment_track` 체인의 "Phase 2 예정" 안내문(`chains.ts:240-243`) 제거 → 실제 신구대조 섹션으로 교체 (최근 개정 직전/직후 자동 선택)
- [ ] **B-3** API route + UI: 리서치 체인 탭 amendment_track 결과에 diff 뷰(추가=emerald/삭제=rose 하이라이트) — 신규 컴포넌트 `LawDiffView.tsx`
- [ ] **B-4** 라우터: 기존 `amendment_track` 패턴 유지(라우팅 변경 없음 — 체인 내부 강화)

#### Phase C — 판례 생사 확인 (G3)

- [ ] **C-1** `lib/korean-law/cite-check.ts` 신규 — `checkPrecedentStatus(caseNo)`: 사건번호로 후속 판례 검색(`searchDecisions` 재사용) → 후속 본문에서 "변경", "폐기", "달리 판시" 등 패턴 스캔 → `{status: "active"|"review_needed", citingCases[]}`
- [ ] **C-2** **단정 금지 정책**: 휴리스틱 한계상 "폐기됨" 단정 출력 금지 → "후속 판례에서 인용 — 검토 필요" 중립 배지 + 근거 판례 링크 (법령 정확성 최우선 정책 적용)
- [ ] **C-3** API route + UI: 판례·결정례 탭 결과 카드에 "후속 인용 확인" 버튼 → 배지 + 후속 판례 칩(기존 `RefPrecedentChip` 재사용)

#### Phase D — 조문 영향 그래프 (G4)

- [ ] **D-1** `lib/korean-law/impact-map.ts` 신규 — `buildImpactMap(lawName, articleNo)`: 조문 인용 역방향 탐색 — 판례(prec)·해석례(detc)·자치법규(ordin)·심판례(ppc) 4개 도메인에서 "법령명 제N조" 검색 → 도메인별 그룹 트리
- [ ] **D-2** 호출량 제어: 도메인당 상위 N건(기본 5) + 직렬 호출 + 캐시 — 법제처 API 부하 방지
- [ ] **D-3** UI: `ArticleModal`·법령 탭에 "영향 분석" 버튼 → 도메인별 아코디언 트리(기존 `<details>` 패턴). mermaid 대신 웹 네이티브 트리 렌더(외부 라이브러리 불필요)
- [ ] **D-4** 라우터 패턴 — "소득세법 89조 영향", "…파급" → `impact_map` 라우팅

#### Phase E — 현행성 가드 + 잔여 정리 (G5, 소규모)

- [ ] **E-1** `getLawText` 응답에 시행일 메타 추가 → 모든 조문 표시 지점(ArticleModal·LawSearchTab 인라인)에 `[현행]` 라벨 상시 표시 (Phase A 라벨 체계 공용)
- [ ] **E-2** CLAUDE.md `/law` 섹션 갱신 — v2+v3 기능 반영 (v2 이월 SC-10 해소)
- [ ] **E-3** (선택) NotFoundSection 컴포넌트 분리 — 기능 동등 리팩터링

### 2.2 Out of Scope

- 외부 LLM 기반 분석·요약 (v2 원칙 유지)
- MCP 서버화·도구 통폐합 (웹 UI 무관)
- HWPX·XLSX kordoc 변환 엔진 도입 (기존 별표 파서 유지)
- 가상 스크롤 FR-13 (실사용 50건 미만 유지 — v2 판단 존속)
- 판례 생사 "확정 판정" (휴리스틱 한계 — 중립 표현만)

---

## 3. 설계 방향 (Design 단계 입력)

### 3.1 모듈 구조 — 기존 컨벤션 준수

```
lib/korean-law/
  applicable-law.ts     # Phase A (신규, 순수 함수 + client-core 경유 fetch)
  time-travel.ts        # Phase B (신규, applicable-law 재사용)
  cite-check.ts         # Phase C (신규, client-decisions-* 재사용)
  impact-map.ts         # Phase D (신규)
app/api/law/
  applicable-law/route.ts · law-diff/route.ts · cite-check/route.ts · impact-map/route.ts
app/law/_components/
  LawDiffView.tsx · (기존 ArticleModal/탭 확장)
```

- 전 파일 800줄 정책. 캐시·재시도·rate limit은 기존 `client-core.ts`·`fetch-with-retry.ts`·`_helpers.ts` 재사용.
- 시행일자별 본문·연혁 조회용 법제처 API(target `eflaw`·연혁 목록)의 **정확한 파라미터는 미확인** → Design 단계에서 업스트림 소스(github chrisryugj/korean-law-mcp src) 참조 + 실제 API probe로 확정. **확인 필요**.

### 3.2 라우터 확장 (Phase A·D)

`RouterTool` union에 `applicable_law`·`impact_map` 추가 시 `RouteResult` 소비처(UnifiedSearchBar 배너·LawResearchClient 분기) 동기 확장. 기존 13패턴 우선순위와 충돌 없게 신규 패턴 priority 설계(시점 패턴은 specific_article(1)·no_je(2)보다 **앞**이어야 함 — "2021년 시행 소득세법 89조"가 조문 패턴에 선점되지 않도록 priority 0 영역. 케이스 매트릭스 Design에서 전수 enumerate).

### 3.3 테스트 전략

- **단위(vitest)**: 각 신규 모듈 — API 응답 fixture mock(기존 `__tests__/korean-law/` Mock 패턴) + 부칙 발췌·diff·생사 패턴 스캔은 순수 함수라 fixture만으로 검증 가능
- **Pre-Do anchor**: Phase별 핵심 1건 우선 실행(예: A는 "기준일 2021-06-01 소득세법 §89 버전 식별" — 실제 API로 1회 probe 후 fixture 동결)
- **E2E(Playwright)**: Phase별 1 spec, 법제처 의존 구간은 관대한 assertion(라벨·배너·버튼 노출 중심), `E2E_PORT=3102`
- **회귀**: `npx vitest run __tests__/korean-law/`(현 167) + 기존 E2E `law-article-popup.spec.ts`

---

## 4. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 법제처 eflaw·연혁 API 파라미터 미확인 (전 Phase 공통 기반) | Design 단계 최우선 probe. 실패 시 공포 이력(`searchLawMany` ancYd) 기반 대안 경로를 Design에 병기 |
| 판례 생사 키워드 휴리스틱 오탐 | "검토 필요" 중립 배지만(단정 금지) + 근거 후속 판례 원문 링크 — 사용자가 직접 확인하는 구조 |
| impact_map 다건 검색으로 API 호출량 급증 | 도메인당 상위 5건 + 직렬 + `.legal-cache` 7일 + 버튼 클릭 시에만 실행(자동 실행 금지) |
| 과거 버전 조문 표시를 현행으로 오인 | G5 라벨을 Phase A에 선행 내장 — 연혁 본문에는 `⚠️[연혁 YYYY.MM.DD 시행]` 강제 표기 |
| `RouterTool` union 확장 시 소비처 누락 | TS exhaustiveness — `RouteResult` 분기에 switch + never 가드, grep 자가 점검 |
| 동시 세션과 master 경합 | 본 worktree(`koreanlaw-imp`, per-worktree index)에서 커밋 — 메모리 `feedback_external_concurrent_edit_stale_read` §7 준수 |

---

## 5. Success Criteria

1. **A**: "2021년 시행 소득세법 89조" 질의 → 2021년 기준일 시행 버전 조문 + 시행일 라벨 + 부칙 경과규정 섹션 표시
2. **B**: amendment_track 체인 결과에 "Phase 2 예정" 안내문이 사라지고 실제 개정 전후 diff 뷰 표시
3. **C**: 판례 카드 "후속 인용 확인" → active/검토 필요 배지 + 후속 판례 칩 (단정 표현 0건)
4. **D**: 조문 "영향 분석" → 4개 도메인 역방향 인용 트리 표시
5. **E**: 모든 조문 표시 지점에 현행성 라벨 + CLAUDE.md 갱신
6. 공통: 신규 모듈 단위 테스트 + Phase별 E2E 1 spec 통과, `__tests__/korean-law/` 무회귀, `npm run check:pre-pr` 통과

---

## 6. 다음 단계 (PDCA)

1. **Design** (`docs/02-design/features/law-research-v3.design.md`): ① 법제처 eflaw·연혁 API probe(업스트림 소스 대조) → 응답 스키마 동결 ② 라우터 신규 패턴 케이스 매트릭스 전수 ③ 모듈별 시그니처·타입 확정
2. **Pre-Do anchor**: Phase A 버전 식별 1건 실 API probe → fixture 동결 → 실패 시 Design 환류
3. **Do**: Phase A부터 순차, **Phase당 1 PR** (`feat/koreanlaw-imp`에서 분기 or 직접 ship)
4. 권장 우선순위: **A(행위시법) → B(신구대조) → E(라벨, A와 공용이라 조기 가능) → C(생사) → D(영향)** — 세금 도메인 적합도순
