# 가업상속공제 자산 양도 — 양도세 의제 §97의2④ + §18의2⑩ 공제 통합 (Plan v3)

> v2 → v3 정정 (2026-05-22 비판적 재검토 — Critical):
> - **K7 ★★ 작업량 재산정 + 사전 PR 분리**: `runTransferEngineWithAcquisition` 추출은 transfer-tax.ts·helpers·rate-calc·finalize 4-파일 + 다필지·재개발·환산취득가 분기 전체 진입점 리팩토링 (5+일 작업).
>   - **사전 PR `transfer-tax-acquisition-param-refactor.plan.md` 분리** (별도 작성 필요)
>   - 본 PR은 그 분리 PR이 완료된 후 진입 가능 (의존성 명시)
>   - 분리 PR scope: STEP 2를 `(input, acquisitionOverride?: number) => result` 형태로 매개변수화. 기존 호출 회귀 0건 보장
> - **K10 ★ 적용률 자동 prefill 본 PR 종속 격상**:
>   - v2 "자동 prefill은 후속 PR" → v3 "본 PR 핵심 의존". 사용자가 0.7853 같은 수치를 직접 입력하는 비현실성 제거
>   - 상속세 결과(`InheritanceTaxResult.familyBusinessDetail`)에 `appliedRate` 필드 추가하여 transfer-tax 마법사에서 자동 prefill (사용자 override 가능)
>   - 자동 prefill 없으면 본 PR 사용자 가치 제로 — 후속 PR 분리는 사용자 가치 큰 손실
>
> v1 → v2 정정 (2026-05-21 종합 검토):
> - **X1 법령 오인용 정정**: §97의2② 단서는 §97의2① 한정. **§97의2④ 가업상속공제 자산에는 단서 미적용** — 본문 강제. `selectedFormula="imputed_lower"` 분기 삭제
> - **X3 모델 단순화**: creditAmount = max(0, 의제 − 일반) 항상 산정. selectedFormula enum 제거
> - **X4 작업량 명시**: `calcWith`는 transfer-tax 전체 양도세 엔진 호출 (단순 헬퍼 아님)
> - **X5 라벨 정확성**: `inheritanceMarketValue` → 상증법 §60·§63 보충적 평가가액 (시가 아님)
> - **X6 가업상속공제적용률 산식**: 소령 §163의2 본문 Pre-Do FB-CGT-LAW-1로 확정. 잠정 산식 명시 (공제액 / 가업상속재산 평가액)
> - **N2 자본적지출 분리 보강**: §97의2④ 2호 자본적지출 시점 — 피상속인 vs 상속인 분리 정책 명시
> - **C1 분담 명확화**: 산정은 transfer-tax 측 책임 (본 PR), postmgmt 측은 사용자 수동 입력으로 수령

