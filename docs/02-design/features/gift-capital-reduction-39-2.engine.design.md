# 감자에 따른 이익의 증여(§39의2) — 불균등 감자 N:N 주주 안분 엔진 설계

> 작성일: 2026-06-25 · 계획서 v3 기준 · anchor 수치 실측 검증 완료

---

## §1 케이스 인벤토리 (Do 진입 전 필수)

> 행 1개 = 테스트 1개 이상. 상태 ☐ = TODO, ✅ = 통과, 🔴 = 실패(Pre-Do 빨강 확보), SCOPE_OUT = 이번 범위 외.

| # | 케이스 | 입력 요지 | 법령 | 기대값(원) | 상태 |
|---|---|---|---|---|---|
| M1-a | 저가·사례1: 병 ← 갑 | pre=200000주, eval=30000, redem=10000 / 갑 100000주 소각 / 병 60000주 잔존(postTotal=70000) / 특수관계(같은 그룹) | §29의2①1호 | `1,714,285,714` | ☐ |
| M1-b | 저가·사례1: 병 ← 을 | 을 30000주 소각 / 병 잔존 60000 / 특수관계 | §29의2①1호 | `514,285,714` | ☐ |
| M1-c | 저가·사례1: 병 총 | M1-a + M1-b 합계 (자기일관: 법령 공식 total과 일치) | §29의2①1호 | `2,228,571,428` | ☐ |
| M1-d | 저가·사례1: 소액주주(비과세) | 소액주주 10000주 잔존 / 갑·을과 **비특수관계** → isTaxable=false / 과세=0 / potentialAmount 참고 | §39의2①1호 특수관계 한정 | `applied=false`, `potentialAmount=371,428,571` | ☐ |
| M1-e | 저가·사례1: 과세요건 비율 | (30000-10000)/30000=66.7% ≥ 30% → 기준금액=0 | §29의2② 단서 | `thresholdApplied=0` | ☐ |
| M1-f | 저가·사례1: 감자후 1주평가 표시값 | [(200000×30000)-(130000×10000)]/(200000-130000)=67142.857 → round | §29의2①1호 산식 입력값 | 표시 `67,143` (계산용 정확값 67142.857) | ☐ |
| M1-g | 저가·사례1: 검증표 증감 자기일관 | 병 60000×(67142.857-30000) = 2,228,571,428 = M1-c (floor) | 정확분수 자기일관 | `2,228,571,428` | ☐ |
| M2-a | 고가·사례2: 병 ← 갑 | pre=200000주, eval=6000(액면10000>eval), redem=9000 / 병 60000주 소각 / 갑 80000주 잔존(postTotal=120000) / 특수관계 | §29의2①2호, §29의2① 액면 게이트 충족(eval<faceValue) | `120,000,000` | ☐ |
| M2-b | 고가·사례2: 병 ← 을 | 을 40000주 잔존 / 특수관계 | §29의2①2호 | `60,000,000` | ☐ |
| M2-c | 고가·사례2: 병 총 | M2-a + M2-b | §29의2①2호 | `180,000,000` | ☐ |
| M2-d | 고가·사례2: 정 ← 갑 | 정 20000주 소각 / 갑 잔존 80000 / 특수관계 | §29의2①2호 | `40,000,000` | ☐ |
| M2-e | 고가·사례2: 정 ← 을 | 을 잔존 40000 / 특수관계 | §29의2①2호 | `20,000,000` | ☐ |
| M2-f | 고가·사례2: 정 총 | M2-d + M2-e | §29의2①2호 | `60,000,000` | ☐ |
| M2-g | 고가·사례2: 과세요건 비율 | (9000-6000)/6000=50% ≥ 30% → 기준금액=0 | §29의2② 단서 | `thresholdApplied=0` | ☐ |
| M2-h | 고가·사례2: 감자후 1주평가 | [(200000×6000)-(80000×9000)]/(200000-80000)=4000 | §29의2 평가 | 표시 `4,000` | ☐ |
| M2-i | 고가: 자기일관 | Σ fromDonors(병) = M2-c, Σ fromDonors(정) = M2-f | 정확분수 | 각각 일치 | ☐ |
| EC-1 | 저가·기준금액 미달 미적용 | sharePrice=100000·소각가 95000(diff=5000, 5%<30%→기준 3억) / 갑 50000주 소각·을 50000주 잔존 → 을 total=floor(5000×50000)=250,000,000 < 3억 → 미적용 | §29의2②본문 | `applied=false` | ☐ |
| EC-2 | 고가·액면 게이트 미충족 전체 미적용 | eval=15000, faceValue=10000 → eval ≥ faceValue → §29의2①2호 한정 조건 미충족 → 전체 미적용 | §29의2①2호 "평가액이 액면가액에 미달하는 경우로 한정" | `applied=false` (전체 수증자) | ☐ |
| EC-3 | 비특수관계 전부 제외 | 잔존주주가 소각주주와 모두 비특수관계 | §39의2①1호 "소각주주의 특수관계인에 해당하는 대주주등" | 전원 `isTaxable=false` | ☐ |
| EC-4 | 대주주 미충족 제외 | 수증자 지분 = 0.5%(발행총수 기준) + 특수관계인 지분 합산 후도 1% 미만, 액면총액 3억 미만 → §28② 대주주 미충족 | §28② | `isTaxable=false`, `nonTaxableReason="대주주 아님"` | ☐ |
| EC-5 | 단일 수증자 floor 잔액 흡수 (일반) | 증여자 3명(A·B·C), floor(A)+floor(B)+floor(C) ≠ total 시 C = total - floor(A) - floor(B) | 정수 floor 잔액 | Σ = donee.total | ☐ |
| EC-6 | 저가 단일 수증자·단일 증여자 (최단 경로) | 수증자 1명, 증여자 1명 → fromDonors[0] = total (잔액 흡수 = total 자체) | §29의2①1호 | `fromDonors[0].amount = donee.total` | ☐ |
| R-CD-1 | 회귀: 단일모드 저가 | `capital-transaction-anchor.test.ts:38` (기존 CD-1, 변경 금지) | §29의2①1호 | `6,000,000` | ✅ |
| R-CD-H | 회귀: 단일모드 고가 | `capital-subcase-anchor.test.ts:23` (기존 CD-H, 변경 금지) | §29의2①2호 | `500,000,000` | ✅ |

