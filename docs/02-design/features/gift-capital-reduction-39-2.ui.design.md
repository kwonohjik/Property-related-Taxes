# §39의2 감자에 따른 이익의 증여 — UI 설계 문서

> 작성일: 2026-06-25  
> 계획서 버전: v3 (`gift-capital-reduction-39-2.plan.md`)  
> 범위: 기존 `/calc/gift-deemed` 폼에 **다주주 모드** 추가. 단일모드(CD-1/CD-H)·기존 코드 하위호환 보존.  
> 담당 에이전트: `inheritance-gift-tax-ui-senior`

---

## §1. 사용자 시나리오

### 1.1 시나리오 분류

| 시나리오 | 모드 | 진입 흐름 |
|---|---|---|
| (A) 단일 모드 — 저가소각 기존 | `cdMode = "single"` | 기존 CapitalDecreaseFields와 동일. CD-1/CD-H 하위호환 보존. |
| (B) 다주주 모드 — 저가소각 교재 사례1 | `cdMode = "multi"` | 주주 테이블 입력 → 엔진 멀티 계산 → 산정표·검증표 출력 → 과세 수증자 선택 → prefill 이관 |
| (C) 다주주 모드 — 고가소각 교재 사례2 | `cdMode = "multi"` | 동일 흐름. 고가 게이트(평가액 < 액면가) 통과 여부 표시 |

### 1.2 화면 흐름도

```
/calc/gift-deemed
│
└─ [유형 선택] "감자에 따른 이익" 클릭
   └─ DeemedDetailModal 오픈
      │
      ├─ 증여일 입력
      │
      └─ CapitalDecreaseFields
         │
         ├─ RadioCardGroup "단일 모드 / 다주주 모드" (cdMode)
         │
         ├─ [단일 모드 선택시] ─────────────────────────────
         │   └─ 기존 입력 (저가/고가 라디오 + cd* 단일 필드)   ← 하위호환
         │
         └─ [다주주 모드 선택시] ──────────────────────────
             ├─ 감자주식 1주당 평가액 (cdSharePrice, CurrencyInput)
             ├─ 액면가액 (cdFaceValue, CurrencyInput) — 고가 게이트 §29의2①2호 + 대주주 액면 3억 판정(§28②)용
             ├─ 감자 전 발행주식총수 (cdPreTotalShares, CurrencyInput)
             └─ CapitalDecreaseShareholderTable (신규 컴포넌트)
                 ├─ 행 추가/삭제 버튼
                 └─ 주주 행[] { 이름 · 감자전주식 · 감자주식 · 소각대가/주 · 특수관계그룹 }
         
      └─ [확인] 버튼으로 모달 닫음
   
└─ [증여이익 계산] 버튼 → POST /api/calc/gift-deemed
   │
   └─ DeemedGiftResultView
      │
      ├─ [단일 모드] 기존 breakdown 테이블
      │
      └─ [다주주 모드] CapitalDecreaseMultiResultView (신규 컴포넌트)
          ├─ 카드① 수증자×증여자 증여재산가액 매트릭스
          ├─ 카드② 감자 후 1주당 평가액 + 한국어 산식
          ├─ 카드③ 감자 전·후 검증표 (증감)
          └─ 카드④ 과세 수증자 선택 드롭다운 → "이 금액으로 증여세 계산" 버튼
```

---

## §2. 폼 상태 확장 (① 폼 상태 타입 / ② initial / ③ normalize)

### 2.1 DeemedFormState 신규 필드 (`components/calc/deemed-gift/shared.tsx`)

기존 `cd*` 단일 필드 7개(cdCaseType·cdSharePrice·cdRedemptionPrice·cdTotalShares·cdMajorRatioPct·cdRelatedShares·cdOwnRedeemedShares)는 **전부 보존** (하위호환).

신규 추가 필드:

```typescript
// 다주주 모드 전용 신규 필드
cdMode: "single" | "multi";           // 모드 선택 (기본 "single")
cdFaceValue: string;                  // 액면가액 — 다주주 고가 §29의2①2호 게이트용
cdPreTotalShares: string;             // 감자 전 발행주식총수 (다주주)
cdShareholders: CdShareholderRow[];   // 주주 행 배열 (3-state: [] = 다주주 ON·빈 / [...] = 데이터)
cdSelectedDoneeIndex: number;         // 과세 수증자 선택 인덱스 (결과뷰 → prefill 이관용)
```

`CdShareholderRow` 타입 (shared.tsx 안에 정의):

```typescript
export interface CdShareholderRow {
  id: string;                  // 내부 row key (결과 표시 금지 — 이름 우선)
  name: string;                // 갑/을/병/정/소액주주 등 표시 이름
  preShares: string;           // 감자 전 보유 주식수 (CurrencyInput → parseAmount)
  redeemedShares: string;      // 감자(소각) 주식수 (0 = 잔존주주)
  redemptionPrice: string;     // 소각 1주당 대가 (감자주주만; 잔존주주는 "" 허용)
  relationGroup: string;       // 특수관계 그룹 태그 (같은 문자열 = 특수관계)
}
```

### 2.2 INITIAL_DEEMED 기본값

```typescript
// 기존 cd* 필드 유지 후 아래 추가
cdMode: "single",
cdFaceValue: "",
cdPreTotalShares: "",
cdShareholders: [],           // 빈 배열 = 다주주 ON이나 행 미추가 (모드 명시 토글)
cdSelectedDoneeIndex: 0,
```

> `cdMode === "single"` 이면 `cdShareholders` 값은 무시된다(API 변환 분기). 빈 배열 자체가 다주주 진입을 의미하지 않음 — `cdMode`로만 판단. (memory `feedback_three_state_optional_mode_toggle`: length>0 derive 금지)

### 2.3 normalize fallback (sessionStorage 복원)

`CdShareholderRow[]`는 sessionStorage 직렬화 시 배열 그대로 저장·복원됨. 복원 시 각 row의 필드가 문자열 타입인지 확인 후, 아니면 `String(v)` 변환. `cdMode`가 누락된 legacy 세션이면 `"single"` 기본값으로 normalize.

---

## §3. UI 위젯 상세 (⑤)

### 3.1 CapitalDecreaseFields 변경 (`components/calc/deemed-gift/capital-forms.tsx`)

**기존 코드(115-145줄) 전체 보존**하되, 최상단에 `cdMode` RadioCardGroup 추가:

```
[RadioCardGroup] cdMode — "단일 (저가/고가 단건)" / "다주주 (N:N 안분)"
 tone="amber", layout="inline"
 testId="cd-mode-single" / "cd-mode-multi"

[단일 모드] → 기존 isHigh 분기 그대로 표시 (하위호환)

[다주주 모드] → 아래 3개 섹션 표시:
  ┌ 섹션① 기본 정보 (amber)
  │  • 감자주식 1주당 평가액 (cdSharePrice, CurrencyInput)
  │    hint: "할증평가 미적용 — §53⑧3호. 상증법 §60 기준 평가액 입력"
  │  • 액면가액 (cdFaceValue, CurrencyInput)
  │    hint: "§29의2①2호 고가게이트(평가액 < 액면가 한정) + §28② 대주주 액면 3억 판정용 (지분 1%로 대주주 충족 시 생략 가능)"
  │  • 감자 전 발행주식총수 (cdPreTotalShares, CurrencyInput)
  └
  ┌ 섹션② 주주 명단 (CapitalDecreaseShareholderTable)
  │  (신규 컴포넌트 — 800줄 분리)
  └
```

> 단일 모드에서도 `cdSharePrice` 필드는 기존 방식 그대로 렌더 — 기존 cd 접두사 필드는 단일모드 전용으로 고정. 다주주 모드는 별도 `cdPreTotalShares`·`cdShareholders`·`cdFaceValue`를 사용하므로 필드 충돌 없음.

### 3.2 CapitalDecreaseShareholderTable.tsx (신규 — 분리 컴포넌트)

경로: `components/calc/deemed-gift/CapitalDecreaseShareholderTable.tsx`

역할: 다주주 입력 테이블 + 행 추가/삭제.

