# transfer-tax STEP 2 (취득가액) 매개변수화 사전 리팩토링 (Plan v1)

> 작성일: 2026-05-22
> v3 정정 시 분리 (K7) — `transfer-fb-cgt-credit-integration.plan.md`의 사전 의존성으로 신규 작성
>
> 대상 파일: `lib/tax-engine/transfer-tax.ts` (706줄) + helpers·rate-calc·finalize 4-파일 + 다필지·재개발·환산취득가 분기
>
> 정책: `[[single-source-engine-helper]]` · `[[pre-do-anchor-verification]]` · `[[feedback_no_silent_apportion_fallback]]`

## 1. 배경 — 가업상속공제 §97의2④ 의제 산식 도입을 위한 사전 리팩토링

`transfer-fb-cgt-credit-integration` 본 PR은 양도세 엔진을 **2회 호출**해야 함:
- 1회: §97 일반 산식 (피상속인 취득가액)
- 2회: §97의2④ 의제 산식 (의제 취득가액)

현재 `calculateTransferTax(input)` 함수는 input.acquisitionPrice·input.assets[].acquisitionPrice를 내부에서 결정하므로 외부 override 불가.

## 2. 갭

1. **STEP 2 매개변수화 미구현** — 취득가액 결정 로직이 calculateTransferTax 내부에 깊이 박혀 있음
2. **자산-수준 자산별 acquisitionPrice override 미지원** — input.assets[].acquisitionPrice를 외부에서 강제할 수 없음
3. **다필지·재개발·환산취득가 분기 — STEP 2 위치 다양** — 단일 진입점으로 통일 필요
4. **회귀 보호 anchor 부재** — 현재 1,237 anchor가 acquisitionOverride=undefined로 동일 결과 보장해야 함

## 3. 신규 시그니처

```typescript
/**
 * 양도세 엔진 진입점 — acquisitionOverride 매개변수 추가 (K7).
 *
 * - acquisitionOverride=undefined: 기존 동작 (input 그대로 사용) — 회귀 0건 보장
 * - acquisitionOverride=number: STEP 2 결정 결과 무시하고 본 값 강제 적용
 *
 * 자산-수준 override는 acquisitionOverridesByAssetId 매핑으로 지원.
 */
export function calculateTransferTax(
  input: TransferTaxInput,
  options?: {
    /** 단건 양도 시 취득가액 강제 (override) */
    acquisitionOverride?: number;
    /** 다자산 모드 — 자산 ID별 취득가액 강제 */
    acquisitionOverridesByAssetId?: Record<string, number>;
  },
): TransferTaxResult;
```

## 4. 영향 분기 (다필지·재개발·환산취득가)

각 분기에서 acquisitionOverride 적용 위치 명세:

| 분기 | STEP 2 결정 로직 | override 적용 위치 |
|------|---------------|------------------|
| 일반 단건 | `input.acquisitionPrice` | override 우선, 없으면 input 사용 |
| 다필지 (multi-parcel) | `parcels[].acquisitionPrice` 합 | acquisitionOverridesByAssetId로 필지 ID별 override |
| 재개발 입주권 (right_to_move_in) | `redevelopmentInfo.rightsValue` 등 별도 | override는 합계만, 분배는 기존 로직 보존 |
| 환산취득가 (`useEstimatedAcquisition`) | `calculateEstimatedAcquisitionPrice` 호출 | **override 시 환산 로직 우회** 강제 (의제 산식과 환산 동시 적용 차단) |
| 감정가액 (`isAppraisalAcquisition`) | `appraisalValue` | override 우선 |

## 5. Pre-Do anchor (회귀 보호 핵심)

### 5-1. acquisitionOverride 미입력 회귀 (1,237 anchor 전수)
1. **TRP-REGRESSION-1**: `calculateTransferTax(input)` (options 미입력) → 기존 결과와 byte-identical
2. **TRP-REGRESSION-2**: `calculateTransferTax(input, undefined)` → 기존 결과와 byte-identical
3. **TRP-REGRESSION-3**: `calculateTransferTax(input, { acquisitionOverride: undefined })` → 기존 결과와 byte-identical

### 5-2. override 적용 시 STEP 2 변경
4. **TRP-OVERRIDE-1**: 단건 양도 + acquisitionOverride=200_000_000 → 취득가액 200M 강제 적용
5. **TRP-OVERRIDE-2**: 환산 모드 + acquisitionOverride → **환산 우회 + override 강제**
6. **TRP-OVERRIDE-3**: 다필지 + acquisitionOverridesByAssetId → 필지별 override 정확 적용

### 5-3. cross-cutting 분기
7. **TRP-OVERRIDE-CROSS-1**: 재개발 + override → rightsValue 무시, override 강제
8. **TRP-OVERRIDE-CROSS-2**: 감정가액 + override → appraisalValue 무시, override 강제

## 6. 14개 동기화 지점 (사전 리팩토링 — 회귀 보호 한정)

- ①~⑧: UI 변경 없음 (옵션 인자는 양도세 엔진 내부)
- ⑨⑩⑫: Zod 변경 없음
- ⑬⑭: callTransferTaxAPI·route handler 변경 없음

본 PR은 **순수 함수 리팩토링** — 회귀 보호만.

## 7. 위험

| ID | 위험 | 대응 |
|----|------|------|
| R1 | 다필지·재개발·환산 분기 누락 | §4 매트릭스 + Pre-Do TRP-OVERRIDE-CROSS-1·2 |
| R2 | 회귀 1,237 anchor 중 누락 | npx vitest run __tests__/tax-engine/transfer-tax/ 전수 비교 |
| R3 | 자산-수준 override 모호 | acquisitionOverridesByAssetId 명확한 ID 매핑 정책 |
| R4 | 작업량 5+일 추정 | 다필지·재개발·환산 분기 각각 검증 일정 명시 |

## 8. 작업 분해

1. Plan/Design — `transfer-tax-senior` 단독
2. Pre-Do — TRP-REGRESSION-1~3 + TRP-OVERRIDE-1~3 + TRP-OVERRIDE-CROSS-1~2 anchor 8건
3. Do — calculateTransferTax 시그니처 확장 + STEP 2 진입점 분리
   - day 1·2: 일반 단건 + 환산 모드
   - day 3: 다필지
   - day 4: 재개발 입주권
   - day 5: 감정가액 + cross-cutting 회귀
4. Check — anchor + 전체 양도세 회귀 1,237 byte-identical
5. Act — `transfer-fb-cgt-credit-integration` 본 PR 진입 가능

## 9. 의존 그래프

```
transfer-tax-acquisition-param-refactor (사전 PR, 본 plan)
  ↓ 완료 후 진입 가능
transfer-fb-cgt-credit-integration (양도세 의제 §97의2④)
```
