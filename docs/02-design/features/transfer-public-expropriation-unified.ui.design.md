# UI 설계 — 공익수용·협의매수 단일 입력 통합

> 계획서: `docs/00-pm/transfer-public-expropriation-unified.plan.md` · 엔진: `transfer-public-expropriation-unified.engine.design.md`
> 확정: Step1 인라인 · 기존 Step4/Step5 토글 유지(override).

## 1. 위치 — Step1 자산 카드 신규 블록 `ExpropriationBlock`

- 렌더 조건: `assetKind === "land"` (수용 특례는 토지 중심).
- 배치: Step1 자산 카드의 **양도 정보(AssetSectionTransfer) 인접** — 양도원인은 양도 사건 속성.
- 컴포넌트: `components/calc/transfer/ExpropriationBlock.tsx` (신규). props `{ asset, onChange, transferDate }` (`onChange: (d: Partial<AssetForm>) => void`; `transferDate`=form-global 양도일, #3 게이트 `≥2009.02.04` 판정에 필요).

## 2. 위젯 트리 (ASCII)

```
② 양도원인                                    [RadioCardGroup tone=rose]
  ( ) 일반           ( ◉ ) 공익수용·협의매수
  └─ 수용 선택 시 펼침 ───────────────────────────────
     사업인정고시일           [DateInput]  → expropriationNoticeDate
     현금보상액 (원)          [CurrencyInput] → reductions[§77].expropriationCash
     채권보상액 (원)          [CurrencyInput] → reductions[§77].expropriationBond
     채권 만기특약            [RadioCardGroup] 없음/3년/5년 → .expropriationBondHoldingYears("none"|"3"|"5")
     ┌ (#3) 환산 + 양도≥2009.02.04 일 때만 ─────────── [amber 카드]
     │ 보상가액 (원/㎡)        [CurrencyInput hideUnit] → compensationPerSqm
     │ 보상산정 기초 기준시가(원/㎡) [CurrencyInput hideUnit] → compensationBasisStdPrice
     │ ⓘ 환산 양도시 기준시가 = min(공시지가, 보상, 보상기초) 적용
     └────────────────────────────────────────────
```

> **보상 2필드는 수동 원/㎡ 입력**(`CurrencyInput`) — 보상서류의 값이며 Vworld 개별공시지가 조회 대상 아님 → `LandPriceLookupField` 사용 안 함(정책 `feedback_land_price_lookup_field`는 공시지가 한정).
> **§77 reduction 생성**은 기존 `getDefaultReduction("public_expropriation")`(`UnifiedReductionPanel-defaults.ts`) 재사용 — 기본 shape 중복정의 금지(dual-truth 회피).
> 결과 카드(§5)는 엔진이 `expropriationValuationDetail`을 finalize 전파 체인(engine 설계 §4)으로 전달해야 도착.

- `RadioCardGroup` 미선택 옵션도 tone 유지(정책 `feedback_toggle_card_visibility`). native radio 금지.
- 금액=`CurrencyInput`+`parseAmount`. 날짜=`DateInput`(type=date 금지). 원/㎡ 필드는 `hideUnit`+`unit="원/㎡"`.
- placeholder 숫자 예시 금지 — `hint`에 한국어("금액 입력(원)"·"원/㎡").
- testid: `expr-cause-radio`·`expr-notice-date`·`expr-cash`·`expr-bond`·`expr-bond-years`·`expr-comp-persqm`·`expr-comp-basis`.

## 3. 자동 활성화 = **composite onChange** (useEffect 미러링 금지)

양도원인 라디오 `public_expropriation` 선택 시 **단일 onChange composite write** (반응형 미러 아님):

```ts
onChange({
  transferCause: "public_expropriation",
  nblExemptPublicExpropriation: true,                 // #1 토글 프리필(불리언) — 사용자 Step4서 override 가능
  reductions: upsertExpropriationReduction(asset.reductions), // #2 §77 감면 추가(없으면)
});
```

- **고시일은 단일 소스** `expropriationNoticeDate`만 write. `nblExemptPublicNoticeDate`·reduction.date는 **복사하지 않음** — 엔진/validate에서 fallback(`|| expropriationNoticeDate`). (dual-truth 회피)
- `general`로 되돌리면: `transferCause:"general"` + §77 reduction 제거 + `nblExemptPublicExpropriation:false`(composite). (사용자 Step4/5 override는 이후 자유)
- **3-state 주의**(`feedback_three_state_optional_mode_toggle`): 토글 checked는 **stored `nblExemptPublicExpropriation`** 기준(fallback derive 아님) → 프리필 후 독립 off 가능.

## 4. 기존 Step4/Step5 (유지) — display fallback

- **Step4 NBL 섹션**: `nblExemptPublicExpropriation` 토글 그대로. 고시일 필드 비었으면 `expropriationNoticeDate`를 **read-only 힌트**("Step1 사업인정고시일 사용 중")로 표시(display fallback), 입력 시 override.
- **Step5 §77 패널**: 동일 `asset.reductions[§77]` read/write. Step1에서 생성된 감면이 이미 활성 표시. cash/bond를 Step5에서 수정해도 동일 필드(양방향).
- 두 섹션 UI **변경 최소**(민감 NBL PR#454·#457 회귀 방지).

## 5. 결과 화면 — #3 산출근거 카드 (Phase 2)

`TransferTaxResultView` 환산취득가액 섹션에 `expropriationValuationDetail` 존재 시 카드:

```
공익수용 양도시 기준시가 특례 (집행기준 99-164-12)
  공시지가        ○○○ 원/㎡
  보상 ㎡당가액    ○○○ 원/㎡
  보상산정 기초    ○○○ 원/㎡
  → 적용(최솟값)  ○○○ 원/㎡  × 면적 ○○㎡ = ○○○원 (환산 분모)
```

- 산식 한국어 풀어쓰기(변수약어·floor() 금지, 정책 `feedback_result_view_korean_formula`). 금액 칸 `text-right font-mono tabular-nums`(`amount-column-align`).

## 6. Validation (⑧) — UI↔validate 모순 방지

`lib/calc/transfer-tax-validate.ts`:
- 수용 ON: 고시일 = `expropriationNoticeDate ‖ nblExemptPublicNoticeDate ‖ reductions[§77].expropriationApprovalDate` 中 1개면 통과.
- #3 게이트(수용 ∧ 환산 ∧ 양도≥2009.02.04 ∧ 토지): `compensationPerSqm`·`compensationBasisStdPrice` 필수.
- UI 노출 조건과 validate 필수 조건 **동일 게이트** 사용(모순 차단, 정책 `feedback_validation_sync_8th_point`).

## 7. 14 동기화 지점 (UI측 ①②③⑤⑥⑦⑧⑬)

①AssetForm 4필드 ②`makeDefaultAsset`(transferCause="general" 등 기본) ③`migrateAsset`(레거시 없음→기본) ⑤ExpropriationBlock(본 문서) ⑥사이드바 N/A ⑦결과 카드(#3) ⑧validate(§6) ⑬fetch body(신규 4필드 spread — 침묵 strip 주의).

## 8. Phase

- Phase 1: ExpropriationBlock의 양도원인 라디오 + 고시일 + 현금/채권보상(§77) + composite onChange(#1#2). #3 보상필드·결과카드 제외.
- Phase 2: #3 보상 2필드(조건부 노출) + 결과 산출근거 카드 + validate 게이트.

## 9. E2E (Playwright)

- 토지 자산 + 양도원인=수용 선택 → Step4 NBL 토글 체크·고시일 힌트 노출 확인.
- Step5 §77 감면 자동 활성 확인.
- (#3) 환산 모드 + 양도≥2009.02.04 → 보상 2필드 노출·결과 산출근거 카드.
- general 복귀 → §77 제거·필드 숨김.
