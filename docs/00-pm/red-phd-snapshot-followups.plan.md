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

### 착수 후 실측 — 발현 조건 확정 (2026-08-24)

- PHD 보유 조문 **8개**의 category: `new_housing` 2개(`new_99_3`·`new_99`) ·
  `unsold_housing` 6개(`unsold_98_3/5/6/7/8`·`unsold_99_2`).
- 그룹 라디오(`toggleGroupRadio`)는 **같은 category 안에서만** 배타
  ⇒ **`new_housing` 1개 + `unsold_housing` 1개 동시 선택 가능** ⇒ 발현 조건 성립.
- 조문별 폼 **9곳**이 모두 `asset.assetId`를 그대로 넘긴다 ⇒ 키가 완전히 동일했다.

### 구현 — 키 형태를 계획서보다 단순하게

계획서는 `bsp-${assetId}-red-{조문}-phd`였으나, 폼이 넘기는 prefix가 이미 `red993`처럼
`red`+숫자다 ⇒ **`bsp-${assetId}-${prefix}-phd`**(예: `bsp-a1-red993-phd`)로 충분하다.
정규식도 `-red\d*-phd$` 하나로 끝난다 — `\d*`가 0회를 매칭해 **구 키(`-red-phd`)가 자동 호환**되고,
`-redev-phd`는 `red` 뒤가 숫자가 아니라 걸리지 않는다.

조문 라벨(`redPhdArticleLabel`)은 **규칙 추론 없이 8개 명시 열거**한다. `red99`→§99 /
`red992`→§99의2 같은 자릿수 규칙이 그럴듯하지만 신규 조문에서 깨지면 **조용히 틀린 조문명**이
찍힌다. 미등록 prefix는 null이라 제목이 조문 없이 나갈 뿐 — 안전한 쪽으로 실패한다.

### 🔴 mutation probe가 사각지대를 잡았다

키 생성을 **구 방식으로 되돌려도 전건 통과**했다. `idOfSnapshotKey`·`redPhdArticleLabel`은
키 **문자열**을 받는 순수 함수라, 그 문자열을 **누가 만드는지**는 검증하지 않는다
(memory `feedback_leaf_anchor_skips_zod_layer`와 같은 층위 착오).

⇒ `BuildingStdPriceModalButton`을 스텁해 `snapshotKey` prop을 캡처하는 anchor 4건을 신설했다.
이제 키 생성을 되돌리면 2건이 실패한다(재실측 확인).

### 검증 — ✅ 완료

- 조문별 키 환원 8종 · UUID · **구 키 호환** · 재개발 키 비혼입 · 시점 필터 null
- 조문 라벨 8종 · 구 키/재개발/비대상 null · **미등록 prefix null**
- 결과탭: 두 조문 → 계산서 **4장**(조문 2 × 시점 2) + 제목 조문 구별 / 구 키는 종전 제목 유지
- 키 생성: 조문별 상이 · 두 런처 동일 키 공유 · prefix 없으면 구 키 fallback
- **E2E 실측**: 감면·공제 스텝에서 「신축주택」·「미분양주택」 두 카테고리를 펼치면
  §99의3·§98의8 PHD 폼이 **동시에 렌더되고 런처가 4개**다 — 발현 조건이 코드 분석뿐 아니라
  브라우저에서도 확인됐다(`e2e/red-phd-two-article-snapshot-keys.spec.ts`).
  카테고리 섹션이 기본 접힘이라 펼침 단계가 필요하다는 것도 이때 드러났다.
- 회귀: vitest **전체 16,251건** · 감면·모달 E2E **16건** · tsc 0 · lint 0 errors

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

### 검증 — ✅ 완료 (2026-08-24)

- phdMode OFF·조문 제거·감면 전체 해제 → 차단 / ON → 통과
- **조문별 독립 판정** — 한쪽만 꺼도 다른 쪽 계산서는 남는다
- 다건 양도 경로 동일 동작 · 판정 불능(구 키·미등록 prefix·`reductions` 부재) → 통과
- mutation probe 2종(phdMode 판정·조문 부재 판정 무력화) → 각각 3건·2건 실패

### 🔴 코드 리뷰 Medium 2건 — 둘 다 이번에 수정

**M-1. 구 키(`-red-phd`)가 신 키로 대체되지 않아 한 조문에 계산서가 4장.**
계획서의 「새 계산이 새 키로 저장되면 자연히 대체된다」가 **틀렸다** — `saveSnapshot`은
**추가만** 하고, `replaceSnapshotsByPrefix`는 `bsp-{id}-phd` 접두 전용이라 `-red…-phd`를
건드리지 않는다. 이력을 열어 구 키가 세션에 재수화된 뒤(`HistoryClient.tsx:266`) 같은 조문을
다시 계산하면 두 키가 공존하고, 신 키 2장 + 구 키 2장 = **4장**이 찍힌다(리뷰어 probe 실측).
저장 `input_data`와 서버 PDF도 같다.

⇒ 게이트에 `allKeys`(선택 인자)를 받아 **「같은 자산에 조문별 신 키가 있으면 구 키 제외」**.
⚖️ 구 키는 조문을 알 수 없어, 그것이 다른 조문의 계산이었다면 이 규칙이 그 계산서를 지운다.
그래도 이쪽을 택했다 — 중복 4장은 어느 것이 맞는지 알 수 없게 만들고, 지워진 조문은 다시
계산하면 신 키로 살아나며, 구 키는 조문 구분 이전 잔재라 같은 자산에서 새 계산이 일어났다면
이미 낡았다고 보는 편이 실제에 가깝다.

