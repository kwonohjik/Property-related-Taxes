# 합병에 따른 이익의 증여(§38) 보완 — 엔진 설계 (ENGINE DESIGN)

> 계획서 `docs/00-pm/gift-merger-supplement.plan.md` 기반. 옵션 C(G0~G6 + 분할합병).
> 법령: 상증법 §38 · 상증령 §28①~⑦ · 상증칙 §10의2 · 국세청 [189486](자기증여).
> 기존 `merger.ts`(76줄) 코어 산식 불변, 평가·매트릭스를 신규 파일로 분리.

## 0. 설계 원칙

- **코어 회귀 보존**: `merger.ts` 기존 §28③1·③2·④ 산식 불변. 평가모드 기본 `direct` → MRG-1·MRG-NS anchor 그대로 통과.
- **단일 소스(`single-source-engine-helper`)**: 법인별 `1주평가·주식수`를 단일 입력원으로 → 단순평균액 분자·㉯·매트릭스 안분 전부 도출. 별도 총액필드 금지(dual-truth).
- **순수 함수**: 평가가액·시세는 input 직접 주입(주식평가 모듈 미사용 — Phase 2 자본거래 공통 결정).
- **정수 연산**: BigInt 분자합산 후 floor(`computeMergerSimpleAvg`). `Math.round()` 금지.
- **법 근거 없는 불리적용 금지**(`feedback_no_unfavorable_application_without_legal_basis`): 과세요건(특수관계·대주주)은 echo+UI 안내, 엔진 차단 아님.

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 진입 금지)

| # | 케이스 | 입력 분기 | 산식 | anchor | Phase |
|---|---|---|---|---|---|
| C1 | 주식교부·직접입력(현행) | `mergedPriceMode="direct"` | (㉮−㉯)×교부주식수 | MRG-1=250,000,000 (회귀) | A(회귀) |
| C2 | 주식외 재산·직접입력(현행) | `caseType="non_stock"` | (액면−평가)×주식수, 기준 3억 | MRG-NS=400,000,000 (회귀) | A(회귀) |
| C3 | 비상장 단순평균액 auto | `mergedPriceMode="auto"`, 상장 X | 단순평균액 도출 후 C1 | 사례1① ㉮=36,666 → 병 466,620,000 / 정 0(제외) | A |
| C4 | 비상장 단순평균액 + 합병비율≠1 | C3 + `postMergerTotalShares≠Σpre` | 분모=합병후주식수 | 사례2② ㉮=40,000 → 갑 차감전 1,400,000,000 | A |
| C5 | 상장 합병후 Min | C3 + `listedPostAvgPrice` | Min(종가평균, 단순평균액) | LISTED-MIN(종가<단순→종가 채택) | A |
| C6 | 합병전 §28⑥ 단서(상장) | (후속) 나목차액<가목차액 → 나목 | 상장·극희소 — advanced | S28-6-PROVISO | **후속**(A 제외) |
| C7 | G0 대주주 경계 | 지분 1% 또는 액면 3억 | 판정 echo(차단X) | 대주주 경계 0.9%·1.0% | A(echo) |
| C8 | 자기증여 차감(동일인) | 양법인 동일주주 `id` 매칭 | self = 차감전 × (증여자측지분÷수증자측지분) | 사례2 갑 self 1,000,000,000·순 400,000,000 | B(동결✓) |
| C9 | 증여자별 안분 | 순이익 × s_j÷(Σs−s_k) | 동일인 k는 자기 제외 분모 | 갑←을 240M·소액 160M / 병←갑 300M·을 180M·소액 120M | B(동결✓) |
| C10 | 다수 대주주 동시 | 주주배열 N | 각 §28④ 3억 기준 개별판정 | 사례1 병 적용(466,620,000)·정 제외(199,980,000<3억) 동시 | B |
| C11 | 분할합병 §28⑦ | `isSplitMerger`·`splitValuationMode` | §63①1나 보충평가(2016.2.5~) / 순자산비율 안분(이전) | SPLIT-1=350,000,000·SPLIT-2 | C(구현✓) |

