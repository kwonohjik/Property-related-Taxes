# 비상장주식 간편평가(V1) 입력 폼 리스타일 계획서

> 작성일 2026-05-27 · 세목: 상속세·증여세 (비상장주식 간편평가 UI)
> 작성: inheritance-gift-tax-ui-senior
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `e2e/inheritance-unlisted-simple-redesign.spec.ts` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: **Plan** · **엔진/산식/결과값 변경 0건 — 순수 UI 레이아웃·컴포넌트 교체**~~
> 대상: `components/calc/UnlistedStockSimpleFields.tsx` (현재 533줄)
> 관련: [[project_unlisted_stock_mode_selector]] · 영업권 PR `docs/00-pm/inheritance-unlisted-stock-simple-goodwill.plan.md`

---

## 0. 동기

정식평가(V2)는 색상 섹션 카드 + 번호 원 + `FieldCard`(좌-라벨/우-입력)로 입력란이 또렷한데(이미지29), 간편평가(V1)는 raw `<input>` + 플랫 라벨이라 입력란이 눈에 잘 안 들어온다(이미지28). V2와 동일한 시각 구조로 리스타일한다.

---

## 1. 현행 문제 진단

| 항목 | V1 현행 (밋밋) | V2 기준 (또렷) |
|---|---|---|
| 외곽 구조 | 없음 (flat div 나열) | `border-2 border-indigo-300 bg-indigo-50/30` 카드 |
| 섹션 구분 | 없음 | 번호 색상 섹션 카드 (`rounded-lg border border-{tone}-200`) |
| 번호 원 | 없음 | `flex h-5 w-5 rounded-full bg-{tone}-200 text-{tone}-800` |
| 입력 필드 래퍼 | `<label class="text-xs">` + plain `<input>` | `FieldCard` (데스크톱 좌-라벨/우-입력) |
| 회사명 | raw `<input>` (272줄) | FieldCard |
| 총 발행주식 수 | raw `<input>` (305줄) | FieldCard |
| 보유 주식 수 | raw `<input>` (326줄) | FieldCard |
| 자본환원율 | raw `<input>` (411줄) | FieldCard |
| 순손익 Y1~Y3 | CurrencyInput (라벨 span 직접) | FieldCard 래핑 |
| 순자산 | CurrencyInput (라벨 span 직접) | FieldCard 래핑 |

핵심 결함: 색상·번호·카드 부재로 논리 그룹이 시각적으로 구분되지 않음. 4개 raw `<input>`은 `FieldCard` 미사용으로 좌-라벨/우-입력 레이아웃 미적용.

---

## 2. 섹션 재구성안

### 외곽 카드
V2와 동일: `border-2 border-indigo-300 bg-indigo-50/30 rounded-lg p-4` 외곽 래퍼.

### 섹션 번호·tone 매핑

| 번호 | 섹션 제목 | tone | 포함 필드 |
|---|---|---|---|
| 1 | 평가 대상·주식 수 | **sky** | 회사명, 총 발행주식 수, 보유 주식 수 |
| (toggle 그룹) | 특수 사유 | rose / 기존 유지 | 부동산과다보유(ToggleCard rose), §54④사유(`UnlistedStockSpecialReasonSection`) — 섹션 1 아래·섹션 2 위 |
| 2 | 순손익가치 입력 | **emerald** | 자본환원율, netIncomeY1~Y3, 가중평균 미리보기 |
| 3 | 순자산가치 입력 | **violet** | 순자산(netAssetValue) + sky 영업권 안내 박스(기존) |

> tone은 시각 구분 목적. V2 CorporateInfoSection이 sky(1)·violet(2)를 쓰므로 sky·violet 채택은 V2와 정합. emerald(2)는 순손익(수익가치) 구분용. 기존 rose ToggleCard·RadioCardGroup tone은 유지(변경 불필요).

