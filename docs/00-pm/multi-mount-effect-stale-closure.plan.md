# 다건 마법사 마운트 effect가 **리하이드레이션 전 스냅샷**을 본다 (수정 계획서)

> 상태: **Done** — 구현·검증 완료(2026-09-16). 실행 결과는 §10.
> 작성일: 2026-09-16
> 세목: 양도소득세 / 연간 합산 마법사(`/calc/transfer-tax/multi`)
> 기준 커밋: `5e961cf4` — ⚠️ 머지 후 file:line은 드리프트한다. 재검토 시 전수 대조할 것.

---

## 0. 한 줄 요약

`/calc/transfer-tax/multi`를 **새로고침할 때마다 빈 자산이 1건씩 늘어난다**(실측 1 → 2 → 3). 마운트 `useEffect(..., [])`가 **첫 렌더(zustand persist 리하이드레이션 전)의 closure**로 판정하는데, 그 시점 store는 **이미 복원돼 있다**. 판정을 **live state** 기준으로 바꾼다.

---

## 1. 발견 경위

PR #1638(다건 record 편집 오라우팅) 작업 중 V-3를 측정하다 잡혔다. 그 PR과는 **무관하다** — `router.push`는 클라이언트 내비게이션이라 store가 메모리에 남아 이 레이스를 타지 않는다(그 PR의 E2E에서 자산이 정확히 2건인 것으로 확인). 원인 축이 달라 별건으로 분리했다.

---

## 2. 실측 (Playwright probe, 2026-09-16)

### 2-1. 증상

`/calc/transfer-tax/multi` 진입 후 새로고침을 반복했을 때 persist된 자산 수:

| 시점 | properties | 라벨 |
|---|---|---|
| 최초 진입 | 1 | `양도 1번` |
| 새로고침 1회 | **2** | `양도 1번`, **`양도 1번`** |
| 새로고침 2회 | **3** | `양도 1번` ×3 |

라벨이 전부 「양도 1번」으로 **중복**된다.

### 2-2. 원인 — closure와 live store가 어긋난다

마운트 effect 안에 probe를 심어 두 값을 같은 시점에 읽었다:

```
최초 진입    : {closureLen: 0, closureStep: "list", liveLen: 0, liveStep: "list"}
새로고침 후  : {closureLen: 0, closureStep: "list", liveLen: 1, liveStep: "edit"}   ← 어긋난다
```

effect가 실행되는 시점에 **store는 이미 복원돼 있는데**(`liveLen: 1`, `liveStep: "edit"`) closure는 **첫 렌더의 기본값**(`0`, `"list"`)을 들고 있다. 그래서:

1. `if (form.properties.length === 0 && form.activeStep === "list")`가 **참이 되어** `handleAddProperty()`가 돈다.
2. `addProperty`는 `set((state) => ...)` 함수형이라 **live state**(1건)에 더한다 ⇒ **2건**.
3. 라벨·인덱스는 다시 closure로 만든다 — `` `양도 ${form.properties.length + 1}번` `` → **「양도 1번」**, `setActiveProperty(form.properties.length)` → **0**.

⇒ **판정·라벨·인덱스 세 곳이 모두 stale closure**다.

### 2-3. 명시된 의도와 어긋난다

`lib/hooks/use-reset-on-new-param.ts:9`가 이 화면의 새로고침 정책을 **명문으로** 적어 두고 있다:

> `작업 중 새로고침(param 없음) = 입력값 보존(reset 미발생).`

보존은 되지만(기존 자산은 남는다) **빈 자산이 끼어들고 활성 자산이 0번으로 점프한다**. 의도대로가 아니다.

---

## 3. 🔴 증상은 하나가 아니다 — 세 분기 전부가 stale closure를 본다

`MultiTransferTaxCalculator.tsx:416~434`의 마운트 effect는 분기가 셋이고, **전부 같은 closure**를 읽는다. 새로고침 시 closure는 **항상 기본값**(`activeStep: "list"`, `properties: []`)이므로:

| 분기 | 조건 | 새로고침 시 실제 |
|---|---|---|
| ① 결과 복구 | `activeStep === "result" && !result` | closure가 `"result"`가 **될 수 없다** ⇒ **영영 실행되지 않는다**. `result`는 partialize 제외라 재진입 시 null인데, 그 복구 로직이 죽어 있다 (**V-1에서 실측**) |
| ② 편집 동기화 | `activeStep === "edit" && properties[activeIndex]` | live가 `"edit"`이어도 closure는 `"list"` ⇒ **건너뛴다**. 활성 자산 폼이 wizard store와 동기화되지 않는다 (**V-2에서 실측**) |
| ③ 첫 자산 추가 | `properties.length === 0 && activeStep === "list"` | **오발화** ⇒ §2의 증상 |