> C8·C9 산식은 재산세과-799(2009.04.24) 원리 + 교재 사례2 1:1 동결(자료 확보 §plan-B). **일반성은 Do 시 KoreanLaw 예규 본문 재확인**.

## 법령 근거 (KoreanLaw 검증 완료 — 상증령 §28 본문 대조)

- **§28③1** 주식교부: (가목 − 나목) × 과대평가법인 대주주 교부주식수. 가목=합병후 1주평가, 나목=과대평가법인 1주평가×(합병전주식수÷교부주식수)
- **§28③2** 주식외: (액면가[대가 미달 시 대가] − 평가가액) × 대주주 주식수
- **§28④** 기준금액: 1호 `Min(합병후 주식평가가액의 30%, 3억)` / 2호 `3억`
- **§28⑤** 합병후 1주평가: 상장 `Min(§63①1가 종가평균, 단순평균액)` / 비상장 `단순평균액`. 단순평균액 = (과대평가법인 합병전 주식가액 + 과소평가법인 합병전 주식가액) ÷ 합병후 주식수
- **§28⑥** 합병전 1주평가(나목)·합병직전 가액 = §60·§63 평가. **단서(상장 한정, 2016.2.5~)**: 나목차액 < 가목차액이면 나목 적용
- **§28⑦** 분할합병: 분할사업부문 합병직전 주식가액 = §63①1나 준용
- **§28①②** 특수관계 법인·대주주 판정 / **[189486]** 동일인 주주 자기증여 산정

## 엔진 input 타입 (`MergerInput` 확장 — types.ts)

```ts
export interface MergerInput {
  caseType?: "stock" | "non_stock";            // 기존
  // ⚠️ "과대평가" = 합병비율 산정상 상대적 과대평가 = 이익을 얻는 측 법인. 1주 절대평가 크기와 무관.
  //    (사례1: 이익측 B 1주 30,000 < 반대 A 40,000인데도 B가 "과대평가된 합병당사법인")
  overvaluedSharePrice: number;                // 과대평가(이익측) 법인 합병전 1주평가 — §28③1 나목 베이스
  majorShares: number;                         // 대주주등 교부주식수 (단일 모드)
  mergedSharePrice?: number;                   // 직접입력 ㉮ (direct 모드)
  preMergerShares?: number;                    // 과대평가법인 합병전 주식수
  exchangedShares?: number;                    // 교부받은 주식수
  faceValue?: number; mergeConsideration?: number; // non_stock

  // ── Phase A 신규 (전부 optional, 기본 direct) ──
  mergedPriceMode?: "direct" | "auto";         // 기본 "direct" (회귀 보존)
  underSharePrice?: number;                     // 과소평가(반대) 법인 1주평가
  underPreShares?: number;                       // 과소평가법인 합병전 주식수
  postMergerTotalShares?: number;                // 합병후 존속법인 주식수 (합병비율 반영 — 필수, Σpre 추정 금지)
  listedPostAvgPrice?: number;                   // 상장 합병등기일후 2월 종가평균 (입력 시 Min)
  isListed?: boolean;                            // 상장 여부 (§28⑤ Min 분기)
  // §28⑥ 단서(상장·극희소)는 Phase A advanced/후순위 — 아래 "C6 단순화" 참조

  // ── G0 echo (차단 아님) ──
  isRelatedCompany?: boolean;                    // §28① 특수관계 (사용자 전제)
  shareholderOwnRatio?: { numer: number; denom: number }; // 대주주 판정 echo
  faceValueSum?: number;                         // 액면 합계 (대주주 판정)

  // ── Phase B 주주 매트릭스 (동결 완료 — 재산세과-799 + 사례2) ──
  shareholders?: MergerShareholders;
  // ── Phase C 분할합병 §28⑦ (구현됨) ──
  isSplitMerger?: boolean;
  splitValuationMode?: "supplementary" | "net_asset_ratio"; // 2016.2.5~ 보충평가 / 2016.2.4 이전 순자산비율
  splitCompanyPreSharePrice?: number; // 분할법인 분할직전 1주평가
  splitBusinessNetAsset?: number;     // 분할사업부문 순자산
  splitCompanyNetAsset?: number;      // 분할법인 순자산
}

/** Phase B — 양 법인 주주 구성.
 *  ⚠️ 주주배열은 `shares`만 → preMergerShares=Σovervalued.shares로 **도출**(중복입력 제거).
 *  단 1주평가(overvaluedSharePrice·underSharePrice)는 평가액이라 배열에 없음 → **스칼라 입력 유지**(㉮·㉯ 산정). */
export interface MergerShareholders {
  /** 과대평가(이익측=수증자) 법인 주주. Σshares = preMergerShares */
  overvalued: { id: string; name: string; shares: number }[];
  /** 과소평가(증여자측) 법인 주주. self·안분의 증여자 풀 */
  undervalued: { id: string; name: string; shares: number }[];
  /** 교부주식 환산비(과대평가법인 합병전→합병후 교부). 사례2 = {1,2}(2주→1주) */
  exchangeRatio: { numer: number; denom: number };
  /** 과소평가법인 환산비(증여자측 1주평가 ㉯ 산정용 — preShares÷교부) */
  underExchangeRatio?: { numer: number; denom: number };
}
```

