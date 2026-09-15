# 이력에서 단건 신고서를 골라 다건 합산으로 재계산 (계획서)

> 상태: **Done** — 구현·검증 완료(2026-09-16). 실행 결과는 §12.
> 작성일: 2026-09-16
> 세목: 양도소득세 / 연간 합산 과세(`/calc/transfer-tax/multi`)
> 기준 커밋: `9a0ce78e` — ⚠️ 머지 후 file:line은 드리프트한다(memory `feedback_merged_plan_citations_drift`). 재검토 시 전수 대조할 것.

---

## 0. 한 줄 요약

**이력 화면의 양도세 단건 카드에 「합산」 버튼을 추가**해, 같은 양도인(의뢰인)·같은 과세연도의 단건 신고서 여러 건을 체크박스로 골라 **다건 양도 세션으로 한 번에 편입**하고 `/calc/transfer-tax/multi`로 이동시킨다. 엔진·합산 로직·기납부세액 정산은 **이미 구현돼 있어 손대지 않는다** — 빠진 것은 **진입점 하나**다.

---

## 1. 배경 · 문제

### 1-1. 사용자 시나리오
같은 과세연도에 양도가 2회 나뉘어 발생하고, 각각 **단건으로 계산·저장**했다(첨부 이미지 — 의뢰인 「과세표준3」의 2026.01.05 양도 100,540,000원, 2026.10.05 양도 23,017,500원). 확정신고 시 두 건을 **합산**해 다시 계산하고 싶다.

### 1-2. 현행 경로 (실측)
합산 자체는 이미 된다. 다만 **진입 경로가 이력 화면에 없다**:

| 경로 | 현행 | 근거 |
|---|---|---|
| 단건 결과 화면 → 「동일연도 다른 양도건 계산하기」 | ✅ 있다 | `continueToMulti` (`app/calc/transfer-tax/transfer-calc-actions.ts:50`) |
| 다건 화면 → 「📂 이력에서 불러오기」 모달 | ✅ 있다 | `MultiTransferHistoryLoadModal.tsx` · `MultiTransferTaxCalculator.tsx:288` |
| **이력 화면 카드 → 합산** | ❌ **없다** | `app/history/HistoryClient.tsx:588~633` — 수정신고·경정청구·편집·삭제뿐 |
| **이력 상세 드로어 → 합산** | ❌ **없다** | `components/history/HistoryDetailDrawer.tsx:296~318` |

⇒ 지금 사용자가 이 시나리오를 완수하려면 **다건 계산기로 먼저 이동**한 뒤 모달을 **두 번** 열어 한 건씩 골라야 한다. "이력에서 같은 양도인의 신고서를 선택해 합산"이라는 흐름이 화면상 존재하지 않는다.

### 1-3. 「양도인」의 식별자 (실측)
폼에 **양도인 이름 필드는 없다**(`grep 양도인` — 부담부증여 주석뿐). 양도인을 가르는 유일한 축은 **`CalculationRecord.clientId`(세무사 모드 의뢰인)**이다(`lib/stores/professional-store.ts`). 첨부 이미지의 보라색 배지 「과세표준3」이 그 값이다(`HistoryClient.tsx:553~558`).
⇒ **개인 모드**는 전 이력이 본인 것이므로 `clientId === null` 그룹 하나로 동일하게 취급한다.

---

## 2. 법적 근거

이 기능은 **세법 판단을 새로 만들지 않는다**. 편입 대상·산식은 전부 기존 다건 엔진이 이미 적용하는 것이고, 그 조문은 선행 계획서에서 KoreanLaw MCP로 검증됐다(`docs/00-pm/transfer-multi-prepaid-settlement-history-load.plan.md` §2, 2026-07-05 검증):

- **소득세법 §111③** — 확정신고납부 시 예정신고 산출세액 등을 공제하여 납부. → 기납부세액 차감(`lib/calc/multi-prior-filed.ts`).
- **소득세법 §107②** — 2회 이후 예정신고는 러닝 합산. → **§2-A 주의**: 단건 이력의 결정세액은 **확정 basis**라 실제 예정신고 납부액과 다를 수 있어 **참고 추정값**이다. 현행 UI가 「자동 (참고)」 배지로 고지하고 사용자 수동확정을 요구한다(`AggregateSettingsPanel.tsx:48~56`).
- **조세특례제한법 §133**(감면 종합한도) · **소득세법 §102**(양도차손 통산) · **§104⑤**(비교과세) — 전부 집계 엔진에 연결 완료.

