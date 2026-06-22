# 건물 기준시가 — 조정률 보완 + NTS 계산서 서식 버그·확장 + 이력연동 + 통나무조 정합 수정 계획서

> 트리거(사용자 점검, 이미지 13~16):
> - **WS-1** 개별건물 특성 조정률 모달: 슬래브 생략·라벨 과도 축약 → 라벨 항목 확대 + 연면적 read-only(방식 a) + 최고층수 비가시·115.5% 검증.
> - **WS-2** NTS 「건물 기준시가 계산서」 서식(이미지 16) 빈칸: **연면적·층별 면적⑨·조정률(번호)** 미표시.
> - **WS-3** 양도·상속·증여 **결과탭**에서 NTS 서식 출력 — **3세목 동시**.
> - **WS-4** **이력(IndexedDB)에서 불러온 계산도** 결과탭 서식 표시.
> - **WS-5** 원본 II 비고 "통나무조 최고층수 적용 제외" 엔진 정합(법령 정확성).
> 출처: 국세청 「상속세 및 증여세법상 건물평가시 적용할 조정률」(별지 9, 이미지 13~14) · 「건물 기준시가 계산서」 서식(이미지 16). 작성일 2026-06-23.

---

## 공통 원칙

- WS-1·WS-3은 **표시 전용**(엔진 무변경), WS-2는 엔진 **echo 필드**(계산 무관), WS-4는 **스토리지 영속화**(표시 데이터), WS-5는 **법령정합 산식 수정**(통나무조 한정 계산 변경 — anchor 필수).
- 지수·max 규칙·번호 매핑은 WS-5(통나무조 제외) 외에는 **변경 금지**. `echo-field-pattern`·`single-source-engine-helper` 준수.

---

# WS-1. 개별건물 특성 조정률 모달 보완 (표시 전용)

## 1.1 진단

| 이슈 | 근거(file:line) | 판정 |
|---|---|---|
| 슬래브 생략 | `AdjustmentRateModal.tsx:199` `"슬레이트·기와 등"` · `special-adjustment-rate.ts:29` 주석에 슬래브 없음. 원본 번호1 첫 재료 "슬래브"(이미지13) | 라벨·주석 버그 |
| 연면적 UI 부재 | `building-standard-price.types.ts:41` "연면적 별도 필드 없음 — floorArea 재사용" / 모달 표시 0 | 표시 누락 |
| 최고층수 "반영 안 됨" | `selectSpecialAdjustment:527-544` II=`pickMax` 1개(원본 비고) → 연면적110>최고층수90 드롭 | max 규칙 정상(투명성) |

파이프라인(`BuildingStdPriceForm.tsx:707-720`→`building-std-price-form.ts:309-350`→`building-standard-price.ts:212-263`) `floorArea`·`maxFloors`·`specialFeatures` 전달 정상.

## 1.2 「115.5%」 검증

이미지15(주거용 OFF·최고층수4(90)·상가2층(105)) → `1.155 = 110×105/100²`, 110=연면적 5천~1만㎡(번호11). `II=max(90,110)=110` → **max 규칙상 정상, 버그 아님**. 연면적 비가시가 원인. ⚠️ Pre-Do anchor로 실측 확정.

## 1.3 수정

- **[A] 지붕 라벨 확대**(지시 "더 많은 항목 노출"): 번호1 `"슬래브·기와·아스팔트싱글·징크 등 (100)"` / 번호2 `"패널·유리·슬레이트 등 (80)"` / 번호3 `"함석·자연석·천막·초가 등 (60)"`. `special-adjustment-rate.ts:29` 주석 + `ADJUSTMENT_FEATURE_LABEL[1]`(:116) 슬래브. 지수·번호 불변.
- **[B] II 연면적 read-only 자동표시**(방식 a): "II 최고층수" 아래 `floorArea`→구간·지수(`"6,000㎡ → 5천~1만㎡(지수110) 자동"`). 주거용 ON="미적용", floorArea≤0 안내. 신규 입력필드 없음.
- **[C] 미리보기 적용내역**: `:298-301` `예상 조정률 115.5%`에 `"연면적 5천~1만㎡(110) × 상가 2층(105)"` 내역 + II "가장 높은 지수 1개" 안내. **반드시 엔진 `describeSpecialAdjustment`(export `:613`)/`selectSpecialAdjustment`(export 후) 재사용 — UI에서 선택 규칙 재구현 금지**(memory `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper`).

