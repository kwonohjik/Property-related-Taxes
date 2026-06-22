# UI 설계 — 증여세 부분 대납(代納): 수증자 일부 납부 + 증여자 부족분 대납

> **Feature**: 기존 "증여자 전액 대납 gross-up"(PR#323)을 확장 — 수증자가 증여세 중 일부(`P`)를
> 본인 부담으로 납부하고, 부족한 나머지 `(T − P)`만 증여자가 대납하는 경우를 계산.
>
> **계획서**: `docs/00-pm/gift-donor-partial-paid-tax.plan.md`
> **엔진 설계**: `docs/02-design/features/gift-donor-partial-paid-tax.engine.design.md`
> **기반 UI 설계**: `docs/02-design/features/gift-donor-paid-tax-grossup.ui.design.md` (PR#323 — 참조)
> **작성일**: 2026-06-22
> **상태**: Design (Do 미착수)
> **법령 검증**: 엔진 설계서 §법령근거 KoreanLaw MCP 검증 준용 (MST 276123 시행 20260102 / MST 283637 시행 20260227)

---

## 0. 전제 — 실측 구조 요약

PR#323(전액 대납 gross-up)이 이미 구현되어 있다. 본 기능은 **신규 입력 필드 1개**(`doneePaidGiftTax`)와
**결과 카드 행 2개 추가**·**라벨 1개 정밀화**만 수반하는 최소 확장이다.

### 현행 구현 파일 (실측 확인)

| 파일 | 역할 | 기존 구현 상태 |
|---|---|---|
| `components/calc/gift-tax-form-shared.tsx` | `FormState`(:106~111) · `INITIAL_FORM`(:137~138) · `validateStep`(:504~518) | donorPaysGiftTax·donorHasJointLiability 구현 완료 ✅ |
| `components/calc/gift/GiftCreditChecklist.tsx` | 대납 ToggleCard(:183~204) 구현 완료 | 수증자 납부액 CurrencyInput 미존재 — **추가 필요** |
| `lib/calc/gift-api.ts` | `buildGiftTaxInput`(:109~110) — donorPaysGiftTax·donorHasJointLiability 명시 키 완료 | doneePaidGiftTax 미추가 — **추가 필요** |
| `lib/validators/property-valuation-input.ts` | Zod giftTaxInputSchema(:493~571) + superRefine 완료 | doneePaidGiftTax Zod 필드 미추가 — **추가 필요** |
| `components/calc/results/GiftTaxResultView.tsx` | donorPaidTaxGrossUp 섹션(:568~606) 구현 완료 | totalGiftTax·doneePaidTax 행 미추가 — **추가 필요** |
| `lib/tax-engine/types/inheritance-gift.types.ts` | GiftTaxResult.donorPaidTaxGrossUp 타입 | doneePaidTax?·totalGiftTax? 미추가 — **엔진 담당** |

### 현행 갭 (본 기능에서 추가해야 할 것)

- `FormState`에 `doneePaidGiftTax: string` 필드 없음
- `INITIAL_FORM`에 `doneePaidGiftTax: ""` 없음
- `GiftCreditChecklist.tsx`에 수증자 본인 납부액 CurrencyInput 없음 (노출 조건: 대납 ON + 연대의무 OFF)
- `gift-api.ts` return 객체에 `doneePaidGiftTax: parseAmount(...)` 없음
- Zod에 `doneePaidGiftTax: z.number().min(0).optional()` 없음
- `GiftTaxResultView.tsx` gross-up 섹션에 ②총 결정세액·③수증자 본인 납부 행 없음
- 기존 ② 라벨 "대납세액 (gross-up 수렴값)" → "증여자 대납분 (총세액 − 수증자 납부)" 정밀화 필요

---

## 1. 사용자 시나리오

### S-1. 기본 케이스 — 부분 대납 (A-2)

1. Step 0: 증여일 입력, 직계존속(부/모 등) 선택.
2. Step 1: 증여재산 입력 (예: 현금 500,000,000원).
3. Step 3(공제·세액공제):
   - "증여자가 수증자의 증여세를 대납(代納)합니까?" → **ON**.
   - 연대납세의무 → **OFF** (비연대).
   - [신규] "수증자 본인 납부액 (원)" → **50,000,000** 입력.
4. 계산 클릭 → 결과 화면:
   - gross-up 섹션에 5행 표시:
     - 원본 증여세 과세가액(§53 공제 전): 500,000,000
     - **총 결정세액** (T*): 84,243,176 ← 신규
     - **수증자 본인 납부**: 50,000,000 ← 신규
     - 증여자 대납분 (총세액 − 수증자 납부): 34,243,176
     - gross-up 후 최종 과세표준: 534,243,176

### S-2. 경계 케이스 — 수증자 납부액 ≥ 총세액 (A-3)

- 수증자 납부액 200,000,000 입력 (baseline 77,600,000 초과)
- 결과: 증여자 대납분 = 0. "수증자가 전액 부담(재차증여 없음)" 안내.
- gross-up 섹션은 표시하되 대납분 0·V* = A.

### S-3. P = 0 회귀 케이스 — 수증자 납부액 미입력 또는 0 (A-1)

- `doneePaidGiftTax` 미입력 = 기존 전액 대납과 완전 동일.
- 결과 카드: ③행(수증자 본인 납부) 미노출(P=0), ② 총 결정세액 = ④ 증여자 대납분 = 동일 금액.

### S-4. 차단 조합 (기존 차단 계승, 입력값 관계없음)

기존 3조합 차단(동시증여·2-스트림·세대생략)은 `doneePaidGiftTax`와 무관하게 동일하게 적용.
차단 시 `doneePaidGiftTax` 입력 칸이 렌더되더라도 validateStep에서 오류 반환.

---

## 2. 케이스 매트릭스 (법령 단서·각호 전수 enumerate)

§36①(채무변제 증여)·§4의2⑥(본문+단서+1~3호)·§69②(신고세액공제) 전수 열거 후 케이스화.
기존 C-1~C-12(PR#323)는 doneePaidGiftTax 미입력 = P=0 케이스로 회귀 대상.

| # | 시나리오 | 법령 근거 | 수증자 납부 P | 증여자 대납 D | UI 거동 | anchor 기대값 |
|---|---------|----------|:---:|:---:|---|---|
| A-1 | **회귀**: P = 0 (미입력 / 0) → 기존 전액 대납과 동일 | §36① | 0 | T* | ③행 미노출, ②=④ | donorPaidTax===102,609,309 ±1 |
| A-2 | **부분 대납**: 5억 / 공제 5천만 / P=5천만 / 비연대 / 신고기한 내 | §36①·§69② | 50,000,000 | 34,243,176 | ②③④⑤ 5행 표시 | donorPaidTax===34,243,176 ±1, totalGiftTax===84,243,176 ±1 |
| A-3 | **경계**: P ≥ T* (P=200,000,000, baseline 77,600,000 초과) | §36① max(0) 게이트 | 200,000,000 | 0 | applied=true·D=0·"재차증여 없음" 안내 | donorPaidTax===0, totalGiftTax===77,600,000 ±1 |
| A-4 | **회귀**: 대납 OFF — 기존과 동일 | — | — | — | 입력 칸 미노출, 기존 결과 | 기존 C-1~C-12 전부 무변경 |
| A-5 | **회귀**: 연대의무 ON → gross-up 미적용, P 무시 | §4의2⑥ | (무시) | — | ③행 미렌더, applied=false | applied===false, reasonNotApplied==="joint_liability" |
| A-6 | **경계**: P = baseline 정확히 일치 (±1원) | §36① max(0) 게이트 | baseline | 0 or ±1 | applied=true·D=0 | donorPaidTax===0 ±1 |
| A-7 | **사전증여 동반 + 부분 대납** (C-6 확장) | §47②·§36①·§58① | 50,000,000 | — | 수렴 자기일관성 확인 | grossedUpNetGift===A+D ±1 |
| A-8 | **음수 차단**: P = -1 (음수) | ⑧ validation / ⑫ Zod .min(0) | -1 | — | Zod 차단 + validateStep 오류 | Zod safeParse 실패 |

**규칙**: 행 ≥ 1 없으면 Do 진입 금지.

---

## 3. 14개 동기화 지점 매핑표

### 신규 필드 `doneePaidGiftTax` 전용 — 기존 `donorPaysGiftTax`·`donorHasJointLiability` 지점은 PR#323에서 완료

| 지점 | 파일 (실측 경로) | 변경 내용 | 담당 | 완료 기준 |
|---|---|---|---|---|
| ① 폼 상태 타입 | `components/calc/gift-tax-form-shared.tsx:111` (`FormState` interface) | `doneePaidGiftTax?: string` 추가 (`donorHasJointLiability` 아래). **프로젝트 규약상 모든 금액 폼 필드는 string** — CurrencyInput이 string 전용이므로 number 금지 | UI | tsc 0건 |
| ② initial value | `gift-tax-form-shared.tsx:138` (`INITIAL_FORM`) | `doneePaidGiftTax: ""` 추가 (`donorHasJointLiability: false` 아래). 빈 문자열 초기화 = 미입력 = P=0(전액 대납 기존 동작) | UI | — |
| ③ normalize | 증여 폼에 별도 normalize 함수 없음 (`normalizeRestoredFormDates`는 Date 전용). ② INITIAL_FORM 기본값으로 충족. | 변경 없음 | — | N/A |
| ④/⑬ API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxInput` return 객체 (:109 명시 키 목록) | `doneePaidGiftTax: parseAmount(form.doneePaidGiftTax) || undefined` 를 **명시 키**로 추가 (spread 아님 — `feedback_explicit_prop_mapping_strip`). 빈 문자열→parseAmount→0→`|| undefined`→엔진 `?? 0`(P=0 회귀). | UI | grep 자가 점검: doneePaidGiftTax가 return 객체에 parseAmount 변환과 함께 존재 |
| ⑤ UI 위젯 | `components/calc/gift/GiftCreditChecklist.tsx:183~204` (`donorPaysGiftTax` ToggleCard children 내부) | 노출 조건: `form.donorPaysGiftTax === true` AND `form.donorHasJointLiability !== true`. `CurrencyInput`에 `label="수증자 본인 납부액"` + `hideLabel`(aria-label 생성 → §12 getByLabel 매칭) 추가. 상세: §4절 | UI | E2E green |
| ⑥ 사이드바 합계 | N/A — 증여 마법사에 입력 사이드바 미존재 (실측: GiftTaxForm.tsx 단일 컬럼, sidebar 0건) | 해당 없음 | — | N/A |
| ⑦ 결과 카드 | `components/calc/results/GiftTaxResultView.tsx:578~606` (기존 gross-up 섹션) | 기존 3행을 5행으로 확장 + ④행 라벨 정밀화. 상세: §5절 | UI | E2E 결과 카드 표시 확인 |
| ⑧ validation | `gift-tax-form-shared.tsx:504` (`validateStep`, `donorPaysGiftTax === true` 분기 내부) | 음수 차단: `parseAmount(form.doneePaidGiftTax) < 0`이면 오류 반환. 대납 OFF 시 무시. string 직접 비교 금지(타입 오류·의도 불일치). | UI | tsc 0건 + A-8 anchor |
| ⑨ Zod enum | N/A (boolean/number, enum 해당 없음) | — | — | — |
| ⑩ Zod enum 컴패니언 | N/A | — | — | — |
| ⑪ acquisitionDate fallback | N/A | — | — | — |
| ⑫ **Zod 입력 객체** | `lib/validators/property-valuation-input.ts:526` (`donorHasJointLiability` 직후, `deductionInput` 위) | `doneePaidGiftTax: z.number().min(0).optional()` 추가. **기존 superRefine 유지** (3조합 차단 로직 불변). | 엔진 | tsc 0건 + Zod safeParse 확인 |
| ⑬ **명시 반환 객체** | `lib/calc/gift-api.ts:109` | ④와 동일 함수 — 명시 키 추가 (grep 자가점검 필수) | UI | grep 확인 |
| ⑭ **Route handler** | `app/api/calc/gift/route.ts:64` | route는 `parsed.data` 통째 cast 후 엔진 전달 → ⑫ Zod 통과 시 자동 전달됨. **변경 없음.** | — | — |
| result 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:751` | `doneePaidTax?: number`·`totalGiftTax?: number` 2필드 추가 + `donorPaidTax` JSDoc 정밀화 — **엔진 담당** | 엔진 | tsc 0건 |

⚠️ **⑫⑬⑭ TypeScript 미감지** → grep 자가 점검 필수 (`feedback_api_zod_schema_sync`).

---

## 4. UI 위젯 상세 설계 — ⑤ 지점 (`GiftCreditChecklist.tsx`)

### 4-1. 배치 위치 및 순서

엔진 계산 순서 = UI 순서 원칙:

- G-0(게이트: donorPaysGiftTax·donorHasJointLiability) → G-1(baseline) → G-2(반복 수렴, doneePaid 사용)
- `doneePaidGiftTax`는 G-2 반복식의 입력값이므로, 연대의무 하위 ToggleCard(G-0 2번째 게이트) 바로 아래에 배치.
- 엔진 계산 순서: (게이트) → (수증자 납부액 확정) → (반복 수렴) → 결과

### 4-2. 수증자 본인 납부액 입력 위젯

**배치**: `GiftCreditChecklist.tsx` 기존 대납 ToggleCard의 children 내부 — 연대의무 ToggleCard(`:192~204`) **아래**에 추가.

**노출 조건**: `donorPaysGiftTax === true` (ToggleCard children이므로 부모 ON 시 자동 렌더) **AND** `donorHasJointLiability !== true` (연대 ON이면 gross-up 미적용이라 입력 무의미 → 숨김).

```tsx
{/* 연대납세의무 ToggleCard 아래 — donorHasJointLiability !== true 일 때만 노출 */}
{form.donorHasJointLiability !== true && (
  <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20 p-3 space-y-2">
    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
      수증자 본인 납부액 (§36)
    </p>
    <p className="text-xs text-violet-600 dark:text-violet-400">
      수증자가 직접 납부하는 증여세액을 입력하세요. 증여자는 총세액에서 이 금액을 차감한
      나머지(부족분)만 대납합니다. 미입력 또는 0원 시 증여자가 전액 대납합니다.
    </p>
    <FieldCard
      label="수증자 본인 납부액"
      hint="수증자가 직접 납부하는 증여세 금액(원). 0원 = 증여자 전액 대납(기존 동작)."
    >
      <CurrencyInput
        label="수증자 본인 납부액"
        hideLabel
        value={form.doneePaidGiftTax ?? ""}
        onChange={(v) => set({ doneePaidGiftTax: v })}
        hideUnit
      />
    </FieldCard>
  </div>
)}
```

**정책 준수**:

- `CurrencyInput` 사용 (금액 입력 전용 — string 바인딩). **`label`은 필수 prop**(`CurrencyInput.tsx:46` `label: string`) — 누락 시 tsc 오류(TS2741).
- `FieldCard` 래핑 (라벨·hint 통일). FieldCard `<label>`은 `htmlFor`/`id` 미연결이라 `getByLabel`과 안 묶임 → CurrencyInput에 `hideLabel`을 함께 전달해 시각 라벨 중복은 막고 `aria-label`(`CurrencyInput.tsx:125` `hideLabel && label`일 때만 출력)을 보존. E2E `page.getByLabel("수증자 본인 납부액")`(§12)은 이 `aria-label`로만 매칭된다.
- placeholder 숫자 예시 금지 — hint 한국어(`feedback_no_won_suffix` 등).
- `useEffect → store` 미러링 금지 — `doneePaidGiftTax`는 독립 필드, `onChange`로만 갱신 (`feedback_useeffect_store_mirror_forbidden`).
- OFF 상태에도 violet tone 배경 유지 (ToggleCard children이므로 부모 ON 시에만 렌더 — ToggleCard 자체가 tone 유지 담당).

### 4-3. 수증자 납부액 미입력(빈값) 처리

| 상태 | 처리 | 결과 |
|---|---|---|
| `doneePaidGiftTax = ""` (미입력) | `parseAmount("") = 0` → `|| undefined` → 엔진 `?? 0` | P = 0 → 기존 전액 대납과 완전 동일 (회귀 안전) |
| `doneePaidGiftTax = "0"` | `parseAmount("0") = 0` → `|| undefined` | 동일 |
| `doneePaidGiftTax = "50000000"` | `parseAmount = 50,000,000` → 엔진 전달 | 부분 대납 |

**자동 안분 fallback 없음** — 미입력은 P=0(기본 전액 대납)으로 처리하는 것은 "자동 안분"이 아니라 기존 동작 보존(`feedback_no_silent_apportion_fallback` 준수).

### 4-4. Cross-field 동기화

| 트리거 | 연동 대상 | 구현 패턴 |
|---|---|---|
| `donorPaysGiftTax` OFF | 수증자 납부액 입력 칸 숨김 | 조건부 렌더 (useEffect 금지) |
| `donorHasJointLiability` ON | 수증자 납부액 입력 칸 숨김 | 조건부 렌더 (useEffect 금지) |
| `doneePaidGiftTax` 변경 | store 직접 갱신 | `onChange={(v) => set({ doneePaidGiftTax: v })}` |

**`useEffect → store` 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`): cross-field 연동은 조건부 렌더로만 처리.

---

## 5. 결과 카드 설계 — ⑦ 지점 (`GiftTaxResultView.tsx:568~606`)

### 5-1. 기존 섹션 구조 (실측)

```
567  {/* 대납(代納) gross-up 상세 (§36) */}
568  {result.donorPaidTaxGrossUp?.applied && (
       ...
       ① "원본 증여세 과세표준 (과세가액 − 공제)"   originalNetGift   (580행) ← 라벨 오류: originalNetGift는 §53 공제 미차감(500M) → "원본 증여세 과세가액 (§53 공제 차감 전)"으로 정밀화 필요
       ② "대납세액 (gross-up 수렴값)"               donorPaidTax      (583~585행) ← 라벨 정밀화 필요
       ③ gross-up 후 최종 과세표준                  grossedUpNetGift  (587~589행)
       흐름행: A + donorPaidTax = V*                                  (593~598행)
       baselineTax 행                                                  (600~603행)
       ...
```

### 5-2. 신 모델 5행 구성

기존 3행을 5행으로 확장. 행 순서는 엔진 계산 순서(총세액 T* → 수증자 납부 P → 증여자 대납 D)를 따른다.

| 행 | 라벨 | 값 | 노출 조건 | 변경 여부 |
|---|---|---|---|---|
| ① | 원본 증여세 과세가액 (§53 공제 차감 전) | `originalNetGift` (A) | 항상 | 라벨 정밀화 (값=공제 미차감 합산 과세가액) |
| ② | 총 결정세액 | `totalGiftTax` (T*) | 항상 | **신규** |
| ③ | 수증자 본인 납부 | `doneePaidTax` (P) | P > 0인 경우 (`doneePaidTax` truthy) | **신규** |
| ④ | 증여자 대납분 (총세액 − 수증자 납부) | `donorPaidTax` (D) | 항상 | 기존 ② 라벨 정밀화 |
| ⑤ | gross-up 후 최종 과세표준 | `grossedUpNetGift` (V*) | 항상 | 기존 ③ 유지 |

**흐름행 수식**: `A + D = V*` 그대로 유지. P는 V*에 포함하지 않는다.
(P를 V*에 더하면 수식 오류 — 주의)

**P = 0(전액 대납) 회귀 안전성**: `T* == D`, ③행 미노출 → 기존 표시와 시각적 동일.

### 5-3. 신 모델 JSX (기존 섹션 내부 div.space-y-1.5 교체)

```tsx
{/* 기존 div.space-y-1.5 를 아래로 교체 */}
<div className="space-y-1.5 text-sm">
  {/* ① 원본 과표 */}
  <div className="flex items-center justify-between px-3 py-2">
    <span>원본 증여세 과세가액 (§53 공제 차감 전)</span>
    <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.originalNetGift)}</span>
  </div>

  {/* ② 총 결정세액 (T*) — 신규 행 */}
  {result.donorPaidTaxGrossUp.totalGiftTax !== undefined && (
    <div className="flex items-center justify-between px-3 py-2">
      <span>총 결정세액 (수렴값)</span>
      <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.totalGiftTax)}</span>
    </div>
  )}

  {/* ③ 수증자 본인 납부 (P) — P > 0인 경우만 노출 */}
  {result.donorPaidTaxGrossUp.doneePaidTax !== undefined &&
    result.donorPaidTaxGrossUp.doneePaidTax > 0 && (
    <div className="flex items-center justify-between px-3 py-2">
      <span>수증자 본인 납부</span>
      <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.doneePaidTax)}</span>
    </div>
  )}

  {/* ④ 증여자 대납분 (D) — 기존 ②행 라벨만 정밀화 */}
  <div className="flex items-center justify-between px-3 py-2 font-semibold text-violet-700 dark:text-violet-300">
    <span>증여자 대납분 (총세액 − 수증자 납부)</span>
    <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.donorPaidTax)}</span>
  </div>

  {/* ⑤ gross-up 후 최종 과세표준 (V*) */}
  <div className="flex items-center justify-between px-3 py-2 font-semibold bg-violet-100/60 dark:bg-violet-900/20 rounded-lg">
    <span>gross-up 후 최종 과세표준</span>
    <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)}</span>
  </div>
