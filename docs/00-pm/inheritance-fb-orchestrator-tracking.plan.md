# 가업상속공제 orchestrator 사후관리 트래킹 명령 통합 (Plan v1)

> 작성일: 2026-05-21
> 대상 법령:
> - **상증법 §18의2⑤⑨⑩** (mst=276123) — 사후관리 위반·신고 6개월·양도세 환원
> - **상증령 §15⑩⑮⑯㉕** (mst=283637) — 자산처분비율·추징율·이자상당액·OFZ 면제
>
> 산식 동결 commit: `76f7282` (Phase F 헬퍼)
> 관련 plan: `inheritance-family-business-postmgmt.plan.md` (UI 시뮬레이터 — 본 PR 의존)
>
> 정책: `[[single-source-engine-helper]]` · `[[pre-do-anchor-verification]]`

## 1. 배경 — 현행 갭

### 1-1. orchestrator 분리 상태

`calcInheritanceTax`는 가업상속공제 적용까지만 (STEP ⑧). 적용 후 5년 사후관리는 **별도 진입점** (`calcFamilyBusinessPostMgmt`)으로 호출됨. 그러나:

- `calcInheritanceTax` 결과에 사후관리 메타가 없어 후속 진입점이 입력 정보를 어떻게 받아오는지 명시되지 않음
- 양도세 상당액 환원 공제 (§18의2⑩) 적용 위치 미정의
- OFZ 특례 (§15㉕) 사후관리 면제 (§15⑪1호·2호) 적용 미통합

**갭 4건**:
1. **InheritanceTaxResult에 사후관리 메타 누락** — appliedDeduction·신고기한·OFZ 활성 여부 미노출
2. **계산 흐름 분리 명세 미정** — 가업상속공제 적용 시점과 사후관리 추적 시점이 별개 호출이지만 인터페이스 정의 불충분
3. **§18의2⑩ 양도세 환원 통합 위치** — 추징 산정 직후 vs orchestrator 별도 step
4. **OFZ 사후관리 면제** — 가업상속공제 적용 시 `ofzExemptionActive` 필드는 detail에 있으나 사후관리 트래킹에서 §15⑪1호·2호 적용 배제 미구현

## 2. 데이터 모델 변경

### 2-1. `InheritanceTaxResult`에 사후관리 메타 추가

```typescript
export interface InheritanceTaxResult {
  // ... 기존
  /**
   * 가업상속공제 사후관리 트래킹 메타 (2026-05-21 추가).
   * familyBusinessDeduction > 0 시에만 채워짐.
   * UI 사후관리 시뮬레이터의 prefill 소스.
   */
  familyBusinessPostMgmtMeta?: FamilyBusinessPostMgmtMeta;
}

export interface FamilyBusinessPostMgmtMeta {
  /** 가업상속공제 적용액 (추징 원금) */
  appliedDeduction: number;
  /** 상속세 신고기한 (사망일 + 6개월) */
  filingDeadline: string;        // ISO date
  /** OFZ 특례 활성 (사후관리 §15⑪1호·2호 면제 사전 정보) */
  ofzExemptionActive: boolean;
  /** 가업상속재산 자산 (이력에서 추적 — 자산처분 비율 산정 기준) */
  inheritedAssets: Array<{ id: string; value: number; type: "land" | "building" | "stock" | "other" }>;
}
```

### 2-2. `FamilyBusinessPostMgmtInput`에 OFZ 면제 활성 전달

postmgmt 모듈에서 OFZ 활성 시 §15⑪1호·2호 위반 입력을 자동 면제 처리.

```typescript
export interface FamilyBusinessPostMgmtInput {
  // ... 기존 (postmgmt plan §2-2)
  /** 가업상속공제 적용 시 OFZ 특례 활성 여부 */
  ofzExemptionActive: boolean;
}
```

## 3. orchestrator 통합 위치

### 3-1. `inheritance-tax.ts` STEP ⑧ 후 메타 set

```typescript
const deductionResult = calcInheritanceDeductions(...);

// 가업상속공제 적용 시 사후관리 메타 set
if (deductionResult.familyBusinessDeduction > 0 && deductionResult.familyBusinessDetail) {
  const detail = deductionResult.familyBusinessDetail;
  result.familyBusinessPostMgmtMeta = {
    appliedDeduction: detail.deduction,
    filingDeadline: addMonths(input.deathDate, 6),
    ofzExemptionActive: detail.ofzExemptionActive ?? false,
    inheritedAssets: input.estateItems
      .filter(i => i.familyBusinessCategory !== undefined)
      .map(i => ({
        id: i.id,
        value: i.marketValue ?? 0,
        type: mapAssetType(i.category),
      })),
  };
}
```

### 3-2. `calcFamilyBusinessPostMgmt` orchestrator 분기