⚠️ **본 계획서는 위 조문 해석을 바꾸지 않는다.** 바꾸는 순간 이 절의 전제가 깨지므로, 엔진·`lib/calc/multi-transfer-tax-api.ts`의 payload 산식은 **건드리지 않는다**(§9 범위 외).

---

## 3. 현황 실측 — 재사용 가능한 인프라

| 구성요소 | 상태 | 근거(file:line) |
|---|---|---|
| 단건 record → `PropertyItem` 변환 | ✅ | `buildPropertyFromSingleRecord` (`lib/calc/transfer-multi-load-entry.ts:44`) — 라벨·`sourceCalculationId`·`priorPaidNational/Local` 포착 |
| 편입 가능 record 판별(겸용·부담부증여·일반건물 배제) | ✅ | `classifyLoadableTransfer` (`transfer-multi-load-entry.ts:20`) → `classifyAmendableTransfer` (`transfer-amendment-entry.ts:33`) 재사용 |
| 기납부세액 §111③ 자동 파생 | ✅ | `computeAutoPriorPaid` (`lib/calc/multi-prior-filed.ts`) — 신고일 필터 |
| 자산별 예정세액 self-heal | ✅ | `backfillPriorPaid` (`transfer-multi-load-entry.ts:80`) |
| 이력 → 다건 store hydrate + 의뢰인 자동선택 골격 | ✅ | `enterMultiAmendment` (`transfer-amendment-entry.ts:155~178`) |
| 다건 폼 기본값 상수(복제 금지) | ✅ | `defaultMultiTransferFormData` (`lib/stores/multi-transfer-tax-store.ts:118`) |
| 과세연도 도출(단건=transferDate / 다건=taxYear) | ✅ | `extractTaxYear` (`lib/calc/cross-104-5-history.ts:36`) |
| 폐기 확인 판정 | ⚠️ 있으나 **이 화면에서 오판**한다 | `multiStoreHasUserWork` (`multi-transfer-tax-store.ts:266`) — §5-4 |
| **이력 화면 진입점** | ❌ **없다** | 본 계획서의 유일한 신규분 |

**결론**: greenfield가 아니다. 신규 코드는 ① 후보 선별 순수 함수, ② 선택 모달, ③ 진입 헬퍼, ④ 버튼 2곳(카드·드로어) — 그 외는 전부 기존 함수 호출이다.

---

## 4. 확정된 결정사항 (사용자, 2026-09-16)

- **D1. 진입 UI** = 카드 「합산」 버튼 + **다중선택 모달**. 버튼을 누른 record가 **기준(base)**이 되어 체크된 채 고정되고, 같은 양도인·같은 연도의 다른 단건 이력을 함께 고른다.
- **D2. 기존 다건 세션 처리** = **폐기 확인 후 교체**. 선택한 이력만으로 세션을 새로 구성한다. 확인은 `ConfirmDialog`(native `confirm` 금지 — memory `feedback_dialog_data_discard_confirm`).
- **D3. 과세연도** = **기준 record의 양도연도로 고정**. 타 연도 이력은 사유(`· 2025년 (과세연도 불일치)`)를 붙여 **비활성**. 현행 다건 모달 정책과 동일(`MultiTransferHistoryLoadModal.tsx:119~121`).

---

## 5. 설계

### 5-1. 진입점 — 버튼 노출 술어

```
classifyLoadableTransfer(record) === "single"
```

- **`"multi"`는 제외**한다 — 다건 record는 이미 합산 결과이고, 그것을 다시 합산 대상으로 넣으면 §107② 러닝 합산분이 이중 계상될 수 있다. 다건 이력의 재사용은 **기존 다건 화면 모달**(replace)이 이미 담당한다.
- 겸용주택·부담부증여·일반건물(GB)은 `classifyLoadableTransfer`가 이미 `null`로 떨군다 — **allow-list 구조라 신규 전용값은 자동 배제**된다(`transfer-amendment-entry.ts:59~70`의 경고와 같은 층위).
- 버튼은 **카드(`HistoryClient.tsx:588` 블록)와 드로어(`HistoryDetailDrawer.tsx:296`) 양쪽**에 단다 — 수정신고·경정청구가 양쪽에 있고 진입 로직을 단일 소스로 두는 기존 규칙을 따른다.

