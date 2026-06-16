# 재산세 A-3 후속 4건 — UI 설계 (Track B·C 상세 + A·D 노트)

> **선행**: `property-tax-followup-gaps.plan.md` · `.engine.design.md`(9건 자가검토 정정 반영).
> **실측**(2026-06-16): `shared.ts` FormState `:112`·INITIAL `:179`·buildBody `:348`·validateStep `:227`. `Step0.tsx` objectType RadioCardGroup `:68-75`. `PropertyTaxResultView.tsx` 세부담상한 `:477-490`.
> **범위**: B(결과뷰 산식)·C(vessel 입력). A=UI 무관(엔진 내부). D=§4 개요.

---

## 1. Track B — recompute 결과뷰 산식 표시

### 현황
`PropertyTaxResultView.tsx:477-490` — `capApplied` 시 `세부담상한 적용 (상한율 N%)` + `determinedTax`만. recompute 직전 재산정 내역 미노출.

### 엔진 echo 소비 (입력 추가 없음 — result echo만)
`taxCapMode`·`taxCapBasisTax`·`recomputeDetail`(`.engine.design.md §2`)를 결과뷰가 읽어 분기 표시. **14지점 중 ⑦결과 카드만** 영향(입력 파이프 불변).

### 위젯 목업 — recompute 모드 (건축물·선박: 단일세율)
```
세부담상한 (지방세법 §122)                            [§122 배지]
 직전연도(2025) 재산정 — §118 본문
   직전 과세표준 50,000,000 × 직전 세율 0.5% = 250,000   (recomputeDetail)
 당해 산출세액 400,000  vs  상한 250,000 × 150% = 375,000
 ─────────────────────────────────────────────
 확정세액                                       375,000   [highlight]
```

### 위젯 목업 — recompute 모드 (종합합산 토지: 누진, appliedRate 없음)
```
세부담상한 (지방세법 §122)
 직전연도(2025) 재산정 — 직전 과세표준 80,000,000 × 직전연도 누진세율 = 290,000
 당해 산출세액 ... vs 상한 290,000 × 150% = 435,000
 확정세액                                       435,000
```

### 위젯 목업 — direct 모드 (기존 유지)
```
세부담상한 (지방세법 §122)
 직전연도 부과세액(직접입력) 250,000 × 150% = 375,000
 확정세액                                       375,000
```

### 결과뷰 분기 로직
```tsx
{capApplied && taxCapMode === "recompute" && recomputeDetail && (
  // 직전연도(priorYear) 재산정 — appliedRate 있으면 "× N%", 없으면 "× 누진세율"
  <TaxRow label={`직전연도(${recomputeDetail.priorYear}) 재산정`} note={
    recomputeDetail.appliedRate != null
      ? `직전 과세표준 ${fmt(recomputeDetail.priorTaxBase)} × ${formatRate(recomputeDetail.appliedRate)} = ${fmt(recomputeDetail.recomputedTax)}`
      : `직전 과세표준 ${fmt(recomputeDetail.priorTaxBase)} × 직전연도 누진세율 = ${fmt(recomputeDetail.recomputedTax)}` } sub />
)}
{capApplied && taxCapMode !== "recompute" && (
  <TaxRow label="직전연도 부과세액(직접입력)" note={`${fmt(taxCapBasisTax)} × 150%`} sub />
)}
```
- 산식은 한국어 풀어쓰기(약어·`floor()` 금지, [[feedback_result_view_korean_formula]]).
- 숫자 끝 "원" 생략([[feedback_no_won_suffix]]).
- 직전 세액(`taxCapBasisTax`)·재산정 세액은 같은 값(recompute) — 라벨로 의미 구분.
- `PropertyTaxResultView`에 `taxCapMode`·`taxCapBasisTax`·`recomputeDetail` props/destructure 추가(기존 `capApplied`·`taxCapRate`·`determinedTax` 패턴 미러).

### anchor (결과뷰)
- 렌더: recompute 모드 result → textContent에 "직전연도(2025) 재산정" + 산식 노출.
- direct 모드 → "직전연도 부과세액(직접입력)" 노출, recompute 산식 미노출.

---

## 2. Track C — 선박 유형(vesselType) 입력

