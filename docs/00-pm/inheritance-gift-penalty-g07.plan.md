# G-07 — 상속·증여 본체 신고불성실·납부지연 가산세 구현 계획

> 출처: 가산세 전세목 코드리뷰 `docs/reviews/penalty-code-review-2026-09.md` **G-07**.
> §9 실행 계획에서 「구현할지 고지할지가 **제품 결정**」이라는 이유로 보류된 6건 중 하나.
> 나머지 5건은 PR #1444~#1446으로 종결됐고, 남은 것은 이 건과 **G-05**(기한후신고 감면)뿐이다.

## 0. 한줄 요약

상속·증여 엔진은 「무신고/기한후신고」 **입력을 받고도** 국세기본법 §47의2·§47의4 가산세를
산출하지 않는데, 별지 제10호서식은 그 칸에 **「—」가 아니라 「0」**을 인쇄한다. 증여 2.25억
무신고 사례에서 법정 가산세 4,500만원이 화면에서 **0으로 보인다**.

**두 갈래가 있고 하나를 골라야 한다:**

| 안 | 내용 | 규모 | 세액 변경 |
|---|---|---|---|
| **A. 고지** | 「가산세 미포함」 경고 + 별지10호 ㊷㊸를 별지9호처럼 dash 통일 | 파일 4~5개 · 반나절 | ❌ 없음 |
| **B. 구현** | 양도세·주식이 이미 쓰는 순수 헬퍼를 재사용해 실제 산출 | 14 동기화 지점 · 2~3 PR | ✅ 있음 |

> **⚠️ 이 문서는 B안을 「어떻게」까지 적지만, A/B 선택 자체는 결정하지 않는다.**
> §8의 결정 항목 3개에 답이 있어야 B안 착수가 가능하다.

**권고: A를 먼저 머지하고(즉시·무위험), B는 G-05와 묶어 별도 트랙으로 간다.**
근거는 §3.3.

---

## 1. 현황 — 실측

### 1.1 엔진은 placeholder 0을 하드코딩한다

```
lib/tax-engine/gift-tax.ts:458-460
    underreportPenalty: 0,
    latePaymentPenalty: 0,
    publicInterestPenalty: 0,

lib/tax-engine/gift-tax-two-stream.ts:447-449   (동일)
```

`grep -rn "가산세" lib/tax-engine/gift-tax.ts lib/tax-engine/inheritance-tax.ts` → **0건**.
상속 쪽은 필드조차 없다(별지9호가 상수 0을 직접 쓴다 — `lib/calc/filing-form-9-data.ts:152`).

### 1.2 서식은 「0」을 인쇄한다 — 별지9호와 별지10호가 다르다

| | 처리 | 결과 |
|---|---|---|
| 별지9호 (상속) | `amtRow(num, 0, …)` → `display: amount > 0 ? "amount" : "dash"` (`filing-form-9-data.ts:79`) | **「—」** |
| 별지10호 (증여) | `display: "amount"` **하드코딩** (`gift-tax-filing-form-besshi10.ts:173-175`) | **「0」** |

`components/calc/results/shared/BesshiRow.tsx:64-69`가 `display === "dash"`일 때만 「—」를 그린다.

⇒ **같은 제품의 두 서식이 같은 상태를 다르게 인쇄한다.** 별지9호가 옳다 — 계산하지 않은 칸에
0을 적으면 「0원으로 확정됐다」는 뜻이 된다.

### 1.3 입력 경로는 이미 있다 (그래서 사용자는 계산됐다고 믿는다)

- **증여** — `components/calc/gift/GiftCreditChecklist.tsx:164-170`
  `ToggleCard title="법정신고기한 내 신고 (§69 신고세액공제 3%)"` **2-state**(`isFiledOnTime`)
- **상속** — `components/calc/inheritance/Step4Deductions.tsx:499-527`
  `RadioCardGroup` **3-state**: `on_time` / `late`(기한후신고, 국세기본법 §45의3) / `none`(무신고)

두 화면 모두 description이 **신고세액공제·일괄공제만** 말하고 가산세는 언급하지 않는다.
끄면 §69 공제만 빠진다 — `lib/tax-engine/credits/filing-credit.ts:87`.

