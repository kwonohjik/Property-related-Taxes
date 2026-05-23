# 비상장주식 평가서(별지 제4호 부표3) — PDF 완전 재현 계획서

> **Status**: Plan — Design·Do 진입 전 사용자 승인 대기
> **Source PDF**: `~/Downloads/비상장주식 평가 사례.pdf` 1544~1548쪽 (평가심의위원회 운영규정 별지 제4호 서식 부표3, 2021.3.4. 개정)
> **Companion Plan**: `docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md` (양식 1차 골격), `inheritance-unlisted-stock-valuation-ui-integration.plan.md`
> **Target Component**: `components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView.tsx` (현재 312줄)
> **Date**: 2026-05-23
> **Author**: claude (PDCA Plan, 사례 6 검증 후 후속)

---

## 1. 배경 및 목표

### 1.1 현재 상태 (사례 6 검증 완료, 2026-05-23)

- 엔진(`evaluateUnlistedStockV2`) 결과는 PDF 사례 6 평가서와 **원단위 100% 일치** — 340,392,000원, ⑥=10,910원, ⑨=13,092원
- `BesshiForm4Buppyo3PrintView.tsx` 컴포넌트가 양식 일부(제1쪽·제4쪽 평가차액·제6쪽 + 환원율 안내)를 재현
- **숫자 정확성: 100%** / **시각 재현률: 3섹션 / 5섹션** (60%)

### 1.2 PDF 사례 6 양식 구조 (별지 부표3 원본 5쪽 구성)

별지 제4호 부표3은 **총 6쪽 양식**이지만 PDF 사례 6은 **제3쪽이 사용되지 않은 5쪽 출력**이다 (PDF page 7: 제1쪽·제6쪽 / page 8: 제2쪽·제4쪽 / page 9: 제5쪽).

| PDF 쪽 | 섹션 | 현재 | 사례 6 PDF anchor |
|---|---|---|---|
| 제1쪽 | 1.평가대상 + 2.순자산 단독 + 3.1주당 가액 ③~⑨ | ✅ | ⑥=10,910 / ⑨=13,092 / 총 340,392,000 |
| 제2쪽 | **4. 순자산가액** (자산총액 ①~⑧ + 부채총액 ⑨~⑲ + 다·라·마) | ❌ 누락 | 가.자산총액 ⑧=2,503,037,370 / 나.부채총액 ⑲=2,013,685,670 / 다.영업권포함전 489,351,700 / 라.영업권 0 / 마.순자산가액 489,351,700 |
| 제3쪽 | (사례 6 미사용 — 보충 명세) | n/a | n/a |
| 제4쪽 | 5. 평가차액 (자산금액·부채금액 계정과목별) | ✅ (현재 컴포넌트의 "5.평가차액" 섹션) | ① 합계 107,324,150 / ② 합계 15,775,800 |
| 제5쪽 | **6. 영업권** (가~자 9행) | ❌ 누락 | 가 58,341,511 / 나 29,170,755 / 다 489,351,700 / 라 10% / 마 48,935,170 / 바 5년 / 사 0 / 아 0 / 자 0 |
| 제6쪽 | 7. 순손익액 (3년치 ①~㉒ + 가~차) | ✅ | 차.가중평균 11,660 |

### 1.3 목표

별지 부표3 **사례 6 5쪽 양식 전체**를 PDF와 다음 4축에서 1:1 재현:

1. **시각**: 표 구조·테두리·셀 결합·페이지 break 위치
2. **문구**: 라벨 한글 원문 (예: "재무상태표상의 자산가액", "영업권 지속연수")
3. **셀 번호**: ①~⑨·㉠·㉡·가~차 testid 동결
4. **숫자**: 원단위 일치 (엔진 결과 이미 검증 완료)

브라우저 인쇄→PDF 저장 시 5쪽으로 자동 분리, 원본과 시각 일치.

### 1.4 사용자 인터뷰 (사전 결정 — 본 PDCA 진입 시 확정)

