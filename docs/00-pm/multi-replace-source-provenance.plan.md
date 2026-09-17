# 다건 record **전체 replace** 편입분의 provenance — 가짜 원본 id (수정 계획서)

> 상태: **Plan** — 착수 조건 충족(Q-1 결정 완료 2026-09-17). 구현 대기.
> 세목: 양도소득세 / 연간 합산 과세(`/calc/transfer-tax/multi`)
> 작성일: 2026-09-17 · 기준 커밋: `f750be70`
> 선행: `multi-aggregate-stale-source-snapshot.plan.md` §7 표 3행 — 거기서 「1차 범위 밖」으로 남긴 항목.
> 검증 깊이: **L2** — 여러 파일 · **세액 불변**(provenance·표시 축). 착수 전 mutation probe 수행함(§3).

---

## 0. 한 줄 요약

`buildPropertiesFromMultiRecord`의 `sourceCalculationId: p.sourceCalculationId ?? record.id` 폴백이
**수동 추가 자산에 「원본이 있다」는 거짓 표지**를 붙인다. 가리키는 것은 자기를 담고 있던 **다건
record**라 실제 원본이 아니다. 지금은 하류가 전부 「단건이 아니면 조용히 통과」라 **무해하게 흐르지만**,
그 무해함은 **가드 하나에만 매달려 있고 안전망은 0건**이다.

**세액은 바뀌지 않는다.**

---

## 1. 🔴 초판 판정 정정 — 「replace 편입분은 감지되지 않는다」는 **틀렸다**

선행 계획서 §7은 이 항목을 「multi record 전체 replace로 편입된 자산 — 감지 🟡」로 적었다.
**실측으로 반증된다.**

probe(일회용, `fake-indexeddb`): 단건 A 편입 → 다건 M 저장 → A 수정 → M을 replace 로드 → 감지.

```
classifyLoadableTransfer(M)                     = multi
M.inputData.properties[0].sourceCalculationId   = A.id ✅
M.inputData.properties[0].sourceInputHash 보존  = true
A.inputHash 변경됨 = true (ffccf2c51573f128 → 23f7adee5f6abd38)
replace 후 props[0].sourceCalculationId          = A.id ✅
detectStaleSources                               = ["양도 1번:source_changed"]   ← 잡힌다
props[0] 재편입 반영                              = true                         ← 동작한다
```

⇒ **단건에서 편입된 자산은 replace 경로에서도 정상 감지되고 재편입도 된다.** PropertyItem이
`sourceCalculationId`·`sourceInputHash`를 **자기 안에** 들고 다니고, 그것이 다건 record의
`inputData.properties[]`에 그대로 persist되기 때문이다(`autoSaveInput = { __multiTransfer: true, ...form }`,
`MultiTransferTaxCalculator.tsx:150`).

§7이 걱정한 「인덱스 대응이 모호하다」도 **기우였다** — 대응은 인덱스가 아니라 각 property가 들고 있는
id로 이뤄진다. 자산 순서가 바뀌거나 추가·삭제돼도 무관하다.

**남는 진짜 결함은 하나뿐이고, 그것은 수동 추가 자산 쪽이다.**

```
replace 후 props[1](수동추가).sourceCalculationId = M.id  ← 🔴 폴백이 가짜 provenance 부여
props[1] 재편입                                   = 무변경(no-op)
```

---

## 2. 갭 — 무엇이 어떻게 틀렸나

### G-1 🔴 수동 추가 자산이 「원본 있음」으로 위장한다

`lib/calc/transfer-multi-load-entry.ts:70~76` (폴백은 `:74`)

```ts
export function buildPropertiesFromMultiRecord(record: CalculationRecord): PropertyItem[] {
  const input = record.inputData as unknown as MultiTransferFormData;
  return (input.properties ?? []).map((p) => ({
    ...p,
    sourceCalculationId: p.sourceCalculationId ?? record.id,   // ← 폴백
  }));
}
```