## 엔진 result 타입 (`DeemedGiftResult` echo 확장)

기존 `DeemedGiftResult` 유지 + `thresholdEcho`(Record)에 평가 echo 추가. **Map 금지**(`feedback_engine_result_map_json_loss`).

```ts
// 기존 thresholdEcho: Record<string, number | boolean> 재사용
thresholdEcho: { gain, threshold,
  computedMergedPrice?,   // auto 도출 단순평균액 (boolean isListed와 함께 breakdown 표시)
  appliedMergedPrice?,    // 상장 Min 적용 후 ㉮ (= Min(종가평균, 단순평균액))
  isListed?,              // 상장 여부 (Min 적용 표시용)
  isMajorShareholder?,    // G0 대주주 판정
  // valuationMode(§28⑥ 단서)는 C6 후속 — Phase A 미포함
}
```

**Phase B 매트릭스 (DeemedGiftResult 확장 — Record, Map 금지):**
```ts
mergerMatrix?: {
  recipients: { id: string; name: string; grossGain: number; selfGift: number;
                netGain: number; applied: boolean; threshold: number }[];
  /** 수증자 id → 증여자 id → 안분액 (Record — NextResponse.json 직렬화 안전) */
  allocation: Record<string, Record<string, number>>;
  totalDeemedGift: number;   // Σ applied 수증자 순이익 (deemedGiftValue와 일치)
};
```
> `deemedGiftValue`(하위호환)= `Σ applied recipients.netGain`. 단일 모드(shareholders 미입력)는 기존 스칼라 그대로.

## 계산 알고리즘 (단계별)

**Phase A — `calcMergerGift` → `resolveMergedPrice(input)` 선행 후 기존 산식**