## 1.4 파일

`AdjustmentRateModal.tsx`(라벨·연면적행·breakdown) · `special-adjustment-rate.ts`(주석·라벨). 신규 엔진 필드 0.

---

# WS-2. NTS 서식 빈칸 버그 (echo 전용)

## 2.1 근본원인 (확정)

NTS 어댑터(`nts-report-adapter.ts`)는 세 칸을 엔진 breakdown echo에서 취함: 면적⑨←`b.floorArea`(:134) / 연면적←`Σb.floorArea`(:164,251) / 조정률(번호)←`b.adjustmentItems`(:132).
그러나 **`calcPointBreakdown`(`building-standard-price-helpers.ts:164-182`) 반환에 `floorArea`·`adjustmentItems` 없음**. 복합은 `:304` 수동부착 정상 / **단일 상증**(`building-standard-price.ts:258-279`)은 `applyNotes.adjustment`만 채우고 미부착 → 이미지16(단일 라멘조) 세 칸 빈칸.

## 2.2 수정 (계산 무변경)

1. `calcPointBreakdown` 반환에 **`floorArea`**(파라미터 기보유) 추가 → 단일 상증·양도 모든 경로 면적⑨·연면적 해결(복합 중복 set 무해).
2. 단일 상증(`:269-277`)에 `selectSpecialAdjustment` 결과를 **`valuation.adjustmentItems`**로 부착 → 조정률(번호). `AdjustmentSelection{nos,rate}`≡`adjustmentItems` 원소. `selectSpecialAdjustment` export(현재 미export 확정 `:512`).

> ✅ 동일 echo 누락이 **두 표면**에 영향: NTS 서식 + `BuildingStdPriceAdvancedResult.tsx:51`(`{b.floorArea ?? ""}`). WS-2 한 번 수정으로 둘 다 채워짐 — 근본이 엔진 echo임의 방증.
> ✅ 회귀 안전(실측): 기존 `floorArea`·`adjustmentItems` 단정(`nts-cases.test.ts:181,184,205`·`nts-report-cases.test.ts:177`)은 전부 **복합 경로**(이미 부착). 단일 상증 케이스(`:82,99`)는 `residualRate`·`pricePerM2`·`standardPrice`만 단정 → echo 추가 무영향. 단 `npm test` 전체로 `toEqual` 류 미발견 확인.

## 2.3 파일

`building-standard-price-helpers.ts`(`calcPointBreakdown` floorArea·`selectSpecialAdjustment` export) · `building-standard-price.ts`(단일 상증 adjustmentItems).

---

# WS-3. 양도·상속·증여 결과탭 NTS 서식 출력 (3세목 동시)

## 3.1 현황

세목 엔진은 `calcBuildingStandardPrice` 미호출(기준시가 직접입력). 단 계산은 **임베디드 모달 `BuildingStdPriceModalButton`**에서 수행(양도 `GeneralBuildingBlock`·`CommercialBuildingBlock` / 상증 `EstateBodySupplementaryValuation`). `onApply`는 `standardPrice` 숫자만 추출(`:58-65,104`), 나머지 폐기. **단, 폼 입력 전체를 `useBuildingStdSnapshotStore`에 키별 저장**(`:53,60`, sessionStorage). 키 `bsp-estate-${id}`/`bsp-${assetId}-{gb|cb}-{acq|transfer}`.

## 3.2 설계 — 스냅샷 재유도 (엔진/API 무변경)

```
key 구성 → snap = snapshots[key] (있을 때만)
result = calcBuildingStandardPrice(toEngineInput(snap))
model  = buildNtsReportModel(buildNtsReportContext(snap), result)
<NtsBuildingStdPriceReport model={model} />
```
`toEngineInput`·`buildNtsReportContext`·`buildNtsReportModel` 순수함수 재사용(`BuildingStdPriceForm.handleCalc` 동일 경로). **WS-2 선행** 시 칸 채워짐.

## 3.3 작업 (3세목 동시)

1. **결과뷰 렌더**: 자산/재산별 스냅샷 존재 시 재유도→`NtsBuildingStdPriceReport`.
   - 양도 `results/TransferTaxResultView.tsx` / 상속 `results/InheritanceTaxResultView.tsx` / 증여 결과뷰(+`GiftValuationBasisCard`·`General/CommercialBuildingValuationDetailCard` 인접).
