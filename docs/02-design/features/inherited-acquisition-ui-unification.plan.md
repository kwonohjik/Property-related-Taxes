# 상속 취득가액 입력 UI 통합 계획서

> **목표**: 상속 취득원인 시 항상 함께 렌더되는 두 블록(상단 "상속 취득가액 산정" + 하단 "취득가액 의제 특례")을 **단일 UI 흐름**으로 통합하여, `inheritanceValuationMode`(자동/직접입력)에 따라 발생하는 **중복·dead 입력 노출**을 제거한다.
>
> 작성일: 2026-07-20 · 방향: 사용자 선택 = **상·하단 단일 UI로 통합**

---

## 1. 배경 — 현행 문제 (실측 확정)

상속(`acquisitionCause === "inheritance"`) 선택 시, **두 개의 독립 블록이 항상 함께 렌더**된다. 렌더 사이트 2곳 모두 조건이 `acquisitionCause === "inheritance"` 하나뿐이라 서로 독립적으로 표시된다:

- `components/calc/transfer/CompanionAcquisitionCauseSection.tsx:216` (상단) · `:265` (하단)
- `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx:187` (상단) · `:244` (하단)

| 블록 | 컴포넌트 | 핵심 입력 | 엔진 도달 필드 |
|---|---|---|---|
| **상단** "상속 취득가액 산정" | `CompanionAcqInheritanceBlock.tsx` | 자동(보충적평가)/직접입력 토글, 자산구분, 공시가격/취득가액 | auto → `publishedValueAtInheritance` · manual → `fixedAcquisitionPrice` |
| **하단** "취득가액 의제 특례" | `InheritedAcquisitionDeemedSection.tsx` → `PreDeemedInputs.tsx` / `PostDeemedInputs.tsx` | 의제취득일 전후 분기, 평가방법 5종, 신고가액, 환산·§164⑦ | `inheritedAcquisition` payload |

### 1.1 핵심 결함 — 하단은 사실상 "auto 전용"인데 UI는 항상 노출

하단 섹션(pre-deemed·post-deemed 모두)이 엔진에 도달하려면 **`inheritanceValuationMode === "auto"`가 필수**다:

- companion 경로: `lib/calc/transfer-tax-api-helpers.ts:551` — `inheritanceValuationMode === "auto"`일 때만 `inheritanceValuation` 생성
- primary 경로: `lib/calc/transfer-tax-api-inheritance.ts:25` — `buildInheritedAcquisitionPayload` 트리거도 auto 필수
- manual 경로: `lib/calc/transfer-tax-api-helpers.ts:566` — manual이면 `fixedAcquisitionPrice`만 `acquisitionPrice`로 전달

**결과**: 직접입력(manual) 모드에서는 상단 `fixedAcquisitionPrice`만 실제 취득가액이 되고, **하단 "취득가액 의제 특례" 전체가 무시(dead)**된다. 그런데 하단 UI는 `InheritedAcquisitionDeemedSection.tsx:42` 에서 상속개시일만 보고 표시 여부를 정하므로 manual 모드에서도 계속 노출된다 → 사용자가 "상속세 신고가액"을 또 입력하지만 버려지는 혼란.

### 1.2 엔진 override 경로 (참고 — 통합 후에도 불변 유지 대상)

