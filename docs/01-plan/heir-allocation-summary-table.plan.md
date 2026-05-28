# 상속인별 상속세부담액 집계 표 (이미지 8) 구현 계획

> PDF 사례(이미지 9~16) **결과값 100% 재현** — 추정 금지, 수치 단정 시 anchor로 증명.
> 정본 우선순위: 이미지 17·18·19·20 (협의분할·추정상속·채무) > 이미지 9 (단 ㉠부동산의 아파트·농지 금액은 무시, 나머지는 정본).
> [[pdf-case-replica-workflow]] · [[feedback_pdf_table_row_one_to_one_mapping]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_pre_anchor_verification]] · [[bigint-round-half-up]] · [[echo-field-pattern]] · [[enum-verification-before-mapping]]

---

## 0. 사례 데이터 (Anchor 동결값)

상속개시일 **2023.3.5.** · 피상속인 = 비상장 중소기업 M사 대표이사 25년 재직.

### 0.1 상속인 구성 (5인) — UI 입력은 **가변 N인**
| ID | relation | 비고 |
|---|---|---|
| spouse | spouse | 배우자(갑) |
| child1 | child | 장남(을) |
| child2 | child | 차남(병) — 가업상속·동거주택, 무주택자, 3년 이상 부장 재직 |
| corp_M | corporate | 영리법인 M사 (5년 이내 사전증여 700M 수증) |
| grand | legatee + `isGenerationSkipBeneficiary=true` | 손녀(정) — 유증 500M, 세대생략 |

> ⚠️ `HeirRelation` enum에 `legatee` · `corporate` **이미 존재** (`types/inheritance-gift.types.ts:481-489`). 신규 enum 추가 불요.

### 0.2 자산 협의분할 (이미지 17·18) — 합 6,680M = 본래 6,506M + 간주 174M
| 자산 | EstateItem.category | deemedCategory | 평가액 | 배우자 | 장남 | 차남 | 손녀 |
|---|---|---|---:|---:|---:|---:|---:|
| ○○은행 예금 | financial | — | 1,100M | 1,100M | | | |
| ○○저축은행 예금 | financial | — | 1,000M | | 500M | | 500M |
| 아파트 강남역삼 (주165·대45㎡, 매매사례가액) | real_estate_apartment | — | **800M** | | | 800M | |
| 임야 광주 1,500㎡ | real_estate_land | — | 450M | | 450M | | |
| 농지 이천 10,000㎡ | real_estate_land | — | **1,150M** | 1,150M | | | |
| 공장건물 이천 1,650㎡ | real_estate_building | — | 330M | | | 330M | |
| 공장부지 이천 4,000㎡ | real_estate_land | — | 800M | 500M | | 300M | |
| 상장주식 H사 15,000주 | listed_stock | — | 150M | 150M | | | |
| 비상장주식 M사 25,000주 (가업상속재산) | unlisted_stock | — | 500M | | | 500M | |
| 회원권 J골프 | other | — | 80M | 80M | | | |
| 차량 S사 | other | — | 30M | 30M | | | |
| 전세보증금 이천 apt | deposit | — | 20M | 20M | | | |
| 현금 | cash | — | 35M | 35M | | | |
| 공탁금 S법원 | other | — | 5M | 5M | | | |
| 골동품 도자기외 3 | other | — | 20M | 20M | | | |
| 채권 M사 대여금 | financial | — | 30M | 30M | | | |
| 급여 M사 | other | — | 6M | 6M | | | |
| 퇴직금 M사 | financial | **retirement** | 124M | 124M | | | |
| 보험금 L생명 | financial | **insurance** | 50M | 50M | | | |
| **합계 (자산)** | | | **6,680M** | **3,300M** | **950M** | **1,930M** | **500M** |

> ⚠️ 이미지 9 본문의 아파트 1,650M·농지 300M 수치는 **무시**. 이미지 18 표 800M·1,150M이 정본.

### 0.3 PDF 표8 자산 4분류 매핑 (이미지 8 상단 4행)
PDF 표8 = `EstateItem.category` 그대로가 아니라 **deemedCategory 보정 + 4분류 그룹핑**.

```
buildSummaryCategory(item):
  if item.deemedCategory in {retirement, insurance, trust} → "other"   ← 퇴직·보험 = 기타
  else switch item.category:
    cash, financial, deposit → "financial"
    real_estate_*           → "real_estate"
    listed_stock, unlisted_stock → "stock"
    other                   → "other"
```

