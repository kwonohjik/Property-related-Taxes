# 주식양도세 법조문 인용 인벤토리 (Phase 0)

> 추출: `scripts/extract-law-citations.mjs stock-transfer`(세목 인자화). 2026-06-15. 회귀 baseline.

## 집계

| 구분 | 수 |
|---|---|
| 노출 인용 | **136** |
| 링크됨 (legalBasis=) | **9** |
| 미링크 | **127** |
| 대상 파일 | 29 |

> 기존 링크: `PostListingDetailCard`(5) + `MajorShareholderCheckpointHints`(14배지는 un=0이라 상위목록 외) 등. 줄 단위 집계라 멀티라인 JSX는 분산 카운트.

## 미링크 상위 파일

| 미링크 | 노출 | 파일 | 분류 |
|---|---|---|---|
| 17 | 17 | `stock-transfer/ExitTaxBlock.tsx` | ★비목표(국외전출세 §118의9~) — 표면만 |
| 13 | 13 | `stock-transfer/PostListingValuationCard.tsx` | P3 취득후상장 §165 |
| 11 | 11 | `stock-transfer/EstimatedUnlistedBlock.tsx` | P3 비상장평가 §165④·§99①4·§163⑥4 |
| 10 | 10 | `results/StockTransferPenaltySection.tsx` | P3 가산세 국기법 §47의2~4 |
| 9 | 9 | `stock-transfer/ForeignStockBlock.tsx` | ★비목표(해외 §94①3다·§118의2~) — 표면만 |
| 8 | 13 | `results/PostListingDetailCard.tsx` [import] | P1 확인만(기존 5링크) |
| 7 | 7 | `stock-transfer/OtherAssetBlock.tsx` | P3 기타자산 §94①4 |
| 6 | 6 | `stock-transfer/AcquisitionInfoBlock.tsx` | P3 §162①·§104② |
| 6 | 6 | `results/ForeignStockResultCard.tsx` | ★비목표(해외) — 표면만 |
| 5 | 5 | `stock-transfer/MajorShareholderBlock.tsx` | P3 §157·§167의8 |
| 4 | 4 | `stock-transfer/AcquisitionLotsMatrix.tsx` | P3 §104②·§97의2 |
| 3 | 3 | `results/StockTransferTaxResultViewHelpers.tsx` | P2 RuleBadges 20종 |
| 2 | 2 | `results/StockTransferTaxResultView.tsx` | P1 분류배지(멀티라인 분산) |
| 2 | 2 | `stock-transfer/{CompanyType,FaceValue,InstallmentReceipts,MarketSample,MonthlyAccrual81,StockFilingFormTable}` | P2/P3 |

> 비목표(ExitTax 17 + ForeignStock 9 + ForeignStockResultCard 6 = **32**)는 해외/전출세 심화 — 결과뷰 표면 배지만, 본문 심화검증 후순위(계획서 §6).

## 미링크 유형 (링크 가능성)

| 유형 | 예 | 링크 방법 | 가능 |
|---|---|---|---|
| JSX 텍스트 `<p>`/`<strong>` | `(시행령 §162①)`·`① 양도기준시가 (시행령 §165④1)` | 인라인 `LawArticleModal` | ✅ |
| `FieldCard` `hint`(string) | `hint="§104② 단기 30% 기산점"` | 섹션 헤더 배지행 우회 | △ |
| `label`(string) | `label="피상속인 취득일 (§104②1)"`·`label="거주자 요건 (§118의9①1호)"` | 라벨 옆 배지 or 헤더 | △ |
| 라디오 `description`/`title`(string) | `description="조특법 §14①7호 — …"`·`title="… (§99①4 후단)"` | 섹션 헤더 배지행 우회 | △ |
| `RuleBadges` 식별자 | `appliedRules` 20종 | `RULE_BADGE_LAW_MAP`(UI설계 §3) | ✅ |

## Phase 2 검증 대상 조문 (인벤토리 신규 등장 — 본문 대조)

- 소득세법 시행령 **§162①**(의제취득일 1986.1.1.) — `AcquisitionInfoBlock`·`AcquisitionLotsMatrix`
- §104②(1·3 보유기간 기산)·§97의2(이월과세 미적용) — `AcquisitionLotsMatrix`
- §165④(1·3·단서 80%하한·순자산단독)·§99①4 후단(액면가)·§163⑥4(개산공제) — `EstimatedUnlistedBlock`·`CaseFortyNineFormulaCard`
- 소칙 §81④ 1호(월할가산) — `EstimatedUnlistedBlock`·`MonthlyAccrual81Section`
- 상증령 §54·§55(순손익·순자산) — `EstimatedUnlistedBlock`
- §94①3 나목 단서·조특법 §14①7호(K-OTC) — `CompanyTypeBlock`
- §157·§167의8(대주주) — `MajorShareholderBlock`
- 국기법 §47의2~4(가산세) — `StockTransferPenaltySection`
- §118의9①·§178의8·§167의8 준용·§178의9·§118의12(국외전출세) — `ExitTaxBlock`(비목표 표면)

## Phase 3 우선순위 (계획서 §5.4 P1~P3 + 인벤토리)

P1 결과뷰 분류배지(`StockTransferTaxResultView` TAX_CATEGORY_LABEL 13)·기존 5/14 확인 → P2 RuleBadges 20·신고서 → P3 입력폼(EstimatedUnlisted·AcquisitionInfo·CompanyType·MajorShareholder·OtherAsset·CaseFortyNine 등) → 비목표 표면(ExitTax·ForeignStock).
