# 사례 27 지분 모드 후속 수정 계획 (이미지 16/17/18)

> **작성일**: 2026-05-07 (continued)
> **상태**: ✅ **구현 완료** (커밋 0e6dbdaf · 2026-04-23) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan — 본 계획 승인 후 구현~~
> **선행 산출물**: F1·F2·F3·F4·F5 완료 (사례 27 핵심 anchor 18/18 통과)
> **본 계획 범위**: 사용자가 보고한 추가 오류 2건 + 입력 UX 개선

---

## Part 1 — `primaryActualSalePrice` 오류 수정 계획 (F6)

### 1.1 오류 메시지 (이미지 18)

```
입력값이 올바르지 않습니다
• primaryActualSalePrice: actual 모드: 주 자산의 계약서상 양도가액 필수
```

### 1.2 발생 시나리오

사용자가 사례 27 입력 시:
1. "함께 양도한 다른 자산… → 예" 토글
2. 총 양도가액 1,700,000,000 입력
3. **양도가액 결정 방식: 실가(계약서 구분 기재)** 선택 (이미지 16/17 상단)
4. 자산 1: 60% 상속, 양도가액 입력란 **비움** (지분 모드라 자동 계산되리라 기대)
5. 자산 2: 40% 매매, 양도가액 입력란 **비움**
6. 다음 단계 진행 → 가산세 단계에서 계산 시 서버 zod 검증 실패

### 1.3 근본 원인

**`lib/calc/transfer-tax-api.ts:556-559`**:
```typescript
primaryActualSalePrice:
  form.bundledSaleMode === "actual" && primary.actualSalePrice
    ? parseAmount(primary.actualSalePrice)
    : undefined,
```

지분 모드 primary에 대해 `primary.actualSalePrice`가 빈 문자열이면 `undefined` 송신.

**`lib/api/transfer-tax-schema.ts:262-268`** (서버 zod):
```typescript
if (data.bundledSaleMode === "actual") {
  if (!data.primaryActualSalePrice || data.primaryActualSalePrice <= 0) {
    ctx.addIssue({...message: "actual 모드: 주 자산의 계약서상 양도가액 필수"});
  }
}
```

actual 모드에서 `primaryActualSalePrice` 누락 → 검증 실패.

**비대칭성 발견**:
- companion 자산: `buildAssetPayload`가 지분 모드 시 `fixedSalePrice = totalContract × ratio` 자동 입력 (line 199 helpers) — 이미 처리됨
- **primary 자산: 동일 자동 계산 없음** — 사용자 입력 의존

→ F5에서 `standardPriceAtTransferForApportion` 면제 처리 시 primary의 `primaryActualSalePrice`도 동일하게 처리해야 했으나 누락됨.

### 1.4 해결 방안 (2단)

#### F6-1. API 변환에서 primary 지분 모드 자동 입력
**위치**: `lib/calc/transfer-tax-api.ts` line 556

**변경**:
```typescript
primaryActualSalePrice:
  form.bundledSaleMode === "actual"
    ? primary.actualSalePrice
      ? parseAmount(primary.actualSalePrice)
      // 지분 모드: contractTotalPrice × ratio 자동 (companion buildAssetPayload와 일관)
      : primaryFractional
        ? applyRatio(totalContractPrice, primaryRatio)
        : undefined
    : undefined,
```

#### F6-2. 서버 zod actual 모드 검증 면제
**위치**: `lib/api/transfer-tax-schema.ts` line 260-291

primary가 지분 모드(`data.totalPropertyTransferPrice` 설정)이면 `primaryActualSalePrice` 필수 검증 면제. 합계 검증도 지분 모드 자산이 하나라도 있으면 생략 (F5의 클라이언트 검증과 일관성).

```typescript
if (data.bundledSaleMode === "actual") {
  const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
  if (!primaryIsFractional) {
    if (!data.primaryActualSalePrice || data.primaryActualSalePrice <= 0) {
      ctx.addIssue({...});
    }
  }
  // 합계 검증도 지분 모드 자산 존재 시 생략
  const anyFractional = primaryIsFractional ||
    companions.some((c) => c.totalPropertyTransferPrice !== undefined);
  if (!anyFractional && data.totalSalePrice && data.primaryActualSalePrice) {
    /* 기존 합계 검증 */
  }
}
```

### 1.5 검증

**테스트 추가** (`fractional-acquisition-case-27.test.ts`):
- R-07 actual 모드 + primary 지분 60% + companion 지분 40% → API 변환 후 `primaryActualSalePrice = 1,020,000,000` 자동 입력 확인
- R-08 서버 zod 검증 통과 (actual 모드 + 모든 자산 지분)
- 사례 27 anchor 통합 시나리오 (apportioned 모드와 actual 모드 양쪽에서 동일 결과)

---

## Part 2 — 지분 모드 불필요 입력란 비활성화 계획 (F7)

### 2.1 현재 UX 문제

이미지 16/17에서 자산 카드에 다음 입력란이 **활성** 상태로 표시:

| 입력란 | 자산 1 (60% 상속) | 자산 2 (40% 매매) |
|---|---|---|
| 계약서상 양도가액 (필수 *) | ✅ 활성 | ✅ 활성 |
| 양도시 기준시가 (안분 모드 시) | ✅ 활성 | ✅ 활성 |

사용자가 빈 채로 두면 검증 오류(F6 이슈) 발생. 채우면 ratio × total과 충돌 가능성.

지분 모드 자산은 **양도가액이 시스템에 의해 자동 계산**되므로 사용자가 입력해도 무시되거나 충돌. 따라서 입력란 자체를 비활성화하고 자동 계산값을 표시하는 것이 명확함.

### 2.2 비활성화 대상 (자산-수준)

| 입력란 | 비활성화 조건 | 표시 대안 |
|---|---|---|
| **계약서상 양도가액** (`actualSalePrice`) | ratio < 1.0 | "자동 계산: 1,020,000,000원 (1,700,000,000 × 60/100)" 읽기전용 표시 |
| **양도시 기준시가** (`standardPriceAtTransfer`) | ratio < 1.0 | "지분 모드는 안분 키 불필요" 메시지 + 입력란 비활성화 |
| **자산 영명** (`assetLabel`) | 변경 없음 — 항상 활성 | — |
| **공유 지분율** | 항상 활성 | — |
| **취득 정보** (취득일·취득원인·취득가 등) | 항상 활성 | 100% 기준 입력 (기존 안내 배너 유지) |

### 2.3 구현 방안

#### F7-1. `CompanionSaleModeBlock` 양도가액 입력란 disabled

**위치**: `components/calc/transfer/CompanionSaleModeBlock.tsx` line 170-172

**변경**: `isFractional` prop 추가 → ratio < 1.0 시 input disabled + 자동 계산값 표시.

```tsx
// AssetSalePriceBlock 컴포넌트에 추가
{isFractional && totalContractPrice ? (
  <div className="rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm">
    <div className="text-xs text-amber-700 mb-0.5">자동 계산 (총 양도가액 × 지분율)</div>
    <div className="font-mono font-semibold text-amber-900">
      {formatKRW(totalContractPrice × (numerator / denominator))}원
    </div>
    <div className="text-[10px] text-amber-600 mt-0.5">
      {totalContractPrice.toLocaleString()} × {numerator}/{denominator}
    </div>
  </div>
) : (
  <CurrencyInput
    value={props.actualSalePrice}
    onChange={...}
    required
    placeholder="..."
  />
)}
```

#### F7-2. 안분(apportioned) 모드 양도시 기준시가 입력란 disabled

**위치**: `components/calc/transfer/CompanionSaleModeBlock.tsx` line 137-145 (apportioned 분기)

**변경**: 지분 모드면 안분 키 입력 불필요 안내 + 입력란 hidden 또는 disabled.

```tsx
{isFractional ? (
  <div className="text-xs text-muted-foreground italic px-2">
    지분 모드 — 안분 키(기준시가) 입력 불필요. 양도가액은 총양도가 × 지분율로 자동 결정됩니다.
  </div>
) : (
  <StandardPriceInput
    value={standardPriceAtTransfer}
    onChange={onStandardPriceAtTransferChange}
    /* 기존 props */
  />
)}
```

#### F7-3. CompanionAssetCard에서 ratio·총양도가 prop 전달

**위치**: `components/calc/transfer/CompanionAssetCard.tsx` line ~330 (CompanionSaleModeBlock 호출)

**변경**: `ownershipNumerator`·`ownershipDenominator`·`contractTotalPrice` 전달 → 하위 컴포넌트가 `isFractional` 계산 가능.

```tsx
<CompanionSaleModeBlock
  /* 기존 props */
  ownershipNumerator={asset.ownershipNumerator}
  ownershipDenominator={asset.ownershipDenominator}
  contractTotalPrice={contractTotalPrice}
/>
```

#### F7-4. 신고서 양식 자산별 양도가액 표시 일관화

**위치**: `components/calc/results/transfer/FilingFormTableHelpers.ts` (F4-3에서 일부 처리됨)

**확인사항**: 결과 화면에서도 자산별 양도가액이 ratio 적용된 값으로 정확히 표시되는지. F4-3 처리로 단건 모드는 해결됐으나 BundledAllocationCard.PropertyCard도 동일한지 확인 필요.

### 2.4 영향 범위

#### 변경 없음 (안전)
- 단독 소유(ratio = 100/100): `isFractional === false` → 모든 입력란 기존대로 활성
- 단건 모드(자산 1건): F4-1 검증으로 지분 모드 차단 → 본 변경의 영향 없음
- 안분 모드(apportioned)에서 단독 소유 자산 + 지분 자산 혼합: 단독 자산만 standardPriceAtTransfer 입력 활성

#### 변경 효과 (개선)
- 사용자가 입력 불필요한 필드를 보지 않음 → UX 명확
- 자동 계산값을 즉시 확인 가능 → 디버깅·검증 용이
- F6 오류 자체 발생 차단 (입력란이 없으니 미입력으로 인한 검증 실패 불가)

