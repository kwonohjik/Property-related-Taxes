# 종합부동산세 법조문 인용 검증 + 클릭 팝업 링크화 — 구현 계획서

> 작성일: 2026-06-16 · 대상: **종합부동산세(comprehensive)** · worktree `feat/comprehensive-law-citation-link` (slot 2 · DEV 3002 · E2E 3102)
> 상위 문서: `docs/00-pm/multi-tax-law-citation-link.plan.md` §5.3 (4세목 마스터). 본 계획서는 그 §5.3을 **실측 인벤토리로 구체화**한 종부세 전용 실행안.
> 워크플로 재사용: memory `feedback_law_citation_link_workflow` · 검증 정책 `feedback_korean_law_citation_verify` · `korean-law-citation-verify` skill.
> 선행 완료: 양도(PR#200) · 재산(PR#203) · 취득(PR#205·#207) · 주식양도(PR#209). **종부세 = 6대세목 마지막 미완 1종.**

---

## 1. 배경 · 난이도

종부세는 4세목 확장 중 **유일하게 LawArticleModal import 자체가 없는(링크 0건)** 세목이다. 난이도 **상** 사유:

1. **링크 0 — 전부 신규**: 입력폼·결과뷰·별지서식 어디에도 `LawArticleModal`/`legalBasis`/`parseLawRef` 사용 0건. (실측: `app/calc/comprehensive-tax/**` + `components/calc/comprehensive/**` + `ComprehensiveTaxResultView` + `results/comprehensive-*/**` grep 결과 0)
2. **dual-truth**: 결과뷰 조문 배지가 엔진 `legalBasis`가 아니라 `getCalculatedTaxBadge()`(`ComprehensiveTaxResultView.tsx:259`)에서 **UI 자체 파생**. badge 조문(§9②1·2·3호·§10의2·§8④1~4호·§9①2호·구§9①3호)도 (A)검증 대상.
3. **구법(행위시법) 인용**: `구 §9①3호`·`구 §10②`(다주택 300%) 등 **현행법에서 삭제된 조문**을 결과뷰·도움말이 인용. 현행 조문 링크 모달과 충돌 → 보류/연혁 안내 처리 필요.
4. **별지서식 다수**: `comprehensive-filing/`(Main·Buppyo3·5·5Sub) + `comprehensive-payable-calc/` 산식 라벨에 조문 산재.

---

## 2. 범위

### 2.1 In scope
- **(A) 검증**: 종부세 UI·legal-codes에 노출된 모든 법령 인용을 KoreanLaw `get_law_text` **본문 대조**로 정확성 확인 + 오류 정정.
- **(B) 링크화**: 검증 통과 조문을 `LawArticleModal`로 클릭 팝업화(링크 가능 지점) / 링크 불가 지점은 인접 배지행으로 우회.
- aliases **종합부동산세법 시행령** 보강(현재 본법만 등록).
- anchor(`law-url-ref` 약칭) + RTL + E2E `comprehensive-law-citation-link.spec.ts`.

**1차/2차 범위 분리** (실측 인용 분포 기준):
- **1차 (이 PR)**: 입력폼(`Step1Basic`·`page`·`ExclusionInfoInput`) + 결과뷰 본체(`ComprehensiveTaxResultView`) + `legal-codes/comprehensive.ts` 검증.
- **2차 (후속 — 선택)**: 별지서식(`comprehensive-filing/`) + 납부세액 계산카드(`comprehensive-payable-calc/`). 인용 18건 실재(§122·§9⑦⑨·§10 단서·§9②3호 등, `HousingPayableTaxCalcCard:374·431`·`land-payable-sections:21·61`)이나 dual-truth·별지 셀 testid 동결 영향 커 분리. 1차 PR 시간 여유 시 동일 PR 포함 가능.

### 2.2 Out of scope (별도 과제)
- **dual-truth 근본 해소**: `getCalculatedTaxBadge()` → 엔진 `step.legalBasis` 단일화는 별도 PR. 이번엔 badge 조문 *검증·링크화*까지만 (마스터 §5.3 L111 동일 방침).
- **행위시법 자동 전환**: 과거 과세연도 조문 자동 [연혁] 라벨링은 범위 외. 현행 조문 링크가 기본, 구법 인용은 §9 리스크 처리로 보류.
- 계산 로직 변경. 단 **(A)검증 중 계산 드리프트 발견 시** 재산세 §103의2 사례처럼 사용자 보고 후 결정(AskUserQuestion: 통합수정 vs 분리PR) — memory `project_property_law_citation_link`.

---

## 3. 현황 인벤토리 (실측 file:line — 2026-06-16)

### 3.1 결과뷰 `components/calc/results/ComprehensiveTaxResultView.tsx` (749행, 링크 0)
| 위치 | 인용 (plain text) | 종류 |
|---|---|---|
| L160 | 시행령 §3① (의무임대기간 경고) | 주석/안내 |
| L204 | `valueLabel="적용 없음 (§8①2호)"` | valueLabel string |
| L215 | `"§8④ 1세대1주택자 의제"` | 조건부 label |
| L259~295 `getCalculatedTaxBadge()` | §9②3호·§9②1호·§9②2호·§10의2·§8④1~4호·§9①2호·**구§9①3호** | **UI 파생 badge (dual-truth)** |
| L321·336 | 재산세 비율안분 §9③ · `badge="시행령 §4의3"` | badge string |
| L368·376 | §9⑦⑨ · `badge="§9⑤~⑨ (§8④ 안분)"` | badge string |
| L395 | `"세부담 상한 미적용 (§10 단서 — §9②3호 …)"` | 안내 |
| L435·490 | `<SectionHeader>토지분 — 종합합산 (§11)</SectionHeader>` · `별도합산 (§12)` | SectionHeader |

### 3.2 입력폼
- **`app/calc/comprehensive-tax/Step1Basic.tsx` (451행)**: 법인 세부유형 Select 옵션 라벨(L37~44 `시행령 §4의4①N호`)·요건 라벨(L51~63 §9②1·2·3호)·도출 배지(L70~79)·도움말(L113~127 §9①·§9①2호·§10②·§10).
- **`app/calc/comprehensive-tax/page.tsx` (673행)**: 토지 ToggleCard title(L166 §11·L230 §12)·법인 안내(L307~312 §9②3호·§10 단서)·세부담상한 description(L323 §10②·L446 §10②·L453 §10·L354 §10의2)·검증 에러(L536 시행령 §4의4).
- **`components/calc/ExclusionInfoInput.tsx`**: 시행령 §3①10·11호(L104·109)·§3⑦(L152)·§3①(L174)·§4①1호(L271)·§4①3호(L360) — 대부분 description 런타임 string. ⚠ 이 파일은 **공용 디렉터리(`components/calc/`)** 에 위치하나 실제로는 종부세 합산배제 전용 → grep 스코프 시 누락 주의(comprehensive 하위 아님).
- **`components/calc/comprehensive/LandParcelSection.tsx`**: 조문 인용 거의 없음(필지 입력 위젯).

### 3.3 legal-codes `lib/tax-engine/legal-codes/comprehensive.ts` (313행)
- 주택분 상수: BASIC_DEDUCTION_*(§8①1·3호)·AGGREGATION_EXCLUSION_*(§8②1·2호)·TAX_RATE(§9①)·ONE_HOUSE_*_CREDIT(§9⑥·§9⑧·§9⑤단서)·**PROPERTY_TAX_CREDIT(`§9③, 시행령 §4의2`)**·TAX_CAP_GENERAL(§10)·RURAL_SPECIAL_TAX(농특세법 §5①5호)·TAX_BASE_DATE(§3).
- 토지분 상수(§11~§15) L105~.

### 3.4 aliases `lib/korean-law/aliases.ts`
- ✅ 등록됨: `종합부동산세법`·`종부세법`(L45·46) · `민간임대주택에 관한 특별법`·`민특법`·`임대주택법`(L82~84).
- ❌ **미등록**: `종합부동산세법 시행령`·`종부령`·`종부세법 시행령`. → legal-codes·UI가 "시행령 §4의2/§4의3/§4의4"를 본법 prefix 없이 인용 → `parseLawRef`가 직전 본법(종부세법) 상속하나, **단독 "시행령" 인용의 정식명 해석 안정성 위해 보강 필요**.

### 3.5 MST (마스터 §5.3 / Phase 1에서 `search_law` 재확인)
- 종합부동산세법 `280417` · 종합부동산세법 시행령 `283639` · 종합부동산세법 시행규칙 `285003` · 지방세법 시행령 `286395`(재산세 연동).

---

## 4. 🚩 (A)검증 사전 식별된 드리프트 후보 (Phase 2 최우선 본문대조)

> 추정 아님 — **불일치 실측**. 어느 쪽이 현행 정합인지는 Phase 2 `get_law_text`로 확정.
> ※ 본 계획서 작성 세션에는 KoreanLaw MCP 미연결(연결 MCP: bkit·supabase·context7) → §4의1 드리프트를 **지금 해소 못 함**. Phase 2에서 법제처 `/api/law/*`(dev 서버 3002) 또는 KoreanLaw MCP로 본문대조 필요. 두 후보(§4의2·§4의3) 모두 보존.

1. **재산세 비율안분 공제 시행령 조번호 불일치**:
   - legal-codes `PROPERTY_TAX_CREDIT = "종합부동산세법 §9③, 시행령 §4의2"` (comprehensive.ts:39)
   - 결과뷰 `badge="시행령 §4의3"` (ComprehensiveTaxResultView.tsx:336)
   - 동일 항목(§9③ 재산세 비율안분)을 한쪽은 **§4의2**, 한쪽은 **§4의3**으로 인용. → 현행 종부령 본문 대조로 정답 확정 후 **양쪽 통일**. (재산세 §103의2 교훈: 인용 검증이 드리프트 적발 경로)
   - 참고: comprehensive.ts 주석상 고령자공제율=시행령 §4의2(L67)·장기보유공제율=시행령 §4의3(L81)로도 쓰여 조번호 혼선 정황.
2. **구법 인용의 현행성**: `구 §9①3호`(다주택 중과)·`구 §10②`(300% 상한) — 현행 §9①은 2호 체계, §10은 단일 150%. 현행법 부재 조문 → 링크 시 빈 팝업/오조회 위험. **보류 + (연혁) 안내** 처리.
3. **§10의2 부부 공동명의 특례** vs **§10의2 (준용)**: 결과뷰 L280·page L354 모두 §10의2 인용 — 본문 대조로 항·호 확정.

---

## 5. 실행 단계

### 설계 산출물 (Phase 1 착수 전 — 선행 세목 패턴 일치)
선행 4세목 모두 `docs/02-design/features/{tax}-law-citation-link.{engine,ui}.design.md` 생성(상속·주식양도는 `.inventory.md` 추가). 종부세도 동일 산출:
- **`comprehensive-law-citation-link.inventory.md`**: §3 인벤토리 + Phase 2 검증표 동결처(노출/링크/미링크/보류 집계). dual-truth·구법 분류 포함.
- **`comprehensive-law-citation-link.ui.design.md`**: 배지 배치 위치별 명세(링크 가능/우회 매핑) + E2E 진입 경로.
- **engine.design**: 링크화는 엔진 변경 0이 원칙 → 별도 생성 불요. 단 (A)검증이 `legal-codes/comprehensive.ts` 상수 정정(§4의1 등)을 유발하면 inventory.md 정정란에 기록(엔진 design 대체).

### Phase 0 — 인벤토리 baseline (선택 도구)
- §3의 **수동 인벤토리(실측 완료)** 가 1차 baseline. `scripts/extract-law-citations.mjs`는 현재 `inheritance-gift`·`stock-transfer` **2세목만 CONFIG 등록**(property·취득·양도는 미사용) → **필수 아님**.
- 회귀 감시 자동화를 원하면 CONFIG에 `comprehensive` 항목 추가(구조: `ROOTS`=입력폼 dir, `RESULTS_DIRS`/`RESULTS_FILES`=결과뷰). ROOTS=`app/calc/comprehensive-tax`+`components/calc/comprehensive`, RESULTS_FILES=`ComprehensiveTaxResultView.tsx`+`ExclusionInfoInput.tsx`(공용 dir 명시 경로). **walk()는 `.tsx`만 수집** → `.ts` legal-codes는 별도.

### Phase 1 — aliases 보강 + Pre-Do anchor
- `aliases.ts`에 `종합부동산세법 시행령`·`종부령`·`종부세법 시행령` → `"종합부동산세법 시행령"` 추가 (정식명 `search_law`로 검증 후).
- anchor(`__tests__/korean-law/law-url-ref.test.ts`): 종부세 신규 약칭·가지번호(§9의2·§4의2·§4의3·§4의4) `parseLawRef`(C-N)·`extractClauseMarkers`(CM-N) 케이스 추가 → **Pre-Do 우선 실행**(memory `feedback_pre_anchor_verification`).

### Phase 2 — (A) 검증 (KoreanLaw 본문 대조)
법령군별 `get_law_text` 본문 대조. **§4의1 드리프트 후보 최우선.** 검증 통과·정정 목록을 표로 동결.

| 군 | 조문 | 검증 위치 |
|---|---|---|
| 주택분 | §8①1·3호·§8②1·2호·§9①·§9⑤⑥⑧·§9③·§10·§10의2 | comprehensive.ts·Step1Basic·ResultView |
| 토지분 | §11~§15 | comprehensive.ts·page L166·230·ResultView L435·490 |
| 합산배제 | §8④, 시행령 §3①10·11호·§3⑦·§4①1·3호 | ExclusionInfoInput |
| 법인특례 | §9②1·2·3호·§10 단서, 시행령 §4의4①각호 | Step1Basic L37~79·page L307~312 |
| 재산세 연동 | 시행령 §4의2 **또는** §4의3(드리프트) | comprehensive.ts:39·ResultView:336 |
| 부가세 | 농특세법 §5①5호 | comprehensive.ts:48 |
| 구법 | 구 §9①3호·구 §10② | ResultView·page·comprehensive-historical.ts → **보류** |

- **dual-truth 검증**: `getCalculatedTaxBadge()` 파생 조문 전부 본문 대조.
- memory `project_comprehensive_*` 시리즈(과세연도별 §9 세율표) 정합 확인.
- ★ 에이전트에 검증 위임 시 **매니페스트(`check:legal-coverage`) 신뢰 금지 → `get_law_text` 본문 직접 대조**(4연속 에이전트 오판 교훈, `feedback_stale_main_tree_before_not_done_claim`).

### Phase 3 — (B) 링크화
1. **LawArticleModal import 신규** 추가 (`ComprehensiveTaxResultView`·`Step1Basic`·`page`).
2. **링크 가능 지점**:
   - 결과뷰 SectionHeader(§11·§12)·badge(§9③·§4의3·§9⑤~⑨·§10) → `LawArticleModal legalBasis="종합부동산세법 §N" label="§N⑩ 설명"` 포장.
   - `getCalculatedTaxBadge()` 반환 배지 → 헤더 인접 배지행으로 LawArticleModal 렌더(badge string 자체는 dual-truth 유지, 조문만 클릭화).
   - 입력폼 도움말/섹션 헤더 `<p>` 아래 배지행.
3. **링크 불가 지점(런타임 string) → 우회**(memory 워크플로 §4): Select 옵션 라벨(시행령 §4의4①N호)·ToggleCard/RadioCard `title·description`(§11·§12·§10②)·에러메시지 → **인접 섹션 헤더 배지행**으로 동일 조문 노출.
4. **항(項) 하이라이트**: 항·호는 `label`에 (`label="§9② 법인 단일세율"`), `legalBasis`엔 조문만 (`"종합부동산세법 §9"`) — `extractClauseMarkers`+`LawContent` 자동 강조.
5. **구법 인용**: 현행 모달 부재 → 링크 미적용 + 텍스트 `(구법 — 연혁)` 유지, 보류 리스트 기록.
6. **별지서식**(`comprehensive-filing/`·`payable-calc/`): 시행령 §4의3·지방세법 연동 조문 배지화는 2차(시간 여유 시) — 1차는 입력폼+결과뷰 본체 우선.

### Phase 4 — 테스트
- **anchor**: Phase 1 약칭 케이스(이미 Pre-Do).
- **RTL** `__tests__/components/law-article-modal-highlight.test.tsx`: 종부세 §9② 항 강조 케이스 추가(`data-highlighted`/`data-clause` 표준 DOM).
- **E2E** `e2e/comprehensive-law-citation-link.spec.ts`: 헤더(props)만 단정·본문 비단정. `E2E_PORT=3102`. ★진입 함정 — 배지가 펼침/칩/모달 안일 수 있음, 결과뷰 진입은 전체 계산 플로우 선행 필요(`comprehensive` calc 헬퍼).

---

## 6. 함정 · 리스크

1. **dual-truth badge**: badge 문자열을 LawArticleModal로 통째 포장 금지 → 조문 부분만 클릭화(badge UI파생 의미 보존). 근본 단일화는 별도 과제.
2. **구법 링크 빈 팝업**: 구 §9①3호·§10②를 현행 종부세법 MST로 조회 시 빈/오조회 → 링크 제외.
3. **단독 "시행령" 인용**: 본법 prefix 없는 "시행령 §4의3"은 `parseLawRef` 직전 본법 상속 의존 → aliases 보강 + label에 본법 명시 권장.
4. **E2E 진입**: 종부세는 5단계 마법사 — 결과뷰 배지 도달까지 calc 플로우 전체 필요. RadioCardGroup=**radio role**(button 아님), 공시가격 textbox 등 재산세 E2E 함정(`project_property_law_citation_link`) 재사용.
5. **ESLint --fix import 제거**: 신규 LawArticleModal import는 **한 줄 한 named**(멀티라인) — lint-staged dead-import 제거 함정(`feedback_api_zod_schema_sync`).
6. **800줄**: ResultView 749행 + 배지 추가 시 초과 위험 → 토지분/별지 섹션 컴포넌트 추출 대비(`feedback_800line_split_export_preservation`).
7. **재검증 grep 반복**: 동일 인용(§9②3호 등)이 legal-codes·Step1Basic·page·ResultView·주석 5+곳 산재 → 정정 후 재grep 반복(취득세 1회 누락 교훈).

---

## 7. 완료 기준 (DoD)

- [ ] 설계 산출물 생성: `comprehensive-law-citation-link.{inventory,ui.design}.md`.
- [ ] Phase 2 검증표 동결 — 모든 인용 `get_law_text` 본문 대조 완료(보류 조문 명시).
- [ ] 🚩 §4의2 vs §4의3 드리프트 확정·통일(legal-codes + ResultView), 계산영향 검증.
- [ ] aliases 종합부동산세법 시행령 보강 + anchor 통과.
- [ ] 입력폼·결과뷰 본체 링크화(링크 불가는 우회 배지) — 미링크 인벤토리 0(별지·구법 제외분 명시).
- [ ] `npx tsc --noEmit` 0건.
- [ ] `npx vitest run`(전체) 통과 + 신규 anchor/RTL.
- [ ] `E2E_PORT=3102 npx playwright test comprehensive-law-citation-link` 통과.
- [ ] memory `project_comprehensive_law_citation_link` 신규 작성 + MEMORY.md 인덱스 갱신(6대세목 완결 표기 정정 — 종부세 실제 완료 반영).
- [ ] `scripts/ship.sh feat/comprehensive-law-citation-link "..."` 또는 PR.

---

## 8. 커밋 분할 (제안)
1. `feat`: aliases 시행령 보강 + anchor (Phase 1)
2. `fix`: (A)검증 정정 — §4의2/§4의3 드리프트 등 (Phase 2 결과)
3. `feat`: 입력폼 링크화 (Step1Basic·page·ExclusionInfoInput)
4. `feat`: 결과뷰 링크화 (ComprehensiveTaxResultView)
5. `test`: RTL + E2E
6. (옵션) `feat`: 별지서식·payable-calc 링크화 2차
