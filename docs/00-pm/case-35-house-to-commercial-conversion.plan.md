# 사례 35 — 주택을 상가로 용도변경 구현 계획

> 출처: 2023 양도·상속·증여세 이론 및 계산실무, 제7장 일반건물 계산사례 35
> (양도코리아 PDF, 페이지 539–544)

## 1. 사례 요약

**갑氏 2주택자 (조정대상지역)** — A주택 + B주택 보유 상태에서 A주택을 상가로 용도변경 후 양도.

| 항목 | 값 |
|---|---|
| A주택 취득일 | 2008-05-02 |
| A주택 → A상가 용도변경일 | 2020-08-07 |
| 양도일 | 2023-02-19 |
| 양도가액 | 800,000,000원 |
| 취득가액 (실가) | 400,000,000원 |
| 필요경비 | 0원 |
| B주택 | 2010-02-07 보유 중 (다주택 상태) |

**핵심 분기 조건**: 다주택자 상태에서 주택을 상가로 용도변경 → 양도시점이 **중과배제기간(2022.5.10 ~ 2024.5.9)** 내.

## 2. 양도코리아 PDF 산출 결과 (Anchor 값)

| 항목 | 값 (원) |
|---|---:|
| 양도가액 | 800,000,000 |
| 취득가액 | 400,000,000 |
| 양도차익 | 400,000,000 |
| 장기보유특별공제 | **0** ← 핵심 |
| 양도소득금액 | 400,000,000 |
| 기본공제 | 2,500,000 |
| 과세표준 | 397,500,000 |
| 세율 | 40% (§55 일반 누진세율, 중과배제기간) |
| 산출세액 | **133,060,000** |
| 농어촌특별세 | 0 |
| 지방소득세 | **13,306,000** |
| 자산종류 코드 | 기타건물(4) |
| 세율구분 | 2년이상(누진세율) |

세율 검증: 397,500,000 × 40% − 25,940,000(누진공제) = 133,060,000 ✓

## 3. 법령·해석 근거

| 조문 | 내용 |
|---|---|
| **양도소득세 집행기준 99-164-10** | 주택 → 상가 용도변경 시 환산취득가 산정 (사례에서는 실가 알려져 불요) |
| **서울행법 2012구단26961 (2013.04.24)** | 다주택자가 주택을 근린생활시설로 용도변경 후 양도 — **변경일 전 기간은 장특공제 배제** |
| **사전법령해석재산 2021-939 (2021.11.08)** | 동일 취지 |
| **사전법규재산 2022-684 (2022.11.28)** / **2022-881 (2022.12.28)** | 조정대상지역 다주택자가 중과배제기간 중 양도 시 — **장특공제 보유기간 기산일 = 용도변경일** |
| 소득세법 §95② / §103 / §104 | 장특공제 / 양도소득 기본공제 250만 / 세율 적용 |

**3가지 케이스 분기** (PDF 540p 표):

| 구분 | 장특공제 보유기간 기산 | 양도코리아 입력 |
|---|---|---|
| 1주택 상태에서 용도변경 | 당초 취득일 ~ 양도일 (표1) | 중과대상 "아니오" |
| 다주택 상태에서 용도변경 | 변경일 이전 기간 **배제** | 중과대상 "예" + 용도변경일 |
| 조정대상지역 다주택 + 중과배제기간 양도 | **용도변경일** ~ 양도일 | 중과대상 "예" + 용도변경일 |

본 사례는 케이스 3. **장특공제 보유기간 = 2020-08-07 ~ 2023-02-19 ≈ 2년 6개월 → 3년 미만 → 장특공제 0**.

## 4. 신규 분기 — 기존 코드와의 차이

### 4-1. 기존 자산
- `propertyType: "general_building"` (사례 31~33 기 구현)
- 일반건물 환산취득가/일괄취득가 산식 보유
- `mixed-use` 계열: **겸용주택 일부 용도변경** (단일 → 혼용). 본 사례와 다름.

### 4-2. 본 사례 신규 분기
- **단일 용도 → 단일 용도** 전체 용도변경 (주택 전체 → 상가 전체)
- 양도시점: 일반건물 (취득시 자료를 알면 실가 진행, 모르면 §99-164-10 환산)
- LTHD 기산일을 **용도변경일로 강제 이동** (다주택+중과배제기간 케이스)

### 4-3. 필수 신규 필드 (AssetForm)

| 필드 | 타입 | 의미 |
|---|---|---|
| `houseToCommercialConversion` | boolean | "주택→상가 용도변경" 토글 |
| `conversionDate` | Date | 용도변경일 |
| `wasMultiHouseAtConversion` | boolean | 변경 당시 다주택자(중과대상) 여부 ("예/아니오") |

> **설계 결정 (검토 반영)**: 조정대상지역 + 중과배제기간 자동 도출은 **본 PR에서 하지 않음**. 조정대상지역 지정/해제 이력(강남3구·용산 vs 그 외, 2023-01-05 해제 등)을 시점별로 다루려면 별도 `regulated_areas` 데이터 모듈 + 양도일 매트릭스가 선행돼야 함. 본 PR은 `wasMultiHouseAtConversion` 단일 토글로 단순화하고, "중과배제기간 윈도우 안에서 양도된 다주택자" 케이스는 **이 토글 ON + 양도일이 윈도우(2022-05-10 ~ 2024-05-09) 내** 조건으로 자동 판정.

