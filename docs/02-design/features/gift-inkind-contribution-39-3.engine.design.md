# 현물출자에 따른 이익의 증여 (§39의3) — 엔진 설계

> 브랜치 `feat/gift-inkind-capital-39-3` · 워크트리 `.claude/worktrees/gift-inkind-capital`
> 계획서: `docs/00-pm/gift-inkind-contribution-39-3.plan.md`
> 작성 기준: **추정 금지** — 모든 인용은 file:line 또는 계획서 검증 결과 기반.

---

## Context

### 무엇이 왜 필요한가

현행 `lib/tax-engine/gift-deemed/contribution-in-kind.ts`(:10~72)는 §39의3 현물출자 의제를 구현하지만 **gross 단일값만** 산출한다(`:19` `value = safeMultiply(perShareGain, allocatedShares)`). 이로 인해:

- **저가인수 사례1(교재)**: 현물출자자 외 주주별 안분(§47) 미구현 → 산출 500,000,000, 교재 기대 450,000,000 (−50M).
- **저가인수 사례3(교재)**: gross 4,000,000은 일치하지만, §47 자기지분 제외 후 과세표준 2,000,000을 산출하지 못함.
- **고가인수 per-donee 분리**: 다수 수증자 가중 분리 불가 — `relatedRatio` 단일값만 지원.
- **증여세 본세 별건 prefill**: 저가=N 증여자 동시증여·고가=N 수증자 독립 건 분리가 모두 미구현.

### 해소 근거

세무교재 계산사례 1·2·3 + KoreanLaw MCP 본문(상증법 MST 276123·상증령 MST 283637) + 조세심판원 조심2010서3741(2011.6.29.)로 **2단계 구조 확인**:
- **(A) 증여재산가액 총액(gross)**: 상증령 §29의3①1호 산식 — 지분비율 인자 없음. 사례3의 4M이 이 gross.
- **(B) 증여자별 안분**: 조심2010서3741 — 현물출자자 본인 자기지분 제외 후 기존 각 주주별 구분 계산(§47 증여자별 과세표준). 사례1의 450M = gross 500M × 90%.

---

## ★ 케이스 인벤토리

> anchor 1행 = 테스트 1건 이상. **6 anchor 전부 Phase-0에서 동결(RED→GREEN 순)**.

| # | anchor ID | 시나리오 | 입력 요지 | 기대 `deemedGiftValue` / breakdown | anchor 출처 | 테스트 파일 | 상태 |
|---|-----------|---------|----------|--------------------------------------|-------------|------------|------|
| 1 | TBC-1 | CASE-1 저가·다수 증여자 안분 | caseType=low, preContribPrice=20000, preContribShares=100000, newSharePrice=10000, contributedShares=100000, allocatedShares=100000, parties=[A:55000,B:35000] | gross=500,000,000 / A=275,000,000 / B=175,000,000 / **deemedGiftValue=450,000,000** | 교재 사례1 | `contribution-textbook-anchor.test.ts` | ☐ TODO |
| 2 | TBC-2 | CASE-2 고가·다수 수증자 분리 | caseType=high, preContribPrice=5000, preContribShares=100000, newSharePrice=20000, contributedShares=50000, allocatedShares=50000, parties=[B:35000,C:10000] | B=175,000,000 / C=50,000,000 / **deemedGiftValue=225,000,000** | 교재 사례2 | 동일 | ☐ TODO |
| 3 | TBC-3L (gross) | CASE-3L 저가·roster無 gross | caseType=low, preContribPrice=1000, preContribShares=20000, newSharePrice=600, contributedShares=20000, allocatedShares=20000, parties=undefined | **deemedGiftValue=4,000,000** (gross) / grossDeemedGiftValue=4,000,000 | 교재 사례3 저가 | 동일 | ☐ TODO |
| 3-2 | TBC-3L (과세) | CASE-3L 저가·roster有 과세 | 위 동일 + parties=[을:10000] | **deemedGiftValue=2,000,000** (§47 자기지분 50% 제외) / grossDeemedGiftValue=4,000,000 | 교재 사례3 저가 §47 적용 | 동일 | ☐ TODO |
| 4 | TBC-3H | CASE-3H 고가·단일 비율 | caseType=high, preContribPrice=1000, preContribShares=20000, newSharePrice=2000, contributedShares=20000, allocatedShares=20000, parties=[을:10000] | **deemedGiftValue=5,000,000** | 교재 사례3 고가 | 동일 | ☐ TODO |
| 5 | TBC-RES | floor 잔액흡수 | caseType=low, gross=1,000,000, preContribShares=3, allocatedShares=3, parties=[A:1,B:1] (자기1) | taxableTotal=floor(1,000,000×2/3)=666,666 / A=floor(1,000,000×1/3)=333,333 / **B=666,666−333,333=333,333** (잔액흡수) | plan.md §A4·TBC-RES | 동일 | ☐ TODO |
| 6 | TBC-NOTE | 법령 note 키워드 toContain | CASE-1 결과 breakdown note | `§53⑧3호`·`§4의2⑥`·`§43①`·`현물출자 납입일` 포함 | plan.md Phase 0 | 동일 | ☐ TODO |