섹션 카드 구조 (V2 차용 — `CorporateInfoSection.tsx:170~174·325~327`):
```
rounded-lg border border-{tone}-200 bg-{tone}-50/40 p-3 space-y-3
  헤더: flex items-center gap-2
    <span class="flex h-5 w-5 items-center justify-center rounded-full
                 bg-{tone}-200 text-[10px] font-bold text-{tone}-800">N</span>
    <p class="text-xs font-semibold text-{tone}-700">섹션 제목</p>
  body: FieldCard 목록
```

미리보기 `UnlistedStockPreview`(계산 내역)는 섹션 3 하단(또는 외곽 카드 맨 아래) 기존 위치 유지.

---

## 3. 컴포넌트 교체 매핑

### 4개 raw input → FieldCard

| 필드 | 현행(줄) | 교체 후 | 비고 |
|---|---|---|---|
| 회사명 | raw `<input>`(272) | `FieldCard` + text input | placeholder 숫자 금지 → hint로 형식 안내. select-on-focus는 Provider 자동 |
| 총 발행주식 수 | raw `<input>`(305) | `FieldCard unit="주"` + `IntegerInput` | CurrencyInput("원" 전용) 금지. 정수 콤마 포맷 |
| 보유 주식 수 | raw `<input>`(326) | `FieldCard unit="주"` + `IntegerInput` | 동일 |
| 자본환원율 | raw `<input>`(411) | `FieldCard unit="%"` + `DecimalInput`(parseDecimal) | CurrencyInput 금지(소수점 버그). 기본 10 |

### 기존 CurrencyInput 래핑

| 필드 | 현행 | 교체 |
|---|---|---|
| netIncomeY1~Y3 | `NetIncomeYearRow`(라벨 span + CurrencyInput allowNegative) | `FieldCard unit="원"` + CurrencyInput `hideLabel`/`hideUnit`로 단위 중복 방지. 결손 안내·연도 라벨 유지 |
| netAssetValue | CurrencyInput allowNegative(라벨 span) | `FieldCard` + CurrencyInput `hideLabel` |

### 정수 콤마 입력 (총·보유 주식 수)

| 선택지 | 평가 |
|---|---|
| A. FieldCard + 인라인 `<input>` + onChange 콤마 직접 | 단순, 중복 로직 2곳 |
| B. **`IntegerInput` 소형 헬퍼 신규**(`components/calc/inputs/IntegerInput.tsx`, ~30줄) | 재사용 가능 · inputMode numeric · 콤마 포맷 · id 전달(라벨 연결) — **권장** |
| C. CurrencyInput unit override | "원" 의미 충돌 → 금지 |

권장 **B**. 구현 시 30줄 내, FieldCard children 전용.

---

## 4. 미리보기·영업권 보존 (절대)

`UnlistedStockPreview`(㉮㉯㉰㉱ 4줄 · 산출근거 6줄 펼침 · §55③ amber · sky 안내)는 **로직·필드·내부 JSX 일절 수정 금지**. 시각 조화:
- 미리보기 외곽 `bg-gray-50 border` 유지 → indigo 외곽 카드 내부에서 자연 분리.
- amber·sky 배지는 섹션 카드 tone과 영역 분리되어 충돌 없음.

---

## 5. 8 동기화 지점 영향 — ⑤만 변경

| 지점 | 영향 | 근거 |
|---|---|---|
| ① FormData 타입 | 없음 | 필드명·타입 무변경 |
| ② initial | 없음 | |
| ③ normalize | 없음 | |
| ④ API 변환 | 없음 | |
| ⑤ UI 위젯 | **있음(유일)** | FieldCard·섹션카드·컴포넌트 교체 |
| ⑥ 사이드바 | 없음 | store selector 무변경 |
| ⑦ 결과 카드 | 없음 | UnlistedStockPreview 보존 |
| ⑧ validation | 없음 | |

엔진·타입·API·validation·anchor 영향 **0건** — 순수 ⑤.

---

## 6. 800줄 정책

