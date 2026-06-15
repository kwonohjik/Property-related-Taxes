# 주식양도세 법조문 인용 링크화 — UI 설계

> 계획서: `docs/00-pm/stock-transfer-law-citation-link.plan.md` · 엔진설계: `stock-transfer-law-citation-link.engine.design.md`
> 입력 폼(`components/calc/stock-transfer/**`)·결과뷰 미링크를 `LawArticleModal` 배지로 링크. 기존 링크: `MajorShareholderCheckpointHints`(14배지)·`PostListingDetailCard`(5배지) — 확인만.

## 1. 개요 — UI 측 책임

1. **결과뷰 분류배지·메시지 링크**: `StockTransferTaxResultView.tsx`의 `TAX_CATEGORY_LABEL`(L84~97, 13종)·양도가액 헤더(L119)·비과세 메시지(L219·221) → `LawArticleModal`.
2. **RuleBadges 링크**: `StockTransferTaxResultViewHelpers.tsx`의 `RuleBadges`(L232, 20종) → 신규 `RULE_BADGE_LAW_MAP` 매핑 경유 배지화(§3).
3. **신고서 라벨 링크**: `StockFilingFormTableHelpers.ts`(~20조문) → 라벨 렌더 시 `parseLawRefsForModal`.
4. **입력 폼 배지 링크**: `AcquisitionLotsMatrix`·`OtherAssetBlock`·`CapitalAdjustmentsBlock`·`CaseFortyNineFormulaCard`·`MonthlyAccrual81Section`·`EstimatedUnlistedBlock`·`PostListingValuationCard`·`InstallmentReceiptsMatrix`·`SecuritiesTransactionTaxCard` 등 hint/헤더 → 배지(검증 통과분).
5. **확인만**: `MajorShareholderCheckpointHints`(14)·`PostListingDetailCard`(5) — 기존 LawArticleModal 정확성 점검.

## 2. 배지 패턴 (기존 `PostListingDetailCard` L128~152 준수)

```tsx
// 정식명(+항) → legalBasis · 축약(+항) → label(G-5 자동 하이라이트)
<LawArticleModal legalBasis="소득세법 시행령 §165 ④ 1호" label="§165④1" />
```
규칙(전 세목 공통):
- `legalBasis`: 정식명 또는 보강 약칭 + 조문(+항). **법령명 생략 `§`는 법령명 보완**(예 분류배지 `"§94①3 가목"` → legalBasis `"소득세법 §94①3"`·label `"§94①3 가목"`).
- `label`: 짧은 표시 + 항(G-5 amber 자동 강조). `legalBasis`엔 조문만.
- 복합: `parseLawRefsForModal(label).map(...)`.

## 3. ★ `RULE_BADGE_LAW_MAP` 설계 (신규 — UI 레이어, 엔진 변경 0)

`StockTransferTaxResultViewHelpers.tsx`에 **신규 상수**. 기존 `RULE_BADGE`(L212, **tone 17종**)와 **별개**(이름 혼동 주의). `appliedRules` 유니온 **20종 전수**를 타입으로 강제:

```ts
// 기존 RULE_BADGE(tone, 17종)는 그대로 — 색상. 신규는 legalBasis.
const RULE_BADGE_LAW_MAP: Record<
  NonNullable<StockTransferResult["appliedRules"]>[number], string
> = { /* 20종 — 누락 시 컴파일 에러(enum-verification-before-mapping) */ };
```

**잠정 매핑(Phase 2 본문 대조 후 확정 — `?`는 검증 필요)**:

| 배지 | 잠정 legalBasis | 비고 |
|---|---|---|
| §94②우선 | 소득세법 §94② | 의제 우선규정 |
| 80%하한 / 80%하한미적용 | 소득세법 시행령 §165④ 1호 | 비상장 보충평가 80% 하한 |
| 단기30% | 소득세법 §104①11 | 단기보유 세율 |
| 거래정지우회 / 취득일거래정지우회 | 소득세법 시행령 §165③ | 관리종목·거래정지 |
| §97②단서swap | 소득세법 §97② | 취득가 swap |
| KOTC중소중견비과세 | 소득세법 §94①3 나목 단서 | |
| KOTC벤처비과세 | 조특법 §14①7호 | |
| 월할가산 | 소득세법 시행규칙 §81④ | |
| 의제취득일적용 | 소득세법 시행령 §162⑦3호 | 의제취득일 1986.1.1.(주식·Phase 2 본문 확인 — §162①은 오류였음) |
| 장부분실액면가 | 소득세법 §99①4 후단 | |
| 기타자산우선§55누진 | 소득세법 §55 · §94①4 | 복합(2배지) |
| 기본공제부동산그룹합산 | 소득세법 §103② | |
| 로트개별법 / 로트선입선출 / 로트이동평균 | 소득세법 시행령 §162⑤ ? | 양도자산 취득시기·취득가 산정 — 조항 확인 |
| F15F16대차사모펀드자동가산 | ? | 대차거래·사모펀드 — 근거 조문 Phase 2 확정 |
| 판정기준일특수분기 / 본인미보유강제합산 | 소득세법 시행령 §157 ? | 대주주 판정 — 조항 확인 |