```
1. ㉮ 결정 (resolveMergedPrice) — stock 전용. non_stock은 ㉮ 미사용(액면−평가):
   if caseType==="non_stock" OR mergedPriceMode!=="auto": ㉮ = mergedSharePrice ?? 0   # C1·C2 회귀
   else (stock + auto):
     simpleAvg = computeMergerSimpleAvg(overvaluedSharePrice, preMergerShares,
                                        underSharePrice, underPreShares, postMergerTotalShares)
     ㉮ = (isListed && listedPostAvgPrice) ? Math.min(listedPostAvgPrice, simpleAvg) : simpleAvg   # C3·C5
2. 기존 mergerStock/mergerNonStock 산식 (㉮ 대입)                    # 회귀 동일
3. G0 echo: isMajorShareholder = !isSmallShareholder({ownedShares,totalShares,faceValueSum})  # C7, 차단X
   (§28② 대주주 = 1%이상 OR 액면3억이상 = !(1%미만 AND 3억미만) = !isSmallShareholder, De Morgan 정확)
```
> **§28⑥ 단서(C6)는 본 단계에서 제외** — 상장 합병증여 자체가 희소하고 단서(나목차액<가목차액→나목)는
> 두 평가방식 차액 비교라 별도 advanced UX. Phase A는 비상장 보충적평가·상장 단순 Min(§28⑤)까지. C6는 후속.

**신규 헬퍼 (`capital-helpers.ts`)**
```ts
export function computeMergerSimpleAvg(
  overPrice: number, overShares: number,
  underPrice: number, underShares: number,
  postShares: number,
): number {
  if (postShares <= 0) return 0;
  const numer = BigInt(Math.floor(overPrice)) * BigInt(Math.floor(overShares))
              + BigInt(Math.floor(underPrice)) * BigInt(Math.floor(underShares));
  return Number(numer / BigInt(Math.floor(postShares)));   // floor
}
```
> `computeWeightedPerShare`는 분모 고정(preShares+newShares)이라 **합병에 부적합** → 신규 헬퍼. BigInt floor 패턴만 동형.

**Phase B — `merger-matrix.ts`** (재산세과-799 + 사례2 동결). `shareholders` 입력 시 `calcMergerGift`가 매트릭스 분기:
```
1. ㉮ = computeMergerSimpleAvg(...)                                 # Phase A 재사용
2. ㉯ = overvaluedSharePrice × (preMergerShares ÷ 교부총수)          # 과대평가측 환산(기존 산식)
   (preMergerShares = Σovervalued.shares, 교부총수 = preMergerShares × exchangeRatio)
3. overTotal = Σovervalued.shares; underTotal = Σundervalued.shares  # 지분율 분모
4. for each k in overvalued (수증자):
     교부주식수_k = k.shares × exchangeRatio
     차감전_k = max(0, (㉮ − ㉯)) × 교부주식수_k                      # safeMultiply
     동일인 j = undervalued.find(u => u.id === k.id)                 # isSameMergerShareholder
     overRatio_k = k.shares / overTotal                             # 분수 정수연산(BigInt)
     self_k = 동일인? safeMulDivRound(차감전_k, 동일인.shares×overTotal, k.shares×underTotal) : 0
              # = 차감전_k × (underRatio ÷ overRatio) = 차감전 × (동일인.shares/underTotal)÷(k.shares/overTotal)
     순이익_k = 차감전_k − self_k
     threshold_k = Min(applyRate(㉮×교부주식수_k, 0.3), 3억)          # §28④1 개별
     applied_k = 순이익_k ≥ threshold_k
5. 증여자별 안분 (j ≠ k):
     분모_k = underTotal − (동일인? 동일인.shares : 0)
     for each j in undervalued where j.id ≠ k.id:
       allocation[k.id][j.id] = safeMulDivRound(순이익_k, j.shares, 분모_k)    # floor 잔액 흡수
6. 자기일관성: Σ_j allocation[k.id][j] == 순이익_k (floor 잔액은 마지막 증여자 흡수, feedback_floor_residual_absorption)
```
> **정수연산**: self·안분 모두 `safeMulDivRound`(BigInt round-half-up, `bigint-round-half-up` 스킬). 분모 0 가드.
> **§28④ 개별판정**: 각 수증자 순이익이 3억 미만이면 그 수증자만 제외(사례1 정 199,980,000<3억 제외, 병 적용).

