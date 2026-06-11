# 국세청 「건물 기준시가 계산서」 재현 — 엔진 설계

> 계획: [docs/00-pm/building-std-price-nts-report.plan.md](../../00-pm/building-std-price-nts-report.plan.md) (자가 검토 17건 정정 완료본)
> 원본: 국세청 교재 p.75~80 작성례 3건. 본 문서는 계획 §4 갭 G-1~G-5의 타입·산식·echo 구체화.
> 작성일: 2026-06-11 · 상태: Design

## Context

기존 인쇄 서식(간이 3열 「기준시가의 계산」, PR#109)을 국세청 공식 「건물 기준시가 계산서」(Ⅰ~Ⅵ+※ 6섹션)로 교체한다. 계산서가 요구하는 **양도 모드 복합건물**(작성례 1·2)·**부속시설 종류별 행**(Ⅳ·Ⅴ)·**조정률 번호 표기**(작성례 3)·**복합 ※ 산정기준율 환산**(작성례 2)이 현행 엔진에 없다. 데이터 레이어(D1~D9)는 갭 0 — PDF 전 수치 실측 일치(계획 §3).

---

## ★ 케이스 인벤토리 (행 1개 = anchor 1개 이상)

| # | 시나리오 | 근거 | anchor 출처(원단위) | 테스트 파일 | 상태 |
|---|---------|------|----------------------|-----------|------|
| 1 | 상증 복합 3부분 + 조정률 번호(9·20) — Ⅲ합 | 고시 §A·조정률표 | 작성례(3) p.79: 171,500,000 (지상1 ⑧601,000) | `nts-report-cases.test.ts` A-1 | ✅ Pre-Do PASS(현행 산식) |
| 2 | 상증 복합 + 부속 종류별(주차60·보일러30, 귀속 번호 24·9) — ⑪ | 고시 계산서 Ⅳ·Ⅴ항 | 작성례(3) p.80: ⑪200,540,000 (Ⅳ합 29,040,000 — 행별 6,000,000/13,360,000/3,000,000/6,680,000) | 동 A-2 | ✅ Pre-Do PASS — **G-2는 echo-only 확정** |
| 3 | **양도(양도당시) 복합 + 부속** — ⑪ | 소법 §99①1나·고시 | 작성례(1) p.75~76: ⑪217,230,000 (Ⅲ합 167,100,000·Ⅳ합 50,130,000) | 동 A-3math | ✅ 산식 PASS / **A-3gap: 양도 라우팅 부재 실증(G-1)** |
| 4 | **양도 취득당시(≤2000) 복합** — 2001 계산 ⑪ | 소령 §164⑤·고시 §8 | 작성례(2) p.77~78: ⑪154,960,000 (지상1 ⑧370,000·용도 #27) | 동 A-4math | ✅ 산식 PASS(현행 inh 경로) |
| 5 | 복합 ⑪ × 산정기준율 ※식 | 소령 §164⑤ | 작성례(2) p.78: 154,960,000×1.016=**157,439,360** | 동 A-5 | ✅ 데이터 PASS — 배선만 Do |
| 6 | 종류별 분리 ↔ 기존 단일 `sharedFacilityArea` 결과 불변 | 회귀 | 기존 E2E 복합 anchor 187,640,000·인터리브 순서 bd[0~3] | 기존 `nts-cases.test.ts`·`building-std-price-form.test.ts` | ✅ 189건 PASS — 순서·합계 보존 |
| 7 | 조정률 번호 → 지수 resolver(1~36, 37 비대상) | 조정률표 | resolveAdjustmentRateByNo(9·20·24·36)·undefined(37·0) | `nts-report-cases.test.ts` | ✅ PASS |
| 8 | 양도 복합 + 동일연도(§164⑧) → 검증 차단 | 범위 외 | throw /동일연도.*복합/ | 동 | ✅ PASS |
| 9 | 복합 ≤2000 + 부분 구조 상이(산정기준율 그룹 상이) | 고시 §8(그룹별) | **anchor 미발견** — Do deviation: 단일 그룹만 지원, 그룹 상이는 **throw**(추측 금지). 양식 ※ 단일 그룹 숫자 표기 | (throw anchor 후속) | ⚠️ 단일 그룹 구현·상이 throw |
| 10 | 내용연수·그룹 echo (50년/I — 2023) | Ⅱ칸 | residualGroup="I"·durableYears=50 echo | 동 | ✅ PASS(calcPointBreakdown echo) |
| 11 | 단일 건물(비복합) 서식 데이터 어댑터 — Ⅲ 1행·Ⅳ/Ⅴ 빈 | 양식 고정부 | 기존 BSP-01 224,600,000 재사용 | `__tests__/calc/nts-report-adapter.test.ts` | ✅ PASS — 상증 1벌·양도 2벌·단일 |

---

## ★ Pre-Do 검증 결과 (2026-06-11 실행 — 설계 환류, 추정 아님)

`__tests__/tax-engine/building-standard-price/nts-report-cases.test.ts` 6건 **전부 통과**. 결과가 Do 범위를 크게 축소·확정:

| 발견 | 근거 anchor | Do 영향 |
|---|---|---|
| **복합 산식은 PDF ⑪ 3건을 원단위 정확 재현** (171,500,000·200,540,000·217,230,000·154,960,000) | A-1·A-2·A-3math·A-4math | 양도 복합은 **산식 신규 구현 0** — `calcCompositeForYear`(기존 `calcCompositeValuation` 추출) 시점 매개변수화 + 양도 분기 호출만 |
| **G-2(부속 종류별)는 echo-only — numeric 무관** | A-2: `sharedFacilityArea` 단일 90으로 ⑪ 200,540,000 정확 | `ancillaryFacilities` 종류 분해는 **Ⅳ·Ⅴ 표시·`ancillaryKind` echo 전용**. compositeTotal 산식 불변. 회귀 위험 ↓ |
| **G-1 실증: 양도 모드는 compositeParts를 silent 무시** | A-3gap: `taxType:"transfer"` + compositeParts → `compositeTotal`·`compositeBreakdowns` **undefined**, 단일 point가 167,100,000(부속 50,130,000 누락) 산출 | 크래시 아닌 **silent 과소산출**(`feedback_numeric_impact_verify_before_bug_claim` 패턴). 라우팅 추가가 핵심 |
| **G-5 산정기준율 데이터 정합** | A-5: `resolveAcqBaseRate("I",2000,2000)=1.016`, floor(154,960,000×1.016)=157,439,360 | ※식은 **복합 합계 × rate 배선만** — `AcqBaseConversion` echo |

**Pre-Do anchor의 지위(동결)**: A-1~A-4math는 현행 API(`adjustmentRate %`·`sharedFacilityArea`)로 작성됨. Do에서 신규 API(`adjustmentNos`·`ancillaryFacilities`·양도 라우팅)로 동일 ⑪를 산출하는 anchor를 **추가**하되, Pre-Do anchor는 **산식 불변 회귀 가드로 유지**(신·구 API가 동일 값 산출 보장). A-3gap은 Do에서 `compositeTotal === 217,230,000`으로 **반전**(gap 해소 확인) — Do 시 assertion 갱신.

**환류된 설계 단순화**: 알고리즘 §2 `calcCompositeForYear`는 신규 로직이 아니라 기존 `calcCompositeValuation` 본문의 시점 일반화 추출이다(산식 동일성은 A-1~A-4math가 보증). 양도 부속은 전 부분이 `sharedAdjustmentRate=1.0(100)` 상당으로 면적비율 수령(A-3math가 sharedAdjustmentRate=100으로 50,130,000 재현).

---

## 법령·고시 근거

`lib/tax-engine/legal-codes/building-standard-price.ts` 상수만 사용(문자열 리터럴 금지 — 이번 세션에 barrel 등록·엔진 연결 완료).

- `BUILDING_STANDARD_PRICE.TRANSFER_BUILDING` 소득세법 §99①1호나목 — 양도 건물 기준시가
- `BUILDING_STANDARD_PRICE.PRE_NOTICE_ACQUISITION` 소령 §164⑤ — 2000.12.31 이전 취득(산정기준율, ※식)
- `BUILDING_STANDARD_PRICE.INHERITANCE_BUILDING` 상증법 §61①2호 — 상증 건물
- `BUILDING_STANDARD_PRICE.NTS_NOTICE` 국세청 고시 — 산식·지수·조정률·계산서 양식 본문(단일 출처)

---

## 엔진 input 타입 (diff — `types/building-standard-price.types.ts`)

```ts
/** 부속시설 종류 — 계산서 Ⅴ항 열 Ci~Hi 순서 고정 */
export type AncillaryFacilityKind =
  | "parking"   // Ci 주차장(지하 포함)
  | "machine"   // Di 기계실
  | "boiler"    // Ei 보일러실
  | "shelter"   // Fi 대피소
  | "rooftop"   // Gi 옥탑
  | "other";    // Hi 기타

/** 부속시설 종류별 총면적(㎡) */
export interface AncillaryFacility {
  kind: AncillaryFacilityKind;
  areaM2: number;
}

export interface BuildingCompositePart {
  // 기존 유지: label / structureKey / usageNo / floorArea / adjustmentRate / sharedAdjustmentRate
  /**
   * [신규] 취득시점 용도번호 — 양도 복합 전용. 용도번호 체계가 연도군별 상이
   * (근린생활시설 2001=#27 ↔ 2023=#41 실측) → 시점별 선택 필수.
   * 양도 복합에서 미입력 = 검증 오류(silent fallback 금지). 상증·단일에선 무시.
   */
  acqUsageNo?: number;
  /**
   * [신규] 조정률 번호 ⓧⓨⓩ(최대 3, 상증 전용) — 계산서 Ⅲ·Ⅳ "조정률(번호)" 칸.
   * 입력 시 adjustmentRate(%) 대신 번호→지수 곱으로 배율 산정(resolveAdjustmentRateByNo).
   * adjustmentRate와 동시 입력 = 검증 오류(이중 진실 차단).
   */
  adjustmentNos?: number[];
  /**
   * [신규] 공용 부속분 조정률 번호(최대 3, 상증 전용) — Ⅳ 행 조정률 칸.
   * sharedAdjustmentRate(%)와 동시 입력 = 검증 오류.
   */
  sharedAdjustmentNos?: number[];
}

export interface BuildingStandardPriceInput {
  // ... 기존 유지 ...
  /**
   * [신규] 부속시설 종류별 면적 — sharedFacilityArea(단일 합계)의 종류 분해.
   * 양쪽 동시 입력 = 검증 오류. 기존 sharedFacilityArea는 deprecated(엔진 내부에서
   * [{kind:"other", areaM2}] 1건으로 정규화 — 하위호환·결과 불변).
   */
  ancillaryFacilities?: AncillaryFacility[];
  /**
   * [신규] 양도 모드 복합 허용 — compositeParts·ancillaryFacilities를 양도 2시점에 적용.
   * 별도 플래그 없음: taxType==="transfer" && compositeParts 존재로 활성(기존엔 상증 전용이던 분기 확장).
   * 양도 복합 시 acquisition/transfer point는 landPricePerM2만 사용(구조·용도는 부분별) — §알고리즘 3.
   */
}
```

**input 비변경 항목**: `transfer`·`acquisition`(BuildingPointInput)은 그대로 — 복합 양도에서 `landPricePerM2`만 읽는다(구조·용도 검증은 복합 분기에서 part-수준으로 대체).

## 엔진 result 타입 (diff)

```ts
export interface BuildingStdPriceBreakdown {
  // ... 기존 유지 ...
  /** [신규] 잔가율 그룹 echo — Ⅱ "내용연수(그룹별)" 강조 표기용 */
  residualGroup?: ResidualRateGroup;
  /** [신규] 내용연수(연) echo — durableForGroup(group, year) export 승격으로 도출 */
  durableYears?: number;
  /**
   * [신규] 적용 조정률 번호 echo — Ⅲ·Ⅳ "조정률(번호)" 칸 "0.9(9)" 표기. [{no, rate(정수 100기준)}].
   * 공급원: 복합 = part.adjustmentNos/sharedAdjustmentNos / **단일 상증 specialFeatures 경로 =
   * selectSpecialAdjustment 반환 {nos, rate} 연결**(기존 describeSpecialAdjustment 텍스트 echo와 병행).
   * 기존 adjustmentRate(배율) echo는 번호 입력 시에도 계속 채움(하위호환 — 결과뷰·이력 영향 0).
   * 형태는 기존 AdjustmentSelection과 동형 — IV구분 동시해당(상가층+부속 → 지수 60)은 번호 2개·rate 1개
   * ({nos:[20,24], rate:60})이므로 {no,rate} 1:1이 아닌 {nos[],rate}로 정의(selectSpecialAdjustment 반환 재사용).
   */
  adjustmentItems?: { nos: number[]; rate: number }[];
  /** [신규] 부속시설 행 마킹 — Ⅳ 분리 필터용. undefined = 주용도(Ⅲ) */
  ancillaryKind?: AncillaryFacilityKind;
  /** [신규] 부속 귀속 부분명 echo — "주차장(슈퍼귀속)" 표기용 */
  attributedTo?: string;
}

/** [신규] Ⅴ 안분계산표 echo */
export interface AncillaryApportionRow {
  /** 귀속 부분명(계산서 행 1~9 슬롯 배치는 UI 어댑터) */
  label?: string;
  /** 해당 부분 주용도지수(정수 100기준) — Ⅴ "주용도지수" 칸 */
  usageIndex: number;
  /** Bi = 주용도 면적비율(원천 분수 — 표시 반올림은 UI) */
  ratio: number;
  /** Ai = 종류별 안분면적 합(㎡) */
  areaSum: number;
  /** Ci~Hi 종류별 안분면적(㎡, toFixed(2) 반올림 후) */
  byKind: Partial<Record<AncillaryFacilityKind, number>>;
}
export interface AncillaryApportionment {
  /** 계(t): At·Ct~Ht */
  totalArea: number;
  totalByKind: Partial<Record<AncillaryFacilityKind, number>>;
  rows: AncillaryApportionRow[];
}

/** [신규] ※식 — 2000.12.31 이전 취득 복합 환산 echo */
export interface AcqBaseConversion {
  /** (1) 2001.1.1 현재 건물 기준시가(복합 합계 ⑪) */
  total2001: number;
  /** (2) 산정기준율 — 부분 구조가 단일 그룹일 때만(상이 시 undefined, 부분별 적용) */
  acqBaseRate?: number;
  /** (3) = 단일 그룹: floor((1)×(2)) / 그룹 상이: Σ floor(부분⑩×부분율) */
  convertedTotal: number;
}

export interface BuildingStandardPriceResult {
  // ... 기존 유지 ...
  /** [신규] 양도 복합 — 취득시점 부분별 breakdown(Ⅲ·Ⅳ 마킹 포함) */
  acquisitionComposite?: { breakdowns: BuildingStdPriceBreakdown[]; total: number };
  /** [신규] 양도 복합 — 양도시점 부분별 breakdown */
  transferComposite?: { breakdowns: BuildingStdPriceBreakdown[]; total: number };
  /** [신규] Ⅴ 안분계산표(상증·양도 공용 — 부분 구성 공통이므로 1벌) */
  ancillaryApportionment?: AncillaryApportionment;
  /** [신규] ※식 echo(양도 취득 ≤2000 복합) */
  acqBaseConversion?: AcqBaseConversion;
}
```

**하위호환 결정**: 상증 복합의 기존 `compositeBreakdowns`·`compositeTotal`은 형태·합계 불변(공용 행 포함). 신규 행 마킹(`ancillaryKind`)만 추가 — 기존 결과뷰(`CompositeTable`)·이력 저장 영향 0. 양도 복합은 신규 필드로 분리(기존 `acquisition`·`transfer` 단일 breakdown과 비충돌 — 복합 시 단일 breakdown은 미설정).

**Map 금지**: 신규 echo 전부 배열·Record(메모리 `feedback_engine_result_map_json_loss`).

---

## 데이터 레이어 (신규 헬퍼 2건 — `data/building-standard-price/`)

1. `resolveAdjustmentRateByNo(no: number): number | undefined` — 번호 1~37 → 지수(정수 100기준). 분산 테이블(ROOF 1~3 · MAX_FLOORS 4~8 · GROSS_AREA 9~13 · INTELLIGENT 14~15 · HOUSE 16~19 · COMMERCIAL 20~23 · ANCILLARY 24~25 · REMODEL 26~27 · WALLESS 28~30 · SAFETY 31~36)을 단일 switch/Record로 통합. **37(정상사용면적비율)은 실수 입력형 — 번호 입력 비대상(undefined)**. `special-adjustment-rate.ts`에 배치(라벨·rate 단일 파일 유지). 전수 anchor(케이스 7).
2. `durableForGroup(group, year)` **export 승격**(`residual-rate.ts:46` 기존 내부 함수 — 시그니처 변경 없음). G-4 echo 공급.

---

## 계산 알고리즘 (단계별)

### 1. 부속시설 정규화 (모드 공통)

```
ancillary = input.ancillaryFacilities
          ?? (input.sharedFacilityArea > 0 ? [{kind:"other", areaM2: sharedFacilityArea}] : [])
양쪽 동시 입력 → BuildingStdPriceError (이중 진실 차단)
totalAncillaryArea = Σ areaM2
```

### 2. 복합 1시점 계산 일반화 — `calcCompositeForYear(parts, year, landPricePerM2, ancillary, ctx)`

기존 `calcCompositeValuation`을 시점 매개변수화(순수 함수 분리, helpers로 이동). `ctx = { usageNoSelector, adjustmentEnabled(상증만 true), remodel }`.

```
부분 i(주용도):
  point = { structureKey: p.structureKey, usageNo: ctx.usageNoSelector(p), landPricePerM2 }
  adjRate_i = 상증: p.adjustmentNos 있으면 Π(resolveAdjustmentRateByNo(no))/100^k
              / p.adjustmentRate 있으면 ÷100 / 기본 1.0
              양도: 1.0 강제(adjustmentNos·adjustmentRate 입력 시 검증 오류 — UI도 숨김)
  main_i = calcPointBreakdown(year, point, p.floorArea, builtYear, adjRate_i, label, remodel)
         + echo: residualGroup·durableYears·adjustmentItems

부속 안분(종류별 — Ⅴ항):
  ratio_i = p.floorArea / Σ floorArea           (주용도 면적비율 — 분모는 **전 부분**, 현행 산식 보존)
  수령 부분 = 상증: sharedAdjustmentRate/Nos 지정 부분만(현행 보존) / 양도: 전 부분
  종류 k별(수령 부분만 행 생성): area_ik = parseFloat((ancillary[k] × ratio_i).toFixed(2))
            마지막 **수령** 부분: area = ancillary[k] − Σ(앞 수령 부분 area)
            ⚠️ 단, 미수령 부분이 있으면 잔여 흡수 없이 각 수령 부분 비율대로만 — 미수령 몫은 증발(현행 동작
            보존). 이때 Ⅴ표 행 합 < 계(t)(=입력 총면적)가 그대로 노출되며 warnings 1건 추가
            ("부속시설 N㎡ 중 M㎡만 귀속 지정 — 미지정 몫은 평가 제외"). 전 부분 수령 시에만 잔여 흡수로 합 일치.
  부속 행(i×k): sharedAdj_i = 상증: p.sharedAdjustmentNos → 지수곱 / p.sharedAdjustmentRate÷100
                              양도: 1.0
    bd_ik = calcPointBreakdown(year, point_i, area_ik, builtYear, sharedAdj_i, `${label} ${종류라벨}`, remodel)
          + echo: ancillaryKind=k · attributedTo=label
  ⚠️ 부속 귀속 활성 조건(현행 보존): 상증 = sharedAdjustmentRate(또는 Nos) 지정 부분만 안분 수령.
     양도 = 조정률 개념이 없으므로 **모든 부분이 면적비율로 수령**(작성례 1·2 — 전 부분 안분).

합계: total = Σ main + Σ 부속행
Ⅴ echo: rows[i] = { label, usageIndex(main_i), ratio_i, areaSum=Σ_k area_ik, byKind }
```

### 3. 모드 분기 (orchestrator)

```
상증 + 복합: 기존 경로 유지 — calcCompositeForYear(valuationYear) → compositeBreakdowns(마킹 포함)·
  compositeTotal **+ ancillaryApportionment·adjustmentItems echo 동시 산출**(부속 입력 시)
상증 + 단일: 기존 경로 유지 + specialFeatures 시 adjustmentItems echo 연결(E-2)
양도 + 복합 (신규):
  검증: 부분별 acqUsageNo 필수 / transfer·acquisition.landPricePerM2 > 0 / 동일연도(acqY===transY) → 차단 오류(케이스 8)
        / apartmentConversion 동시 입력 → 차단
  transferComposite = calcCompositeForYear(parts(usageNo), transferYear, transfer.landPricePerM2, ...)
  취득:
    acqY ≥ 2001: acquisitionComposite = calcCompositeForYear(parts(acqUsageNo), acqY, acquisition.landPricePerM2, ...)
    acqY ≤ 2000: base2001 = calcCompositeForYear(parts(acqUsageNo), 2001, acquisition.landPricePerM2, ...)
      그룹 판정: groups = parts.map(p => resolveAcqBaseGroup(p.structureKey)) — undefined 포함 시 오류(신공법)
      단일 그룹: rate = resolveAcqBaseRate(g, builtYear, acqY)
                 convertedTotal = floor(base2001.total × rate)            ← 작성례(2): 154,960,000×1.016=157,439,360
      그룹 상이: **Do deviation(2026-06-11)** — 부분별 환산은 부분↔breakdown(인터리브 부속행) 매핑이
        필요하고 anchor 미발견 → 추측 구현 대신 **throw**("동일 구조로 입력"). PDF 3작성례 전부 단일 그룹(rc=I)
        으로 영향 0. 부분별 환산 요구 사례 출현 시 calcCompositeForYear가 부분 subtotal 반환하도록 확장 후 재개.
      acquisitionComposite = base2001 echo — **total은 2001 기준 합계(=total2001)로 고정**.
        취득당시 가액의 단일 진실은 acqBaseConversion.convertedTotal (UI가 total을 취득가액으로 오용 금지)
      acqBaseConversion = { total2001, acqBaseRate?, convertedTotal }
양도 + 단일: 기존 경로 불변(이번 세션 §164⑧ 개선 포함)
```

### 4. ⑪·Ⅵ 어댑터 (엔진 외 — UI 순수 함수, 참고 명세)

`⑪ = 복합: compositeTotal(상증) / transferComposite.total·acquisitionComposite.total(양도, 시점별 서식 2벌) / 단일: breakdown.standardPrice`. ⑤·평균지가·총합계는 폼 데이터 파생(계획 §5) — 엔진 비관여.

---

## Silent fallback / 자동 안분 후보 식별

| 후보 | 처리 |
|---|---|
| 양도 복합 `acqUsageNo` 미입력 | 검증 오류(usageNo 재사용 fallback **금지** — 연도 체계 상이로 잘못된 지수 적용 위험) |
| `ancillaryFacilities` + `sharedFacilityArea` 동시 입력 | 검증 오류 |
| `adjustmentNos` + `adjustmentRate` 동시 입력 | 검증 오류 (sharedAdjustmentNos+Rate 동일) |
| 양도 복합에서 조정률 입력(`adjustmentNos`·`adjustmentRate`·`sharedAdjustmentNos`·`sharedAdjustmentRate` 전부) | 검증 오류(양도 조정률 미적용 — 고시) |
| 부속 면적 안분 | **법령(고시 Ⅴ항) 명시 안분** — 허용. 잔여는 마지막 부분 흡수(면적 차원) |
| 양도 복합 + 동일연도 / + apartmentConversion | 검증 차단(범위 외) |

---

## 테스트 약속

- 케이스 인벤토리 11행 전부 anchor(`__tests__/tax-engine/building-standard-price/nts-report-cases.test.ts` 신설). PDF 값은 **원단위 toBe()** — 행 단위 ⑧(557,000·601,000·370,000·411,000·300,000·334,000)·⑩ 전 데이터 행 + 합계(⑪·※(3)).
- Pre-Do: A-1~A-5를 Do 진입 전 작성·실행(계획 §6 Phase 0). A-3·A-4·A-5 실패 메시지를 본 설계에 환류.
- 회귀: 기존 176건 + 케이스 6(종류별 분리 후 기존 단일 합계 불변).
- 1원 오차 정책: 곱이 정수로 떨어지는 작성례(157,439,360)는 tolerance 없음. 면적 toFixed(2) 경로만 합 일치 가드.

---

## UI 통합 위임

UI 명세(폼 필드·서식 컴포넌트 6분할·testid 전수·8 동기화 지점)는 `building-std-price-nts-report.ui.design.md`. 엔진은 본 문서의 input/result 타입까지만 책임.