```tsx
Props:
  shareholders: CdShareholderRow[]
  onChange: (rows: CdShareholderRow[]) => void
```

테이블 헤더:

| 이름 | 감자전 주식수 | 감자 주식수 | 소각대가(1주당) | 특수관계 그룹 | |
|---|---|---|---|---|---|

행 입력:
- 이름: 일반 텍스트 input (`onFocus` 전체선택, SelectOnFocusProvider 자동 적용)
- 감자전 주식수: `CurrencyInput` (parseAmount 정수)
- 감자 주식수: `CurrencyInput` (0 허용 — 잔존주주 표현)
- 소각대가(1주당): `CurrencyInput` (감자주식 0이면 disabled 표시·입력 불필요)
- 특수관계 그룹: 텍스트 input (같은 문자열 = 특수관계. 예: "가족A")

행 추가 버튼: `+ 주주 추가` (amber 색조)  
행 삭제 버튼: 각 행 우측 × 아이콘

testId 동결:
- 테이블: `data-testid="cd-shareholder-table"`
- 각 행: `data-testid="cd-shareholder-row-{index}"`
- 이름 input: `data-testid="cd-sh-name-{index}"`
- 감자전주식: `data-testid="cd-sh-pre-{index}"`
- 감자주식: `data-testid="cd-sh-redeemed-{index}"`
- 소각대가: `data-testid="cd-sh-price-{index}"`
- 특수관계그룹: `data-testid="cd-sh-group-{index}"`
- 행추가: `data-testid="cd-sh-add"`

안내 문구 (amber 박스):
> 감자 주식수 = 0 이면 잔존주주로 처리됩니다. 특수관계 그룹 태그가 같은 주주끼리 특수관계인으로 판정합니다. (예: 부父·모母·자子 모두 그룹 태그 "가족A" 입력)

> ⚠️ 자동 안분 fallback 금지(memory `feedback_no_silent_apportion_fallback`): 특수관계 그룹 미입력 시 **비특수관계로 침묵 처리하지 않는다** — 각 행 필수 입력. 미입력은 validation 오류 차단.

### 3.3 색조 · 컴포넌트 규칙

- 전체 래퍼: `border-amber-200 bg-amber-50/40`
- 섹션 번호 배지: `bg-amber-200 text-amber-800`
- 행 추가 버튼: `border-amber-300 bg-amber-50 text-amber-800`
- 금액 필드: `CurrencyInput` (정수)
- 주식수 필드: `CurrencyInput` (parseAmount — 주식수는 정수)
- 지분율(%)는 **직접 입력받지 않는다** — 엔진이 주식수에서 정확분수로 계산
- `RadioCardGroup` tone="amber" — OFF 상태도 amber 배경 유지 (memory `feedback_toggle_card_visibility`)
- `native checkbox/radio` 신규 사용 금지

---

## §4. 결과뷰 (⑦)

### 4.1 DeemedGiftResultView 분기

`result.capitalDecreaseMulti` 존재 여부로 분기:

```tsx
if (result.capitalDecreaseMulti) {
  return <CapitalDecreaseMultiResultView multi={result.capitalDecreaseMulti} form={form} onToGiftTax={onToGiftTax} />;
}
// 기존 breakdown 테이블 렌더 (단일모드·하위호환)
```

### 4.2 CapitalDecreaseMultiResultView.tsx (신규 컴포넌트)

경로: `components/calc/results/CapitalDecreaseMultiResultView.tsx`

**카드① — 수증자별 증여재산가액 매트릭스**

testId: `"cd-multi-matrix"`

```
┌─────────────────────────────────────────────────────────────┐
│ 수증자별 증여재산가액 (§39의2①)              상증법 §39의2 링크  │
├──────────┬──────────┬──────────┬───────────┬───────────────┤
│          │ 증여자: 갑 │ 증여자: 을 │ 합  계    │ 과세 여부      │
├──────────┼──────────┼──────────┼───────────┼───────────────┤
│ 병 (수증자) │ 1,714,285,714 │ 514,285,714 │ 2,228,571,428 │ ✓ 과세      │
├──────────┼──────────┼──────────┼───────────┼───────────────┤
│ 소액주주   │ (371,428,571) │  —  │ (371,428,571) │ — 비과세 참고  │
│          │            │     │              │ 비특수관계      │
└──────────┴──────────┴──────────┴───────────┴───────────────┘
```

