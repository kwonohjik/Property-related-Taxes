# 양도일 직전 1개월 종가 — 일자별 입력 모드 + Validation 강화 계획서

> 사용자 요구 — (1) `transferDatePriceAvg1Month` 미입력 시 오류 메시지 + 계산 차단, (2) 직접 입력 모드와 일자별 입력 모드 토글 제공 (상장일 이후 1개월 종가표와 동일한 UX).
>
> 작성일 2026-05-18 · 대상 `components/calc/stock-transfer/PostListingValuationCard.tsx` + sibling 컴포넌트 + store + validation

## 1. 요구사항

### 1.1 요구사항 #1 — Validation 강화

- `transferDatePriceAvg1Month` 미입력(0/빈문자) 시 **즉시 오류 메시지 표시 + "다음" 버튼 클릭 차단**.
- 현재 `lib/calc/stock-transfer-tax-validate.ts:395`에 검증 있으나 message가 §99①3만 인용 → §163⑨ 환산 분모 미적용 영향까지 명시.
- `isEmpty()` 외에 parseInt("") = NaN, parseInt("0") = 0 모두 차단 (방어 강화).

### 1.2 요구사항 #2 — 일자별 입력 모드 추가

- 이미지 26 (상장일 이후 1개월 종가표) 패턴을 **양도일 직전 1개월에도 동일 적용**.
- 사용자가 두 방식 중 선택:
  - **방식 A (direct)** — 1주당 1개월 평균 단일 숫자 직접 입력 (현행 8,659 입력).
  - **방식 B (daily)** — 양도일 직전 1개월(약 28~31일) 일자별 종가 입력 + 자동 평균 산정.
- 두 방식 모두 결과는 `transferDatePriceAvg1Month`에 mirror되어 §163⑨ 환산 분모로 사용.

## 2. 법령 근거 (Pre-Do KoreanLaw 검증)

| 조문 | 가설 (Pre-Do 검증 후 확정) |
|---|---|
| 모법 §99①3 | 상장주식 기준시가 = 평가기준일(양도일) **이전 1개월** 종가평균 |
| 시행령 §165⑤ | 위 1개월 평균의 산정 방법 |

★ **양도일 직전 1개월 일자 범위** — 다음 두 해석 가능, Pre-Do로 확정:
- (a) `[transferDate - 1 month, transferDate - 1 day]` — "직전" = 양도일 미포함
- (b) `[transferDate - 1 month + 1 day, transferDate]` — 양도일 포함
- (c) 상장일 이후 1개월과 대칭 — `[transferDate - 1 month, transferDate - 1 day]` (양도일 미포함)

> 기존 `autoFillDates(listingDate)`는 `[listingDate, listingDate + 1 month - 1 day]`. 양도일 직전은 거꾸로 `[transferDate - 1 month, transferDate - 1 day]`가 자연스러움.

## 3. 인터뷰 (권장안 + 대안)

사용자가 명확한 입력 방식 패턴을 제시(이미지 26 동일) → 추가 인터뷰 없이 권장안 확정. 변경 시 즉시 plan 갱신.

| # | 결정 | 권장안 | 대안 |
|---|---|---|---|
| Q1 | 모드 enum | **`transferPriceInputMode: "direct" \| "daily"`** (default `"direct"` — 기존 동작 보존) | "manual"/"closingPriceTable" 등 |
| Q2 | daily 일자 범위 | **`[transferDate - 1 month, transferDate - 1 day]`** — 양도일 미포함, 직전 1개월 (소령 §165⑤ 준용) | 양도일 포함 |
| Q3 | 컴포넌트 재사용 | **`ClosingPriceTable` 일반화** — 기존 `PostListingClosingPriceTable`을 props로 일반화: `dates`/`closes`/`startDate`/`sectionLabel`/`onChange` | 신규 별도 컴포넌트 |
| Q4 | direct ↔ daily 동기화 | **daily 모드 시 평균값을 자동으로 `transferDatePriceAvg1Month`에 mirror** (onChange 패턴, useEffect 금지). direct 모드 시 사용자 직접 입력값 사용 | 두 필드 분리 |
| Q5 | 모드 전환 시 데이터 처리 | **direct → daily 전환 시 transferDatePriceAvg1Month 유지 + 표 비우기**. **daily → direct 전환 시 평균값 transferDatePriceAvg1Month에 mirror 후 표 유지 (재전환 시 데이터 보존)** | 전환 시 전부 reset |