---

## §2 입력 타입

### CapitalDecreaseInput 확장 (lib/tax-engine/gift-deemed/types.ts:207-219 기준)

기존 필드 **전부 보존**(단일모드 하위호환). 멀티모드 필드를 optional 추가.

```ts
/** (9) 감자 §39의2 — 저가소각(low, ①1호) / 고가소각(high, ①2호) */
export interface CapitalDecreaseInput {
  caseType?: "low" | "high";          // 기본 low (단일·멀티 공통)
  sharePrice: number;                  // 감자주식 1주당 평가액 (§53⑧3호: 최대주주 할증 미포함)
  redemptionPrice: number;             // (단일) 소각 1주당 금액
  // ── 단일 low 전용 (기존 — 변경 금지) ──
  totalRedeemedShares?: number;        // 총감자 주식수
  majorPostRatio?: { numer: number; denom: number }; // 대주주등 감자후 지분비율
  relatedRedeemedShares?: number;      // 대주주등 특수관계인 감자 주식수
  // ── 단일 high 전용 (기존 — 변경 금지) ──
  faceValue?: number;                  // 액면가액
  ownRedeemedShares?: number;          // 해당 주주등의 감자 주식수
  // ── 멀티(불균등 감자 N:N) 모드 (신규) ──
  // shareholders 존재 시 멀티모드 dispatch. 단일모드 필드(single low/high 전용)는 무시됨.
  shareholders?: CapitalDecreaseShareholder[];  // 주주 목록 (감자주주 + 잔존주주)
  preTotalShares?: number;             // 감자 전 발행주식총수 (멀티 모드 필수)
}

export interface CapitalDecreaseShareholder {
  id: string;
  // ⚠️ 결과 표시에 노출 금지 (memory feedback_no_internal_id_in_result):
  //    name.trim() || CATEGORY_LABEL 사용
  name: string;                        // 갑/을/병/정/소액주주
  preShares: number;                   // 감자 전 보유주식수
  redeemedShares: number;              // 감자(소각)주식수 (0이면 잔존주주)
  redemptionPricePerShare?: number;    // 소각 1주당 대가 (감자주주만; 잔존주주=undefined)
  relationGroup?: string;              // 특수관계 그룹 태그 (같은 그룹 문자열 = 특수관계)
  //   예: "family_A" → 갑·을·병 모두 "family_A"이면 서로 특수관계
  //   미입력(undefined·공백)은 비특수관계로 처리(자동 안분 fallback 금지:
  //   validation 단계에서 명시 입력 강제 — 침묵 처리 금지)
}
```

**멀티/단일 dispatch 기준**: `input.shareholders !== undefined && input.shareholders.length > 0`이면 멀티모드 → `calcCapitalDecreaseMulti(input)` 호출. 그 외는 기존 `decreaseLow`/`decreaseHigh` 경로(변경 0).

---

## §3 결과 타입

### DeemedGiftResult.capitalDecreaseMulti 신규 optional (lib/tax-engine/gift-deemed/types.ts:32-76 기준)

`deemedGiftValue`(하위호환: 멀티는 과세 수증자 total 합계)는 유지. 신규 필드를 optional로 추가.

Map 금지 (memory `feedback_engine_result_map_json_loss`): NextResponse.json에서 `{}`로 소실. **Record 또는 plain 배열** 사용.

```ts
// DeemedGiftResult 인터페이스에 추가:
capitalDecreaseMulti?: CapitalDecreaseMultiResult;
```

