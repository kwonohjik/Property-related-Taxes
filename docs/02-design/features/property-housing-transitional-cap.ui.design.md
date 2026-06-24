# 주택 재산세 세부담상한 경과조치(부칙 제15조) — UI 설계

작성일: 2026-06-24
엔진설계: `property-housing-transitional-cap.engine.design.md`
scope: v1 본세 (도시지역분 입력·표시는 v2)

---

## 1. 사용자 시나리오

- **시나리오 A (대상)**: 1세대1주택자가 2025 재산세 계산. Step3에서 "부칙 제15조 경과조치" 토글 ON → 직전연도 본세 입력 → 결과에 "산출 266,072 → 직전 215,300×110% = 236,830" 흐름.
- **시나리오 B (신축·비대상)**: 토글 OFF → 경과조치 미적용(기존 동작).
- **시나리오 C (토글 ON + 본세 미입력)**: validation 차단(자동 안분 fallback 금지).

---

## 2. Step3 위젯 (objectType==="housing")

```
[ToggleCard tone="sky"]  housingTaxCapEnabled
  제목: "부칙 제15조 세부담상한 경과조치"
  설명: "2024.1.1 이전 과세된 주택은 2028년까지 종전 세부담상한(전년 대비 105~130%) 적용.
         2024년 이후 최초 과세 신축주택은 해당 없음."
  OFF → 안내만 ("2024 개정으로 주택 세부담상한 원칙 폐지 §122")
  ON  → 펼침:
    ┌ 색상 카드 (sky)
    │ ① 직전연도 재산세 본세 (원)  [CurrencyInput]  housingPreviousYearTax
    │   hint: "전년도 7월·9월 고지서의 '재산세' 금액을 합산해 입력하세요"
    └ [공시구간 자동 안내 칩] "공시가격 5.18억 → 110% 상한 적용 예정"
```
- 도시지역분 입력은 **v1 제외**(v2).
- 공용 컴포넌트: `ToggleCard`(OFF도 tone 유지)·`CurrencyInput`(parseAmount). placeholder 숫자 금지 → hint.

---

## 3. 클라이언트 8지점

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | FormState | shared.ts:117 | `housingTaxCapEnabled: boolean`, `housingPreviousYearTax: string` |
| ② | INITIAL_FORM | shared.ts:190 | `false` / `""` |
| ③ | normalize | shared.ts / migration | `?? false` / `?? ""` |
| ④ | API 변환 | **shared.ts:360 `buildPropertyTaxRequestBody`** (※ `lib/calc/property-api.ts` 미존재·단일경로) | housing+토글 ON+값>0 시 `body.previousYearHousingBaseTax = parseAmount(form.housingPreviousYearTax)` |
| ⑤ | UI 위젯 | Step3.tsx:14-32 | housing 분기를 ToggleCard+CurrencyInput로 교체 |
| ⑥ | 사이드바 | — | `totalPayable` 재사용, 무변경 |
| ⑦ | 결과 카드 | PropertyTaxResultView.tsx:480-515 | `result.housingTransitionalCap?.applied` 시 표시(아래 §4) |
| ⑧ | validation | shared.ts:239 validateStep | housing+토글 ON+본세 미입력 → 차단. OFF → 미차단·미전송(④와 정합) |

---

## 4. 결과 카드 (⑦)

`housingTransitionalCap.applied === true`일 때 산출세액 섹션에 추가:
```
산출세액                       266,072
직전연도 재산세 본세 (부칙 §15)  215,300
세부담상한 (직전 × 110%)        236,830   ← 적용
확정세액                       236,830
```
- 한국어 풀어쓰기, `floor()`·약어 금지. 법정 용어 "부칙 제15조"·"세부담상한".
- 도시지역분은 v1에서 현행대로 표시(상한 미반영) + 안내 문구 "도시지역분 세부담상한은 후속 반영 예정".

---

## 5. validation (⑧) — 정책 점검

| 조건 | 처리 | 정책 |
|---|---|---|
| 토글 OFF | 통과·API 미전송 | 자동 안분 fallback 금지 준수 |
| 토글 ON + 본세 미입력/≤0 | "경과조치 적용 시 직전연도 재산세 본세를 입력하세요" 차단 | 미입력=검증오류 |
| 토글 ON + 본세 입력 | 통과 | — |

- **3중 패턴**: 토글 OFF → ④ 미전송 ∧ ⑧ 미차단 (모순 0). display fallback 없음(미입력 시 엔진 warning).
- **useEffect 미러링 금지**: 토글·필드 노출은 onChange 직접 + JSX 조건부 렌더. useEffect→store 없음.

---

## 6. 엔진↔UI 필드명 정합

| UI form (string) | API body / 엔진 input (number) |
|---|---|
| `housingPreviousYearTax` | `previousYearHousingBaseTax` (parseAmount 변환) |
| `housingTaxCapEnabled` (노출제어) | (엔진 게이트는 "필드 존재"로 판정 — 토글 OFF=미전송) |