> ⚠️ **영리법인 행 정책** (I-1): 영리법인 M사는 본래 상속재산 0 + 사전증여 700M만이므로 자산 4분류(금융·부동산·주식·기타)가 **모두 0**. PDF 표8 자산 4행 영리법인 셀은 모두 빈셀(—). 엔진은 `perHeir[corp].categoryBreakdown = {0,0,0,0}` echo, UI는 — 표시.

검증 — PDF 표8과 일치:
- 금융 = ○○은행1,100 + ○○저축1,000 = **2,100M** (퇴직금·보험금 제외)
  - 배우자 1,100 · 장남 500 · 차남 0 · 손녀 500 ✓
- 부동산 = **3,530M** (배우자 1,650 · 장남 450 · 차남 1,430) ✓
- 주식 = **650M** (배우자 150 · 차남 500) ✓
- 기타 = 회원권80 + 차량30 + 전세보증금20 + 현금35 + 공탁금5 + 골동품20 + 채권30 + 급여6 + **퇴직금124 + 보험금50** = **400M** (배우자 400) ✓
- **합계 6,680M** ✓ = PDF 표8 ①총상속재산

### 0.4 채무·공과·장례비 협의분할 (이미지 20) — 합 1,215M
| 항목 | 발생일 | 금액 | 배우자 | 장남 | 차남 |
|---|---|---:|---:|---:|---:|
| K은행 채무 (강남역삼동) | 2021.6.20. | 400M | | **400M** | |
| S저축은행 채무 (강남역삼동) | 2018.5.10. | 745M | **500M** | | **245M** |
| 종소세 등 (2021 귀속) | — | 55M | | | **55M** |
| 장례비 S장례식장 (식대) | — | 10M | **10M** | | |
| 봉안시설 ○○공원묘지 사용료 | — | 5M | **5M** | | |
| **합계** | | **1,215M** | **515M** | **400M** | **300M** |

검증: 515+400+300=1,215 ✓ PDF 표8 ㉡채무공과장례 행

### 0.5 사전증여재산 (이미지 14 §2 3) — 합 2,960M
| 수증자 | 기간 | 가액 | 증여공제 | 과세표준 | 증여세 산출세액 |
|---|---|---:|---:|---:|---:|
| 배우자 | 10년 이내 | 760M | 600M (§53①1호) | 160M | **22M** (160M×20% − 1천만, §56 1~5억 구간) |
| 장남 | 10년 이내 | 1,500M | 50M (§53①2호) | 1,450M | **420M** (1,450M×40% − 1.6억, §56 10~30억 구간) |
| 영리법인 M사 | 5년 이내 | 700M | — | 700M | **150M** |
> §0.8 ⑫c 사전증여세액공제와 정합: 배우자 ⑫c = Min(22M, 한도 68,028,777) = 22M ✓ / 장남 ⑫c = Min(420M, 한도 616,510,791) = 420M ✓

### 0.6 추정상속재산 (이미지 9·19) — 합 350M, 배우자 150·장남 100·차남 100 (법정상속분 1.5/3.5·1/3.5·1/3.5)
| 항목 | 미소명액 | min(처분20%, 2억) | 추정상속 |
|---|---:|---:|---:|
| ㉠ 부동산 (885M − 600M) | 285M | min(177, 200) = 177 | **108M** |
| ㉡ 예금 인출 (1,500M − 1,200M) | 300M | min(300, 200) = 200 | **100M** |
| ㉢ 기타 (영업권 1년·2억 미만 → 소명대상 아님) | — | — | **0** |
| ㉣ 금융기관 채무 (1,000M − 658M = 342M) | 342M | min(200, 200) = 200 | **142M** |
| **합계** | | | **350M** |
> 분배: 사용자 답변 — "추정상속은 **법정상속분 자동 안분**". 손녀·영리법인은 추정상속 분배 대상 아님 (수유자·corporate 제외).

### 0.7 상속공제 (4,600M, 한도 5,965M)
| 공제 | 금액 |
|---|---:|
| 기초+인적+일괄 = Max(기초 200M + 자녀 100M = 300M, 일괄 500M) | **500M** |
| 가업상속공제 (차남 단독, M사 **25년 영위 = 20년 이상 → 한도 400억원**, **지분 60%** 주식 500M) | **500M** |
| 배우자공제 = Max[Min(법정지분3,092,857,142, 실수령2,800M, 30억), 5억] | **2,800M** |
| 금융재산공제 = Max[Min(순금융1,155M×20%=231M, 2억), 2천만] | **200M** |
| 동거주택공제 (차남, 10년 이상 동거, 무주택) = Min(800M × 100%, 6억) | **600M** |
| **소계** | **4,600M** |
> 적용한도 5,965M = 과세가액 8,775M − 상속인외자 유증 500M − [가산 사전증여 2,960M − (증여재산공제 650M + 재해손실 0)] = 8,775 − 500 − 2,310 = **5,965M** (이미지 13) → 4,600M < 5,965M ∴ 적용 4,600M.

