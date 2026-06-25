# §45의5 특정법인과의 거래를 통한 이익의 증여 의제 — 계산사례 2건 재현 보완 계획

> 상태: Plan 완료 (엔진·UI 시니어 병렬 분석 + 자체 검산 통합). Pre-Do anchor 후 Do 착수 대기.
> worktree: `.claude/worktrees/gift-specific-corp-45-5` (브랜치 `feat/gift-specific-corp-45-5`, origin/master 분기 fdc46092).
> 작성 근거: 법제처 API verbatim 검증(엔진 시니어) + 코드 실측(file:line) + 교재 수치 3중 교차검산(검산·엔진·UI 일치).

---

## 1. 목표

교재 「§45의5 특정법인과의 거래」 **계산사례 2건을 100% 재현**한다.

- **사례 1**: 이월결손금으로 법인세를 부담하지 않은 경우 — 다주주(4인) 증여가액 계산 + 과세제외 3종.
- **사례 2**: 특정법인이 법인세를 부담한 경우 — 법인세 안분 + 다주주(4인) 증여가액 + **§45의5② 증여세 한도**(㉮㉯ Min)·신고세액공제·자진납부세액.

현행 `specific-corp.ts`는 **단일 1인 계산**만 지원하므로, 다주주 roster·법인세 안분·과세제외 판정·증여세 한도를 신설한다. **기존 single 모드는 하위 호환 유지**(회귀 0).

---

## 2. 법령 검증 (법제처 API verbatim, MST 명시)

### §45의5 본칙 (MST 276123, 시행 2025.10.01, 전문개정 2019.12.31)
- **①** 지배주주와 그 친족("지배주주등")이 직·간접 보유 **주식보유비율 30% 이상 법인**("특정법인")이 **지배주주의 특수관계인**과 각 호 거래 시, **특정법인의 이익 × 지배주주등 주식보유비율**을 지배주주등이 증여받은 것으로 본다.
  - 1호 재산·용역 무상 제공받음 / 2호 현저히 낮은 대가 양수 / 3호 현저히 높은 대가 양도 / 3호의2 자본거래 / 4호 기타 유사거래.
- **②** ①의 증여세액이 **(직접 증여받은 경우 증여세 상당액 − 특정법인이 부담한 법인세 상당액)을 초과하면 그 초과액은 없는 것으로 본다.** ← Min 한도의 법적 근거.
- **③** 세부 계산은 시행령 위임.

### §34의5 시행령 (MST 283637, 시행 2026.02.27)
- **④ "특정법인의 이익" = 1호 − 2호**:
  - 1호 가목(재산무상증여·채무면제)=증여재산가액/채무면제이익, 나목(자본거래)=§38·§39·§39의2·§39의3 준용, 다목(저가·고가)=시가−대가 차액.
  - **2호 = 가목(법인세 산출세액 − 공제·감면액) × 나목(거래이익 / 각 사업연도 소득금액, 1 초과 시 1)**. ← 법인세 안분 산식.
- **⑤** 증여의제이익이 **1억원 이상인 경우로 한정**(2020.2.11).
- **⑦** "현저히 낮은/높은 대가" = 시가-대가 차액이 **시가의 30% 이상 또는 3억원 이상**. (현 사례는 무상증여 1호 → 미해당, v2 defer)
- **⑨** §45의5② 한도 = **㉠ 직접증여 가정 증여세(§34의5④1호 금액 × 지분율을 직접 증여받은 것으로 볼 때) − ㉡ (§34의5④2호 법인세 상당액 × 지분율)**.

**판정**: 교재 사례 1·2의 모든 산식(안분·다주주·한도·1억 한정·30% 지배)이 **현행 조문과 일치**. (엔진 시니어 verbatim 대조 완료)

### 과세제외 3종 근거
| 유형 | 근거 | 기준 |
|---|---|---|
| 본인증여분 제외 | §45의5① "지배주주의 **특수관계인**과 거래" | 증여자 본인이 주주이면 자기 지분분은 수증 아님 → 제외 |
| 타인(비친족) 제외 | §45의5① "지배주주**등**"=지배주주+그 친족만 | 친족 아닌 주주(직원 등)는 지배주주등 아님 → 제외 |
| 1억 미만 제외 | §34의5⑤ "1억원 이상 한정" | 개별 지배주주등 증여의제이익 < 1억 → 제외 |

---

## 3. 현행 구현 갭 (코드 실측 file:line)

현행 `specific-corp.ts`(38줄) = `(transactionBenefit − corporateTax) × ownershipRatio`, 1억 한정, 단일 1인.