`sourceCalculationId`의 타입 주석은 「이력에서 불러온 경우 **원본 계산 id**」다
(`multi-transfer-tax-store.ts:19`). 다건 record는 그 자산의 원본이 **아니다** — 담고 있던 용기다.
⇒ **필드의 계약을 어긴다.**

### G-2 가짜 표지가 **영구히 굳는다**

replace 로드 → 계산 → 자동저장이 `properties[]`를 그대로 다시 저장한다. 다음 세션에서 그 record를
replace 로드하면 이번엔 `p.sourceCalculationId`가 이미 차 있어 **폴백이 걸리지 않고** 가짜 id가
그대로 유지된다. 세션을 거듭할수록 「원본이 M이다」가 사실처럼 남는다.

### G-3 무해함이 **가드 한 줄에만 매달려 있다**

현재 하류 3곳이 전부 `classifyLoadableTransfer(rec) !== "single"` 한 줄로 걸러 낸다:

| 소비자 | 위치 | 가짜 id일 때 |
|---|---|---|
| `detectStaleSources` | `transfer-multi-load-entry.ts:166` | `get(M.id)` → multi → `null`(조용히 통과) |
| `loadSourceRecord`(다시 불러오기·그대로 두기) | `:193` | `null` → **no-op** |
| `backfillPriorPaid` | `:93·:97` | multi → 무변경 |

⇒ 결과는 「우연히 옳다」. 그 가드가 넓어지는 순간 **잠재 결함이 활성화**된다
(memory `feedback_ui_gate_expansion_activates_latent_defect`). 구체적 위험:
**`reloadPropertyFromSource`가 다건도 허용하도록 확장되면, 수동 추가 자산이 다건 record의
`inputData`(= `MultiTransferFormData`, `TransferFormData`가 아니다)를 `form`에 덮어쓴다.**

### G-4 🟡 폴백은 **실제로 쓰이는 데가 있다** — 그냥 지우면 배지가 죽는다

`MultiTransferTaxCalculator.tsx:106~109`이 `properties[].sourceCalculationId`를 모아
`existingSourceIds`를 만들고, 모달이 `existingSourceIds.has(r.id)`로 **「이미 로드함」 배지**를
띄운다(`MultiTransferHistoryLoadModal.tsx:120`). 폴백 덕에 **M 자신**이 그 집합에 들어간다.

⇒ 폴백을 제거하면 replace 로드 뒤 같은 M을 다시 고를 때 배지가 사라진다. **수정은 이 기능을
보존해야 한다.**

---

## 3. 안전망 실측 (착수 전)

| ID | 무력화 | 결과 |
|---|---|---|
| **M-1** | `sourceCalculationId: p.sourceCalculationId ?? record.id` → 폴백 제거 | `__tests__/calc/` + `components/` + `stores/` **658파일 5,656건 전건 통과** |
| **M-2** | `buildPropertiesFromMultiRecord` 참조 grep(`__tests__/`·`e2e/`) | **0건** |

⇒ 🔴 **이 함수에는 안전망이 하나도 없다.** 선행 PR #1644의 anchor S-0~S-13은 전부
`buildPropertyFromSingleRecord` 축이고 replace 축은 **명시적으로 비어 있다**
(memory `feedback_anchor_excluded_axis_is_unguarded`). ⇒ 신규 anchor는 **필수**다.

---

## 4. 설계

### 4.1 두 개념을 분리한다

한 필드가 두 가지를 겸하고 있는 것이 병이다(memory `feedback_one_field_serving_two_legal_axes`).

| 개념 | 성격 | 자리 |
|---|---|---|
| **원본 단건 record** — staleness 대조·재편입의 대상 | **자산 수준** | `PropertyItem.sourceCalculationId` (계약 그대로, 폴백 제거) |
| **이 세션을 만든 다건 record** — 「이미 로드함」 배지 | **세션 수준** | `MultiTransferFormData.loadedFromRecordId` (신규) |

세션을 만든 record는 자산마다 다를 수 없다. **자산 수준에 두는 것 자체가 범주 오류**였다.

