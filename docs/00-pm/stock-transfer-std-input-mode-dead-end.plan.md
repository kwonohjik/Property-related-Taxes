# 주식양도세 — `transferStdInputMode` daily 모드 dead-end 수정 계획서

> **출처**: `stock-listed-conversion-1month-kiwoom-autofetch.plan.md` §4-1 **F-10**
> — 「이번 트랙 범위 밖이지만 … 별도 트랙으로 남긴다」로 기록만 하고 넘어간 인접 잠재 결함.
>
> **작성**: 2026-08-31 · **검증 깊이 L2**(여러 파일 · 입력 경로 · **세액 불변**)
> **상태**: 착수 전 (Phase 0 안전망 실측만 **완료**)

---

## 0. 요청과 범위

F-10으로 기록해 둔 dead-end를 실제로 고친다.

- **범위 안**: `transferStdInputMode`가 「취득 후 상장」 축 밖에서 차단을 일으키는 것을 없앤다.
- **범위 밖**: 일반 §163⑨ 경로에 일자별 입력 표·모드 라디오를 신설하는 것(Q-2에서 기각 제안).

---

## 1. 결함 실측

### 1-1. 재현 — 추정이 아니라 실행 결과다

throwaway probe(`__tests__/f10-probe.test.ts`, 실행 후 삭제)로 `validateStep2Domestic`를
직접 호출했다. 폼은 **상장 + 환산 + 거래정지 아님 + 취득후상장 아님**, 분모·분자 평균은
**정상 입력**(56,590 / 51,000) 상태다.

| `transferStdInputMode` | 차단 결과 |
|---|---|
| `"direct"` | (양도가액 합계 미입력 오류만 — probe 노이즈) |
| **`"daily"`** | 🔴 **`transferPriceClosing`**: 「일자별 입력 모드: 양도일 이전 1개월 거래일 종가를 1셀 이상 입력하세요」 |

**평균은 이미 유효한데 차단된다.** 그리고 그 종가를 넣을 표는 이 화면에 **없다**.

### 1-2. 왜 입력 경로가 없는가 — 두 블록이 «상호배타»다

| 렌더 조건 | 파일:줄 |
|---|---|
| 일반 §163⑨ 환산 블록 | `app/calc/stock-transfer-tax/steps/Step2.tsx:393` — `!tradingHaltAtTransfer && `**`!acquiredBeforeListing`** |
| 「취득 후 상장」 카드(모드 라디오·일자별 표 보유) | `Step2.tsx:465` — `((!haltT && !haltA) \|\| `**`acquiredBeforeListing`**`)` |

라디오는 `PostListingValuationCard.tsx:117-135`, 일자별 표는 같은 파일 `:156-166`으로
**둘 다 `acquiredBeforeListing` ToggleCard의 children**이다
(`ToggleCard.tsx:303`이 `{checked && children}`이라 OFF면 children이 아예 없다).

⇒ 일반 블록이 보이는 동안 라디오·표는 **한 번도 렌더되지 않는다**.

### 1-3. 그런데 validate는 그 축을 안 본다

`lib/calc/stock-transfer-tax-validate-step2.ts:290-322`

```
290  } else if (acquisitionMode === "estimated") {
292    if (isListed) {
294      if (!form.tradingHaltAtTransfer) {                    ← 거래정지만 본다
296        const mode = form.transferStdInputMode || "direct"; ← acquiredBeforeListing 미참조
297        if (mode === "direct") { … 평균 필수 … }
305        else { … transferPriceClosing 1셀 이상 필수 … }      ← 🔴 여기
```

**`acquiredBeforeListing`이 조건에 없다.** 그래서 일반 경로에도 daily 규칙이 그대로 적용된다.

### 1-4. dead-end에 빠지는 두 가지 상태