표시 규칙:
- 금액 셀: `text-right font-mono tabular-nums whitespace-nowrap` (memory `amount-column-align` 스킬)
- "원" 접미사 없음 (memory `feedback_no_won_suffix`)
- 내부 id(row id) 노출 금지 — 이름(name) 우선 표시 (memory `feedback_no_internal_id_in_result`)
- 비과세 수증자 행: 금액을 괄호(…)로 표시하고 비과세 사유(`nonTaxableReason`) 표시
- `potentialAmount` 표시는 "참고" 라벨로 구분

증여자별 내역 표(fromDonors)는 수증자 행 아래 토글 펼침(ExpandToggleButton)으로 표시.

**카드② — 감자 후 1주당 평가액**

testId: `"cd-multi-post-value"`

```
감자 후 1주당 평가액
산식: (감자 전 발행주식총수 × 감자 전 1주당 평가액 − 총 소각대가 합계) ÷ 감자 후 잔여 주식수
     = (200,000 × 30,000 − 130,000 × 10,000) ÷ (200,000 − 130,000)
     = (6,000,000,000 − 1,300,000,000) ÷ 70,000
     ≈ 67,143 (원 미만 반올림 — 표시값)
```

표시 주의:
- 계산은 정확값(67,142.857…) 사용, **표시만 round(67,143)**
- 산식은 한국어 풀어쓰기, `floor()` 표기 금지 (memory `feedback_result_view_korean_formula`)
- 교재 사례1 차이 fine-print 안내:
  > "교재 표시값(2,228,200,000)과의 차이는 교재가 대주주 감자후 지분비율을 85.7%로 반올림한 데서 비롯됩니다. 본 계산은 시행령 §29의2①1호에 반올림 규정이 없으므로 정확분수(60,000/70,000)를 사용합니다."

**카드③ — 감자 전·후 검증표**

testId: `"cd-multi-verification"`

```
┌──────────┬──────────────────┬────────────────┬──────────────────┬──────────────────┐
│ 주주명    │ 감자전 주식가액   │ 소각대가        │ 감자후 주식가액   │ 증감             │
├──────────┼──────────────────┼────────────────┼──────────────────┼──────────────────┤
│ 갑(父)   │ 3,000,000,000   │ 1,000,000,000  │ 0               │ −2,000,000,000  │
│ 을(母)   │ 900,000,000     │ 300,000,000    │ 0               │ −600,000,000    │
│ 병(子)   │ 1,800,000,000   │ —              │ 4,028,571,428   │ +2,228,571,428  │
│ 소액주주  │ 300,000,000     │ —              │ 671,428,571     │ +371,428,571    │
├──────────┼──────────────────┼────────────────┼──────────────────┼──────────────────┤
│ 합계     │ 6,000,000,000   │ 1,300,000,000  │ 4,700,000,000   │ 0               │
└──────────┴──────────────────┴────────────────┴──────────────────┴──────────────────┘
```

주의:
- 잔존주주는 소각대가 셀 "—"
- 증감 = 감자후 주식가액 + 감자대가 − 감자전 주식가액 (감자주주 −, 잔존주주 +). ⚠️ 감자주주는 감자대가 수령분을 가산해야 정합 (갑: 0 + 10억 − 30억 = −20억; 엔진 §3 `delta = postValue + redemptionPaid − preValue`와 일치)
- 합계 행 증감은 0 (자기일관 확인)
- 감자후 주식가액: 잔존주주 floor(postShares × postPerShareExact), **마지막 잔존주주 잔액 흡수**(정확합 − Σ앞 floor)로 합계 행 증감 정확히 0(D-UI-2 자기일관). 감자주주=0. 표시 정수. 단순 floor만 적용 시 합계 −1 오차
- 각 셀: `text-right font-mono tabular-nums whitespace-nowrap`