2. **선택 출력 등록**(memory `project_selective_print_6tax_series`): `lib/print/{transfer,inheritance,gift}-print-sections.ts`의 `TRANSFER_PRINT_SECTIONS`(`TransferTaxResultView.tsx:37`)·`INHERITANCE_PRINT_SECTIONS`(`:35`)·`GIFT_PRINT_SECTIONS`(`GiftTaxResultView.tsx:49`)에 "건물 기준시가 계산서" + `availablePrintIds` 조건(스냅샷 존재). 3세목 상수·소비 위치 모두 실측 확인됨.
3. **PDF 채널**: `ResultPdfDocument`에 서식 포함(`print-only-css-toggle`).
4. **zustand selector 무한루프 회피**: 스냅샷 조회는 `useMemo`/atomic(memory `feedback_zustand_selector`).

## 3.4 주의

자산 다건=자산별 1서식 / 복합건물=`compositeBreakdowns`(어댑터 기처리) / 스냅샷 미존재 자산=graceful 미표시.

---

# WS-4. 이력 복원 시 서식 표시 (스냅샷 영속화)

## 4.1 현황

`useBuildingStdSnapshotStore`는 **sessionStorage 전용** → 이력(IndexedDB) 복원 시 스냅샷 소실 → WS-3 재유도 불가. `CalculationRecord`(`lib/storage/types.ts:58-99`)에 미포함.

## 4.2 설계 — 스냅샷을 이력 레코드에 동반 저장·복원

1. **타입**(`types.ts`): `CalculationRecord`에 `buildingStdSnapshots?: Record<string, BuildingStdPriceFormState>` 추가. plain(string/number/boolean/nested) → `stableStringify` 안전(`content-hash.ts`).
2. **저장**(`use-auto-save-calculation.ts:42-96`): 저장 직전 `useBuildingStdSnapshotStore.getState().snapshots`에서 **현재 계산 자산/재산 id 관련 키만** 필터링해 레코드에 첨부.
   - ⚠️ **3세목 전부 커버**(실측 적발 — 에이전트 샘플이 transfer·inheritance만, **gift 누락**): 키 경로 — 양도 `bsp-${asset.assetId}-{gb|cb}-{acq|transfer}`(`assets[].assetId`) / 상속 `bsp-estate-${item.id}`(`estateItems[].id`) / **증여 `bsp-estate-${item.id}`**(gift도 `EstateBodySupplementaryValuation` 공유 확정 — gift inputData의 estate item id 경로 Design서 확정).
   - ⚠️ **저장 스키마 strip 방지**(14지점 ⑫⑬⑭ 유사): `saveOrUpdateByBusinessKey`/Server Action(`actions/calculations.ts`)에 payload Zod·타입이 있으면 `buildingStdSnapshots`가 침묵 strip될 수 있음 → 저장 입력 타입(`CalculationSaveInput`)·검증 스키마에 신규 필드 도달 경로 확인.
   - ⚠️ **contentHash/inputHash 오염 금지**(memory `project_calc_history_dedup_id_normalization`): `buildingStdSnapshots`는 해시 산정에서 **제외**(보조 표시 데이터 — dedup 키 불변).
3. **복원**(`app/history/HistoryClient.tsx:handleResume:204-249`): 세목 분기 진입 전 `record.buildingStdSnapshots` 있으면 `useBuildingStdSnapshotStore.setState({snapshots:{...prev,...record.buildingStdSnapshots}})` re-hydrate. (양도=zustand·상증=sessionStorage 복원과 독립 — 공통 1줄.)
4. **Dexie**: `buildingStdSnapshots`는 **비색인 필드 → 스키마 version bump 불필요**(Dexie는 객체 전체 저장, 색인 변경 시만 버전 필요). v7 마이그레이션 생략 가능(추가 시 무해 upgrade).

## 4.3 파일

`lib/storage/types.ts` · `lib/storage/use-auto-save-calculation.ts` · `app/history/HistoryClient.tsx` (· `calculation-repository.ts` SaveInput 타입 — `BuildingStdPriceFormState` export 확인).

## 4.4 주의

저장 시 `Date.now()` 등 휘발 id가 스냅샷 키에 없는지 확인(키는 영속 assetId/estate id 기반 ✓). resultData 직렬화 제약(Date·Map)은 스냅샷이 plain이라 무관.

---

# WS-5. 통나무조 최고층수 적용 제외 (법령정합 — 계산 변경)

## 5.1 진단