| # | 경로 | 결과 |
|---|---|---|
| **S-1** | 토글 ON → daily 선택 → 토글 **OFF** | 모드가 `daily`로 남는다. `normalize`(`calc-wizard-stock-normalize.ts:150` `enumField`)가 그대로 보존하므로 **새로고침·세션 복원 뒤에도 살아남는다** |
| **S-2** | 위 상태에서 **취득일 거래정지만** ON | `Step2.tsx:465` 게이트가 `(false \|\| false)`가 되어 카드가 **숨는다**. 반면 validate의 daily 분기는 `!tradingHaltAtTransfer`라 **여전히 돈다** — 되돌릴 토글조차 화면에서 사라진다 |

> ⚠️ S-2가 더 나쁘다. S-1은 토글을 다시 켜 direct로 바꾸는 **우회**가 남아 있지만,
> S-2는 그 토글 자체가 렌더되지 않는다.

### 1-5. 지금은 «부분» 우회가 하나 더 있다 — 그러나 조건부다

직전 트랙(Phase 4)이 키움 자동조회를 일반 블록으로 옮겼고(`Step2.tsx:410`),
양도일 축 `onFill`이 `transferPriceDates`·`transferPriceClosing`을 채운다
(`KiwoomAutoFetchButton.tsx:172-173`). 클릭하면 차단이 풀린다.

**그러나 종목코드가 없거나 키움 키가 미설정이면 그 버튼은 동작하지 않는다.**
dead-end가 「사라진」 것이 아니라 「가려진」 것이다.

### 1-6. 세액 영향 — 없다 (근거)

`transferStdInputMode`를 읽는 곳은 엔진 통틀어 **한 줄**이다:

- `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts:144` — `input.acquiredBeforeListing` **분기 안**
- 쓰임은 `:148` `valuationDetail.transferDailyModeUsed` / `transferDailyAverage` **표시 echo**뿐
- 그 echo를 읽는 화면은 `components/calc/results/PostListingDetailCard.tsx:189` **하나**(취득후상장 결과 카드)

⇒ 일반 §163⑨ 경로에서 이 필드는 **계산에도 표시에도 도달하지 않는다**.
   다만 이것은 **부정형 단언**이므로 P-5 뮤테이션으로 확증한다(§6).

---

## 2. 안전망 실측 (Phase 0 — **완료**, 2026-08-31)

바꾸려는 동작을 먼저 무력화하고 쟀다 — [[feedback_pre_change_safety_net_probe]].

| probe | 무력화 | 결과 |
|---|---|---|
| **P-0** | `validate-step2.ts:296`을 `form.acquiredBeforeListing ? (mode) : "direct"`로 치환 (= 이번 수정의 예행) | `__tests__/calc` + `__tests__/components` + `__tests__/tax-engine/stock-transfer` → **558파일 5,366건 전부 통과** |

### 🔴 안전망 **0건**

그리고 그 0건이 「측정 실패」가 아님을 대조로 확인했다 — [[feedback_negative_assertion_needs_mutation_probe]]:

- 뮤테이션 적용 상태에서 probe를 재실행하니 `transferPriceClosing` 오류가 **사라졌다**
  ⇒ 뮤테이션은 실제로 그 분기에 닿았다(no-op이 아니다).
- grep: 「일자별 입력 모드」·「자동 평균 산정 실패」 두 메시지를 단언하는 테스트 **0건**
  (`__tests__`·`e2e` 전수).

⇒ **바꿔도 아무도 안 잡는다. 바꾼 뒤를 고정할 신규 anchor가 필수다.**

---

## 3. 원인 판정 — 필드의 «소유 축»과 validate의 축이 어긋났다

`transferStdInputMode`는 사실상 **§165⑤ 취득후상장 경로 전용 필드**다:

| 축 | 위치 | 게이트 |
|---|---|---|
| 입력(⑤) | `PostListingValuationCard.tsx:117` | `acquiredBeforeListing` 안 |
| 엔진 소비 | `stock-acquisition-basis.ts:144` | `input.acquiredBeforeListing` 안 |
| 결과 표시(⑦) | `PostListingDetailCard.tsx:189` | 취득후상장 결과 카드 |
| **검증(⑧)** | `validate-step2.ts:296` | 🔴 **게이트 없음** |