## 4. 설계

### 4.1 데이터 모델

#### 4.1.1 Engine Input — 변경 없음

엔진은 `transferDatePriceAvg1Month` 단일 필드만 사용. daily 모드는 UI 책임으로 평균 산정 후 mirror.

#### 4.1.2 FormData store (신규 3 필드)

```ts
// lib/stores/calc-wizard-stock-store.ts
transferPriceInputMode: "direct" | "daily";   // 3중 패턴 default: "direct"
transferPriceDates: string[];                  // YYYY-MM-DD 가변(28~31일), daily 모드 자동 채움
transferPriceClosing: string[];                // 원 배열, 휴일·주말은 ""
```

### 4.2 컴포넌트 일반화

#### 4.2.1 신규 sibling `ClosingPriceTable.tsx` (재사용 가능 일반 컴포넌트)

기존 `PostListingClosingPriceTable`을 props 일반화하여 신규 sibling으로 추출:

```tsx
interface ClosingPriceTableProps {
  /** 표시할 일자 배열 (YYYY-MM-DD 가변 28~31일) */
  dates: string[];
  /** 종가 배열 */
  closes: string[];
  /** 변경 핸들러 */
  onChange: (next: { dates: string[]; closes: string[] }) => void;
  /** 섹션 라벨 (예: "상장일 이후 1개월 종가" / "양도일 직전 1개월 종가") */
  sectionLabel: string;
  /** 색조 (emerald / amber 등) */
  tone?: "emerald" | "amber";
  /** 미리보기 표시 여부 (자동 산정 평균값 노출) */
  showPreview?: boolean;
  /** 자동 평균 산정값 (외부에서 mirror) */
  onAverageChange?: (average: number) => void;
}
```

→ `PostListingClosingPriceTable`은 이 일반 컴포넌트의 래퍼 (`listingDate` 기반 dates 산정 + section label 고정).
→ 신규 `PreTransferClosingPriceTable`도 동일 래퍼 (`transferDate` 기반 dates 산정).

#### 4.2.2 신규 `PreTransferClosingPriceTable.tsx`

```tsx
export function PreTransferClosingPriceTable({ form, onChange }: Props) {
  // transferDate 기반 일자 자동 채움: [transferDate - 1 month, transferDate - 1 day]
  const displayDates = useMemo(() => preTransferAutoFillDates(form.transferDate), [form.transferDate]);

  // daily 평균 자동 산정 + transferDatePriceAvg1Month mirror (onChange 패턴)
  const handleCloseChange = (idx: number, value: string) => {
    const nextCloses = [...form.transferPriceClosing];
    while (nextCloses.length < displayDates.length) nextCloses.push("");
    nextCloses.length = displayDates.length;
    nextCloses[idx] = value;

    // 평균 산정
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      return parseAmount(nextCloses[i] || "0");
    });
    const { avg } = calcMonthlyClosingAverage(displayDates, closes);

    onChange({
      transferPriceClosing: nextCloses,
      transferPriceDates: displayDates,
      transferDatePriceAvg1Month: avg > 0 ? String(avg) : "", // mirror
    });
  };

  return <ClosingPriceTable ... onChange={...} />;
}
```

#### 4.2.3 `PostListingValuationCard` 통합

```tsx
{/* §163⑨ 분모 입력 — 모드 선택 */}
<FieldCard label="양도일 직전 1개월 종가 평균 (§163⑨ 분모)">
  <RadioCardGroup
    name="transferPriceInputMode"
    value={form.transferPriceInputMode}
    onChange={(v) => onChange({ transferPriceInputMode: v as "direct" | "daily" })}
    layout="inline"
    options={[
      { value: "direct", label: "직접 입력 (1개월 평균 단일 숫자)" },
      { value: "daily", label: "일자별 입력 (자동 평균)" },
    ]}
  />
</FieldCard>

{form.transferPriceInputMode === "direct" && (
  <FieldCard label="..." required hint="...">
    <CurrencyInput value={form.transferDatePriceAvg1Month} ... />
  </FieldCard>
)}

{form.transferPriceInputMode === "daily" && (
  <PreTransferClosingPriceTable form={form} onChange={onChange} />
)}
```

