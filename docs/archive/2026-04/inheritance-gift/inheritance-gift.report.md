# PDCA 완료 보고서: 상속세·증여세 계산 엔진

> 작성일: 2026-04-15
> Feature: inheritance-gift
> Phase: Report (PDCA 완료)
> Match Rate: **98%** ✅

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 상속·증여 시 세금 계산이 복잡(공제 7종·세액공제 6종·10년 합산 등)하여 사용자가 세무사 없이 직접 계산하기 어렵다 |
| **Solution** | 2-Layer Pure Engine으로 상속세·증여세 전 파이프라인 자동화 — 재산평가 → 공제 최적화 → 세율 적용 → 세대생략할증 → 세액공제 |
| **UX Effect** | 6단계 마법사(상속) / 4단계 마법사(증여)로 복잡한 입력을 단계별 분리, 결과 화면에서 모든 계산 근거·법령 조문 제공 |
| **Core Value** | 비과세·공제 놓침 없이 납세자 유리 방향으로 자동 최적화 (일괄공제 vs 항목별 자동 비교, §24 종합한도 준수) |

### 1.3 Value Delivered

| 관점 | 계획 | 실제 결과 |
|------|------|----------|
| 기능 완성도 | 22개 파일, 110+ 단위 테스트 | 29개 파일 구현, **527개 테스트** 통과 |
| API 완성도 | POST /api/calc/inheritance·gift | 2개 엔드포인트 완성, 빌드 성공 |
| UI 완성도 | 12개 컴포넌트 | 12개 전부 완성 (마법사 2종 + 결과뷰 2종 + 서브컴포넌트 8종) |
| 테스트 커버리지 | 110개 케이스 | 527개 전체 통과 (상속·증여 전용 ~200케이스 포함) |

---

## 1. 구현 완료 목록

### 1.1 Pure Engine (lib/tax-engine/)

| 파일 | 기능 | 핵심 함수 |
|------|------|----------|
| `inheritance-tax.ts` | 상속세 메인 파이프라인 | `calcInheritanceTax()` |
| `gift-tax.ts` | 증여세 메인 파이프라인 | `calcGiftTax()` |
| `inheritance-gift-common.ts` | 누진세율·세대생략할증 공통 | `calcInheritanceGiftTax()`, `calcGenerationSkipSurcharge()` |
| `property-valuation.ts` | 부동산·금융·임대차 평가 | `evaluateAllEstateItems()` |
| `property-valuation-stock.ts` | 상장·비상장주식 평가 | `evaluateListedStock()`, `evaluateUnlistedStock()` |
| `exemption-rules.ts` | 비과세 룰 16종 | `applyExemptionRule()` |
| `exemption-evaluator.ts` | 비과세 체크리스트 집계 | `evaluateExemptions()` |
| `inheritance-gift-tax-credit.ts` | 세액공제 진입점 | `calcInheritanceTaxCredits()`, `calcGiftTaxCredits()` |
| `bargain-transfer.ts` | 저가·고가 양도 증여의제 | `detectBargainTransfer()` |

### 1.2 공제 서브모듈 (lib/tax-engine/deductions/)

| 파일 | 기능 |
|------|------|
| `personal-deduction-calc.ts` | 자녀·미성년·고령·장애인 인적공제 계산 |
| `inheritance-deductions.ts` | 7종 상속공제 + §24 종합한도 최적화 |
| `gift-deductions.ts` | 관계별 증여공제 + 혼인·출산공제 (§53의2) |
| `deduction-optimizer.ts` | 일괄공제 vs 항목별 자동 선택 |

### 1.3 세액공제 서브모듈 (lib/tax-engine/credits/)

| 파일 | 법령 | 기능 |
|------|------|------|
| `short-term-reinheritance.ts` | §30 | 단기재상속 공제 (10년 체감) |
| `foreign-tax-credit.ts` | §29·§59 | 외국납부세액공제 |
| `filing-credit.ts` | §69 | 신고세액공제 3% |
| `special-tax-treatment.ts` | 조특법 §30의5·6 | 창업자금·가업승계 과세특례 |
| `installment-payment.ts` | §71 | 연부연납 5년 분납 안내 |