⑤·엔진·⑦은 모두 같은 축 안에 있는데 **⑧만 축 밖으로 새어 있다.**
[[feedback_ui_mode_flag_not_domain_semantics]]의 반대 방향 사례 — 모드 플래그를
그 축 밖에서 도메인 규칙처럼 읽고 있다.

---

## 4. 선택지와 결정 게이트

### Q-1. 어디까지 고칠 것인가

| 안 | 내용 | dead-end 해소 | stale 값 |
|---|---|---|---|
| **A (필수)** | validate의 daily 분기를 `acquiredBeforeListing` 축 안으로 넣는다 | ✅ **완전** — stale 값이 어디서 오든 무관 | 남음(무해) |
| **B (보강)** | 토글 OFF patch + normalize에서 `direct`로 정규화 | ✅(A와 중복) | 청소됨 |
| C | 라디오·일자별 표를 일반 경로에도 노출 | ✅ | — |

**제안: A + B.**

- **A가 최소 완결 수정**이다. B 없이도 dead-end는 사라진다.
- B를 더하는 이유는 **저장값 위생**이다. UI 게이트만으로는 stale 저장값이 남고
  validate 차단은 dead-end가 된다는 것을 입주권 축 트랙에서 이미 겪었다
  ([[feedback_ui_gate_removes_sole_input_path]] · `project_right_to_move_in_asset_kind_axis`).
- **C는 기각 제안** → Q-2.

### Q-2. 일반 §163⑨ 경로에 daily 모드를 열 것인가

**기각을 제안한다.**

- 일반 경로에는 이미 **키움 자동조회 2축**이 있다(Phase 4·5). 일자별 32셀 수기 입력의
  실익이 낮다.
- 직전 트랙에서 「Phase 4에서 라디오를 함께 빼면 부수적으로 해소되나, 그것은 **요청 밖
  확장이므로 하지 않는다**」고 명시적으로 결정했다(F-10 원문). 그 결정을 뒤집을 새 근거가
  없다 — Simplicity First.
- 열게 되면 ⑤⑥⑦⑧ + E2E까지 파급되어 **L2가 아니라 신규 기능**이 된다.

> 두 Q 모두 사용자 결정 대상이다. **결정 전 착수 금지** — [[feedback_plan_gate_survives_after_override]].

### ✅ 결정 (사용자 · 2026-08-31)

| ID | 결정 | 채택 근거 |
|---|---|---|
| **Q-1** | **A + B** (제안대로) | A가 dead-end를 완결 해소하고, B가 저장값을 청소한다. 입주권 축 트랙에서 「UI 게이트만으론 stale 저장값이 남는다」를 이미 겪었다 |
| **Q-2** | **기각** (제안대로) | 일반 경로에 daily 모드를 열지 않는다. 직전 트랙의 「요청 밖 확장」 판단을 유지 |

⇒ **C안은 이 트랙에서 재제안하지 않는다.** §5(A+B)와 §9(범위 밖)가 정본이다.

---

## 5. 설계 (Q-1 = A+B 채택 가정)

### 5-1. ⑧ validate — 축 정렬 (**필수**)

`lib/calc/stock-transfer-tax-validate-step2.ts:296`

```
- const mode = form.transferStdInputMode || "direct";
+ // §163⑨ 일반 경로에는 모드 라디오·일자별 표가 없다(둘 다 취득후상장 ToggleCard children).
+ // 그 축 밖에서 daily를 검사하면 입력 UI 없이 차단되는 dead-end가 된다.
+ const mode = form.acquiredBeforeListing ? (form.transferStdInputMode || "direct") : "direct";
```

