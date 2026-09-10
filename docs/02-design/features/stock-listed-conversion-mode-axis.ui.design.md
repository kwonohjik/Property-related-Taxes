# 주식양도세 — 상장 환산 «산정 방식 단일 축» UI 설계서 (S3)

> **상위 계획서**: [`docs/00-pm/stock-listed-conversion-unification.plan.md`](../../00-pm/stock-listed-conversion-unification.plan.md)
> **선행 완료**: S0(셀렉터 헬퍼 · PR #1564) · S1(산식 통합 + Q-1 · PR #1562) · S2(회귀표 · PR #1563)
> **작성**: 2026-09-10 · **검증 깊이 L3**(폼 상태 재설계 · **세액 불변이 요구사항**)
> **상태**: 착수 전. 계획서의 V-1~V-5 · Q-1~Q-2 **전건 종결**. 이 문서의 **V-6도 종결**(§6-1) — 착수 가능.
>
> ⚠️ **인용 줄번호는 「S0·S1·S2 머지 후」 기준으로 실측했다**(2026-09-10). 계획서 Q-2 근거의
> `:161·:208·:253·:299`는 S1 머지 **전** 값이라 4줄 밀려 있었고 이 PR에서 함께 정정했다 —
> **인용은 착수 시점에 다시 재는 것이 안전하다.**

---

## 0. 이 문서가 답해야 하는 것

계획서는 **무엇을 왜** 바꾸는지까지 확정했다. 이 문서는 **어디를 어떻게** 바꾸는지를
파일·줄 단위로 확정해 곧바로 착수할 수 있게 한다.

- **범위 안**: 폼 상태 enum 도입(①②③⑧) · ④ 펼침 · Step2 렌더 재구성(⑤) ·
  마이그레이션 · anchor/E2E 이관
- **범위 밖**: 엔진 `StockTransferInput`(boolean 유지 — 계획서 §2-2에서 68:2로 기각) ·
  ⑫ Zod 스키마 형태 · 세율·산식 일체

**수용 기준은 이미 존재한다** — S2의 회귀표
`__tests__/calc/stock-conversion-branch-matrix.anchor.test.ts`(10건)가 **한 줄도 바뀌면 안 된다.**
그것이 「UI만 바꿨다」의 증명이다.

---

## 1. 현행 → 목표

### 1-1. 현행 (실측 2026-09-10)

`app/calc/stock-transfer-tax/steps/Step2.tsx:366-471` — **106줄**의 「환산 × 상장」 분기.

```
acquisitionMode === "estimated" && isListed
├─ 배너      키움 조회에서 거래정지 감지            (:367)
├─ ToggleCard  양도일 거래정지·관리종목 (§165③)      (:370)   tradingHaltAtTransfer
│    └ EstimatedUnlistedBlock (양·취 양쪽)
├─ ToggleCard  취득일 거래정지·관리종목 (§165③)      (:383)   tradingHaltAtAcquisition
│    └ EstimatedUnlistedBlock acquisitionSideOnly           ← 게이트 :382
├─ emerald 블록  일반 환산 §176의2②1호               (:396)   ← 게이트 :396
│    ├ 키움(양도일) + 양도시 1주당 기준시가  (:422)          ★ 분모
│    └ 키움(취득일) + 취득시 1주당 기준시가  (:447)          ★ 분자
└─ PostListingValuationCard                          (:469)   acquiredBeforeListing
     ├ 환산 입력 방식 (unlistedDetailMode)
     ├ ① 상장일 이후 1개월 종가
     ├ ② 상장연도·취득연도 평가액
     └ ③ 양도 당시 기준시가                                  ★ 분모 (중복!)
```

**문제**: 분모(`transferDatePriceAvg1Month`)의 입력 UI가 emerald 블록과 ③ **두 곳**에 있고
서로 배타 렌더된다. 토글을 켜면 위 칸이 사라지고 아래에 같은 칸이 다시 나타난다.

### 1-2. 목표

```
acquisitionMode === "estimated" && isListed
├─ 배너      (그대로)
├─ ① 양도 당시 기준시가 (분모) ─ 항상 1곳                    ★ 신설 컴포넌트
│    ├ [기준시가 입력 방식] 직접 / 일자별
│    ├ 키움 자동조회(양도일)
│    ├ 1개월 종가 평균  또는  32셀 일자별 표
│    └ (halt_transfer 선택 시) 「보충 평가로 대체됩니다」 안내로 치환
├─ ② 기준시가 산정 방식 ─ 라디오 4지 (acquisitionStdMode)     ★ 신설
└─ ③ 선택된 방식의 전용 입력
     ├ monthly_avg      → 키움(취득일) + 취득시 1주당 기준시가
     ├ halt_acquisition → EstimatedUnlistedBlock acquisitionSideOnly
     ├ post_listing     → PostListingValuationCard (③ 섹션 **제거**된 형태)
     └ halt_transfer    → EstimatedUnlistedBlock (양·취 양쪽)
```

---

## 2. 케이스 매트릭스

`acquisitionStdMode` 4값 × 화면 구성. **회귀표 R1~R4와 1:1**로 대응한다.

| # | enum | S2 행 | ① 분모 블록 | ③ 전용 입력 | 엔진 boolean |
|---|---|---|---|---|---|
| 1 | `monthly_avg` | R1 | 입력 | 취득시 1주당 기준시가 + 키움 | 셋 다 false |
| 2 | `halt_acquisition` | R2 | 입력 | `EstimatedUnlistedBlock acquisitionSideOnly` | `tradingHaltAtAcquisition` |
| 3 | `post_listing` | R3 | 입력 | `PostListingValuationCard`(①②만) | `acquiredBeforeListing` |
| 4 | `halt_transfer` | R4 | **안내로 치환** | `EstimatedUnlistedBlock`(양·취) | `tradingHaltAtTransfer` |

**표현 불가가 된 조합** (Q-2 3안의 성과):
- 취득 후 상장 × 양도일 거래정지 — 종전 ⑧ `:359` · ⑫ `:419`가 막던 것
- 취득 후 상장 × 취득일 거래정지 — 종전 ⑧ `:367` · ⑫ `:429`가 막던 것

⇒ 두 서버 가드는 **그대로 둔다**. API 직접 호출은 여전히 조합을 만들 수 있다.

---

## 3. 14 동기화 지점 — 파일·줄 단위 명세

### ① 폼 상태 — `lib/stores/calc-wizard-stock-form.ts:171-173`

```diff
-  acquiredBeforeListing: boolean;        // 3중 패턴 default: false
-  tradingHaltAtTransfer: boolean;        // 3중 패턴 default: false
-  tradingHaltAtAcquisition: boolean;     // [C-1] 3중 패턴 default: false
+  /**
+   * 상장 환산의 «기준시가 산정 방식» — 배타적 4상태.
+   * 엔진 if-체인(`stock-acquisition-basis.ts:128·165·257·303`)과 1:1이다.
+   */
+  acquisitionStdMode: "monthly_avg" | "halt_acquisition" | "post_listing" | "halt_transfer";
```

### ② initial — 같은 파일 `:561-563`

```diff
-    acquiredBeforeListing: false,
-    tradingHaltAtTransfer: false,
-    tradingHaltAtAcquisition: false,
+    acquisitionStdMode: "monthly_avg",
```

### ③ normalize — `lib/stores/calc-wizard-stock-normalize.ts:58-66·171-173`

구 boolean → enum 역산. **우선순위는 엔진 if-체인 순서다**:

```ts
function deriveStdMode(d: Record<string, unknown>): AcquisitionStdMode {
  // 🔴 순서가 곧 계약이다 — acquiredBeforeListing이 «선두»다(basis.ts:128).
  //    뒤집으면 게이트 이전의 stale 조합에서 세액이 바뀐다.
  if (d.acquiredBeforeListing === true) return "post_listing";
  if (d.tradingHaltAtTransfer === true) return "halt_transfer";
  if (d.tradingHaltAtAcquisition === true) return "halt_acquisition";
  return "monthly_avg";
}
```

`:59·:65`의 `transferStdInputMode`/`listingStdInputMode` 정규화 조건도
`acquiredBeforeListing` → `mode === "post_listing"`으로 바꾼다.

> ⚠️ 이 함수 하나가 **sessionStorage 재수화**(`calc-wizard-stock-store.ts:237·240`)와
> **이력 복원**(`app/history/HistoryClient.tsx:313`) **양쪽**을 지난다(계획서 F-1 정정분).

### ④ API 변환 — `lib/calc/stock-transfer-tax-api.ts:380-382`

```diff
-  body.acquiredBeforeListing = form.acquiredBeforeListing;
-  body.tradingHaltAtTransfer = form.tradingHaltAtTransfer;
-  body.tradingHaltAtAcquisition = form.tradingHaltAtAcquisition;
+  const m = form.acquisitionStdMode;
+  body.acquiredBeforeListing = m === "post_listing";
+  body.tradingHaltAtTransfer = m === "halt_transfer";
+  body.tradingHaltAtAcquisition = m === "halt_acquisition";
```

같은 파일의 **파생 게이트 4곳**도 함께 바꾼다 — `:289`(§165⑤ detail 합성) ·
`:388`·`:407`(비상장/거래정지 full 모드) · `:418`(§165⑤ 상세 모드).

### ⑤ UI 위젯 — 신설 2 · 수정 1 · 삭제 2

| | 대상 | 조치 |
|---|---|---|
| 신설 | `components/calc/stock-transfer/TransferStdPriceSection.tsx` | ① 분모 블록. 현행 emerald 블록의 분모 부분 + `PostListingValuationCard` ③ 섹션을 **합친 것**. `halt_transfer`면 안내로 치환 |
| 신설 | `components/calc/stock-transfer/AcquisitionStdModeRadio.tsx` | ② 라디오 4지. `RadioCardGroup` + `layout="stack"` |
| 수정 | `PostListingValuationCard.tsx` | ③ 섹션(`:396-437`) **제거** → ①로 이관. ToggleCard 껍데기 제거하고 내용만 노출 |
| 삭제 | Step2 emerald 블록 (`:396-462`) | 분모는 ①로, 분자는 ③의 `monthly_avg` 분기로 |
| 삭제 | ToggleCard 2개 (`:370`·`:383`) | 라디오 선택지로 흡수. children(`EstimatedUnlistedBlock`)은 ③으로 이동 |

> 🔴 **`PostListingValuationCard`의 ToggleCard `onCheckedChange`가 하던 F-10 정규화를
> 라디오 `onChange`로 옮겨야 한다** — 「끌 때 `transferStdInputMode`·`listingStdInputMode`를
> `direct`로 되돌린다」(`:145-152`). 라디오에서 다른 방식으로 이동할 때 같은 patch를
> **한 번의 onChange**로 보내야 한다(나눠 부르면 뒤 호출이 앞의 spread를 덮어쓴다).

### ⑥ 사이드바 — **N/A** (실측: `StockSidebar.tsx`에 이 축 참조 0건)

### ⑦ 결과 카드 — **N/A**

`PostListingDetailCard.tsx:77`이 읽는 것은 **엔진 result의** `acquiredBeforeListing`이고,
result는 boolean을 유지한다.

> ⚠️ S2 §6-4가 남긴 함정 — `valuationDetail.finalPerShareValue`는 **경로마다 의미가 다르다**
> (일반은 「환산 후 1주당 취득가」, 나머지 셋은 「1주당 취득기준시가」).
> 화면은 `method`로 게이팅돼 있어 지금은 옳다. **UI를 합치면서 이 게이트를 풀지 말 것.**

### ⑧ validation — `lib/calc/stock-transfer-tax-validate-step2.ts` (읽는 지점 **11곳**)

| 줄 | 현행 | 변경 |
|---|---|---|
| `:297` | `!form.tradingHaltAtTransfer` | `mode !== "halt_transfer"` |
| `:305` | `form.acquiredBeforeListing ? … : "direct"` | `mode === "post_listing" ? … : "direct"` |
| `:335` | `tradingHaltAtTransfer && !acquiredBeforeListing` | `mode === "halt_transfer"` |
| `:339` | `haltAcq && !haltTransfer && !postListing` | `mode === "halt_acquisition"` |
| `:342·344` | `!postListing && !haltTransfer` · `!haltAcq` | `mode === "monthly_avg"` |
| `:352` | `form.acquiredBeforeListing` | `mode === "post_listing"` |
| `:359·367` | 불가 조합 차단 2건 | **삭제** — 축이 하나라 도달 불가 |

> 🔑 `:359·367`을 삭제해도 **⑫는 남긴다**. UI가 만들 수 없을 뿐 API는 만들 수 있다.

### ⑨⑩⑪ — **N/A** (엔진 input이 boolean을 유지하므로 스키마 형태 불변)

### ⑫ Zod — **변경 없음.** 기존 refine(`:419`·`:429`)이 서버 가드로 남는다

### ⑬ body spread — ④가 만든 boolean 3개가 실제로 실리는지 **grep 자가 점검**

### ⑭ Route handler — **변경 없음을 확인**(무변경도 점검 대상)

---

## 4. 테스트 계획

### 4-1. 신규 anchor

| ID | 내용 | 대응 뮤테이션 |
|---|---|---|
| `MIG-1~4` | 구 boolean 4조합 → enum 역산 (§3 ③의 우선순위) | 순서를 뒤집으면 실패 |
| `MIG-5` | **stale 이중 플래그**(post_listing + halt_transfer) → `"post_listing"` | 순서 반전 시 실패 |
| `MAP-1~4` | enum 4값 → boolean 3개 (④ 매핑 표) | 한 줄 바꾸면 해당 값만 실패 |
| `MAP-5` | ④가 **불가능한 조합을 만들지 않는다** (4값 전수 → 켜진 boolean ≤ 1) | 매핑을 or로 바꾸면 실패 |
| `UI-1` | 라디오 4지가 렌더되고 `name="acquisitionStdMode"` | |
| `UI-2` | ① 분모 블록이 **항상 1곳**이다 (4모드 전수에서 count 1) | 종전 구조로 되돌리면 2가 되어 실패 |
| `UI-3` | `halt_transfer`에서 ① 블록이 **안내로 치환**된다 | |
| `UI-4` | 방식을 바꾸면 `transferStdInputMode`가 `direct`로 정규화된다 (F-10 계승) | 정규화 제거 시 실패 |

### 4-2. 이관

| 대상 | 조치 |
|---|---|
| `e2e/stock-transfer-halt-extension.spec.ts` 「양립 불가 차단」 | **삭제** → S2의 `MTX-XA/XA'`가 대신한다(S0에서 주석으로 표시함) |
| `e2e/_helpers/stock-conversion.ts` | 구현만 교체 — 토글 클릭 → 라디오 클릭. **호출부 13곳 무변경** |
| `post-listing-three-sections.anchor.test.tsx` | ③ 섹션 제거 반영 (①② 2섹션으로) |
| `post-listing-transfer-std-section.anchor.test.tsx` | ①로 이관된 분모 블록을 보도록 |

### 4-3. 불변 증명 (**가장 중요**)

```
npx vitest run __tests__/calc/stock-conversion-branch-matrix.anchor.test.ts
```

**10건이 한 줄도 바뀌지 않아야 한다.** 바뀌면 UI가 아니라 계산이 바뀐 것이다.

---

## 5. 착수 순서

```
1. ①②③ 폼 층 + MIG anchor        → verify: MIG-1~5 통과 · 기존 normalize 테스트 무변경
2. ④ 펼침 + MAP anchor            → verify: MAP-1~5 통과 · S2 회귀표 10건 불변
3. ⑧ 술어 전환                     → verify: validate 관련 anchor 전건 통과
4. ⑤ UI 재구성 (신설 2 · 수정 1 · 삭제 2)  → verify: UI-1~4 + 컴포넌트 anchor
5. E2E 헬퍼 구현 교체              → verify: 주식 25 spec 57건 통과
6. 이관·삭제 정리                   → verify: npm test 전건 + tsc + lint
```

각 단계마다 **S2 회귀표를 다시 돌린다** — 어느 단계에서 계산이 흔들렸는지 즉시 갈린다.

---

## 6. 위험과 미결

| # | 항목 | 대응 |
|---|---|---|
| R-1 | **stale 폼**에 구 boolean만 있는 세션·이력이 남아 있다 | ③ 마이그레이션 + `MIG-5`. 계획서 §3-1의 순서 경고를 따를 것 |
| R-2 | ⑤ 재구성 중 F-10 정규화 유실 | `UI-4`가 지킨다. **한 번의 onChange**로 patch |
| R-3 | `finalPerShareValue` 의미 분기(S2 §6-4)를 모르고 통일 | ⑦ 게이트를 풀지 않는다. 회귀표가 `method`와 함께 고정 |
| R-4 | `EstimatedUnlistedBlock`을 ③으로 옮기며 `simpleOnly`/`acquisitionSideOnly` prop 유실 | 이동 전후 prop을 표로 대조 |
| ~~V-6~~ | ✅ **종결 2026-09-10** — 하위 축 **5곳**으로 확정. 아래 표 참조 | |

### 6-1. V-6 종결 — 3 boolean에 매달린 «하위 축» 5곳

| 하위 축 | 게이팅 지점 | S3 조치 |
|---|---|---|
| `transferStdInputMode` | `calc-wizard-stock-normalize.ts:59` — `acquiredBeforeListing`이면 유지, 아니면 `direct` | ①이 **모든 모드**에서 이 축을 쓰므로 게이팅을 **제거**한다 (분모 블록이 항상 있으니 되돌릴 UI가 늘 존재) |
| `listingStdInputMode` | 같은 파일 `:64` — 동일 패턴 | `mode === "post_listing"`으로 좁힌다 (§165⑤ 전용이라 그대로) |
| `unlistedValuationMode` | `stock-transfer-tax-api.ts:388·407` — `marketType==="unlisted" \|\| tradingHaltAtTransfer` | `\|\| mode === "halt_transfer"`로 치환 |
| `unlistedDetailMode` | 같은 파일 `:418` — `acquiredBeforeListing &&` | `mode === "post_listing" &&`로 치환 |
| `EstimatedUnlistedBlock` props | `Step2.tsx:378`(양·취) · `:391`(`acquisitionSideOnly`) · `:476`(비상장 경로) | `:378`→`halt_transfer` 분기, `:391`→`halt_acquisition` 분기로 **이동**. `:476`은 비상장(`marketType`) 경로라 **무관 — 건드리지 않는다** |

> 🔑 **`transferStdInputMode`의 게이팅 제거가 이 재구성의 실질 이득이다.** 종전에는 그 축의
> 라디오와 32셀 표가 「취득 후 상장」 ToggleCard children 안에만 있어, 축 밖에서 `daily`가
> 남으면 되돌릴 UI가 없었다(F-10 dead-end). 분모 블록이 **항상 1곳**에 있으면 그 함정이
> 구조적으로 사라진다 — 계획서 §1-3의 「기능 비대칭」도 같은 자리에서 해소된다.
>
> ⚠️ `Step2.tsx:476`은 **비상장 경로**(`acquisitionMode === "estimated" && !isListed`)다.
> 상장 환산 축과 이름이 같아 헷갈리기 쉬우니 이동 대상에서 명시적으로 제외한다.
