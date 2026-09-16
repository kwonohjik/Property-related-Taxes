# 이력 「편집」이 다건 record를 단건 마법사로 보낸다 (수정 계획서)

> 상태: **Done** — 구현·검증 완료(2026-09-16). 실행 결과는 §11.
> 작성일: 2026-09-16
> 세목: 양도소득세 / 이력 재계산 진입(`/history` · 상세 드로어)
> 기준 커밋: `7072c922` — ⚠️ 머지 후 file:line은 드리프트한다. 재검토 시 전수 대조할 것.

---

## 0. 한 줄 요약

이력의 **다건(연간 합산) record**를 「편집」하면 **단건 마법사로 간다**. 다건 자산은 하나도 실리지 않고 **직전 단건 세션의 입력이 그대로 남으며**, 그 위에 다건 record의 **정정 플래그가 주입**된다 — 세액이 바뀌는 혼합 상태다. 양도세 resume 분기를 **공유 헬퍼 하나**로 빼고 다건은 다건 마법사로 보낸다.

---

## 1. 발견 경위

PR #1637(이력→다건 합산 진입) 작업 중 코드 판독으로 발견해 「별건·미검증」으로 기록했고(그 계획서 §9), 이후 **Playwright probe로 실측**했다. 예상보다 나빴다 — 「빈 폼이 열릴 가능성」이 아니라 **다른 계산의 입력 + 남의 정정 플래그**였다.

---

## 2. 실측 (Playwright probe, 2026-09-16)

**설정**: 단건 마법사에 「직전 작업」(소재지 `직전 단건 소재지 PROBE` · 양도일 2026-02-02 · 계약금액 111,111,111)을 남긴 뒤, 자산 2건 + 경정청구 플래그를 가진 **다건 record**를 이력에 시드하고 카드 「편집」 클릭.

| # | 관측 | 판정 |
|---|---|---|
| 1 | URL → `/calc/transfer-tax` (**단건** 마법사) | 🔴 오라우팅 |
| 2 | `assets[0].addressJibun` = `직전 단건 소재지 PROBE` · `transferDate` = `2026-02-02` · `contractTotalPrice` = `111111111` | 🔴 **다건 자산 2건이 하나도 실리지 않고**, 직전 단건 세션이 그대로 남는다 |
| 3 | `amendmentMode: true` · `correctionKind: "refund_claim"` · `originalDeterminedTax: "999999999"` · `statutoryFilingDeadline: "2027-05-31"` | 🔴 **정정 플래그 주입** |
| 4 | 단건 폼에 `__multiTransfer` · `properties` · `taxYear` · `activeStep` · `priorPaidTax` 잔존 | 🔴 다건 전용 키 오염 |

### 2-1. 왜 이렇게 되는가

`handleResume`의 transfer 분기는 `updateFormData(migrated)` **단순 merge**다(`app/history/HistoryClient.tsx:277~` · `components/history/HistoryDetailDrawer.tsx:123~`). 다건 `inputData`에는 **`assets`가 없다** ⇒ `migrateAsset` 경로도 타지 않고(`Array.isArray(input?.assets)`가 false), 단건 `assets`는 **아무것도 덮이지 않은 채** 남는다.

### 2-2. 🔴 정정 플래그가 같은 이름인 것은 **의도된 설계**다

`MultiTransferFormData`는 `AmendmentBlock`을 폼 캐스팅으로 재사용하려고 단건 `TransferFormData`와 **필드명을 일부러 맞췄다**(`lib/stores/multi-transfer-tax-store.ts:62~` 주석 「단건 TransferFormData와 동일 필드명 — AmendmentBlock을 form 캐스팅으로 재사용하기 위한 전제」).

⇒ 그 설계 자체는 옳다. **결함은 「그 폼을 단건 store에 부어도 되는가」를 묻지 않은 쪽**에 있다. 필드명 일치를 되돌리는 방향으로 고치면 안 된다(memory `feedback_deliberate_design_looks_like_the_defect`).

경정청구 모드는 당초 결정세액을 차감하므로 **세액이 바뀐다** — 표시만의 문제가 아니다.

### 2-3. 2차 경로 (코드 판독만, 미실측)