> 🔑 **상속은 이미 「기한후신고」를 별도 상태로 갖고 있다.** 이것이 §5.4의 G-05 결합 이유다.

### 1.4 실측 세액 (리뷰 §G-07 재현)

| 사안 | 화면 | 법정 |
|---|---|---|
| 증여 직계비속 예금 10억, 무신고 | finalTax **225,000,000** · ㊷㊸ **0** | + 무신고가산세 **45,000,000**(20%) + §47의4 납부지연 |
| 상속 `isUnfiled:true` | finalTax **1,065,732,198** · ㊱㊲ **0** | + 약 **213,146,439**(20%) |

### 1.5 재사용 가능한 순수 헬퍼가 이미 있다

`lib/tax-engine/transfer-tax-penalty.ts` — **세목 중립**이다(파일 자신이 그렇게 적어 뒀고,
주식 엔진이 이미 재사용한다: `stock-transfer-finalize.ts` `computeStockFilingPenalty`).

```ts
calculateFilingPenalty(FilingPenaltyInput): FilingPenaltyResult      // :34~79 입력, §47의2·§47의3
calculateDelayedPaymentPenalty(DelayedPaymentInput): DelayedPaymentResult  // :82~91, §47의4
```

B2에서 정정한 것들이 그대로 딸려 온다 — 산정기간 「납부일의 **전날**까지」, 가목·나목 분해
(`fraudSplit`), 정수 분수 연산, 표시 산식 포맷터 4종.

### 1.6 신고기한 헬퍼도 이미 있다

`lib/calc/inheritance-gift-filing-deadline.ts`

```ts
getGiftFilingDueDates(giftDate)                          // §68① 말일 + 3개월
getInheritanceFilingDueDates(deathDate, decedentType)    // §67① 6개월 / §67④ 비거주자 9개월
```

분납기한(§70② 신고기한 + 2개월)까지 나온다. **납부지연 기산에 필요한 축이 이미 계산돼 있다.**

---

## 2. 법령 지형 (KoreanLaw 실측)

### 2.1 상증법 §78①②는 **삭제**됐다 — 국세기본법이 정본이다

```
상속세 및 증여세법 제78조(가산세 등)   [MST 276123, 시행 2025-10-01]
  ① 삭제
  ② 삭제
  ③~⑮ … 공익법인등 보고서 미제출·주식 보유기준 초과·전용계좌·결산서류 공시 등
```

⇒ 상속·증여의 신고불성실·납부지연은 **국세기본법 §47의2·§47의3·§47의4**가 유일 근거다.
별지10호 ㊹ `publicInterestPenalty`(lawRef `§78`)는 **공익법인 전용 축**이라 이 계획의 범위 밖이다.

### 2.2 국세기본법 §47의2 — 상속·증여는 적용 대상이다

```
제47조의2 ① … 과세표준 신고(… 「교육세법」 제9조에 따른 신고 중 금융ㆍ보험업자가 아닌 자의
  신고와 「농어촌특별세법」 및 「종합부동산세법」에 따른 신고는 제외한다)를 하지 아니한 경우 …
  1. 부정행위: 100분의 40 (역외거래 100분의 60)
  2. 제1호 외의 경우: 100분의 20
  ③ … 1. 삭제  2. 「부가가치세법」 제69조에 따라 납부의무가 면제되는 경우
```

**괄호의 제외 대상은 교육세·농특세·종부세뿐이다.** 상속세·증여세는 그대로 대상이다.

### 2.3 🔴 §47의3④1호 — **상속·증여 전용 과소신고 적용제외 4가지**

