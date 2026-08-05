# UI 설계 — 증여세 대납(代納) Gross-up 순환계산

> **Feature**: 증여자가 수증자의 증여세를 대신 납부할 때, 대납세액이 §36 채무변제 증여로
> 재차증여가 되어 수렴할 때까지 반복 계산하는 Gross-up UI
> **계획서**: `docs/00-pm/gift-donor-paid-tax-grossup.plan.md`
> **엔진 설계**: `docs/02-design/features/gift-donor-paid-tax-grossup.engine.design.md`
> **작성일**: 2026-06-21
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `e2e/gift-donor-paid-grossup.spec.ts` + 대납 gross-up anchor 테스트 실재.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: Design (Do 미착수)~~
> **법령 검증**: 계획서 §1 KoreanLaw MCP 검증 기준 준용 (MST 276123 시행 20260102)

---

## 0. 전제 — 실측 구조 요약

엔진 설계서의 "부록. 핵심 anchor 파일:line"에서 확인한 실측 파일 경로.

| 파일 | 역할 | 실측 확인 |
|---|---|---|
| `components/calc/gift-tax-form-shared.tsx` | `FormState`(:44) · `INITIAL_FORM`(:104) · `STEPS`(:130) · `validateStep`(:246) | ✅ |
| `components/calc/GiftTaxForm.tsx` | 마법사 오케스트레이터 | ✅ |
| `components/calc/gift/GiftCreditChecklist.tsx` | Step4(공제·세액공제) 컴포넌트 — 대납 토글 배치 위치 | ✅ |
| `lib/calc/gift-api.ts` | ④ API 변환 `buildGiftTaxInput`(:40) — 명시 객체 리터럴 return(:83~108) | ✅ |
| `lib/validators/property-valuation-input.ts` | ⑫ Zod 스키마 `giftTaxInputSchema`(:493-571) | ✅ |
| `app/api/calc/gift/route.ts` | ⑭ Route handler, 현재 `:70` calcGiftTax 호출 | ✅ |
| `components/calc/results/GiftTaxResultView.tsx` | ⑦ 결과 화면 · `availablePrintIds` Set(:260) | ✅ |
| `lib/print/gift-print-sections.ts` | `GiftPrintSectionId`(:30) union · `GIFT_PRINT_SECTIONS`(:55) 트리 | ✅ |
| `lib/tax-engine/types/inheritance-gift.types.ts` | `GiftTaxInput`(:575-616) · `GiftTaxResult`(:618-733) | ✅ |
| `lib/tax-engine/gift-tax.ts` | STEP3 주입 지점(:167-168) · STEP7 §57(:237-245) · STEP9 finalTax(:280-288) | ✅ |
| `lib/tax-engine/gift-tax-filing-form-besshi10.ts` | `derivePriorGiftAddition`(:67-78) · ㉔(:125) | ✅ |

### 현행 갭

- `GiftTaxInput`에 `donorPaysGiftTax`·`donorHasJointLiability` 필드 없음 → 대납 시나리오 전혀 지원 안 됨.
- `calcGiftTax`(:70)가 대납 전용 gross-up 없이 그대로 호출됨.
- `GiftCreditChecklist.tsx`에 대납 토글 없음.
- `GiftTaxResultView.tsx` availablePrintIds에 `"donor-paid-grossup"` leaf 미등록.

---

## 1. 사용자 시나리오 (법령 본문·단서·각호 전수)

### S-1. 기본 케이스 — 비연대 대납 (전형, C-2)

1. Step 0: 증여일 `2025-01-15`, 증여자 `부(father)`.
2. Step 1: 현금 500,000,000원 증여재산 입력.
3. Step 3(공제·세액공제): "증여자가 수증자의 증여세를 대납하나요?" **ToggleCard ON**.
   - 하위 "연대납세의무자(§4의2⑥)로서 대납하나요?" → **OFF** (비연대).
   - 신고세액공제(§69): ON (기본값).
4. 계산 클릭 → 결과 화면:
   - 결정세액 102,609,309원 *(Pre-Do 실측 후 확정 — 확인 필요)* (gross-up 수렴값).
   - "대납 Gross-up" 강조 섹션: 원래 순증여 500,000,000 → + 대납세액 102,609,309 *(확인 필요)* → 총 602,609,309 *(확인 필요)*.
   - 수렴 반복 횟수 표시.

> ⚠️ **수치 미검증 (확인 필요)**: 아래 102,609,309·602,609,309 등 C-2 수치는 §11 line 끝의 자체 주의("단일세율 닫힌형 산식은 구간 교차로 부적합")대로 닫힌형 검산이 불가능하다(baseline 20% 구간 → 수렴 후 30% 구간 교차). 반복식(STEP G-2) Pre-Do anchor 실측 전까지 **단정 금지** — S-1·C-2·§11·§12 A-2·§13 E-1 정규식 전 지점에 동일 표기. E2E 정규식(§13)은 실측 확정 전 도입 금지.

### S-2. 연대납세의무자 대납 — gross-up 미적용 (C-3)

⚠️ **토글 의미 정정 (critical — §4의2⑥ 단서)**: 본 토글의 쟁점은 "대납세액(§36 재차증여) 자체에 연대납세의무가 있는가"가 **아니다**. KoreanLaw 검증 결과 §4의2⑥ 단서는 "제35조부터 제39조까지"를 연대납세의무 대상에서 제외하며, §36(채무면제 등에 따른 증여)이 그 제외 범위에 명문 포함된다(MST 276123 시행 20260102 본문 확인). 따라서 §36 재차증여(=대납세액)에는 연대납세의무가 성립할 여지가 법문상 아예 없다. 토글의 진짜 의미는 **"최초 증여(현금 5억, §4①1호 일반증여)"에 대해 증여자가 §4의2⑥1~3호 연대납세의무자였는가**이다. 그 경우 연대의무자의 대납은 (재차증여가 아니라) 자기 연대채무의 변제이므로 §36 재차증여가 성립하지 않아 gross-up을 적용하지 않는다.

1. 동일 조건 + "(최초 증여에 대해) 연대납세의무자(§4의2⑥1~3호)였나요?" → **ON**.
2. 결과 화면: gross-up 미적용 안내. 단, 안내문의 근거를 §4의2⑥(연대의무 성립조항)만으로 단정하지 말 것 — §4의2⑥은 연대의무 성립 요건·제외만 규정할 뿐 "대납=재차증여 여부"를 정하는 조문이 아니다. "대납=재차증여 비해당"의 직접 근거(국세청 해석례 또는 §36 적용배제 논거)를 본칙까지 추적해 병기하거나 **"확인 필요"**로 표기 (§2 C-3·5-3 동일).
3. 결정세액 77,600,000원 (비대납 baseline).

