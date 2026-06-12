# 거래정지 확장 (C-2 full/사례49 · C-3 취득후상장 교차) 구현 계획서

> 작성: 2026-06-13 · 기준 origin/master `d05eebb2`(PR #165 머지 후) · 시리즈: `stock-transfer-remaining-followups.plan.md` §1 Track C C-2·C-3
> **검증 상태**: §1 법령 인용은 KoreanLaw MCP 축자(소득세법 시행령 §165③·⑤ MST 286211 · 상증령 §52의2③ MST 283637, B-4·B-5 fetch 재독). §4·§5 코드 인용은 Read/grep 실측.
> 선행: C-1(취득일 거래정지 ✅PR-δ). 본 PR은 거래정지 §165③ 우회의 잔여 2갭.

---

## 0. 목적·배경

거래정지·관리종목(§165③) 시 상장주식이라도 1개월 종가평균 대신 **비상장 보충 평가(§165④)로 우회**한다(C-1·PR-δ에서 양도일·취득일 거래정지 본격 구현). 잔여 2갭:

- **C-2**: 거래정지 시 비상장 보충 평가의 **full(결산서)·사례49(액면가) 모드가 UI에서 차단**(simpleOnly) — 직접 4값 입력만 가능. 상세 결산서·장부분실 액면가 보유자 미지원.
- **C-3**: 거래정지(양도일) + 취득 후 상장(§165⑤) 조합 — validate G-5가 차단. 법령상 조합 가능성 판정 필요.

---

## 1. 법령 근거 (KoreanLaw 축자)

### 1.1 C-2 — 거래정지 시 비상장 보충 평가 (기확립)

§165③ → §99①3 "대통령령으로 정하는 것" = 상증령 §52의2③ 해당(거래정지 제외) → 거래정지 주식은 §99①3 적용 배제 → §99①4(비상장 보충평가 §165④). **비상장 보충평가는 full 결산서·사례49(§99①4 후단 장부분실 액면가)를 모두 지원**(엔진 `calcUnlistedValuation` 기구현). → C-2는 **신규 법령 없음**(C-1에서 확립된 §165③→§165④ 체인의 UI/api 노출 확장).

### 1.2 C-3 — 거래정지(양도일) + 취득 후 상장(§165⑤) **법령상 양립 불가 판정** ★

| 조문 | 본문 (축자) | 함의 |
|---|---|---|
| §165⑤ | "주식등의 **양도일 현재에는 제3항에 따른 주식등에 해당**되나 그 취득 당시에는 제3항에 따른 주식등에 해당되지 않는 경우 …" | §165⑤ 적용 = **양도일에 §3항 주식**(코스닥/코넥스 상장 + §52의2③ 해당) 전제 |
| §165③ | "법 제99조제1항제3호에서 '대통령령으로 정하는 것'이란 상증령 **제52조의2제3항에 해당하는 것**" | §3항 주식 = §52의2③ 해당 |
| 상증령 §52의2③ | "… 매매거래가 정지되거나 관리종목으로 지정된 기간 … 이 포함되는 주식등 … 을 **제외한** 주식등" | **거래정지·관리종목 주식은 §52의2③ 해당 아님** → §3항 주식 아님 |

**결론**: 양도일 거래정지 → §52의2③ 미해당 → §3항 주식 아님 → **§165⑤ 전제("양도일 현재 §3항 주식") 불성립**. 거래정지(양도일) + 취득 후 상장(§165⑤)은 **법령상 양립 불가**. 양도일 거래정지면 양도·취득 기준시가 모두 비상장 보충평가(§165④)로 산정되는 일반 비상장 환산 케이스이며 §165⑤ 환산은 적용되지 않는다.

→ **현행 validate G-5 차단이 법령상 정확**. C-3은 **엔진 재설계 불요** — 차단 확정 + 법령 근거 문서화(로드맵 "분기 우선순위 재설계" 전제 기각).

### 1.3 인용 경계
- C-2: §165③·§165④(비상장 보충평가)·§99①4 후단(사례49 액면가). C-3: §165⑤·§165③·§52의2③.

---

## 2. 케이스 매트릭스

### C-2 (거래정지 양도 + 비상장 보충평가 모드)

| # | tradingHaltAtTransfer | unlistedValuationMode | acqFaceValueOnly | 동작 |
|---|---|---|---|---|
| C2-1 | ON | simple | false | 현행 — 직접 4값(회귀 0) |
| C2-2 | ON | full | false | **신규**: 결산서 입력 → adapter 합성 → calcUnlistedValuation full 평가 |
| C2-3 | ON | simple | true | **신규**: 사례49 — 취득 액면가 + 양도 §165④ 보충평가 |
| C2-4 | OFF | full | — | 기존 비상장 full (무변경 — marketType unlisted) |

### C-3 (거래정지 양도 + 취득 후 상장 — 차단 확정)

| # | tradingHaltAtTransfer | acquiredBeforeListing | 동작 |
|---|---|---|---|
| C3-1 | ON | ON | **validate + Zod 차단** — 법령상 양립 불가(§1.2). 메시지 법령 근거 보강 + Zod refine 신규 |
| C3-2 | ON | OFF | C-2 경로(비상장 보충평가) |
| C3-3 | OFF | ON | 취득 후 상장 §165⑤ (무변경) |

---

## 3. C-2 산식·엔진 (신규 엔진 0)

거래정지(양도) 분기는 이미 `calcUnlistedValuation(input, transferPrice)` 호출(`stock-transfer-tax.ts:292` tradingHaltAtTransfer 분기). `calcUnlistedValuation`은 full(weighted_avg)·사례49(acq_face_value_only) 전부 지원(실측). **엔진 변경 0** — 입력이 도달하도록 api 게이트·UI만 확장.

- full 모드: adapter `adaptUnlistedFlatToApiBody`가 결산서 → 4값 합성(api `:520`). 게이트를 거래정지 포함으로 확장.
- 사례49: `acqFaceValueOnly` body 설정(api `:500`). 게이트 확장.

---

## 4. C-2 적용 지점 (api 게이트 + UI)

### 4.1 api 게이트 확장 (`stock-transfer-tax-api.ts`)

```
:502 사례49 게이트:  form.marketType === "unlisted"
  → (form.marketType === "unlisted" || form.tradingHaltAtTransfer)
:520 full 게이트:    form.marketType === "unlisted" && unlistedValuationMode === "full"
  → (form.marketType === "unlisted" || form.tradingHaltAtTransfer) && unlistedValuationMode === "full"
```

- 거래정지 시 상장주식이라도 비상장 보충평가 경로 → full/사례49 입력 전송 허용. silent strip 해소.

### 4.2 UI simpleOnly 해제 (`Step2.tsx:374`)

```
<EstimatedUnlistedBlock form={form} onChange={onChange} simpleOnly />
  → <EstimatedUnlistedBlock form={form} onChange={onChange} />   // simpleOnly 제거
```

- `EstimatedUnlistedBlock`의 full(V2)·사례49 토글 노출(`:211` `!simpleOnly` 게이트 통과). acquisitionSideOnly(C-1)은 무관.

### 4.3 validate 동기화 (⑧) — STEP 3 실측 반영

현행 C-6(`:238` `tradingHaltAtTransfer && !acquiredBeforeListing`)은 `validateUnlistedSimpleFields`(**simple 전용**) 호출 → 거래정지 full/사례49 미검증. 비상장 본칙 full/사례49 검증(`:322` 블록)은 **marketType unlisted 전용**이라 거래정지(listed) 경로 미적용(STEP 3: listed/unlisted 블록 분리).

→ **공유 헬퍼 `validateUnlistedValuationFields(form, errors)` 추출**(`:322` 블록 전체 — simple/full/사례49 **+ B-4 §165⑨**). 본칙(`:322`)·거래정지 C-6(`:238`) 양쪽 호출 → dual-truth 방지([[feedback_ui_engine_dual_truth_avoidance]]). 회귀 0(본칙 경로 동작 보존 확인).

★ STEP 8: simpleOnly 제거로 거래정지 경로에 §165⑨ 섹션 노출 — 거래정지(양도)+§165⑨ 정당(양도 기준시가=비상장 보충평가→동일 시 §165⑨ 적용·calcUnlistedValuation 기처리). UI 노출↔validation 정합 위해 §165⑨를 헬퍼에 포함.

---

## 5. C-3 확정·서버 방어 (★ STEP 1: Zod refine 추가)

법령상 양립 불가(§1.2) — 차단 유지가 정답이나, **현행 차단은 validate(UI)만·Zod refine 부재**(STEP 1 실측: `:330` C-1 `tradingHaltAtAcquisition && acquiredBeforeListing` refine은 있으나 양도일 거래정지 조합은 서버 차단 없음). API 직접 호출 시 엔진 post-listing 先行으로 침묵 오산출 → **C-1 패턴(`:330`) 정합 위해 Zod refine 추가**.

1. **Zod refine 추가**(`stock-transfer-tax-schema.ts:330` 인근, addPropertyRefines): `tradingHaltAtTransfer && acquiredBeforeListing` → reject. 메시지 = validate와 동일 법령 근거.
2. **validate G-5 메시지 보강**(`:260-266`): "거래정지 + 취득 후 상장 조합은 지원하지 않습니다" → **"양도일 거래정지·관리종목 주식은 §3항 주식이 아니어서(상증령 §52의2③ 제외) 취득 후 상장(§165⑤) 환산 대상이 아닙니다. 거래정지 또는 취득 후 상장 중 하나만 선택하세요."**
3. **엔진 주석**(`stock-transfer-tax.ts` post-listing 분기): "거래정지+취득후상장은 validate+Zod 차단(법령 양립 불가·§52의2③) — 엔진 도달 불가" 보강.
- 확인 anchor: C3-VALIDATE-1(validate error) + C3-ZOD-1(Zod reject) + 기존 PL-VALIDATE-7 유지.

---

## 6. 14 동기화 지점 (C-2 — 신규 입력 0)

C-2는 **신규 필드 0**(기존 full/사례49 필드 재사용). 게이트·UI·validate만:

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | form·initial·normalize | 무변경(필드 기존) |
| ④⑬ | api 변환 | §4.1 게이트 2곳 `|| tradingHaltAtTransfer` |
| ⑤ | UI 위젯 | §4.2 simpleOnly 제거 |
| ⑥ | 사이드바 | 무변경 |
| ⑦ | 결과 카드 | 무변경(full/사례49 결과 카드 기존 — method weighted_avg/acq_face_value_only) |
| ⑧ | validate | §4.3 거래정지+full/사례49 필수 검증 |
| ⑨~⑫⑭ | Zod·route | 무변경(필드 기존) — grep 자가 점검 |

C-3는 신규 필드 무관 — ⑧ validate 메시지 보강 + ⑩ Zod refine 신규(addPropertyRefines) + 엔진 주석.

## 7. anchor

`__tests__/tax-engine/stock-transfer/section-halt-extension-c2-c3.test.ts`:

| anchor | 검증 |
|---|---|
| C2-ENGINE-1 (C2-2) | 거래정지 + full 결산서 합성 → calcUnlistedValuation full 평가 = 비-거래정지 full 동일값 |
| C2-ENGINE-2 (C2-3) | 거래정지 + 사례49(액면가) → 취득 액면가 + 양도 §165④ 환산 |
| C2-API-1 | 게이트 확장 — 거래정지 시 full/사례49 body 도달(strip 부재) |
| C2-REGRESS-1 | 거래정지 simple(C2-1) 불변(회귀 0) |
| C3-VALIDATE-1 | 거래정지+취득후상장 → validate error(법령 근거 메시지) |
| C3-ZOD-1 | 거래정지+취득후상장 → Zod parse reject(서버 방어, C-1 :330 패턴) |

- Pre-Do: 기존 거래정지(halt-acquisition·trading-halt)·post-listing anchor 전수 통과 + C-2 full/사례49 strip 실패 anchor 1건 확보.
- E2E 1건(포트3200): 거래정지(양도) 상장주식 + full 모드 노출(simpleOnly 해제 증명) + 계산.

## 8. 비스코프·리스크

- **C-3 양립 불가 확정**: 법령상 불가(§1.2) — 엔진 분기 재설계·교차 환산 구현 **불요**(로드맵 전제 기각). 만약 향후 예규로 양립 사례 발견 시 재검토(미발견).
- **C-2 게이트 확장 부작용**: `tradingHaltAtTransfer` 추가로 거래정지 시에만 full/사례49 전송 — 비-거래정지 상장(일반 종가평균)엔 영향 0(게이트 OR 조건이 거래정지일 때만 추가 발화).
- **거래정지+§165⑨**: STEP 8 — simpleOnly 제거로 정당하게 노출·공유 헬퍼로 validation 정합(별도 교차 구현 아닌 자연 포함). 거래정지+§81④(post-listing 준용)은 G-5 차단으로 무관.
- C-2(구현)·C-3(Zod refine+메시지)는 한 PR. 13단계에서 분리 여부 재확인.
</content>
