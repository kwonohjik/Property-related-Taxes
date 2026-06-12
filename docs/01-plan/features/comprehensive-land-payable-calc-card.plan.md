# 종부세 결과 탭 — 토지분 "납부할세액의 계산" 산출근거 카드 (Plan, Phase 2 풀 충실 재현)

> 출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 **사례10**(종합합산, p.180~182) · **사례11**(별도합산, p.183~185) — 사용자 제공 PDF 축자 전사(2026-06-12 동결).
> 선행: 주택분 카드 ✅완료 — `comprehensive-housing-payable-tax-calc-card.plan.md` · `components/calc/results/comprehensive-payable-calc/`(helpers 재사용).
> **범위 결정(사용자 확정)**: Phase 2 풀 충실 재현 — 교재와 100% 동일. 필지별 토지 입력 UI + 토지 직전연도 자동계산 엔진 + 별도합산 세부담상한 신규 구축.
> 패턴: `pdf-case-replica-workflow` · `pre-do-anchor-verification` · `echo-field-pattern` · `feedback_pdf_table_row_one_to_one_mapping` · `korean-law-citation-verify`.

---

## 1. 배경·범위

주택분 카드(사례12)와 동일 컨셉의 토지분 산출근거 카드를 결과 탭에 추가한다. 단, 주택분("엔진 echo만 추가")과 달리 토지분은 **현행 엔진이 집계 입력만 보유** — 교재의 ②ⓐ 필지별(≪지역≫) 분해·④나 직전연도 전체 분해가 산출 불가. Phase 2 결정에 따라 다음을 신규 구축한다:

1. **필지별 토지 입력 모드**(종합합산·별도합산 공통) — 소재지 그룹(지자체)·면적·지분율·당해/직전 ㎡당 공시지가.
2. **토지 재산세 자동계산** — 지자체별 관내 합산 → §111 누진 → §122 상한 Min(직전 재산세상당 × 150%).
3. **토지 직전연도 종부세상당액 자동계산**(§15 세부담상한용) — 주택분 `calcPreviousYearEquivalent` 동형.
4. **별도합산 세부담상한**(§15) — 현행 엔진 미구현(드리프트 의심, §3 G-3).
5. **카드 2종**(종합합산·별도합산) — 신고서 서식·주택분 카드 아래, 기본 접힘.

기존 **집계 직접 입력 모드는 보존**(기본값) — 필지 모드는 옵트인. 직접 모드에서 카드는 축약 렌더(주택분 카드의 직접입력 모드 게이팅과 동일 원칙).

---

## 2. 교재 동결 형식 (PDF 축자 — 2026-06-12)

토지분은 **①~⑤ 5단계**(주택분 ①~⑥과 달리 **세액공제 단계 없음** — 토지에 고령자·장기보유 공제 부재). 번호: 네모 숫자 ①~⑤ → ⓐⓑⓒⓓ → ○ bullet → ≪지역≫ 블록 안 "−" 하이픈 bullet → "•" 필지 나열 → 가·나·다 → 나 안 ①② → ⓐⓑ. **농특세 미표기**(⑤ 종료점 — 주택분과 동일 정책).

### 2-1. 사례10 — 종합합산토지분 (서초구 나대지 200㎡·지분50% + 송파구 나대지 100㎡ + 잡종지 200㎡)