> 작성일: 2026-05-21
> 대상 법령:
> - **소득세법 §97의2④** (mst=285523, 시행 2026-04-21) — 가업상속공제 적용 자산 양도 시 의제 취득가액
> - **상증법 §18의2⑩** (mst=276123) — 양도세 상당액 공제
> - **상증령 §15㉑** (mst=283637) — 공제 산식
>
> 모범 선행: `lib/tax-engine/credits/family-business-cgt-credit.ts` (산식 동결 commit `bbdabe0`)
>
> 정책: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[mirror-pattern]]` · `[[pre-do-anchor-verification]]`

## 0. 의존성 (v3 추가)

### 0-1. 사전 PR 의존 — `transfer-tax-acquisition-param-refactor.plan.md` (K7 분리)

본 PR은 사전 PR 완료 후 진입:
- transfer-tax.ts STEP 2 (취득가액 결정)를 `(input, acquisitionOverride?: number) => result` 매개변수화
- 헬퍼 export `runTransferEngineWithAcquisition(input, acqOverride)` — 본 PR이 호출
- 기존 호출처(`acquisitionOverride=undefined`) 회귀 anchor 100% 보장 (transfer-tax 전체 1,237 anchor 통과)
- 작업량 추정: 3~5일 (다필지·재개발·환산취득가 분기 각각 검증)

### 0-2. 상속세 측 의존 — InheritanceTaxResult.familyBusinessDetail.appliedRate carry (K10)

상속세 마법사 결과에서 가업상속공제적용률을 노출. 양도세 마법사에서 사용자가 가업상속 자산 양도 시 이력 자동 prefill (사용자 override 가능).

## 1. 배경 — 현행 갭

### 1-1. 산식 헬퍼는 분리됐으나 양도 측 호출 미통합

`calcFamilyBusinessCgtCredit({cgtUnderSection97_2_4, cgtUnderSection97}, lawRef)` — 두 양도세액의 차이 공제 산식만 동결. 의제 산식 자체 적용은 transfer-tax 엔진 책임.

**갭 4건**:
1. **의제 취득가액 산식 미구현** — §97의2④ 1호+2호 산식이 transfer-tax 엔진에 없음
2. **가업상속공제적용률 산정** — 시행령 위임 사항. 가업상속공제 적용 자산 가액 중 실제 공제된 비율
3. **양도 측 input 누락** — `TransferTaxInput`에 `familyBusinessInheritance?` 객체 없음 (피상속인 취득가액·상속개시일·공제적용률 등)
4. **상속세 측 환원 공제** — `calcFamilyBusinessCgtCredit` 호출 시점·반영 위치 미정의 (가업상속공제 적용 후 양도 발생 → 상속세 재계산 환원)

### 1-2. 법령 정합 (KoreanLaw MCP 2026-05-21 검증 완료)

**소득세법 §97의2④** (본문 그대로):
- 가업상속공제 적용 자산 양도차익 계산 시 취득가액은 다음 합:
  - 1호: **피상속인의 취득가액 × 가업상속공제적용률**
  - 2호: **상속개시일 현재 해당 자산가액 × (1 − 가업상속공제적용률)**
- 필요경비는 §97② 따름

**상증령 §15㉑** (산식):
- 양도세 상당액 = §97의2④ 적용 양도세액 − §97 일반 양도세액
- 음수 → 0 (§18의2⑩ 단서)

**가업상속공제적용률 산정** (소령 §163의2 위임 — Pre-Do 단계 추가 확인 필요):
- 산식 후보: 공제액 / 가업상속재산 평가액 (단순 비율)
- 또는 자산별 분리 적용 — Pre-Do anchor에서 mst 조회 후 확정

## 2. 데이터 모델 변경

### 2-1. `TransferTaxInput`에 가업상속 출처 객체 추가

```typescript
export interface TransferTaxInput {
  // ... 기존
  /** 가업상속공제 적용 자산 양도 시 §97의2④ 의제 산식 입력 */
  familyBusinessInheritance?: FamilyBusinessInheritanceTransferInput;
}

export interface FamilyBusinessInheritanceTransferInput {
  /** 피상속인의 원취득가액 (§97의2④1호) */
  decedentAcquisitionPrice: number;
  /**
   * 상속개시일 현재 자산 평가가액 (§97의2④2호).
   * 시가가 아닌 **상속세 보충적 평가가액** (상증법 §60·§63).
   * 시가 우선 적용 시는 시가, 없으면 보충적 평가.
   */
  inheritanceMarketValue: number;
  /**
   * 가업상속공제적용률 (0~1, 소령 §163의2 위임 — Pre-Do FB-CGT-LAW-1 확정).
   * 잠정 산식: 가업상속공제 적용액 / 가업상속재산 평가액 (단순 비율).
   * 자산별 분리 적용 여부는 mst 조회 후 확정.
   */
  fbDeductionAppliedRate: number;
  /** 상속개시일 — 자본적지출 시점 분기용 (피상속인 vs 상속인 분리) */
  inheritanceDate: string;
  /**
   * 자본적지출 분리 (§97의2④ 2호 적용 시점, N2 보강).
   * 피상속인이 지출한 자본적지출 — 1호 산식에 (× appliedRate) 곱
   * 상속인이 지출한 자본적지출 — 2호 산식에 (× (1-appliedRate)) 곱
   * 본 PR 기본 정책: 별도 입력 필드 없이 §97② 필요경비에 합산.
   * 정밀 분리는 후속 PR (자본적지출 별도 입력 필드).
   */
  decedentCapitalExpenditure?: number;
  heirCapitalExpenditure?: number;
}
```

### 2-2. `TransferTaxResult`에 의제·일반 양도세액 양쪽 노출

```typescript
export interface TransferTaxResult {
  // ... 기존
  /**
   * 가업상속공제 §97의2④ 적용 결과.
   * §97의2④는 본문 강제 적용 — §97의2② 단서는 ①에만 적용되어 본 항에는 미적용.
   * 의제 양도세액이 일반보다 낮더라도 §97의2④ 본문 그대로 적용 (selectedFormula 분기 없음).
   */
  familyBusinessDetail?: {
    /** §97의2④ 의제 산식 양도세액 (강제 적용) */
    cgtUnderSection97_2_4: number;
    /** §97 일반 산식 양도세액 (참조용 — §15㉑ 산식 분자) */
    cgtUnderSection97: number;
    /** §18의2⑩ + §15㉑ 양도세 상당액 공제 = max(0, 의제 − 일반) */
    creditAmount: number;
    /** 가업상속공제적용률 (소령 §163의2) */
    appliedRate: number;
  };
}
```

### 2-3. 의제 산식 헬퍼 신규 — `transfer-tax-family-business.ts`

```typescript
export function calcFamilyBusinessImputedAcquisitionPrice(
  decedentAcquisitionPrice: number,
  inheritanceMarketValue: number,
  fbDeductionAppliedRate: number,  // 0~1
): number {
  return Math.floor(
    decedentAcquisitionPrice * fbDeductionAppliedRate +
    inheritanceMarketValue * (1 - fbDeductionAppliedRate)
  );
}
```

## 3. 엔진 구현

### 3-1. transfer-tax 엔진 분기

`transfer-tax.ts` STEP 2 (취득가액 결정) 분기:
- `input.familyBusinessInheritance` 존재 시 **§97의2④ 본문 강제 적용** (단서 없음)
- 일반 산식(§97)도 병행 계산 — §15㉑ 산식 분자 (의제 − 일반)
- 음수 가드 — `creditAmount = max(0, 의제 − 일반)`

```typescript
// `calcWith` = transfer-tax 전체 양도세 산정 함수 (양도가액·필요경비·LTHD·세율 모두 적용).
//   단순 헬퍼 아님 — STEP 2 취득가액 변경 → STEP 3~8 재산정 필요.
//   구현 시 STEP 2를 acquisitionPrice 인자로 매개변수화하여 두 번 호출.