- 취득후상장 경로의 daily 검증은 **그대로 살아 있다**(정당한 차단 — FD-3이 지킨다).
- 일반 경로는 direct 규칙으로 떨어져 「평균 미입력」은 **여전히 차단**된다(과소 차단 방지 — FD-2).

### 5-2. ⑤ 토글 OFF patch — 단일 배치로 정규화

`components/calc/stock-transfer/PostListingValuationCard.tsx:95`

```
- onCheckedChange={(v) => onChange({ acquiredBeforeListing: v })}
+ onCheckedChange={(v) =>
+   onChange(
+     v
+       ? { acquiredBeforeListing: true }
+       : { acquiredBeforeListing: false, transferStdInputMode: "direct" },
+   )
+ }
```

⚠️ **반드시 한 번의 patch로 보낸다.** 두 번 나눠 부르면 뒤 호출이 앞의 spread를
덮어쓴다 — [[feedback_multikey_patch_stale_spread_overwrite]].

### 5-3. ③ normalize — 저장된 stale 값 정규화

`lib/stores/calc-wizard-stock-normalize.ts:150` 부근. `acquiredBeforeListing`이 false이면
모드를 `"direct"`로 강제한다. 5-2가 못 잡는 **이미 저장된 폼**(세션 복원·이력 재진입)이 대상.

> `useEffect → store` 미러링으로 구현하지 않는다 — [[feedback_useeffect_store_mirror_forbidden]].
> 정규화는 normalize 안에서 끝낸다.

### 5-4. 건드리지 않는 것

- ④ `stock-transfer-tax-api.ts:270` · ⑫ `stock-transfer-tax-schema.ts:284` ·
  ⑭ `stock-transfer-engine-input.ts:80` — 엔진이 축 안에서만 읽으므로 **무해**하고,
  5-3 이후엔 애초에 daily가 오지 않는다. 손대면 범위 확대다(Surgical Changes).
- `Step1.tsx:228-236`(양도일 변경 시 daily 표 리셋) — 취득후상장 경로에서 여전히 유효.

---

## 6. anchor 계획 + 뮤테이션 역검증

**안전망 0건이므로 anchor를 먼저 심는다** — [[feedback_pre_anchor_verification]].

신규: `__tests__/calc/stock-std-input-mode-axis.anchor.test.ts` (FD-1~4) ·
`__tests__/components/post-listing-toggle-off-normalizes-mode.anchor.test.tsx` (FD-5·6)

| ID | 단언 | 성격 |
|---|---|---|
| **FD-1** | 일반 경로 + stale `daily` + 평균 유효 → `transferPriceClosing` 오류 **0건** | 결함 고정 해제 |
| **FD-2** | 일반 경로 + 평균 **미입력** → direct 메시지로 **차단된다** | 🔑 과소 차단 방지(반대편) |
| **FD-3** | 취득후상장 ON + `daily` + 종가 미입력 → **종전대로 차단** | 정당한 차단 보존 |
| **FD-4** | normalize에 `{acquiredBeforeListing:false, transferStdInputMode:"daily"}` → `"direct"`로 나온다 | 5-3 |
| **FD-5** | 토글을 **OFF**로 바꾸면 patch에 `transferStdInputMode:"direct"`가 **동승**한다 | 5-2 |
| **FD-6** | 토글을 **ON**으로 바꿀 때는 모드를 **건드리지 않는다** | 🔑 FD-5의 대조군 |

E2E — `e2e/stock-listed-conversion-kiwoom-autofetch.spec.ts`에 **KA-5** 1건 추가:
토글 ON → 「일자별 입력」 선택 → 토글 OFF → 평균 입력 → **다음으로 넘어간다**.
컴포넌트 anchor는 patch를 보지만 **실제 사용자 플로우가 뚫리는지는 브라우저에서만** 안다
— [[feedback_browser_verify_with_playwright]].

### 뮤테이션 P-n (구현 후 — 각각 «정확히 그 anchor만» 실패해야 한다)

