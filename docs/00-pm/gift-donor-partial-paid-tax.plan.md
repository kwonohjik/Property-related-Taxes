# 증여세 부분 대납(代納) — 수증자 일부 납부 + 증여자 부족분 대납 수정 계획서

> **Feature**: 기존 "증여자 전액 대납 gross-up"(PR#323)을 확장 — 수증자가 증여세 중 일부(고정 금액)를
> 본인 부담으로 납부하고, **부족한 나머지만 증여자가 대납**하는 경우를 계산.
> **기반**: `project_gift_donor_paid_tax_grossup` (PR#323, `4650f386`)
> **작성일**: 2026-06-22
> **상태**: Plan (Do 미착수). 신규 브랜치/worktree는 master 기준 분기 예정(gift-enhance는 머지 완료).

---

## 0. 요약 (한 줄)

증여세 총액 `T` 중 **수증자가 본인 부담으로 `P`원 납부**, **증여자는 부족분 `(T − P)`만 대납**.
§36 재차증여는 증여자가 실제 변제한 `(T − P)`뿐이므로, gross-up 가산분 = `max(0, finalTax(V) − P)`.
**현재 전액 대납은 `P = 0`인 특수경우** → 기존 동작 100% 보존(회귀).

---

## 1. 법령 근거 (기존 검증 재사용 — 신규 검증 불필요)

- **§36①**: "제3자로부터 채무의 인수 또는 **변제를 받은** 경우 ... 그 면제등으로 인한 이익에 상당하는 금액"
  → 증여자가 수증자 증여세 채무 중 **일부만 변제**해도, **변제한 금액 그만큼**이 재차증여. 부분 변제 자연 포섭.
- **§4의2⑥ + 국세청 해석 207328**: 연대납세의무자 대납 = 재차증여 아님 → gross-up 미적용 (게이트 불변).
- **§47②·§56·§69②**: 합산·세율·신고세액공제 (불변).
- ⚠️ **신규 KoreanLaw 검증 불필요**: 부분 대납 포섭 근거는 §36① **"면제등으로 인한 이익에 상당하는 금액"**
  — 이익 크기가 증여자 변제액(D)에 비례하므로 부분 변제(P>0, 증여자 D만 변제)도 자연 포섭(법리 동일).
  ("변제를 받은 금액" 문구 자체가 아니라 **이익 비례** 표현이 load-bearing.) memory `feedback_korean_law_citation_verify`.

---

## 2. 입력 모델 결정 (확인 필요 — §11)

**채택(가정)**: 입력 = **수증자 본인 납부액 `doneePaidGiftTax`(원, 고정 금액)**. 증여자는 `T − P` 대납.
- 근거: 사용자 표현 "일부를 수증자가 납부하고 **나머지 부족한 금액을 증여자가 대납**"
  → 알려진 고정량은 **수증자 납부액**, 증여자는 부족분(shortfall)을 채움.
- `P = 0` → 현재 전액 대납과 동일. `P ≥ T*` → 증여자 대납 0 → gross-up 없음(=baseline).
- (대안: 비율(%) 입력 / 증여자 대납 상한 입력 — §11에서 사용자 확인.)

---

## 3. 계산 모델 (고정점 반복 — 부분 대납 확장)

### 3.1 정의
- `A` = 원래 순증여재산가액 (= netCurrentGiftValue, 기존과 동일)
- `P` = 수증자 본인 납부액 (`doneePaidGiftTax`, 고정, ≥ 0)
- `finalTax(V)` = 합산가액 `V`에 대한 결정세액 (§57 할증·§69 신고공제 후, 기존과 동일)
- **증여자 대납분(재차증여액)** `D = max(0, finalTax(V) − P)`

### 3.2 반복식
```
addition_0 = 0
tax_0      = baseline = finalTax(A)
반복: addition_{n+1} = max(0, tax_n − P)        ← 유일한 변경점 (기존: addition = tax_n)
      V_{n+1}        = A + addition_{n+1}        ← aggregatedGiftValue 주입(기존과 동일 지점)
      tax_{n+1}      = finalTax(V_{n+1})
종료: |tax_{n+1} − tax_n| < 1원, 최대 100회
```
> **유일한 변경**: 가산분에 `− P` 후 `max(0, …)`. 나머지 파이프라인·주입 지점·게이트 전부 불변.

### 3.3 수렴 보장
`max(0, ·)`는 비확장(non-expansive), `finalTax`는 한계세율 ≤0.679<1 축약 → 합성도 축약 → **수렴 유지**.
`P ≥ finalTax(V)` 구간에서는 `D=0` → `V=A` → baseline에서 즉시 수렴.

### 3.4 닫힌형 검산 (Pre-Do anchor 확정 전제)
부분 대납은 `V = A + max(0, finalTax(V) − P)`. `finalTax>P` 구간에서 `V − finalTax(V) = A − P`
(전액 대납 식의 상수만 `A → A−P` 이동). **단일세율 구간 내에서만 닫힌형 성립**(구간 교차 시 반복으로만 정확 — 기존과 동일 주의).

---

## 4. Pre-Do Anchor

### A-1 (회귀): `P = 0` → 기존 전액 대납과 동일
- 5억·공제 5천만·비연대·신고기한 → `donorPaidTax === 102,609,309` (PR#323 anchor 무변경)

### A-2 (신규): 수증자 5천만 납부 + 증여자 부족분 대납
- 입력: A=500,000,000 / 공제 50,000,000 / `doneePaidGiftTax=50,000,000` / 비연대 / 신고기한
- **닫힌형 검산(20% 구간)**: `finalTax=(0.2(V−50M)−10M)·0.97=0.194V−19,400,000`,
  `addition=finalTax−50M`, `0.806V=430,600,000` → `V*≈534,243,176`
  - taxBase 484,243,176(20% 구간) → 산출 `floor(0.2·484,243,176−10,000,000)=86,848,635`
  - 신고공제 `floor(86,848,635·0.03)=2,605,459` → **총세액 finalTax ≈ 84,243,176**
  - **증여자 대납 `D` = 84,243,176 − 50,000,000 = 34,243,176**, V* = 500,000,000 + 34,243,176 = 534,243,176 ✓
- **anchor 목표**: `doneePaidTax===50,000,000`, `donorPaidTax===34,243,176 (±1)`, `totalGiftTax===84,243,176 (±1)`, `grossedUpNetGift===534,243,176`

### A-3 (경계): `P ≥ 세액` → 증여자 대납 없음
- `doneePaidGiftTax = 200,000,000`(baseline 77,600,000 초과) → `donorPaidTax===0`, `finalTax===77,600,000`(baseline), `applied` 처리는 §6.2 결정

### A-4 (회귀): 대납 OFF / 연대의무 ON → 기존과 동일 (P 무시)

---

## 5. 엔진 변경 (delta — 기존 `lib/tax-engine/gift-tax-grossup.ts` 수정)

### 5.1 신규 입력 필드 (`GiftTaxInput`)
```ts
/** 수증자가 본인 부담으로 납부하는 증여세액(원). 증여자는 (총세액 − 이 금액)만 대납.
 *  미입력/0 = 증여자 전액 대납(기존 동작). donorPaysGiftTax=true 일 때만 유효. */
doneePaidGiftTax?: number
```

### 5.2 반복 로직 (`calcGiftTaxWithDonorPaidTax` / `runGrossUpIteration`)
- `const doneePaid = Math.max(0, input.doneePaidGiftTax ?? 0)`
- 가산분: `addition = Math.max(0, finalTax − doneePaid)` (기존 `addition = finalTax`에서 변경)
- 나머지 주입(aggregatedGiftValue)·게이트·besshi10 차감 로직 불변 (단, besshi10 차감액 = `donorPaidTax`(=addition)로 자동 정합 — 이미 echo `donorPaidTax` 사용 중)
- 🔒 **besshi10 정합 불변식 (필수 유지)**: `donorPaidTax` echo = 주입 가산분 `addition`(=D) 와 **항상 동일**해야 한다.
  별지10호 `derivePriorGiftAddition`은 `priorGiftSum = aggregatedGiftValue − netCurrent − donorPaidTax`로 ㉓를 역산하므로,
  부분대납(P>0)에서도 `donorPaidTax`가 D(=addition)면 ㉓ 정확. **`donorPaidTax`를 T*로 환원하거나 별도 D 필드로
  분리하면 ㉓가 P만큼 과소차감되어 침묵 오류** → 금지. anchor에 "부분대납 1건 별지10호 ㉓ 역산 정합" 추가.

### 5.3 echo 결과 확장 (`GiftTaxResult.donorPaidTaxGrossUp`)

대상 타입: `lib/tax-engine/types/inheritance-gift.types.ts:751` `donorPaidTaxGrossUp` 객체.
```ts
doneePaidTax?: number      // 수증자 본인 납부액 P (입력 echo) — optional(?)
totalGiftTax?: number      // 총 결정세액 T* (= donorPaidTax + doneePaidTax, 수렴값) — optional(?)
// donorPaidTax: 기존 필드 의미 변경 = 증여자 대납분 D = max(0, T* − P)  ← JSDoc 갱신
//   inheritance-gift.types.ts:770 JSDoc "대납세액 = 수렴 finalTax" → "증여자 대납분 D = max(0, T* − P)"로 정정
// grossedUpNetGift, baselineTax, iterations, applied: 기존 유지
```
> ⚠️ `donorPaidTax` 의미가 "총세액"→"증여자 대납분"으로 정밀화. `P=0`이면 `donorPaidTax==totalGiftTax`라
> 기존 anchor·besshi10·결과카드 호환(회귀 안전). `totalGiftTax`·`doneePaidTax`는 신규 echo.

**신규 필드는 optional(`?`)로 추가** (non-optional 시 `applied:false` 인라인 객체가 tsc 실패).
**`applied:false` 분기 동기화 (gift-tax-grossup.ts:89-103, `toggle_off`·`joint_liability` 경로)**:
두 신규 필드를 미세팅(undefined)으로 둔다 — applied:false 시 gross-up 섹션 자체를 표시하지 않으므로 표시 분기 불필요.
(또는 명시값 필요 시 `doneePaidTax: 0`·`totalGiftTax: baseResult.finalTax`.) Do Phase A에서 89-103행 echo 분기 동기화를 verify로 포함.

### 5.4 `applied` / `P ≥ T*` 정책 (✅ 확정 2026-06-22)
- `P ≥ T*`(증여자 대납 0): **`applied=true, donorPaidTax=0`** 로 두고 결과카드에
  "증여자 대납액 0 — 수증자가 전액 부담(재차증여 없음)" 안내. (세액 = baseline)
- gross-up 섹션은 표시하되 대납분 0·V*=A로 노출. (미적용 처리 ⓑ는 반려)
- **`doneePaidTax` echo 표시 = `min(P, totalGiftTax)`** (실제 수증자 부담 = 세액 한도). 입력 P가 세액 초과 시
  초과분은 표시하지 않아 `doneePaidTax + donorPaidTax = totalGiftTax` 자기일관 유지. A-3 anchor:
  `doneePaidTax === 77,600,000`(=총세액), `donorPaidTax === 0`. (입력 원값 200,000,000 그대로 표시 금지 — 혼선.)

---

## 6. 14 동기화 지점 (신규 필드 `doneePaidGiftTax`)

| 지점 | 처리 |
|---|---|
| ① FormState | `doneePaidGiftTax?: number` (`gift-tax-form-shared.tsx`) |
| ② INITIAL_FORM | 기본 `undefined`(또는 0) |
| ③ normalize | 숫자 정규화(빈값→0) |
| ④/⑬ gift-api `buildGiftTaxInput` | 명시 키 추가 (spread 아님) |
| ⑤ UI 위젯 | 위젯 파일 = `components/calc/gift/GiftCreditChecklist.tsx` (기존 `donorPaysGiftTax` ToggleCard children, 189~204행 영역 — `donorHasJointLiability` 연대의무 ToggleCard 옆). **CurrencyInput "수증자 본인 납부액"** (기본 0=전액 대납 안내). ⚠️ 노출 조건: `donorPaysGiftTax=true` **AND `donorHasJointLiability=false`** (연대의무 ON이면 gross-up 미적용이라 입력 칸 숨김) |
| ⑥ 사이드바 | N/A (증여 폼 사이드바 부재) |
| ⑦ 결과 카드 | gross-up 섹션(`GiftTaxResultView.tsx:567-606`)을 기존 3행 + 흐름행 구조에서 확장. 행별 매핑·기존 라벨 변경은 아래 **§6.1** 참조 |
| ⑧ validateStep | `doneePaidGiftTax ≥ 0`. 음수 차단. (대납 OFF면 무시). 기존 3조합 차단 유지 |
| ⑨⑩⑪ | N/A |
| ⑫ Zod | `doneePaidGiftTax: z.number().min(0).optional()` (`lib/validators/property-valuation-input.ts` — **`lib/api/schemas/` 아님**). 추가 위치 = 526행 `donorHasJointLiability` 직후, 527행 `deductionInput` 위. 기존 superRefine 유지. ⚠️ 미등록 시 route(`app/api/calc/gift/route.ts:64`)가 `parsed.data as GiftTaxInput` 통째 캐스팅하므로 ⑭에서 침묵 strip되어 엔진 미도달 (memory `feedback_api_zod_schema_sync` — ⑫⑬⑭ TS 미감지) |
| ⑭ route | 매핑 자동(parsed.data 통째 전달) — 변경 없음 |
| result 타입 | `inheritance-gift.types.ts:751` `donorPaidTaxGrossUp` 객체에 `doneePaidTax?: number`·`totalGiftTax?: number` 추가 + 770행 `donorPaidTax` JSDoc "대납세액 = 수렴 finalTax" → "증여자 대납분 D = max(0, T* − P)" 정정. 엔진(`gift-tax-grossup.ts:152-159` `finalEcho` + 89-103행 applied:false 분기) 세팅은 §5.2/§5.3·Do Phase A. (TS는 결과뷰 누락은 잡지만 echo 미세팅은 못 잡음) |

### 6.1 결과 카드 행 매핑 (`GiftTaxResultView.tsx:567-606`)

기존 카드 구조(실측): ① 원본 과표 `originalNetGift`(580행) / ② **"대납세액 (gross-up 수렴값)"** `donorPaidTax`(584행) / ③ 최종 과표 `grossedUpNetGift`(588행) + 흐름행 `originalNetGift + donorPaidTax(=대납세액) = grossedUpNetGift`(593-598행) + baselineTax 행(600-603행).

신 모델에서 `donorPaidTax` 의미가 "총세액"→"증여자 대납분 D"로 바뀌므로 **584행 기존 라벨 "대납세액 (gross-up 수렴값)" → "증여자 대납분 (총세액 − 수증자 납부)"** 로 재명명한다(라벨↔내용 모순 해소). 행 구성:

| 행 | 라벨 | 값 |
|---|---|---|
| ① | 원본 증여세 과세가액 (§53 공제 차감 전) | `originalNetGift` (A) — 기존 유지 (※ "과세표준" 아님 — §53 공제 전 과세가액) |
| ② | 총 결정세액 | `totalGiftTax` (T*) — **신규행** |
| ③ | 수증자 본인 납부 | `doneePaidTax` (P) — **신규행** |
| ④ | 증여자 대납분 (총세액 − 수증자 납부) | `donorPaidTax` (D) — 기존 ②행 라벨 정밀화 |
| ⑤ | gross-up 후 최종 과세표준 | `grossedUpNetGift` (V*) — 기존 유지 |

> **⚠️ optional echo 렌더 가드 (mustFix)**: `totalGiftTax`·`doneePaidTax`는 optional(`?`) echo이므로
> ②③④⑤행 접근은 **`result.donorPaidTaxGrossUp?.applied` 가드 내에서만** 한다. `applied:true`일 때
> finalEcho(`gift-tax-grossup.ts` 수렴 종료부)가 두 필드를 **반드시 세팅**함이 전제(설계서 JSX는 `!== undefined`
> 가드 포함). 방어적으로 `totalGiftTax ?? donorPaidTax` fallback 권장 — 미가드 시 `formatKRW(undefined)` NaN 위험.

- **흐름행(593-598행)은 `A + D = V*` 그대로 유지** — P는 V* 합산에 더하지 않는다. (`originalNetGift + donorPaidTax(=증여자 대납분) = grossedUpNetGift`. 라벨 "(대납세액)"→"(증여자 대납분)".) 구현자가 P를 V* 합산에 잘못 포함하지 않도록 주의.
- **회귀 안전성**: `P=0`(전액 대납) 시 `T*==D`이므로 ②·④ 행 동일 금액·흐름행 변동 없음 → 기존 표시·anchor와 동일.
- 금액 칸은 기존대로 `text-right font-mono`(`amount-column-align` 스킬).

- **anchor** (`gift-donor-paid-grossup-anchor.test.ts` 확장): A-1(회귀 102,609,309) / A-2(34,243,176·84,243,176) / A-3(P≥세액→D=0) / 사전증여 동반+부분대납 1건
- **회귀**: 기존 C-1~C-12 전부 무변경(P 미입력 시) + 전체 `npm test`
- **E2E** (`gift-donor-paid-grossup.spec.ts` 확장): 대납 ON → 수증자 납부액 입력 → 결과에 증여자 대납분(부족분)·총세액·V* 표시

---

## 8. Do Phase (시퀀셜)

| Phase | 내용 | verify |
|---|---|---|
| Pre-Do | A-1(회귀)·A-2(부분) anchor 작성·실행 | 닫힌형 34,243,176과 대조 |
| A 엔진 | 입력필드 + addition `max(0, finalTax−P)` + `finalEcho`(gift-tax-grossup.ts:152-159)에 doneePaidTax·totalGiftTax 세팅 + **applied:false 분기(89-103행) echo 동기화** + result 타입 2필드(optional) + donorPaidTax 의미/JSDoc(types:770) 정밀화 | A-1~A-3 통과 · applied:false 분기 tsc 0 |
| B API | Zod ⑫ + gift-api ⑬ | tsc 0 |
| C UI | CurrencyInput ⑤ + 결과카드 4행 ⑦ + 폼①②③ + validate⑧ | E2E green |
| D 회귀 | 전체 test + tsc + lint | 0건·기존 anchor 무변경 |

---

## 9. Scope

**포함**: 수증자 고정 납부액 + 증여자 부족분 대납, gross-up 수렴, 결과 표시, anchor·E2E.
**제외(불변 계승)**: 차단 3조합(동시증여·2-스트림·세대생략)+대납, 별도 증여건 분리신고, 세대생략 grossGiftValue 조정.

---

## 10. 회귀 안전성 (핵심)

`doneePaidGiftTax` 미입력/0 → `addition = max(0, finalTax − 0) = finalTax` → **기존 식과 완전 동일**.
`donorPaidTax`(P=0 시 == totalGiftTax) → 기존 besshi10 차감·결과카드·anchor 전부 호환. 신규 필드는 전부 optional.

---

## 11. 설계 확정 (사용자 확정 2026-06-22)

1. ✅ **입력 방식 = 수증자 본인 납부액 `doneePaidGiftTax`(고정 원)**. 증여자는 부족분(총세액 − P) 대납.
   (비율·증여자 상한 방식은 반려.)
   - ⚠️ **Zod ⑫ 추가 파일 = `lib/validators/property-valuation-input.ts`** (기존 `donorPaysGiftTax`·`donorHasJointLiability`·`superRefine`이 있는 파일). `lib/api/schemas/property-valuation-input.ts` 경로는 존재하지 않음.
2. ✅ **`P ≥ 총세액` 처리 = `applied=true, donorPaidTax=0` + "수증자 전액 부담(재차증여 없음)" 안내**.
   세액은 baseline. (미적용 처리 반려 — §5.4.)
3. ✅ **수증자 납부액은 총세액 T\* 기준**: 증여자가 "총세액 − P"(부족분)를 대납. 수렴 후 총세액 기준으로 P 차감.