> ⚠️ **법령 인용 정정 이력** (자가 검토): 가업상속공제 "25%·600M 한도" → "60%·400억원 한도" 정정. 25년 영위 = 20년 이상 구간(상증법 §18의2 시행령 §15①) → 400억원 한도이지만 본 사례 가업재산 500M이 한도 미만이라 **결과치는 동일**.

### 0.8 핵심 결과치 (PDF 표8 전 행 1:1 매트릭스 — Anchor 동결)
> ⚠️ **1원 toleranc 정책** ([[bigint-round-half-up]]): ⑥㉢ 합계 4,175,000,000과 5인 분배 합 4,174,999,999 사이에 1원 차이가 PDF 책의 round 비일관에서 발생. anchor는 PDF 표시값 그대로 `toBe()`로 동결하되, 합계 행은 BigInt 안분 결과를 1원 toleranc 허용.

| 행 | 합계 | 배우자 | 장남 | 차남 | 영리법인 | 손녀 |
|---|---:|---:|---:|---:|---:|---:|
| 상속재산 — 금융 | 2,100,000,000 | 1,100,000,000 | 500,000,000 | — | — | 500,000,000 |
| 상속재산 — 부동산 | 3,530,000,000 | 1,650,000,000 | 450,000,000 | 1,430,000,000 | — | — |
| 상속재산 — 주식 | 650,000,000 | 150,000,000 | — | 500,000,000 | — | — |
| 상속재산 — 기타 (퇴직·보험 포함) | 400,000,000 | 400,000,000 | — | — | — | — |
| ① 총상속재산 (채무공제 전) | 6,680,000,000 | 3,300,000,000 | 950,000,000 | 1,930,000,000 | — | 500,000,000 |
| ㉠ 과세제외 재산 (비과세·과세가액불산입) | — | — | — | — | — | — |
| ㉡ 채무·공과·장례비 공제 | 1,215,000,000 | 515,000,000 | 400,000,000 | 300,000,000 | — | — |
| ② 사전증여재산 | 2,960,000,000 | 760,000,000 | 1,500,000,000 | — | 700,000,000 | — |
| ③ 추정상속재산 (법정상속분 안분) | 350,000,000 | 150,000,000 | 100,000,000 | 100,000,000 | — | — |
| ④ 상속세 과세가액 (① − ㉠ − ㉡ + ② + ③) | **8,775,000,000** | 3,695,000,000 | 2,150,000,000 | 1,730,000,000 | 700,000,000 | 500,000,000 |
| *1 과세표준 배부대상 과세가액 | 5,815,000,000 | 2,935,000,000 | 650,000,000 | 1,730,000,000 | — | 500,000,000 |
| *2 할증과세 대상 과세가액 | 8,075,000,000 | 3,695,000,000 | 2,150,000,000 | 1,730,000,000 | — | 500,000,000 |
| ⑤ 상속공제 | 4,600,000,000 | | | | | |
| ⑥ ㉠ 직접배부 | 2,310,000,000 | 160,000,000 | 1,450,000,000 | — | 700,000,000 | — |
| ⑥ ㉡ 간접배부 | 1,865,000,000 | 941,319,862 | 208,469,475 | 554,849,527 | — | 160,361,135 |
| ⑥ ㉢ 과세표준상당액 계 | 4,175,000,000 | 1,101,319,862 | 1,658,469,475 | 554,849,527 | 700,000,000 | 160,361,135 |
| *3 상속인등 과세표준상당액 (영리법인 제외) | 3,475,000,000 | 1,101,319,862 | 1,658,469,475 | 554,849,527 | — | 160,361,135 |
| ⑦ 산출세액 (= 4,175M × 50% − 4.6억) | **1,627,500,000** | | | | | |
| ⑧ 세대생략가산액 | **30,232,198** | | | | | |
| ⑨ 산출세액 소계 (⑦+⑧) | 1,657,732,198 | | | | | |
| ⑩a 영리법인 증여세 산출세액 | 150,000,000 | | | | **150,000,000** | — |
| ⑩b 공제 한도 | 277,943,123 | | | | **272,874,251** | — |
| ⑩c 공제할 증여세액 = Min(⑩a, ⑩b) | 150,000,000 | | | | **150,000,000** | — |
| ⑪ 상속인등 산출세액 배부 | 1,477,500,000 | 468,259,021 | 705,147,813 | 235,910,842 | | 68,182,324 |
| *4 세대생략가산 (수유자 직접 가산) | 30,232,198 | | | | | 30,232,198 |
| *5 상속인등 상속세부담 비율 | 1.0000 | 0.3169 | 0.4772 | 0.1596 | | 0.0461 |
| 소계 (⑪ + *4) | 1,507,732,198 | 468,259,021 | 705,147,813 | 235,910,842 | | 98,414,522 |
| ⑫a 증여세 산출세액 | 442,000,000 | 22,000,000 | 420,000,000 | — | — | — |
| ⑫b 공제 한도 | 684,539,568 | 68,028,777 | 616,510,791 | — | — | — |
| ⑫c 사전증여세액공제 = Min(⑫a, ⑫b) | 442,000,000 | 22,000,000 | 420,000,000 | — | — | — |
| ⑬ 차가감세액 (⑪+*4 − ⑫c) | 1,065,732,198 | 446,259,021 | 285,147,813 | 235,910,842 | | 98,414,522 |
| ⑭ 신고세액공제(⑬ × 0.03) | 31,971,966 | 13,387,771 | 8,554,434 | 7,077,325 | | 2,952,436 |
| **⑮ 차감자진납부세액 (⑬ − ⑭)** | **1,033,760,232** | **432,871,250** | **276,593,379** | **228,833,517** | **0** | **95,462,086** |