### 위젯 목업 (Step0, objectType="vessel" 조건부)
```
물건 유형  ( 주택 )( 건축물 )( 토지 )(•선박 )( 항공기 )      ← 기존 :68-75

▼ objectType==="vessel" 일 때만
선박 유형  (지방세법 §111①4호)                        [§111 배지]
 (•) 일반선박 — 과세표준의 1천분의 3 (0.3%)            §111①4호 나목
 ( ) 고급선박 — 과세표준의 1천분의 50 (5%)             §111①4호 가목
     └ 비업무용 자가용 선박 중 대통령령 기준 초과 (§13⑤5호)   ← FieldCard hint
```
- `RadioCardGroup name="vesselType" tone="violet" layout="inline"` (objectType 패턴 차용).
- 기본 선택 = `general`(INITIAL). 고급 판정 기준은 `hint` + `LawArticleModal` 배지(§13⑤5호 / 시행령 §28).
- placeholder 숫자 예시 금지 — 세율은 옵션 라벨에 법정 표기.

### 14 동기화 지점 (재산세 단일입력 구조 — 컴패니언·자산수준 ⑩⑪ 미해당)
| # | 지점 | 변경 | 위치 |
|---|---|---|---|
| ① | FormState | `vesselType: "general" \| "luxury"` | `shared.ts:112` FormState |
| ② | INITIAL | `vesselType: "general"` | `shared.ts:179` INITIAL_FORM |
| ③ | normalize | 불요(useState 기반) | — |
| ④ | buildBody | **vessel 전용 분기 신규**(실측: `:367` building·`:375` land 분기 존재, vessel 명시 case 없음) → `if (form.objectType === "vessel") body.vesselType = form.vesselType` (`:367` building 블록 다음) | `shared.ts:348~` |
| ⑤ | UI 위젯 | Step0 vesselType RadioCardGroup(vessel 조건부) | `Step0.tsx:75` 직후 |
| ⑥ | 사이드바 | 무관(세율 분기만, 합계 영향 없음) | — |
| ⑦ | 결과뷰 | 고급선박 `appliedRate=0.05`는 기존 "적용 세율" 행(`:472`)에 **자동 표시** → 별도 작업 최소(선박 유형 라벨만 선택) | `PropertyTaxResultView.tsx:472` |
| ⑧ | validate | 기본 general → 차단 불요. vessel만 유효(housing/land 시 무시) | `shared.ts:227` validateStep |
| ⑨ | Zod enum | `vesselType: z.enum(["general","luxury"]).optional()` | `validators/property-input.ts` |
| ⑩ | 컴패니언 Zod | 재산세 미해당(단일 객체) | — |
| ⑪ | 자산수준 fallback | 재산세 미해당 | — |
| ⑫ | Zod 입력객체 | PropertyTaxInput 스키마에 vesselType | `validators/property-input.ts` |
| ⑬ | body spread | buildBody에서 body.vesselType | `shared.ts:348`(④와 동일 지점) |
| ⑭ | Route 매핑 | route handler 엔진 input에 vesselType(Date 무관) | `app/api/calc/property/route.ts` |

→ 핵심 누락 위험은 **⑫⑬⑭**(TS 미감지 침묵 strip, [[feedback_api_zod_schema_sync]]) → grep 자가점검.

### 3중 패턴(기본값 일치) — [[feedback_store_default_vs_ui_display_fallback]]
`vesselType` 기본 "general"을 ②INITIAL · ⑤UI display(`value={form.vesselType || "general"}`) · ⑧validate/⑫Zod default 3 layer 일치. `value={x||"general"}` 단독으로 store "" 침묵 금지.

### anchor (UI)
- vessel 선택 → vesselType 위젯 노출 / housing·land → 미노출.
- 고급선박 선택 → body.vesselType="luxury" → (Network) request body 확인.
- anchor(엔진): taxBase 50,000,000 × 0.05 = 2,500,000.
- E2E(UI): 공시가격 입력 → 과표 50,000,000 도출 → 확정 2,500,000.

---

## 3. Track A — UI 무관

분리과세 세율 연도화는 엔진 내부(classify rateSet). 입력·결과 화면 무변경. UI 동기화 지점 없음.

---

## 4. Track D — UI 개요 (착수 시 별도 .ui.design.md)

§118 직전현황 재구성 입력. Step3(세부담상한 영역)에 `priorYearStatus` RadioCardGroup + 조건부 필드:
```
직전연도 현황  (§118)
 (•) 직전연도와 동일        — 본문 재산정(현행 recompute)
 ( ) 분할·합병·지목변경      → 직전 필지 정보 입력(면적/지분/세액)
 ( ) 과세대상 구분 변경
 ( ) 신축·증축(건축물)
 ( ) 정비사업 멸실(토지)     → 사업유형(3년/5년)·착공일
```
- 입력 복잡 → 단계 분할(D1 토지·D2 건축물·D3 정비사업).
- 자동 안분 fallback 금지([[feedback_no_silent_apportion_fallback]]) — 미입력 검증 오류.
- 실무 UX·필요성 사용자 확인 후 착수.