### S-3. 대납 토글 OFF (기본값, C-1)

- 토글이 OFF이면 현행과 완전히 동일 — 기존 anchor 회귀 무변경.

### S-4. 입력 차단 조합 (C-7·C-8·C-11 — scope 제외)

아래 3조합 입력 시 대납 ToggleCard ON을 차단하거나 ⑧ validateStep에서 오류 반환.

| 조합 | 조건 | 차단 메시지 |
|---|---|---|
| C-7: 2-스트림 특례 + 대납 | `specialTreatment !== ""` AND 대납 ON | "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다." |
| C-8: 세대생략 + 대납 | `donor === "grandparent"` AND 대납 ON | "세대생략(조부모 증여) 케이스의 대납(代納) 계산은 현재 지원하지 않습니다." |
| C-11: 동시증여 + 대납 | `simultaneousGifts.length > 0` AND 대납 ON | "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다." |

**차단 근거**:
- C-7: 2-스트림 경로 `aggregatedOrdinaryValue`(:573)에 `_donorPaidTaxAddition` 미주입 → line 167-168 미도달로 gross-up 침묵 미적용 (엔진 설계 STEP G-6).
- C-8: `grossGiftValue`(STEP1 고정값)가 §57 할증 임계·비율 판정에 사용되어 gross-up 가산분이 §57에 미반영 → 세대생략+대납 수렴값 불일치 (엔진 설계 STEP G-5 (b) 확정).
- C-11: 동시증여 `currentNetGiftValue` 분자·분모 기준(:183)이 대납 가산분과 충돌 → 공제 안분 1회 동결 원칙과 모순 (엔진 설계 §3.5).

---

## 2. 케이스 매트릭스 (법령 본문·단서·각호 전수 enumerate)

§36·§47②·§4의2⑥(본문+단서 3호)·§57·§69②·상증령(상증법 시행령) §46①2호 전수 열거.

| # | 시나리오 | 법령 근거 | donorPaysGiftTax | donorHasJointLiability | gross-up | UI 거동 | anchor 기대값 |
|---|---------|----------|:---:|:---:|:---:|---|---|
| C-1 | 대납 OFF (기본값) | — | false | — | 미적용 | 토글 OFF = 현행 동일 | finalTax=77,600,000 |
| C-2 | 비연대 대납 전형 (현금 5억) | §36·§47②·§56·§69② | true | false | **적용** | 결과 강조 섹션 + 대납세액·수렴 횟수 표시 | donorPaidTax=102,609,309 ±1 *(Pre-Do 실측 후 확정 — 확인 필요)* |
| C-3 | (최초 증여) 연대납세의무자 대납 | §4의2⑥1~3호·해석(번호·본문 확인 필요) | true | true | 미적용 | 안내 문구 표시, 결정세액=baseline | finalTax=77,600,000, applied=false |
| C-4 | 의제증여(§4의2⑥ 단서) 수증 후 대납 | §4의2⑥ 단서 | true | false | **적용** | gross-up 적용 (아래 단서 참조) | applied=true |
| C-5 | 30억 최고구간(50%) 대납 | §56·§69② | true | false | **적용** | 수렴 iterations≤100 | iterations≤100, tolerance≤1 |
| C-6 | 사전증여 합산 동반 대납 | §47②·§36·§58① | true | false | **적용** | §58 한도 변화 포함 표시 | anchor: Pre-Do 실측 후 확인 필요 |
| C-7 | 2-스트림 특례 + 대납 **차단** | §30의6·§36 | true | false | 차단 | validateStep 오류 반환 | Zod safeParse 실패 |
| C-8 | 세대생략 + 대납 **차단** | §57·§46의3② | true | false | 차단 | validateStep 오류 반환 | Zod safeParse 실패 |
| C-9 | 공제 동결 확인 — 회차 무관 | §53·상증령 §46①2호 | true | false | **적용** | (내부 동작 검증 — UI 별도 없음) | 각 회차 deduction 불변 |
| C-10 | besshi10 ㉓ 오귀속 방지 | §47② | true | false | **적용** | 신고서 ㉓=실제사전증여만 | ㉓=0 (사전증여 없는 케이스) |
| C-11 | 동시증여 + 대납 **차단** | 상증령 §46①2호 | true | false | 차단 | validateStep 오류 반환 | Zod safeParse 실패 |
| C-12 | 의제증여 유형 + 연대토글 강제 OFF | §4의2⑥ 단서 | true | false | **적용** | 안내 카드 노출 | applied=true |

**규칙**: 행≥1 없으면 Do 진입 금지. C-6·A-4는 Pre-Do anchor 실측 후 기대값 채움.

⚠️ **C-3 vs C-4·C-12 — 두 축 분리 (critical)**: `donorHasJointLiability`(=donor의 연대납세의무 보유 여부)는 **최초 증여의 성격**에 따라 결정되는 별개 축이다. §36 재차증여(=대납세액) 자체는 §4의2⑥ 단서(§35~§39 제외)로 항상 연대의무 불성립이므로, "의제증여 단서 → 연대의무 불성립 → 항상 재차증여"라는 C-4·C-12 서술을 §36 재차증여에 직접 결부하지 말 것. C-3(미적용)은 **최초 증여**에 대해 donor가 §4의2⑥1~3호 연대의무자였던 경우이고, C-4·C-12(적용)는 최초 증여가 §4의2⑥ 단서 의제증여 유형이어서 donor에게 연대의무가 성립하지 않은 경우다. 두 케이스 모두 "대납=§36 재차증여"라는 결론의 직접 근거는 §4의2⑥이 아니라 §36 적용 논거·해석례이므로 본문까지 추적 후 인용하거나 "확인 필요"로 표기.

---

## 3. 14개 동기화 지점 매핑표

신규 필드 `donorPaysGiftTax`·`donorHasJointLiability` 14지점 전수.
`_donorPaidTaxAddition`은 내부 전용 — 외부 지점 해당 없음.