```
[종합합산토지분 종합부동산세 납부할세액의 계산]

①  재산세공제전 종합부동산세액 : 13,000,000원
    ○ 공시가격 : 18억원(= 4.3억원 + 3.7억원 + 10억원)
    ○ 종합부동산세 과세표준 : (18억원 − 5억원) × 100%(공정시장가액비율) = 13억원
    ○ 종합부동산세액 : 13억원 × 1% = 13,000,000원

②  공제할 재산세액 : 4,361,983원
    ⓐ 해당연도('22년) 재산세액 : 5,800,000원(1,255,000원 + 4,545,000원)
       ≪서초구 토지≫
        − 공시가격 : 200㎡ × 50%(지분율) × 4,300,000원 = 4.3억원
        − 재산세 과세표준 : 4.3억원 × 70%(재산세 공정시장가액비율) = 3.01억원
        − 세부담 상한 적용 전 재산세액 : 3.01억원 × 0.5%(세율) − 250,000원(누진공제액) = 1,255,000원
        − 직전연도('21년) 재산세액 : 870,000원
        − 세부담 상한액 : 870,000원 × 150% = 1,305,000원
        − 부과된 재산세액 : 1,255,000원[= Min(1,255,000원, 1,305,000원)]
       ≪송파구 토지≫
        − 공시가격 : 13.7억원
          • 송파구−1 토지 : 100㎡ × 3,700,000원 = 3.7억원
          • 송파구−2 토지 : 200㎡ × 5,000,000원 = 10억원
        − 재산세 과세표준 : 13.7억원 × 70% = 9.59억원
        − 세부담 상한 적용 전 재산세액 : 9.59억원 × 0.5% − 250,000원 = 4,545,000원
        − 직전연도('21년) 재산세액 : 3,705,000원
        − 세부담 상한액 : 3,705,000원 × 150% = 5,557,500원
        − 부과된 재산세액 : 4,545,000원[= Min(4,545,000원, 5,557,500원)]
    ⓑ 종합부동산세 과세표준에 대한 표준세율재산세액 : 13억원 × 70% × 0.5% = 4,550,000원
    ⓒ 총표준세율재산세액 : 18억원 × 70% × 0.5% − 250,000원 = 6,050,000원
    ⓓ 공제할 재산세액(ⓐ × ⓑ / ⓒ) : 5,800,000원 × (4,550,000원 / 6,050,000원) = 4,361,983원

③  세부담 상한전 종합부동산세액(① − ②) : 8,638,017원(= 13,000,000원 − 4,361,983원)

④  세부담 상한 초과세액(가 − 다 ≥ 0) : 0원
    가. 해당연도('22년) 총세액상당액(= ②의ⓐ + ③) : 14,438,017원(= 5,800,000원 + 8,638,017원)
    나. 직전연도('21년) 총세액상당액(① + ②) : 10,604,916원(= 4,575,000원 + 6,029,916원)
        ① 직전연도 재산세상당액 : 4,575,000원(= 870,000원 + 3,705,000원)
           ≪서초구≫ 공시 200㎡×50%×3,200,000 = 3.2억 → 과표 2.24억 → 0.5%−25만 = 870,000원
           ≪송파구≫ 공시 11.3억(3.3억+8억) → 과표 7.91억 → 0.5%−25만 = 3,705,000원
        ② 직전연도 종합부동산세상당액(ⓐ − ⓑ) : 6,029,916원(= 9,025,000원 − 2,995,084원)
           ⓐ 재산세공제전 : 공시 14.5억 → (14.5억−5억)×95%(FMR) = 9.025억 → ×1% = 9,025,000원
           ⓑ 공제할 재산세 : 4,575,000원 × (3,158,750원 / 4,825,000원) = 2,995,084원
              (분자 9.025억×70%×0.5% = 3,158,750 / 분모 14.5억×70%×0.5%−250,000 = 4,825,000)
    다. 세부담 상한액(나 × 150%) : 15,907,374원 → 초과하지 않으므로 "0원"

⑤  납부할세액(③ − ④) : 8,638,017원(= 8,638,017원 − 0원)
```

### 2-2. 사례11 — 별도합산토지분 (평창 일반건축물 부속토지 100,000㎡·지분50% + 용인 공장부속 100,000㎡ + 차고용 200,000㎡)

```
①  재산세공제전 : 241,000,000원
    ○ 공시가격 510억(90억+420억) → 과표 (510억−80억)×100% = 430억 → ×0.7% − 60,000,000 = 241,000,000원
②  공제할 재산세액 : 119,379,661원
    ⓐ 해당연도 재산세액 140,400,000원(24,000,000 + 116,400,000)
       ≪강원 평창군≫ 공시 90억(100,000㎡×50%×180,000) → 과표 63억 → 0.4%−1,200,000 = 24,000,000
                      직전 21,200,000 ×150% = 31,800,000 → Min = 24,000,000
       ≪경기 용인시≫ 공시 420억(140억+280억) → 과표 294억 → 0.4%−1,200,000 = 116,400,000
                      직전 108,000,000 ×150% = 162,000,000 → Min = 116,400,000
    ⓑ 430억 × 70% × 0.4% = 120,400,000원
    ⓒ 510억 × 70% × 0.4% − 1,200,000 = 141,600,000원
    ⓓ 140,400,000 × (120,400,000/141,600,000) = 119,379,661원
③  세부담 상한전(①−②) : 121,620,339원
④  세부담 상한 초과세액 : 0원
    가. 262,020,339(= 140,400,000 + 121,620,339)
    나. 228,714,663(= 129,200,000 + 99,514,663)
        ① 직전 재산세상당 129,200,000(평창 80억→과표56억→21,200,000 + 용인 390억→과표273억→108,000,000)
        ② 직전 종부세상당(ⓐ−ⓑ) 99,514,663 = 202,300,000 − 102,785,337
           ⓐ (470억−80억)×95% = 370.5억 → ×0.6% − 20,000,000 = 202,300,000
           ⓑ 129,200,000 × (103,740,000/130,400,000) = 102,785,337
              (분자 370.5억×70%×0.4% = 103,740,000 / 분모 470억×70%×0.4%−1,200,000 = 130,400,000)
    다. 상한액 343,071,995(= 228,714,663×150%) → 초과 0
⑤  납부할세액(③−④) : 121,620,339원
```