if (input.familyBusinessInheritance) {
  const fb = input.familyBusinessInheritance;
  const imputedAcq = calcFamilyBusinessImputedAcquisitionPrice(
    fb.decedentAcquisitionPrice,
    fb.inheritanceMarketValue,
    fb.fbDeductionAppliedRate,
  );
  // §97 일반 산식 — 피상속인 취득가액 그대로 (상속 자체 의제는 적용하지 않음)
  const baselineCgt = runTransferEngineWithAcquisition(fb.decedentAcquisitionPrice);
  // §97의2④ 의제 산식 — 의제 취득가액
  const imputedCgt = runTransferEngineWithAcquisition(imputedAcq);
  // §15㉑ 산식 + §18의2⑩ 음수 가드
  const creditAmount = Math.max(0, imputedCgt - baselineCgt);
  result.familyBusinessDetail = {
    cgtUnderSection97_2_4: imputedCgt,
    cgtUnderSection97: baselineCgt,
    creditAmount,
    appliedRate: fb.fbDeductionAppliedRate,
  };
  // §97의2④ 본문 강제 — 최종 양도세는 의제 산식 적용
  result.calculatedTax = imputedCgt;
}
```

### 3-2. `calcFamilyBusinessCgtCredit` 직접 호출은 transfer-tax 측 책임 (C1 분담 명확화)

본 PR에서 양도세 측 산정:
- `result.familyBusinessDetail.creditAmount` = max(0, 의제 − 일반) (§15㉑ 산식)

postmgmt 측(`inheritance-family-business-postmgmt.plan.md`)의 분담:
- 사용자가 본 PR 양도세 결과의 `creditAmount`를 **postmgmt UI Step1 `cgtCreditAmount` 필드에 수동 입력**
- 이력 자동 연동(C2)은 후속 PR scope — 본 세션에서는 수동 입력만 지원
- 실제 환급 처리(이미 신고된 상속세 수정신고)는 UI scope 외 (별도 수정신고 마법사)

## 4. UI 구현

### 4-1. 양도세 마법사 Step1 자산 카드에 OS 토글 추가 (K10 prefill)

```
[자산 카드]
└── [ToggleCard "가업상속공제 적용 자산 (소법 §97의2④)" — emerald tone]
    └── (ON 시) [FamilyBusinessInheritanceTransferSection]
        ├── [이력 자동 조회 버튼] — 상속세 마법사 결과에서 prefill
        │     (사용자 로그인 + 상속세 계산 이력 존재 시 활성화)
        ├── 피상속인 원취득가액 CurrencyInput (prefill 가능)
        ├── 상속개시일 현재 자산가액 CurrencyInput (prefill 가능)
        ├── 상속개시일 DateInput (prefill 가능)
        ├── 가업상속공제적용률 — prefill 표시 (예: "0.7853 — 상속세 결과 자동 도출")
        │     + 사용자 override DecimalInput (필요 시 수정)
        └── [경고 배지] prefill 값과 사용자 입력 차이 시 안내