⇒ 고칠 대상은 ③ 한 줄이 아니라 **effect 전체의 입력원**이다. ③만 고치면 ①②는 그대로 죽어 있다(memory `feedback_fixed_layer_vs_consumed_layer`).

---

## 4. 안전망 실측 — **0건**

- 이 파일에 `}, []);`는 **1건**(:434)뿐 — 같은 패턴의 다른 effect는 없다.
- 단건 계산기(`TransferTaxCalculator.tsx`)·주식 마법사·주식 평가 도구에는 빈 deps 마운트 effect가 **없다**(grep 0건) ⇒ 이 결함은 **다건 화면에 고립**돼 있다.
- **새로고침 후의 상태를 단언하는 테스트는 없다.** 기존 다건 E2E는 전부 클라이언트 내비게이션 경로라 이 레이스를 타지 않는다 — 그래서 증상이 게이트를 하나도 건드리지 않았다.

---

## 5. 설계

### 5-1. 판정을 순수 함수로 분리한다 — `lib/calc/multi-mount-decision.ts` (신규)

```ts
export type MultiMountAction =
  | { kind: "restore-step"; step: "settings" | "list" }   // ① result인데 result가 없다
  | { kind: "sync-edit"; propertyIndex: number }           // ② edit 진입 — wizard 동기화
  | { kind: "add-first" }                                  // ③ 자산이 없다
  | { kind: "none" };

export function decideMultiMountAction(
  form: Pick<MultiTransferFormData, "activeStep" | "properties" | "activePropertyIndex">,
  hasResult: boolean,
): MultiMountAction;
```

**왜 함수로 빼는가**: 세 분기의 우선순위와 경계는 지금 effect 안에 묻혀 있어 **단위로 잴 수 없다**. 빼면 anchor로 고정되고, 「무엇을 입력으로 주는가」(stale closure ↔ live state)가 **호출부의 한 줄**로 드러난다.

### 5-2. effect는 **live state**를 넣어 준다

```ts
useEffect(() => {
  // 🔴 closure(form)를 쓰지 말 것 — 첫 렌더는 persist 리하이드레이션 **전**이라
  //    새로고침 시 항상 기본값이다(실측: closure 0/"list" ↔ live 1/"edit").
  const live = useMultiTransferStore.getState().form;
  const action = decideMultiMountAction(live, result !== null);
  ...
}, []);
```

### 5-3. `handleAddProperty`의 라벨·인덱스도 live 기준으로

```ts
const { properties } = useMultiTransferStore.getState().form;   // form.properties.length 대신
propertyLabel: `양도 ${properties.length + 1}번`,
setActiveProperty(properties.length);
```

렌더 후 버튼 클릭 경로에서는 closure가 이미 최신이라 **동작이 바뀌지 않는다**. 마운트 경로에서만 달라진다.

> ⚠️ 라벨 생성을 store로 옮기지 않는다 — `buildPropertyFromSingleRecord`·`continueToMulti`가 **자기 라벨을 지정**한다. store가 라벨을 만들면 그 호출부들과 충돌한다.

### 5-4. 기각한 대안

| 대안 | 기각 사유 |
|---|---|
| effect deps에 `form` 추가 | 마운트 1회 의도가 깨진다. 자산을 전부 지워 0이 되면 **자동으로 다시 추가**돼 삭제가 불가능해진다 |
| `skipHydration` + 명시적 `rehydrate()` | 변경이 훨씬 크고 SSR 첫 페인트 처리를 새로 설계해야 한다. 이 결함 하나에 비해 과하다 |
| `onRehydrateStorage` 콜백에서 처리 | store가 **UI 단계 정책**(어느 step으로 갈지)을 알게 된다 — 레이어 침범 |

⇒ **live state 읽기**가 최소 변경이며 「마운트 1회」 의도를 그대로 보존한다.

---

## 6. 검증 계획

### V — Do 전 실측

| ID | 항목 | 방법 | 판정에 미치는 영향 |
|---|---|---|---|
| **V-1** | 분기 ①(결과 복구)이 새로고침 시 정말 죽어 있는가 | `activeStep:"result"`로 저장된 세션을 새로고침 → 화면이 결과 탭에 세액 없이 머무는지 | 살아 있으면 ①은 손댈 필요가 없다 |
| **V-2** | 분기 ②(편집 동기화) 스킵으로 wizard가 **다른 자산의 폼**을 보는가 | 자산 2건·`activeStep:"edit"`·`activePropertyIndex:1`로 저장 후 새로고침 → wizard store의 폼이 자산 2번 것인지 | 스킵돼도 ③이 덮어써 증상이 안 보일 수 있다 — **③을 고친 뒤 재측정**해야 진짜가 드러난다 |
| **V-3** | 수정 후 새로고침 3회에도 자산 수·라벨·activeStep이 불변인가 | E2E | 본 수정의 성공 기준 |