| ID | 무력화 | 실패해야 할 anchor |
|---|---|---|
| P-1 | 5-1 롤백(축 게이트 제거) | FD-1 · KA-5 |
| P-2 | 5-3 정규화 제거 | FD-4 |
| P-3 | 5-2에서 모드 동승 제거 | FD-5 |
| P-4 | daily 분기 자체를 삭제 | FD-3 (정당한 차단이 살아 있는지) |
| **P-5** | 일반 경로에서 `direct` ↔ `daily`를 바꿔 엔진 결과 대조 | **아무것도 실패하지 않아야** — §1-6 「세액 무영향」의 근거 |

> P-5는 통과가 정답인 유일한 probe다. 결과가 **세액·표시 모두 동일**해야 §1-6이 성립한다.
> 달라지면 이 계획서의 L2 판정 자체가 틀린 것이므로 **착수를 멈추고 재설계**한다.

---

## 7. Phase 계획

```
Phase 0  안전망 실측                                    ✅ 완료 (§2 — 0/5,366)
Phase 1  Q-1·Q-2 결정 수령                              ⛔ 게이트
Phase 2  anchor 선행 — FD-1~6 + KA-5
         verify: FD-1·FD-4·FD-5·KA-5는 «실패»한다(결함 존재 증명) ·
                 FD-2·FD-3·FD-6은 통과한다(대조군)
Phase 3  수정 — 5-1(⑧) → 5-2(⑤) → 5-3(③)
         verify: FD 전건 통과 · P-1~P-4 각각 지정 anchor만 실패 · P-5 무변화
Phase 4  전체 게이트
         verify: tsc 0 · lint 0 error · npm test 전건 · 주식 E2E
```

> **Phase 2의 verify가 «실패»인 것이 정상이다.** anchor가 심자마자 초록이면
> 결함을 겨누지 못한 것이다 — [[feedback_anchor_observes_wrong_stage]].

---

## 7-1. 실행 결과 (2026-08-31 — Phase 2~4 완료)

### Phase 2 — anchor 선행 (예정대로 «실패»했다)

| anchor | 수정 전 | 비고 |
|---|---|---|
| FD-1 | ✗ `transferPriceClosing` 차단 1건 | 결함 존재 증명 |
| FD-2 | ✗ 「자동 평균 산정 실패」가 뜬다 | 수정 후 「직접 입력」으로 바뀐다 |
| FD-3 | ✓ | 대조군 |
| FD-4 | ✗ `daily` 보존 | |
| FD-4b | ✓ | 대조군 |
| FD-5 | ✗ patch가 `{acquiredBeforeListing:false}`뿐 | |
| FD-6 | ✓ | 대조군 |
| KA-5 (E2E) | ✗ 「일자별 입력 모드」 오류 1건 | 브라우저 재현 |

> ⚠️ **KA-5의 도달 단언을 한 번 고쳤다.** 처음엔 `필요경비·신고`(Step3)로 도달을 봤으나
> 그것은 **StepWizard 단계 표시줄 라벨**(`StockTransferTaxCalculator.tsx:38`)이라
> **모든 단계에서 보인다** — 차단된 상태에서도 통과했다. Step3 «본문»에만 있는
> 「기본공제 (§103②)」로 교체했다. [[feedback_anchor_observes_wrong_stage]]의 UI 판.

### Phase 3 — 수정 3지점

| 지점 | 파일 | 내용 |
|---|---|---|
| ⑧ | `stock-transfer-tax-validate-step2.ts:302` | `acquiredBeforeListing` 축 게이트 |
| ⑤ | `PostListingValuationCard.tsx:95-107` | 토글 OFF 시 단일 배치 patch로 `direct` 동승 |
| ③ | `calc-wizard-stock-normalize.ts:53-61` | 저장값 정규화(`acquiredBeforeListing`을 literal 앞에서 먼저 계산) |

### 뮤테이션 역검증 — 전건 실측