오염된 폼으로 계산·저장하면 이력 `inputData`에 `__multiTransfer: true`가 섞인다. `lib/calc/cross-104-5-recalc.ts:63`이 **바로 그 플래그로** 다자산/단건을 가른다 ⇒ §104⑤ 크로스 화면이 단건 이력을 다자산으로 오분류할 수 있다. **V-4에서 실측한다.**

---

## 3. 안전망 실측 — **0건**

「편집」의 **동작**을 단언하는 테스트가 하나도 없다:

- `e2e/transfer-amendment.spec.ts:251` — 「편집」이라는 **라벨이 보이는가**만 단언한다(`"수정"` 라벨 폐기 확인용). 눌러 보지 않는다.
- `e2e/inheritance-edit-restore.spec.ts` — 상속세 축이다.
- `__tests__`에 `handleResume` 참조 **0건**.

⇒ 이 결함은 게이트를 하나도 건드리지 않고 살아 있었다. 고칠 때 **동작을 단언하는 안전망을 같이 만든다**.

---

## 4. 드리프트 실측 — 두 `handleResume` 사본이 **3축**에서 갈라져 있다

같은 기능이 카드와 드로어에 **복제**돼 있고, 이미 한 번 결함을 냈다(2026-09-07 「목록의 편집 버튼만 `migrateAsset`이 빠져 있었다」 — `HistoryClient.tsx:283~291` 주석에 그 실측이 남아 있다). 지금 다시 벌어져 있다:

| 축 | 카드(`HistoryClient`) | 드로어(`HistoryDetailDrawer`) |
|---|---|---|
| 라우트 맵 | **8종** (+`stock_transfer`·`stock_valuation`) | **6종** |
| 세목 분기 | transfer·gift·inheritance·**stock_transfer**·stock_valuation | transfer·gift·inheritance·stock_valuation |
| 의뢰인 자동선택 | ✅ | ❌ |
| 건물 기준시가 스냅샷 복원 | ✅ | ❌ |
| `editingCalculationId` 정리 | ✅ | ❌ |

> 📌 드로어의 `stock_valuation` 분기는 **도달 불가 dead code**다 — 그 라우트 맵에 `stock_valuation`이 없어 버튼 자체가 렌더되지 않는다. 언급만 하고 **이번에 지우지 않는다**(Surgical Changes).

---

## 5. 범위 결정 (Q-1 — **확정: 안 C**, 사용자 2026-09-16)

| 안 | 내용 | 장단 |
|---|---|---|
| **A. 최소** | 두 사본에 `multi` 분기만 각각 추가 | diff 최소. 그러나 **복제가 그대로 남아** 다음 드리프트를 예약한다 |
| **C. 양도세 한정 통합** ⭐권장 | 양도세 resume 분기 + 공통 부수효과(의뢰인·스냅샷·플래그 정리)를 **`lib/calc/transfer-resume-entry.ts` 하나**로 빼고 두 호출부가 그것을 부른다. 다른 세목 분기는 **그대로 둔다** | 이번 결함의 원인(양도세 분기 복제)만 단일화. 폭발 반경이 양도세로 한정된다. 드리프트 3축 중 의뢰인·스냅샷 2축도 함께 해소 |
| **B. 전면 통합** | `handleResume` 전체를 단일 소스로 | 드리프트가 근본 해소되나 **6세목 전부**가 폭발 반경. 이번 결함과 무관한 축까지 건드린다 |

**권장 C.** 「안 깨진 것을 리팩터하지 않는다」와 「복제가 이미 두 번 결함을 냈다」 사이의 균형점이다. B는 `stock_valuation` dead code·라우트 맵 차이까지 정리해야 해서 별건이 된다.

> ✅ **안 C로 확정됐다**(2026-09-16). 이하 §6 설계가 그대로 정본이다.

---

## 6. 설계 (안 C 전제)

### 6-1. 판별자 — 「이 record는 다건 입력인가」

```ts
function isMultiTransferInput(input: unknown): boolean {
  // 다건 자동저장은 `{ __multiTransfer: true, ...form }`으로 저장한다
  // (MultiTransferTaxCalculator의 autoSaveInput). 그 플래그 이전 저장분을 위해
  // `properties` 배열 존재도 함께 본다 — **안전측 superset**.
}
```