> ⚠️ **V-2는 순서가 중요하다.** ③의 오발화가 wizard를 blank로 덮어쓰므로, ③을 고치기 **전**에는 ②의 증상이 가려진다(memory `feedback_mutation_masked_by_second_override`와 같은 층위).

### Pre-Do anchor (`__tests__/lib/calc/multi-mount-decision.predo.anchor.test.ts`)

- **A-1** `activeStep:"result"` + `hasResult:false` → `restore-step`(properties>0면 `settings`, 없으면 `list`).
- **A-2** `activeStep:"result"` + `hasResult:true` → `none`(결과가 있으면 그대로 둔다).
- **A-3** `activeStep:"edit"` + 해당 인덱스 자산 있음 → `sync-edit` + 그 인덱스.
- **A-4** `activeStep:"edit"`인데 인덱스가 범위 밖 → `add-first`가 아니라 **`none`**(현행 fallthrough 보존 — 자산이 있는데 빈 자산을 더 만들지 않는다).
- **A-5** `properties: []` + `activeStep:"list"` → `add-first`.
- **A-6** 🔑 `properties: [1건]` + `activeStep:"list"` → **`none`**. ← 이 케이스가 이번 결함 그 자체다.
- **A-7** 우선순위: `result` 분기가 `edit`·`list`보다 **먼저** 판정된다.

### 뮤테이션 probe

| 뮤테이션 | 기대 |
|---|---|
| effect에서 `getState()` → closure `form`으로 되돌림 | **E2E 실패**(anchor는 순수 함수라 안 잡는다 — 그래서 E2E가 필수다) |
| A-6 케이스를 `add-first`로 | A-6 실패 |
| `handleAddProperty`의 라벨을 closure 기준으로 되돌림 | E2E 라벨 단언 실패 |
| ① 우선순위를 뒤로 | A-7 실패 |

> 🔑 **anchor만으로는 이 결함을 못 잡는다.** 순수 함수는 「무엇을 넣는가」를 모른다. 안전망의 본체는 **E2E**이고 anchor는 판정표를 고정하는 보조다(memory `feedback_leaf_anchor_skips_zod_layer`와 같은 구조).

### E2E — `e2e/multi-reload-no-phantom-asset.spec.ts` (신규)

자산 1건 상태에서 **새로고침 3회** → ① persist된 자산 수 **1 유지** ② 라벨 중복 없음 ③ `activeStep` 유지 ④ 화면에 자산이 1건만 렌더.

- Playwright 요약의 마지막 `N passed`가 아니라 **exit code**로 판정한다.
- worktree 실행 시 `E2E_PORT` 필수.

---

## 7. 커밋 계획

1. `test(양도세): 다건 마운트 판정 Pre-Do anchor A-1~A-7 (실패 확인)`
2. `fix(양도세): 다건 마법사 새로고침마다 빈 자산이 늘어난다 — 마운트 판정을 live state로`
3. `test(양도세): 새로고침 3회 후 자산 수·라벨 불변 E2E`
4. `docs(양도세): 계획서 실측·V 결과 환류`

---

## 8. 범위 외

1. **이미 늘어난 세션의 정리(마이그레이션)** — 사용자가 이미 만든 중복 자산은 건드리지 않는다. 삭제 버튼이 있다.
2. **`skipHydration` 도입** — §5-4에서 기각.
3. **다른 마법사** — 같은 패턴이 **없다**(grep 실측, §4). 예방적 리팩터를 하지 않는다.
4. **라벨 중복 자체의 방지**(사용자가 수동으로 만든 중복 등) — 이번 결함의 라벨 중복은 원인이 사라지면 함께 사라진다. 일반적인 중복 방지는 별건.

---

## 9. 레지스터

### 확정 (D)
| ID | 결정 | 근거 |
|---|---|---|
| D1 | 판정 입력원을 **live state**로 바꾼다 | §2-2 실측 |
| D2 | 판정을 **순수 함수**로 분리한다 | §5-1 — 단위로 재려면 필요 |
| ~~D3~~ | ~~`handleAddProperty`의 라벨·인덱스도 live 기준~~ → **철회**(§10-2). 뮤테이션 구별력 0 — 두 구현이 **항상 같은 값**을 낸다 |
| D4 | effect deps 추가·`skipHydration`·`onRehydrateStorage`는 **기각** | §5-4 |
| D5 | 안전망의 본체는 **E2E** | §6 — 순수 함수 anchor는 입력원을 모른다 |