| ID | 결과 |
|---|---|
| **P-1** | ✅ Phase 2가 곧 P-1이다(수정 전 = 축 게이트 없음) → FD-1·FD-2·**KA-5** 실패 |
| **P-2** | ✅ 동상 → FD-4 실패 |
| **P-3** | ✅ 동상 → FD-5 실패 |
| **P-4** | ✅ `mode`를 `"direct"` 상수로 치환 → **FD-3만** 실패(4/5 통과) |
| **P-5** | ✅ **무변화** — 일반 경로에서 `direct`↔`daily` 전체 result가 `toEqual` 일치 |

> P-5는 빈 결과의 자명한 일치가 아니다 — 같은 입력이 실제로 계산을 완주했다:
> `acquisitionPrice 54,073,157` · `estimatedDeduction 510,000` · `taxBase 2,916,843`.
> ⇒ **§1-6 「세액·표시 무영향」 확증. V-2 해소.**

### Phase 4 — 전체 게이트

```
tsc --noEmit   0건
lint           0 error · 314 warning (기존과 동일)
npm test       1,693파일 18,157건 통과 (skip 13 · todo 4)
E2E            취득후상장 토글을 쓰는 5 spec + §163⑨ 본체 = 14건 통과
```

---

## 8. 14 동기화 지점

**신규 필드 없음.** 기존 필드의 축 정합만 바꾼다.

| 지점 | 변경 |
|---|---|
| ③ normalize | ✅ 5-3 |
| ⑤ UI 위젯 | ✅ 5-2 (patch만 — 위젯 신설 없음) |
| ⑧ validation | ✅ 5-1 |
| ①②④⑥⑦⑨~⑭ | 무변경 (§5-4 근거) |

---

## 9. 범위 밖 — 인지하되 손대지 않는다

- **일반 경로에 `transferPriceDates`/`Closing`이 쓰이지만 표는 없다.** Phase 4의 키움
  버튼이 그 배열을 채우는데(`KiwoomAutoFetchButton.tsx:172-173`) 일반 블록엔 표가 없다.
  버튼 자신의 결과 카드가 구간·평균을 보여주므로 **표시 공백은 아니고**, 5-1 이후 그
  배열은 검증에도 안 쓰인다. **무해한 잔재**로 남긴다.
- Q-2에서 기각한 「일반 경로 daily 모드 개방」.

---

## 10. 미검증 레지스터 V-n

| ID | 항목 | 검증 방법 | 상태 |
|---|---|---|---|
| V-1 | S-2(취득일 거래정지만 ON) 조합에서 카드가 실제로 숨는지 | `Step2.tsx:465` 게이트 논리 판정 | ⚠️ **미확인으로 남긴다** |
| V-2 | §1-6 「세액·표시 무영향」 | P-5 뮤테이션 | ✅ 해소 (§7-1) |

> **V-1은 미확인 상태로 종결한다.** 수정 5-1이 S-1·S-2를 «함께» 덮으므로 설계를 가르지
> 않고, 확정하려면 이 트랙 범위 밖의 조합 anchor가 필요하다. 다만 §1-4의 S-2 서술은
> **코드 논리 판정이지 런타임 실측이 아니다** — 그 구분을 남긴다
> ([[feedback_open_item_wording_is_also_unverified]]).

---

## 11. 성공 기준

- [x] 일반 §163⑨ 경로에서 stale `daily`로 인한 차단 **0건** (FD-1 · KA-5)
- [x] 취득후상장 경로의 daily 검증은 **그대로 유지** (FD-3 · P-4)
- [x] 평균 미입력은 **여전히 차단** (FD-2 — 과소 차단으로 넘어가지 않았다)
- [x] P-1~P-4가 각각 **지정 anchor만** 실패
- [x] P-5 무변화 — 세액·표시 불변 확증
- [x] tsc 0 · lint 0 error · `npm test` 전건 · 주식 E2E 통과

**상태: 구현 완료 · 머지 대기.**
