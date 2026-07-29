# 별개 취득 — 「취득시 기준시가」 진입 게이트 완화 (불필요한 강제 입력 제거)

> 대상: `lib/tax-engine/transfer-tax-split-gain.ts` 진입 게이트 + validate + UI
> 작성일: 2026-07-29 · **개정 v2** (13단계 자가검토 STEP 1~4 반영, 정정 27건)
> 계기: 사용자 보고 — 토지·건물 취득 실가를 모두 입력했는데 계산이 틀리거나 막힘

---

## 0. 선행 정정 이력

**v1 → v2 (자가검토 STEP 1~4)**: fork 3-way 검토에서 Critical 4·High 9·Medium 9건 발견.
주요 정정: §3 "8지점 전수" 주장이 거짓(⑨`apportionRatio`·⑩`note`·⑪`lumpDeductionBase` 누락) ·
§5.2 "타입 변화 없음" 거짓 · §4.3 validate가 직전에 고친 "해소 불가 차단"을 재도입 ·
술어/가드/validate/UI 4중 dual-truth · `return null` 자체가 침묵 실패 · 기존 anchor 2건이 반대 동작 고정.

**직전 조사(v0)의 오류**: "취득시 기준시가는 §166⑥ 안분 비율의 근거이므로 분리 계산에 필요하다"는
결론은 **틀렸다**. 취득가액을 **환산해야 할 때만** 필요하며, 양쪽 실가를 아는 경우 계산 어디에도
등장하지 않는다.

---

## 1. 확정 규칙 (사용자 확정, 2026-07-29)

**① 양도가액을 토지·건물로 구분** — 계약서 구분금액, 없으면 **양도시 기준시가** 비율 안분

**② 취득가액 산정**

| 케이스 | 처리 |
|---|---|
| **a.** 양쪽 다 실가 있음 | 각 실가로 양도차익 계산 |
| **b.** 한쪽만 실가 있음 | 실가 쪽은 a항. 없는 쪽은 **환산** = 파트 양도가액 안분금액 × (파트 취득시 기준시가 ÷ 파트 양도시 기준시가) |
| **c.** 양쪽 다 실가 없음 | 양쪽 모두 b항 환산 |

**③** 케이스 a에서 취득시 기준시가는 **계산에 전혀 필요 없다**.
**④** 자산 전체 취득가액(총액)도 **강제 입력사항이 되면 안 된다**.

---

## 2. 현행 결함

### 2.1 진입 게이트가 무조건 취득시 기준시가를 요구

```ts
// transfer-tax-split-gain.ts:330-331
const ratio = calcApportionRatio(input);
if (!ratio) return null;            // ← 케이스 a에서도 죽는다
```

`calcApportionRatio` → `calcAcqStdPair`(`:45-47`)는 **㎡당 개별공시지가 > 0 AND 면적 > 0**을 요구한다.

### 2.2 차단이 아니라 "조용한 오답"

`calcSplitGain`이 null → `calcTransferGain`(`transfer-tax-helpers.ts:279`, **유일한 외부 호출자**)이
단일 자산 경로로 계산. 별개 취득은 총액 칸이 UI에 없어 `acquisitionPrice = 0`(`transfer-tax-api.ts:218`).

**probe 실측** (양도 5억 / 토지 1.5억 + 건물 1억, 케이스 a):

| 취득시 기준시가 | 분리 계산 | 양도차익 |
|---|---|---|
| 미입력 | `null` — 조용히 비활성 | **500,000,000** |
| 입력 | 정상 | **250,000,000** |

`feedback_no_silent_apportion_fallback` 정면 위반.

### 2.3 선행 시도가 이미 있었고 실효가 없다 (v2 추가)

`transfer-tax-api.ts:270-278`은 이 결함 때문에 분리 모드에서 `standardPriceAtAcquisition`을
추가 전송하도록 바뀐 이력이 있다(주석에 "ratio=null → 조용히 비활성" 명시). 즉 과거에는
**게이트를 먹여서** 해결하려 했다. 그러나 전송되는 것은 **총액**이고 `calcAcqStdPair`가 요구하는 것은
**단가+면적**이라 게이트가 열리지 않는다(probe C: 단가만 → 여전히 null). 본 계획은 반대로
**게이트를 푸는** 방향이며, 규칙 ③이 그 근거다.