> **산식 출처 (이미지 15·16 인용)**:
> - ***1 = 과세가액 − Σ(모든 수증자의 가산 증여재산가액)** = 8,775M − (760+1,500+700) = 5,815M. 상속인별 *1 = ④ − 본인 사전증여
> - ***2 = 과세가액 − 영리법인 등 사전증여가액** = 8,775M − 700M = 8,075M. 영리법인 행은 표시 없음(— )
> - **⑥ ㉡ 간접배부** = floor(`indirectNumerator` × (taxableValueShare − priorGiftAmount) / `indirectDenominator`) where indirectNumerator = taxBase − Σ상속인 직접 − 영리법인 사전증여 과세표준 = 4,175 − 1,610 − 700 = 1,865M, indirectDenominator = 5,815M
> - ***5 부담비율 = ⑥㉢ / (taxBase − 영리법인 사전증여 과세표준)** = ⑥㉢ / 3,475M (이미지 16). 배우자 1,101,319,862 / 3,475M = 0.31693 → 0.3169
> - **⑩b 합계 277,943,123** = ⑨ 산출세액 소계(1,657,732,198) × 700M / 4,175M ← 할증 **포함** (PDF 표시 합계행 산식 — UI 도출)
> - **⑩b 영리법인 272,874,251** = ⑦ 산출세액(1,627,500,000) × 700M / 4,175M ← 할증 **미포함** (현재 엔진 `inheritance-corporate-exemption.ts:101` 구현값, 실제 면제 한도 적용값)
> - **⑫b 배우자 68,028,777** = ⑪(468,259,021) × 직접배부(160M) / 과세표준상당액(1,101,319,862)
> - **⑫b 장남 616,510,791** = ⑪(705,147,813) × 직접배부(1,450M) / 과세표준상당액(1,658,469,475)
> - **⑫b 합계 684,539,568** = 배우자+장남 단순합 (상속인 외 자 제외)

---

## 1. R 항목 결론 (전부 종결)

| # | 항목 | 결론 | 출처/검증 |
|---|---|---|---|
| R-1 | 차남 부동산 1,430M 내부 분배 | 아파트 800 + 공장건물 330 + 공장부지 300 = 1,430 | 이미지 18 |
| R-2 | 채무 1,215M 상속인별 분담 | §0.4 표 | 이미지 20 |
| R-3 | 기타재산 4분류 매핑 | 퇴직금·보험금 → "other" (deemedCategory 보정) | §0.3 `buildSummaryCategory` |
| R-4 | 영리법인 ⑩c 정의 | §3의2② **면제** (§28 사전증여공제 아님). 산식: Min(영리법인 증여세 산출세액, floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준)) = Min(150M, 272,874,251) = 150M ✓ | `lib/tax-engine/inheritance-corporate-exemption.ts:101-105` — **현재 엔진 정확 구현, 변경 0** |
| R-5 | 세대생략 할증 분모 | 상속세 과세가액 − 영리법인 등 사전증여 = 8,775M − 700M = 8,075M. floor(1,627.5M × 500M × 0.3 / 8,075M) = 30,232,198 ✓ | `lib/tax-engine/inheritance-tax.ts:362-378` + `inheritance-gift-common.ts:121-133` — **현재 엔진 정확 구현, 변경 0** |
| R-6 | 추정상속 350M 분배 | 법정상속분 1.5/3.5·1/3.5·1/3.5 자동 안분 (수유자·corporate 제외). `PresumedInheritanceItem.heirAllocations` 미입력 시 현재 엔진의 `distributeByLegalShares` fallback 사용 | `inheritance-allocation.ts:259-281` (분배 로직) + `inheritance-legal-share.ts:36-37` (`legatee`·`corporate` 명시 제외 — grep 검증 완료) |
| R-7 | ㉠과세제외 echo | 비과세(§11·§12) + 과세가액불산입(§16·§17·§52) **합계** echo. 사례에서는 0 → '-' 표시 | UI |
| R-8 | ⑩·⑫ a/b/c 3줄 | 화면·PDF 모두 a(증여세산출세액)·b(공제한도)·c(공제할 증여세액) **3줄 모두 표시** | UI |

