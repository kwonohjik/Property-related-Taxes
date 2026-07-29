# 수정계획서 — 마법사 폼 새로고침 시 자산 데이터 유실 (calc-wizard persist `merge()`)

> 상태: 계획(자가검토 1회 반영) · 심각도: **High(데이터 유실)** · 범위: `origin/master` 기존 버그(양도세 감사와 무관, 발견 경로만 감사 E2E)
> 최초 확인: 2026-07-14 · 확정 근거: 코드 3단 추적 + **격리 probe 경험적 재현**(아래 §2) + E2E 재현

---

## 1. 문제 요약

양도세 계산기 마법사에서 자산(종류·면적·양도가액·취득가액 등)을 입력한 뒤 **브라우저 새로고침(F5)만 해도 입력한 자산이 전부 소실**되고 빈 "주택" 자산 1개로 리셋된다. `contractTotalPrice`(합계 양도가액)도 `""`로 리셋된다.

- sessionStorage의 raw JSON은 **정확히 보존**되어 있음(저장은 정상). 순수 rehydration `merge()` 로직 결함.
- 완료된 계산은 IndexedDB 이력에 별도 저장되어 무사 → 영향 범위는 **진행 중(미완료) 마법사 폼**.

## 2. 재현 절차

1. `/calc/transfer-tax` 진입 → 자산 종류/면적/양도가액/취득가액 입력.
2. F5(새로고침).
3. 결과: `assets`가 빈 주택 자산 1개로, 금액 필드가 빈칸으로 리셋됨. (sessionStorage `transfer-tax-wizard` 키의 값 자체는 원본 유지.)

**격리 probe 실측(2026-07-14, 실행 후 삭제)** — 자산 2개(상가 `fixedAcqPrice=300,000,000` + 토지 `200,000,000`)·`contractTotalPrice=1,000,000,000`인 정상 신 스키마 formData를 현행 판별에 넣은 결과:

```
현행 판별 → LEGACY(버그)              // 트리거 키(acquisitionMethod 등) 존재로 오분류
migrateLegacyForm 후 assets 수: 1     // 2 → 1
  assets[0].assetKind: housing         // 상가 → 빈 주택
  fixedAcqPrice: ""                     // 300,000,000 → 소실
  contractTotalPrice: ""               // 1,000,000,000 → 소실
```

동일 probe에서 제안 판별(`!Array.isArray(assets)`)은 신 스키마→정상, 구 스키마(`{propertyType, acquisitionPrice}`)→legacy로 정확 분류함을 확인. E2E에서도 재현(감사 E2E 작업 중, `defaultFormData` 스프레드 시드 시 유실 / 트리거 키 제외 시드에서만 통과).

## 3. 근본 원인 — 3단 체인 (모두 코드 확인)

**① 레거시 판별이 항상 참** — `lib/stores/calc-wizard-store.ts:380-392`

```ts
if (
  legacyForm &&
  ( "propertyType" in legacyForm || "companionAssets" in legacyForm
    || "propertyAddressRoad" in legacyForm || "reductionType" in legacyForm
    || "parcelMode" in legacyForm
    || "acquisitionMethod" in legacyForm   // ← 아래 4키가 문제
    || "appraisalValue" in legacyForm
    || "isSelfBuilt" in legacyForm
    || "pre1990Enabled" in legacyForm )
) {
  formData = migrateLegacyForm(legacyForm, defaultFormData);   // 레거시 분기
} else {
  formData = { ...defaultFormData, ...(ps.formData ?? {}),
    assets: (ps.formData?.assets ?? [makeDefaultAsset(1)]).map(migrateAsset) };  // 정상 분기
}
```

**② 문제의 4키가 `defaultFormData`에 최상위로 항상 존재** — `store.ts:217·218·219·223`

```ts
const defaultFormData: TransferFormData = {
  assets: [makeDefaultAsset(1)],
  ...
  acquisitionMethod: "actual",   // 217
  appraisalValue: "",            // 218
  isSelfBuilt: false,            // 219
  ...
  pre1990Enabled: false,         // 223
  ...
};
```

`state.formData`는 `{...defaultFormData, ...사용자편집}`이므로 이 4키를 **항상 보유** → 판별 조건이 **모든 정상 formData에 대해 참** → 언제나 `migrateLegacyForm` 분기로 진입.
(반면 `persist`에 `version`/`migrate` 없음 → `merge()`는 매 rehydration 무조건 실행됨을 확인.)

