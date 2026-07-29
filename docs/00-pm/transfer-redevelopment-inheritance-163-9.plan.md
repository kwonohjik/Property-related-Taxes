# 재개발 상속 종전자산 취득가액 §163⑨ 정합 (전체 정합)

## 배경 — §163⑨ 감사 잔여 (재개발 엔진)

겸용(PR#710)·일반건물(PR#713)·상가(PR#715/716)로 종결한 §163⑨ 위반 감사에서 **재개발 엔진은 스코프 밖**이었다. 이번에 재개발 경로를 실측·확증:

- 재개발 엔진(`redevelopment.ts`/`redevelopment-split.ts`)은 `acquisitionCause` 분기가 **전혀 없고**, `useEstimatedAcquisition` 플래그로만 환산(§166③)/실가 구분.
- `transfer-tax.ts` STEP 0.45(§163⑨ 상속 취득가액 의제)는 재개발 분기(STEP 0.65, line 247)보다 **먼저** 실행되어 `input.acquisitionPrice`를 상속평가액으로 갱신하고, 그 값은 `effectiveInput`으로 재개발까지 **전파된다**.
- 그러나 `transfer-tax-redevelopment.ts:70` `actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice` — **`useEstimatedAcquisition=true`면 상속평가액을 버리고 §166③ 환산(권리가액×P_A/D) + §163⑥ 개산공제(3%) 적용**.
- pre-1985 상속에서 `applyResultToInput`(inheritance-acquisition-helpers.ts:182)이 환산 채택 시 `useEstimatedAcquisition=true`를 **자동 강제** → 사용자가 실가 모드여도 재개발이 §166③으로 감.

### 수치 확증 (probe)

post-1985 상속(상속개시일 평가액 `reportedValue=200,000,000` 확인) + 재개발(case-44 파라미터) + 환산모드:
- 실측: 종전자산 취득가액 = **141,221,534** (§166③ 환산) — 상속평가액 200,000,000 완전 무시. `transferGain=288,445,917`(상속 미반영).
- 200M > 141.2M → **과대과세**. §163⑨ 위반 확정.

## 법적 타깃 (KoreanLaw 원문 검증)

- **§163⑨ 본문**: 상속·증여 자산은 가목(실지거래가액) 적용 시 상속개시일 상증법 §60~66 평가액을 **취득당시 실지거래가액으로 본다**.
- **§166③**: "기존건물과 그 부수토지의 **취득가액을 확인할 수 없는 경우**에는 [환산] 산식을 적용" → 환산은 **취득가액 확인 불가 시에만**.
- **§166①1 산식**: 인가전양도차익 필요경비 = "§97①2·3호 **또는 §163⑥**(개산공제)" — 개산공제는 환산취득 전용.

⇒ **상속 종전자산은 §163⑨이 취득가액(상속개시일 평가액)을 확인 가능하게 만들므로 §166③ 환산 대상이 아니다.** 실가(상속평가액)를 종전자산 취득가액으로 쓰고, 개산공제(§163⑥)도 배제(실제 필요경비 §97①2·3호만).

### 타깃 매트릭스

| 조건 | 종전자산 취득가액 | §166③ 환산 | 개산공제 |
|---|---|---|---|
| 상속개시일 평가액(reported) **확인**(>0) — post-1985 항상 / pre-1985 신고가액 있음 | reported | 배제 | 배제 |
| reported **미확인**(=0) — pre-1985 신고가액 없음 | — | §166③ 적용(현행) | 포함(현행) |

- pre-1985에서 reported < §176의2 환산(converted)이라도 재개발은 **reported 우선**(§166③ 조건 "취득가액 확인 가능" → 환산 배제). 일반 경로의 max(상증법,환산)와 **의도적 상이**(deviation) — 근거 §166③. 극희소.

## 구현 (surgical — 엔진 타입 변경 없음, `acquisitionCause`는 이미 존재)

### 엔진
1. `inheritance-acquisition-helpers.ts`: 신규 `resolveInheritedRedevelopmentAcqPrice(step)` — STEP 0.45 결과에서 "확인된 상속 취득가액" 추출.
   - post-deemed: `result.acquisitionPrice`(>0). pre-deemed: `result.preDeemedBreakdown.reportedAmount`(>0)만(§176의2 환산 제외). 미확인 시 `null`.
2. `transfer-tax.ts` 재개발 분기(line 247): `acquisitionCause==="inheritance"` && 위 값 non-null이면 `effectiveInput` override → `{ acquisitionPrice: reported, useEstimatedAcquisition: false }`. 재개발 엔진이 자연히 실가 슬롯 사용 + 개산공제 0(split:161).

### UI (clarity — defense-in-depth)
3. `RedevelopmentBlock.tsx`: `acquisitionCause==="inheritance"` 시 안내 ToneCard(상속개시일 평가액을 종전자산 취득가액으로 사용, §163⑨) 추가. (상가 CompanionAcqInheritanceBlock 패턴 차용.)

### 테스트
4. anchor: (A) post-1985 확인 → reported 사용, (B) pre-1985 reported 확인 → reported, (C) reported 미확인 → §166③ 유지, (D) case-44/48 회귀 0.

## 회귀 안전
- 비상속(매매 등) 재개발: `acquisitionCause!=="inheritance"` → override 미발동 → 불변.
- case-48 승계조합원: `inheritedAcquisition` 미설정(acquisitionPrice 직접) → step undefined → override 미발동 → 불변.
- 일반(비재개발) 상속 경로: STEP 0.45 로직 불변(override는 재개발 분기 직전에만).