| 지점 | 파일 (실측 경로) | 변경 내용 | 담당 |
|---|---|---|---|
| ① FormData 타입 | `components/calc/gift-tax-form-shared.tsx:44` (`FormState` interface) | `donorPaysGiftTax?: boolean`, `donorHasJointLiability?: boolean` 추가 | UI |
| ② initial value | `gift-tax-form-shared.tsx:104` (`INITIAL_FORM`) | `donorPaysGiftTax: false`, `donorHasJointLiability: false` | UI |
| ③ normalize | N/A — gift 폼에 필드 수준 normalize 함수 없음 (실측). `GiftTaxForm.tsx:67` `{...INITIAL_FORM(prev), ...restored}` 스프레드가 담당 → ② 기본값 추가로 충족. `normalizeRestoredFormDates`(GiftTaxForm.tsx:66)는 Date 복원 전용, 무관. | 신규 boolean은 ② 기본값으로 자동 처리 | UI |
| ④ API 변환 | `lib/calc/gift-api.ts:83-108` `buildGiftTaxInput` return 명시 객체 리터럴 | `donorPaysGiftTax: form.donorPaysGiftTax`, `donorHasJointLiability: form.donorHasJointLiability` 명시 키 추가 (⑬과 동일 함수, spread 아님 — `feedback_explicit_prop_mapping_strip`) | UI |
| ⑤ UI 위젯 | `components/calc/gift/GiftCreditChecklist.tsx` | Step4(공제·세액공제) 하단에 `ToggleCard` "대납(代納)" 추가 + 하위 연대의무 `ToggleCard`. 상세: §4절 | UI |
| ⑥ 사이드바 합계 | N/A — 증여 마법사에 입력 사이드바 미존재 (실측: `GiftTaxForm.tsx` 단일 컬럼, sidebar/sticky 0건, `computeGiftSummary` 0건). "예상 대납세액"은 엔진 반복 필요로 입력 중 미리보기 불가 → 사이드바 신설 불적합. 별도 작업으로 분리. | 해당 없음 (N/A) | N/A |
| ⑦ 결과 카드 | `components/calc/results/GiftTaxResultView.tsx` | `donorPaidTaxGrossUp` 전용 섹션 렌더 + 선택출력 leaf id 가드. 상세: §5절 | UI |
| ⑧ validation | `gift-tax-form-shared.tsx:246` (`validateStep`) — **`lib/calc/gift-validate.ts`는 실측 부재**(lib/calc에 gift validate 파일 없음). 증여세 검증은 validateStep 인라인. | 대납 ON + {동시증여·2-스트림·세대생략} 3조합 차단. Zod superRefine ⑫와 동일 메시지. 상세: §6절 | UI |
| ⑨ Zod enum | N/A — 신규 필드는 boolean, enum 해당 없음 | — | — |
| ⑩ Zod enum 컴패니언 | N/A | — | — |
| ⑪ 자산-수준 acquisitionDate fallback | N/A | — | — |
| ⑫ **Zod 입력 객체** | `lib/validators/property-valuation-input.ts:493-571` (`giftTaxInputSchema` z.object 본문 :494-522) | `donorPaysGiftTax: z.boolean().optional()`, `donorHasJointLiability: z.boolean().optional()` — `isSubstituteGift`(:514) 인근 추가. **+ `.superRefine`으로 3조합 교차필드 차단 필수** (직접 API 호출 우회 방어 — §6절 참조). route.ts:13은 import만이므로 여기 추가 필수. | 엔진 |
| ⑬ **명시 반환 객체** | `lib/calc/gift-api.ts:83-108` | spread 아님 — 명시 객체 리터럴 return. `donorPaysGiftTax`·`donorHasJointLiability`를 return 객체에 **명시 키**로 직접 추가(누락 시 TS 미감지 silent strip — `feedback_explicit_prop_mapping_strip`). ④와 동일 함수. grep 자가점검 필수. | UI |
| ⑭ **Route handler** | `app/api/calc/gift/route.ts:64-70` | `parsed.data` 통째 cast 후 엔진 전달 → boolean은 ⑫ Zod 통과 시 자동 전달. **할 일은 `calcGiftTax` → `calcGiftTaxWithDonorPaidTax` 함수 교체뿐** (동일 시그니처, 하위 호환). | 엔진 |

⚠️ ⑫⑬⑭ TypeScript 미감지 — grep 자가 점검 필수 (`feedback_api_zod_schema_sync`).
⚠️ `_donorPaidTaxAddition`은 Zod 스키마·API body·UI에 절대 노출 금지 (엔진 내부 전용).

---

## 4. UI 위젯 상세 설계 — ⑤ 지점 (`GiftCreditChecklist.tsx`)

### 4-1. 배치 위치 및 순서

엔진 계산 순서 = UI 순서 원칙 (`feedback_ui_order_follows_logic`):

- STEP G-0(게이트) → STEP G-1(baseline) → STEP G-2(반복) → STEP G-3(주입) → STEP G-4(공제 동결) → STEP G-5(§57) → STEP G-9(finalTax)
- 대납 토글은 신고세액공제(§69, `isFiledOnTime`)와 직접 연관 (대납액 = finalTax = §69 후 결정세액).
- **배치**: `GiftCreditChecklist.tsx`에서 신고세액공제 `ToggleCard` 바로 **하단**에 배치.
- `isFiledOnTime` ToggleCard → 대납 ToggleCard(하단) 순서.

### 4-2. 대납 ToggleCard 설계

```tsx
{/* 증여자 대납(代納) — §36 재차증여 gross-up (§4의2⑥ 비연대 대납 시) */}
<ToggleCard
  tone="violet"
  title="증여자가 수증자의 증여세를 대납(代納)합니까?"
  description="대납세액은 §36 채무변제 증여로 재차증여가 됩니다. 수렴할 때까지 반복 계산합니다. (비연대 대납 시 §36 재차증여 — 국세청 해석례 본문·문서번호 확인 필요)"
  checked={form.donorPaysGiftTax ?? false}
  onCheckedChange={(v) => set({ donorPaysGiftTax: v, donorHasJointLiability: v ? (form.donorHasJointLiability ?? false) : false })}
>
  {/* 연대납세의무 하위 토글 — 대납 ON일 때만 렌더 */}
  <div className="space-y-3 pt-1">
    <ToggleCard
      tone="amber"
      title="(최초 증여에 대해) 연대납세의무자(§4의2⑥1~3호)였습니까?"
      description="최초 증여에 대해 증여자가 연대납세의무자(수증자 주소 불명·납부능력 없음·비거주자 요건)였던 경우, 그 대납은 자기 연대채무 변제이므로 재차증여가 아니어서 gross-up을 적용하지 않습니다. (대납=재차증여 비해당의 직접 근거 — 해석례 본문 확인 필요)"
      checked={form.donorHasJointLiability ?? false}
      onCheckedChange={(v) => set({ donorHasJointLiability: v })}
    />
    {/* 연대 ON → 안내 배지 */}
    {(form.donorHasJointLiability ?? false) && (
      <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        (최초 증여에 대한) 연대납세의무자로서 대납한 증여세는 자기 연대채무 변제로
        재차증여에 해당하지 않습니다. (연대의무 성립 근거: 상증법 §4의2⑥1~3호 /
        대납=재차증여 비해당의 직접 근거: 국세청 해석례 — 본문·문서번호 확인 필요)
        Gross-up을 적용하지 않고 계산합니다.
      </div>
    )}
    {/* 의제증여 유형(§4의2⑥ 단서) 안내 — MVP에서는 연대토글 false 고정·안내만 */}
    {/* (§35~§42의3·§45·§45의3~5·§48 등 해당 시 연대의무 성립 불가 → 항상 재차증여) */}
    {/* 별도 UI 진입점 없음 — 향후 의제증여 타입 enum 추가 시 확장 */}
  </div>
</ToggleCard>
```