| # | 질문 | 결정 |
|---|---|---|
| Q1 | "PDF 똑같이" 의미 — 시각 + 문구 + 셀번호 + 숫자 4축? | **확정 — 4축 모두** (사용자 "똑같이 재현" 명시, 2026-05-23) |
| Q2 | 영업권 평가액 0인 경우(사례 6)에도 제5쪽 표 전체 표시? | **확정 — 표시** (가~자 9행 모두, 검증 가능성 우선) |
| Q3 | 제2쪽 자산총액 ①~⑧·부채총액 ⑨~⑲의 개별 행 라벨 출처 | **확정 — PDF 원문 그대로** (KoreanLaw 검증 시 상증령 §55·시행규칙 §17의2 라벨과 1:1 확인) |
| Q4 | print 페이지 분리 방식 | **확정 — `print:break-before-page` Tailwind** (page-break 4곳: 제1→2, 제2→4, 제4→5, 제5→6) |
| Q5 | 영업권 §55③ 자동 배제 시 표시 | **확정 — 표 하단 footer에 사유 안내(`excludedByLaw`) + 자=0 명시** |
| Q6 | react-pdf 도입 시점 | **확정 — 본 PR 범위 외**, 후속 N-1로 분리 (HTML 인쇄 모드 우선) |

---

## 2. 법령·양식 정합성

### 2.1 별지 부표3 (평가심의위원회 운영규정 별지 제4호 서식, 2021.3.4. 개정)

KoreanLaw MCP 검증 대상:
- 상증법 §63 ① 1호 나목 (비상장주식 보충적 평가)
- 상증령 §54 ①·④·⑤ (1주당 평가, 순자산 단독, 부동산과다 80%)
- 상증령 §55 ①·③ (순자산가액·영업권 자동 배제 3사유)
- 상증령 §56 ①·③·⑤ (3년 가중평균, 환산주식수, 유상증자·감자 조정)
- 상증령 §59 ② (영업권 5년 연금현가)
- 상증규 §17·§17의2·§17의3·§19 (환원율 10%, 부채 가감, 환산, 영업권 이자율)

### 2.2 PDF 원본 셀 번호 동결 (testid 명명 규칙)

**규칙**: `data-besshi-cell="<page>-<번호>"` 형식. page = `p1`~`p6`. 번호는 PDF 원본 그대로(원숫자·㉠·㉡·가·나 등) — UTF-8 문자 그대로 attribute 값에 사용 가능.

| 쪽 | 셀 번호 | 라벨 | testid 예시 |
|---|---|---|---|
| 1쪽 | ①·② | 발행주식총수·부동산과다보유법인 | `p1-①`, `p1-②` |
| 1쪽 | ③·④·⑤·⑥(㉠·㉡)·⑦·⑧·⑨ | 순자산가액·1주당 순자산·1주당 순손익·가중평균/하한·최대주주 ×120%·보충적 | `p1-③`~`p1-⑨`, `p1-⑥-㉠`, `p1-⑥-㉡` |
| 2쪽 | ①~⑧ / ⑨~⑲ | 자산총액 / 부채총액 | `p2-①`~`p2-⑲` |
| 2쪽 | 다·라·마 | 영업권 포함 전 순자산 / 영업권 / 순자산가액 | `p2-다`, `p2-라`, `p2-마` |
| 4쪽 | 5. 평가차액 ①·② | 자산금액 합계 / 부채금액 합계 | `p4-①`, `p4-②` |
| 5쪽 | 가~자 | 영업권 9행 | `p5-가`~`p5-자` |
| 6쪽 | ①~㉒ + 가·나·다·라·마·바·사·아·자·차 | 순손익액 가감조정 + 환원율 흐름 | `p6-①`~`p6-㉒`, `p6-가`~`p6-차` |

`testid` 동결로 회귀 보호 (memory `besshi-form-replica` 정책 + `feedback_pdf_table_row_one_to_one_mapping` 변수명 1:1 매핑).

