# 감면 PHD 스냅샷 후속 4건 — 키 충돌 · stale 게이트 · 세목 고정 · 의제취득일

- 작성일: 2026-08-24
- 유입: PR #1267 §9 · PR #1268 §8(B-2·B-3)에 남긴 후속 + **착수 조사 중 신규 발견 1건(B-4)**
- 선행 완료: #1267(재개발 항목축 재편·계산기 배선) · #1268(재개발 stale 게이트)

---

## 0. 요약 — 착수 순서가 정해져 있다

| # | 항목 | 성격 | 선행 |
|---|---|---|---|
| **B-4** | `-red-phd` 키가 **감면 조문을 구분하지 않는다** | 🔴 데이터 덮어쓰기 | — |
| **B-2** | 감면 PHD 모드가 꺼져도 계산서가 남는다 | 표시 | **B-4** |
| **B-5** | `ReductionPhdInput` 모달에 `lockedTaxType` 미전달 | 침묵 no-op | — |
| **B-3** | 재개발 트리거에 **의제취득일 보정**이 없다 | 세액 (희소) | — |

B-2는 B-4에 의존한다 — 키가 조문을 구분해야 「어느 조문의 PHD가 꺼졌는가」를 판정할 수 있다.
B-5·B-3은 독립이므로 언제든 착수 가능하다.

---

## B-4. `-red-phd` 스냅샷 키가 감면 조문을 구분하지 않는다 🔴

### 실측

`ReductionPhdInput.tsx:88-92`:

```ts
const buildingStdSnapshotKey = assetId
  ? `bsp-${assetId}-red-phd`                       // ← 조문 구분 없음
  : snapshotKeyPrefix ? `${snapshotKeyPrefix}-bsp` : undefined;
```

