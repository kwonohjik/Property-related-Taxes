# 별개취득 입력 흐름 재배치 — 토글 직하 날짜 2열 + 양도가액 축 선행 + 미사용 취득시 기준시가 숨김

- 작성일: 2026-07-29
- 대상: 양도소득세 마법사 Step1 자산 카드 (`components/calc/transfer/`)
- 성격: **UI 재배치 + 표시 게이트**. 엔진 input/result·폼 필드·API 계약 **무변경**.
- 선행 작업: PR #879·#880·#881·#883·#884 (별개취득 기준시가 게이트 완화 + 규칙 ①③ 확정)

---

## 1. 배경 — 사용자 보고 3건

| # | 현상 | 근거 |
|---|---|---|
| ① | 「토지·건물 취득일 다름」 토글을 켜도 **화면에 아무 반응이 없다**. 토지 취득일과 양도가액 구분 UI가 한참 아래에 나타난다 | 토글 `CompanionAcqPurchaseBlock.tsx:226`, 펼침 내용 `:717` — 사이에 취득가액 산정 방식·취득가액·취득시 기준시가 블록 전체(약 490줄 JSX)가 끼어 있음 |
| ② | 양도가액을 토지·건물로 구분하는 UI가 **취득가액 입력보다 뒤**에 있다 | 확정 계산 규칙은 **① 양도가액 구분 → ② 취득가액 산정** 순서(2026-07-29 사용자 확정). 현행 UI는 역순 |
| ③ | 계산에 쓰이지 않는 「취득시 기준시가」 칸이 **"사용되지 않습니다" 안내와 함께 계속 떠 있다** | `CompanionAcqPurchaseBlock.tsx:660` hint 분기 |

### 1.1 현행 배치가 그렇게 된 이유 (깨면 안 되는 제약)

`CompanionAcqPurchaseBlock.tsx:711` 주석에 근거가 명시돼 있다 — 2026-07-16에 **의도적으로** 분리 블록을 「취득가액 산정 방식」 뒤로 내렸다.

> 산정 방식(실거래가/환산/감정/매매사례)이 이 블록의 취득가액 칸 노출을 결정하므로 UI 순서 = 엔진 계산 로직 순서. 종전에는 이 블록이 위에 있어, 아직 정하지 않은 모드에 따라 위쪽 화면이 달라지는 역순이었다.

⇒ **통째로 위로 올리면 이 결함이 되살아난다.** 축을 쪼개야 한다.

### 1.2 두 축의 의존 관계 (실측)

`LandBuildingSplitSection.tsx`는 성격이 다른 두 축이 한 컴포넌트에 있다.

| 축 | 내용 | 렌더 위치(현행) | 「취득가액 산정 방식」 의존 |
|---|---|---|---|
| **A. 양도가액 구분** | 구분/일괄 라디오(`:478-505`) + 양도시 토지·건물 기준시가(`:507-535`) | 하단 | **없음** |
| **B. 취득가액 파트별** | 토지·건물 각각 산정 방식 라디오 + 취득시 기준시가 + 파트 취득가액(`:404-476`) | 하단 | **있음** |
| C. 자본적지출 | 토지·건물 자본적지출(`:537-547`) | 하단 | 없음 (축 B에 귀속 유지) |

축 A의 표시 조건 `needsSaleStdPrice`(`:379-382`)만 축 B 모드를 참조한다 — §3.4에서 별도 처리.

---

## 2. 확정 요구사항 (사용자 지시)

1. 「토지·건물 취득일 다름」 토글 **바로 아래**에 「토지 취득일」·「건물 취득일」을 **한 행에 나란히** 배치
2. 그 아래에 **양도가액 구분 UI(축 A)** 배치
3. 계산에 쓰이지 않는 **「취득시 기준시가」는 숨김**

---

## 3. 변경 설계

### 3.1 컴포넌트 분리 — 축 A 추출

`LandBuildingSplitSection.tsx`(현행 548줄)에서 축 A를 새 파일로 추출한다.

