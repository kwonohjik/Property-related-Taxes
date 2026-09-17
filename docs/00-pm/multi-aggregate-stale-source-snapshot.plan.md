# 합산에 편입된 자산이 **원본과 끊긴 동결 스냅샷**이다 (수정 계획서)

> 상태: ✅ **Done** — 구현·검증 완료 (PR #1644 · `273c0f3e`, 2026-09-16).
> 🟡 **잔여**: multi record 전체 replace 편입분의 staleness는 **1차 범위 밖**이다(§7 표 3행).
> 세목: 양도소득세 / 연간 합산 과세(`/calc/transfer-tax/multi`)
> 작성일: 2026-09-16 · 기준 커밋: `7eec3b0d` (PR #1643 머지 직후)
> 선행: `loss-offset-same-rate-axis.plan.md` §10 **결함 ②** — 거기서 분리한 별건이다.

---

## 0. 한 줄 요약

이력에서 합산으로 편입한 자산은 `record.inputData`의 **사본**을 들고, 그 사본이 sessionStorage에 persist된다. **원본 record가 바뀐 것을 감지하는 장치가 없고**, 화면에도 아무 표시가 없다. 그래서 단건에서 입력을 고쳐도 합산은 **옛 값으로 계속 계산한다**.

**세액이 바뀐다**: 제보 4자산 실측 **9,902,200원 과대**(§3).

---

## 1. 제보 — 미등기 토글이 켜져 있는데 합산이 못 본다

사용자가 단건 화면에서 「미등기 양도」를 켰는데(제보 이미지 21), 합산 신고서의 해당 자산이 **세율구분 코드 `1-10`(일반세율) · 세율 `6%`**로 계산됐다(이미지 20).

> 🔑 **이 사실은 PR #1643의 결함 ③ 수정 덕에 처음 보였다.** 종전에는 차손 자산의 세율 열이 `-`라 **미등기 적용 여부를 화면에서 판별할 수 없었다**. 이제 코드가 찍히므로 「엔진이 무엇으로 계산했는가」가 드러난다.

---

## 2. 원인 규명 — 두 경로를 갈라서 실측했다

### (가) 다건 편집 round-trip은 **정상이다** (결함 아님)

throwaway E2E로 전 구간을 태웠다 — 합산 화면 「편집 → 보유 상황 → 미등기 ON → 자산 목록으로」:

```
토글           checked: false → true
요청 body      properties[0].isUnregistered: true
엔진 결과      rateGroup: "unregistered"  ·  appliedRate: 0.7
```

⇒ **UI → store → ④ 변환 → ⑫ Zod → ⑭ route → 엔진 배선에는 유실 지점이 없다.** `syncToWizardStore`(`MultiTransferTaxCalculator.tsx:363`)가 `updateFormData(propertyForm)`로 폼 전체를 싣고, `handleSaveAndBack`(`:384`)이 `useCalcWizardStore.getState().formData`를 통째로 되돌려 쓴다. 명시 필드 매핑이 아니라 **전체 객체 왕복**이라 필드가 새지 않는다.

> 이 측정이 없었으면 「토글 배선이 깨졌다」는 오진으로 갔을 것이다. 토글의 쓰기 지점이 **두 개**라 더욱 그렇다 —
> 폼-전역 `SpecialSituationSection.tsx:64`(주 자산)와 자산-수준 `AssetSectionBasic.tsx:201`(컴패니언 전용).
> ④ 변환은 단건·다건 **둘 다** 폼-전역을 읽는다(`transfer-tax-api.ts:431` · `multi-transfer-tax-api.ts:255`) — 짝이 맞다.

### (나) 이력 편입 스냅샷이 **범인이다**

같은 방식으로 재현했다 — 단건 record(미등기 OFF)를 합산에 편입한 **뒤** 원본 record를 미등기 ON으로 갱신하고 재계산:

| | 값 |
|---|---|
| 원본 record | `isUnregistered: true` |
| **합산이 보낸 값** | **`false`** ← 옛 스냅샷 |
| 엔진 결과 | `progressive` |
| **화면의 「원본 변경」 고지** | **0건** |

코드로 확인한 기전:

| 지점 | 사실 |
|---|---|
| `lib/calc/transfer-multi-load-entry.ts:44` | `const form = record.inputData as unknown as TransferFormData;` — **편입 시점의 사본** |
| 동 `:53` | `sourceCalculationId: record.id` — 원본 id는 **들고 있다** |
| `lib/stores/multi-transfer-tax-store.ts:246` | `storage: createJSONStorage(() => sessionStorage)` — 사본이 **세션에 persist** |
| — | **원본 변경을 감지하는 장치가 없다** |

---

## 3. 세액 영향 — **실측** (제보 4자산 그대로)

| # | 양도일 | 취득일 | 양도가액 | 취득가액 | 차익 | 해당 호 |
|---|---|---|---:|---:|---:|---|
| 1 | 2026-03-02 | 2023-08-01 | 600,000,000 | 540,000,000 | 60,000,000 | §55① 누진 |
| **2** | 2026-06-03 | 2020-04-01 | 100,000,000 | 120,000,000 | **−20,000,000** | **미등기 70%** |
| 3 | 2026-10-10 | 2026-01-01 | 300,000,000 | 281,000,000 | 19,000,000 | 주택 1년미만 70% |
| 4 | 2026-10-20 | 2025-07-01 | 300,000,000 | 160,000,000 | 140,000,000 | 토지 1~2년 40% |

| | 통산 배분 | 산출세액 | 총 납부세액 |
|---|---|---:|---:|
| **현행**(미등기 미반영) | 1호로 **양도1번이 20,000,000 전액 흡수** | **72,290,000** | 79,519,000 |
| **정상**(미등기 반영) | 1호 양도3번 19,000,000 + 2호 300,000/700,000 | 63,288,000 | 69,616,800 |
| | | | **9,902,200 과대** |

> ✅ **현행 산출세액 72,290,000은 제보 이미지 20의 합계와 원 단위로 일치한다** — 재현이 정확하다는 증거다.
> ✅ 미등기를 반영하면 배분이 제보자가 말한 그대로가 된다(19,000,000 우선 + 1,000,000 안분). **축 수정(PR #1643)은 정상 동작 중이고, 입력이 틀린 것이다.**

---

## 4. 왜 지금까지 안 드러났나

1. **차손 + 실거래가 자산에서는 미등기의 효과 넷이 전부 관측 불가**였다(PR #1643 결함 ③ — 해소됨).
2. 합산 화면 어디에도 **「이 자산은 이력 사본이다」·「원본이 바뀌었다」**는 표시가 없다.
3. `sourceCalculationId`가 이미 있는데 **아무도 읽지 않는다** — 유일한 소비자가 `backfillPriorPaid`(`transfer-multi-load-entry.ts:80`)이고 그것은 `priorPaidNational`이 **없을 때만** 동작한다.

---

## 5. 설계 — 비교 축은 **하나뿐이다** (자기검토에서 4-상태 안이 무너졌다)

### 5-1. 🔴 처음 쓴 「해시 둘」 안은 성립하지 않는다

초안은 `record.inputHash` ↔ `sourceInputHash`(원본 변경)와 `hash(property.form)` ↔ `sourceInputHash`(로컬 편집)를 **함께** 비교해 네 상태를 가르려 했다. **`hash(form)` 축이 못 쓰는 축이다** — 두 가지 실측 사실이 그것을 무너뜨린다:

| 사실 | 근거 | 효과 |
|---|---|---|
| 저장 시 `inputData`에 **키가 덧붙는다** | `use-auto-save-calculation.ts:103` — `{ ...inputData, buildingStdSnapshots: bspSnaps }` | `record.inputData ≠ formData` |
| 편집 왕복이 **기본값 키를 덧붙인다** | `syncToWizardStore`(`:363`)가 `resetWizard()` → `updateFormData(form)`, 그 구현이 `{ ...state.formData, ...data }`(`calc-wizard-store.ts:280`) ⇒ 결과는 `{ ...defaultFormData, ...propertyForm }` | **사용자가 아무것도 안 고쳐도 해시가 바뀐다** |

⇒ 「로컬 편집함」과 「폼이 정규화됨」을 구분할 수 없다. 그 축으로 배너를 띄우면 **정상 동작인 편집 왕복마다 상시 노이즈**가 된다.

### 5-2. 정본 — 축은 `record.inputHash` ↔ `sourceInputHash` 하나다

**양쪽 모두 저장소가 `record.inputData`에 대해 계산한 같은 값**이라 정규화 잡음이 끼지 않는다.

```ts
// lib/stores/multi-transfer-tax-store.ts — PropertyItem (현행 :12~27)
/**
 * 편입 시점 원본 record의 `inputHash`. 원본 변경 감지의 **유일한** 기준선.
 * 「다시 불러오기」 시 갱신하고, 합산 화면의 **로컬 편집으로는 바꾸지 않는다**
 * (provenance 기록이지 현재 상태가 아니다).
 * ⛔ `computeInputHash(property.form)`과 비교하지 말 것 — §5-1.
 */
sourceInputHash?: string;
```

| `record.inputHash` vs `sourceInputHash` | 상태 | 조치 |
|---|---|---|
| 같다 | 동기 | 없음 |
| **다르다** | **원본이 변경됨** | 🔴 배너 + 「다시 불러오기」 |
| `sourceInputHash`가 **없다** | 판정 불가(레거시) | §5-4 |

> 🔑 **동기화 여부만 알면 충분하다.** 「합산에서 고쳤는가」는 알 수 없고 **알 필요도 없다** — 「다시 불러오기」 확인 문구가 **항상** 「합산 화면에서 고친 내용이 있으면 사라집니다」라고 알리면 된다(다이얼로그 1개 vs 못 쓰는 해시 축 1개).

### 5-3. 🔑 편입은 **동기**로 유지한다

초안은 `sourceInputHash`를 `record.inputHash ?? await computeInputHash(...)`로 만들려 했는데, 그러면 `buildPropertyFromSingleRecord`가 async가 되고 **`enterMultiAggregate`(`transfer-aggregate-entry.ts:107`)가 동기 함수**라 그 호출 사슬 전체가 async로 번진다.

⇒ **`record.inputHash`를 그대로 읽는다**(동기). 없으면 `undefined` → 레거시 버킷. 폴백 계산을 하지 않는다.

> 호출부는 둘이다 — `MultiTransferTaxCalculator.tsx:292`(화면 안 「이력에서 불러오기」)와 `transfer-aggregate-entry.ts:113`(이력 화면 「합산」). **둘 다** 고쳐야 한다.

### 5-4. 레거시 자산 (`sourceInputHash` 없음) — **추측하지 않는다**

기존 세션·저장분에는 이 필드가 없다. `hash(form)` 비교는 §5-1에서 못 쓰는 것으로 판명됐으므로 **동기화 여부를 알 수 없다**고 솔직히 말한다:

> 「이 자산들은 이력에서 불러온 **사본**입니다. 원본과 같은지 확인할 수 없습니다.」
> [전부 다시 불러오기] [그대로 두기]

두 버튼 모두 `sourceInputHash`를 확정하므로 **한 번만 뜬다.** 별도 dismiss 플래그가 필요 없다. 자산이 여럿이어도 **배너 1개**로 묶는다(자산마다 띄우면 10건에 10개다).

> 🔑 **제보자의 현재 세션이 정확히 이 버킷이다** — 이미 편입된 자산에는 `sourceInputHash`가 없다. ⇒ 착수 후 첫 진입에서 이 배너를 보고 「전부 다시 불러오기」를 누르면 해소된다. 즉 §5-4는 「나중을 위한 배려」가 아니라 **이 건의 실제 해결 경로**다.

### 5-5. ⛔ 자동 갱신 금지

원본이 바뀌었다고 `property.form`을 조용히 덮으면 **합산 화면에서 직접 고친 값이 사라진다.** 그 편집 경로는 §2(가)에서 **정상 동작함을 실측**했다 — 실재하는 사용 흐름이다. 반드시 **명시적 재편입**만 제공한다.

### 5-6. 판정 결과는 **store에 넣지 않는다**

`detectStaleSources`는 async(`calculationRepository.get`)이고 결과는 **파생값**이다. `MultiTransferFormData`에 넣으면 `partialize`(`multi-transfer-tax-store.ts:247`)가 sessionStorage에 persist하고 다건 자동저장 `inputData`를 타고 **이력 record에까지 저장**된다 — 같은 파일 `setAutoBackupPropertyId` 주석이 경고하는 바로 그 함정이다. ⇒ **컴포넌트 지역 state**로 둔다.

---

## 6. 수정 범위

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/stores/multi-transfer-tax-store.ts` (`:12~27`) | `PropertyItem.sourceInputHash?: string` 추가 |
| 2 | `lib/calc/transfer-multi-load-entry.ts:44` | `buildPropertyFromSingleRecord`에 `sourceInputHash: record.inputHash` (**동기 유지** — §5-3) |
| 3 | 동 파일 (신규) | `detectStaleSources(properties)` — `backfillPriorPaid`(`:80`)와 **같은 형태**(같은 `calculationRepository.get` 선례·같은 「실패는 조용히 통과」 규약) |
| 4 | 동 파일 (신규) | `reloadPropertyFromSource(property)` — `form`·`completionPercent`·`sourceInputHash` 갱신, `propertyId`·`propertyLabel`·`sourceCalculationId`는 **보존** |
| 5 | `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | 자산 목록·공통 설정 단계에 `<ToneCard tone="amber">` 배너(`components/calc/shared/ToneCard.tsx` — 인라인 톤 하드코딩 금지), 목록 카드(`:110~140`)에 자산별 「다시 불러오기」 |

### 6-1. `priorPaid*`는 덮지 않는다

「다시 불러오기」가 `extractLoadPriorPaid`로 기납부세액까지 갱신하고 싶어지지만 **사용자가 수동 확정했을 수 있다**(`form.priorPaidTaxEdited`). 현행 `backfillPriorPaid`가 이미 「값이 있으면 그대로 둔다」 규약이므로 **같은 규약**을 따른다.

### 6-2. 🔴 재편입이 **과세연도를 벗어나게** 만들 수 있다

원본의 양도일이 다른 연도로 바뀌었으면 재편입한 자산이 `form.taxYear`와 어긋나고, 엔진 `validateInput`이 **예외를 던진다**(`transfer-tax-aggregate-helpers.ts:47~51` — 「양도일 연도(…)가 과세기간(…)과 다릅니다」). ⇒ 재편입 **전에** 연도를 대조해 그 자산은 배너에서 **「과세연도가 달라져 불러올 수 없음」**으로 표시하고 버튼을 막는다.

### 6-3. 재편입 가드는 `backfillPriorPaid`와 같다

`classifyLoadableTransfer(rec) !== "single"`이면 건너뛴다. record 삭제·조회 실패도 **조용히 통과**한다(throw 금지).

### 6-5. 착수 전까지의 우회 + 사용자 행동 지침

- **지금 당장 되는 우회**: 합산 화면에서 그 자산을 **「편집」 → 보유 상황 → 미등기 ON → 자산 목록으로**.
  §2(가)에서 **정상 동작을 실측**했다. 배너가 생기기 전에도 이 경로는 항상 유효하다.
- 🔴 **단건에서 토글만 켜는 것으로는 record가 갱신되지 않는다.** 자동저장은
  `useAutoSaveCalculation`이 **`resultData`가 비어 있지 않을 때만** 실행한다
  (`use-auto-save-calculation.ts:85~87`). ⇒ 단건에서 고쳤으면 **계산까지** 해야 이력이 바뀌고,
  그래야 이 계획서의 감지가 작동한다. 배너 문구가 이 점을 함께 안내해야 한다.

### 6-4. 검사 시점

- **자산 목록 단계 마운트** — 계산 전에 본다.
- **공통 설정 단계** — 「세액 계산」 버튼이 있는 화면이라 놓칠 수 없다.
- ⛔ **계산을 차단하지 않는다** — 정상적인 로컬 편집까지 막는다. 배너가 두 화면에 있으면 충분하다.

---

## 7. 🔴 이 수정으로도 **못 잡는 것** (한계 명시)

| 상황 | 감지 | 이유 |
|---|---|---|
| 단건에서 토글만 켜고 **재계산하지 않음** | ❌ | record가 애초에 안 바뀐다. 합산이 알 방법이 없다. **③ 가시성이 유일한 방어선**(이미 확보) |
| businessKey가 없는 record | ❌ | `business-key.ts:37` — 주소·양도일이 **둘 다** 없으면 키 없음 → `saveOrUpdateByContent` 폴백 → 입력이 바뀌면 **새 record**가 생기고 원본은 불변 |
| multi record 전체 replace로 편입된 자산 | 🟡 | `buildPropertiesFromMultiRecord`가 `sourceCalculationId: p.sourceCalculationId ?? record.id` — 폴백이 걸리면 id가 **multi record**를 가리켜 인덱스 대응이 모호하다. **1차 범위는 single 편입**으로 한정 |

> ⚠️ **양도세 businessKey는 `addr:{주소}|{양도일}`이다**(`business-key.ts:37~51`). 미등기 토글은 주소·양도일을 바꾸지 않으므로 **같은 키 → 같은 id로 update**되고 `inputHash`도 갱신된다(`calculation-repository.ts:220~235`). ⇒ **제보 상황은 감지 가능하다.**
>
> 🟡 **별건**: 주소 없이 양도일만 있으면 키가 `addr:|2026-06-03`이 되어 **같은 날 양도한 다른 물건과 충돌**한다. 이 계획서 범위 밖이나 기록해 둔다.

---

## 8. Pre-Do anchor (구현 **전에** 작성 — 🔴는 전부 실패해야 착수)

`__tests__/calc/multi-stale-source-snapshot.predo.anchor.test.ts`

| ID | 단언 | 착수 전 |
|---|---|---|
| S-0 | 편입 시 `sourceInputHash === record.inputHash` (두 호출부 **모두**) | 🔴 |
| S-1 | 원본 record만 바뀌면 `detectStaleSources` → 그 자산이 잡힌다 | 🔴 |
| S-2 | **로컬 편집만** 했으면 → stale **아님**(편집 왕복이 폼을 정규화해도 — §5-1) | 🔴 |
| S-3 | `record.inputHash`가 undefined면 → `reason: "unknown"`(레거시) | 🔴 |
| S-4 | `sourceInputHash`가 undefined면 → `reason: "unknown"` | 🔴 |
| S-5 | `sourceCalculationId` 없는 수동 추가 자산은 **검사 대상 아님** | 🔴 |
| S-6 | 원본 record 삭제·조회 실패 시 조용히 통과(throw 금지) | 🔴 |
| S-7 | `classifyLoadableTransfer !== "single"`이면 건너뛴다 | 🔴 |
| S-8 | `reloadPropertyFromSource`가 `propertyId`·`propertyLabel`·`sourceCalculationId` 보존 | 🔴 |
| S-9 | `reloadPropertyFromSource`가 `priorPaidNational` 기존 값을 **덮지 않는다** | 🔴 |
| S-10 | 재편입 결과의 양도연도가 `taxYear`와 다르면 **차단 사유로 반환**(§6-2) | 🔴 |
| S-11 | 🟢 **감시** — 기존 `backfillPriorPaid` 거동 불변 | 🟢 |
| S-12 | 🟢 **감시** — `buildPropertyFromSingleRecord`가 **동기**다(async면 `enterMultiAggregate`가 깨진다) | 🟢 |

### E2E

`e2e/transfer-multi-stale-source-banner.spec.ts` — §2(나)에서 이미 재현한 플로우가 그대로 anchor가 된다:

1. 단건 record(미등기 OFF) 편입 → 2. 원본을 미등기 ON으로 갱신 → 3. 합산 재진입
4. 🔴 **배너가 보인다** · 5. 「다시 불러오기」 클릭 → 6. 계산 → **세율구분 코드 `1-30`**

> 6번이 결정적이다 — 배너만 뜨고 재편입이 값을 못 고치면 아무 의미가 없다.
> (PR #1643 덕에 `1-30`이 **화면에서 단언 가능**해졌다.)

### 뮤테이션

| M | 되돌릴 것 | 기대 |
|---|---|---|
| M1 | `sourceInputHash` 기록 제거 | S-0·S-1·S-3 실패 |
| M2 | 비교 축을 `computeInputHash(property.form)` vs `record.inputHash`로 교체 | **S-2 실패**(편집 왕복이 stale로 오탐 — §5-1) |
| M3 | 「다시 불러오기」가 `form`을 갱신하지 않음 | E2E 6번 실패 |
| M4 | 검사에서 `sourceCalculationId` 가드 제거 | **S-5 실패**(수동 추가 자산이 검사 대상이 된다) |

---

## 9. 검증 게이트

- [ ] S-0~S-12 전건 통과 · M1~M4 구별력 실측
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 error
- [ ] `npm test` 전건 — 회귀 0건
- [ ] **E2E** — 배너 노출 + 재편입 후 `1-30` 표시 (뮤테이션 red 확인)
- [ ] **세액 불변 확인** — 이 수정은 «감지·재편입»만 한다. 사용자가 재편입하지 않으면 세액이 **바뀌지 않아야** 한다

---

## 10. 🟡 미결 (이 계획서 범위 밖)

- **§103 기본공제 배분의 축** — 「호」인지 「세율」인지 미판정(`loss-offset-same-rate-axis.plan.md` §10 하단).
- **businessKey 주소 누락 시 키 충돌** — §7 하단 ⚠️.
- **multi record replace 편입 자산의 staleness** — §7 표 3행.