</div>

{/* 흐름행 — A + D = V* (P 미포함 유지) */}
<div className="flex items-center gap-1.5 flex-wrap text-xs text-violet-700 dark:text-violet-300 bg-violet-100/60 dark:bg-violet-900/20 rounded-lg px-3 py-2">
  <span>{formatKRW(result.donorPaidTaxGrossUp.originalNetGift)}</span>
  <span className="text-violet-400">+</span>
  <span>{formatKRW(result.donorPaidTaxGrossUp.donorPaidTax)} (증여자 대납분)</span>
  <span className="text-violet-400">=</span>
  <span className="font-semibold">
    {formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)} (최종 과표)
  </span>
</div>

{/* baselineTax 행 */}
<div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
  <span>
    gross-up 전 기준 산출세액 (수렴 비교용, 반복 {result.donorPaidTaxGrossUp.iterations}회)
  </span>
  <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.baselineTax)}</span>
</div>
```

### 5-4. P ≥ T* (A-3 경계) 케이스 추가 안내

`donorPaidTax === 0` AND `applied === true` 조건:

```tsx
{result.donorPaidTaxGrossUp?.applied &&
  result.donorPaidTaxGrossUp.donorPaidTax === 0 && (
  <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
    수증자 본인 납부액이 총 결정세액 이상이어서 증여자 대납분이 없습니다.
    재차증여 해당 없음 (§36 최대 0 게이트 적용).
  </div>
)}
```

**납세자 유불리 표현 금지** (`feedback_tax_calculation_principle`): "절세", "유리", "불리" 표현 금지. 사실 서술만.

### 5-5. 금액 칸 정렬 정책

금액 셀: `font-mono tabular-nums` 적용. "원" 접미사 금지 (`feedback_no_won_suffix`).
행별 금액 우측 정렬 — `amount-column-align` 스킬 준수.

---

## 6. Validation ⑧ 동기화 (`validateStep`)

기존 `gift-tax-form-shared.tsx:504~518` 분기 **내부**에 음수 차단 1줄 추가.

```typescript
// gift-tax-form-shared.tsx validateStep step === 3 분기 내부 — 기존 차단 3조합 아래 추가
if (form.donorPaysGiftTax === true) {
  // 기존 ⓐ 동시증여, ⓑ 2-스트림, ⓒ 세대생략 차단 블록 (불변) ...

  // [신규] 수증자 납부액 음수 차단
  if (parseAmount(form.doneePaidGiftTax ?? "") < 0) {
    return "수증자 본인 납부액은 음수일 수 없습니다.";
  }
}
```

**정책 준수**:
- `form.doneePaidGiftTax` (string)은 `parseAmount`로 평가 — 직접 숫자 비교 금지 (타입 오류).
- `donorPaysGiftTax = false` 시 무시 (게이트 외부).
- CurrencyInput은 기본적으로 음수 입력 어려움 → 실제 차단 주체는 ⑫ Zod `min(0)`. ⑧은 UI 경로 방어.
- **UI fallback ↔ validation 동기화** (`feedback_validation_sync_8th_point`): API에서 `parseAmount(form.doneePaidGiftTax) || undefined`로 빈값을 0으로 처리하므로, validation도 빈값(parseAmount("") = 0)은 통과.

---

## 7. Zod superRefine ⑫ 동기화

기존 superRefine(3조합 차단)은 불변. `doneePaidGiftTax: z.number().min(0).optional()`만 추가:

```ts
// lib/validators/property-valuation-input.ts — giftTaxInputSchema 내부
// donorHasJointLiability 직후, deductionInput 위:
doneePaidGiftTax: z.number().min(0).optional(),
```

음수 값(-1)이 Zod에 도달하면 `min(0)` 오류 발생. `optional()` → `undefined` 허용 (P=0 회귀 안전).

---

## 8. Silent fallback / 자동 안분 후보 식별

| 필드 | 빈값 처리 | 정책 |
|------|---------|------|
| `doneePaidGiftTax` (FormState string) | `""` → `parseAmount("") = 0` → `|| undefined` | P=0 전액 대납 기존 동작(회귀 안전). 자동 안분 아님 — `feedback_no_silent_apportion_fallback` 준수 |
| `donorPaysGiftTax` | `undefined` → false (대납 OFF) | 기존 동작 유지 |
| `donorHasJointLiability` | `undefined` → false (비연대) | 기존 동작 유지 |

음수 입력은 ⑧ validateStep + ⑫ Zod `.min(0)`으로 차단 — 자동 교정 없음.

---

## 9. UI 순서 = 엔진 계산 로직 순서

| 엔진 STEP | UI 위치 |
|---|---|
| G-0: 게이트 (donorPaysGiftTax, donorHasJointLiability) | Step3 GiftCreditChecklist — 신고세액공제(§69) 아래 (기존 배치 유지) |
| G-1: baseline 계산 | (엔진 내부) |
| G-1.5: doneePaid 확정 | [신규] Step3 수증자 본인 납부액 CurrencyInput (연대의무 ToggleCard 아래) |
| G-2: 반복 수렴 | (엔진 내부) |
| G-5: finalEcho (doneePaidTax, totalGiftTax echo) | 결과 카드 ②③행 |
| 결과: grossedUpNetGift, donorPaidTax, iterations | 결과 카드 ④⑤행 + 흐름행 |

토글은 영향받는 필드(§69 신고세액공제) 직후 배치 유지. 수증자 납부액은 gross-up 게이트(연대의무 토글) 직후 배치 = 엔진 G-1.5 확정 시점과 동일.

---

## 10. 결과 산식 한국어 표기 (anchor 기대값 포함)

`feedback_result_view_korean_formula` 준수 — 변수 약어·`floor()` 금지.

### A-2 부분 대납 케이스 산식 표기 (닫힌형 검산 기반)

```
원본 증여세 과세가액 (A)    500,000,000   ← 합산 과세가액(§53 공제 차감 전 — STEP4에서 차감)
총 결정세액 (T*)             84,243,176
수증자 본인 납부 (P)         50,000,000
증여자 대납분 (D = T* − P)  34,243,176
gross-up 후 최종 과세표준(V*) 534,243,176  ← A + D = 500,000,000 + 34,243,176

