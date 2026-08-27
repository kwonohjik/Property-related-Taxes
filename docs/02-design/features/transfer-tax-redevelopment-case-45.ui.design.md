# 사례 45 — 재개발 APT 1세대1주택 12억 초과 + 거주월수 분리 — UI 설계

> 본 문서는 `transfer-tax-redevelopment.ui.design.md` (commit 743d8e5) 의 후속 확장 설계입니다.
> 입력 자료: PDF `재개발 취득실가 환산(청산금 납부).pdf` 화면 + xlsx `양도소득세 계산 사례/45번.xlsx`
> 시점: 2026-05-14
> 짝궁 엔진 디자인: `transfer-tax-redevelopment-case-45.engine.design.md`

---

## Context

사례 45 (1세대1주택 + 12억 초과 고가주택 + 청산금 납부) 입력 UI 가 사례 44 대비 두 가지 신규를 요구한다:

1. **종전주택 거주개월 / 신축주택 거주개월 분리 입력** — PDF 예제 화면(3p) 의 "① 기존주택 거주기간" + "② 신축주택 2년 실거주여부" 두 필드.
2. **1세대1주택 ON + 양도가액 > 12억 시 12억 안분 안내 + 분할 LTHD 표시 (결과 카드)**.

---

## 사용자 시나리오 (사례 45 입력 흐름)

```
[Step 1] 자산종류 선택
  → "재개발·재건축 아파트 (redevelopment_apt)" 선택

[Step 2] RedevelopmentBlock 입력
  ① 양도/취득 일자·가액 (사례 44 동일)
  ② 관리처분 인가일·권리가액
  ③ 청산금 (납부, 300M)
  ④ 1세대1주택 여부 → ON
  ⑤ 종전주택 거주개월 입력 (66)     ← ★ 신규
  ⑥ 신축주택 거주개월 입력 (0)       ← ★ 신규
  ⑦ 사례 45 가이드 카드 (해석례 2020-386 안내 — 신축 거주<24인 경우만 노출)

[Step 3] 결과화면
  - 12억 안분 박스 (비과세 양도차익 / 과세 양도차익)
  - 분할 LTHD 표 (existingRate / payRate 별 거주월수 귀속 표시)
  - 세액 (산출세액 11,311,376 / 지방세 1,131,137 / 합계 12,442,514)
```

---

## UI 명세

### 1) RedevelopmentBlock 거주월수 분리 입력 (신규 섹션 §⑤)

`components/calc/transfer/RedevelopmentBlock.tsx` — 1세대1주택 토글 직후 emerald tone 카드:

```
┌─ ⑤ 거주기간 (1세대1주택 + 표2 적용용) ──── tone=emerald ─┐
│                                                          │
│  종전주택 거주개월  [DecimalInput  66]  개월              │
│   form field: redevPriorHouseResidenceMonths              │
│   - hint: "종전주택 취득일부터 관리처분 또는 철거 전까지   │
│           실제 거주개월수 (시행령 §155⑰ 통산 산식 prior)" │
│                                                          │
│  신축주택 거주개월  [DecimalInput   0]  개월              │
│   form field: redevNewHouseResidenceMonths                │
│   - hint: "준공검사일부터 양도일까지 신축아파트 실거주     │
│           개월수 (해석례 2020-386 — 청산금분 표2 가드)"   │
│                                                          │
│  [LawArticleModal 배지 → §155⑰ + 해석례 2020-386]        │
│                                                          │
│  ※ 본 두 필드 입력 시 기존 자산수준 거주월수 입력          │
│    (residencePeriodMonthsAsset) UI 는 redev 분기에서 hide │
└──────────────────────────────────────────────────────────┘
```

가시성 조건:

- `assetKind === "redevelopment_apt"` AND `isOneHousehold === true` AND `householdHousingCount === 1` 일 때만 노출.
- 1세대1주택 OFF 시 두 필드 hide + 폼 값 빈문자열 유지 (silent 0 채우기 금지).
- redev 분기 진입 시 자산-수준 `residenceInputMode` interval 토글 hide (중복 입력 회피).

### 2) 사례 45 가이드 카드 (조건부)

`newHouseResidenceMonths < 24 && (prior + new) >= 24 && transferPrice > 12억` 진입 시:

```
┌─ ℹ 사전법령해석재산 2020-386 안내 ─── tone=violet ─┐
│ 청산금납부분 양도차익은 신축주택에서 2년 이상 거주 │
│ 하지 못한 경우 표1(보유분만, 30% 캡)이 적용됩니다.  │
│ 기존주택분 양도차익은 표2(보유+거주, 80% 캡)가     │
│ 적용됩니다. → 결과 화면에서 분할 LTHD 확인.         │
└─────────────────────────────────────────────────────┘
```

### 3) 결과 카드 — RedevelopmentDetailCard 확장

`components/calc/results/transfer/RedevelopmentDetailCard.tsx`:

#### 3-1) 12억 안분 박스 (highValueAllocation 부착 시)

```
┌─ 1세대1주택 고가주택 12억 안분 (§95③·시행령 §160) ──┐
│  양도가액                  1,500,000,000             │
│  비과세 기준               1,200,000,000             │
│  과세대상 비율             20.00 % (= 3억 / 15억)    │
│  ─────────────────────────────────────────          │
│  전체 양도차익             740,999,999               │
│   ↳ 비과세 양도차익        592,800,000               │
│   ↳ 과세대상 양도차익      148,199,999               │
└─────────────────────────────────────────────────────┘
```

#### 3-2) 분할 LTHD 표 (lthdResidenceAttribution 부착 시)

```
┌─ 장기보유특별공제 — 분할 적용 ───────────────────────────┐
│                                                          │
│  분기              과세대상 차익  보유  거주    율   LTHD │
│  ─────────────────────────────────────────────────────  │
│  기존건물분 (표2)   114,031,579  15년 5년(통산)  60%  68,418,947 │
│   ↳ §155⑰ 거주통산: 종전 5년 6월 + 신축 0년               │
│                                                          │
│  청산금납부분 (표1)  34,168,421   9년   -      18%   6,150,316 │
│   ↳ 해석례 2020-386: 신축 2년 미만 거주 → 표1 강등        │
│  ─────────────────────────────────────────────────────  │
│  합계                                              74,569,262 │
└──────────────────────────────────────────────────────────────┘
```

산식은 한국어 풀어쓰기 (memory `feedback_result_view_korean_formula.md`):

- "기존건물분 장기보유특별공제 = 114,031,579 × 60%" (`floor()` 표기 금지)
- 단위 "원" 표기 금지 (memory `feedback_no_won_suffix.md`)

### 4) 상세명세서 DetailedStatementRedevelopmentBuilders 확장

`components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts`:

기존 행 다음에 12억 안분 + 분할 LTHD 행 추가:

```
양도가액                       1,500,000,000
취득가액                         750,000,001  (= 종전실가 450M + 청산금 300M)
필요경비                           9,000,000
─────────────────────────────────────────
전체 양도차익                    740,999,999
비과세 양도차익 (≤12억 안분)     592,800,000   ← NEW
과세대상 양도차익 (>12억 안분)   148,199,999   ← NEW
 ↳ 기존건물분 과세대상            114,031,579   ← NEW
 ↳ 청산금분 과세대상               34,168,421   ← NEW
장기보유특별공제                  74,569,262
 ↳ 기존건물분 (표2 60%)           68,418,947   ← NEW
 ↳ 청산금분 (표1 18%)              6,150,316   ← NEW
양도소득금액                       73,630,737
```

---

## 폼 데이터 흐름 (14개 동기화 지점)

> **실제 코드 정합성 확인 (2026-05-14)**:
> - 폼 슬라이스는 `redev*` prefix 컨벤션 사용 (`lib/stores/calc-wizard-asset-redev.ts:14` `RedevelopmentFormSlice`)
> - Zod redevelopment 객체는 prefix 없음 (`lib/api/transfer-tax-schema.ts:300` `redevelopment: z.object({...})`)
> - 폼→API 변환은 `lib/calc/transfer-tax-api.ts:132` `// ⑬ 재개발/재건축` 블록에서 spread
> - Route handler 는 `app/api/calc/transfer/route.ts:398` 에서 `...data.redevelopment` spread 후 Date 변환 셀렉티브