```ts
/** 불균등 감자 N:N 다주주 모드 결과 (Map 금지 — plain 배열/Record) */
export interface CapitalDecreaseMultiResult {
  caseType: "low" | "high";

  /**
   * 감자 후 1주당 평가액
   *   exact: 정확값(분수; 검증표·증여이익 계산에 사용). 표시 금지.
   *   display: Math.round(exact) — UI 표시 전용 (M1-f=67,143, M2-h=4,000)
   * ⚠️ display 값으로 증여이익 계산 절대 금지 — M1-c 불일치 유발
   */
  postPerShareExact: number;
  postPerShareDisplay: number;

  /**
   * 수증자별 결과 배열
   * 저가: 잔존주주(isSurvivingHolder=true)만 수증자 후보
   * 고가: 감자주주(redeemedShares>0)만 수증자 후보
   */
  donees: CapitalDecreaseMultiDonee[];

  /**
   * 검증표: 주주별 감자 전·후 가치 증감
   * 자기일관 확인용 — 과세 수증자 delta 합계 = deemedGiftValue(과세분 합계)
   */
  verification: CapitalDecreaseVerification[];
}

export interface CapitalDecreaseMultiDonee {
  /** 주주 이름 (내부 id 노출 금지) */
  name: string;
  /** 대주주등(§28②) AND 특수관계(relationGroup) 충족 시 true */
  isTaxable: boolean;
  /** 비과세 사유 — "비특수관계" | "대주주 아님" | undefined(과세) */
  nonTaxableReason?: string;
  /**
   * 과세 시 총 증여재산가액 (원, 기준금액 이상인 경우)
   * 미과세·기준금액 미달 시 0
   */
  total: number;
  /**
   * 비과세 수증자 참고 산출액
   * (isTaxable=false인 경우에만: 게이트 무시 가정 산출값 — 교재 소액주주 371,428,571)
   */
  potentialAmount?: number;
  /** 적용 기준금액 (0 또는 300_000_000) */
  thresholdApplied: number;
  /**
   * 증여자별 분해 배열
   * 저가: 증여자 = 감자주주 / 고가: 증여자 = 잔존주주
   * 마지막 증여자 = raw − Σfloor(앞 증여자) 잔액 흡수
   *   → Σ fromDonors[j].amount = total (자기일관)
   * 비과세(isTaxable=false) 수증자는 빈 배열 [] (potentialAmount 참고용만 기록)
   */
  fromDonors: { donorName: string; amount: number }[];
}

export interface CapitalDecreaseVerification {
  name: string;
  /** 감자 전 주식가액 = preShares × sharePrice */
  preValue: number;
  /**
   * 감자대가(소각주주만): redeemedShares × redemptionPricePerShare
   * 잔존주주: 0
   */
  redemptionPaid: number;
  /**
   * 감자 후 주식가액 (D-UI-2 ✅): 감자주주=0 / 잔존주주=floor(postShares × postPerShareExact),
   * 단 마지막 잔존주주는 잔액 흡수 → Σ잔존=정확합, 합계 증감 0 자기일관
   */
  postValue: number;
  /**
   * 증감 = postValue + redemptionPaid − preValue
   * 잔존주주(병) delta > 0 = 이익(증여재산)
   * 감자주주(갑·을) delta ≤ 0 = 대가 수령(저가는 손해)
   */
  delta: number;
}
```

**JSON 직렬화 안전 체크 (Map 금지 보증)**:
- `donees: CapitalDecreaseMultiDonee[]` — plain 배열
- `fromDonors: { donorName: string; amount: number }[]` — plain 배열
- `verification: CapitalDecreaseVerification[]` — plain 배열
- 모든 필드 원시타입(string·number·boolean) — `JSON.stringify` 안전

---

## §4 알고리즘

### calcCapitalDecreaseMulti 7단계 의사코드

파일: `lib/tax-engine/gift-deemed/capital-decrease-multi.ts` (신규)

