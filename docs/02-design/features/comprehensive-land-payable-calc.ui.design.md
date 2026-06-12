# 종부세 토지분 "납부할세액의 계산" — UI 설계 (ui.design)

> Plan: `comprehensive-land-payable-calc-card.plan.md` / Engine: `comprehensive-land-payable-calc.engine.design.md`
> 선행 재사용: `components/calc/results/comprehensive-payable-calc/payable-calc-helpers.tsx`(won·eok·pct·StepLine·Bullet·GaNaDaLine) — 주택분 카드 ✅완료분
> 패턴: `print-only-css-toggle` · 교재 narrative "원"·"억원" 표기 유지(주택분 카드 전례 — no-won 규칙의 예외)

---

## 1. 카드 칸 매핑표 (동결 — 교재 사례10·11 ①~⑤)

testid: `land-agg-payable-step{N}` / `land-sep-payable-step{N}` (kind별 prefix — `feedback_pdf_table_row_one_to_one_mapping`).
★ = 토지 result 필드명 주의(주택과 상이 — engine.design D-5).

| 칸 | 라벨(동결) | 사례10 값 | result 필드 (`aggregateLandTax` 기준 — separate 동형) |
|---|---|---|---|
| ① | 재산세공제전 종합부동산세액 | 13,000,000 | `calculatedTax` (bullet: `totalOfficialValue`·`basicDeduction`·`fairMarketRatio`·`taxBase`·`appliedRate`·`progressiveDeduction`) |
| ②  | 공제할 재산세액 | 4,361,983 | `propertyTaxCredit.creditAmount` |
| ②ⓐ | 해당연도('N년) 재산세액 | 5,800,000 | ★`propertyTaxCredit.propertyTaxAmount` — ≪지역≫ 블록 = `perJurisdiction[]`(공시·과표·상한전·직전·상한액·Min 6행) |
| ②ⓑ | 종합부동산세 과세표준에 대한 표준세율재산세액 | 4,550,000 | `propertyTaxCredit.comprehensiveTaxBase` (산식: `taxBase`×`propertyFairMarketRatio`×rate — 누진공제 없음) |
| ②ⓒ | 총표준세율재산세액 | 6,050,000 | `propertyTaxCredit.propertyTaxBase` (산식: 공시합산×70%×rate−누진공제) |
| ②ⓓ | 공제할 재산세액(ⓐ × ⓑ / ⓒ) | 4,361,983 | `creditAmount` + 산식 echo |
| ③ | 세부담 상한전 종합부동산세액(① − ②) | 8,638,017 | `taxBeforeCap`(신규 echo) |
| ④ | 세부담 상한 초과세액(가 − 다 ≥ 0) | 0 | `max(0, currentYearTotalEquivalent − taxCap.capAmount)` — 교재 정의. **⑤와 비항등**(주택 M-04 교훈) |
| ④가 | 해당연도 총세액상당액(= ②의ⓐ + ③) | 14,438,017 | `currentYearTotalEquivalent`(신규 echo) |
| ④나 | 직전연도 총세액상당액(① + ②) | 10,604,916 | `previousYearEquivalent.total` (분해: `.propertyTaxEquiv`·`.comprehensiveTaxEquiv`·`.detail.*`·④나① `perJurisdiction`) |
| ④다 | 세부담 상한액(나 × 150%) | 15,907,374 (사례11: **994** — floor) | `taxCap.capAmount` + 초과 판단 문장(주택분 `payable-step5-judgment` 동형) |
| ⑤ | 납부할세액(③ − ④) | 8,638,017 | `determinedTax`(엔진 클램프 — 단일 진실) |

- 세율·누진공제 라벨: `appliedRate`·`progressiveDeduction` echo + 재산세 구간은 `getLandStandardRateBracket`(엔진 신규 export — 주택 `getHousingStandardRateBracket` 동형). UI 세율표 하드코딩 금지.
- **농특세 미표기**(⑤ 종료 — 기존 `AggregateLandSection`에만).
- 필지 산식 행("200㎡ × 50%(지분율) × 4,300,000원 = 4.3억원"): `parcels[].{area,shareRatio,pricePerSqm,officialValue}` echo 소비(U1-1 — UI 재계산 금지). 지분율 100%는 `× N%(지분율)` 생략.
- `isSubjectToTax === false` → ①~⑤ 대신 "납세의무 없음" 단축 1줄(주택분 카드 동형).

## 2. 컴포넌트 구조

```
components/calc/results/comprehensive-payable-calc/
├── payable-calc-helpers.tsx        # 기존 + DashBullet("−")·ParcelDot("•")·JurisdictionBlock(≪지역≫) 추가
├── HousingPayableTaxCalcCard.tsx   # 무변경
├── LandPayableTaxCalcCard.tsx      # 신규 — props: { kind: "aggregate"|"separate", result }
│                                   #   제목·result 선택·기본공제 라벨만 kind 분기 (~350줄)
└── land-payable-sections.tsx       # ②ⓐ JurisdictionBlock 목록·④나 분해 (800줄 대비)
```

- 접힘: 주택분 카드 패턴 1:1(`useState(false)` + `print:hidden` 헤더 + `expanded ? "block" : "hidden print:block"`).
- 톤: 주택분 emerald와 구분 — **sky** 정적 클래스(토지). 카드 2장 같은 톤.
- ≪지역≫ 블록: `≪{jurisdiction} 토지≫` 서브헤더 + "−" 행 6종. 필지 ≥2일 때만 "•" 나열(`parcels.length > 1` — 교재 서초구=1필지 한 줄·송파구=2필지 나열).
- 지분율 표시: `shareRatio < 1`일 때만 산식에 `× N%(지분율)` 삽입(교재 서초 50%).

## 3. 배치 (`ComprehensiveTaxResultView.tsx`)

`housing-payable-calc` PrintSection 직후:
```tsx
{result.aggregateLandTax && (
  <PrintSection id="land-agg-payable-calc" …>
    <LandPayableTaxCalcCard kind="aggregate" result={result.aggregateLandTax} />
  </PrintSection>
)}
{result.separateLandTax && ( <PrintSection id="land-sep-payable-calc" …> … )}
```
print leaf 2종(12→14) — `group:payable-calc`에 추가. `availablePrintIds`: 각 land result 존재 시. **print 카운트 테스트 12→14 갱신**(주택분 전례).

## 4. 필지 입력 위젯 (Step 4 토지 정보 — Plan §6)

```
◉ 토지 입력 방식 [RadioCardGroup tone=sky inline]
  ○ 집계 직접 입력 (기존)        ○ 필지별 자동 계산
┌─ 필지 1 ──────────────────────────────── [삭제] ┐
│ 시군구(재산세 합산) [서초구    ]  필지명(선택) [   ] │
│ 면적(㎡) [DecimalInput]  지분율(%) [DecimalInput=100] │
│ 당해 개별공시지가 [LandPriceLookupField 원/㎡]        │
│ (자동 서브모드 시) 직전연도 개별공시지가 [동일 위젯]    │
└──────────────────────────────────────────────────┘
[+ 필지 추가]
◉ 직전연도(세부담상한) [RadioCardGroup] 자동(직전 공시지가) / 직접(총액) / 미입력
   직접 → previousYearTotalTax CurrencyInput (별도합산은 신규 필드)
   [안내] 자동 계산은 2022년 이후 귀속만 지원
```
- 시군구 동일 문자열 = 동일 그룹(trim) 안내 1줄. 종합합산·별도합산 **각각** 동일 위젯 세트.
- UI 서브모드 토글은 클라 전용 상태 — API 전송은 필드 존재로 표현(plan §5 정합).

## 5. 14 동기화 지점 (UI측 상세 — Plan §8과 1:1)

①store `LandParcelForm`(string 필드)+mode+서브모드+별도 prevTax / ②initial(지분율 "100") / ③store migrate fallback / ④`comprehensive-api.ts` %→/100·모드별 strip / ⑤§4 위젯 / ⑥해당 없음(사이드바 부재 실측) / ⑦§1~§3 / ⑧parcels≥1·면적>0·0<지분≤100·직전 전부-or-전무·자동은 2022+ / ⑨⑩신규 enum 없음 / ⑪해당 없음 / ⑫`landParcelSchema`+상호배타 refine+컴파일가드 / ⑬body spread grep / ⑭route 매핑(Date 없음).

## 6. RTL·E2E

- RTL `__tests__/components/comprehensive-land-payable-calc.test.tsx`: 사례10·11 실결과 — §1 전 칸 + ≪지역≫ 2블록·"•" 나열(송파만)·지분율 표기(서초만)·집계 모드 축약·비대상 단축·④/⑤ 비항등(M-08)·**농특세 미표기**. `afterEach(cleanup)` 필수.
- E2E `e2e/comprehensive-land-payable-calc.spec.ts`: 사례10 필지 3건 입력 → ⑤ 8,638,017 + 기본 접힘 + 주택분 카드 아래 DOM 순서 + 콘솔 에러 0.

## 7. 케이스 매트릭스 (UI)

| # | 케이스 | 동작 |
|---|---|---|
| U-1 | 필지+자동 | 풀 렌더(≪지역≫·④나 분해) |
| U-2 | 필지+직접 총액 | ②ⓐ Min 행 없음·④나 총액 1줄 |
| U-3 | 집계 모드(기존) | ②ⓐ 1줄·④나 총액 — 카드 자체는 렌더 |
| U-4 | 직전 미입력 | ④ "직전연도 미입력 — 상한 계산 생략" 1줄 |
| U-5 | 비대상(5억/80억 이하) | "납세의무 없음" 단축 |
| U-6 | 종합+별도 동시 | 카드 2장·독립 접힘 상태 |
| U-7 | 별도합산(G-3 전 단계) | §15 검증 결과 미적용 확정 시 ④ "상한 미적용" 문구로 대체(엔진 결과 추종 — UI 자체 판단 금지) |
