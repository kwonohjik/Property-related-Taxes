# Plan: 법조문 링크 구현

## Context

**문제**: 계산 결과 뷰에서 `step.legalBasis`(예: "소득세법 §94 ①")가 클릭 불가능한 `<span>`으로 렌더링됨.
사용자가 법조문 버튼을 클릭해도 국가법령정보센터로 이동하지 않음.

**영향 파일**: 3개 ResultView 파일에서 legalBasis 렌더링 존재
- `components/calc/results/TransferTaxResultView.tsx` (line 177-181)
- `components/calc/results/AcquisitionTaxResultView.tsx` (line 201-205, 220-224)
- `components/calc/results/PropertyTaxResultView.tsx` (line 225-227)

## 해결 방법

### 1. 공유 유틸 함수 생성: `lib/utils/law-url.ts`

법령 약칭 → 국가법령정보센터 URL 매핑:

```ts
const LAW_NAME_MAP: Record<string, string> = {
  "소득세법":      "소득세법",
  "조특법":        "조세특례제한법",
  "상증법":        "상속세및증여세법",
  "지방세법":      "지방세법",
  "종합부동산세법": "종합부동산세법",
  "지방세특례제한법": "지방세특례제한법",
  "소득세법시행령": "소득세법 시행령",
};

export function buildLawUrl(legalBasis: string): string {
  const match = legalBasis.match(/^([가-힣]+(?:법|령|규칙)?)/);
  if (!match) return "";
  const fullName = LAW_NAME_MAP[match[1]] ?? match[1];
  return `https://www.law.go.kr/법령/${encodeURIComponent(fullName)}`;
}
```

### 2. 각 ResultView에서 span → a 링크 변환

#### TransferTaxResultView.tsx (line 177-181)
```tsx
// Before
<span className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">
  {step.legalBasis}
</span>

// After
<a
  href={buildLawUrl(step.legalBasis)}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5 hover:text-primary hover:border-primary/50 transition-colors"
>
  {step.legalBasis} ↗
</a>
```

#### AcquisitionTaxResultView.tsx (두 곳)
- step.legalBasis span (line 201-205): 동일하게 `<a>` 변환
- result.legalBasis 목록 (line 220-224): 각 항목을 링크로 변환

#### PropertyTaxResultView.tsx (line 225-227)
```tsx
// Before
<li key={i}>{b}</li>

// After
<li key={i}>
  <a href={buildLawUrl(b)} target="_blank" rel="noopener noreferrer"
     className="hover:text-primary hover:underline transition-colors">
    {b} ↗
  </a>
