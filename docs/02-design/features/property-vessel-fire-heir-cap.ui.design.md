# UI 디자인 — 재산세 후속 갭 3건

> 엔진 설계: `property-vessel-fire-heir-cap.engine.design.md` · 계획서: `../../01-plan/features/property-vessel-fire-heir-cap.plan.md`
> 대상 UI: `components/calc/property/Step0.tsx`(A-2)·`Step3.tsx`(A-3)·`results/PropertyTaxResultView.tsx`(A-1·A-3)
> 작성일 2026-06-16 · Design 단계

## 1. 작업별 UI 변경 요약

| 작업 | 입력 위젯 | 결과뷰 | 비고 |
|---|---|---|---|
| A-1 선박 소방분 | **변경 없음**(publishedPrice 기존) | 자동 표시(`:542-543` else) — 라벨 "지역자원시설세(선박분)" 개선만 선택 | UI 작업 최소 |
| A-2 주된상속자 | Step0 상속인 목록 **행 기반 재설계** | 주된상속자 판정 근거 표시(선택) | 핵심 UI 작업 |
| A-3 §118 재산정 | Step3 **모드 토글 + 직전 과세표준** | 재산정 산식 표시 | 모드 분기 |

## 2. A-2 상속인 입력 위젯 (Step0 `:343-350` 재설계)

현행: 단일 `<input>` 쉼표 구분(`heirsText`). → 행 기반(성명+지분+생년).

```
┌─ 상속인 목록 (§107②2호) ──────────────────────────────────┐
│  주된 상속자 = 민법상 지분 최대자, 동률이면 연장자 (시행규칙 §53)   │
│                                                              │
│  성명          지분(0~1)        생년월일                      │
│  [홍길동____]  [0.50]          [1970]-[03]-[15]      [✕]      │
│  [홍길순____]  [0.50]          [1972]-[06]-[20]      [✕]      │
│  [ + 상속인 추가 ]                                            │
│                                                              │
│  ⓘ 지분·생년 미입력 시 첫 상속인을 주된 상속자로 봅니다(자동 안분 안 함) │
└──────────────────────────────────────────────────────────┘
```

- **성명**: `<input type="text">` (SelectOnFocusProvider 자동 — 개별 onFocus 불요)
- **지분**: `DecimalInput` + `parseDecimal` (0~1 소수 — **CurrencyInput 금지**, memory `feedback_decimal_input`)
- **생년월일**: `DateInput` (`type="date"` 금지, memory `feedback_date_input`)
- 행 추가/삭제 버튼. 빈 행 0개여도 무방(상속 미등기 선택 시에만 노출 — **`form.ownershipType === "inherit"`**, `Step0.tsx:341`·`shared.ts:138` union. `acquisitionCause` 아님 — 검토 #13 정정)
- 성명 placeholder만 유지("홍길동, 홍길순" 스타일), 지분·생년은 hint로 안내(placeholder 예시 최소화)
- **testid**: `heir-row-{i}-name`·`heir-row-{i}-share`·`heir-row-{i}-birth`·`heir-add`·`heir-remove-{i}`
- 색상 카드: `border-violet-200 bg-violet-50/40`(거주·자격 정보 tone) + 섹션 번호 (다-섹션 패턴)

## 3. A-3 세부담상한 모드 토글 (Step3 `:33-51` 확장)

비주택일 때만(주택은 현행 §122 단서 안내 유지):

```
┌─ 전년도 세액 (비주택, 선택) ────────────────────────────────┐
│  ◉ 직전연도 실제 부과세액 직접 입력            (§118 단서)      │  ← 기본
│      [전년도 재산세 납부액 _________ 원]                       │
│                                                              │
│  ○ 직전연도 과세표준으로 재산정              (§118 본문)        │
│      [직전연도 과세표준 _________ 원]                          │
│      → 직전연도 세율로 세액상당액을 재산정해 150% 상한 적용       │
│  ⓘ 분할·합병·신축 등 현황 변동은 미반영(직접입력 권장)           │
└──────────────────────────────────────────────────────────┘
```

- 모드 선택: **`RadioCardGroup`** (native radio 금지, layout="stack"). OFF 옵션도 tone 배경 유지.
- 금액 입력: `CurrencyInput` + `parseAmount` (원 정수). `previousYearTax`(직접)·`previousYearTaxBase`(재산정) 각 모드에서만 노출.
- **testid**: `taxcap-mode-direct`·`taxcap-mode-recompute`·`prev-year-tax`·`prev-year-taxbase`
- `LawArticleModal` §122·§118 링크 유지.

## 4. A-1 결과뷰 (PropertyTaxResultView `:542-543`)

엔진이 vessel `regionalResourceTax > 0`을 채우면 **기존 else 분기로 자동 표시**됨(추가 작업 불요). 선택 개선: vessel일 때 라벨을 "지역자원시설세(선박분, §146③1호)"로 분기(building "지역자원시설세"와 구분).

## 5. UI 8개 동기화 지점 (components/calc/CLAUDE.md)

| # | 지점 | A-2 | A-3 |
|---|---|---|---|
| ① 폼 상태 | `shared.ts` | `heirs: {name;shareRatioText;birthDate}[]`(`:148` `heirsText` 대체) | `taxCapMode`·`previousYearTaxBase`(`:120` 옆) |
| ② initial | `shared.ts:180·197` | `heirs: []` | `taxCapMode:"direct"`·`previousYearTaxBase:""` |
| ③ normalize | `shared.ts` + `Step0.tsx:266` | legacy `heirsText` → 행 승급 | 기본 direct |
| ④ API 변환 | `shared.ts:442-446` | 행→`{name,shareRatio?,birthDate?}[]` | base 모드 시 `previousYearTaxBase` 전송(비주택) |
| ⑤ UI 위젯 | `Step0.tsx:343-350` | §2 행 기반 | `Step3.tsx` §3 모드 토글 |
| ⑥ 사이드바 | — | 재산세 합계 selector 없음 → 무관 | 무관 |
| ⑦ 결과 카드 | `PropertyTaxResultView` | 주된상속자 근거(선택) | 재산정 산식(선택) |
| ⑧ validate | `shared.ts:217~`·`property-input.ts` | 지분 전원 입력 시만 합계≤1, 미입력 통과(§3.4) | 재산정 모드 시 과세표준>0, 미입력 경고(차단 아님) |

## 6. 정책 준수 체크 (UI)

- [x] 지분 = `DecimalInput`(CurrencyInput 금지) / 생년 = `DateInput`(type=date 금지)
- [x] 모드 = `RadioCardGroup`(native radio 금지), OFF tone 유지
- [x] 금액 = `CurrencyInput` + `parseAmount`
- [x] 자동 안분 fallback 금지 — 지분 미입력은 경고만(memory `feedback_no_silent_apportion_fallback`)
- [x] UI 통과 ↔ validate 차단 모순 금지(⑧)
- [x] placeholder 숫자 예시 금지 — 한국어 설명(hint)
- [x] StepWizard 네비 버튼 유지
- [x] 색상 카드 + 섹션 번호(다-섹션 패턴)
