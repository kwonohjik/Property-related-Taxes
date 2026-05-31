# 영리법인 사전증여 산출세액 빈칸 근본 수정 + ⑩a 라벨 통일 — 수정 계획서

> 트리거: 이미지30 — 수증자 "영리법인(M 주식회사)" 선택 + 증여재산가액 700,000,000 입력했으나
> **§3의2② 산출세액 상당액 입력란이 빈칸**. 사용자 요청 2건:
> 1. 영리법인 증여세 산출세액이 표시되지 않는 문제 수정
> 2. 입력란 라벨을 **"⑩a 상속인외 증여세 산출세액"**으로 변경 (결과표 행과 통일)

---

## 0. 근본 원인 — throwaway probe 실증 완료 (추정 아님)

`__tests__/tmp/probe-corp-empty.test.ts` (5/5 PASS, 확인 후 삭제) 로 다음을 **실측 확정**:

| # | 입력 | 현재 동작 | 판정 |
|---|---|---|---|
| S1 | corporate, cgct=**undefined**, 가액 700m | 표시 **150,000,000** | fallback 작동 ✓ |
| **S2** | corporate, cgct=**0**, 가액 700m | 표시 **(빈칸)** | **버그 재현** ← 이미지30 |
| S3 | 가액 0일 때 영리법인 수증자 선택 → `computeTaxPatch` | **cgct=0 저장** | 0 잔재 발생 경로 ✓ |
| S4 | `applyCorporateGiftTaxFallback([cgct=0])` | cgct=**0 유지** | API도 0 (계산 0) ✓ |
| S5 | 조건을 `cgct≤0 && 가액>0` 로 확장 | **150,000,000** | 해결 방향 검증 ✓ |

### 원인 구조 — `corporateGiftComputedTax === undefined`만 "미계산"으로 간주

영리법인 §3의2② 산출세액 상당액을 다루는 **3개 지점이 모두 `=== undefined`만 fallback 대상**으로 봄.
그러나 `corporateGiftComputedTax`는 **0으로 store에 저장되는 경로**가 존재 → 3곳 전부 `0`을 통과시켜 빈칸/0/차단.

| 지점 | 위치 | 현재 조건 | cgct=0일 때 결과 |
|---|---|---|---|
| **표시** ⑤ | `components/calc/prior-gift/GiftRowEditor.tsx:346-356` | `cgct === undefined && 가액>0` | `cgct ?? 0` = 0 → `value=""` **빈칸** |
| **API** ④ | `lib/calc/prior-gift-auto-tax.ts:63-77` `applyCorporateGiftTaxFallback` | `cgct === undefined && 가액>0` | 0 유지 → 엔진 면제계산 0 |
| **Validation** ⑧ | `lib/calc/inheritance-validate.ts:121` | `!cgct \|\| cgct <= 0` → 차단 | **계산 차단** (fallback이 0은 안 채우므로) |

### cgct=0 발생 경로 (2가지)

1. **세션 내 발생** (S3 실증): `handleDoneeSelect`에서 가액 입력 **전에** 영리법인 수증자를 먼저 선택하면
   `computeTaxPatch({...gift, giftAmount: 0})` → `autoComputePriorGiftTax(0, …) = 0` → **`corporateGiftComputedTax: 0` store 저장**.
   (이후 가액을 입력하면 `handleGiftAmountChange`가 150m로 갱신하나, 세액란을 한 번 터치해 `userTouchedTax=true`가 되면 갱신 중단되어 0 고착.)
2. **기존 데이터** (가장 유력): phase2/ef94c5d **이전 코드**(별도 `CorporateGiftFields` 입력란 시절)로 입력해
   sessionStorage에 저장된 사전증여는 cgct가 0 또는 undefined. dev 재시작으로 코드는 갱신돼도 **sessionStorage 데이터는 유지** →
   cgct=0이면 표시 fallback(=== undefined)이 못 잡아 빈칸.

> ⚠️ ef94c5d 표시 fallback은 `=== undefined`만 처리하므로 **cgct=0 케이스를 구조적으로 못 고침**. dev 재시작과 무관한 코드 결함.

---

## 1. 해결 설계

### 설계 원칙
영리법인 §3의2② 산출세액 상당액 = `(증여재산가액 − §53 공제[법인은 0]) × §56 세율` 로 **항상 도출 가능한 법정값**.
영리법인은 가액>0이면 산출세액>0이 정상 (가액 0일 때만 0). 따라서 **"가액>0인데 cgct≤0"은 명백한 미계산 상태** → 자동 도출 대상.

### 변경 1 — fallback 조건 확장 (3곳 동일 산식, single-source 유지)

`=== undefined` → **`=== undefined || <= 0`** (즉 미설정·0·음수 모두 미계산으로 간주), 가액>0 가드 유지.

