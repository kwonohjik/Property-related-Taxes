# 가업상속공제 자산 양도 — 양도세 의제 §97의2④ + §18의2⑩ 공제 통합 (Plan v1)

> 작성일: 2026-05-21
> 대상 법령:
> - **소득세법 §97의2④** (mst=285523, 시행 2026-04-21) — 가업상속공제 적용 자산 양도 시 의제 취득가액
> - **상증법 §18의2⑩** (mst=276123) — 양도세 상당액 공제
> - **상증령 §15㉑** (mst=283637) — 공제 산식
>
> 모범 선행: `lib/tax-engine/credits/family-business-cgt-credit.ts` (산식 동결 commit `bbdabe0`)
>
> 정책: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[mirror-pattern]]` · `[[pre-do-anchor-verification]]`

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
  /** 상속개시일 현재 자산 평가액 (§97의2④2호) */
  inheritanceMarketValue: number;
  /** 가업상속공제적용률 (0~1) — 시행령 §163의2 위임. 사용자 입력 또는 자동 산정 */
  fbDeductionAppliedRate: number;
  /** 상속개시일 (자본적지출 시점 분기용 — §97의2① 인용) */
  inheritanceDate: string;
}
```

### 2-2. `TransferTaxResult`에 의제·일반 양도세액 양쪽 노출

```typescript
export interface TransferTaxResult {
  // ... 기존
  /** 가업상속공제 §97의2④ 적용 결과 — 의제/일반 양쪽 계산 시 */
  familyBusinessDetail?: {
    cgtUnderSection97_2_4: number;
    cgtUnderSection97: number;
    creditAmount: number;       // §18의2⑩ + §15㉑
    appliedRate: number;
    /** 적용 분기 — "imputed_lower" (의제<일반→일반 적용) / "imputed_used" */
    selectedFormula: "imputed_used" | "imputed_lower";
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
- `input.familyBusinessInheritance` 존재 시 의제 산식 적용
- 동시에 일반 산식(피상속인 취득가액 그대로) 계산 → 두 결과 비교용
- §97의2② 3호 단서: **§97의2 적용 결과가 일반보다 적으면 §97의2 미적용** (자기상충 회피)

```typescript
if (input.familyBusinessInheritance) {
  const imputed = calcFamilyBusinessImputedAcquisitionPrice(...);
  const baselineCgt = calcWith(input.acquisitionPrice);  // §97
  const imputedCgt = calcWith(imputed);                  // §97의2④
  if (imputedCgt >= baselineCgt) {
    // 의제 적용 (납세자 불리 — §18의2⑩으로 환원 공제)
    result.familyBusinessDetail = {
      cgtUnderSection97_2_4: imputedCgt,
      cgtUnderSection97: baselineCgt,
      creditAmount: imputedCgt - baselineCgt,  // §15㉑ 산식
      appliedRate: fbDeductionAppliedRate,
      selectedFormula: "imputed_used",
    };
  } else {
    // §97의2② 3호 단서 — 의제가 더 낮으면 일반 산식 사용
    result.familyBusinessDetail = {
      cgtUnderSection97_2_4: imputedCgt,
      cgtUnderSection97: baselineCgt,
      creditAmount: 0,
      appliedRate: fbDeductionAppliedRate,
      selectedFormula: "imputed_lower",
    };
  }
}
```

### 3-2. `calcFamilyBusinessCgtCredit` 직접 호출은 transfer-tax 측 책임

본 PR에서 상속세 측 환원 공제는 산정만. 실제 환급 처리(이미 신고된 상속세 수정신고)는 UI scope 외.

## 4. UI 구현

### 4-1. 양도세 마법사 Step1 자산 카드에 OS 토글 추가

```
[자산 카드]
└── [ToggleCard "가업상속공제 적용 자산 (소법 §97의2④)" — emerald tone]
    └── (ON 시) [FamilyBusinessInheritanceTransferSection]
        ├── 피상속인 원취득가액 CurrencyInput
        ├── 상속개시일 현재 자산가액 CurrencyInput
        ├── 상속개시일 DateInput
        └── 가업상속공제적용률 DecimalInput (0~1)
```

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
4. **FB-CGT-LOWER-1**: §97의2② 3호 단서 — 의제 양도세 < 일반 양도세 시 일반 산식 적용, creditAmount=0
5. **FB-CGT-LAW-1**: KoreanLaw MCP로 소령 §163의2 가업상속공제적용률 산정 산식 확정 (시행령 위임 사항)

## 7. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 가업상속공제적용률 정의 모호 | Pre-Do FB-CGT-LAW-1으로 시령 §163의2 확정 |
| R2 | 양도 측 ↔ 상속 측 데이터 일관성 | 사용자가 동일 자산 양쪽 마법사에 입력 필요 (이력 조회 자동 연동은 후속 PR) |
| R3 | §97의2② 3호 단서 자기상충 | imputed_lower 분기 명시 |
| R4 | 자본적지출 §97의2④ 2호 적용 시점 | 피상속인 vs 상속인 분리 (별도 입력 필드) — 후속 PR |

## 8. 후속 PR

- **자동 적용률 산정**: 가업상속공제 결과에서 적용률 자동 도출 (현재 사용자 직접 입력)
- **이력 조회 연동**: 상속세 계산 결과에서 가업상속공제 자산 → 양도세 자동 prefill
- **상속세 환원 공제 자동화**: 양도 발생 후 상속세 수정신고 마법사
- **자본적지출 분리**: 피상속인 vs 상속인 지출 분리 (§97의2④ 2호 적용 시점)

## 9. 작업 분해

1. Plan/Design — `transfer-tax-senior` + `inheritance-gift-tax-senior` 병렬
2. Pre-Do anchor — FB-CGT-IMPUTED-1~3 + FB-CGT-LOWER-1 + FB-CGT-LAW-1
3. Do 시퀀셜 — transfer-tax-senior가 엔진 분기 + UI 시니어가 ⑤⑥⑦
4. Check — ui-engine-sync-checker + tax-qa-lead 회귀
5. Act — 자동 적용률 산정 후속 PR 트리거