> **★ 별도합산에 세부담상한 ④가 존재** — 현행 엔진과 상충(§3 G-3).
> ⓑ(누진공제 없음)/ⓒ(누진공제 차감) 비대칭은 주택분과 동일한 의도된 공식(직전연도 ⓑ 분자·분모도 동일 패턴).

---

## 3. 엔진 갭 분석 (실측 file:line — 2026-06-12)

### 현행 자산 (재사용 가능 — 검증됨)

| 자산 | 위치 | 내용 |
|---|---|---|
| 토지 종부세 FMR 연도화 | `data/comprehensive-historical.ts:31·126·139` | `fairMarketRatioLand` 2021=0.95·2022~=1.00. orchestrator가 전달(`comprehensive-tax.ts:474~481`) — 교재 ④나② 95% 일치 ✓ |
| 종합합산 종부세 누진 3구간 | `comprehensive-land-aggregate.ts` `calcAggregateLandTaxAmount` | 1%/2%/3% — 사례10 ① 13,000,000 산출 가능 |
| 별도합산 종부세 누진 3구간 | `comprehensive-separate-land.ts:42~70` | 0.5%/0.6%/0.7% + 누진공제 — 사례11 ① 241,000,000 |
| 종합합산 토지 재산세 누진 | `property-tax-comprehensive-aggregate.ts:406` `calculateComprehensiveAggregateTax` | 0.2%/0.3%/0.5% (사례10 ②ⓐ 1,255,000) |
| 별도합산 토지 재산세 누진 | `separate-aggregate-land.ts:416` 내부(:522~524) | 0.2%/0.3%/0.4% + 누진공제 1,200,000 (사례11 ②ⓐ) |
| 재산세 §122 상한 | `property-tax-comprehensive-aggregate.ts:436` `applyBurdenCap(grossTax, previousYearTax?)` — floor·150%(실측) | **재사용 적합**(비교값=직전 표준세율 재계산은 호출부 책임) |
| ~~지자체 안분~~ | `:469 allocateByJurisdiction` | **재사용 부적합(실측)** — 총세액을 지자체별 공시 비율로 안분하는 용도. 본 작업은 지자체별 **독립 과세 그룹핑**(관내 합산→누진 각각) → 신규 그룹핑 헬퍼 |
| 종합합산 재산세 누진공제 | `legal-codes/property.ts:260` `COMPREHENSIVE_DEDUCTION_3: 250_000` | probe 실측 — 3.01억→1,255,000·9.59억→4,545,000·2.24억→870,000 **교재 3값 원단위 일치**. ★`property-tax-comprehensive-aggregate.ts:415` 주석 "2,550,000"은 오기(코드 정상) — Do에서 주석 정정 |
| 토지 종부세 세율 연도 불변 | `COMPREHENSIVE_LAND_CONST`(legal-codes/comprehensive.ts:140~) 1/2/3%·0.5/0.6/0.7%·누진공제 — 사례10·11 당해('22)/직전('21) 양쪽 검산 일치 | 직전연도 재계산에 **현행 세율 함수 재사용 가능**(2021·2022 개정 없음 — 상수 실측) |
| 종합합산 세부담상한(직접입력) | `comprehensive-land-aggregate.ts:85~103` `applyAggregateLandTaxCap` | §15 150% — previousYearTotalTax 직접입력만 |

### 갭 (신규 구축)

| # | 갭 | 내용 | 규모 |
|---|---|---|---|
| **G-1** | 필지별 토지 입력 + 재산세 자동계산 | `LandParcelInput[]`(지자체 그룹·면적·지분율·당해/직전 ㎡당 공시지가) → 지자체별 관내 합산 → ×70% → §111 누진 → §122 Min(직전 표준세율 재산세상당 × 150%) → ②ⓐ 합산. **종합합산·별도합산 각각** | 엔진 신규 모듈 |
| **G-2** | 토지 직전연도 종부세상당액 | `calcLandPreviousYearEquivalent`(종합합산·별도합산) — 직전 공시 합산 → (합산−공제)×직전 `fairMarketRatioLand` → 누진 → 공제할 재산세(ⓐ−ⓑ) → ④나②. 주택 `comprehensive-prior-year.ts` 동형 신규 파일 | 엔진 신규 모듈 |
| **G-3** | **별도합산 세부담상한** | 현행 "세부담 상한 없음" 주석(`comprehensive-separate-land.ts:10`) ↔ 교재 사례11 ④ 상충. **§15가 별도합산 포함하는지 KoreanLaw 축자 검증 후** 추가(Pre-Do 게이트 — `feedback_engine_comment_vs_impl_drift`) | 엔진 수정 + 법령 검증 |
| **G-4** | 토지 재산세 직전연도 표준세율 재계산 | ②ⓐ Min의 비교값·④나① — 직전 ㎡당 공시지가에서 지자체별 재계산(감면·탄력세율 없음 가정 v1). 교재 870,000·3,705,000 | G-1에 포함 |
| **G-5** | 결과 echo 확장 | 필지·지자체별 분해(`perJurisdiction[]`)·직전연도 detail·재산세 FMR 70%·누진공제 — 전부 `number`/배열(Map 금지) | 타입 확장 |