#### 1-a. API fallback — `lib/calc/prior-gift-auto-tax.ts` `applyCorporateGiftTaxFallback`
```ts
g.beneficiaryType === "corporate" &&
(g.corporateGiftComputedTax === undefined || g.corporateGiftComputedTax <= 0) &&  // ← 0·음수 포함
(g.giftAmount ?? 0) > 0
  ? { ...g, corporateGiftComputedTax: autoComputePriorGiftTax(g.giftAmount, g.doneeRelation) }
  : g
```

#### 1-b. 표시 fallback — `GiftRowEditor.tsx:346-356`
```ts
const corpNeedsFallback =
  isCorporate &&
  (gift.corporateGiftComputedTax === undefined || gift.corporateGiftComputedTax <= 0) &&  // ← 0 포함
  (gift.giftAmount ?? 0) > 0 &&
  !userTouchedTax;
```
- `!userTouchedTax` 가드 유지: 세션 중 사용자가 직접 수정하면 그 값 존중. 재진입(카드 재마운트) 시 `userTouchedTax=false`로
  돌아가 자동 재계산 → 가액>0인데 0으로 남는 비정상 상태를 자동 복원 (영리법인 0 산출세액은 법적으로 가액 0일 때만 정상이므로 안전).

#### 1-c. Validation — `inheritance-validate.ts:121` (⑧ 동기화)
buildInput이 `applyCorporateGiftTaxFallback` **후** validation을 호출(`InheritanceTaxForm.tsx:321→364`)하므로,
1-a 적용 시 cgct=0인 입력도 fallback이 150m로 채워 **현 조건 그대로 통과**.
→ validation 코드 자체는 **변경 불필요**. 단, "가액 0 + 영리법인"은 여전히 차단(정상 방어).
- 자가검토 항목: fallback 후 input으로 검증됨을 anchor로 고정 (UI/API 통과 ↔ validate 차단 모순 0 확인).

### 변경 2 — cgct=0 발생 경로 차단 (보조, `computeTaxPatch`)

가액 0일 때 영리법인 cgct=0을 store에 굳히지 않도록, **세액 0이면 cgct를 undefined로** 둠.
```ts
function computeTaxPatch(next: PriorGift): Partial<PriorGift> {
  if (userTouchedTax) return {};
  const tax = autoComputePriorGiftTax(next.giftAmount ?? 0, next.doneeRelation);
  if (next.beneficiaryType === "corporate") {
    return { corporateGiftComputedTax: tax > 0 ? tax : undefined, giftTaxPaid: 0, giftTaxBase: undefined };  // ← 0이면 undefined
  }
  return { giftTaxPaid: tax };
}
```
- 본질 해결은 변경 1(0도 fallback). 변경 2는 신규 0 잔재 예방 (방어적). 기존 데이터엔 변경 1이 작동.

### 변경 3 — 라벨 "⑩a 상속인외 증여세 산출세액" (결과표 통일)

`GiftRowEditor.tsx:360-364` 라벨 분기:
```ts
label={
  isCorporate
    ? "⑩a 상속인외 증여세 산출세액"        // ← 변경 (구: "§3의2② 산출세액 상당액 (자동·수정 가능)")
    : "기납부 증여세 (자동·수정 가능)"
}
```
- **근거**: 결과 화면 상속인별 집계표 `lib/calc/heir-allocation-summary.ts:384`
  `rowId: "row-10a-corpGiftTax", rowNo: "⑩a", label: "증여세 산출세액"` 와 명칭 통일.
  "상속인외" = 영리법인이 상증법 §13①2호 **상속인 아닌 자**임을 입력 단계에서 명시.
- **표기 통일 노트**: 결과표가 원문자 **⑩a**를 사용 → 입력란도 **⑩a**로 통일 (사용자 표기 "10a"와 동일 의미, 원문자로 일관).
  사용자가 아라비아 숫자 "10a"를 선호하면 즉시 전환 가능 (1줄).
- "(자동·수정 가능)" 문구는 라벨에서 제거하고 **hint로 이동** — `§4의2③ 비과세 · §3의2② 면제 한도 분자. 증여재산가액·관계로 자동 산출(수정 가능).`
  (§3의2② 법령 정보는 hint에 보존.)

---

