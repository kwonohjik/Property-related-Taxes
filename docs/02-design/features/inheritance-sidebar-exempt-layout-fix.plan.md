# Plan — 상속세 사이드바 합계 미리보기: 비과세·불산입 반영 버그 수정 + 라벨 세로 레이아웃

> 작성일: 2026-06-10
> 범위: UI 전용 (엔진 무변경 — 엔진 과세가액은 이미 정확, 사이드바 **추정**만 수정)
> 참조 (실측):
> - `lib/stores/inheritance-summary.ts:176-178` (`computeInheritanceSummary` 과세가액 추정 — 버그)
> - `lib/tax-engine/inheritance-tax.ts:134-143`(`exemptAmount` 평가)·`:250-254`(과세가액 = `… - exemptAmount …`)
> - `lib/tax-engine/exemption-rules.ts:54`(`ExemptionTreatment = "non_taxable" | "not_included"`)·`:84-266`(8종 규칙)
> - `components/calc/inheritance/shared.ts:34` (`exemptionItems: ExemptionCheckedItem[]` — 이미 입력 가능)
> - `components/calc/inheritance/InheritanceSidebar.tsx:163-194` (`Row` 가로 배치 — 줄바꿈 원인)

---

## 1. 배경 및 목표

사용자 요청 2건:

| # | 문제 | 수정 |
|---|---|---|
| 1 | 사이드바 라벨("② 상속세 과세가액" 등)이 좁은 폭에서 여러 행으로 깨짐 | 라벨을 **한 줄로 위에**, 금액을 **그 아래**에 세로 배치 |
| 2 | **비과세 재산·과세가액 불산입 미반영 → 과세가액 과대 표시** | 사이드바 추정 산식에 `exemptAmount` 차감 추가(엔진 정합) |

---

## 2. 버그 분석 — 과세가액 과대 표시 (dual-truth)

### 2.1 현행 (버그)

`inheritance-summary.ts:176-178`:
```typescript
const taxableEstateValue =
  result?.taxableEstateValue ??                                  // 계산 후: 엔진값(정확)
  Math.max(0, totalEstate - totalDebts - funeralApplied + priorGiftTotal);  // 입력 중: 추정 — 비과세 누락
```

### 2.2 엔진 (정답)

`inheritance-tax.ts:250-254`:
```typescript
const taxableEstateValue = Math.max(
  0,
  grossEstateValue + presumedTotal - exemptAmount - deductedBeforeAggregation + priorGiftAggregated,
);
```
`exemptAmount = evaluateExemptions(input.exemptions, grossEstateValue).totalExemptAmount`(`:134-143`) — **비과세(§12) + 과세가액 불산입(§16 공익법인·§17 공익신탁) 합산 차감**.

### 2.3 결론

- **계산 후(result 존재)**: `result.taxableEstateValue` 사용 → **버그 없음**.
- **입력 중(result === null)**: 추정 산식에 `- exemptAmount` **누락** → Step2에서 비과세/불산입 입력 시 사이드바 과세가액이 그 금액만큼 **과대**. (스크린샷 = 입력 중 상태)
- **dual-truth**: 사이드바가 과세가액을 독립 재계산. 비과세 추정도 **엔진 헬퍼 `evaluateExemptions`를 import**해 산출(메모리 `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper` — UI 자체 재구현 금지).

---

## 3. 수정 설계 — 버그 (요청 2)

### 3.1 비과세·불산입 추정값 산출 (엔진 헬퍼 재사용 — 실측 확정)

```typescript
// inheritance-summary.ts — single-source: 엔진 헬퍼 직접 import
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";  // 실측: :234

// 입력 중 추정: grossEstate 추정값 기준으로 비과세 평가
const items = form.exemptionItems ?? [];           // ExemptionCheckedItem[] 그대로(변환 불필요)
const exemptEstimate =
  result?.exemptAmount ??                            // 실측: InheritanceTaxResult.exemptAmount echo 존재(types:1362)
  (items.length > 0 ? evaluateExemptions(items, totalEstate).totalExemptAmount : 0);

const taxableEstateValue =
  result?.taxableEstateValue ??
  Math.max(0, totalEstate - exemptEstimate - totalDebts - funeralApplied + priorGiftTotal);
```

- **변환 불필요(실측)**: `evaluateExemptions(checkedItems: ExemptionCheckedItem[], grossEstateValue)`(`exemption-evaluator.ts:234`)의 1번째 인자가 `ExemptionCheckedItem[]` — `FormState.exemptionItems`와 동일 타입이라 직접 전달. `toExemptionInput` 같은 변환 없음.
- grossEstate 인자는 공익법인 출연 비율 산정용 → 추정 시 `totalEstate` 전달.
- **타입 추가 필요(실측)**: `InheritanceSummaryFormInput`(`inheritance-summary.ts:35`)에 `exemptionItems?: ExemptionCheckedItem[]` 선언 추가(FormState엔 있어 런타임 전달되나 타입 미선언 → ① 동기화 지점).

### 3.2 사이드바에 "− 비과세·불산입" 행 추가 표시