--- 흐름행 ---
500,000,000 (원본 과세가액) + 34,243,176 (증여자 대납분) = 534,243,176 (최종 과세가액)

--- 산식 검증 (닫힌형, 단일 20% 구간) ---
과세표준  = 534,243,176 − 50,000,000 = 484,243,176
산출세액  = 484,243,176 × 20% − 10,000,000 = 86,848,635
신고세액공제 = 86,848,635 × 3% = 2,605,459 (절사)
총 결정세액 T* = 86,848,635 − 2,605,459 = 84,243,176
증여자 대납분 D = 84,243,176 − 50,000,000 = 34,243,176
V* 검증: 500,000,000 + 34,243,176 = 534,243,176 ✓
```

⚠️ 닫힌형은 단일 20% 구간 가정이 성립할 때만 정확. 구간 교차 시 반복식이 기준 — Pre-Do anchor 실측 후 확정.

### A-1 (P=0) 회귀 케이스 기대 표시

- ③행(수증자 본인 납부) 미노출 (P=0 조건)
- ② 총 결정세액 ≈ ④ 증여자 대납분 (동일값)
- 흐름행: `500,000,000 + 102,609,309 = 602,609,309` (PR#323 기준값)

---

## 11. anchor 기대값 요약

### A-1 (회귀, P = 0)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 102,609,309 (±1)  // PR#323 불변
donorPaidTaxGrossUp.doneePaidTax === undefined          // P=0 시 미설정
donorPaidTaxGrossUp.totalGiftTax === 102,609,309 (±1)  // P=0 시 T*==D
donorPaidTaxGrossUp.grossedUpNetGift === 500,000,000 + donorPaidTax
```