**회귀 게이트**: 기존 anchor `CON-1`(저가 99,990,000)·`CON-H`(고가 60,003,000)·`IMP-CON`(소액주주 의제 echo)은 roster=undefined 경로에서 **불변**.

---

## 법령 근거

모든 조문은 KoreanLaw MCP 검증 완료(계획서 §3, MST 276123·283637).

### 핵심 계산 조문

```
상증령 §29의3①1호 (저가인수 증여재산가액 = gross):
  "(§29②1가목 준용) 현물출자 후 1주당 평가가액 − 신주 1주당 인수가액 × 현물출자자가 배정받은 신주수"
  ※ 지분비율 인자 없음 → 사례3 gross 4,000,000

상증령 §29의3①2호 (고가인수):
  "현물출자자 외 주주등의 지분비율을 각각 곱하여" — 고가인수에서만 비율 명시.

조심2010서3741 (저가인수 증여자별 안분 근거):
  현물출자자가 얻은 이익은 신주를 배정받지 않은 기존 각 주주(=현물출자자 外 주주)로부터
  증여받은 것으로 보아 각 주주별로 구분 계산 (§47 증여자별 과세표준).
  현물출자자 본인의 현물출자 전 지분은 자기증여라 증여자 풀에서 제외.
```

### 가중평균 1주당 평가 (후)

```
상증령 §29②1가목 본문:
  [(현물출자 전 1주당 평가가액 × 전 주식총수) + (신주 1주당 인수가액 × 증가주식수)]
  ÷ (전 주식총수 + 증가주식수)
  → capital-helpers.ts:6~18 computeWeightedPerShare() 재사용
```

### 적용요건 게이트

```
상증령 §29의3② (저가인수: 게이트 없음, 고가인수: 2중 게이트):
  30% 게이트: 1주당 차액 ≥ 현물출자 후 1주당 가액 × 30%  (per-share, 공통)
  3억 게이트: 이익 ≥ 300,000,000  (per-donee — roster有 경로에서만 개별 판정)
  roster無 aggregate 경로: 합계 기준으로 3억 게이트 적용(다수 수증자 개별 < 3억·합계 ≥ 3억 시 과대적용 가능)
  → 주석 명시 필수
```

### 증여시기

```
상증법 §39의3① 본문: "현물출자 납입일을 증여일로 한다."
  → GIFT.CONTRIBUTION_TIMING 상수로 표기
```

### 최대주주 할증평가 배제

```
상증령 §53⑧3호: §28·§29·§29의2·§39의3·§30 이익 계산 시 §63③ 할증평가 배제
  → GIFT.PREMIUM_EXCLUSION_29_3 상수로 표기
  ※ 계획서 §3-4 정정: §53⑥ 아님, §53⑧3호로 확정
```

### 연대납부의무 면제·중복배제·1년합산

```
상증법 §4의2⑥ 단서: 연대납부 배제 열거에 §39의3 포함
  → GIFT.JOINT_LIABILITY_EXEMPTION 상수로 표기

상증법 §43①: 중복적용 배제(이익 최대 1개) — §39의3 포함
  → GIFT.DUP_EXCLUSION (기존 상수 재사용)

상증법 §43②: 1년 내 동일거래 합산 — §39의3 포함, 계산방법 상증령 §32의4 6호
  → GIFT.DUP_EXCLUSION_ANNUAL 상수 신규
```

---

## 법령 상수 추가 (`lib/tax-engine/legal-codes/inheritance-gift.ts`)

