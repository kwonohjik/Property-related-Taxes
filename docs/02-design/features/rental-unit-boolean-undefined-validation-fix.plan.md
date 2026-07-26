# 오류 수정 계획서 — §155⑳ 임대주택 유닛 boolean `undefined` → Zod 400

**작성일**: 2026-07-26
**세목**: 양도소득세 (§155⑳ 장기임대주택 거주주택 비과세 특례)
**증상**: 계산 실행 시 API 400 — 임대주택 유닛의 6개 boolean 필드가 `undefined`로 Zod 검증 거부.

> ✅ **구현 완료 (2026-07-26)**: A안 적용. `toRentalHousingExceptionApi` 9개 boolean `?? false`. anchor 2건(변환 후 false·Zod 통과) + 임대 회귀 178건 통과, tsc 0건.

---

## 1. 증상 (재현 관찰)

`가산세` 단계에서 `세금 계산하기` 클릭 시 `입력값이 올바르지 않습니다` + 콘솔 `[transfer-tax API] fieldErrors`:

```
rentalHousingException.rentalUnits.0.isExcluded918Rule:        Invalid input: expected boolean, received undefined
rentalHousingException.rentalUnits.0.hasContractDepositProof:  Invalid input: expected boolean, received undefined
rentalHousingException.rentalUnits.0.isExcludedShortToLongChange: Invalid input: expected boolean, received undefined
rentalHousingException.rentalUnits.0.isNationalSizeHousing:    Invalid input: expected boolean, received undefined
rentalHousingException.rentalUnits.0.hasMinimum2Units:         Invalid input: expected boolean, received undefined
rentalHousingException.rentalUnits.0.hasMinimum5UnitsInCity:   Invalid input: expected boolean, received undefined
```

- 폼은 **정상 입력·클라이언트 validate 통과**(UI에서 차단 없음) → API/Zod에서만 400.
- Call stack: `handleSubmit`(TransferTaxCalculator.tsx:213) → `callTransferTaxAPI`(transfer-tax-api.ts:712) → `logFieldErrorsResponse`.

---

## 2. 근본 원인 (실제 코드 검증)

### 2-a. Zod 스키마는 9개 boolean을 required로 요구

`lib/api/transfer-tax-schema.ts:64` `rentalUnitSchema`:

```
isApartment: z.boolean(),                 // 69
isExcluded918Rule: z.boolean(),           // 71  ← 에러
hasContractDepositProof: z.boolean(),     // 72  ← 에러
isExcludedShortToLongChange: z.boolean(), // 73  ← 에러
isNationalSizeHousing: z.boolean(),       // 76  ← 에러
hasMinimum2Units: z.boolean(),            // 79  ← 에러
hasMinimum5UnitsInCity: z.boolean(),      // 80  ← 에러
rentalAutoTermination: z.boolean(),       // 83
requirementsConfirmed: z.boolean(),       // 84
```

`.optional()`·`.default()` 없음 → `undefined` 도달 시 반드시 400.

### 2-b. API 변환이 boolean을 fallback 없이 raw 전달

`lib/calc/transfer-tax-api-helpers.ts:176-186` `toRentalHousingExceptionApi`:

```ts
isExcluded918Rule: u.isExcluded918Rule,            // undefined면 그대로 undefined
hasContractDepositProof: u.hasContractDepositProof,
isExcludedShortToLongChange: u.isExcludedShortToLongChange,
isNationalSizeHousing: u.isNationalSizeHousing,
hasMinimum2Units: u.hasMinimum2Units,
hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity,
```

→ `u.X`가 `undefined`이면 **그대로 undefined 전송**. 이것이 방어 실패의 핵심 지점(⑬ body spread).

### 2-c. 유닛이 `undefined`인 이유 — stale sessionStorage / migrateAsset 우회 경로

- **factory**(`calc-wizard-asset-factory.ts:13-44` `makeDefaultRentalUnit`)는 9개 boolean 전부 `false` 기본값 보유 → **신규 추가 유닛은 안전**.
- **migrateAsset**(`calc-wizard-asset-migrate.ts:549-559`)은 rehydration 시 9개 boolean을 `undefined`면 `false`로 backfill → **정상 rehydration 유닛도 안전**.
- 그럼에도 `undefined`가 도달 = 아래 우회 경로에서 온 유닛:
  - **이력(IndexedDB) 로드 → 마법사 주입** 시 `migrateAsset` 미경유(이력 저장 당시 필드 부재).
  - `migrateAsset`이 legacy/current 분기(store `merge` `calc-wizard-store.ts:399-420`)에서 특정 유닛에 미도달하는 경우(memory `Companion Assets May Not Receive migrateAsset`).
- **동일 반복 패턴**: PR #787·#789(regionCode) — `feedback_new_asset_field_stale_sessionstorage_guard`. "TS non-optional 타입은 stale sessionStorage에 런타임 보호 0 — access-point nullish guard만이 유일한 방어망."

### 2-d. validate는 이미 undefined를 falsy로 관용 처리 (⑧ 정합 확인)

