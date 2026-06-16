# UI 디자인 — A-3 §118 정밀 재산정 (세부담상한 모드 토글)

> 엔진 설계: `property-tax-cap-recompute.engine.design.md` · 계획서: `../../01-plan/features/property-tax-cap-recompute.plan.md`
> 대상: `components/calc/property/Step3.tsx`(모드 토글)·`shared.ts`·`results/PropertyTaxResultView.tsx`
> 작성일 2026-06-16

## 1. 변경 요약 (P5)

현행 `Step3.tsx`는 비주택 direct(직전연도 세액 직접입력)만. recompute 모드(직전 과세표준 → 직전 세율 재산정)를 토글로 추가.
- **recompute 노출 대상**: 건축물·선박·항공기·**종합합산 토지**만(엔진 §4 v1 범위). 별도합산·분리는 direct only(토글 미노출).

## 2. Step3 모드 토글 위젯 (비주택, recompute 대상일 때)

```
┌─ 전년도 세액 (비주택, 선택) ────────────────────────────────┐
│  ◉ 직전연도 부과세액 직접 입력            (§118 단서)          │ ← 기본(direct)
│      [전년도 재산세 납부액 _________ 원]                       │
│                                                              │
│  ○ 직전연도 과세표준으로 재산정          (§118 본문)          │
│      [직전연도 과세표준 _________ 원]                          │
│      → 직전연도 세율표로 세액상당액을 재산정해 150% 상한 적용    │
│  ⓘ 분할·합병·신축 등 현황 변동은 미반영(직접입력 권장)          │
└──────────────────────────────────────────────────────────┘
```
- 별도합산·분리 토지 + 선박 외 → 토글 없이 현행 direct 단일 입력 유지.
- 모드: `RadioCardGroup`(native radio 금지, OFF tone 유지) — layout="stack".
- 금액: `CurrencyInput`+`parseAmount`. `previousYearTax`(direct)·`previousYearTaxBase`(recompute) 각 모드만 노출.
- **testid**: `taxcap-mode-direct`·`taxcap-mode-recompute`·`prev-year-tax`·`prev-year-taxbase`
- `LawArticleModal` §122·§118.

## 3. 노출 조건 (실측 필요 — STEP 13)

recompute 토글 노출 = 비주택 AND (objectType ∈ {building, vessel, aircraft} OR landTaxType === "comprehensive_aggregate"). 별도합산·분리·주택은 미노출.
**확인 완료(STEP 13)**: 현행 Step3는 `form.objectType === "housing"`만 분기(`Step3.tsx:14`), 비주택은 단일 direct 입력. `form.landTaxType` 접근 가능(`shared.ts:121`) → recompute 분기 추가 가능. RadioCardGroup 경로 실재.

## 4. UI 8 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 | `shared.ts` `taxCapMode`·`previousYearTaxBase` 추가 |
| ② initial | `taxCapMode:"direct"`·`previousYearTaxBase:""` |
| ③ normalize | 불요(PropertyTaxForm useState — A-1·A-2 검토서 확인) |
| ④ API 변환 | `buildPropertyTaxRequestBody`: recompute 대상+모드 시 `previousYearTaxBase`·`taxCapMode` 전송(비주택) |
| ⑤ UI 위젯 | `Step3.tsx` RadioCardGroup 모드 토글(§2) |
| ⑥ 사이드바 | 무관(재산세 합계 selector 없음) |
| ⑦ 결과뷰 | `PropertyTaxResultView` 재산정 산식(직전 과표×직전세율) 표시 |
| ⑧ validate | recompute 모드 시 `previousYearTaxBase`>0 형식 검증, 미입력 경고(차단 아님 — UI↔validate 동기화) |

## 5. 정책 체크
- [x] 모드 = `RadioCardGroup`(native radio 금지)
- [x] 금액 = `CurrencyInput`+`parseAmount`
- [x] 자동 안분 fallback 금지 — 미입력 경고만
- [x] UI 통과 ↔ validate 차단 모순 금지(⑧)
- [x] placeholder 숫자 예시 금지 — hint 한국어
- [x] Zod(`property-input.ts`) `taxCapMode` enum·`previousYearTaxBase` 추가(API/Route 동기화)