### 4.3 Validation 강화 (요구사항 #1)

```ts
// lib/calc/stock-transfer-tax-validate.ts:395
if (isListed) {
  const transferAvg = parseInt((form.transferDatePriceAvg1Month || "").replace(/,/g, ""), 10);
  if (isNaN(transferAvg) || transferAvg <= 0) {
    errors.push({
      field: "transferDatePriceAvg1Month",
      message: "양도일 직전 1개월 종가 평균을 입력하세요 (소령 §99①3·§163⑨ 환산 분모). " +
               "직접 입력 모드는 숫자 입력, 일자별 입력 모드는 일자별 종가를 1셀 이상 입력하세요.",
      severity: "error",
    });
  }
  // daily 모드 추가 검증 — 거래일 1개 이상 입력
  if (form.transferPriceInputMode === "daily") {
    const hasAnyClose = form.transferPriceClosing?.some((s) => !isEmpty(s));
    if (!hasAnyClose) {
      errors.push({
        field: "transferPriceClosing",
        message: "일자별 입력 모드: 양도일 직전 1개월 종가를 1셀 이상 입력하세요.",
        severity: "error",
      });
    }
  }
}
```

### 4.4 API/Route 14지점 (⑫⑬⑭)

- ⑫ Zod schema — `transferPriceInputMode`·`transferPriceDates`·`transferPriceClosing` optional 추가.
- ⑬ callAPI — 3 필드 매핑 (daily 모드여도 엔진에는 `transferDatePriceAvg1Month`만 전달 — UI에서 mirror 완료).
- ⑭ Route — daily 모드 데이터는 엔진 input과 무관하나 PDF·이력에 저장 위해 schema 통과.

## 5. 케이스 매트릭스

| ID | mode | 입력 | 기대 동작 |
|---|---|---|---|
| **TI-1** | direct | 8,659 직접 입력 | transferDatePriceAvg1Month = 8,659. 정상 |
| **TI-2** | direct | 빈 입력 | validate 차단 — "양도일 직전 1개월 종가 평균 입력하세요" |
| **TI-3** | daily | 일자별 종가 입력 (21 거래일, 합계 168,040) | 자동 산정 평균 8,001 → transferDatePriceAvg1Month mirror |
| **TI-4** | daily | 빈 표 | validate 차단 |
| **TI-5** | direct → daily 전환 | 8,659 입력 후 daily 전환 | transferDatePriceAvg1Month 유지 + 표 비어있음 → 사용자 일자별 입력 시 mirror |
| **TI-6** | daily → direct 전환 | daily 평균 8,001 후 direct 전환 | 8,001 transferDatePriceAvg1Month 유지 + 표 데이터 store에 남음 (재전환 시 복원) |
| **TI-7** | daily 자동 채움 | transferDate 2024-06-01 입력 | dates = [2024-05-01, ..., 2024-05-31] (31일, 양도일 미포함) |
| **TI-8** | daily 주말 자동 제외 | 5월 주말 셀 = "토요일 · 거래일 제외" | 평균 산정에서 자동 제외 |

## 6. 작업 단계

1. **Pre-Do**: KoreanLaw §99①3·§165⑤ 일자 범위 확인.
2. **컴포넌트 일반화**: `ClosingPriceTable` 추출 (`PostListingClosingPriceTable`을 일반화). 기존 호출 호환 유지.
3. **신규 sibling**: `PreTransferClosingPriceTable` + `preTransferAutoFillDates` 헬퍼.
4. **Store**: 신규 3 필드 추가 + initial + normalize fallback + sessionStorage 마이그레이션.
5. **Step2/PostListingValuationCard**: 모드 라디오 토글 + 두 분기 렌더링.
6. **Validation**: 강화 (TI-2/TI-4 차단).
7. **API/Zod/Route ⑫⑬⑭**.
8. **anchor**: TI-1~8 신규 8건.
9. **회귀**: 기존 3500 PASS 유지.
10. **브라우저 수동 확인**: 두 모드 모두 동일 결과 30,098,625 도출.

