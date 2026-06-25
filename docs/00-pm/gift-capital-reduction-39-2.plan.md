# 감자에 따른 이익의 증여(§39의2) — 불균등 감자 N:N 주주 안분 계산사례 재현 계획서

> 작성일: 2026-06-25 · **v3 (2차 재검토 반영: round/검증표 모순·고가 액면게이트·potentialAmount·수증자 선택 정정)**
> 브랜치: `feat/gift-capital-reduction`
> 워크트리: `.claude/worktrees/gift-capital-reduction` (slot 6 · dev 3006 · E2E 3106)
> 산출물 범위(확정): **증여이익 산정표 재현까지** (증여세 본계산은 기존 gift 엔진/마법사 prefill 위임)
> UI 위치(확정): **기존 `/calc/gift-deemed` 폼에 다주주 모드 추가** (단일모드·CD-1/CD-H 하위호환 보존)

---

## §0. 한 줄 요약

상증법 §39의2 감자 증여 엔진은 **이미 구현돼 있으나(단일 집계 모드)**, 첨부 교재의 두 계산사례가 요구하는 **불균등 감자 N:N 주주별 안분**(여러 감자주주 ↔ 여러 잔존주주, 증여자별 분해)을 지원하지 못한다. 본 작업은 기존 단일모드를 **그대로 보존**하면서 **다주주(주주 테이블) 모드**를 추가해 교재 두 사례(저가소각·고가소각)를 원단위 anchor로 100% 재현한다.

---

## §1. 배경 — 현행 구현 실측 (추정 금지, file:line 인용)

### 1.1 §39의2는 이미 구현됨 (단일 집계 모드)

| 지점 | 위치 | 현황 |
|---|---|---|
| 엔진 | `lib/tax-engine/gift-deemed/capital-decrease.ts:9-74` | `calcCapitalDecreaseGift` → `decreaseLow`(저가 ①1호)·`decreaseHigh`(고가 ①2호) |
| 입력 타입 | `lib/tax-engine/gift-deemed/types.ts:207-219` | `CapitalDecreaseInput` |
| 결과 타입 | `lib/tax-engine/gift-deemed/types.ts:32-76` | `DeemedGiftResult` (공통) |
| 법령 상수 | `lib/tax-engine/legal-codes/inheritance-gift.ts:133` | `GIFT.CAPITAL_DECREASE = "상증법 §39의2"` |
| 라우터 | `lib/tax-engine/gift-deemed/router.ts:42-43` | `case "capital_decrease"` |
| Zod | `lib/validators/gift-deemed-input.ts:130-140` | `capitalDecreaseSchema` (discriminatedUnion 브랜치, 전 필드 optional) |
| Route | `app/api/calc/gift-deemed/route.ts` | Rate→Zod→`calcDeemedGift`→결과 (DB세율 불요) |
| API 변환 | `lib/calc/gift-deemed-api.ts:135-152` | `buildDeemedGiftInput` `case "capital_decrease"` |
| Validation | `lib/calc/gift-deemed-validate.ts:82-89` | `validateDeemedInput` `case "capital_decrease"` |
| UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx:115-145` | `CapitalDecreaseFields` (DeemedDetailModal 내) |
| 폼 상태 | `components/calc/deemed-gift/shared.tsx` | `DeemedFormState` cd* 필드 + `INITIAL_DEEMED` + `DEEMED_TYPE_META` |
| 계산기 흐름 | `components/calc/deemed-gift/DeemedGiftCalculator.tsx` | 유형선택→모달 입력→`POST /api/calc/gift-deemed`→`DeemedGiftResultView`→`buildGiftWizardPrefill`→`/calc/gift-tax` |
| 결과뷰 | `components/calc/results/DeemedGiftResultView.tsx` | `breakdown(CalculationStep[])` 렌더 |
| 마법사 prefill | `lib/calc/gift-deemed-api.ts:287-319` | `buildGiftWizardPrefill` — 증여이익을 `giftItems[].category:"other"` 단일 항목으로 이관 |
| 기존 anchor | `__tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts:37-49` | **[CD-1]** 저가 → `6,000,000` |
| 기존 anchor | `__tests__/tax-engine/gift-deemed/capital-subcase-anchor.test.ts:21-31, 56-57` | **[CD-H]** 고가 → `500,000,000` · 저가 low 기본 |

### 1.2 현행 산식 (실측)

```
저가소각 decreaseLow (capital-decrease.ts:14-45):
  diff  = sharePrice − redemptionPrice                       // 평가액 − 소각대가
  base  = diff>0 ? safeMultiply(diff, relatedRedeemedShares) : 0
  gain  = safeMultiplyThenDivide(base, majorPostRatio.numer, majorPostRatio.denom)
        = 차액 × (대주주등 특수관계인 감자주식수) × (대주주 감자후 지분비율)
  threshold = diff >= applyRate(sharePrice, 0.3) ? 0 : 3억    // 현행 기준금액