### 2.5 구현 순서

| Round | 작업 | 우선순위 |
|---|---|---|
| F6-1·F6-2 | API 변환 + zod actual 모드 면제 (오류 즉시 차단) | **1순위** |
| F7-3 | prop 전달 인프라 (ratio·contractTotalPrice down-prop) | 2순위 |
| F7-1 | 양도가액 입력란 disabled + 자동 계산 표시 | 2순위 |
| F7-2 | 양도시 기준시가 입력란 hidden + 안내 | 3순위 |
| F7-4 | 결과 화면 일관성 점검 (대부분 F4-3에서 해결됨) | 4순위 |
| anchor | R-07·R-08 + UI 회귀 anchor 추가 | 마지막 |

---

## 3. 변경 파일 종합

| 파일 | F6-1 | F6-2 | F7-1 | F7-2 | F7-3 | F7-4 | 테스트 |
|---|---|---|---|---|---|---|---|
| `lib/calc/transfer-tax-api.ts` | ✅ | | | | | | |
| `lib/api/transfer-tax-schema.ts` | | ✅ | | | | | |
| `components/calc/transfer/CompanionSaleModeBlock.tsx` | | | ✅ | ✅ | | | |
| `components/calc/transfer/CompanionAssetCard.tsx` | | | | | ✅ | | |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | | | | | | ⚠ 확인만 | |
| `__tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts` | | | | | | | ✅ R-07/08 |

## 4. 재사용 자산

- `getOwnershipRatio(asset)` / `applyRatio(amount, ratio)` / `isFractionalRatioStr(n, d)` — `lib/calc/transfer-tax-api-helpers.ts`
- `formatKRW` — `components/calc/inputs/CurrencyInput`
- 기존 amber 톤 (`bg-amber-50/40 border-amber-300 text-amber-900`) — F2에서 정립된 지분 모드 시각 언어와 일관

## 5. 검증 (End-to-End)

### 단위 테스트
```bash
npx vitest run __tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts
```
기존 18 + R-07·R-08 = 20 anchor 통과.

### 회귀
```bash
npx vitest run
npx tsc --noEmit
```
138 파일 / 2333+2 = 2335 테스트 통과, tsc 0건.

### 브라우저 수동 시나리오
1. 사례 27 정확 입력
2. **양도가액 결정 방식: 실가** 선택 (이미지 16과 동일)
3. 자산 1·2 모두 "계약서상 양도가액" 입력란이 **자동 계산값으로 disabled 표시** 확인
4. 빈 입력 없이 가산세 단계 진행 → 결과 화면 도달
5. **합산 산출세액 39,702,352 / 지방세 3,970,235 / 총 납부세액 43,672,587** 확인
6. 양도가액 결정 방식 토글을 **안분(기준시가 비율)**로 변경 → 동일 결과 (지분 모드 ratio 자동)

## 6. 본 계획 범위 외 (별도 PR)

- **단독 소유 자산 + 지분 자산 혼합 시나리오 처리**: 일부 자산만 ratio<1.0인 경우 안분 동작 (예: 같은 물건 60% 단계취득 + 별도 토지 일괄양도) — 현재 F5 검증은 자산별로만 면제하므로 부분 작동하나 회귀 anchor 필요
- **결과 카드 자동 계산 수식 표시**: "양도가액 1,020,000,000 = 1,700,000,000 × 60/100" 식 명시
- **자산 추가 시 토글 자동 활성화**: 첫 자산에 지분율 60% 입력 시 "함께 양도… → 예" 자동 토글 + 두 번째 자산 자동 추가

## 7. 위험 및 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| primary 자산 actualSalePrice 자동 계산이 사용자 의도와 다름 | 잘못된 양도가액 | totalContractPrice 입력 강제 + 자동 계산값 명시 표시 |
| 비활성 입력란이 폼 데이터에 잔여값으로 남음 | API 호출 시 충돌 | API 변환에서 ratio < 1.0 우선 (사용자 입력 무시) — F6-1로 보장 |
| 단독 + 지분 혼합 시 일부 자산 안분 키 누락 | apportioned 분기 실패 | F5에서 자산별 면제 처리 완료, 회귀 anchor로 차단 |
| zod 검증 면제로 인한 정상 케이스 검증 누락 | 단독 소유 잘못된 입력 통과 | `data.totalPropertyTransferPrice === undefined` 체크 → 단독 소유는 기존 검증 그대로 |

## 8. Definition of Done

- [ ] F6-1·F6-2 구현 + 사례 27 actual 모드 정상 동작
- [ ] F7-1·F7-2·F7-3 구현 + 자산 카드 입력란 자동 계산 표시
- [ ] R-07·R-08 anchor 추가 + 통과
- [ ] tsc --noEmit 0건
- [ ] vitest 회귀 0건
- [ ] 브라우저 수동: 사례 27 actual 모드 + apportioned 모드 양쪽에서 anchor 값 일치
- [ ] 단독 소유 회귀 (ratio = 100/100 자산 양도) 입력 흐름 무변경 확인