```
function calcCapitalDecreaseMulti(input: CapitalDecreaseInput): DeemedGiftResult

  sh        = input.shareholders           // CapitalDecreaseShareholder[]
  preTotal  = input.preTotalShares!        // validation에서 필수 보증
  evalPrice = input.sharePrice             // 감자 전 1주당 평가액 (할증 미포함)
  faceValue = input.faceValue              // 고가 게이트용


  ─── (1) 감자 후 1주당 평가액 ─────────────────────────────────────────────
  totalRedeemed       = Σ sh[j].redeemedShares
  postTotal           = preTotal - totalRedeemed
  redemptionPaidTotal = Σ (sh[j].redeemedShares × sh[j].redemptionPricePerShare ?? 0)

  // 정확값: 부동소수 나눗셈. 검증표·증여이익 계산에만 사용.
  // ⚠️ 표시값(Math.round)으로 곱셈 절대 금지 — 검증표 자기일관 파괴.
  postPerShareExact   = (preTotal × evalPrice - redemptionPaidTotal) / postTotal
  postPerShareDisplay = Math.round(postPerShareExact)        // UI 표시 전용

  헬퍼: 분모(postTotal) 0 방어 → postTotal === 0이면 에러 반환 (상속인 0명 케이스처럼)


  ─── (2) 주주별 감자 후 주식수 · 지분 (정확분수) ───────────────────────────
  postShares[i] = sh[i].preShares - sh[i].redeemedShares     // 잔존 주식수 (감자주주=0)
  // 지분비율은 분수 형태로 유지: postShares[i] / postTotal (반올림 금지)
  // 실제 계산은 safeMultiplyThenDivide에 분자(postShares[i])·분모(postTotal) 직접 전달


  ─── (3) 저가 / 고가 판정 + 고가 액면 게이트 ──────────────────────────────
  저가(low): 감자주주 소각대가 < 평가액 (감자주주 손해 → 잔존주주 이익)
    → 수증자 = 잔존주주(redeemedShares=0인 자), 증여자 = 감자주주(redeemedShares>0인 자)
  고가(high): 감자주주 소각대가 > 평가액 (잔존주주 손해 → 감자주주 이익)
    → 수증자 = 감자주주(redeemedShares>0인 자), 증여자 = 잔존주주(redeemedShares=0인 자)

  ⚠️ 고가 액면 게이트 (§29의2①2호 "평가액이 액면가액에 미달하는 경우로 한정") — 고가(high) 판정 시에만 적용:
    caseType=고가 AND (faceValue 미입력 OR evalPrice >= faceValue) → 고가 전체 미적용
    → 모든 donee.isTaxable=false, nonTaxableReason="고가소각: 평가액이 액면가 이상(§29의2①2호 미충족)"
    → 계산 조기 종료
    ※ 저가(low)는 액면 게이트 무관 — faceValue 미입력이어도 정상 적용(사례1 M1).


  ─── (4) N:N amount 계산 (저가/고가 각 공식) ─────────────────────────────
  저가(§29의2①1호):
    증여자 j = 감자주주 / 수증자 i = 잔존주주
    amount(i←j) = safeMultiplyThenDivide(
                    (evalPrice - sh[j].redemptionPricePerShare) × sh[j].redeemedShares,
                    postShares[i],
                    postTotal
                  )
    = floor( diff_j × redeemedShares_j × postRatio[i] )
    단, diff_j <= 0 이면 0

  고가(§29의2①2호):
    증여자 j = 잔존주주 / 수증자 i = 감자주주
    amount(i←j) = safeMultiplyThenDivide(
                    (sh[i].redemptionPricePerShare - evalPrice) × sh[i].redeemedShares,
                    postShares[j],
                    postTotal
                  )
    = floor( diff_i × redeemedShares_i × postRatio[j] )
    단, diff_i <= 0 이면 0

  ⚠️ safeMultiplyThenDivide(a, b, c) 시그니처(tax-utils.ts:104):
    = floor(a × b / c), BigInt fallback (c=0이면 0)
    첫 번째 인자 a = diff × redeemedShares (곱셈 먼저 — 정밀도 유지)
    현재 사례 모두 product < Number.MAX_SAFE_INTEGER 확인(실측) → 표준 경로
    단, 발행주식 수억주 이상 극단치 대비 BigInt fallback 안전장치는 내장됨


  ─── (5) 대주주등·특수관계 게이트 ────────────────────────────────────────
  수증자 i가 과세 대상인지 판정:

  [A] 대주주등 판정 (§28②) — ✅확정:
    "해당 주주등의 지분 및 그의 특수관계인의 지분을 포함하여 발행주식총수의 1% 이상
     소유하거나 액면가액이 3억원 이상인 주주등"
    relatedSet(i) = relationGroup이 sh[i]와 동일하고 비어있지 않은 모든 주주 (본인 i 포함)
    sumShares = Σ_{k∈relatedSet(i)} sh[k].preShares          // 감자 전 보유주식 (§28② 문언: 증여일 현재 소유)
    isMajorShareholder =
        (sumShares × 100 ≥ preTotal)                         // 지분 1% (정수 비교)
        OR (faceValue 입력 시 sumShares × faceValue ≥ 300_000_000)   // 액면 3억
    // faceValue 미입력 → 액면 기준 skip (지분 기준만)
    // ⚠️ 본인 단독 아닌 본인+특수관계인 합산. 기준 시점 = 감자 전(주총결의일 현재 소유).
    //    감자 前↔後로 1% 판정이 갈리는 경계는 SCOPE_OUT (예규 확인 후속).

  [B] 특수관계 판정:
    수증자 i와 증여자 j의 relationGroup이 동일하고 비어있지 않으면 특수관계
    relationGroup 미입력(undefined·공백) → 비특수관계 처리
    (자동 안분 fallback 금지 원칙: 미입력=비특수관계 명시, validation 단계에서 경고)

  [C] 최종 과세 판정:
    isTaxable[i] = isMajorShareholder[i] AND ∃j: isRelated(i, j)
    → false이면 isTaxable=false, nonTaxableReason 설정, total=0
      potentialAmount = Σ_j amount(i←j) (게이트 무시 가정치, 참고용)
    → true이면 다음 단계로


  ─── (6) 수증자별 기준금액 + 과세 판정 ───────────────────────────────────
  비율 = (저가: evalPrice - redem) / evalPrice  또는  (고가: redem - evalPrice) / evalPrice
  threshold[i] = (비율 ≥ 0.3) ? 0 : ABSOLUTE_THRESHOLD(= 300_000_000)

  rawTotal[i] = Σ_j amount(i←j)   // 특수관계 증여자 쌍만
  isTaxable[i] = rawTotal[i] >= threshold[i] AND rawTotal[i] > 0

  // 기준금액 미달 → total=0, isTaxable=false (EC-1 케이스)
  // 기준금액 0(비율≥30%) AND rawTotal>0 → 과세
  thresholdApplied[i] = threshold[i]

  // 비율 계산 주의: 감자주주별 소각대가가 다를 경우 어느 값을 기준으로 하는가?
  // 교재 사례는 감자주주 모두 동일 소각대가(저가 10000, 고가 9000)
  // 동일하지 않은 경우는 이번 SCOPE_OUT (D1 비대칭 케이스와 동일)
  // 현행: 수증자별 rawTotal 기준 단일 비율 사용 (educase 기준)


  ─── (7) floor 잔액 흡수 + fromDonors 구성 ──────────────────────────────
  과세 수증자 i에 대해 증여자 j 배열을 순서대로 처리:

  // memory feedback_floor_residual_absorption:
  // 마지막 증여자 j_last = rawTotal[i] - Σ_j<j_last floor(amount(i←j))
  // → Σ fromDonors = total = rawTotal[i] (자기일관 보증)

  fromDonors[i] = []
  runningSum = 0
  donors = 특수관계 증여자 j 배열 (순서 고정: 입력 순)
  for j in donors[0..n-2]:
    floorAmt = safeMultiplyThenDivide(base_j, postShares[i], postTotal)
    fromDonors[i].push({ donorName: sh[j].name, amount: floorAmt })
    runningSum += floorAmt
  // 마지막 증여자: 잔액 흡수
  lastAmt = rawTotal[i] - runningSum
  fromDonors[i].push({ donorName: sh[donors.last].name, amount: lastAmt })

  // M1 검증: floor(갑) + floor(을) = 1,714,285,714 + 514,285,714 = 2,228,571,428 = total (차이=0)
  // → 본 사례에서 잔액 흡수 후 을 금액은 floor(을)과 동일 (일반 케이스 EC-5에서만 차이 발생)


  ─── 최종 결과 조립 ────────────────────────────────────────────────────
  deemedGiftValue = Σ (과세 수증자 i의 total)   // 하위호환: 단일 수증자면 해당 total
  verification = 모든 주주 i에 대해 (D-UI-2 ✅확정):
    preValue       = sh[i].preShares × evalPrice
    redemptionPaid = sh[i].redeemedShares × (sh[i].redemptionPricePerShare ?? 0)
    // postValue: 감자주주(redeemedShares>0) = 0 / 잔존주주 = floor(postShares[i] × postPerShareExact)
    //   ⚠️ 마지막 잔존주주(입력 순) = (preTotal×evalPrice − redemptionPaidTotal) − Σ앞잔존 floor
    //      → 잔액 흡수로 Σ잔존 postValue = 정확합, 합계 행 증감 정확히 0 (자기일관)
    //      단순 floor만 적용 시 Σ가 정확합보다 작아 합계 증감 −1 발생 → 잔액 흡수 필수
    delta          = postValue + redemptionPaid − preValue
    // 검증표 병 delta = M1-g = 2,228,571,428. 합계 Σdelta = 0.

  return DeemedGiftResult {
    type: "capital_decrease",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown: [...],   // 상단 감자후 1주평가 + 수증자별 요약
    legalBasis: GIFT.CAPITAL_DECREASE,
    capitalDecreaseMulti: { caseType, postPerShareExact, postPerShareDisplay, donees, verification }
  }
```

