# 증여세 재차증여 합산 — 사례 3·4 보완 계획서 (rev.2)

> 출처: 첨부 교재 PDF 사례 3)·4) (이미지 32~35)
> 작업 워크트리: `.claude/worktrees/gift-prior-deceased-cutoff` (branch `feat/gift-prior-deceased-cutoff`)
> 관련 메모리: `project_gift_3round_prior_chain_marginal`(PR#386 R-6) · `project_gift_farmland_reduction_71`(§71⑥)
> rev.2: 독립 검토자 2명(세법·엔진 / 14지점·UI) 검토 16건 반영 — §10 검토이력 표 참조.

---

## 1. 사례 정의 (PDF 원본)

### 사례 3) 부모로부터 증여받아 합산과세 후 **부(父)가 사망** 후 모(母)가 재차 증여한 경우

| 회차 | 증여일 | 증여자 | 증여재산가액 | 비고 |
|---|---|---|---|---|
| 1차 | 2018.5.2 | 부친 | 620,000천원 | **부친 2022.5.2 사망** |
| 2차 | 2020.5.2 | 모친 | 400,000천원 | 1·2차 합산 (부 생전) |
| 3차 | 2023.5.2 | 모친 | 180,000천원 | **부친분(1차) 합산 제외** |

**핵심 쟁점**: 3차 증여일(2023.5.2) 전에 **부친이 사망(2022.5.2)** → 재산-58(2010.2.1)·재삼46014-1228(1999.6.25): *"당해 증여일 전에 부 또는 모가 사망한 경우에는 그 사망한 사람의 생전에 증여받은 재산은 합산과세하지 아니한다."*
→ 3차 ③증여재산가산액 = **400,000천원**(2차 모친분만, 1차 부친 620,000 제외).

**3차 ⑧ 가산재산 산출세액 (곱셈 안분 방식)** — ✅ 예규 원문 동결:
```
㉠ = 231,000천원 × 400,000 / 1,020,000 = 90,588천원   ← 예규 정합값 (엔진 anchor)
     └ 231,000 = 부 사망일 전 부·모 증여재산 합산 산출세액(=2차 ⑦)
     └ 분자 400,000 = 생존 증여자(모, 2차) 증여재산가액
     └ 분모 1,020,000 = 부 620,000 + 모 400,000 (gross 증여재산가액 합계)

  ⚠️ PDF 표기 92,400(분모 1,000,000)은 교재 오류 — §1-1 참조.
     단 ⑩=min(⑧, ⑨한도)에서 ⑨(78,620)<⑧이라 한도에 막혀 ⑫ 최종세액은 PDF와 동일(34,319).
```
근거 (WebFetch 원문 확인): **서일46014-11750(2003.12.3)** *"기납부세액으로 공제할 모의 증여재산에 대한 증여세액은 부의 사망일전 부·모의 증여재산을 합산하여 계산한 증여세 산출세액 중에서 **모의 증여재산에 상당하는 세액**"* → 분자=모 증여재산가액, 분모=부·모 합산 증여재산가액(gross). 재삼46014-1228·재산-58 사망 합산제외 원칙.

**3차 ⑨ 한도**: 114,000 × 400,000/580,000 = 78,620 → ⑩ = min(92,400, 78,620) = 78,620, ⑪ = (114,000−78,620)×3% = 1,061, ⑫ = 34,319천원.
- 분모 580,000 = 3차 합산과세표준(표 ⑤) = (400,000+180,000) − 0(3차 증여공제 이미 소진) = 580,000. 분자 400,000 = 가산증여재산(2차분) 과세표준.
- **⚠️ 가액 vs 과표 함정 (검토 A#3)**: 사례3은 **3차 증여공제 = 0**(이미 소진)이라 가산재산 가액(400,000) = 과표(400,000), 합산가액(580,000) = 합산과표(580,000)가 **우연히 일치**한다. 일반화하면 ⑨ 한도는 **과세표준 기반**(현행 엔진 `aggregatedTaxBase`·`priorAddedTaxBase`와 동일 축). 가액 기반으로 오해 금지 — 증여공제>0 케이스에서 갈린다.

#### 1-1. ✅ [동결 완료] 사례3 ⑧ 분모 = 부·모 합산 증여재산가액(gross)

| 가설 | 분모 | 비율 | ㉠ 결과 | 판정 |
|---|---|---|---|---|
| **예규 정합** (부+모 gross) | 620,000+400,000 = **1,020,000** | 0.392 | **90,588** | ✅ 서일46014-11750 동결 |
| PDF 표기 | 1,000,000 | 0.4 | 92,400 | ❌ 교재 오류(분모 오기) |
| 검토 A "1차=600,000 오기" | 1,000,000 | 0.4 | 92,400 | ❌ 이미지 반증(620,000 확정) |

- **예규 원문 확보** (KoreanLaw `search_decisions` domain=nts id 53858 → WebFetch ulex.co.kr): 안분 = "부·모 증여재산 합산 산출세액 중 **모의 증여재산에 상당하는 세액**" = `231,000 × 모가액/(부가액+모가액)`. **gross 증여재산가액 기준**(과세표준 아님). 예규에 숫자 예시 없음.
- **이미지 실측**: 1차 = 620,000(비고 "6억2천만원") 확정 → 분모 1,020,000.
- **PDF 92,400 = 교재 오류**: 분모를 1,000,000으로 잘못 적용(620,000을 600,000으로 처리한 듯). 예규 정의대로면 90,588.
- **🔑 최종세액 무영향**: ⑩ = min(⑧, ⑨한도). ⑨ 한도 = 78,620(과표 기반, ⑧과 독립)이 ⑧(90,588 or 92,400)보다 **항상 작아** ⑩ = 78,620으로 한도 적용. → ⑫ = 114,000−78,620−1,061 = **34,319**(PDF와 동일). **PDF ⑧ 오류는 자진납부세액에 영향 없음**.
- **anchor 정책** (`feedback_anchor_correction_legal_priority`): PDF 92,400 맹목 재현 금지. **법령 정합 90,588 동결**. ⑩·⑫는 PDF와 일치.
- **Do 차단 해제** ✅.

### 사례 4) 동일인 3차 증여 중 **1차분이 10년 경과로 합산제외**

| 회차 | 증여일 | 증여자 | 증여재산가액 | 비고 |
|---|---|---|---|---|
| 1차 | 2012.5.2 | 부친 | 820,000천원 | 3차 기준 10년 경과 → 합산제외 |
| 2차 | 2021.5.2 | 모친 | 600,000천원 | 1·2차 합산 |
| 3차 | 2023.5.2 | 모친 | 420,000천원 | 2·3차 합산 |

**3차 ⑧ 가산재산 산출세액 (뺄셈 marginal)**: 388,000(1·2차 합산 ⑦) − 171,000(1차 단독 ⑦) = **217,000**
**3차 ⑨ 한도**: 231,000 × 570,588/970,000 = 135,882 (570,588 = 600,000 − 50,000×600,000/1,020,000)
→ ⑩ = min(217,000, 135,882) = 135,882, ⑪ = floor(95,117,648×0.03) = 2,853,529
→ **⑫ = 92,264,119원** (✅ anchor 실측 GREEN). PDF 92,264천원 **정합**. 검토 A의 "92,265천원"은 천원 단위 중간절사 누적 오차 — **anchor 실행으로 반증**(원 단위 계산이 정답).

---

## 2. 현행 엔진 갭 분석 (코드 실측)

검증 파일: `lib/tax-engine/gift-prior-aggregation.ts` · `gift-tax.ts` STEP 6.5/7/8 · `types/inheritance-prior-gift.types.ts`

### 2-1. 사례 4 → ⚠️ **기존 R-6 메커니즘으로 재현 (신규코드 0) — 단, 사망 분기 추가 후 회귀 재검증 필수**

기존 `aggregatePriorGiftsForGift`의 drop-out 감지(`gift-prior-aggregation.ts:163-195`)가 사례4를 처리함 (코드흐름 실측·검토 A 확인):
- 3차(2023.5.2) `boundary47`=2013.5.2 → 1차(2012.5.2) `isBefore` → matched 탈락, 2차만 matched.
- `droppedSubPrior` 4필터(specialTreatment 제외·그룹 일치·금번 10년 밖·직전 10년 내)가 1차 부친 포착. **부(1차)·모(2차) = 그룹 A 동일** → `isSameDonorGroup` TRUE ✓
- `marginalPriorComputedTax` = max(0, 2차⑦ 388,000 − 1차⑦ 171,000) = **217,000** ✓
- STEP 6.5 `priorAddedTaxBase` = `safeMultiplyThenDivide(970,000, 600,000, 600,000 + 420,000)` = **570,588** ✓
- STEP 8 `creditLimit` = `safeMultiplyThenDivide(231,000, 570,588, 970,000)` = **135,882** ✓

→ **신규 코드 0. 단, §2-2 사망 분기 도입이 STEP 6.5 구조를 바꾸므로(§4-2 `else if`), 사례4 anchor가 사망 분기 추가 후에도 통과하는지 Do 중 재검증**(검토 A#10 모순). 회귀방지 anchor 필수.

### 2-2. 사례 3 → 🔴 **신규 기능 (증여자 사망 합산제외 + 곱셈 안분 marginal)**

현행 엔진은 **증여자 사망 정보를 모름**:
1. **`PriorGift` 타입에 증여자 사망일 필드 없음**(실측) — 현재 1차(부, 2018)·2차(모, 2020) 모두 3차(2023) 10년 이내 + 그룹 A → **둘 다 §47② 합산**(오류).
2. **drop-out 판정이 "10년 cutoff" 기준만** — `priorRoundHadDropout`은 `isBefore(boundary47)`만. 사망 탈락 미감지.
3. **marginal 산식이 뺄셈만** — 사례3은 **곱셈 안분**(231,000×400,000/1,000,000). 뺄셈(231,000−111,000=120,000) ≠ 92,400.

→ 사례3은 **별도 분기** 필요. R-6 뺄셈 경로 재사용 불가.

> ⚠️ 사례3(곱셈)≠사례4(뺄셈) 이유: 사례4는 제외 회차(1차)가 시간경과로 독립 단독 산출세액(171,000)을 가져 뺄셈. 사례3은 부·모분이 **동일 직전회차(2차 신고)에 함께 합산**됐고 예규가 안분(곱셈) 방식 명시(서일46014-11750).

---

## 3. 케이스 매트릭스 (전수 enumerate — 검토 A#5 C4 분리 반영)

| # | prior 구성 | 금번 시점 | 기대 동작 | 처리 |
|---|---|---|---|---|
| C0 | 사망·cutoff 모두 없음 | — | 전체 §47② 합산 | 현행 (무회귀) |
| C1 | 1차 10년 경과(cutoff) | — | 뺄셈 marginal | **사례4** — 기존 R-6 ⚠️(회귀 재검증) |
| C2 | 직전회차(matched[0])에 합산된 prior 증여자 사망 | 사망 | **곱셈 안분** marginal + 사망 prior 합산제외 | **사례3** — 신규 🔴 |
| C3 | 사망 + cutoff 동시 (제외 대상이 사망자이면서 10년 밖) | 사망 | **사망 안분 우선** (cutoff는 이미 제외 → 추가처리 불요) `if(deceased) else if(dropout)` | 신규 — 우선순위 가드 |
| C4a | 사망 prior가 **matched[0] 자체**(직전회차 본인이 사망자) | 사망 | matched에서 제외 → 빈 배열 → **합산 없음**(marginal 불요) | 신규 — 가드 |
| C4b | 사망 prior가 **독립 회차**(직전에 미합산) | 사망 | 단순 합산제외만 (marginal 불요) | 신규 |
| C5 | 금번과 다른 그룹의 사망자 | 사망 | 영향 없음(이미 그룹 불일치 제외) | 현행 |

> C3 우선순위 근거: cutoff(10년 밖) prior는 이미 §47② matched에서 빠지므로, 사망 여부와 무관하게 합산 대상 아님. 사망 안분은 "직전회차에 합산됐던 사망자분"을 추출하는 별개 보정 → **사망 안분 분기를 cutoff 뺄셈보다 먼저 평가**(배타 `if/else if`).

---

## 4. 설계 방향 (요약 — 상세는 §11 engine/ui design 산출물)

### 4-1. 신규 입력 필드 (PriorGift)

```ts
// lib/tax-engine/types/inheritance-prior-gift.types.ts
/**
 * 그 회차 증여자의 사망일(ISO "YYYY-MM-DD"). 설정 시 금번 증여일이 이 날짜 이후이면
 * 재산-58·재삼46014-1228 → 그 사망자 생전 증여재산은 §47② 합산에서 제외.
 * 부·모 동일그룹이라도 사망한 부(父)분만 선별 제외.
 * Route handler에서 string pass-through (giftDate와 동일, new Date() 직접호출 금지·parseISO 사용).
 */
donorDeceasedDate?: string;
```
- **opt-in**: 미설정이면 현행 동작 100% 보존(C0 무회귀). 신규 optional date → store factory default `undefined`(빈문자열 `""` 금지 — `feedback_store_default_vs_ui_display_fallback`).
- **효력 조건**: `donorDeceasedDate && isBefore(parseISO(donorDeceasedDate), parseISO(giftDate))` 일 때만 제외. 사망일 ≥ 금번 증여일(증여 후 사망)은 합산 유지. → **엔진 단독 판정**(validate는 경고만, 차단 아님 — 검토 A#13·B#10).

### 4-2. 엔진 분기 (`aggregatePriorGiftsForGift` + STEP 6.5)

- **합산제외 필터**: matched 루프에 사망 제외 조건 추가. 사망으로 제외된 prior가 `matched[0]`(직전회차)에 합산돼 있던 경우만 안분 보정.
- **`priorRoundHadDeceasedExclusion` 판정 조건 (C4a 가드)**: 사망 제외 **후** 남은 `matched[0]`이 존재하고(빈 배열 아님), 그 `matched[0]`이 사망 제외된 prior를 직전 합산에 포함했던 경우에만 `true`. matched가 비면(C4a — 직전회차 본인이 사망) `false` → 안분 분기 미진입(합산 자체 없음).
- **신규 결과 필드**: `priorRoundHadDeceasedExclusion: boolean` · `deceasedMarginalComputedTax: number` · `deceasedMarginalNumerator: number` · `deceasedMarginalDenominator: number`(echo).
- **곱셈 안분 (C2)**:
  ```
  deceasedMarginalComputedTax = safeMultiplyThenDivide(
      matched[0].computedTax,          // 직전회차 ⑦ (부·모 합산 산출세액)
      survivingPriorAmount,            // 생존 증여자분 가액 (분자)
      denominator                      // 🔴 §1-1 원문 확정: gross 합 / 과표 / 증여재산가산액
  )
  ```
  - `denominator` 후보 3종 — **원문 동결 전 미선택**(검토 A#6). anchor 동결 후 1택.
  - 안분 정밀도: `safeMultiplyThenDivide` BigInt 경로 소수부 버림(`feedback_safemul_decimal_apportion_precision`) — 입력이 모두 정수(원 단위)이므로 안전. 천원 PDF anchor는 **1천원 tolerance**.
- **priorAddedTaxBase (사망 케이스 ⑨ 한도 분자)**: **과세표준 기반**(§1 ⚠️). 현행 STEP 6.5 cutoff 분기와 동일 `safeMultiplyThenDivide(taxBase, survivingPriorAmount, survivingPriorAmount + netCurrentGiftValue)` 재사용 가능성 — anchor로 78,620 검증.
- **STEP 6.5 배타 분기 구조 (검토 A#10)**:
  ```ts
  const effectivePriorAggregation =
    priorAggregation.priorRoundHadDeceasedExclusion ? { /* 사망 안분 */ }
    : priorAggregation.priorRoundHadDropout       ? { /* 기존 R-6 뺄셈 */ }
    : priorAggregation;
  ```

### 4-3. 14 동기화 지점 (신규 `PriorGift.donorDeceasedDate` 1개 + result echo)

| 지점 | 위치 (실측) | 처리 |
|---|---|---|
| ① FormData | `PriorGift` 폼 타입 | `donorDeceasedDate?: string` |
| ② initial | calc-wizard factory | default `undefined` |
| ③ normalize | gift normalize | passthrough |
| ④ API 변환 | `lib/calc/gift-api.ts` | **명시 키 추가** `donorDeceasedDate: gift.donorDeceasedDate`(검토 B#11 — `...rest` 의존 지양) |
| ⑤ UI 위젯 | `components/calc/prior-gift/GiftRowEditor.tsx` | `ToggleCard`(증여자 사망 여부) + `DateInput`(사망일, type=date 금지). 토글 OFF도 tone 유지 |
| ⑥ 사이드바 | — | 영향 없음 |
| ⑦ 결과 카드 | `TaxCreditBreakdownCard` / `PriorGiftCreditDetail` | 사망 안분 산출근거 표기(아래 echo) |
| ⑧ validate | `lib/calc/gift-tax-form-validate.ts` | 사망일 ≥ 증여일이면 **경고**(통과). 차단 금지(E2E 전체회귀 회피) |
| ⑨ Zod 메인 | `giftTaxInputSchema.priorGiftsWithin10Years` | `priorGiftSchema` 배열 — ⑫ 연동 |
| ⑩ Zod 컴패니언 | **상속세** `preGiftsWithin10Years`(`lib/validators/property-valuation-input.ts:478`) | **동일 `priorGiftSchema` 재사용** → ⑫ 추가 시 양세목 자동 연동. **단 strip 위험 동일** |
| ⑪ 자산-수준 fallback | — | gift 무관(명시) |
| ⑫ **Zod 입력객체** | `lib/validators/prior-gift-schema.ts` | 🔴 **`.strip()` 기본 → 미추가 시 침묵 strip**. `donorDeceasedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` 추가. **Do 첫 작업** |
| ⑬ body spread | `lib/calc/gift-api.ts:95-97` | `...rest` 자동이나 ④에서 명시 키로 안전망 |
| ⑭ Route 매핑 | `app/api/calc/gift/route.ts:79-80` | string pass-through(`as unknown as GiftTaxInput`). 엔진서 `parseISO` 사용·`new Date(x)` 금지 |

**result echo (검토 A#12·B#5)** — `PriorGiftCreditDetail`(`lib/tax-engine/types/inheritance-gift-form-detail.types.ts:63`, interface라 Map→JSON 소실 무관) 확장:
```ts
deceasedExclusion?: boolean;          // 사망 안분 적용 여부 (사례4 뺄셈과 구분 플래그)
deceasedMarginalNumerator?: number;   // 생존분 가액
deceasedMarginalDenominator?: number; // §1-1 동결 분모
```
→ 결과 카드 분기: `deceasedExclusion` true → "부(父) 사망으로 인한 안분: 직전회차 ⑦ × 생존 증여자 가액 / 합산 총가액" 표기. false·dropout → 기존 뺄셈 표기.

---

## 5. Pre-Do anchor 계획 (정책: pre-do-anchor-verification)

1. **사례4 무회귀 anchor** (`__tests__/tax-engine/gift/prior-deceased-cutoff.test.ts` — ✅ **작성·실행 완료, 5/5 GREEN**):
   - 입력: 1차 2012 부 820,000 / 2차 2021 모 600,000(⑦388,000, taxBase 1,370,000) / 3차 2023 모 420,000.
   - 실측: taxBase=970M · computedTax=231M · ⑧=217M · ⑤_prior=570,588,235 · ⑨/⑩=135,882,352 · **⑫=92,264,119원**(PDF 92,264천원 정합).
   - **기존 코드로 즉시 GREEN** 확인 → R-6 경로가 부·모 혼합그룹 사례4 완전 재현. 사망 분기 추가 후 재실행하여 무회귀 재확인(A#10).
2. **사례3 사망 anchor** (RED 우선 — ✅ 분모 동결 완료):
   - 입력: 1차 2018 부 620,000(`donorDeceasedDate:"2022-05-02"`) / 2차 2020 모 400,000(⑦231,000, taxBase 970,000) / 3차 2023 모 180,000.
   - 기대: ③합산=400,000 · **⑧=90,588**(예규 정합, =231,000×400,000/1,020,000) · ⑨=78,620 · ⑩=78,620 · ⑪=1,061 · **⑫=34,319**(PDF 일치).
   - ⚠️ PDF ⑧ 92,400은 교재 분모 오기 — anchor는 법령정합 90,588. ⑩·⑫는 한도(⑨)에 막혀 PDF와 동일.
3. **C4a/C4b·C3 경계 anchor**: 합산 없음(C4a)·우선순위(C3) 분기 단위 테스트.

> **정밀도·단위 정책 (검토 A#8)**: PDF 수치는 **천원 단위**. 엔진은 원(KRW) 정수. anchor는 `×1,000` 환산 또는 천원 통일 명시 + `(1천원 tolerance)` 주석.

---

## 6. 미확정·확인필요 (추정 금지 — 정책)

- ✅ **[해소] 사례3 ⑧ 분모** (§1-1) — 서일46014-11750 원문(ulex/casenote) 확보. 분모 = 부·모 합산 증여재산가액(gross) = 1,020,000. ⑧=90,588 동결. PDF 92,400은 교재 오기·최종세액 무영향.
- 🔲 **C3 우선순위 법령 근거** — "사망 안분 우선"은 논리 도출(cutoff prior는 §47② 이미 제외 → 중복 무영향). 예규 명문 부재 — 코드 주석에 "도출" 명시.
- 🔲 **MCP 한계 기록** — KoreanLaw MCP는 NTS 예규 **목록만** 조회(본문 NOT_SUPPORTED). 본문은 ulex.co.kr·casenote.kr WebFetch로 확보(target=ntsCgmExpc).

## 7. SCOPE

**IN**: 사례3(증여자 사망 합산제외 + 곱셈 안분 marginal, C2/C3/C4a/C4b) · 사례4 회귀방지 anchor · result echo · UI 위젯 · 14지점(gift + 상속세 ⑩ 연동).
**OUT (검토 A#9·#14 명시)**:
- **그룹 B(조부모) 사망** — 재산-58 "부 또는 모" 문언이 조부모 확장되는지 원문 미확정 → **후속 이슈로 SCOPE_OUT 선언**(중간상태 방치 금지).
- 4차+ 다중 사망/cutoff 복합 (가장 최근 1건 근사) · 종합 besshi 신고서 양식 재현 · 상속세 모드 사전증여 합산(§13 별개).

---

## 8. 검토 반영 이력 (STEP 1~4)

독립 검토자 2명(`inheritance-gift-tax-senior` 세법·엔진 / `inheritance-gift-tax-ui-senior` 14지점·UI) 검토 결과 반영:

| 검토 | 우선 | 반영 |
|---|---|---|
| A#1 1차=600,000 오기 가설 | Crit | **반증** — 이미지 실측 620,000 확정. §1-1 PDF 내부 불일치로 재정의 |
| A#2 ⑫ 92,264→92,265 | Crit | ⚠️ **A 정정 반증** — anchor 실측 ⑫=92,264,119원 = PDF 92,264천원. A의 92,265는 천원절사 오차. **원 단위 92,264 동결** |
| A#3 ⑨ 가액 vs 과표 | Crit | §1 ⚠️ — 사례3 증여공제 0 우연일치, **과표 기반** 동결 |
| A#4·B#4 분모 미확정 | Crit | §1-1 BLOCKER 표 + 원문 동결 절차. Do 차단 명문화 |
| A#5 C4 분리 | High | §3 C4a(matched[0] 본인 사망)·C4b(독립) 분리 |
| A#6 안분 산식 미명시 | High | §4-2 denominator 후보 3종 + safeMultiplyThenDivide 명시 |
| A#7·A#10 C3·배타분기 | High | §3 C3 우선순위 + §4-2 `if/else if` 구조 |
| A#8 정밀도 정책 | Med | §5 천원 tolerance·단위 환산 명시 |
| A#9·B#12 그룹B | Med | §7 SCOPE_OUT 선언 |
| A#11 ⑭ Date | Med | §4-3 ⑭ string pass-through·parseISO |
| A#12·B#5·B#7 echo·표기 | High | §4-3 echo 3필드 + 결과카드 분기 |
| B#1 ⑫ priorGiftSchema | Crit | §4-3 ⑫ 파일경로·strip·Do 첫작업 |
| B#3 ⑭ coerceDates | Crit | §4-3 ⑭ parseISO·new Date 금지 |
| B#6 UI 위젯 | High | §4-3 ⑤ ToggleCard+DateInput |
| B#10 validate 차단/경고 | Med | §4-1·§4-3 ⑧ 경고(통과) |
| B#11 ⑬ 명시키 | Med | §4-3 ④ 명시 키 추가 |
| B 14지점 ⑨⑩⑪ 누락 | High | §4-3 표 ⑨⑩⑪ 추가 — **⑩ 상속세 priorGiftSchema 공유** |

> 정정 누적 16건(Critical 6·High 6·Medium 4) — 1회 검토 대비 가치 입증(기준 ≥10).

## 9. 다음 단계

1. (현재) STEP 5 `.engine.design.md` · STEP 12 `.ui.design.md` 생성 → STEP 6~13 설계 검토.
2. **분모 원문 동결** (BLOCKER) → MCP/NTS 원문 확보.
3. Pre-Do anchor: 사례4 GREEN(즉시) → 분모 동결 후 사례3 RED.
4. 엔진 구현(사망 필터 + 안분 marginal, `if/else if`) → 14지점 동기화 → 통합 anchor → 사례4 무회귀 재검증.
