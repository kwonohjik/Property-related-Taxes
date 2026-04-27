# "건물만 본인 소유" 케이스 세액 합산 계산 버그 수정

## Context

사용자가 "토지와 건물의 소유자가 다른가요?" → **건물만 본인 소유** 케이스로 양도세를 계산했을 때,
건물 양도차익(3,683,374원)만으로 세액을 산출해야 하는데
토지 + 건물 합산 양도차익(893,110,446원)으로 계산되어 총 납부세액이 248,736,918원으로 과다 산출되는 버그.

### 근본 원인 (확인 완료)

`app/api/calc/transfer/route.ts`의 `engineInput` 구성 블록(87~260줄)에서
**`selfOwns` 필드가 빠져 있다**.

```typescript
// route.ts:207-219 — 토지/건물 분리 섹션
landAcquisitionDate: data.landAcquisitionDate ? new Date(...) : undefined,
landSplitMode: data.landSplitMode,
landTransferPrice: data.landTransferPrice,
// ... 다른 분리 필드는 모두 있음
// selfOwns: 누락!  ← 버그
```

결과: `engineInput.selfOwns = undefined`
→ `transfer-tax.ts:379` `const selfOwns = effectiveInput.selfOwns ?? "both"` → `"both"`
→ `ownerRawGain = rawGain = 합산 양도차익` (건물만 선택 안 됨)
→ 이후 LTHD·기본공제·세율 계산 모두 합산 기준으로 처리

데이터 경로:
- `lib/calc/transfer-tax-api.ts:270`: `selfOwns: primary.selfOwns !== "both" ? primary.selfOwns : undefined` → API body에 포함 ✓
- `lib/api/transfer-tax-schema.ts:123`: `selfOwns: z.enum([...]).optional()` → Zod 파싱 ✓
- `app/api/calc/transfer/route.ts:87-260`: `engineInput` 구성 — **`selfOwns` 누락** ← **버그 위치**
- `lib/tax-engine/transfer-tax.ts:379-382`: `selfOwns ?? "both"` → 항상 "both"로 처리

---

## 수정 내용

### 1. `app/api/calc/transfer/route.ts` — `selfOwns` 한 줄 추가 (1줄)

**위치**: 라인 219 (`acquisitionArea: data.acquisitionArea,`) 바로 다음, `pre1990Land` 블록 이전.

```typescript
// Before
    acquisitionArea: data.acquisitionArea,
    // 1990.8.30. 이전 취득 토지 기준시가 환산 (선택)
    pre1990Land: data.pre1990Land ? ...

// After
    acquisitionArea: data.acquisitionArea,
    selfOwns: data.selfOwns,  // ← 추가 (소령 §166⑥, §168②)
    // 1990.8.30. 이전 취득 토지 기준시가 환산 (선택)
    pre1990Land: data.pre1990Land ? ...
```

이것만으로 전체 버그가 수정됩니다.

---

## 변경 파일

| 파일 | 변경 | 줄 수 |
|---|---|---|
| `app/api/calc/transfer/route.ts` | `engineInput`에 `selfOwns: data.selfOwns` 1줄 추가 | +1 |
| `__tests__/tax-engine/transfer-tax/owner-split-case12.test.ts` | 기존 테스트 파일 확인 후 2020년 케이스 회귀 테스트 추가 | +~20 |

---

## 수정 후 기대 동작 (building_only 케이스)

| 단계 | 수정 전 (버그) | 수정 후 (정상) |
|---|---|---|
| `selfOwns` | `undefined` → `"both"` | `"building_only"` |
| `ownerRawGain` | 893,110,446 (합산) | **3,683,374** (건물만) |
| `transferGain` | 893,110,446 | **3,683,374** |
| `taxableGain` | 893,110,446 | **3,683,374** |
| `longTermHoldingDeduction` | 267,933,133 (합산 30%) | **1,105,012** (건물 30%) |
| `양도소득금액` | 625,177,313 | **2,578,362** |
| `과세표준` | 622,677,313 | **78,362** |
| `calculatedTax` | 226,124,471 | **4,701** (78,362 × 6%) |
| `totalTax` | 248,736,918 | **5,171** (지방소득세 포함) |

---

## 기존 테스트 확인

`__tests__/tax-engine/transfer-tax/owner-split-case12.test.ts`가 이미 존재함.
이 파일에 `selfOwns="building_only"` 케이스가 있는지 확인 후:
- 있으면: 해당 케이스에 위 수정 후 기대값을 anchor 검증 추가
- 없으면: 신규 `it()` 추가

---

## 검증

1. `npx vitest run __tests__/tax-engine/transfer-tax/owner-split-case12.test.ts` — 기존 테스트 통과 유지
2. `npm test` — 전체 회귀 검증
3. 브라우저에서 사용자 케이스 재현:
   - 양도일 2020-02-16, 양도가 15억, 건물만 본인 소유, PHD 모드
   - 결과 화면에서 `총 납부세액 ≈ 5,171원` 확인
   - 토지/건물 분리 테이블에서 토지 행이 "타인 소유"로 회색 처리되고 LTHD=0 확인