**카드④ — 과세 수증자 선택 → 증여세 이관**

testId: `"cd-multi-donee-select"`

과세 수증자가 1명이면 자동 선택(선택 UI 불필요).
과세 수증자가 2명 이상이면 드롭다운 `<select>`:

```
이 증여이익으로 증여세를 계산할 수증자를 선택하세요:
[병(子) — 증여재산가액 2,228,571,428 ▼]

[ 이 금액으로 증여세 계산하기 → ]
```

- `cdSelectedDoneeIndex` 변경 → `form.cdSelectedDoneeIndex` 업데이트 (set() 호출)
- 여러 수증자 안내: "수증자별로 각각 별도 증여세 신고가 필요합니다."
- 비과세 수증자는 드롭다운에서 제외
- applied=false 시(과세 수증자 0명): "과세 요건을 충족하는 수증자가 없습니다." 표시, 이관 버튼 비활성

---

## §5. 14개 동기화 지점 실제 경로 매핑

### 5.1 클라이언트 8개

| # | 지점 | 경로 | 변경 내용 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/deemed-gift/shared.tsx:DeemedFormState` | `cdMode`·`cdFaceValue`·`cdPreTotalShares`·`cdShareholders[]`·`cdSelectedDoneeIndex` 추가. 기존 cd* 7개 보존. |
| ② | initial | `shared.tsx:INITIAL_DEEMED` | `cdMode:"single"`, `cdFaceValue:""`, `cdPreTotalShares:""`, `cdShareholders:[]`, `cdSelectedDoneeIndex:0` 추가 |
| ③ | normalize | `shared.tsx` (sessionStorage 복원) | `cdMode` 누락 시 `"single"` fallback. `cdShareholders` 배열 복원 시 각 row 필드 문자열 타입 검증. |
| ④ | API 변환 | `lib/calc/gift-deemed-api.ts:buildDeemedGiftInput:case"capital_decrease"` | `cdMode === "multi"` 분기 추가 → `shareholders`·`preTotalShares`·`faceValue` 전달 |
| ⑤ | UI 위젯 | `capital-forms.tsx:CapitalDecreaseFields` + 신규 `CapitalDecreaseShareholderTable.tsx` | `cdMode` RadioCardGroup + 다주주 테이블 표시 |
| ⑥ | 사이드바 합계 | — | **해당 없음** — gift-deemed는 사이드바 없음 |
| ⑦ | 결과 카드 | `results/DeemedGiftResultView.tsx` + 신규 `results/CapitalDecreaseMultiResultView.tsx` | `capitalDecreaseMulti` 분기 → 4개 카드 렌더 |
| ⑧ | validation | `lib/calc/gift-deemed-validate.ts:case"capital_decrease"` | `cdMode === "multi"` 분기: 주주≥2·`cdPreTotalShares`·각 행 이름/감자전주식/특수관계그룹 필수. 자동안분 차단 — 특수관계그룹 미입력 오류. |

### 5.2 API/Route 6개

| # | 지점 | 경로 | 변경 내용 |
|---|---|---|---|
| ⑨ | Zod enum 메인 | `lib/validators/gift-deemed-input.ts:capitalDecreaseSchema` | `capitalDecreaseShareholderSchema` 신규 + `shareholders?:z.array(...)` + `preTotalShares?:z.number()` + `faceValue?:z.number()` 추가 |
| ⑩ | Zod enum 컴패니언 | 동상 | discriminatedUnion 기존 브랜치 유지 — `shareholders` optional이므로 단일모드 body도 통과 |
| ⑪ | 자산-수준 fallback | — | **해당 없음** |
| ⑫ | Zod 입력 객체 | `gift-deemed-input.ts:capitalDecreaseSchema` | `capitalDecreaseShareholderSchema` 신규: `{ id, name, preShares, redeemedShares, redemptionPricePerShare?, relationGroup }` |
| ⑬ | body spread | `DeemedGiftCalculator.tsx:buildDeemedGiftInput(form)` | `buildDeemedGiftInput` 내부에서 처리 — Calculator는 변경 없음 |
| ⑭ | Route 매핑 | `app/api/calc/gift-deemed/route.ts` | Zod parse 후 `calcDeemedGift` 자동 전달 — 변경 없음 |