### 2.3 KoreanLaw MCP 검증 강제 (Phase A 진입 전)

memory `feedback_korean_law_82_vs_81_2_drift` 정책 적용. Phase A Design 시작 전 다음 **6건** 검증 필수:

1. **상증령 §55①** — 자산총액 ①~⑧ 가산·차감 산식 (특히 ⑥·⑦이 가산인지 차감인지)
2. **상증령 §17의2** 1·2·3·4호 — 자산·부채 가감 항목 (현행 17필드 매핑 검증)
3. **상증령 §59②** — 영업권 5년 연금현가 산식 + 이자율 §19①
4. **상증령 §55③** — 영업권 자동배제 3사유 (1호 청산·2호 부동산80%·3호 결손) + 단서(사업개시 3년 미만·휴폐업)
5. **상증령 §56①·⑤** — 3년 가중평균 + §56⑤ 환산주식수 산식
6. **상증법 §63③ + 상증령 §53⑥⑦⑧ 9호** — 할증평가 ×120% + 중소·중견기업 배제 (사례 6은 일반기업이므로 적용 분기)

검증 결과를 `docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md` 상단에 인용 박스로 첨부.

---

## 3. 구현 범위

### 3.1 신규/확장 컴포넌트

```
components/calc/inheritance/unlisted-stock-v2/
├── BesshiForm4Buppyo3PrintView.tsx          # main — 5쪽 출력 orchestrator (현재 312줄 → 약 200줄)
├── besshi/
│   ├── Page1CoverSection.tsx                # 제1쪽 (현재 main에 inline → sibling 분리)
│   ├── Page2NetAssetTable.tsx               # ★ 신규 — 제2쪽 4.순자산가액 (19행 + 다·라·마)
│   ├── Page4ValuationDeltaTable.tsx         # 제4쪽 (현재 main "5.평가차액" inline → sibling 분리, 페이지 라벨 정정)
│   ├── Page5GoodwillTable.tsx               # ★ 신규 — 제5쪽 6.영업권 (가~자 9행)
│   ├── Page6NetIncomeBreakdown.tsx          # 제6쪽 (현재 main inline → sibling 분리)
│   └── BesshiSharedAtoms.tsx                # SectionTitle / ResultTableRow / BreakdownRow / fmt / renderDelta 통합
```

**참고**: 별지 부표3 양식은 총 6쪽이지만 사례 6은 제3쪽(보충 명세)을 사용하지 않으므로 본 PR은 **5쪽 출력**(제1·2·4·5·6쪽)을 구현. 제3쪽은 후속 PR(N-5)로 분리.

**800줄 정책 준수**: main 312줄 + 신규 2섹션(**Page2 약 200줄·Page5 약 150줄** — Design §3 추정 정본) 추가 시 분리 없으면 ~660줄 도달 → sibling 분리 선행 (memory `feedback_800line_split_export_preservation` 정책 적용 — 외부 export 무변경). 분리 후 평균 144줄/파일.

**Memory 정책 적용**: `besshi-form-replica`(testid·코드 매핑·Tailwind utility 직접·print 자동 펼침) + `print-only-css-toggle`(`hidden print:block`·`print:hidden` 토글 버튼) + `formula-display-builder`(변수 배지·fine-print) + `feedback_800line_split_export_preservation`(sibling 분리 시 main 외부 export 보존 — 100% re-export).

**인쇄 페이지 규격**: `@page { size: A4 portrait; margin: 15mm; }` — main 컴포넌트 `<style jsx global>` 블록에 print 전용 스타일 삽입. 양식 wrapper는 `print:w-full print:max-w-none` 적용 (화면 모드의 카드 폭 제약 해제).

### 3.2 제2쪽 4. 순자산가액 표 (Page2NetAssetTable.tsx)

엔진 입력 `input.netAssetValueRaw` 17필드 + 엔진 결과 `result.goodwillCalculation.selfCapital` 활용. PDF 원본 표 구조:

```
가. 자산총액
  ① 재무상태표상의 자산가액      bsTotalAssets             2,476,889,520
  ② 평가차액                    assetValuationDelta          91,548,350  → 제4쪽 5.평가차액 가. 기재
  ③ 법인세법상 유보금액          corpTaxReservedAmount             0
  ④ 유상증자 등                 paidInCapitalIncrease             0
  ⑤ (평가기준일 현재 지급받을 권리 확정 가액)  otherEarnedRights      0
  ⑥ 선급비용 등                 prepaidExpenses              65,400,500
  ⑦ 증자일 전의 잉여금의 유보액   preGiftRetainedEarnings           0
  ⑧ 소계 (①+②+③+④+⑤-⑥-⑦)                          2,503,037,370

나. 부채총액
  ⑨ 재무상태표상의 부채액         bsTotalLiabilities        1,833,780,000
  ⑩ 법인세                      corporateTaxPayable          32,627,890
  ⑪ 농어촌특별세                 farmingSurtax                     0
  ⑫ 지방소득세                   localIncomeTax                3,262,780
  ⑬ 배당금·상여금                dividendPayable                    0
  ⑭ 퇴직급여추계액                retirementProvision         445,785,000
  ⑮ 기타충당금                   otherProvision                    0
  ⑯ 제준비금                    reserveExcluded                    0
  ⑰ 제충당금                    allowanceExcluded            301,770,000
  ⑱ 기타(이연법인세대 등)         deferredTaxAdjustment              0
  ⑲ 소계 (⑨+⑩+⑪+⑫+⑬+⑭-⑮-⑯-⑰-⑱)                  2,013,685,670

다. 영업권포함전 순자산가액 (⑧ − ⑲)                          489,351,700
라. 영업권                                                          0       → 제5쪽 6.영업권 자. 기재
마. 순자산가액 (다 + 라)                                       489,351,700
```

소계 산식은 엔진과 정합성 검증 anchor 필수 (자기일관성: 다 + 라 === netAssetTotal).

### 3.3 제5쪽 6. 영업권 표 (Page5GoodwillTable.tsx)

엔진 결과 `result.goodwillCalculation` (UnlistedGoodwillResult) 활용. PDF 원본 표 구조:

```
가. 평가기준일 이전 3년간 순손익액의 가중평균액    weightedAvg3y            58,341,511
   ① 평가기준일 이전 1년 사업연도 순손익액 (×3)   fiscalYearBreakdowns[0].finalNetIncome  76,842,660
   ② 평가기준일 이전 2년 사업연도 순손익액 (×2)   fiscalYearBreakdowns[1].finalNetIncome  62,416,500
   ③ 평가기준일 이전 3년 사업연도 순손익액 (×1)   fiscalYearBreakdowns[2].finalNetIncome  △5,311,910
나. 가 × 50%                                  weightedAvgHalf          29,170,755
다. 평가기준일 현재 자기자본                    selfCapital             489,351,700
라. 기획재정부령이 정하는 이자율                rate                          10%
마. 다 × 라                                   selfCapitalRate          48,935,170
바. 영업권 지속연수                            durationYears                 5년
사. 영업권 계산액 ∑(나−마)/(1+0.1)^n            goodwillCalc                   0
아. 영업권 상당액 중 매입 무체재산권 감가상각비 공제분  intangibleDeduction      0
자. 영업권 평가액 (사 − 아)                     goodwillFinal                  0    → 제2쪽 4.라 기재
```

영업권 자동 배제 시(`excludedByLaw`) 표 하단에 사유 안내:
- `liquidation` (§55③ 1호): "청산절차 진행 중 → 영업권 가산 없음"
- `real_estate_80` (§55③ 2호): "부동산과다 80% 이상 → 영업권 가산 없음"
- `lt3y` (§55③ 2호 단서): "사업개시 3년 미만·휴업·폐업"
- `continuous_loss_3y` (§55③ 3호): "직전 3년 계속 결손 → 영업권 자동 0"