> **G-3 주의**: 별도합산 상한 추가는 **기존 결정세액을 바꾸는 계산 변경**(현행: 상한 미적용 → 적용 시 감소 가능). 직접입력 `previousYearTotalTax`가 별도합산 입력에 아예 없으므로(`SeparateLandEntry` 4필드 — `comprehensive-wizard-store.ts:67~72`) 현행 사용자 경로에서는 영향 0(입력 부재 = 상한 생략). 신규 필드 추가 시에만 활성 — 회귀 0 보장.

---

## 4. 케이스 매트릭스 (Do 진입 게이트)

| # | 케이스 | 입력 | 기대값 (원단위 anchor) |
|---|---|---|---|
| L-01 | 사례10 종합합산 풀 | 필지 3건(서초 200㎡·50%·4.3M/3.2M + 송파 100㎡·3.7M/3.3M + 송파 200㎡·5M/4M) | ① 13,000,000 / ②ⓐ 5,800,000(1,255,000+4,545,000) / ②ⓑ 4,550,000 / ②ⓒ 6,050,000 / ②ⓓ 4,361,983 / ③ 8,638,017 / ④가 14,438,017·나 10,604,916(4,575,000+6,029,916)·나②ⓑ 2,995,084·다 15,907,374·초과 0 / ⑤ 8,638,017 |
| L-02 | 사례11 별도합산 풀 | 필지 3건(평창 100,000㎡·50%·180k/160k + 용인 100,000㎡·140k/130k + 용인 200,000㎡·140k/130k) | ① 241,000,000 / ②ⓐ 140,400,000 / ②ⓓ 119,379,661 / ③ 121,620,339 / ④가 262,020,339·나 228,714,663·나②ⓑ 102,785,337·**다 343,071,994(엔진 floor — 교재 995는 ×1.5=…994.5의 round 표기, 1원 차이·초과 판정 영향 0. anchor는 floor값)**·초과 0 / ⑤ 121,620,339 |
| L-03 | 집계 직접입력(기존) 종합합산 | 현행 `AggregateLandForm` 4필드 | 기존 anchor 불변 — 카드는 ②ⓐ 지역 분해·④나 분해 없는 축약 렌더 |
| L-04 | 필지 모드 + 직전연도 미입력(서브모드 없음) | 당해 공시지가만 | ②ⓐ Min 행 없음(상한 비교 불가 → 표준세율 재산세 그대로)·④ "직전연도 미입력 — 상한 계산 생략" |
| L-05 | 별도합산 80억 이하 | 공시 합산 ≤ 80억 | `isSubjectToTax=false` → 카드 "납세의무 없음" 단축 |
| L-06 | 종합합산 5억 이하 | 동일 | 동일 단축 |
| L-07 | 상한 발동 | 직전 총세액상당 축소 fixture | ④ 초과 > 0 · ⑤ = ③ − ④ (주택분 M-04 비항등 검증 동형 — 토지 `applyAggregateLandTaxCap` 산식 실측 후 ④·⑤ 표시 분리) |
| L-08 | 단일 지자체·단일 필지 | 최소 입력 | ≪지역≫ 블록 1개 — 필지 "•" 나열 생략(교재 서초구 패턴: 필지 1건이면 공시가격 한 줄) |
| L-09 | 2021 귀속 | assessmentYear=2021 | 당해 FMR 95% 정상. **직전연도 자동계산은 2022+ 귀속 한정 게이팅 확정** — 실측: historical 2020 엔트리 부재·`getComprehensiveParams(2020)`→default(현행 100%) fallback이라 2020 FMR 오적용 위험. 2021 귀속은 직접입력만 + validate 차단 |
| L-10 | 종합합산+별도합산 동시 | 양쪽 필지 | 카드 2장 독립 렌더 · 농특세 양쪽 모두 미표기 |
| L-11 | 필지 모드 + 직전 총액 직접입력 | 서브모드 direct + previousYearTotalTax | ②ⓐ Min 행 없음(§122 비교값 부재 — 직전 표준세율 재계산 불가)·④나 총액만(분해 없음)·상한은 계산 |