```
components/calc/transfer/
├── CompanionAcqPurchaseBlock.tsx       # 807 → 699줄 (착지 목표 ≤700 충족)
├── CompanionAcqDateSection.tsx         # 취득일 + 분리 토글 + 축 A 호출          ← 신규
├── LandBuildingSplitSection.tsx        # 축 B + C (취득가액 파트별 + 자본적지출) 548 → 360줄
└── LandBuildingSaleSplitSection.tsx    # 축 A (양도가액 구분 + 양도시 기준시가)   ← 신규
```

**Do 단계 deviation(2026-07-29)**: 계획 시점에는 `CompanionAcqPurchaseBlock.tsx`가 이미 807줄
(트리거 800 초과)이었고 이번 재배치로 860줄까지 늘었다 → 이번에 손댄 **취득일 영역**(토글·2열·축 A
호출 + 1985.1.1. 클램프 state)을 `CompanionAcqDateSection.tsx`로 함께 분리했다. 결과 699줄로
착지 목표(≤700)를 충족한다. 계획서 §3에는 없던 파일이지만, 정책상 강제되는 분리이고 대상이
이번 변경 범위와 정확히 일치해 surgical 범위를 벗어나지 않는다.

- 축 A는 **32개**(실측 `interface Props`) prop 중 **9개만** 필요: `saleSplitMode`·`onSaleSplitModeChange`·`land/buildingTransferPrice`(+onChange)·`land/buildingStandardPriceAtTransfer`(+onChange)·`asset`·`onAssetChange`·`transferDate`·`isBurdenedGift`·`landAcqMode`·`buildingAcqMode`(needsSaleStdPrice 판정용).
- 기존 `TransferLandStdPrice`·`TransferBuildingStdPriceButton` 내부 헬퍼(`TransferLandStdPrice :201-248` · `TransferBuildingStdPriceButton :254-288`)를 신규 파일로 함께 이동.
- **testid·라벨·hint 문자열은 한 글자도 바꾸지 않는다** — 기존 anchor·E2E 셀렉터 보존(§6).
- 부수 효과: `LandBuildingSplitSection.tsx`가 800줄 정책 여유 구간으로 내려간다(현행 548 → 약 330).

**대안 기각**: `section?: "sale" | "acq"` prop으로 한 컴포넌트를 두 번 렌더 → 호출부에서 32개 prop을 두 번 나열해야 해 누락 위험(⑤ 침묵 strip과 같은 실패 모드). 분리를 택한다.

### 3.2 배치 순서 (`CompanionAcqPurchaseBlock.tsx`)

```
건물 취득일 라벨 행  [chip 토글: 토지·건물 취득일 다름]
├─ (토글 OFF) 취득일 ─────────────────────── 단독 전체폭 (현행 유지)
└─ (토글 ON)
   ├─ [토지 취득일] │ [건물 취득일]          ← 신규 2열 (§3.3)
   └─ <LandBuildingSaleSplitSection>        ← 축 A (규칙 ①)
────────────────────────────────────────────
취득가액 산정 방식 (실거래가/환산/감정/매매사례)
취득가액
취득시 기준시가                              ← 조건부 숨김 (§3.5)
1990 이전 토지 환산 / 양도시 기준시가(환산 분모)
────────────────────────────────────────────
(토글 ON) <LandBuildingSplitSection>         ← 축 B+C (규칙 ②) — 현 위치 유지
```

- `:717-743`의 「토지 취득일」 `FieldCard`는 **제거**하고 위로 이동(중복 입력 금지).
- `:746`의 `<LandBuildingSplitSection>`은 현 위치 유지, 축 A만 빠진다.

### 3.3 날짜 2열 레이아웃

현행(`:218-243`) 라벨 행은 `취득일 라벨 + 의제취득 배지 + 토글 chip`이 **한 줄**이고 그 아래 `DateInput` 하나다.

🔴 **토글 chip을 건물 취득일 라벨 행에 그대로 두면 안 된다** — 2열이 되는 순간 chip이 **오른쪽 칸 안**으로 들어가, 요청하신 "토글 아래에 두 날짜" 구조가 성립하지 않는다. 토글을 **그리드 위 독립 행**으로 올린다.