> 환산취득가 분기는 사례에서 불필요(실가 보유). 단, 집행기준 §99-164-10에 의한 **취득당시 환산주택가격** 산정 로직은 후속 PR에서 `general-building-valuation.ts`에 분기 추가.

## 5. 엔진 변경 사항

### 5-1. 신규 모듈
**없음** — `general-building-valuation.ts` + `transfer-tax.ts` 본류에 분기 추가.

### 5-2. 핵심 로직 (transfer-tax.ts STEP 5/6 부근)

```ts
// 장특공제 보유기간 기산일 결정
function resolveLTHDStartForHouseToCommercial(asset: AssetForm): Date {
  if (!asset.houseToCommercialConversion) return asset.acquisitionDate;
  if (!asset.wasMultiHouseAtConversion) return asset.acquisitionDate; // 1주택 케이스
  // 다주택 케이스: 변경일 전 기간은 배제 — 변경일부터 기산
  return asset.conversionDate;
}
```

**LTHD 표 라우팅 (검토 반영)**:
- 양도시점 자산종류 = 상가(비주택) → `propertyType: "general_building"` → **§95② 표1** (연 2%, 최대 30%) 자동 라우팅. 표2(1세대1주택 최대 80%)는 적용 불가.
- 본 PR은 표 라우팅 자체를 건드리지 않음 — 기산일만 이동. 표1 라우팅이 사례 31~33과 동일하게 유지되는지 ⑦ 결과 카드 산식에서 재확인 (Check 단계 회귀).

**3년 미만 처리 (검토 반영)**:
- 기존 §95② 표1 로직이 "보유기간 3년 미만 → 공제율 0"을 이미 처리. **별도 early-return 분기 추가 금지**. 본 PR은 `LTHDStartDate`만 교체하면 자동 0% 산출.

### 5-3. 세율 적용
- 중과배제기간 양도 → §55 일반 누진세율 (기존 multi-house-surcharge-senior 모듈이 이미 처리)
- 조정대상지역 + 다주택 + **중과배제기간 미적용** 케이스: 별도 후속 사례에서 다룸 (본 PR 범위 밖)

### 5-4. 중과배제기간 윈도우 상수 (검토 반영)
- `lib/tax-engine/legal-codes/transfer.ts`에 `SURCHARGE_EXCLUSION_WINDOW = { start: "2022-05-10", end: "2024-05-09" }` **단일 상수 정의**.
- 다른 모듈에서 하드코딩된 동일 날짜가 있으면 본 PR에서 모두 이 상수로 치환 (single source of truth).

## 6. UI 변경 사항 (AssetForm — propertyType: general_building)

신규 UI 카드 (Step 2 또는 Step 3):

```
[ ] 주택 → 상가 용도변경
  └─ 용도변경일: [____]
  └─ 변경 당시 다주택자(중과대상)였습니까? ⊙ 예  ○ 아니오
       (예 선택 시 변경일 이전 보유기간은 장특공제에서 배제됩니다)
```

미리보기 카드: 변경일부터 양도일까지 보유연수 표시, 3년 미만 시 "장특공제 0%" 안내.

## 7. 14개 동기화 지점 체크리스트

- [ ] ① AssetForm 3개 필드 추가 (`houseToCommercialConversion`·`conversionDate`·`wasMultiHouseAtConversion`)
- [ ] ② initial state
- [ ] ③ normalize
- [ ] ④ lib/calc/transfer-api.ts
- [ ] ⑤ UI 위젯 (ToggleCard + DateInput + RadioCardGroup)
- [ ] ⑥ 사이드바 합계 (영향 없음 — 텍스트만)
- [ ] ⑦ 결과 카드 산식 (보유기간 기산 근거 문장)
- [ ] ⑧ validate — `houseToCommercialConversion=true` ∧ `conversionDate` 누락 시 차단
- [ ] ⑨ Zod enum (해당 없음 — boolean)
- [ ] ⑩ Zod 컴패니언 + `addPropertyRefines`
- [ ] ⑪ acquisitionDate fallback (변경 없음)
- [ ] ⑫ Zod 입력 객체 정의 (`houseToCommercialConversion`, `conversionDate`, `wasMultiHouseAtConversion`)
- [ ] ⑬ `callTransferTaxAPI` body spread
- [ ] ⑭ Route handler 엔진 input 매핑 + Date 변환 (`toOptionalDate(conversionDate)`)

## 8. Anchor 테스트 계획

`__tests__/tax-engine/transfer/case-35-house-to-commercial.anchor.test.ts` 신규.