---

## 5. 타입·엔진 설계 (신규 파일 `lib/tax-engine/comprehensive-land-prior-year.ts` + 타입 확장)

```ts
/** 필지 1건 (종합합산·별도합산 공용) */
export interface LandParcelInput {
  parcelId: string;
  jurisdiction: string;            // 재산세 관내 합산 그룹 (예: "서초구") — 지방세법 §113
  name?: string;                   // 표시용 (예: "송파구-1")
  area: number;                    // 총면적 (㎡)
  shareRatio: number;              // 지분율 (0~1, 기본 1)
  officialPricePerSqm: number;     // 당해 개별공시지가 (원/㎡)
  priorOfficialPricePerSqm?: number; // 직전연도 (직전연도 자동계산 옵트인 — 전 필지 입력 시 활성)
}

/** ★ 입력 위치 확정(R1-11): ComprehensiveTaxInput 레벨에 추가 (집계 landAggregate·landSeparate와 상호배타 — Zod refine).
 *  orchestrator(comprehensive-tax.ts)가 필지→집계 변환 + §122 Min 재산세 자동계산 후
 *  기존 calculateAggregateLandTax/calculateSeparateAggregateLandTax를 **시그니처 무변경** 호출,
 *  반환 result에 분해 echo(perJurisdiction·previousYearEquivalent) 부착. */
//   landAggregateParcels?: LandParcelInput[];
//   landSeparateParcels?: LandParcelInput[];
//   ※ 직전연도 자동 서브모드는 별도 플래그 없음(엔진) — priorOfficialPricePerSqm 전 필지 존재 = 자동
//     (Zod 전부-or-전무 refine. UI 서브모드 토글은 클라 전용 상태 — STEP 10 통합비교 정합)
//   landSeparatePreviousYearTotalTax?: number;  // 별도합산 직접입력 (G-3 신규)
//   ★ ⓒ 분모 입력(propertyTaxBase)은 전체 공시합산 × 70% **단일 floor** — Σ 지자체별 floor 금지
//     (engine.design D1-1 — floor 경로 불일치 1원 차)

/** 지자체별 재산세 분해 echo (②ⓐ ≪지역≫ 블록 1:1) */
export interface LandJurisdictionPropertyTax {
  jurisdiction: string;
  parcels: { parcelId: string; name?: string; officialValue: number }[]; // "•" 나열
  officialValueSum: number;        // 공시가격 합산
  propertyTaxBase: number;         // × 70%
  appliedRate: number; progressiveDeduction: number;
  standardTax: number;             // 상한 적용 전
  priorStandardTax?: number;       // 직전연도 재산세상당 (재계산)
  capAmount?: number;              // 직전 × 150% (§122)
  imposedTax: number;              // Min — ②ⓐ 합산 요소
}

/** 토지 직전연도 종부세상당액 (④나 — 주택 PreviousYearEquivalentResult 동형) */
export interface LandPreviousYearEquivalent {
  propertyTaxEquiv: number;        // 나① (지자체 합산)
  comprehensiveTaxEquiv: number;   // 나② (ⓐ − ⓑ — 토지는 세액공제 ⓒ 없음)
  total: number;
  detail: {
    officialValueSum: number; basicDeduction: number; fairMarketRatio: number;
    taxBase: number; appliedRate: number; progressiveDeduction: number; calculatedTax: number;
    stdTaxNumerator: number; stdTaxDenominator: number; creditAmount: number;
    /** ④나① ≪지역≫ — 직전연도는 §122 Min 미적용(표준세율 재계산 그대로, 교재 870,000)
     *  → 슬림 구조(R1-6): Min·cap 필드 없음 */
    perJurisdiction: {
      jurisdiction: string;
      parcels: { parcelId: string; name?: string; officialValue: number }[];
      officialValueSum: number; propertyTaxBase: number;
      appliedRate: number; progressiveDeduction: number;
      standardTax: number;          // 표준세율 재산세상당 (Min 없음)
    }[];
  };
}

// AggregateLandTaxResult·SeparateAggregateLandTaxResult 확장 (전부 optional — 집계 모드 회귀 0):
//   perJurisdiction?: LandJurisdictionPropertyTax[];   // ②ⓐ 분해
//   previousYearEquivalent?: LandPreviousYearEquivalent; // ④나 분해
//   propertyFairMarketRatio?: number;                  // 70% echo
//   taxBeforeCap?: number;                             // ③ echo
//   currentYearTotalEquivalent?: number;               // ④가 echo
//   taxCap?: TaxCapResult;                             // 별도합산 신규 (G-3 — §15 검증 후)
```