```tsx
{/* ① 토글 행 — 항상 grid 밖 (OFF일 때도 위치 불변) */}
<div className="flex items-center gap-2 flex-wrap">
  {!isSplit && <span className="text-sm font-medium">{acqDateLabel}</span>}
  {!isSplit && isDeemedAcquisitionDate && <배지 />}
  {isSplitable && <ToggleCard variant="chip" tone="amber" title="토지·건물 취득일 다름" … />}
</div>

{/* ② OFF — 현행 그대로 단독 전체폭 */}
{!isSplit && <DateInput data-testid="acq-date-building" … />}

{/* ③ ON — 2열. 각 칸이 자기 라벨·배지·클램프 안내를 가진다 */}
{isSplit && (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start">
    <FieldCard label="토지 취득일" trailing={isLandDeemedAcquisitionDate && <배지 />}>
      <DateInput data-testid="acq-date-land" … />
    </FieldCard>
    <FieldCard label="건물 취득일 (사용승인일·매매 등기접수일)" trailing={isDeemedAcquisitionDate && <배지 />}>
      <DateInput data-testid="acq-date-building" … />
    </FieldCard>
  </div>
)}
```

- **순서**: 토지 → 건물 (사용자 지시).
- OFF에서는 라벨이 토글 행에, ON에서는 각 `FieldCard` 라벨로 이동한다 — `acqDateLabel`(`:187`)이 이미 `isSplit` 분기라 문자열은 그대로 재사용.
- `items-start`: 「의제취득(§98)」 배지·"1985.1.1.로 변경했습니다" 클램프 안내가 **한쪽에만** 조건부로 붙어 높이가 어긋난다.
- 모바일 `grid-cols-1`, `sm:` 이상 2열.
- `:257-263`의 «의제취득 + 분리 토글 ON» 경고문은 **그리드 아래**에 유지(두 날짜 모두에 걸리는 안내).
- ⚠️ `acq-date-building` `DateInput`이 OFF/ON 두 분기에 각각 있으면 **동시에 2개가 되지 않도록** 배타 조건(`!isSplit` / `isSplit`)을 지킨다 — E2E `fillDate(page, "acq-date-building", …)`가 strict mode 위반으로 깨진다.

### 3.4 축 A 이동의 부작용 — 「양도시 기준시가」 뒤늦은 등장

축 A의 양도시 기준시가 블록은 **안분 분모 겸 환산 분모** 겸용이다(`LandBuildingSplitSection.tsx:379-382`):

```ts
const needsSaleStdPrice =
  props.saleSplitMode === "apportioned" ||      // 안분 분모
  props.landAcqMode === "estimated" ||          // 환산 분모  ← 축 B 의존
  props.buildingAcqMode === "estimated";
```

⇒ **「구분양도 + 파트 환산」 조합**에서만, 아래쪽 축 B에서 환산을 고르는 순간 위쪽 블록이 뒤늦게 나타난다.

**판단: 감수한다(현행 유지).**
- `saleSplitMode` 기본값은 `"apportioned"`(일괄양도)이므로 **기본 경로에서는 항상 이미 떠 있다** — 점프가 발생하지 않는다.
- 해소하려면 양도시 기준시가를 축 A·축 B 양쪽에 두는 이원 배치가 되는데, 같은 필드 2곳 노출은 dual-truth 위험 대비 이득이 작다.
- 계획서에 근거를 남겨 "왜 안 고쳤는지"를 고정한다.

### 3.5 「취득시 기준시가」 숨김 게이트

**현행**(`CompanionAcqPurchaseBlock.tsx:626-666`): `useEstimatedAcquisition || isSplit`이면 렌더하고, 불필요하면 hint로만 알린다(`:660`).

**변경**: 이미 존재하는 술어 `acqStdPriceRequired`(`:166-187`, 엔진·validate와 동일한 `requiresAcqStdPrice`)로 **렌더 자체를 게이팅**한다.

#### 🔴 게이트를 거는 위치 (바깥에 걸면 안 된다)

