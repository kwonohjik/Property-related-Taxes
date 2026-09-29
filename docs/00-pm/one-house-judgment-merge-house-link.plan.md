# 1세대1주택 판정 — 합가 특례 입력을 보유 주택 명부와 연결 (3단계)

> 작성 2026-09-29 · 상태 **Plan (Q 확정 — V 확인 후 Do)** · 대상 화면 `/calc/one-house-exemption`
> 선행 작업: PR #1875(요건 순차 검토 카드) — 이 계획의 3단계가 그 카드에 합가 특례 항목을 추가한다.

## 1. 제보 요약

- 혼인합가일·동거봉양 합가일 칸이 **① 세대 단계**에 있다(스크린샷 5).
- 합가로 들어온 주택은 **③ 보유 주택·권리 단계의 명부**에 입력한다(스크린샷 6).
- 두 입력이 떨어져 있어 흐름이 어색하고, **어느 주택이 합가로 들어온 주택인지** 구별할 방법이 없다.

## 2. 현황 실측 (file:line — 2026-09-29 master `95598eca`)

### 2-1. 합가일 칸의 위치와 배타 규약

| 위치 | 코드 | 동작 |
|---|---|---|
| ① 세대 | `app/calc/one-house-exemption/steps/Step1.tsx:78` | `judgmentMergeDateOwnedByStep1(form)`이 true면 `<MergeDateSection>` 렌더 |
| 소유 술어 | `lib/calc/one-house-judgment-section-scope.ts:43-47` | `!(분양권·입주권 > 0 && 주택 수 < 2)` |
| ③ 일시적 2주택·합가 특례 | `app/calc/one-house-exemption/steps/Step2.tsx:186-205` | `TemporaryTwoHouseSection`에 `hideMergeDate` — 칸이 두 벌 뜨는 것을 막으려고 판정 메뉴에서만 끔 |
| ③ 합가 권리 예외 | `components/calc/transfer/MergedHouseholdRightSection.tsx:78·83` | 분양권·입주권이 있고 주택 수 < 2이면 합가일 3필드를 **직접 소유** |
| 계산기 | `TemporaryTwoHouseSection.tsx:452` | `!hideMergeDate`면 이 섹션 안에서 합가일을 받음(양도세 계산기는 원래 ③에 있다) |

- 파일명과 화면 순서가 다르다: `Step2.tsx`가 **세 번째 화면**(보유 주택·권리)이다(`OneHouseJudgmentCalculator.tsx:37·49`).
- 「세대 내 먼저 양도하는 주택」 선언(`isFirstTransferredInMerge`)도 `MergeDateSection.tsx:52` 안에 있어 합가일과 함께 움직인다.
- 두 날짜 동시 입력 경고는 `validateStep1`에 있다(`lib/calc/one-house-exemption-validate.ts:80-87`).

### 2-2. 🔴 엔진이 다른 주택의 「합가 전 소유」를 보지 않는다

합가 의제의 술어는 다음만 본다.

- 주택 수 2(`transfer-tax-exemption-requirements.ts:674-676`) 또는 §155① 중첩 3주택(`:721-728`)
- 선양도 선언 · 합가일 · 양도일 ≥ 합가일 · **양도 주택** 취득일 ≤ 합가일(`:697-707`)
- 합가일부터 N년 이내(`:681-688`)

`input.houses`(명부)는 이 술어에서 **한 번도 읽히지 않는다**.

**probe 실측** (throwaway `checkExemption`, 실행 후 삭제). 조건: 양도 주택 취득 2015-01-01, 혼인일 2020-01-01, 양도 2026-03-01, 주택 수 2, 선양도 체크.

| 다른 주택 취득일 | 엔진 결과 | 법령상 올바른 결과 |
|---|---|---|
| 2018-01-01 (혼인 전) | 비과세 | 비과세 가능 — 단, 그 주택이 **배우자 쪽** 소유였을 때만 |
| **2022-06-01 (혼인 후)** | **비과세** | §155⑤ 불성립(합가로 2주택이 된 게 아님) → §155① 검토: 신규 취득 2022-06-01부터 3년 = 2025-06-01 경과 → **과세** |
| 2022-06-01 · 선양도 미체크 | 과세 | 과세 |