| # | 갭 | 위치 |
|---|---|---|
| G1 | 다주주 roster 미지원 | `specific-corp.ts` 전체 / `types.ts:634` 3필드 |
| G2 | 법인세 안분(산출세액×거래이익/소득금액) 미지원 — `corporateTax`를 이미 안분된 값으로 간주 | `specific-corp.ts:16` |
| G3 | 과세제외 3종 판정(본인·타인·1억미만) 로직 없음 | 전체 |
| G4 | §45의5② 한도(직접증여세−법인세상당액, Min) 없음 | 전체 |
| G5 | 주주별 result 배열 없음(`capital-decrease-multi` 패턴 부재) | `DeemedGiftResult` |
| G6 | UI 단일 1인 폼(거래이익·법인세·지분율) | `other-forms.tsx:347-355` |
| G7 | validate `scTransactionBenefit>0` 1건만 | `gift-deemed-validate.ts:236` |
| G8 | Zod `specificCorpSchema` 3필드 | `gift-deemed-input.ts:319` |

---

## 4. 케이스 매트릭스 (전 주주 enumerate)

### 사례 1 (법인세 0 / 이월결손금) — 거래이익 10억, 4주주
| 주주 | 관계 | 지분 | 증여의제이익 | 과세 | 제외사유 |
|---|---|---|---|---|---|
| 부(증여자) | 본인 | 40% | 4억 | ✗ | 본인증여분 |
| 직원 | 타인 | 30% | 3억 | ✗ | 비친족 |
| 장남 | 자 | 25% | 2.5억 (≥1억) | **✓** | — |
| 차남 | 자 | 5% | 5천만 (<1억) | ✗ | 1억 미만 |

법인세 0 → 안분 0 → 특정법인이익 = 10억 전액.

### 사례 2 (법인세 780백만) — 거래이익 30억, 소득금액 40억, 4주주
| 주주 | 관계 | 지분 | 증여의제이익 | 과세 | 제외사유 |
|---|---|---|---|---|---|
| 갑 | 자 | 60% | 1,449백만 (≥1억) | **✓** | — |
| 부(증여자) | 부친 | 20% | 483백만 | ✗ | 본인증여분 |
| 을 | 동생 | 3% | 72.45백만 (<1억) | ✗ | 1억 미만 |
| 병 | 타인 | 17% | 410.55백만 | ✗ | 비친족 |

법인세 안분 = 780백만 × 30억/40억 = 585백만 → 특정법인이익 = 30억 − 585백만 = 2,415백만.

### validate 케이스 (4분기)
| scMode | corpTaxMode | shareholders | 처리 |
|---|---|---|---|
| single | direct | — | 기존 경로(회귀 0) |
| roster | direct | 4인 | 사례1: `corporateTax`=0 허용 |
| roster | auto | 4인 | 사례2: 산출세액+소득금액 필수(>0 차단) |
| single | auto | — | auto 분기 + 단일 지분율 |

---

## 5. Anchor 값 (원단위 정수, floor 방향)

### 사례 1 — `[SC-CASE1]`
- 거래이익 1,000,000,000 / 법인세 0 / 특정법인이익 1,000,000,000
- 장남(25%) = **250,000,000** 과세 · 차남(5%) = 50,000,000 제외(1억미만)
- 부·직원 제외(본인·타인). 과세 합계 250,000,000.

### 사례 2 — `[SC-CASE2]`
- 거래이익 3,000,000,000 / 소득금액 4,000,000,000 / 법인세 산출세액 780,000,000
- 법인세 안분 = `safeMultiplyThenDivide(780,000,000, 3,000,000,000, 4,000,000,000)` = **585,000,000** (정확)
- 특정법인이익 = **2,415,000,000**
- 갑 60% = **1,449,000,000** 과세 / 부 20% = 483,000,000 제외 / 을 3% = 72,450,000 제외 / 병 17% = 410,550,000 제외

### 사례 2 — §45의5② 한도(갑) — `[SC-CASE2-LIMIT]`
- ㉮ 일반산출세액 = (1,449,000,000 − 50,000,000)×40% − 160,000,000 = **399,600,000**
- ㉠ 직접증여 가정 = (30억×60% − 50,000,000)×40% − 160,000,000 = (1,750,000,000)×40%−160,000,000 = **540,000,000**
- ㉡ 법인세상당액×지분 = 585,000,000 × 60% = **351,000,000**
- ㉯ 한도 = ㉠ − ㉡ = **189,000,000**
- 최종 산출세액 = Min(㉮ 399,600,000, ㉯ 189,000,000) = **189,000,000**
- 신고세액공제(3%) = floor(189,000,000 × 3/100) = 5,670,000 → 자진납부세액 = **183,330,000**

