# 마법사 재진입 시 첫 스텝부터 시작 (currentStep persist 제거) 계획서

> 작성일: 2026-06-29 · 상태: Plan (구현 전)
> 한 줄 요약: 마법사 store가 **현재 스텝을 sessionStorage에 저장·복원**하여, 홈에서 재진입해도 첫 스텝이 아닌 이전 스텝(예: 양도세 "감면·공제")이 열리는 문제를 제거한다. 입력값(formData)은 세션 내 유지하되 **스텝은 항상 0부터** 시작한다.

---

## 1. 배경 — 사용자 보고 문제

홈 화면(`app/page.tsx`)에서 "양도소득세" 카드(`href: "/calc/transfer-tax"`, `app/page.tsx:66`)를 클릭하면, 의도한 첫 단계("자산 목록")가 아니라 **3번째 단계("감면·공제")가 바로 열린다**.

재현 경로(같은 브라우저 탭):
1. 양도세 마법사를 진행하다 뒷 스텝(예: "가산세")까지 이동
2. 홈으로 이동
3. 다시 "양도소득세" 카드 클릭 → `/calc/transfer-tax` 재진입
4. **첫 스텝이 아닌 이전 스텝부터 열림**

---

## 2. 원인 (코드 실측)

### 2-1. `currentStep`을 sessionStorage에 persist

`lib/stores/calc-wizard-store.ts` (양도세):

- `:316-320` `partialize`에 `currentStep: state.currentStep` 포함 → 스텝이 sessionStorage `transfer-tax-wizard`에 저장됨.
- `:349-353` 재진입 시 `merge`가 저장된 스텝을 `STEP_MIGRATION`(`{0:0,1:0,2:1,3:2,4:3,5:4}`)으로 변환해 `currentStep`으로 복원. 이전에 구3(가산세)까지 갔다면 → 신2 = "감면·공제"(`STEPS_SINGLE[2]`, `TransferTaxCalculator.tsx:35`).

### 2-2. 기존 복구 로직은 범위 초과만 처리

`app/calc/transfer-tax/TransferTaxCalculator.tsx:128-132`:
```ts
useEffect(() => {
  if (currentStep >= totalSteps && !result) {
    setStep(0);
  }
}, [currentStep, totalSteps, result, setStep]);
```
`currentStep >= totalSteps`(범위 **초과**)만 0으로 되돌림. step 2는 범위 내라 통과 → 복원된 스텝이 그대로 노출.

### 2-3. 홈 카드는 단순 Link — 리셋 신호 없음

`app/page.tsx`의 카드는 `<Link href="/calc/transfer-tax">`. 새 계산 시작을 알리는 query param·리셋 호출이 없어, store는 sessionStorage 잔존 스텝만으로 초기 화면을 결정한다.

### 2-5. ⚠️ zustand v5 persist 동작 — `partialize`는 저장 시점만 적용 (핵심)

`zustand ^5.0.12`. persist 재하이드레이션 흐름:
- **저장(setItem)**: `partialize(state)` 결과만 직렬화하여 sessionStorage에 기록.
- **복원(getItem → merge)**: `getItem`은 sessionStorage에 저장된 값을 **그대로** 반환(partialize 미적용). `merge(persisted, current)`가 최종 상태 결정. **커스텀 merge가 없으면 기본 merge = `{ ...current, ...persisted }`(shallow)**.

**귀결**: `partialize`에서 `currentStep`을 제거해도, **이미 sessionStorage에 저장돼 있던 `currentStep:N`(구 코드가 기록한 값)은 `getItem`이 그대로 반환**한다. 따라서:
- **양도세**: 커스텀 merge(`:321-354`)가 `currentStep: 0` 명시 → 잔존값 무시, 안전.
- **주식양도세·종부세**: 커스텀 merge **없음** → 기본 merge가 잔존 `currentStep:N`을 복원 → **`partialize` 제거만으로는 버그 잔존**. ⇒ `onRehydrateStorage`에서 `state.currentStep = 0` 강제 필요(§5-2·5-3).

(sessionStorage는 탭 단위 — 새 탭은 비어 있어 무관하나, 같은 탭에서 작업하던 사용자·anchor 테스트의 명시적 주입 시나리오를 위해 강제 리셋이 필수.)

### 2-4. 동일 버그 — 전수 조사 결과

`grep -rln "partialize" lib/stores/` 4개 중 `currentStep`을 persist하는 store:

| Store | 세목 | persist 위치 | reset 액션 존재 |
|---|---|---|---|
| `calc-wizard-store.ts` | 양도소득세 | `:317` | `:303` (currentStep:0) |
| `calc-wizard-stock-store.ts` | 주식 양도세 | `:734` | `:722` (currentStep:0) |
| `comprehensive-wizard-store.ts` | 종합부동산세 | `:428` | `:413` (currentStep:0) |
| `multi-transfer-tax-store.ts` | 양도세(다건) | 없음(`form`만, `:156-159`) | — (영향 없음) |

→ 양도세·주식양도세·종부세 **3곳이 동일 패턴**. 상속·증여·취득·재산세 store는 `currentStep`을 persist하지 않아(또는 persist 미사용) 항상 첫 스텝부터 시작 → 정상. **3곳만 예외적으로 스텝을 복원**하는 것이 일관성 결함.

---

## 3. 사용자 결정 (2026-06-29 확정)

| # | 질문 | 결정 |
|---|---|---|
| D1 | 재진입 시 스텝 동작 | **항상 첫 스텝부터** — `currentStep`을 persist하지 않음. 홈 재진입·새로고침 모두 step 0. `formData`는 세션 내 유지. |

---

## 4. 설계

### 4-1. 핵심 — `currentStep`을 persist 대상에서 제거

`formData`(입력값)는 sessionStorage에 유지하여 세션 내 작업 연속성을 보존하되, **`currentStep`만 제외**한다. 재하이드레이션 시 store 기본값(`currentStep: 0`)이 그대로 적용된다.

### 4-2. 변경 범위 (권장: 3곳 일괄)

사용자 보고는 양도세지만 **동일 버그가 주식양도세·종부세에도 존재**하므로 일관성을 위해 3곳을 함께 수정한다. (양도세만 수정 시 나머지 2곳은 동일 증상 잔존.)

---

## 5. 변경 파일별 작업

### 5-1. `lib/stores/calc-wizard-store.ts` (양도세)

- `:316-320` `partialize`에서 `currentStep` 줄 제거:
  ```ts
  partialize: (state) => ({
    formData: state.formData,
    pendingMigration: state.pendingMigration,
  }),
  ```
- `:349-353` `merge` 내 죽은 코드 정리 — `STEP_MIGRATION`·`persistedStep`·`migratedStep`(`:349-351`) 제거. `currentStep`이 더 이상 persist에 없으므로 복원 대상 아님. return은 스텝을 명시적으로 0 고정:
  ```ts
  return { ...current, ...ps, formData, currentStep: 0 };
  ```
  (`...ps`에 구 sessionStorage의 `currentStep`이 남아 있어도 마지막 `currentStep: 0`이 덮어쓴다 — 잔존값 무시 보장.)
- `formData` 마이그레이션 로직(`:323-347`)은 **그대로 유지** — 입력값 보존이 목적.
- `TransferTaxCalculator.tsx:128-132` 복구 useEffect(`currentStep >= totalSteps` 방어)는 **그대로 유지** — 무해, 범위 초과 방어로 잔존.

### 5-2. `lib/stores/calc-wizard-stock-store.ts` (주식양도세) — partialize 제거 **+ onRehydrate 강제**

- `:733-736` `partialize`에서 `currentStep` 줄 제거 (`formData`만 유지).
- ⚠️ **`onRehydrateStorage`(`:737-742`)에 `state.currentStep = 0` 추가** (커스텀 merge 없음 → §2-5에 따라 partialize 제거만으론 잔존값 복원). 기존 `formData` 정규화는 유지:
  ```ts
  onRehydrateStorage: () => (state) => {
    if (state) {
      state.currentStep = 0;            // 재진입 시 항상 첫 스텝 (잔존값 무시)
      state.formData = normalizeStockFormData(state.formData);
    }
  },
  ```

### 5-3. `lib/stores/comprehensive-wizard-store.ts` (종부세) — partialize 제거 **+ onRehydrate 강제**

- `:427-430` `partialize`에서 `currentStep` 줄 제거 (`formData`만 유지).
- ⚠️ **`onRehydrateStorage`(`:432~`) 콜백 안에서 `state.currentStep = 0` 추가** (커스텀 merge 없음 → 잔존값 복원 방지). 기존 `if (state && state.formData)` 가드와 별개로, `state`만 있으면 스텝 리셋:
  ```ts
  onRehydrateStorage: () => (state) => {
    if (state) state.currentStep = 0;   // 재진입 시 항상 첫 스텝 (잔존값 무시)
    if (state && state.formData) {
      // ... 기존 formData 보정 로직 그대로 ...
    }
  },
  ```

---

## 6. 엣지 케이스 · 미적용 범위