⇒ 두 번째 행은 **실제로 틀린 결과**다. 판정 route는 계산기와 같은 스키마·엔진 입력(`route.ts:30-31`)을 쓰므로 같은 결과가 나올 것으로 보지만, **route 경유 재현은 V-3**으로 남긴다.

추가로 표현할 수 없는 사례가 있다. 본인이 혼인 전부터 2주택이고 배우자는 무주택이면, 두 주택 모두 혼인 전 취득이라 날짜로도 구별되지 않는다. 이 사례는 **소유 쪽 입력 없이는 판정할 수 없다**.

### 2-3. 판정 메뉴의 「배우자 단독 보유 주택」 칩은 죽은 입력이다

- 명부 편집 창은 `showSpouseOwned={!!form.marriageDate}`일 때 「배우자 단독 보유 주택」 칩을 띄운다(`HousesListSection.tsx:476·540` → `HouseEntryEditor.tsx:199-214`). 판정 메뉴도 이 컴포넌트를 그대로 쓴다(`Step2.tsx:163` → `HouseCountExemptionInputs`).
- 이 값(`isSpouseOwned`)을 읽는 엔진은 **다주택 중과**(`multi-house-surcharge.ts:185`, 영 §167의3⑨)뿐이다. 판정 route는 중과 엔진을 import하지 않는다(`route.ts:25-57` import 목록).
- ⇒ 판정 메뉴에서는 입력해도 결과가 바뀌지 않는다. grep 기준이며 **V-4**에서 뮤테이션으로 재확인한다.

## 3. 법령 근거 (KoreanLaw MCP — 소득세법 시행령 MST 286211, 2026-07-01 시행 현행본 본문 확인)

- **§155④ 동거봉양** — 「1주택을 보유하고 1세대를 구성하는 자가 **1주택을 보유하고 있는** 60세 이상의 직계존속(…)을 동거봉양하기 위하여 세대를 합침으로써 1세대가 2주택을 보유하게 되는 경우 합친 날부터 10년 이내에 먼저 양도하는 주택은 이를 1세대1주택으로 보아 제154조제1항을 적용한다.」
- **§155⑤ 혼인** — 「**1주택을 보유하는 자가 1주택을 보유하는 자와 혼인함으로써** 1세대가 2주택을 보유하게 되는 경우 **또는** 1주택을 보유하고 있는 60세 이상의 직계존속을 동거봉양하는 무주택자가 1주택을 보유하는 자와 혼인함으로써 1세대가 2주택을 보유하게 되는 경우 각각 혼인한 날부터 10년 이내에 먼저 양도하는 주택은 …」

⇒ 요건의 중심은 날짜가 아니라 **「합치기 전 각자 1주택」**이다. 합가일은 세대에 일어난 사건 하나이고, 주택마다 달라지는 사실은 **합가 전 누구 소유였나**다.

**3주택 중첩(§155① + ④⑤)** — 엔진 주석(`transfer-tax-exemption-requirements.ts:730-742`)이 인용한 해석례. 본문 재확인은 **V-1**.

- 사전-2025-법규재산-1240 — 일시적 2주택 상태에서 동거봉양 합가
- 서면-2022-법규재산-5124 — 혼인 합가 **후** 신규주택 취득
- 기본통칙 89-155…2① — 일시 2주택 중 혼인·동거봉양으로 3주택
- 서면-2021-부동산-0263 — 4주택이 되면 비과세 부인

**합가일 = 취득일** — 서면-2023-부동산-0231(동거봉양) · 부동산거래관리과-410(혼인). 엔진 `:666-667` 주석 인용이며 본문 재확인은 **V-1**.

## 4. 해결 방향 — 3단계

| 단계 | 내용 | 판정 결과 변화 | 배포 |
|---|---|---|---|
| **1** | 합가 섹션을 ① → ③(명부 바로 아래)으로 이동 | **없음**(배치만) | 단일 PR (Q-1) |
| **2** | 명부 행에 「합가 전 소유」 입력 추가 + 전송 경로(① ~ ⑭) | 없음(엔진이 아직 안 읽음) | 단일 PR |
| **3** | 엔진이 합가 전 구성을 검증 + 요건 검토 카드에 합가 특례 항목 | **있음** — §2-2 오판정 정정 | 단일 PR |