---

## §5 산식 자기일관 anchor

### 5.1 M1 저가 사례1 자기일관 (실측 검증 완료)

```
// 실측값 (node 검증 2026-06-25):
const diff = 20000, gab=100000, eul=30000, byeong=60000, post_total=70000;

// M1-a: floor(20000 × 100000 × 60000 / 70000) = 1,714,285,714 ✓
// M1-b: floor(20000 × 30000 × 60000 / 70000) = 514,285,714 ✓
// M1-c: M1-a + M1-b = 2,228,571,428 ✓

// floor(갑) + floor(을) = total → 잔액 차이 = 0 (M1은 정확히 떨어짐)

// 감자후평가 exact: ((200000×30000)-(130000×10000)) / 70000 = 67142.857...
// 표시(round): 67,143

// M1-g 검증표: floor(60000 × 67142.857) - 60000×30000
//             = floor(4,028,571,420) - 1,800,000,000
//             = 4,028,571,420 - 1,800,000,000
//             = 2,228,571,428 = M1-c ✓
// ⚠️ 검증표 계산에 postPerShareDisplay(67143) 사용 금지
//    floor(60000 × 67143) = 4,028,580,000 → delta = 2,228,580,000 ≠ M1-c
```

### 5.2 M2 고가 사례2 자기일관 (실측 검증 완료)

```
// 실측값:
// M2-a: floor(3000 × 60000 × 80000 / 120000) = 120,000,000 ✓
// M2-b: floor(3000 × 60000 × 40000 / 120000) = 60,000,000 ✓
// M2-c = M2-a + M2-b = 180,000,000 = raw(= diff × byeong_redeemed = 3000 × 60000) ✓
// M2-d: floor(3000 × 20000 × 80000 / 120000) = 40,000,000 ✓
// M2-e: floor(3000 × 20000 × 40000 / 120000) = 20,000,000 ✓
// M2-f = M2-d + M2-e = 60,000,000 ✓

// 잔존주주 지분합 = (80000 + 40000) / 120000 = 1 → raw = Σ fromDonors 자동 성립
// M2도 잔액 차이 = 0 (정확히 떨어짐)

// M2-h: ((200000×6000)-(80000×9000)) / 120000 = 4,000 ✓
```

### 5.3 deemedGiftValue 하위호환 일관성

```
// 단일 과세 수증자(M1: 병만 과세) → deemedGiftValue = M1-c = 2,228,571,428
// 복수 과세 수증자(M2: 병+정 모두 과세) → deemedGiftValue = M2-c + M2-f = 240,000,000
// ⚠️ 마법사 prefill(D3)에서 수증자별 이관 시 총합이 아닌 선택 수증자 개별 total 사용
```

### 5.4 BigInt 필요성 판단 (실측)

```
// M1-a: diff × gab = 20000 × 100000 = 2e9 < MAX_SAFE(9.007e15) → 표준 경로
// M2-a: diff × byeong = 3000 × 60000 = 1.8e8 << MAX_SAFE → 표준 경로
// 극단치: diff=100000 × redeemed=1e9 = 1e14 < MAX_SAFE → 표준 경로
// safeMultiplyThenDivide 내부 BigInt fallback은 안전장치로만 동작 (현재 사례 진입 없음)
```

---

## §6 동기화 지점

### 엔진 레이어 동기화

| 파일 | 변경 | 비고 |
|---|---|---|
| `lib/tax-engine/gift-deemed/types.ts` | `CapitalDecreaseInput`에 `shareholders?·preTotalShares?` 추가, `CapitalDecreaseShareholder` 신규, `DeemedGiftResult`에 `capitalDecreaseMulti?` 추가 | 기존 단일모드 필드 전부 보존 |
| `lib/tax-engine/gift-deemed/capital-decrease.ts` | `calcCapitalDecreaseGift` dispatch 분기 추가: `input.shareholders?.length > 0` → `calcCapitalDecreaseMulti(input)` | 기존 `decreaseLow`/`decreaseHigh` 함수 변경 0 |
| `lib/tax-engine/gift-deemed/capital-decrease-multi.ts` | 신규 파일 — `calcCapitalDecreaseMulti` 7단계 구현 | 800줄 이하 유지 |
| `lib/tax-engine/legal-codes/inheritance-gift.ts:133` | 기존 `GIFT.CAPITAL_DECREASE = "상증법 §39의2"` 그대로 (추가 상수 불요) | 변경 0 |
| `lib/tax-engine/gift-deemed/router.ts:42-43` | `case "capital_decrease": calcCapitalDecreaseGift(input)` — 라우터 변경 0 (dispatch는 엔진 내부) | 변경 0 |