⚠️ **`classifyAmendableTransfer`를 그대로 쓰면 안 된다.** 그쪽은 **`resultData`** 기준(`mode === undefined && Array.isArray(rd.properties)`)이고, resume이 필요로 하는 것은 **`inputData`의 모양**(무엇을 hydrate할 것인가)이다. 두 축은 목적이 다르다.

⚠️ `cross-104-5-recalc.ts:63`도 `inputData.__multiTransfer`로 같은 판정을 한다 — **지금은 손대지 않는다**(§9). 판별자 단일화는 별건이다. 이 계획서가 그 사실을 기록해 둔다.

### 6-2. `lib/calc/transfer-resume-entry.ts` (신규)

```ts
/** 양도세 이력 재계산 진입. 차단 사유를 문자열로 돌려준다(null이면 진입 성공). */
export function resumeTransferRecord(
  record: CalculationRecord,
  router: AppRouter,
): string | null;
```

동작:

1. **공통 부수효과** — `sessionStorage.removeItem("editingCalculationId")` · `record.clientId`면 `setActiveClientId` · `buildingStdSnapshots` 복원. (지금 카드에만 있는 3축을 헬퍼로 올려 드로어도 함께 받는다.)
2. **단건 입력**(`!isMultiTransferInput`) → 현행 그대로: `assets`를 `migrateAsset`에 통과시켜 `updateFormData` → `setStep(0)` → `/calc/transfer-tax`.
3. **다건 입력 + 모든 `properties[].form` 존재** → `useMultiTransferStore.setForm({ ...input, activeStep: "list", activePropertyIndex: 0 })` → `/calc/transfer-tax/multi`.
   - 🔑 **정정 플래그는 record에 저장된 그대로 복원한다.** 「편집」은 *그 신고서를 다시 여는 것*이므로 그 신고서가 수정신고였다면 수정신고인 채로 열려야 한다. ⚠️ **합산 진입(`enterMultiAggregate`)과 반대**다 — 그쪽은 **새 확정신고**라 기본값에서 시작한다. 두 진입의 의미가 다르므로 규칙도 달라야 한다.
4. **다건 입력이지만 `properties[].form`이 없는 구 stub** → **진입하지 않고 사유를 반환**한다.
   - 🔴 **당초 근거는 틀렸다** — 「`p.form.assets[0]`을 읽어 TypeError로 깨진다」고 적었으나 **V-3 실측 결과 깨지지 않았다**(§11-1). 차단 근거를 **「복원할 입력이 아예 없다」**로 정정한다. `classifyAmendableTransfer`가 stub을 배제하는 근거와 같다.
   - `classifyAmendableTransfer`도 같은 이유로 stub을 배제한다(`transfer-amendment-entry.ts:76~79`) — 같은 층위의 판단이다.

### 6-3. 호출부

- `HistoryClient.handleResume`: transfer 분기를 `resumeTransferRecord` 호출로 교체. 차단 사유가 오면 기존 `setError(...)`로 표시한다(이미 에러 배너가 있다 — `HistoryClient.tsx:511~515`).
- `HistoryDetailDrawer.handleResume`: 동일. 드로어에는 에러 표시 자리가 없으므로 **로컬 state 하나**를 추가해 버튼 아래에 사유를 띄운다.

---

## 7. 검증 계획

### V — Do 전/중 실측

| ID | 항목 | 방법 |
|---|---|---|
| **V-1** | 다건 record 편집 → `/multi`에 자산 2건이 **record의 것**으로 뜬다 | E2E(§7-3) |
| **V-2** | 단건 store가 **오염되지 않는다** — `__multiTransfer`·`properties`·`amendmentMode`가 들어가지 않는다 | E2E에서 sessionStorage 직접 확인(probe와 동일 수법) |
| **V-3** | stub 다건 record가 실제로 화면을 깨뜨리는가 | throwaway probe로 재현 후 차단 문구 확정. **깨지지 않으면** 차단 대신 그대로 진입시킨다(불필요한 차단 금지) |
| **V-4** | 2차 경로 — 오염된 폼으로 저장한 이력이 §104⑤ 크로스에서 다자산으로 오분류되는가 | 수정 **전** 상태에서 1회 실측. 재현되면 이 계획서에 기록하고, 수정으로 **원인이 사라지는지**까지 확인 |