원본 II 최고층수 비고(이미지13): **"건물구조가 통나무조인 것은 적용 제외"**. 현재 `selectSpecialAdjustment:529`는 `maxFloors!==undefined && (!isResidential||isApartment)`만 검사 — **통나무조 제외 없음** → 통나무조(구조지수≥100, 별개 II 항목이라 무관하게 적용됨)에 최고층수 조정 오적용 가능.
통나무조 구조키 = **`solid_wood`**(확정: `structure-group-map.ts:41` `label:"통나무조"`).

## 5.2 수정

- `AdjustmentContext`(ctx)에 `structureKey?: string` 추가(시그니처 안정 — 기존 `{isResidential,isApartment}`에 1필드).
- `selectSpecialAdjustment` II 최고층수 push 조건에 `ctx.structureKey !== "solid_wood"` 추가(정확 비교 — memory `enum-substring-match-forbidden`).
- 호출부 ctx에 structureKey 주입: 엔진 `computeAdjustmentRate`(`building-standard-price.ts:222`) = `point.structureKey` ✓ / 모달 미리보기(`AdjustmentRateModal.tsx:135`) = 신규 prop `structureKey`(폼 `f.valStructureKey`, `BuildingStdPriceForm.tsx`에서 전달).
- `describeSpecialAdjustment`도 동일 ctx → 자동 추종.

## 5.3 파일·anchor

`building-standard-price-helpers.ts`(ctx+조건) · `AdjustmentRateModal.tsx`+`BuildingStdPriceForm.tsx`(structureKey prop).
anchor: 통나무조+최고층수21층 → 최고층수 미적용(연면적/지능형만 II 후보) · 비통나무조 동일입력 → 적용.
> ✅ **기존 회귀 0 실측 확정**: solid_wood 기존 테스트(`nts-cases.test.ts:82,99`·`nts-cases-2023.test.ts:149,171`)는 `specialFeatures:{houseTypeTier:17}`(III)만 사용 — maxFloors 없음 / maxFloors 테스트(`anchor.test.ts:88,107`·`nts-cases.test.ts:35~47`·`nts-cases-2023.test.ts:199`)는 전부 rc·wood_frame·steel_frame·steel_pipe·cement_block — **solid_wood 없음**. → WS-5가 깨는 기존 anchor 0건. 신규 anchor만 추가.

---

## 6. 작업 순서 & 게이트

```
A. 엔진(독립·anchor 우선): WS-2(echo) + WS-5(통나무조)   → vitest building-standard-price/ 회귀 0
B. WS-1(조정률 모달 표시)                                 → 라벨·연면적·breakdown
C. WS-3(결과탭 서식, 3세목 동시) — WS-2 선행 필요          → 재유도 렌더 + 선택출력 + PDF
D. WS-4(이력 영속화·복원 re-hydrate)                      → 저장·복원 + 해시 제외
E. tsc 0 / vitest 전체 통과 / Playwright E2E:
   - 이미지16 재현(상속 단일): 면적⑨·연면적·조정률(번호) 채워짐(WS-2)
   - 양도·상속·증여 결과탭 서식 출력(WS-3)
   - 계산→이력저장→불러오기→결과탭 서식 재표시(WS-4)
   - 통나무조 최고층수 미적용(WS-5)
```

**완료 기준**: ① 슬래브·연면적·적용내역 가시(WS-1) ② 서식 3칸 채움(WS-2) ③ 3세목 결과탭 서식 출력(WS-3) ④ 이력 복원 후에도 서식 표시(WS-4) ⑤ 통나무조 최고층수 제외(WS-5). WS-5 외 엔진 산식·지수·max 규칙 무변경.

## 7. Pre-Do anchor 우선(메모리 `feedback_pre_anchor_verification`)

WS-2 빈칸 실증 / WS-1 115.5%=1.155 / WS-5 통나무조 제외 — 3건 먼저 작성·실패확보 후 구현.

---

## 8. 13단계 자가검토 결과 (plan-design-self-review-loop · 실측 반영)

규모 판정 = **중**(여러 파일·UI/스토리지 — **엔진 public Input/Result 신규 필드 0**: WS-2 echo는 기존 optional 필드 `BuildingStdPriceBreakdown.floorArea`/`adjustmentItems` 채움, WS-5 ctx·WS-4 storage는 비-API). → STEP 1~4 + 통합비교(10). STEP 5·12(신규 design 문서 생성) **N/A** — 기능 기존 design 문서 보유(`building-standard-price.engine.design.md`·`-nts-report.{engine,ui}.design.md`)·신규 API 필드 없음.

