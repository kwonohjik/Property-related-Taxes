# 상속세 세대생략 할증과세(§27) 자동 도출 — PDCA Plan

> **버그 보고**: "홍 손녀딸은 세대생략가산액 대상인데 이를 인식하지 못하는 버그" (이미지 = 상속세 종합사례 PDF 손녀 유증분 할증 30,232,198원)
> **Status**: Plan(완료) → Pre-Do anchor → Do(엔진→UI 시퀀셜) → Check → Act
> **Owner**: inheritance-gift-tax-senior(엔진) · inheritance-gift-tax-ui-senior(UI) — Plan 단계 병렬 검토 완료
> **Created**: 2026-06-01
> **연관 사례**: `docs/00-pm/inheritance-comprehensive-case.plan.md` (동일 종합사례, 손녀 정 30세 유증 5억)

---

## 1. 배경 — 버그 진단 (dual-truth 입력 구조)

세대생략 할증세액이 **서로 연결되지 않은 두 입력**에 의존하여, 상속인 입력 단계에서 손녀를 세대생략 대상으로 지정해도 산출에 반영되지 않는다.

| 경로 | 위치 | 역할 | 문제 |
|---|---|---|---|
| **A. 산출** | `lib/tax-engine/inheritance-tax.ts:531-540` (STEP 9) | 전역 `input.isGenerationSkip` + `input.generationSkipAssetAmount`(수동)로 할증 **금액·존재** 결정 | `heirs[].isGenerationSkipBeneficiary` 미참조 |
| **가드** | `lib/tax-engine/inheritance-gift-common.ts:92` | `if (!isGenerationSkip) return 0` | 전역 토글 OFF → 즉시 0 |
| **B. 배부** | `lib/tax-engine/inheritance-allocation.ts:480-482` | `heir.isGenerationSkipBeneficiary ? generationSkipSurcharge : 0` | A에서 0이면 0 배부 |

- **자동 도출 코드 부재**: `isGenerationSkipBeneficiary=true` 수유자의 유증액 → `generationSkipAssetAmount`, 존재 → `isGenerationSkip=true`로 잇는 로직 전무. `lib/calc/inheritance-api.ts:84-86`은 그대로 통과만.
- **설정 UI 부재**: `isGenerationSkipBeneficiary`를 켜는 체크박스가 `HeirComposition.tsx`에 없음. write 지점은 fixture·Zod 스키마뿐.
- **fixture가 dual-truth 은폐**: `__tests__/.../fixtures/comprehensive-case-pdf.fixture.ts`가 손녀 플래그(line 88)와 전역 `isGenerationSkip:true`(446)·`generationSkipAssetAmount:500M`(448)을 **모두 하드코딩** → 테스트는 통과하나 실제 UI는 둘을 못 이음.
- **요약표는 이미 손녀 플래그를 단일 진실로 사용**: `lib/calc/heir-allocation-summary.ts:128` `hasGenerationSkip = heirs.some(h => h.isGenerationSkipBeneficiary === true)` — **산출 엔진만 전역 토글을 봄** (일관성 결여).

### 1.1 검토 중 발견한 추가 구조 버그 — 복수 수유자 이중과세

`inheritance-allocation.ts:480-482`가 글로벌 합계 `generationSkipSurcharge`를 세대생략 수유자 **각각에 전액 배부**한다. 손자+손녀 2명이면 **합계의 2배**가 배부된다. 현재 이미지(손녀 1명)에선 미발현이나, 자동 도출로 손녀를 정상 인식시키면 이 경로가 활성화되므로 **per-heir 독립 계산으로 함께 전환**한다.

---

## 2. 목표 · 범위

### 2.1 목표
상속인 입력 단계의 `isGenerationSkipBeneficiary`를 **단일 진실(single source of truth)**로 삼아, 세대생략 할증의 산출·배부·요약·결과 표시를 하나의 소스에서 일관되게 도출한다.

### 2.2 범위 (1안 — 완전, per-heir 포함)