```

자동 prefill 소스: `InheritanceTaxResult.familyBusinessDetail.appliedRate` (K10 — 본 PR scope).

### 4-2. 결과 카드 §97의2④ 의제·일반 비교 표

```
┌─ §97의2④ 가업상속공제 자산 양도 ─────────────────┐
│ 일반 산식 (§97) 양도세액:        12,000,000원   │
│ 의제 산식 (§97의2④) 양도세액:    30,000,000원   │
│ §15㉑ 공제 (양도세 상당액):     18,000,000원   │
│ 적용 분기: 의제 적용 (납세자 불리 → 상속세 환원)   │
└─────────────────────────────────────────────┘
```

## 5. 14개 동기화 지점

- ① TransferFormData에 `familyBusinessInheritance` 객체 + 4필드
- ②③ initial/normalize
- ④ transfer-tax-api.ts body 변환
- ⑤ Step1 자산 카드 ToggleCard + Section
- ⑥ 사이드바 합계 — 의제 적용 시 양도세액 차이 표시
- ⑦ 결과 카드 §97의2④ 비교 표
- ⑧ validate — 4필드 모두 입력 강제 (자동 안분 fallback 금지)
- ⑨⑩ Zod enum 없음 (모두 수치/날짜)
- ⑫ Zod 객체 정의
- ⑬ callTransferTaxAPI body spread
- ⑭ Route handler 매핑

## 6. Pre-Do anchor

1. **FB-CGT-IMPUTED-1**: 피상속인 취득가 100M·상속개시 평가 300M·적용률 0.8 → 의제 취득가 = 100M×0.8 + 300M×0.2 = 140M
2. **FB-CGT-IMPUTED-2**: 적용률 1.0 → 의제 취득가 = 피상속인 원취득가 (가업상속공제 100% 적용 시)
3. **FB-CGT-IMPUTED-3**: 적용률 0 → 의제 취득가 = 상속개시일 평가액 (가업상속공제 0% 적용 시)
4. **FB-CGT-CREDIT-NEG-1**: 의제 양도세 < 일반 양도세 → creditAmount=0 (음수 가드, §18의2⑩ 단서)
                            단, 양도세 자체는 **§97의2④ 본문 강제 적용** (납세자 불리해도)
5. **FB-CGT-LAW-1**: KoreanLaw MCP로 소령 §163의2 가업상속공제적용률 산정 산식 확정 (시행령 위임 사항).
                     - 잠정 가설: 공제액 / 가업상속재산 평가액 단순 비율
                     - 자산별 분리 적용 vs 통합 적용 본문 확인
6. **FB-CGT-CAPEX-1**: 자본적지출 분리 입력 시 1호·2호 산식에 각각 합산 (N2)
                       (본 PR 기본: §97② 필요경비 통합 — capex 분리는 후속)

## 7. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 가업상속공제적용률 정의 모호 | Pre-Do FB-CGT-LAW-1으로 시령 §163의2 확정 |
| R2 | 양도 측 ↔ 상속 측 데이터 일관성 | 사용자가 동일 자산 양쪽 마법사에 입력 필요 (이력 조회 자동 연동은 후속 PR) |
| R3 | §97의2② 3호 단서 자기상충 | imputed_lower 분기 명시 |
| R4 | 자본적지출 §97의2④ 2호 적용 시점 | 피상속인 vs 상속인 분리 (별도 입력 필드) — 후속 PR |

## 8. 후속 PR

- **상속세 환원 공제 자동화**: 양도 발생 후 상속세 수정신고 마법사
- **자본적지출 분리**: 피상속인 vs 상속인 지출 분리 (§97의2④ 2호 적용 시점)
- **LTHD 보유기간 기산일 정책** (K1): 피상속인 vs 상속인 취득일 분기
- **1세대1주택 비과세·중과 cross-cutting** (K2): 가업 자산이 주택일 때 §89·§104 영향
- ~~자동 적용률 산정·이력 조회 연동~~ — **본 PR 종속 항목으로 격상 (K10, §0-2)**

## 9. 작업 분해

1. Plan/Design — `transfer-tax-senior` + `inheritance-gift-tax-senior` 병렬
2. Pre-Do anchor — FB-CGT-IMPUTED-1~3 + FB-CGT-LOWER-1 + FB-CGT-LAW-1
3. Do 시퀀셜 — transfer-tax-senior가 엔진 분기 + UI 시니어가 ⑤⑥⑦
4. Check — ui-engine-sync-checker + tax-qa-lead 회귀
5. Act — 자동 적용률 산정 후속 PR 트리거