### 5-2. 후보 선별 — 순수 함수 (신규 `lib/calc/transfer-aggregate-entry.ts`)

```ts
export interface AggregateCandidate {
  record: CalculationRecord;
  taxYear: number | null;
  /** 선택 불가 사유. null이면 선택 가능 */
  disabledReason: string | null;
  /** 버튼을 누른 기준 record인가 (항상 선택·해제 불가) */
  isBase: boolean;
}

export function selectAggregateCandidates(
  records: CalculationRecord[],
  base: CalculationRecord,
): AggregateCandidate[];
```

규칙(순서대로):
1. `taxType === "transfer"` **AND** `classifyLoadableTransfer(r) === "single"`만 목록에 넣는다.
2. `r.clientId === base.clientId`만 남긴다(개인 모드는 양쪽 `null`이라 자동 통과).
3. `extractTaxYear(r) !== extractTaxYear(base)` → `disabledReason = "${ry}년 (과세연도 불일치)"`.
4. `extractTaxYear(base) === null`(양도일 파싱 불가) → **버튼 자체를 노출하지 않는다**(§8 V-2).
5. 정렬: **양도일 오름차순**. 라벨 「양도 1번…」은 이 순서로 부여한다 — 예정신고 순서와 §111③ 신고일 필터의 직관에 맞춘다. 기준 record가 1번이 아닐 수 있다.

> 계산·네트워크를 하지 않는다. `cross-104-5-history.ts`가 같은 이유로 선별을 분리해 둔 선례를 따른다.

### 5-3. 진입 헬퍼 — `enterMultiAggregate`

`transfer-amendment-entry.ts`의 `enterMultiAmendment` 골격을 그대로 따르되 **정정 플래그 없이** 새 확정신고 세션을 만든다.

```ts
export function enterMultiAggregate(
  records: CalculationRecord[],   // 양도일 오름차순, 전부 single
  router: AppRouter,
): void
```

동작:
1. `properties = records.map((r, i) => buildPropertyFromSingleRecord(r, \`양도 ${i + 1}번\`))`
2. `setForm({ ...defaultMultiTransferFormData, taxYear, properties, activeStep: "list", activePropertyIndex: 0 })`
   - **기본값 상수에서 시작**한다 — 값 복제 금지(W-4). 이로써 이전 세션의 `amendmentMode`·`priorPaidTaxEdited`·`annualBasicDeductionUsed`가 **함께 초기화**된다. 정정 플래그가 새 확정신고에 묻어가면 조용히 다른 세액이 된다.
   - `activeStep: "list"` — 편입 결과를 자산 목록에서 먼저 확인시킨다(현행 `handleLoadSingle`과 동일, `MultiTransferTaxCalculator.tsx:294`).
3. `useProfessionalStore.setActiveClientId(base.clientId)` — 결과 자동저장의 `clientId`가 원본과 같아야 목록에서 같은 양도인으로 묶인다(`MultiTransferTaxCalculator.tsx:331`).
4. `router.push("/calc/transfer-tax/multi")`.

기납부세액은 **여기서 합산하지 않는다** — `computeAutoPriorPaid`가 신고일 필터로 파생한다(`MultiTransferTaxCalculator.tsx:287` 주석과 동일 규칙). 자산별 `priorPaidNational/Local`은 2)의 `buildPropertyFromSingleRecord`가 이미 싣는다.

### 5-4. 🔴 폐기 확인 게이트 — 자동 백업을 「사용자 입력」으로 오판하는 문제

**실측(코드 판독)**: 단건 계산 성공 시 `backupSingleToMulti`가 다건 store에 `properties[0]`을 자동으로 넣는다(`TransferTaxCalculator.tsx:257`·`transfer-calc-actions.ts:31`). 그 백업을 「사용자 입력이 아니다」라고 가르는 신호는 **`autoBackupPropertyIdRef`(컴포넌트 로컬 ref)** 하나뿐이다(`TransferTaxCalculator.tsx:77`).

이력 화면은 **다른 컴포넌트**라 그 ref가 없다. 그대로 `multiStoreHasUserWork(properties, null)`을 부르면 `properties.length === 1 && properties[0].propertyId !== null` → **항상 `true`**(`multi-transfer-tax-store.ts:266~272`). ⇒ **「단건 계산 → 이력 → 합산」이라는 가장 흔한 경로에서 폐기 다이얼로그가 매번 뜬다** — 지울 사용자 입력이 없는데도.