| 포함 | 항목 |
|---|---|
| ✅ | 엔진 내부 자동 도출 (`isGenerationSkip`·`generationSkipAssetAmount`·`isMinorHeir`를 `heirs`에서 도출) |
| ✅ | per-heir 독립 계산 — 복수 수유자 이중과세 수정 |
| ✅ | 미성년 자동 판정 (수유자 생년월일 → 상속개시일 기준) + 수동 override |
| ✅ | 분자 = 직접 유증·상속분 + §13 cutoff 내 사전증여 (per-heir) |
| ✅ | `generationSkipSurchargeDetail` 엔진 return 추가 → 결과 화면 수유자별 산식 카드 |
| ✅ | HeirComposition `legatee` 행에 세대생략 체크박스 + 생년월일 |
| ✅ | 전역 세대생략 섹션 제거 + `steps.tsx`/`step4-5.tsx` 중복 정리 |
| ✅ | 전역 3필드 deprecated + 레거시 fallback (sessionStorage 호환) |

### 2.3 범위 밖 (별도 트랙)

| 제외 | 사유 |
|---|---|
| ⛔ 대습상속 §27 단서 (민법 §1001) | `Heir.relation` enum에 대습상속 구분 없음. 이미지(유증) 무관. relation enum 확장은 별도 PR |
| ⛔ 분모(§27 안분 분모) 변경 | `nonHeirNonLegateeGifts`로 8,075M = 8,775M − 700M 이미 정확 (anchor `PRE-3`·`G-02` 통과). **손대지 않음** |

---

## 3. 법령 근거 — §27 (KoreanLaw MCP 본문 실측)

### 3.1 상증법 §27 (2026-01-02 시행)
> 상속인이나 수유자가 피상속인의 자녀를 제외한 직계비속인 경우에는 제26조에 따른 상속세산출세액에 **상속재산(제13조에 따라 상속재산에 가산한 증여재산 중 상속인이나 수유자가 받은 증여재산을 포함한다)** 중 그 상속인 또는 수유자가 **받았거나 받을 재산**이 차지하는 비율을 곱하여 계산한 금액의 **100분의 30**(미성년자에 해당하는 상속인·수유자가 받았거나 받을 상속재산의 가액이 **20억원을 초과**하는 경우에는 **100분의 40**)에 상당하는 금액을 가산한다. **다만, 「민법」 제1001조에 따른 대습상속의 경우에는 그러하지 아니하다.**

### 3.2 분자 정의 — 확정

| 구성 | 포함 | 근거 |
|---|---|---|
| 직접 유증·상속분 (`estateByHeir`) | **포함** | "받았거나 받을 재산" |
| §13 가산 증여재산 중 해당 수유자 수령분 (`amountByDonee`) | **포함** | 괄호문 "제13조에 따라 가산한 증여재산 중 상속인·수유자가 받은 증여재산 포함" |
| §13 cutoff(상속인 10년·비상속인 5년) 경과 증여 | **제외** | §13 미가산 → 괄호 범위 밖 |
| 영리법인 수령 사전증여 | **제외** | 직계비속 아님 |

- 채무 차감 **전** 총 수령액 기준 ("받았거나 받을 재산").
- 시행령 위임 문구 없음 — 본칙이 최종.

### 3.3 이미지 케이스 검증
```
손녀 분자 = estateByHeir(500M) + amountByDonee(0) = 500,000,000
분모 = taxableEstateValue − nonHeirNonLegateeGifts = 8,775M − 700M = 8,075M
할증 = floor(1,627,500,000 × 500,000,000 / 8,075,000,000 × 0.30) = 30,232,198 ✓
```

---

## 4. 케이스 인벤토리

| # | 케이스 | 분자 | 할증율 | 현행 동작 | 목표 동작 |
|---|---|---|---|---|---|
| C-1 | 수유자 1명, 사전증여 없음 (이미지) | estateByHeir 500M | 30% (30세) | 전역 수동 ON + 금액 입력 시에만 정상 | 손녀 플래그 자동 도출 → 30,232,198 |
| C-2 | 수유자 1명 + §13 내 사전증여 | estate + gift | 30/40% | 사전증여분 분자 누락 가능 | gift 합산 |
| C-3 | **세대생략 수유자 복수** (손자+손녀) | 각자 분리 | 손자 미성년 40% / 손녀 30% | **글로벌 합계를 각자 전액 배부 → 이중과세** | per-heir 독립 계산 |
| C-4 | 세대생략 수유자가 직계비속 상속인 | estateByHeir | 30/40% | 동일 버그 | **엔진은 relation 무관**하게 `isGenerationSkipBeneficiary` 플래그만으로 지원 (R8). **UI 체크박스 노출만 `legatee` 한정** — `child`로 등록된 손자녀(대습 외)는 별도 트랙(§12) |
| C-5 | 플래그 true, 받은 재산 0 | 0 | — | 글로벌 할증>0 시 오배부 가능 | 분자 0 → 할증 0 (자동 보호) |
| C-6 | 대습상속 | 제외 | — | relation 미구분 | **범위 밖** (후속) |