### 2.4 UI가 필요 없는 값을 필수(`*`)로 표시

`CompanionAcqPurchaseBlock.tsx:602` — 분리 모드면 취득 방식과 무관하게 붉은 별표 필수 표시.
안내문(`:625`)도 "토지분 = ㎡당 공시지가 × 면적, 건물분 = 총액 − 토지분"이라 케이스 a에서 거짓이다.
블록 위 주석(`:567-572`)은 "실거래가·감정·매매사례여도 입력받아야 한다"고 단정 — 변경 후 정반대가 된다.

### 2.5 (해소됨) 총액 강제 입력 — 규칙 ④

`transfer-tax-validate-asset.ts:487-489`에 `isSeparateAcquisition` 게이트를 추가해 해소 완료
(anchor 5건 + E2E U9). 규칙 ④ 충족 확인용 기록.

---

## 3. 취득시 기준시가·`landRatio` 소비 지점 (전수 — v2 정정)

| # | 소비 지점 | file:line | 필요 조건 | 케이스 a |
|---|---|---|---|---|
| ① | 환산 분자 `partStdAtAcq` | `:241-246` | 파트 mode === `estimated` | 미사용 |
| ② | 개산공제 base (§163⑥) | `:404`·`:414` | 파트 mode ≠ `actual` | 미사용 |
| ③ | 취득가액 안분 `splitPair` | `:262`(appraisal)·`:270`(actual) | **비-별개취득** + 파트 2칸 모두 미입력 | 미사용 |
| ④ | 매매사례 안분 | `:253-256` | 비-별개취득 + salesCase | 미사용 |
| ⑤ | 양도가액 안분 fallback | `:352` | `saleRatio` 없음 AND 양도가액 2칸 모두 미입력 | 미사용 |
| ⑥ | 자본적지출 안분 | `:386-389` | `input.expenses > 0`(legacy) AND 파트 2칸 모두 미입력 | 미사용 |
| ⑦ | 양도시 기준시가 fallback | `:195-198` | **무조건 실행** — lazy화 필요(§4.3) | 값은 미사용이나 **평가는 발생** |
| ⑧ | `stdPriceAtAcq` echo | `:453`·`:472` | `landNonActual`/`buildingNonActual` | 미사용 |
| **⑨** | **`lumpDeductionBase`** | `:455`·`:474` | 동상 | 미사용 |
| **⑩** | **`apportionRatio`** (결과 필수 필드) | `:488` / 타입 `transfer-split-gain.types.ts:69` | **무조건** | **🔴 채울 값이 없다** |
| **⑪** | **`note`** 문자열 | `:489` | **무조건** | **🔴 `null*100=0` → "토지 0.0%" 침묵 오표시** |

`splitPair`(`:91-102`)는 **양쪽 다 미입력일 때만** `landRatio`를 쓴다 — 한쪽만 있으면 잔액 도출.
즉 ③⑤⑥은 전부 "2칸 모두 미입력"이 조건이다.

**⇒ ①~⑨는 케이스 a에서 비활성. 그러나 ⑩⑪은 무조건 실행되므로 설계가 필요하다(§4.3).**

---

## 4. 설계

### 4.1 단일 소스 술어 — 엔진에서 export

**결정**: 조건을 엔진·validate·UI가 각자 재기술하면 4중 dual-truth가 된다.

**배치 (STEP 3 정정)**: 술어를 엔진 파일에 두고 `TransferTaxInput`을 받으면 **UI가 호출할 수 없다**
— UI는 `AssetForm`을 들고 있고 엔진 입력으로의 변환은 API 계층에서만 일어난다. 그러면 UI가 조건을
다시 쓰게 되어 dual-truth가 재발한다.

