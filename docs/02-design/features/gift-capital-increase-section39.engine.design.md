# 증자에 따른 이익의 증여(§39) cap-table 6사례 — 엔진 설계

> 계획서: [`docs/00-pm/gift-capital-increase-section39.plan.md`](../../00-pm/gift-capital-increase-section39.plan.md) v3 (R1 13건 + R2 6건 정정)
> UI 측: [`gift-capital-increase-section39.ui.design.md`](./gift-capital-increase-section39.ui.design.md)
> 검증표기: `[확인]`KoreanLaw 본문 / `[교재만/통칙]` / `[검증불가]` / `[probe]`현행 엔진 실측

## Context

교재 27장(§39) 6 계산사례는 **자본구성표(cap-table) 기반 다수증자·다증여자 배분 + 검증내역(zero-sum)**을 요구한다. 현행 `calcCapitalIncreaseGift`(`capital-increase.ts`)는 **단일 (수증자, 증여자, subType) 1건**만 계산 → 사례2(1수증자 2-subType 합산)·사례4·6(1수증자 2증여자 분할)·사례5(특수관계 부재 미과세)·검증내역을 재현 불가. 또한 ④ `increaseHigh forfeited_realloc`이 `relatedAcquiredShares`/`ratioDenomShares` 가중을 **무시**하는 버그 실재(`capital-increase.ts:77-81` `[probe]`).

해법: **primitive 정밀화(④ 버그 수정 + `equalIssueShares?` + `skipThreshold?`) + cap-table 오케스트레이터 신설**(수증자별·증여자별 분할·floor 잔액 흡수·집계 게이트·특수관계 0행·zero-sum).