**설계**: 자동 백업 id를 **세션 공유 신호**로 승격한다.
- `backupSingleToMulti`가 `sessionStorage.setItem("multi-transfer-auto-backup-id", id)`를 함께 쓴다.
- `useMultiTransferStore.reset()`이 그 키도 지운다(이미 `multi-transfer-tax-wizard` 키를 지우고 있다 — `multi-transfer-tax-store.ts:234~239`).
- 이력 진입부는 `multiStoreHasUserWork(properties, sessionStorage.getItem("multi-transfer-auto-backup-id"))`로 판정한다.

> ⚠️ **store의 폼 필드로 넣지 않는다** — `MultiTransferFormData`에 넣으면 자동저장 `inputData`(`MultiTransferTaxCalculator.tsx:325`)를 타고 **이력 record에 저장**되고, 복원된 세션에서 의미 없는 id가 되살아난다.
> ⚠️ 새로고침하면 sessionStorage는 남고 ref만 사라진다 — 종전 ref 방식보다 **덜 보수적**이 된다. 그래도 지워지는 것은 「직전 단건 계산의 자동 백업 1건」뿐이며 그 원본은 이력에 저장돼 있다. 판정은 여전히 `properties.length > 1`이면 무조건 사용자 입력이다.

### 5-5. 모달 — `components/calc/transfer/HistoryAggregateSelectModal.tsx` (신규)

- `Dialog` + 체크박스 목록. `data-testid="history-aggregate-modal"` — **모달 열림 판정은 이 testid로만** 한다(항목 텍스트로 판정하면 닫히는 중인 모달의 잔상과 구분되지 않는다 — `MultiTransferHistoryLoadModal.tsx:89~93`의 실측 교훈).
- 헤더: `다건 합산 — {의뢰인명 또는 "내 계산"} · {taxYear}년`
- 행: `☑ 양도 2026.10.05 · 23,017,500` + 기준 record엔 `기준` 배지(체크 고정·해제 불가).
- 비활성 행: `disabledReason`을 rose 색으로 병기.
- 하단: `[취소] [{n}건 합산하기]` — `n < 2`면 비활성(합산은 2건 이상에서만 의미가 있다).
- 하단 고지: 현행 모달과 **같은 문구**로 기납부세액이 참고 추정값임을 알린다(§2-A). 문구는 복제하지 말고 상수로 뽑아 두 모달이 공유한다.
- 금액 칸은 `font-mono`·`tabular-nums`·우측정렬(`amount-column-align` 스킬).

### 5-6. 흐름 요약

```
이력 카드 [합산]
  → selectAggregateCandidates(records, base)
  → 모달에서 n건 선택 → [n건 합산하기]
  → multiStoreHasUserWork(...) ? ConfirmDialog(폐기 확인) : 바로 진행
  → enterMultiAggregate(selected, router)
  → /calc/transfer-tax/multi (자산 목록, n건 편입 완료)
  → 공통 설정에서 기납부세액 「자동 (참고)」 확인·수정 → 계산
```

---

## 6. 14개 동기화 지점 판정

**전 지점 「해당 없음」**이다 — 엔진 input/result 타입에 **필드를 추가하지 않는다**. 이 기능은 이미 존재하는 `MultiTransferFormData`를 기존 값들로 채우는 **진입 경로**일 뿐이고, API payload 빌더(`lib/calc/multi-transfer-tax-api.ts:434~`)·Zod·Route·엔진은 **한 줄도 바뀌지 않는다**.

⇒ 자가 점검은 **역방향**으로 한다: Do 완료 후 `git diff --stat`에 `lib/tax-engine/**`·`app/api/**`·`lib/calc/multi-transfer-tax-api.ts`가 **나타나면 설계 위반**이다. 나타났다면 14지점을 처음부터 다시 돈다.

---

## 7. 변경 파일 목록