**정책 준수**:
- native checkbox/radio 신규 사용 금지 → `ToggleCard` 필수 (`feedback_toggle_card_visibility`).
- OFF 상태에도 tone(violet) 배경 유지 (`components/calc/CLAUDE.md` 토글 가시성 원칙).
- `donorPaysGiftTax` 기본값 false → OFF 상태에서 기존 계산과 100% 동일 동작.
- `donorHasJointLiability` 기본값 false → 미입력 시 비연대(gross-up 적용) — `feedback_no_unfavorable_application_without_legal_basis` 준수(default=유리: 연대=재차증여 면제이므로 미입력=비연대=gross-up=납세자 실제 상황 반영).

### 4-3. 차단 조합 시 비활성 처리

C-7(2-스트림)·C-8(세대생략)·C-11(동시증여) 조합에서 대납 토글이 ON이면 **validateStep에서 오류 반환**으로 계산 차단. 토글 자체는 비활성(disabled)하지 않음 — 사용자가 ON으로 놓고 계산 시 오류 메시지로 안내.

대납 ToggleCard에 `disabledReason`은 추가하지 않음 (조합에 따라 동적이므로 validateStep에서 처리).

### 4-4. 입력 컴포넌트 준수 사항

- 대납세액 금액 직접 입력 없음 — 엔진 반복으로 자동 계산.
- 추가 CurrencyInput/DecimalInput 없음 (boolean 2개만).
- `useEffect → store` 미러링 금지 — `donorPaysGiftTax`·`donorHasJointLiability` 간 연동은 `onCheckedChange` 내 동기 set으로 처리 (`feedback_useeffect_store_mirror_forbidden`).

---

## 5. 결과 카드 설계 — ⑦ 지점 (`GiftTaxResultView.tsx`)

### 5-1. 선택출력(PrintSelectionPanel) 동기화

4단계 필수 작업 (`project_selective_print_6tax_series`):

1. **`GiftPrintSectionId` union 확장** (`lib/print/gift-print-sections.ts:30`):
   현재 union 14종에 `"donor-paid-grossup"` 추가.

2. **`GIFT_PRINT_SECTIONS` 트리 leaf 추가** (`gift-print-sections.ts:55`):
   ```ts
   // group:summary 내 tax-credit(:64) 바로 다음에 추가
   { id: "donor-paid-grossup", label: "대납 Gross-up 상세 (§36·§47②)", channel: SCREEN },
   ```
   channel: `SCREEN` only (계산 복잡도 내역 — PDF 채널은 이번 PR 미포함).

3. **`availablePrintIds` Set 조건 추가** (`GiftTaxResultView.tsx:260`):
   ```ts
   if (result.donorPaidTaxGrossUp?.applied) s.add("donor-paid-grossup");
   ```
   렌더 가드와 1:1 대응 필수 — 미등록 id 렌더 가드 불일치 방지.

4. **JSX `<PrintSection id="donor-paid-grossup" ...>` 감싸기**:
   아래 §5-2 섹션 JSX 전체를 감쌈.

### 5-2. 대납 Gross-up 결과 섹션 (JSX 상세)

**배치 위치**: `PrintSection id="tax-credit"` (세액공제) 바로 다음. applied=true일 때만 렌더.

```tsx
{result.donorPaidTaxGrossUp?.applied && (
  <PrintSection id="donor-paid-grossup" selectedIds={selectedPrintIds}>
    <div className="rounded-xl border border-violet-300 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 overflow-hidden">
      {/* 헤더 */}
      <div className="bg-violet-100/80 dark:bg-violet-900/40 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
          대납 Gross-up 순환계산 (§36·§47②)
        </h4>
        <div className="flex flex-wrap gap-1">
          <LawArticleModal legalBasis="상증법 §36" label="§36 채무면제 증여" />
          <LawArticleModal legalBasis="상증법 §47" label="§47② 합산" />
          <LawArticleModal legalBasis="상증법 §4의2" label="§4의2⑥ 연대의무" />
        </div>
      </div>

      {/* 강조 블록 — "대납 포함 총 증여규모" */}
      <div className="px-4 py-4 border-b border-violet-100 dark:border-violet-800">
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-1">
          대납 포함 총 증여규모 (수렴값)
        </p>
        <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">
          {formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)}
        </p>
        {/* 흐름 표시: A → +대납세액 → V* */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>원래 순증여</span>
          <span className="font-mono">{formatKRW(result.donorPaidTaxGrossUp.originalNetGift)}</span>
          <span>+</span>
          <span>대납세액(재차증여)</span>
          <span className="font-mono text-violet-700 dark:text-violet-300">
            {formatKRW(result.donorPaidTaxGrossUp.donorPaidTax)}
          </span>
          <span>→</span>
          <span className="font-mono font-semibold">
            {formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)}
          </span>
        </div>
        {/* 비대납 대비 증가분 */}
        <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
          비대납 결정세액 {formatKRW(result.donorPaidTaxGrossUp.baselineTax)} 대비{" "}
          +{formatKRW(result.donorPaidTaxGrossUp.donorPaidTax - result.donorPaidTaxGrossUp.baselineTax)} 추가
        </p>
      </div>

      {/* 산식 상세 (한국어 풀어쓰기 — feedback_result_view_korean_formula) */}
      <div className="divide-y divide-violet-100 dark:divide-violet-800">
        <Row
          label="원래 순증여가액 (비과세·부담부 채무 차감 후)"
          value={formatKRW(result.donorPaidTaxGrossUp.originalNetGift)}
        />
        <Row
          label="대납세액 (§36 재차증여가액 = §69② 신고세액공제 후 결정세액)"
          value={formatKRW(result.donorPaidTaxGrossUp.donorPaidTax)}
        />
        <Row
          label="대납 포함 합산 과세가액"
          value={formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)}
          highlight
        />
        <Row
          label="수렴 반복 횟수"
          value={`${result.donorPaidTaxGrossUp.iterations}회`}
        />
        <Row
          label="비대납 결정세액 (기준값)"
          value={formatKRW(result.donorPaidTaxGrossUp.baselineTax)}
          sub
        />
      </div>

      {/* 안내 문구 — 중립 표현 (feedback_tax_calculation_principle) */}
      <div className="px-4 py-3 text-xs text-violet-600 dark:text-violet-400">
        증여자가 대납한 증여세는 §36에 따라 수증자가 채무(증여세 납부의무)를 면제받은 이익으로,
        재차증여가액이 되어 §47②에 따라 과세가액에 가산·재계산합니다.
        수렴 조건: 인접 회차 결정세액 차이 1원 미만 (최대 100회).
      </div>
    </div>
  </PrintSection>
)}
```

