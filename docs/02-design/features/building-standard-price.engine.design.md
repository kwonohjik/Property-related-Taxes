# 건물 기준시가 계산기 — 엔진 설계

**작성일**: 2026-06-10 · **재검토**: 2026-06-10 (PDF 전수 실측 정정 12건 반영)
**계획서**: `docs/00-pm/building-standard-price.plan.md`
**PDCA 단계**: Design (STEP 5 엔진 설계)
**도메인**: 신규 독립 도메인 `lib/tax-engine/building-standard-price.ts` (특정 세목 비종속, 양도·상속·증여 공용)

---

## Context

국세청 「건물 기준시가(양도)」·「건물 기준시가(상속/증여)」 신고도움 조회 화면(첨부 이미지 18·19)을 재현하는 계산기. 토지를 제외한 **건물**의 기준시가를 산정한다.

- **동기**: 양도세(환산취득가 `general/commercial-building-valuation.ts`)·상속증여세(보충적 평가)에서 "건물 기준시가"를 **입력으로** 요구하지만, 그 값을 산출하는 도구가 앱에 없어 사용자가 외부(홈택스)에서 별도 계산해야 했다.
- **산식 출처**: 산식·지수·잔가율·조정율·산정기준율은 **법령 조문이 아닌 국세청 「건물 기준시가 계산방법」 고시**(첨부 PDF). 법령(소법 §99·소령 §164·상증법 §61)은 위임 근거일 뿐 산식 본문이 없다 → **검증은 PDF 대조**(KoreanLaw로는 산식 확인 불가, 조항 번호만 검증).

---

## ★ 케이스 인벤토리 (필수)

> anchor 출처: PDF 제3장엔 숫자 계산 예시가 **없음**(산식·부록 지수표만). → "지수표 직접 조회 + 손계산"이 1차 anchor. **홈택스 건물기준시가 계산기 실측 대조**는 ☐ TODO(사용자 자료 확보 시 보강).

| # | 시나리오 | 법령/PDF 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|-------------|------------|-----------|------|
| BSP-01 | 상증 기본(조정율 미적용) | 상증법 §61①2호 + PDF p.296 | 지수표 손계산 | `basic-inheritance.test.ts` | ☐ TODO |
| BSP-02 | 상증 + 조정율 단일 구분 | 조정율 PDF I~VII | 지수표 손계산 | `adjustment-single.test.ts` | ☐ |
| BSP-03 | 상증 + 조정율 **다구분 중복 곱** | 조정율 적용요령 (2) | 손계산(곱셈 검증) | `adjustment-multi.test.ts` | ☐ |
| BSP-04 | 상증 리모델링 → 잔가율 override | PDF p.296 ③ | 손계산 | `remodel-residual.test.ts` | ☐ |
| BSP-05 | 위치지수 2001~2002 특례(해당연도 1.1.) | PDF p.300 ② | 손계산 | `location-index-special.test.ts` | ☐ |
| BSP-06 | 양도 취득시(2001 이후)+양도시 2회 | PDF p.296 | 손계산 ×2 | `transfer-two-points.test.ts` | ☐ |
| BSP-07 | 양도 취득시 2000.12.31 이전 산정기준율 | 소령 §164⑤ + 산정기준율 PDF | 산정기준율표 손계산 | `transfer-pre2001.test.ts` | ☐ |
| BSP-08 | 양도 동일연도 취득·양도 환산 | 소령 §164⑧ + PDF p.302 | 손계산(환산식) | `transfer-same-year.test.ts` | ☐ |
| BSP-09 | 경계: 1984.12.31 이전 취득 → 1985 | PDF p.301 ⑧①·산정기준율 ① | 경계값 | `boundary-1984.test.ts` | ☐ |
| BSP-10 | 경계: 최저 잔가율 0.100 도달 | 잔가율 PDF(1996이하 등) | 경계값 | `boundary-min-residual.test.ts` | ☐ |
| BSP-11 | 경계: ㎡당 금액 1,000원 미만 절사 | PDF p.296 | 경계값 | `boundary-truncate.test.ts` | ☐ |
| BSP-12 | 구조 그룹 재편(황토조: 잔가율 III·산정기준율 II) | 잔가율·산정기준율 헤더 | 매핑 검증 | `structure-group-map.test.ts` | ☐ |
| BSP-13 | 경계: 구조지수표 연도별 분류 변동(2026=11행 / 2003~07=8) | 구조지수 PDF | 연도경계 | `structure-index-year.test.ts` | ☐ |
| BSP-MECH ★ | **기계식주차전용빌딩 특수산식**(2025: 6백만×잔가율(30년)×주차대수) | 용도지수표 2025 #61(실측) | 손계산(Pre-Do 확정) | `mechanical-parking.test.ts` | ☑ anchor 확정 |
| BSP-MECH-Y ★ | 기계식주차 **연도 가변 산식**(2001~02: 5백만·내용연수 20년) | 용도지수표 2001 #39(실측) | 손계산 | `mechanical-parking.test.ts` | ☐ 재검토 신규 |
| BSP-14 | §164⑧ **제2산식**(예정신고기한 내 신규 고시 선택) | PDF p.302(실측) | 손계산(환산식) | `transfer-same-year.test.ts` | ☐ 재검토 신규 |
| BSP-15 | 산정기준율 신축연도 규칙(§8③ 1985 클램프 금지·§8⑤ 내용연수 종료연도 치환) | PDF p.301(실측) | 경계값 | `transfer-pre2001.test.ts` | ☐ 재검토 신규 |

