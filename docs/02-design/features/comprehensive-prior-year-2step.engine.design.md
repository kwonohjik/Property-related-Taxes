# 종부세 직전연도 입력 2단계 통합 — 엔진 설계

> 계획서: `docs/00-pm/comprehensive-prior-year-2step-consolidation.plan.md`
> Phase A anchor: `__tests__/tax-engine/comprehensive-prior-year-2step-anchor.test.ts` (4건 통과)
> ★ **엔진 계산식 무변경** — 본 설계는 변환(`comprehensive-api.ts`)·검증(Zod)·마이그레이션 재배치.

## Context

직전연도 주택 공시가격을 2단계 주택카드(`priorAssessedValue` → §122 layer-1)와 5단계 자동계산(`previousYearAuto.priorHouseValues` → §10 layer-2) 두 곳에서 입력 → refine ⑫ 상호배타 충돌. **직전 공시가격(주택별) 단일 입력원**으로 통합, 변환이 `previousYearAuto`를 파생. 엔진(`comprehensive-prior-year.ts`·`comprehensive-housing-tax-cap.ts`·`applyTaxCap`)은 손대지 않는다.

**Phase A 실측 결론**:
- `priorAssessedValue` 단독으론 §10 미산출 → 변환이 `previousYearAuto` 파생 **필수**.
- `priorAssessedValue` 추가는 §122로 재산세 ⓐ를 감액하나(`cappedTax < standardTax`) **종부세 최종 보존**(비율 안분 공제 흡수). → 통합이 종부세 결과를 바꾸지 않음.

## ★ 케이스 인벤토리 (필수)

| ID | 입력(과세연도·주택·모드) | 직전 속성 | 기대 동작 | anchor |
|---|---|---|---|---|
| C1 | 1주택 ①미적용 | - | 세부담상한 생략(warning), 당해세액 그대로 | 신규 `C1-skip` |
| C2 | 1주택 ②자동 2022 | 1세대1주택 OFF | §122 ⓐ Min(적용) + §10 — 종부세 보존 | Phase A `A-§122활성` |
| C3 | 1주택 ②자동 2024+ | - | §122 폐지(getHousingTaxCapPct=null) → ⓐ Min 없음, §10만 | 신규 `C3-2024` |
| C4 | 1주택 ②자동 2022 | 1세대1주택 ON | §10 고령자·장기보유 직전 재판정 | 신규 `C4-1house` |
| C5 | 다주택 ②자동 2022 | 일반(조정X) | 주택별 직전공시 합산, 일반세율 | **신규 `C5-general`** |
| C6 | 다주택 ②자동 2022 | 조정2주택 ON | 직전 중과세율 3.6% · 종부세 보존 | **Phase A `A-integrated`(=사례4)** + `prior-year-multi` |
| C7 | 다주택(3+) ②자동 2022 | - | 3주택 자동 중과 | 사례4 패턴 |
| C8 | 다주택 ②자동 2022 | §8④ 특례 혼재 | priorSection8Para4Value 직전 안분 | 사례4·5 기존 |
| C0 | 법인 corporate_special | - | 세부담상한 배제(tax.ts:409·443) — 직전공시 입력해도 미적용 | 신규 `C0-corp` |
| C9' | 다주택 합산배제 혼재 | exclusionType≠none | ⚠️ 합산배제 주택 직전공시 처리·`taxableHouseCount` 중과 판정 — **현행 엔진 동작 실측 후 확정**(D2) | 신규 `C9-excl` |

> Do 진입 전 각 신규 anchor를 원단위 `toBe()`로 고정. C2(1주택)·C6(조정2주택)은 Phase A에서 이미 종부세 보존 실증.

## 법령 근거

- §10(종부세 세부담상한): 당해 (종부세+재산세) ≤ 직전 (종부세+재산세) × 150%(2023~) / 300%(≤2022 조정2주택). `applyTaxCap`.
- §9③ 괄호 + 구 지방세법 §122 단서: 당해 ⓐ = min(당해 표준세율 재산세, 직전 재산세상당 × §122 구간율). `comprehensive-housing-tax-cap.ts`.
- 시행령 §5②: 직전연도 종부세상당액 자동계산(직전 지방세법·종부세법 적용). `comprehensive-prior-year.ts`.
- §122 구간율(2022): 3억↓105% / 3~6억110% / 6억↑130%. 2024 폐지(`HOUSING_TAX_CAP_ABOLISHED_YEAR`).

## 엔진 input 타입 — **변경 없음**

`ComprehensiveTaxInput`(types/comprehensive.types.ts) 불변:
- `properties[].priorAssessedValue?: number` (:254) — §122 layer-1 (유지)
- `previousYearAuto?: PreviousYearAutoInput` (:468) — §10 layer-2 (유지)
- `previousYearTotalTax?: number` (:467) — direct 경로 (엔진 유지, **변환에서 미전송**)