현행 파일(`inheritance-gift.ts:134`) `GIFT.CONTRIBUTION = "상증법 §39의3"` 존재. 아래 4개 신규 추가 (문자열 리터럴 금지 — CLAUDE.md 정책):

```ts
// 현행 위치: inheritance-gift.ts:134
CONTRIBUTION: "상증법 §39의3",          // 기존 — 유지

// ── 신규 추가 (§39의3 보완) ──
/** 상증법 §39의3① 본문 — 현물출자 납입일을 증여일로 한다 */
CONTRIBUTION_TIMING: "상증법 §39의3① 본문",

/** 상증령 §53⑧3호 — §39의3 이익 계산 시 최대주주 할증평가 배제 */
PREMIUM_EXCLUSION_29_3: "상증령 §53⑧3호",

/** 상증법 §4의2⑥ 단서 — §39의3 수증자에 대한 증여자 연대납부의무 면제 */
JOINT_LIABILITY_EXEMPTION: "상증법 §4의2⑥ 단서",

/** 상증법 §43② + 상증령 §32의4 6호 — §39의3 이익의 1년 내 동일거래 합산 */
DUP_EXCLUSION_ANNUAL: "상증법 §43② · 상증령 §32의4 6호",
```

> `GIFT.DUP_EXCLUSION` (`inheritance-gift.ts:151`)은 §43①(중복배제) 기존 상수 — 재사용. `DUP_EXCLUSION_ANNUAL`(§43②, 1년합산)은 별개 신규 상수.

---

## 엔진 input 타입

> 변경 파일: `lib/tax-engine/gift-deemed/types.ts`(:221~233)

### 신규: `ContributionParty`

```ts
/**
 * §39의3 현물출자 당사자 명부 1행.
 * caseType=low: 증여자(현물출자자 外 기존 주주) 1명
 * caseType=high: 수증자(현물출자자의 특수관계 기존 주주) 1명
 * 분모는 양 caseType 모두 preContribShares.
 */
export interface ContributionParty {
  /** 표시명 (undefined·빈문자열 시 결과뷰 "주주" 대체 — feedback_no_internal_id_in_result) */
  name?: string;
  /** 현물출자 전 보유 주식수 (안분 분자) */
  preShares: number;
  /**
   * 관계 — 증여세 본세 prefill 시 donorRelation(저가) / 수증자 관계(고가) 매핑용.
   * 미지정 시 증여세 마법사에서 "증여자 관계를 선택하세요"로 자연 차단.
   * 타입: GiftDonorRelation (inheritance-gift.types.ts:216 re-export)
   */
  relation?: GiftDonorRelation;
}
```

### 변경: `ContributionInput` (기존 `:221~233` 확장)

```ts
/** (10) 현물출자 §39의3 — 저가인수(low, ①1호) / 고가인수(high, ①2호) */
export interface ContributionInput {
  caseType?: "low" | "high";              // 기본 low
  preContribPrice: number;                // 현물출자 전 1주당 평가가액
  preContribShares: number;               // 현물출자 전 발행주식총수
  newSharePrice: number;                  // 신주 1주당 인수가액
  contributedShares: number;              // 현물출자 주식수
  allocatedShares: number;                // 배정받은 신주수 (low) / 인수 신주수 (high)
  // 고가 전용 — roster無 aggregate 경로용 (기존 필드 유지)
  relatedRatio?: { numer: number; denom: number };
  // §39의3②: 소액주주 1인 의제 (저가인수 한정, 기존 필드 유지)
  smallShareholderImputation?: boolean;
  /**
   * 현물출자 당사자 명부 — 3-state (feedback_three_state_optional_mode_toggle):
   *   undefined  = OFF (현행 gross/relatedRatio 경로 유지)
   *   []         = ON 빈 (validate 차단)
   *   [{...}, ...] = 데이터
   * low: 증여자(현물출자자 外 전체 주주), high: 수증자(특수관계 기존주주만).
   * 분모 = preContribShares (양 caseType 공통).
   */
  parties?: ContributionParty[];
}
```

---

## 엔진 result 타입

> 변경 파일: `lib/tax-engine/gift-deemed/types.ts`(:32~76) `DeemedGiftResult`