> Do 진입 전 본 표의 모든 행이 채워져 있어야 함 (CLAUDE.md Design 게이트). C-6은 명시적 제외.

---

## 5. 엔진 설계 (inheritance-gift-tax-senior)

### 5.1 도출 위치 — 엔진 내부 (실행 순서 결함 정정 · R1)

> ⚠️ **실측 정정 (R1 Critical)**: 분자 소스 `estateByHeir`(`inheritance-allocation.ts:308`)·`amountByDonee`(`:242`)는 `calcHeirAllocation` **내부**에서만 계산된다. 그런데 세대생략 할증은 **STEP 9**(`inheritance-tax.ts:520`)에서, 배부는 **STEP 13**(`:664`)에서 실행되어 **STEP 9 시점에 두 Map이 아직 존재하지 않는다**. 따라서 "STEP 9에서 재집계"(초안)는 allocation과 **동일 로직 중복 → 드리프트 위험**.

**정정 설계 — 집계 헬퍼 분리 + STEP 8.5 신설**:
1. `inheritance-allocation.ts`의 heir별 집계 로직을 **신규 순수 export 헬퍼**로 분리 (I1 — 디자인과 명칭 통일):
   - `aggregateEstateByHeir(estateItems, valuatedAmountById, legalShares)` — 기존 `resolveAllocationsByHeir(estateItems, valuated클로저, legalShares)` 래핑 (`allocation:308`)
   - `aggregatePriorGiftByDonee(cutoffFilteredGifts)` — 기존 `sumPriorGiftsByDonee(...).amountByDonee` 래핑 (`allocation:242`)
2. `inheritance-tax.ts`에 **STEP 8.5**(산출세액 직후·STEP 9 직전) 신설 — 분리 헬퍼를 호출해 `estateByHeir`/`amountByDonee`를 **선집계**.
   - **입력 가용성 확정 (S4)**: `legalShares = computeLegalShares(input.heirs)`는 heirs만 입력 → STEP 8.5에서 self-contained 호출 가능 (`inheritance-allocation.ts:294` 동일). `computeLegalShares`는 순수함수로 다회 호출 무해(S5: 1회 계산 후 STEP 13과 공유 권장).
   - **cutoff 필터 끌어올림 (S2)**: 현재 `cutoffFilteredGifts = preGifts.filter(isWithin13Cutoff)`가 STEP 13 내부(`tax:686`)에만 정의. → **STEP 4 직후~STEP 8.5 이전으로 끌어올려** STEP 8.5·STEP 9·STEP 13이 동일 집합 공유. `amountByDonee`는 이 cutoff 필터 증여 기반이므로 §27 분자 "§13 가산 증여재산 중" 정합 (S3 확정, `allocation:242`·`tax:686→698`).
3. STEP 9(할증)와 STEP 13(`calcHeirAllocation`)이 **동일 집계 결과를 공유** → 단일 진실, 중복 계산·드리프트 제거.

**근거**: 엔진 내부 도출이면 ⓐ fixture 직접 호출 경로까지 자동 커버 ⓑ 클라이언트 법정상속분 재현 불필요 ⓒ 모든 호출처가 단일 진실 공유. `lib/calc/inheritance-api.ts` API 변환(④)·route(⑭)는 전역 필드 **레거시 fallback만** 통과시키고, 자동 도출 주체는 엔진.

> 의존 방향: `inheritance-tax.ts → inheritance-allocation.ts`는 이미 `calcHeirAllocation` import로 존재(단방향 유지). 집계 헬퍼 추가 export는 순환 없음.