### 14개 동기화 지점 매핑 (계획서 §8 기준)

| 지점 | 위치 | 변경 내용 |
|---|---|---|
| ① 폼 상태 | `components/calc/deemed-gift/shared.tsx` `DeemedFormState` | `cdMode?: "single" \| "multi"` + 주주 행 배열 필드(`cdShareholders`) 추가 |
| ② initial | `shared.tsx` `INITIAL_DEEMED` | 멀티 기본값(단일=기존 cdCaseType/cdSharePrice 등 보존) |
| ③ normalize | `shared.tsx` sessionStorage 복원 | 주주 배열 normalize (빈 배열 fallback 금지 — 명시 3-state) |
| ④ API 변환 | `lib/calc/gift-deemed-api.ts:135-152` | `case "capital_decrease"` 멀티 분기 → `shareholders`/`preTotalShares` 조립 |
| ⑤ UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx` `CapitalDecreaseFields` | `cdMode` RadioCardGroup + 주주 테이블(`CapitalDecreaseShareholderTable.tsx` 분리 가능) + 결과뷰 수증자 선택 드롭다운 |
| ⑥ 사이드바 합계 | — | **해당 없음** (gift-deemed 사이드바 미사용) |
| ⑦ 결과 카드 | `components/calc/results/DeemedGiftResultView.tsx` | `capitalDecreaseMulti` 존재 시 전용 산정표·검증표·감자후 1주평가 카드 렌더 |
| ⑧ validation | `lib/calc/gift-deemed-validate.ts:82-89` | 멀티 분기: 주주≥2·preTotalShares 필수·각 행 필수 필드·relationGroup 명시 경고 |
| ⑨ Zod enum 메인 | `lib/validators/gift-deemed-input.ts:130-140` | `capitalDecreaseSchema` discriminatedUnion 유지, 브랜치 내 `shareholders?` array optional 추가 |
| ⑩ Zod 컴패니언 | `gift-deemed-input.ts` | **해당 없음** (gift-deemed는 단일 스키마 브랜치) |
| ⑪ 자산-수준 fallback | — | **해당 없음** |
| ⑫ Zod 입력 객체 | `gift-deemed-input.ts` | `capitalDecreaseShareholderSchema` 신규 + `capitalDecreaseSchema`에 추가. ⚠️ TS 미감지 → grep `shareholders` 5단 전수 |
| ⑬ body spread | `DeemedGiftCalculator.tsx` `buildDeemedGiftInput(form)` | API 변환(④)에서 처리되므로 자동 — 단, `shareholders`/`preTotalShares` 필드명 grep 확인 필수 |
| ⑭ Route 매핑 | `app/api/calc/gift-deemed/route.ts:58-62` | Zod parse 후 `calcDeemedGift` 호출 — 변경 0 (엔진 dispatch 내부 처리) |

**⑫⑬⑭ grep 자가 점검 체크리스트** (Do 완료 전 필수):
```bash
# ⑫ Zod 스키마에 shareholders/preTotalShares 정의 확인
grep -n "shareholders\|preTotalShares" lib/validators/gift-deemed-input.ts

# ⑬ API 변환 body에 포함 확인
grep -n "shareholders\|preTotalShares" lib/calc/gift-deemed-api.ts

# ⑭ Route에서 Zod parse 후 엔진으로 전달되는 객체에 포함 확인
grep -n "shareholders\|preTotalShares" app/api/calc/gift-deemed/route.ts
```

### discriminatedUnion 주의사항

`capitalDecreaseSchema`는 `gift-deemed-input.ts`에서 `z.discriminatedUnion`의 하나의 브랜치. 파일 구조:

```ts
// lib/validators/gift-deemed-input.ts:130-140 현행 (실측)
const capitalDecreaseSchema = z.object({
  type: z.literal("capital_decrease"),   // ⚠️ 실측: 필드명은 `type`(not giftType) — gift-deemed-input.ts:131
  // ... 기존 optional 필드들
  // 신규 추가:
  shareholders: z.array(capitalDecreaseShareholderSchema).optional(),
  preTotalShares: z.number().positive().optional(),
});
```

`z.object` 기반이므로 `shareholders?: ...` optional 추가 가능. `z.discriminatedUnion` 브랜치 자체 구조 변경 불요.

---

## §7 테스트 파일

### 신규: `__tests__/tax-engine/gift-deemed/capital-decrease-multi-anchor.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { calcCapitalDecreaseGift } from "@/lib/tax-engine/gift-deemed/capital-decrease";

