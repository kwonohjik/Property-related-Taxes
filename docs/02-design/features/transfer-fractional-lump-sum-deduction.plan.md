# 지분 모드 필요경비 개산공제 — 지분율 미적용 결함 정정 (계획서 rev.1)

> 대상 세목: 양도소득세 · 발견 경위: P3(PR #843) 지분 스케일 정정 중 부수 발견
> 관련 시리즈: `transfer-separate-acq-date-per-part-completion.plan.md` §14 "미검증 별건"
> 검증 원칙: file:line·법령·수치는 **전부 실측**. 미확인은 "확인 필요"로 명시.

---

## 1. 결함

공유지분 자산에서 **필요경비 개산공제(소득령 §163⑥)가 지분율만큼 축소되지 않는다.**

취득시 기준시가는 물건 전체(100%) 값으로 엔진에 전달되는데, 개산공제는 그 값에 그대로
3%를 곱한다. 같은 필요경비 산식의 다른 항인 환산취득가액은 정상적으로 지분 스케일이므로,
**한 합계식의 두 항이 서로 다른 스케일**이 된다.

### 1.1 실측 (지분 50%, 모든 입력 금액을 정확히 절반으로)

| 항목 | 물건 전체 | 지분 50% | 기대(전체÷2) | 판정 |
|---|---|---|---|---|
| 환산취득가액 | 625,000,000 | 312,500,000 | 312,500,000 | ✅ |
| **개산공제** | 15,000,000 | **15,000,000** | 7,500,000 | ❌ **2배** |
| 양도차익 | 360,000,000 | 172,500,000 | 180,000,000 | ❌ 7,500,000 과소 |

> 환산취득가액 = `양도가 × (취득시 기준시가 ÷ 양도시 기준시가)` — 기준시가가 분자·분모에
> 동시 등장해 **비율이 상쇄**되므로 양도가만 스케일돼도 결과가 정확히 절반이 된다.
> 개산공제는 상쇄가 없어 100% 값이 그대로 남는다.

**방향: 과소과세**(납세자 유리). 그러나 법령 정확성이 우선이며, 아래 1.2가 더 심각하다.

### 1.2 파급 — 필요경비 **모드 선택**까지 뒤집힌다

소득세법 §97②2호 단서는 가목(환산취득가 + 개산공제)과 나목(자본적지출 + 양도비)을 **택일**한다.
가목만 부풀면 판정 자체가 달라진다. 경계 케이스 실측:

| | 물건 전체 | 지분 50% (모든 금액 ÷2) |
|---|---|---|
| 가목 (환산 + 개산공제) | 640,000,000 | 327,500,000 |
| 나목 (자본적지출 + 양도비) | 650,000,000 | 325,000,000 |
| **판정** | **swap 발동** | **swap 미발동** |
| 적용 필요경비 | 650,000,000 | **15,000,000** |

동일한 경제적 거래인데 지분만 절반이면 필요경비가 6.5억 → 1,500만원으로 바뀐다.
방향도 반대(과대과세)로 뒤집힌다.

---

## 2. 법령 근거 (법제처 원문 확인 완료)

### 2.1 소득세법 §97②2호 가목 — **결정적 근거**

> 2. 그 밖의 경우의 필요경비는 … 자산별로 대통령령으로 정하는 금액을 더한 금액. 다만, …
> 가목의 금액이 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다.
> **가. 제1항제1호나목에 따른 환산취득가액과 본문 중 대통령령으로 정하는 금액의 합계액**

가목은 두 항의 **합계액**이다. 한 합계식의 두 항이 서로 다른 스케일일 수 없다.
이 근거만으로 현행이 오류임이 확정된다 — 개산공제 base의 해석 논쟁이 필요 없다.

### 2.2 소득세법 시행령 §163⑥ — 개산공제액

| 호 | 대상 | 산식 |
|---|---|---|
| 1호 | 토지 | 취득당시 §99①1호 **가목** 개별공시지가 × 3/100 (미등기 3/1000) |
| 2호가목 | §99①1호 **다목** 건물(부수토지 포함) 및 **라목** 주택 | 취득당시 다목·라목 가액 × 3/100 (미등기 3/1000) |
| 3호 | §94①2호 나목·다목 자산 | 취득당시 기준시가 × 7/100 |
| 4호 | 그 외 | 취득당시 기준시가 × 1/100 |

공유지분에 대한 별도 규정은 **없다**. 양도자산이 지분이면 그 지분에 상당하는 기준시가가
base라는 일반원칙에 따른다(각 공유자는 자기 지분에 대해 독립적으로 납세의무를 진다).

### 2.3 판례·재결례

조세심판원 `필요경비개산공제` 검색 8건 중 공유지분 base를 다룬 건은 **0건**.
국세청 해석례 검색도 0건. → 다툼의 여지가 없어 쟁송화되지 않은 사안으로 판단하되,
**§2.1 합계액 논거가 자기완결적**이므로 판례 부재는 결론에 영향이 없다.

---

## 3. 근본 원인

`standardPriceAtAcquisition`은 **물건 전체(100%) 값**으로 전달되며, 이는 의도된 설계다.

| 소비처 | 100% 값이 옳은가 | 근거 |
|---|---|---|
| 환산취득가 분자 | ✅ 무관 | 분모(양도시 기준시가)도 100% → 상쇄 |
| split 안분 비율 `landStd / total` | ✅ 필수 | `landStd = ㎡당 공시지가 × 면적`이 100%. 한쪽만 스케일하면 비율이 깨진다 |
| 감면 조문 기준시가 **요건** 판정 | ✅ (추정) | 주택 자체의 가액 요건(§99의4 3억·§97의3 6억 등)은 물건 기준일 개연성이 높다 — **확인 필요, 별건** |
| **개산공제 base** | ❌ | 양도자산(지분)의 기준시가여야 한다 |

**따라서 기준시가 입력 자체를 스케일하면 안 된다.** 개산공제 **계산 지점에만** 지분율을 적용해야 한다.

### 3.1 P3(PR #843)에서 이 지점을 남긴 이유

P3는 파트 필드·추계 가액의 raw 누수를 정정하면서 기준시가를 **의도적으로 raw로 유지**했다
(근거: 환산 산식 상쇄). 그 판단은 환산취득가에 대해서는 옳았으나 **개산공제를 놓쳤고**,
당시 "미검증 — 별건 확인 필요"로 기록했다. 본 계획서가 그 후속이다.

---

## 4. 영향 범위 (grep 실측 — 8파일 15지점)

| # | 파일:line | 경로 | 산식 |
|---|---|---|---|
| A1 | `transfer-tax-helpers.ts:323` | 비-split 환산 | `applyRate(standardPriceAtAcquisition, rate)` |
| A2 | `transfer-tax-helpers.ts:331` | 비-split 감정 | 동일 |
| A3 | `transfer-tax-helpers.ts:341` | 비-split 매매사례 | 동일 |
| B1 | `transfer-tax-split-gain.ts:398` | split 토지분 | `applyRate(landStdAtAcq, 0.03)` |
| B2 | `transfer-tax-split-gain.ts:399` | split 건물분 | `applyRate(buildingStdAtAcq, 0.03)` |
| C1 | `transfer-tax-pre-housing-disclosure.ts:147` | PHD §164⑤ 토지 | `Math.floor(landHousingAtAcquisition * 0.03)` |
| C2 | `transfer-tax-pre-housing-disclosure.ts:148` | PHD 건물 | 동일 |
| C3 | `transfer-tax-pre-housing-disclosure.ts:230-233` | 겸용 4부분 | 4곳 `* 0.03` |
| D1 | `transfer-tax-mixed-use-commercial.ts:169` | 겸용 상가 토지 | `applyRate(acqLandStd, 0.03)` |
| D2 | `transfer-tax-mixed-use-commercial.ts:170` | 겸용 상가 건물 | `applyRate(acqBuildingStd, 0.03)` |
| E1 | `commercial-building-valuation.ts:302` | 상가·오피스텔 §164⑥ | `applyRate(estimatedBasisAtAcq, RATE.LAND_BUILDING)` |
| E2 | `commercial-building-valuation.ts:396` | 상가 (호별) | `applyRate(unitTotalAtAcq, RATE.LAND_BUILDING)` |
| F1 | `general-building-valuation.ts:553` | 일반건물 | `input.estimatedDeductionRate ?? …` |
| G1 | `redevelopment-land-contribution.ts:116` | 재개발 토지 §166③ | `applyRate(input.landStdPriceAtAcq, 0.03)` |
| G2 | `redevelopment-housing-contribution.ts:141` | 재개발 주택 | `applyRate(input.housingStdPriceAtAcq, 0.03)` |
| H1 | `burdened-gift-apportionment.ts:361-363` | 부담부증여 §159 | `computeEstimatedDeduction(landStdApportioned, …)` — base는 **기준시가 × 채무비율**(`:358` 주석·`:361` 실측). 함수 파라미터명 `assetAcquisitionPrice`는 **오칭** |

**율 상수**: `transfer-tax-helpers.ts:311` `isUnregistered ? 0.003 : 0.03` · `legal-codes/transfer.ts:147-152`
`ESTIMATED_DEDUCTION_RATE = { LAND_BUILDING: 0.03, UNREGISTERED: 0.003 }`.

> **§163⑥3호(7%)·4호(1%)는 미구현 확정**(실측 — 상수에 3%·0.3% 2종만 존재).
> 부동산 외 자산(§94①2호 나목·다목 등)은 본 엔진의 대상이 아니다 → **범위 밖**.

### 4.1 지분율 전달 가능성 (실측)

| 경로 | 지분율 가용 | 근거 |
|---|---|---|
| primary 자산 | ✅ | `transfer-tax-api.ts` `primaryRatio = getOwnershipRatio(primary)` |
| companion 자산 | ✅ | `transfer-tax-api-helpers.ts:434` `const ratio = getOwnershipRatio(asset)` |
| 헬퍼 | ✅ | `getOwnershipRatio` `:276-281` · `applyRatio` `:369-371`(`Math.floor`) |

companion도 `standardPriceAtAcquisition`을 raw로 보낸다(`transfer-tax-api-helpers.ts:525-528`)
→ **동일 결함이 companion 자산에도 존재**한다.

---

## 5. 테스트 공백 (왜 아무도 못 잡았나)

지분 모드의 정본 anchor인 `__tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts`
(교재 사례 27 — 동일 아파트 2회 지분 취득)는 **실거래가 모드 전용**이다
(`:49`·`:99` `useEstimatedAcquisition: false`) → 개산공제가 0이라 이 경로를 지나가지 않는다.

**지분 + 추계(환산·감정·매매사례) 조합을 검증하는 테스트가 전 저장소에 0건이다.**
`totalPropertyTransferPrice`(지분 모드 마커)를 쓰는 엔진 테스트도 이 파일 하나뿐이다.

---

## 6. 설계안

### 6.1 채택안 — 엔진 입력 `ownershipRatio` + 공용 헬퍼 단일화

```ts
// types/transfer.types.ts
/**
 * 공유지분율 (0<r≤1, 기본 1). **개산공제 base 축소 전용**.
 * 기준시가·면적은 물건 전체 값을 유지한다(환산 상쇄·§166⑥ 안분 비율·감면 요건 판정).
 */
ownershipRatio?: number;
```

```ts
// tax-utils.ts (또는 transfer-tax-helpers.ts) — 15지점 단일 소스
/** 필요경비 개산공제 (소득령 §163⑥). 공유지분이면 지분 기준시가를 base로 한다. */
export function calcLumpSumDeduction(
  standardPriceAtAcq: number,
  rate: number,
  ownershipRatio = 1,
): number {
  // 지분 기준시가를 먼저 확정한 뒤 율을 적용 — 「지분 기준시가 × 3%」 순서가 법령 문언과 일치.
  const base = ownershipRatio < 1 ? Math.floor(standardPriceAtAcq * ownershipRatio) : standardPriceAtAcq;
  return applyRate(base, rate);
}
```

- 15지점의 인라인 `applyRate(std, 0.03)` / `Math.floor(std * 0.03)`를 **전부 이 헬퍼로 교체**.
  현재 `Math.floor(x * 0.03)` 직접 호출이 6곳(C1~C3) 있어 정수 연산 규약(`applyRate` 사용)도 함께 정리된다.
- 기준시가 입력은 **무변경** → 환산·안분·감면 요건 전부 무영향(회귀 0).

### 6.2 부결안

| 안 | 부결 사유 |
|---|---|
| 기준시가를 ×ratio로 전송 | split 안분 비율 `landStd(100%) / total(50%)` > 1 → 클램프되어 토지 100% 안분. 면적까지 스케일하면 UI 의미가 바뀌고 감면 요건 판정이 깨진다 |
| 개산공제 전용 필드 신설(`standardPriceAtAcquisitionForDeduction`) | 같은 값의 두 버전 = dual-truth. 15지점에서 어느 필드를 쓸지 분기해야 해 오히려 복잡 |
| `totalPropertyTransferPrice`에서 비율 역산 | 12억 안분 전용 필드에 의미를 얹는 것. 부담부증여·재개발에서 `transferPrice`가 override되면 역산이 무너짐 |

---

## 7. 케이스 매트릭스 (Do 진입 게이트)

| ID | 자산 | 모드 | 지분 | 기대 | anchor |
|---|---|---|---|---|---|
| F1 | 주택 | 환산 | 50% | 개산공제 = 전체÷2, 양도차익 = 전체÷2 | 신규 (P0) |
| F2 | 주택 | 감정 | 50% | 동일 | 신규 |
| F3 | 주택 | 매매사례 | 50% | 동일 | 신규 |
| F4 | 주택 | 환산 | 50% | **§97②2호 swap 판정이 전체와 동일** | 신규 (§1.2 가드) |
| F5 | 주택 | 실거래가 | 50% | **무변경**(개산공제 0) — 사례 27 회귀 | 기존 `fractional-acquisition-case-27` |
| F6 | 주택 | 환산 | 100% | **무변경** — 단독소유 회귀 | 신규 |
| F7 | 주택 | 환산 + 미등기 | 50% | 0.3% 율에도 지분 적용 | 신규 |
| F8 | 건물 | split(토지·건물 분리) | 50% | 파트별 개산공제 각각 ÷2 | 신규 |
| F9 | 주택 | PHD §164⑤ | 50% | 3시점 경로 개산공제 ÷2 | 신규 |
| F10 | 겸용주택 | 환산 | 50% | 주택분·상가분 개산공제 각각 ÷2 | 신규 |
| F11 | 상가·오피스텔 | §164⑥ 환산 | 50% | 개산공제 ÷2 | 신규 |
| F12 | 일반건물 | 환산 | 50% | 개산공제 ÷2 | 신규 |
| F13 | 재개발 | §166③ | 50% | 토지·주택 기여분 개산공제 ÷2 | 신규 |
| F14 | — | companion 자산 | 50% | primary와 동일 규칙 | 신규 |
| F15 | 부담부증여 | §159 | 50% | base는 기준시가 확정. `landStdPriceAtAcquisition`의 스케일이 **확인 필요** — §159 채무비율과 지분율이 이중 적용되면 안 된다 | probe 선행 |

---

## 8. 14 동기화 지점

신규 엔진 input 1개(`ownershipRatio`)뿐이며 **UI 입력은 없다**(기존 `ownershipNumerator/Denominator`에서 파생).

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | 폼·initial·normalize | **없음** — 기존 지분 필드 재사용 |
| ④⑬ | API 변환 | `transfer-tax-api.ts`(primary) · `transfer-tax-api-helpers.ts:434`(companion) 에서 `getOwnershipRatio` 결과 전송 |
| ⑤⑥ | UI 위젯·사이드바 | **없음** |
| ⑦ | 결과 카드 | 개산공제 산식 표시에 「지분 기준시가」 명시 — 100% 기준시가와 다른 값이 나오므로 설명 없으면 오독 |
| ⑧ | validation | **없음** |
| ⑨⑩⑪ | Zod enum·fallback | **없음** |
| ⑫ | Zod 입력객체 | `ownershipRatio: z.number().positive().max(1).optional()` |
| ⑭ | Route 매핑 | `route.ts`에 1줄 |

---

## 9. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| **P0** | pre-Do anchor: F1(환산 50%)·F4(swap 판정)·F6(단독 무변경) — **현행 실패를 확인** | 실패 메시지로 설계 환류 |
| **P1** | probe: 부담부증여 `landStdPriceAtAcquisition`이 100% 스케일인지 (§159 채무비율과 지분율 이중 적용 위험) | 확인 필요 1건 해소 |
| **P2** | `calcLumpSumDeduction` 헬퍼 + `ownershipRatio` input + ⑫⑬⑭ 배관 | F1~F3·F6 green |
| **P3** | 15지점 교체 (A→B→C→D→E→F→G) | F7~F14 green |
| **P4** | ⑦ 결과 카드 산식 표시 | RTL |
| **P5** | 전체 회귀 | `npm run check:pre-pr` |

---

## 10. 범위 밖

- **감면 조문 기준시가 요건 판정의 지분 취급** — §99의4(3억)·§97의3(6억) 등 가액 요건이
  물건 기준인지 지분 기준인지. 별도 필드(`standardPriceAtAcquisition99`·`993`·`992` —
  `income-deduction-router.ts:195,230` · `unsold-hybrid.ts:617`)를 쓰므로 본 작업과 분리된다.
  **미검증 — 별건**.
- **상속·증여세 개산공제** — 본 계획은 양도세 §163⑥ 한정.
- **기타소득 개산공제(80%)** — 무관.

---

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| 15지점 교체 중 일부 누락 → 경로별 스케일 불일치 | 인라인 `* 0.03`·`applyRate(std, rate)` 패턴 grep 0건 달성을 완료 조건에 포함 |
| 지분 자산의 기존 계산 결과가 바뀐다(세액 증가 방향) | 이력(IndexedDB) 재계산 없음 — 신규 계산부터 적용. 결과 카드에 산식 명시 |
| 부담부증여에서 §159 채무비율과 지분율 **이중 적용** | P1 probe로 `landStdPriceAtAcquisition` 스케일 선확인. 이미 지분 반영돼 있으면 H1 제외 |
| 사례 27 anchor 수치 변동 | 실거래가 모드라 개산공제 0 → 무영향. F5로 고정 |
