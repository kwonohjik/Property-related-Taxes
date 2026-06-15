# 주식양도소득세 법조문 인용 검증 + 클릭 팝업 링크화 — 구현 계획서

> 작성일: 2026-06-15 · 대상 세목: **주식양도소득세(stock-transfer)** · 미완료 4세목 확장 **마지막(4번째)**
> 선행 완료: 상속·증여 PR#196 · 양도세 PR#200·#202 · 재산세 PR#203 · 취득세 PR#205·#207 (전부 origin/master `33f7e6bc` 머지)
> 상위 마스터 계획: [`multi-tax-law-citation-link.plan.md`](./multi-tax-law-citation-link.plan.md) **§5.4** — 본 문서는 그 §5.4를 실측 인벤토리로 **확장·구체화**한다.
> 워크플로 원본: memory `feedback_law_citation_link_workflow`
> **본 문서는 계획만 — 코딩 금지.** Do는 13단계 self-review(`plan-design-self-review-loop`) 및 사용자 승인 후 진입.
> **인벤토리는 origin/master 기준 실측(2026-06-15)이며 추정이 아니다.** 단, 인용 *정확성*은 Phase 2 본문 대조 전까지 단정하지 않는다(memory `feedback_numeric_impact_verify_before_bug_claim` — 오류 과대주장 금지).

---

## 0. 환경/베이스 상황 (★ Do 진입 전 필독)

작업 디렉터리 git 상태 실측(2026-06-15):