auto 모드에서 하단 값이 취득가액이 되는 메커니즘:
- `lib/tax-engine/transfer-tax.ts:124-131` STEP 0.45 — `runInheritedAcquisitionStep` 실행
- `lib/tax-engine/inheritance-acquisition-helpers.ts:141` — `applyResultToInput`이 `acquisitionPrice: result.acquisitionPrice`로 덮어씀
- `lib/tax-engine/inheritance-acquisition-price.ts` — `calcPreDeemed`(**가목 우선**: `max(①신고가액, ②§164④~⑦)`, 0일 때만 ③환산 — 2026-08-06 갱신, 종전 서술 「max ①③」은 #1080·#1089 前) / `calcPostDeemed`(신고가액·§164⑦ max)

> **원칙**: 이번 통합은 **UI·API 변환 레이어 재구성**이며, `lib/tax-engine/` 순수 엔진의 계산 로직·세법 정확성은 건드리지 않는다. 세액은 통합 전후 불변이어야 한다(회귀 anchor로 강제).

---

## 2. 통합 목표 UI (단일 흐름)

상속 취득원인 선택 시, 하나의 컴포넌트가 아래 순서를 렌더한다 (UI 순서 = 엔진 계산 순서 원칙 준수):

```
[상속 취득 정보]  ← 공통 헤더
 ├ 상속개시일 (DateInput)
 ├ 피상속인 취득일 (DateInput, 단기보유 통산 §104②1호)
 └ §154⑧3호 동일세대 통산 토글 (주택 전용) ← 취득가액과 무관, 현행 유지

[상속 취득가액 산정]  ← 통합 본문
 ├ 자산구분 (토지 / 개별주택 / 공동주택)
 ├ 의제취득일(1985.1.1.) 전후 자동 분기 배지 [의제취득일 이전 / 이후]
 ├ 평가방법 선택  ← inheritanceValuationMode 토글을 흡수
 │   post-deemed: 매매사례 / 감정 / 수용·경매·공매 / 유사매매 / 보충적평가
 │   (직접입력 = 평가방법 선택 후 신고가액 직접 기입 — 별도 "직접입력" 모드 불요)
 ├ 신고가액 입력 (publishedValueAtInheritance) — 단일 필드
 ├ [보충적평가 선택 시] 보조계산 (토지 공시지가×면적 / 주택 공시가격)
 ├ [주택 미공시 < 2005-04-30] §164⑦ 환산 위젯 (post: max 비교 / pre: 환산 분자)
 └ [pre-deemed] 환산취득가 비교 UI (기준시가·pre1990) — max(①신고가액, ③환산)
```

핵심: **"자동 vs 직접입력" 이분 토글을 폐지**하고, 하단의 **"평가방법 선택" 단일 축**으로 흡수한다. 직접입력은 평가방법을 고른 뒤 신고가액을 손으로 적는 것으로 자연 표현된다.

**⚠️ pre-deemed는 평가방법 축 N/A (H1 실측)**: `inheritanceValuationMethod`(5종)는 **post-deemed 전용**이다 — `calcPreDeemed`(`inheritance-acquisition-price.ts:76-126`)·pre-deemed payload(`transfer-tax-api-inheritance.ts:47-56`)는 `reportedMethod`를 쓰지 않는다. pre-deemed 직접입력 = "신고가액(①) 입력 + 환산필드 공란 → ①이 채택"으로 자연 표현되므로(2026-08-06 정정: 현행은 **가목 우선**이라 ①이 있으면 ③에 **도달조차 하지 않는다** — 종전 서술 `max(①,③)`은 #1089 前), 통합 UI는 **의제취득일 분기(pre/post)를 먼저 판정한 뒤 post-deemed에서만 평가방법 셀렉트를 렌더**한다.

**현행 위젯 전수 수용 (M6·M5 실측)**: 통합 UI는 현행 4컴포넌트의 모든 입력을 빠짐없이 수용한다 — 자산구분(RadioCardGroup)·평가방법(Select)·보충적평가 보조계산 토글(ToggleCard)·§164⑦ 환산(HouseValuationSection)·pre1990 등급환산·환산취득가 비교·**기준시가 override 토글 2종**(`useStandardPriceAtAcqOverride`/`useStandardPriceAtTransferOverride`, `PreDeemedInputs.tsx:245-259,310-324`)·**자산구분 변경 시 supplementary 필드 stale-reset**(`CompanionAcquisitionCauseSection.tsx:239-248`). **공용 컴포넌트 강제**: ToggleCard/RadioCardGroup native 금지·DateInput·SelectOnFocus 재사용.

**⚠️ 동기화는 onChange 직접 patch 유지 (L3, `mirror-pattern`)**: 현행 `acquisitionDate → inheritanceStartDate` 동기화는 렌더 사이트 onChange(`CompanionAcquisitionCauseSection.tsx:220-224`)로 구현 — **useEffect→store 미러링 금지**(단일 컴포넌트 병합 시 재구현 유혹 차단).

---

## 3. 핵심 설계 결정 — 엔진 경로 단일화 범위 (B1 vs B2)

통합에는 두 하위 접근이 있다. **계획서 리뷰 시 이 결정을 먼저 확정**해야 한다.

### B1 — 완전 통합 + 엔진 경로 단일화 (권장)
- `inheritanceValuationMode`·상속용 `fixedAcquisitionPrice` **폐지**
- **단건** 상속 취득가액이 **항상 `inheritedAcquisition` payload 경로**로 엔진 도달. **다건은 §5.2 별도**(권장 (b): auto 차단 유지·취득가액 소스만 `publishedValueAtInheritance`로 단일화)
- `buildInheritedAcquisitionPayload`의 auto 게이트(`transfer-tax-api-inheritance.ts:25`)·companion auto 게이트(`transfer-tax-api-helpers.ts:551`) 제거 → 항상 생성
- manual 경로(`transfer-tax-api-helpers.ts:566`의 inheritance 분기) 제거
- **장점**: 근본 중복 완전 제거, 단일 진실 소스. **단점**: 마이그레이션·회귀 위험 최대(14지점 전면).

### B2 — UI만 통합 + 엔진 경로 이원 유지 (보수적 대안)
- 두 컴포넌트를 하나로 합치되, 내부 "직접입력" 서브모드는 여전히 `fixedAcquisitionPrice → acquisitionPrice` 경로 사용
- API/validate는 fallback으로 양쪽 인식
- **장점**: 마이그레이션 최소·회귀 위험 낮음. **단점**: `fixedAcquisitionPrice` vs `publishedValueAtInheritance` 이중 필드가 내부적으로 잔존(근본 해결 아님).

> **채택 = B1 (2026-07-20 확정)**. 사용자가 "통합"을 택한 의도는 근본 중복 제거. 리스크가 크므로 **§4 마이그레이션 + §7 anchor**를 선결 조건으로 한다. B2는 폐기(아래는 대안 기록용 보존).

*(이하 §4~§8은 확정된 B1 기준. B2는 채택하지 않음.)*

---

## 4. 필드 매핑 (Before → After, B1 기준)

| 필드 (`AssetForm`) | 현행 | 통합 후 |
|---|---|---|
| `inheritanceValuationMode` (`calc-wizard-asset.ts:86`) | auto/manual 토글 | **폐지** (평가방법으로 흡수) |
| `fixedAcquisitionPrice` (`:121`) | 상속 manual 취득가액 | 상속 용도 **폐지** (매매·증여·신축 용도는 유지 — grep 필수) |
| `publishedValueAtInheritance` (`:119`) | auto 공시가격/하단 신고가액 | **단일 취득가액 필드** (정본) |
| `inheritanceValuationMethod` (slice) | 하단 평가방법 5종 (**post-deemed 전용**, 현재 엔진 미도달·표시 전용) | **정본 평가방법**(post-deemed) — H7 하드코딩 제거 후 엔진 매핑. pre-deemed는 N/A |
| `inheritanceAssetKind` (`:90`) | 상단 자산구분 | 통합 본문 자산구분 (유지) |
| `useSupplementaryHelper` 등 보조계산 (slice) | 하단 | 유지 |
| `inhHouseVal*` (§164⑦ 3시점) | 하단 pre/post 공통 | 유지 |
| `pre1990*` | 하단 pre-deemed | 유지 |
| `inheritanceReportedValue` (slice:23) | **orphan 확정** (factory/migration default만, read/write 0 — 실측) | 이번에 제거 검토 |
| `hasDecedentActualPrice`·`decedentAcquisitionPrice` (slice:19,21) | **orphan 아님** — Zod refine 활성(`transfer-tax-schema-sub.ts:635,643`) | **유지**(통합과 무관, 건드리지 않음) |
| `inheritanceDate` (`:88`) | auto 동기화용 중복 | `inheritanceStartDate`와 일원화 검토 |
| `decedent*` §154⑧3호 (`:319,321,323`) | 공통 | 통합과 무관, 유지 |

> **⚠️ `fixedAcquisitionPrice` 폐지 주의 (H2 실측 — 사용처 광범위)**: 이 필드는 매매·증여·신축·재개발 승계조합원 외에도 **다수 사이트**에서 read된다 — 사이드바(`transfer-per-asset-summary.ts:74`·`calc-wizard-store.ts:440`), 엔진 안분(`bundled-sale-apportionment.ts:167,173`), validate(`transfer-tax-validate-asset.ts:447,589-600`·`transfer-tax-validate-gb.ts:133`·`transfer-tax-validate-split.ts:65`), 다건(`multi-transfer-tax-api.ts:9`), save-handler(`transfer-tax-save-handler.ts:22,32`), Zod(`transfer-tax-schema-sub.ts`). **Do 착수 시 `grep -rn "fixedAcquisitionPrice"` 전수 → 상속 분기만 제거, 나머지 사이트는 불변임을 사이트별로 회귀 검증**(A6 anchor 강화). 타 취득원인은 절대 건드리지 않는다(Surgical).

---

## 5. 통합 후 API 변환 (B1)

### 5.1 단건 경로
- **단일 payload 빌더**: `buildInheritedAcquisitionPayload`(`transfer-tax-api-inheritance.ts`)에서 `inheritanceValuationMode === "auto"` 게이트 제거 → 상속이면 항상 `inheritedAcquisition` 생성. 트리거는 자산구분·상속개시일·평가방법 존재로 대체.
- **`reportedMethod` 하드코딩 제거 (H7 실측)**: 현행 `transfer-tax-api-inheritance.ts:73`은 post-deemed에서 `reportedMethod: "supplementary"`를 **하드코딩** — 사용자의 평가방법 5종 선택이 엔진에 미도달(현재는 label 표시 전용). "정본 평가방법" 승격 시 `inheritanceValuationMethod` → `reportedMethod` 매핑으로 교체(세액 무관·UX 정본화 필수 배선). **단, 빈 method 방지 가드 필수 — §5.3 지뢰 참조.**
- **companion 경로 정합**: `transfer-tax-api-helpers.ts:551`의 auto 게이트도 동일 제거. `:566`의 `inheritance && manual` fixedAcq 분기 삭제.
- **primary `acquisitionPrice`**(`transfer-tax-api.ts:211-223`): 상속은 엔진 STEP 0.45가 override하므로 초기값은 0/무해값 전달(현행 auto 흐름과 동일). 재개발 승계조합원 상속 분기(`:216-219`)는 별도 케이스 — **회귀 확인 필수**.
- **다건 안분(primary)**(`transfer-tax-api.ts:610-624` `primaryInheritanceValuation`): auto 게이트 제거 정합.
- **조건부 spread (L2 정정)**: `inheritedAcquisition`은 `reportedRaw <= 0`이면 `{}` 반환(`transfer-tax-api-inheritance.ts:61`) — "항상 spread"가 아니라 **"값 有 시 spread, 라인 존재 보장"**. Zod 스키마는 이미 `inheritedAcquisition` 수용(신규 필드 아님).

### 5.2 다건(multi-transfer) 경로 — **B1 필수 확장 (C1 Critical, 실측)**
현행 다건은 상속 취득가액을 **manual `fixedAcquisitionPrice`에만 의존**하고 auto를 **명시적으로 차단**한다:
- `lib/calc/multi-transfer-tax-api.ts:9` — `acquisitionPrice = parseAmount(primary?.fixedAcquisitionPrice ?? "0")`
- `lib/calc/multi-transfer-tax-validate.ts:69` — `inheritance && inheritanceValuationMode === "auto"` → "단건에서만 지원" 차단(다건 route가 `inheritedAcquisition` sub-object 미지원, 미지원 시 취득가액 0 과대과세 방지용).

**B1로 `inheritanceValuationMode`·상속 `fixedAcquisitionPrice`를 폐기하면 다건 상속의 유일 경로가 사라진다.** 두 대응안 중 택1을 리뷰에서 확정:
- **(a) 다건에 `inheritedAcquisition` 경로 신규 지원** — 다건 route·API·validate에 단건 payload 경로 이식. 근본적이나 작업량 大.
- **(b) 다건 상속을 "신고가액 직접입력"으로 축소 유지** — `publishedValueAtInheritance`를 다건 취득가액 소스로 전환(현행 fixedAcquisitionPrice 대체), auto 보충적평가·환산은 단건 전용 유지(차단 문구만 필드명 갱신). 최소 변경.
> **확정 = (b) (2026-07-20, P2a 구현 중 정밀화)**. 다건 상속은 신고가액(`publishedValueAtInheritance`) 확정 시 **허용**하고 그 값을 취득가액으로 직접 사용. 보충적평가 자동조회·환산 등 **단건 전용 산정 경로만**(신고가액 공란 시) 차단. 기존 "auto 무조건 차단"(테스트 `[R2-H1]`)은 다건이 `publishedValue`를 안 읽어 취득가 0 과대과세되던 것을 막는 용도였으나, P2a가 다건 api를 `publishedValue`를 읽도록 전환하면 그 근거가 해소 → `[R2-H1]` '차단'→'통과' 갱신. (a) 다건 inheritedAcquisition 지원은 범위 밖.
>
> **⚠️ P2 순서 함정 (Do 착수 실측)**: 통합 UI가 `inheritanceValuationMode`를 항상 `"auto"`로 세팅하면 다건 validate(`multi-transfer-tax-validate.ts:69` = 상속 auto **차단**)와 충돌 → 다건 상속이 막힌다. 따라서 **다건 경로 전환(multi-api:9를 `publishedValueAtInheritance`로 + validate:69 차단 조정)을 통합 UI보다 먼저** 수행한다(§8 P2a 선행).

### 5.3 ⚠️ 세액 불변 지뢰 — post-deemed 토지 + 빈 method (C2 Critical, 실측)
`calcPostDeemed`(`inheritance-acquisition-price.ts:164`)는 `reportedValue && reportedMethod`가 **둘 다** 있어야 신고가액 경로로 간다. `reportedMethod`가 비면 `legacyFallback`(`:202`) → `computeSupplementary(land)`(`:248-250`) = **`publishedValue × landAreaM2`(면적 곱셈)**로 취득가액이 폭증한다. 현재는 `reportedMethod`가 "supplementary" 하드코딩이라 우연히 안전하지만, H7 매핑 도입·마이그레이션에서 method가 비면 노출된다.
- **가드**: 신규입력·마이그 모두 `reportedMethod` 필수(공란 시 안전 기본값 `supplementary` 강제). §7 **A-land anchor**로 회귀 차단.

---

## 6. 14개 동기화 지점 영향 매트릭스

| # | 지점 | 영향 | 작업 |
|---|---|---|---|
| ① | 폼 상태 타입 | 有 | `inheritanceValuationMode` 제거, slice orphan 정리 |
| ② | initial value | 有 | `makeDefaultAsset` 기본값 갱신 |
| ③ | normalize/migration | **有(critical)** | `calc-wizard-migration.ts:48-49,244`(mode read·destructure)·`:54,83`(legacy `fixedAcquisitionPrice=acquisitionPrice/appraisalValue`)·`calc-wizard-asset-migrate.ts:349-351`. manual→평가방법 변환 시 **method 공란 방지**(§5.3 지뢰) |
| ④ | API 변환 (단건+다건) | **有(critical)** | §5.1 단건 + **§5.2 다건**(`multi-transfer-tax-api.ts:9`) |
| ⑤ | UI 입력 위젯 | **有(대규모)** | 4컴포넌트 → 셸 통합(§8 P2 — 800줄 구조) |
| ⑥ | 사이드바 합계 | 有 | `transfer-per-asset-summary.ts:74`·`calc-wizard-store.ts:440` — 상속 취득가액 추정 소스를 `publishedValueAtInheritance`로 전환 |
| ⑦ | 결과 카드 | 低 | `InheritedAcquisitionDetailCard` 표시 불변 확인 |
| ⑧ | Validation (단건+다건) | **有** | `transfer-tax-validate-asset.ts:613-618`(hasAuto/hasManual 분기 폐기 필드 의존 → 평가방법·신고가액 규칙으로 교체)·`multi-transfer-tax-validate.ts:69`(다건 auto 차단 문구 갱신) |
| ⑨⑩ | Zod enum + refine | 有 | `inheritanceValuationMode` enum 제거 + companion refine `transfer-tax-schema.ts:665-671`("auto or fixedAcq" → "inheritedAcquisition 기준") 재작성 |
| ⑪ | 자산-수준 acquisitionDate fallback | 低 | 확인 |
| ⑫⑬⑭ | Zod 입력객체·body spread·Route 매핑 | 有 | `inheritedAcquisition` **값 有 시 spread**(L2) — 침묵 strip 방지 grep. Zod는 이미 수용(신규 필드 아님) |

---

## 7. 회귀 방지 — Pre-Do Anchor (선결)

Do 진입 전 아래 anchor를 먼저 작성·GREEN 확인하여, 통합 리팩터가 **세액을 바꾸지 않음**을 baseline으로 고정한다 (`pre-do-anchor-verification` 스킬):

- **A1**: post-deemed 주택, 보충적평가, 신고가액 4억 → 취득가액 4억 (현행 auto)
- **A2**: post-deemed, "직접입력"(현행 manual) 4억 → 통합 후 평가방법+신고가액 4억, **동일 세액**
- **A3**: pre-deemed 토지, max(신고가액, 환산취득가) 채택 로직 불변
- **A4**: 주택 미공시 §164⑦ max(①,②) 불변 (`inheritance-acquisition-price.ts:144-160`)
- **A5**: 다건 안분(`primaryInheritanceValuation`) 지분 모드 불변
- **A6**: 비상속 취득원인(매매·증여·신축·재개발)의 `fixedAcquisitionPrice` 경로 **회귀 0** — H2 열거 사이트별(사이드바·안분·validate·save-handler) 검증 (가장 중요)
- **A-land (C2 지뢰)**: post-deemed **토지** 자산, `reportedMethod` 공란 → `legacyFallback`의 `computeSupplementary(land)` **면적곱**으로 취득가액 폭증하지 않음을 확인(method 안전 기본값 강제). 마이그·신규입력 양쪽.
- **A-multi (C1 다건)**: 다건 상속 취득가액이 B1 후에도 불변(§5.2 (b) 채택 시 `publishedValueAtInheritance` 소스 전환 동일값 / 다건 auto 차단 유지).

기존 회귀: `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` 전량 GREEN 유지.
**RTL 회귀 (H5 실측 — UI 텍스트 의존, 재구성 시 갱신 대상)**: `__tests__/calc/post-deemed-house-valuation-visibility.test.tsx`(`/취득가액 의제 특례/`·"상속세 신고가액")·`post-deemed-supplementary-asset-adaptive.test.tsx`(`/보충적평가 보조계산 사용/`)·`inherited-self-cohabitation-toggle.test.tsx`. E2E `transfer-inheritance-house-val-building-std-batch.spec.ts` 확인.

---

## 8. Phase 계획

> **⚠️ Phase 순서 재조정 (2026-07-20, Do 착수 시 결합도 발견)**: `inheritanceValuationMode`·상속 `fixedAcquisitionPrice` **폐기는 UI·store·validate·migration·Zod가 동시에 참조**하여 독립적으로 tsc GREEN이 불가 — 필드 폐기는 UI 통합과 **한 덩어리(P2)**로 묶어야 한다. 따라서 P1은 "필드 폐기 없는 안전·독립 조치"로 좁힌다.

1. **P0 — Anchor(§7)** 작성·RED/GREEN 확인 → 설계 환류. **A2·A-land·A-multi·A6 우선**. (✅ pre-do로 A2·A-land 확증 완료)
2. **P1 — 안전·독립 조치 (세액무관·필드유지, tsc GREEN)**: `transfer-tax-api-inheritance.ts:73` `reportedMethod` 하드코딩 "supplementary" → **`inheritanceValuationMethod || "supplementary"` 매핑**(H7 정본화 + **C2 공란 가드 내장**). 사용자 선택 평가방법이 결과 legalBasis/formula에 반영(세액 불변). A-land anchor 정식화. 필드 폐기·UI 변경 0.
3. **P2 — UI 통합 + 경로 단일화 (3 서브페이즈, 다건 충돌 회피 순서 — 실측 세분화)**:
   - **P2a (다건 소스 전환, 선행)**: `multi-transfer-tax-api.ts:9` 다건 상속 취득가액 `fixedAcquisitionPrice` → `publishedValueAtInheritance`. `multi-transfer-tax-validate.ts:69` auto 차단 조정(직접입력 소스 기준). 다건 (b) 구현. tsc·회귀 GREEN. **통합 UI의 auto 세팅이 다건을 막지 않도록 선행 필수.**
   - **P2b (단건 UI 셸 통합 + 항상 auto 세팅)**: **`CompanionAcqInheritanceBlock` 셸이 `InheritedAcquisitionDeemedSection` 흡수**, `PreDeemedInputs`·`PostDeemedInputs`·`HouseValuationSection`(571줄) **하위 존치**(§9 R4, 셸 ≤300줄). 자동/직접입력 토글 제거 → 평가방법 축(post) / 신고가액(pre). `inheritanceValuationMode` **항상 "auto" 세팅**(manual 경로 무력화), 상속 `fixedAcquisitionPrice` 입력 UI 제거. 렌더 사이트 2곳 교체. onChange 직접 patch(mirror-pattern). migration: 기존 manual(`fixedAcquisitionPrice`+mode=manual) → `publishedValueAtInheritance`+평가방법(method 공란 방지). **A2 anchor로 manual→auto 동일세액 강제.**
   - **P2c (dead 코드·필드 폐기)**: manual 분기 삭제(`api-helpers.ts:566`·`validate-asset.ts:615`·`api.ts` manual), `inheritanceValuationMode` 필드 제거(store·factory·migration·Zod), 상속 `fixedAcquisitionPrice` prop 제거, companion refine(`transfer-tax-schema.ts:665-671`) 재작성, orphan `inheritanceReportedValue` 제거. 모든 참조가 auto 가정이라 안전 제거.
   > 각 서브페이즈 끝 tsc·회귀 GREEN 유지. P2a→P2b→P2c 순서 강제(다건 충돌 회피).
4. **P3 — 검증·ship** (⑥⑦): 사이드바·결과 확인 + 통합 anchor + RTL 3파일 + 전체 회귀 + tsc + 브라우저 수동(직접입력/보충적평가/pre/post/주택미공시/토지/다건) + ship.
   > **순서 근거(L1)**: P1 안전조치가 API/엔진층 baseline을 먼저 고정 → P2 UI·필드 교체 중에도 A2·A-land anchor 안정.

---

## 9. 리스크 · 미결정 사항

- **R0 (Critical) — 다건 경로 (C1)**: 다건은 상속 auto를 명시 차단하고 `fixedAcquisitionPrice`에만 의존(`multi-transfer-tax-api.ts:9`·`multi-transfer-tax-validate.ts:69`). B1이 이 필드를 폐기하면 다건 상속이 붕괴 → **§5.2에서 (a)/(b) 확정 필수**. A-multi anchor로 강제.
- **R0′ (Critical) — 면적곱 세액 지뢰 (C2)**: post-deemed 토지 + 빈 `reportedMethod` → `legacyFallback` 면적곱(`inheritance-acquisition-price.ts:164,248-250`). method 필수화 + A-land anchor로 차단. ✅ P1에서 API 가드 완료.
- **R0″ (Critical) — 토지 publishedValueAtInheritance 단가/총액 이중 경로 (P2b 착수 실측)**: 단건은 inheritedAcquisition 경로(**총액**, `route.ts` calcPostDeemed 그대로)·다자산 일괄양도는 inheritanceValuation 경로(**단가**, `route.ts:459-490` `computeSupplementary(land)` = 단가×면적). 통합 셸이 토지 입력 의미를 통일하면 통일 안 된 경로가 면적배 오류. → **P2b는 route 두 경로 통일(⑭)을 포함**해야 함: 통합 셸 토지 입력을 총액으로 통일하고, `route.ts:459-490` inheritanceValuation 경로도 총액 직수용(computeSupplementary ×면적 제거)으로 정합. 경로별 baseline anchor 선행.
- **R1 (高)**: B1 세션 마이그레이션 — manual `fixedAcquisitionPrice` → 평가방법+신고가액 무손실 변환(method 공란 방지). 실패 시 이력 재현 불가. → P3 마이그 테스트 필수.
- **R2 (高)**: `fixedAcquisitionPrice` 상속 분기만 제거 시 타 취득원인 회귀(H2 광범위 사이트). → A6 anchor로 강제.
- **R3 (中)**: 재개발 승계조합원 + 상속(`transfer-tax-api.ts:216-219`) 교차 케이스. → 별도 anchor 확인.
- **R4 (高 — 800줄 확정, 실측)**: 현행 4컴포넌트 = **1,047줄**(281+88+354+324) + HouseValuationSection 571줄. 단일 컴포넌트 병합 시 800줄 초과 확정. → **셸만 흡수, Pre/Post/HouseValuation 하위 컴포넌트 존치**(§8 P2), 통합 셸 ≤300줄.
- ~~**미결정 1**: B1 vs B2~~ → **B1 확정 (2026-07-20)**.
- ~~**미결정 2**: hasDecedentActualPrice orphan 여부~~ → **해소(실측)**: `hasDecedentActualPrice`·`decedentAcquisitionPrice`는 orphan 아님(Zod refine 활성) → 유지. orphan은 `inheritanceReportedValue`만 확정(제거 검토).
- **미결정 3**: `inheritanceDate` vs `inheritanceStartDate` 일원화 범위 — 세션 데이터 호환 영향 확인.
- ~~**미결정 4**: §5.2 다건 대응 (a) vs (b)~~ → **(b) 확정 (2026-07-20)**: 다건 auto 차단 유지 + 취득가액 소스만 `publishedValueAtInheritance`로 단일화. (a)는 범위 밖.

---

## 부록 — 이번 세션 실측 인용 (추정 아님)

- 렌더: `CompanionAcquisitionCauseSection.tsx:216,265` · `GeneralBuildingAcquisitionCards.tsx:187,244`
- API 게이트: `transfer-tax-api-helpers.ts:551`(auto),`:566`(manual) · `transfer-tax-api-inheritance.ts:25`(auto)
- primary acq: `transfer-tax-api.ts:211-223`,`610-624`,`643`
- 엔진 override: `transfer-tax.ts:124-131` · `inheritance-acquisition-helpers.ts:141` · `inheritance-acquisition-price.ts:141-160`
- store: `calc-wizard-asset.ts:86,88,90,119,121` · `calc-wizard-asset-inheritance-acq.ts` slice
- UI 내부: `CompanionAcqInheritanceBlock.tsx:246,258`(post-deemed 주택 상단 숨김) · `PostDeemedInputs.tsx:65,84`(§164⑦·보조계산) · `PreDeemedInputs.tsx:327-347`(max ①③)
