# 증여세 세대생략 할증과세 산출근거 카드 추가

작성일: 2026-05-21
대상: 증여세 결과 화면(`GiftTaxResultView`) — "세액공제 내역" 카드 **바로 위**에 §57 세대생략 할증과세 ⑧~⑫ 산출근거 펼침 카드 추가.

## 1. 배경

엔진(`calcGiftGenerationSkipSurchargeWithLimit`)은 이미 §57 + 한도 안분(⑧⑨⑩⑪⑫⑬) 6단계를 모두 계산하여 `result.generationSkipSurchargeDetail`에 노출한다. 그러나 결과 화면 요약 카드에는 합산값 1줄("세대생략 할증 (30% / 40%) + 113,100,000")만 표시되어, 사용자가 "이 값이 어떻게 도출되었는지" 검증할 수 없다.

PDF 교재(이미지 2) 산식 — 사례:
- ㉠ 기할증과세액(누적) = 12,000천원
- ㉡ 할증과세공제 한도액 = 산출세액 171,000천원 × (가산과표 250,000천원 / 합산과표 770,000천원) × 30% = 16,655천원
- ⑪ 차감 기할증과세액 = Min(㉠, ㉡) = 12,000천원
- ⑧ 할증과세 = 산출세액 × (부모 제외 직계존속 재산가액 / 총증여재산가액) × 30% = 51,300천원
- ⑫ 추가 할증과세액 = ⑧ − ⑪ = 51,300 − 12,000 = 39,300천원

엔진 결과 객체(`GenerationSkipSurchargeDetail`)와 1:1 매칭 — 추가 계산 0건, **UI 표시만** 작업.

## 2. 표시 위치

`components/calc/results/GiftTaxResultView.tsx`
- 현재: L290 `Row "산출세액"` → L291~296 `Row "세대생략 할증"` → L308 `TaxCreditBreakdownCard`(세액공제 내역).
- 추가: **L308 `TaxCreditBreakdownCard` 바로 위**에 신규 카드 1개 삽입.
- 조건: `result.generationSkipSurchargeDetail !== null` (그룹 B 조부모 → 손자녀일 때만 active. 미충족 시 렌더 X — 일반 케이스 회귀 0).

## 3. 신규 컴포넌트

`components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx` (단일 파일, 200줄 미만)

### Props
```ts
interface Props {
  detail: GenerationSkipSurchargeDetail;  // result.generationSkipSurchargeDetail (non-null)
  computedTax: number;                    // ⑦ 산출세액 (안분 공식 분자)
}
```

### 표시 행 (6행)

| 행 | 라벨 | 산식 (한국어 풀어쓰기) | 값 |
|---|---|---|---|
| ⑧ | 할증과세 (산출근거) | 산출세액 × (부모 제외 직계존속 재산가액 / 총증여재산가액) × 할증율 (`surchargeRate × 100`%) | `surchargeBase` |
| ⑨ | 기할증과세액 (누적) | 사전증여 회차들의 추가 할증세액 ⑫ 누계 | `priorAdditionalCumulative` |
| ⑩ | 할증과세공제 한도액 | 산출세액 × (가산 증여재산 과세표준 / 합산 과세표준) × 할증율 | `surchargeCreditLimit` |
| ⑪ | 차감 기할증과세액 | Min(⑨, ⑩) | `priorSurchargeCredit` |
| ⑫ | **추가 할증과세액** | ⑧ − ⑪ (음수 시 0) | `additionalSurcharge` (highlight) |
| ⑬ | 산출세액합계 | 산출세액 + ⑫ | `totalComputedTaxWithSurcharge` |

- 산식 문자열은 PDF 박스 산식(이미지 2 하단)을 그대로 따름: "할증과세액 = 증여세산출세액 × (수증자 부모 제외 직계존속으로부터 증여받은 재산가액 / 총증여재산가액) × 30% − 기할증과세액"
- ⑫만 강조(`font-semibold text-rose-900` 등 톤). 나머지는 sub-row.
- `nonParentLinealRatio === 1` 인 일반 케이스에서는 비율 행 별도 표시 (`(100%)` 라벨).
- `surchargeRate === 0.4` 인 경우 상단에 `Badge "미성년 + 20억 초과 → 40%"` 표시(법령 §57②).
- 펼침 토글: 기본 펼침(상세보기 default open). `TaxCreditBreakdownCard`와 동일 스타일.

### 시각

- 카드 컨테이너: `border rounded-xl bg-rose-50/40 border-rose-200` (할증 = rose tone)
- 헤더: "세대생략 할증과세 산출근거 §57·§57②·시행령"
- 법령 배지: `LawArticleModal` 링크 `상증법 §57`, `§57②`(40% 조건), `시행령 §3` (한도 산식 위임)
- 인쇄 시 펼침 강제(`print:block`)

## 4. 변경 파일

| # | 파일 | 변경 |
|---|---|---|
| 1 | `components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx` | **신규** (~150줄) |
| 2 | `components/calc/results/GiftTaxResultView.tsx` | import + L308 위 1줄 삽입 (~5줄) |

엔진·API·타입 변경 없음. 8개 동기화 지점 중 ⑦(결과 카드)만 해당. 회귀 위험 0.

## 5. 검증

- [ ] 그룹 A(부모→자녀) 사례: `generationSkipSurchargeDetail === null` → 카드 미렌더 회귀 0
- [ ] PDF 사례(이미지 2): ⑧ 51,300천원, ⑨ 12,000천원, ⑩ 16,655천원, ⑪ 12,000천원, ⑫ 39,300천원 표시 일치
- [ ] 현재 사례(이미지 1·3 = 사전증여 820M 있는 케이스): ⑧ **164,400,000**(=548M×100%×30%), ⑪ **51,300,000**(역산), ⑫ **113,100,000**, ⑬ **661,100,000** 표시 일치. ⑨/⑩은 사전증여 회차 입력값에 따라 결정 (⑪ = Min(⑨,⑩) = 51.3M이 되는 조합)
- [ ] 40% 케이스: `isMinorDonee=true` + `currentGiftValue > 20억`에서 Badge 표시
- [ ] 인쇄 미리보기: 카드 펼침 상태로 출력
- [ ] `npx tsc --noEmit` 0건

## 6. 후속 (이번 PR 제외)

- 별지 제10호서식 ㉝ 라벨에 "(당기분 = ⑫)" 보조 텍스트 추가 — 이번 세션에서 `surchargeBase → additionalSurcharge` 정정 완료, 라벨 추가는 별도 PR
- PDF anchor 테스트 1건(이미지 2 사례 51.3M / 39.3M) — `__tests__/tax-engine/inheritance-gift/generation-skip-surcharge-limit.test.ts`에 추가