> ⚠️ **확인 필요(공제 단순화)**: ㉮·㉠의 증여재산공제는 교재가 직계존속→성년 직계비속 5천만(§53)을 단순 적용. MVP는 교재 재현이므로 공제액을 **input(`giftDeduction`)으로 수신**하고, 기존 증여 합산·관계별 공제(배우자 6억 등)는 v2로 defer. 누진공제 1.6억은 §56 세율표(10억 초과~30억 40%).

---

## 6. 엔진 설계

### 결정사항 (두 시니어 불일치 해소)
- **법인세 안분은 엔진에서 처리**(§34의5④2호 = 법령 계산 본질·단일 진실·anchor 검증 대상). UI는 산출세액/공제감면/소득금액을 그대로 전달, 엔진이 `safeMultiplyThenDivide` floor 안분. (UI 시니어 "UI 변환에서 안분" 대신 엔진 채택.)
- **§45의5② 한도는 엔진 내부에서 `calcInheritanceGiftTax`(`inheritance-gift-common.ts:100`) 직접 호출**로 ㉮㉠ 산출 → `gift-tax.ts` 전체 import 회피(순환 차단). echo로 result 노출.

### 타입 (types.ts 확장, 하위 호환 — 신규 전부 optional)
```ts
interface SpecificCorpShareholder {
  id: string; name: string;
  shares: number; totalShares: number;
  isDonor: boolean;     // 증여자 본인 → 과세제외
  isRelated: boolean;   // 지배주주 친족 여부, false=타인 제외
}
interface SpecificCorpDonee {        // result용
  name: string; shares: number; ownershipRatioPct: number;
  corpProfitShare: number; isTaxable: boolean;
  nonTaxableReason?: "donor_self" | "non_related" | "below_threshold";
  limitCalc?: { directGiftTax: number; corpTaxShare: number;
    limitAmount: number; computedTax: number; finalTax: number;
    filingCredit: number; selfPayTax: number };
}
// SpecificCorpInput += shareholders?: SpecificCorpShareholder[];
//                   += annualIncome?; corporateTaxComputed?; corporateTaxCredit?;
//                   += giftDeduction? (한도 ㉮㉠용)
// DeemedGiftResult += specificCorpMulti?: { corpProfit; corpTaxApportioned; donees: SpecificCorpDonee[] }
```
> Map 금지(`feedback_engine_result_map_json_loss`) → 배열/Record로.

### 함수 (specific-corp.ts 확장, 38→~400줄 예상 <800)
- `calcSpecificCorpGift` (기존, 하위호환 유지)
- `calcSpecificCorpGiftMulti(input)` — 안분 → 주주별 이익 → 과세제외 3종 → donees[]
- `calcSpecificCorpLimit(...)` — §45의5② ㉮㉯ Min·신고세액공제·자진납부 (내부 헬퍼)
  - **㉮ 일반산출세액**: taxBase = (증여의제이익[법인세 차감 **後**] − giftDeduction), **`truncateToThousand` 천원절사 후** `calcInheritanceGiftTax(taxBase, DEFAULT_INHERITANCE_GIFT_BRACKETS)`(common.ts:100·86 — 주석 line 97 천원절사 전제). 세율·누진공제 echo는 `findApplicableBracket`(common.ts:119).
  - **㉠ 직접증여 가정**: taxBase = (**§34의5④1호 거래이익[법인세 차감 前]** × 지분율 − giftDeduction), 천원절사 후 동일 함수. ㉮(차감 後)와 달리 ㉠은 **차감 前** 거래이익 기준 — 한도의 핵심(간접경로가 직접경로보다 불리하지 않게).
  - **㉡** = 법인세 안분액 × 지분율. **㉯** = max(0, ㉠ − ㉡). **finalTax** = min(㉮, ㉯). 신고세액공제 = floor(finalTax × 3/100)(§69), selfPayTax = finalTax − filingCredit.
- 정밀도: 법인세 안분·주주별 이익 모두 `safeMultiplyThenDivide(...)` floor. **주주별 이익은 각자 독립 floor — 잔액 흡수 안 함**(§45의5는 각 지배주주등 **개별 산정**, 합산 일치 불요. `feedback_floor_residual_absorption`의 "양쪽 floor 합 −1원" 케이스가 아님).

### 법령상수
- `GIFT.SPECIFIC_CORP_LIMIT = "상증법 §45의5②"` 추가 (`legal-codes/inheritance-gift.ts`).