- **정수 연산**: ⓓ·④나②ⓑ 안분은 `safeMultiplyThenDivide` + `Math.floor`(기존 패턴). 세율 곱은 분수 정수(`feedback_applyrate_fractional_rate_one_won_error`).
- **단일 진실**: 재산세 누진은 기존 `calculateComprehensiveAggregateTax`·별도합산 함수 재사용(시그니처 부적합 시 순수 wrapper — 세율표 복제 금지). 누진공제(250,000·1,200,000)는 `PROPERTY_CONST`/`PROPERTY_SEPARATE_CONST` import.
- **카드 산식 표시용 구간 헬퍼**: 주택분 `getHousingStandardRateBracket` 동형으로 토지 2종 export(또는 echo).

---

## 6. UI 입력 설계 (Step 4 토지 정보)

```
[RadioCardGroup] 토지 입력 방식 (종합합산·별도합산 각각)
  ○ 집계 직접 입력 (기존 — 기본값)   ○ 필지별 자동 계산 (신규)
── 집계 모드: 기존 AggregateLandForm/SeparateLandEntry 그대로 (회귀 0)
── 필지 모드: 필지 카드 반복 [+ 필지 추가]
     시군구(재산세 합산 그룹) · 필지명(선택) · 면적 ㎡ (DecimalInput) · 지분율 % (DecimalInput, 기본 100)
     당해 개별공시지가 (LandPriceLookupField — 원/㎡ 필수)
     ── 직전연도(세부담상한) 서브모드 토글 (주택분 direct/auto 동형):
        ○ 직전 공시지가로 자동 계산 → 필지별 직전 개별공시지가 (전 필지 필수 — 일부 입력 = 검증 오류)
        ○ 직전연도 총세액 직접 입력 → previousYearTotalTax CurrencyInput 1칸
        ○ (미입력) → 세부담상한 계산 생략
     [안내] 자동 계산은 2022년 이후 귀속에서만 지원 (L-09 — 2021 귀속은 직접 입력)
```

- **지분율 % ↔ 엔진 0~1 변환**: UI·store는 % 문자열(기본 "100"), API 변환(④)에서 `/100`, validate(⑧)에서 `0 < x ≤ 100`. 엔진 `shareRatio`는 0~1 — 변환 지점 단일(④).
- **별도합산 직전연도 총세액 직접입력 필드 신규**(G-3 상한 활성용 — 현행 `SeparateLandEntry`에 부재). 종합합산은 기존 `AggregateLandForm.previousYearTotalTax` 재사용.

- 개별공시지가는 `LandPriceLookupField` 필수(`feedback_land_price_lookup_field`). 면적·지분율은 `DecimalInput`+`parseDecimal`.
- 모드 전환 시 반대편 값 보존, API 전송은 모드 측만(④ strip).
- 직전 공시지가 **부분 입력 = validate 차단**(전 필지 or 0건 — `feedback_no_silent_apportion_fallback`·혼합 시나리오 옵션1).
- 지분율 기본 100%: store factory=normalize=UI 3중 일치(`feedback_store_default_vs_ui_display_fallback`).

---

## 7. 카드 설계 (`components/calc/results/comprehensive-payable-calc/` 확장)

```
├── payable-calc-helpers.tsx            # 기존 재사용 (won·eok·pct·StepLine·Bullet·GaNaDaLine)
│     + DashBullet("−")·ParcelDot("•")·JurisdictionBlock(≪지역≫) 프리미티브 추가
├── HousingPayableTaxCalcCard.tsx       # 기존 (무변경)
├── LandPayableTaxCalcCard.tsx          # 신규 — kind: "aggregate" | "separate" 단일 컴포넌트
│     (①~⑤ 구조 동일, 라벨·세율·공제만 result에서 — 분기 중복 차단)
└── land-payable-sections.tsx           # 800줄 대비 — ②ⓐ 지역 블록·④나 분해 서브 컴포넌트
```