→ 술어를 **`lib/calc/transfer-tax-split-acq-mode.ts`에 구조적 타입 인자로 배치**한다.
선례가 같은 파일에 있다 — `isSeparateAcquisition(asset: SeparateAcquisitionFlags)`는 구조적 타이핑으로
`AssetForm`과 엔진 input을 **모두** 받는다. 엔진이 `lib/calc`를 import하는 것도 선례가 있다
(`gift-simultaneous.ts:26` · `inheritance-prior-gift-taxbase.ts:26-27`).

```ts
// lib/calc/transfer-tax-split-acq-mode.ts — 엔진·validate·UI 공용 (구조적 타입)
interface AcqStdPriceNeedFlags extends LegacyAcqFlags, SeparateAcquisitionFlags {
  landAcquisitionPrice?: string | number;   // AssetForm은 string, 엔진 input은 number
  buildingAcquisitionPrice?: string | number;
  landTransferPrice?: string | number;
  buildingTransferPrice?: string | number;
  landDirectExpenses?: string | number;
  buildingDirectExpenses?: string | number;
  expenses?: number;
}

export function requiresAcqStdPrice(a: AcqStdPriceNeedFlags, hasSaleRatio: boolean): boolean {
  const landMode = effectivePartAcqMode(a.landAcqMode, a);        // 기존 단일 소스 재사용
  const buildingMode = effectivePartAcqMode(a.buildingAcqMode, a);
  const isSeparate = isSeparateAcquisition(a);                     // 기존 단일 소스 재사용

  if (landMode !== "actual" || buildingMode !== "actual") return true;      // ①②⑧⑨
  if (!isSeparate && empty(a.landAcquisitionPrice) && empty(a.buildingAcquisitionPrice)) return true;  // ③④
  if (!hasSaleRatio && empty(a.landTransferPrice) && empty(a.buildingTransferPrice)) return true;      // ⑤
  if ((a.expenses ?? 0) > 0
      && empty(a.landDirectExpenses) && empty(a.buildingDirectExpenses)) return true;                  // ⑥
  return false;
}
```

- **엔진·validate·UI 3곳이 이 함수 하나를 호출**한다. 산문 조건 재기술 금지.
- `hasSaleRatio`를 **인자로 주입**한다 — 술어가 `calcSaleApportionRatio`(엔진)를 직접 부르면
  `lib/calc → lib/tax-engine` 역방향 의존이 생기고, 본체 `:351`과 중복 호출도 발생한다.
  엔진은 `calcSaleApportionRatio(input) != null`을, UI·validate는 `양도시 기준시가 2필드 존재`를 넘긴다.
- `empty()`는 string(`""`)·number(`0`)·`undefined`를 모두 미입력으로 판정하는 공용 헬퍼
  (`AssetForm`은 string, 엔진 input은 number이므로 필수).
- v1 스니펫의 `isSeparate` 인자는 게이트 스코프에 없어 **컴파일 불가**였다
  (`:191`은 `calcSplitAcquisitionPrice` 지역변수) — 위 구조가 이를 해소한다.

### 4.2 진입부 — `null` 대신 **throw**

`return null`은 그 자체가 §2.2가 규탄한 침묵 실패다(호출부가 단일 자산 경로로 흘린다).
필요한데 없으면 **차단**해야 한다.

```ts
export function calcSplitGain(input) {
  if (!input.landAcquisitionDate) return null;                    // ← 비분리 자산: null 유지(정상)
  if (propertyType 미지원) return null;                            // ← 동상
  if (PHD 조건) return calcSplitGainPreDisclosure(input);          // :326-328 — 술어를 이보다 위로 옮기지 말 것

  const saleRatio = calcSaleApportionRatio(input);   // 본체 :351과 공유 (중복 호출 제거)
  const ratio = calcApportionRatio(input);
  if (!ratio && requiresAcqStdPrice(input, saleRatio != null)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
      "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와 토지 면적이 필요합니다 (소득세법 §99①1호 가목).");
  }
```

- 선례: 파트 취득가액 미입력 시 이미 `TaxCalculationError`를 던진다(`:285-292`).
  `route.ts:682`가 `TaxCalculationError`를 처리한다 — **실측 확인**.
- **`:316` 이전 게이트는 null 유지** — 비분리 자산까지 throw하면 전 자산이 깨진다.