> **Q-1 = 단일 PR** — 세 단계를 커밋으로만 나누고 한 PR로 낸다. 2단계만 먼저 배포되는 일이 없으므로 죽은 입력 문제는 생기지 않는다.

### 4-1. 1단계 — 합가 섹션 이동 (UI 전용)

**배치**(Q-2 = A 확정): ③ 화면의 「일시적 2주택·합가 특례」 섹션 안. 계산기와 같은 자리이며, 판정 메뉴에서는 `hideMergeDate`를 걷어내는 것이 곧 이동이다.

| 조건 | 합가 칸 소유자 |
|---|---|
| 주택 수 ≥ 2 | `TemporaryTwoHouseSection`(③) — `hideMergeDate` 제거 |
| 분양권·입주권 > 0 && 주택 수 < 2 | `MergedHouseholdRightSection`(③) — 현행 유지 |
| 그 밖(1주택 · 권리 없음) | **없음** — §155④⑤는 2주택이 전제라 입력할 이유가 없다 |

변경 파일:

- `Step1.tsx:72-78` — `<MergeDateSection>` 렌더와 배타 규약 주석 제거.
- `one-house-judgment-section-scope.ts:32-47` — `judgmentMergeDateOwnedByStep1` → **`judgmentMergeInputVisible`**(위 표의 위쪽 두 행 OR). ⑤·④·⑧ 공용 leaf.
- `Step2.tsx:186-205` — `hideMergeDate` 제거와 주석 갱신.
- `one-house-exemption-api.ts:205-209` — ④ **숨은 칸 값 미전송**. 합가 칸이 사라지는 조건(명부에서 주택을 지워 1주택이 됨)에서 남은 날짜가 엔진에 가면 사용자가 볼 수 없는 합가 안내가 결과에 뜬다. `judgmentMergeInputVisible`로 게이트한다(3중 패턴).
- `one-house-exemption-validate.ts:80-87` — 두 날짜 동시 경고를 `validateStep1` → **`validateStep2`**(③ 화면)로 이동. 같은 게이트를 적용한다.

지키는 것: 양도세 계산기는 **변경 없음**(`hideMergeDate`는 판정 메뉴만 넘긴다).

### 4-2. 2단계 — 명부 행 「합가 전 소유」

**필드**(Q-3 확정): `HouseEntry.mergeOrigin?: "seller_side" | "counterpart_side"`

- **양도 주택 쪽은 묻지 않는다.** 양도 주택은 양도자 소유이고 합가일 이전 취득이 이미 요건이다(`:705`). 따라서 「양도자 쪽」으로 고정한다.
- **합가 후 취득은 저장하지 않고 파생한다.** 행 취득일 > 합가일이면 선택지 없이 「합가 후 취득」으로 표시한다. 저장값이 날짜와 어긋나는 dual truth를 막기 위해서다.
- **취득일 = 합가일**이면 선택지를 보인다(§3 해석례: 순서 선택).
- **라벨** — 혼인: 「양도자(본인) 쪽 / 배우자 쪽」, 동거봉양: 「양도자 쪽 / 합친 가족 쪽」. §155④는 부모·자녀 어느 쪽도 양도자가 될 수 있어 「직계존속」으로 고정하지 않는다.

**노출**: 판정 메뉴 · `judgmentMergeInputVisible && 합가일 입력`일 때 편집 창에 `RadioCardGroup`. 명부 표 「특례」 열에 배지(「배우자 쪽」 등)를 달아, 표만 봐도 어느 주택이 합가 주택인지 보이게 한다.

**「배우자 단독 보유」 칩(§2-3)** — 판정 메뉴에서는 숨긴다(Q-4). 같은 사실을 두 칸이 묻게 되고, 그중 하나는 결과에 반영되지 않기 때문이다. 계산기는 중과 축이므로 유지한다.

**14 동기화 지점**:

| 지점 | 파일 | 내용 |
|---|---|---|
| ① 폼 타입 | `lib/stores/calc-wizard-asset-nbl.ts:75` `HouseEntry` | 선택 필드 추가(구 저장분은 부재 = 미입력) |
| ② initial | `HousesListSection.tsx:237` 행 팩토리 | 기본값 없음(`undefined`) |
| ③ normalize | 명부 행 normalize (V-5에서 위치 확인) | enum 밖 값 제거 |
| ④ API 변환 | `lib/calc/transfer-tax-api-houses.ts:257` 부근 | 게이트 통과 시만 전송 |
| ⑤ 위젯 | `HouseEntryEditor.tsx` BasicInfoSection | 라디오 + 파생 표시 |
| ⑦ 표 배지 | `HousesListSection.tsx` 특례 열 | 배지 |
| ⑧ validate | `validateStep2` | **차단하지 않고 경고만** — 미입력이면 판정 불가(§4-3의 legacy) + 「합가 전 소유를 입력하면 합가 특례를 정확히 판정합니다」 |
| ⑫ Zod | `lib/api/transfer-tax-schema-sub.ts:238` 부근 `houseSchema` | `z.enum([...]).optional()` |
| ⑭ Route→엔진 | `lib/api/transfer-route-multi-house.ts:47` `mapHousesToEngine` | 그대로 전달 |
| 엔진 타입 | `multi-house-surcharge.types.ts:30` `HouseInfo` | 선택 필드 |

⑥(사이드바 합계)·⑨⑩⑪(자산 enum·컴패니언·취득일 fallback)은 해당 없음 — 명부 행 속성이다. ⑬은 ④와 같은 빌더라 함께 반영된다.

### 4-3. 3단계 — 엔진 검증 + 요건 검토 카드

**새 술어** `resolveMergeComposition(input)` → `"holds" | { fails: 사유[] } | "unknown"`

- 파일: `lib/tax-engine/one-house/merge-composition.ts`(신규). `transfer-tax-exemption-requirements.ts`가 753줄(≥750 위험 구간)이라 거기에 붙이지 않는다.
- **호출 지점은 한 곳**: `matchMergeApartFromWindow`(`:697`)에 AND한다. 비과세(`transfer-tax-exemption.ts:472`), 중과 15호, pending 합가 축(`pending.ts:249-250`)이 모두 이 술어를 거치므로 **단일 소스**가 유지된다.
- `unmet-exceptions.ts`에 실패 사유 문구를 추가한다. 예: 「다른 주택(2022-06-01 취득)은 혼인 후 취득 — 혼인으로 2주택이 된 경우가 아닙니다. §155① 일시적 2주택 요건을 확인하세요.」

**두 층으로 나눈다** — 새 입력이 없는 경로(계산기·구 이력)를 보호하기 위해서다.

| 층 | 필요한 입력 | 적용 범위 | 입력이 없으면 |
|---|---|---|---|
| **3-a 날짜 검증** | 명부 행 취득일(**이미 있음**) | 판정 메뉴 **+ 계산기** | 명부가 없으면 `unknown` → 현행 |
| **3-b 소유 쪽 검증** | `mergeOrigin`(2단계) | 판정 메뉴 | 행에 값이 없으면 `unknown` → 현행 + 경고 |

**케이스 매트릭스** (S = 양도자 쪽, C = 상대 쪽, P = 합가 후 취득(파생), 양도 주택은 항상 S)

| # | 주택 수 | 명부(양도 주택 제외) | 판정 | 근거 |
|---|---|---|---|---|
| M-1 | 2 | C | **성립** | §155⑤ 전단 · §155④ |
| M-2 | 2 | S | **불성립** — 합가 전 S 2주택, C 무주택 | §155⑤ 「1주택을 보유하는 자가 1주택을 보유하는 자와」 |
| M-3 | 2 | P | **불성립(3-a)** → §155① 경로로 판정 | probe §2-2 |
| M-4 | 2 | 미입력 | `unknown` → 현행 동작 + 경고 | 구 이력 보호 |
| M-5 | 3 | C, P | 중첩 — `resolveMergeOverlapDeeming` 현행 요건 + P가 §155① 신규 주택이어야 함 | 서면-2022-법규재산-5124 (V-1) |
| M-6 | 3 | S, C (S가 일시적 2주택) | 중첩 성립 가능 | 기본통칙 89-155…2① (V-1) |
| M-7 | 3 | C, C | **불성립** — 상대가 합가 전 2주택 | 「1주택을 보유하는 자」 (V-1: 상대 쪽 일시적 2주택 해석례 유무) |
| M-8 | 3 | P, P | 불성립 | 4주택 부인 취지 · §155① 신규 주택 1채 |
| M-9 | 2 | C, 취득일 = 합가일 | 성립(사용자가 순서 선택) | 부동산거래관리과-410 (V-1) |

