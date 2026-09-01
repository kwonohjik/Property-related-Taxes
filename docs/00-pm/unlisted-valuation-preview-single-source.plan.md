# §165④ 미리보기 단일 정본 위임 + 잔여 O 항목 — 수정계획

> **Source**: PR #1385 계획서 §10에 「기록만」으로 남긴 O-1~O-7 후속 (사용자 지시 2026-09-01).
> **Date**: 2026-09-01
> **세목**: 주식 양도소득세 — 비상장 보충적 평가 (소령 §165④·§165⑤, 소칙 §81④)
> **검증 깊이**: **L2** — 화면 표시가 바뀐다. **엔진·세액은 변하지 않는다**(§3에서 실증).
> **정책**: [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_pre_change_safety_net_probe]] ·
>   [[feedback_citation_drift_replicates_across_repo]] · [[feedback_sibling_path_already_implements_rule]] ·
>   [[feedback_no_silent_apportion_fallback]] · [[feedback_negative_assertion_needs_mutation_probe]]

---

## 1. 착수 대상 판정

| ID | 항목 | 판정 | 이유 |
|---|---|---|---|
| **O-4** | NA 계산서 행 2 평가차액 · 행 3 법인세법상 유보금액 signed | ✅ **착수** | 형제 경로 `SIGNED_NET_ASSET_KEYS`가 정본. 법적 판정 불필요 |
| **O-5** | `showAccrualToggle`의 `simpleListingEval > 0` | ✅ **착수** | **`> 0`이 「미입력」의 대용품**이었다(§4). 법문 「같은 경우」에 양수 요건 없음 |
| **O-6** | 미리보기 3곳이 §165④를 UI에서 재구현 | ✅ **착수** | 엔진 `calcSection165_4Value`가 **이미 단일 정본**이다. 위임하면 끝 |
| **O-7** | 라벨 오타 「수**익**배당금 중 **입**금불산입」 | ✅ **착수** | 상증령 §56④1나 = 「수**입**배당금액 중 **익**금불산입액」. 같은 저장소 3곳이 올바른 표기 |
| O-1 | 1999-01-01~2007-02-27 양도 구간 평가액 음수 | ❌ 기록 유지 | 「기준시가가 음수일 수 있는가」는 **독립 법적 판정**. 명문 clamp 부존재는 확인됨 |
| O-2 | §165④1 가목의 순손익액 계산방법 = 상증령 §56④? | ❌ 기록 유지 | 24행 서식 전체를 흔드는 재설계 |

---

## 2. 🔴 안전망 실측 — 미리보기도 **0건**

미리보기 가중평균 산식을 **상수로 통째로 대체**하고 관련 전 범위를 실행했다.

```
# EstimatedUnlistedBlock 2곳 · FaceValueBlock 1곳: const weighted = 12345;
npx vitest run __tests__/components/ __tests__/calc/ __tests__/tax-engine/stock-transfer/
→ Test Files 571 passed (571) · Tests 5491 passed (5491)
```

**전부 통과.** 미리보기 산식을 지키는 계약이 **하나도 없다.**
(`__tests__/tax-engine/stock-transfer/unlisted-*floor80*.test.ts` 계열은 전부 **엔진** 테스트다 —
컴포넌트를 렌더하지 않으므로 미리보기를 보지 않는다.)

⇒ 위임 후 동작을 고정할 **신규 anchor 필수**.

---

## 3. 🔴 O-6 실측 — 미리보기는 이미 엔진과 **다섯 케이스에서** 갈린다

`calcSection165_4Value`(정본) vs 미리보기 산식을 그대로 옮겨 대조 (1주당, 비-부동산과다):

| 케이스 | 엔진(정본) | `EstimatedUnlistedBlock` | `FaceValueBlock` |
|---|---:|---:|---:|
| 평범 (ni 50,000 / na 20,000) · 2026 양도 | 38,000 | 38,000 ✓ | 38,000 ✓ |
| 〃 · 2005 양도 | 38,000 | 38,000 ✓ | 38,000 ✓ |
| **〃 · 1997 양도** | **20,000** | **38,000 ✗** | **38,000 ✗** |
| **결손** (ni −50,000) | **16,000** | **−22,000 ✗** | **20,000 ✗** |
| 자본잠식 (na −20,000) | 22,000 | 22,000 ✓ | **null ✗** |
| **결손+자본잠식** | **−16,000** | **−38,000 ✗** | **null ✗** |
| **순손익 0 (미입력)** | **16,000** | 16,000 ✓ | **20,000 ✗** |

원인 3가지:

1. **연혁 게이팅 부재** — 미리보기는 양도일과 무관하게 언제나 3:2 + 80% 하한을 쓴다.
   엔진은 ~1998 순자산 단독 · 1999~2007.2.27 하한 없음으로 가른다. **1997 양도에서 1.9배 과대.**
2. **`weighted > 0` 가드** (`EstimatedUnlistedBlock.tsx:108·152`) — 엔진에는 없다.
   음수 가중평균에서 80% 하한이 **미리보기에만** 미적용된다.
3. **`ni > 0 ? 가중평균 : na`** (`FaceValueBlock.tsx:35`) — 엔진은 ni=0도 가중평균에 넣는다.
   ⇒ **순손익 미입력이라는 가장 흔한 상태에서 25% 과대**(20,000 vs 16,000)다.

> ⚠️ **1997 양도·순손익 0 divergence는 이번 결손 작업과 무관한 기존 결함**이다.
>   PR #1385가 음수를 도달 가능하게 만들면서 **드러난** 것이지 만든 것이 아니다.
> ✅ **엔진·세액에는 영향이 없다** — 세 미리보기 모두 `useMemo` 표시 전용이고
>   store 기록이 0건임을 grep으로 확인했다(PR #1385 커밋 전 검토).

### 3.1 해법 — 재구현을 지우고 정본에 위임한다

`valuation-165-4-basis.ts`는 파일 첫 줄에 스스로를 「**「제4항에 따른 평가액」의 단일 정본**」이라
선언하고, 「인자는 **사실**만 받는다(`transferDate`)」고 못박아 두었다. 미리보기가 그 함수를
부르지 않는 것 자체가 규약 위반이다. [[feedback_ui_engine_dual_truth_avoidance]]

```ts
const v = calcSection165_4Value(ni, na, isHeavyRE, transferDate);
// v.value · v.floorApplied — 하한·연혁 게이팅이 전부 정본에서 온다
```

**보존할 분기**: `isNetAssetOnly`(§165④3 순자산 단독 — 하한 없음)는 정본 밖이므로 그대로 둔다.

**양도일 미입력**: 연혁 게이팅 기준이 없으므로 **미리보기를 표시하지 않는다**(null).
임의 기준일 fallback 금지 — [[feedback_no_silent_apportion_fallback]].
양도일은 Step1 필수라 Step2에서 미리보기가 뜰 시점에는 이미 채워져 있다.

---

## 4. O-5 실측 — `> 0`은 「미입력」의 대용품이었다

`PostListingValuationCard.tsx:76~77`:

```ts
const showAccrualToggle =
  mode !== "simple" || !evalDate || (simpleListingEval > 0 && simpleListingEval === simpleAcqEval);
```

주석은 「4필드 가중평균이 **동일할 때만** 노출」이라고 한다. 그런데 4필드가 **전부 비어 있으면**
두 평가액이 나란히 0이 되어 「동일」이 성립한다 ⇒ 토글이 헛노출된다.
`> 0`은 그것을 막으려던 것이지 **음수를 배제하려던 것이 아니다.**

**소령 §165⑤ 후단**: 「취득일 현재의 제4항에 따른 평가액과 …상장일 현재의 제4항에 따른 평가액이
**같은 경우**」 — 양수 요건이 없다(KoreanLaw 본문 확인, PR #1385 계획서 §3.1).

⇒ 술어를 **의도대로** 바꾼다: 「값이 양수인가」 → 「**4필드가 입력되었는가**」.

| 상태 | 현행 | 수정 후 |
|---|---|---|
| 4필드 미입력 | 미노출 (`0 > 0` false) | 미노출 (**미입력**) |
| 평가액 동일·양수 | 노출 | 노출 |
| **평가액 동일·음수** | **미노출** ← 결함 | **노출** |
| **평가액 동일·0** | **미노출** ← 결함 | **노출** |

### 4.1 O-5b — 같은 결함이 **비상장 축에도** 있었다 (구현 중 발견)

`EstimatedUnlistedBlock.tsx:439`가 §165⑨ 본체 §81④ 토글에 같은 `> 0`을 걸고 있었다:

```ts
transferStdPricePreview !== null && acquisitionStdPricePreview !== null &&
transferStdPricePreview.perShare > 0 &&          // ← 여기
transferStdPricePreview.perShare === acquisitionStdPricePreview
```

여기서는 **`!== null` 검사가 이미 「미입력」을 거른다** ⇒ `perShare > 0`은 순수하게
**음수 동일 케이스만 막던 잔재**다. 그냥 제거한다.

---

## 5. O-4 — NA 계산서 signed 2행

형제 경로 `NetAssetCalculationTable.tsx:24 SIGNED_NET_ASSET_KEYS`가 정본이다.

| 행 | 라벨 | 근거 |
|---|---|---|
| 2 | 평가차액 | §60·§66 평가가액 − 장부가액 ⇒ **평가차손이면 음수** |
| 3 | 법인세법상 유보금액 | **△유보**가 정상값 |

`PostListingNetAssetStatement.tsx`의 `assetAddKeys` 4행 중 앞 2행. PR #1385의 `ADD_SIGNED`와
동일한 배열 패턴을 쓴다 ⇒ `ASSET_ADD_SIGNED = [true, true, false, false]`.
`YearColumn` 공용이므로 **4열 × 2체계** 동시 파급.

---

## 6. O-7 — 라벨 오타, 그리고 **그 오타가 복제돼 있다**

| 위치 | 현행 | 정정 |
|---|---|---|
| `PostListingNetIncomeStatement.tsx:31` | 「3. 수**익**배당금 중 **입**금불산입한 금액」 | 「3. 수**입**배당금 중 **익**금불산입한 금액」 |
| `types/stock-transfer.types.ts:508` (주석) | 「수**익**배당금 **입**금불산입」 | 「수**입**배당금 **익**금불산입」 |

같은 저장소 3곳이 **올바른 표기**를 쓴다 — `FiscalYearAdjustmentTable.tsx:58`
「수입배당금 익금불산입액」 · `besshi-form-constants.ts:271` 「수입배당금 중 익금불산입액」 ·
`unlisted-stock-valuation.types.ts:66`. 근거 조문은 **상증령 §56④1 나목**
「「법인세법」 제18조의2 및 제18조의4에 따른 **수입배당금액 중 익금불산입액**」(KoreanLaw 확인).

⇒ 오타가 라벨 → 타입 주석으로 **복제**됐다. [[feedback_citation_drift_replicates_across_repo]]

---

## 7. 회귀 표면

| 축 | 판정 | 근거 |
|---|---|---|
| **엔진·세액** | **불변** | 미리보기 3곳 전부 `useMemo` 표시 전용(store 기록 0건). O-4·O-7은 입력 affordance·문구 |
| 화면 표시 | **바뀐다 (의도)** | §3 표의 5개 케이스에서 미리보기가 **엔진과 같아진다** |
| O-5 토글 | **바뀐다 (의도)** | §4 표 하단 2행 |
| 14 동기화 지점 | 신규 필드 0건 ⇒ 해당 없음 | |

> ⚠️ 「엔진·세액 불변」은 부정형 단언이다 ⇒ **전체 회귀 + §8의 PV-6**으로 실증한다.

---

## 8. 테스트 계획 (안전망 0건 ⇒ 신규 anchor 필수)

신규: `__tests__/components/calc/stock-transfer/unlisted-valuation-preview-single-source.anchor.test.tsx`

| ID | 단언 | 뮤테이션 |
|---|---|---|
| **PV-1** | 1997 양도 · ni 50,000 / na 20,000 → 미리보기 **20,000**(순자산 단독 연혁) | **Q-1** 위임을 자체 산식으로 되돌림 |
| **PV-2** | 2026 양도 · 결손 ni −50,000 / na 20,000 → **16,000**(80% 하한) | Q-1 |
| **PV-3** | `FaceValueBlock` 순손익 미입력 · na 20,000 → **16,000** (종전 20,000) | **Q-2** FVB 위임 되돌림 |
| **PV-4** | 양도일 미입력 → 미리보기 미표시 (임의 기준일 fallback 없음) | **Q-3** fallback 삽입 |
| **PV-5** | `isNetAssetOnly` → 하한 미적용, `na` 그대로 | **Q-4** 분기 제거 |
| **PV-6** | **엔진 불변**: 같은 입력으로 `calcSection165_4Value` 결과가 미리보기와 **일치** | Q-1 공용 |
| **AT-1** | O-5 — 평가액이 **음수로 동일**하면 §81④ 토글이 노출된다 | **Q-5** `> 0` 복원 |
| — | O-5b(비상장 축)는 기존 E2E `stock-transfer-165-9-main.spec.ts`가 이미 덮는다(양수 동일 경로). 음수 경로는 PLVC의 AT-1과 **같은 술어 결함**이라 중복 anchor를 만들지 않는다 | — |
| **AT-2** | O-5 — 4필드 **미입력**이면 토글 미노출 | **Q-6** 미입력 판정 제거 |
| **NA-1** | O-4 — 행 2 평가차액에 음수 입력 → 부호 보존 | **Q-7** `ASSET_ADD_SIGNED[0]` false |
| **NA-2** | O-4 — 행 3 유보금액 음수 보존 | Q-7 |
| **NA-3** | O-4 — 행 4 유상증자는 **종전대로 부호 제거** | **Q-8** 전부 true |
| **LB-1** | O-7 — 라벨이 「수입배당금 중 익금불산입한 금액」 | **Q-9** 오타 복원 |

**회귀**: `npm run check:pre-pr` 전건.

---

## 9. 범위 밖 (계속 기록만)

O-1(1999~2007 음수 평가액) · O-2(§56④ 준용 명문). PR #1385 계획서 §10 그대로 유효.


---

## 10. 구현 결과 (2026-09-01)

브랜치 `fix-unlisted-preview-single-source`.

### 10.1 변경

| 파일 | 내용 |
|---|---|
| `EstimatedUnlistedBlock.tsx` | 양도·취득 기준시가 미리보기 **2곳을 `calcSection165_4Value`에 위임** · `evalDate`·`isBlank` 도입 · §81④ 토글에서 `perShare > 0` 제거(O-5b) |
| `FaceValueBlock.tsx` | 양도기준시가 미리보기 **위임** (`ni > 0 ? … : na` 제거) |
| `PostListingValuationCard.tsx` | `showAccrualToggle` 술어 `> 0` → **4필드 입력 판정**(O-5) |
| `PostListingNetAssetStatement.tsx` | `ASSET_ADD_SIGNED = [true, true, false, false]`(O-4) — 4열 × 2체계 파급 |
| `PostListingNetIncomeStatement.tsx` · `types/stock-transfer.types.ts` | 라벨·주석 오타(O-7) |

UI에서 **§165④ 산식 재구현을 전부 제거**했다. 가중치·80% 하한·연혁 게이팅은 이제 한 곳에만 있다.

### 10.2 anchor 12건 — 수정 전 **9 적색 / 3 녹색**

녹색 3건(AT-2·NA-3·PV-5)은 「이 동작은 그대로여야 한다」를 미리 고정한 것이다.

### 10.3 뮤테이션 10건 — 전부 «정확히 대상만» 적색화

| probe | 무력화 | 적색 |
|---|---|---|
| Q-1a | EUB 연혁 게이팅(고정 2026) | PV-1 · PV-6 |
| Q-1b | EUB 80% 하한 | PV-2 · PV-6 |
| Q-2 | FVB 위임 되돌림 | PV-3 |
| Q-3 | 양도일 미입력 fallback 삽입 | PV-4 |
| Q-4 | `isNetAssetOnly` 분기 제거 | PV-5 |
| Q-5 | PLVC `> 0` 복원 | AT-1 |
| Q-6 | PLVC 미입력 판정 제거 | AT-2 |
| Q-7 / Q-7b | `ASSET_ADD_SIGNED[0]` / `[1]` → false | NA-1 / NA-2 |
| Q-8 | `ASSET_ADD_SIGNED` 전부 true | NA-3 |
| Q-9 | 라벨 오타 복원 | LB-1 |

### 10.4 🔴 회귀 1건 — **기존 픽스처의 결손이었다**

`EstimatedUnlistedBlock-case49.test.tsx` `UI-C49-14`가 적색이 됐다.
원인은 **픽스처에 `transferDate`가 없는 것**이다 — 연혁 게이팅 기준일이 없으므로 미리보기가
판정 불가로 숨는다(PV-4의 의도된 귀결). 실제 마법사에서 양도일은 **Step1 필수**라
Step2에서 미리보기가 뜰 시점에는 항상 채워져 있다.

⇒ 픽스처에 `transferDate: "2026-01-01"`을 넣고 **왜 필요한지 주석으로 남겼다.**
   **단언값은 바꾸지 않았다** — 2026 양도도 3:2 + 하한이라 양도기준시가 64,000·
   환산취득가 7,812,500이 그대로다. 테스트의 의도가 보존된다.

### 10.5 검증

- anchor 12건 녹색 · 뮤테이션 10건 실증
- **E2E 84건 통과** (`--grep "stock-transfer|unlisted"`) — 기존 `stock-transfer-165-9-main`(§81④ 토글)·
  `stock-transfer-165-5-floor80`(하한 표시) 포함
- `npx tsc --noEmit` 0건 · `npm run lint` 0 errors (경고 317건, 변경 전과 동일)
- 전체 회귀 전건 통과

### 10.6 남은 것

**O-1**(1999~2007 음수 평가액) · **O-2**(§56④ 준용 명문)는 계속 기록만 한다 — 둘 다 독립 법적 판정이 선행한다.
`conversionPreview`의 `perShare <= 0` 게이트(EUB:170 · FVB:54)는 **분모**라 0·음수에서 정의되지 않으므로
그대로 둔다.
