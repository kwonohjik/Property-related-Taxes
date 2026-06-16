# 양도세 다주택 중과 입력 위젯 — 엔진 설계

> 계획: `docs/00-pm/transfer-multi-house-input.plan.md`
> 엔진 판정 로직(multi-house-surcharge)은 기존 완비 — 본 설계는 **입력 도달(wiring) + 폼→엔진 필드 매핑** 범위.

## Context

다주택 중과 엔진은 배제 14종·임대유형 A~I·한시 유예까지 완비됐으나 입력 계층이 단순 주택수만 받아
정밀 경로가 도달 불가했다. 본 작업은 (1) 폼 HouseEntry/gracePeriod 입력 → (2) 엔진 `houses[]`/`gracePeriod`
도달을 연결한다. multi-house-surcharge 판정 로직은 무변경(gracePeriod 소비는 기존 `determineSurchargeExclusion`).

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | isInherited=true·inheritedDate 없음 → 상속5년 배제 **미발동**, 주택수 유지 | 소령 §167의3①7호 (helpers:383 `&&inheritedDate` 게이트) | 엔진 계약 실증 | `multi-house-surcharge/predo-anchor.test.ts` A1 | ✅ |
| 2 | inheritedDate 5년 이내 → `inherited_5years` 배제 | 소령 §167의3①7호 | 엔진 계약 | predo-anchor A2 | ✅ |
| 3 | gracePeriod 조건 미충족(계약>2026.5.9·토지허가X) + 유예활성 → suspended=false | 소령 §167의3 한시배제 (helpers:783·557) | 엔진 계약 | predo-anchor A3a | ✅ |
| 4 | gracePeriod 충족(토지허가+임차인) → suspended=true | 동 | 엔진 계약 | predo-anchor A3b | ✅ |
| 5 | gracePeriod 미제공+유예윈도우 내 → blanket suspended=true | 동 | 엔진 계약 | predo-anchor A3c | ✅ |
| 5b | gracePeriod 계약일 < 2022.5.10 → 조건C 충족이어도 미배제(하한) | 소령 §167의3 한시배제 시행일 2022.5.10 | 적대적 리뷰 적발 | predo-anchor A3d | ✅ |
| 6 | houses[]에 inheritedDate(Date) → calculateTransferTax → `multiHouseSurchargeDetail.excludedHouses[inherited_5years]` | 통합 | end-to-end | `transfer-tax/multi-house-grace-period.test.ts` MHG-01 | ✅ |
| 7 | gracePeriod 미제공+유예활성 → `isSurchargeSuspended`=true (blanket) | 통합 | wiring | MHG-02-a | ✅ |
| 8 | gracePeriod 조건 미충족 → `isSurchargeSuspended`=false (정밀, wiring 증명) | 통합 | wiring | MHG-02-b | ✅ |
| 9 | gracePeriod 충족 → `isSurchargeSuspended`=true | 통합 | wiring | MHG-02-c | ✅ |
| 10 | route houses[] string날짜 6필드 → Date 변환·필드 매핑 | ⑭ | 단위 | `lib/transfer-route-multi-house.test.ts` | ✅ |
| 11 | route gracePeriod string → Date, optional 매핑 | ⑭ | 단위 | 동 | ✅ |
| 12 | legacy 등록임대: isLongTermRental+isRegisteredRental+등록일2종+기간≥5 → 배제 | 소령 §167의3①2호(helpers:275-282) | (엔진 기존 테스트 커버) | multi-house-surcharge/* | ✅(기존) |

---

## 법령 근거

```
소령 §167의3①7호: 상속주택 — 상속개시일로부터 5년 이내 주택 수 산정 제외 (helpers:383-393)
소령 §167의3①2호: 장기임대 등록주택 배제. legacy 분기 — 등록사업자+등록일2종+임대기간≥5년 (helpers:270-282)
소령 §167의3 한시 배제(2022.5.10~2026.5.9): 계약일(조건A: 2022.5.10 ≤ contractDate ≤ 2026.5.9 — 하한·상한 모두)·
  잔금기한(조건B 4/6개월)·토지거래허가+임차인(조건C 무기한). checkGracePeriodExemption (helpers:557-577),
  소비 (helpers:785-791). [13단계 검토] 하한(SURCHARGE_EXCLUSION_WINDOW.start=2022-05-10) 추가 — 누락 시 시행 전 계약 오배제.
```

상수: `lib/tax-engine/legal-codes/transfer.ts` `MULTI_HOUSE.*` (기존).

---

## 엔진 input 타입 (변경분)

```ts
// types/transfer.types.ts — TransferTaxInput
gracePeriod?: MultiHouseGracePeriodInput;   // 신규 — STEP 0.5 mhInput으로 전달

// types/multi-house-surcharge.types.ts — 명명 추출(엔진/폼 변환 공유·dedup)
export interface MultiHouseGracePeriodInput {
  contractDate: Date;
  isLandPermitArea: boolean;
  hasTenantInResidence: boolean;
  areaDesignatedDate?: Date;
}
// HouseInfo(기존)의 inheritedDate·isRegisteredRental·rentalRegistrationDate·
// businessRegistrationDate·rentalPeriodYears·rentalCancelledDate 는 이미 존재 — route 매핑만 추가.
```

## 엔진 result 타입

무변경. `TransferTaxResult.multiHouseSurchargeDetail`(subset: effectiveHouseCount·rawHouseCount·
excludedHouses·exclusionReasons·isRegulatedAtTransfer·warnings) + top-level `isSurchargeSuspended`.

## 계산 알고리즘 (변경 지점)

```
transfer-tax.ts STEP 0.5 (houses[] 제공 + houseCountExclusionRules 로드 시):
  mhInput = { houses, sellingHouseId, transferDate, isOneHousehold,
              temporaryTwoHouse, marriageMerge, parentalCareMerge, presaleRights,
              gracePeriod: workingInput.gracePeriod }   ← 신규 1줄
  → determineMultiHouseSurcharge(mhInput, ...)
     → countEffectiveHouses: 상속5년(inheritedDate)·legacy 임대(등록정보) 배제
     → determineSurchargeExclusion: gracePeriod 제공+유예활성 → checkGracePeriodExemption (정밀)
                                    아니면 blanket isSurchargeSuspended
```

## Silent fallback / 자동 안분 후보 식별

- **상속개시일 미입력**: 자동 추정 **금지**. isInherited=true+inheritedDate 빈값 → validation 차단(⑧).
- **gracePeriod houses 0건**: 위젯·API·검증·엔진 사용을 `houses.length>0`로 일치 → 침묵 무시 차단(13단계 M1).
- **rentalPeriodYears 미입력**: isRegisteredRental=true 시 validation 차단. fallback 없음.

## 테스트 약속

케이스 인벤토리 12행 = anchor 15건(predo 5 + grace-period 4 + route 6). 전체 vitest 8300 통과·회귀 0.

## UI 통합 위임

`transfer-multi-house-input.ui.design.md` 참조 (테이블+모달·gracePeriod 위젯·14지점).