> §155⑤ **후단**(동거봉양하는 무주택자가 혼인)은 합가 전 양도자 쪽 주택이 직계존속 소유다. 「양도자 쪽」을 「양도자 세대 쪽」으로 읽으면 M-1과 같은 구성이 된다. 라벨·해석은 **V-2**.

**요건 검토 카드** — `requirement-review.ts`에 scheme `"155-4-5-merge"` 추가. 합가 의제가 성립했거나, 합가일이 입력됐는데 구성 요건에서 탈락했을 때 표시한다.

| 순서 | id | 항목 | 상태 원천 |
|---|---|---|---|
| 1 | `merge-composition` | 합가 전 각자 1주택 | `resolveMergeComposition` |
| 2 | `merge-selling-before` | 양도 주택을 합가 전(당일 포함) 취득 | `:705` |
| 3 | `merge-first-transfer` | 합가 후 먼저 양도하는 주택 | 선양도 선언 |
| 4 | `merge-window` | 합가일부터 N년 이내 양도 | `resolveMergeExemptionYears` · 판정 기준일 규칙(#1875)과 같은 방식 |
| 5~7 | `holding`·`residence`·`high-value` | 기존 leaf 재사용 | #1875 describe leaf |

동거봉양 **60세 요건**은 입력 칸이 없다(`60세` grep 0건 — 엔진·폼 모두). 이번 범위에서는 추가하지 않는다. 카드 항목에는 넣지 않고, 사실 문구 「합가일 입력 = 요건 해당 선언」을 A-2로 명시한다.

## 5. 작업 순서 (Do)

```
1. [1단계] 술어 교체·Step1 제거·Step2 hideMergeDate 제거·④⑧ 게이트
   → verify: AN-2·merged-household-right-path 갱신 + 신규 UI 테스트, E2E VW-1/VW-2 경로 수정, 판정 anchor 전건 불변
   → 커밋 1 (단계별 커밋 — Q-1)
2. [2단계] HouseEntry.mergeOrigin ①~⑭ + 편집 창 라디오 + 표 배지 + 판정 메뉴 isSpouseOwned 칩 숨김
   → verify: ⑫⑬⑭ grep 자가 점검, route anchor(값이 엔진 input.houses까지 도달)
3. [3단계] merge-composition.ts + matchMergeApartFromWindow AND + unmet 문구 + 요건 카드 scheme
   → verify: M-1~M-9 anchor, 뮤테이션(술어 AND 제거·3-a 날짜 비교 반전·unknown→fails), 전체 vitest(계산기 세액 변화가 M-3류에만 있는지)
4. E2E: 합가 입력 → 명부 행 소유 선택 → 결과 카드 합가 항목. Playwright 스크린샷 확인
   → 커밋 2·3 → 단일 PR
```

## 6. 테스트 계획

**1단계**
- UI(RTL): ① 화면에 `merge-date-marriage` 없음. ③ 화면에서 주택 수 2 → 칸 1벌, 1주택 + 분양권 → `MergedHouseholdRightSection` 1벌, 1주택 → 0벌.
- ④ anchor: 1주택으로 줄인 뒤 남은 합가일이 본문에 없음.
- ⑧ anchor: 두 날짜 경고가 `validateStep2`에서 나옴.
- 영향받는 기존 테스트(역방향 grep 결과):
  - `__tests__/calc/judgment-step-reorder-preconditions.ui.test.tsx` (AN-2)
  - `__tests__/calc/merged-household-right-path.ui.test.tsx`
  - `e2e/validation-warnings-display.spec.ts` (VW-1·VW-2가 ①에서 날짜 입력)
  - `e2e/transfer-155-temp-two-house-auto-judge.spec.ts` (`hideMergeDate` 언급 — V-6)

**2·3단계**
- 엔진 anchor `__tests__/tax-engine/transfer/one-house-merge-composition.anchor.test.ts`: M-1~M-9. M-3은 §155① 경로로 가서 **과세**가 되는 것까지 단언한다.
- 계산기 회귀 anchor: 계산기 본문(명부 있음, M-3 구성)에서 3-a가 비과세를 거두는지 단언한다. 명부 없는 계산기 본문은 현행과 동일해야 한다.
- UI: 라디오 노출 게이트, 파생 「합가 후 취득」 표시, 표 배지, 결과 카드 행 순서.

## 7. 레지스터

### 사용자 결정 (Q)

| # | 질문 | 결정 |
|---|---|---|
| Q-1 | 배포 단위 | **단일 PR 확정** — 단계별 커밋 |
| Q-2 | 1단계 배치 | **A 확정** — ③ 「일시적 2주택·합가 특례」 섹션 안(계산기와 같은 자리, 주택 수 ≥ 2) |
| Q-3 | 소유 입력 형태 | **확정** — 행마다 2지선다 + 합가 후 취득은 날짜로 파생 |
| Q-4 | 판정 메뉴의 「배우자 단독 보유」 칩 | **숨김**(권장안 채택 — V-4로 무효 확인 후) |
| Q-5 | 3-a 날짜 검증을 계산기에도 적용 | **적용 확정** — 계산기 세액이 M-3류 사례에서 비과세→과세로 바뀐다 |

### 가정 (A)

- A-1 양도 주택은 양도자 소유이고 합가 전 취득이다(현행 `:705`가 이미 요구).
- A-2 동거봉양 60세(④각 호) 요건은 합가일 입력으로 해당 선언한 것으로 본다. 입력 칸 추가는 범위 밖이다.

### 미검증 (V) — Do 전 확인

| # | 확인할 것 | 방법 |
|---|---|---|
| V-1 | §3 해석례 5건 본문 · M-7(상대 쪽 일시적 2주택) 해석례 유무 | KoreanLaw `get_decision_text`, 없으면 taxlaw.nts |
| V-2 | §155⑤ 후단(동거봉양 무주택자 혼인)의 구성 판정 · 라벨 | 조문 · 해석례 |
| V-3 | §2-2 M-3 오판정의 route 경유 재현 | route anchor probe |
| V-4 | 판정 메뉴 `isSpouseOwned` 무효 | 뮤테이션(값 반전 → 판정 anchor 전건 불변 확인) |
| V-5 | 명부 행 normalize·sessionStorage 마이그레이션 위치 | grep |
| V-6 | `transfer-155-temp-two-house-auto-judge.spec.ts`의 `hideMergeDate` 언급이 판정 메뉴 단언인지 | 파일 정독 |
| V-7 | 3-a가 계산기 기존 anchor를 깨는지(깨지면 그 anchor가 M-3류를 비과세로 고정하고 있던 것) | 전체 vitest + 실패 건 법령 대조 |

## 8. 곁가지 (범위 밖 — 기록만)

- `app/calc/one-house-exemption/page.tsx:7·10` 메타 설명에 「조건부 기한」이 남아 있다. #1875에서 「조건부」 배지를 폐지했으므로 문구 정리 대상이다. 단일 PR에 한 줄 정정으로 함께 넣는다.

## 9. 완료 기준 (DoD)

**1단계**
- [ ] ①에 합가 칸이 없고, ③에서 조건별로 정확히 0 또는 1벌 렌더된다
- [ ] 숨은 합가 값이 전송되지 않는다(④ anchor) · 경고가 ③ 단계에 뜬다
- [ ] 판정 결과 변화 0(기존 판정 anchor 전건 통과) · 계산기 변경 0

**2·3단계**
- [ ] 편집 창에 합가 전 소유 입력 · 명부 표 배지 · 합가 후 취득 자동 표시
- [ ] M-1~M-9 anchor 통과 · 뮤테이션 전건 KILL
- [ ] 제보성 사례 M-3가 판정 메뉴·계산기 모두 과세(§155① 경로)
- [ ] 요건 검토 카드에 합가 특례 7행이 법정 순서로 표시
- [ ] 14지점 grep 자가 점검 · `tsc` 0 · lint error 0 · 모든 수정 파일 ≤ 800줄
- [ ] Playwright 브라우저 확인(합가 입력 → 행 선택 → 결과 카드)