---

## 2. 작업 범위 (5 Phase)

### Phase A — 사전 검증 anchor (Pre-Do)
`__tests__/tax-engine/inheritance/heir-allocation-summary-pdf-case.test.ts` 신설.

§0.2 자산 19건 + §0.4 채무 5건 + §0.5 사전증여 3건 + §0.6 추정상속 4건 + §0.7 공제 5건을 PDF 정본 그대로 input으로 구성 → §0.8 결과 27행 × 6열 = **약 90건 anchor** (빈셀·합계행 제외).

**핵심 17개 (toBe, BigInt 안분 산식은 1원 toleranc)**:
- AN-1: `result.taxableEstateValue === 8,775,000,000` (PDF ④ 합계)
- AN-2: `result.taxBase === 4,175,000,000`
- AN-3: `result.computedTax === 1,627,500,000`
- AN-4: `result.generationSkipSurcharge === 30,232,198`
- AN-5: `result.summaryTable.distributableTaxBase === 5,815,000,000` (*1)
- AN-6: `result.summaryTable.surchargeTargetTaxableValue === 8,075,000,000` (*2)
- AN-7: `result.summaryTable.distributableTaxBaseAfterGifts === 3,475,000,000` (*3·*5 분모)
- AN-8: `result.summaryTable.corporateExemptionLimitDisplay === 277,943,123` (⑩b 합계행)
- AN-9: `perHeir.corp_M.priorGiftCreditLimit === 272,874,251` (⑩b 영리법인)
- AN-10: `perHeir.spouse.priorGiftCreditLimit === 68,028,777` (⑫b 배우자)
- AN-11: `perHeir.child1.priorGiftCreditLimit === 616,510,791` (⑫b 장남)
- AN-12: `perHeir.spouse.finalTax === 432,871,250`
- AN-13: `perHeir.child1.finalTax === 276,593,379`
- AN-14: `perHeir.child2.finalTax === 228,833,517`
- AN-15: `perHeir.corp_M.finalTax === 0`
- AN-16: `perHeir.grand.finalTax === 95,462,086`
- AN-17: `Σ finalTax === 1,033,760,232`

**핵심 정책**: anchor 작성 후 **먼저 실행** → 실패 항목 = 디자인 환류 신호. AN-8 실패 시 = Phase B5 `corporateExemptionLimitDisplay` echo 미구현 (가장 가능성 높은 실패), AN-9~11 통과 = R-4 grep 결론 확정.

### Phase B — 엔진 echo 필드 보강 (산식 변경 0)
| # | 위치 | 추가 필드 | 목적 |
|---|---|---|---|
| B1 | `lib/tax-engine/inheritance-asset-category.ts` 신설 | `SummaryTableCategory` type + `buildSummaryCategory(item)` 헬퍼 | §0.3 매핑 단일출처 |
| B2 | `types/inheritance-allocation-result.types.ts`의 `HeirTaxBreakdown` | `categoryBreakdown?: {financial; realEstate; stock; other}` · `grossInheritance?` · `excludedFromTaxation?` · **`priorGiftCreditLimit?`** (I-2: heir=§28 한도 / corp=§3의2② 한도 — 한 필드 두 의미, UI 분기 표시) · **`priorGiftComputedTax?`** (I-3: corp는 `Heir.corporateGiftComputedTax` 입력에서, heir는 `PriorGift.giftTaxPaid` 합에서 도출) · `burdenRatio?` | 표 행별 echo |
| B3 | `types/inheritance-gift.types.ts`의 `InheritanceTaxResult` | `summaryTable?: {distributableTaxBase; surchargeTargetTaxableValue; categoryTotals; totalExcludedFromTaxation}` | 합계행 echo |
| B4 | `inheritance-allocation.ts`의 `calcHeirAllocation` | 자산 분배 시 `buildSummaryCategory`로 4분류 누적 → `categoryBreakdown` 채움. `priorGiftCreditLimit`·`burdenRatio` 산식 추가 (산식 변경 아님, 중간값 노출) | [[echo-field-pattern]] |
| B5 | `inheritance-tax.ts`의 STEP 13~14 후 | `result.summaryTable` 조립 — distributableTaxBase=`indirectDistributionBase` · surchargeTargetTaxableValue=`taxableEstateValue − nonHeirNonLegateeGifts` · categoryTotals=Σ perHeir.categoryBreakdown · totalExcludedFromTaxation=Σ 비과세+불산입 · **`corporateExemptionLimitDisplay`** = floor((computedTax + generationSkipSurcharge) × corporateGiftTaxBase / taxBase) ← PDF ⑩b 합계행(277,943,123) 표시용, 실제 면제 적용값은 perHeir[corp].priorGiftCreditLimit(272,874,251) · **`distributableTaxBaseAfterGifts`** = taxBase − Σ상속인외자 사전증여 과세표준 = *5 부담비율 분모 (3,475M) | 합계행 단일출처 |