```ts
/** 모든 계산기 공통 결과 (현행 DeemedGiftResult에 2필드 추가) */
export interface DeemedGiftResult {
  type: DeemedGiftType;
  applied: boolean;
  /** 증여재산가액 (원, 정수) — 의미 고정표(plan.md §0 ★):
   *   저가 + roster無: = gross (법문 §29의3①1, 자기지분 미제외 — 과세표준 아닐 수 있음)
   *   저가 + roster有: = Σ 증여자별 과세 (gross × 각 증여자 지분/preContribShares, 자기지분 제외)
   *   고가 roster無:   = relatedRatio 적용 집계값
   *   고가 roster有:   = Σ per-donee 과세
   */
  deemedGiftValue: number;
  breakdown: CalculationStep[];
  exclusionReason?: string;
  legalBasis: string;
  thresholdEcho?: Record<string, number | boolean>;
  // ─── §39의3 신규 필드 ───────────────────────────────────────────────────
  /**
   * caseType echo (echo-field-pattern — 산식 불변, 노출만).
   * contributionLow→"low", contributionHigh→"high" set.
   * 결과뷰·prefill은 gross 대소비교(grossDeemedGiftValue >= deemedGiftValue) 휴리스틱 대신
   * 이 명시값으로 저가/고가를 판정한다 (고가 roster有도 gross(base) >= Σper-donee 성립 →
   * gross 비교 시 고가가 저가로 오판되어 동시증여 prefill로 잘못 라우팅됨).
   */
  caseType?: "low" | "high";
  /**
   * gross (법문 §29의3①1, 안분 전 총액) echo.
   * 저가·고가 모두 항상 산출.
   * 저가 roster無: grossDeemedGiftValue === deemedGiftValue (동일)
   * 저가 roster有: grossDeemedGiftValue > deemedGiftValue (자기지분 미제외분 포함)
   * 결과뷰에서 deemedGiftValue !== grossDeemedGiftValue 시 amber 경고 필수.
   */
  grossDeemedGiftValue?: number;
  /**
   * 당사자별 안분 명세 — **배열**(Map 금지 — feedback_engine_result_map_json_loss).
   * 저가 roster有: 증여자별 (자기지분 제외)
   * 고가 roster有: 수증자별 per-donee
   * roster無: undefined
   */
  contributionBreakdown?: {
    /** 표시명: name.trim() || "주주" (feedback_no_internal_id_in_result) */
    party: string;
    /** 현물출자 전 보유 주식수 */
    preShares: number;
    /** 비율 표시 문자열 (예: "55,000/100,000") */
    ratioLabel: string;
    /** 안분 금액 (원, 정수) */
    value: number;
    /**
     * 관계 (ContributionParty.relation 그대로 전달).
     * 결과뷰 → 증여세 본세 prefill 시 donorRelation 매핑에 사용.
     */
    relation?: GiftDonorRelation;
  }[];
  // ─── 기존 §37·§33 전용 필드 (유지) ──────────────────────────────────────
  periodBreakdown?: { /* ... 기존 유지 */ }[];
  rectification?: { /* ... 기존 유지 */ };
  subGifts?: { /* ... 기존 유지 */ }[];
}
```

> `GiftDonorRelation`은 `lib/tax-engine/types/inheritance-gift.types.ts:216`에서 re-export되며
> `lib/tax-engine/types/inheritance-gift-deduction.types.ts:247`의 `DonorRelation`과는 별개 타입.
> `ContributionParty.relation`·`contributionBreakdown[].relation`은 **`GiftDonorRelation`** 사용.
> 증여세 본세 prefill 시 `GiftDonorRelation` → `DonorRelation` 매핑 변환은 `gift-deemed-api.ts` 책임.

---

## 계산 알고리즘 (단계별)

### 공통 Step 1: 현물출자 후 1주당 가액 산출

```
perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares)
  // capital-helpers.ts:6~18 재사용 (BigInt 오버플로 방지)
  // 상증령 §29②1가목 준용
```

### A. 저가인수 (`caseType === "low"` 또는 기본값)

**Step 2-L: 1주당 이익 및 gross 산출**

```
perShareGain = perShareAfter - newSharePrice   // 저가: 평가 > 인수가 → 양수
gross = perShareGain > 0
      ? safeMultiply(perShareGain, allocatedShares)
      : 0
grossDeemedGiftValue = gross                   // 항상 echo
```

**Step 3-L: 분기 — roster有 vs roster無**

