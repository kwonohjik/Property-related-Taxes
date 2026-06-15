# 주식양도세 법조문 인용 검증 — 엔진/데이터 설계

> 계획서: `docs/00-pm/stock-transfer-law-citation-link.plan.md` · 브랜치 `feat/stock-transfer-law-citation-link`(← origin/master)
> 본 작업은 **계산 로직 무변경**(14지점 동기화 해당 없음). 엔진 측 작업은 (A)인용 정확성 검증 + 약칭 보강 + 파서 anchor.

## 1. 개요 — 엔진 측 책임 3가지

1. **(A) 인용 정확성 검증**: ① UI 인용 텍스트 + ② **`legal-codes/stock.ts` 상수**(556행 — 결과뷰 분류배지·RuleBadges·신고서 라벨이 직·간접 참조) + ③ 엔진 주석(`apply-163-9-conversion.ts` §163⑨ 잔존 의심).
2. **약칭 보강**: `aliases.ts`에 `증권거래세법`·`증권거래세법 시행령`·`국고금 관리법`(+ `상속세 및 증여세법 시행규칙` 띄움형은 검색 가부 확인 후).
3. **parseLawRef anchor**: 주식 표기 케이스(Pre-Do 선행).

> ★주식양도세는 `appliedRules: string[]`(20종)을 **CalculationStep으로 구조화하지 않는다**(비목표). 결과뷰 배지의 legalBasis는 UI 레이어 `RULE_BADGE_LAW_MAP`(UI 설계 §3)에 두고, 엔진 input/result는 무변경.

## 2. 검증 케이스 인벤토리 (KoreanLaw `get_law_text` 본문 대조 — `verify_citations`는 존재만 확인하므로 금지)

MST: 소득세법 `285523` · 시행령 `286211` · 시행규칙 `286379` · 조특법 `286597` · 조특령 `286143` · 상증법 `276123` · 상증령 `283637` · 상증규 `284609` · 증권거래세법·국고금 관리법(Phase 1 `search_law`).

| 군 | 조문 | 검증 포인트 | 주요 위치 | 상태 |
|---|---|---|---|---|
| A 과세대상 | 소득세법 §94①3·4·§118의2~ | 상장/비상장/기타자산·해외 분류 | `stock-classification.ts`·`legal-codes/stock.ts`·`TAX_CATEGORY_LABEL` | Phase2 |
| B 대주주·기준시가 | §99①3·4, 시행령 §157·§165·§167(의8) | 대주주 임계(50억/10억·지분율)·1개월 종가평균 | `stock-rate-tables.ts`·`stock-valuation-listed.ts`·`MajorShareholderCheckpointHints` | Phase2 |
| C 세율·보유기간·기본공제 | §103②·§104①11·§104② | 그룹 기본공제·단기30%·보유기간 기산 | `legal-codes/stock.ts`·`stock-transfer-helpers.ts` | Phase2 |
| D 비상장 보충적평가 | 시행령 §165④·§176의2②1호, 환원율 시칙 §81②·상증칙 §17·상증령 §54·§55·§52의2② | (순손익3+순자산2)/5·80%하한·취득후상장 환산·환원율 위임체인 | `stock-valuation-unlisted.ts`·`stock-valuation-post-listing.ts`·`PostListingDetailCard` | Phase2 ★ |
| E §163⑨·§82 회귀 | (정정 완료분 — 재확인) | 환산취득가·환원율 | `apply-163-9-conversion.ts`·`stock-valuation-post-listing.ts` | Phase2 ★실측 |
| F K-OTC·전자신고 | 조특법 §14①7호·§104의8·(§104의4 ATS 사용 여부) | K-OTC 비과세·전자신고공제 | `stock-classification.ts`·`stock-transfer-finalize.ts` | Phase2 |
| G 증권거래세·가산세·절사 | 증권거래세법 §2·§8·시령 §5, 농특세법 §5①5호, 국기법 §47의2·3·4, 국고금 관리법 §47①②③, 지방세법 §103의3 | STX 세율 차등·가산세·절사·지방소득세 | `securities-transaction-tax.ts`·`stock-transfer-finalize.ts`·`legal-codes/stock.ts:479~548` | Phase2 |