**Phase C — `merger-valuation.ts` `resolveSplitOvervalued` (구현됨)**: `calcMergerGift` 진입 시 `isSplitMerger`면 `overvaluedSharePrice`를 분할사업부문 합병직전 1주평가로 **단일 정규화**(단일·매트릭스 양쪽 적용).
- `net_asset_ratio`(2016.2.4 이전, 상증칙 §10의2): `safeMultiplyThenDivide(splitCompanyPreSharePrice, splitBusinessNetAsset, splitCompanyNetAsset)`
- `supplementary`(2016.2.5~, §63①1나): `overvaluedSharePrice` 직접(보충평가액 입력)
- anchor SPLIT-1(15,000→350,000,000)·SPLIT-2(보충평가 직접). 시점 분기는 UI `splitValuationMode` 명시(giftDate 자동도출 대신 사용자 선택).

## Silent fallback / 자동 안분 후보 식별 (`feedback_no_silent_apportion_fallback`)

- `mergedPriceMode==="auto"`인데 `underSharePrice`/`underPreShares`/`postMergerTotalShares` 미입력 → **0 fallback 금지**, validate 차단.
- `postMergerTotalShares`를 `preMergerShares+underPreShares`로 **자동 추정 금지**(합병비율 반영값 — 사례2에서 틀림). 명시 입력만.
- `direct` 모드는 신규 필드 전부 무시(침묵 strip 방지 — auto일 때만 읽음).

## 동기화 지점 (엔진·API 측)

| 지점 | 변경 | 비고 |
|---|---|---|
| 엔진 input | `MergerInput` 신규 9필드(A) | 전부 optional, 기본 direct |
| 엔진 result | `thresholdEcho` echo 4키 | Record(Map 금지) |
| ⑫ Zod | `mergerSchema` 신규 필드 `.optional()` | nonnegative |
| ⑬⑭ Route | deemed route 단일 dispatch | 기존 경로 불변 |
| legal-codes | `GIFT.MERGER_VALUATION`·`GIFT.MERGER_SPLIT` | breakdown lawRef |

## 테스트 약속 (`__tests__/tax-engine/gift-deemed/merger-supplement.anchor.test.ts`)

- 회귀: MRG-1=250,000,000 / MRG-NS=400,000,000 불변
- C3 사례1: 단순평균액 36,666 / 병 466,620,000 / 정 0
- C4 사례2: 단순평균액 40,000 / 갑 차감전 1,400,000,000
- C5 상장 Min: 종가평균<단순평균액 → 종가 채택
- C7 대주주 경계: 0.9%(소액)·1.0%(대주주) echo
- **C8·C9 사례2 전수 동결**: 갑 self 1,000,000,000·순 400,000,000 / 갑←을 240,000,000·소액 160,000,000 / 병←갑 300,000,000·을 180,000,000·소액 120,000,000 / 자기일관성 Σ안분=순이익
- **C10 다수주주 동시**: 사례1 병 466,620,000 적용·정 199,980,000 제외(§28④ 개별)
- 전 수치 원단위 `toBe()`(`feedback_pdf_example_test_anchoring`)

## 미결정 (Do 단계 KoreanLaw·자료 검증)

- **C8 자기증여 산식 일반성**: 재산세과-799 + 사례2 1건 동결 완료. 예규 본문 산식은 공개 자료 미수록 → Do 시 KoreanLaw 예규 본문 재확인(일반화 검증, `feedback_korean_law_citation_verify`)
- C6 §28⑥ 단서 — 상장 극희소, advanced 후속(Phase A 제외)
- C11 분할합병 2016.2.4 이전 순자산비율 — `giftDate` 경계 데이터(상증칙 §10의2)

## UI 통합 위임 → `gift-merger-supplement.ui.design.md` (STEP 12)

평가모드 ToggleCard·주주 테이블 모달·G0 안내 카드·breakdown 표시는 UI 설계 문서에서.