| 파일 | 구분 | 예상 규모 |
|---|---|---|
| `lib/calc/transfer-aggregate-entry.ts` | 신규 | ~110줄 (선별 + 진입 헬퍼) |
| `components/calc/transfer/HistoryAggregateSelectModal.tsx` | 신규 | ~150줄 |
| `app/history/HistoryClient.tsx` | 수정 | +35줄 → **~704줄** |
| `components/history/HistoryDetailDrawer.tsx` | 수정 | +25줄 → ~396줄 |
| `app/calc/transfer-tax/transfer-calc-actions.ts` | 수정 | +3줄 (백업 id sessionStorage 기록) |
| `lib/stores/multi-transfer-tax-store.ts` | 수정 | +2줄 (`reset()`에서 키 정리) |
| `__tests__/calc/transfer-aggregate-entry.test.ts` | 신규 | anchor |
| `e2e/transfer-history-aggregate-entry.spec.ts` | 신규 | E2E |

**파일 크기 정책**: `HistoryClient.tsx`는 669 → ~704줄. **분리 트리거는 800**이고 700~749에 안정적으로 앉은 파일을 미리 쪼개는 것은 금지돼 있다(CLAUDE.md File Size Policy) ⇒ **분리하지 않는다**. 모달·헬퍼를 별도 파일로 빼는 것으로 증가분을 이미 최소화했다. 750을 넘기면 그때 카드 렌더를 분리한다.

---

## 8. 검증 계획

### V — Do 전 실측할 것 (추정 금지)

| ID | 검증 항목 | 방법 | 미검증 시 위험 |
|---|---|---|---|
| **V-1** | 단건 계산 직후 다건 store에 자동 백업 1건이 실제로 남는가 | E2E probe: 단건 계산 → `/history` 이동 → `sessionStorage["multi-transfer-tax-wizard"]`의 `form.properties.length` 확인 | §5-4 설계 전제가 무너짐 |
| **V-2** | 단건 record의 `transferDate`가 비어 있는 이력이 존재하는가 | `extractTaxYear` fallback(`taxLawVersion`) 경로를 anchor로 재현 | 버튼 노출 규칙 4)의 필요 여부 |
| **V-3** | 이력에서 편입한 자산의 `completionPercent`가 100이 되어 「계산하기」가 열리는가 | `calcPropertyCompletion(record.inputData)` 직접 호출 | 편입은 되는데 계산 버튼이 막히면 기능이 무의미 |
| **V-4** | 기준 record의 `clientId`와 다른 의뢰인 이력이 목록에서 실제로 빠지는가 | anchor: clientId 3종 fixture | 「같은 양도인」 요건이 무력화 |
| **V-5** | `enterMultiAggregate` 후 `priorPaidTaxEdited`가 false여서 「자동 (참고)」 배지가 뜨는가 | anchor + E2E | 기납부세액이 0으로 굳어 §111③ 정산이 조용히 틀림 |

### Pre-Do anchor (memory `feedback_pre_anchor_verification`)
Do 착수 **전에** `__tests__/calc/transfer-aggregate-entry.test.ts`의 **A-1·A-2를 먼저 작성·실행**해 실패를 확인한다.
- **A-1** 선별: single 3건(2026 ×2, 2025 ×1) + 다건 1건 + 겸용 1건 + 타 의뢰인 1건 → 선택 가능 2건, 비활성 1건(2025년 사유), 나머지는 **목록에서 제외**.
- **A-2** 진입: `enterMultiAggregate([r1, r2])` → store `form.taxYear === 2026`, `properties.length === 2`, 라벨 「양도 1번/2번」이 **양도일 오름차순**, 각 `sourceCalculationId`·`priorPaidNational` 포착, `amendmentMode === false`, `priorPaidTaxEdited === false`, `activeStep === "list"`.
- **A-3** 기납부 연동: 위 store 상태로 `computeAutoPriorPaid(properties)` → 신고일이 빠른 건의 결정세액만 합산됨.

### 뮤테이션 probe (안전망 실측 — memory `feedback_pre_change_safety_net_probe`)
| 뮤테이션 | 기대 |
|---|---|
| `enterMultiAggregate`에서 `taxYear` 설정 제거 | A-2 실패 |
| `defaultMultiTransferFormData` 스프레드 제거(기존 form 유지) | A-2의 `amendmentMode`/`priorPaidTaxEdited` 단언 실패 |
| `buildPropertyFromSingleRecord` 대신 수동 객체 생성(priorPaid 누락) | A-3 실패 |
| 선별에서 `clientId` 필터 제거 | A-1(V-4) 실패 |
| ⚠️ 정렬을 record 저장순으로 되돌림 | A-2 라벨 순서 실패 — 실패하지 **않으면** fixture의 양도일이 이미 저장순과 같다는 뜻이므로 fixture를 고친다 |