## 2. 영향 범위 — 14 동기화 지점 점검

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① 폼 상태 | — | 무 | `corporateGiftComputedTax?: number` 기존 (`inheritance-gift.types.ts:528`) |
| ② initial | — | 무 | |
| ③ normalize | — | 무 | |
| **④ API 변환** | ✅ | `applyCorporateGiftTaxFallback` 조건 `\|\| <= 0` | `lib/calc/prior-gift-auto-tax.ts` |
| **⑤ UI 위젯** | ✅ | `corpNeedsFallback` 조건 + 라벨 + hint + `computeTaxPatch` 0→undefined | `GiftRowEditor.tsx` |
| ⑥ 사이드바 | — | 무 (AggregationSummary `cgct ?? 0` 은 fallback된 input 미경유 — 확인 필요) | `AggregationSummary.tsx:39` |
| ⑦ 결과 카드 | — | 무 | row-10a 라벨 이미 "⑩a 증여세 산출세액" |
| **⑧ Validation** | ✅(검증만) | 코드 무변경. fallback 후 통과 anchor로 고정 | `inheritance-validate.ts:121` |
| ⑨~⑭ Zod/Route | — | 무 | `property-valuation-input.ts:422,498` `cgct nonnegative().optional()` — 0·150m 모두 허용 |

> ⚠️ ⑥ **확인 필요**: `AggregationSummary.tsx:39`가 `form.priorGifts`의 raw cgct(0)를 직접 합산하면 사이드바도 0 표시 →
> 사이드바도 `applyCorporateGiftTaxFallback` 적용한 배열로 합산할지 Do 단계에서 실측 후 결정. (dual-truth 회피)

---

## 3. anchor 계획 (Pre-Do 우선)

기존 `__tests__/lib/calc/prior-gift-auto-tax.test.ts` 확장:
- **A1**: `applyCorporateGiftTaxFallback([cgct=0, 가액700m])` → `cgct=150,000,000` (변경 1-a, 현재 RED → GREEN)
- **A2**: `applyCorporateGiftTaxFallback([cgct=undefined])` → 150m (회귀 유지)
- **A3**: `applyCorporateGiftTaxFallback([cgct=150m])` → 150m 유지 (계산값 보존)
- **A4**: `applyCorporateGiftTaxFallback([cgct=0, 가액0])` → cgct **undefined 또는 0**(가액0이라 미채움) — 차단 위임

`__tests__/components/gift-donee-select.test.tsx` 확장:
- **A5** (UI 표시): 기존 영리법인 데이터 **cgct=0** + 가액 700m 진입 → 세액란 **150,000,000** 표시 (변경 1-b)
- **A6** (라벨): 영리법인 행 라벨 텍스트 **"⑩a 상속인외 증여세 산출세액"** 존재 (변경 3)
- **A7** (computeTaxPatch): 가액 0 영리법인 선택 → cgct **undefined**(0 아님) 저장 검증은 핸들러 단위 — 가능 시 (변경 2)

엔진 회귀:
- **A8**: `validateInheritanceTaxInput` — fallback 후 cgct=0이던 입력이 150m로 채워져 통과 (⑧ 모순 0)

---

## 4. 검증 기준 (DoD)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/lib/calc/prior-gift-auto-tax.test.ts __tests__/components/gift-donee-select.test.tsx` GREEN
- [ ] `npm run test:inheritance` 회귀 0 + components/lib 회귀 0
- [ ] ⑥ AggregationSummary 사이드바 합계 실측 (0 표시 시 fallback 배열 적용)
- [ ] 브라우저 E2E (`e2e/*.spec.ts`): 영리법인 700m 진입 → 산출세액 150m 표시 + 라벨 "⑩a 상속인외 증여세 산출세액"
- [ ] single-source: 표시·API fallback 동일 조건(`undefined || <= 0` + 가액>0) + 동일 산식(`autoComputePriorGiftTax`)

## 5. 리스크 / 대안
- **R1 (수용)**: 사용자가 세션 중 영리법인 세액을 직접 0으로 수정 → 재진입 시 자동 150m 복원. 영리법인 가액>0에서 세액 0은 법적 비정상이라 복원이 정확. userTouchedTax는 세션-local 의도이므로 영속 의도와 구분 불필요.
- **R2 (대안)**: cgct를 store에 저장하지 않고 표시·API 모두 항상 derive (수정 불가 read-only). 사용자 의도("자동 표시")엔 부합하나 동일인 합산·세대생략 복잡 케이스 수정 여지 상실 → **현 단계 미채택**(수정 가능 유지). 향후 필요 시 인터뷰.
- **R3**: 라벨 표기 ⑩a vs 10a — 결과표 통일 위해 ⑩a 채택. 사용자 선호 시 1줄 전환.

## 6. 작업 순서 (Do)
1. anchor A1~A8 작성 → A1·A5 RED 확인 (Pre-Do)
2. 변경 1-a (API) → 1-b (표시) → 1-c 검증 anchor → 변경 2 (computeTaxPatch) → 변경 3 (라벨·hint)
3. ⑥ 사이드바 실측 → 필요 시 fallback 적용
4. tsc + test:inheritance + 회귀
5. E2E 1건
6. 커밋(한국어) + 푸시