| # | 위치 | 변경 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-redev.ts` `RedevelopmentFormSlice` | `redevPriorHouseResidenceMonths: string`, `redevNewHouseResidenceMonths: string` (★ `redev*` prefix 컨벤션 준수) |
| ② initial | 동상 (slice initial 객체) | `""` (빈문자열) |
| ③ normalize | `lib/calc/transfer-tax-api-helpers.ts` `buildRedevelopmentPayload` (line 675) | `parseInt(redevPrior\|\|"")` (NaN→undefined, 음수 reject) |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts:132~` `// ⑬ 재개발/재건축` 블록 | redevPayload 에 두 필드 spread (정규화 후) |
| ⑤ UI 위젯 | `RedevelopmentBlock.tsx` | DecimalInput × 2, 1세대1주택 ON 조건부 노출 |
| ⑥ 사이드바 합계 | (영향 없음 — 개월수는 합계 비대상) | — |
| ⑦ 결과 카드 | `RedevelopmentDetailCard.tsx` + `DetailedStatementRedevelopmentBuilders.ts` | 12억 안분 박스 + 분할 LTHD 표 + 상세명세서 7행 |
| ⑧ validation | `lib/calc/transfer-tax-validate-redev.ts` (현재 거주 검증 부재 — 신규 함수) | 1세대1주택 ON 일 때 prior≥0·new≥0 / OFF 시 미입력 허용 |
| ⑨ Zod enum (main) | (변경 없음 — propertyType 동일) | — |
| ⑩ Zod enum (companion) | (변경 없음) | — |
| ⑪ acquisitionDate fallback | (변경 없음) | — |
| **⑫ Zod 입력 객체 정의** | `lib/api/transfer-tax-schema.ts:300~329` `redevelopment: z.object({...})` 내부 (refines 앞) | `priorHouseResidenceMonths: z.number().int().nonnegative().optional()`, `newHouseResidenceMonths: 동일` 두 줄 추가 |
| **⑬ callTransferTaxAPI body spread** | `lib/calc/transfer-tax-api.ts:586` `...(redevPayload !== undefined ? { redevelopment: redevPayload } : {})` | redevPayload 빌더 출력에 prior/new 포함 — line 132 블록 수정. spread 경로는 그대로 |
| **⑭ Route handler 매핑** | `app/api/calc/transfer/route.ts:398` `...(data.redevelopment ? { redevelopment: { ...data.redevelopment, approvalDate: ..., ... } } : {})` | `...data.redevelopment` spread 가 두 필드를 자동 전달. Date 변환 불요 (number 필드) → 수정 0줄. 단, sync-checker 점검 대상 |

**⑧ validation 동기화 규칙** (`feedback_validation_sync_8th_point`):

- UI display fallback 없음 (둘 다 입력 필수가 아님, 기본 0).
- API fallback: 두 필드 모두 undefined → engine legacy fallback (`residencePeriodMonths` 단일값 사용).
- validate: 음수만 reject, undefined 허용. **3중 패턴 강제** — UI/API/validate 모두 동일 fallback (`feedback_api_zod_schema_sync`).

### ★ 기존 `residencePeriodMonths` 와의 상호작용 (실코드 분석 결과)

`lib/calc/transfer-tax-api.ts:413~416` 가 이미 자산-수준 거주월수를 API 로 전달 중:

```ts
residencePeriodMonths:
  primary.residenceInputMode === "interval" && primary.residencePeriods.length > 0
    ? sumResidenceMonths(primary.residencePeriods, form.transferDate)
    : parseInt(primary.residencePeriodMonthsAsset || form.residencePeriodMonths) || 0,
```

→ **본 PR 결정 사항**:

1. 사례 45 redevelopment 케이스에서는 **기존 `residencePeriodMonthsAsset` 입력 UI 를 redev 블록 내에서 hide** (redev 블록의 prior/new 두 필드가 source of truth).
2. API 변환 시 `redevPrior + redevNew` 합을 `residencePeriodMonths` 로 도출하여 legacy 호환 유지 (transfer-tax.ts 의 다른 분기는 이 단일값을 사용).
3. 동시에 `redevelopment.priorHouseResidenceMonths` / `newHouseResidenceMonths` 두 필드를 redevelopment 페이로드에 별도 전달.
4. `interval` 거주 입력 모드(`residencePeriods` 배열)는 redev 분기에서 **비활성** (redev 블록 자체가 분리 입력 UI 를 제공하므로 중복 회피). 분기 진입 시 UI 에서 interval 토글 숨김.

---

## 시나리오 가이드 카드 미리보기 (분기별)