> ⑫⑬⑭ TS 미감지 주의: Do 후 grep 자가점검 필수 (`shareholders`, `preTotalShares`, `faceValue` 5단 파이프라인 전수)

### 5.3 ④ buildDeemedGiftInput 멀티 분기 상세

```typescript
case "capital_decrease":
  if (form.cdMode === "multi") {
    // 멀티모드: shareholders 배열 → 엔진 CapitalDecreaseInput.shareholders
    return {
      type: "capital_decrease",
      sharePrice: parseAmount(form.cdSharePrice),
      redemptionPrice: 0,           // 멀티모드에서는 row별 사용 — 하위호환용 0
      faceValue: parseAmount(form.cdFaceValue) || undefined,
      preTotalShares: parseAmount(form.cdPreTotalShares),
      shareholders: form.cdShareholders.map((row) => ({
        id: row.id,
        name: row.name,
        preShares: parseAmount(row.preShares),
        redeemedShares: parseAmount(row.redeemedShares),
        redemptionPricePerShare: parseAmount(row.redemptionPrice) || undefined,
        relationGroup: row.relationGroup || undefined,
      })),
    };
  }
  // 단일모드: 기존 경로 그대로 (하위호환)
  return form.cdCaseType === "high"
    ? { type: "capital_decrease", caseType: "high", ... }
    : { type: "capital_decrease", caseType: "low", ... };
```

> `redemptionPrice` 필드는 `CapitalDecreaseInput` 기존 필수 필드이므로 멀티 시 0 전달(엔진이 `shareholders` 있으면 멀티 경로 → row 개별값 사용).

### 5.4 ⑧ validateDeemedInput 멀티 분기 상세

```
case "capital_decrease":
  if (form.cdMode === "multi") {
    if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
    if (parseAmount(form.cdPreTotalShares) <= 0) return "감자 전 발행주식총수를 입력하세요";
    if (form.cdShareholders.length < 2) return "주주를 2명 이상 입력하세요";
    for (const [i, row] of form.cdShareholders.entries()) {
      const n = i + 1;
      if (!row.name.trim()) return `${n}번째 주주 이름을 입력하세요`;
      if (parseAmount(row.preShares) <= 0) return `${n}번째 주주의 감자 전 주식수를 입력하세요`;
      // 감자 주식수 > 0인 주주(감자주주)는 소각대가 필수
      if (parseAmount(row.redeemedShares) > 0 && parseAmount(row.redemptionPrice) <= 0)
        return `${n}번째 주주는 감자주주이므로 소각대가를 입력하세요`;
      // 자동 안분 fallback 금지: 특수관계그룹 미입력 차단
      if (!row.relationGroup.trim()) return `${n}번째 주주의 특수관계 그룹을 입력하세요 (비특수관계면 별도 구분값 입력)`;
    }
    // 발행총수 검증: 모든 주주 감자전 주식수 합계 ≤ 발행총수
    const totalPreShares = form.cdShareholders.reduce((s, r) => s + parseAmount(r.preShares), 0);
    if (totalPreShares > parseAmount(form.cdPreTotalShares))
      return "주주별 감자 전 주식수 합계가 발행주식총수를 초과합니다";
  } else {
    // 기존 단일 검증 (하위호환)
    if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
    if (form.cdCaseType === "high") {
      if (parseAmount(form.cdOwnRedeemedShares) <= 0) return "해당 주주등 감자 주식수를 입력하세요";
    } else {
      if (parseAmount(form.cdTotalShares) <= 0) return "총감자 주식수를 입력하세요";
    }
  }
  break;
```

> ⑧ 정책(memory `feedback_validation_sync_8th_point`): UI/API fallback과 validate 동기화. `cdMode === "multi"` 분기에서 `shareholders` 배열 존재 여부가 아닌 **명시적 `cdMode` 값**으로 판단.

### 5.5 buildGiftWizardPrefill 멀티 수증자 처리 (D3)

