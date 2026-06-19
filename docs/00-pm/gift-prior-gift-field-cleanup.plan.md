# 증여세 사전증여(§47/§58) 입력 필드 정리 — 중복 제거 + 계산 순서 재배치

> Plan · 2026-06-19 · feature: `gift-prior-gift-field-cleanup`
> 대상: 증여세 마법사 3단계 "비과세·합산" 의 사전증여 행 편집기(`GiftRowEditor`) — **증여세 모드 한정**

---

## 1. 배경·문제

증여세 사전증여 한 회차를 입력하는 모달(`GiftRowEditor.tsx`)의 **증여세 모드(`showGiftPhaseA`)** 입력란이 중복·잉여를 포함한다.

- **"수증인과의 관계"(`doneeRelation`) Select** 가 §47 블록의 **"증여자"(`donor`) Select** 와 같은 "증여자↔수증자 관계"를 두 번 묻는다.
- **"기납부 증여세"(`giftTaxPaid`) 입력란** 은 증여세 엔진이 사용하지 않는다.
- 증여자(`donor`)가 모달 맨 아래 §47 블록에 있어, "증여재산가액 → 과세표준 → 산출세액" 의 계산 흐름과 화면 배치 순서가 어긋난다.

핵심 통찰: **메인 증여 회차는 이미 `donor` 하나만 받고 `donorRelation`을 자동 도출(G-M3 "단일 진실화", `gift-tax-form-shared.tsx:158-185`)하도록 정리됐다.** 사전증여 행만 옛 패턴이 남았다. 이 작업은 신규 기능이 아니라 **메인 폼이 이미 한 정리를 사전증여에 적용해 일관성을 회복**하는 것이다.

---

## 2. 검토 결과 — 필드별 판정 (실측 근거)

| 입력란 | 필드 | 엔진 사용처 | 판정 |
|---|---|---|---|
| 증여일 | `giftDate` | §47 10년 cutoff (`gift-prior-aggregation.ts:111·126`) | **필수 유지** |
| 수증인과의 관계 | `doneeRelation` | 증여세 엔진 **미사용**(`gift-tax.ts` grep 0건). UI 자동세액 보조 | ❌ **UI 제거** → `donor`서 도출 |
| 증여재산가액 | `giftAmount` | §47 합산액 ① (`gift-prior-aggregation.ts:148`) | **필수 유지** |
| 기납부 증여세 | `giftTaxPaid` | 증여세 엔진 **미사용**. `aggregatePriorGiftsForGift`의 `totalTaxPaid`는 "정보용" 주석(`:67`) | ❌ **증여세 모드 제거** |
| 증여자(§47) | `donor` | §47 그룹·§57 (`gift-tax.ts:145·147·234`) | **필수 유지 (위로 이동)** |
| ⑤ 합산과세표준 | `giftTaxBase` | §58 한도 분자 (`gift-tax.ts:300`) | ✅ **유지 + 자동 prefill** |
| ⑦ 산출세액 | `computedTax` | §58 공제액 (`gift-tax.ts:264`) | ✅ **유지 + 자동 prefill** |
| 세대생략 토글 | `wasGenerationSkip` | §57 (`resolveWasGenerationSkip`) | 유지 (donor=조부모 자동) |
| ⑫ 추가할증 | `additionalGenerationSkipSurcharge` | §57 누적 (`gift-prior-aggregation.ts:152`) | 조건부 유지 |

### 2.1 ⑤·⑦을 자동계산으로 "완전 대체"하지 않는 이유 (정확성)

상증법 §58①은 *"증여 당시 그 증여재산에 대한 증여세산출세액"* 을 공제하라고 한다. 그 회차가 **또 이전 증여와 합산됐거나(누진세율 상승), §53 공제를 일부 이미 썼거나, 과거 세율 개정**이 끼면 ⑤·⑦은 증여재산가액 단순계산과 달라진다. 따라서 ⑤·⑦은 **실제 신고서 값을 직접 입력**해야 정확하다(자동값은 단순 1건 추정).

→ 결론: ⑤·⑦은 **자동 prefill(추정값으로 채움) + 수정 가능** + 안내 배지로 처리. 입력란 자체는 유지.
(메모리 정책: `feedback_tax_calculation_principle` 법령 정확성 최우선 · `feedback_no_silent_apportion_fallback` 자동 안분 금지)

---

## 3. 변경 범위

