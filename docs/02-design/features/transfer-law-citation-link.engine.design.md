# 양도세 법조문 인용 검증 — 엔진/데이터 설계

> 계획서: `docs/00-pm/transfer-law-citation-link.plan.md` · 브랜치 `feat/transfer-law-citation-popup`
> 본 작업은 **계산 로직 무변경**(14지점 동기화 해당 없음). 엔진 측 작업은 (A)인용 정확성 검증 + 약칭 보강 + 파서 anchor.

## 1. 개요 — 엔진 측 책임 3가지

1. **(A) 인용 정확성 검증**: ① UI 인용 텍스트 + ② **엔진 `step.legalBasis` 문자열**(결과뷰 `DetailedCalculationStatementCard`가 `<LawArticleModal legalBasis={step.legalBasis}/>`로 렌더 — 실측 202·299행) + ③ `lib/tax-engine/legal-codes/`의 `TRANSFER.*` 상수.
2. **약칭 보강**: `aliases.ts`에 `소법`·`소령`.
3. **parseLawRef anchor**: 양도세 표기 케이스(Pre-Do 선행).

## 2. 검증 케이스 인벤토리 (KoreanLaw `get_law_text` 본문 대조 — `verify_citations`는 존재만 확인하므로 금지)

MST: 소득세법 `285523` · 시행령 `286211` · 시행규칙 `286379` · 조특법 `286597` · 조특령 `286143` · 조특규 `286381` · 상증법 `276123` · 상증령 `283637`.

| 군 | 조문 | 검증 포인트 | 상태 |
|---|---|---|---|
| A 재개발·재건축 | 소득령 §166·§164⑤⑥⑦·§176의2③·§162①4호 | 양도차익 산정·기준시가 환산·취득시기 | §166 ✓ (Phase2 나머지) |
| B 필요경비·환산·의제취득 | 소득세법 §97·§97의2·§114⑦, 소득령 §163·§163의2·§176의2 | 환산취득가·개산공제(§163⑥)·상속증여 취득가의제(§163⑨)·이월과세(§97의2) | §163 ✓ |
| C 비과세·장특공·중과 | 소득세법 §89·§95·§103·§104, 소득령 §154·§155·§161·§167의3 | 1세대1주택·일시적2주택·장기보유특별공제·기본공제·다주택중과 | Phase2 |
| D 비사업용 토지 | 소득세법 §104의3, 소득령 §168의6~14·§168의12 | 비사업용 판정·부득이한 사유·배율 | §168의14 ✓ |
| E 감면(조특) | 조특법 §97·§98의2~9·§99·§99의2~4·§133, 조특령 §97의3·§98·§99 시리즈, 농특세법 §5 | 미분양·신축·임대주택 감면 요건·농특세 | Phase2 (★행위시법) |
| F 부담부증여 | 소득령 §159, 상증법 §60·§61·§62 | 양도가액 안분·인수채무 평가 | Phase2 |
| G 결과뷰 엔진 문자열 | 위 조문이 `step.legalBasis`·`TRANSFER.*` 상수 | parseLawRef 통과 + 본문 정합 | Phase2 |

**E군 ★행위시법 주의**(memory `feedback_reduction_sunset_is_acquisition_window`): 조특 §98의3·§99 등은 시기별 한시·일몰. 현행 법제처에서 "삭제"이거나 부재 가능 → 본문 검증으로 링크 가부 판정. 일몰 조문도 그 기간 취득분 현재 양도 시 적용되므로 "과거 조문=불필요" 단정 금지.

## 3. aliases 보강 (`lib/korean-law/aliases.ts`)

```ts
// ── 소득세 ── 블록에 추가
소법: "소득세법",
소령: "소득세법 시행령",
소득령: "소득세법 시행령",
```
근거: 실측 인용 `소법 §97의2④2호`·`소령 §166⑥`·`소령 §176조의2④`. 현재 `resolveLawAlias("소령")`이 원문 반환 → 법제처 검색 실패. 보강 후 정식명 해석.

## 4. parseLawRef anchor (Pre-Do 선행 — `__tests__/korean-law/law-url-ref.test.ts`)

| anchor | 입력 | 기대 |
|---|---|---|
| TC-T1 | `소법 §97의2④2호` | `{소득세법, "97의2"}` |
| TC-T2 | `소령 §166⑥` | `{소득세법 시행령, "166"}` |
| TC-T3 | `소득세법시행령 §168조의14` | `articleNum "168의14"` (§+조 흡수 확인) |
| TC-T4 | `소득세법 §104의3` | `{소득세법, "104의3"}` |
| TC-T5 | `§104의3` (법령명 없음) | `[]` (skip — 회귀 보존) |
| TC-T6 | `조특령 §98의5②` | `{조세특례제한법 시행령, "98의5"}` |

Pre-Do: TC-T1·TC-T2(약칭 보강 검증)를 aliases 보강 직후 **먼저 실행** → 통과 확인 후 나머지.

## 5. 엔진 legalBasis 문자열 검증·정정 (G군 상세)

- 대상 grep: `lib/tax-engine/transfer*.ts`·`transfer-reductions/`·`legal-codes/`. 실측 다수(조특령 §98의5②·§99의2①8호·§98의8①·소득령 §163⑨ 등).
- 각 문자열: ① `parseLawRef` 통과(약칭·항·호·복합 `·` 분해) ② KoreanLaw 본문 대조.
- `TRANSFER.*` 템플릿 리터럴(예: `` `${TRANSFER.ACQ_INHERITED_SUPPLEMENTARY} · 상증법 §61` ``)은 상수 정의(`legal-codes/`) 추적 후 검증.
- 오류 시 정정 위치: `legal-codes` 상수 또는 step.legalBasis 생성부. 정정마다 anchor 추가.

## 6. 정정 정책
- **법령 정합 우선**(memory `feedback_anchor_correction_legal_priority`·`feedback_engine_comment_vs_impl_drift`).
- **오류 과대주장 금지**(memory `feedback_numeric_impact_verify_before_bug_claim`) — 본문 대조로 확정한 것만 정정. 표본 3/3 정확했으므로 대량 오류 가정 금지.