사례 6은 "가 − 마 = 58.3M − 48.9M ≒ 9.4M의 5년 연금현가" 계산이지만 PDF가 0으로 표시 — 실제로는 영업권 산식 결과 = `max(∑(나-마)/(1+0.1)^n, 0)` 인데 (나 < 마) → 음수 → 0. 우리 엔진 결과 0과 PDF 0 일치 확인됨.

### 3.4 main 컴포넌트 변경

- 현재 `BesshiForm4Buppyo3PrintView.tsx` 312줄 → ~250줄 (3섹션 sibling 분리)
- 신규 import: `Page2NetAssetTable`, `Page5GoodwillTable`
- 각 페이지 사이 `<div className="print:break-before-page" />` 삽입 (인쇄 시 자동 page-break)
- `BesshiSharedAtoms` 추출: `SectionTitle` / `ResultTableRow` / `BreakdownRow` / `fmt` / `renderDelta`

---

## 4. 케이스 매트릭스 (anchor 대상)

| ID | 시나리오 | 제2쪽 검증 anchor | 제5쪽 검증 anchor |
|---|---|---|---|
| F-1 | 사례 6 종합평가 (시각·문구·셀번호·숫자 4축 1:1 재현) | 자산소계 2,503,037,370 / 부채소계 2,013,685,670 / 마.순자산 489,351,700 | 가 58,341,511 / 나 29,170,755 / 마 48,935,170 / 자 0 |
| F-2a | 영업권 자동배제 §55③ 1호 `liquidation` (청산) | 영업권포함전 = 마.순자산 (라 = 0) | excludedByLaw="liquidation" badge 표시, 가~사 표는 그대로 |
| F-2b | 영업권 자동배제 §55③ 2호 본문 `real_estate_80` (부동산 80%) | 동상 | excludedByLaw="real_estate_80" badge |
| F-2c | 영업권 자동배제 §55③ 2호 단서 `lt3y` (사업 3년 미만·휴폐업) | 동상 | excludedByLaw="lt3y" badge |
| F-2d | 영업권 자동배제 §55③ 3호 `continuous_loss_3y` (3년 결손) | 동상 | excludedByLaw="continuous_loss_3y" badge |
| F-3 | 영업권 > 0 (가-마 > 0 시나리오 가공) | 라.영업권 > 0, 마 = 다 + 라 | 자.영업권 평가액 > 0 |
| F-4 | 자산총액 8행 합 = ⑧ 자기일관 anchor (tolerance ≤ 1원 — BigInt 가드 미적용 시 trigger 검출) | `\|((①+②+③+④+⑤)-(⑥+⑦)) - ⑧\| ≤ 1` | n/a |
| F-5 | 부채총액 11행 합 = ⑲ 자기일관 anchor (tolerance ≤ 1원) | `\|((⑨+⑩+⑪+⑫+⑬+⑭)-(⑮+⑯+⑰+⑱)) - ⑲\| ≤ 1` | n/a |
| F-6 | 다 + 라 = 마 자기일관 anchor (사례 6) | 다 489,351,700 + 라 0 = 마 489,351,700 | n/a |
| F-7 | 가 = (마.1년×3 + 마.2년×2 + 마.3년×1) / 6 자기일관 (tolerance ≤ 1원 — floor 후 1원 오차 허용) | n/a | `\|floor((76,842,660×3 + 62,416,500×2 + (-5,311,910)×1)/6) - 가\| ≤ 1`, 기댓값 58,341,511 |
| F-8 | 사례 1 회귀 (순손익가치만 — 영업권 미적용 시 제5쪽 표시 분기) | n/a | 사례 1 PDF anchor 회귀 0건 |
| F-9 | 사례 5 회귀 (최대주주 중소기업 → 할증 배제 시 ⑧·⑨ 표시 분기) | n/a | 사례 5 anchor 회귀 0건 |
| F-10 | print mode 페이지 break 4곳 자동 분리 검증 | `print:break-before-page` 노드 4개 존재 | DOM 검증 |