`:601` 블록은 **5-way 분기**다 — 겸용·상업용건물·일반건물·PHD는 각각 "여기 말고 저기서 입력하세요" **길잡이 문구**를 렌더하고, 일반 자산만 마지막 `else`에서 실제 입력을 렌더한다.

```tsx
{(useEstimatedAcquisition || isSplit) && (
  isMixedUse         ? <p>…겸용주택 분리계산 영역에서 입력…</p>      // :602
  : isCommercialBuilding ? <p>…상업용건물 환산 영역에서…</p>         // :607
  : isGeneralBuilding    ? <p>…일반건물 환산 영역에서…</p>           // :613
  : usePreHousingDisclosure ? <p>…§164⑤ 3-시점에서 자동 도출…</p>    // :619
  : (<>취득시 기준시가 실입력 + 1990환산 + 양도시 기준시가</>)        // :625-708
)}
```

⇒ 최상위 조건에 `&& acqStdPriceRequired`를 붙이면 **네 개의 길잡이 문구까지 사라진다**(사용자가 어디서 입력하는지 모르게 됨).

게이트는 **마지막 `else` 분기 안, 「취득시 기준시가」 div(`:628-666`)에만** 건다:

```tsx
{acqStdPriceRequired && (
  <div className="space-y-1.5">{/* 취득시 기준시가 라벨 + StandardPriceInput */}</div>
)}
{showPre1990 && <Pre1990LandValuationInput … />}   {/* 형제 — 게이트 밖 유지 */}
```

- 값은 **지우지 않는다**. 파트 모드를 환산·감정·매매사례로 되돌리면 술어가 true가 되어 **입력값과 함께 다시 나타난다**.
- `:660`의 "계산에 사용되지 않습니다 (선택 입력)" hint 분기는 **도달 불가**가 되므로 함께 제거(dead branch 방치 금지).
- 필수 표시 `*`(`acq-std-required-mark`)는 이제 **항상 켜진 상태로만 렌더**된다 — 조건식은 유지(중복이지만 술어 단일 소스 유지가 목적).
- **감정가액 모드의 별도 입력(`:579-586` 「취득시 기준시가 (원) — 개산공제 base」)은 건드리지 않는다** — 같은 `standardPriceAtAcq`를 쓰는 **기존 중복**이다. 감정가액은 술어가 항상 true라 이번 게이트의 영향을 받지 않는다(§8).
- **`showPre1990` 블록은 게이트 밖에 둔다** — 1990 이전 토지 환산은 별도 경로로 `standardPriceAtAcq`를 산출한다(`onCalculatedPrice`).

#### 🔴 숨기면 안 되는 경우 (조건 단순화 금지)

주택(라목)은 부수토지를 포함한 **결합 공시**라 건물분 단독 공시가 없다. 건물분 취득시 기준시가 = **결합 총액 − 토지분** 역산이 유일한 경로이고(`LandBuildingSplitSection.tsx:141-145` 안내), 그 결합 총액이 바로 이 칸이다.

