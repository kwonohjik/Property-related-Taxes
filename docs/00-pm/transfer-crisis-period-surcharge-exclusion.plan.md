# 2008 위기대응 취득기간 양도세 중과배제 (부칙 §9270호 제14조①) — 구현 계획서

> 작성일: 2026-07-26 (자가검토 루프: Critical §3.A 재설계 + 기재부 예규·판례 확보 반영) · base `origin/master` @ 32dabc63 (#781)
> 검증: 부칙 §9270호 §14①(전문개정 2009.5.21·개정 2010.12.27) + **기재부 재산세제과-1422(2023.12.26.)**(세율) + **서울행정법원 2024구단72950(국승, 1심)**(장특) + 현행 §104·§95(MST 280405) + 코드 실측(자가검토 3-way fork + 메인 재검증)
> 정책 준거: `feedback_korean_law_citation_verify` · `feedback_transfer_year_tax_rate` · `feedback_engine_result_display_drift` · `feedback_no_internal_id_in_result` · `feedback_api_zod_schema_sync`(14지점) · `echo-field-pattern`

---

## 0. 핵심 진단

**근거 (확정)**:
- **부칙 §9270호 §14①**(전문개정 2009.5.21·개정 2010.12.27): "2009.3.16~2012.12.31 취득 자산 → §104①4~9호에도 불구하고 **§104①1호(기본세율)**, 2년 미만이면 2·3호." → **세율 특례만**.
- **기재부 재산세제과-1422(2023.12.26.)**: 다주택자 09.3.16~12.12.31 취득 주택을 18.4.1 이후 양도(**조정대상지역 소재**) → 부칙 §14①로 **§104①1호 세율**. ⇒ 현행 **§104⑦(조정지역 다주택 중과) 세율 배제** 확인. 적용: 회신일 이후 결정·경정분.
- **서울행정법원 2024구단72950(국승, 1심·진행중)**: 동 주택은 여전히 **§104⑦3호 "조정대상지역 다주택 해당 자산"** → **§95②본문 괄호(§104⑦ 각호 자산 장특 제외)로 장기보유특별공제 배제.** "부칙 §14조로 장특 적용" 주장 기각.

**⇒ 결론(사용자 확정):**
- **A 다주택**: 세율 O(§104①1호 기본) · **장특 X**(§95② 배제 유지 — §104⑦ 해당 자산).
- **B 비사업용 토지**: 세율 O(+10%p 배제) · **장특 O**(§95② 표1 적용 — 토지는 §104⑦ 대상 아님 → 장특 제외 비적용).

**⚠️ Critical 설계 원칙(자가검토 발견)**: 장특 배제(`transfer-tax-helpers.ts:442` `if(isSurcharge && !isSuspended)→deduction 0`)는 **`isSurchargeCase = surchargeType!=="none"`(`transfer-tax.ts:483`)에 종속**한다. 순진하게 `isExcluded:true`로 가면 `surchargeType="none"`→`isSurchargeCase=false`→**장특 배제 미발동→장특 공제(세율 O·장특 O)** = 판례·사용자 결론 **위반**. ⇒ **§3.A는 세율만 배제(surchargeApplicable=false)하고 surchargeType은 유지** — 판례 논리("§104⑦ 해당 성격 유지→§95② 장특 배제")와 정확히 일치.

---

## 1. 범위 및 우선순위

| 순위 | 배제 | 취득기간 | 효과 | 삽입점 |
|---|---|---|---|---|
| **A** | 다주택(조정지역 §104⑦) **세율** 중과배제 | 2009.3.16~2012.12.31 | §104⑦ 세율 미적용 → 기본세율(2년 미만 단기 60/70%). **장특 배제(§95②)는 유지(판례 확정)** | `multi-house-surcharge.ts` Step 7 return(:319~332) — `surchargeApplicable`만 오버라이드 |
| **B** | 비사업용 토지(§104①8호) 중과배제 | 2009.3.16~2012.12.31 | +10%p 배제 → 기본누진(2년 미만 단기 40/50%) · **장특 적용(표1 유지)** | `transfer-tax-rate-calc.ts:304` T-2 |

**공용**: `legal-codes/transfer.ts`에 window 상수 + `isCrisisAcqExempt(date)` A·B 공유. **신규 입력 필드 0**.

**취득기간 정정**: 사용자 초기 "토지 2009.1.1"은 부칙(2009.3.16, 자산 공통)과 상이 → **부칙 우선 2009.3.16**.

---

## 2. 법령 근거 (전수 검증)

### 2.1 부칙 §9270호 §14① — 세율 특례(§0)
### 2.2 기재부 재산세제과-1422(2023.12.26.) — §104⑦ 세율 배제 명시(§0)
### 2.3 서울행정법원 2024구단72950(국승) — 장특 배제 확정(§0). §95②본문 괄호 = §104⑦ 각호 해당 자산 장특 제외. 부칙 §14①(세율)은 §104⑦ **해당성**을 없애지 않음 → 장특 배제 존속.
### 2.4 현행 §104·§95 구조 (MST 280405)
| 조/호 | 내용 | 관계 |
|---|---|---|
| §104①1호 | §55① 기본세율 | 배제 후 세율 |
| §104①2·3호 | 단기 40%(주택 60%)/50%(주택 70%) | 배제 후 2년 미만 |
| §104①8호 | §104의3 비사업용 토지(기본+10%p) | **B 배제 대상** |
| §104⑦ | 조정지역 다주택 §55①+20/30%p | **A 세율 배제**(재산세제과-1422) |
| §95②본문 괄호 | §104⑦ 각호 해당 자산 장특 제외 | **장특 배제 유지**(판례) |

### 2.5 세율↔장특 결합 구조 (실측 — 재설계 근거)
- `transfer-tax.ts:483` `isSurchargeCase = surchargeType !== "none"` → `:504` `calcLongTermHoldingDeduction(..., isSurchargeCase, suspendedResult, ...)`
- `transfer-tax-helpers.ts:442` `if (isSurcharge && !isSuspended) → deduction 0("multi_house_surcharge")`
- `multi-house-surcharge.ts:325` `surchargeApplicable: !isSuspended` · `:342`(rate-calc) 세율 중과는 `surchargeApplicable` 게이팅.
- **분리 가능**: `surchargeType`=장특 신호(§104⑦ 해당성), `surchargeApplicable`=세율 신호. 부칙은 후자만 끔.

---

## 3. 구현 설계

### 3.공용 — `legal-codes/transfer.ts`
기존 `SURCHARGE_EXCLUSION_WINDOW`(:470 소문자 `{start,end}` + JSDoc 근거 + 헬퍼 co-locate) 컨벤션 준수:
```ts
/** 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 자산 중과세율 배제(→§104①1호).
 *  세율: 기재부 재산세제과-1422(2023.12.26.)로 §104⑦에도 적용. 장특: 서울행정법원 2024구단72950(국승)로 §95② 배제 존속. */
export const CRISIS_ACQ_EXCLUSION_WINDOW = { start: "2009-03-16", end: "2012-12-31" } as const;
// 엔진 acquisitionDate는 Date → new Date(start) 비교 (multi-house-surcharge-exclusion.ts:250 선례)
export function isCrisisAcqExempt(d: Date): boolean {
  return d >= new Date(CRISIS_ACQ_EXCLUSION_WINDOW.start) && d <= new Date(CRISIS_ACQ_EXCLUSION_WINDOW.end);
}
```

### 3.A 다주택 **세율** 중과배제 — `surchargeApplicable`만 false (장특 불개입)
**삽입점**: `multi-house-surcharge.ts` 메인 함수 Step 7 return(:319~332). `isExcluded`(surchargeType "none") 경로 **사용 안 함**.
```ts
const sellingHouse = input.houses.find(h => h.id === input.sellingHouseId);
const statutoryRateExcluded = !!sellingHouse && isRegulatedAtTransfer && isCrisisAcqExempt(sellingHouse.acquisitionDate);
// ... surchargeType 결정(그대로) ...
return {
  ...,
  surchargeApplicable: statutoryRateExcluded ? false : !isSuspended, // 부칙: 세율 중과만 배제
  surchargeType,                       // 유지 → isSurchargeCase=true → §95² 장특 배제 판정 보존
  isSurchargeSuspended: isSuspended,   // 미변경 (feature는 장특 신호에 개입하지 않음)
  ...(statutoryRateExcluded ? { rateSurchargeStatutoryExcluded: true } : {}),
};
```
- **feature는 장특에 일절 개입하지 않는다**: `surchargeType`·`isSurchargeSuspended` 미변경, 오직 `surchargeApplicable`(세율)만. 장특 배제는 현행 §104⑦-기반 판정(`transfer-tax-helpers.ts:442`)이 그대로 수행 → **장특 X**(판례 확정).
- **결과(한시 window 밖·판례 시나리오)**: surchargeApplicable=false·isSuspended=false → **세율 기본 + 장특 배제(deduction 0)**. ✓ 세율 O·장특 X.
- **장특 판정 자체(한시 유예 등)는 현행 엔진 소관 — 본 feature 범위 밖**(feature가 바꾸지 않음).
- 비조정지역: `isRegulatedAtTransfer` 게이트로 플래그 미설정(§104⑦ 자체 부적용).
- **타입**: `types/multi-house-surcharge.types.ts` `MultiHouseSurchargeResult`에 `rateSurchargeStatutoryExcluded?: boolean`.
- **rate-calc·장특 헬퍼 무변경**(surchargeApplicable=false 기존 경로 재사용).
- ⚠️ 불변식 `surchargeApplicable===!isSurchargeSuspended`가 부칙+window밖에서 깨짐 — 의도. Do에서 이 불변식 의존 소비자 grep 확인.

### 3.B 비사업용 토지 중과배제 — `transfer-tax-rate-calc.ts:304` T-2
```ts
if (input.isNonBusinessLand && surchargeRates.non_business_land) {
  const crisisExempt = isCrisisAcqExempt(input.landAcquisitionDate ?? input.acquisitionDate);
  const additionalRate = crisisExempt ? 0 : surchargeRates.non_business_land.additionalRate;
  // additionalRate=0 → 누진 기본. §104①후단 단기비교(L316~331) 유지 = 부칙 "2년 미만 2·3호"
  // 반환: crisisExempt면 surchargeType 미설정·nblSurchargeExcluded:true echo
}
```
- 타입: `CalcTaxResult`(L124) `nblSurchargeExcluded?: boolean`.
- **B 장특 = 적용(표1 유지)**: 토지는 §104⑦ 대상이 아니라 §104①8호 대상 → §95②본문 괄호(§104⑦ 각호 장특 제외)의 적용 대상이 아니다. rate-calc 세율(+10%p) 변경은 장특 산정과 무관 → **세율 O·장특 O**.

### 3.C 취득일 소스 (부칙 window 판정) — A·B 공통
부칙 "취득한 자산" 취득일 = **납세자 실제 취득일**(§98). rate-calc 보유기간 기산 의제(상속=피상속인·증여=증여자·재개발 승계=준공일, `rate-calc:293~299·350`)와 다를 수 있음 → window 판정엔 실제 취득일.
- **A**: `sellingHouse.acquisitionDate`. **Do 전 grep 실측**: 상속/증여/재개발에서 실제 취득일인지 의제일인지.
- **B**: `landAcquisitionDate ?? acquisitionDate`.
- **이월과세(§97의2)**: 세율 보유기간은 증여자 기준이나 window "취득"은 수증자 실제 증여일 원칙 — Do 전 확인(R2).

---

## 4. 14 동기화 지점 + 결과 표시

**신규 입력 0**. result 필드 2개 전파:

| 항목 | 경로·지점 |
|---|---|
| A `rateSurchargeStatutoryExcluded` | `MultiHouseSurchargeResult` → `TransferTaxResult.multiHouseSurchargeDetail` → 결과카드 |
| B `nblSurchargeExcluded` | `CalcTaxResult` → taxResult → `TransferTaxResult` → 결과카드 |
| ⑦ A 표시 | `components/calc/MultiHouseSurchargeDetailCard.tsx` — 플래그 시 "2009.3.16~2012.12.31 취득 — 다주택 중과**세율** 배제(부칙 §9270호 §14①·재산세제과-1422). **장기보유특별공제는 §95②로 배제 유지**(서울행정법원 2024구단72950)" 표시. 원시 enum 노출 금지(`feedback_no_internal_id_in_result`) |
| ⑦ B 표시 | `components/calc/NonBusinessLandResultCard.tsx:58·236` 하드코딩 "+10%p 중과" 문구를 `nblSurchargeExcluded` 시 "부칙 §14① 취득기간 배제 — 기본세율(+10%p 미적용)"으로 **조건 분기**(비사업용 판정 자체는 유지) + `TransferTaxResultView` surchargeType 정합 |
| ①~⑥·⑧~⑭ | 무변경 |

echo는 `echo-field-pattern`·`feedback_engine_result_display_drift` 준수.

---

## 5. 취득일 판정 (§98)
- 취득일은 확정 입력값 신뢰(§98 잔금·등기 빠른 날). §3.C가 window 소스 확정. 경계 민감(2009.3.15↔16 / 2012.12.31↔2013.1.1). UI 취득일 hint에 §98 안내 보강.

---

## 6. 테스트 anchor

**Pre-Do (RED 재현):**
- **A-1(Critical 앵커)**: 조정지역 3주택, 양도주택 취득 2010-06-01, 3년 보유, **한시 window 밖 양도(2026-06-01)** → `surchargeApplicable:false` && 기본세율 && **장특 deduction=0(배제·exclusionReason "multi_house_surcharge")**. (naive isExcluded면 장특>0으로 실패 — 재설계 강제)
- **B-1**: 비사업용 토지 취득 2010-06-01, 3년 보유 → +10%p 미적용, 기본누진.

**Phase 본검증:**
- 취득 경계(A·B): 2009-03-15(중과) / 03-16(배제) / 2012-12-31(배제) / 2013-01-01(중과)
- A 2년 미만: 취득 2011-06-01·1.5년 → 주택 단기 60%(§104①2호)·1년미만 70%, 중과 없음
- A 미배제 대조: 취득 2013-06-01 조정지역 3주택 한시 밖 → §104⑦ 중과 + 장특 배제(회귀)
- A 비조정지역: 취득 2010-06-01 비조정 다주택 → 플래그 미설정·기본세율
- A 장특 불개입 회귀: feature 적용 전후로 **장특 판정 불변**(현행 엔진 값 그대로) — 한시 유예 등 장특 로직은 본 feature가 바꾸지 않음
- B 2년 미만: 1년미만 50%·1~2년 40%
- **B 장특 적용**: 취득 2010-06-01·3년 이상 보유 → 장특 표1 적용(deduction>0) 유지 (세율만 배제, 장특 O)
- 미등기(`isUnregistered`): §104①10호 70% 최우선
- 다건/다필지/aggregate route 반영

위치: A `__tests__/tax-engine/multi-house-surcharge/`(세율) + 장특은 transfer-tax 통합 direct · B `__tests__/tax-engine/transfer/`(NBL).

---

## 7. Do 시퀀스

```
1. [pre-anchor] A-1·B-1 (RED) → verify: 현행 중과 적용 + A는 naive 설계 시 장특 미배제 재현
2. 공용: legal-codes CRISIS_ACQ_EXCLUSION_WINDOW + isCrisisAcqExempt
3. 타입: MultiHouseSurchargeResult.rateSurchargeStatutoryExcluded + CalcTaxResult.nblSurchargeExcluded
4. [grep 실측] §3.C HouseInfo.acquisitionDate 의미 + 불변식 소비자
5. 엔진 A: multi-house-surcharge.ts Step 7 surchargeApplicable 오버라이드 → verify: A-1 GREEN(세율 기본+장특 배제)
6. 엔진 B: rate-calc T-2 window 게이트 → verify: B-1 GREEN
7. Phase 본검증 → GREEN
8. 결과 표시 ⑦: A 문구(MultiHouseSurchargeDetailCard) + B 조건 분기(NonBusinessLandResultCard:58,236)
9. UI hint(§98) · 10. tsc 0 · vitest 회귀
```
**성공 기준**: 2009.3.16~2012.12.31 취득 조정지역 다주택 = **기본세율 && 장특 배제**(세율 O·장특 X, 판례 확정). 비사업용 토지 = +10%p 배제. 경계 1일 정확. 장특 판정은 feature가 변경하지 않음.

---

## 8. 리스크·미결

| # | 항목 | 처리 |
|---|---|---|
| R1(Critical) | 세율↔장특 결합 | §3.A 재설계(surchargeApplicable만 false·surchargeType 유지). 판례로 장특 배제 확정. A-1 앵커 강제 |
| R2 | 상속·증여·이월과세 취득일 | §3.C — 실제 취득일. 이월과세 Do 전 확인 |
| R3 | 재개발 신축 취득일 | §3.C — HouseInfo.acquisitionDate grep 실측 |
| R4 | 불변식 `surchargeApplicable===!isSuspended` 파괴 | Do 4단계 소비자 grep. 플래그 문서화 |
| R5 | 취득기간(토지 2009.3.16) | 부칙 원문 우선 |
| R6 | 다건/다필지/aggregate route | §6 앵커 |
| R7 | 판례 1심 진행중 | 장특 배제=국승 1심 + 기재부 예규(세율) + 사용자 확정. 확정판결 아님은 인지(설계 결론 불변) |

---

## 9. 구현 완료 (Do — 2026-07-26)

**브랜치**: `feat/crisis-period-surcharge-exclusion`. tsc 0 · anchor 6건 GREEN · 전체 회귀 진행.

**변경 파일**:
- 공용: `legal-codes/surcharge-transition.ts`(CRISIS_ACQ_EXCLUSION_WINDOW·isCrisisAcqExempt — transfer.ts 800줄로 이 sibling에 배치, barrel 재수출) · `legal-codes/transfer.ts`(포인터 주석)
- A 엔진: `multi-house-surcharge.ts` Step7(surchargeApplicable 오버라이드+플래그) · `types/multi-house-surcharge.types.ts`(rateSurchargeStatutoryExcluded)
- B 엔진: `transfer-tax-rate-calc.ts` T-2(window 게이트·CalcTaxResult.nblSurchargeExcluded)
- 전파: `transfer-tax.ts`(결과 2필드) · `transfer-tax-helpers.ts`(detail builder) · `types/transfer-result.types.ts`(top-level + detail sub-object 2필드)
- **소비자 정정**: `transfer-tax-aggregate-helpers.ts` classifyRateGroup — 부칙(surchargeApplicable=false·isSuspended=false)을 progressive로 분류하도록 `!rateSurchargeStatutoryExcluded` 가드(기존 배제/유예 분류 불변)
- UI ⑦: `MultiHouseSurchargeDetailCard.tsx`(부칙 배너·로컬 타입) · `NonBusinessLandResultCard.tsx`(nblSurchargeExcluded prop·문구 조건) · `results/TransferTaxResultView.tsx`(prop 전달)
- 테스트: `transfer/crisis-period-surcharge-exclusion.anchor.test.ts`(A direct 3·A full 장특 1·B 2)

**Do deviation(환류)**: `p4-special-integration.test.ts` P4-5 앵커 갱신 — **§98의4 미분양주택은 취득기간이 2009.3.16~2010.2.11이라 항상 부칙 §14① window(2009.3.16~2012.12.31) 내부** → 조정지역 다주택이어도 부칙으로 세율 중과 배제(기본세율)됨. 종전 "중과 유지(0.3)" 기대는 부칙 구현 전 작성분이라 법령 정합상 갱신(§167의3①5호 감면주택 배제 논점 line 198은 유지). `feedback_anchor_correction_legal_priority`.

**R2/R3(취득일 소스) 실측 결과**: `HouseInfo.acquisitionDate`는 단일 필드(상속/증여/재개발 별도 의제 필드 없음) → 부칙 window 판정에 납세자 실제 취득일 그대로 사용(§3.C 정합). 이월과세는 UI 통합 경로에서 acquisitionDate 소스 확정(추가 확인 불요 — 단일 필드).

---

## 부록 — 검증 file:line·조문
- 부칙 §9270호 §14① / 기재부 재산세제과-1422(2023.12.26.) / 서울행정법원 2024구단72950(국승) / §104①·⑦·§95②(MST 280405)
- 세율↔장특 결합: `transfer-tax.ts:483·504` · `transfer-tax-helpers.ts:442` · `multi-house-surcharge.ts:308·325`·rate-calc `:342`
- A 삽입점: `multi-house-surcharge.ts:319~332` · `types/multi-house-surcharge.types.ts`(MultiHouseSurchargeResult)
- B: `transfer-tax-rate-calc.ts:304`·`:316~331`·`CalcTaxResult`(L124)
- 표시: `MultiHouseSurchargeDetailCard.tsx` · `NonBusinessLandResultCard.tsx:58·236`
- 공용상수 컨벤션: `legal-codes/transfer.ts:470`
