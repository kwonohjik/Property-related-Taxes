# SelectOnFocusProvider rAF 레이스 — 한글 입력 초성 유실 결함

- 작성일: 2026-08-23 (**v2 — 재검토로 v1의 채택안을 기각하고 교체**)
- 브랜치: `worktree-hangul-selectall-fix`
- 대상: `components/providers/SelectOnFocusProvider.tsx` · `hooks/use-hangul-typing.ts`(문서만) · `e2e/address-hangul-typing.spec.ts`
- 선행 등재: `hooks/use-hangul-typing.ts:16-46` 「🔴 알려진 제약」(2026-08-23, PR #1253)

> **개정 이력**
> - **v1** — 원인을 `SelectOnFocusProvider`의 rAF `select()`로 특정(P-9·P-10). 해법으로 **안 A(값 비교 가드)** 채택.
> - **v2(현재)** — 사용자 지시로 재검토. **안 A가 `CurrencyInput`의 전체선택을 통째로 깨뜨림을 실측**
>   (3/3 → **0/3**). 안 A를 **기각**하고 **안 A″(keydown 플래그)** 로 교체. anchor 4종이 세 구현을
>   완전히 판별함을 확인.

---

## 0. 결론 요약

**선행 등재(§3)와 v1 채택안(§4.2) 둘 다 틀렸다.** 최종 수정은 `SelectOnFocusProvider`의 rAF 콜백에
「**포커스 후 첫 키가 이미 들어왔으면 전체선택하지 않는다**」 가드를 넣는 것이다.

| | 선행 등재 | v1 | **v2 (확정)** |
|---|---|---|---|
| 원인 | 브라우저의 selection 클램프 | rAF `select()` ✅ | 동일 |
| 영향 | 실사용자 제품 결함 | **20ms 창 — 사람 도달 불가** ✅ | 동일 |
| 해법 | 출처 판정·별건 설계 | 안 A: **값 비교** 가드 | ❌ **기각** → **안 A″: keydown 플래그** |

---

## 1. 착수 전 실측 (throwaway probe · 전량 롤백 완료)

probe 6본(`e2e/_probe-hangul{,2,3,4,5,6}.spec.ts`) + jsdom 1본(`__tests__/components/_probe-sof.test.tsx`)을
워크트리 dev 서버(`E2E_PORT=3110`)에서 실행했다. 아래 수치는 전부 그 출력이며 **추정값은 없다**.

### 1.1 P-4 — 키 간격이 결과를 가른다

전체선택 상태에서 `rkfk`(=`가라`) 입력, 각 5회.

| 키 간격 | 성공 | 둘째 keydown이 본 selection |
|---|---|---|
| `delay=0` | **5/5** | `(1,1)` |
| `delay=10` · `30` · `50` · `100` | **0/5** | `(0,1)` ← 범위 잔존 |
| `split`(`rk`+`fk`) | **5/5** | — |

> `split`이 통과하는 이유는 간격이 길어서가 아니라 **첫 두 키가 `delay=0`으로 붙어** 있기 때문이다.
> 결정 요인은 **첫 키와 둘째 키 사이의 간격**이다.

### 1.2 P-7 — 「`select` 이벤트로 출처를 구분」 가설 **반증**

사용자 선택(click·`Cmd+A`·더블클릭)은 `select`를 쏘고 우리 emit은 안 쏘는 것처럼 보였으나,
실패 조건(`delay=100`)에서 재측정하니 **우리 emit 이후에도 SELECT가 2건** 왔다:

```
+  1ms keydown[r]      v="테헤란로" sel=(0,4)
+  6ms SELECT   v="ㄱ" sel=(1,1)
+ 13ms SELECT   v="ㄱ" sel=(0,1)     ← 여기서 범위가 확정된다
+104ms keydown[k]      v="ㄱ" sel=(0,1)   ← 오판
```

⇒ **`select` 이벤트는 구분자가 되지 못한다. 이 경로는 폐기한다(재제안 금지).**

### 1.3 P-9 / P-10 — 범인 특정 (양방향)

`HTMLInputElement.prototype.select`를 패치해 호출자를 기록:

```
+6ms  select()  sel=(1,1)
      proto.select | SelectOnFocusProvider.useEffect.handleFocus (…_.js:156:91)
최종 sel = (0,1)
```

⇒ 유발자는 **`components/providers/SelectOnFocusProvider.tsx:41`의 rAF `select()`**.
**P-10**: `select`를 no-op으로 무력화하면 `delay=100`에서도 결과가 `"가라"`. 양방향 확인.

### 1.4 P-11 / P-12 — 실사용자 도달 가능성

click 이후 첫 키까지의 대기만 바꾸고 `delay=100` 고정:

| click→첫 키 | 성공 |
|---|---|
| **0ms** | **0/5** |
| 20 · 50 · 100 · 300 · 800ms | **5/5** |

**P-12**: 프로그램 `focus()` + 300ms 경로도 정상.

⇒ 재현 창은 **포커스 후 약 20ms**(rAF 1프레임). 사람의 단순 반응시간 하한(~150ms)으로는 도달 불가.
**재현 주체는 Playwright뿐이다.**

### 1.5 ⭐ V 측정 — 재검토에서 v1 채택안을 뒤집은 실측

`/calc/property-tax`에서 ①한글 조합과 ②금액칸(`CurrencyInput`) 전체선택을 **동시에** 측정했다.

| 구현 | ① 한글 `가라`(delay=100) | ② 금액칸 포커스 시 전체선택 |
|---|---|---|
| **현행** | **0/5** | **3/3** ✓ |
| **안 A**(값 비교) | 5/5 | **0/3** 🔴 |
| **안 A″**(keydown 플래그) | **5/5** | **3/3** ✓ |

안 A″는 P-4 키 간격 6축 재측정도 **30/30**.

### 1.6 안전망 실측 — `SelectOnFocusProvider` 전용 테스트 **0건**

```
grep -rln "select-on-focus|selectOnFocus|전체 선택|전체선택" e2e/ __tests__/
→ e2e/address-hangul-typing.spec.ts · __tests__/hooks/use-hangul-typing.test.tsx  (그 외 probe)
```

전역 UX 규칙(글로벌 CLAUDE.md 「Input Select-on-Focus — 모든 프로젝트 필수」)인데
**Provider 자체를 검증하는 테스트가 하나도 없다.** 지금 고치면 회귀를 잡을 그물이 없다.
그래서 **v1의 안 A가 금액칸을 깨뜨려도 CI는 초록이었을 것이다** — §6이 이 갭을 메운다.

---

## 2. 결함 메커니즘 (확정)

`SelectOnFocusProvider`는 focus 시점에 rAF를 등록하고 **다음 프레임에** `select()`한다.
rAF를 쓰는 이유(`:11` 「Chrome의 mousedown→focus 순서로 인한 selection 덮어쓰기 방지」)는 정당하고,
**`CurrencyInput`은 여기에 명시적으로 의존한다**(`CurrencyInput.tsx:106` 「select()는 SelectOnFocusProvider가 RAF로 처리」).
문제는 **그 한 프레임 안에 입력이 시작될 수 있다는 것**뿐이다.

```
click → focus → (address-search.tsx:232 직접 select) → sel=(0,4)
      ↘ rAF 등록 ────────────────────────────────┐
첫 키 r → 훅이 start≠end를 보고 대체 → "ㄱ" emit → sel=(1,1)
      ← rAF 콜백: select() ──────────────────────┘ → sel=(0,1)   ⭐
둘째 키 k → 훅이 start≠end를 다시 「대체 의도」로 오판 → 리셋 → "ㅏ"   초성 유실
```

훅(`hooks/use-hangul-typing.ts:95`)의 `start !== end` 해석은 **정상 의도**다. 잘못된 것은
그 조건을 **뒤늦게 만들어 내는 rAF**다.

> 🔑 **훅에는 판정 근거가 없다.** keydown 시점에 「사용자의 select-all」과 「rAF가 되살린 범위」는
> `value`·`selection`·`lastEmitRef` 어느 것으로도 구분되지 않는다 — 첫 키 시점에도
> `lastEmitRef.current === text`이기 때문이다(마운트 시 `useRef(value)`). 훅을 고치는 방향은
> 원리적으로 막혀 있고, **유발자를 고치는 것만이 해법**이다.

---

## 3. 선행 등재의 오류 정정 (4건)

`hooks/use-hangul-typing.ts:16-46` · `e2e/address-hangul-typing.spec.ts:97-121`:

| # | 등재된 서술 | 정정 |
|---|---|---|
| **E-1** | 「브라우저는 controlled `value`가 바뀌어도 **선택 범위를 클램프해 유지**한다」 | ❌ 브라우저 동작이 아니라 **우리 Provider의 rAF `select()`**(P-9·P-10). 커밋 직후엔 오히려 `(1,1)`로 접혀 있다(P-7 `+6ms`) |
| **E-2** | 「**실사용자도 겪는 제품 결함**」 | ❌ 포커스 후 **20ms 창**에서만 발생(P-11). 사람은 도달 불가 |
| **E-3** | 「선택 영역의 **출처**를 알아야 한다 … **별건 설계 필요**」 | ❌ 출처 판정은 불가능하고(P-7) **불필요하다** |
| **E-4** | 「emit 직후 `setSelectionRange` — 5회 중 **2회** 통과」 | ❌ 재측정 **0/5**. rAF가 뒤에 오므로 어떤 타이밍에 접든 덮어쓰인다 |

> 왜 틀렸나 — 관측을 `selection` **값**에서 멈추고 **누가 그 값을 만들었는지**를 보지 않았다.
> `prototype` 패치 한 번(P-9)이면 6ms 만에 나오는 사실이었다.
> ⇒ **「브라우저가 그렇게 한다」는 단정은 호출자를 잡기 전까지 가설이다.**

---

## 4. 수정안

### 4.1 안 A″ — rAF 콜백 keydown 가드 (**채택**)

```ts
const el = target as HTMLInputElement;
let typed = false;
const onKey = () => { typed = true; };
el.addEventListener("keydown", onKey, { once: true });
requestAnimationFrame(() => {
  el.removeEventListener("keydown", onKey);
  // 프레임 사이에 포커스가 떠났거나 입력이 시작됐으면 전체선택하지 않는다
  if (document.activeElement !== el || typed) return;
  el.select();
});
```

**왜 값 비교가 아니라 keydown인가** — 판정해야 할 것은 「**사용자가 입력을 시작했는가**」이지
「값이 바뀌었는가」가 아니다. 둘은 다르다:

| 상황 | 값이 바뀌나 | keydown이 오나 | 전체선택해야 하나 |
|---|---|---|---|
| `CurrencyInput` 포커스 (콤마 → raw) | **O** | ✗ | **해야 한다** |
| 한글 첫 키 입력 | O | **O** | **하면 안 된다** |
| 자동조회로 값 주입 | O | ✗ | 해야 한다 |

값 비교는 1행과 2행을 구분하지 못한다. **keydown이 정확한 술어다.**

**의미론적 정당성** — select-on-focus의 의도는 「포커스 순간의 값을 즉시 대체 가능하게」다.
사용자가 이미 타이핑을 시작했다면 대체는 **이미 진행 중**이고, 거기에 전체선택을 거는 것은
의도에 반한다. 이 가드는 결함 우회가 아니라 **정책의 정확한 표현**이다.

### 4.2 기각한 안

| | 안 | 기각 사유 |
|---|---|---|
| **A** | rAF 콜백에서 **값 비교**(`el.value !== valueAtFocus`) | 🔴 **v1의 채택안. `CurrencyInput`이 포커스 시 콤마를 벗겨 값이 바뀌므로 모든 금액칸의 전체선택이 죽는다** — 실측 3/3 → **0/3**(§1.5). jsdom anchor D도 실패 |
| B | 훅에서 `select` 이벤트로 출처 판정 | **P-7이 반증** — 우리 emit 이후에도 SELECT가 온다 |
| C | 훅에서 emit 전/후 `setSelectionRange`로 캐럿 접기 | **0/5** — rAF가 뒤에 와서 덮어쓴다 (E-4) |
| D | rAF 제거, focus에서 즉시 `select()` | rAF의 존재 이유(`:11`)를 없앤다. `CurrencyInput`은 **리렌더 후** 선택되어야 raw 전체가 잡힌다 |
| E | 훅의 `start !== end` 해석 자체를 버림 | 첫 키의 「대체」가 죽는다 — `테헤란로` + `ㄱ`이 된다 |

---

## 5. Phase 계획

| Phase | 작업 | verify |
|---|---|---|
| **0** | **Pre-Do anchor 신설** `__tests__/components/select-on-focus-provider.anchor.test.tsx` (SOF-1~4) | **B·C가 먼저 실패**하고 A·D는 통과함을 확인 (§6 판별표의 「현행」 열 재현) |
| **1** | `SelectOnFocusProvider.tsx` 가드 구현 — **input + textarea 동일 적용**(Q-2) | SOF-1~4 **4/4** |
| **2** | E2E 원복 — `e2e/address-hangul-typing.spec.ts:87`을 `rkfk` → `가라` 전체 단언으로 되돌리고 **`delay: 100` 명시** | 해당 spec **5회 연속** 통과 |
| **3** | 문서 정정 — 훅 JSDoc `:16-46` 「알려진 제약」 삭제 후 재작성, spec 주석 `:97-121` 정정 (§3 E-1~E-4 근거와 함께) | 남은 서술에 미검증 단정 0건 |
| **4** | probe 7본 삭제 → 전체 회귀 | `npm run check:pre-pr` + **전체 E2E**(로컬 실측 ~7.8분) |

### Phase 4를 좁히지 않는 이유

`SelectOnFocusProvider`는 `app/layout.tsx`에 걸린 **전역** 컴포넌트다. 변경 경로가
`components/providers/**`라 `scripts/select-test-scope.sh`가 세목을 좁힐 여지가 있으나,
**영향 범위는 전 세목의 모든 입력칸**이다. 전체 E2E를 돌린다.

---

## 6. 신설할 안전망과 그 판별력

| ID | 고정하는 계약 | 현행 | 안 A(기각) | **안 A″** |
|---|---|---|---|---|
| **SOF-1** | 포커스 → rAF → **전체선택된다**(기본 기능) | ✓ | ✓ | ✓ |
| **SOF-2** | rAF 이전에 **keydown이 오면** 전체선택하지 않는다 | **✗** | **✗** | ✓ |
| **SOF-3** | rAF 이전에 **포커스가 떠나면** 전체선택하지 않는다 | **✗** | ✓ | ✓ |
| **SOF-4** | rAF 이전에 **값이 바뀌어도**(포맷 전환) 전체선택은 **유지된다** — `CurrencyInput` 계약 | ✓ | **✗** | ✓ |
| **SOF-5** | 전체선택 대상이 아닌 `type`(checkbox 등)에는 rAF를 **걸지 않는다** | ✓ | ✓ | ✓ |
| **SOF-6** | (textarea) 포커스하면 전체선택된다 | ✓ | —<sup>†</sup> | ✓ |
| **SOF-7** | (textarea) rAF 이전에 keydown이 오면 전체선택하지 않는다 | **✗** | —<sup>†</sup> | ✓ |
| **E2E** | 전체선택 후 `rkfk` **`delay:100`** → `가라` | ✗ | ✓ | ✓ |

<sup>†</sup> 안 A는 input 경로만 실측했다(기각이 확정돼 textarea까지 재지 않았다). 미측정을 「통과」로 적지 않는다.

> ⭐ **anchor 4종이 세 구현을 완전히 판별한다** — 안 A″만 4/4. 특히 **SOF-4가 없었다면
> v1의 안 A가 그대로 머지되어 전 세목 금액칸의 전체선택이 조용히 죽었을 것이다.**
>
> ⚠️ **SOF-3의 필요성은 실증됐다** — 현행에서 **실패**한다. 즉 `document.activeElement` 조건은
> 방어적 코드가 아니라 실제 결함(떠난 칸을 다시 선택)을 고친다. Simplicity First 위반이 아니다.
>
> ⚠️ **SOF-5의 `delay: 100`은 장식이 아니다.** 기본값(`delay:0`)이면 수정 전에도 5/5 통과해(P-4)
> 회귀를 전혀 잡지 못한다. 이 상수를 지우면 테스트가 조용히 무의미해진다 — 주석으로 못 박는다.

**jsdom 실현가능성 확인 완료** — `vi.spyOn(window, "requestAnimationFrame")`으로 콜백을 캡처해
수동 flush하면 rAF 전/후 상태를 정확히 만들 수 있다(probe 4건 실행). E2E 대체 불필요.

---

## 7. 리스크

| | 리스크 | 완화 |
|---|---|---|
| R-1 | 전역 Provider 변경 → 전 세목 입력칸 영향 | SOF-1·SOF-4 + Phase 4 전체 E2E |
| R-2 | ~~프로그램적 값 주입과 충돌~~ | ✅ **해소** — 안 A″는 값을 보지 않는다. SOF-4가 고정 |
| R-3 | 리스너 누수 (`keydown` 등록 후 미제거) | `{ once: true }` + rAF 콜백에서 `removeEventListener`. 포커스가 떠나 rAF가 조기 return해도 **제거는 return 앞에서** 실행된다 |
| R-4 | `document.activeElement`가 shadow DOM/iframe에서 다르게 보임 | 해당 사용처 없음 — Phase 4에서 드러나면 그때 판단 |

---

## 8. 확정된 결정 (사용자 승인 2026-08-23 — 기본 가정 그대로)

| | 질문 | 확정 |
|---|---|---|
| **Q-1** | `address-search.tsx:232`의 직접 `select()` 중복 제거? | **유지.** 유발자가 아니고(rAF가 유발자), 글로벌 규칙도 「Provider가 있으면 별도 처리 불필요」일 뿐 금지가 아니다 — Surgical Changes |
| **Q-2** | `textarea` 경로(`:34`)에도 가드? | **적용.** 구조 동일 |
| **Q-3** | 훅의 `start !== end` 오판도 방어? | **하지 않는다.** 훅에 판정 근거가 원리적으로 없다(§2 🔑) |
| **Q-4** | 등재를 「제품 결함」 → 「테스트 아티팩트」로? | **그렇게 적되** 「안 고쳐도 된다」가 아니라 **「20ms 창이지만 정책상 틀린 동작이라 고쳤다」**로 남긴다 |

---

## 9. 이 계획서에서 지킬 원칙

- **probe는 전량 롤백했다** — 현재 추적 파일 변경 **0건**(`git diff --stat` 빈 출력).
  `e2e/_probe-hangul*.spec.ts` 6본 + `__tests__/components/_probe-sof.test.tsx` 1본만 untracked이며 Phase 4에서 삭제한다.
- **`known-failures.ts`에 아무것도 추가하지 않는다** — 그 목록은 줄이기만 한다.
  (확인: 이 spec은 현재 목록에 **없다**.)
- **수치는 재현 명령과 함께 남긴다**
  - `E2E_PORT=3110 npx playwright test e2e/_probe-hangul6.spec.ts` (①②동시)
  - `E2E_PORT=3110 npx playwright test e2e/_probe-hangul2.spec.ts -g "P-4"` (키 간격축)
  - `npx vitest run __tests__/components/_probe-sof.test.tsx` (anchor 판별)

## 10. 구현 결과 (2026-08-23 — Phase 0~4 전건 완료)

### 변경한 것

| 파일 | 성격 |
|---|---|
| `components/providers/SelectOnFocusProvider.tsx` | **유일한 동작 변경.** `selectOnNextFrame()` 헬퍼 추출 + keydown/포커스 가드. input·textarea 양쪽 적용 |
| `e2e/address-hangul-typing.spec.ts` | 축소했던 단언을 `rkfk` → `가라`로 원복 + **`delay: 100`** 명시 |
| `hooks/use-hangul-typing.ts` | **문서만** — 로직 무변경. 「🔴 알려진 제약」 → 「⚠️ 의존 계약」으로 성격 자체를 교체 |
| `__tests__/components/select-on-focus-provider.anchor.test.tsx` | **신규** — SOF-1~7 |

> 훅은 **한 줄도 고치지 않았다.** §2 🔑대로 훅에는 판정 근거가 없고, 유발자만 고치면 되는 문제였다.

### Phase별 verify 실측

| Phase | verify | 결과 |
|---|---|---|
| 0 | anchor가 **먼저 실패**하는가 | SOF-2·3·7 **실패** / SOF-1·4·5·6 통과 — 계획한 판별 프로필 그대로 |
| 1 | anchor 전건 | **7/7** |
| 2 | 한글 spec 5회 반복 | **25/25** |
| 3 | 미검증 단정 제거 | E-1~E-4 정정 완료 |
| 4 | 전체 회귀 | typecheck **0** · lint **0 errors**(내 파일 경고 0건) · vitest **15,634 passed** · **E2E 1,090 passed / 0 failed** (8.2분) |

### anchor 최종 구성

`SOF-5`(대상 아닌 `type`에 rAF를 걸지 않음)는 계획에 없던 것을 구현 중 추가했다 —
가드를 헬퍼로 뽑으면서 「어떤 요소에 헬퍼가 걸리는가」 자체가 계약이 됐기 때문이다.
`SOF-6`·`SOF-7`은 Q-2(textarea 적용) 확정에 따른 쌍이다.

---

## 11. 재검토가 남긴 교훈

**v1은 「①이 고쳐졌다」만 보고 채택했다.** 같은 Provider에 의존하는 **②를 함께 재지 않았다** —
그런데 그 Provider는 전역이라 의존자가 전 세목에 걸쳐 있었다.

⇒ **전역 컴포넌트를 고칠 때는 「고치려는 것」과 「그것에 의존하는 것」을 한 probe에서 동시에 측정한다.**
`_probe-hangul6.spec.ts`가 그 형태이고, 그것이 v1을 뒤집었다.