---

## 7. UI 설계 (14 동기화 지점)

### 신규 폼 필드 (`deemed-form-state.ts`)
`scMode`(single/roster, RadioCardGroup sky) · `scCorporateTaxMode`(direct/auto, amber) · `scCorpTaxAssessed`/`scCorpTaxDeduction`/`scCorpIncome` · `scTotalShares` · `scShareholders?: ScShareholderRow[]`(3-state) · `scSelectedDoneeIndex` · `scGiftDeduction`.

- `ScShareholderRow{ id, name, relation: ScRelation, shares, isDonor }`. `ScRelation`=self/lineal_descendant/sibling/spouse/other_relative/other → `isRelated` 도출(other=false).
- roster 행 컴포넌트는 **신규 파일 `SpecificCorpShareholderTable.tsx`** (행 50~80줄, `capital-decrease`/`contribution-form` 패턴 차용). `SpecificCorpFields`는 import만 — `other-forms.tsx` 800줄 이내 유지.

### 결과뷰 (`DeemedGiftResultView` specific_corp 전용 분기)
1. **주주별 증여가액 표**: 성명·관계·주식수·지분율·계산식·증여재산가액·과세여부 배지(과세/본인증여 제외/비특수관계인 제외/1억 미만 제외). 금액 우측정렬(`amount-column-align`). 내부 id 노출 금지(`name.trim()||관계라벨`).
2. **§45의5② 한도 표**(수증자 선택 시): ㉮ 일반산출세액 / ㉯ 한도액(=㉠−㉡) / 적용 Min / 신고세액공제 3% / 자진납부세액.

### 14 지점 매핑 요약
①폼상태 ②initial(scMode="single"·scShareholders=undefined 등) ③normalize(구버전 undefined 보장) ④api변환(roster→shareholders[]·auto→산출세액 전달) ⑤위젯 ⑥사이드바(변경없음) ⑦결과카드 ⑧validate(4분기) ⑨⑫Zod specificCorpSchema 배열필드 ⑬api body spread(scShareholders→shareholders) ⑭route 분기.
> ⑫⑬⑭ TS 미감지 → **grep 자가점검 필수**(`feedback_explicit_prop_mapping_strip`).

---

## 8. 정책 위험 (사전 식별 — 위반 차단)
- **3-state**(`feedback_three_state_optional_mode_toggle`): `scShareholders?`는 undefined(OFF)/[](빈)/[...]. `length>0`로 모드 derive 금지 — `scMode` 명시 필드를 단일 진실로.
- **자동안분 fallback 금지**(`feedback_no_silent_apportion_fallback`): auto 모드 소득금액 미입력 0 채움 금지(÷0) → validate `scCorpIncome>0` 차단.
- **useEffect 미러링 금지**(`feedback_useeffect_store_mirror_forbidden`): 법인세 자동산정 echo는 useMemo 표시전용. store 역기록 금지. 안분 실계산은 엔진.
- **validate↔fallback 동기화**(⑧): roster+direct에서 `scCorporateTax=""`→0 허용을 validate·API 일치.
- **내부 id 노출 금지**(`feedback_no_internal_id_in_result`): 표시셀에 row.id 금지.
- **Map JSON 소실**: result는 배열/Record.

---

## 9. Phase 분할
- **Phase A (엔진)**: 타입 확장 → `calcSpecificCorpGiftMulti`(안분+과세제외 3종) → `[SC-CASE1]`·`[SC-CASE2]` anchor(한도 제외).
- **Phase B (엔진)**: `calcSpecificCorpLimit`(§45의5②) → `[SC-CASE2-LIMIT]` anchor(189,000,000 / 183,330,000).
- **Phase C (UI)**: 14지점 — 폼·roster 테이블·결과 2표·Zod·validate·api·route.
- **Phase D (검증)**: `ui-engine-sync-checker` + E2E(`gift-deemed-specific-corp.spec.ts`, 사례2 입력→1,449백만·한도 189백만).
- **defer v2**: §34의5⑦ 30%/3억 현저대가(저가·고가), 3호의2 자본거래 준용, 관계별 공제·기존증여 합산.

## 10. Pre-Do anchor (Do 진입 전 1건 우선)
`__tests__/tax-engine/gift-deemed/specific-corp-multi.test.ts`에 `[SC-CASE2]` 1건 먼저 작성·실행 → **실패 확보**(함수 미존재) → 설계 환류. "현행 일치 예상" 금지(`pre-do-anchor-verification`).