### Pre-Do anchor (`__tests__/lib/calc/transfer-resume-entry.predo.anchor.test.ts`)

- **R-1** 단건 record → 단건 store에 `assets` hydrate(migrate 통과) · push `/calc/transfer-tax` · multi store **무변경**.
- **R-2** 다건 record → multi store에 `properties` 2건 hydrate · push `/calc/transfer-tax/multi` · **단건 store 무변경**(오염 0).
- **R-3** 다건 record의 정정 플래그가 **그대로 복원**된다(합산 진입과 반대 규칙임을 고정).
- **R-4** stub 다건 record → **차단 사유 반환** · 어느 store도 바뀌지 않는다 · `push` 호출 0회.
- **R-5** 공통 부수효과: `clientId`가 있으면 `activeClientId` 설정(드로어 경로에서도).

### 뮤테이션 probe

| 뮤테이션 | 기대 |
|---|---|
| `isMultiTransferInput`을 항상 false로 | R-2·R-3 실패 (= 현행 결함의 재현) |
| stub 가드 제거 | R-4 실패 |
| 단건 분기에서 `migrateAsset` 제거 | R-1 실패 — 2026-09-07에 한 번 빠졌던 축이다 |
| 공통 부수효과에서 `setActiveClientId` 제거 | R-5 실패 |
| 다건 분기에서 정정 플래그를 기본값으로 초기화 | R-3 실패 |

### E2E — `e2e/history-resume-multi-record.spec.ts` (probe 승격)

다건 record(자산 2건 + 경정청구 플래그) 시드 + 단건 세션에 「직전 작업」 주입 →
`/history` 「편집」 → **`/calc/transfer-tax/multi`** 도달 · 자산 2건이 record의 양도일로 표시 ·
**단건 store에 다건 키·정정 플래그가 없다**.

- 드로어 경로(`이 조건으로 재계산`)도 같은 결과인지 **함께** 단언한다 — 두 호출부가 갈라진 것이 이 결함의 뿌리다.
- Playwright 요약의 마지막 `N passed`가 아니라 **exit code**로 판정한다.

---

## 8. 커밋 계획

1. `test(이력): 다건 record 편집 Pre-Do anchor R-1~R-5 (실패 확인)`
2. `fix(이력): 다건 양도세 record를 다건 마법사로 — 단건 폼 오염·정정 플래그 주입 제거`
3. `test(이력): 다건 record 편집 E2E — 카드·드로어 양 경로`
4. `docs(이력): 계획서 실측·결정 환류`

---

## 9. 범위 외

1. **나머지 세목 `handleResume` 통합**(안 B) — 별건.
2. **드로어 라우트 맵에 `stock_transfer`·`stock_valuation` 추가**, 그리고 도달 불가 `stock_valuation` 분기 정리 — 별건. **언급만 하고 지우지 않는다.**
3. **`__multiTransfer` 판별자 단일화**(`cross-104-5-recalc.ts`와 공유) — 별건. §6-1에 사실만 기록.
4. 이력 카드의 다건 record 「납부세액」 표시 — probe에서 `-`로 보였으나 **fixture에 `totalTax`를 넣지 않은 탓일 수 있다**. 단정하지 않는다. 확인하려면 실제 다건 계산을 저장해 볼 것.

---

## 10. 레지스터

### 사용자 결정 (Q → 확정)
- **Q-1 ✅ 안 C(양도세 한정 통합)** — 2026-09-16 확정. 미결 Q **없음**.

### 확정 (D)
| ID | 결정 | 근거 |
|---|---|---|
| D1 | 다건 record는 **다건 마법사**로 보낸다 | §2 실측 |
| D2 | 판별자는 **`inputData`** 기준(`classifyAmendableTransfer` 재사용 금지) | §6-1 — resume은 「무엇을 hydrate하는가」의 문제다 |
| D3 | 「편집」은 정정 플래그를 **그대로 복원**한다(합산 진입과 반대) | §6-2 — 두 진입의 의미가 다르다 |
| D4 | 필드명 일치는 **되돌리지 않는다** | §2-2 — 의도된 설계다 |
| D5 | stub 다건은 **차단하고 사유를 말한다**(V-3에서 필요성 확인 후) | §6-2 |
| D6 | 범위 = **안 C**(양도세 한정 통합). 다른 세목 분기·라우트 맵·dead code는 건드리지 않는다 | §5 · 사용자 확정 |