**비목표** (산식 변경): `calcHeirAllocation` 본체 산식·`calcGenerationSkipSurcharge` 분모·`calcCorporateExemption` 한도 — 모두 PDF 정확 일치, 변경 금지.

### Phase C — 결과뷰 UI
- `components/calc/results/HeirAllocationSummaryTable.tsx` 신규 — `props: {result, heirs}`.
- `lib/calc/heir-allocation-summary.ts` 순수 헬퍼 — `(result, heirs) → {rows: SummaryTableRow[], heirOrder: string[]}` 화면·PDF 단일출처. [[feedback_ui_engine_dual_truth_avoidance]]
- 레이아웃: `HorizontalScrollContainer`로 가로 스크롤 ([[feedback_macos_scrollbar_autohide_workaround]]). 좌측 sticky 라벨열 + 가변 N열 + 합계열.
- 합계행 정책: 인터뷰 옵션 1 — 상속인 셀 빈칸은 `-`.
- ⑩·⑫ a/b/c 3줄 모두 렌더 ([[feedback_dialog_data_discard_confirm]] 무관, 토글 없음).
- `InheritanceTaxResultView`에 새 섹션 "상속인별 상속세부담액 집계" 추가 — Tailwind 카드 (`section_card_numbering` 정책상 다음 번호 사용).

### Phase D — react-pdf 동기화 (D-1 검증 완료: entry point 기존 활용)

**기존 자산** (grep 검증):
- `lib/pdf/ResultPdfDocument.tsx:426` `InheritanceGiftSection({r, taxType})` — 상속세·증여세 공통 섹션 컴포넌트 (현재 712줄)
- `app/api/pdf/result/[id]/route.ts` — `taxType === "inheritance"` 분기 이미 처리 (line 165: `finalTax` 추출)
- `lib/pdf/fonts.ts` · `lib/pdf/besshi-pdf-styles.ts` — 폰트 fallback 인프라 ([[besshi-form-replica]])

**작업 항목**:
- D1. `lib/pdf/sections/inheritance-heir-allocation-section.tsx` **신설** — 800줄 정책 대비 별도 파일로 분리 (메인 `ResultPdfDocument.tsx`가 712줄이므로 직접 인라인 추가 시 임박).
- D2. `ResultPdfDocument.tsx`의 `InheritanceGiftSection` 마지막에 신규 섹션 import + 렌더 (1~2줄 추가, +50줄 미만 유지).
- D3. 화면 컴포넌트와 동일한 `lib/calc/heir-allocation-summary.ts` 순수 헬퍼 재사용 — 화면·PDF **단일 진실** ([[feedback_ui_engine_dual_truth_avoidance]]).
- D4. 폰트 fallback: 기존 `lib/pdf/fonts.ts` 재사용 (NanumGothic + IBM Plex Sans KR).
- D5. N열(상속인+합계) ≥ 6일 때 가로 분할 처리 — 첫 페이지 합계+1~4명, 다음 페이지 나머지. [[besshi-form-replica]]의 페이지 분할 패턴 차용.
- D6. testid 동결 — `heir-summary-row-{rowNo}`, `heir-summary-cell-{heirId}-{rowNo}` ([[besshi-form-replica]] anchor 정책).

**비목표**:
- 별도 `InheritanceTaxPdf/` 신규 디렉터리 — **불필요** (`ResultPdfDocument.tsx`가 단일 진입점)
- 새 API route — 기존 `app/api/pdf/result/[id]/route.ts` 그대로 사용 (input 신규 0)