> 렌더: `RuleBadges`에서 각 `rule`을 `RULE_BADGE_LAW_MAP[rule]`로 `legalBasis`, `rule` 문자열을 `label`. **보류 메커니즘**: `Record<유니온>`은 20종 키 전수 요구(타입 강제) → `?` 미확정·근거 모호 배지는 **값 `""`(빈 문자열)** 로 두고 `RuleBadges` 렌더에서 `legalBasis===""`면 `LawArticleModal` 미생성(tone 배지만 유지). 잘못된 링크 금지(계획서 §7 결정 2). Phase 2에서 `""`→확정 조문으로 채움.

## 4. 파일별 적용 (우선순위 = 효과·확실성 순)

| 우선 | 파일 | 대상 | 전략 |
|---|---|---|---|
| P1 | `results/StockTransferTaxResultView.tsx` | `TAX_CATEGORY_LABEL` 13·헤더·비과세 메시지 | 라벨 렌더 지점 `parseLawRefsForModal` 또는 직접 배지 |
| P1 | `results/PostListingDetailCard.tsx` | 기존 5 | 확인만(모델) |
| P1 | `stock-transfer/MajorShareholderCheckpointHints.tsx` | 기존 14 | 확인만 |
| P2 | `results/StockTransferTaxResultViewHelpers.tsx` | `RuleBadges` 20 | `RULE_BADGE_LAW_MAP`(§3) |
| P2 | `stock-transfer/StockFilingFormTableHelpers.ts` | 신고서 ~20조문 | 라벨 → `parseLawRefsForModal` |
| P3 | `stock-transfer/{AcquisitionLotsMatrix,OtherAssetBlock,CapitalAdjustmentsBlock,CaseFortyNineFormulaCard,MonthlyAccrual81Section,EstimatedUnlistedBlock,PostListingValuationCard,InstallmentReceiptsMatrix,SecuritiesTransactionTaxCard}.tsx` | hint/헤더 §인용 | 섹션 헤더 배지행(hint string은 직접 링크 불가 → 헤더 우회) |
| P3 | `results/{StockTransferPenaltySection,ListedStockBesshiResultSection,UnlistedStockBesshiResultSection,ForeignStockResultCard,UnlistedStockSimpleValuationSection}.tsx` | 가산세·부표·해외 인용 | Phase 0 인벤토리로 확정 후 배지(해외=표면만) |

## 5. 링크 불가 유형 + 우회 (런타임 string)

- **불가**: `RadioCardOption.description`(`MarketTypeBlock` 등)·`ToggleCard`/`RadioCardGroup` `title`·`FieldCard` `hint`(string prop).
- **우회**: 해당 섹션 헤더 `<p>` 옆/아래 `<div className="flex flex-wrap gap-1.5">` 배지행 · 펼침 children 안 배지.

## 6. E2E 설계 (`e2e/stock-transfer-law-citation-link.spec.ts`)

| 테스트 | 시나리오 |
|---|---|
| SLAW-1 | 비상장 대주주 계산 → 결과뷰 분류배지(§94①3 나목) 클릭 → 팝업 헤더 "소득세법 제94조" 단정 |
| SLAW-2 | RuleBadges(예 §165④1 80%하한) 배지 → legalBasis 헤더 변환 확인 |
| SLAW-3 | ESC/중첩 dialog 독립 닫힘 |

- **헤더(props 기반)만 단정** · 본문은 법제처 API 의존이라 비단정(상속 `law-article-popup.spec.ts` 철학).
- `E2E_PORT=3104`(worktree slot 4 격리, reuseExistingServer).
- **진입 함정**: 결과뷰 배지는 계산 실행 후 노출 → 입력 완료·계산 단계 먼저. 비상장 대주주 경로(가장 인용 풍부) 사용. memory `feedback_browser_verify_with_playwright`.

## 7. 동기화 지점 (8지점 — 해당 없음 명시)

엔진 input/result 무변경, 순수 표시 링크 → ①폼상태~⑧validation 동기화 **불요**. 사이드바 합계·API 변환·validate 영향 0. `RULE_BADGE_LAW_MAP`은 UI 표시 전용 상수(엔진 미경유). (CLAUDE.md 14지점은 엔진 필드 변경 시에만)

## 8. RTL 테스트

`LawContent` 항 하이라이트는 상속·증여 기존 `__tests__/components/law-article-modal-highlight.test.tsx`(HL-1~3)로 커버 — 주식양도세 추가 불요. 주식 신규는 parseLawRef anchor(엔진설계 §4 TC-S1~7·CM-S1)로 충분. `RULE_BADGE_LAW_MAP` 20종 전수는 `Record<유니온>` 타입이 컴파일 시 강제.