| 분기 | 양도가액 | prior | new | 카드 표시 |
|---|---|---|---|---|
| C-2 | ≤12억 | - | - | "12억 이하 → 전액 비과세" (emerald) |
| C-3 | >12억 | ≥24 | ≥24 | "분할 LTHD 모두 표2 적용 (거주월수 귀속 다름)" (sky) |
| C-4 | >12억 | ≥24 | <24 | "사전법령해석재산 2020-386 — 청산금분 표1" (violet) |
| C-5 | >12억 | <24 | <24 | "거주 2년 미충족 → 두 분기 모두 표1" (amber) |

`useMemo` 로 분기 판정 후 단일 tone 카드 렌더링 — useEffect→store 미러링 금지.

---

## 마이그레이션 (zustand store)

`lib/stores/calc-wizard-migration.ts` — `RedevelopmentFormSlice` 가 `redev*` prefix 컨벤션이므로 필드명 정합:

```ts
// version N → N+1
function migrate_redev_residence_split(state) {
  if (!state.assetForms) return state;
  state.assetForms = state.assetForms.map(form => {
    if (form.assetKind !== "redevelopment_apt") return form;
    if (form.redevPriorHouseResidenceMonths !== undefined) return form; // 이미 신규 스키마
    // legacy: residencePeriodMonthsAsset(자산수준) 또는 residencePeriodMonths(폼수준) → redevPrior 로 매핑, redevNew=0
    const legacyMonths = form.residencePeriodMonthsAsset || "";
    return {
      ...form,
      redevPriorHouseResidenceMonths: legacyMonths,
      redevNewHouseResidenceMonths: "0",
    };
  });
  return state;
}
```

**주의**: `residencePeriodMonthsAsset` 필드 자체는 deprecate 하지 않는다 (다른 propertyType 케이스에서 계속 사용). redev_apt 분기에서만 UI 노출을 hide 하고 신규 두 필드로 source of truth 이전.

---

## 접근성·UX 디테일

- 두 DecimalInput 의 `onFocus={(e)=>e.target.select()}` 는 SelectOnFocusProvider 자동 적용 (memory `feedback_select_on_focus`).
- 1세대1주택 토글 OFF → ON 시 두 필드 노출 + 첫 필드 자동 포커스.
- 사례 45 가이드 카드는 `useMemo` 분기로 즉시 갱신 (DOM 깜빡임 방지).

---

## QA 시나리오 (Playwright)

`tests/playwright/case-45-redev-12억-residence-split.mjs` (신규):

1. propertyType=redevelopment_apt 선택
2. 사례 45 입력값 모두 입력 (양도 15억, 종전 450M, 청산 300M, prior=66, new=0, 1세대1주택 ON)
3. 결과화면에서 `data-test="redev-high-value-box"` 확인
4. `data-test="redev-lthd-split"` 표에서 기존건물분 60%·청산금분 18% 텍스트 확인
5. 산출세액 11,311,376 / 지방세 1,131,137 / 합계 12,442,514 DOM 텍스트 확인
6. Network 탭 — POST `/api/calc/transfer` body 에 `redevelopment.priorHouseResidenceMonths: 66`, `redevelopment.newHouseResidenceMonths: 0` 포함 확인

---

## 800줄 정책

- `RedevelopmentBlock.tsx` 505 → +60줄 예상 = 565줄. 안전.
- `RedevelopmentDetailCard.tsx` 126 → +80줄 예상 = 206줄. 안전.
- `DetailedStatementRedevelopmentBuilders.ts` 307 → +50줄 예상 = 357줄. 안전.

분할 신호 없음.

---

## Definition of Done (UI 측)

- [ ] RedevelopmentBlock 두 필드 노출/숨김 동작
- [ ] 가이드 카드 4분기 (C-2~C-5) 미리보기 useMemo
- [ ] 결과 카드 12억 안분 박스 + 분할 LTHD 표 산식 한국어
- [ ] 상세명세서 7행 추가 (12억/과세대상/분할 LTHD)
- [ ] 14지점 ⑫⑬⑭ grep 자가 점검 (두 필드 5단 파이프라인)
- [ ] zustand 마이그레이션 (legacy residencePeriodMonths → prior)
- [ ] Playwright 시나리오 6 step 통과
- [ ] 브라우저 수동: prior/new 조합으로 4분기 카드·결과 모두 정상 표시