### Phase E — 14 동기화 지점·회귀
입력 필드 신규 0건이므로 ①폼·②initial·③normalize·⑨~⑭ Zod/Route **변경 없음**. 동기화 지점은 result echo 추가만:
- ④API 변환: result 타입에 새 echo 필드 추가 → `lib/calc/inheritance-tax-api.ts` 자동 통과 (Date 변환 무관).
- ⑤UI 위젯: 신규 컴포넌트 import.
- ⑥사이드바: 무관.
- ⑦결과 카드: 신규 섹션.
- ⑧validation: 무관.

회귀: `npm test` ([[feedback_per_tax_test_scripts]]) — 종부세→재산세 공유 모듈 영향 없으므로 상속세 anchor 0 회귀 확인 후 통과.

---

## 3. PDCA 단계·산출물

| 단계 | 산출물 |
|---|---|
| Plan | 본 문서 (확정) |
| Design | `docs/02-design/features/heir-allocation-summary-table.engine.design.md` — Phase B echo 필드 타입 정의·B4 산식 의사코드·C/D UI 와이어 + **케이스 인벤토리 표** (사례 1행 + 향후 ㉠과세제외 비∅ 사례·다수 영리법인·미성년 세대생략 등 ≥ 5행) |
| Pre-Do | Phase A anchor 9개 우선 실행 → 통과 시 R-4·R-5 grep 결론 확정, 실패 시 디자인 환류 |
| Do | B → C → D 순 시퀀셜 ([[pre-do-anchor-verification]]) |
| Check | `ui-engine-sync-checker` (read-only) + `tax-qa-lead` 회귀 + e2e (`e2e/inheritance-summary-table.spec.ts` — [[feedback_browser_verify_with_playwright]]) |
| Act | memory 정책 추출 + 디자인 문서 환류 |

## 4. 정책 사전 적용 ([[policy-check]])
- [[pdf-case-replica-workflow]] · [[pdf-table-row-one-to-one-mapping]] · [[echo-field-pattern]]
- [[bigint-round-half-up]] — perHeir 안분 산식 (이미 `calcHeirAllocation`에서 `bigIntRoundDiv` 사용 중)
- [[enum-verification-before-mapping]] — `AssetCategory` 9종 → 4분류 + `deemedCategory` 보정
- [[besshi-form-replica]] — PDF 폰트 fallback·testid 동결
- [[feedback_engine_result_map_json_loss]] — `perHeir`는 Record (이미 Record)
- [[feedback_explicit_prop_mapping_strip]] — 신규 echo 추가 시 grep 전수 점검

## 5. 비목표 (out of scope)
- 별지 공식 신고서 양식 재현 (인터뷰 결론: 사례 책 표 그대로)
- 상속인별 상속공제 안분 (PDF 표 ⑤는 합계행만)
- 새 input 필드 추가 (현재 입력으로 §0.8 결과치 정확 도달 가능)
- §27② 40% 할증 (사례는 세대생략 30% — 손녀 미성년 아님). 단 echo는 계산식 일반화 유지.

## 6. 정본 자료 인덱스
- 이미지 8: §3 상속인별 상속세부담액 집계 표 (최종 결과 — Anchor §0.8)
- 이미지 9~10: 자산 명세 본문 — 단 ㉠부동산의 아파트·농지 금액은 무시(나머지 ㉣기타재산 226M 8항목·②간주174M·③추정350M 4항목 정본)
- 이미지 11~13: 공제 산식 (배우자·금융재산·동거주택·가업·일괄)
- 이미지 14: §1 2)채무 합계·§3) 사전증여
- 이미지 15: §6) 상속인별 과세표준상당액 산식
- 이미지 16: §7~§9 산출세액·세대생략·증여공제·부담비율
- **이미지 17·18**: §1 (1) 상속재산의 협의분할 내역 (자산 19건 — 정본)
- **이미지 19**: §1 (2) 추정상속재산 협의분할 (배우자 150·장남 100·차남 100)
- **이미지 20**: §1 (3) 채무 등의 협의분할 내역 (정본)

---

## 7. 자가 검토 이력 ([[feedback_11step_self_review_workflow]])

5 카테고리(법령·산식·엔진코드·동기화·정책) × 4 우선순위(P1~P3) 검토 **2회** 수행 — 발견·정정 누적 14건.