- 제목: `[종합합산토지분 종합부동산세 납부할세액의 계산]` / `[별도합산토지분 …]`(교재 동결).
- 배치: 주택분 카드(`housing-payable-calc` PrintSection) **바로 아래** 2장 — `land-aggregate-payable-calc` → `land-separate-payable-calc`. 기본 접힘 + CSS-only 인쇄(동일 패턴).
- 게이팅: 종합합산 카드 = `result.aggregateLandTax` 존재 / 별도합산 = `result.separateLandTax` 존재. ②ⓐ ≪지역≫·④나 분해 = `perJurisdiction`·`previousYearEquivalent` 존재(필지 모드) — 집계 모드는 축약(②ⓐ 한 줄·④나 총액만).
- ★ 토지 result `propertyTaxCredit` 필드명은 주택과 상이(`propertyTaxAmount` — `types/comprehensive.types.ts:395` 인라인 vs 주택 `totalPropertyTax`). 카드는 토지 필드명으로 소비(engine.design D-5).
- ④·⑤ 표시: 주택분 검증 교훈 적용 — **④ 초과세액 = `max(0, ④가 − ④다)`(교재 정의), ⑤ = `determinedTax`(엔진 클램프)**. 항등 가정 금지(L-07 anchor로 분기 실증).
- 농특세 미표기(⑤ 종료 — 기존 토지 섹션에만).
- print leaf 2종 추가(12→14종) + `availablePrintIds` + print 테스트 카운트 갱신(주택분 때 11→12 정정 전례).

---

## 8. 14 동기화 지점 (이번엔 입력 신규 — 전 지점 해당)

| 지점 | 내용 |
|---|---|
| ① 폼 타입 | `LandParcelForm[]`(aggregate·separate) + `landInputMode: "summary" \| "parcels"` ×2 + 직전연도 서브모드 ×2 + **별도합산 `previousYearTotalTax` 신규**(R1-4) |
| ② initial | mode="summary"·parcels=[]·지분율 "100"·서브모드 기본값 |
| ③ normalize | 구 세션 mode 부재 → "summary"(기존 동작 보존 — store 자체 migrate `:330~340` 블록) |
| ④ API 변환 | `comprehensive-api.ts` — parcels 모드 시 `landAggregateParcels` 구성·집계 필드 strip(상호배타), 반대 동일. **지분율 % → /100 변환(단일 지점)** |
| ⑤ UI 위젯 | §6 필지 카드 (LandPriceLookupField·DecimalInput) + 직전연도 서브모드 토글 |
| ⑥ 사이드바 | **해당 없음 — 실측: 종부세 마법사에 사이드바 합계 미구현**(page.tsx·WizardSidebar 참조 부재). 신설은 범위 외 |
| ⑦ 결과 카드 | §7 카드 2종 + print leaf 2종 + 기존 `AggregateLandSection` 무변경 |
| ⑧ validation | parcels 모드: 필지≥1·면적>0·지분율 0<x≤100·당해 공시지가 필수·직전 공시지가 전부-or-전무·**자동 서브모드는 2022+ 귀속만**(L-09). **UI 통과↔validate 차단 모순 금지** |
| ⑨⑩ Zod enum | `landInputMode`는 클라 전용(객체 유무로 표현) — 신규 enum 없음 |
| ⑪ | 해당 없음 |
| ⑫ Zod 입력 객체 | `landParcelSchema`(zod) + 집계·필지 동시 입력 refine 차단 + **38필드 strip 전례 컴파일가드**(`project_acquisition_review_r1`) |
| ⑬ body spread | `landAggregateParcels`·`landSeparateParcels` 포함 — grep 자가점검 |
| ⑭ Route 매핑 | route.ts 엔진 input 매핑(날짜 없음 — Date 변환 불요, 숫자 그대로) |

---

## 9. 테스트

- **9-1 엔진 anchor** (`__tests__/tax-engine/comprehensive-land-case10-11.test.ts` 신규): L-01·L-02 전 칸 원단위 `toBe()`(§4 표) + L-04·L-07·L-09 경계. 기존 토지 anchor(사례 직접입력) **불변** 확인.
- **9-2 카드 RTL** (`__tests__/components/comprehensive-land-payable-calc.test.tsx`): 사례10·11 실결과 렌더 — ①~⑤·≪지역≫ 블록·"•" 나열·Min 행·④나 분해 + 집계 모드 축약 + 비대상 단축 + **⑤에 농특세 미표기** + L-07 ④·⑤ 비항등. `afterEach(cleanup)` 필수(전역 cleanup 부재 — 주택분 전례).
- **9-3 E2E** (`e2e/comprehensive-land-payable-calc.spec.ts`): 사례10 필지 3건 입력 → 계산 → 카드 기본 접힘 → 펼침 → ⑤ 8,638,017 단언 + 주택분 카드 아래 DOM 순서 + 콘솔 에러 0. 사전존재 실패 ~23건 — 본 spec 단독 판정.

---

## 10. Pre-Do 게이트 (강제)