고가소각 decreaseHigh (capital-decrease.ts:47-74):
  diff  = redemptionPrice − sharePrice                       // 소각대가 − 평가액
  gain  = diff>0 ? safeMultiply(diff, ownRedeemedShares) : 0
        = 차액 × (해당 주주등 감자주식수)                       // ← 증여자별 안분 없음
  threshold = diff >= applyRate(sharePrice, 0.3) ? 0 : 3억
```

### 1.3 갭 (교재 두 사례가 막히는 지점)

- 현행은 **수증자 1명의 총 증여이익**만 단일 호출로 계산한다(증여자별 분해·여러 수증자 동시 불가).
- 교재는 **주주 테이블 → 증여자별 N:N 안분표**를 보여준다.
- **대주주 등 판정**(지분 1%↑ 또는 액면 3억↑)·**특수관계 필터**(특수관계 있는 쌍만)·**수증자별 기준금액**(재재산-476)·**감자 후 1주당 평가액 검증값**이 모두 미구현.

---

## §2. 케이스 매트릭스 (anchor — 원단위 toBe 동결)

> ⚠️ Pre-Do anchor 우선 작성 정책(`pre-do-anchor-verification`). 아래 값은 교재 표시값. 지분율 반올림 자리수는 D5 참조.

### 2.1 사례1 — 저가소각(시가 > 감자대가), 감자주주 = 증여자 / 잔존주주 = 수증자

입력: 감자전 1주평가 30,000 · 발행 200,000주(액면 5,000) · 감자일 2025-04-01
- 갑(父) 100,000주(50%) 전부소각, 대가 10,000 → 감자후 0%
- 을(母) 30,000주(15%) 전부소각, 대가 10,000 → 감자후 0%
- 병(子) 60,000주(30%) 잔존 → 감자후 **85.7%**
- 소액주주 10,000주(5%) 잔존 → 감자후 14.3% (갑·을과 **비특수관계**)
- 총감자 130,000 · 감자후 70,000

> ⚠️ **D5 정확분수 채택 (법령 정합)**: 시행령 §29의2①1호의 "대주주등의 감자후 지분비율"에 반올림 규정이 없으므로 **정확분수**로 계산한다. 교재 사례1은 지분율을 85.7%(소수1자리)로 반올림 표시했으나, 그 값(2,228,200,000)은 법령 정합값이 아니다(memory `feedback_anchor_correction_legal_priority`·`feedback_transfer_year_tax_rate`). 정확분수를 쓰면 **검증표 증감과 과세 증여재산가액이 정확히 일치**(자기일관성)한다 — 아래 anchor는 정확분수 기준.

| # | anchor | 기대값(원) | 비고 |
|---|---|---|---|
| M1-a | 병 ← 갑 | `1,714,285,714` | floor((30,000−10,000)×100,000×60,000/70,000) — 정확분수 |
| M1-b | 병 ← 을 | `514,285,714` | floor((30,000−10,000)×30,000×60,000/70,000) |
| M1-c | 병 총 증여재산가액 | `2,228,571,428` | M1-a+M1-b (=floor(20,000×130,000×6/7)). **교재 표시 2,228,200,000은 지분율 85.7% 반올림값 — 채택 안 함** |
| M1-d | 소액주주(참고) | `applied=false` / 과세 `0` | 대주주 요건(감자후 14.3%≥1%)은 **충족**하나 소각주주 갑·을과 **비특수관계** → §39의2①1호 '소각주주의 특수관계인' 미해당 → 과세 제외. 참고 `potentialAmount=371,428,571`(=floor(20,000×130,000×10,000/70,000), 교재 표시 371,000,000) |
| M1-e | 과세요건 비율 | `66.7%` (≥30%) | (30,000−10,000)/30,000 → 기준금액 0 |
| M1-f | 감자후 1주평가(표시) | `67,143` | [(200,000×30,000)−(130,000×10,000)]/(200,000−130,000)=67,142.857 원미만 반올림. **검증표 증감 계산은 정확값(67,142.857) 사용 → M1-c와 일치** |
| M1-g | 병 검증표 증감 | `2,228,571,428` | 60,000×67,142.857 − 60,000×30,000 = M1-c 자기일관 확인 |

### 2.2 사례2 — 고가소각(감자대가 > 시가), 잔존주주 = 증여자 / 감자주주 = 수증자

입력: 감자전 1주평가 6,000(액면 10,000) · 발행 200,000주 · 감자일 2025-04-01
- 갑(父) 80,000주(40%) 잔존 → 감자후 **66.7%**
- 을(母) 40,000주(20%) 잔존 → 감자후 **33.3%**
- 병(子) 60,000주(30%) 전부소각, 대가 9,000 → 감자후 0%
- 정(子) 20,000주(10%) 전부소각, 대가 9,000 → 감자후 0%
- 총감자 80,000 · 감자후 120,000

| # | anchor | 기대값(원) | 비고 |
|---|---|---|---|
| M2-a | 병 ← 갑 | `120,000,000` | (9,000−6,000)×60,000×80,000/120,000 |
| M2-b | 병 ← 을 | `60,000,000` | (9,000−6,000)×60,000×40,000/120,000 |
| M2-c | 병 총 증여재산가액 | `180,000,000` | M2-a + M2-b |
| M2-d | 정 ← 갑 | `40,000,000` | (9,000−6,000)×20,000×80,000/120,000 |
| M2-e | 정 ← 을 | `20,000,000` | (9,000−6,000)×20,000×40,000/120,000 |
| M2-f | 정 총 증여재산가액 | `60,000,000` | M2-d + M2-e |
| M2-g | 과세요건 비율 | `50%` (≥30%) | (9,000−6,000)/6,000 → 기준금액 0 (3억 미만이어도 과세) |
| M2-h | 감자후 1주평가 | `4,000` | [(200,000×6,000)−(80,000×9,000)]/(200,000−80,000) |

### 2.3 회귀 anchor (단일모드 — 변경 금지)

| # | anchor | 기대값 |
|---|---|---|
| R-CD-1 | `capital-transaction-anchor.test.ts:38` 저가 단일 | `6,000,000` |
| R-CD-H | `capital-subcase-anchor.test.ts:23` 고가 단일 | `500,000,000` |

---

## §3. 법리 정리 (KoreanLaw MCP 검증 완료 — 2026-06-25)

> 본법 MST=276123(시행 20260102) · 시행령 MST=283637(시행 20260227) 본문 직접 조회·발췌. (memory `feedback_korean_law_82_vs_81_2_drift` 준수)

| 조문 | 검증된 본문 (발췌) | 코드/계획 정합 |
|---|---|---|
| **상증법 §39의2①** | "법인이 자본금을 감소시키기 위하여 주식등을 소각하는 경우로서 일부 주주등의 주식등을 소각함으로써 … 이익을 얻은 경우에는 **감자를 위한 주주총회결의일을 증여일로 하여** 그 이익을 … 증여재산가액으로 한다. 다만 … 기준금액 미만인 경우는 제외." **1호(저가)**: "주식등을 소각한 주주등의 **특수관계인에 해당하는 대주주등**이 얻은 이익" / **2호(고가)**: "**대주주등의 특수관계인**에 해당하는 주식등을 소각한 주주등이 얻은 이익" | ✓ 증여시기·수증자 방향 일치 |
| **상증령 §29의2①1호** (저가) | `(감자한 주식 1주당 평가액 − 소각시 지급 1주당 금액) × 총감자주식수 × 대주주등의 감자후 지분비율 × (대주주등과 특수관계인의 감자주식수 ÷ 총감자주식수)` | ✓ `총감자수 × (특수관계인감자수/총감자수) = 특수관계인감자수` → **현행 `decreaseLow` 산식과 동일**. **산식은 수증자(대주주) 1명 기준 총액** — 법령은 증여자별 분해를 규정하지 않음. 교재의 증여자별(갑/을) 분해는 증여세 본계산(직계존속·동일인합산)용 **설계적 확장**(총액 정확성과 무관) |
| **상증령 §29의2①2호** (고가) | `(소각시 지급 1주당 금액 − 감자한 주식 1주당 평가액) × 해당 주주등의 감자한 주식수`. **"주식 1주당 평가액이 액면가액에 미달하는 경우로 한정"** | ✓ 현행 `decreaseHigh` 산식·액면 한정 일치. 시행령 산식엔 **증여자별 안분 없음** → 교재 증여자 분해는 증여세 본계산용 부가처리 |
| **상증령 §29의2②** | "기준금액이란 **3억원**을 말한다. 다만, 1주당 평가액과 소각 1주당 금액의 **차액이 1주당 평가액의 100분의 30 이상**인 경우에는 기준금액은 **영(零)**으로 한다." | ✓ **현행 코드 `capital-decrease.ts:24,54`와 정확히 일치** |
| **"대주주등" 정의 §28②** | "해당 주주등의 지분 및 **그의 특수관계인의 지분을 포함하여** 발행주식총수등의 **100분의 1 이상** 소유하거나 액면가액이 **3억원 이상**인 주주등(**이하 이 조 및 제29조의2에서 '대주주등'이라 한다**)" | ✓ §28② 정의가 §29의2에 **명시 적용**. 단 **본인+특수관계인 지분 합산** 판정 (계획 §5 게이트 보강 필요) |
| **할증평가 배제 §53⑧3호** | "법 §63③ … 대통령령으로 정하는 주식등"에 "**제28조, 제29조, 제29조의2, 제29조의3 및 제30조에 따른 이익을 계산하는 경우**" 포함 → **§63③ 최대주주 할증 미적용** | ✓ 근거 = **§53⑧3호** (사전조사의 §53⑥3은 오류). `sharePrice` 입력 = 할증 미포함 평가액 |
| 특수관계 | 감자주주 ↔ 대주주등 특수관계(상증법 §2(10)·령 §2의2). 교재=가족(부모자녀) | D1: relationGroup 모델로 충족 (비대칭은 SCOPE_OUT) |
| 개정 연혁 | 2016.2.5~2025.2.27: `Min(평가액30%, 3억)` / **2025.2.28~: 3억(30%↑면 0)**. 사례 2025.4.1.=현행 | D6: 현행만 구현. 연혁 분기 후속 |
| 연대납세의무 | §39의2엔 명시 없음. 수증자=이익 얻은 자 | 산정표 범위 밖(참고) |

---

## §4. 데이터 모델 변경 (엔진)

### 4.1 입력 타입 — `CapitalDecreaseInput` 확장 (types.ts:207-219)

기존 필드 전부 보존(단일모드). 멀티모드 필드를 optional 추가:

```ts
export interface CapitalDecreaseInput {
  caseType?: "low" | "high";          // (단일) 기본 low
  sharePrice: number;                  // 감자주식 1주당 평가액 (단일·멀티 공통)
  redemptionPrice: number;             // (단일) 소각 1주당 금액
  // ── 단일 low 전용 (기존) ──
  totalRedeemedShares?: number;
  majorPostRatio?: { numer: number; denom: number };
  relatedRedeemedShares?: number;
  // ── 단일 high 전용 (기존) ──
  faceValue?: number;
  ownRedeemedShares?: number;
  // ── 멀티(불균등 감자) 모드 (신규) ──
  shareholders?: CapitalDecreaseShareholder[];  // 있으면 멀티모드 (D2: 3-state derive)
  preTotalShares?: number;             // 감자 전 발행주식총수
}