| # | 카테고리 | 발견 | 정정 |
|---|---|---|---|
| E-2 | 산식 누락 | §0.5 사전증여 산출세액 "(계산 필요)" | 배우자 22M·장남 420M 명시 + §56 구간 표기 |
| E-3 | 법령 오기 | §0.7 가업상속공제 한도 "600M" | "20년 이상 → 400억원" — 본 사례 500M < 400억 → 결과 동일 |
| E-4 | 법령 오기 | §0.7 가업상속 지분 "25%" | "60%" (이미지 12 본문 직접 인용) |
| E-7 | 수치 누락 | §0.8에 ⑩a/b·⑫a/b 한도 행 누락 | ⑩a·⑩b·⑩c + ⑫a·⑫b·⑫c 6행으로 분해 + 산식 인용 박스 |
| F-2 | 산식 누락 | §0.7 적용한도 5,965M 산식 | "= 8,775 − 500 − 2,310 = 5,965M" 추가 |
| F-3 | 인용 보강 | R-6 인용 불충분 | `inheritance-legal-share.ts:36-37` 명시 제외 grep 결과 추가 |

**검증 통과 (단정 정확)**:
- R-4·R-5 엔진 grep 결과
- R-6 `computeLegalShares`의 `legatee`·`corporate` 명시 제외
- §0.2 자산 합계 6,680M = 배우자 3,300 + 장남 950 + 차남 1,930 + 손녀 500 ✓
- §0.8 ⑪·⑫c·⑭·⑮ 모든 행 계산 검증 (BigInt 안분 → 1원 toleranc 적용)
- result 직렬화 spread 단정 — `app/api/calc/inheritance/route.ts:98` `NextResponse.json({result})` 전체 전달 확인 (input 매핑은 명시 line 72-89지만 본 작업 input 신규 0)

### 2차 검토 추가 발견 (정정 8건)

| # | 카테고리 | 발견 | 정정 |
|---|---|---|---|
| E-12 | 회귀 | §0.8 ⑥㉢ 합계 4,175M vs 5인 분배 합 4,174,999,999 (1원 round) | §0.8 상단 1원 toleranc 정책 박스 추가 |
| E-14 | 산식 출처 | *5 부담비율 분모 미명시 | *5 = ⑥㉢ / (taxBase − 영리법인 사전증여 과세표준) — 이미지 16 인용 박스 |
| E-15 | 행 누락 | §0.8에 ④ 상속세 과세가액 8,775M 행 | 추가 (배우자 3,695·장남 2,150·차남 1,730·법인 700·손녀 500) |
| E-16 | 행 누락 | *1 (5,815M)·*2 (8,075M) 행 + 상속인별 분배 | 추가 + 산식 출처 박스 |
| E-17 | 행 누락 | ㉡ 채무공과장례비 행 (1,215M) | 추가 (515·400·300) |
| E-18 | 행 누락 | ② 사전증여·③ 추정상속 행 | 추가 |
| F-4 | echo 누락 | ⑩b 합계행 277,943,123 (할증 포함) 산식 — 현재 엔진 미구현 | Phase B5에 `corporateExemptionLimitDisplay`·`distributableTaxBaseAfterGifts` 추가 |
| F-5 | 행 누락 | 자산 4분류·① 총상속재산 행 | §0.8 상단 5행 추가 |

### 2차 검증 통과 (단정 정확)

- §0.4 채무 분배 검증: 배우자 = K0 + S500 + 종소세0 + 장례10 + 봉안5 = 515 ✓
- §0.7 배우자공제 법정지분 3,092,857,142 = 3,252,857,142 (7,590 × 1.5/3.5) − 사전증여 과세표준 160M ✓ (이미지 12 인용)
- §0.8 *1·*2·*3 산식 모두 PDF 합계 일치
- Phase B `indirectDenominator` (5,815M) ↔ *1 정의 일치 (inheritance-allocation.ts:296)
- Phase B `nonHeirNonLegateeGifts` (700M) ↔ *2 차감액 일치 (inheritance-tax.ts:363)

### 잔여 위험 (Pre-Do anchor 실패 시 환류)

1. **AN-8 `corporateExemptionLimitDisplay === 277,943,123`** — Phase B5 echo 미구현 시 실패 (가장 가능성 높음)
2. **AN-9~11 priorGiftCreditLimit echo** — 현재 엔진은 한도를 변수로 계산하지만 result에 노출 안 함. Phase B2 echo 누락 시 실패
3. **Phase D 가로 분할** — 본 사례 5인+합계=6열 경계. Design 단계 확정
4. **§0.7 가업상속공제 법령 조문 정확도** — "§18의2 시행령 §15①" 인용은 본 작업 비목표(가업 공제 산정 자체를 구현 안 함)이지만 향후 확장 시 KoreanLaw MCP 위임 체인 추적 필요 ([[korean-law-citation-verify]])
5. **§0.4 봉안시설 사용료 5M** — 상증령 §9② 별도 한도 500만원 적용 여부 — 현재 엔진 `DebtItem.category`가 일반 장례비/봉안 분리하는지 미검증. 본 사례 합산 결과 일치하므로 직접 영향 없음
