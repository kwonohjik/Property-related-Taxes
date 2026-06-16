# NBL 잔여 갭 — 엔진·데이터 설계 (consolidated)

> STEP 5 산출물 (plan-design-self-review-loop) · 계획서 [docs/00-pm/nbl-remaining-gaps.plan.md] 기반 · **R1 자가검토 정정 반영본**
> 검증: 모든 타입/시그니처 file:line은 R1에서 grep/Read 실측. 갭별 상세 계획은 `docs/00-pm/nbl-gaps/gap-*.plan.md`.

## 케이스 인벤토리 (전 갭 통합)

| ID | 갭 | 트리거 케이스 | 현행 산출 | 법령정합 산출 | numeric |
|---|---|---|---|---|---|
| C1 | 재촌 | 농지·도시지역 밖·자경 전기간·거주 시군구=토지 시군구 | isNonBusinessLand=true(landLocation undefined) | false(사업용) | ✓ flip |
| C2 | 이농 | 농지·이농일≤2006.12.31·양도≤2009.12.31 | true(입력채널 부재) | false(의제) | ✓(희소) |
| C2' | 이농 대조 | 동일·양도 2010.06.01 | — | true(cutoff 초과 미적용) | 경계 |
| C3a-1 | 면적한도 | 기타토지·부설주차장·landArea 2000>한도 1200 | 전량 사업용(boolean) | 초과 800㎡ 비사업(areaProportioning) | ✓ |
| C3a-2 | 면적한도 | 무주택나지·landArea 500≤660 | 사업용 | 사업용(한도 내) | — |
| C3b-1 | 유예사유 | 농지·멸실일 2021.06.01·종료 미입력 | grace 0·비사업 | grace=멸실+5년·사업용 | ✓ |
| C3b-2 | 단서 | 매매업·1호 건축허가제한 | (입력채널 부재) | 1·2호 가산 배제 | — |
| C3c | 목장 | 한우·warning 노출 | "축산법 시행규칙 별표2"(오인용) | "소득세법 시행령 별표 1의3" | 충실도 |
| C3d-1 | §168의6 1호 | 보유7년·직전5년창 사업 정확 1095일 | rule5 TRUE(사업) | 가나다 모두충족(비사업) | ✓(경계 측정0) |
| C3d-2 | §168의6 2호 | 보유4.15년·직전3년 사업 730일·전체 48% | rule2of3 TRUE(사업) | 가나다 충족(비사업) | ✓ genuine |

## 갭 1 — 재촌 시군구 매칭 결선

**타입**: 변경 0 (기존 재사용). `NonBusinessLandInput.landLocation?: LocationInfo`(types.ts:283)·`adjacentSigunguCodes?: string[]`(types.ts:285)·`LocationInfo{sidoCode?,sigunguCode?,distanceKm?,hasResidentRegistration?}`(types.ts:108-113).

**알고리즘 (form-mapper.ts mapAssetToNblInput)**:
```
landSigunguCode = asString(asset.nblLandSigunguCode)
landLocation = landSigunguCode ? { sigunguCode: landSigunguCode } : undefined   // 빈값=undefined(자동 fallback 금지)
return { ...기존, ...(landLocation ? { landLocation } : {}) }
```
**route 연접 주입** (`route.ts:213`·`multi/route.ts:145`): `buildNblEngineInput` 결과의 `landLocation.sigunguCode`로 `getAdjacentSigunguCodes(code)`(배열 반환) 호출해 `adjacentSigunguCodes` 주입. **R1: NBL은 resolved string[] 수신** — inheritance(`lib/tax-engine/deductions/inheritance-farming-deduction.ts:247`)의 resolver 함수 주입과 시그니처 상이.

**R1 미해결 결정사항**: 연접 데이터 소스 — `administrative-district-adjacency.json`(빈 `{}`) vs `sigungu-codes.ts SIGUNGU_CODES[].adjacentCodes`(5자리 충전). 후자 사용 시 연접 즉시 동작. `getAdjacentSigunguCodes` 자리수(5/10) 정합 확인 필요. **본 PR numeric flip은 same-district 단독 충족**(30km는 distanceKm 미주입으로 미동작).