`lib/calc/transfer-tax-validate-rental-exception.ts:71,74`: `if (!u.isNationalSizeHousing)` / `if (!u.hasMinimum2Units)` — `undefined`를 `false`와 동일 취급.
→ **API에 `?? false` 추가해도 validate↔API 정합 유지**(둘 다 undefined=false). UI 통과↔validate 차단 모순 없음.

---

## 3. 수정안 (트레이드오프)

| 옵션 | 내용 | 장점 | 단점 | 채택 |
|---|---|---|---|---|
| **A (권장)** | API 변환 `toRentalHousingExceptionApi`의 9개 boolean에 `?? false` | 근원(어느 경로든 undefined 차단)·최소 blast·mirror 패턴 ⑬·기존 memory 정합 | — | ✅ |
| B (선택·심층방어) | Zod `rentalUnitSchema` 9개 boolean `.default(false)` | 서버측 2차 방어망 | API 계약이 "누락 허용"으로 완화 — 진짜 버그 은폐 가능 | 보류 |
| C | persist/migrateAsset을 모든 유닛에 강제 적용 | 스토어 근원 정리 | blast 큼·이력 로드 경로 미커버 | ✗ |
| D | factory + access guard만 | — | stale 유닛이 factory 우회 → 불충분 | ✗ |

**결론**: **A 단독**. 법적으로도 이 9개는 "요건 미충족/미해당" 의미라 `false`가 안전 기본값(납세자 불리 적용 아님 — 해당 없으면 요건 게이트가 별도 validate에서 판정). B는 이번 범위 제외(원하면 후속 심층방어).

---

## 4. 구현 (단일 파일)

**`lib/calc/transfer-tax-api-helpers.ts`** — `toRentalHousingExceptionApi` `rentalUnits.map` 내부 9개 boolean:

```ts
isApartment: u.isApartment ?? false,
isExcluded918Rule: u.isExcluded918Rule ?? false,
hasContractDepositProof: u.hasContractDepositProof ?? false,
isExcludedShortToLongChange: u.isExcludedShortToLongChange ?? false,
isNationalSizeHousing: u.isNationalSizeHousing ?? false,
hasMinimum2Units: u.hasMinimum2Units ?? false,
hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity ?? false,
rentalAutoTermination: u.rentalAutoTermination ?? false,
requirementsConfirmed: u.requirementsConfirmed ?? false,
```

- 에러난 6개 + 잠재 위험 3개(isApartment·rentalAutoTermination·requirementsConfirmed) 전부 적용(같은 stale 위험).
- `multi-transfer-tax-api.ts:83`도 동일 `toRentalHousingExceptionApi` 재사용 → **다건 경로 자동 커버**(별도 수정 불필요, 확인만).

### 병행 방어(선택) — migrate 가드 보강
`migrateRentalPeriodFields`(`calc-wizard-asset-rental-period.ts`)에 9개 boolean `if (typeof u.X !== "boolean") u.X = false` 추가 시, 이 함수를 타는 경로는 이중 방어. 단 A가 최종 관문이므로 필수는 아님 — **A 우선, 여유 시 추가**.

---

## 5. 성공 기준 (verify)

1. **anchor 테스트**(`__tests__/lib/calc/` 또는 기존 rental api 테스트): 9개 boolean이 모두 `undefined`인 stale 유닛 → `toRentalHousingExceptionApi` 결과에서 전부 `false`. → verify: 단언 통과.
2. **Zod 통과 회귀**: 위 payload를 `rentalUnitSchema.parse`에 통과 → 400 미발생. → verify: `expect(() => schema.parse(...)).not.toThrow()`.
3. `npx tsc --noEmit` 0건.
4. 기존 rental 회귀(`__tests__/tax-engine/transfer-tax/rental-*`, `__tests__/calc/rental-*`) 전건 통과.
5. **브라우저 재현**: 문제 유닛으로 계산 → 400 소멸·결과 정상 산출(미수행 시 명시).

---

## 6. 동기화 지점 점검 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ① 폼 타입 | 이미 boolean(비-optional) | 변경 없음 |
| ② initial | factory 9개 `false` 보유 | 변경 없음 |
| ③ normalize | migrateAsset backfill 존재(우회 경로가 문제) | (선택) 가드 보강 |
| ⑧ validate | undefined=falsy 관용 | 정합 유지(변경 없음) |
| ⑬ API body spread | **`?? false` 추가** | **수정 대상** |
| ⑨⑩⑫ Zod | required boolean 유지 | 변경 없음(A안) |

---

## 7. 관련 메모리
- `feedback_new_asset_field_stale_sessionstorage_guard` ★★★ (동일 패턴 3회차)
- `mirror-pattern` ★★★ (display/API/validate 3중 — 여기선 API fallback이 관문)
- `feedback_api_zod_schema_sync` ★★★ (⑬ 침묵 strip)
- `feedback_no_unfavorable_application_without_legal_basis` (false=요건 미해당, 불리 적용 아님)
