# UI Design — 비상장주식 영업권 §59③ 추정이익 준용 (PR-G2)

> **Engine Design**: `inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.plan.md`
> **범위**: 엔진 내부 갈음(companyWeighted3y) + **표시 전용**. 신규 input 폼·Zod·위젯 **0**(추정이익 입력은 PR-G 완료분 재사용).

## 0. 적용 정책 메모리

- [[feedback_result_view_korean_formula]] — 산출근거 한국어 풀어쓰기
- [[echo-field-pattern]] — 엔진 산식 변경 없이 goodwill weightedAvg3y echo 활용
- [[besshi-form-replica]] — 별지 5쪽 영업권 양식 표시 일관
- [[feedback_numeric_impact_verify_before_bug_claim]] — 추정이익 미적용 시 표시 불변 실증

---

## 1. 사용자 시나리오 (3건)

| # | 시나리오 | 기대 표시 |
|---|---------|----------|
| G2-1 | 추정이익 OFF (일반) | 영업권 가. = 과거 순손익 가중평균 (현행 불변) |
| G2-2 | 추정이익 ON + 영업권>0 | 영업권 가. = 추정이익 평균가액 × 발행주식총수 + "§59③ 추정이익 기준" 안내 |
| G2-3 | 추정이익 ON + §55③ 배제 | 영업권 0 (배제 문구 유지) + §59③ 안내 미표시(노이즈 회피) |

---

## 2. 컴포넌트 변경 (⑦ 결과 카드만 — 화면·PDF 병렬)

신규 컴포넌트 없음. 기존 2곳 표시 보강:

### 2-1. `PerShareValuationResultCard.tsx` (화면)
- ③ 순자산가액 ResultRow의 영업권 표시(`goodwillFinal`) 근처에 조건부 한 줄:
  - `result.estimatedProfitResult?.applied && result.goodwillCalculation.goodwillFinal > 0` 시:
    > "영업권 가중평균: §59③ 추정이익 기준 ({estimatedProfitAverage} × {totalShares}주)"
  - PR-G의 ⑤ §56② notice와 별개(영업권 전용 한 줄). 한국어 풀어쓰기.

### 2-2. `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` 5쪽 (PDF)
- 영업권 가.(weightedAvg3y) 표시는 엔진 환산값 **자동 반영**.
- 추정이익 applied + goodwill>0 시 5쪽에 화면과 **동일 문구** note 1줄(violet/보조색).

### 2-3. `besshi/Page5GoodwillTable.tsx` (화면 별지 5쪽)
- 가. weightedAvg3y 자동 반영. 추정이익 시 동일 note(화면 일관).

---

## 3. Cross-field / fallback

- 표시 전용 — store write·useEffect 없음. 모두 `result`(useMemo `evaluateUnlistedStockV2`) 파생값 read.
- estimatedProfitResult·goodwillCalculation은 엔진 result echo — UI 재계산 0([[single-source-engine-helper]]).

---

## 4. Silent fallback 후보

- 없음(표시 전용). 추정이익 미적용 시 기존 영업권 표시 100% 불변.

---

## 5. 결과 카드 산식 (한국어)

- "영업권 가중평균 순손익액 = 추정이익 평균가액 N × 발행주식총수 M주 (§59③ 준용)"
- 변수 약어·`floor()`·`×` 외 기호 남용 금지. 배제(§55³) 시 기존 "영업권 자동 배제" 문구 유지 + §59③ 안내 생략.

---

## 6. 케이스 인벤토리 (Engine Design §1 동기화)

| Engine row | UI 검증 |
|---|---|
| 1 환산 | ③ 영업권 hint = 추정이익×주식수 표시 |
| 2 ON≠OFF | 토글 ON/OFF 시 영업권 표시 변동 |
| 3 §55③ 배제 | 배제 문구 유지 + §59③ 안내 미표시(G2-3) |
| 4 EP-5 교체 | (엔진 anchor — UI 무관) |
| 5 회귀 | OFF 시 영업권 표시 불변 |

---

## 7. 브라우저 e2e

- **신규 e2e 불요** — 엔진 내부 갈음 + 표시. PR-G `e2e/inheritance-estimated-profit.spec.ts` 회귀(영업권 영역 깨짐 0)로 충족.
- (선택) 결과 화면 §59③ 안내 1줄 표시 e2e 1건 추가 가능 — Do에서 판단.

---

## 8. UI senior 사전 점검 체크리스트

- [ ] 엔진 C-1~C-3 선행 완료(companyWeighted3y 환산 + appliedRules gated) — 시퀀셜
- [ ] ③ 영업권 hint 조건 = `estimatedProfitResult?.applied && goodwillFinal > 0`
- [ ] 화면(PerShareValuationResultCard·Page5GoodwillTable) + PDF(UnlistedStockBesshiPdfDocument 5쪽) **동일 문구**
- [ ] 추정이익 OFF·§55③ 배제 시 §59③ 안내 미표시
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수(PR-G EP-5 교체 포함)