```
제47조의3 ④ … 다음 각 호의 어느 하나에 해당하는 경우에는 … 가산세를 적용하지 아니한다.
  1. 다음 각 목의 어느 하나에 해당하는 사유로 상속세ㆍ증여세 과세표준을 과소신고한 경우
     가. 신고 당시 소유권에 대한 소송 등의 사유로 상속재산 또는 증여재산으로 확정되지 아니하였던 경우
     나. 「상속세 및 증여세법」 제18조, 제18조의2, 제18조의3, 제19조부터 제23조까지, 제23조의2,
         제24조, 제53조, 제53조의2 및 제54조에 따른 공제의 적용에 착오가 있었던 경우
     다. 「상속세 및 증여세법」 제60조제2항ㆍ제3항 및 제66조에 따라 평가한 가액으로 과세표준을
         결정한 경우(부정행위로 과소신고한 경우는 제외한다)
     라. 「법인세법」 제66조에 따라 … §45의3~§45의5 증여의제이익이 변경되는 경우 …
  1의2. … 부담부증여 시 양도로 보는 부분에 대한 양도소득세 과세표준을 결정ㆍ경정한 경우 …
```

**이것이 이 세목을 양도세와 가르는 가장 큰 차이다.** 「다」목은 특히 넓다 — 보충적 평가액으로
결정된 경우 과소신고가산세가 **아예 붙지 않는다**. 이 앱은 §60②③·§66 평가를 정면으로 다루므로
**과소신고를 구현하려면 이 게이트가 필수**다(§8 결정 2).

### 2.4 §48②2호·3호라목 — 기한후신고 감면 (**G-05와 같은 뿌리**)

무신고가산세는 기한 후 신고하면 감면된다: 1개월 이내 **50%** · 3개월 이내 **30%** ·
6개월 이내 **20%**(§48②2호 가·나·다목). 「경정할 것을 미리 알고」 제출한 경우는 배제.

⇒ **상속 화면의 「기한후신고」 라디오가 이미 이 상태를 표현하고 있다.** 무신고가산세를 구현하면서
이 감면을 빼면 **정확히 2배** 과대가 된다 — G-05가 양도세에서 지적한 것과 같은 결함을
상속·증여에 새로 만드는 셈이다.

### 2.5 신고기한 (§67·§68)

| | 기한 | 근거 |
|---|---|---|
| 상속 | 상속개시일이 속하는 **달의 말일**부터 6개월 (피상속인·상속인 외국 주소 시 9개월) | §67①·④ |
| 증여 | 증여받은 날이 속하는 **달의 말일**부터 3개월 | §68① |

§68① 단서 — §41의3·§41의5 정산신고는 **정산기준일** 말일부터 3개월, §45의3·§45의5는
**수혜법인 법인세 신고기한** 말일부터 3개월. 이 앱은 두 특례를 모두 구현하고 있으므로
기한 파생이 단순하지 않다(§6 리스크 R-3).

---

## 3. 두 안

### 3.1 A안 — 고지 (세액 불변)

1. 별지10호 ㊷㊸㊹를 **별지9호와 같은 규칙**으로 통일 — `amount > 0`일 때만 `"amount"`,
   아니면 `"dash"`. `gift-tax-filing-form-besshi10.ts:173-175`.
2. `isFiledOnTime === false`(또는 `isUnfiled`)일 때 **결과 카드에 경고**:
   「신고불성실·납부지연 가산세는 이 계산에 포함되지 않았습니다(국세기본법 §47의2·§47의4)」.
   B5의 취득세 G-09와 같은 형태.
3. 입력 위젯 description에 같은 사실을 한 줄 추가 — 지금은 「신고세액공제 미적용」만 말한다.

**장점**: 반나절. 세액 회귀 0. 화면이 스스로 반증하는 「0」이 사라진다.
**단점**: 사용자는 여전히 실제 부담을 모른다. 무신고 사안에서 화면 총액과 실제 고지액이 20% 이상 벌어진다.

### 3.2 B안 — 구현 (세액 변경)

§5의 14 동기화 지점을 전부 태운다. 순수 헬퍼·신고기한 헬퍼가 이미 있어 **엔진 산식 자체는 얕고,
비용은 입력 축(신고일·납부일·부정행위·적용제외)과 배선에 몰린다.**

**장점**: 무신고 사안에서 실제 부담을 보여준다. 별지 서식이 조문대로 채워진다.
**단점**: 입력이 늘어난다(§8 결정 3). §47의3④ 적용제외·§48② 감면·상속인별 안분까지 따라온다.

### 3.3 권고 — A 먼저, B는 G-05와 묶어서

세 가지 이유다.