### 미검증 (V)
§6 표. **V-1·V-2는 Do 중 ③ 수정 직후 재측정**해야 한다(③이 증상을 가린다).

---

## 10. 실행 결과 (2026-09-16)

### 10-1. V 실측 — 세 분기 모두 예측대로였다

| ID | 수정 **전** 실측 | 수정 **후** |
|---|---|---|
| **V-1** | `activeStep:"result"` 저장 후 새로고침 → 복구 분기가 **실행되지 않고** ③이 오발화해 자산 2건·`activeStep:"edit"` | `"settings"`로 복구 · 자산 1건 유지 |
| **V-2** | 자산 2건·`edit`·index 1 저장 후 새로고침 → 자산 **3건**(라벨 「양도 1번」 중복) · `activeIndex` **1→0** · wizard 폼 **빈 값**(자산 1번도 2번도 아님) | 자산 2건 · `activeIndex` 1 · wizard 폼 `2026-09-09`(자산 2번) |
| **V-3** | 새로고침 1→2→3 | 3회 반복해도 **1 유지** |

> 📌 **V-2가 가장 나빴다.** 사용자가 자산 2번을 편집하던 중 새로고침하면 빈 자산 3번이 생기고 자산 1번 자리로 점프하며 **편집 화면에 빈 폼**이 떴다. 입력이 사라진 것은 아니지만(properties에 남아 있다) 화면상으로는 작업이 날아간 것처럼 보인다.

### 10-2. 🔴 뮤테이션 두 건의 **구별력이 0**이었고, 둘 다 코드를 바꾸게 했다

| 뮤테이션 | anchor | E2E | 판정 |
|---|---|---|---|
| **M1** effect 입력원을 closure로 되돌림(= 종전 결함) | 9 passed | **3 failed** | ✅ 예상대로 — **E2E가 유일한 안전망**(D5 확인) |
| **M2** A-6 케이스를 `add-first`로 | **1 failed** | — | ✅ |
| **M3** `handleAddProperty` 라벨·인덱스를 closure로 | — | **3 passed** | 🔴 **구별력 0** |
| **M4** result 분기 우선순위를 뒤로 | **9 passed** | — | 🔴 **구별력 0** |

**M3 — 왜 0인가**: 판정을 고친 뒤 `handleAddProperty`가 마운트 경로에서 불리는 것은 `add-first`(= `properties.length === 0`)일 때뿐이다. 그때는 **closure와 live가 둘 다 0**이라 라벨(「양도 1번」)도 인덱스(0)도 같다. ⇒ 두 구현이 **항상 같은 값**을 낸다.
⇒ **D3을 철회하고 원래 코드로 되돌렸다.** 아무것도 바꾸지 않는 변경은 넣지 않는다(Surgical Changes). 되돌린 이유를 코드 주석으로 남겼다 — 다음 사람이 같은 「개선」을 다시 시도하지 않도록.

**M4 — 왜 0인가**: 세 분기의 게이트가 `activeStep`의 `"result"` / `"edit"` / `"list"`로 **상호 배타적**이라 **순서가 결과를 바꿀 수 없다**. ⇒ A-7의 「우선순위」 단언은 **공허**했다. 그 사실 자체(`result`·`edit`이면 자산이 비어도 `add-first`로 가지 않는다)를 고정하는 단언으로 **고쳐 썼다**.

> 🔑 두 건 모두 memory `feedback_mutation_zero_discrimination_is_not_proof`의 지시대로 **「왜 0인가」를 손으로 따진 뒤** 결론을 냈다. 그 절차가 없었다면 M3는 불필요한 변경으로, M4는 거짓 안전망으로 남았을 것이다.

### 10-3. 게이트

- `npx tsc --noEmit` 0건 · `npm run lint` **0 errors**(warning 342건은 전부 기존분 — 대상 파일은 수정 전후 **6건으로 동일**)
- `npm test` **2044 파일 / 21,441 통과 · 회귀 0건**
- `npx playwright test e2e/multi-reload-no-phantom-asset.spec.ts` 3 passed
- 최종 diff: **1 파일 +25/−5**(판정 순수 함수 신규 제외). 동작이 바뀐 것은 **effect의 입력원 한 곳**이다.