**납세자 유불리 표현 금지** (`feedback_tax_calculation_principle`):
- "절세", "절감", "불리" 표현 금지.
- "수렴할 때까지 반복" 등 중립 사실 서술만.

### 5-3. 연대납세의무자 대납(gross-up 미적용) 결과 표시

`applied === false` AND `reasonNotApplied === "joint_liability"` 시:

⚠️ **회귀 주의 (C-1 toggle_off 무변경 보장)**: 엔진 설계 STEP G-0/A-1(engine.design.md line 365-366, 518)은 게이트 OFF인 **모든** 경우(연대 ON뿐 아니라 순수 대납토글 OFF=C-1, 즉 현행 모든 일반 증여계산)에 `donorPaidTaxGrossUp = { applied:false, reasonNotApplied:... }` 객체를 채운다. 따라서 amber 안내 카드 렌더 게이트는 `applied === false`만으로는 **부족**하며 반드시 `reasonNotApplied === "joint_liability"`까지 검사해야 한다(아래 JSX 반영). 그렇지 않으면 `donorPaysGiftTax=false`인 모든 일반 증여계산에서 amber 카드가 항상 표시되어 §S-3(line 60-62) "토글 OFF = 현행 완전 동일" 및 DoD "기존 gift anchor 회귀 없음"과 모순된다. toggle_off(C-1)에서 amber 카드·gross-up 섹션이 절대 렌더되지 않음을 anchor/E2E로 회귀 검증할 것. (대안: 엔진이 순수 toggle_off에는 `donorPaidTaxGrossUp` 자체를 undefined로 두도록 설계 정정해 두 문서를 일치시키는 방법도 가능 — 채택 시 본 게이트와 함께 정합 유지.)

```tsx
{result.donorPaidTaxGrossUp &&
  !result.donorPaidTaxGrossUp.applied &&
  result.donorPaidTaxGrossUp.reasonNotApplied === "joint_liability" && (
  <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3 text-sm">
    <p className="font-semibold text-amber-800 dark:text-amber-200">
      대납 Gross-up 미적용
    </p>
    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
      (최초 증여에 대한) 연대납세의무자(§4의2⑥1~3호)로서 대납한 증여세는 자기 연대채무
      변제로 재차증여에 해당하지 않으므로 gross-up을 적용하지 않습니다.
      (대납=재차증여 비해당의 직접 근거: 국세청 해석례 — 본문·문서번호 확인 필요)
    </p>
  </div>
)}
```

### 5-4. besshi10 신고서 영향 — (a) 분리 echo 방식 확정

**Design 확정: (a) 분리 echo 방식.** (b) 신고서 원래 A 기준은 채택하지 않는다 (아래 근거).

실측 `derivePriorGiftAddition`(besshi10:67-78)은 ㉓ = `aggregatedGiftValue − (grossGiftValue − exemptAmount − debtAssumed)`로 산출한다(=netCurrent 역산). 부록 #2대로 대납세액을 `aggregatedGiftValue`에만 주입하면 ㉓에 대납가산분(`donorPaidTaxAddition`)이 그대로 섞여 들어가 C-10 오귀속(㉓ = 사전증여 없는데도 대납분만큼 양수)이 실제로 발생한다. 따라서 (a) 분리 echo로 **확정**하여 `derivePriorGiftAddition`의 netCurrent 역산식이 대납가산분을 제외하도록 한다.

**확정 산식** (대납가산분 분리):

```
㉓ = aggregatedGiftValue − donorPaidTaxAddition − (grossGiftValue − exemptAmount − debtAssumed)
```

즉 기존 역산식에서 `donorPaidTaxAddition`(=엔진이 echo로 노출하는 대납가산분)을 추가로 차감한다. 대납이 없는 케이스(`donorPaidTaxAddition === 0`)에서는 현행과 완전히 동일하므로 기존 besshi10 anchor 회귀 없음.

**UI 측 영향**: `GiftTaxFilingFormTable`(별지10호)에서 ㉓ 행 값이 도착하는 `result.filingFormRows`가 엔진 빌더에서 자동 보정됨 → **UI 무추가 변경**. (b)를 폐기하므로 "신고서 기준은 대납 전 순증여(A)" 안내 라벨 등 분기 설계는 본 설계에서 제외한다.

**검증**: Pre-Do anchor A-6(㉓=0, 사전증여 없는 C-2 케이스)을 (a) 확정 산식 기준으로 선검증.

### 5-5. 핵심 결과 카드 변경 (선택사항)

대납 gross-up 적용 시 핵심 결과 카드(`core-result` 섹션)에 간략 표시 추가를 검토:

```tsx
{/* 핵심 결과 카드 내 — applied=true 시 추가 표시 */}
{result.donorPaidTaxGrossUp?.applied && (
  <div className="mt-2 text-xs text-violet-600 dark:text-violet-400">
    대납 Gross-up 적용 (총 증여규모 {formatKRW(result.donorPaidTaxGrossUp.grossedUpNetGift)})
  </div>
)}
```

**Do 단계에서 결정** — 핵심 결과 카드 과밀화 여부 판단 후 적용.

---

## 6. Validation ⑧ 동기화 (`validateStep`)

⑧ `validateStep`(gift-tax-form-shared.tsx:246)에 대납 3조합 차단 추가.
Zod `superRefine`(⑫)과 **동일 메시지**로 양쪽 차단 — UI 통과↔validate 차단 모순 금지.