1. **A는 B의 부분집합이 아니다 — 버려지지 않는다.** B를 구현해도 「입력을 주지 않은 사용자」는
   여전히 가산세 0이고, 그때 dash/경고가 그대로 옳다. A는 B의 **전제**다.
2. **B는 G-05와 같은 코드를 건드린다.** §48②2호 감면 테이블·「경정을 미리 앎」 게이트·
   `FilingPenaltyInput`의 신고일 축 — 셋 다 G-05가 양도세에 넣어야 하는 것과 **동일**하다.
   따로 하면 두 번 설계하고 두 번 정정하게 된다.
3. **A는 지금 사용자에게 도달하는 오해를 즉시 끊는다.** 「0」은 계산 결과처럼 읽힌다.

⇒ **A: 이번 주. B: G-05 착수 시 §48② 공용 leaf를 먼저 만들고 그 위에 얹는다.**

---

## 4. A안 상세

### 4.1 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| A-1 | `lib/tax-engine/gift-tax-filing-form-besshi10.ts:173-175` | ㊷㊸㊹ `display`를 `amount > 0 ? "amount" : "dash"`로 |
| A-2 | `components/calc/results/GiftTaxResultView.tsx` (총액 카드 `:279` 인근) | 미포함 경고 |
| A-3 | `components/calc/results/InheritanceTaxResultView.tsx` (`:233` 결정세액 행 인근) | 미포함 경고 |
| A-4 | `components/calc/gift/GiftCreditChecklist.tsx:167` | description에 가산세 미포함 한 줄 |
| A-5 | `components/calc/inheritance/Step4Deductions.tsx:512·519·526` | 3개 option description에 같은 한 줄 |

### 4.2 ⚠️ A-1은 기존 anchor를 건드린다

`__tests__/tax-engine/inheritance-gift/filing-form-besshi-10.test.ts:151` **B10-SC4**가
`㊺ = ㉞ + ㉟ − ㊱ − ㊲ + ㊷ + ㊸ + ㊹` 항등식을 단언한다. `display`만 바꾸고 `amount`는
0으로 두므로 **항등식은 그대로 성립**한다. 같은 파일 `:167` 주석이 「⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹는
현 엔진이 항상 0으로 고정(별도 입력 경로 없음)」이라 적어 두었는데, **A안이 그 주석의 전제를
바꾸지 않는다**(여전히 0). B안에서 바뀐다 — §6 R-1.

### 4.3 A안 verify

- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/` 통과
- [ ] 리터럴 anchor 신설: ㊷㊸㊹가 `amount === 0`이면 `display === "dash"`
- [ ] 뮤테이션: `display`를 `"amount"`로 되돌리면 RED
- [ ] 경고 문구 anchor(B5 `penalty-citation-b1-b5.anchor.test.ts` 패턴 차용)
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors · 전체 vitest 회귀 0

---

## 5. B안 상세 — 14 동기화 지점

> 상속·증여는 **같은 penalty 축**을 쓰지만 **입력 축이 다르다**(상속 3-state·상속인 안분 /
> 증여 2-state·수증자 단위). 아래는 **증여 먼저 → 상속**을 전제로 한다. 상속은 §5.5의
> 안분 결정이 선행돼야 한다.

### 5.1 엔진 (Layer 2)

**신규 파일** `lib/tax-engine/inheritance-gift-penalty.ts` — 주식의
`stock-transfer-finalize.ts` `computeStockFilingPenalty` 패턴을 그대로 따른다.

```ts
export interface InheritanceGiftPenaltyAxis {
  /** 신고 상태 — 상속 3-state · 증여 2-state를 하나로 흡수 */
  filingStatus: "on_time" | "late" | "none";
  /** 법정신고기한 (§67·§68) — 엔진이 파생하지 않고 받는다(단서 케이스 때문에) */
  statutoryDeadline?: Date;
  /** 실제 신고일 — §48②2호 감면 구간 판정 */
  actualFilingDate?: Date;
  /** 경정·결정을 미리 알고 신고했는가 — §48② 단서 배제사유 */
  priorAssessmentNotified?: boolean;
  /** 부정행위 축 */
  penaltyReason?: PenaltyReason;
  /** 부정행위로 인한 과소신고분 (§47의3①1호 가목 base) */
  fraudulentPortion?: number;
  /** 🔴 §47의3④1호 적용제외 사유 — 있으면 과소신고가산세 0 */
  underReportExclusion?: "ownership_dispute" | "deduction_error" | "supplementary_valuation" | "corporate_adjustment";
  /** 납부지연 3필드 */
  unpaidTax?: number;
  paymentDeadline?: Date;
  actualPaymentDate?: Date;
}
```

- **base**: `finalTax`(= 산출세액 + 할증 − 세액공제). 국기법 §47의2①·§47의3①의 「납부하여야 할
  세액」은 세액공제 반영 후 금액이다 — 주식 `stock-transfer-finalize.ts:218` 주석과 같은 근거.
  🔑 §69 신고세액공제는 무신고면 애초에 0이라 이중차감 우려가 없다.
- **감면**: §48②2호(50/30/20%)·3호라목은 **양도세 G-05와 공용 leaf**로 뽑는다 —
  `lib/tax-engine/legal-codes/common.ts`의 `AMENDMENT_REDUCTION_48_2`(§48②**1호**) 옆에
  `LATE_FILING_REDUCTION_48_2_2`를 신설하고, 감면율 결정은 `resolveAmendmentReductionRate`와
  같은 순차 매칭 헬퍼로 단일화한다.
- **10원 미만 절사 여부**: 주식은 `floorTen`(국고금 관리법 §47①)을 적용한다. 상속·증여도 같은지
  **확인 필요**(§8 결정 3). 확인 전에는 절사하지 않는다 — 없는 절사를 넣으면 과소가 된다.

### 5.2 결과 타입·서식

| # | 지점 | 변경 |
|---|---|---|
| ① | `types/inheritance-gift.types.ts:587-589` | `underreportPenalty`·`latePaymentPenalty`를 optional echo → **실값**. 산출근거 `penaltyDetail` 추가(양도세 `TransferTaxPenaltyResult` 재사용) |
| ② | `gift-tax.ts:458-459` · `gift-tax-two-stream.ts:447-448` | placeholder 0 → 산출값 |
| ③ | `gift-tax.ts:333` `finalTax` | 🔴 **가산세를 더할 것인가** — §5.3 |
| ④ | `gift-tax-filing-form-besshi10.ts:176` ㊺ | `r.finalTax` — ③의 결정에 종속 |
| ⑤ | `lib/calc/filing-form-9-data.ts:152·192-193` | ㊱㊲ 상수 0 → 실값, ㊳ 산식 재검토 |

### 5.3 🔴 `finalTax`에 가산세를 더할 것인가 — **더해야 한다**

별지10호 ㊺의 `formula`가 이미 `㉞+㉟−㊱−㊲+㊷+㊸+㊹`이고 `amount`는 `r.finalTax`다
(`gift-tax-filing-form-besshi10.ts:176`). 가산세를 산출하면서 `finalTax`에 더하지 않으면
**인쇄된 산식이 인쇄된 금액을 재현하지 못한다** — 이 리뷰가 반복해서 잡은 결함 유형이고,
기존 anchor **B10-SC4**가 즉시 RED가 된다.

⇒ `finalTax`에 더한다. 다만 **결정세액과 총납부세액을 분리**해야 한다 — 양도세가
`determinedTax`(가산세 전)와 `totalTax`(후)를 나누는 것과 같은 구조.
상속 결과뷰 `InheritanceTaxResultView.tsx:233`은 `finalTax`를 **「결정세액」**으로 라벨링하므로
그 라벨이 거짓이 된다. 필드를 새로 만들 것인지 라벨을 바꿀 것인지는 §8 결정 3.

### 5.4 입력 (①~⑧)

| # | 지점 | 증여 | 상속 |
|---|---|---|---|
| ①폼 | `calc-wizard-*` | `isFiledOnTime`(2-state) → **3-state 승격 필요** | `isFiledOnTime`+`isUnfiled` — **이미 3-state** |
| ②initial | | 기본 `on_time` | 현행 유지 |
| ③normalize | | | |
| ④API 변환 | `lib/calc/gift-api.ts:78` | `filingStatus`·신고일·납부 3필드 추가 | 상속 변환부 동일 |
| ⑤UI 위젯 | `GiftCreditChecklist.tsx:164` | **2-state → 3-state 라디오** + 신고일·납부일·부정행위·적용제외 | `Step4Deductions.tsx:499` 라디오 유지 + 하위 필드 |
| ⑥사이드바 | | 가산세는 계산 가능 항목이므로 합계 반영 | |
| ⑦결과 카드 | `GiftTaxResultView.tsx` | 산출근거 블록(양도세 `PenaltyDetailBlock` 패턴) | `InheritanceTaxResultView.tsx` |
| ⑧validate | | `unpaidTax > 0 && !paymentDeadline` 차단(주식 축과 동일) | |

### 5.5 API/Route (⑨~⑭)

| # | 지점 |
|---|---|
| ⑨⑩ Zod enum | `lib/validators/gift-aux-schemas.ts:45` `giftTaxCreditInputSchema` — `isFiledOnTime: z.boolean()` 옆에 축 추가 |
| ⑪ | 자산-수준 fallback 해당 없음 |
| ⑫ **Zod 입력 객체** | 신규 `inheritanceGiftPenaltySchema` — **TypeScript 미감지**. G-14가 정확히 이 층의 테스트 부재였다 |
| ⑬ **body spread** | `gift-api.ts` · 상속 변환부 |
| ⑭ **Route 엔진 input 매핑** | `app/api/calc/gift/route.ts` · `app/api/calc/inheritance/route.ts` — **Date 변환 필수**(`lib/api/date-coerce.ts`, `new Date(x)` 직접 호출 금지) |

### 5.6 🔴 상속인별 안분 — 선행 결정

`lib/tax-engine/inheritance-allocation.ts:607-612`가 상속인별로 `filingCredit`·`finalTax`를
따로 낸다(§69 공제도 `bigIntRoundDiv`로 안분). 가산세도 같은 처리를 할 것인가?

- **신고 단위 1회**로 보면 부동산·주식 정본(`filingUnitPenaltyDetail`)과 같은 구조가 된다.
- **상속인별 안분**으로 보면 §3의2 연대납세의무·상속인별 신고서와 맞는다.

⇒ **§8 결정 1.** 답이 나오기 전에는 상속 쪽 B안을 착수하지 않는다. 증여는 수증자 단위라
이 문제가 없으므로 **증여 먼저** 가는 것이 안전하다.

---

## 6. 리스크·금지사항

| ID | 리스크 | 대응 |
|---|---|---|
| **R-1** | `filing-form-besshi-10.test.ts:167` 주석이 「㊷㊸㊹는 현 엔진이 항상 0」을 전제로 SC1·SC2·SC4의 실효화를 포기했다고 적어 뒀다. B안이 그 전제를 깬다 | 0이 아닌 격자로 SC4를 **실효화**하고 주석을 정정한다 |
| **R-2** | §47의3④1호 적용제외를 빼면 **보충적 평가 사안 전부**에 없는 가산세가 붙는다(다목) | 과소신고를 구현한다면 게이트가 **필수**. 게이트 없이 과소신고만 켜는 것 금지 |
| **R-3** | §68① 단서 — §41의3·§41의5 정산신고, §45의3·§45의5는 기한 기산이 다르다. `getGiftFilingDueDates`는 **본문만** 구현한다 | 엔진이 기한을 **파생하지 않고 받는다**(§5.1). 단서 케이스는 UI가 계산해 넘긴다 |
| **R-4** | §48②2호 감면을 빼면 기한후신고 사안이 **정확히 2배** 과대 | G-05와 공용 leaf. 감면 없이 무신고만 켜는 것 금지 |
| **R-5** | 가산세 base에 §69 신고세액공제를 이중차감 | base는 `finalTax`(공제 후). 무신고면 §69가 0이라 실제로는 무해하지만 **주석으로 못박는다** |
| **R-6** | 10원 미만 절사를 근거 없이 적용 | 확인 전 미적용. G-35가 「구별하는 픽스처 부재」로 잡은 축이므로 anchor를 함께 |

### ⛔ 재제안 금지

- **㊹ `publicInterestPenalty`를 이 계획에 포함하는 것** — §78③~⑮ 공익법인 축이라 별개다.
- **상증법 §78①②를 근거로 인용하는 것** — 삭제된 항이다.
- **「무신고면 20% 곱하면 된다」** — §48②2호 감면과 §47의3④ 적용제외 없이는 틀린다.

---

## 7. verify 성공기준

### A안
- [ ] 별지10호 ㊷㊸㊹가 0이면 「—」 (별지9호와 동일) · 뮤테이션 RED
- [ ] `isFiledOnTime === false` / `isUnfiled` 시 결과 카드 경고 렌더 · 뮤테이션 RED
- [ ] `tsc` 0 · `lint` 0 errors · 전체 vitest 회귀 0

### B안 (증여 Phase 1)
- [ ] **Pre-Do anchor 실패 확보**: 무신고 입력에 `underreportPenalty === 0` 실증 → 배선 후 `> 0`
- [ ] 무신고 20% (§47의2①2호) · 부정 40% · 역외 60% 각 anchor
- [ ] §48②2호 감면 3구간(50/30/20%) + 「경정을 미리 앎」 배제 anchor
- [ ] §47의3④1호 4개 사유 각각 과소신고가산세 0 anchor
- [ ] 납부지연 산정기간이 「납부일의 **전날**까지」(B2 G-03과 같은 계산) anchor
- [ ] **㊺ 항등식 SC4가 0이 아닌 격자에서 성립** (R-1 실효화)
- [ ] ⑫ Zod 층을 **route로 관통**하는 anchor (G-14가 부동산에서 놓쳤던 층)
- [ ] 14지점 ⑫⑬⑭ grep 자가 점검
- [ ] `tsc` 0 · `lint` 0 errors · 전체 vitest 회귀 0
- [ ] 브라우저 수동 확인 (폼→계산→결과, Network 탭 request body 신규 필드)

---

## 8. 열린 결정 — 이 답이 있어야 B안 착수 가능

| # | 질문 | 왜 막히나 |
|---|---|---|
| **1** | 상속세 가산세는 **신고 단위 1회**인가 **상속인별 안분**인가? | `inheritance-allocation.ts`가 §69 공제를 상속인별로 안분한다. 축이 정해져야 결과 타입이 정해진다. **증여 먼저 가면 이 결정을 미룰 수 있다** |
| **2** | **과소신고(§47의3)도 구현하는가**, 무신고(§47의2)만인가? | 과소신고를 켜면 §47의3④1호 적용제외 4사유의 **입력 축**이 필요하다(특히 「다」목 보충적 평가). 무신고만이면 그 게이트가 불필요하다 |
| **3** | 입력을 어디까지 받는가? | 최소 = 신고 상태 3-state + 실제 신고일. 최대 = + 부정행위·부정행위분·적용제외 사유·미납세액·납부기한·실제 납부일 (**8칸**). 상속·증여 화면은 이미 길다 |

> 추가로 **확인 필요**(법령 조사 미완):
> - 상속·증여 가산세에 **국고금 관리법 §47① 10원 미만 절사**가 적용되는가 (주식은 적용)
> - 상속 결과뷰의 「결정세액」 라벨을 유지할지, 「총 납부세액」을 새로 둘지 (§5.3)

---

## 9. 참고

- 리뷰 원문: `docs/reviews/penalty-code-review-2026-09.md` §G-07 · §9.4
- 선행 PR: #1444(B2·B3·B1+B5 28건) · #1445(B4·B6 13건) · #1446(보류 ①② 4건)
- 남은 보류: **G-05**(기한후신고 감면 — 양도세) — §3.3·R-4에 따라 이 계획의 B안과 묶는다
- 재사용 대상: `lib/tax-engine/transfer-tax-penalty.ts` · `lib/calc/inheritance-gift-filing-deadline.ts`
- 패턴 참고: `lib/tax-engine/stock-transfer/stock-transfer-finalize.ts`(순수 헬퍼 재사용) ·
  `__tests__/api/transfer.route.penalty-b6-plumbing.anchor.test.ts`(⑫ 관통 anchor)