**M-2. B-5(#1269)의 lock 스프레드 재배치가 GB/CB 배치 복원을 깨뜨렸다.**
`MultiPointBuildingStdPriceModal`은 계산서 재구성용 **valuation 모드** 스냅샷을
`bsp-a1-gb-acq` 같은 **단일시점 모달과 같은 키**로 쓴다(`val*`만 채우고 `acq*`는 빈 값).
lock을 뒤로 옮긴 뒤로는 그 키를 양도 모드로 열어 **취득당시 구조·용도·공시지가가 전부 빈**
상태가 됐다 — 값이 복원된 척하지만 계산 불가.

⇒ **세목이 어긋나는 복원분은 통째로 버린다**(`initialForm` 스프레드에 조건). 빈 폼 +
올바른 모드가 유일하게 일관된 상태다. lock을 앞에 두면(종전) 반대로 잠긴 세목이 무시되어
되돌릴 수 없는 모드에 갇힌다. anchor 3건 + mutation probe.

> 배치 스냅샷을 단일시점 모달이 같은 키로 읽는 **구조 자체**는 별건으로 남긴다(B-6).

### Low 1건 — E2E spec 헤더 정정

`red-phd-two-article-snapshot-keys.spec.ts`는 런처 4개만 단언하므로 **키 분리를 검증하지
않는다**(키 생성을 되돌려도 통과). 검증하는 것은 **발현 조건**이라는 사실을 헤더에 명시하고,
키 분리는 vitest 스텁 anchor가 고정한다고 상호 참조를 걸었다.

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

### 검증 — ✅ 완료 (2026-08-24)

- anchor 작성 → **먼저 실패 확인**(`expected <input …> to be null` — 라디오가 실제로 렌더됐다)
- 두 호출부에 `lockedTaxType="transfer"` 추가 → 통과
- **anchor를 전수화했다**: 처음엔 첫 런처만 열어 확인했는데, mutation probe로 **둘째 호출부가
  사각지대**임을 실측했다(둘째만 제거해도 통과). `it.each`로 런처 2개를 각각 연다 —
  이제 어느 쪽을 제거해도 실패한다.
- 회귀: vitest **전체 16,237건** · 건물기준시가 모달 E2E **40건** · tsc 0 · lint 0

### 🔴 리뷰가 잡은 **잔여 구멍** — `lockedTaxType`이 복원 스냅샷에 졌다

`BuildingStdPriceForm.tsx:111`에서 lock 스프레드가 `initialForm`(= `{...restoredForm, ...prefillForm}`)
**보다 앞**에 있어, 복원된 스냅샷의 `taxType`이 lock을 덮어썼다.

⇒ **이 버그를 이미 겪은 사용자는 고쳐도 고쳐지지 않는다.** 세목 라디오가 있던 시절 상증 모드로
저장한 스냅샷(`taxType: "inheritance_gift"`)은 sessionStorage와 이력
`input_data.buildingStdSnapshots` 양쪽에 남아 이력을 다시 열 때 재수화된다
(`HistoryClient.tsx:268`). 모달을 열면 **상증 1시점으로 복원되는데 라디오는 숨겨져 되돌릴 길이
없고**, 적용 버튼이 미배선 `onApply`를 불러 침묵 no-op이 되며 그 스냅샷이 다시 저장된다.

⇒ lock 스프레드를 `initialForm` **뒤**로 옮겼다 — 호출부 계약이 저장값을 이긴다.
이 변경은 `lockedTaxType`을 쓰는 **호출부 17곳 전체**에 영향하므로 전체 vitest·모달 E2E 40건으로
회귀를 확인했다. mutation probe로 구별력 실측(순서 원복 → 상증 1시점 모드로 열려 실패).

### anchor를 라벨 무관 단언으로 바꿨다

`queryByRole("radio", { name: /상속·증여\(1시점\)/ })`는 라디오가 올바로 숨겨졌을 때와
**옵션 라벨이 개칭됐을 때** 모두 null이라, 후자에서 테스트가 통과하며 아무것도 검증하지 않는다
(CLAUDE.md의 `toContainText("0")` 무력화와 같은 실패 모드). 그룹 자체의 부재
(`dialog.querySelector('[name="taxType"]')`)로 단언한다.

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

## 신규 후속 (B-6)

**배치 모달과 단일시점 모달이 같은 스냅샷 키를 공유한다.** 배치는 계산서 재구성용
valuation 스냅샷을, 단일시점 모달은 정정용 복원 소스를 그 키에서 읽는다 — 두 용도가
한 키에 얹혀 있어 이번 M-2 같은 어긋남이 재발할 수 있다. 용도별 키 분리 또는 배치
스냅샷에 트랙 표식을 넣는 설계가 필요하다.

## 작업 순서 (권장)

1. **B-5** (가장 작다 — 1줄 × 2 + anchor) → 단독 PR 가능
2. **B-4** → **B-2** (키 분리가 게이트의 선행)
3. **B-3** — 조문 확인 결과에 따라 착수 여부 결정