### 5.2 자동 도출 산식
```
isGenerationSkip(derived) = input.isGenerationSkip            // 레거시 명시값 우선 (deprecated)
                          || heirs.some(h => h.isGenerationSkipBeneficiary === true)

genSkipNumerator(heir) = (estateByHeir.get(heir.id) ?? 0)     // 직접 유증·상속분 (STEP 8.5 선집계)
                       + (amountByDonee.get(heir.id) ?? 0)    // §13 cutoff 내 사전증여 (STEP 8.5 선집계)
```
- 분자 소스는 **STEP 8.5에서 선집계한 Map**을 STEP 9·STEP 13이 공유 (5.1 정정 참조).

### 5.3 per-heir 독립 계산 (C-3 이중과세 수정)
```
for each heir where isGenerationSkipBeneficiary(or 레거시 전역):
  numerator_i  = genSkipNumerator(heir)
  isMinor_i    = resolveMinor(heir, deathDate)        // 5.4
  rate_i       = isMinor_i && numerator_i > 20억 ? 0.40 : 0.30
  surcharge_i  = floor(computedTax × numerator_i / adjustedDenominator × rate_i)   // 개별 단일 floor

generationSkipSurcharge(total) = Σ surcharge_i
perHeirSurcharge[heir.id]      = surcharge_i          // 배부에 직접 사용
```
- **배부 인터페이스 변경 (S1 Critical)**: `calcHeirAllocation`은 현재 `generationSkipSurcharge`(스칼라)를 params로 받아(`tax:709`) `allocation:480`에서 `heir.isGenerationSkipBeneficiary ? generationSkipSurcharge : 0`로 배부한다. per-heir 전환 시:
  - `HeirAllocationParams`에 `perHeirSurcharge?: Record<string, number>` 추가 (기존 `generationSkipSurcharge` 스칼라는 합계용으로 유지 — STEP 12 결정세액·요약).
  - STEP 13 호출(`tax:698`)에서 STEP 9가 생성한 `perHeirSurcharge` Map 전달.
  - `allocation:480-482`: `surchargeForHeir = perHeirSurcharge?.[heir.id] ?? (heir.isGenerationSkipBeneficiary ? generationSkipSurcharge : 0)` — perHeirSurcharge 있으면 per-heir, 없으면(레거시 단일) 기존 글로벌 배부 fallback.
- **floor 정책 (R4)**: §27은 "그 상속인 또는 수유자가" 개별 기준이므로 per-heir **각자 단일 floor** 후 합산. 단일 수유자(이미지)는 기존 단일 floor와 **동일**(anchor 30,232,198 불변). 복수 수유자는 Σfloor(per-heir)가 법령 정합. `computedTax × numerator_i × rate_i` 곱셈 우선 후 `/ adjustedDenominator` 단일 floor (소수오차 방지, `inheritance-gift-common.ts:130` 패턴 유지).
- **레거시 단일 모드 (R9)**: 전역 `generationSkipAssetAmount`만 주어지고 heir 플래그 없으면 기존 단일 분자 경로 유지. `calcGenerationSkipSurcharge` **기존 시그니처 보존**(per-heir는 신규 호출 경로 또는 옵셔널 인자) → 테스트 호출처 2곳(`__tests__/tax-engine/tax-credit.test.ts:316`·`comprehensive-case-pre.test.ts:97`) 하위호환.

### 5.4 미성년 자동 판정 + override (3-state)
```
resolveMinorBeneficiary(heir, deathDate):   // I2 — 디자인과 명칭 통일
  if heir.isMinorOverride != null:  return heir.isMinorOverride   // 수동 우선 (연령 기준 개정 대비)
  if heir.birthDate:                return differenceInYears(deathDate, birthDate) < 19
  return false
```
- **법령 기준 (R6)**: §27② "미성년자"는 민법 §4(2013개정, 만 19세로 성년) 기준 — 상속개시일 현재 만 19세 미만. 상증법 §20①(미성년자 인적공제)의 "19세" 기준과 동일.
- 신규 필드 `Heir.isMinorOverride?: boolean` (3-state: `undefined`=자동, `true/false`=수동). 전역 `isMinorHeir`는 deprecated.
- 연령 산정 헬퍼: `differenceInYears`(date-fns) — `inheritance-gift-common.ts:11`에 **이미 import 중**. skill `single-source-engine-helper`.

### 5.5 결과 표시용 per-heir Detail return 추가 (신규 타입 · R2 정정)