1. **KoreanLaw 축자 검증 2건** (`korean-law-citation-verify`):
   - **§15 별도합산 세부담상한 포함 여부**(G-3) — 2022 행위시법. 교재 사례11 ④가 적용하므로 포함 예상이나 **검증 전 단정 금지**. 검증 결과로 `comprehensive-separate-land.ts:10` 주석 드리프트 정정 방향 확정.
   - **지방세법 §122 토지 상한율** — 교재는 토지 flat 150%(주택 105/110/130 구간과 다름). §122 본문·`PROPERTY_CONST.TAX_CAP_RATE_LAND: 1.50`(`legal-codes/property.ts:224`) 정합 확인.
2. **엔진 anchor 우선 실행**: L-01 ②ⓐ(지자체 Min)·④나② 2개 칸을 신규 모듈 골격으로 우선 계산 → 교재 일치 실패 시 설계 환류(`pre-do-anchor-verification`).
3. ✅ **재산세 기존 함수 적합성 — 실측 완료(2026-06-12 본 검토)**: `applyBurdenCap(grossTax, prev?)` 재사용 적합 / `allocateByJurisdiction` 부적합(총세액 안분 용도 — 신규 그룹핑) / `calculateComprehensiveAggregateTax` probe 교재 3값 일치(누진공제 250,000 정상·`:415` 주석만 오기).
4. ✅ **L-09 실측 확정**: historical 2020 부재·default fallback → 직전연도 자동계산 2022+ 귀속 한정 게이팅(§4 L-09).

---

## 11. PR 분할 (규모 — 3 PR)

| PR | 내용 | 게이트 |
|---|---|---|
| **PR-L1 엔진** ✅완료(2026-06-12) | 타입 + `comprehensive-land-parcels.ts`·`comprehensive-land-prior-year.ts`·`comprehensive-land-adapter.ts` + 별도합산 §15② 상한(G-3) + echo. **사례10·11 전 칸 anchor 일치**(LD-A1~A3·LD-B). tsc 0·전체 vitest 7893·lint 0·회귀 0(T15 §15② 정정 1건) | ✅ |
| **PR-L2 입력** ✅완료 | store(필지 폼·모드·서브모드·액션·migrate) + `LandParcelSection`(양 kind) + page.tsx Step4 통합 + API 변환(%→/100·상호배타 strip) + Zod(landParcelSchema·3 refine) + route 매핑 + validate(`validateLandParcels`). KoreanLaw §15②·§122 검증 완료(D-2·D-3) | ✅ |
| **PR-L3 카드** ✅완료 | `LandPayableTaxCalcCard`(①~⑤·≪지역≫·④나 분해) + helpers(Dash/Parcel/Jurisdiction) + print leaf 2종(12→14) + 결과뷰 배치. RTL 6·E2E 1(사례10 필지 입력→카드 ⑤ 8,638,017 브라우저 검증). 전체 vitest 7899·tsc 0·lint 0 | ✅ |

> **전체 완료(2026-06-13)**: 토지분 산출근거 카드 종합합산·별도합산 2종. 교재 사례10·11 100% 재현. 별도합산 §15② 세부담상한 드리프트 정정 포함.
| **PR-L2 입력** | store(①②③) + UI(§6) + API·Zod·validate(④⑧⑫⑬⑭) | 14지점 grep 자가점검 · E2E 입력 경로 |
| **PR-L3 카드** | 카드 2종 + helpers 확장 + print leaf 2종 + RTL·E2E | 전체 `npm test` · 브라우저 검증(E2E) |

---

## 12. 리스크

| 항목 | 처리 |
|---|---|
| G-3 별도합산 상한 = 계산 변경 | 입력 필드 신규(현행 경로 영향 0) + KoreanLaw 검증 + 기존 anchor 불변 |
| ②ⓐ 재계산 ≠ 실제 고지 재산세(감면·탄력세율) | v1 가정 명시(교재 "감면·탄력세율 없음") + 카드에 가정 안내 1줄 + 집계 직접입력 모드 보존(고지서 값 사용 경로) |
| 지자체 그룹 자유 텍스트 → 합산 오류 | 동일 문자열 = 동일 그룹 명시 안내 + trim 정규화. v2에서 주소 검색 연동 검토 |
| ④·⑤ 항등 오인 | 주택분 검증 교훈 선반영(§7) + L-07 anchor |
| 1원 오차(ⓓ 안분 floor) | `safeMultiplyThenDivide` + 교재값 원단위 anchor — ⓓ는 사례10·11 floor 일치 실증. **사례11 ④다는 ×1.5=…994.5 → 엔진 floor 994 vs 교재 round 995(1원, 판정 영향 0 — L-02 anchor는 floor)** |
| 800줄 | 카드 단일 + sections 분리. 엔진 신규 파일 분할 |
| print 테스트 카운트 | 12→14 갱신(주택분 전례 자가점검) |