**BigInt 오버플로 가드**: 자산총액 2.5조원 × 3년 가중치 시 JS Number 안전 정수 한계(2^53 ≒ 9×10^15) 초과 가능성 — 자기일관성 anchor F-4·F-5는 1원 tolerance 적용 (memory `bigint-round-half-up` 정책).

---

## 5. 동기화 지점 (14지점 중 적용 대상)

신규 UI 컴포넌트이므로 다음 지점만 적용:

| # | 지점 | 작업 |
|---|---|---|
| ⑤ | UI 위젯 | `Page2NetAssetTable` + `Page5GoodwillTable` 신규 |
| ⑦ | 결과 카드 산식·표시 | main 컴포넌트가 두 페이지 import |

엔진 input/result는 변경 없음(이미 모든 필드 노출 완료) → ①·②·③·④·⑥·⑧·⑨·⑩·⑪·⑫·⑬·⑭ 적용 대상 아님.

---

## 6. 작업 분해 (Phase 단위)

| Phase | 산출물 | 예상 시간 |
|---|---|---|
| **A-0. KoreanLaw MCP 검증** | §2.3 **6건** 검증 + 결과 인용 박스 작성 | 25분 |
| **A. Design** | `docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md` 작성 — PDF 캡처 첨부 + 셀 번호 동결 표 + anchor 13건 매트릭스 + sibling 분리 구조도 | 45분 |
| **B. Pre-Do anchor** | 사례 6 anchor 1건(F-1) 우선 작성 → 현재 컴포넌트로 실패 확인 → 디자인 환류 | 15분 |
| **C. sibling 추출** | main 312줄 → `BesshiSharedAtoms.tsx` + `Page1CoverSection` + `Page4ValuationDeltaTable` + `Page6NetIncomeBreakdown` 분리 (회귀 0건) | 45분 |
| **D. Page2 구현** | `Page2NetAssetTable.tsx` 신규 — 자산총액 8행 + 부채총액 11행 + 다·라·마 + 자기일관 F-4·F-5 anchor | 75분 |
| **E. Page5 구현** | `Page5GoodwillTable.tsx` 신규 — 가~자 9행 + excludedByLaw badge 4종 분기 | 45분 |
| **F. 통합 + print page-break** | main에 두 페이지 통합 + `print:break-before-page` 4곳 + `print:bg-white print:text-black dark:bg-white dark:text-black` 다크모드 강제 흰 배경 | 30분 |
| **G. anchor 테스트** | `__tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx` — 13 anchor (F-1~F-10) RTL render + 셀 번호 testid 검증 + 사례 1·5 회귀 | 75분 |
| **H. 브라우저 수동 확인** | dev 서버 → 상속세 마법사 → 비상장주식 V2 사례 6 입력 → 인쇄 미리보기 → 5쪽 PDF 원본과 시각 대조 (Chrome `Cmd+P` → "다른 이름으로 저장" PDF) | 30분 |

**총 예상 시간: 약 6.3시간** (1일 1회 PDCA)

---

## 7. Definition of Done