### A-2 (부분 대납, P = 50,000,000)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 34,243,176 (±1)    // D
donorPaidTaxGrossUp.doneePaidTax === 50,000,000           // P (echo)
donorPaidTaxGrossUp.totalGiftTax === 84,243,176 (±1)     // T* = D + P
donorPaidTaxGrossUp.grossedUpNetGift === 534,243,176 (±1) // V* = A + D
donorPaidTaxGrossUp.originalNetGift === 500,000,000       // A (§53 공제 전 — STEP4에서 차감)
```

### A-3 (경계, P ≥ 총세액)

```
donorPaidTaxGrossUp.applied === true
donorPaidTaxGrossUp.donorPaidTax === 0                  // D = max(0, T* − P) = 0
donorPaidTaxGrossUp.totalGiftTax === 77,600,000 (±1)   // T* = baseline
donorPaidTaxGrossUp.grossedUpNetGift === 500,000,000    // V* = A
결과 카드: "수증자 본인 납부액이 총 결정세액 이상이어서 증여자 대납분이 없습니다." 안내 표시
```

### A-8 (음수 차단)

```
Zod safeParse 실패: issues[0].path includes "doneePaidGiftTax"
validateStep 오류 반환: "수증자 본인 납부액은 음수일 수 없습니다."
```

---

## 12. E2E 시나리오

파일: `e2e/gift-donor-paid-grossup.spec.ts` (기존 파일 **확장**)
포트: `E2E_PORT=3103` (`feedback_e2e_worktree_port_isolation`)

⚠️ 셀렉터 패턴: 기존 gift spec(`e2e/gift-burdened-debt.spec.ts` 등) 실측 패턴 준수.
- 경로: `/calc/gift-tax`
- "다음" 버튼: `{ name: /^다음/ }`
- 대납 토글 클릭: `.getByText("증여자가 수증자의 증여세를 대납")`

### E-4. 부분 대납 — 수증자 납부액 입력 후 결과 확인 (A-2)

```typescript
test("부분 대납 — 수증자 납부액 5천만 입력 후 증여자 대납분 확인", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/calc/gift-tax");

  // Step 0~1: 증여일 + 증여자 + 현금 5억 (기존 E-1 패턴)
  // ... (기존 스텝 생략 — E-1에서 재사용)

  // Step 3: 대납 ON + 연대의무 OFF + 수증자 납부액 입력
  await page.getByText("증여자가 수증자의 증여세를 대납").click();
  await expect(page.getByText(/연대납세의무자/)).toBeVisible();
  // 수증자 납부액 입력 칸 확인
  await expect(page.getByText("수증자 본인 납부액")).toBeVisible();
  await page.getByLabel("수증자 본인 납부액").fill("50000000");

  await calcAndWaitResult(page, { taxType: "gift" });

  // 결과 검증 — 5행 표시 확인
  await expect(page.getByText("대납(代納) gross-up 상세")).toBeVisible();
  await expect(page.getByText("총 결정세액 (수렴값)")).toBeVisible();
  await expect(page.getByText("수증자 본인 납부")).toBeVisible();
  await expect(page.getByText("증여자 대납분 (총세액 − 수증자 납부)")).toBeVisible();
  // 수치 검증 (anchor A-2 실측 확정 후 활성화):
  // await expect(page.getByText("34,243,176")).toBeVisible(); // D
  // await expect(page.getByText("84,243,176")).toBeVisible(); // T*
  // await expect(page.getByText("534,243,176")).toBeVisible(); // V*
});
```

### E-5. P ≥ 총세액 경계 (A-3)

```typescript
test("수증자 납부액 ≥ 총세액 → 증여자 대납분 없음 안내", async ({ page }) => {
  // Step 0~3: 대납 ON + 수증자 납부액 200,000,000 입력
  await page.getByLabel("수증자 본인 납부액").fill("200000000");
  await calcAndWaitResult(page, { taxType: "gift" });
  await expect(page.getByText("재차증여 해당 없음")).toBeVisible();
});
```

### E-6. 수증자 납부액 미입력 = 기존 전액 대납과 동일 (A-1 회귀)

```typescript
test("수증자 납부액 미입력 → 전액 대납 기존 동작 회귀", async ({ page }) => {
  // Step 3: 대납 ON + 수증자 납부액 미입력
  await page.getByText("증여자가 수증자의 증여세를 대납").click();
  // 수증자 납부액 = 빈값 (기본값 유지)
  await calcAndWaitResult(page, { taxType: "gift" });
  // 수증자 본인 납부 행 미노출 확인
  await expect(page.getByText("수증자 본인 납부")).not.toBeVisible();
  // 기존 전액 대납 결과 확인 (실측 후 활성화):
  // await expect(page.getByText("102,609,309")).toBeVisible();
});
```

---

## 13. Definition of Done — 자가 점검

### 3대 핵심 정책

- [ ] `useEffect → store` 미러링 없음 — `doneePaidGiftTax` onChange 직접 set만
- [ ] 자동 안분 fallback 없음 — 빈값은 P=0(기존 동작) 보존 뿐, 엔진 내 대납액 자동 추정 없음
- [ ] API fallback ↔ validate ⑧ 동기화 — 빈값→parseAmount→0→통과(양쪽 동일)

### 14지점 체크리스트

| 지점 | 파일 | 완료 |
|---|---|---|
| ① FormData 타입 | `gift-tax-form-shared.tsx` `FormState` — `doneePaidGiftTax?: string` | ☐ |
| ② initial value | `gift-tax-form-shared.tsx` `INITIAL_FORM` — `doneePaidGiftTax: ""` | ☐ |
| ③ normalize | N/A (② 기본값으로 충족) | ☑ N/A |
| ④ API 변환 | `lib/calc/gift-api.ts` — `doneePaidGiftTax: parseAmount(...) || undefined` 명시 키 | ☐ |
| ⑤ UI 위젯 | `GiftCreditChecklist.tsx` — 수증자 납부액 CurrencyInput + 노출 조건 | ☐ |
| ⑥ 사이드바 | N/A (증여 마법사 사이드바 미존재) | ☑ N/A |
| ⑦ 결과 카드 | `GiftTaxResultView.tsx` — 5행 확장 + P≥T* 안내 + ④행 라벨 정밀화 | ☐ |
| ⑧ validation | `gift-tax-form-shared.tsx` `validateStep` — parseAmount 음수 차단 | ☐ |
| ⑨ Zod enum | N/A | ☑ N/A |
| ⑩ Zod enum 컴패니언 | N/A | ☑ N/A |
| ⑪ acquisitionDate fallback | N/A | ☑ N/A |
| ⑫ **Zod 입력객체** | `lib/validators/property-valuation-input.ts` — `doneePaidGiftTax: z.number().min(0).optional()` | ☐ |
| ⑬ **명시 반환 객체** | `lib/calc/gift-api.ts` — 명시 키 (grep: doneePaidGiftTax) | ☐ |
| ⑭ **Route handler** | `app/api/calc/gift/route.ts` — 변경 없음 (parsed.data 통째 전달) | ☑ N/A |

### result 타입 (엔진 담당)

- [ ] `inheritance-gift.types.ts` `donorPaidTaxGrossUp` — `doneePaidTax?: number`·`totalGiftTax?: number` 추가
- [ ] `donorPaidTax` JSDoc 정밀화 ("대납세액 = 수렴 finalTax" → "증여자 대납분 D = max(0, T* − P)")

### 빌드·테스트

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts` 통과 (A-1~A-8)
- [ ] 기존 gift C-1~C-12 anchor 무변경 (`doneePaidGiftTax` 미입력 케이스)
- [ ] `E2E_PORT=3103 npx playwright test e2e/gift-donor-paid-grossup.spec.ts` 통과 (E-4~E-6 포함)
- [ ] 브라우저 수동 확인 또는 미수행 명시