조문별 폼은 **서로 다른 prefix를 넘기고 있다** — `red993`(`New993InputForm.tsx:127`) ·
`red99`(`New99InputForm.tsx:157`) · `red988`(`Unsold988InputForm.tsx:203`) 등.
그런데 `assetId`가 있으면 그 prefix가 **무시된다**. `assetId`는 결과탭 노출을 위해
(#1267 이전에) 도입된 것인데, 그때 조문 축이 사라졌다.

감면은 배열이고 여러 조문을 동시에 담을 수 있다(`UnifiedReductionPanel.tsx:182-224`가
`reductions.some/filter/map`으로 다중 관리). PHD 입력을 가진 조문은 실측 **8개**다 —
`phdMode993 · phdMode99 · phdMode988 · phdMode983 · phdMode985 · phdMode986 ·
phdMode987 · phdMode992`.

### 증상

한 자산에서 두 조문의 PHD를 쓰면:

- 나중 계산이 앞 계산의 스냅샷을 **덮어쓴다** → 재오픈 시 **다른 조문의 입력**이 복원된다(정정 오류)
- 결과탭 계산서가 2장이어야 하는데 1장만 나온다

> 감면 중복배제(조특법 §127⑦)로 **최종 적용**은 하나지만, 후보를 여러 개 입력하는 것은
> UI가 허용한다 — 계산서는 후보별로 있어야 근거가 된다.

### 설계

키 규약을 `bsp-${assetId}-red-{조문}-phd`로 넓힌다. 조문 세그먼트는 이미 폼이 넘기는
`snapshotKeyPrefix`(`red993`·`red99`…)에서 얻는다 — 새 축을 만들지 않는다.

**`lib/calc/building-std-snapshot-keys.ts` 3곳 동기화**(누락 시 계산서가 조용히 사라진다):

| # | 함수 | 변경 |
|---|---|---|
| K-1 | `idOfSnapshotKey` | `-red-phd` 치환을 `-red(?:-[a-z0-9]+)?-phd`로 확장. **`-redev-phd`보다 뒤**에 둘 것 |
| K-2 | `snapshotKeyTimepoint` | 변경 없음(2시점 통합 — null 유지) |
| K-3 | `BuildingStdPriceReportSection`의 `phdConversionKind` | 정규식 확장 + 제목에 조문 표기 |

⚠️ **기존 저장분 호환**: 이미 `bsp-{id}-red-phd`로 저장된 스냅샷이 sessionStorage·이력
`input_data`에 있다. 정규식이 **두 형태를 모두** 환원해야 한다(구 키를 마이그레이션하지 않는다 —
표시 전용 데이터라 새 계산이 새 키로 저장되면 자연히 대체된다).

### 검증

- 두 조문 동시 입력 → 스냅샷 2개, 계산서 2장 (현행: 1개/1장 — **먼저 실패 확인**)
- 구 키(`bsp-a1-red-phd`) 환원 회귀 — `building-std-snapshot-keys.test.ts` 기존 케이스 유지
- 제목에 조문이 표기되어 두 장을 구별할 수 있다

---

## B-2. 감면 PHD 모드가 꺼져도 계산서가 남는다

### 문제

#1268이 `-redev-phd`에 대해 닫은 것과 **같은 실패 모드**다. `-red-phd` 스냅샷도
`isBuildingStdSnapshotApplicable`의 판정 대상이 아니라 항상 통과한다.

꺼지는 경로 3가지:
1. `phdMode{조문}` 토글 OFF
2. 그 감면 조문을 후보에서 **제거**(`reductions` 배열에서 빠짐)
3. 감면 패널 자체를 끔

### 설계

`isBuildingStdSnapshotApplicable`에 `-red-{조문}-phd` 케이스를 추가한다.

```ts
// 판정: 해당 자산의 reductions 중 그 조문이 있고, 그 조문의 phdMode*가 true인가
```

**조문별 필드명을 열거하지 않는다** — `Object.keys(reduction).some(k => k.startsWith("phdMode") && reduction[k] === true)`.
8개를 열거하면 신규 조문 추가 시 조용히 빠진다(이 저장소가 두 번 겪은 실패 모드:
`legal-verification manifest` 누락과 같은 형태).

**미확인 필드는 차단하지 않는다** — #1268에서 확립한 규칙 그대로. `reductions`가 없거나
배열이 아니면 통과.

**다건 양도 경로**도 처음부터 포함한다 — `findAsset`이 이미 두 폼 모양을 모두 보므로
추가 작업은 없지만, anchor에 다건 케이스를 넣어 고정한다(#1268에서 이걸 빠뜨려 Medium을 받았다).

### 검증

- phdMode OFF → 0장 / ON → 2장(과잉 차단 방지)
- 조문을 후보에서 제거 → 0장
- 다건 양도 경로 동일 동작
- 판정 불능(구조 상이·필드 부재) → 통과

---

## B-5. `ReductionPhdInput` 모달에 `lockedTaxType` 미전달

### 실측

`ReductionPhdInput.tsx:219`·`:248`의 두 `BuildingStdPriceModalButton` 호출부는
`onApplyBoth`만 배선하고 `lockedTaxType`이 **없다**(`onApply`도 없다).

⇒ 모달에 세목 라디오가 뜨고(`BuildingStdPriceForm.tsx:281`), 사용자가 「상속·증여(1시점)」로
바꾸면 결과 카드가 `onApply`(미배선)를 부르는 「이 금액 적용」 버튼을 낸다:

- 두 필드 중 **아무것도 채워지지 않는 침묵 no-op**
- 그런데 `saveSnapshot`은 실행 → 결과탭에 「취득시 (감면 PHD 환산 §164⑤)」 라벨을 단
  **상증 계산서**가 한 장 뜬다

PR #1267에서 재개발 호출부에 대해 고친 것과 **같은 결함**이다(그때 「선례에도 같은 구멍이
있으나 기존 코드라 건드리지 않는다」로 남겼다).

### 설계

두 호출부에 `lockedTaxType="transfer"` 추가. 1줄 × 2.

### 검증

- 모달을 열어 세목 라디오가 **없음**을 단언(기존 `reduction-phd-building-stdprice.test.tsx`에 추가)
- mutation probe: prop 제거 → 실패 확인

---

## B-3. 재개발 §164⑦ 트리거에 의제취득일 보정이 없다

### 실측 — divergence 2건

같은 입력에 대한 두 술어의 판정(2026-08-24 probe):

| 취득일 | 최초공시일 | `isPhdEligible` | `isRedevPhdTriggered` | |
|---|---|---|---|---|
| 1984-01-01 | 1985-01-01 | **false** | **true** | ⚠️ 갈린다 |
| 1980-06-01 | 1984-12-31 | **false** | **true** | ⚠️ 갈린다 |
| 1984-12-31 | 2005-04-30 | true | true | 일치 |
| 2003-05-10 | 2005-04-30 | true | true | 일치 |

`isPhdEligible`(`phd-eligibility.ts`)은 **의제취득일**(1984-12-31 이전 취득 → 1985-01-01
취득 의제, 소득세법 부칙 `TRANSFER.DEEMED_ACQUISITION_DATE_BASIS`)을 반영하는데
재개발 트리거는 하지 않는다.

### 판단 — 세액에 영향이 있으나 희소하다

갈리는 조건은 **최초공시일 ≤ 1985-01-01**뿐이다. 개별주택가격 최초 공시는 2005-04-30,
공동주택가격은 2006-04-28이므로 정상 입력에서는 발생하지 않는다. 즉 **사용자 오입력**
경로다. 그래도 그 입력이 통과하면 §164⑦ 본문이 잘못 발동해 취득당시 라목값이 역산된다.

### ⚠️ 착수 조건 — 조문 확인이 먼저다

의제취득일 보정이 **§164⑦에도 미치는지**를 법령으로 확인해야 한다.
`phd-eligibility.ts`의 주석은 국세청 기준시가 해설(「1985.1.1. 이후 취득한 경우에는
1985.1.1. 현재 고시되어 있는 기준시가를 적용」)을 근거로 든다 — 그 근거가 재개발 §166③
경유 인용에도 그대로 적용되는지는 **미확인**이다.

⇒ KoreanLaw MCP로 §164⑦ 본문·부칙을 확인하고, 확인되면 `isRedevPhdTriggered`가
`isPhdEligible`을 쓰도록 통합한다. 확인되지 않으면 **현행 유지**하고 그 사실을 술어 주석에
남긴다(추정으로 세액을 바꾸지 않는다 — memory `feedback_no_unfavorable_application_without_legal_basis`).

### 검증

- 통합 시: 위 divergence 표의 4행을 anchor로 고정
- 재개발 엔진 회귀(`__tests__/tax-engine/transfer-tax/redevelopment/`)
- ⑧ validate·⑫ Zod와의 판정 일치 확인(`transfer-tax-validate-redev.ts:248-253`도 같은 인라인 식이다)

---

## 범위 밖

- `transfer-tax-validate-redev.ts`의 인라인 트리거 판정 통합 — `isHousingRightReceiveEstimated`
  플래그가 validate 내부 계산이라 술어 시그니처를 넓혀야 한다(#1268 §3-2에 근거 기재).
  B-3에서 의제취득일을 손대게 되면 **그때 함께** 정리하는 편이 낫다.
- 다른 스냅샷 키(gb/cb/split/mx/phd 배치)의 stale 게이트 — 각 성립 조건이 달라 별건.

## 작업 순서 (권장)

1. **B-5** (가장 작다 — 1줄 × 2 + anchor) → 단독 PR 가능
2. **B-4** → **B-2** (키 분리가 게이트의 선행)
3. **B-3** — 조문 확인 결과에 따라 착수 여부 결정