**③ `migrateLegacyForm`이 신 스키마 `assets`를 폐기** — `lib/stores/calc-wizard-migration.ts:288`

```ts
const merged: TransferFormData = {
  ...defaultFormData,
  ...(rest as Partial<TransferFormData>),   // rest에 사용자 legacy.assets 포함
  contractTotalPrice: String(transferPrice ?? ""),  // 신 스키마엔 transferPrice 없음 → ""
  assets: [primaryAsset, ...companions],    // ← rest.assets를 override, 폐기
};
```

`primaryAsset`은 `makeDefaultAsset(1)` + **구 폼-전역 필드**(`legacy.propertyType`, `legacy.acquisitionPrice` …)로 구성된다. 신 스키마 formData엔 이 폼-전역 필드가 없어 전부 기본값 → **빈 주택 자산**. `companions`도 `legacy.companionAssets`(신 스키마에 없음)에서 오므로 `[]`. 사용자의 실제 `assets` 배열은 288행에서 덮여 사라진다.

## 4. 수정안 (외과적)

`merge()`의 레거시 판별을 **신 스키마 불변식**으로 교체한다: **신 스키마는 항상 `assets` 배열을 가지며, 구 스키마는 없다.**

`store.ts:380-393`의 OR 조건 블록을 다음으로 교체:

```ts
if (legacyForm && !Array.isArray(legacyForm.assets)) {
  formData = migrateLegacyForm(legacyForm, defaultFormData);
} else {
  formData = {
    ...defaultFormData,
    ...(ps.formData ?? {}),
    assets: ((ps.formData as TransferFormData | undefined)?.assets ?? [makeDefaultAsset(1)]).map(migrateAsset),
  };
}
```

- 신 스키마(assets 배열 보유) → **정상 분기**. 이 분기는 이미 `assets`를 보존하고 각 자산에 `migrateAsset`(per-asset 필드 마이그레이션)을 적용하므로 추가 변경 불필요.
- 구 스키마(assets 없음) → `migrateLegacyForm` 그대로 호출(동작 불변).
- `merge` 반환부(`store.ts:404`)·`pendingMigration`·`currentStep:0` 로직은 **무변경**.

### ⚠️ 재검토 발견 — else 분기는 현재 "미실행 경로"

현행 if 조건이 **populated formData에 대해 항상 참**이므로, else 분기의 assets 보존 로직(`ps.formData?.assets ?? …`)과 그 안의 `migrateAsset(persisted 사용자 자산)`은 **실데이터로 한 번도 실행된 적이 없다**(cold start의 빈 데이터에서만 우연히 실행). 본 수정은 실제 사용자 자산을 이 **미검증 경로**로 처음 흘려보낸다.

→ 함의: (1) 회귀 테스트는 자산 **개수뿐 아니라 각 필드 값**(assetKind·금액·주소 등)까지 검증할 것. (2) `migrateAsset`이 구 버전 persisted 자산(신규 자산-필드 결여)에 대해 안전 초기화하는지 별도 확인(그것이 `migrateAsset`의 본래 역할이나, 실경로 첫 실행이므로 realistic 자산으로 테스트). (3) 이 위험이 크다고 판단되면 대안: else 분기를 유지하되 그 안의 assets 보존식이 이미 정확함을 테스트로 먼저 고정한 뒤 판별을 교체.

### 대안 비교

| 안 | 내용 | 판정 |
|---|---|---|
| **A(채택)** | `!Array.isArray(assets)` 단일 불변식 | 견고. 판별 키 목록에 무관, 신 스키마 필드 추가에도 안전 |
| B | 문제의 4키만 OR 조건에서 제거 | A와 현 시점 동치이나, 향후 `defaultFormData`에 판별 키가 또 추가되면 재발 여지 |
| C | `migrateLegacyForm`에서 `legacy.assets` 우선 보존 | 판별이 계속 오작동하므로 근본 해결 아님. 미채택 |

## 5. 회귀 위험 및 검증 (실측)