```typescript
// capital_decrease 멀티모드 — 선택된 수증자의 total 이관
if (result.type === "capital_decrease" && result.capitalDecreaseMulti) {
  const multi = result.capitalDecreaseMulti;
  const taxableDonees = multi.donees.filter((d) => d.isTaxable);
  const selected = taxableDonees[form.cdSelectedDoneeIndex] ?? taxableDonees[0];
  if (!selected) {
    // 과세 수증자 없음 — prefill 없음(호출자가 applied=false로 이미 버튼 비활성)
    return { giftDate: form.giftDate, giftItems: [] };
  }
  return {
    giftDate: form.giftDate,
    giftItems: [{
      id: `deemed-capital_decrease-${selected.name}`,
      category: "other" as const,
      name: `감자에 따른 이익 증여이익 (${selected.name})`,
      marketValue: selected.total,
    }],
  };
}
// 단일모드 기존 경로 (하위호환)
```

> 여러 과세 수증자(병·정)는 각각 별도 이관 — 수증자별 별도 증여세 신고. 카드④ UI에서 선택 후 순차 이관 안내.

---

## §6. 컴포넌트 분리 · 접근성 · E2E testId

### 6.1 파일 목록 (신규/변경)

| 파일 | 신규/변경 | 역할 |
|---|---|---|
| `components/calc/deemed-gift/shared.tsx` | **변경** | `DeemedFormState` 5필드 추가 + `CdShareholderRow` 타입 + `INITIAL_DEEMED` 추가 |
| `components/calc/deemed-gift/capital-forms.tsx` | **변경** | `CapitalDecreaseFields` 상단에 `cdMode` RadioCardGroup + 다주주 섹션 분기 |
| `components/calc/deemed-gift/CapitalDecreaseShareholderTable.tsx` | **신규** | 주주 행 추가/삭제 테이블 (800줄 분리) |
| `components/calc/results/DeemedGiftResultView.tsx` | **변경** | `capitalDecreaseMulti` 분기 → `CapitalDecreaseMultiResultView` 렌더 |
| `components/calc/results/CapitalDecreaseMultiResultView.tsx` | **신규** | 카드①~④ 멀티 결과 렌더 |
| `lib/calc/gift-deemed-api.ts` | **변경** | `buildDeemedGiftInput` 멀티 분기 + `buildGiftWizardPrefill` 멀티 수증자 |
| `lib/calc/gift-deemed-validate.ts` | **변경** | `case "capital_decrease"` 멀티 분기 |
| `lib/validators/gift-deemed-input.ts` | **변경** | `capitalDecreaseShareholderSchema` 신규 + `capitalDecreaseSchema` 필드 추가 |

### 6.2 800줄 정책 점검

- `capital-forms.tsx`: 현재 378줄. 다주주 모드 추가 시 ~80줄 증가 예상 → 458줄 허용 범위 내. `CapitalDecreaseShareholderTable`은 별도 파일로 분리.
- `DeemedGiftResultView.tsx`: 현재 180줄. 멀티 분기 추가(~10줄) → `CapitalDecreaseMultiResultView`는 별도 파일 분리. 결과뷰는 허용 범위 내 유지.
- `gift-deemed-api.ts`: 현재 320줄. 멀티 분기 추가(~50줄) → 370줄 허용.
- `gift-deemed-validate.ts`: 현재 141줄. 멀티 분기 추가(~30줄) → 171줄 허용.

### 6.3 E2E testId 동결

Do 단계 착수 전 testId를 동결하여 E2E spec이 컴포넌트 구현과 충돌하지 않도록 한다.

```
# 입력 모달
deemed-detail-dialog          (기존 — 변경 없음)
cd-mode-single                (신규)
cd-mode-multi                 (신규)
cd-shareholder-table          (신규)
cd-shareholder-row-{n}        (신규, n=0,1,2...)
cd-sh-name-{n}                (신규)
cd-sh-pre-{n}                 (신규)
cd-sh-redeemed-{n}            (신규)
cd-sh-price-{n}               (신규)
cd-sh-group-{n}               (신규)
cd-sh-add                     (신규)
cd-sh-delete-{n}              (신규)

# 결과뷰
deemed-result                 (기존 — 변경 없음)
deemed-result-value           (기존 — 변경 없음)
cd-multi-matrix               (신규)
cd-multi-post-value           (신규)
cd-multi-verification         (신규)
cd-multi-donee-select         (신규)
deemed-to-wizard              (기존 — 변경 없음)
```