**D·E군 ★실측 보강(검토 STEP 1)**: `legal-codes/stock.ts`는 환산취득가 위임이 이미 **§163⑫(L128~129 `ENFORCEMENT_DECREE_163_12`)→§176의2②~④**로 정정완료·개산공제 **§163⑥4(L167)** — legal-codes에 §163⑨ 미사용. 따라서 §163⑨ 잔존 의심은 **`apply-163-9-conversion.ts`(파일명만 historical) 주석에 국한**될 개연성 → Phase 2에서 그 파일 본문 대조로 확정(정정 시 산식·anchor 보존, memory `feedback_kiwoom_law_citation_drift` D-1/D-2).

## 3. aliases 보강 (`lib/korean-law/aliases.ts`)

```ts
// ── 증권거래세 (신규 블록) ──
증권거래세법: "증권거래세법",
"증권거래세법 시행령": "증권거래세법 시행령",
// ── 국고금 (신규) ── 정식명 공백 주의
"국고금 관리법": "국고금 관리법",
국고금관리법: "국고금 관리법",
```
근거(실측 origin/master): `legal-codes/stock.ts:492·503` `"증권거래세법 §8①"`·`"증권거래세법 시행령 §5 1호"`·`:235` `"국고금 관리법 §47①"`. 현재 미등록 → `resolveLawAlias` 원문 반환. 정식명→정식명 등록으로 법제처 검색 보장(`소령` 등 양도세 보강분은 이미 존재). `상속세 및 증여세법 시행규칙`(L214 띄움형)은 Phase 1에서 `search_law` 검색 가부 확인 후 별칭 추가 여부 결정.

## 4. parseLawRef anchor (Pre-Do 선행 — `__tests__/korean-law/law-url-ref.test.ts`)

| anchor | 입력 | 기대 |
|---|---|---|
| TC-S1 | `증권거래세법 §8①` | `{증권거래세법, "8"}` |
| TC-S2 | `증권거래세법 시행령 §5 1호` | `{증권거래세법 시행령, "5"}` |
| TC-S3 | `국고금 관리법 §47①` | `{국고금 관리법, "47"}` |
| TC-S4 | `소득세법 시행령 §167의8①2호` | `articleNum "167의8"` (가지번호 흡수) |
| TC-S5 | `소득세법 시행령 §176의2②1호` | `articleNum "176의2"` |
| TC-S6 | `조특법 §14①7호` | `{조세특례제한법, "14"}` |
| TC-S7 | `§104①11` (법령명 없음) | `[]` (skip — 회귀 보존) |
| CM-S1 | label `§104①11 가목` | extractClauseMarkers → `①` 강조 |

Pre-Do: TC-S1·S3(신규 약칭 보강 검증)를 aliases 보강 직후 **먼저 실행** → 통과 확인 후 나머지(`feedback_pre_anchor_verification`).

## 5. 엔진 legalBasis 문자열 검증·정정 (E·G군 상세)

- 대상 grep: `lib/tax-engine/stock-transfer/**`·`legal-codes/stock.ts`. legalBasis로 노출되는 상수(분류배지·신고서·RuleBadges가 직·간접 참조).
- 각 문자열: ① `parseLawRef` 통과(약칭·항·호·복합 `·` 분해) ② KoreanLaw 본문 대조.
- 오류 시 정정 위치: `legal-codes/stock.ts` 상수 또는 주석. UI 라벨과 드리프트 공유 시 **일괄 정정**(UI만 금지, 양도세 §9 교훈). 정정마다 anchor 추가.
- **선행 신뢰도 高**(키움 2026-05-19 §82·§163⑨ 정정 이력) → 표본 오류율 낮을 것. **오류 과대주장 금지**.

## 6. 정정 정책
- **법령 정합 우선**(memory `feedback_anchor_correction_legal_priority`·`feedback_engine_comment_vs_impl_drift`).
- **오류 과대주장 금지**(memory `feedback_numeric_impact_verify_before_bug_claim`) — 본문 대조로 확정한 것만 정정.
- 계산 로직·산식·anchor 보존(주석·라벨·상수 문자열만 변경). 산식 영향 상수면 anchor 우선 점검.