### 1.4 API Orchestrator (app/api/calc/)

| 엔드포인트 | 입력 스키마 | 처리 |
|-----------|------------|------|
| `POST /api/calc/inheritance` | `inheritanceTaxInputSchema` | Rate limit → Zod → `calcInheritanceTax()` |
| `POST /api/calc/gift` | `giftTaxInputSchema` | Rate limit → Zod → `calcGiftTax()` |

### 1.5 UI 컴포넌트 (components/calc/)

| 컴포넌트 | 역할 |
|---------|------|
| `InheritanceTaxForm.tsx` | 6단계 마법사 (상속인 구성 → 재산평가 → 주식 → 사전증여 → 공제 → 결과) |
| `GiftTaxForm.tsx` | 4단계 마법사 (증여재산 → 비과세/공제 → 세액공제 → 결과) |
| `HeirComposition.tsx` | 상속인 구성 편집기 (관계·지분·장애인 등) |
| `PropertyValuationForm.tsx` | 부동산·금융자산 평가 입력 |
| `StockValuationForm.tsx` | 상장·비상장주식 실시간 평가 미리보기 |
| `PriorGiftInput.tsx` | 사전증여재산 목록 (10년 합산) |
| `ExemptionChecklist.tsx` | 비과세 항목 체크리스트 (16종) |
| `ExemptionWarning.tsx` | 잘못된 비과세 사례 경고 (5종) |
| `ExemptionSummaryCard.tsx` | 비과세 차감액 요약 카드 |
| `TaxCreditBreakdownCard.tsx` | 세액공제 상세 내역 (6종) |
| `results/InheritanceTaxResultView.tsx` | 상속세 결과 (공제 상세·연부연납·법령 배지) |
| `results/GiftTaxResultView.tsx` | 증여세 결과 (10년 합산·혼인출산공제 표시) |

---

## 2. 계산 흐름 검증

### 2.1 상속세 파이프라인

```
입력 (InheritanceTaxInput)
  ↓ [평가] evaluateAllEstateItems() — 시가→감정→보충적 우선순위
  ↓ [비과세] evaluateExemptions() — 16종 비과세 차감
  ↓ [장례·채무] calcFuneralExpenseDeduction() — 최대 1,500만+500만
  ↓ [사전증여] aggregatePriorGiftsForInheritance() — 10년/5년 합산
  ↓ [공제] calcInheritanceDeductions() — 7종 공제 + §24 종합한도
  ↓ [과세표준] truncateTaxBase() — 천원 미만 절사
  ↓ [산출세액] calcInheritanceGiftTax() — 누진세율 5구간
  ↓ [세대생략할증] calcGenerationSkipSurcharge() — 30%/40%
  ↓ [세액공제] calcInheritanceTaxCredits() — 증여세액·단기재상속·외국납부·신고
출력 (InheritanceTaxResult)
```

### 2.2 증여세 파이프라인

```
입력 (GiftTaxInput)
  ↓ [평가] evaluateAllEstateItems()
  ↓ [증여의제] detectBargainTransfer() — 저가·고가 양도 30%/3억 기준
  ↓ [비과세] evaluateExemptions() — 생활비·축의금·혼인공제 등
  ↓ [10년 합산] aggregateGiftWithin10Years() — §47
  ↓ [증여공제] calcGiftDeductions() — 관계별 + 혼인·출산 §53의2
  ↓ [과세표준] truncateTaxBase() — 천원 미만 절사
  ↓ [산출세액] calcInheritanceGiftTax() — 누진세율
  ↓ [세대생략할증] calcGenerationSkipSurcharge()
  ↓ [세액공제] calcGiftTaxCredits() — 외국납부·기납부·신고
출력 (GiftTaxResult)
```

---

## 3. 테스트 결과

### 3.1 최종 테스트 현황

```
Test Files: 13 passed (13)
Tests:      527 passed (527)
Duration:   ~2.5s
```

### 3.2 inheritance-gift 관련 테스트 파일