### 4.3 `ratio` 미산출 시의 값 전파

| 대상 | 처리 |
|---|---|
| `landRatio` | `number \| null` 전파. `splitPair`·`calcOnePart`·`calcSplitAcquisitionPrice`(`:175-177` 3개 파라미터) 시그니처 확장. **호출부는 전부 모듈 내부 private(외부 소비자 0)** |
| ③⑤⑥ 소비부 | 양쪽 미입력 + `landRatio == null` → `TaxCalculationError`. 술어가 이미 막으므로 **도달 불가 방어선**(assert 성격 — 도달하면 술어 버그) |
| ⑦ `landStdAtTransferBase`(`:195-198`) | **무조건 실행 → lazy화**. 환산 파트가 있을 때만 산출하도록 이동 |
| **⑩ `apportionRatio`** | 타입을 **optional**(`?`)로 변경. 케이스 a에서 안분비는 의미상 **"정의되지 않음"**이 정답이다 — `{0,0}` 채우기는 §4의 "침묵 0 금지"와 자기모순 |
| **⑪ `note`** | 비율 미산출 시 **안분비 문구 자체를 생략**하고 보유연수만 서술 |

**과복잡 우려에 대한 판단**: null 전파 + 가드는 규칙 중복이 아니라 **불변식 단언**이다.
규칙의 단일 소스는 §4.1 술어 하나이고, 가드는 그 술어가 틀렸을 때만 발동한다.
`landRatio = 0` 유지안은 미래에 소비 지점이 추가되면 조용히 토지 0% 안분이 되므로 채택하지 않는다.

### 4.4 결과 표시 오류 정정 (v2 신규)

`stdPriceDerivedFromTotal`(`:482`)은 **모드와 무관하게 무조건** 설정된다(`:340-344`, 주택이면 항상 true).
게이트가 열리면 케이스 a에서 처음으로 `splitDetail`이 생기고,
`SplitGainDetailSection.tsx:80-88`이 **"개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다"**라는
**거짓 안내**를 렌더한다 — 케이스 a는 취득시 기준시가를 쓰지도 않았다.

→ `stdPriceDerivedFromTotal`을 `buildingNonActual`일 때만 설정하도록 게이트 추가.

### 4.5 validate — 필요할 때만 차단

- `requiresAcqStdPrice`를 **import**해 판정(조건 재인코딩 금지).
- 술어 true + 단가·면적 미입력 → 차단.
  메시지: "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와 토지 면적이 필요합니다(소득세법 §99①1호 가목)."
- **케이스 a는 요구하지 않는다** — 규칙 ③.
- **⚠️ 선행 조건**: §4.7 UI 신설 **완료 후**에만 활성화한다. 입력 칸이 없는 상태로 차단하면
  §2.5에서 고친 "해소 불가능한 영구 차단"을 그대로 재도입한다.

### 4.6 UI

| 지점 | 현행 | 변경 |
|---|---|---|
| `CompanionAcqPurchaseBlock.tsx:602` `*` 필수 표시 | 분리 모드면 무조건 | **`requiresAcqStdPrice` 결과로 구동**. prop 추가 불필요 — `effLandAcqMode`·`effBuildingAcqMode`(`:156-157`)·`isSeparateAcq`(`:145`)가 이미 같은 스코프 |
| `:625` 안내문(hint) | "토지분 = ㎡당 공시지가 × 면적…" | 술어 false면 "양쪽 실지거래가액을 입력했으므로 이 값은 계산에 사용되지 않습니다" |
| `:567-572` 블록 주석 | "실거래가여도 입력받아야 한다" | "노출은 유지하되 **필수 여부는 파트 모드에 따른다"로 정정 (`feedback_engine_comment_vs_impl_drift`) |
| 필드 노출 자체 | 상시 | **유지** — 비-별개취득 분리에서는 여전히 필요 |

### 4.7 주택 환산 파트 입력 UI 신설 — **선행 조건으로 승격** (v1에서는 "별건")

주택(`housing`) + 환산/감정/매매사례 파트는 취득시 ㎡당 공시지가·면적을 입력할 UI가 **없다**:

- 공용 `StandardPriceInput`은 area 모드가 `land`·`building_non_residential` 전용(`:98-100`)
  → 주택은 `house_individual` → 총액 칸만
- `PartAcqStdPrice`는 `assetKind === "building"` 전용(`LandBuildingSplitSection.tsx:346-350`)
- 면적 블록은 `assetKind === "land"` 게이트(`AssetSectionBasic.tsx:298`)
- PHD 토글은 `phdLandPricePerSqmAtAcq`라는 **다른 필드**라 해소 불가

v1은 이를 "별건"으로 두고 "validate가 차단하므로 조용한 오답은 없다"고 정당화했으나,
그 **차단이 해소 불가능**하다는 점을 놓쳤다. §4.5 validate와 §4.2 throw를 켜기 전에
**반드시 입력 경로를 먼저 연다** — `PartAcqStdPrice`의 토지 파트를 주택에도 노출
(주택은 라목 결합공시이므로 **건물분은 총액 − 토지분 역산이 정본** — 취득시 축은 개산공제 법정액
정합이 요건이라 양도시 축과 반대다. 엔진 `calcAcqStdPair:59-62`가 이미 그렇게 동작).

### 4.8 규칙 ① 위반 경로 편입 (v1에서는 "별건")

`saleSplitMode === "actual"` + 양도가액 2칸 모두 미입력이면 validate의 `needsTransferStd`
(`transfer-tax-validate-split.ts:113-116` — `apportioned || 파트 estimated`만 검사)가 요구하지 않아
엔진이 `saleRatio ?? landRatio`(`:352`)로 **취득시 비율** 안분한다. 규칙 ① 위반이 **실제 도달 가능**하다.
UI placeholder("미입력 시 나머지에서 자동 계산")가 빈칸을 유도한다.

→ validate에 "구분양도 선택 시 양도가액 2칸 중 최소 1칸 입력 **또는** 양도시 기준시가 2칸 입력" 요구 추가.

---

## 5. 영향 범위

### 5.1 14 동기화 지점

| 지점 | 영향 | 근거 |
|---|---|---|
| ⑤ UI 위젯 | **변경** | §4.6·§4.7 |
| ⑥ 사이드바 합계 | **변경 없음** (실측) | `calc-wizard-store.ts:474-480` `separateAcqPartsSum`이 이미 별개취득 대응 |
| ⑦ 결과 카드 | **변경** | §4.4 fine-print 오표시. `stdPriceAtAcq != null` 가드는 이미 존재(`SplitGainDetailSection.tsx:71`·`:77`) |
| ⑧ validation | **변경** | §4.5·§4.8 |
| ⑨~⑭ | **변경 없음** | 신규 input 필드 없음 |

### 5.2 타입·테스트 영향 (v1 "무영향" 주장 철회)

- **공개 타입 변경**: `types/transfer-split-gain.types.ts:69`(`apportionRatio` optional화)
- **`apportionRatio` 참조 11곳 / 3파일**: `split-acq-std-price-independent.test.ts` ·
  `land-building-split.test.ts` · `audit-fix-transfer-tax-helpers.test.ts` → optional 대응 갱신
- **UI·PDF 소비자 0곳** — `components/` · `app/` 전체 grep 결과 `apportionRatio` 참조 **0건**(STEP 3 실측).
  `SplitGainDetailSection`도 `apportionRatio`·`note`를 읽지 않는다 → 화면·인쇄물 영향 없음

### 5.3 기존 anchor가 반대 동작을 고정 중 (Critical)

`__tests__/tax-engine/transfer-tax/split-acq-axis-predo.anchor.test.ts:131-155`
`describe("P0-D: 3요소 미입력 → calcSplitGain null (validate V0 필요 근거)")` 2건이
**케이스 a 그 자체**(양쪽 actual + 파트 금액 확정)를 입력으로 `toBeNull()`을 단언하고,
주석이 결함을 "정상 동작"으로 문서화한다("파트 금액이 둘 다 확정돼 있어도 비율 3요소가 없으면 분리 전체가 죽는다").