> ## ⚠️ 구현 환류 (Do — equity-delta 채택)
> Do 중 6사례 전개에서 **증여재산가액 = 주주별 지분 자산 증감(equity delta), 증여자별 분할 = 손해비례(증여자 손해÷총손해)**가 교재 호별 산식(§29②1~5: 실권주÷실권주총수·지분비율·균등㉯)과 **대수적으로 동치**(손해 ∝ 인수신주 → 손해비례 = 인수신주비례)임을 6사례 전부에서 확인. 이에 **오케스트레이터는 primitive(subType별) 호출이 아닌 equity-delta 방식**으로 구현(`capital-increase-allocation.ts`). 효과:
> - primitive(`capital-increase.ts`) **무변경** — `equalIssueShares?`·`skipThreshold?`·④ 가중 버그 수정 **불필요·미적용**(단건 UI는 해당 입력 미수집이라 단건 모드 무영향). 아래 "primitive 확장" 절은 미채택(기록 보존).
> - R1/R2가 지적한 primitive 기반 난점(floor 잔액·집계 게이트 분모·subType dispatch·② 비대칭)이 구조적으로 소거.
> - `CapitalIncreaseAllocationInput`에서 `equalIssueShares`/`excessDenominator` **제거**(㉯=실제 증가주식 기준, 분모는 손해비례가 대체).
> - 게이트(②⑤): 실권처리(총실권주>총재배정) 발생 시 차액 30%·집계 3억 판정(per-share ratio는 실제 ㉯ 기준 — 통칙 균등㉯와 경계 근처서 미세차 가능, v1 한정).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령/통칙 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C1 | 저가 재배정(①) 단일 수증자 | 영 §29②1호(§39①1호 가) `[확인]` | 교재 사례1: 을 250,000,000 | `capital-increase-case-anchor.test.ts` | ☐ |
| C2 | 저가 재배정+실권처리(①+②) 1수증자 2-subType 합산 | 영 §29②1·2호 + 지분비율배분 `[교재만/통칙]` | 교재 사례2: 을 175,000,000(125M+50M)·병 25,000,000 | `capital-increase-case-anchor.test.ts` | ☐ |
| C3 | 저가 제3자직접배정+초과배정(③) | 영 §29②1호(§39①1호 다·라) `[확인]` | 교재 사례3: 을 200,000,000·병 400,000,000 | `capital-increase-case-anchor.test.ts` | ☐ |
| C4 | 고가 재배정(④) 2수증자×2증여자 | 영 §29②3호(§39①2호 가) + 실권주총수배분 `[교재만/통칙]` | 교재 사례4: 병 300,000,000(부225M+모75M)·정 100,000,000 | `capital-increase-case-anchor.test.ts` | ☐ |
| C5 | 고가 실권처리(⑤) 2증여자 + 특수관계 없는 자 미과세 | 영 §29②4호(§39①2호 나) `[확인]` + §39①2호 특수관계 요건 | 교재 사례5: 병 225,000,000(부187.5M+모37.5M). 소액주주 산식 75M(부62.5M+모12.5M)→특수관계 부재 **과세 0** | `capital-increase-case-anchor.test.ts` `[CI-S39-C5-...-NO-RELATED-PARTY-EXCLUDED]` | ☐ |
| C6 | 고가 제3자직접배정+초과배정(⑥) 2수증자×2증여자 | 영 §29②5호(§39①2호 다·라) `[확인]` | 교재 사례6: 병 200,000,000(갑80M+을120M)·정 50,000,000 | `capital-increase-case-anchor.test.ts` | ☐ |
| B1 | **floor 비정수 가중** 잔액 흡수 | `feedback_floor_residual_absorption` | 3증여자 1:1:1, base 100M → 합 === 100,000,000(99,999,999 아님) | `capital-increase-case-anchor.test.ts` | ☐ Pre-Do |
| B2 | **집계 30%·3억 게이트** | 영 §29②2·4호 `[확인]` | 집계 ≥3억·증여자별 <3억·ratio 미충족 → 게이트 집계 판정 | `capital-increase-case-anchor.test.ts` | ☐ Pre-Do |
| B3 | **② 다증여자** 환산 경로 | 지분비율배분 `[교재만/통칙]` | ② 증여자 2명 → 환산 forfeitedShares 분할 합 === 집계 | `capital-increase-case-anchor.test.ts` | ☐ |
| B4 | 30%·3억 미충족 배제(②) | 영 §29②2호 `[확인]` | 차액 <30% AND 가중이익 <3억 → 0 + exclusionReason | `capital-increase-subcase-anchor.test.ts` | ☐ |
| B5 | §39② 고가 비대상 | §39②"제1항제1호" `[확인]` | 고가 input imputation 필드 미사용 | `capital-increase-case-anchor.test.ts` | ☐ |
| R1 | primitive 단건 회귀(기존 7건) | — | `[CI-*]` 보존(미입력=현행) | `capital-increase-subcase-anchor.test.ts` | ☐ |
| R2 | 의제 단건 회귀(기존 9건) | §39②·§29⑤ | `[SS-*]`/`[IMP-*]` 보존 | `small-shareholder-imputation-anchor.test.ts` | ☐ |
| R3 | 전환주식 회귀 | 영 §29②6호 | `[CS-1·2]` 보존(④ 수정 미접촉 — `increaseLow forfeited_realloc` 경유) | (기존) | ☐ |

**규칙**: 행≥1 충족. Pre-Do(B1·B2 + C5·C6) 우선 실행 → 디자인 환류. NTS 예규(재산-60·통칙 39-29) 미확보 행은 `[교재만/통칙]` 근거 유지.

**anchor명 1:1 매핑** `[디자인검토 integ#4, feedback_pdf_table_row_one_to_one_mapping]`: B1=`[CI-S39-FLOOR-RESIDUAL]` · B2=`[CI-S39-GATE-AGGREGATE]` · B3=`[CI-S39-LOW-NR-MULTI-DONOR]` · B4=`[CI-LOW-NR-FAIL]`(기존) · B5=`[CI-S39-C4-IMPUTATION-NA]` · C1~C6=`[CI-S39-C1~C6-*]`.

---

## 법령 근거