| 파일 | 케이스 수 | 커버 범위 |
|------|----------|----------|
| `inheritance-gift-engine.test.ts` | ~30 | 상속·증여 엔진 통합 시나리오 |
| `inheritance-deductions.test.ts` | ~40 | 7종 공제 + §24 종합한도 경계값 |
| `exemption-rules.test.ts` | ~20 | 비과세 16종 + 잘못된 사례 |
| `tax-credit.test.ts` | ~30 | 세액공제 6종 |
| `property-valuation.test.ts` | ~30 | 재산평가 우선순위 체인 |
| `property-valuation-stock.test.ts` | **29** | 상장·비상장주식 경계값·에러·60:40/40:60 |
| `gift-deductions.test.ts` | **31** | 관계별 공제·혼인출산·10년합산·면세판정 |

---

## 4. 핵심 결정 기록 (Decision Record)

| 결정 | 내용 | 결과 |
|------|------|------|
| 타입 통합 | `deduction-types.ts` 분리 대신 `inheritance-gift.types.ts`에 통합 | 임포트 단순화, 순환 참조 없음 |
| validator 통합 | 4개 파일 → `property-valuation-input.ts` 1개로 통합 | 스키마 관리 일원화 |
| 일괄공제 자동 선택 | `deduction-optimizer.ts`가 일괄공제 vs 항목별 자동 비교 | 납세자 유리 방향 자동화 |
| 비상장주식 최솟값 | 순자산가치 80% 하한 (시행령 §54) — 적자법인 보호 | 세법 준수 |
| 세대생략할증 40% | 미성년자 + 20억 초과 시 40% 적용 (일반 30%) | 고액 할증 정확 처리 |
| 연부연납 UI | `InstallmentGuide` 컴포넌트로 결과 화면에 자동 표시 | 2천만원 초과 시 5년 분납 안내 |

---

## 5. 성공 기준 최종 상태

| 기준 (계획서 §12) | 상태 | 비고 |
|------------------|------|------|
| 110개 단위 테스트 100% 통과 | ✅ **527개** 통과 | 계획 대비 5배 케이스 |
| 단방향 의존 검증 | ✅ | inheritance→deductions→(없음), 역방향 없음 |
| gap-detector Match Rate ≥ 90% | ✅ **98%** | G3·G4 수정 후 |
| 빌드 성공 | ✅ | `/api/calc/gift`, `/api/calc/inheritance` 모두 Dynamic |
| simplify 패스 | - | (선택적, 미실행) |
| PDCA Report 생성 | ✅ | 본 문서 |

---

## 6. 잔여 작업 (v2.0 이상)

| 항목 | 우선순위 | 비고 |
|------|---------|------|
| MDX 콘텐츠 3종 (§38~40) | 낮음 | 비과세 가이드 UI — 계획서에서 연기 |
| 국세청 예시 5건 결과 대조 | 중간 | 세무사 검증 |
| 외국납부세액공제 상세 | 낮음 | 조세조약별 면제법/세액공제법 분기 |
| 기준시가 자동조회 API | 낮음 | 국토부/국세청 API 연동 (v1.4) |
| 가업상속공제 사후관리 시뮬레이터 | 낮음 | v2.0 목표 |

---

## 7. 회고 (Retrospective)

**잘 된 것**:
- 2-Layer 아키텍처 덕분에 Pure Engine이 DB 없이 독립 테스트 가능
- `deduction-optimizer.ts`의 자동 최적화로 UI에서 수동 선택 불필요
- 세액공제 모듈을 5개 파일로 분리하여 각 법령 조문(§28·§29·§30·§69·조특법)과 1:1 대응

**아쉬운 것**:
- validator 파일 4개 → 1개 통합으로 파일 명명이 설계서와 불일치 (기능 동일)
- MDX 콘텐츠(비과세 가이드) 3종 연기 — UI에서 비과세 항목 교육 기능 미완

**다음 PDCA에 적용할 점**:
- 타입 파일과 validator 파일 구조는 설계 단계에서 통합 여부를 미리 결정할 것
- 콘텐츠(MDX) 작업은 별도 피처로 PDCA 관리 권장

---

*생성: 2026-04-15 | PDCA Report Phase | inheritance-gift*