1. **제거** (증여세 모드 `showGiftPhaseA` 한정):
   - "수증인과의 관계"(`doneeRelation`) Select — `GiftRowEditor.tsx:212-237` **만**.
     ⚠️ **N1**: 상속세 모드 수동경로의 동명 Select(`319-339`, `showIsHeir && !doneeId`)는 **유지**(같은 라벨이라 혼동 주의 — 제거 금지).
   - "기납부 증여세"(`giftTaxPaid`) 입력란 — `GiftRowEditor.tsx:430-466`을 `!showGiftPhaseA` 가드로 감싸 증여세 모드에서만 숨김(상속세 모드 §28 공제용 유지).
     ⚠️ **N2**: §30 블록의 "기납부 특례세액"(`priorSpecialTaxPaid`, `636-664`)은 **별개 — 유지**(특례 스트림 차감용, `giftTaxPaid`와 무관).
2. **도출 통합**: 증여세 모드 자동세액 prefill에 필요한 `doneeRelation`은 `deriveDonorRelation(donor, false)`로 **내부 파생**(메인 폼과 동일 헬퍼 재사용). `PriorGift.doneeRelation` 타입은 **유지**(상속세 모드에서 사용 중 — 제거 불가).
3. **⑤·⑦ 자동 prefill (store commit)**: `donor` 또는 `giftAmount` 변경 시, `userTouched`(⑤·⑦ 전용 플래그)가 false면 `autoComputeGiftTaxBase`/`autoComputePriorGiftTax(giftAmount, deriveDonorRelation(donor, false))` 결과를 **실제 store에 set**(자동세액 `computeTaxPatch`와 동일 onChange 패턴 — useEffect 미러링 아님). 사용자가 ⑤·⑦ 직접 수정 시 `userTouched=true`로 자동 갱신 중지 + "🧮 자동계산" 배지.
   ⚠️ **D1**: 표시 fallback만 하면 store는 `undefined` 유지 → validate(`gift-tax-form-shared.tsx:317-320`)가 동일그룹 ⑤·⑦ 필수로 **차단** → UI 표시↔validate 모순. 반드시 **store commit**으로 구현.
4. **특례 시 §47 카드 숨김** (**D2**): `specialTreatmentType !== undefined`면 엔진이 §47 합산에서 제외(`gift-prior-aggregation.ts:118-123`)하므로 ⑤·⑦·세대생략·⑫ 카드를 **숨김** + "특례 스트림 별도 합산" 안내. 일반 증여(`none`)일 때만 §47 카드 노출. (이때 ⑤·⑦ validate도 특례면 면제 — §6 참조)
5. **입력 필드 재배치**: 계산 로직 순서대로(§4).

상속세 모드(`showIsHeir`) 필드·순서는 **무변경**.

---

## 4. 입력 필드 배치 — Before / After

### Before (증여세 모드, 현재)
```
1. 증여일
2. 수증인과의 관계        ← [제거] donor 중복
3. 증여재산가액
4. 기납부 증여세          ← [제거] 엔진 미사용
5. 부표 메타 (접이식)
6. §30 조특법 특례
7. §47 블록
   ├ 증여자(donor)        ← 맨 아래 (흐름 역행)
   ├ ⑤ 합산과세표준
   ├ ⑦ 산출세액
   ├ 세대생략 토글
   └ ⑫ 추가할증
```

### After (증여세 모드, 계산 로직 = 신고서 흐름 순서)
```
1. 증여일
2. 증여자(donor)          ← 위로: "누가 줬나" = §47 그룹 + §53 관계(자동 도출)
3. 증여재산가액 ①
4. §30 조특법 특례 (일반/창업§30의5/가업§30의6)   ← §47 노출 여부를 가르므로 §47 앞
5. ── 일반 증여(none)일 때만 ── §47·§58 카드
   ├ ⑤ 합산과세표준        (donor+가액 자동 prefill[store commit] · 수정 가능)
   ├ ⑦ 산출세액           (donor+가액 자동 prefill[store commit] · 수정 가능)
   ├ 세대생략 토글         (donor=조부모 자동 ON)
   └ ⑫ 추가할증           (세대생략 ON 시)
   ── 특례(startup/family_business)일 때 ── §47 카드 숨김 + "특례 스트림 별도 합산" 안내 + 기납부 특례세액 입력
6. (접이식 보조) 부표 메타
```

흐름: **증여일 → 증여자 → 받은 재산(①) → [특례 여부] → [§53 공제→] 과세표준 ⑤ → [×세율→] 산출세액 ⑦ → §57 할증** 으로 위에서 아래로 자연스럽게 읽힌다.
**배치 결정 (D2)**: §30 특례 토글은 §47 카드의 **노출 여부를 결정**하므로(특례=§47 제외) §47 카드 **앞**에 둔다. 부표 메타만 접이식으로 뒤로.

---