```
상증법 §39①1호(저가): 신주를 시가보다 낮은 가액으로 발행 — 가목(실권주 재배정)·나목(실권처리)·다목(제3자직접배정)·라목(주주초과배정)
상증법 §39①2호(고가): 시가보다 높은 가액 발행 — 가목(실권주 재배정)·나목(실권처리)·다목·라목
상증법 §39①3호: 전환주식 전환이익 (영 §29②6호 = 가목 전환후 − 나목 발행시)
상증법 §39②: "제1항제1호를 적용할 때" 이익증여 소액주주 2명↑ → 1인 의제 (저가만) [확인]
상증령 §29②1호: §39①1호 가·다·라목 — (㉯−㉰)×배정/직접/초과 신주수 (분모 없음) [확인]
상증령 §29②2호: §39①1호 나목 — 30%·3억 게이트 (수증자별 지분비율 배분=통칙·재산-60) [교재만/통칙]
상증령 §29②3호: §39①2호 가목 — (㉰−㉯)×포기자 실권주수 (분모 없음, 증여자배분=통칙) [확인/통칙]
상증령 §29②4호: §39①2호 나목 — ×(특수관계인 인수신주÷균등증자 증자주식총수) + 30%·3억 게이트 [확인]
상증령 §29②5호: §39①2호 다·라목 — ×(특수관계인 인수신주÷(주주아닌자배정+균등초과총수)) [확인]
상증령 §29②각목 단서: 상장 증자후가 = 저가 Min / 고가 Max (이론권리락 vs 권리락후 2월 종가평균) [확인], 측정 통칙 39-29…2 [검증불가]
상증령 §53⑧3호: §29 이익 계산 시 §63③ 최대주주 20% 할증평가 배제 [확인] (legal-codes에 §53⑧ 기존 정확 인용)
```

상수: `GIFT.CAPITAL_INCREASE`(`legal-codes/inheritance-gift.ts:128` = "상증법 §39"). 신규 할증배제 표기 시 `상증령 §53⑧3호` 사용.

---

## 엔진 input 타입

### primitive 확장 (`types.ts`, 하위호환 — 미입력=현행)
```ts
export interface CapitalIncreaseInput {
  // ...현행 필드 유지...
  /** ② 실권처리 ㉯ 균등증자(당초지분 유지) 가정 증자주식총수. 미입력 시 issuedShares (통칙 근거) */
  equalIssueShares?: number;
  /** ②⑤ 30%·3억 게이트를 오케스트레이터가 집계단계에서 판정 → true면 primitive 게이트 skip(raw 반환) */
  skipThreshold?: boolean;
}
```
> **`donorWeight` 미도입** — ④⑤⑥ 가중은 기존 `relatedAcquiredShares`/`ratioDenomShares` 재사용(dual-truth 회피). ④ 버그 수정 = `increaseHigh forfeited_realloc`이 그 필드를 읽도록(`value = denom>0 ? safeMultiplyThenDivide(base,numer,denom) : base`).

### 오케스트레이터 (전부 `types.ts` co-locate — 기존 20 union 패턴, 순환 import 0)
```ts
export interface CapShareholder {
  id: string; name?: string;
  preShares: number; entitledShares: number; subscribedShares: number;
  reallocatedShares?: number;   // 재배정/제3자/초과
  relatedTo?: string[];         // 특수관계인 주주 id (없으면 해당 증여자분 0행 — 사례5 미과세 단일원)
  // isSmallShareholder 제거 [디자인검토 integ#2]: §39② 의제는 cap-table 비범위(기존 단건+9건이 담당)
}
export interface CapitalIncreaseAllocationInput {
  direction: "low" | "high";
  preIssuePrice: number; preIssueShares: number;
  newSharePrice: number; issuedShares: number;   // 실제 증가주식수(㉯)
  equalIssueShares: number;                       // ② ㉯·⑤ 분모
  excessDenominator?: number;                     // ⑥ 분모 선택 오버라이드(미입력=행 합 도출)
  shareholders: CapShareholder[];
}
```

## 엔진 result 타입 (전부 array/object — Map 금지 `feedback_engine_result_map_json_loss`)
```ts
export interface DonationSplit {
  beneficiaryId: string; donorId: string;
  subType: NonNullable<CapitalIncreaseInput["subType"]>;  // (증여자×subType) 카르테시안
  value: number; excludedReason?: string;                 // 특수관계 부재 → 0
}
export interface CapitalIncreaseAllocationResult {
  type: "capital_increase_allocation";
  perBeneficiary: Array<{ beneficiaryId: string; total: number; byDonor: DonationSplit[] }>;
  /** 교재 검증내역 = 주주별 증자전·후 평가·증감 (UI ⑦ 단일 바인딩원) [디자인검토 Critical] */
  byShareholder: Array<{ id: string; name?: string; preValuation: number; paidIn: number; postValuation: number; delta: number }>;
  smallShareholderImputed: boolean;   // cap-table 항상 false (§39② 비범위)
  reconciliation: { totalGain: number; totalLoss: number; balanced: boolean };
  splits: DonationSplit[];
}
```
`byShareholder`: `preValuation=preShares×㉮`, `paidIn=subscribedShares×㉰`, `postValuation=(preShares+인수신주)×㉯`, `delta=post−pre−paidIn`, **Σdelta=0**. `reconciliation`은 delta에서 도출(+=수증·−=증여자손해). JSON 왕복 보존(`byDonor`·`byShareholder`·`splits` 중첩, undefined 소실 0) — Phase C anchor.