### 4.2 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| ① | `lib/stores/multi-transfer-tax-store.ts:46·103` | `MultiTransferFormData.loadedFromRecordId?: string` 추가. `defaultFormData`(`:103`)는 **키를 넣지 않는다** — optional이라 `undefined`가 기본이다 |
| ② | `lib/calc/transfer-multi-load-entry.ts:74` | 폴백 제거 — `sourceCalculationId: p.sourceCalculationId` |
| ③ | `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:127` | `doLoadMulti`가 `loadedFromRecordId: record.id`도 세팅 |
| ④ | 같은 파일 `:106` | `existingSourceIds`에 `loadedFromRecordId` 합집합 |
| ⑤ | `handleLoadSingle`·자산 수동 추가 | `loadedFromRecordId`는 **건드리지 않는다**(세션 출처는 그대로) |

`reset`(`:255~263`)이 `form: defaultFormData`로 통째 교체하므로 `loadedFromRecordId`도 함께 사라진다 — 별도 처리 불요. **V-1 해소(실독).**

### 4.3 14 동기화 지점 판정

신규 필드는 **클라이언트 UI 메타**다. ④ API 변환(`multi-transfer-tax-api.ts`)이 payload를
**명시 조립**하므로 새 키는 전송되지 않는다 ⇒ ⑨~⑭ **해당 없음**. 다만 「명시 매핑은 조용히 strip한다」가
이 저장소의 함정 목록에 있으므로(`feedback_explicit_prop_mapping_strip`) **의도된 strip임을 anchor로
고정**한다(R-7).

| 지점 | 판정 |
|---|---|
| ①폼 상태 | 신규 필드 |
| ②initial | `createInitialMultiForm` |
| ③normalize | 해당 없음(문자열 아님) |
| ④API 변환 | **의도적 미전송** — R-7이 고정 |
| ⑤UI | 모달 배지(기존) |
| ⑥사이드바 | 해당 없음 |
| ⑦결과 카드 | 해당 없음 |
| ⑧validation | 해당 없음 |
| ⑨~⑭ | **해당 없음**(엔진 미도달) |

---

## 5. Pre-Do anchor (구현 **전에** 작성 — 🔴는 전부 실패해야 착수)

파일: `__tests__/calc/multi-replace-source-provenance.predo.anchor.test.ts`
셋업은 선행 anchor(`multi-stale-source-snapshot.predo.anchor.test.ts`)와 동일 —
`fake-indexeddb/auto` + `resetLocalDB()`.

| ID | 단언 | 현행 |
|---|---|---|
| **R-1** 🔴 | replace 후 **수동 추가** 자산의 `sourceCalculationId`가 `undefined`다 | 실패(=M.id) |
| **R-2** 🟢 | replace 후 **단건 출처** 자산의 `sourceCalculationId`가 원본 A.id 그대로다 | 통과(회귀 고정) |
| **R-3** 🟢 | replace 후 `sourceInputHash`가 보존돼 `detectStaleSources`가 `source_changed`를 잡는다 | 통과(§1 실측 고정) |
| **R-4** 🔴 | replace가 `loadedFromRecordId`에 다건 record id를 남긴다 | 실패(필드 없음) |
| **R-5** 🔴 | 「이미 로드함」 집합이 `loadedFromRecordId`를 포함한다(배지 보존) | 실패 |
| **R-6** 🟢 | 수동 추가 자산은 `detectStaleSources` 대상이 아니다(오탐 0) | 통과 |
| **R-7** 🟢 | ④ API payload에 `loadedFromRecordId`가 **없다** | 통과(의도된 strip 고정) |
| **R-8** 🟢 | `properties`가 빈 다건 record도 터지지 않는다 | 통과 |

> ⚠️ R-2·R-3·R-6은 **통과 상태로 시작**한다 — §1에서 실측으로 확인한 「이미 옳은 것」을 고정하는
> 안전망이다. M-2가 보였듯 이 축은 지금 **전부 무방비**다.

### 뮤테이션 (구현 후 — anchor가 과녁을 맞히는지)