```typescript
// validateStep step === 3 (공제·세액공제 단계) 추가 규칙
if (step === 3) {
  const isDonorPaying =
    form.donorPaysGiftTax === true &&
    !(form.donorHasJointLiability === true);

  if (isDonorPaying) {
    // C-11: 동시증여 + 대납
    if ((form.simultaneousGifts?.length ?? 0) > 0) {
      return "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다.";
    }
    // C-7: 2-스트림 특례 + 대납
    if (form.specialTreatment !== "") {
      return "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다.";
    }
    // C-8: 세대생략(donor=grandparent) + 대납
    if (form.donor === "grandparent") {
      return "세대생략(조부모 증여) 케이스의 대납(代納) 계산은 현재 지원하지 않습니다.";
    }
  }
}
```

**정책 준수**:
- 자동 안분 fallback 금지 (`feedback_no_silent_apportion_fallback`): 대납액을 자동 추정 금지 — 엔진 반복으로만 산출.
- API fallback ↔ validation 동기화 (`feedback_validation_sync_8th_point`): boolean 기본값(false)은 양쪽 동일.

---

## 7. Zod superRefine ⑫ 교차필드 차단 (직접 API 호출 방어)

⑧ `validateStep`만으로는 `/api/calc/gift` 직접 호출을 막지 못함 → Zod `superRefine`으로 동일 차단.

`simultaneousGifts`는 `deductionInput` 하위(`gift-aux-schemas.ts:27`), `donorPaysGiftTax`는 top-level → `giftTaxInputSchema` 끝에 `.superRefine((data, ctx) => {...})` 추가.

```ts
// lib/validators/property-valuation-input.ts — giftTaxInputSchema superRefine 추가
const isDonorPaying =
  data.donorPaysGiftTax === true && data.donorHasJointLiability !== true;
if (isDonorPaying) {
  // C-11
  if (data.deductionInput?.simultaneousGifts?.length) {
    ctx.addIssue({ code: "custom", path: ["donorPaysGiftTax"],
      message: "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다." });
  }
  // C-7
  if (data.creditInput?.specialTreatment) {
    ctx.addIssue({ code: "custom", path: ["donorPaysGiftTax"],
      message: "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다." });
  }
  // C-8: getDonorGroup(data.donor) === "B" (엔진 헬퍼 재사용 — single-source-engine-helper)
  // ※ donor "grandparent" → getDonorGroup = "B" (세대생략 그룹)
  if (data.donor === "grandparent") {
    ctx.addIssue({ code: "custom", path: ["donorPaysGiftTax"],
      message: "세대생략(조부모 증여) 케이스의 대납(代納) 계산은 현재 지원하지 않습니다." });
  }
}
```

---

## 8. Silent fallback / 자동 안분 후보 식별

| 필드 | 빈값 처리 | 정책 |
|------|---------|------|
| `donorPaysGiftTax` | undefined → false (대납 OFF) | 기본값 — 자동 안분 아님 |
| `donorHasJointLiability` | undefined → false (비연대) | 기본값 — 자동 안분 아님 (납세자 유리 방향: 연대=재차증여 면제, 비연대=재차증여. 미입력=비연대=gross-up 적용 = 실제 상황 반영) |

- `_donorPaidTaxAddition`: 엔진 내부 초기값 0, 외부 미노출 — 자동 안분 해당 없음.
- **자동 안분 fallback 없음** (`feedback_no_silent_apportion_fallback` 준수).

---

## 9. Cross-field 동기화 → useEffect 금지

| 트리거 | 연동 대상 | 구현 패턴 |
|---|---|---|
| `donorPaysGiftTax` OFF → ON | `donorHasJointLiability` 초기화 불필요 (이전 값 보존) | onChange 내 set 동기 처리 |
| `donorPaysGiftTax` ON → OFF | `donorHasJointLiability: false` 리셋 | onChange 내 동기 set (useEffect 금지) |
| `donor` → "grandparent" (세대생략) | 대납 ON이면 validateStep에서 차단 — 토글 자동 OFF 금지 | validateStep에서 오류 반환 (useEffect 미러링 금지) |

**`useEffect → store` 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`):
- `donorPaysGiftTax` 변경 시 `donorHasJointLiability`를 useEffect로 자동 세팅 금지 → `onCheckedChange` 콜백에서 동기 세팅.

---

## 10. UI 순서 = 엔진 계산 로직 순서

| 엔진 STEP | UI 위치 |
|---|---|
| G-0: 게이트 판정 (`donorPaysGiftTax`, `donorHasJointLiability`) | Step4 GiftCreditChecklist — 신고세액공제(§69) 바로 아래 |
| G-1: baseline 계산 | (사용자 입력 없음 — 엔진 내부) |
| G-2: 반복 수렴 | (사용자 입력 없음 — 엔진 내부) |
| G-3: aggregatedGiftValue 주입 | (엔진 내부) |
| G-4: 공제 동결 | (사용자 입력 없음) |
| 결과: grossedUpNetGift, donorPaidTax, iterations, baselineTax | 결과 화면 "대납 Gross-up" 섹션 |

토글은 영향받는 필드(§69 신고세액공제) 직후에 배치 — 엔진에서 finalTax(§69 후)가 대납액 기준이므로 §69 토글 바로 다음 위치가 논리적으로 올바름.

---

## 11. 결과 산식 한국어 표기 (anchor 기대값 포함)

`feedback_result_view_korean_formula` 준수 — 변수 약어·`floor()` 금지.

**C-2 전형 케이스 산식 표기 (도달 목표값)**:

```
원래 순증여가액 (A)       500,000,000
+ 대납세액 (재차증여)    102,609,309   ← gross-up 후 결정세액
= 대납 포함 합산 과세가액 602,609,309

--- 산식 흐름 ---
① 합산 과세가액(A + 대납)    602,609,309
② 증여재산공제 (직계존속)   - 50,000,000
③ 과세표준                  552,609,309
④ 산출세액 (30% 구간, 누진공제 6,000만)
   = 552,609,309 × 30% - 60,000,000   = 105,782,792
⑤ 신고세액공제 3% (§69②)
   = 105,782,792 × 3%   ≈ 3,173,483 (절사)
⑥ 결정세액 (대납세액)      = 102,609,309
   검증: 500,000,000 + 102,609,309 = 602,609,309 ✓ (고정점)