- **`__tests__/lib/transfer-step-migration.test.ts`**: `migrateLegacyForm`을 **직접** 호출(merge 우회). 본 수정은 merge의 판별만 변경하고 `migrateLegacyForm` 자체는 불변 → **영향 없음**(확인함). 테스트 legacy 객체는 `assets`가 없어 신 판별에서도 여전히 레거시로 분류됨.
- **`__tests__/lib/stores/wizard-step-reset-on-reentry.test.ts`**: currentStep 리셋 검증 — merge 반환부(404행) 무변경이라 영향 없음(재실행으로 확인 예정).
- 전체 세금엔진 스위트 + 관련 store 테스트 green 유지 확인 필요.

## 6. 테스트 계획 (신규)

`__tests__/lib/stores/calc-wizard-persist-merge.test.ts` 신규:

1. **[핵심] 신 스키마 rehydration이 assets 보존** — `assets`가 2개(서로 다른 assetKind·금액)인 formData(+ `acquisitionMethod` 등 4키 포함)를 persisted로 넣고 merge 호출 → `formData.assets.length === 2` **및 각 자산의 assetKind·`fixedAcquisitionPrice`·주소 등 실제 값 보존**, `contractTotalPrice` 보존. (probe에서 현행은 1개·빈값으로 확인됨 — 이 테스트가 수정 전 실패해야 정당한 회귀 가드.)
2. **[회귀 방어] 트리거 4키 존재해도 유실 없음** — 위와 동일 formData에서 4키 존재를 명시적으로 단정한 뒤 assets 보존 확인.
3. **[레거시 호환] 구 스키마 마이그레이션 유지** — `{ propertyType:"housing", acquisitionPrice:"300000000", ... }`(assets 없음) persisted → `migrateLegacyForm` 경로로 assets[0] 생성·값 이전 확인.
4. **[빈 상태] `assets` 없는 빈 객체** → 기본 자산 1개.
5. **[엣지] `assets: []`(빈 배열)** — `!Array.isArray([])`는 false → 정상 분기. 현행 else식은 `[] ?? …`가 `[]`를 유지하므로 빈 배열 그대로 반환됨. 앱이 이 상태를 만들지 않으나(항상 ≥1 자산), 방어적으로 빈 배열 시 `makeDefaultAsset(1)` 주입할지 결정하고 테스트로 고정. (판단: 현행 else 동작과 동일하게 두면 무회귀 — 별도 주입은 범위 밖으로 명시 가능.)
6. **[미실행 경로 검증] `migrateAsset` 실경로** — 구 버전 필드가 결여된 persisted 자산(예 신규 자산-필드 없는 최소 자산)을 넣어 `migrateAsset`가 안전 초기화하고 사용자 입력 필드는 보존함을 확인(§4 재검토 발견 대응).

`merge`가 클로저 내부 익명 함수라 직접 export가 어려우면: (a) merge 로직을 순수 헬퍼 `mergePersistedWizard(persisted, current)`로 추출해 export 후 persist에서 사용(단일 소스), 또는 (b) store rehydration을 시뮬레이션하는 통합 테스트로 검증. **(a) 권장**(테스트 용이·재사용).

## 7. 성공 기준 (검증 가능 목표)

1. 신규 테스트 1·2가 수정 **전** 실패(버그 재현) → 수정 **후** 통과.
2. 신규 테스트 3·4(레거시·빈 상태) 통과.
3. `transfer-step-migration.test.ts`·`wizard-step-reset-on-reentry.test.ts` 계속 통과.
4. `npx tsc --noEmit` 0건 · 전체 세금엔진 스위트 green.
5. (선택) E2E: 자산 입력 → `page.reload()` → assets 보존 확인 스펙 1개.

## 8. 범위 밖 (명시)

- `migrateLegacyForm`의 필드 매핑 로직은 손대지 않음(정상 동작).
- `defaultFormData`의 vestigial 최상위 필드(`acquisitionMethod` 등, 현재 자산-수준으로 이전됨) 정리는 별건 — 이번 수정은 판별만 교체.
- 다른 세목 마법사 store에 동일 패턴 존재 여부는 후속 점검(이 계획은 transfer 한정).

## 9. 브랜치 전략 (결정 필요)

- 옵션 1: `review/transfer-tax`에 함께 커밋(현 감사 브랜치).
- 옵션 2: `fix/wizard-persist-dataloss` 별도 브랜치(baseline 버그이므로 감사와 분리).
- **권장: 옵션 2** — 양도세 감사와 성격이 다르고(persist 인프라), 독립 리뷰·머지 용이.