| ID | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P-1 | 폴백 복원(`?? record.id`) | R-1 |
| P-2 | `doLoadMulti`에서 `loadedFromRecordId` 세팅 제거 | R-4·R-5 |
| P-3 | `existingSourceIds` 합집합에서 `loadedFromRecordId` 제거 | R-5만 |
| P-4 | ④ 변환에 `loadedFromRecordId` 추가 | R-7 |

> P-2·P-3을 **갈라 두는 이유**: 세팅과 소비가 각각 구별력을 갖는지 확인한다. 한쪽만으로 둘 다
> 빨개지면 anchor가 과녁을 벗어난 것이다.

---

## 6. E2E

`e2e/transfer-multi-replace-provenance.spec.ts` (신규)

| ID | 시나리오 |
|---|---|
| **RP-1** 🔴 | 단건 A 편입 + 자산 수동 추가 → 계산·저장 → 새 세션에서 그 다건을 불러오기 → **배너에 수동 추가 자산이 뜨지 않는다** |
| **RP-2** | 같은 흐름에서 A를 고쳐 재계산한 뒤 replace 로드 → **A만 「원본 변경」으로 뜨고 「다시 불러오기」가 반영된다** |
| **RP-3** | replace 로드 뒤 불러오기 모달을 다시 열면 그 다건 record에 **「이미 로드함」 배지**가 있다 |