---

## 계산 알고리즘 (오케스트레이터)

1. **㉯ 산정**: `computeWeightedPerShare`로 유형별 인자(subType→인자 매핑표, 계획 §5.2). ① 실제증가·② 균등(equalIssueShares)·⑤ 실제인수.
2. **수증자 enumerate**: 이익 본 자(저가=신주 초과인수자, 고가=신주 포기자) 식별.
3. **집계 게이트(②⑤)**: 현행 primitive 게이트는 per-donor `weighted` 기준(`capital-increase.ts:89-90`)이므로 `skipThreshold=true`로 우회하고, **오케스트레이터가 수증자 집계 base(전 증여자 합)로 ratio·3억 단일 판정** `[디자인검토 eng#3]`. 통과 시에만 분배(B2 anchor가 강제).
4. **증여자 enumerate + primitive 호출**: 수증자별 `relatedTo` 증여자 순회 → primitive 호출(②=오케스트레이터가 forfeitedShares 환산, ④⑤⑥=related 필드).
5. **floor 잔액 흡수**: 수증자 raw 총이익 정수 확정 → 증여자별 floor 분배, **마지막 증여자 = raw − Σ(앞 floor분)**.
6. **특수관계 0행**: `relatedTo`에 수증자 없으면 `{value:0, excludedReason}` 생성(누락 아님).
7. **다-subType 합산(②)**: 같은 수증자 ①+② 호출 → `byDonor`에 (증여자×subType) 누적 → `total=Σ`.
8. **byShareholder 검증내역**: 주주별 `preValuation=preShares×㉮`·`paidIn=subscribed×㉰`·`postValuation=(preShares+인수)×㉯`·`delta=post−pre−paidIn`. **Σdelta=0**.
9. **reconciliation**: `totalGain`=Σ(+delta)=수증 합, `totalLoss`=Σ(−delta)=증여자 손해 합, 0행 양변 제외, `balanced=|gain−loss|≤허용오차`.

---

## Silent fallback / 자동 안분 후보 식별

- **분모 도출 = 명시 행의 결정적 합**(안분 아님): ④ 실권주총수·⑥ 제3자+초과는 주주별 명시입력(entitled/subscribed/reallocated) 합산. **미입력분 추정 채움 금지** — 한 행이라도 미입력이면 ⑧validate 오류.
- `excessDenominator` 미입력 시 행 합 도출(결정적). ⑧validate: 행 합 == (명시 시)값, 배정합 == 발행수.
- 자동 보정·cross-row 자동 채움 없음(`feedback_no_silent_apportion_fallback`).

---

## 테스트 약속

- 케이스 인벤토리 전 행 anchor. 6사례 원단위 `toBe()` 3층(㉯→수증자별→증여자별) + zero-sum ×6.
- Pre-Do: B1(floor)·B2(게이트)·C5·C6 우선.
- 증여자 개별호출 합 === 전체 `toBe()`(floor 자기일관).

---

## 동기화 지점 (엔진·API 측) — 상세는 계획 §6 / UI는 ui.design.md

- 엔진-타입 T1~T6: `DeemedGiftType`·`DeemedGiftInput` union·result 판별자·`DEEMED_TYPE_META`·피커·prefill (TS 강제, 누락=컴파일 에러)
- API/Route: ⑨Zod union(+superRefine TS 미강제)·⑫중첩배열·⑭dispatch(route.ts:58 이중캐스트 → JSON 왕복 anchor)·라우터 case
- ⑩⑪ N/A(단일 input·자산배열 없음)

---

## UI 통합 위임

UI 명세는 [`gift-capital-increase-section39.ui.design.md`](./gift-capital-increase-section39.ui.design.md). 주주 다중행 테이블+모달·결과 검증내역 zero-sum 표가 핵심.