```
if (parties === undefined || parties.length === 0):
  // roster無: gross만 표시, 자동 안분 금지 (feedback_no_silent_apportion_fallback)
  deemedGiftValue = gross
  contributionBreakdown = undefined
  warnings: amber 경고 ("증여자 명부 미입력 — 자기지분 포함 전액이 표시됩니다")

else:
  // roster有: taxableTotal 먼저 산출
  Σ파티주식 = Σ parties[i].preShares
  taxableTotal = safeMultiplyThenDivide(gross, Σ파티주식, preContribShares)
  //   ★ 기준은 taxableTotal (gross 아님) — feedback_floor_residual_absorption
  //   gross 기준이면 자기증여 비과세분이 마지막 증여자에 흡수돼 과대과세

  // per-donor 안분 (floor + 잔액흡수)
  Σfloor = 0
  breakdown = []
  for i in 0..N-2:
    v_i = safeMultiplyThenDivide(gross, parties[i].preShares, preContribShares)
    // = Math.floor(gross × parties[i].preShares / preContribShares)
    breakdown.push({ party: name.trim()||"주주", preShares, ratioLabel, value: v_i, relation })
    Σfloor += v_i
  // 마지막 party: taxableTotal 잔액흡수
  v_last = taxableTotal - Σfloor
  breakdown.push({ ..., value: v_last })

  deemedGiftValue = taxableTotal   // = Σ안분값 = deemedGiftValue(과세)
```

> **TBC-RES 검증**: gross=1,000,000·preContribShares=3·parties=[A:1,B:1] →
> taxableTotal=floor(1,000,000×2/3)=666,666·A=333,333·B=333,333 (잔액흡수).

**Step 4-L: 소액주주 의제 note**

```
imputation = input.smallShareholderImputation === true
breakdown 마지막 row note: "§39의3①1호 저가인수" + (imputation ? " · §39의3② 소액주주 1인 의제" : "")
```

**Step 5-L: breakdown note (법령 키워드 포함)**

```
breakdown에 법령 note 행 추가 — GIFT.CONTRIBUTION_TIMING·GIFT.PREMIUM_EXCLUSION_29_3·GIFT.JOINT_LIABILITY_EXEMPTION·GIFT.DUP_EXCLUSION 상수 사용.
// TBC-NOTE: breakdown 전체 note 문자열이 §53⑧3호·§4의2⑥·§43①·현물출자 납입일 포함하는지 확인.
```

---

### B. 고가인수 (`caseType === "high"`)

**Step 2-H: 1주당 차액 및 base 산출**

```
perShareGain = newSharePrice - perShareAfter   // 고가: 인수가 > 평가 → 양수
base = perShareGain > 0 ? safeMultiply(perShareGain, allocatedShares) : 0
grossDeemedGiftValue = base                    // 항상 echo
```

**Step 3-H: 분기 — roster有 vs roster無**

```
if (parties === undefined || parties.length === 0):
  // 현행 경로 유지 (CON-H 회귀 보존) — 저가 Step 3-L과 대칭.
  // validate 우회 시 빈 안분(deemedGiftValue=0) 방어.
  relatedRatio = input.relatedRatio ?? { numer: 0, denom: 1 }
  gain = safeMultiplyThenDivide(base, relatedRatio.numer, relatedRatio.denom)
  applyGate(gain, perShareGain, perShareAfter)  // 30%·3억
  deemedGiftValue = applied ? gain : 0
  contributionBreakdown = undefined

else:
  // roster有: per-donee 분리
  preTotal = preContribShares  // 분모 = preContribShares (공통)
  breakdown = []
  deemedGiftValue = 0
  for party in parties:
    v_i = safeMultiplyThenDivide(base, party.preShares, preTotal)
    // 적용요건 per-donee 판정:
    //   30% 게이트: perShareGain >= Math.floor(perShareAfter * 30 / 100) [per-share, 공통]
    //   3억 게이트: v_i >= 300,000,000 [per-donee — §29의3② "그 이익"]
    partyApplied = v_i > 0 && (perShareGain30Met || v_i >= 300_000_000)
    breakdown.push({ party, preShares, ratioLabel, value: partyApplied ? v_i : 0, relation })
    if (partyApplied) deemedGiftValue += v_i
```