**규칙**: BSP-01·BSP-06이 Pre-Do primary anchor. 조정율(BSP-03)·산정기준율(BSP-07·15)·동일연도(BSP-08·14)·기계식 연도가변(BSP-MECH-Y)은 고위험 분기로 anchor 필수.

---

## 법령 근거 (조항만 — 산식은 PDF)

`lib/tax-engine/legal-codes/building-standard-price.ts` 상수화.

```
소득세법 §99①1호나목         : (양도) 건물의 기준시가 = 국세청장 산정·고시
소득세법 시행령 §164③        : 새 기준시가 고시 전 취득·양도 → 직전 기준시가
소득세법 시행령 §164⑤        : 기준시가 고시 전 취득 건물의 취득당시 기준시가(산정기준율 — 산식은 고시)
소득세법 시행령 §164⑧        : 보유 중 새 기준시가 미고시로 양도=취득 기준시가 동일 시 양도기준시가 환산(재경부령)
상속세 및 증여세법 §61①2호    : (상증) 건물 = 신축가격·구조·용도·위치·신축연도 고려 국세청장 산정·고시
국세청 「건물 기준시가 계산방법」 고시 : 산식·구조지수·용도지수·위치지수·잔가율·조정율·산정기준율 본문 (= 첨부 PDF, 단일 출처)
```

> ⚠️ KoreanLaw 실측 결과 `상증령 §51`은 "지상권등의 평가" — 건물 평가 아님. 상증 건물은 법 §61①2호 + 고시.

---

## 데이터 모델 (`lib/tax-engine/data/building-standard-price/`)

> 역사적 확정 테이블 → 정적 상수(`land-grade-values.ts` 선례). 매년 1행 추가. **PDF 전수 전사 후 anchor 대조**(전사 오류 위험 — 계획서 R5).

### D1. `new-building-base-price.ts` — 건물신축가격기준액 (연도 → 원/㎡)

```ts
// ⚠️ 재검토 실측 정정: 초안의 2005~2007·2015~2017 6개 연도가 한 칸 밀려 있었음. 아래가 PDF(p.297 본문 + 부록 표) 확정값.
export const NEW_BUILDING_BASE_PRICE: Readonly<Record<number, number>> = Object.freeze({
  2001: 400_000, 2002: 420_000, 2003: 460_000, 2004: 460_000, 2005: 460_000,
  2006: 470_000, 2007: 490_000, 2008: 510_000, 2009: 510_000, 2010: 540_000,
  2011: 580_000, 2012: 610_000, 2013: 620_000, 2014: 640_000, 2015: 650_000,
  2016: 660_000, 2017: 670_000, 2018: 690_000, 2019: 710_000, 2020: 730_000,
  2021: 740_000, 2022: 780_000, 2023: 820_000, 2024: 830_000, 2025: 850_000,
  2026: 860_000,
});
// 2000년 이전 = 2001년값(400,000) 적용. 신규 연도(2027~) 고시 시 추가.
```

### D2. `structure-index.ts` — 구조지수 ((연도구간, 구조키) → 지수)

연도별 분류·값 상이. **연도구간 그룹핑**(예: `2003-2007`, `2008-2009`, `2010-2011`, 이후 매년). 구조키는 정규화 식별자(`solid_wood`·`rc`·`steel_frame_rc` 등) + 표시명.