| 항목 | 실측 | 함의 |
|---|---|---|
| 로컬 `master` HEAD | `1c38800c`(#194 머지) | **origin/master보다 35커밋 stale** |
| `origin/master` HEAD | `33f7e6bc`(#207 취득세 2/2 머지) | 법령링크 인프라·선행 5세목 **전부 여기 존재** |
| 워킹트리 uncommitted | `components/calc/transfer/nbl/OtherLandDetailSection.tsx`·`lib/tax-engine/non-business-land/other-land.ts`·`lib/utils/law-url.ts(지방세법 시행령 약칭 1줄)` | **본 작업과 무관**(비사업용 토지 작업 잔재 — 외부 세션 가능성) |

**결정**:
1. Do 진입 시 **`origin/master` 기준으로 새 작업 브랜치 분기**(`feat/stock-transfer-law-citation-link`). 로컬 stale master 위에서 작업하면 인프라(LawArticleModal·parseLawRef 등)가 없어 빌드 불가.
2. 현재 워킹트리에 무관한 uncommitted 변경 + 외부 동시편집 정황 → **격리 worktree 권장**(`scripts/wt-new.sh`, memory `feedback_external_concurrent_edit_stale_read`). 공유 워킹트리 `reset`/`commit` 금지.
3. 본 계획서 파일은 현재 stale 트리에 생성됨 → Do worktree로 **복사 이동** 필요(또는 worktree에서 재생성).

---

## 1. 배경 · 문제 정의

(A) **정확성 미검증** — 주식양도세 마법사·결과뷰·신고서 서식의 법조문 인용이 현행 법령 본문과 일치하는지 전수 확인된 바 없다. 단 주식양도세는 키움 자동조회 작업(2026-05-19) 중 §82·§163⑨ 오인용 2건을 KoreanLaw로 정정한 이력이 있어(memory `feedback_kiwoom_law_citation_drift`) **선행 신뢰도는 타 세목보다 높다**. 그러나 "주석 신뢰 ≠ 본문 재대조"이므로 Phase 2 재확인은 수행한다.

(B) **비클릭** — 인용 대부분이 일반 텍스트(`hint`·라디오 `description`·결과뷰 라벨 문자열·신고서 라벨)라 사용자가 조문 원문을 볼 수 없다. 현재 링크화된 곳은 입력폼 `MajorShareholderCheckpointHints`(14배지)·결과뷰 `PostListingDetailCard`(5배지) **2파일뿐**.

선행 5세목에서 (A)검증 + (B)팝업링크 + E2E + 항(項)하이라이트 인프라가 **전 세목 공용**으로 완성·머지됐다. 주식양도세는 인프라 재구축 없이 ②약칭·③MST·④인용조문만 교체해 적용한다.

---

## 2. 공용 인프라 (실측 — 신규 0)

origin/master에 머지·완성된 공용 자산. 그대로 차용.

- **`LawArticleModal`**(`components/ui/law-article-modal.tsx`) — props `legalBasis`·`label`·`className`. 클릭→Dialog→`/api/law/article?law=&articleNum=`→조문본문(법제처). 헤더는 `parseLawRef(legalBasis)` 기반(API 독립). **배지 label은 약칭 허용·legalBasis는 정식명 권장**.
- **`parseLawRef`/`parseLawRefsForModal`**(`lib/utils/law-url.ts`) — 약칭→정식명(`resolveLawAlias`)·복합인용 분해·"시행령" 단독 직전본법 상속. `ARTICLE_RE = /(?:§|제)\s*(\d+)(?:조)?(?:의\s*(\d+))?/`(§N조의M 흡수). **법령명 없는 단독 `§`는 skip** → 링크하려면 legalBasis에 법령명 명시.
- **`extractClauseMarkers` + `LawContent`** — label의 항(①~⑮) 자동 추출→본문 해당 항 amber 강조. **label에 항을 넣으면 자동 적용**(추가 구현 0).
- **`resolveLawAlias`**(`lib/korean-law/aliases.ts`) — origin/master 실측: `소령`·`상증령`·`조특령`·소득세법 계열·상증법·조특법 **이미 등록**(양도세 작업분). 주식 누락분만 보강(§4.1).
- **인벤토리 스크립트**(`scripts/extract-law-citations.mjs`) — ROOTS 파라미터화. Phase 0에서 stock-transfer ROOTS 추가.

---

## 3. 주식양도세 현황 실측 (origin/master `33f7e6bc` 기준)

### 3.1 도메인 구조

| 영역 | 경로 | 규모 |
|---|---|---|
| 엔진 | `lib/tax-engine/stock-transfer/` | 31파일(오케스트레이터·분류·평가·로트·해외/전출·증권거래세 등) |
| legal-codes | `lib/tax-engine/legal-codes/stock.ts` | **556행**(환원율 위임체인 포함) |
| UI 입력 | `components/calc/stock-transfer/` | 25+컴포넌트 |
| 앱 진입 | `app/calc/stock-transfer/page.tsx` | StockTransferCalculator |
| 결과뷰 | `components/calc/results/` 내 **8파일**: `StockTransferTaxResultView.tsx`(+`StockTransferTaxResultViewHelpers.tsx`)·`PostListingDetailCard.tsx`·`StockTransferPenaltySection.tsx`·`ListedStockBesshiResultSection.tsx`·`UnlistedStockBesshiResultSection.tsx`·`ForeignStockResultCard.tsx`·`UnlistedStockSimpleValuationSection.tsx` | Besshi 신고서 부표 2종·PenaltySection 인용 별도 포착(Phase 0) |

### 3.2 결과뷰 법조문 렌더 구조 — **혼합형**

마스터 §3.1은 주식양도세를 "appliedRules 비구조화·결과뷰 legalBasis 미노출"로 분류했으나, 실측 결과 **결과뷰 자체에는 법조문 텍스트가 다수 노출**된다(구조화된 `step.legalBasis`가 아닌 하드코딩 라벨 형태). 즉 "구조화 부재 ≠ 인용 부재" — **링크화 가능분이 마스터 §5.4 추정보다 많다**.

| 노출 지점 | 위치(origin/master) | 형태 | 링크화 |
|---|---|---|---|
| 분류 배지 `TAX_CATEGORY_LABEL` | `StockTransferTaxResultView.tsx:84~97` | 13종 라벨(`"§94①3 가목 — 상장 대주주"`·`"조특법 §14①7호 — K-OTC 벤처 비과세"`·`"§118의2~§118의8"` 등) | **미링크 → 가능** |
| 양도가액 산식 헤더 | 동 `:119` | `"양도가액 산식 (§96① 실지거래가액)"` | 미링크 → 가능 |
| 비과세 메시지 | 동 `:219·221` | `"(§94①3 나목 단서)"`·`"(조특법 §14①7호)"` | 미링크 → 가능 |
| `RuleBadges`(**20종**) | `StockTransferTaxResultViewHelpers.tsx:232`(기존 `RULE_BADGE` L212는 **tone 17종** 매핑 — legalBasis 아님·3종은 slate fallback) | `appliedRules: string[]`(`"§94②우선"`·`"80%하한"`·`"단기30%"` 등 20종) → 배지 | **미링크 → legalBasis 매핑 신설 필요**(§5.4) |
| 산식 분해 헤더 | 동(`EstimatedValuationBreakdown`·`ProgressiveTaxBreakdown`) | `"(소령 §165③·§165④)"`·`"(§104①11 가목 2)"` | 미링크 → 가능 |
| swap 비교 | 동(`SwapComparisonBlock`) | `"§97②2호 단서"` | 미링크 → 가능 |
| 취득후상장 상세 | `PostListingDetailCard.tsx:128~152` | LawArticleModal 5배지(`§165⑤`·`§165④1`·시행규칙`§81②`·상증규`§17`·`§81④`) | **✅ 이미 완성**(모델로 재사용) |
| 신고서 32행 라벨 | `StockFilingFormTableHelpers.ts` | ~20조문(`§94`·`§104①11`·`§103②`·`§163⑥`·`§81④` 등) | 미링크 → 가능(상수 매핑) |

> `appliedRules: string[]`(types `stock-transfer.types.ts:725` `Array<유니온>` **20종**)을 **CalculationStep으로 구조화**하는 것은 **비목표**(엔진 대변경). 대신 배지 식별자 → legalBasis 매핑 상수 `RULE_BADGE_LAW_MAP`(**기존 tone 매핑 `RULE_BADGE`와 별개의 신설 상수** — `Record<StockTransferResult["appliedRules"][number], string>` 타입으로 **20종 전수** 강제, 누락 시 컴파일 에러 `enum-verification-before-mapping`)를 **UI 레이어에 신설**해 링크화한다(엔진 변경 0).
> `appliedSection94`(`"①3가1)"` 등)·`valuationDetail.method`는 enum 식별자라 링크 대상 아님.

### 3.3 입력폼 법조문 인용 (미링크 — 실측)

`hint`·라디오 `description`·섹션 헤더·카드 제목에 산재. 대표 위치(Phase 0 인벤토리로 전수 확정):

| 컴포넌트 | 인용 예 | 형태 |
|---|---|---|
| `MajorShareholderCheckpointHints.tsx` | `§157④`·`§157 (2013.2.15.)` 등 14배지 | **✅ LawArticleModal 이미 적용**(모델) |
| `AcquisitionLotsMatrix.tsx` | `hint="§104② 보유기간 기산점"` | FieldCard hint |
| `MarketTypeBlock.tsx` | 라디오 `description="§94①3 가목"` | **링크 불가(런타임 string)** → 우회 |
| `MonthlyAccrual81Section.tsx` | `hint="… (§81④ 1호)"` | hint |
| `EstimatedUnlistedBlock.tsx` | `hint="순자산가치 단독 (§165④3)"`·`소령 §163⑨` | hint |
| `PostListingValuationCard.tsx` | 카드 제목 `소령 §165⑤`·`§165③` | 헤더 텍스트 |
| `InstallmentReceiptsMatrix.tsx` | `§178의5② 장기할부` | 섹션 헤더 |
| `OtherAssetBlock.tsx` | `§94①4 다목`·`§94①4 라목` | 라벨 |
| `CapitalAdjustmentsBlock.tsx` | `§17②2호`(의제배당) | 라벨 |
| `CaseFortyNineFormulaCard.tsx` | `§99①4 후단`(액면가 취득) | 산식 카드 |
| `SecuritiesTransactionTaxCard.tsx` | `증권거래세법 §2 본문` | 정보성 경고 |

---

## 4. 약칭·MST (선행 확인 — ★달라지는 부분)

### 4.1 aliases 보강 (origin/master 실측)

| 약칭/표기 | 정식명 | 코드 사용처 | 현황 |
|---|---|---|---|
| `증권거래세법`·`증권거래세법 시행령` | 증권거래세법 / 증권거래세법 시행령 | `securities-transaction-tax.ts`·`SecuritiesTransactionTaxCard.tsx` | **미등록 → 보강** |
| `국고금 관리법`(공백 포함 정식명) | 국고금 관리법 | `legal-codes/stock.ts:235~239` 절사 §47 | **미등록 → 보강** |
| `상속세 및 증여세법 시행규칙`(띄움형) | 상속세및증여세법 시행규칙 | `legal-codes/stock.ts:214` 환원율 §17 | **확인 필요** — 본법 띄움형·시행규칙 붙임형은 등록됐으나 시행규칙 **띄움형 미등록**. 법제처 `search_law` 검색 가부 확인 후 별칭 추가 여부 결정 |

> `소령`·`상증령`·`조특령`·소득세법 계열·상증법·조특법은 **이미 등록**(양도세 PR#200 등 머지분). 보강 불필요.
> `resolveLawAlias`는 매핑 없으면 입력 그대로 반환 → 정식명("증권거래세법")은 약칭 없이도 법제처 검색 가능할 수 있으나, **코드가 약칭/띄움형을 쓰면** 매핑 필요. Phase 1에서 실제 코드 표기형 확정 후 등록.

### 4.2 MST (확보 완료 — 마스터 §3.3, 재사용)

| 법령 | MST | 용도 |
|---|---|---|
| 소득세법 | `285523` | 과세대상 §94·세율 §104 |
| 소득세법 시행령 | `286211` | 대주주 §157·§167·평가 §165·환산 §176의2 |
| 소득세법 시행규칙 | `286379` | 환원율 §81②·월할 §81④ |
| 조세특례제한법 | `286597` | K-OTC §14①7호·전자신고 §104의8 |
| 조세특례제한법 시행령 | `286143` | 조특 위임 |
| 상속세및증여세법 | `276123` | 비상장 보충평가 §60~66 |
| 상속세및증여세법 시행령 | `283637` | 상증령 §52의2②·§54·§55 |
| 상속세 및 증여세법 시행규칙 | `284609` | 환원율 §17(정식명 띄어쓰기) |
| 증권거래세법 / 국고금 관리법 | (Phase 1 `search_law` 확보) | 증권거래세·절사 |

---

## 5. 작업 계획 (5 Phase)

마스터 §5 공통 5단계: **Phase 0 인벤토리 고정 → Phase 1 약칭·anchor → Phase 2 전수검증·정정 → Phase 3 링크화 → Phase 4 테스트·회귀**.

### 5.1 Phase 0 — 인벤토리 고정
- `extract-law-citations.mjs`에 stock-transfer ROOTS 추가: `components/calc/stock-transfer/**`(`StockFilingFormTableHelpers.ts` 포함) + 결과뷰 8파일(`StockTransferTaxResultView*`·`PostListingDetailCard`·`StockTransferPenaltySection`·`ListedStockBesshiResultSection`·`UnlistedStockBesshiResultSection`·`ForeignStockResultCard`·`UnlistedStockSimpleValuationSection`) + `legal-codes/stock.ts`.
- 산출: `docs/.../stock-transfer-law-citation-inventory.md`(노출/링크/미링크 집계 — 회귀 감시 baseline).
- **확정 항목**: 입력폼 미링크 정확 건수·결과뷰 `appliedRules` 링크 가능 범위·신고서 라벨 조문 수.

### 5.2 Phase 1 — 약칭 보강 + Pre-Do anchor
- aliases: `증권거래세법`·`증권거래세법 시행령`·`국고금 관리법` 보강. `상속세 및 증여세법 시행규칙` 띄움형은 법제처 검색 가부 확인 후 결정(§4.1).
- anchor(`__tests__/korean-law/law-url-ref.test.ts`): 주식 신규 약칭(증권거래세법·국고금)·가지번호(`§176의2`·`§167의8`·`§104의4`·`§118의2`) `parseLawRef` 케이스 + `extractClauseMarkers` 항 케이스(`§104①11 가목`·`§94①3 나목 단서`).
- **★Pre-Do anchor 우선 실행**(memory `feedback_pre_anchor_verification`): §163⑨ 환원율 위임체인을 1건 우선 검증해 디자인 환류 기회 확보(§5.3 ★ 참조).

### 5.3 Phase 2 — 전수 본문 검증·정정 (재확인)

**KoreanLaw `get_law_text` 본문 대조**(`verify_citations` 존재확인만 금지, memory `feedback_korean_law_citation_verify`). 검증 7군:

| 군 | 조문 | 주요 위치 |
|---|---|---|
| 과세대상 | 소득세법 §94①3·4·§118의2~ | `stock-classification.ts`·`legal-codes/stock.ts`·`TAX_CATEGORY_LABEL` |
| 대주주·기준시가 | §99①3·4, 시행령 §157·§165·§167(의8) | `stock-rate-tables.ts`·`stock-valuation-listed.ts`·`MajorShareholderCheckpointHints` |
| 세율·보유기간·기본공제 | §103②·§104①11·§104② | `legal-codes/stock.ts`·`stock-transfer-helpers.ts`·`stock-transfer-rate-calc.ts` |
| 비상장 보충적평가 | 시행령 §165④·§176의2②1호, 환원율 시칙 §81②·상증칙 §17·상증령 §54·§55·§52의2② | `stock-valuation-unlisted.ts`·`stock-valuation-post-listing.ts`·`PostListingDetailCard` |
| §163⑨·§82 회귀 | (정정 완료분 — ★재확인) | `apply-163-9-conversion.ts`·`stock-valuation-post-listing.ts` |
| K-OTC·전자신고 | 조특법 §14①7호·§104의8·(§104의4 ATS 여부 확인) | `stock-classification.ts`·`unlisted-messages.ts`·`stock-transfer-finalize.ts` |
| 증권거래세·가산세·절사 | 증권거래세법 §2·§8·시령 §5, 농특세법 §5①5호, 국기법 §47의2·3·4, 국고금 관리법 §47, 지방세법 §103의3(지방소득세) | `securities-transaction-tax.ts`·`stock-transfer-finalize.ts`·`stock-transfer-helpers.ts` |

**★Phase 2 우선 확인(주석 불일치 — 계획 단계 미단정)**: Explore 1차 조사가 `apply-163-9-conversion.ts`를 "**미정정 주석** 잔존(§163⑨)"으로 보고했으나, 키움 작업 메모리·마스터 §5.4는 "정정 완료(§176의2②1호·§99①3·§165③·상증령§52의2)"로 기재 — **상충**. **단 `legal-codes/stock.ts` 실측(검토 STEP 1)상 환산취득가 위임은 이미 §163⑫(L128~129 `ENFORCEMENT_DECREE_163_12`)→§176의2②~④로 정정완료·개산공제는 §163⑥4(L167) — legal-codes에 §163⑨ 미사용.** 따라서 §163⑨ 잔존 의심은 **`apply-163-9-conversion.ts`(파일명만 historical) 주석에 국한**될 개연성 — Phase 2에서 그 파일 본문 대조로 확정. 정정 필요 시 산식·anchor 보존하며 주석/라벨만 변경(memory `feedback_kiwoom_law_citation_drift` D-1/D-2 패턴). **오류 단정은 본문 대조 후에만.**

- 정정 대상에 **legal-codes/stock.ts 상수·주석**도 포함(양도세 §9 교훈: UI 표시 문자열이 엔진 상수와 드리프트 공유 → UI만 정정 금지·일괄).
- 정정 안전성: 본 작업은 표시·상수·주석 변경(계산 로직 무변경)이라 회귀 위험 낮음. 단 산식에 영향 주는 상수면 anchor 우선.

### 5.4 Phase 3 — 링크화 (LawArticleModal)

**검증 통과분만** 링크(잘못된 인용 링크화 = 오류 클릭 가능화 → 금지). 우선순위:

| 우선 | 대상 | 방식 | 난도 |
|---|---|---|---|
| P1 | 결과뷰 분류 배지 `TAX_CATEGORY_LABEL` 13종 + 산식 헤더(§96①)·비과세 메시지 | 라벨 렌더 지점에서 `parseLawRefsForModal(label).map()` 또는 LawArticleModal 직접 | 낮음 |
| P1 | `PostListingDetailCard` 5배지 | **이미 완성** — 모델로 유지·검증만 | — |
| P2 | `RuleBadges` 20종 | **`RULE_BADGE_LAW_MAP` 상수 신설**(배지 식별자→legalBasis, 기존 tone `RULE_BADGE`와 별개·`Record<유니온>` **20종 전수** 강제, UI 레이어, 엔진 변경 0) → 배지에 LawArticleModal | 중 |
| P2 | 신고서 32행 라벨(`StockFilingFormTableHelpers.ts`) | `FILING_FORM_LAW_MAP` 상수 or `parseLawRefsForModal` | 중 |
| P3 | 입력폼 FieldCard `hint` ~25 | 섹션 헤더 옆/아래 배지행(hint 텍스트 자체는 string prop이라 직접 링크 불가 — 헤더 배지로 우회) | 중~상 |

**링크 불가 + 우회**(마스터 §4 패턴): 라디오 `RadioCardOption.description`·`ToggleCard`/`RadioCardGroup` `title`은 런타임 string → 링크 불가. → 해당 섹션 헤더 `<p>` 옆/아래 배지행으로 우회.

**항·호는 label에**(G-5 자동 하이라이트): `legalBasis="소득세법 §104"` + `label="§104①11 가목"` → 본문 ① 자동 amber 강조. legalBasis엔 조문만.

**800줄 정책**: `StockTransferTaxResultView`/`Helpers`가 배지 추가로 초과 시 섹션 컴포넌트 추출(양도세 `TransferReductionRows` 선례). 외부 export는 100% re-export 보존(memory `feedback_800line_split_export_preservation`).

### 5.5 Phase 4 — 테스트·회귀
- anchor: §5.2 케이스 + `LawContent` 강조 RTL(`__tests__/components/law-article-modal-highlight.test.tsx` 패턴).
- E2E `e2e/stock-transfer-law-citation-link.spec.ts`: "배지 클릭 → 조문 팝업". **헤더(props)만 단정**·본문은 법제처 API 의존이라 비단정. `E2E_PORT=3104`(worktree slot 4) worktree 격리(memory `feedback_e2e_worktree_port_isolation`).
  - ★E2E 진입 함정: 배지가 펼침/모달/칩·결과뷰 내부일 수 있음 → 노출 단계 먼저(계산 실행→결과뷰 렌더→배지). 입력폼 배지는 해당 Step 도달 필요.
- 회귀: **§82·§163⑨ 오인용 재발 grep 0 유지**(키움 정정분 회귀 감시).
- 게이트: `npx tsc --noEmit` 0 · `npm run lint` 0 error · `npm test` 전체 통과 · 800줄 충족.

---

## 6. 목표 · 비목표

### 목표
1. 주식양도세 마법사·결과뷰·신고서 노출 법조문 인용 전수를 KoreanLaw **본문 대조 검증**, 오류 정정(legal-codes/stock.ts 상수·주석 포함).
2. 검증 통과 인용을 `LawArticleModal` 클릭 팝업으로 **링크화**(미링크 → 가능한 전부). 결과뷰 분류배지·RuleBadges·신고서 라벨까지(구조화 없이 UI 상수 매핑으로).
3. 누락 약칭 보강(증권거래세법·국고금 관리법·상증규 띄움형) + 파서 anchor.
4. E2E "배지 클릭 → 조문 팝업" 동작 검증(1 spec).
5. G-5 항 하이라이트는 label에 항을 넣어 **자동 적용**(추가 구현 0).

### 비목표
- **`appliedRules: string[]` → CalculationStep 구조화**(legalBasis 필드 도입) — 엔진 대변경, **별도 과제**. 이번엔 UI 상수 매핑(`RULE_BADGE_LAW_MAP`)으로 링크화까지만.
- 엔진 계산 로직·input/result 타입 변경(14지점 동기화 **해당 없음** — 순수 UI 표시 링크).
- **해외주식(§118의2~§118의8)·국외전출세(§118의9~§118의16) 인용 심화 검증** — 별도 도메인(`foreign-stock.ts`·`exit-tax.ts`). 결과뷰 배지에 노출되는 조문 표면 링크만, 심화는 후순위.
- 행위시법(과거 과세연도 조문) 자동 전환 — 현행 조문 링크 기본.
- 비노출 인용(SEO 메타·엔진 내부 주석) — 링크화 비대상(정확성 검증은 legal-codes 상수 경유 시 포함).

---

## 7. 핵심 설계 결정

1. **인프라 신규 0** — 선행 5세목 공용 자산 그대로. 차이는 약칭·MST·조문·결과뷰 매핑 상수뿐.
2. **검증 먼저, 링크 나중** — Phase 2 통과분만 Phase 3.
3. **legal-codes 상수·UI 라벨 동시 검증·일괄 정정** — 드리프트 공유 가능. UI만 정정 금지.
4. **결과뷰 구조화 비목표·상수 매핑으로 우회** — `RULE_BADGE_LAW_MAP`을 UI 레이어 단일 소스로 신설(엔진 무변경). 배지 식별자가 곧 조문이므로 매핑은 명시적.
5. **현행 조문 링크 기본** — 행위시법 비목표.
6. **항·호는 label로** — G-5 자동 하이라이트. legalBasis엔 조문만.
7. **주석 신뢰 ≠ 본문 재대조** — 선행 신뢰도 높아도 §163⑨ 주석 상충 등 재확인(Pre-Do anchor).

---

## 8. 리스크 · 완화

| 리스크 | 완화 |
|---|---|
| **`appliedRules` 비구조화** — 링크화 시 엔진 대변경 유혹 | 구조화 비목표. `RULE_BADGE_LAW_MAP` UI 상수 매핑. 엔진 변경 금지 |
| **§163⑨ 주석 상태 상충**(Explore "미정정" vs 메모리 "정정완료") | Phase 2 본문 대조로 실측 확정. 정정은 산식·anchor 보존 |
| **라디오 description 등 런타임 string 링크 불가** | 섹션 헤더 배지행 우회. 사유 기재 |
| **신고서 라벨·RuleBadges 다수 → 매핑 누락** | 상수 매핑 + 재grep 반복(취득세 교훈: 1회 grep 부족). `Record<유니온,...>` 타입으로 컴파일러가 누락 catch(`enum-verification-before-mapping`) |
| **누락 약칭**(증권거래세법·국고금·상증규 띄움형) | Phase 1 aliases 보강 + anchor. 정식명 KoreanLaw 검증 |
| **로컬 master stale·외부 동시편집** | origin/master 기준 격리 worktree. 공유 트리 reset/commit 금지(§0) |
| **800줄 초과** — 결과뷰 배지 추가 | 섹션 추출(`TransferReductionRows` 선례)·export re-export 보존 |
| **ESLint --fix dead import 제거** | 신규 import 한 줄 한 named(CLAUDE.md 함정) |
| **E2E worktree 포트 경합** | `E2E_PORT=3104`(worktree slot 4) |
| **오류 과대주장** — 검증 전 "오류" 단정 | 본문 대조 후만 정정 단정. 미검증은 "확인 필요"(`feedback_numeric_impact_verify_before_bug_claim`) |
| **에이전트 매니페스트 오판** — `check:legal-coverage` 의존 "정확" 오판 | `get_law_text` 본문/git diff 직접 대조(4세목 반복 교훈, `feedback_stale_main_tree_before_not_done_claim`) |

---

## 9. 산출물 · 완료 기준 (DoD)

### 산출물
- 본 계획서(이 파일) → Do worktree로 이동.
- 설계 `docs/02-design/features/stock-transfer-law-citation-link.{engine,ui}.design.md`(Do 전 13단계 self-review 후).
- 인벤토리 `docs/.../stock-transfer-law-citation-inventory.md`(미링크 우선순위표).
- 코드(Do, 1 PR): aliases 보강 · `RULE_BADGE_LAW_MAP`/`FILING_FORM_LAW_MAP` 매핑 · 배지 추가 · 정정(검증 결과) · anchor · E2E.
- 메모리: `project_stock_transfer_law_citation_link` 신규 + `feedback_law_citation_link_workflow` §갱신(4세목 완결).

### 완료 기준
- [ ] Phase 0 인벤토리 고정(미링크 우선순위표·스크립트 회귀 baseline)
- [ ] aliases 보강(증권거래세법·국고금 관리법·상증규 띄움형 결정) + anchor 통과
- [ ] Phase 2 7군 전수 본문 검증(`get_law_text`), §163⑨ 주석 상태 실측 확정, 오류 정정 목록 확정(legal-codes 상수 포함)
- [ ] 미링크 중 링크 가능분 전부 `LawArticleModal` 적용(불가 유형은 사유 기재) — 결과뷰 분류배지·RuleBadges·신고서 라벨 포함
- [ ] E2E `stock-transfer-law-citation-link.spec.ts` 통과(`E2E_PORT` 격리)
- [ ] §82·§163⑨ 회귀 grep 0 유지
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 error · `npm test` 전체 통과 · 800줄 충족
- [ ] 검증한 인용 전부 정확(또는 정정 완료) — 오류 과대주장 금지
- [ ] 메모리 갱신

**전체 완료 시**: 6대 세목 + 주식양도세 **전 세목 법조문 인용 검증·링크화 완결**(마스터 계획 §10 "전체 완료" 달성).

---

## 부록 A. 미해결 "확인 필요" (계획 단계 미단정 — Phase에서 확정)
- `apply-163-9-conversion.ts` §163⑨ 주석 현재 상태(정정완료/잔존) → Phase 2 본문 대조.
- `상속세 및 증여세법 시행규칙` 띄움형 법제처 검색 가부 → Phase 1.
- 증권거래세법·국고금 관리법 코드 표기형 → **실측 확정**(검토 STEP 3): 증권거래세법 시행령=정식명 띄어쓰기(`legal-codes/stock.ts:503` `"증권거래세법 시행령 §5 1호"`)·국고금 관리법=정식명(`:235` `"국고금 관리법 §47①"`) → aliases 정식명→정식명 등록으로 충분. `상속세 및 증여세법 시행규칙` 띄움형 법제처 검색 가부만 Phase 1 잔존.
- `appliedRules` 20종 각 배지의 정확한 근거 조문(`RULE_BADGE_LAW_MAP` 내용) → Phase 2 확정.
- 입력폼 hint 미링크 정확 건수·결과뷰 링크 가능 총량 → Phase 0 인벤토리.
- 조특법 §104의4(ATS) 실제 사용 여부 → Phase 2.

---

## 부록 B. 검토 로그 (13단계 self-review STEP 1~4 + 통합정합, 2026-06-15)

### 적용 범위
사용자 지시(옵션 ① 검토·보완)에 한정. 13단계 중 **STEP 1~4(계획서 다중검토→정정→재검토→정정) + 통합정합**을 수행. **STEP 5·12(`.engine.design.md`·`.ui.design.md` 생성)는 옵션 ②(Do 착수) 분리** — 사용자가 ①·②를 명시 구분(마스터 계획서 부록 B 선례 동일).

### 실측 근거 (추정 금지 — origin/master `33f7e6bc` 기준 git grep/show)
- `<LawArticleModal` JSX 개수: PostListingDetailCard **5**·MajorShareholderCheckpointHints **14**(`git grep -c "<LawArticleModal"`).
- `appliedRules` 유니온 **20종**·`RULE_BADGE`(tone) **17종**(types L725~744·Helpers L212~229 덤프 카운트).
- `legal-codes/stock.ts` **556행**·환산취득가 §163⑫(L128~129)→§176의2·개산공제 §163⑥4(L167)·상증규 띄움형 §17(L214)·국고금 §47①②③(L234~239)·증권거래세법 시행령 §5(L503~522).
- 입력폼 10컴포넌트·결과뷰 8파일 실존(`git ls-tree`).
- aliases: `소령`·`상증령`·`조특령` 등록(양도세 PR분)·`증권거래세법`·`국고금 관리법`·`상증규 띄움형` 미등록(`git grep` 0).

### 검토 발견·정정 (1·2차 누적 — 항목 7·치환 11)
| # | 차 | 카테고리 | 우선 | 위치 | 정정 |
|---|---|---|---|---|---|
| 1 | 1 | 오류 | High | §3.2·§5.4·부록A | `appliedRules`/`RuleBadges` "19종"→실측 **20종**(4곳) |
| 2 | 1 | 오류 | High | §1·§3.3 | `MajorShareholderCheckpointHints` "12배지"→실측 **14**(JSX `<LawArticleModal`)(2곳) |
| 3 | 1 | 모순/개선 | Med | §3.2·§5.4 | 신설 `RULE_BADGE_LAW_MAP` ↔ 기존 `RULE_BADGE`(tone 17종, L212) 혼동 → 별개·구분 명시 + `Record<유니온>` **20종 전수** 강제(누락 컴파일에러) |
| 4 | 1 | 누락 | Low | §5.3 | legal-codes 환산취득가 이미 §163⑫→§176의2 정정완료(L128) 보강 → §163⑨ 잔존 의심은 `apply-163-9-conversion.ts` 주석 국한 |
| 5 | 2 | 오류 | Med | §3.1 | 결과뷰 "results 5섹션"→실측 **8파일**(PenaltySection·Besshi 2종 누락 방지) |
| 6 | 2 | 누락 | Med | §5.1 | Phase 0 ROOTS 결과뷰 8파일 구체화(Besshi 부표 인용 포착) |
| 7 | 2 | 개선 | Low | 부록A | 증권거래세법 시행령·국고금 표기형 실측 확정(정식명) → "확인 필요" 해소 |

### 통합정합 (계획서 내부 정합축)
| 정합 축 | 판정 |
|---|---|
| §3.2 배지수·종수(20종·14·tone17) ↔ §5.4 링크화(P1/P2 20종 전수) | ✓ |
| §4.1 약칭갭(증권거래세법·국고금·상증규) ↔ §5.2 Phase 1 ↔ §4.2 MST | ✓ |
| §3.1 결과뷰 8파일 ↔ §5.1 Phase 0 ROOTS | ✓ |
| §6 비목표(해외·전출세 *심화*) ↔ §5.4 P1(분류배지 *표면* 링크) | ✓ (표면 vs 심화 구분) |
| §163⑨ 상충 ↔ legal-codes §163⑫ 실측 ↔ §5.3 Phase 2 | ✓ |
| `RULE_BADGE`(tone 17) ↔ `RULE_BADGE_LAW_MAP`(20 신설·별개) | ✓ |
| memory 참조(`feedback_kiwoom_law_citation_drift`·`feedback_law_citation_link_workflow` 등) 실재 | ✓ |

### 잔여 (Phase에서 확정 — 부록 A 참조)
Critical/High 잔존 **0**. `apply-163-9-conversion.ts` §163⑨ 주석 상태·상증규 띄움형 검색 가부·`appliedRules` 20종 각 근거 조문은 Phase 0/2 본문 대조로 확정.