> roster無 aggregate 경로의 3억 게이트는 합계 기준 → 다수 특수관계인 개별<3억·합계≥3억 시 과대적용 가능. **코드 주석에 명시 필수.** 30%는 per-share 공통이라 영향 없음.

---

### C. 공통 결과 조립

```
return {
  type: "contribution",
  applied: deemedGiftValue > 0,
  caseType,                       // echo: contributionLow→"low" / contributionHigh→"high" (echo-field-pattern)
  deemedGiftValue,
  grossDeemedGiftValue,           // 항상 산출
  contributionBreakdown,          // roster有만
  breakdown: CalculationStep[],
  exclusionReason: ...,
  legalBasis: GIFT.CONTRIBUTION,
  thresholdEcho: { gain: deemedGiftValue, smallShareholderImputation: imputation },
}
```

---

## `deemedGiftValue` 의미 고정표 (plan.md §0 ★ 동결)

| 분기 | `deemedGiftValue` | `grossDeemedGiftValue` |
|------|------------------|----------------------|
| 저가 + roster無 | = gross (법문 §29의3①1, **자기지분 미제외 — 과세표준 아닐 수 있음**) | = gross |
| 저가 + roster有 | = Σ 증여자별 과세 (gross × 각 증여자 지분/preContribShares, 자기지분 제외) | = gross |
| 고가 roster無 (relatedRatio) | = relatedRatio 적용 집계값 | = base (차액×인수신주, ratio 前) |
| 고가 roster有 (per-donee) | = Σ per-donee 과세 | = base |

---

## Silent fallback / 자동 안분 후보 식별

**자동 안분 금지 필드** (`feedback_no_silent_apportion_fallback`):

| 필드 | 잠재적 fallback | 판단 | 처리 |
|------|----------------|------|------|
| `parties` (저가 roster無) | "현물출자자 外 전체 지분율을 (1−자기지분율)로 자동계산해 안분" | **금지** | gross만 표시 + amber 경고 |
| `parties[]` (고가 roster無) | "relatedRatio 자동 사용해 per-donee 안분" | **금지** | relatedRatio aggregate 경로만 사용 |
| `parties = []` (빈 배열) | "ON 빈 → 안분 0으로 처리" | **금지** | validate 차단 (⑧ Zod superRefine) |

**허용 fallback**:
- `caseType` 미입력 → `"low"` 기본값 (기존 동작 유지, `contribution-in-kind.ts:11`)
- `relatedRatio` 미입력 + roster無 고가 → `{ numer:0, denom:1 }` (기존 동작, CON-H 보존)

---

## 테스트 약속

### anchor 파일

**신규**: `__tests__/tax-engine/gift-deemed/contribution-textbook-anchor.test.ts`

6건 TBC anchor (모두 원단위 `toBe()` — `feedback_pdf_example_test_anchoring`):

```ts
// TBC-1: CASE-1 저가·다수 증여자
it("[TBC-1] CASE-1 저가인수 — gross 500M, A 275M, B 175M, 과세 450M", () => {
  const result = calcContributionGift({
    caseType: "low",
    preContribPrice: 20_000, preContribShares: 100_000,
    newSharePrice: 10_000, contributedShares: 100_000, allocatedShares: 100_000,
    parties: [
      { name: "A", preShares: 55_000 },
      { name: "B", preShares: 35_000 },
    ],
  });
  expect(result.grossDeemedGiftValue).toBe(500_000_000);
  expect(result.contributionBreakdown?.[0].value).toBe(275_000_000);  // A
  expect(result.contributionBreakdown?.[1].value).toBe(175_000_000);  // B
  expect(result.deemedGiftValue).toBe(450_000_000);
});

// TBC-2: CASE-2 고가·다수 수증자
it("[TBC-2] CASE-2 고가인수 — B 175M, C 50M, 합계 225M", () => {
  const result = calcContributionGift({
    caseType: "high",
    preContribPrice: 5_000, preContribShares: 100_000,
    newSharePrice: 20_000, contributedShares: 50_000, allocatedShares: 50_000,
    parties: [
      { name: "B", preShares: 35_000 },
      { name: "C", preShares: 10_000 },
    ],
  });
  expect(result.contributionBreakdown?.[0].value).toBe(175_000_000);
  expect(result.contributionBreakdown?.[1].value).toBe(50_000_000);
  expect(result.deemedGiftValue).toBe(225_000_000);
});

// TBC-3L gross: roster無 → gross 4M
// TBC-3L 과세: roster=[을:10000] → 과세 2M, gross echo 4M
// TBC-3H: roster=[을:10000] → 5M
// TBC-RES: floor 잔액흡수
// TBC-NOTE: breakdown note에 법령 키워드 toContain
```