**엔진 측 동기화**: form-mapper(매핑) + route(주입). residence.ts/farmland.ts/forest.ts 무변경(이미 landLocation 소비).

## 갭 2 — 이농 DEAD 복구

**타입**: 엔진 완비 — `UnconditionalExemptionInput.isInong?`/`inongDate?`(types.ts:163-164), `UnconditionalExemptionReason` "inong"(**types.ts:150**). 추가 0.

**알고리즘**: 엔진(`unconditional-exemption.ts:130-144`) 무변경(cutoff 2006-12-31/2009-12-31 정합). form-mapper-helpers.ts buildUnconditionalExemption(`:88-91` has게이트 + `:94-103` 매핑)에 `isInong`/`inongDate` 추가.

**드리프트 정정 (로직 무변경)**: `unconditional-exemption.ts:126`(factory_adjacent) → "소득세법 시행규칙 §83의5④ 1호"; `:142`(inong) → "§83의5④ 2호"; `:120` 주석. **R1: §83의5④1호=소유자 요구로 취득한 공장 부속토지의 인접토지**(면제대상=인접토지, "매수" 아님 — SR-8 해소).

**R1 주의**: 결과타입 `unconditionalExemption`(types.ts:395-399)에 **legalBasis 필드 없음** → 정정 legalBasis는 judgmentSteps 배지에만 노출, 강조배너는 하드코딩 "§168-14③" 불변.

## 갭 3a — §168의11① 면적기준 호별 판정