→ 변환이 주택별 `priorAssessedValue`에서 `previousYearAuto`를 파생 구성(아래). 엔진은 기존 시그니처 그대로 수신.

## 엔진 result 타입 — **변경 없음**

`previousYearEquivalent`·`taxCap`·`properties[].housingTaxCapDetail` 전부 유지.

## 계산 알고리즘 (변환 레이어 — 엔진 무변경)

```
// comprehensive-api.ts callComprehensiveApi (Phase B)
capMode = formData.previousYearCapMode  // "none" | "auto"

properties = formData.properties.map(p => ({
  ...기존,
  priorAssessedValue: (capMode==="auto" && parseAmount(p.priorAssessedValue) > 0)
                        ? parseAmount(p.priorAssessedValue) : undefined,   // §122 (D-1)
}))

// D-4: 직전공시 단일 원천 → previousYearAuto 11필드 파생
priorVals = properties.map(p => p.priorAssessedValue).filter(>0)
// length 기준: C9' 확정에 따라 "전 주택" 범위 = 전체 vs 과세주택만(합산배제 제외) 재정의
previousYearAuto = (capMode==="auto" && !isCorporate && priorVals.length === properties.length)
  ? {
      assessedValue: Σ priorVals,
      priorHouseValues: priorVals,                          // ← properties[].priorAssessedValue
      isOneHouseOwner: formData.previousYearAutoIsOneHouse, // D-3 세대속성
      isMultiHouseInAdjustedArea: formData.previousYearAutoIsMultiAdjusted,
      taxableHouseCount: priorVals.length,
      birthDate / acquisitionDate: 기본정보(1단계),
      reductionRate / ownershipRatio / appurtenantSplit: properties[0] (현행 유지),
      priorSection8Para4Value: §8④ 주택 직전공시 합(현행 도출),
    }
  : undefined

// previousYearTotalTax(direct): 전송 안 함 (모드 제거)
```

**핵심**: `priorAssessedValue`(§122) + 그로부터 파생한 `previousYearAuto`(§10) 둘 다 같은 직전공시 → 엔진이 §122·§10 모두 산출. Phase A 실측대로 §122 ⓐ 감액은 종부세 보존.

## Silent fallback / 자동 안분 후보 식별

- **혼재 차단(필수)**: ② 모드 시 일부 주택만 직전공시 입력하면 `priorVals.length < properties.length` → `previousYearAuto` 미생성(§10 누락) → **부정확**. 자동 안분 금지 정책 → **전 주택 직전공시 필수**(⑧ validation, ui.design).
- **(D2) 합산배제 주택 처리**: `exclusionType≠none` 주택의 직전공시를 `priorHouseValues`에 포함할지·`taxableHouseCount`(직전 중과 주택수)에 산입할지는 **현행 엔진/변환 동작 실측 후 확정**(추정 금지). 현행 변환(`api:361`)은 `previousYearAutoHouseValues` 전체를 필터 없이 전송 → C9' anchor로 합산배제 혼재 케이스의 직전 재산세상당액·중과 판정을 실측해 통합 변환이 동일 동작하도록 정합. "전 주택 필수"가 합산배제 주택까지 포함하면 그 카드에도 직전공시 입력란 노출(ui.design 반영).
- `reductionRate`/`ownershipRatio`/`appurtenantSplit`을 `properties[0]` 기준으로 두는 현행 단순화 유지(다주택 이질 시 한계 — 기존과 동일, 본 통합 범위 밖).
- **(STEP 11) Zod refine 제거**: ⑫(priorAssessedValue ↔ previousYearAuto.priorHouseValues 상호배타, `comprehensive-input.ts:566~579`) + direct↔auto(:538) 제거 — 단일 입력원이라 중복/배타 불필요. §10의2·법인 요건·토지 상호배타 refine은 **유지**.

## 테스트 약속

- Phase A anchor 4건(통과) 유지 — 엔진 무변경 회귀.
- 신규: C0·C1·C3·C4·C9' 각 원단위 `toBe()`.
- C2·C6 종부세 보존 회귀(Phase A 실증) — Phase B 변환 후 callComprehensiveApi 통합 테스트로 재확인(직전공시 입력 → body.previousYearAuto 파생).
- **(D4) callComprehensiveApi 통합 테스트는 fetch mock 신규**(기존 변환 단위 테스트 부재) — `global.fetch = vi.fn()`으로 전송 body 캡처 후 `body.previousYearAuto.priorHouseValues == [priorAssessedValue들]` 검증.
- 회귀 전체: `npx vitest run __tests__/tax-engine/comprehensive*`.

## UI 통합 위임

→ `comprehensive-prior-year-2step.ui.design.md` (STEP 12). 2단계 위젯 재배치·모드 2택·StandardPriceInput year-1·5단계 제거·마이그레이션·8 동기화 지점.