### E2E — `e2e/transfer-history-aggregate-entry.spec.ts`
`putCalculationRecord`(`e2e/_helpers/history-seed.ts`)로 단건 3건 시드(2026 ×2 동일 clientId, 2025 ×1) →
`/history` → 카드 「합산」 → `[data-testid="history-aggregate-modal"]` → 2026 건 체크 → 「2건 합산하기」 →
`/calc/transfer-tax/multi`에서 **자산 2건** 확인 → 공통 설정에서 **「자동 (참고)」 배지** 확인 → 계산 → 결과 렌더.

- 단계 이동 단언은 **텍스트가 아니라 `aria-current`**로 한다(memory `feedback_wizard_step_assertion_vacuous_indicator_label`).
- Playwright 요약의 마지막 `N passed` 줄이 아니라 **exit code**로 판정한다(memory `feedback_playwright_summary_last_passed_line_hides_failures`).
- worktree 실행 시 `E2E_PORT` 필수.

---

## 9. 범위 외 (이번에 하지 않는 것)

1. **엔진·API·Zod·Route 일절 변경 없음**(§6).
2. **다건 이력 record의 다중선택 편입** — §5-1의 이유(§107② 이중 계상 위험). 기존 다건 화면 모달이 replace로 담당한다.
3. **겸용주택·부담부증여·일반건물의 합산 편입** — `classifyLoadableTransfer`가 이미 배제하며, 편입하면 §160①단서 분리계산 등이 소실된다(`transfer-amendment-entry.ts:59~70`).
4. **예정신고 산출세액(§107②)의 정확한 재현** — 선행 계획서에서 이미 범위 외로 확정. 기납부세액은 참고 추정값 + 수동확정 정책을 그대로 승계한다.
5. **합산 결과 저장 시 원본 단건 이력의 처리**(숨김·링크 등) — 현행 다건 계산과 동일하게 새 record가 추가되고 원본은 남는다. 정책 변경은 별건.

### 📌 작업 중 발견 — 별건(미수정, 미검증)
`HistoryClient.handleResume`(`:277`)와 드로어 `handleResume`(`:123`)은 `record.taxType === "transfer"`이면 **다건 record도** 단건 store에 hydrate하고 `/calc/transfer-tax`(단건)로 보낸다. 다건 record의 `inputData`에는 `assets`가 없고 `properties`가 있으므로 단건 마법사가 빈 폼으로 열릴 가능성이 있다. **브라우저 실측은 하지 않았다** — 별건으로 확인 필요. 본 계획서에서는 건드리지 않는다(Surgical Changes).

---

## 10. 커밋 계획

1. `test(양도세): 이력→다건 합산 진입 Pre-Do anchor A-1~A-3 (실패 확인)`
2. `feat(양도세): 이력 단건 신고서 다중선택 → 다건 합산 진입 헬퍼·후보 선별`
3. `feat(양도세): 이력 카드·드로어 「합산」 버튼 + 선택 모달`
4. `fix(양도세): 단건 자동 백업 id를 세션 공유로 승격 — 이력 진입 시 폐기 확인 오판 제거`
5. `test(양도세): 이력→다건 합산 E2E 실플로우`
6. `docs(양도세): 계획서 실행 결과·V 실측 환류`

---

## 11. 레지스터

### 확정 결정 (D)
| ID | 결정 | 근거 |
|---|---|---|
| D1 | 카드 버튼 + 다중선택 모달 | 사용자 확정 2026-09-16 |
| D2 | 기존 세션은 폐기 확인 후 교체 | 사용자 확정 2026-09-16 |
| D3 | 기준 record 연도로 고정, 타 연도 비활성 | 사용자 확정 2026-09-16 · 현행 모달 정책 일치 |
| D4 | 합산 대상은 **단건 이력만** | §5-1 (§107② 이중 계상 회피) |
| D5 | 「양도인」 = `clientId`, 개인 모드는 `null` 그룹 | §1-3 실측 |
| D6 | 라벨 순번은 **양도일 오름차순** | §5-2 |
| D7 | 자동 백업 id는 sessionStorage(폼 필드 아님) | §5-4 |