현행 533줄. 예상 증가 외곽(+5)·섹션 3개(+30)·raw→FieldCard(+20)·IntegerInput 분리(+0, 별파일)·CurrencyInput 래핑(+20) ≈ **+75 → ~610줄** (800 미만, 단일 파일 유지 가능).
초과 위험 시 즉시 분할:
```
UnlistedStockSimpleFields.tsx          (orchestrator)
  ├─ SimpleSharesSection.tsx           (① sky)
  ├─ SimpleNetIncomeSection.tsx        (② emerald)
  └─ SimpleNetAssetSection.tsx         (③ violet)
components/calc/inputs/IntegerInput.tsx (공용)
```

---

## 7. 규칙 준수 체크

| 규칙 | 방침 |
|---|---|
| select-on-focus | Provider 전역 자동 — 별도 onFocus 불필요 |
| placeholder 숫자 금지 | 빈 placeholder + FieldCard `hint` 한국어 형식 설명 |
| native input은 FieldCard 안에만 | IntegerInput은 FieldCard children 전용 |
| ToggleCard/RadioCardGroup OFF tone 유지 | rose ToggleCard·§54④ RadioCard 기존 구조 무변경 |
| Tailwind 정적 tone 매핑 | `bg-${tone}-50` 동적 금지 → `Record<Tone,string>` 정적 매핑 ([[feedback_tailwind_static_tone_mapping]]) |
| CurrencyInput="원" 전용 | 주식 수는 IntegerInput |
| DecimalInput + parseDecimal | 자본환원율 % |
| FieldCard hideLabel/hideUnit | CurrencyInput 내부 라벨·단위 중복 방지 |

---

## 8. 회귀 위험 — e2e selector

| spec | 위험 selector | 방침 |
|---|---|---|
| `inheritance-unlisted-deficit-negative.spec.ts` | `getByText(/순자산가치 \(회사 전체/)` → input, `직전 N사업연도 순손익액` xpath `../..` | FieldCard 래핑으로 DOM depth 변경 → xpath selector 깨질 수 있음. **라벨 텍스트 동일 유지** + xpath 대신 `getByLabel(id)` 또는 `data-testid` 보강 후 spec 정정 |
| `inheritance-unlisted-simple-goodwill.spec.ts` | `inputByLabel`(`getByText(label).xpath=..`), `netIncomeInput`(xpath `../..`) | 동일 — FieldCard `<label htmlFor>`+input `id` 연결 시 `getByLabel`로 안정화. 구조 변경 후 두 spec 실행하여 실패 selector 정정 |

**FieldCard·IntegerInput·DecimalInput에 `id` prop 전달 필수** — `getByLabel` 안정성 확보. Do 완료 조건 = 기존 e2e 2건 GREEN.

---

## 9. e2e 추가 (`e2e/inheritance-unlisted-simple-redesign.spec.ts`)

| # | 검증 |
|---|---|
| R-1 | 섹션 번호 원 1·2·3 렌더 (`data-testid="simple-section-num-{1,2,3}"`) |
| R-2 | sky 평가대상 섹션 존재 |
| R-3 | emerald 순손익가치 섹션 존재 |
| R-4 | violet 순자산가치 섹션 존재 |
| R-5 | FieldCard 미래핑 독립 input 0건 |
| R-6 | UnlistedStockPreview 보존(㉮㉯㉰㉱ + §55③ amber) |

testid: `simple-section-num-{1\|2\|3}` · `simple-section-{shares\|net-income\|net-asset}`.

---

## 10. Do 단계 시퀀스

1. `IntegerInput.tsx` 신규(~30줄, FieldCard 호환·id 전달).
2. `UnlistedStockSimpleFields.tsx` 리스타일: 외곽 indigo → ① sky(회사명·주식수) → rose ToggleCard·§54④ → ② emerald(환원율·순손익) → ③ violet(순자산) → UnlistedStockPreview(보존).
3. 800줄 측정 → 초과 시 §6 분리.
4. `npx tsc --noEmit` 0 · lint 0.
5. 기존 e2e 2건 실행 → selector 정정.
6. 신규 R-1~R-6 작성·실행.
7. 전체 `npm test` 회귀 0 (UI 변경이라 엔진 anchor 무영향 확인).