### STEP 0 policy-check (반영 정책)
`feedback_ui_engine_dual_truth_avoidance`(WS-1 C 엔진 재사용)·`feedback_engine_result_map_json_loss`(서식 모델 plain — Record 확인)·`project_calc_history_dedup_id_normalization`(WS-4 해시 제외)·`feedback_zustand_selector`(WS-3 useMemo)·`echo-field-pattern`(WS-2)·`enum-substring-match-forbidden`(WS-5 정확비교)·`feedback_api_zod_schema_sync`(WS-4 저장 strip).

### STEP 1~4 검토 표 (실측 후 정정)
| # | 카테고리 | 우선 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 1 | 누락 | High | WS-4 §4.2 | 저장 추출이 **gift 누락**(transfer·inheritance만) | 3세목 키 경로 명시·gift `bsp-estate-${id}` 추가 ✅ |
| 2 | 정책위반 | High | WS-4 §4.2 | 저장 Server Action/타입 Zod가 `buildingStdSnapshots` 침묵 strip 위험(14지점 ⑫⑬⑭ 유사) | `CalculationSaveInput`·검증 스키마 도달 확인 추가 ✅ |
| 3 | 오류 | Medium | WS-3 §3.3 | print sections 위치 모호(컴포넌트 추정) | `lib/print/{tax}-print-sections.ts` 실측·3세목 상수·소비위치 명시 ✅ |
| 4 | 정책위반 | Medium | WS-1 [C] | breakdown UI 재구현 시 dual-truth | 엔진 `describe/selectSpecialAdjustment` 재사용 강제 명시 ✅ |
| 5 | 누락(회귀) | High | WS-5 | "기존 회귀 0" 미실증(추정) | solid_wood↔maxFloors 비결합 실측·회귀 0 확정 명시 ✅ |
| 6 | 누락(회귀) | Medium | WS-2 | 단일 상증 echo 추가 회귀 미실증 | 기존 단정=복합 only·단일=pricePerM2/standardPrice only 실측 명시 ✅ |
| 7 | 개선 | Low | WS-2 | 동일 버그가 `BuildingStdPriceAdvancedResult.tsx:51`도 영향 미기재 | 두 표면 동시 수정 명시 ✅ |

### STEP 3 재검토 (1회차 정정의 파급)
- 정정#1(gift 추가)→ WS-3 §3.3 gift 결과뷰 렌더도 3세목 동시에 이미 포함(정합 ✓). gift inputData estate id 경로는 Design 단계 확정 항목으로 잔류(추정 금지).
- 정정#2(저장 strip)→ WS-4 §4.3 파일 목록에 `calculation-repository.ts` SaveInput 이미 포함(정합 ✓).

### STEP 10 통합 비교 (계획 ↔ 기존 코드·design 정합축)
| 정합 축 | 계획 | 실측 | 판정 |
|---|---|---|---|
| `buildNtsReportContext` 시그니처 | WS-3 | `building-std-price-form.ts:596` `(f)=>NtsReportContext` | ✓ |
| `toEngineInput` export | WS-3 | `:309` export | ✓ |
| `AdjustmentContext` 확장지점 | WS-5 | `helpers.ts:67` interface | ✓ |
| `selectSpecialAdjustment` export 필요 | WS-2/1 | `:512` 미export(정확) | ✓ |
| `describeSpecialAdjustment` 재사용 | WS-1 | `:613` export | ✓ |
| snapshotKey 3진입점 전달 | WS-3/4 | 상증 `:234`·양도 CB `:230,260`·GB `:347,374` | ✓ |
| print sections 3세목 | WS-3 | `lib/print/{transfer,inheritance,gift}-print-sections.ts` | ✓ |
| 신규 엔진 API 필드 → 14지점 | 전체 | **신규 public Input/Result 필드 0**(엔진 client-side 호출) | N/A ✓ |
| 서식 모델 직렬화(plain) | WS-4 | `NtsReportModel` 숫자·문자열 only(Map 없음) | ✓ |

### 결과
- 정정 7건(High 3·Medium 3·Low 1) 전부 반영. **Critical/High 잔존 0**.
- 통합 정합축 전부 ✓. 계획서 인용 file:line 전수 실측 완료(추정 0).
- 잔여 Design-단계 확정 항목(비차단): gift inputData estate item **id 필드 경로**(WS-4 저장 추출 시 grep 확정).