| 케이스 | 처리 | 근거 |
|---|---|---|
| 이력 "수정"으로 진입 (handleResume) | **영향 없음** — `result`가 세팅되어 결과 화면이 표시되는 별도 경로. `result`는 이미 partialize에서 제외됨(양도 `:316-319`엔 result 없음). | 스텝 persist와 무관 |
| 작업 중 새로고침(F5) | step 0으로 시작하되 `formData` 보존 → 입력값 유지, 위치만 첫 스텝. | D1 수용 |
| 양도세(다건) `multi-transfer-tax-store` | 변경 없음 — `currentStep` 미persist(`:156-159`). | 이미 정상 |
| 상속·증여·취득·재산세 | 변경 없음 — `currentStep` 미persist. | 이미 정상 |
| `reset()` 액션 | 변경 없음 — 이미 `currentStep:0` 설정(`calc-wizard-store:303` 등). | 회귀 없음 |

---

## 7. 테스트 anchor

### 7-1. 단위 (vitest) — store 재하이드레이션

> 하네스: sessionStorage에 **구 코드가 기록했을 `currentStep:2`** + formData를 직접 주입(§2-5 잔존값 시나리오) → store rehydrate(`persist.rehydrate()` 또는 모듈 재import) → `currentStep === 0` 단언. formData 필드 보존 확인. 3개 store 각각.
> ⚠️ 이 anchor는 **잔존값 복원 여부를 직접 검증**한다 — partialize만 제거하고 onRehydrate 강제를 빠뜨리면 S2·S3은 **실패**(기본 merge가 2 복원). 즉 §5-2·5-3 보강의 회귀 가드.

| ID | 시나리오 | 기대 |
|---|---|---|
| S1 | 양도세: sessionStorage `{currentStep:2, formData:{...}}` 주입 후 rehydrate | `currentStep===0`, formData 보존 |
| S2 | 주식양도세: 동일(잔존값 2 주입) | `currentStep===0`, formData 보존 — onRehydrate 강제 검증 |
| S3 | 종부세: 동일(잔존값 2 주입) | `currentStep===0`, formData 보존 — onRehydrate 강제 검증 |
| S4 | 양도세 구버전 formData(legacy 마이그레이션 트리거) + `currentStep:3` | 마이그레이션 동작 + `currentStep===0` |

### 7-2. E2E (Playwright) — 사용자 시나리오 재현

| ID | 시나리오 | 기대 |
|---|---|---|
| E1 | `page.addInitScript`로 sessionStorage `transfer-tax-wizard`에 `{state:{currentStep:2, formData:{...}}, version:0}` 주입 → `/calc/transfer-tax` 진입 | **"자산 목록"(step 0) 화면** 노출 (사이드바 첫 스텝 active, "감면 확인" 미노출) |

⚠️ **sessionStorage 직접 주입 방식 채택** — "다음" 클릭으로 step 2까지 가려면 step 0·1의 validation gate를 통과할 유효 입력이 필요해 취약. §2-5 잔존값 시나리오를 그대로 재현하는 주입이 더 견고하고 버그 본질에 직결.
- **포맷 확정**: 세 store 모두 persist `version:` 미설정(`grep "version:" 결과 없음`) → zustand 기본 `version:0`. 저장 래퍼는 `{ state: {...partialize 필드}, version: 0 }`. 주입 시 이 포맷 사용.
- **타이밍**: goto 전에 sessionStorage가 있어야 rehydrate가 잔존값을 읽으므로 `page.addInitScript`(문서 로드 전 실행)로 주입. `reload()` 직전 `page.evaluate` 주입도 가능.

---

## 8. 작업 순서 → 검증

```
1. calc-wizard-store: partialize에서 currentStep 제거 + merge STEP_MIGRATION 정리(currentStep:0 명시) → verify: S1·S4
2. calc-wizard-stock-store: partialize 제거 + onRehydrateStorage에 currentStep=0   → verify: S2
3. comprehensive-wizard-store: partialize 제거 + onRehydrateStorage에 currentStep=0 → verify: S3
4. transfer-regulated-auto.spec.ts 셋업 교체(currentStep 주입 → UI 네비게이션)        → verify: 해당 spec 통과 (§8-1)
5. E2E E1 작성·통과 (sessionStorage currentStep 주입해도 step 0)
6. npx tsc --noEmit 0건 · npx vitest run(신규 store anchor) · 회귀 npm test
```

**완료 게이트**: tsc 0건 · 신규 store anchor(S1~S4) 통과 · E2E E1 통과 · `transfer-regulated-auto.spec.ts` 셋업 교체 후 통과 · 양도세/주식양도세/종부세 마법사 기존 E2E 회귀 통과.

---

## 8-1. ⚠️ 기존 E2E 회귀 영향 (전수 조사 — `grep -rln "currentStep" e2e/`)