```

⚠️ **구간 교차 주의**: baseline 과세표준 450,000,000은 20% 구간이나, 수렴 후 과세표준 552,609,309은 30% 구간으로 넘어간다. 단일세율 닫힌형 산식은 구간 교차로 부적합 → 반복식(STEP G-2)으로만 정확. anchor 기대값은 Pre-Do anchor 실측 후 확정.

---

## 12. Anchor 기대값 (Pre-Do 실측 선행 필수)

엔진 설계서 anchor 기대값과 동일 — UI 결과 카드가 표시하는 값과 1:1 대응.

| Anchor | 기대값 | UI 검증 지점 |
|---|---|---|
| A-1 (C-1 비대납 baseline) | `donorPaidTaxGrossUp.applied === false`, `finalTax === 77,600,000` | 결과 카드 결정세액 |
| A-2 (C-2 전형 대납) | `donorPaidTaxGrossUp.applied === true`, `donorPaidTax === 102,609,309 ±1` *(Pre-Do 실측 후 확정 — 확인 필요)*, `originalNetGift === 500,000,000`, `grossedUpNetGift === 602,609,309 ±1` *(확인 필요)* | 결과 강조 블록 + Row 표시 |
| A-3 (C-3 연대 OFF) | `applied === false`, `reasonNotApplied === "joint_liability"`, `finalTax === 77,600,000` | 연대 미적용 amber 안내 |
| A-4 (C-5 50% 구간) | `iterations ≤ 100`, `|최종 tax_n - tax_n-1| < 1` | 수렴 횟수 Row |
| A-5 (C-9 공제 동결) | 각 회차 deductionResult.totalDeduction 불변 | (엔진 테스트 — UI 별도 표시 없음) |
| A-6 (C-10 besshi10 ㉓) | ㉓=실제사전증여분만 (C-2: ㉓=0) | 별지10호 ㉓ 행 |

---

## 13. E2E 시나리오

파일: `e2e/gift-donor-paid-grossup.spec.ts` (신규)
포트: `E2E_PORT=3103` (`feedback_e2e_worktree_port_isolation`)

⚠️ **셀렉터 실측 정렬 (high)**: 아래 셀렉터는 기존 gift spec(`e2e/gift-burdened-debt.spec.ts`, `e2e/gift-57-proviso-substitute-gift.spec.ts`) 실측 패턴에 맞춰 작성했다. 실측 확인 사항: ① 경로는 `/calc/gift-tax`(`/gift` 아님), ② "다음" 버튼은 `{name: /^다음/}` 정규식(exact "다음" 아님), ③ 재산 추가 버튼 라벨은 `/증여재산 추가/`("재산 추가" 아님), ④ 증여자는 `select` 컴포넌트(`page.locator("select").first().selectOption({index:1})` = 父), ⑤ 자산 입력은 `estate-edit-dialog` testid 모달 + 값은 `dialog.getByRole("textbox",{name})`, 닫기는 `dialog.getByRole("button",{name:"닫기"})`, ⑥ 계산은 `calcAndWaitResult(page,{taxType:"gift"})` 헬퍼·증여일은 `fillDateAndVerify(page,{year,month,day})` 헬퍼. ⑦ **E-1의 대납세액 정규식(`/102,609,30[89]/`)은 §11 미검증 수치 — Pre-Do anchor 실측 확정 전 도입 금지**(실측값으로 교체 후 활성화).

### E-1. 전형 케이스 — 결과 섹션 표시 확인 (C-2)

```typescript
import { test, expect } from "@playwright/test";
import { fillDateAndVerify, calcAndWaitResult } from "./_helpers/tax-flow";

test("대납 gross-up 전형 케이스 — 결과 섹션 표시", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/calc/gift-tax");

  // Step 0: 증여일 + 증여자 select(index 1 = 父)
  await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step 1: 현금 5억 (현금은 자산명 면제)
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /현금$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /금액|시가/ }).fill("500000000");
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

  // Step 2 → Step3(공제·세액공제)
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step 3: 대납 토글 ON (연대의무 하위 토글은 OFF 기본값 유지)
  await page.getByText("증여자가 수증자의 증여세를 대납").click(); // ToggleCard
  await expect(page.getByText(/연대납세의무자/)).toBeVisible();

  // 계산 (헬퍼)
  await calcAndWaitResult(page, { taxType: "gift" });

  // 결과 검증
  await expect(page.getByText("대납 Gross-up 순환계산")).toBeVisible();
  await expect(page.getByText("대납 포함 총 증여규모")).toBeVisible();
  await expect(page.getByText("수렴 반복 횟수")).toBeVisible();
  // ⚠️ 대납세액 정규식은 Pre-Do 실측 확정 후 활성화 (미검증 수치 — §11):
  // await expect(page.getByText(/<실측값>/)).toBeVisible();
});
```

### E-2. 연대납세의무자 대납 — gross-up 미적용 (C-3)

```typescript
test("연대납세의무 ON → gross-up 미적용 안내", async ({ page }) => {
  // Step 0~2 동일 (E-1의 경로·select·헬퍼 패턴)...
  // Step 3: 대납 ON + 연대의무(최초 증여) ON
  await page.getByText("증여자가 수증자의 증여세를 대납").click();
  await page.getByText(/연대납세의무자/).click();

  await calcAndWaitResult(page, { taxType: "gift" });

  // 미적용 안내 확인
  await expect(page.getByText("대납 Gross-up 미적용")).toBeVisible();
  await expect(page.getByText(/연대납세의무자/)).toBeVisible();
  // 결정세액 77,600,000 (비대납 baseline)
  await expect(page.getByText("77,600,000")).toBeVisible();
});
```

### E-3. 차단 조합 — 동시증여 + 대납 (C-11)

```typescript
test("동시증여 + 대납 조합 → validateStep 차단", async ({ page }) => {
  // Step 3: 동시증여 ON + 대납 ON
  await page.getByText("같은 날 다른 증여자로부터").click();
  await page.getByText("증여자가 수증자의 증여세를 대납").click();

  // 계산 버튼 클릭 후 차단 메시지 (계산 진행 안 됨)
  await page.getByRole("button", { name: /계산/ }).click();

  // 오류 메시지 확인
  await expect(page.getByText("동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다.")).toBeVisible();
});
```

---

## 14. Definition of Done — 자가 점검

### 3대 핵심 정책

- [ ] `useEffect → store` 미러링 없음 — boolean 연동은 `onCheckedChange` 동기 set만
- [ ] 자동 안분 fallback 없음 — 대납액 자동 추정 금지, 엔진 반복으로만 산출
- [ ] API fallback ↔ validate ⑧ 동기화 — boolean 기본값(false) 양쪽 동일

### 14지점 체크리스트

| 지점 | 파일 | 완료 |
|---|---|---|
| ① FormData 타입 | `gift-tax-form-shared.tsx:44` `FormState` — `donorPaysGiftTax?: boolean`, `donorHasJointLiability?: boolean` | ☐ |
| ② initial value | `gift-tax-form-shared.tsx:104` `INITIAL_FORM` — `false`/`false` | ☐ |
| ③ normalize | N/A (② 기본값 + GiftTaxForm 스프레드로 충족) | ☑ N/A |
| ④ API 변환 | `lib/calc/gift-api.ts:83-108` — 명시 키 추가 | ☐ |
| ⑤ UI 위젯 | `GiftCreditChecklist.tsx` — 대납 ToggleCard + 연대의무 하위 ToggleCard | ☐ |
| ⑥ 사이드바 | N/A (증여 마법사 사이드바 미존재) | ☑ N/A |
| ⑦ 결과 카드 | `GiftTaxResultView.tsx` — Gross-up 섹션 + `availablePrintIds` 가드 | ☐ |
| ⑧ validation | `gift-tax-form-shared.tsx:246 validateStep` step 3 — 3조합 차단 | ☐ |
| ⑨ Zod enum | N/A (boolean) | ☑ N/A |
| ⑩ Zod enum 컴패니언 | N/A | ☑ N/A |
| ⑪ acquisitionDate fallback | N/A | ☑ N/A |
| ⑫ **Zod 입력객체** | `lib/validators/property-valuation-input.ts:493-571` — 2 boolean + superRefine | ☐ |
| ⑬ **명시 반환 객체** | `lib/calc/gift-api.ts:83-108` — 명시 키 (grep: `donorPaysGiftTax`, `donorHasJointLiability`) | ☐ |
| ⑭ **Route handler** | `app/api/calc/gift/route.ts:70` — `calcGiftTaxWithDonorPaidTax` 교체 | ☐ |

### 선택출력(PrintSelectionPanel) 동기화

- [ ] `GiftPrintSectionId` union에 `"donor-paid-grossup"` 추가 (`gift-print-sections.ts:30`)
- [ ] `GIFT_PRINT_SECTIONS` 트리에 leaf 추가 (`gift-print-sections.ts:55`)
- [ ] `availablePrintIds`에 `applied` 조건 가드 추가 (`GiftTaxResultView.tsx:260`)
- [ ] 섹션 JSX를 `<PrintSection id="donor-paid-grossup">` 감싸기

### besshi10 신고서

- [ ] (a) 분리 echo 확정 산식 적용: `derivePriorGiftAddition`에서 `donorPaidTaxAddition` 추가 차감 (§5-4)
- [ ] 별지10호 ㉓ 대납분 오귀속 방지 anchor(A-6, ㉓=0) 통과 확인

### 빌드·테스트

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts` 통과
- [ ] 기존 gift anchor(E10~E21) 회귀 없음
- [ ] `E2E_PORT=3103 npx playwright test e2e/gift-donor-paid-grossup.spec.ts` 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시

