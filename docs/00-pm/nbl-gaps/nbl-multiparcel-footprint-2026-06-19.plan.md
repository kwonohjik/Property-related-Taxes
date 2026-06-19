# NBL §168의11⑤⑥ 다필지·복합용도 + §101①2호나목 footprint 정밀안분 구현 계획서 (2026-06-19)

> 출처: `nbl-multiparcel-footprint-plan` 워크플로 — 법령(KoreanLaw 본문 실측) + 코드 모델 probe → 4 작업단위 설계 + R1 적대적 자가검토.
> 선행 PR#291(NBL 잔여 4갭)에서 SCOPE_OUT으로 분리한 항목. CLAUDE.md 검증 기준(추정 금지·file:line·법령 본문) 적용.

> **진행 상태 (2026-06-19):**
> - **A. footprint 정밀안분 ✅완료 (PR#293 merged `53df86c3`)**
> - **B. §168의11⑥ 복합용도 ✅완료** (구현·테스트 완료, ship 대기)
> - **C+D. §168의11⑤ 연접 다필지 ✅완료** — ★**계획서 C Option A 채택**(NBL 판정엔진 내부 area-attribution, multi-parcel-transfer.ts·rate-calc **무변경**·회귀0). 아래 D 섹션의 rate-calc 필지별 양도소득금액 분리 리팩터는 환지·§97②swap 회귀위험 + NblParcel 취득가액 미보유로 **SCOPE_OUT**(정직 문서화). §168의11⑤ 면적/필지 귀속 규칙은 area-ratio로 충실 구현, 기존 면적안분 중과경로(목장·호별·footprint·⑥)와 일관.
> - 잔여 SCOPE_OUT: ⑤ 필지별 양도소득금액 분리(non-uniform gain 정밀화)·⑤2호 footprint 차감범위·⑥vs① 중첩순서(유권해석).

## 0. 개요 — 사용자 요청 2갭 → 4 작업단위 분해

| 작업단위 | scope | 의존 | 독립성 |
|---|---|---|---|
| **A. §101①2호나목 footprint 정밀안분** | L | 없음 | 단일 필지 자족 (PR#291 ④ hasBuilding 후속) |
| **B. §168의11⑥ 복합용도 건축물 안분** | L | 없음 | 단일 자산 자족 (다필지 비의존) |
| **C. 다필지 입력 모델 신설** | L~XL | 없음(선행) | §168의11⑤ 전제 |
| **D. §168의11⑤ 연접 다필지 취득시기순 안분** | XL | C + rate-calc 리팩터 (+ ⑤2호는 A의 footprint 모델) | — |

### ⚠️ 핵심 통찰 (R1 검증)
- **A·B는 §168의11⑤ 다필지 모델과 무관**한 독립 L — 단일 `landArea` 스칼라에서 자족 구현. 먼저 착수 가능.
- **D의 진짜 XL 비용은 rate-calc `handleMultiParcelBranch`의 단일-taxBase 아키텍처 리팩터**(필지별 양도소득금액 분리 + 기본공제 비례 안분 + 필지별 +10%p 중과 합산). 입력 모델(C)보다 깊다.
- **D는 Phase 분리 강력 권고**: Phase 1 = ⑤1호(건축물 無, footprint 무의존) → Phase 2 = ⑤2호(건축물 有, A의 footprint 모델 완료 후).

### 권장 구현 순서
```
A (footprint, L) → B (⑥ 복합용도, L) → C+D-Phase1 (다필지 모델 + ⑤1호, XL) → D-Phase2 (⑤2호) → (⑥-⑤ 연계)
```
A·B는 PR 각 1개로 독립 머지. C+D는 별도 트랙(rate-calc 리팩터 회귀 위험 격리).

### 법령 본문 (KoreanLaw `get_law_text` 축자 검증)
| 조문 | verified | 핵심 |
|---|---|---|
| 소령 §168의11⑤ (MST 286211) | ✅ | 1호(건축물無): 가.취득시기 늦은 토지→나.동일시 거주자 선택 / 2호(건축물有): 가.**바닥면적·수평투영면적 제외** 토지 중 취득시기 늦은 토지→나.거주자 선택. **초과분 E=총면적 T−기준면적 S (1·2호 공통)**, 2호 footprint는 산식 아닌 **귀속 후보에서 제외**만 |
| 소령 §168의11⑥ (MST 286211) | ✅ | 1호(단일 건축물 복합용도): 부속토지면적등 × (특정용도분 **연면적**/건축물 연면적) / 2호(동일경계 다수 건축물): 전체 부속토지면적 × (특정용도분 **바닥면적**/전체 바닥면적). **1호=연면적비·2호=바닥면적비** |
| 지방세령 §101①2호나목+단서 (MST 286395) | ✅ | 2% 미달 시 "**그 건축물의 바닥면적을 제외한 부속토지**"만 별도합산 제외 → **바닥면적분(footprint)은 별도합산(사업용) 유지**. 단서=무허가·미사용승인 건축물 부속토지 전부 배제 |
| 지방세령 §101② 용도지역 배율 | ⚠️ 미확인 | 구 별표 2025.12.31 삭제→inline 표(MCP 미렌더). `other-land.ts:62` ZONE_AREA_MULTIPLIER 상수 존재(전용주거5·녹지7 등). **footprint carve-out(A)은 배율 미적용이라 무영향**, ⑤2호/일반 한도엔 정본 재확인 필요 |

---

## A. §101①2호나목 footprint 정밀안분 (scope L · 독립 · 권장 1순위)

### 현황
`isBareLand`(other-land.ts:45~53)의 2% 비교가 **boolean all-or-nothing**. hasBuilding=true ∧ 건물시가표준액 < 토지시가표준액×2% → isBareLand=true → effectiveTaxType `comprehensive` override(other-land.ts:245) → 거주·사업관련 미설정 시 buildFail → engine.ts:264 `ratio ?? 1`로 **전체 토지 +10%p 중과**.
→ §101①2호나목은 "바닥면적 제외 부속토지"만 종합합산이고 **바닥면적분(footprint)은 별도합산 유지**인데, 현 엔진은 footprint분까지 종합합산 → **법령초과 납세자 불리**.
- `OtherLandUsage.buildingFloorArea`(types.ts:241) dead(buildOtherLand set 안 함·엔진 read 0·폼 필드 없음). `VillaUsage.buildingFloorArea`(types.ts:200)와 동명이타입 — OtherLand 것만 dead.
- 부분안분 인프라(`computeAreaProportioning` `buildingMultiplier:1` + engine.ts:264 ratio 자동연결 + rate-calc 중과분 안분 + ResultCard AreaBar)는 이미 가동 → footprint도 동일 경로 자동 표시·세액 반영.

### 법령 산식 (verified)
2% 미달 시: **별도합산(사업용) 유지면적 = footprint** / 비사업용(종합합산) = `max(0, landArea − footprint)` / `nonBusinessRatio = round((landArea − footprint)/landArea, 4)`. 2% 이상이면 종전대로 전량 별도합산(현행 유지). `buildingMultiplier:1`(배율 미적용)이 나목 carve-out(바닥면적 자체)과 정확히 일치.

### ⚠️ R1 핵심 정정 — carve-out 진입 위치
원안의 "isNonComprehensive 분기 전 진입"은 **revenue test(§168의11②)·거주사업관련(§168의11① 호별) 우선 경로를 bypass** → 2% 미달이면서 수입금액비율·호별 기준면적을 충족하는 토지를 불리하게 carve-out 처리할 위험(법 근거 없는 불리 적용 — [[feedback_no_unfavorable_application_without_legal_basis]]).
→ **정정**: footprint carve-out은 `isRelated=false` ∧ revenueTest 미충족 경로(현 other-land.ts:381~391 buildFail 직전)에만 진입. anchor N7로 실증(2% 미달 + 수입금액비율 PASS → 전량 사업용, carve-out 미진입).

### 14지점
| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼상태 | `calc-wizard-asset-nbl-other.ts` | `nblOtherBuildingFloorArea: string` 추가(resort/villa 필드와 별도) |
| ②③ | `calc-wizard-asset-factory.ts` | makeDefaultAsset `''` + migrateAsset(:412) `undefined→''` |
| ④⑬⑭ | `non-business-land-request.ts` | **무변경**(prefix-pick 자동 운반) — 실질 ⑭는 buildOtherLand 매핑 |
| ⑤ UI | `OtherLandDetailSection.tsx` | hasBuilding ON 블록(:170~192) 토지가액 다음 '건축물 바닥면적(㎡)' DecimalInput. ★2% 안내 2곳(:476·:486)의 "비사업용으로 판정됩니다" → "바닥면적분 별도합산 유지·잔여만 비사업용"으로 정정 |
| ⑦ 결과 | `NonBusinessLandResultCard.tsx` | AreaBar 자동. ★캡션(:126) "기준면적 초과분" → "비사업용 면적분"으로 일반화(footprint는 기준면적 초과 아님) |
| ⑧ validate | `transfer-tax-validate-asset.ts` | **비차단**(미입력=전량 비사업용 보수처리, 자동안분 fallback 금지). footprint>landArea 모순만 선택 경고 |
| ⑫ Zod | `transfer-tax-schema-sub.ts` | `nblOtherBuildingFloorArea: z.string().optional()` |

### 구현 단계
1. `types.ts:241` 주석 활성화(바닥면적·배율 미적용·villa와 무관 명시)
2. **`other-land.ts` carve-out 분기** — isRelated=false·revenueTest 미충족 경로(:381~391 직전)에 삽입: `bareLand ∧ buildingFloorArea>0 ∧ <landArea` → `computeAreaProportioning(landArea, buildingFloorArea)`(businessArea=footprint=별도합산 유지) → `{isBusiness:false, areaProportioning}` + step `other_footprint_carveout`. footprint 미입력→종전 buildFail(ratio 1). footprint≥landArea→buildPass(미포함). ★isRelated=true 경로 미진입(호별 우선·이중 산출 금지)
3. `form-mapper-helpers.ts` buildOtherLand(:192~223)에 `buildingFloorArea: parseNumber(asString(a.nblOtherBuildingFloorArea))`
4. `calc-wizard-asset-nbl-other.ts` 슬라이스 필드 + ★`nblOtherHasBuilding` stale 주석 정정(2% 미달 시 comprehensive 강제)
5. factory initial + migrateAsset(:412)
6. Zod(⑫)
7. UI DecimalInput + 안내 2곳 보강
8. validate 비차단
9. anchor N1~N7

### anchor (Pre-Do)
- **N2 부분안분**: landArea 1000·building 5M<land 1B×2%·footprint 200·isRelated=false → `nonBusinessRatio=0.8`, step `other_footprint_carveout`
- **N3 미입력 회귀**: footprint 미입력 → ratio=1(전량, 자동안분 금지)
- **N4 2%이상 경계**: building 25M≥20M → isBusiness=true(별도합산, carve-out 미진입)
- **N5 footprint≥landArea**: 전량 사업용 buildPass(areaProportioning 미포함)
- **N7 revenue 우선(R1)**: 2% 미달 + 수입금액비율 PASS → 전량 사업용(carve-out 미진입) — 불리 적용 차단 실증
- **N6 통합 세액**: footprint 안분 ratio 0.8 → calculatedTax < 전량(중과분 80%만 +10%p)

### risk
- carve-out 진입 위치(R1) — isRelated·revenueTest 이후. N7 필수.
- 기존 `other-land.test.ts` base()가 buildingFloorArea:300·separate(2%↑) → isBareLand=false라 carve-out 미진입·회귀 0(확인 필요).
- ResultCard 캡션 일반화(numeric 무관 충실도).

---

## B. §168의11⑥ 복합용도 건축물 부속토지 안분 (scope L · 독립 · 권장 2순위)

### 현황
§168의11⑥ 전 경로 미구현. other-land는 §168의11① 호별 초과분만 안분(`buildingMultiplier:1` 하드코딩). 결과뷰·주석이 "⑤⑥ 미구현" 표기(PR#291에서 라벨 병기).

### 법령 산식 (verified)
- **⑥1호**(단일 건축물 복합용도): 부속토지면적등 × (특정용도분 **연면적** / 건축물 연면적)
- **⑥2호**(동일경계 다수 건축물): 전체 부속토지면적 × (특정용도분 **바닥면적** / 전체 바닥면적)
- 양 호 공통: `ratio = 분자/분모` → `businessArea(특정용도분) = landArea × ratio`, `nonBusinessRatio = round((landArea−businessArea)/landArea, 4)`. landArea 단일 스칼라에 ratio 적용(중립 안분).

### dataModel (★명명 — `mixedUseBuilding` 접두로 `transfer.types.ts` 겸용주택 `mixedUse`와 구분)
- `OtherLandUsage`에 `mixedUseBuildingMode?: 'single_building'|'multiple_buildings'` + `specificUseFloorArea?`·`totalFloorArea?`(⑥1호 연면적) + `specificUseFootprint?`·`totalFootprint?`(⑥2호 바닥면적)
- `AreaProportioning`에 echo `mixedUseBuildingRatio?`·`mixedUseApportionedArea?`(optional — 기존 ①·housing 무영향)
- `NblOtherFormSlice`에 폼 5필드(mode + 면적 4종, string)

### 14지점
| 지점 | 파일 | 변경 |
|---|---|---|
| ①②③ | store 3파일 | 5필드 + ★normalize는 mode discriminator 1건 필수(나머지 선택) |
| ④ | `form-mapper-helpers.ts` | buildOtherLand에 5필드 매핑 |
| ⑤ UI | `OtherLandDetailSection.tsx` | hasBuilding ON 게이트(⑥ 건축물 존재 요건) 하에 복합용도 카드(violet) — RadioCardGroup(미적용/1호/2호) + 모드별 DecimalInput 2개 |
| ⑦ | `NonBusinessLandResultCard.tsx` + 주석 3곳 | "⑥ 미지원" 삭제(⑤만 잔존) + 특정용도분 부속토지 행 |
| ⑧ validate | `transfer-tax-validate-asset.ts` | mode 선택 시 분모·분자>0 ∧ 분자≤분모 차단(자동 fallback 금지) |
| ⑫ Zod | `transfer-tax-schema-sub.ts` | 5필드 optional (★z.object strip — 미추가 시 침묵 strip) |

### 구현 단계 (요약)
1. 법령 상수 `legal-codes/transfer.ts`: `OTHER_LAND_MIXED_USE_FLOOR`(⑥1호)·`OTHER_LAND_MIXED_USE_FOOTPRINT`(⑥2호)
2. types 확장(OtherLandUsage 5필드 + AreaProportioning echo 2)
3. **신규 `computeMixedUseProportioning(landArea, 분자, 분모)`**(area-proportioning.ts, 분자>분모 클램프 금지)
4. **other-land.ts ⑥ 분기** — ① 호별과 동일 구조, isRelated 경로 r.meets 충족 후 mode 설정 시 ① areaLimit 대신 ⑥ 산출. ★**⑥ 단독**(mode 선택 시 ① 미적용 — 이중차감 방지)
5. 주석 3곳(engine.ts:263·transfer.types.ts:135·types.ts:482) ⑥ 미구현 제거
6~10. buildOtherLand·슬라이스·factory·Zod·UI·validate
11. anchor (⑥1호 연면적비·⑥2호 바닥면적비·분자=분모 전량사업용·mode='' 회귀·분자>분모 차단)

### anchor (Pre-Do)
- **⑥1호**: mode=single_building, specificFloor 300/totalFloor 1000, landArea 2000 → ratio 0.3, businessArea 600, nonBusinessRatio 0.7
- **⑥2호**: mode=multiple_buildings, specificFootprint 150/totalFootprint 500, landArea 1000 → ratio 0.3, nonBusinessRatio 0.7
- **분자=분모**: ratio 1.0 → 전량 사업용 buildPass
- **mode=''**: 기존 ① 호별 경로 회귀 0
- **분자>분모**: validate 차단(엔진 클램프 금지)

### risk / openQuestion
- **⑥ vs ① 중첩 순서** 법문 명시 없음 → 보수적 ⑥ 단독. 유권해석 확인 권장.
- ⑥1호 "부속토지면적등"(바닥면적 포함) vs ⑥2호 "부속토지면적"(제외) 모수 차이 — landArea 단일 스칼라라 양 호 공통 ratio 적용. 미세 차이 가능, 유권해석 권장.
- "특정용도분"을 곧바로 사업용 등치 vs 기간기준 통과 후 — ① 호별과 동일하게 r.meets 충족 후 ⑥ 진입.

---

## C. 다필지 입력 모델 신설 (scope L~XL · §168의11⑤ 선행)

### 현황 — 두 '다필지' 개념이 NBL과 0건 연동
1. `multi-parcel-transfer.ts`(양도차익 분리 엔진): `ParcelInput`(:30~86)에 지목·용도지역·재산세유형·기준면적 NBL 입력 **전무**. `NonBusinessLand` 참조 grep 0건. `handleMultiParcelBranch`(rate-calc:434)가 calcTax에 NBL ratio 전달 안 함.
2. NBL 입력은 자산당 **단일 landArea 스칼라**(form-mapper.ts:67).

### ⚠️ 옵션 A 채택 (R1 유지)
**NBL 기타토지에 필지 배열 신설, `multi-parcel-transfer.ts`(양도차익 엔진)는 무변경.** 옵션 B(기존 multi-parcel을 NBL 연동)는 환지·감환지·§97② swap 안정 경로에 회귀 위험 직접 부과 → 기각.

### dataModel
- 엔진 `NblParcel { id; landArea:number; acquisitionDate:Date; hasBuilding:boolean; buildingFootprintArea?:number }`. `OtherLandUsage.parcels?: NblParcel[]`(undefined=OFF, 3-state)
- store `NblParcelFormItem { id; landArea:string; acquisitionDate:string; hasBuilding:boolean; buildingFootprintArea:string }`(★전부 string — 기존 nbl 배열 동형). `NblOtherFormSlice`에 `nblOtherUseParcels:boolean` + `nblOtherParcels:NblParcelFormItem[]`

### ⚠️ R1 잘못된 동기화 지점 3건 회피
- **② initial**: dead `NBL_DEFAULTS`(참조 0건) **아님** → `makeDefaultAsset`(factory:227~237 리터럴)
- **③ normalize**: `calc-wizard-migration.ts` **아님** → `migrateAsset`(factory:412 가드군) `if undefined`
- **④⑬**: `transfer-tax-api.ts` **아님** → `non-business-land-request.ts` prefix-pick(:64~66) **자동 운반**(명시 추가 불요)
- **⑫ Zod**: `nblParcelRawSchema`는 **z.string() 필드**(z.number()/z.string().date() 금지 — 정상 payload 거부됨). superRefine(hasBuilding 시 footprint 필수)
- 배열 항목 **id 필요**(기존 nbl 배열은 id 없음) — UI onAdd `crypto.randomUUID()`

### 14지점·구현 — 요약(상세 워크플로 결과 참조)
①`calc-wizard-asset-nbl-other.ts` ②③`factory`(makeDefaultAsset·migrateAsset) ④`non-business-land-request.ts`(자동) ⑤`OtherLandDetailSection.tsx`(반복 입력 — ★800줄 초과 위험 → `OtherLandParcelSection.tsx` 분리) ⑧`transfer-tax-validate-asset.ts`(★788줄 → `validate-nbl-other.ts` 분리) ⑫`transfer-tax-schema-sub.ts`(string Zod+superRefine) ⑭`form-mapper-helpers.ts` buildOtherLand에 parcels 매핑(parseDate 인자 추가) + `form-mapper.ts:142` 호출부 parseDate 전달

### anchor
- **A1 단일 경로 회귀**: parcels 미제공 → 기존 단일 landArea 동작 불변
- **A4 wire+Date**: parcels[].acquisitionDate → `input.otherLand.parcels[0].acquisitionDate instanceof Date`(toOptionalDate, string<Date 함정 회피)
- **A5 Zod superRefine**: hasBuilding 시 footprint 필수 차단

### risk
- 800줄 정책 2건 실측 위반 위험: `transfer-tax-validate-asset.ts`(788줄)·`OtherLandDetailSection.tsx`(495줄) → 분리 사전 포함
- 두 '다필지'(양도차익 parcels vs NBL nblOtherParcels) 혼동 — 별개 배열, 동시 활성 정합 검증 필요

---

## D. §168의11⑤ 연접 다필지 취득시기순 안분 (scope XL · C 의존 · Phase 분리)

### 현황 — 취득시기순 귀속 산식 전무
`computeAreaProportioning`은 단일 필지 2인자. `handleMultiParcelBranch`는 **mpTaxBase=Σincome을 단일 calcTax 1회**(rate-calc:476~481) → 필지별 ratio 중과 경로 자체 없음.

### 법령 산식 (verified · R1 확정)
- **초과분 E = 총면적 T − 기준면적 S**(1·2호 공통). 2호 footprint는 산식 아닌 **귀속 후보 풀에서 제외**.
- **1호**(건축물無): 후보=전체 필지, 취득시기 늦은 필지부터 E 귀속(전부 또는 일부)
- **2호**(건축물有): 후보=`Σ max(0, area−footprintArea)`(footprint분 사업용 유지), 그 중 취득시기 늦은 필지부터. ★`E > Σcandidate` 경계 시 `min(E, Σcandidate)` 클램프 + warning
- 기준면적 S = §168의11① 호별 기준면적(`resolveAreaLimit` 재사용) 또는 건축물 부속토지=footprint×§101② 배율
- 나목 tie-break: 취득시기 동일 시 거주자 선택(`selectedParcelOrderForTie`, fallback 입력순=중립)

### ⚠️ R1 — 진짜 XL 비용은 rate-calc 리팩터
`handleMultiParcelBranch`(rate-calc:476~480)가 단일 calcTax 구조 → **필지별 양도소득금액 분리 + 기본공제 비례 안분 + 필지별 +10%p 중과 합산** 리팩터 필요. `contiguousNblBundles` 미제공 시 기존 단일 경로 **완전 보존**(회귀 0 anchor 필수).

### ⚠️ R1 — Phase 분리 강력 권고
- **Phase 1 (L~XL)**: ⑤1호(건축물無·footprint 무의존) 단독 완결 + 다필지 입력(C) + rate-calc 리팩터. anchor 1·2·5·6
- **Phase 2**: ⑤2호(건축물有) — A(footprint 모델) 완료 후. anchor 3·4
- **Phase 3**: ⑥-⑤ 연계(다수 건축물 자동 합산)

### dataModel·14지점 — 요약
- `ParcelInput`(multi-parcel-transfer.ts) NBL 필드 optional 확장(미제공=기존 동작 100% 보존)
- `MultiParcelInput.contiguousNblBundles?` + `MultiParcelResult.contiguousNblDetail?`(★Map 금지 — Record/array, [[feedback_engine_result_map_json_loss]])
- 신규 `computeContiguousParcelNblAttribution(bundle)`(utils/contiguous-parcel-proportioning.ts, Record 반환, 마지막 필지 잔액 흡수 [[feedback_floor_residual_absorption]])
- ★⑨⑩: `contiguousNblBundles`를 **propertyBaseShape 단일 추가**(parcels와 같은 위치, schema.ts:86) → 단건·다건 동시(companion·addPropertyRefines 전파 불요)
- ★④⑬: `transfer-tax-api.ts:518` parcels.map은 **명시 필드 열거(스프레드 아님)** → 신규 nbl 필드 명시 추가([[feedback_explicit_prop_mapping_strip]])
- ★⑭: route parcels는 `...p` 스프레드 OK, `contiguousNblBundles.parcelNblRefs[].acquisitionDate`만 Date 변환

### anchor (Pre-Do — Step 5 리팩터 전 회귀 baseline 우선)
- **⑤1호 단독 귀속**: bundle{no_building, S 1000, [A 800/2010, B 400/2018]} → E 200, B에 귀속 nonBusinessRatio 0.5
- **⑤1호 잔액 흡수**: S 600, [A 800/2010, B 400/2018] → B 전체 400 + A 200(0.25)
- **⑤2호 footprint 제외**: has_building, S 500, [A 600/2010/fp200, B 300/2018/fp100] → E=T−S=400, 후보=400+200=600, B에 귀속
- **⑤2호 경계 클램프**: footprint 합>후보 → min + warning
- **나목 tie-break**: 동일 취득시기 → selectedParcelOrderForTie
- **회귀 baseline**: contiguousNblBundles 미제공 → 기존 다필지 세액 완전 동일

### risk
- Step 5 rate-calc 리팩터 = XL 핵심(필지별 세액 분리·기본공제 안분)
- ⑤2호는 A(footprint 모델) 의존 → Phase 2
- '연접'·'일괄용도'는 사실판단 → 사용자 묶음 토글(`nblBundleId`) 위임(자동 묶음 금지)
- 양도차익 parcels vs NBL bundle 면적 dual-truth → parcelId 참조 권장

---

## E. 미해결 결정사항 (착수 전 사용자/유권해석 확정)
| # | 작업단위 | 결정 |
|---|---|---|
| Q1 | B | ⑥ vs ① 호별 적용 순서·중첩 (보수적 ⑥ 단독 권장) — 유권해석 |
| Q2 | B | ⑥1호 "부속토지면적등"(바닥면적 포함) 안분 모수 해석 — 유권해석 |
| Q3 | A·D | §101② 용도지역 배율 정본값(법제처 HWP/PDF 축자) — A는 무영향, ⑤2호/일반 한도 필요 |
| Q4 | D | ⑤ scope 끊기: Phase 1(⑤1호)만 vs ⑤2호까지 (Phase 1 권장) |
| Q5 | D | ⑤2호가목 footprint를 어느 필지에서 차감(건물 필지만 vs 전체) — 유권해석 |
| Q6 | C·D | 양도차익 parcels ↔ NBL bundle 동시 활성 UI/validate 정책 |
| Q7 | A | ResultCard 캡션 일반화 범위 (numeric 무관 충실도) |

---

## F. 공통 (전 작업단위)
- Pre-Do anchor 우선([[feedback_pre_anchor_verification]]) — 특히 D는 Step 5 리팩터 전 회귀 baseline 1건 실패 확보.
- 800줄 정책: C·D 진입 시 `transfer-tax-validate-asset.ts`·`OtherLandDetailSection.tsx` 분리 사전 포함.
- 회귀: 커밋/PR 전 전체 `npm test`. 차단 validation 추가 시(B) 전세목 E2E([[feedback_blocking_validation_full_e2e_regression]]).
- 결과 노출 타입 Record/array(Map 금지). 필지 floor 안분 잔액 흡수.
- 납세자 유불리 표현 금지 — A carve-out 미입력 보수처리·D tie-break 입력순은 **중립**(법 근거 없는 불리 아님).