### 회귀 anchor (변경 없음 보장)

```
__tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts   [CON-1] 99,990,000
__tests__/tax-engine/gift-deemed/capital-subcase-anchor.test.ts        [CON-H] 60,003,000
__tests__/tax-engine/gift-deemed/small-shareholder-imputation-anchor.test.ts [IMP-CON]
```

> parties=undefined(roster 미사용) 경로는 기존 동작 완전 보존 → 회귀 anchor 불변 게이트.

### 수행 명령

```bash
# TBC 6 anchor (신규)
npx vitest run __tests__/tax-engine/gift-deemed/contribution-textbook-anchor.test.ts

# 회귀 게이트
npx vitest run \
  __tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts \
  __tests__/tax-engine/gift-deemed/capital-subcase-anchor.test.ts \
  __tests__/tax-engine/gift-deemed/small-shareholder-imputation-anchor.test.ts

# gift-deemed 전건
npx vitest run __tests__/tax-engine/gift-deemed/
```

---

## 14 동기화 지점 — 엔진 담당 지점

> ⚠️ 본 표의 ①~⑭ 번호는 현행 상태 survey용 일련번호이며, **CLAUDE.md Definition-of-Done 14지점 표준번호(①폼~⑧validation·⑨Zod메인~⑭Route)는 UI 설계 문서 §10이 정본**이다. Check 단계 ui-engine-sync-checker는 표준번호로 점검.
> 전체 14지점 중 엔진 시니어 담당 지점은 A1·A2·A3·A4·A5 (Phase A). UI 시니어는 Phase B 담당.

| Phase | 지점 | 파일 | 변경 내용 |
|-------|------|------|----------|
| A1 | ⑨ 타입 | `lib/tax-engine/gift-deemed/types.ts` | `ContributionParty` 신규 + `ContributionInput.parties?` 추가 + `DeemedGiftResult.grossDeemedGiftValue?`·`contributionBreakdown?` 추가 |
| A2 | ⑩ 저가엔진 | `lib/tax-engine/gift-deemed/contribution-in-kind.ts` `contributionLow()` | gross 산출 유지 + parties有 per-donor 안분 + floor 잔액흡수 + `deemedGiftValue=Σ과세` |
| A3 | ⑩ 고가엔진 | `lib/tax-engine/gift-deemed/contribution-in-kind.ts` `contributionHigh()` | parties有 per-donee 분리 + 게이트 per-donee + roster無 경로 유지 |
| A4 | ⑩ floor 잔액 | `contribution-in-kind.ts` | `taxableTotal` 기준 잔액흡수 (gross 기준 금지) |
| A5 | 법령 상수 | `lib/tax-engine/legal-codes/inheritance-gift.ts` | `GIFT.CONTRIBUTION_TIMING`·`GIFT.PREMIUM_EXCLUSION_29_3`·`GIFT.JOINT_LIABILITY_EXEMPTION`·`GIFT.DUP_EXCLUSION_ANNUAL` 신규 4건 |

---

## UI 통합 위임

> UI 측 명세는 `gift-inkind-contribution-39-3.ui.design.md` (미작성 — UI 시니어 책임).
> 엔진 시니어는 input/result 타입 정의까지만 담당. 이하는 **UI 시니어 전달 사항**.

### UI 시니어가 구현할 Phase B 지점