이 변경은 **sessionStorage `currentStep` 주입으로 특정 스텝에 진입하던 기존 테스트를 깨뜨린다**. 전수 조사 결과 해당 패턴은 **1개 파일뿐**:

| 파일 | 의존 | 영향 | 대응 |
|---|---|---|---|
| `e2e/transfer-regulated-auto.spec.ts` (`:24-42`) | sessionStorage `currentStep:2` 주입 + `reload()` → merge `STEP_MIGRATION[2]=1`("보유 상황") 진입 | 🔴 **깨짐** — 변경 후 step 0 강제로 "보유 상황" 미노출 | 셋업 대체: formData(assets·양도일)는 그대로 주입하되, reload 후 **UI "다음" 클릭으로 보유 상황까지 네비게이트**(step 0 validation은 주입된 assets로 통과) 또는 `page.evaluate`로 store `setStep(1)` 직접 호출 |
| `e2e/transfer-region-code.spec.ts` (`:79` reload) | reload 후 **formData.assets[0].regionCode**만 검증(sessionStorage 직접 read) | ✅ **영향 없음** — 스텝 위치 무관, formData는 계속 persist(보존) | 변경 불필요 |

→ 작업 순서(§8)에 **`transfer-regulated-auto.spec.ts` 셋업 수정 + 통과 확인**을 추가한다. 이 spec은 §2-1의 버그 메커니즘을 셋업 도구로 차용했으므로, 메커니즘 제거와 함께 셋업도 정공법(UI 네비게이션)으로 교체해야 한다.

## 9. 미해결 / 확인 필요

- **범위**: 양도세만 vs 3곳 일괄. 본 계획은 **3곳 일괄(권장)**. 사용자가 양도세만 원하면 §5-1만 수행(주식·종부세는 동일 증상 잔존).
- **~~5-2/5-3 재하이드레이션 동작~~ (확인 완료)**: zustand v5 기본 merge는 sessionStorage 잔존 `currentStep`을 복원(§2-5). 따라서 partialize 제거 **단독으로는 불충분** — 주식·종부세는 `onRehydrateStorage`에서 `state.currentStep = 0` 강제 필요(§5-2·5-3 반영 완료). 양도세는 커스텀 merge `currentStep:0` 명시로 충분.

## 10. 자가 검토 이력 (2026-06-29)

1차 계획 후 코드 실측 재검토에서 발견·정정:
- 🔴 **오류**: §5-2·5-3이 "partialize 제거만"으로 충분하다고 기술 → zustand v5 동작상 잔존값 복원으로 **불충분**. `onRehydrateStorage` 강제 추가로 정정(§2-5 근거 추가).
- 🟡 **모순 해소**: §7-1 anchor S2·S3(잔존값 주입 후 0 기대)이 수정 전 §5-2·5-3과 모순 → 수정안 보강으로 정합. anchor를 "onRehydrate 강제 회귀 가드"로 역할 명시.
- 🟡 **누락 보완**: `TransferTaxCalculator.tsx:128-132` 복구 useEffect 유지 명시 추가.
- 🟡 **E2E 보강**: E1을 "다음 클릭" → "sessionStorage 직접 주입"으로 변경(validation gate 취약성 회피).
- ✅ **검증 완료**: `STEP_MIGRATION`은 `calc-wizard-store.ts` 내부 전용(`grep` 확인) → 제거 안전. multi-transfer·상속·증여·취득·재산세 store는 `currentStep` 미persist → 영향 없음.

### 2차 검토(수정안 재검토) — 추가 발견·정정

- 🔴 **회귀 누락 발견**: 수정안 자체는 정합하나 **기존 E2E `transfer-regulated-auto.spec.ts`가 제거 대상 메커니즘(currentStep 주입)을 셋업에 사용** → 변경 시 확실히 깨짐. §8-1 회귀 섹션 신설 + §8 작업 4번에 셋업 교체 추가. (`grep -rln "currentStep" e2e/`로 전수 — 해당 1개뿐 확정.)
- ✅ **회귀 무영향 확인**: `transfer-region-code.spec.ts:79` reload는 formData.regionCode만 검증(스텝 무관, formData는 계속 persist) → 변경 불필요.
- ✅ **persist version 확인**: 세 store 모두 `version:` 미설정 → 기본 0. E1 주입 포맷 `{state, version:0}` 확정(§7-2).
- ✅ **메커니즘 일관성 확인**: 양도세는 기존 커스텀 merge에 currentStep:0 명시(formData 마이그레이션이 merge에 있어 자연스러움), 주식·종부세는 merge 없음 → 기존 `onRehydrateStorage`에 리셋 추가. 각 store의 기존 구조를 따르는 surgical 접근(메모리 `feedback` surgical changes).