// ── 사례1 저가소각 (M1 계열) ──────────────────────────────────────────────
describe("§39의2 감자 다주주 저가소각 — 사례1 (M1 anchor)", () => {

  // 공통 입력
  const case1Input = {
    sharePrice: 30_000,
    redemptionPrice: 10_000,          // 단일모드 필드 (멀티에서 무시됨 — 하위호환 보존)
    preTotalShares: 200_000,
    shareholders: [
      { id: "s1", name: "갑", preShares: 100_000, redeemedShares: 100_000,
        redemptionPricePerShare: 10_000, relationGroup: "family_A" },
      { id: "s2", name: "을", preShares: 30_000, redeemedShares: 30_000,
        redemptionPricePerShare: 10_000, relationGroup: "family_A" },
      { id: "s3", name: "병", preShares: 60_000, redeemedShares: 0,
        relationGroup: "family_A" },
      { id: "s4", name: "소액주주", preShares: 10_000, redeemedShares: 0,
        relationGroup: "other" },  // 갑·을과 비특수관계
    ],
  };

  it("[M1-f] 감자후 1주평가 표시 = 67,143", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    expect(r.capitalDecreaseMulti?.postPerShareDisplay).toBe(67_143);
  });

  it("[M1-a] 병 ← 갑 = 1,714,285,714", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const fromGab = byeong?.fromDonors.find(fd => fd.donorName === "갑");
    expect(fromGab?.amount).toBe(1_714_285_714);
  });

  it("[M1-b] 병 ← 을 = 514,285,714", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const fromEul = byeong?.fromDonors.find(fd => fd.donorName === "을");
    expect(fromEul?.amount).toBe(514_285_714);
  });

  it("[M1-c] 병 총 = 2,228,571,428 (M1-a + M1-b 자기일관)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    expect(byeong?.total).toBe(2_228_571_428);
  });

  it("[M1-d] 소액주주 isTaxable=false, potentialAmount=371,428,571", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const soaek = r.capitalDecreaseMulti?.donees.find(d => d.name === "소액주주");
    expect(soaek?.isTaxable).toBe(false);
    expect(soaek?.potentialAmount).toBe(371_428_571);
  });

  it("[M1-e] 기준금액 = 0 (차액비율 66.7% ≥ 30%)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    expect(byeong?.thresholdApplied).toBe(0);
  });

  it("[M1-g] 검증표 병 증감 = 2,228,571,428 (자기일관)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeongVerif = r.capitalDecreaseMulti?.verification.find(v => v.name === "병");
    expect(byeongVerif?.delta).toBe(2_228_571_428);
  });

  it("[M1-c 자기일관] Σ fromDonors = donee.total", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const sum = byeong?.fromDonors.reduce((acc, fd) => acc + fd.amount, 0) ?? 0;
    expect(sum).toBe(byeong?.total);
  });

  it("[deemedGiftValue 하위호환] 과세 수증자 총합 = 2,228,571,428", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    expect(r.deemedGiftValue).toBe(2_228_571_428);
  });
});

// ── 사례2 고가소각 (M2 계열) ──────────────────────────────────────────────
describe("§39의2 감자 다주주 고가소각 — 사례2 (M2 anchor)", () => {

  const case2Input = {
    sharePrice: 6_000,
    faceValue: 10_000,                // eval(6000) < face(10000) → 액면 게이트 충족
    preTotalShares: 200_000,
    shareholders: [
      { id: "s1", name: "갑", preShares: 80_000, redeemedShares: 0,
        relationGroup: "family_B" },
      { id: "s2", name: "을", preShares: 40_000, redeemedShares: 0,
        relationGroup: "family_B" },
      { id: "s3", name: "병", preShares: 60_000, redeemedShares: 60_000,
        redemptionPricePerShare: 9_000, relationGroup: "family_B" },
      { id: "s4", name: "정", preShares: 20_000, redeemedShares: 20_000,
        redemptionPricePerShare: 9_000, relationGroup: "family_B" },
    ],
  };

  it("[M2-h] 감자후 1주평가 = 4,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.capitalDecreaseMulti?.postPerShareDisplay).toBe(4_000);
  });

  it("[M2-a] 병 ← 갑 = 120,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const fromGab = byeong?.fromDonors.find(fd => fd.donorName === "갑");
    expect(fromGab?.amount).toBe(120_000_000);
  });

  it("[M2-b] 병 ← 을 = 60,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const fromEul = byeong?.fromDonors.find(fd => fd.donorName === "을");
    expect(fromEul?.amount).toBe(60_000_000);
  });

  it("[M2-c] 병 총 = 180,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    expect(byeong?.total).toBe(180_000_000);
  });

  it("[M2-d] 정 ← 갑 = 40,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const jeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "정");
    const fromGab = jeong?.fromDonors.find(fd => fd.donorName === "갑");
    expect(fromGab?.amount).toBe(40_000_000);
  });

  it("[M2-e] 정 ← 을 = 20,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const jeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "정");
    const fromEul = jeong?.fromDonors.find(fd => fd.donorName === "을");
    expect(fromEul?.amount).toBe(20_000_000);
  });

  it("[M2-f] 정 총 = 60,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const jeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "정");
    expect(jeong?.total).toBe(60_000_000);
  });

  it("[M2-g] 기준금액 = 0 (차액비율 50% ≥ 30%)", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    expect(byeong?.thresholdApplied).toBe(0);
  });

  it("[M2-i 자기일관] Σ fromDonors(병) = M2-c / Σ fromDonors(정) = M2-f", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "병");
    const jeong = r.capitalDecreaseMulti?.donees.find(d => d.name === "정");
    expect(byeong?.fromDonors.reduce((a, fd) => a + fd.amount, 0)).toBe(180_000_000);
    expect(jeong?.fromDonors.reduce((a, fd) => a + fd.amount, 0)).toBe(60_000_000);
  });

  it("[deemedGiftValue 하위호환] 병+정 합계 = 240,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.deemedGiftValue).toBe(240_000_000);
  });
});