| 지점 | 파일 | 내용 |
|------|------|------|
| ① 폼 상태 | `components/calc/deemed-gift/shared.tsx` | `conParties: { name: string; shares: string }[]` 추가 (3-state: undefined/[]/[...]) |
| ② initial | `shared.tsx` INITIAL_DEEMED | `conParties: undefined` 초기값 |
| ③ normalize | sessionStorage 마이그 | `conParties` undefined 허용 |
| ④ API 변환 | `lib/calc/gift-deemed-api.ts` case `contribution` | `parties` 배열 변환 (빈 name 허용·shares parseAmount) |
| ⑤ UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx` `ContributionFields` | roster 입력 행 추가/삭제. 저가=violet "증여자(현물출자자 外 주주)"·고가=violet "수증자(특수관계 기존주주)". `RadioCardGroup`/`ToggleCard`·`CurrencyInput` 준수 |
| ⑦ 결과 카드 | `components/calc/results/DeemedGiftResultView.tsx` | `contributionBreakdown` per-party 표 + `grossDeemedGiftValue` echo + amber 경고(deemedGiftValue≠grossDeemedGiftValue) + 법령 note. `amount-column-align` |
| ⑧ validation | `lib/calc/gift-deemed-validate.ts` case `contribution` | `parties=[]` 빈 배열 차단·Σshares ≤ preContribShares |
| ⑫ prefill | `lib/calc/gift-deemed-api.ts` `buildGiftWizardPrefill` | 저가: `contributionBreakdown` N행 → 동시증여 다건(`simultaneousGifts[]`) populate. 고가: 수증자 선택 단건 prefill |

### 3중 패턴 (mirror-pattern)

`conParties` 필드:
- `initial`: `undefined` (OFF)
- `normalize`: undefined 허용 (3-state 보존)
- `API 변환`: `parties: formState.conParties?.map(...)` — undefined 전달 시 `parties: undefined`
- `validate`: `parties=[]` 차단만 (undefined=gross 경로 허용)

> **useEffect → store 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`). roster ON/OFF는 ToggleCard onChange로 직접 `conParties=undefined`/`[]` 전환.

### 별건 prefill 분리 (결정 4 — plan.md §6)

```
저가 (1 수증자=현물출자자, N 증여자):
  → calcSimultaneousGifts 재사용 (lib/tax-engine/gift-simultaneous.ts)
  → trust_benefit subGifts prefill (gift-deemed-api.ts:295~306) 패턴 차용
  → 동일인 그룹 가드: relation 미지정 시 "증여자 관계 선택" 차단으로 자연 가드
  → 다중 giftItems 단순 합산 금지 (서로 다른 증여자는 §47 합산 불가)

고가 (1 증여자=현물출자자, N 수증자=독립 납세의무자):
  → 수증자별 독립 건 (동시증여 아님)
  → 결과뷰에서 수증자별 금액 리스트 제시 → 사용자 단건 선택 prefill
  → multi-수증자 N-건 자동화는 Phase B 설계 확정 (본 PR 범위 외)
```

---

## 적용 정책 (메모리 사전 점검)

| 정책 | 적용 지점 |
|------|----------|
| `feedback_no_silent_apportion_fallback` | roster無 자동 안분 금지 — gross만 + amber 경고 |
| `feedback_engine_result_map_json_loss` | `contributionBreakdown` 배열(Map 금지) |
| `feedback_no_internal_id_in_result` | `party` 라벨 `name.trim() \|\| "주주"` |
| `feedback_floor_residual_absorption` | taxableTotal 기준 잔액흡수 (gross 아님) |
| `feedback_three_state_optional_mode_toggle` | `parties`: undefined/[]/[...] 3-state |
| `feedback_validation_sync_8th_point` | validate 차단 = `parties=[]` 빈 배열 (UI 통과↔validate 모순 0) |
| `feedback_korean_law_citation_verify` | §53⑧3호·§4의2⑥·§43①② 계획서 §3에서 MCP 검증 완료 |
| `feedback_tax_calculation_principle` | 유불리·절감 표현 금지, 중립 사실 |
| `amount-column-align` | per-party 금액 표 `font-mono tabular-nums` 우측정렬 |
| `mirror-pattern` | conParties 3-layer 동기화, useEffect 금지 |
| `feedback_useeffect_store_mirror_forbidden` | roster ON/OFF = onChange 직접 전환 |

---

## 완료 정의

- [ ] TBC-1·2·3L(gross+과세)·3H·RES·NOTE 6 anchor green
- [ ] CON-1·CON-H·IMP-CON 불변 (회귀 0)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 전건 green
- [ ] `contributionBreakdown` 배열이 `/api/calc/gift-deemed` JSON 왕복 후 결과뷰까지 보존 (배열 소실 없음)
- [ ] 결과뷰 per-party 표·gross echo·법령 note·amber 경고 표시
- [ ] E2E 신규 1건 (`e2e/gift-deemed-capital.spec.ts`): 저가 roster 입력→결과뷰 per-party 표·gross echo→증여세 본세 handoff→동시증여 N개 prefill 확인