export interface CapitalDecreaseShareholder {
  id: string;                          // 결과 표시에 노출 금지(이름 우선; memory feedback_no_internal_id_in_result)
  name: string;                        // 갑/을/병/정/소액주주
  preShares: number;                   // 감자 전 보유주식수
  redeemedShares: number;              // 감자(소각)주식수 (0이면 잔존주주)
  redemptionPricePerShare?: number;    // 소각 1주당 대가 (감자주주만)
  relationGroup?: string;              // 특수관계 그룹 태그 (D1) — 같은 그룹 = 특수관계
}
```

### 4.2 결과 타입 — `DeemedGiftResult` 확장 (types.ts:32-76)

`deemedGiftValue`(하위호환: 멀티는 과세 수증자 증여재산가액 합계)는 유지. 신규 optional(plain 배열/Record — **Map 금지**, memory `feedback_engine_result_map_json_loss`):

```ts
capitalDecreaseMulti?: {
  caseType: "low" | "high";
  postPerShareValue: number;          // 감자 후 1주당 평가액 표시값=round(67,143 / 4,000); 계산은 정확분수
  donees: {
    name: string;
    isTaxable: boolean;               // 대주주 AND 특수관계
    nonTaxableReason?: string;        // "비특수관계" / "대주주 아님"
    total: number;                    // 과세 수증자 총 증여재산가액 (비과세=0)
    potentialAmount?: number;         // 비과세 시 참고 산출액 (교재 소액주주 371,428,571)
    thresholdApplied: number;         // 기준금액(0/3억)
    fromDonors: { donorName: string; amount: number }[];  // 증여자별 분해(정확분수 floor; 마지막 증여자 raw−Σfloor 잔액 흡수)
  }[];
  verification: {                      // 감자 전·후 검증표 (증감)
    name: string; preValue: number; redemptionPaid: number; postValue: number; delta: number;
  }[];
};
```

### 4.3 파일 분할 (800줄 정책)

`capital-decrease.ts`(현 75줄)에 멀티 로직 추가 시 분량 증가 → **`capital-decrease-multi.ts` 신규 파일**로 멀티 오케스트레이터 분리, `capital-decrease.ts`는 단일/멀티 dispatch만.

---

## §5. 엔진 알고리즘 (멀티모드)

```
calcCapitalDecreaseMulti(input):
  sh = input.shareholders
  preTotal = input.preTotalShares
  totalRedeemed = Σ sh.redeemedShares
  postTotal = preTotal − totalRedeemed
  evalPrice = input.sharePrice                      // 감자 전 1주당 평가액 (할증 미포함)

  // (1) 감자 후 1주당 평가액 — ⚠️ 정확값/표시값 분리 (D5 정확분수)
  redemptionPaidTotal  = Σ (sh.redeemedShares × sh.redemptionPricePerShare)
  postPerShareExact    = (preTotal×evalPrice − redemptionPaidTotal) / postTotal   // 분수 보관(반올림 금지)
  postPerShareDisplay  = round(postPerShareExact)                                 // UI 표시 전용(67,143 / 4,000)
  // ⚠️ 증여이익·검증표 증감 산정은 postPerShareExact(정확분수)로. Display 곱셈 금지(M1-c 불일치 유발)

  // (2) 주주별 감자 후 주식수·지분 (정확분수 — D5)
  post[i]      = sh[i].preShares − sh[i].redeemedShares
  postRatio[i] = post[i] / postTotal                // 정확분수(예 60,000/70,000). 반올림 금지

  // (3) 저가/고가 판정 — 감자주주 1주당 소각대가 vs 평가액
  //     저가: redemptionPrice < evalPrice  → 감자주주가 손해(증여자), 잔존주주가 이익(수증자)
  //     고가: redemptionPrice > evalPrice  → 잔존주주가 손해(증여자), 감자주주가 이익(수증자)

  // (4-저가) 각 (감자주주 j=증여자) × (잔존주주 i=수증자) 쌍:
  //   amount(i←j) = floor( (evalPrice − redemptionPrice_j) × redeemedShares_j × postRatio[i] )   // 정확분수→floor
  //   기존 decreaseLow 산식 재사용: diff × relatedRedeemedShares(=redeemedShares_j) × majorPostRatio(=postRatio[i])

  // (4-고가) ⚠️ 게이트: evalPrice < faceValue(액면가)일 것 (§29의2①2호 한정). 미충족 시 전체 미적용.
  //   각 (잔존주주 j=증여자) × (감자주주 i=수증자) 쌍:
  //   amount(i←j) = floor( (redemptionPrice_i − evalPrice) × redeemedShares_i × postRatio[j] )
  //   (postRatio[j] = 잔존주주 j의 감자후 지분비율, 정확분수)

  // (5) 게이트 — 수증자 i가 대주주등(§28②: 본인+특수관계인 지분 합산 → 발행총수 1%↑ OR 액면×보유 3억↑)
  //     AND (소각주주 j와 특수관계: relationGroup 동일) 인 쌍만 과세
  //     ⚠️ 대주주 판정은 "본인+특수관계인 지분 합산"(§28②) — 본인 단독 지분 아님
  // (6) 수증자별 기준금액 (재재산-476): 수증자 i 합계 기준.
  //     비율 = (저가: evalPrice−redemption / 고가: redemption−evalPrice) / evalPrice ≥ 30% → 기준 0; else 3억
  // (6-bis) 비과세 수증자(비특수관계 또는 대주주 미충족): total=0·isTaxable=false·nonTaxableReason,
  //     potentialAmount = Σ_j amount(게이트 무시 가정치) — 참고 표시용(교재 소액주주 371,428,571)
  // (7) 증여자별 floor 안분 (memory feedback_floor_residual_absorption):
  //     fromDonors[j] = amount(i←j) floor; 마지막 증여자 = raw(i)−Σfloor(앞 증여자) 잔액 흡수.
  //     정확분수 채택 → 본 사례(M1·M2)는 잔액 0으로 정확히 떨어짐(자기일관 M1-g: Σ fromDonors = donee.total).

  deemedGiftValue = Σ (과세 수증자 i의 total)   // 하위호환 — 여러 수증자면 합. (D3 prefill은 수증자 선택)