### ⑫⑬⑭ grep 자가 점검

```bash
# ⑫: Zod 스키마에 doneePaidGiftTax 추가 확인
grep -n "doneePaidGiftTax" \
  /Users/mynote/workspace/Property-related-Taxes/lib/validators/property-valuation-input.ts

# ⑬: gift-api.ts 명시 키 확인
grep -n "doneePaidGiftTax" \
  /Users/mynote/workspace/Property-related-Taxes/lib/calc/gift-api.ts

# ⑭: route.ts 변경 없음 확인 (parsed.data 그대로)
grep -n "parsed.data" \
  /Users/mynote/workspace/Property-related-Taxes/app/api/calc/gift/route.ts
```

---

## 14. Do 단계 Phase (시퀀셜)

| Phase | 내용 | verify |
|---|---|---|
| Pre-Do | A-1(회귀) · A-2(부분) anchor 작성·실행 → **실패 확보 후** 닫힌형 34,243,176과 대조 | `feedback_pre_anchor_verification` — "현행 일치 예상" 금지 |
| A 타입 | `GiftTaxInput.doneePaidGiftTax?: number` + Zod ⑫ + result 타입 2필드 + JSDoc 정밀화 | `tsc --noEmit` 0건 |
| B 엔진 | `gift-tax-grossup.ts` — 반복식 1줄 + donorPaidTax 대입(`prevTax`→`addition`) + finalEcho 확장 + applied:false 분기 동기화 | A-1~A-3 anchor 통과 |
| C API | `gift-api.ts` ④/⑬ 명시 키 추가 | grep 자가 점검 + tsc 0건 |
| D UI | `FormState` ① + `INITIAL_FORM` ② + `validateStep` ⑧ + `GiftCreditChecklist.tsx` ⑤ CurrencyInput + `GiftTaxResultView.tsx` ⑦ 5행 확장 | E2E E-4~E-6 green |
| E 회귀 | `npm test` 전체 + tsc + lint | 기존 C-1~C-12 무변경 · 0건 |