---

## 11. 실행 결과 (2026-09-16)

### 11-1. V 실측

| ID | 결과 |
|---|---|
| **V-1** | ✅ 다건 record 편집 → `/calc/transfer-tax/multi`에 record의 자산 2건(2026-04-20·2026-08-08). E2E로 고정. |
| **V-2** | ✅ 단건 store 오염 0 — `__multiTransfer`·`properties`·`taxYear`·`activeStep` 없음, `amendmentMode=false`·`correctionKind="amend"`. anchor + E2E 양쪽. |
| **V-3** | 🔴 **가설이 틀렸다.** stub property(`form` 부재)로 다건 화면에 들어가도 **크래시하지 않는다**(pageerror 0건). ⇒ 차단 근거를 「크래시 방지」에서 **「복원할 입력이 없다」**로 정정하고 차단은 유지했다(§6-2). **코드 판독으로 단정했던 것을 실측이 뒤집은 사례.** |
| **V-4** | ✅ **재현됐다.** 오염된 단건 이력(`__multiTransfer`·`properties` 잔존)을 `checkRealEstateRecalc`에 넣으면 `{ok:true, kind:"multi"}` — 정상 단건은 `kind:"single"`. §104⑤ 크로스가 **남의 자산으로 재계산**하게 된다. 수정으로 오염 자체가 사라져 이 경로도 함께 닫힌다. |

### 11-2. 뮤테이션 — 전부 구별력 확인

| 뮤테이션 | vitest | E2E |
|---|---|---|
| `isMultiTransferInput` 항상 false (= 종전 결함 재현) | 6 failed | **3 failed(전건)** |
| stub 가드 제거 | 1 failed | — |
| `migrateAsset` 제거 | 1 failed | — |
| `setActiveClientId` 제거 | 1 failed | — |
| 다건 분기에서 정정 플래그 초기화 | 1 failed | — |

### 11-3. 게이트

- `npx tsc --noEmit` 0건 · `npm run lint` 0 errors
- `npm test` **2043 파일 / 21,431 통과 · 회귀 0건**
- `npx playwright test e2e/history-resume-multi-record.spec.ts` 3 passed

### 11-4. 설계 대비 변경

- `resumeTransferRecord`는 **async**다(`Promise<string | null>`). `calc-wizard-store`는 순환 참조 때문에 **동적 import**해야 한다 — `transfer-amendment-entry.ts`가 같은 이유로 그렇게 한다. 그 결정을 따랐다.
- 카드 「편집」 버튼에 `data-testid={`resume-${record.id}`}`를 달았다. 종전 E2E는 라벨·인덱스로 집었는데, 같은 라벨이 카드마다 있어 **어느 카드의 버튼인지 지정할 수 없었다**.
- 드로어에는 차단 사유를 띄울 자리가 없어 로컬 state + amber 안내를 추가했다(`data-testid="drawer-resume-blocked"`).

### 11-5. 🆕 작업 중 발견 — 다건 화면 **새로고침마다 빈 자산이 1건씩 늘어난다** (별건·미수정)

V-3 측정 중 잡혔다. `/calc/transfer-tax/multi`에서 새로고침을 반복하면 persist된 자산 수가 **1 → 2 → 3**으로 늘고 라벨이 전부 「양도 1번」이 된다(실측).

원인(판독): 마운트 `useEffect(..., [])`가 **zustand persist 리하이드레이션 전** 스냅샷(`properties.length === 0`)을 보고 `handleAddProperty()`를 부른다(`MultiTransferTaxCalculator.tsx:430~432`).

- 이번 수정과는 **무관하다** — `router.push`는 클라이언트 내비게이션이라 store가 메모리에 남아 이 레이스를 타지 않는다(E2E에서 자산이 정확히 2건인 것으로 확인).
- 그러나 사용자가 그 화면에서 F5를 누르면 겪는다. **별건으로 고칠 것**. 원인 축이 다르고(리하이드레이션 타이밍) 잘못 고치면 「첫 진입 시 자산 자동 추가」가 사라진다.