```

**단일모드**: `shareholders` 미존재 → 기존 `decreaseLow`/`decreaseHigh` 그대로 (변경 0).

---

## §6. UI — 기존 gift-deemed 폼에 다주주 모드 추가

`CapitalDecreaseFields`(`capital-forms.tsx:115-145`)에 **`cdMode` 토글**(RadioCardGroup, 단일/다주주) 추가:

- **단일** (기본): 현행 입력 그대로(하위호환).
- **다주주**: 주주 테이블 입력
  - 상단: 감자주식 1주당 평가액(`cdSharePrice` 재사용) + 감자 전 발행주식총수(신규)
  - 주주 행 추가/삭제: 이름 · 감자전 주식수 · 감자(소각)주식수 · 소각대가(1주당) · 특수관계 그룹
  - 테이블+행 패턴(`history-lookup-modal`/heir 테이블 패턴 차용), 800줄 시 `CapitalDecreaseShareholderTable.tsx` 분리
  - DecimalInput/CurrencyInput 규칙·ToggleCard/RadioCardGroup 강제·선택그룹 색조(amber)

> ⚠️ 자동 안분 fallback 금지(memory `feedback_no_silent_apportion_fallback`): 빈 행·미입력은 validation 차단. 특수관계 그룹 미입력 시 비특수관계로 침묵 처리 금지 → 명시 입력.

**모드 토글 동작**: `cdMode`(단일/다주주) 전환 시 3-state 정책(memory `feedback_three_state_optional_mode_toggle`) — 단일=기존 `cdCaseType`/`cdSharePrice`… 입력(CD-1/CD-H 보존), 다주주=주주 테이블. length>0 derive 금지·명시 토글.

**수증자 선택(D3 마법사 이관)**: 다주주 계산 후 결과뷰에서 **과세 수증자 드롭다운**(`cdSelectedDoneeIndex`) 선택 → 해당 수증자 `total`만 `buildGiftWizardPrefill`로 `/calc/gift-tax` 이관. 여러 과세 수증자(병·정)는 각각 별도 이관(증여세는 수증자별 계산).

---

## §7. 결과뷰 — 증여이익 산정표 재현 (DeemedGiftResultView)

멀티모드 결과(`capitalDecreaseMulti`)면 전용 카드 렌더:

1. **수증자별 증여재산가액 표** — 수증자 × 증여자 매트릭스(M1-a/b, M2-a/b/d/e), 합계 열, 과세/비과세(소액주주) 표시
2. **감자 후 1주당 평가액** (67,143 / 4,000) + 산식 풀어쓰기(한국어, memory `feedback_result_view_korean_formula`)
3. **감자 전·후 검증표** — 주주별 감자전 주식가액 · 감자대가 · 감자후 주식가액 · 증감
4. 금액 칸 `BesshiRow`/`tabular-nums` 정렬(`amount-column-align` 스킬), "원" 접미사 금지, 내부 id 노출 금지

> 정확분수(D5) 채택으로 **검증표 병 증감과 과세 증여재산가액이 2,228,571,428로 일치**(자기일관). 교재 표시값(2,228,200,000)과의 차이는 교재가 지분율을 85.7%로 반올림한 데서 비롯됨을 fine-print로 안내. 감자후 1주평가는 표시(67,143)와 계산(정확값 67,142.857)을 분리.

---

## §8. 14개 동기화 지점 매핑

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | `deemed-gift/shared.tsx` `DeemedFormState` | `cdMode` + 주주 행 배열 필드 추가 |
| ② | initial | `shared.tsx` `INITIAL_DEEMED` | 멀티 기본값(단일=기존) |
| ③ | normalize | `shared.tsx` (sessionStorage 복원) | 주주 배열 normalize |
| ④ | API 변환 | `lib/calc/gift-deemed-api.ts:135-152` | `case "capital_decrease"` 멀티 분기 → `shareholders`/`preTotalShares` |
| ⑤ | UI 위젯 | `capital-forms.tsx` `CapitalDecreaseFields` (+ 신규 테이블) | `cdMode` 토글 + 주주 테이블 + 결과뷰 수증자 선택 드롭다운(`cdSelectedDoneeIndex`, prefill용) |
| ⑥ | 사이드바 합계 | — | **해당 없음** (gift-deemed 사이드바 미사용) |
| ⑦ | 결과 카드 | `results/DeemedGiftResultView.tsx` | 멀티 산정표·검증표·감자후평가 카드 |
| ⑧ | validation | `lib/calc/gift-deemed-validate.ts:82-89` | 멀티 분기(주주≥2, 발행총수, 각 행 필수) |
| ⑨⑩ | Zod enum | `gift-deemed-input.ts:130-140` `capitalDecreaseSchema` | discriminatedUnion 유지(브랜치 내 `shareholders` array optional) |
| ⑪ | 자산-수준 fallback | — | **해당 없음** |
| ⑫ | Zod 입력 객체 | `gift-deemed-input.ts` | `capitalDecreaseShareholderSchema` 신규 + capitalDecreaseSchema에 추가 |
| ⑬ | body spread | `DeemedGiftCalculator.tsx:48` `buildDeemedGiftInput(form)` | 자동(변환에서 처리) |
| ⑭ | Route 매핑 | `app/api/calc/gift-deemed/route.ts:58-62` | 자동(Zod parse 후 `calcDeemedGift`) — 변경 0 |

> ⑫⑬⑭ TS 미감지 → grep 자가점검 필수(`shareholders`·`preTotalShares` 5단 파이프라인 전수).

---

## §9. Phase 분할 (단일 응답 Do 계약 — `single-response-do-execution`)

| Phase | 내용 | verify |
|---|---|---|
| **A** | ✅법령 검증 완료(§3 본문 발췌) → 교재 2사례 anchor 작성(M1·M2 정확분수, 실패 확보) | anchor 빨강 확인 |
| **B** | 타입(`CapitalDecreaseInput`·결과 `capitalDecreaseMulti`)·legal-code(기존 `GIFT.CAPITAL_DECREASE`) | `tsc` 0 |
| **C** | 엔진 `capital-decrease-multi.ts` 7단계[(1)감자후평가 정확값 (2)주주별지분 (3)저가/고가+액면게이트 (4)N:N amount (5)대주주·특수관계 게이트 (6)기준금액+potentialAmount (7)floor 안분] | `tsc` 0 + M1-a(step4)·M1-c(step7)·M1-g(step1·검증표) trace |
| **D** | anchor 통과(M1·M2·M1-g 검증표·감자후평가) + 회귀(R-CD-1·R-CD-H) | `vitest run __tests__/tax-engine/gift-deemed/` 녹색 |
| **E** | Zod(⑨⑫)·API변환(④⑬)·validation(⑧) | grep `shareholders`/`preTotalShares` 5단 + `tsc` 0 |
| **F** | UI 위젯(⑤①②③) — 단일/다주주 토글 + 주주 테이블 | F1 토글→테이블 표시 / F2 행 추가·삭제 |
| **G** | 결과뷰(⑦) 산정표·검증표·감자후평가 | G1 M1 입력→산정표 M1-c 표시 / G2 감자후평가 67,143 |
| **H** | E2E(`e2e/gift-capital-decrease-multi.spec.ts`, E2E_PORT=3106) + `tsc`/lint + 전체 `npm test` | 전부 녹색 |

---

## §10. anchor 테스트 계획

- 신규 파일: `__tests__/tax-engine/gift-deemed/capital-decrease-multi-anchor.test.ts`
- 케이스: M1-a~g(M1-g 검증표 증감 포함), M2-a~h (원단위 `toBe`), 비특수관계 소액주주 `applied=false`+`potentialAmount=371,428,571`, 감자후 1주평가, floor 자기일관(`Σ fromDonors = donee.total`, M1-a+M1-b=M1-c)
- 회귀: 기존 `capital-transaction-anchor.test.ts`·`capital-subcase-anchor.test.ts` 변경 금지, 전체 통과 확인
- E2E: 다주주 모드 입력→계산→산정표 표시(testid 동결)

---

## §11. 미결정 사항 (Do 진입 전/중 결정)

| ID | 항목 | 옵션 | 기본 제안 |
|---|---|---|---|
| **D1** | 특수관계 입력 모델 | (a) 주주별 `relationGroup` 태그(같은 그룹=특수관계) / (b) 주주쌍 매트릭스 | (a) — 교재 사례 충족·단순. 쌍별 비대칭 케이스는 SCOPE_OUT 명시 |
| **D2** | 멀티모드 진입 | (a) `cdMode` 토글 명시 / (b) `shareholders` 유무 derive | (a) 명시 토글 + 3-state 주의(memory `feedback_three_state_optional_mode_toggle`) |
| **D3** | 마법사 prefill | 멀티는 수증자 여러 명 → (a) 수증자 선택 후 그 수증자 합계 이관 / (b) 산정표만, prefill 비활성 | (a) 수증자 드롭다운 선택 후 이관 |
| **D4** | 감자후 1주평가 | (a) 엔진 자동계산(검증표용) / (b) 입력 | (a) 자동(주주 테이블에서 도출) |
| **D5** ✅확정 | 지분율 계산 방식 | (a) 정확분수 / (b) 소수1자리 % | **(a) 정확분수 확정** — 시행령 §29의2①1호 "대주주등의 감자후 지분비율"에 반올림 규정 무 → 정확분수가 법령 정합. 교재 사례1(85.7%)은 표시 반올림. anchor M1-a/b/c 정확분수 동결. 검증표 자기일관(M1-g) 충족 |
| **D6** | 기준금액 연혁 분기 | 2016.2.5~2025.2.27 `Min(30%,3억)` 포함 여부 | 사례=현행만 → 현행 우선, 연혁 분기는 후속(증여일 기준) |

---

## §12. 리스크·정책 체크

- 하위호환: 단일모드 경로(CD-1·CD-H·UI 단일) 무변경 — 회귀 0 게이트(`feedback_blocking_validation_full_e2e_regression`).
- 정수연산: `safeMultiply`/`safeMultiplyThenDivide`/`applyRate`만, `Math.round` 금지. 분수 안분 BigInt 정밀(`bigint-round-half-up`).
- 법령 정확성 최우선·유불리 표현 금지(`feedback_tax_calculation_principle`).
- 결과 표시 id 노출 금지·"원" 접미사 금지·금액 정렬.
- Map→Record(JSON 소실 방지).

**SCOPE_OUT (이번 범위 외 — 명시)**:
- ① **쌍별 비대칭 특수관계**(A↔B 특수·B↔C 특수이나 A↔C 비특수) — `relationGroup` 단일 태그로 표현 불가, 교재 미등장. 향후 쌍 매트릭스로 확장.
- ② **상장 2개월평균·비상장 보충평가 자동 연계** — `sharePrice`는 사용자 입력값(평가 산출은 기존 주식평가 도구). 할증 미포함 입력 안내만(§53⑧3호).
- ③ **증여세 본계산(공제·세율·신고세액공제)** — 마법사 prefill 위임(D3).
- ④ **기준금액 연혁분기**(2025.2.27 이전 `Min(30%,3억)`) — 현행만 구현(D6).

## §13. 다음 단계

1. ✅ **계획서 자가검토 2회 완료** — 1차(산식·법령·14지점·누락) + 2차 재검토(round/검증표 모순·고가 액면게이트·potentialAmount·수증자 선택) + KoreanLaw MCP 본문 검증. 본 문서 = v3 정정본.
2. 엔진/UI 설계 문서 생성(`gift-capital-reduction-39-2.engine.design.md` — 케이스 인벤토리·정확분수 floor 안분·검증표 자기일관 anchor).
3. **Pre-Do anchor**(M1·M2 정확분수, 실패 확보) → Phase B~H Do (엔진 → 14지점 → UI → E2E).
