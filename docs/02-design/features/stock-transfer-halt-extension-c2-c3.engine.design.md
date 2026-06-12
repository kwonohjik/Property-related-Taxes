# 거래정지 확장 (C-2/C-3) — 엔진 설계

> 계획: `docs/00-pm/stock-transfer-halt-extension-c2-c3.plan.md` · 기준 origin/master `d05eebb2`
> 법령: C-2 §165③→§165④(비상장 보충평가·기확립) · C-3 §165⑤·§165③·상증령 §52의2③(양립 불가 판정)
> **순수 엔진 알고리즘 변경 0** — calcUnlistedValuation은 full/사례49 기지원. api 게이트·Zod refine·validate 헬퍼만.

## 1. 케이스 인벤토리

| # | tradingHaltAtTransfer | acquiredBeforeListing | mode/flag | 엔진 경로 | anchor |
|---|---|---|---|---|---|
| C2-1 | ON | OFF | simple | calcUnlistedValuation weighted_avg (현행) | C2-REGRESS-1 |
| C2-2 | ON | OFF | full | calcUnlistedValuation weighted_avg (결산서 합성) | C2-ENGINE-1 |
| C2-3 | ON | OFF | 사례49 | calcUnlistedValuation acq_face_value_only | C2-ENGINE-2 |
| C3-1 | ON | ON | — | **validate+Zod 차단 → 엔진 미도달** (법령 양립 불가) | C3-VALIDATE-1·C3-ZOD-1 |

## 2. 엔진 경로 확인 (변경 0)

`stock-transfer-tax.ts:289` `else if (input.tradingHaltAtTransfer)` 분기 → `calcUnlistedValuation(input, transferPrice)`. 이 함수는:
- weighted_avg(full): `input.transferYearNetIncomePerShare` 등 읽음 — full 결산서는 api adapter가 합성해 주입
- acq_face_value_only(사례49): `input.acqFaceValueOnly && input.acqFaceValuePerShare` 분기(`stock-valuation-unlisted.ts:175`)

→ 입력만 도달하면 엔진은 이미 계산 처리. C-2 = api 게이트·UI가 입력 도달을 막던 것을 해소.

### ★ Do 발견 (엔진 소변경): 거래정지 분기 method passthrough
계획 "엔진 0"은 부정확 — 거래정지 분기(`:298`)가 `method: "weighted_avg"` **하드코딩**이라 거래정지+사례49가 결과 카드에서 `acq_face_value_only`로 분기되지 않음(오표시). 비상장 분기(`:321-344`)의 method 매핑 + 사례49/순자산단독/§165⑨ echo passthrough로 정합. acquisitionPrice 자체는 calcUnlistedValuation이 정확 산출하므로 numeric 영향 0, **결과 카드 표시 정합만 교정**.

### 2.1 거래정지 full == 비-거래정지 full (C2-ENGINE-1)
거래정지 분기(`:292`)와 비상장 분기(`:313`) 모두 동일 `calcUnlistedValuation(input, transferPrice)` 호출 → 동일 입력 시 동일 결과(appliedRules "거래정지우회" 태그만 상이). C2-ENGINE-1 anchor가 동치 고정.

## 3. api 게이트 확장 (`stock-transfer-tax-api.ts`)

```
:502 사례49:  form.marketType === "unlisted"
  → (form.marketType === "unlisted" || form.tradingHaltAtTransfer)
:520 full:    form.marketType === "unlisted" && unlistedValuationMode === "full"
  → (form.marketType === "unlisted" || form.tradingHaltAtTransfer) && unlistedValuationMode === "full"
```

- OR 조건 — 거래정지일 때만 추가 발화. 비-거래정지 상장(일반 종가평균) 영향 0.

## 4. C-3 Zod refine 신규 (`stock-transfer-tax-schema.ts`)

`:330` C-1 패턴(`tradingHaltAtAcquisition && acquiredBeforeListing`) mirror:
```ts
if (data.tradingHaltAtTransfer && data.acquiredBeforeListing) {
  ctx.addIssue({ code: "custom", path: ["tradingHaltAtTransfer"],
    message: "양도일 거래정지·관리종목 주식은 §3항 주식이 아니어서(상증령 §52의2③ 제외) 취득 후 상장(§165⑤) 환산 대상이 아닙니다. 거래정지 또는 취득 후 상장 중 하나만 선택하세요." });
}
```

## 5. validate 헬퍼 (`stock-transfer-tax-validate-step2.ts`)

- `validateUnlistedValuationFields(form, errors)` 추출(`:322` 본칙 블록 전체 — acqFaceValuePerShare(사례49)·simple(validateUnlistedSimpleFields)·full(niShareCountEU* 등) **+ B-4 §165⑨ 블록 포함**).
- ★ STEP 8: simpleOnly 제거로 거래정지 경로에 §165⑨ 섹션 노출 — **거래정지(양도)+§165⑨ 정당**(양도 기준시가=비상장 보충평가→동일 시 §165⑨ 적용·엔진 기처리). UI 노출↔validation 정합 위해 §165⑨를 공유 헬퍼에 포함(거래정지+§165⑨ prePrior 누락도 일관 차단).
- 호출처: 비상장 본칙(`:322`) + 거래정지 C-6(`:238`) — **동일 헬퍼**(simple→전체 모드+§165⑨)
- G-5 메시지(`:260-266`) 법령 근거 보강

## 6. 파일 영향

| 파일 | 작업 |
|---|---|
| `stock-transfer-tax-api.ts` | 게이트 2곳 OR 확장 |
| `stock-transfer-tax-schema.ts` | C-3 Zod refine 신규 |
| `stock-transfer-tax-validate-step2.ts` | validateUnlistedValuationFields 추출 + C-6 적용 + G-5 메시지 |
| `app/calc/stock-transfer-tax/steps/Step2.tsx` | EstimatedUnlistedBlock simpleOnly 제거 |
| `stock-transfer-tax.ts` | 거래정지 분기 주석 보강(엔진 변경 0) |

## 7. anchor

`__tests__/tax-engine/stock-transfer/section-halt-extension-c2-c3.test.ts`:
C2-ENGINE-1(거래정지 full == 비상장 full)·C2-ENGINE-2(거래정지 사례49)·C2-REGRESS-1(거래정지 simple 불변)·C3-VALIDATE-1·C3-ZOD-1. + C2-API-1(`buildStockTransferApiBody`(:256) 직접 호출 — 거래정지 full form → body.transferYearNetIncomePerShare 잔존, strip 부재. `lots-specific-a1` 선례).
Pre-Do: 기존 trading-halt·halt-acquisition·case-49 anchor 전수 통과 + C-2 full strip 실패 anchor.
E2E 1건: 거래정지(양도) 상장 + full 모드 노출(simpleOnly 해제) + 계산.

## 8. 비스코프
- C-3 교차 환산 구현(법령 양립 불가 — 차단 확정). 2회+ 거래정지. 권리락.
</content>
