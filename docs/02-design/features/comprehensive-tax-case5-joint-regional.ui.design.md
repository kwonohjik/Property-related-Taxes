# 종합부동산세 사례5 — UI 설계 (직전 §8④ 안분)

> 계획서: `comprehensive-tax-case5-joint-regional.plan.md` · 엔진: `.engine.design.md`
> 대상: `lib/calc/comprehensive-api.ts` · `lib/validators/comprehensive-input.ts` · `app/api/calc/comprehensive/route.ts`
> 작성일: 2026-06-15 · 13단계 STEP 12
> 범위: G-5(직전 §8④ 안분) — **UI 신규 입력 없음**, API 자동 도출

---

## 1. 핵심 — UI 신규 입력 없음 (API 자동 도출)

사례5의 입력은 **전부 기존 UI로 가능**:
- Step1: §10의2 부부 공동명의 특례 토글(기존 `isJointOwnershipSpecialCase`)
- Step2: 세종 주택 §8④4호 지방저가 토글(기존, `PropertyListInput.tsx:286-379`)
- Step5: 자동모드 + 주택별 직전공시(PR#204) + 직전 1세대1주택 토글(기존)

`priorSection8Para4Value`(직전 §8④ 안분 분자)는 **당해 §8④ 주택 인덱스 ↔ 직전 주택별 공시 매핑으로 API에서 자동 산출** — 사용자 추가 입력 불요.

```
당해 properties: [성동(none), 세종(regional_low_price)]   ← Step2 §8④ 토글
직전 priorHouseValues: [13억, 1.95억]                       ← Step5 PR#204 주택별 입력
→ priorSection8Para4Value = 1.95억 (세종, 인덱스 1 대응)
→ §9⑦ 안분 분자 main = priorSum(14.95억) − 1.95억 = 13억
```

**전제**: 직전 주택 수 = 당해 주택 수(인덱스 대응) — PR#204 U-1과 동일. 직전≠당해는 직접입력 모드.

---

## 2. 14지점 동기화

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ①②③ | 폼 상태 | store | **무변경** — 기존 §8④ 토글·PR#204 직전 주택별 공시 재사용 |
| ④⑬ | API 변환 | `comprehensive-api.ts` previousYearAuto | `priorSection8Para4Value` 자동 도출(§3) |
| ⑤ | UI 위젯 | `Step1Basic.tsx`(부부특례)·`PropertyListInput.tsx`(§8④)·`page.tsx`(Step5) | **무변경** |
| ⑥ | 사이드바 | — | 해당 없음 |
| ⑦ | 결과뷰 | `ComprehensiveFilingFormBuppyo5Sub.tsx` | **무변경** — `comprehensiveTaxEquiv` 정확값 자동 반영 |
| ⑧ | validation | page.tsx Step5 게이트 | **무변경**(PR#204 게이트로 직전 주택별 공시 검증) |
| ⑨⑫ | Zod | `comprehensive-input.ts` previousYearAutoSchema | `priorSection8Para4Value: z.number().int().nonnegative().optional()` |
| ⑩ | refine | — | 무변경 |
| ⑭ | Route | `route.ts` previousYearAuto 명시 매핑 | `priorSection8Para4Value` pass-through (★명시 매핑 strip 방지 — PR#204 교훈) |

> 신규는 **④⑬⑨⑫⑭ 5지점**(전부 자동 도출/pass-through). store·UI·결과뷰·validation 무변경.

---

## 3. API 자동 도출 (④⑬ — `comprehensive-api.ts`)

PR#204의 `priorHouseValues` 계산 직후:
```ts
// priorSection8Para4Value: 당해 §8④ 주택 인덱스 ↔ 직전 주택별 공시 매핑 (UI 추가 입력 없음)
// ★ filter 전 원본(previousYearAutoHouseValues) 인덱싱 — priorHouseValues는 .filter(v>0)로
//   인덱스 시프트되므로 properties[i] 대응 깨짐(api.ts:250 실측)
const priorRaw = formData.previousYearAutoHouseValues ?? [];
const priorS84 = formData.properties.reduce((sum, p, i) => {
  const isS84 = (p.section8para4Type ?? "none") !== "none";
  const v = priorRaw[i] ? parseAmount(priorRaw[i]) : 0;
  return isS84 ? sum + v : sum;
}, 0);
// previousYearAuto 객체에 추가:
//   priorSection8Para4Value: priorS84 > 0 ? priorS84 : undefined,
```
- 사례5: properties[1]=regional_low_price, previousYearAutoHouseValues[1]=1.95억 → priorS84=1.95억.
- §8④ 없는 케이스(사례4): priorS84=0 → undefined → 엔진 else 분기(안분 미적용) → 회귀 0.

> ⚠️ **인덱스 정합 필수**: `priorHouseValues`(filter됨)가 아닌 **`previousYearAutoHouseValues`(원본)** 인덱싱 — properties와 1:1. 중간 0값이 있어도 §8④ 주택 오매핑 방지.

---

## 4. Zod·Route (⑨⑫⑭)

```ts
// comprehensive-input.ts previousYearAutoSchema
priorSection8Para4Value: z.number().int().nonnegative().optional(),
```
```ts
// route.ts previousYearAuto 명시 매핑 (★ PR#204 strip 교훈 — 누락 시 침묵 strip)
priorSection8Para4Value: schema.previousYearAuto.priorSection8Para4Value,
```

---

## 5. E2E (Phase 2)

신규 `e2e/comprehensive-case5.spec.ts`:

| ID | 시나리오 | 검증 |
|---|---|---|
| C5-E1 | 사례5 풀 입력(§10의2 부부특례+세종§8④+직전자동 13억/1.95억) | ⑤ **969,711** + 신고서 직전 종부세상당액 **1,182,305**(§9⑦ 안분) |
| REGR | 사례4 PY-M2(직전 §8④ 없음) | 직전 상당액 불변(안분 미적용) |

**입력 경로**: Step1 부부특례 토글(switch) → Step2 세종 추가+§8④4호 라디오(비수도권 select) → Step5 자동+주택별 직전공시 nth+직전1주택 토글. (§8④ E2E `comprehensive-tax-section8-4.spec.ts` + PR#204 `comprehensive-prior-year-multi.spec.ts` 패턴 차용)

---

## 6. UI 리스크

| # | 항목 | 처리 |
|---|---|---|
| U-1 | 직전 주택 인덱스 ↔ 당해 §8④ 인덱스 대응 | 직전 주택 수 = 당해 주택 수 전제(PR#204 U-1). 불일치는 직접입력 |
| U-2 | priorSection8Para4Value 자동 도출 ↔ 당해 §8④ 토글 OFF 시 | isS84=false → priorS84=0 → 안분 미적용(정합) |
| U-3 | 부부특례(§10의2) + 직전 1세대1주택 토글 동시 | 직전 isOneHouseOwner=true(의제). §10의2는 당해 전용 — 직전은 토글로 표현 |
| U-4 | route 명시 매핑 strip | ⑭ pass-through 필수 grep(PR#204 교훈 [[feedback_explicit_prop_mapping_strip]]) |