```ts
// 사례 35-1: 다주택 + 중과배제기간 양도 (PDF 메인 케이스)
const result = await calculateTransferTax({
  propertyType: "general_building",
  acquisitionDate: "2008-05-02",
  transferDate: "2023-02-19",
  transferPrice: 800_000_000,
  actualAcquisitionPrice: 400_000_000,
  expenses: 0,
  houseToCommercialConversion: true,
  conversionDate: "2020-08-07",
  wasMultiHouseAtConversion: true,
  // 중과배제기간(22.5.10 ~ 24.5.9) 내 양도 → 일반 누진세율
});

expect(result.gain).toBe(400_000_000);
expect(result.longTermDeduction).toBe(0);              // ★ 핵심
expect(result.taxableIncome).toBe(400_000_000);
expect(result.basicDeduction).toBe(2_500_000);
expect(result.taxBase).toBe(397_500_000);
expect(result.calculatedTax).toBe(133_060_000);         // ★ PDF anchor
expect(result.localIncomeTax).toBe(13_306_000);         // ★ PDF anchor
expect(result.aggregateFarmingSurtax).toBe(0);
```

추가 회귀 케이스:
- 35-2: 1주택 상태 용도변경 → 보유기간 = 당초 취득일(2008-05-02) ~ 양도일(2023-02-19) = **만 14년** → §95② 표1 = 14 × 2% = **28%** (30% 상한은 만 15년부터, 본 케이스는 미달)
- 35-3: 다주택이지만 변경일 시점부터 5년 보유 → 장특공제 10% (표1 연 2% × 5년)
- 35-4: validate — `houseToCommercialConversion=true` ∧ `conversionDate` 누락 차단

**경계값·회귀 anchor (검토 반영)**:
- **35-5 (경계값 ★)**: 다주택 + 변경일 기준 정확히 3년 0일 보유 → 표1 6% 적용 검증. "3년 미만 → 0%" / "3년 이상 → 표1 진입" 경계 회귀 보호.
- **35-6 (skip 마킹)**: 다주택 + 중과배제기간 직전 양도 (2022-05-09) → 중과세율 라우팅 케이스. **본 PR 범위 밖** — `.skip` + 후속 PR 트리거 주석.
- **35-7**: `houseToCommercialConversion=true` ∧ `wasMultiHouseAtConversion=false` ∧ 변경일 = 양도일 직전 → 1주택 케이스로 분기, **당초 취득일 기산 보장** (변경일 영향 zero).

특히 **35-5 경계값**은 회귀 방지 가치 높음 — 표1 라우팅 변경 시 즉시 감지.

## 9. 후속 PR (본 PR 범위 밖)

1. **환산취득가 분기 (§99-164-10)** — 취득가액을 모르는 케이스. `general-building-valuation.ts`에 "주택 → 상가 용도변경" 환산 산식 추가.
   - 취득당시 환산주택가격 = 최초공시주택가격 × (토지 취득시 기준시가 + 건물 취득시 기준시가) / (주택가격 최초공시 당시 토지+건물 기준시가 합계액)
2. **중과배제기간 미적용 케이스** — 다주택 + 조정대상 + 중과 적용 케이스. 중과세율 분기 검증.
3. **세대원 주택 수 자동 판정** — 본 PR은 토글로 수동 입력.

## 10. 작업 순서 (PDCA)

1. **PM (이 문서)** ✅
2. **Plan + Design** — `case-35-house-to-commercial.engine.design.md` (anchor 7건: 35-1 PDF 메인 / 35-2 1주택 14년 / 35-3 다주택 5년 / 35-4 validate / 35-5 경계값 3년 0일 / 35-6 중과 skip / 35-7 변경일 무시, 케이스 매트릭스 표 3행)
3. **Do** — 14 지점 + anchor 작성
4. **Check** — `ui-engine-sync-checker` + `tax-qa-lead` + 브라우저 수동
5. **Act** — 디자인 환류, 후속 PR 트리거 명시

## 11. 종료 조건 (Done Criteria)

- [ ] PDF 메인 anchor 2건 (`calculatedTax=133,060,000` / `localIncomeTax=13,306,000`) 일치
- [ ] 1주택 케이스 vs 다주택 케이스 LTHD 기산일 분기 anchor 통과
- [ ] **§95② 표1/표2 라우팅 회귀 0건** (사례 31~33 anchor 재실행 — `propertyType="general_building"` 표1 자동 라우팅 보장)
- [ ] **중과배제기간 윈도우 상수 (2022-05-10 ~ 2024-05-09) single source of truth** — 하드코딩 분산 grep 0건, `SURCHARGE_EXCLUSION_WINDOW` 상수만 참조
- [ ] 35-5 경계값 anchor (변경일 +3년 0일 → 표1 6%) 통과
- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 vitest 회귀 0건
- [ ] sync-checker 0 누락
- [ ] 브라우저 수동 (Network 탭 body에 `houseToCommercialConversion`·`conversionDate`·`wasMultiHouseAtConversion` 확인)

---

**예상 임팩트**: 3 신규 필드, +1 LTHD 기산일 분기, +1 윈도우 상수, anchor +7 케이스(35-6 skip 1건 포함, 실 검증 6건). 기존 propertyType="general_building" 회귀 zero 보장. 환산 분기는 후속 PR로 분리하여 본 PR 800줄 정책 준수.