### 미검증 (V) — §8 표. **Do 착수 전 V-1·V-3 필수**, 나머지는 anchor로 함께 해소.

### 사용자 결정 대기 (Q)
없음. (Q1~Q3은 D1~D3으로 확정)

---

## 12. 실행 결과 (2026-09-16)

### 12-1. V 실측 결과

| ID | 결과 |
|---|---|
| **V-1** | ✅ 전제 성립 — `backupSingleToMulti`가 세션 키를 실제로 기록하는 것까지 anchor로 고정(`multi-auto-backup-session-id.anchor.test.ts`). 「헬퍼가 있다」와 「생산자가 부른다」를 **따로** 단언했다 — 후자가 없으면 배선 한 줄을 지워도 앞의 4건이 전부 초록이다(뮤테이션 M6 실측). |
| **V-2** | ⚪ 불요로 정리 — `extractTaxYear`가 `transferDate` → `taxLawVersion` 순으로 떨어져 단건 이력에서 null이 나오기 어렵다. 그래도 **null이면 버튼을 노출하지 않는다**(`canAggregateFromHistory`)로 막아 뒀다. |
| **V-3** | ✅ **100 확인** — 편입 자산의 `completionPercent`가 100이라 「계산하기」가 열린다(anchor). |
| **V-4** | ✅ 타 의뢰인 이력은 같은 연도라도 목록에서 빠진다(anchor + 뮤테이션 M4). |
| **V-5** | ✅ `priorPaidTaxEdited=false`로 시작해 「자동 (참고)」 배지가 뜬다 — vitest(A-3) + E2E 양쪽에서 확인. |

### 12-2. 뮤테이션 실측 — 안전망의 구별력

| 뮤테이션 | 결과 |
|---|---|
| M1 과세연도 고정 제거 | 🔴 **처음엔 16건 전부 통과(구별력 0)** — fixture 양도연도가 올해(2026)라 `new Date().getFullYear()` fallback과 값이 같았다. **과거연도(2024) 케이스를 추가**해 구별력을 만든 뒤 재측정: 1 failed. |
| M2 기본값 상수 스프레드 제거 | 1 failed (정정 플래그 누수) |
| M3 양도일 정렬 제거 | 2 failed (vitest) · E2E 1 failed |
| M4 양도인(clientId) 필터 제거 | 3 failed |
| M5 다건 이력 배제 해제 | 2 failed |
| M6 백업 id 생산자 배선 제거 | 1 failed |
| M7 `reset()`의 키 정리 제거 | 1 failed |
| E2E 과세연도 비활성 해제 | 1 failed |
| E2E 자산별 예정세액 포착 제거 | 1 failed |

> 📌 **M1은 이 작업의 교훈이다** — 「뮤테이션이 통과했다」는 「그 분기가 맞다」가 아니라 **fixture가 그 축을 재지 못한다**는 뜻이었다(memory `feedback_mutation_zero_discrimination_is_not_proof`). 계획서에 「기준 연도로 고정」이라 적고 anchor까지 있었는데도, **올해 데이터만으로는 그 문장이 검증되지 않았다**.

### 12-3. 게이트

- `npx tsc --noEmit` 0건
- `npm test` **2042 파일 / 21,418 통과 · 회귀 0건**
- `npm run lint` **0 errors** (warning 342건은 전부 기존분)
- `npx playwright test e2e/transfer-history-aggregate-entry.spec.ts` 2 passed

### 12-4. 설계 대비 변경

- 계획 §5-2의 「기준 연도 null이면 버튼 미노출」을 **`canAggregateFromHistory`에 흡수**했다(별도 규칙 4를 두지 않음) — 판정이 한 술어에 모인다.
- 모달이 이력을 **스스로 조회**한다(`calculationRepository.list({ taxType: "transfer" })`). 카드와 드로어가 목록을 prop으로 내려 주면 두 진입점이 서로 다른 필터를 먹일 수 있다 — 드로어는 애초에 목록을 들고 있지도 않다.
- 폐기 확인·진입까지 **모달 안에서** 끝낸다. 두 진입점은 `base`만 넘긴다.

### 12-5. 파일 크기

`HistoryClient.tsx` 669 → **699줄**. 분리 트리거(800) 미만이고 700~749 데드밴드에도 들지 않아 **분리하지 않는다**(CLAUDE.md File Size Policy).