```typescript
export function calcFamilyBusinessPostMgmt(
  input: FamilyBusinessPostMgmtInput,
): FamilyBusinessPostMgmtResult {
  // 사용자 입력 위반 + 정당사유 매핑
  const violations = input.violations.map((v, i) => {
    const reason = input.justifiableReasons?.find(j => j.violationRef === i);
    if (reason) {
      return { event: v, exempted: true, exemptionReason: reason.reasonCode, recapture: 0, interest: 0 };
    }

    // OFZ 특례 자동 면제 (§15㉕)
    //   - §15⑪1호 대표이사 미종사 → business_cessation 부분 면제
    //   - §15⑪2호 업종 변경 → business_cessation 일부 면제
    if (input.ofzExemptionActive && v.type === "business_cessation") {
      return { event: v, exempted: true, exemptionReason: "ofz_exemption", recapture: 0, interest: 0 };
    }

    const recapture = calcFamilyBusinessRecapture(...);
    const interest = calcFamilyBusinessInterest(...);
    return { event: v, exempted: false, recapture: recapture.recaptureAmount, interest: interest.interestAmount };
  });

  // 정규직 트래킹
  const employmentResult = input.employmentTracking
    ? evaluateEmploymentDrop(input.employmentTracking)
    : undefined;

  // §18의2⑩ 양도세 환원 공제
  const totalRecapture = violations.reduce((s, v) => s + v.recapture, 0);
  const totalInterest = violations.reduce((s, v) => s + v.interest, 0);
  const cgtCreditApplied = Math.min(totalRecapture, input.cgtCreditAmount ?? 0);
  const netRecapture = Math.max(0, totalRecapture - cgtCreditApplied);

  return { totalRecapture, totalInterest, cgtCreditApplied, netRecapture, perViolationDetail: violations, employmentResult };
}
```

## 4. Pre-Do anchor

1. **PHF-META-1**: 가업상속공제 적용 사례 → `familyBusinessPostMgmtMeta` 자동 set
2. **PHF-META-2**: 가업상속공제 미적용 사례 → meta undefined
3. **PHF-META-3**: 신고기한 = deathDate + 6개월 정확 산정 (윤년 케이스 포함)
4. **PHF-OFZ-1**: ofzExemptionActive=true + business_cessation 위반 → 자동 면제 (§15㉕)
5. **PHF-OFZ-2**: ofzExemptionActive=true + asset_disposal 위반 → 면제 불성립 (§15㉕는 §15⑪에만 적용)
6. **PHF-CGT-NET-1**: 추징 18억 + 양도세 환원 5억 → netRecapture 13억
7. **PHF-CGT-NET-2**: 추징 5억 + 양도세 환원 10억 → netRecapture 0 (음수 가드)

## 5. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | OFZ 자동 면제 범위 모호 (§15⑪1호만? 2호도?) | Pre-Do FB-OFZ-LAW-1으로 §15㉕ 본문 재확인 (이미 검증 완료 — §15⑪1호·2호 모두 적용 배제 + 업종변경 자유) |
| R2 | 양도세 환원 시점 (추징 발생 후 vs 추징 산정과 동시) | 본 PR 동시 산정 — 후속 신고 시점 분리는 별도 PR |
| R3 | 자본적지출 §97의2④ 2호 적용 시점 | transfer-tax 통합 plan에서 처리 |
| R4 | 신고기한 윤년 처리 | date-fns `addMonths` 사용 + 윤년 anchor PHF-META-3 |

## 6. 14개 동기화 지점

본 PR은 orchestrator 내부 + 결과 메타만. UI는 postmgmt plan에서 별도 시뮬레이터로.

- ⑦ 결과 카드 — InheritanceTaxResultView에 "가업상속공제 사후관리" 안내 카드 추가 (5년 추적 시뮬레이터로 이동 링크)
- 그 외 ①②③④⑤⑥⑧⑨⑩⑫⑬⑭은 변경 없음 (메타는 자동 carry)

## 7. 후속 PR

- **UI 사후관리 시뮬레이터** (postmgmt plan)
- **transfer-tax 통합** (양도 발생 시 §18의2⑩ 환원 자동 트리거)
- **연차별 자동 알림** — 신고기한 + 5년 사후관리 시한 카운트다운

## 8. 작업 분해

1. Plan/Design — `inheritance-gift-tax-senior` 단독
2. Pre-Do — PHF-META-1~3 + PHF-OFZ-1~2 + PHF-CGT-NET-1~2 anchor 7건
3. Do — InheritanceTaxResult 확장 + orchestrator STEP ⑧ 후 메타 set + `calcFamilyBusinessPostMgmt` OFZ 분기
4. Check — anchor + 전체 회귀
5. Act — UI 시뮬레이터 plan 트리거

## 9. 의존 관계

```
inheritance-fb-orchestrator-tracking (본 PR)
  ↓ 결과 메타 제공
inheritance-family-business-postmgmt (UI 시뮬레이터)
  ↓ 추징·환원 결과
transfer-fb-cgt-credit-integration (양도 발생 시 환원)
```

본 PR 먼저, postmgmt UI는 본 PR 결과 메타에 의존, transfer 통합은 양쪽에 cross-cutting.