⇒ "분리모드면 무조건 숨김"으로 단순화하면 **주택 별개취득 + 파트 환산에서 취득가액이 조용히 0**이 된다(PR #881에서 고친 과대과세와 같은 경로). `requiresAcqStdPrice`는 파트 모드가 `actual`이 아니면 무조건 true를 반환하므로 이 경우를 이미 보호한다 — **술어를 우회하지 않는다**.

---

## 4. 케이스 매트릭스

`requiresAcqStdPrice`(`lib/calc/transfer-tax-split-acq-mode.ts`) 기준. `-` = 해당 없음.

| # | 자산 | 토글 | 파트 모드 | 파트 실가 | 양도가액 구분 근거 | 취득시 기준시가 | 날짜 2열 | 축 A 위치 |
|---|---|---|---|---|---|---|---|---|
| 1 | building | OFF + 실거래가 | - | - | - | 미렌더(현행) | 단독 | 미렌더 |
| 1-b | building | OFF + **환산** | - | - | - | 표시(현행 유지) | 단독 | 미렌더 |
| 2 | building | ON | 양쪽 actual | 양쪽 有 | 有(구분양도) | **숨김** ← 신규 | 2열 | 토글 직하 |
| 3 | building | ON | 양쪽 actual | 양쪽 有 | 無(일괄+기준시가 미입력) | 표시(*) | 2열 | 토글 직하 |
| 4 | building | ON | 토지 환산 | - | - | 표시(*) | 2열 | 토글 직하 |
| 5 | **housing** | ON | 건물 환산 | - | - | **표시(*) — 역산 소스** | 2열 | 토글 직하 |
| 6 | building | ON | 양쪽 actual | 한쪽만 | - | 표시(*) | 2열 | 토글 직하 |
| 7 | 겸용주택(isSplit 강제 ON, 취득일 동일) | ON | actual | 미입력 | - | **해당 없음** — 겸용 전용 길잡이 문구(`:602`), 실입력 없음 | 2열 | 토글 직하 |
| 8 | selfOwns≠both | ON | actual | - | - | 절 ③④ 판정 따름 | 2열 | 토글 직하 |
| 9 | 부담부증여 | ON | - | - | - | **미렌더** — 산정방식 게이트(`:353` `transferType !== "burdened_gift"`) 밖 | 2열 | 안내 카드만 |
| 10 | 자본적지출 有 + 파트 귀속 미입력 | ON | actual | 양쪽 有 | 有 | 표시(*) — 절 ⑥ | 2열 | 토글 직하 |

**케이스 7·9 주의**: 겸용주택은 `:602` 분기라 이번 게이트가 닿지 않는다(§3.5). 부담부증여·재개발은 `:353` 게이트 때문에 취득시 기준시가 블록 자체가 렌더되지 않는다 — 축 A·B는 그 게이트 **밖**이라 정상 렌더된다(`:715` 주석).

**케이스 9 안내 카드**: 현행은 `isBurdenedGift`가 컴포넌트 전체를 fuchsia 안내 카드로 short-circuit한다(`LandBuildingSplitSection.tsx:384-395`). 분리 후 **안내 카드는 축 A(신규 파일)에만** 두고 축 B는 `null`을 반환한다 — `data-testid="split-burdened-note"`가 화면에 **1개만** 존재해야 한다(E2E `split-mode-gating.spec.ts:179`).

---

## 5. anchor 테스트 (Do 진입 전 작성 — RED 확인 필수)

신규 `__tests__/components/split-input-flow-reorder.test.tsx`

| ID | 케이스 | 단언 |
|---|---|---|
| R1 | 토글 ON | `acq-date-land`·`acq-date-building`이 **같은 부모 grid** 안에 있다 (DOM 인접) |
| R2 | 토글 OFF | `acq-date-land` 미렌더, `acq-date-building` **정확히 1개** |
| R2-b | 토글 ON | `acq-date-building`이 **정확히 1개**(OFF/ON 분기 중복 금지) + 토글 chip이 grid **밖·앞** |
| R3 | 토글 ON | `sale-split-mode`(축 A)가 `part-acq-mode-land`(축 B)**보다 앞** — `compareDocumentPosition` |
| R4 | 케이스 2 | 「취득시 기준시가」 라벨 미렌더 (`acq-std-required-mark` count 0) |
| R5 | 케이스 5 (housing + 건물 환산) | 「취득시 기준시가」 **렌더됨** — 라목 역산 소스 보호 |
| R6 | 케이스 2 → 파트 모드 환산 전환 | 숨겼던 칸이 **입력값과 함께** 재등장 |
| R7 | 케이스 3 | 일괄양도 + 기준시가 미입력이면 표시(회귀 0) |
| R8 | 케이스 9 | `split-burdened-note`가 **정확히 1개** |
| R9 | 케이스 7 (겸용) | 「겸용주택 분리계산 영역에서 입력합니다」 **길잡이 문구가 그대로 렌더**된다 (게이트를 최상위에 걸면 사라짐 — §3.5 방지) |
| R10 | 케이스 1-b (분리 OFF + 환산) | 표시 유지 — 비분리 환산 경로 회귀 0 |

E2E `e2e/split-mode-gating.spec.ts` 보강

| ID | 단언 |
|---|---|
| U12 | 토글 ON 직후 **스크롤 없이** 토지 취득일·양도가액 구분이 보인다(토글과 같은 뷰포트) |
| U13 | 구분양도 + 양쪽 실가 입력 → 취득시 기준시가 블록이 사라진다 |

기존 E2E 영향 점검(§6)도 함께 수행.

---

## 6. 회귀 위험 · 기존 셀렉터 영향

| 위험 | 대상 | 방지 |
|---|---|---|
| testid 유실 | `sale-split-mode`·`split-land/building-transfer-price`·`split-land/building-std-transfer`·`split-land-std-transfer-area`·`split-burdened-note` | 축 A 추출 시 **문자열 그대로** 이동. `__tests__/components/split-transfer-std-price-auto.test.tsx`(11케이스)가 즉시 검출 |
| 라벨 텍스트 매칭 깨짐 | `e2e/split-mode-gating.spec.ts:48·70` `getByText("취득시 기준시가")` — 축 B의 「토지/건물 취득시 기준시가」 ToneCard 제목과도 부분 일치 | 라벨 문자열 무변경. :44 케이스는 기본 상태(일괄양도+기준시가 미입력)라 술어 true → 계속 표시됨을 확인 |
| **U11 확정 파손** | `e2e/split-mode-gating.spec.ts:273` — `getByText("계산에 사용되지 않습니다").toBeVisible()` | 그 hint 자체를 제거하므로 **반드시 깨진다**. 해당 단언을 «블록 미렌더» 검증으로 **교체**한다(예: 「취득시 기준시가 (원)」 라벨 `toHaveCount(0)`). `:263`·`:269`의 `acq-std-required-mark` 단언은 `toBeVisible`/`toHaveCount(0)`이라 그대로 통과 |
| 부담부증여 안내 중복 | `split-burdened-note` 2개 렌더 | R8 anchor |
| 주택 환산 취득가액 0 | §3.5 조건 단순화 | R5 anchor |
| prop 누락(침묵 strip) | 축 A 추출 시 9개 prop 전달 | `tsc` + R3·R4 |

**14 동기화 지점**: 폼 필드·엔진 input/result·API 계약 **무변경** → ①~⑭ 해당 없음. ⑤(UI 위젯) 배치만 변경. 술어는 `lib/calc/transfer-tax-split-acq-mode.ts` 단일 소스를 그대로 재사용하므로 ⑧(validation)과 자동 정합.

---

## 7. 검증 계획

1. anchor 9케이스 작성 → **RED 확인**(수정 전 R1·R3·R4가 실패해야 함)
2. 구현
3. `npx tsc --noEmit` 0건
4. `npx vitest run __tests__/components/ __tests__/calc/`
5. `npx playwright test e2e/split-mode-gating.spec.ts` (현행 21케이스 + U12·U13)
6. `npm test` 전체
7. **인과 검증**: 수정을 임시 되돌려 anchor가 실패하는지 확인 후 복원

---

## 8. 범위 밖 (이번에 건드리지 않음)

- **㎡당 공시지가·면적 중복 노출**: 분리모드 + 토지/일반건물이면 바깥 「취득시 기준시가」(StandardPriceInput의 area 모드)와 축 B의 「토지 취득시 기준시가」 카드가 **같은 폼 필드**(`standardPricePerSqmAtAcq`·`acquisitionArea`)를 두 곳에서 렌더한다. 값은 동기화되지만 화면에 두 번 보인다. 별도 과제.
- **감정가액 모드 취득시 기준시가 중복 입력**: `:579-586`(개산공제 base)과 주 블록(`:626-666`)이 같은 `standardPriceAtAcq`를 두 곳에서 렌더한다. 기존 중복이며 이번 변경과 무관.
- 겸용주택·상업용건물·일반건물·PHD 경로의 기준시가 입력 위치(각각 전용 블록으로 이미 분기).
- 엔진 계산 로직·법령 판정.