## 7. 리스크

- **R-1 useEffect → store 미러링 금지 정책 위반 위험**: daily 모드에서 평균값 mirror는 onChange 패턴으로만 (입력 시점에 즉시 산정 + onChange 단일 호출).
- **R-2 모드 전환 시 데이터 손실**: direct → daily 전환 시 transferDatePriceAvg1Month 유지 + daily 표 빈 상태. daily → direct 전환 시 표 데이터 store에 유지 → 재전환 시 복원.
- **R-3 명명 혼동**: `transferPriceClosing[]`(양도일 1개월) vs `listingPriceClosing[]`(상장일 1개월) 두 종가표 공존. UI에서 emerald(상장일)·amber(양도일) 등 색조 분리.
- **R-4 일자 자동 채움 — 양도일 변경 시**: transferDate 변경 시 표의 일자 자동 재계산 + 옛 closing 잔재 zero-out (PostListingClosingPriceTable 패턴 차용).
- **R-5 컴포넌트 일반화로 인한 회귀**: `PostListingClosingPriceTable`을 일반화하면서 기존 호출 호환성 유지 필수.

## 8. Definition of Done

- [ ] Pre-Do: §99①3·§165⑤ 일자 범위 KoreanLaw 검증
- [ ] `ClosingPriceTable` 일반화 + 기존 PostListing 회귀 0
- [ ] `PreTransferClosingPriceTable` 신규 + `preTransferAutoFillDates` 헬퍼
- [ ] FormData 신규 3 필드 + initial + normalize + 마이그레이션
- [ ] PostListingValuationCard 모드 라디오 토글
- [ ] Validation 강화 — direct + daily 양 분기 차단
- [ ] API/Zod/Route ⑫⑬⑭
- [ ] anchor TI-1~8 신규
- [ ] 전체 회귀 통과
- [ ] 브라우저 수동 확인 — 두 모드 모두 30,098,625 정확 표시
- [ ] memory 갱신 — `project_pre_transfer_daily_input.md`

## 9. 후속 PR 후보

- 상장일 종가표·양도일 종가표 cross-cutting anchor (두 입력이 동시 발생할 때 일관성)
- 자동 평균 산정에 §99①4(거래일 5일 미만 등 예외) 분기 추가
- 일자별 입력 모드 PDF 출력에서 종가표 노출
- `acquisitionDatePriceAvg1Month`(일반 상장 환산 §163⑨ 직접 분기)도 daily 모드 확장
- `listingDatePriceAvg1Month` flat-adapter 합성과 `transferDatePriceAvg1Month` UI mirror **패턴 비대칭 해결** (둘 다 adapter 합성으로 통일)

---

## 10. 검토 이력 (Review Iterations)

본 plan은 4차례 검토 + Engine/UI design cross-reference로 **36건** 보정. 상세 발견 사항은 sibling 파일 참조:

→ **[`stock-transfer-pre-transfer-1month-daily-input.review.md`](./stock-transfer-pre-transfer-1month-daily-input.review.md)**

| 차수 | 범위 | 발견 |
|---|---|---|
| 1차 | E-1~E-12 | 이미지 26 코드 비교 검토 |
| 2차 | E-13~E-20 | 정합성·UX |
| 3차 | E-21~E-28 | Zod·echo·anchor·정책 |
| Design 점검 | E-29~E-31 | Engine/UI design 자기일관성 |
| 4차 cross-ref | X-1~X-5 | Plan ↔ Engine ↔ UI 3문서 정합성 |

**Pre-Do 의무 (최종)**:
1. KoreanLaw MCP §99 → §165 → 시행규칙 §81 위임 체인 + 일자 endpoints 확정
2. TI-13/TI-14 anchor 우선 작성·실행
3. 사이드바 selector grep + store normalize grep
4. 사용자 결정 확인 — enum/컴포넌트 rename 권장안 채택 여부

**anchor**: TI-1~15 (15건) — 정본은 UI design §7
**리스크**: R-1~R-12 (12건) — 정본은 review.md
**DoD**: 36+α 항목

**3문서 정합성**: 100% (4차 cross-reference 후) — Do 진입 가능