⚠️ **1행 = 다수 구조 묶음**(실측 2026: #4행 = 철근콘크리트조·석조·프리캐스트콘크리트조·목조·라멘조·ALC조·스틸하우스조 = 100). 같은 행 안에서 잔가율 그룹이 갈림(철근콘크리트=잔가율 I·목조=II) → **옵션·구조키는 개별 구조명 단위로 분해**, 같은 행은 같은 지수 공유.

```ts
// 실측 2026년 = 11행 (지수 100 기준 정수)
//  #1 통나무조 135 / #2 목구조 115 / #3 철골(철골철근)콘크리트조 110 /
//  #4 철근콘크리트조·석조·프리캐스트·목조·라멘·ALC·스틸하우스 100 /
//  #5 연와조·철골조·보강콘크리트조·보강블록조 95 / #6 시멘트벽돌조·황토조·시멘트블록조·와이어패널조 90 /
//  #7 철골조 중 조립식패널(EPS) 85 / #8 조립식패널조 80 / #9 경량철골조 79 /
//  #10 석회및흙벽돌조·돌담및토담조 60 / #11 철파이프조·컨테이너건물 59
// ⚠️ 같은 구조도 연도별 지수 변동(목구조: 2026=115/2025=120/2024=125/2022~21=130). 2003~2007 = 8항목(분류 다름).
```

### D3. `usage-index.ts` — 용도지수 ((연도, 용도키) → 지수)

건축법 시행령 별표1 기준. **연도별 항목 수 상이**(실측: 2026=61항목 / 2001~02=39항목). 구분 **I 주거 / II 상업·업무 / III 산업·기타특수 / IV 기계식주차전용빌딩**(특수산식 행 — D9로 분리).

```ts
// 예: 2026년 — #1 아파트 110 / #2 단독주택 100 / #3 관광호텔(5성4성) 140 / #4 호텔 130 / ...
//     #61 기계식주차전용빌딩 = 특수산식(D9)
```

### D4. `location-index.ts` — 위치지수 ((연도, 공시지가구간) → 지수)

**구간 수가 연도군별로 크게 다름**(실측: 2025=45구간 / 2014=25 / 2007~13=13 / 2003~06=11 / 2001~02=5구간) → 연도군 그룹핑. **구간 경계는 "이상~미만"**.

```ts
// 구간 배열 + 연도별 지수. resolveLocationIndex가 landPricePerM2로 구간 탐색.
// 실측 2025: <2만=78, 2만~3만=83, ..., 65만~80만=100, ..., 700만~800만=132, ..., 8천만이상=182
// (재검토 정정: 초안의 "650만~800만=100"은 10배 오기 — 100이 되는 구간은 65만~80만원)
// ⚠️ 보유 자료 최신 표 = 2025년. 2026년표 부재(R11) → 2026 입력은 자료 확보 시까지 검증 오류.
```

### D5. `residual-rate.ts` — 잔가율 ((그룹, 경과연수) → 잔가율)

**값은 경과연수 1D 의존** — 실측 등치쌍: **2026평가·2021신축 = 2025평가·2020신축 = 0.910(경과 5년)** / 2026평가·2020신축 = 2025평가·2019신축 = 0.892(경과 6년). (재검토 정정: 초안 예시 "2026평가·2020신축=0.910"은 1년 오기.) 2025·2026 2개 표 대조 완료 — **전 26개 표 검증은 Phase A 전사 시(C1)**. 1테이블 압축.

```ts
// 그룹별 선형: 1.000 − 경과연수 × step, 최저 0.100  (2026표 실측: I그룹 1976이하=0.100 — 경과 50년)
//  I(50년)=0.018 / II(40년)=0.0225 / III(30년)=0.030 / IV(20년)=0.045
// ⚠️ 선형 공식과 PDF 전사값 1원 대조 필수(C1). 불일치 시 PDF 테이블 우선.
export const RESIDUAL_RATE_STEP = { I: 0.018, II: 0.0225, III: 0.030, IV: 0.045 } as const;
export const RESIDUAL_RATE_MIN = 0.100;
// 안전책: PDF 값 직접 전사 테이블도 병행 보유, 함수는 테이블 우선·공식 fallback.
// 복합 구조/용도 건물은 그룹별 각각 계산. 분류 곤란 특수구조 = III그룹 (p.301 §7⑤ — 실측).
```

### D6. `acq-base-rate.ts` — 취득당시 산정기준율 ((산정기준율그룹, 신축연도, 취득연도) → 율)

2000.12.31 이전 취득 전용. **2D 매트릭스**(신축연도 × 취득연도, 그룹 I/II/III 별 3개 표). 실측 구조:
- 취득연도 열: 2000년 ~ 1986년 + **"1985년이전"**(1984.12.31 이전 취득 → 1985년 의제와 정합, p.301 §8①).
- 신축연도 행: 2000년 ~ 그룹별 최저행(**I=1945년이전 / II=1955년이전 / III=1965년이전**).
- ⚠️ **신축연도는 1985년으로 클램프 금지**(p.301 §8③ 명문). §8⑤: 취득연도 역산 내용연수 종료 연도 이전 신축 → **내용연수 종료 연도를 신축연도로**(= 최저행 버킷과 일치).
- §8④: 완공 전 취득으로 **취득연도 < 신축연도 가능** → 검증에서 차단 금지.

### D7. `special-adjustment-rate.ts` — 개별건물 특성 조정율 (상증 전용)

7구분 37항목 지수 + 선택규칙 함수. (아래 알고리즘 §조정율)

### D9. `mech-parking-formula.ts` — 기계식주차전용빌딩 특수산식 (연도 → {단가, 내용연수}) ★재검토 신설

⚠️ **연도 가변**(실측): 2025·2026년 #61 = `6,000,000원 × 잔가율(내용연수 30년) × 주차대수` / **2001·2002년 #39 = `5,000,000원 × 잔가율(내용연수 20년) × 주차대수`**. 단가·내용연수 모두 변동 — 중간 연도는 Phase A에서 각 연도 용도지수표 비고 행 전사로 확정.

```ts
export const MECH_PARKING_FORMULA: Readonly<Record<number, { unitPrice: number; durableYears: 20 | 30 }>> = {
  // 2001: { unitPrice: 5_000_000, durableYears: 20 }, ..., 2026: { unitPrice: 6_000_000, durableYears: 30 },
};
// 잔가율 그룹은 그룹번호 하드코딩 금지 → durableYears로 해당 평가연도 잔가율표의 동일 내용연수 그룹 결정.
```

### D8. `structure-group-map.ts` — 구조키 → {잔가율그룹, 산정기준율그룹}

**2개 그룹 필드**(같은 구조가 두 표에서 다른 그룹 — §그룹 매핑).

```ts
export const STRUCTURE_GROUP_MAP: Readonly<Record<string, { residual: "I"|"II"|"III"|"IV"; acqBase: "I"|"II"|"III" }>> = {
  // 예: 황토조 → { residual: "III", acqBase: "II" }
  //     목조   → { residual: "II",  acqBase: "II" }
  //     목구조 → { residual: "I",   acqBase: "I"  }
  //     경량철골조 → { residual: "III", acqBase: "III" }
};
```

#### 그룹 매핑 원본 (PDF 헤더)

| | 잔가율표 그룹(내용연수) | 산정기준율표 그룹(내용연수) |
|---|---|---|
| I | 50년: 통나무조·철골(철골철근)콘크리트조·철근콘크리트조·석조·프리캐스트콘크리트조·목구조·라멘조 | 40년: 통나무조·철골(철골철근)콘크리트조·철근콘크리트조·석조·프리캐스트콘크리트조·목구조 |
| II | 40년: 연와조·목조·시멘트벽돌조·보강콘크리트조·ALC조·철골조·스틸하우스조·보강블록조·와이어패널조 | 30년: 연와조·보강콘크리트조·시멘트벽돌조·철골조·스틸하우스조·황토조·목조 |
| III | 30년: 경량철골조·석회및흙벽돌조·돌담및토담조·황토조·시멘트블록조·조립식패널조·기계식주차전용빌딩 | 20년: 시멘트블럭조·경량철골조·철파이프조·석회및흙벽돌조·돌담및토담조·기계식주차전용빌딩 |
| IV | 20년: 철파이프조·컨테이너건물 | (없음 — 산정기준율은 3그룹) |

---

## 엔진 input 타입

```ts
export type BuildingStdPriceTaxType = "transfer" | "inheritance_gift";

export interface BuildingStandardPriceInput {
  taxType: BuildingStdPriceTaxType;
  floorArea: number;            // 연면적(㎡). 공동주택=전유+공용. 기계식주차 시 미사용
  builtYear: number;            // 신축연도(준공/사용승인 속한 연도). 1984.12.31 이전→1985
  remodelYear?: number;         // 리모델링(대수선)연도 — 상증만, 잔가율 신축연도 override
  isMechanicalParking?: boolean;// 기계식주차전용빌딩 → 특수산식(§A'). 구조/용도/위치/연면적 미적용
  parkingLotCount?: number;     // 기계식주차 주차대수(특수산식 면적 대체). isMechanicalParking 시 필수

  // 양도 모드 (취득시·양도시 2시점)
  transferYear?: number;
  acquisitionYear?: number;
  transfer?: BuildingPointInput;     // 양도시 구조/용도/공시지가
  acquisition?: BuildingPointInput;  // 취득시 구조/용도/공시지가
  holdingMonths?: number;            // §164⑧ 동일연도 양도 환산용. ⚠️ 동일연도 시 필수 입력(연도만 받으므로 일자 도출 불가, 1월미만=1월)
  adjustMonths?: number;             // §164⑧ 기준시가조정월수(전기 결정일~취득 결정일 전일). 미입력 시 12(연 1회 정기고시)
  sameYearFormula?: "prev" | "new";  // §164⑧ 제1산식(취득전기 기준) | 제2산식(신규 고시 기준, p.302). 기본 "prev"
  newNoticePricePerM2?: number;      // 제2산식 선택 시 새로운 기준시가 ㎡당 금액 — 필수
  prevLandPricePerM2?: number;       // 제1산식 취득전기(취득연도-1) 위치지수용 공시지가. 동일연도+제1산식 시 필수
  prevStructureKey?: string;         // 취득전기 구조키(취득연도-1 지수표 기준). 미입력 시 acquisition.structureKey 동명 항목 매칭, 매칭 실패 시 검증 오류
  prevUsageKey?: string;             // 취득전기 용도키 — 위와 동일 규칙

  // 상속·증여 모드 (1시점)
  valuationYear?: number;            // 상속·증여연도
  valuation?: BuildingPointInput;    // 상증 구조/용도/공시지가
  specialFeatures?: SpecialAdjustmentFeatures;  // 7구분 입력
  manualAdjustmentRate?: number;     // fallback: 조정율 직접 입력(%, 100=1.0)
}

export interface BuildingPointInput {
  structureKey: string;   // 해당 시점 연도 구조지수표 항목 키(B안)
  usageKey: string;       // 해당 시점 연도 용도지수표 항목 키(B안)
  landPricePerM2: number; // ㎡당 개별공시지가(위치지수 산정용). 기준일은 §1.5
}

// 조정율 7구분 입력 (상증 전용). 실제값 항목은 엔진이 구간 판정 — D3·D4
export interface SpecialAdjustmentFeatures {
  roofMaterial?: 1 | 2 | 3;                  // I 지붕재료(구조지수<100일 때만)
  maxFloors?: number;                        // II 최고층수 실제값(지하·옥탑 제외) → 엔진 구간 판정
  // II 연면적은 별도 필드 없음 — input.floorArea 재사용(주거용 미적용) — D4
  intelligentBuildingGrade?: "1-2" | "3-4";  // II 지능형건축물 인증
  houseTypeTier?: 16 | 17 | 18 | 19;         // III 단독(16·17)/공동(18·19) 중 1개 — D3 단일 통합
  commercialFloor?: 20 | 21 | 22 | 23;       // IV 상가층
  ancillaryParking?: 24 | 25;                // IV 부속·주차
  remodelCount?: 26 | 27;                    // V 개축(일부)
  wallessRatio?: number;                     // VI 무벽면적비율 실제값(입증) → 엔진 구간 판정
  structuralSafety?: 31|32|33|34|35|36;      // VII 구조진단/철거(입증)
  normalUseRatio?: number;                   // VII-37 화재·멸실 정상사용면적비율(0~1)
}
```

## 엔진 result 타입

```ts
export interface BuildingStdPriceBreakdown {   // 시점별 산출근거 echo
  standardPrice: number;        // 건물 기준시가(원)
  pricePerM2?: number;          // ㎡당 금액(1,000원 절사 후). ⚠️ 기계식주차는 없음(주차대수 기반) — optional
  basePrice: number;            // 일반=신축가격기준액 / 기계식주차=연도별 단가(D9)
  structureIndex?: number;      // ÷100 전 정수(예 110). ⚠️ 기계식주차 미적용 — optional (재검토 정정: null 아닌 undefined)
  usageIndex?: number;          //   〃
  locationIndex?: number;       //   〃
  residualRate: number;         // 0.xxx
  adjustmentRate?: number;      // 상증만 (1.0 기준)
  acqBaseRate?: number;         // 2000.12.31 이전 취득시만
  appliedLandPriceYear?: number;// 위치지수 적용 공시지가 기준연도(§1.5 echo)
  parkingLotCount?: number;     // 기계식주차만 echo
  mechDurableYears?: number;    // 기계식주차만 — 적용 내용연수 echo(연도 가변)
}

export interface BuildingStandardPriceResult {
  valuation?: BuildingStdPriceBreakdown;    // 상증 1세트
  acquisition?: BuildingStdPriceBreakdown;  // 양도 취득시
  transfer?: BuildingStdPriceBreakdown;     // 양도 양도시
  sameYearAdjusted?: boolean;               // §164⑧ 동일연도 환산 적용
  warnings: string[];
  legalBasis: string;
}
```

> 신규 Date 필드 없음(연도 정수·월수로 처리). 라우트 통합 시 `date-coerce` 불요. (마법사 통합 시 호출 세목의 Date 규칙 따름)

---

## 계산 알고리즘 (단계별)

### A'. 기계식주차전용빌딩 특수산식 (isMechanicalParking=true, 용도지수표 구분 IV — Pre-Do 발견 + 재검토 정정)

> ⚠️ 일반 산식과 **완전히 다름**. 그리고 **연도 가변**(실측): 2025·2026 #61 = `6,000,000원 × 잔가율(내용연수 30년) × 주차대수` / **2001·2002 #39 = `5,000,000원 × 잔가율(내용연수 20년) × 주차대수`** → D9 테이블.

```
{ unitPrice, durableYears } = MECH_PARKING_FORMULA[year]      // D9. 해당 연도 없으면 검증 오류
standardPrice = floor(unitPrice × resolveResidualRateByDurable(durableYears, effBuiltYear, year) × parkingLotCount)
  · 신축가격기준액·구조·용도·위치지수 미적용. effBuiltYear = remodelYear ?? builtYear.
  · 잔가율 그룹은 그룹번호 하드코딩 금지 — durableYears(내용연수)로 해당 평가연도 잔가율표 그룹 결정.
  · 조정율 미적용(상증 포함 — 조정율 PDF 비고 "주차전용빌딩은 적용하지 아니한다").
  · pricePerM2 없음(주차대수 기반). breakdown: basePrice=unitPrice, structure/usage/locationIndex=undefined,
    parkingLotCount·mechDurableYears echo.
  · 양도 모드도 동일 특수산식(취득시·양도시 각각 해당연도 산식·잔가율).
  · 취득 2000.12.31 이전(R10 — 해소): 산정기준율표 III그룹에 "기계식 주차전용빌딩" 명시 →
    취득기준시가 = 2001년 특수산식(5,000,000 × 잔가율(20년, 2001평가) × 주차대수) × resolveAcqBaseRate("III", ...)
```

### A. 공통 ㎡당 금액 (1시점)  — isMechanicalParking=false

```
1. basePrice   = NEW_BUILDING_BASE_PRICE[year≥2001 ? year : 2001]
2. structIdx   = resolveStructureIndex(year, structureKey)   // 정수
3. usageIdx    = resolveUsageIndex(year, usageKey)
4. locIdx      = resolveLocationIndex(year, landPricePerM2)  // year의 위치지수표 + 공시지가 구간 탐색. 기준일(§1.5)은 "어느 시점 공시지가를 입력하느냐"의 UI 문제 — taxType 무관 (D1)
5. group       = STRUCTURE_GROUP_MAP[structureKey].residual
   effBuiltYr  = remodelYear ?? builtYear        // 상증 리모델링 override
   residual    = resolveResidualRate(group, effBuiltYr, year)  // 경과=year−effBuiltYr
6. adjRate     = (taxType==="inheritance_gift")
                   ? (manualAdjustmentRate != null
                        ? manualAdjustmentRate/100
                        : calcSpecialAdjustmentRate(features, structIdx, floorArea,
                            { isResidential: isResidential(usageKey), isApartment: isApartment(usageKey) }))
                   : 1.0                          // 양도는 조정율 미적용
   // isResidential(usageKey): 용도지수표 구분 I(주거) 여부 — II 연면적 미적용 판정용
   // isApartment(usageKey): 아파트 여부 — "주거용은 아파트만 최고층수 적용" 판정용 (재검토 보강: isResidential만으로는 판정 불가)
7. raw         = basePrice × (structIdx/100) × (usageIdx/100) × (locIdx/100) × residual × adjRate
   pricePerM2  = truncateToThousand(raw)          // 1,000원 미만 절사
8. standardPrice = floor(pricePerM2 × floorArea)
```

> **floor 위치(R4)**: PDF "㎡당 금액은 1,000원 단위, 1,000원 미만 절사" → step 7에서 절사, step 8에서 면적 곱. anchor로 재확인.
> **정수/지수 연산**: 지수는 정수(110)이므로 `(idx/100)` 부동소수 누적 회피 위해 `basePrice × structIdx × usageIdx × locIdx`(정수곱) 후 `/1_000_000`, × residual × adjRate 순서로. `safeMultiply` 사용. 최종 절사.

### B. 양도 모드

```
- 양도시:   A로 transfer breakdown (transferYear, input.transfer)
- 취득시:
  · acquisitionYear ≥ 2001 → A로 acquisition breakdown (acquisitionYear, input.acquisition)
  · acquisitionYear ≤ 2000 → acqBase 경로(소령 §164⑤ + p.301 §8, D6):
      pricePerM2_2001 = basePrice(2001=400,000) × 구조·용도·위치지수(**모두 2001년 지수표**;
        구조·용도키는 취득당시 건물의 구조·용도, 위치지수는 2001.1.1 공시지가) × 잔가율 → truncateToThousand
      acqGroup = STRUCTURE_GROUP_MAP[acquisition.structureKey].acqBase  // 산정기준율 그룹(I~III)
      acqYearEff   = acqYear ≤ 1985 ? "1985년이전" : acqYear            // §8① — 취득연도만 의제
      builtYearEff = max(builtYear, acqYearEff − 내용연수(acqGroup))    // §8⑤ — 내용연수 종료연도 치환
                     // ⚠️ §8③: 신축연도를 1985로 클램프 금지 (재검토 정정 — 초안의 ≤1984→1985는 본문 위반)
                     // §8④: 취득연도 < 신축연도 허용(완공 전 취득) — 검증 차단 금지
      acqRate  = resolveAcqBaseRate(acqGroup, builtYearEff, acqYearEff)
      standardPrice = floor(pricePerM2_2001 × floorArea × acqRate)
- 동일연도(transferYear===acquisitionYear): §164⑧ (제1·제2산식 — 아래 절)
      transfer.standardPrice = calcSameYearTransferStdPrice(...)
      sameYearAdjusted = true
```

### C. 상속·증여 모드

```
- A로 valuation breakdown (valuationYear, input.valuation)
- 위치지수: §1.5 연도 기준(양도·상증 **공통**, D1). `resolveLocationIndex(year, landPricePerM2)`. 2001~2002 평가면 사용자가 해당연도 1.1 공시지가를 입력(UI 안내) — 엔진은 taxType 무관.
- 조정율: calcSpecialAdjustmentRate
```

### 조정율 알고리즘 `calcSpecialAdjustmentRate(features, structIdx, floorArea, { isResidential, isApartment })`

```
결과 = 100  (배율 ×, 미해당 구분 = 100 = 무영향)
I   지붕재료: structIdx < 100 이고 roofMaterial 있으면 × (지수/100). structIdx≥100이면 미적용.
II  최고층수/연면적/지능형: 해당하는 것들 중 **가장 높은 지수 1개** × (지수/100).
      · 최고층수: maxFloors(실제값, 지하·옥탑 제외)로 구간 판정. 주거용은 **isApartment일 때만** 적용(isResidential && !isApartment → 미적용).
      · 연면적: input.floorArea로 구간 판정(주거용(isResidential) 미적용, 적용요령 4) — D4.
III 단독/공동주택: houseTypeTier 지수 × (지수/100) — 단독·공동 중 1개.
IV  상가·부속: **가장 낮은 지수 1개** × (지수/100). 단 20~23 해당하며 24·25면 60.
      · 주차전용빌딩은 IV 미적용(isMechanicalParking).
V   개축(일부): remodelCount 지수 × (지수/100). 전부개축은 개축년도=신축년도(미적용).
VI  무벽건물(입증): wallessRatio(실제 비율)로 구간 판정 × (지수/100).
VII 구조진단/철거(입증): 가장 낮은 지수 1개 × (지수/100). 37=정상사용면적비율을 율로.
반환 = 결과/100  (1.0 기준 배율). 구분 간 중복 시 자동으로 누적 곱(적용요령 2).
```

> ⚠️ "통나무조는 지붕재료(I) 미적용". 모든 곱은 (지수/100) 배율. 부동소수 누적 회피 위해 정수 지수 곱 후 마지막 환산.

### §164⑧ `calcSameYearTransferStdPrice(...)` — 제1·제2산식 (p.302 실측)

```
제1산식(sameYearFormula="prev", 기본):
  양도기준시가 = acqStd + (acqStd − prevStd) × min(holdingMonths/adjustMonths, 1.0)   // 비율 100/100 한도
  · prevStd      = 취득전기 기준시가 = 취득연도-1 지수표로 A 재계산(㎡당금액 × 면적).
                   구조·용도키는 prevStructureKey/prevUsageKey(미입력 시 동명 항목 매칭, 실패 시 검증 오류),
                   위치지수는 prevLandPricePerM2(필수). ※ p.300 §6⑤: 동일조정기간 내 전기기준시가 = 전년도 1.1 시행 기준시가
제2산식(sameYearFormula="new" — 예정신고기한까지 새 기준시가 고시 시 거주자 선택, 재검토 신규):
  양도기준시가 = acqStd + (newStd − acqStd) × min(holdingMonths/adjustMonths, 1.0)
  · newStd       = truncateToThousand(newNoticePricePerM2) × floorArea (새로운 기준시가)
공통:
  · holdingMonths= 취득~양도 보유월수(초일 산입, 1월 미만 일수=1월). ⚠️ 필수 입력(연도만 받으므로 도출 불가)
  · adjustMonths = 기준시가 조정월수(전기 결정일~취득 결정일 전일). 미입력 시 12(연 1회 정기고시)
  · 산식 선택은 중립 표기(유불리·절감 표현 금지 — 프로젝트 정책)
```

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 자동 채울 유혹 | 정책 |
|------|---------------|------|
| `landPricePerM2` 미입력 | 위치지수 0 또는 1.0 처리 | ☑ **검증오류 차단** (위치지수 필수) |
| `holdingMonths` 미입력(동일연도) | 0 처리 | ☑ **검증오류 차단** — 연도만 받으므로 일자 도출 불가(재검토 정정) |
| `adjustMonths` 미입력(동일연도) | — | ☑ 기본 12(연 1회 정기고시 — p.302 정의 기반 정상 기본값) + override |
| `newNoticePricePerM2` 미입력(제2산식) | 0 처리 | ☑ sameYearFormula="new" 시 검증오류 차단 |
| `prevLandPricePerM2` 미입력(동일연도 제1산식) | 당기 공시지가 재사용 | ☑ 검증오류 차단(전기 공시지가 별도 입력) |
| `parkingLotCount` 미입력(기계식주차) | 0 또는 floorArea 대용 | ☑ isMechanicalParking 시 검증오류 차단 |
| `structureKey`/`usageKey` 미선택 | 첫 항목 default | ☑ 차단(미선택=오류). UI 드롭다운 placeholder. 기계식주차 모드는 불요 |
| `adjustmentRate`(상증) | 미입력 시 100 | ☑ 특성 미입력 시 조정율 = 1.0(미적용)은 **합법**(조정율은 가산 요인, 없으면 1.0). 단 manualRate 모드 빈값은 1.0 |
| `remodelYear` | builtYear로 fallback | ☑ 미입력=리모델링 없음(builtYear 사용). 정상 |
| 입력 연도가 데이터 보유 범위 밖 | 최신/최근 표 silent 대체 | ☑ **검증오류 차단**(예: 위치지수 2026년표 부재 — R11). 표별 보유 연도 교집합으로 가드 |
| `acquisitionYear < builtYear` | 차단 | ☑ **허용**(p.301 §8④ 완공 전 취득) — 차단하면 본문 위반 |

> 자동 안분 금지(`feedback_no_silent_apportion_fallback`). 위치지수·구조·용도 미입력은 명확한 검증 오류.

---

## 테스트 약속

- 케이스 인벤토리 17행 → anchor 테스트. 손계산값 원단위 `toBe()`.
- Pre-Do: BSP-01(상증 기본) + BSP-MECH(기계식) anchor 작성·RED 확보 완료. 값은 재검토 PDF 실측으로 **정확성 재확인 완료**(위치지수 2025 #28=132·잔가율 2025/2020=0.910·#61 6백만·30년).
- 고위험: BSP-03(조정율 다구분 곱)·BSP-07/15(산정기준율·신축연도 규칙)·BSP-08/14(동일연도 제1·제2산식)·BSP-12(그룹 재편)·BSP-MECH-Y(연도 가변) 필수.
- 전사 검증: D1(재검토에서 6개 연도 오기 적발 — 전 셀 PDF 화면 대조)·D2·D3·D4·D5·D6·D9 대표 셀 PDF 대조 anchor(`feedback_pdf_example_test_anchoring`).
- 잔가율 C1: 선형 공식 산출 = PDF 전사값 1원 대조(`boundary-min-residual.test.ts` + 중간연차). 2025·2026 표는 실측 완료, 전 26개 표는 Phase A.

---

## UI 통합 위임

- UI 명세: `building-standard-price.ui.design.md`.
- 독립 페이지는 자체 폼 상태(마법사 store 비종속) → 표준 14지점 중 ④⑤⑦⑧ 자체 적용, ①②③⑥·⑨~⑭(마법사·라우트)는 **마법사 통합(Phase G)** 시에만.
- 엔진 시니어는 input/result 타입·resolver·데이터 상수 책임. UI는 폼·위젯·결과 카드·조정율 모달.