채무·공과·장례 행과 동일 패턴으로 `− 비과세·불산입` 행 1개 추가(rose tone, `exemptEstimate > 0`일 때만). 사용자가 차감을 눈으로 확인 가능.

### 3.3 실측 완료 (검토 단계 확정)

- ✅ `result.exemptAmount` echo **존재**(`inheritance-gift.types.ts:1362`) → `result?.exemptAmount ?? 추정` 패턴. **엔진 result 변경 불필요 — 완전 엔진 무변경.**
- ✅ `evaluateExemptions` = `exemption-evaluator.ts:234`, 시그니처 `(checkedItems: ExemptionCheckedItem[], grossEstateValue: number)`. 변환 불필요(직접 전달).
- ✅ `InheritanceSummaryFormInput`에 `exemptionItems` 미선언 → 타입 1필드 추가.

---

## 4. 수정 설계 — 라벨 세로 레이아웃 (요청 1)

### 4.1 현행 (`InheritanceSidebar.tsx:174`)
```
[라벨 ──────────  금액]   ← flex justify-between, 좁으면 라벨 2~3줄 깨짐
```

### 4.2 변경 — 세로 배치
```
라벨 (한 줄)
  금액
```
`Row`의 컨테이너를 `flex items-baseline justify-between` → **`flex flex-col`**(세로). 라벨 `<p>`는 전체 폭 사용(`whitespace-nowrap`로 한 줄 강제, 넘치면 가로 스크롤보다 폭이 충분하므로 대부분 한 줄), 금액 `<span>`은 그 아래 행에 `text-right` 또는 좌측 정렬. sub 텍스트는 라벨 바로 아래 유지.

- 금액은 기존 `font-mono tabular-nums whitespace-nowrap` 유지(`amount-column-align` 정책).
- highlight(② 과세가액) 행도 동일 세로 패턴, tone 배경 유지.

---

## 5. 범위 — 엔진 무변경 (예외 §3.3)

| 파일 | 변경 |
|---|---|
| `lib/stores/inheritance-summary.ts` | `InheritanceSummaryFormInput`에 `exemptionItems?` 타입 + 과세가액 추정에 `exemptEstimate` 차감 + 비과세 행 데이터 |
| `components/calc/inheritance/InheritanceSidebar.tsx` | `Row` 세로 레이아웃 + 비과세 행 렌더 |

**엔진 완전 무변경**(실측: `result.exemptAmount` echo 이미 존재). 사이드바 추정이 엔진값에 수렴하도록 정합만 맞춤.

---

## 6. 케이스 매트릭스

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 비과세 미입력 | 과세가액 = 기존과 동일(exemptEstimate=0) |
| 2 | 공익법인 출연 1억 입력(입력 중) | 사이드바 과세가액 1억 차감 표시, "− 비과세·불산입 1억" 행 |
| 3 | 계산 후(result 존재) | `result.taxableEstateValue` 사용 — 사이드바=결과 일치 |
| 4 | 금양임야 면적 한도 초과 | `evaluateExemptions` 한도 로직 그대로(UI 재구현 0) → 한도내 금액만 차감 |
| 5 | 라벨 긴 항목("② 상속세 과세가액") | 한 줄 라벨 + 아래 금액, 줄바꿈 없음 |

---

## 7. 완료 정의

- [ ] 사이드바 추정 과세가액 = 엔진 `taxableEstateValue`와 동일 케이스 1건 자기일관 anchor(비과세 입력 → 추정 == 엔진 결과)
- [ ] `evaluateExemptions` import 재사용(UI 자체 비과세 산식 0)
- [ ] 라벨 세로 레이아웃 — 줄바꿈 없음(브라우저/E2E 확인)
- [ ] `npx tsc --noEmit` 0 / inheritance vitest 통과
- [ ] inheritance-summary 단위 테스트: 비과세 차감 추정 케이스 추가
- [ ] E2E: Step2 비과세 입력 → 사이드바 과세가액 차감 반영 / 라벨 1줄

---

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| `evaluateExemptions` 추정(grossEstate=totalEstate)이 엔진 정밀값과 미세 차이(공익법인 비율 등) | 추정은 입력 중 미리보기 용도. 계산 후 `result.taxableEstateValue`로 정정. 미세차 허용, 단 비과세 0/전액 등 명확 케이스는 일치 |
| `exemptionItems`→`exemptions` 변환 중복 정의 | 기존 API 변환 함수 재사용(신규 정의 금지) |
| result에 exemptAmount echo 없음 | echo 1필드 추가(산식 무변경) 또는 추정만 사용 — Do 실측 후 결정 |
| 세로 레이아웃으로 사이드바 세로 길이 증가 | 항목 간 간격 축소(space-y) 조정 |

---

## 9. 작업 순서

1. `evaluateExemptions` export·`exemptionItems`→`exemptions` 변환·result `exemptAmount` echo 유무 실측(§3.3)
2. `inheritance-summary.ts` 추정 산식에 `exemptEstimate` 차감 + 비과세 행 데이터 (single-source)
3. `InheritanceSidebar.tsx` `Row` 세로 레이아웃 + 비과세 행
4. 자기일관 anchor(비과세 입력 추정==엔진) + 단위 테스트
5. tsc + vitest + E2E