→ **anchor 반전 + 주석을 결함 기록으로 교체**. `feedback_anchor_correction_legal_priority`
(법령 정합이 기존 anchor보다 우선).

### 5.4 splitDetail 활성화의 2차 파급 (v2 신규)

`transfer-tax-helpers.ts:547-587`의 `if (splitDetail)` 분기는 양도차익만 바꾸지 않는다:
**장특공제를 파트별 보유연수로 재계산** · **1세대1주택 12억 초과 안분을 `proratePartGain`으로 전환** ·
`rate: 0` 반환(단일 공제율 없음). 케이스 a가 처음으로 이 분기에 들어가므로 **세액 전반**이 바뀐다.

---

## 6. 구현 단계 — **3개 PR로 분리** (D1 확정, 2026-07-29)

의존 순서는 **PR1 → PR2 → PR3**. PR3의 차단(throw·validate)은 PR2가 입력 경로를 연 **뒤에만**
켠다 — 순서를 바꾸면 §2.5에서 고친 "해소 불가 영구 차단"을 재도입한다.

### PR 1 — 케이스 a 정상화 (순수 가산 · 회귀 0)

**throw를 넣지 않는다.** 게이트만 완화해 케이스 a가 분리 계산에 진입하게 하고, 필요한데 없는
케이스 b·c는 **종전대로 `return null`**을 유지한다. 이렇게 해야 PR1이 단독 머지돼도
"입력 칸 없는 차단"이 생기지 않는다(throw는 PR3에서).

| # | 작업 | verify |
|---|---|---|
| 1-P0 | Pre-Do anchor — 케이스 a가 현행에서 `null` + 양도차익 = 양도가액 전액임을 고정 | 실패 anchor 확보 |
| 1-P0.5 | 기존 anchor·주석 영향 조사 (`calcSplitGain` null 기대 전수 · `apportionRatio` 11곳/3파일 · stale 주석 4곳) | 영향 목록 확정 |
| 1-A | `requiresAcqStdPrice` 신설 (`lib/calc/transfer-tax-split-acq-mode.ts`, 구조적 타입) | 단위 anchor — 술어 진리표 |
| 1-B | 게이트 완화 (`!ratio && requiresAcqStdPrice(...)` → null) | 1-P0 anchor 정상값 전환 |
| 1-C | `landRatio` null 전파 + ③⑤⑥ 도달 불가 가드 | 지점별 anchor |
| 1-D | `apportionRatio` optional + `note` 안분비 문구 분기 (D2 확정) | a-6 anchor |
| 1-E | ⑦ `landStdAtTransferBase` lazy화 | 환산 파트 없을 때 미평가 |
| 1-F | `stdPriceDerivedFromTotal`을 `buildingNonActual` 게이트 (§4.4) | 케이스 a → fine-print 미표시 |
| 1-G | 기존 P0-D anchor 2건 반전 + 주석을 결함 기록으로 교체 (§5.3) | — |
| 1-H | 회귀 + 브라우저(Playwright) | a-1~a-6 · r-1~r-5 |

### PR 2 — 주택 환산 파트 입력 UI 신설 (§4.7)

`PartAcqStdPrice`의 토지 파트(㎡당 공시지가 + 면적)를 주택에도 노출.
**건물분은 총액 − 토지분 역산 유지**(취득시 축은 개산공제 법정액 정합이 요건 — 양도시 축과 반대).
검증: 주택 별개취득 + 환산 파트에서 단가·면적 입력 → 케이스 b 정상 계산 (E2E).

### PR 3 — 차단 전환 (PR2 전제)

| # | 작업 |
|---|---|
| 3-A | 게이트 `return null` → `TaxCalculationError` throw (§4.2). 에러 메시지에 **자산 번호** 포함(다건 집계 `aggregate.ts:259`에 try/catch 없음) |
| 3-B | validate — `requiresAcqStdPrice` import 차단 (§4.5) |
| 3-C | validate — 규칙 ① 위반 차단 (§4.8) |
| 3-D | UI `*`·hint·주석 술어 구동 (§4.6). **E2E로 검증**(RTL 하네스 비용 > 이득 — `BlockProps` 74필드·기존 RTL 0건) |