---

## 부록. 핵심 설계 결정 요약

1. **최소 변경 원칙**: 기존 전액 대납 gross-up(PR#323) 위에 신규 필드 1개(`doneePaidGiftTax`)와 결과 행 2개 추가만으로 구현. 엔진은 반복식 2줄 변경만.
2. **FormState 타입**: `doneePaidGiftTax?: string` — 프로젝트 규약(금액 필드 전부 string). API 변환에서 `parseAmount`로 number 경계 변환.
3. **UI 노출 조건**: `donorPaysGiftTax === true` AND `donorHasJointLiability !== true`. 연대의무 ON 시 gross-up 미적용이라 수증자 납부액 입력 무의미 → 숨김.
4. **결과 카드**: 기존 3행 → 5행 (② 총 결정세액 T* 신규 + ③ 수증자 본인 납부 P 신규). P=0(전액 대납)이면 ③행 미노출 → 기존 표시와 동일. ④행 라벨만 정밀화.
5. **흐름행**: `A + D = V*` 유지. P는 V* 합산에 미포함 (P를 V*에 더하면 수식 오류).
6. **P ≥ T* 처리**: `applied=true, donorPaidTax=0` + "재차증여 해당 없음" 안내. gross-up 섹션은 표시.
7. **회귀 안전성**: 미입력 → P=0 → 기존 전액 대납과 완전 동일. 신규 필드 전부 optional.
8. **차단 3조합**: 기존 동시증여·2-스트림·세대생략 차단 완전 계승. `doneePaidGiftTax`는 차단 판단에 미영향.
9. **사이드바**: 증여 마법사에 사이드바 미존재 → N/A.
10. **선택출력(PrintSelectionPanel)**: 기존 `"donor-paid-grossup"` leaf id 그대로 재사용. 신규 leaf id 불필요.