> ⚠️ **실측 정정 (R2 Critical)**: 기존 `GenerationSkipSurchargeDetail`(`inheritance-gift.types.ts:430`)은 **증여세 §57 전용** 구조(`surchargeCreditLimit`·`priorAdditionalCumulative`·`priorSurchargeCredit` 등 사전증여 회차 누계·한도 안분 ⑧~⑬)다. 상속세 §27 per-heir 안분과 **무관** → 재사용 금지. `InheritanceTaxResult.generationSkipSurchargeDetail`(`:1065`)이 이 증여세 타입을 참조 중인 것도 정정 대상.

**신규 타입** `InheritanceGenerationSkipDetail`:
```ts
interface InheritanceGenerationSkipHeirRow {
  heirId: string;
  heirName?: string;          // 결과 표시 (내부 id 노출 금지 — feedback_no_internal_id_in_result)
  numerator: number;          // genSkipNumerator(heir) = 유증·상속분 + §13내 사전증여
  rate: number;               // 0.30 / 0.40
  isMinor: boolean;
  surcharge: number;          // floor 적용 개별 할증액
}
interface InheritanceGenerationSkipDetail {
  denominator: number;        // adjustedDenominator (taxableEstate − 영리법인 사전증여)
  computedTax: number;        // 산출세액 (할증 전)
  rows: InheritanceGenerationSkipHeirRow[];
  total: number;              // Σ surcharge
}
```
- `inheritance-tax.ts` return에 `generationSkipDetail: InheritanceGenerationSkipDetail | null` 추가 (기존 `generationSkipSurcharge` 숫자 필드는 유지).
- skill `echo-field-pattern` — 산식 변경 없이 per-heir 중간값 노출.
- 결과 화면 카드(7.4)는 본 신규 타입 기반 **상속세 전용 카드** (증여세 카드 패턴만 차용, 직접 재사용 아님 — R3).

---

## 6. UI 설계 (inheritance-gift-tax-ui-senior)

### 6.1 HeirComposition 체크박스 노출 매트릭스
| relation | 라벨 | §27 대상 | 처리 |
|---|---|---|---|
| `legatee` | 수유자 | **핵심 경로** (손자녀 유증) | **체크박스 노출** |
| `child` | 자녀 | 아님 ("자녀를 제외") | 비노출 |
| `spouse`·`lineal_ascendant`·`sibling`·`other` | — | 아님 | 비노출 |
| `corporate` | 법인 | 아님 (`changeHeirRelation:105` undefined 처리) | 비노출 |

- `legatee` 행에: ① 생년월일 `DateInput` ② `isGenerationSkipBeneficiary` ToggleCard (rose tone) "§27 세대생략 할증 대상 — 자녀를 건너뛴 직계비속 유증(손자녀 등)".
- **`showBirthDate` 조건 확장 — 2곳 (R5)**: legatee가 현재 양쪽 모두 미포함이므로 둘 다 추가.
  - `changeHeirRelation` 내부 (`HeirComposition.tsx:95-98`) — 관계 변경 시 birthDate 보존 판정
  - 렌더부 `showBirthDate` (별도 위치, `legatee` 미포함) — birthDate 입력 위젯 노출
  - 둘 중 하나만 고치면 관계 변경 시 birthDate가 침묵 제거되거나 입력칸 미노출 → 반드시 동시 수정.
- 현재 718줄 → +20~30줄, 800줄 정책 여유.

### 6.2 미성년 override UX (3-state)
- 생년월일 입력 시 자동 판정 결과를 라벨로 표시: "상속개시일 기준 미성년자 (자동: 예/아니오)".
- ToggleCard로 수동 override 가능 (`isMinorOverride`). 미설정 시 자동값 사용. memory `feedback_three_state_optional_mode_toggle` 패턴.

### 6.3 전역 섹션 제거 + 중복 정리
- `step4-5.tsx:322-357` + `steps.tsx:455-484` (동일 UI 2곳) — `isGenerationSkip`·`isMinorHeir` ToggleCard **제거**.
- "세대생략 할증과세(§27)" 위치는 **read-only 안내 카드**로 전환: "상속인 등록 단계에서 세대생략 대상 체크 시 자동 적용". sky tone.
- `generationSkipAssetAmount` 수동 칸은 per-heir 자동 집계로 **불필요** → 제거 (전역 deprecated fallback은 normalize에만 잔존).
- **중복 렌더 경로 단일 출처화**: `steps.tsx`/`step4-5.tsx` 중 실제 렌더 경로 확인 후 일원화 (확인 필요 항목).