</li>
```

## 수정 파일 목록

1. **`lib/utils/law-url.ts`** — 신규 생성 (buildLawUrl 유틸)
2. **`components/calc/results/TransferTaxResultView.tsx`** — span → a 변환
3. **`components/calc/results/AcquisitionTaxResultView.tsx`** — span → a, 목록 → a 변환
4. **`components/calc/results/PropertyTaxResultView.tsx`** — 목록 li → a 변환

## 검증 방법

1. 양도소득세 계산 완료 후 결과 뷰에서 "소득세법 §94 ①" 클릭 → law.go.kr/법령/소득세법 새 탭 열림 확인
2. "조특법 §69" 클릭 → law.go.kr/법령/조세특례제한법 확인
3. "상증법 §26" 클릭 → law.go.kr/법령/상속세및증여세법 확인
4. 취득세·재산세 결과 뷰에서도 링크 동작 확인

---

# 이전 완료 작업

## 공시가격 드롭다운 연도 기본값 수정 ✅ 완료

## Context

**문제**: 취득일/양도일이 해당 연도 공시일 이전이면 전년도 공시가격을 써야 하는데,
현재 연도 드롭다운은 단순히 날짜에서 연도만 추출해 초기값으로 설정함.

**예시**:
- 취득일 2023.4.28 / 2023년 공시일 2023.4.30 → 공시일 이전 → **2022년** 공시가격 사용해야 함
- 양도일 2025.4.28 / 2025년 공시일 2025.4.29 → 공시일 이전 → **2024년** 공시가격 사용해야 함

**현재 동작**:
- `acqYear` 초기값 = `form.acquisitionDate.slice(0, 4)` (단순 연도 추출)
- `lookupStandardPrice`가 자동 실행돼 올바른 연도를 찾은 후 `setAcqYear(year)` 동기화하지만,
  초기 드롭다운은 잘못된 연도를 보여줌

## 해결 방법

API 호출 없이 날짜와 공시 법정 기준일(주택 4.29, 토지 5.31)을 비교해 기본 연도를 결정하는
**순수 함수 헬퍼** `getDefaultPriceYear`를 추가.

```ts
function getDefaultPriceYear(dateStr: string, propertyType: string): string {
  if (!dateStr || dateStr.length < 10) return String(new Date().getFullYear());
  const year = parseInt(dateStr.slice(0, 4));
  const mmdd = dateStr.slice(5, 7) + dateStr.slice(8, 10); // "MMDD"
  const cutoff = propertyType === "land" ? "0531" : "0429"; // 법정 공시일
  return mmdd < cutoff ? String(year - 1) : String(year);
}
```

검증:
- 2023.4.28 + housing → "0428" < "0429" → **2022** ✓
- 2025.4.28 + housing → "0428" < "0429" → **2024** ✓
- 2025.4.30 + housing → "0430" < "0429" → false → **2025** ✓
- 2025.5.30 + land    → "0530" < "0531" → **2024** ✓
- 2025.5.31 + land    → "0531" < "0531" → false → **2025** ✓

## 수정 파일

**`app/calc/transfer-tax/TransferTaxCalculator.tsx`** — Step3 컴포넌트만 수정

### 변경 사항 (3곳)

#### 1. 헬퍼 함수 추가 (Step3 함수 바로 위)
```ts
function getDefaultPriceYear(dateStr: string, propertyType: string): string {
  if (!dateStr || dateStr.length < 10) return String(new Date().getFullYear());
  const year = parseInt(dateStr.slice(0, 4));
  const mmdd = dateStr.slice(5, 7) + dateStr.slice(8, 10);
  const cutoff = propertyType === "land" ? "0531" : "0429";
  return mmdd < cutoff ? String(year - 1) : String(year);
}
```

#### 2. 초기 state 값 수정
```ts
// Before
const [acqYear, setAcqYear] = useState<string>(
  () => form.acquisitionDate ? form.acquisitionDate.slice(0, 4) : String(currentYear - 1)
);
const [tsfYear, setTsfYear] = useState<string>(
  () => form.transferDate ? form.transferDate.slice(0, 4) : String(currentYear)
);

// After
const [acqYear, setAcqYear] = useState<string>(
  () => getDefaultPriceYear(form.acquisitionDate, form.propertyType)
);
const [tsfYear, setTsfYear] = useState<string>(
  () => getDefaultPriceYear(form.transferDate, form.propertyType)
);
```

#### 3. 날짜 변경 시 동기화 useEffect 수정
```ts
// Before: setAcqYear(newYear) — 단순 연도 추출
// After:  setAcqYear(getDefaultPriceYear(form.acquisitionDate, form.propertyType))

useEffect(() => {
  if (!form.acquisitionDate) return;
  setAcqYear(getDefaultPriceYear(form.acquisitionDate, form.propertyType));
  if (prevAcqDateRef.current && prevAcqDateRef.current !== form.acquisitionDate) {
    onChange({ standardPriceAtAcquisition: "", standardPriceAtAcquisitionLabel: "" });
  }
  prevAcqDateRef.current = form.acquisitionDate;
}, [form.acquisitionDate, form.propertyType]);

useEffect(() => {
  if (!form.transferDate) return;
  setTsfYear(getDefaultPriceYear(form.transferDate, form.propertyType));
  if (prevTsfDateRef.current && prevTsfDateRef.current !== form.transferDate) {
    onChange({ standardPriceAtTransfer: "", standardPriceAtTransferLabel: "" });
  }
  prevTsfDateRef.current = form.transferDate;
}, [form.transferDate, form.propertyType]);
```

## 기존 코드 재사용

- `lookupStandardPrice`의 날짜↔공시일 비교 로직(txDateCompact < effectiveAnnounced)과 완전히 동일한 기준 사용
- `setAcqYear(year)` / `setTsfYear(year)` — 자동조회 성공 시 드롭다운 동기화 로직 유지

## 검증 방법

1. `npm run dev` 실행
2. 양도일 2025-04-28, 취득일 2023-04-28 입력
3. "환산취득가액 사용" 체크 후 환산취득가 섹션 확인
   - **취득 당시 기준시가** 드롭다운 → **2022년** 기본값 표시 확인
   - **양도 당시 기준시가** 드롭다운 → **2024년** 기본값 표시 확인
4. 각 "조회" 버튼 클릭 시 해당 연도 공시가격 조회 및 레이블 확인
5. 드롭다운에서 다른 연도 선택 후 "조회" → 선택 연도 공시가격 조회 확인