**케이스 매트릭스 (면적기준 호, R1 검증)**:
| 호 | 산식 | 면적인자 | 근거 |
|---|---|---|---|
| 2호가목 부설주차장 | ≤ standardAreaLimit | standardAreaLimit | 시행령 §168의11①2호가목 |
| 2호나목 차고 | ≤ minGarageArea×1.5 | minGarageArea | 2호나목 |
| 4호 청소년수련 | ≤ youthCapacity×200 | youthCapacity | **시행규칙 §83의4⑧**(시행령은 위임) |
| 7호 하치장 | ≤ maxAnnualArea×1.2 | maxAnnualArea | §168의11①7호 |
| 13호 무주택나지 | ≤ 660(고정) | — | §168의11①13호·§83의4⑯⑰ |
| 1·5다·6호 | ≤ standardAreaLimit(별표3~6 직접입력) | standardAreaLimit | §83의4①③④⑨⑩⑫ |
| 3·8·9·14호 | 면적기준 없음(boolean) | — | — |
| 2다·10·11다·12호 | 수입금액비율(§168의11②, **PR#226 완료 — 본 갭 제외**) | — | §83의4⑥⑬⑮ |

**타입 변경 (types.ts)**: `NblRelatedBusinessType` union 신규 + `OtherLandUsage`(types.ts:207-214)에 `relatedBusinessType?`·`standardAreaLimit?`·`maxAnnualArea?`·`youthCapacity?`·`minGarageArea?` 추가. 기존 `isRelatedToResidenceOrBusiness`는 14호/legacy fallback 보존.
**R1: `CategoryJudgeResult`(types.ts:535)에 `areaProportioning?` 이미 존재** — 타입 추가 불요. other-land 로컬 Ctx(185-189)에만 부재 → pasture식 직접 return.

**알고리즘 (other-land.ts)**:
```
resolveAreaLimit(o): hatchang→maxAnnualArea*1.2 / youth→youthCapacity*200 / garage→minGarageArea*1.5
                     / vacant_lot→660 / sports·parking_attached·reserve·resort→standardAreaLimit / else undefined
// 실행순서(R1): revenueTest(:95) → isNonComprehensive(:113) → relatedBusinessType(:145). 동시선택 시 revenueTest 우선.
areaLimit 정의 && landArea>areaLimit → computeAreaProportioning(landArea, areaLimit) + isBusiness=false
```
**R1: `computeAreaProportioning` 반환 `AreaProportioning`은 `buildingMultiplier:1` 포함(types.ts:346-352)** — anchor `toEqual({...,buildingMultiplier:1})`. utils 추출(pasture.ts:67 → utils/) 후 pasture·other-land 공용.
**R1 scope-out**: STEP 0.6(transfer-tax.ts:213-215) boolean-only 소비 → areaProportioning은 결과카드 표시만, 실제 면적안분 중과 미반영(5지목 공통 후속).

## 갭 3b — §83의5① 부득이 사유 12종 자동산정

**타입 (R1 Critical 정정)**: `GracePeriodInput`(store calc-wizard-asset-nbl.ts:26 + 엔진 form-mapper-helpers.ts:39, **2정의**)은 **pasture(:182)·villa(:186)·grace(:209) 3곳 공유** → **변형 금지**. 신규 `NblGracePeriodInput{reasonCode: GraceReasonCode(12종); anchorDate; endDate?; secondaryDate?; description}` 도입, `nblGracePeriods`만 교체. pasture/villa 불변.
- `GraceReasonCode` 12-union(types.ts:68-75 GracePeriodType 교체 또는 신규). `GracePeriod{reasonCode,startDate,endDate,isRealEstateDealerMatter?}`(secondary 필드는 intervals 2구간 분해로 불필요 — R1).

**케이스 매트릭스 (§83의5① 기산점·길이)**:
| 호 | 기산점 | 길이 |
|---|---|---|
| 5 | 취득일 + 착공일(2) | (취득+2년) ∪ (착공~건설진행종료) |
| 6 | 취득일 | +2년 |
| 8 | 건축가능일 | +2년 |
| 9 | 멸실일 | +5년 |
| 10 | 휴폐업일 | +2년 |
| 11 | 사유발생일 | +2년 |
| 1·2·3·7·12 | 개시일 | event_window(종료 입력) |
| 4 | 착공일 | ~제공종료일(입력) |
- 단서: 부동산매매업 매매용부동산 → 1·2호 배제(`nblBusinessIsRealEstateDealer`).
- **R1 누락 보완**: 시행령 §168의14①1~3호(법령 사용금지·보호구역·상속) 독립 grace — 12-union에 보존 reasonCode 필요.

**알고리즘**: 신규 `grace-reason-period.ts` `resolveGraceIntervals(reasonCode, anchorDate, endDateInput, secondaryDate, ctx{transferDate, acquisitionDate, isRealEstateDealerMatter})`: `DateInterval[]` 반환. **R1: ctx에 acquisitionDate 추가(5호), 함수명 resolveGraceIntervals 단일(resolveGraceEndDate 미정의)**. form-mapper.ts:72-80(`length>0 ? ... : []` 삼항) 교체: `p.reasonCode` 기반 intervals.map.

## 갭 3c — 목장 별표 1의3 인용정정 (E-1)

**변경 0 타입/로직** — 문자열 2곳: `livestock-standards.ts:4` 주석 + `pasture.ts:155` warning → "소득세법 시행령 별표 1의3(§168조의10③)". `LIVESTOCK_STANDARD_AREA` 8값 **동결**(numeric 불변). **E-2(per-head 정합)는 별표 1의3 정본 미확보 blocker → 분리**.

## 갭 3d — §168의6 소유기간 버킷별 판정

**타입**: 입력 변경 0. `PeriodCriteriaResult` optional echo `ownershipBucket?: 1|2|3` 검토(R1: criteria boolean 5년창 전제와 버킷 가목 의미 불일치 — 매핑표 필요).

**알고리즘 (period-criteria.ts:144-166 교체)**: `isBusiness = !(비사업용)`, 비사업용 = 버킷별 가·나·다 AND:
```
resolveOwnershipBucket(total): total>=FIVE_YEARS→1 / >=THREE_YEARS→2 / else 3
nonBiz5 = win5len - bizInLast5;  nonBiz3 = win3len - bizInLast3;  nonBizTotal = total - effectiveBusinessDays
nonBizRatioThreshold = 1 - thresholdRatio   // 0.4(현행)/0.8레거시→0.2
1호: 가=nonBiz5>730 ∧ 나=nonBiz3>365 ∧ 다=nonBizTotal>floor(total*0.4)
2호: 가=nonBizTotal>(total-THREE_YEARS) ∧ 나=nonBiz3>365 ∧ 다=(1호 다)
3호: 가=nonBizTotal>(total-TWO_YEARS) ∧ 나=nonBizTotal>floor(total*0.4);  단 total<TWO_YEARS → 가목 SKIP(나만)
```
**R1 일수환산 일관성**: 1호 가목=win5len−730(창연동)인데 2호/3호 가목=total−1095/730(고정). 법문 "소유기간에서 N년 차감"=소유기간 기준이라 고정 정당(§1 근거 못박음).
**R1 회귀(최대)**: 호출자 5종 = farmland·forest·pasture·other-land·**villa-land**(housing 제외). flip 테스트: period-criteria.test.ts:29-41 + qa-period-criteria QA-001/004/006 — §168의6 재계산 후 수정(무지성 flip 금지).

## 엔진 동기화 지점 요약 (갭별, ⑫⑬⑭ 침묵 strip 주의)

| 갭 | 신규 store 필드 | ⑫ Zod | ④⑬ prefix-pick | ⑭ 매핑 |
|---|---|---|---|---|
| 1 | 없음(재사용) | 기존 | 자동 | form-mapper landLocation + route 주입 |
| 2 | nblExemptInong·Date | 추가 필수 | 자동 | buildUnconditionalExemption |
| 3a | nblOther{RelatedBusinessType,StandardAreaLimit,MaxAnnualArea,YouthCapacity,MinGarageArea} | 추가 필수 | 자동 | buildOtherLand |
| 3b | nblGracePeriods(타입교체)·nblBusinessIsRealEstateDealer | 재정의+추가 | 자동 | form-mapper resolveGraceIntervals |
| 3c | 없음 | — | — | — |
| 3d | 없음 | — | — | — |

---

## STEP 6-9·10·13 설계 검토 결과 (자가검토 루프 마무리)

**설계 문서 spot-check (실측, STEP 6/13)**:
- `getThresholdRatio` 반환 0.6/oldThresholdRatio(period-criteria.ts:76·85·87) → 3d `1−thresholdRatio` 환산 유효 ✓
- `OtherLandDetailSection.tsx` 현행 ToggleCard+nblOther* 입력(:5·:40-79) → RadioCardGroup 교체 정확 ✓
- `GracePeriodSection.tsx` GRACE_TYPE_OPTIONS 7종(:16-23, `GracePeriodInput["type"]`) → 12종 확장·type→reasonCode 정확 ✓
- `NonBusinessLandResultCard` AreaBar가 `judgment.areaProportioning` 무조건 read(:12·90-98) → 3a other-land areaProportioning 자동 렌더 ✓ (주석 "(주택·목장)"은 조건 아님 — 데이터 있으면 표시)

**STEP 10 정합축 (계획 ↔ 설계)**:
| 정합 축 | 계획서 | 설계 | 판정 |
|---|---|---|---|
| 갭1 landLocation 매핑 시그니처 | gap-1 §5.A·R1 | 엔진 §갭1 | ✓ |
| 갭2 anyExempt 이중(Critical) | gap-2 R1·마스터 SR-11 | UI §갭2 | ✓ |
| 갭3a areaProportioning 타입 기존존재 | gap-3a R1 | 엔진 §3a(buildingMultiplier) | ✓ |
| 갭3b GracePeriodInput 변형금지→신규타입 | gap-3b R1·SR-12 | 엔진 §3b(NblGracePeriodInput) | ✓ |
| 갭3d 호출자 villa(housing제외) | gap-3d R1·마스터 §5 | 엔진 §3d 회귀 | ✓ |
| 일수환산 1호 창연동 vs 2·3호 고정 | gap-3d R1 | 엔진 §3d 근거 | ✓ |
| ⑫ Zod 침묵strip 자가점검 | 마스터 SR-3 | 엔진 동기화표 | ✓ |

**잔존 Critical/High**: 0 (R1에서 전부 정정 반영). 남은 항목은 전부 "확인 필요"(별표1의3 정본·§168의6 일수환산·연접 자리수)로 Do 단계 처리.

**13단계 완료**: 1-4(계획 검토×2+정정) → 5(엔진설계 생성) → 6-9(설계 검토×2+정정) → 10-11(통합비교+반영) → 12(UI설계 생성) → 13(UI 검토). 정정 누적 55건 + 설계 spot-check 4건. 성과기준(≥10건) 충족.