// ── 경계 케이스 ──────────────────────────────────────────────────────────
describe("§39의2 경계 케이스", () => {

  it("[EC-1] 기준금액 3억 미달 → 미적용", () => {
    // diff/sharePrice = 5000/100000 = 5% < 30% → 기준금액 3억
    // 을 total = floor(5000 × 50000 × 50000/50000) = 250,000,000 < 3억 → isTaxable=false
    const r = calcCapitalDecreaseGift({
      sharePrice: 100_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 50_000, redeemedShares: 50_000,
          redemptionPricePerShare: 95_000, relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 50_000, redeemedShares: 0,
          relationGroup: "fam" },
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find(d => d.name === "을");
    expect(eul?.isTaxable).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });

  it("[EC-2] 고가 액면 게이트 미충족 → 전체 미적용", () => {
    // eval=15000 >= faceValue=10000 → §29의2①2호 한정 조건 미충족
    const r = calcCapitalDecreaseGift({
      sharePrice: 15_000,
      faceValue: 10_000,              // eval(15000) >= face(10000) → 게이트 실패
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 60_000, redeemedShares: 0,
          relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 40_000, redeemedShares: 40_000,
          redemptionPricePerShare: 20_000, relationGroup: "fam" },
      ],
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    const eul = r.capitalDecreaseMulti?.donees.find(d => d.name === "을");
    expect(eul?.isTaxable).toBe(false);
  });

  it("[EC-3] 비특수관계 전부 → 전원 isTaxable=false", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 70_000, redeemedShares: 70_000,
          redemptionPricePerShare: 5_000, relationGroup: "groupA" },
        { id: "s2", name: "을", preShares: 30_000, redeemedShares: 0,
          relationGroup: "groupB" },   // 갑과 다른 그룹 → 비특수관계
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find(d => d.name === "을");
    expect(eul?.isTaxable).toBe(false);
    expect(eul?.nonTaxableReason).toBe("비특수관계");
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[EC-6] 단일 수증자·단일 증여자 → fromDonors[0].amount = total", () => {
    // 가장 단순한 2인 다주주 케이스
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 60_000, redeemedShares: 60_000,
          redemptionPricePerShare: 5_000, relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 40_000, redeemedShares: 0,
          relationGroup: "fam" },
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find(d => d.name === "을");
    expect(eul?.isTaxable).toBe(true);
    expect(eul?.fromDonors.length).toBe(1);
    expect(eul?.fromDonors[0].donorName).toBe("갑");
    expect(eul?.fromDonors[0].amount).toBe(eul?.total);
  });
});

// ── 회귀: 단일모드 하위호환 (변경 금지) ──────────────────────────────────
describe("§39의2 단일모드 회귀 — shareholders 미존재 시 기존 경로", () => {

  it("[R-CD-1] 저가 단일모드 = 6,000,000 (변경 금지)", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      redemptionPrice: 6_000,
      totalRedeemedShares: 10_000,
      majorPostRatio: { numer: 30, denom: 100 },
      relatedRedeemedShares: 5_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(6_000_000);
    expect(r.capitalDecreaseMulti).toBeUndefined();  // 단일모드: multi 결과 없음
  });

  it("[R-CD-H] 고가 단일모드 = 500,000,000 (변경 금지)", () => {
    const r = calcCapitalDecreaseGift({
      caseType: "high",
      sharePrice: 3_000,
      redemptionPrice: 8_000,
      ownRedeemedShares: 100_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000);
    expect(r.capitalDecreaseMulti).toBeUndefined();
  });
});
```

---

## §8 미해결 (Do 환류)

| ID | 항목 | 상태 | 비고 |
|---|---|---|---|
| **D1** | 특수관계 입력 모델: `relationGroup` 단일 태그(같은 그룹=특수관계) | 채택(a안) — 단순·교재 충족 | **쌍별 비대칭**(A↔B 특수·B↔C 특수·A↔C 비특수)는 SCOPE_OUT. 향후 쌍 매트릭스 확장 |
| **D1-§28②** | 대주주등 본인+특수관계인 지분 합산 판정 | ✅확정 | §4 step(5)[A]: relationGroup 동일 주주(본인 포함) preShares 합산 / preTotal ≥1% OR (faceValue 시) 합산×faceValue ≥3억. 시점=감자 前. 전후 판정 상이 경계는 SCOPE_OUT |
| **D3** | 마법사 prefill: 복수 과세 수증자 → 선택 수증자 이관 | 설계 확정(수증자 드롭다운) | UI(⑤) 구현 시 `cdSelectedDoneeIndex` 상태 추가, `buildGiftWizardPrefill` 분기 |
| **D4** | 감자후 1주평가 자동계산 | 설계 확정(자동) | 엔진 내부 step(1)에서 `preTotalShares`·`shareholders` 기반 도출. 사용자 입력 불요 |
| **D6** | 기준금액 연혁 분기(2025.2.27 이전 `Min(30%,3억)`) | 현행만 구현 | 증여일 입력 기반 연혁 분기는 후속 (v2.0) |
| **BigInt** | 현재 사례(사례1·2) product < MAX_SAFE → BigInt 진입 없음 | 실측 확인 | 발행주식 수억주 극단치는 `safeMultiplyThenDivide` 내부 BigInt fallback으로 자동 처리 — 추가 구현 불요 |
| **저가/고가 dispatch** | 다주주 모드 저가/고가 = 감자주주 `redemptionPricePerShare` vs `sharePrice` **자동 판정**(UI에 저가/고가 라디오 없음; `cdMode`는 단일/다주주만). 수증자=고가는 `redeemedShares>0`·저가는 `redeemedShares===0` | 확정(자동) | 감자주주 방향 혼합(일부 저가·일부 고가)은 SCOPE_OUT(D1 비대칭과 동일). 검증(⑧)에서 혼합 차단 |
| **검증표 postValue (D-UI-2)** | 잔존주주 floor + 마지막 잔액 흡수 | ✅확정 | 잔존주주=floor(postShares×exact), 마지막 잔존=정확합−Σ앞floor → 합계 증감 0. 감자주주=0. 단순 floor만 시 합계 −1 오차 |