- [ ] PDF 사례 6 5쪽 양식과 4축(시각·문구·셀번호·숫자) 모두 1:1 일치 (Phase H 브라우저 비교)
- [ ] 13 anchor (F-1, F-2a~d, F-3~F-10) 모두 통과
- [ ] 기존 18 anchor(`case-5a-integration.test.ts`) 회귀 0건
- [ ] 사례 1·5 anchor 회귀 0건 (F-8·F-9)
- [ ] sibling 분할 후 모든 파일 800줄 이하 — main ≤ 200줄, Page2 ≤ 200줄, Page5 ≤ 150줄
- [ ] 다크모드 강제 흰 배경 — `print:bg-white dark:bg-white print:text-black dark:text-black` 양식 wrapper에 명시적 적용
- [ ] `print:break-before-page` 4곳 적용 (제1→2, 제2→4, 제4→5, 제5→6)
- [ ] testid 동결 — `data-besshi-cell` attribute 30개+ (셀 번호 매핑 표 §2.2 모든 행)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` 통과
- [ ] 브라우저 수동 확인 — Chrome 인쇄 미리보기 스크린샷 첨부 5쪽 모두

---

## 8. 리스크 / 비고

- **영업권 산식 자기일관성** (사례 6 검증 완료): 가(58,341,511) − 마(48,935,170) = 9,406,341 양수이지만 우리 엔진 결과 `goodwillCalc = 0` / PDF도 0 — **이미 일치 확인**. 추정 원인: 사례 6 영업권 자동배제 분기 (사례 6은 중소·중견기업 아님 일반기업이나, §55③ 다른 사유로 0 처리되었을 가능성) 또는 5년 PV 합계 산식 차이. 본 PR은 엔진 결과 그대로 표시 — 엔진 산식 자체 정정은 별도 PDCA(`unlisted-stock-valuation-correction.plan.md` 후속)로 분리.
- **PDF 표 라벨 정확도**: 셀 라벨 텍스트는 PDF 캡처를 ground truth로 — 사용자 인터뷰 표현이 PDF와 다르면 PDF 우선 (memory `feedback_korean_law_82_vs_81_2_drift`).
- **사례 1~5 회귀**: 본 컴포넌트는 사례 6 외에도 사례 1·3·4·5(영업권 평가, 순자산 단독 평가, 부동산과다 등 분기) 모두 통과해야 함. 기존 case-1~5 테스트 회귀 0건 강제.
- **Phase 5-C → F-4 약속 이행**: 코드 주석 "정식 react-pdf 컴포넌트는 F-4 후속"의 react-pdf 도입은 본 계획 범위 밖. 본 PR은 **인쇄 가능 HTML 양식**으로 한정.

---

## 9. 후속 PR 후보 (본 PR 범위 외)

- **N-1**: react-pdf 정식 도입 — `@react-pdf/renderer` 패키지로 별지 부표3을 진짜 PDF 다운로드 (현재는 브라우저 인쇄→PDF 저장 의존)
- **N-2**: 사례 1·2·3·4·5 각각의 Pre-Do anchor 자동 통합 테스트 (현재 case-5a만 통합)
- **N-3**: 별지 1쪽 "사업자등록번호" 별도 필드 + 대표자 성명 분리 입력 (현재 representative 단일 필드)
- **N-4**: 영업권 가산 시 다.영업권포함전 → 마.순자산 +영업권 화살표 시각화
- **N-5**: 별지 부표3 제3쪽(보충 명세) 구현 — 사례 6은 미사용이지만 일부 케이스에서 필요
- **N-6**: 영업권 산식 자체 검증 PDCA — 사례 6 가-마 양수 시 0 처리 분기 근거 KoreanLaw MCP 재검증

---

## 10. 승인 요청

본 계획서로 진행해도 되는지 확인 부탁드립니다. 주요 결정 사항:
1. **5쪽 출력 + sibling 분리** 접근(800줄 정책, memory `feedback_800line_split_export_preservation` 외부 export 보존)
2. **HTML 인쇄 모드** 우선(`@page size: A4 portrait`), react-pdf는 후속(N-1)
3. **Phase A-0 KoreanLaw MCP 검증 강제** — Design 진입 전 5건 검증 결과 박스 인용
4. **Phase B Pre-Do anchor** 강제 — 디자인 환류 기회 확보
5. **13 anchor 매트릭스** (F-1, F-2a~d, F-3~F-10) — 자기일관성 4건(F-4·F-5·F-6·F-7) + §55③ 자동배제 4종(F-2a~d) + 회귀 anchor 2건(F-8·F-9) + DOM anchor 1건(F-10) 포함
6. **인쇄 page-break 4곳**: 제1→2 / 제2→4(제3쪽 미사용 — 4쪽 시작 직전 break 위치) / 제4→5 / 제5→6