### ⑫⑬⑭ grep 자가 점검

```bash
# ⑫: Zod 스키마에 두 boolean 추가 확인
grep -n "donorPaysGiftTax\|donorHasJointLiability" \
  lib/validators/property-valuation-input.ts

# ⑬: gift-api.ts 명시 키 확인 (spread 아님)
grep -n "donorPaysGiftTax\|donorHasJointLiability" \
  lib/calc/gift-api.ts

# ⑭: route.ts 함수 교체 확인
grep -n "calcGiftTaxWithDonorPaidTax" \
  app/api/calc/gift/route.ts

# 내부 전용 필드 누출 확인 (0건이어야 함)
grep -n "_donorPaidTaxAddition" \
  lib/validators/property-valuation-input.ts \
  lib/calc/gift-api.ts
```

---

## 15. Do 단계 Phase (시퀀셜)

| Phase | 내용 | verify |
|---|---|---|
| Pre-Do | C-1·C-2 anchor 작성·실행 (실패 확보 — `feedback_pre_anchor_verification`) | 닫힌형 검산 102,609,309과 대조; 구간 교차로 단일세율 닫힌형 부적합 → 반복식 실측값 우선 |
| A (엔진) | 타입 2필드+echo + `calcGiftTaxWithDonorPaidTax` + STEP3 주입 | A-1~A-5 anchor 통과 |
| B (API/Zod) | ⑫ Zod 2 boolean + superRefine + ⑬ gift-api.ts 명시 키 + ⑭ route 함수 교체 | tsc 0건 + ⑫⑬⑭ grep 자가점검 |
| C (besshi10) | (a) 확정 산식 → `derivePriorGiftAddition`에서 `donorPaidTaxAddition` 추가 차감 | A-6 anchor (㉓=0) |
| D (UI) | ToggleCard ⑤(`GiftCreditChecklist.tsx`) + 결과카드 ⑦ + 선택출력 leaf id + 폼①②③④ + validateStep ⑧ | E2E E-1~E-3 green |
| E (회귀) | 전체 test + tsc + lint 0건 | 기존 gift anchor 무변경 |

---

## 부록. 핵심 설계 결정 요약

1. **대납액 기준**: `finalTax`(§69② 신고세액공제 후 결정세액) = 증여자 실지급액 = 수증자 면채무(§36).
2. **주입 지점**: `aggregatedGiftValue`에만 — `netCurrentGiftValue` 불변으로 §53 공제 1회 동결 (STEP G-3·G-4).
3. **세대생략+대납**: 본 PR scope 제외, 입력 검증 차단 (STEP G-5 (b) 확정).
4. **2-스트림+대납**: 본 PR scope 제외, 입력 검증 차단 (STEP G-6).
5. **동시증여+대납**: 본 PR scope 제외, 입력 검증 차단 (§3.5).
6. **사이드바**: 증여 마법사에 입력 사이드바 미구현 → N/A.
7. **⑬ 명시 객체 리터럴**: `buildGiftTaxInput` return에 spread 아닌 명시 키 추가 필수 (silent strip 방지).
8. **besshi10 (a) 확정**: (a) 분리 echo 방식 확정 — `derivePriorGiftAddition`에서 `donorPaidTaxAddition` 추가 차감(㉓ = aggregatedGiftValue − donorPaidTaxAddition − netCurrent). (b) 신고서 원래 A 기준은 폐기 (§5-4). UI 무추가 변경.
9. **수렴 구간 교차**: baseline 20% 구간 → 수렴 후 30% 구간. 단일세율 닫힌형 검산 불가 → 반복식 실측값이 anchor 기준.
10. **선택출력**: `"donor-paid-grossup"` leaf id 등록 + `applied` 조건 가드 4단계 필수.