## 5. 구현 상세

- `GiftRowEditor.tsx`:
  - `showGiftPhaseA && (...)` "수증인과의 관계" 블록(212-237) 삭제. **상속세 모드 319-339는 유지** (N1).
  - 기납부 증여세 입력란(430-466)을 `!showGiftPhaseA` 가드로 감싸 증여세 모드에서만 숨김(상속세 모드 §28 공제용 유지). §30 특례세액(636-664)은 무변경 (N2).
  - 증여자(`donor`) Select를 §47 블록에서 분리해 **증여일 직후**로 이동.
  - §30 특례 토글을 §47 카드 **앞**으로 이동. `specialTreatmentType === undefined`(일반)일 때만 §47·§58 카드(⑤·⑦·세대생략·⑫) 렌더 (D2).
  - 부표 메타 블록을 카드 뒤로 이동(접이식 유지).
- **⑤·⑦ prefill (store commit — D1)**: ⑤·⑦ 전용 `userTouchedBaseTax` 플래그(useState) 추가. **발동 게이트: `donor && giftAmount > 0`**(둘 다 있어야 관계·세액 확정). `handleGiftAmountChange`·donor onChange에서 게이트 충족 + 플래그 false면 `set({ giftTaxBase: autoComputeGiftTaxBase(...), computedTax: autoComputePriorGiftTax(giftAmount, deriveDonorRelation(donor, false)) })`로 **실제 store 반영**. ⑤·⑦ CurrencyInput onChange는 플래그 true로 설정 후 입력값 우선. → store에 값 존재 → validate 통과. "🧮 자동계산" 배지.
  - **이력조회 상호작용(R6)**: `sourceCalculationId` 있는 행(이력 채움)은 `userTouchedBaseTax` 초기 **true**로 간주 → prefill이 이력 ⑤·⑦을 덮어쓰지 않음. (자동세액 `userTouchedTax`와 동일 원칙)
  - ⚠️ 표시 fallback만 하면 store `undefined` → validate(317-320) 차단(§6 ⑧). 반드시 store commit.
  - 미성년 직계존속 공제(2천)는 prefill에서 성인 기준 추정 → 신고서 값으로 수정 커버(드문 케이스). "기타(other)" donor → `other_relative`(1천 공제) 매핑은 비친족이면 과다 추정 가능 → 수정으로 커버 (N4).
- 자동세액(`computeTaxPatch`)이 `doneeRelation` 참조 → 증여세 모드에서 `gift.doneeRelation ?? deriveDonorRelation(gift.donor ?? "father", false)` fallback으로 무중단.

---

## 6. 동기화 지점 점검 (UI 통합 8지점)

| # | 지점 | 영향 | 조치 |
|---|---|---|---|
| ① 폼 타입 | `PriorGift` | 무변경 (`doneeRelation` 타입 유지) | — |
| ② initial | `makeEmptyGift` | 무변경 | — |
| ③ normalize | — | 무변경 | — |
| ④ API 변환 | `gift-api.ts:86` | `priorGifts.map` rest 전달 — `doneeRelation`/`giftTaxPaid` 잔존해도 엔진 무시 | 무해, 점검만 |
| ⑤ UI 위젯 | `GiftRowEditor` | **주 변경** | §5 |
| ⑥ 사이드바 | 합계 | 사전증여 합계는 `giftAmount` 기준 — 무영향 | 확인 |
| ⑦ 결과 카드 | filingForm ⑤⑦ | ⑤·⑦ 그대로 사용 — 무영향 | 확인 |
| ⑧ validate | `gift-tax-form-shared.tsx:308-323` | `donor`·⑤·⑦만 검증, `doneeRelation`/`giftTaxPaid` 미검증 → 제거해도 차단 모순 없음. **단 ⑤·⑦ prefill은 store commit이라야 통과(D1)**. **특례 회차(`specialTreatmentType`)는 ⑤·⑦ 검증 면제 추가 필요(D2 — 특례는 §47 카드 숨김이므로 입력 불가)** | **검증 추가**: `isSameDonorGroup && !specialTreatmentType`일 때만 ⑤·⑦ 필수 |

추가: `PriorGiftHistoryModal`의 `candidateToPriorGift`가 `doneeRelation`·`giftTaxPaid`를 채우지만, UI Select 제거와 무관(내부 데이터). `donor` 기반 도출과 정합.

---

## 7. Pre-Do Anchor (Do 진입 전 1건 우선 실행)