### 6.4 결과 화면 수유자별 산식 카드 (상속세 전용 신규 · R3)

> ⚠️ **정정 (R3 High)**: `GenerationSkipSurchargeBreakdownCard`(`components/calc/results/`)는 §57 **증여세 전용**(GiftTaxResultView만 사용, ⑧~⑬ 누계 구조). 상속세 per-heir 안분과 구조가 달라 **직접 재사용 불가** → 패턴(변수 배지·펼침·접근성)만 차용한 **상속세 전용 카드 신규**.

- 신규 `InheritanceGenerationSkipDetailCard` — `InheritanceGenerationSkipDetail`(5.5) 기반, `InheritanceTaxResultView`에 추가.
- 표시 (수유자별 행): "손녀(정) 유증분에 대한 할증 = 산출세액 1,627,500,000 × (500,000,000 / 8,075,000,000) × 30% = 30,232,198". skill `formula-display-builder` — 변수 배지 + 한국어 산식. 수유자 이름은 `heirName.trim() || CATEGORY_LABEL`(내부 id 노출 금지 — `feedback_no_internal_id_in_result`).
- `HeirAllocationTable`의 수유자 열 "세대생략 할증" 행은 현행 유지 (per-heir 배부값 표시).

---

## 7. 전역 필드 deprecated + 레거시 fallback

| 필드 | 처리 |
|---|---|
| `isGenerationSkip` | 타입 optional 잔존. 엔진: `명시값 ?? heirs.some(...)`. |
| `isMinorHeir` | 타입 optional 잔존. per-heir `isMinorOverride`로 대체, 전역값은 레거시 fallback. |
| `generationSkipAssetAmount` | 타입 optional 잔존. heir 플래그 있으면 자동 집계, 없으면 레거시 단일 분자. |

- **3중 패턴**(memory `mirror-pattern`): UI display fallback ↔ API 변환 fallback ↔ validate fallback 동일 기준. `useEffect→store` 미러링 금지.
- sessionStorage 구 데이터: legatee `isGenerationSkipBeneficiary` 미설정 시 전역값 그대로 사용 → 기존 이력 결과 불변.

---

## 8. 동기화 지점 매핑 (CLAUDE.md 8/14지점)

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `Heir`(`inheritance-gift.types.ts`) | `isMinorOverride?` 추가. `isGenerationSkipBeneficiary` 기존. 전역 3필드(`shared.ts:62-64`) optional 유지 |
| ② initial | `shared.ts:98-100` | 변경 없음 |
| ③ normalize | sessionStorage 복원 | 레거시 전역 fallback 보존 |
| ④ API 변환 | `lib/calc/inheritance-api.ts:84-86` | 전역값 통과 유지. 자동 도출은 엔진이 수행 |
| ⑤ UI 위젯 | `HeirComposition.tsx` / `step4-5.tsx`·`steps.tsx` | legatee 체크박스+birthDate 추가 / 전역 섹션 제거 |
| ⑥ 사이드바 | — | 변경 없음 (결과 도착 후 표시) |
| ⑦ 결과 카드 | `InheritanceTaxResultView` | 세대생략 Detail 카드 추가 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | **실측 확정 (R7)**: 현재 세대생략 관련 검증 **없음**. 자동 도출로 dual-truth 모순이 사라져 추가 검증 불필요. `birthDate`/`isMinorOverride`는 optional이라 필수 검증 없음 |
| ⑨~⑭ Zod·route | `property-valuation-input.ts:495` / `route.ts:87-89` | `isMinorOverride` Zod 추가. 전역 3필드 optional 유지 |

---

## 9. Pre-Do anchor 설계 (skill `pre-do-anchor-verification`)

> Do 진입 전 **anchor A를 먼저 작성·실행하여 실패(0원)를 실증**한 뒤 구현 시작.