### 6.4 print 정합

`CapitalDecreaseMultiResultView`의 모든 카드는 `print:block` 클래스 확보. ExpandToggleButton의 닫힘 상태는 `print:block`으로 강제 펼침.

---

## §7. 미해결 사항 (Do 착수 전 결정 또는 Do 중 결정)

| ID | 항목 | 옵션 | 제안 |
|---|---|---|---|
| **D-UI-1** | 수증자 선택 UX — 과세 수증자 2명 이상 시 | (a) 드롭다운 select / (b) 각 수증자별 별도 "이 금액으로 계산" 버튼 | (a) 드롭다운 — 단순하고 기존 prefill 인터페이스 최소 변경. 다음번 수증자 계산은 드롭다운 재선택. |
| **D-UI-2** ✅확정 | 검증표 표시 자리수 | floor + 마지막 잔존 잔액 흡수 | 잔존주주=floor(postShares×exact), 마지막 잔존주주가 (정확합 − Σ앞 floor) 흡수 → 합계 행 증감 정확히 0. 단순 floor만 적용 시 합계 −1(자기일관 깨짐) → 잔액 흡수 필수 |
| **D-UI-3** | 다주주↔단일 토글 전환 시 상태 reset | (a) 전환 시 해당 모드 필드 clear / (b) 전환 후 기존 입력 유지 | (b) 유지 권장 — 실수 전환 방지. 단 단일→다주주 시 `cdShareholders`가 빈 배열이면 자연스럽게 빈 테이블 표시됨. |
| **D-UI-4** | 감자주주 수의 소각대가 동일 여부 | 현재 행별 별도 입력 | 교재 사례1(갑·을 모두 10,000)은 우연히 같음. 행별 입력이 범용적. 유지. |
| **D-UI-5** | 소각대가 미입력(잔존주주)의 disabled vs placeholder | `parseAmount("") = 0`이므로 잔존주주는 disabled="true" + placeholder="잔존주주" | Do 시 disabled prop 구현. `cdShareholders[i].redeemedShares === "0"` 또는 빈 문자열이면 disabled. |

---

## §8. 자가 점검 체크리스트 (Do 완료 후 보고 전)

- [ ] `DeemedFormState`에 신규 5필드 추가 + `CdShareholderRow` 타입 정의
- [ ] `INITIAL_DEEMED` 신규 5필드 기본값
- [ ] normalize: `cdMode` 누락 시 `"single"`, `cdShareholders` 배열 타입 복원
- [ ] `buildDeemedGiftInput`: `cdMode === "multi"` 분기 → shareholders 변환
- [ ] `CapitalDecreaseFields`: `cdMode` RadioCardGroup + 다주주 섹션
- [ ] `CapitalDecreaseShareholderTable.tsx` 신규 (testId 동결 준수)
- [ ] `DeemedGiftResultView`: `capitalDecreaseMulti` 분기
- [ ] `CapitalDecreaseMultiResultView.tsx` 신규 (카드①~④, 금액 우측정렬, "원" 없음, id 노출 없음)
- [ ] `validateDeemedInput`: `cdMode === "multi"` 분기 (주주≥2·필수필드·특수관계그룹 비자동)
- [ ] `capitalDecreaseSchema`: `capitalDecreaseShareholderSchema` 추가
- [ ] `buildGiftWizardPrefill`: 멀티 수증자 선택 분기
- [ ] ⑫⑬⑭ grep 자가점검: `shareholders`·`preTotalShares`·`faceValue` 5단 파이프라인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 회귀 통과 (R-CD-1·R-CD-H 보존)
- [ ] 브라우저 수동 확인 또는 미수행 명시