E2E 또는 단위로 다음을 **먼저** 확보해 회귀 안전망:
- **A-1 (변환 불변 — N3)**: 이 변경은 **UI 전용**이므로 엔진 단위 anchor는 약함(엔진 입력이 같으면 결과 당연 동일). 대신 **`buildGiftTaxInput(form)` 변환 결과가 정리 전후 동일**함을 단위로 고정 — 동일 폼(donor=father·⑤·⑦·giftAmount)에서 `priorGiftsWithin10Years` 엔진 입력이 불변. doneeRelation/giftTaxPaid UI 제거가 엔진 도달 데이터를 바꾸지 않음을 실증.
- **A-2 (prefill store commit 정합)**: ⑤·⑦ 미입력 + donor=father + giftAmount 입력 → store의 `giftTaxBase`/`computedTax`가 `autoComputeGiftTaxBase`/`autoComputePriorGiftTax` 결과로 **set됨**(표시값 아닌 store 값 확인) → validate 통과.
- **A-3 (특례 분기 — D2)**: `specialTreatmentType="startup"` 회차 → §47 카드 미렌더 + ⑤·⑦ validate 미차단.

A-1이 깨지면 "엔진 미사용" 판정이 틀린 것 → 설계 환류. A-2가 표시값만이고 store가 undefined면 D1 미해결.

---

## 8. 케이스 매트릭스

| # | 시나리오 | 기대 |
|---|---|---|
| C1 | 단순 1건(부, 첫 증여) | donor=father, ⑤·⑦ 자동 prefill = 실제값, 결과 불변 |
| C2 | 동일그룹 합산(부+모) | 두 회차 각 donor, §47 합산, ⑤·⑦ 각 입력 |
| C3 | 다른그룹(부 vs 조부모) | §47 분리(별개 신고), warning |
| C4 | 합산된 회차(⑤·⑦≠단순계산) | prefill 추정값 → 사용자가 신고서 값으로 수정 + 안내 배지 |
| C5 | 세대생략(조부모) | 세대생략 자동 ON, ⑫ 입력 |
| C6 | 이력 자동조회 | ⑤·⑦ 채워짐, doneeRelation Select 제거와 무관 |
| C7 | 상속세 모드 | doneeRelation·giftTaxPaid 유지(무변경) |
| C8 | 조특법 특례(창업§30의5/가업§30의6) | §47 카드 숨김, ⑤·⑦ validate 면제, "특례 스트림 별도 합산" 안내, 기납부 특례세액 입력 노출 |
| C9 | 특례→일반 전환 | §47 카드 재노출 + ⑤·⑦ 재prefill (R5) |

---

## 9. 리스크·롤백

- **R1 (상속세 모드 회귀)**: GiftRowEditor 공용 → 증여세 모드 가드(`showGiftPhaseA`) 정확히 적용. C7 anchor로 보증.
- **R2 (prefill이 직접입력을 덮어씀)**: ⑤·⑦은 store commit이지만 `userTouchedBaseTax` 플래그로 사용자 수정 시 자동 갱신 중지. 자동세액(`userTouchedTax`)과 동일 검증된 패턴. onChange 기반(useEffect 미러링 아님).
- **R4 (D1 validate 모순)**: prefill을 표시 fallback으로 구현하면 store undefined → validate 차단. **store commit 강제** + A-2 anchor로 보증.
- **R5 (D2 특례 회차)**: 특례 선택 후 일반으로 되돌릴 때 ⑤·⑦ 재노출·재prefill 동작 확인. 특례→일반 전환 시 `userTouchedBaseTax` 리셋 검토.
- **R3 (⑤·⑦ 정확성 저하)**: 완전 자동화 아님 — 직접입력 유지 + 수정 가능. §58 정확성 보존.
- 롤백: UI 전용 변경(엔진·타입 무변경) → revert 단순.

---

## 10. 작업 순서 (Do)

1. Pre-Do anchor A-1·A-2 작성·실행 (실패/통과 확보)
2. `GiftRowEditor.tsx` 증여세 모드 재배치 + doneeRelation/giftTaxPaid 제거 + ⑤·⑦ prefill
3. `npx tsc --noEmit` 0건
4. `npx vitest run __tests__/.../gift` 회귀 통과
5. 기존 증여세 E2E(`e2e/gift-*.spec.ts`) 회귀 + 신규 배치 확인 spec
6. ui-engine-sync-checker (선택)

---

## 11. 미결 — 사용자 확인 필요

- **⑤·⑦ 처리 방향**: (A) 본 계획 — 직접입력 유지 + 자동 prefill(권장, 정확성 보존) vs (B) 공격적 — ⑤·⑦ 숨기고 전부 자동계산, 합산 회차는 별도 처리(입력 최소화하나 §58 일부 부정확). **기본은 (A).**