- **Anchor A (핵심)**: `EXAMPLE_INPUT`에서 전역 3필드(446-448) 제거, 손녀 `isGenerationSkipBeneficiary:true` + heirAllocations 500M만 유지 → `result.generationSkipSurcharge === 30_232_198`. **현재 0 (버그 실증) → 구현 후 PASS.**
- **Anchor B (이중과세 · I4 정정)**: 손자(6세, 플래그, **21억**=20억 초과) + 손녀(30세, 플래그, 5억), denom 충분히 크게 → 손자 40%·손녀 30% 각자 분리 floor. 현재 글로벌 2배 배부 → 수정 후 정상. (40%는 개인재산 20억 초과 필요 — D1)
- **Anchor C (사전증여 합산 · I4 정정)**: 손녀(legatee=비상속인) 플래그 + 유증 300M + **사망 5년 내** §13 가산 증여 100M(doneeId=손녀) → 분자 400M. 현재 100M 누락 → 수정 후 포함.
- **Anchor D (미성년 override)**: 생년월일로 미성년 자동 판정 + `isMinorOverride`로 덮어쓰기 → 할증율 전환 검증.
- **Anchor E (C-5 보호 · I3 추가)**: `isGenerationSkipBeneficiary:true`이나 받은 재산 0(heirAllocations·사전증여 없음) → 분자 0 → 할증 0 (오배부 없음).

---

## 10. 회귀 영향

| 테스트 | 세대생략 입력 | 예측 | 조치 |
|---|---|---|---|
| `comprehensive-case-pdf.test.ts` (G-02·I-21) | EXAMPLE_INPUT 전역 3값 + 손녀 플래그 | 전역값 제거 후 자동 도출로 동일 30,232,198 | fixture 전역 3필드 제거, anchor A로 대체 |
| `comprehensive-case-pre.test.ts` (PRE-3) | `calcGenerationSkipSurcharge` 직접 호출 | 함수 시그니처 하위호환 시 유지 | per-heir 추가 시 단일 경로 보존 |
| `heir-allocation-summary-table.test.ts` (AN-4) | 이미 heir 플래그 기반 | 영향 없음 | 유지 |
| `case-2-generation-skip.test.ts` | (증여세) | 무관 | 유지 |
| 기타 `isGenerationSkip:false` fixtures | 명시 false | false + 플래그 없음 → 0 | optional 화로 통과 |

- **커밋 전 전체 `npm test`** (공유 모듈·종부세→재산세 의존). 개발 중 `npx vitest run __tests__/tax-engine/inheritance*`.

---

## 11. 작업 분담 — Plan 병렬(완료) / Do 시퀀셜

1. **Plan/Design** ✅ — 엔진·UI 시니어 병렬 검토 완료 (본 문서).
2. **Pre-Do** — anchor A 작성·실패 확인 (엔진 시니어).
3. **Do (시퀀셜)**:
   - **엔진 시니어 선처리**: 타입(`isMinorOverride`·`GenerationSkipSurchargeDetail` return) → per-heir 도출·계산(STEP 9) → allocation 배부 전환 → `differenceInYears` 미성년 헬퍼 → anchor A~D.
   - **UI 시니어 후속**: HeirComposition 체크박스+birthDate+override → 전역 섹션 제거·중복 정리 → 결과 Detail 카드 → validate fallback.
4. **Check** — `ui-engine-sync-checker`(read-only) → `bkit:gap-detector`(matchRate) → 브라우저 E2E (`feedback_browser_verify_with_playwright`).
5. **Act** — 회귀 후속·디자인 환류·memory 기록.

---

## 12. 별도 트랙 (후속)

| 항목 | 내용 |
|---|---|
| 대습상속 §27 단서 | `Heir.relation` enum에 대습상속 구분 추가 → 단서 제외 처리 |
| 직계비속 상속인(legatee 외) | `child`/`other`로 등록된 손자녀의 §27 — relation 표현 정비 후 |

---

## 13. Definition of Done

- [ ] 케이스 매트릭스(§4) 전 분기 enumerate — C-1~C-5 구현, C-6 명시 제외
- [ ] Pre-Do anchor A 실패 확인 후 구현
- [ ] anchor A~D 작성·PASS
- [ ] 8/14 동기화 지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화 (전역 deprecated 필드)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance*` 통과 + 커밋 전 전체 `npm test`
- [ ] 결과 화면 수유자별 산식 카드 표시 (30,232,198 + 산식)
- [ ] 브라우저 E2E (손녀 등록 → 체크 → 결과 할증 자동 반영)