### 6.1 회귀 케이스 매트릭스

양도차익뿐 아니라 **장특공제율·공제액**(§5.4)까지 단정값을 기입한다.

| # | 토지 | 건물 | 취득시 기준시가 | 기대 |
|---|---|---|---|---|
| a-1 | 실가 | 실가 | **없음** | 분리 정상. 양도차익 = 양도가액 − 파트합. **파트별 보유연수 장특공제** |
| a-2 | 실가 | 실가 | 있음 | a-1과 **동일값**(불변성 — 있어도 안 쓰인다) |
| a-3 | 실가 | 실가 | 없음 + 구분양도 | 정상 |
| a-4 | 실가 | 실가 | 없음 + 일괄양도(양도시 기준시가) | 정상 |
| a-5 | 실가 | 실가 | 없음 + 1세대1주택 12억 초과 | `proratePartGain` 안분 정상 |
| a-6 | 실가 | 실가 | 없음 | `apportionRatio` **undefined** · `note`에 안분비 문구 없음 · fine-print 미표시 |
| b-1 | 실가 | 환산 | 없음 | **throw**(엔진) + validate 선차단 |
| b-2 | 실가 | 환산 | 있음 | 건물 = 양도안분액 × (취득시/양도시), 토지 = 실가 |
| c-1 | 환산 | 환산 | 있음 | 양쪽 환산 |
| c-2 | 환산 | 환산 | 없음 | **throw** |
| r-1 | 비-별개취득(취득일 동일) 전 조합 | | | **기존 동작 불변** |
| r-2 | legacy `expenses > 0` + 파트 미입력 | | 없음 | 술어 true → throw |
| r-3 | **PHD**(양쪽 환산 + `preHousingDisclosure`) | | | `:326-328`에서 조기 return — **종전 동일** |
| r-4 | `selfOwns = land_only` | | 없음 | 비소유 파트 미입력이 오답을 만들지 않음(`:279-284`) |
| r-5 | `ownershipRatio = 0.5` | | | 개산공제 지분 축소(`:455`·`:474`) 정상 |

---

## 7. 리스크

| 리스크 | 완화 |
|---|---|
| **`throw` 전환이 기존 통과 케이스를 깨뜨림** — 비-별개취득 분리(겸용·소유자분리)에서 종전에는 조용히 단일자산 경로로 흘렀다 | r-1 매트릭스 전수. `:316` 이전 게이트는 null 유지. P0.5에서 영향 anchor 확정 |
| **`null`이 소비부에 도달해 계산 오류로 노출** | 술어 선차단 + 가드는 도달 불가 방어선. 지점별 anchor(P3)로 도달 불가 입증 |
| §4.5 validate가 해소 불가 차단 재도입 | **P1(UI 신설)을 P5보다 앞에 배치**하는 순서 자체가 완화책 |
| 술어와 소비 지점이 미래에 어긋남 | 술어를 export해 validate·UI가 공유 → 규칙 1곳. 지점 추가 시 §3 표 갱신을 P3 anchor가 강제 |
| **다건 자산에서 throw가 전체 계산을 중단** | `transfer-tax-aggregate.ts:259`가 루프에서 `calculateTransferTax`를 호출하는데 **try/catch가 없다**(STEP 3 실측). 기존 throw(`:285-292`)도 같은 구조라 새 위험 등급은 아니나, **에러 메시지에 자산 번호를 포함**해 어느 자산이 원인인지 드러내야 한다 |

## 8. 미해결 — 사용자 결정 필요

| # | 쟁점 |
|---|---|
| D1 | **범위 확대 승인** — v1은 엔진 게이트만이었으나 §4.7(주택 UI 신설)·§4.8(규칙 ① 위반 차단)이 편입돼 규모가 커졌다. 분리 PR로 쪼갤지 |
| D2 | `apportionRatio` optional화(권고) vs 케이스 a에서 `{0,0}`+"안분 미적용" note. 전자는 공개 타입 변경 + 테스트 11곳 갱신 (UI·PDF 소비자는 0곳이므로 화면 영향 없음) |
