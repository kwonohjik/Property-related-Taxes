# 상속·증여 법조문 인용 인벤토리 (Phase 0)

> 추출: `scripts/extract-law-citations.mjs` (노출 prop label·hint·title·description·placeholder·legalBasis + JSX텍스트의 §/제N조, 주석·식별자 제외). 2026-06-15.

## 집계

| 구분 | 수 |
|---|---|
| 노출 인용 | **218** |
| 링크됨 (legalBasis=) | **31** |
| 미링크 | **187** |
| 대상 파일 | 61 |

## 미링크 상위 파일

| 미링크 | 노출 | 링크 | 파일 |
|---|---|---|---|
| 14 | 16 | 2 | `FarmingEligibilitySection.tsx` |
| 12 | 14 | 2 | `FamilyBusinessEligibilitySection.tsx` |
| 12 | 15 | 3 | `estate-card/variants/EstateBodyRealEstate.tsx` |
| 11 | 22 | 11 | `Step4Deductions.tsx` |
| 7 | 7 | 0 | `InstallmentInputSection.tsx` (§70~73) |
| 7 | 7 | 0 | `unlisted-stock-v2/CorporateInfoSection.tsx` (§54·§59) |
| 7 | 7 | 0 | `unlisted-stock-v2/GoodwillCalculationTable.tsx` (§59 영업권) |
| 6 | 6 | 0 | `gift/StockBurdenedDebtSection.tsx` (§47①③) |
| 5 | 5 | 0 | `HeirAssessmentCard` · `EstimatedProfitToggle` · `NetAssetCalculationTable` · `PerShareValuationResultCard` |

## 미링크 유형 (링크 가능성)

| 유형 | 링크 방법 | 가능 여부 |
|---|---|---|
| `<p>` 제목 / JSX 텍스트 | 인라인 `LawArticleModal` | ✅ 가능 |
| `FieldCard` `hint`/`badge`(ReactNode) | badge 슬롯 | ✅ 가능 |
| `ToggleCard`/`RadioCardGroup` `title`(string) | 컴포넌트 옆 별도 배지 행 | △ 우회 필요 |
| 에러메시지 객체 값(string) | 불가 (런타임 문자열) | ✗ |

## 검증 완료 조문 (KoreanLaw 본문 대조 — 전부 정확)

§18·§20·§22②·§24·§60·§61⑤·§63③·§66·§18의2·§18의3 (본법) / 상증령 §15·§16·§49·§63② (시행령)

## Phase 2 남은 검증 대상 (인벤토리 신규 등장)

- §23(재해손실)·§20②(멸실재산 평가) — `CasualtyLossSection`
- §74(징수유예) — `CulturalHeritageSection`
- §10(상속재산 의제 제외 1~6호) — `DeemedCategorySection`
- 상증령 §19①(금전신탁만 §22 금융재산) — `DeemedCategorySection`
- §59(영업권)·§54·§56(비상장 순자산·순손익) — `unlisted-stock-v2/*`
- §70~73(연부연납·물납) — `InstallmentInputSection`
- 소득세법 §104의3(비사업용토지) — `CorporateNonBusinessAssetsSection`
- §23의2②(동거 부득이) — `CohabitRequirementBlock`

## 진행 (커밋 7c61e0b1, PR #196)

핵심 섹션 메인 인용 링크 완료. 세부 제목·hint·결과뷰는 후속 Phase 3.