> 🔴 **vitest는 배선을 못 본다** — 이 저장소에서 **다섯 번 연속** 재현된 패턴이다
> (#1646 P-8 · #1647 P-7 · #1648 Q-7 · #1649 R-1 · #1650 S-2). ③④가 컴포넌트 배선이라
> RP-3이 유일한 안전망이 될 수 있다.

---

## 7. 미검증 레지스터 V-n

| ID | 항목 | 검증 방법 | 상태 |
|---|---|---|---|
| **V-1** | `reset`이 `loadedFromRecordId`를 실제로 지우는가 — 남으면 새 세션이 남의 출처를 물려받아 배지가 거짓으로 뜬다 | 실독 | ✅ **해소** — `reset`(`multi-transfer-tax-store.ts:255~263`)이 `form: defaultFormData` **통째 교체**다. 부분 merge가 아니라 잔존 불가. anchor 불요 |
| **V-2** | 구 세션(sessionStorage)·구 record에 `loadedFromRecordId`가 없을 때 `existingSourceIds`가 터지지 않는가 | `filter(Boolean)` 경로 실독 | ⏳ |
| **V-3** | 이미 저장된 record의 **가짜 `sourceCalculationId`를 마이그레이션할 것인가** — 「그 id가 다건이면 제거」는 비동기 조회가 필요해 `buildPropertiesFromMultiRecord`가 async가 된다(선행 계획서가 **금지**한 방향, `:56~62` 주석) | §8 Q-1 | ✅ **해소** — Q-1이 (A)로 결정돼 마이그레이션 없음. async 전파 문제 미발생 |

**V-1·V-3 해소. 남은 것은 V-2뿐이고 설계를 가르지 않는다** ⇒ 착수 가능.

---

## 8. 결정 게이트 Q-n

### Q-1 ✅ 이미 굳은 가짜 id를 어떻게 다룰 것인가 — **(A) 그대로 둔다** (2026-09-17 사용자 결정)

| 선택지 | 결과 |
|---|---|
| **(A) 그대로 둔다 ← 채택** | 구현 최소. 구 record는 계속 가짜 id를 갖지만 **하류 가드가 걸러 내 무해**하다(§2 G-3 표) |
| (B) 동기 휴리스틱 제거 | `p.sourceCalculationId === record.id`이면 제거. 조회 불요 = 동기 유지 |
| (C) 비동기 마이그레이션 | 정확하지만 `buildPropertiesFromMultiRecord`가 async가 되어 선행 계획서가 금지한 전파가 시작된다 |

**채택 근거(사용자)**: 「지금 저장되어 있는 레코드는 조만간 모두 삭제할 것이니 이미 저장된
레코드는 고려 사항이 아니다」. 청소 대상이 사라지므로 (B)의 1줄도 쓸 이유가 없다.

> 🔴 **오해하기 쉬운 지점 — 이것은 「구 데이터만의 문제」가 아니다.**
> 가짜 id는 replace 로드가 **일어날 때마다 새로 생긴다**(§2 G-1). 이력을 전부 지워도
> 수정 전까지는 계속 생기고, 재저장으로 다시 굳는다(G-2). ⇒ **(A)가 빼는 것은 「이미 저장된
> 것의 청소」뿐이고, 발생 자체를 막는 §4 본체는 그대로 필요하다.** 이 문장을 지우지 말 것.

⇒ **V-3 해소** — 마이그레이션을 하지 않으므로 async 전파 문제 자체가 발생하지 않는다.

### Q-2 🟡 배지 문구를 바꿀 것인가

지금은 자산 출처와 세션 출처가 한 집합에 섞여 **똑같이 「이미 로드함」**으로 보인다. 분리 후에는
「이 세션의 원본」과 「자산으로 편입됨」을 구분해 표시할 수 있다.

**추천: 바꾸지 않는다.** 이번 수정의 목적은 provenance 정합이고, 문구 변경은 표시 규약 변경이라
역방향 grep(`feedback_display_string_change_needs_reverse_grep`)과 E2E 셀렉터 회귀를 부른다.
필요하면 별건.

---

## 9. PR 분할

**단일 PR.** 파일 3개(store·load-entry·calculator) + anchor 1 + E2E 1. 세액 불변이라 분할 이득이 없다.

---

## 10. 한계 — 고치지 못하는 것

1. **다건 record 안의 자산을 개별로 「다시 불러오기」하는 축은 없다.** 원본이 단건일 때만 된다.
   다건 record를 원본으로 삼는 재편입은 `form` 타입이 다르므로(§2 G-3) 범위 밖이다.
2. **단건에서 토글만 켜고 재계산하지 않으면** record가 안 바뀌어 감지 불가 — 선행 계획서 §7 1행 그대로.
3. **businessKey 없는 record**(주소·양도일 둘 다 없음)는 입력을 바꾸면 **새 record**가 생겨
   원본이 불변으로 남는다 — 선행 계획서 §7 2행 그대로.

---

## 11. 비스코프

- 🟠 토지 출자 분기(`originalAssetType === "land"` ⇒ 청산금분 0) 판정 보류 —
  `transfer-t1-05-postapproval-loss-clamp.plan.md` §6.
- 배지 문구 분리(Q-2에서 기각 추천).
- 다건 ↔ 다건 중첩 편입.

---

## 12. Do 진입 조건

- [x] **Q-1 사용자 결정** → **(A) 마이그레이션 없음** (2026-09-17)
- [ ] V-2 해소 (V-1·V-3 ✅ 해소)
- [ ] anchor R-1~R-8 작성 — 🔴 4건(R-1·R-4·R-5)이 **실제로 실패**하는 것을 먼저 확인
- [ ] 구현 후 뮤테이션 P-1~P-4 전건 과녁 적중
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0 error
- [ ] `npx vitest run __tests__/` 전건 — **세액 회귀 0**
- [ ] E2E RP-1~RP-3 + `transfer-multi-*` 계열 회귀

---

## 부록 A — 재현 커맨드

```bash
# M-1 안전망 재측정 (폴백 제거 후)
#   transfer-multi-load-entry.ts:74 → sourceCalculationId: p.sourceCalculationId
npx vitest run __tests__/calc/ __tests__/components/ __tests__/stores/ 2>&1 | tail -3
#   복원은 cp (git checkout 금지 — 작업 변경분이 날아간다)

# M-2 참조 0건 재확인
grep -rn "buildPropertiesFromMultiRecord" __tests__/ e2e/
```

## 부록 B — 관련 문서

- `docs/00-pm/multi-aggregate-stale-source-snapshot.plan.md` — 선행(PR #1644). §7 표 3행이 이 계획서의 출발점
- `docs/00-pm/loss-offset-same-rate-axis.plan.md` §10 — 이 축을 「보이게」 만든 세율 echo
- `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md` — 합산 진입점 정본
