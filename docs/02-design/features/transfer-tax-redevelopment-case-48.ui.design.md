# 사례 48 — 재개발 승계조합원 준공 후 신축APT 양도 — UI 설계

> 본 문서는 `transfer-tax-redevelopment.ui.design.md` 및 사례 44~47 UI 디자인의 후속 확장.
> 입력 자료: PDF `재개발-승계조합원.pdf` (예제 화면 4장: p.575·576·577·578)
> 시점: 2026-05-14
> 짝궁 엔진 디자인: `transfer-tax-redevelopment-case-48.engine.design.md`
> 케이스 번호: **case_48** (책 47)

---

## Context

사례 44~47이 모두 원조합원 UI 가정이었던 데 반해, 본 사례는 **승계조합원** UI 분기를 본격 도입한다. PDF 예제 화면(p.575)에는 명시적 토글이 없지만, 사용자 가이드 문장 "갑氏와 같은 승계조합원의 경우 기존부동산 유형 선택시 입주권을 선택해야 한다"는 사실상 **승계조합원 모드 진입 신호**다.

본 PR UI는 다음 5가지를 도입한다:

1. **★ 승계조합원 모드 ToggleCard (★ 최우선)** — `RedevelopmentBlock` 상단에 "조합원 구분" 선택 (원조합원 / 승계조합원)
2. **준공일(사용검사필증 교부일) DateInput** — 승계조합원 ON 시 노출
3. **자동 추정 안내 카드 (silent 분기 금지)** — `acquisitionDate > approvalDate` 감지 시 권장 안내만 표시
4. **승계조합원 ON 시 자동 숨김** — `redevSettlement*` 전체 + `useEstimatedAcquisition` + `redevReceiveOnlyMode` + `redev*ResidenceMonths` (본 PR settlement·12억·환산은 후속)
5. **결과 카드 분기 라벨** — `components/calc/results/transfer/RedevelopmentDetailCard.tsx` 에 "승계조합원 (준공일 기산)" 배지 + 안분 우회 산식 표시

---

## ★ 선행 파일 분할 (800줄 정책 사전 확인)

`RedevelopmentBlock.tsx` 현재 줄수 측정 + 본 PR 추가 +90 후 800줄 초과 여부 점검 필요. 사례 46/47에서 `RedevelopmentSettlementSection.tsx`/`RedevelopmentExemptionSection.tsx` 로 이미 분할되었다면 본 PR에는 새 Section을 1개 더 추가:

```
components/calc/transfer/
├── RedevelopmentBlock.tsx                    # orchestrator
├── RedevelopmentSettlementSection.tsx        # (기존)
├── RedevelopmentExemptionSection.tsx         # (기존)
└── RedevelopmentSuccessorSection.tsx         # 신규 — 조합원 구분·준공일·자동추정 힌트 (~150줄)
```

Do 진입 전 `wc -l components/calc/transfer/RedevelopmentBlock.tsx` 실측 → +90 후 800줄 초과 시 즉시 분할.

---

## 사용자 시나리오 (사례 48 입력 흐름 — PDF p.575~578 예제 화면 매핑)

```
[Step 1] 자산종류 선택
  → "재개발·재건축 아파트 (redevelopment_apt)" 선택
  → 자동 설정:
    · assetKind = "redevelopment_apt"
    · redevSubject = "apt"
    · redevApprovalLawBasis = "urban_renovation_art_74"
  → ★ 종전부동산 유형 (PDF p.575 예제 화면 "기존부동산 유형"):
    · 예제 가이드: "갑氏와 같은 승계조합원의 경우 기존부동산 유형 선택시 입주권을 선택"
    · 우리 시스템 매핑: 우리는 `redevOriginalAssetType` 을 "housing"(주택 출자) 유지
      (예제 "입주권" 선택은 자동 분기 시그널 — 우리는 별도 토글 `isSuccessorMember` 로 명시)

[Step 2] RedevelopmentBlock 입력 (PDF p.575·576)

  ① 종전부동산 정보 (예제 p.576 화면)
     - 갑氏 취득일자: 2020-04-15 (상속개시일)
     - 갑氏 취득원인: "상속_시가평가액" (예제 화면 → 우리 시스템 `acquisitionCause`)
     - 갑氏 취득가액: 450,000,000 (상속세 신고시 평가액)
     - 입주권필요경비: 150,000,000 (예제 화면 → 우리 시스템 `redevPostApprovalExpenses`)
       ⚠️ **라벨 분기 (사용자 환류 ③)** — `redevPostApprovalExpenses` 필드는 원조합원에서 "인가후 비용 전체"를 의미.
       승계조합원 모드에서는 추가분담금만이 아니라 등기비·중개수수료 등도 포함될 수 있어 UI 라벨을 분리:
       · `redevIsSuccessorMember="no"` (원조합원): "추가분담금 (인가후 비용)"
       · `redevIsSuccessorMember="yes"` (승계조합원): "인가후 필요경비 (추가분담금·등기비·중개수수료 등)"

  ② ★ 조합원 구분 ToggleCard (★ 본 PR 신규)
     - 라디오: "원조합원 / 승계조합원"
     - 승계조합원 선택 시:
       a. DateInput "준공일 (사용검사필증 교부일)" — `redevCompletionDate`
          · 값: 2022-12-02 (PDF p.575 예제 "준공(사용승인)일" 필드)
          · hint: "신축아파트 사용검사필증 교부일. 보유기간·세율의 기산일이 됩니다."
       b. 자동 추정 안내 카드 (violet, 조건부):
          · 표시 조건: `acquisitionDate > approvalDate`
          · 메시지: "관리처분 인가일 이후 취득이 감지되었습니다. 승계조합원 모드 사용을 권장합니다."
          · ⚠️ 자동 적용 금지 — 안내만 (silent 분기 금지 정책)
       c. 법령 안내 카드 (sky):
          · "시행령 §162①4호 · 사전-2019-법령해석재산-0649"
          · 모달 링크 (`LawArticleModal` alias 신규 등록)
       d. 자동 숨김 (필드 비활성화):
          · `redevSettlementDirection` 전체 라디오 (settlement 미지원)
          · `redevSettlementAmount` / `redevSettlementSaleDate`
          · `redevReceiveOnlyMode` (사례 46 모드)
          · `useEstimatedAcquisition` 토글 (환산 모드 미지원)
          · `redev*ResidenceMonths` (사례 45 거주월수 — 본 PR 미지원)
          · `redevFirstDisclosureDate` 및 PHD 일체 (환산 무관)
          · **`asset.expenses` 일반 expenses 필드** (★ 모순 2 처리 — redev path 미차감)
       e. 진입 시 onChange 동반 셋팅 (★ 누락 5 보강):
          · `redevSubject = "apt"` (명시 — fallback 의존 차단)
          · `redevSettlementDirection = "none"` (본 PR 강제)
          · `redevPreApprovalExpenses = "0"` (본 PR 강제)
          · `redevReceiveOnlyMode = "no"` (본 PR 강제)
          · `useEstimatedAcquisition = false` (본 PR 강제)
          (zustand onChange로 1회 셋팅 — useEffect 미러링 금지, `feedback_useeffect_store_mirror_forbidden`)

  ③ 관리처분 인가일 입력
     - PDF: 2016-02-20 (아버지 시점)
     - 일반 필드 그대로 사용 (`redevApprovalDate`)

  ④ 권리가액
     - PDF: 입력 없음 (예제 화면 미표시)
     - 우리 시스템: `redevRightsValue` = 450,000,000 (= 갑氏 취득가액 동치)
     - 입력 가이드 (조건부): "승계조합원은 취득가액(상속/증여 평가액)이 곧 권리가액으로 사용됩니다."

[Step 3] 결과화면 (PDF p.577·578)

  - 자산종류 표시: "재개발 신축APT (승계조합원, 준공일 기산)" ← ★ 본 PR
  - 양도소득금액 계산명세서:
    · 양도가액 920,000,000
    · 취득가액 450,000,000 (실지거래가액 — 상속 시가평가액)
    · 기타 필요경비 150,000,000
    · 전체 양도차익 320,000,000
    · 비과세 양도차익 0
    · 과세대상 양도차익 320,000,000
    · LTHD 0
    · 양도소득금액 320,000,000
  - 산식 (한국어 풀어쓰기):
    "양도차익 = 양도가 920,000,000 − 상속 시가평가액 450,000,000 − 추가분담금 150,000,000
            = 320,000,000"
    "보유기간 = 양도일 2023-02-16 − 준공일 2022-12-02 = 76일 (1년 미만)"
    "장기보유특별공제 = 0 (3년 미만 미적용)"
    "세율 = 70% (1년 미만 단기, 준공일 기산)"
  - 세액:
    · 산출세액 222,250,000 ★
    · 지방소득세 22,225,000 ★
    · 세액합계 244,475,000 ★
```

---

## UI 명세 — `RedevelopmentSuccessorSection.tsx` (신규)

### 위치
`RedevelopmentBlock` 내 `RedevelopmentOriginalAssetType` 섹션 **다음**, `RedevelopmentSettlementSection` **이전**.

### 사용 가능한 컴포넌트 (실측 — `components/calc/inputs/`)
- ✅ `RadioCardGroup`, `ToggleCard`, `FieldCard`, `CurrencyInput`, `DecimalInput`, `LandPriceLookupField`, `StandardPriceInput`
- ✅ `LawArticleModal` (`@/components/ui/law-article-modal` — `legalBasis` + `label` props)
- ✅ `DateInput` (기존 RedevelopmentBlock에서 import 사용 중)
- ❌ `SectionCard`, `InfoCard`, `PreviewCard`, `LawArticleBadge`, `LawArticleLink`, `Badge` — 본 inputs/ 폴더에 미존재
  - 섹션 카드는 기존 RedevelopmentBlock 패턴(div + Tailwind tone 클래스) 그대로 차용
  - PreviewCard 패턴은 `components/calc/transfer/InheritanceValuationPreviewCard.tsx` 와 `PreHousingDisclosurePreviewCard.tsx` 모방

### 구성 (기존 RedevelopmentBlock 섹션 패턴 차용 — div + Tailwind)

```tsx
{/* 조합원 구분 섹션 — rose tone div 패턴 (기존 RedevelopmentBlock 섹션 스타일과 동일) */}
<div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 space-y-4">
  <div className="flex items-center gap-2">
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white">N</span>
    <h3 className="text-base font-semibold text-rose-900">조합원 구분</h3>
  </div>

  <RadioCardGroup<"yes" | "no">
    tone="rose"
    value={(asset.redevIsSuccessorMember as "yes" | "no") || "no"}
    onChange={(v) => onChange({ redevIsSuccessorMember: v })}
    options={[
      {
        value: "no",
        label: "원조합원",
        description: "관리처분계획인가일 이전 종전부동산 취득자",
      },
      {
        value: "yes",
        label: "승계조합원",
        description: "관리처분계획인가일 이후 입주권을 상속·증여·매매로 승계 취득",
      },
    ]}
  />

  {/* 자동 추정 안내 — silent 적용 금지. 단순 div + violet tone */}
  {autoSuggestionVisible && (
    <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
      ⓘ 관리처분 인가일({approvalDate})은 취득일({acquisitionDate})보다 이전입니다.
      승계조합원 모드 사용을 권장합니다.
    </div>
  )}

  {asset.redevIsSuccessorMember === "yes" && (
    <>
      <FieldCard
        label="준공일 (사용검사필증 교부일)"
        hint="신축아파트 사용검사필증 교부일. 보유기간·세율의 기산일이 됩니다."
        trailing={
          <LawArticleModal
            legalBasis="소득세법 시행령 §162 ① 4호"
            label="시행령 §162①4호"
          />
        }
      >
        <DateInput
          value={asset.redevCompletionDate}
          onChange={(v) => onChange({ redevCompletionDate: v })}
        />
      </FieldCard>

      {/* 법령 안내 — sky tone div */}
      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 space-y-1">
        <div className="font-semibold">승계조합원 신축APT 양도 분기</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>보유기간 = 양도일 − 준공일</li>
          <li>장기보유특별공제·세율의 기산일 = 준공일</li>
          <li>1세대1주택 비과세는 준공일 기준 2년 보유 충족 시 적용</li>
        </ul>
        <div className="flex gap-2 pt-1">
          <LawArticleModal
            legalBasis="소득세법 시행령 §162 ① 4호"
            label="시행령 §162①4호"
          />
          <LawArticleModal
            legalBasis="사전-2019-법령해석재산-0649"
            label="사전-2019-법령해석재산-0649"
          />
        </div>
      </div>

      {/* 후속 PR 안내 — amber tone div */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="font-semibold">본 PR 미지원 분기 (자동 차단)</div>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>승계조합원 + 청산금 분기 (후속 PR)</li>
          <li>승계조합원 + 12억 초과 안분 (후속 PR)</li>
          <li>승계조합원 + 환산취득가 (후속 PR)</li>
        </ul>
      </div>
    </>
  )}
</div>
```

### 자동 숨김 로직 (`RedevelopmentBlock.tsx` 조건부 렌더)

```tsx
const isSuccessor = asset.redevIsSuccessorMember === "yes";

{!isSuccessor && <RedevelopmentSettlementSection ... />}
{!isSuccessor && <RedevelopmentResidenceSection ... />}
{!isSuccessor && estimatedToggleVisible && <EstimatedToggle ... />}
```

---

## 14 동기화 지점 — UI 측

### ① 폼 상태 (`lib/stores/calc-wizard-store.ts` AssetForm)
```ts
redevCompletionDate: string;             // YYYY-MM-DD
redevIsSuccessorMember: "yes" | "no";    // 기본 "no"
```

### ② initial
```ts
redevCompletionDate: "",
redevIsSuccessorMember: "no",
```

### ③ normalize
```ts
redevCompletionDate: (asset.redevCompletionDate || "").trim(),
redevIsSuccessorMember: (asset.redevIsSuccessorMember || "no") as "yes" | "no",
```

### ④ API 변환 (`lib/calc/transfer-tax-api.ts` `buildRedevelopmentPayload`)
```ts
completionDate: asset.redevCompletionDate || undefined,
isSuccessorMember: asset.redevIsSuccessorMember === "yes",
```

### ⑤ UI 위젯
`RedevelopmentSuccessorSection.tsx` (신규, 위 명세대로)

### ⑥ 사이드바 합계 (`Sidebar*.tsx`) — ★ Minor 5 정정

승계조합원 모드에서는 두 날짜가 의미가 다르므로 사이드바 "취득일" 라벨을 **"입주권 승계취득일"** 로 명시 (혼란 차단):

```tsx
{asset.redevIsSuccessorMember === "yes" ? (
  <>
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
      승계조합원
    </span>
    <div className="text-xs text-gray-600 mt-1">
      입주권 승계취득일: {asset.acquisitionDate}
    </div>
    <div className="text-xs text-gray-600">
      준공일 (보유기간 기산일): {asset.redevCompletionDate}
    </div>
  </>
) : (
  <div className="text-xs text-gray-600">취득일: {asset.acquisitionDate}</div>
)}
```

→ 결과 카드(`RedevelopmentDetailCard`)에서도 두 날짜를 동시 노출 (산식 섹션에 명시):
- "입주권 승계취득일: 2020-04-15 (시행령 §162①5호 — 상속개시일)"
- "보유기간 기산일: 2022-12-02 (사용검사필증 교부일 — 사전-2019-0649)"

### ⑦ 결과 카드 (`RedevelopmentDetailCard.tsx`)
- `successorMemberDetail?.applied === true` 분기:
  - 헤더 배지: "승계조합원 (준공일 기산)"
  - 산식 라벨: `BRANCH_LABEL_SUCCESSOR_MEMBER` (신규 상수)
  - 단순 차감 산식 표시 (인가전·인가후 안분 표 숨김)

### ⑧ Validation (`lib/calc/transfer-tax-validate-redev.ts`)
엔진 디자인 §Validation 신규 5건. UI display fallback과 3-layer 동기화:
- `redevIsSuccessorMember` 기본값 "no" → API/validate 모두 "no" 동치
- `redevCompletionDate` 빈값 ↔ engine `completionDate=undefined` ↔ validate "필수" 에러

### ⑨⑩ Zod enum
- 메인·컴패니언 schema 모두 `redevIsSuccessorMember: z.enum(["yes", "no"])` 추가

### ⑪ acquisitionDate fallback
- 변경 없음 — `acquisitionDate` 그대로 자산 폼에서 입력됨

### ⑫ Zod 입력 객체 (RedevelopmentInfo schema)
```ts
completionDate: z.string().datetime().optional(),
isSuccessorMember: z.boolean().optional(),
```

### ⑬ `callTransferTaxAPI` body spread
명시 spread (자동 spread 시 누락 가능 — `feedback_api_zod_schema_sync` 정책):
```ts
redevelopment: {
  ...existing,
  completionDate: payload.completionDate,
  isSuccessorMember: payload.isSuccessorMember,
}
```

### ⑭ Route handler 엔진 매핑 (`app/api/calc/transfer/route.ts`)
```ts
coerceDates(input.redevelopment, [
  "approvalDate",
  "settlementSaleDate",
  "firstDisclosureDate",
  "completionDate",  // ★ 신규
]);
```

---

## LawArticleModal 호출 패턴 (★ 정정 — alias 등록 불필요)

기존 패턴 그대로 사용. `LawArticleModal`는 `legalBasis` + `label` string props만 받음 (`RedevelopmentBlock.tsx:381,473` 확인). `lib/korean-law/aliases.ts`는 법령 약칭 → 정식명 사전이며 모달 등록과 무관.

```tsx
<LawArticleModal
  legalBasis="소득세법 시행령 §162 ① 4호"
  label="시행령 §162①4호"
/>

{/* 해석례는 별도 모달 패턴 (RedevelopmentBlock 기존 §155⑰ 해석례 패턴 참조) */}
<LawArticleModal
  legalBasis="사전-2019-법령해석재산-0649"
  label="사전-2019-법령해석재산-0649"
/>
```

---

## 결과 카드 산식 표시 (한국어 풀어쓰기 — 변수 약어·floor 금지)

```
재개발 신축APT 양도 (승계조합원)

  보유기간 기산일: 2022년 12월 2일 (사용검사필증 교부일)
  양도일자: 2023년 2월 16일
  보유일수: 76일 (1년 미만)

  양도차익 = 양도가액 − 상속 시가평가액 − 추가분담금
         = 920,000,000 − 450,000,000 − 150,000,000
         = 320,000,000

  장기보유특별공제 = 0
    (보유 1년 미만 — 표1 3년 미만 적용 0%)

  양도소득금액 = 320,000,000
  양도소득기본공제 = 2,500,000
  과세표준 = 317,500,000

  세율 = 70% (1년 미만 단기, 준공일 기산)
  산출세액 = 과세표준 × 70% = 222,250,000

  지방소득세 = 산출세액 × 10% = 22,225,000
  세액합계 = 244,475,000

  ⓘ 근거 (2종 병기 — 사용자 코드리뷰 환류 ②):
   · 취득시기 분기: 시행령 §162①4호 (자가건설 의제) + 사전-2019-법령해석재산-0649
   · 단기세율 분기: 소득세법 §104①3호 (주택, 1년 미만 70%) — 입주권 §104①3호 후단(70%)과
     세율은 동일하나, **본 사례는 신축APT(주택) 양도로 §104①3호 본문 적용**.
     입주권(`subject="right"`) 양도가 아님에 유의.
```

⚠️ 법령 호 번호 검증 (law.go.kr §104 2026-05-14 조회):
- §104①2호 = 보유 1년 이상 2년 미만 (주택·입주권 60%)
- **§104①3호 = 보유 1년 미만 (주택·입주권 70%)** ← 본 사례 적용
- 사용자 환류 메모의 "§104①2호 (1년 미만 70%)"는 오타로 보이며, 정확한 호는 **§104①3호**.

(메모리 정책 준수: 숫자 끝 "원" 단위 표기 금지)

---

## 자동 추정 힌트 표시 조건 (silent 분기 금지)

### 경계값 처리 (★ 사용자 환류 ④ 보강)

`acquisitionDate === approvalDate` (인가일 당일 승계)는 원조합원·승계조합원 해석이 갈리는 회색지대 (사전답변례에서 "인가일 이후"의 포함 여부 확인 필요). 본 PR에서는 **별도 경고 카드**로 분리하여 사용자 선택을 강제:

```ts
const autoSuggestionState = useMemo<"hidden" | "recommend" | "ambiguous">(() => {
  if (asset.redevIsSuccessorMember === "yes") return "hidden";  // 이미 ON
  if (!asset.acquisitionDate || !asset.redevApprovalDate) return "hidden";
  const acq = new Date(asset.acquisitionDate).getTime();
  const apv = new Date(asset.redevApprovalDate).getTime();
  if (acq > apv) return "recommend";        // 명백한 인가 후 취득 → 승계조합원 권장
  if (acq === apv) return "ambiguous";      // ★ 경계값 — 회색지대 경고
  return "hidden";                          // 인가 전 취득 → 원조합원 정상
}, [asset.acquisitionDate, asset.redevApprovalDate, asset.redevIsSuccessorMember]);
```

```tsx
{autoSuggestionState === "recommend" && (
  <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
    ⓘ 관리처분 인가일({approvalDate})은 취득일({acquisitionDate})보다 이전입니다.
    승계조합원 모드 사용을 권장합니다.
  </div>
)}

{autoSuggestionState === "ambiguous" && (
  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    ⚠️ 취득일과 관리처분 인가일이 **동일 날짜**입니다. 원조합원·승계조합원 해석이 갈리는 회색지대로,
    사전답변례와 NTS 해석을 확인 후 적절한 모드를 선택하세요. (시행령 §166 "이후"의 포함 여부)
  </div>
)}
```

- 안내만 (자동 토글 금지 — `feedback_no_silent_apportion_fallback`)
- `useEffect → store` 미러링 금지 (`feedback_useeffect_store_mirror_forbidden`)

---

## 미리보기 카드 (read-only) — 산식 도출

`InheritanceValuationPreviewCard.tsx` / `PreHousingDisclosurePreviewCard.tsx` 와 동일 패턴 (div + Tailwind tone, useMemo로 순수 도출, store 쓰기 금지):

```tsx
{isSuccessor && completionDate && transferDate && (
  <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 space-y-1">
    <div className="font-semibold">미리보기 (read-only)</div>
    <div>
      보유일수: {daysBetween(completionDate, transferDate)}일
      ({holdingMonths < 12 ? "1년 미만 — 70%" :
        holdingMonths < 24 ? "1년 이상 2년 미만 — 60%" :
        "기본누진세율"})
    </div>
    <div>
      양도차익 (예상): {formatKRW(transferPrice - rightsValue - postApprovalExpenses)}
    </div>
  </div>
)}
```

useMemo 순수 함수로 도출. store에 쓰지 않음 (`feedback_useeffect_store_mirror_forbidden`).

---

## 회귀 보호 — 사례 44~47 UI 영향 0

| 사례 | 입력 | 결과 | 회귀 보호 |
|---|---|---|---|
| 44 | 원조합원 + APT-환산-납부 | `redevIsSuccessorMember="no"` (기본) | 분기 미진입, 기존 경로 |
| 45 | 원조합원 + APT-실가-납부 + 12억 초과 | 동일 | 동일 |
| 46 | 원조합원 + APT-실가-receiveOnly | 동일 | 동일 |
| 47 | 원조합원 + APT-실가-동시신고 | 동일 | 동일 |

검증 anchor: 본 PR 후 사례 44~47 통합 anchor (총 60개+) 100% 보존 강제.

---

## Definition of Done (UI 측)

- [ ] `RedevelopmentSuccessorSection.tsx` 신규 (~150줄)
- [ ] `RedevelopmentBlock.tsx` 분기 라우팅 + 자동 숨김 5건 (settlement·receiveOnly·estimated·residence·firstDisclosure)
- [ ] `RedevelopmentDetailCard.tsx` 분기 라벨 + 산식 + **§162①4호·§104①3호 2종 근거 병기** (환류 ②)
- [ ] **`redevPostApprovalExpenses` UI 라벨 분기** — 원조합원("추가분담금")·승계조합원("인가후 필요경비 (추가분담금·등기비·중개수수료 등)") (환류 ③)
- [ ] 사이드바 라벨 "입주권 승계취득일" + 결과 카드 "준공일(보유기간 기산일)" 동시 표기 (Minor 5 / 환류 ⑤)
- [ ] **자동 추정 힌트 3-state** (`"hidden"` / `"recommend"` / `"ambiguous"`) — `acquisitionDate === approvalDate` 경계값 경고 카드 (환류 ④)
- [ ] AssetForm 2필드 + initial + normalize
- [ ] `transfer-tax-api.ts` 변환 2필드
- [ ] Zod schema 2지점 (메인·컴패니언) + RedevelopmentInfo schema 2필드
- [ ] `callTransferTaxAPI` body spread 명시
- [ ] Route handler coerceDates 1필드 추가
- [ ] `transfer-tax-validate-redev.ts` 차단 해제 + 신규 5건
- [ ] **엔진 측 `valuationMeta.method` 유니언 확장** — `"successor_member_decree_162_1_4"` 추가 (`transfer-redevelopment.types.ts:247-250`) (환류 ⑤)
- [ ] **엔진 측 `successorMemberApplied?: boolean` + `BRANCH_LABEL_SUCCESSOR_MEMBER`** 추가 (`DetailedStatementRedevelopmentBuilders.ts`)
- [ ] LawArticleModal 호출 패턴 — `legalBasis="..." label="..."` 기존 패턴 그대로 (alias 등록 불필요)
- [ ] 브라우저 수동 확인 (ToggleCard·DateInput·자동 추정 안내·Network 탭 신규 필드 2종)
- [ ] 회귀 0건 (사례 44~47 + 전체 vitest)

---

## Pre-Do 환류 반영 (2026-05-14)

본 UI 디자인은 Pre-Do anchor 실행 결과를 반영했다:
1. 추가분담금 입력 슬롯 = `redevPostApprovalExpenses` (정정 — `expenses` 아님)
2. 자동 숨김 목록에서 settlement·estimated·residence 일체 명시
3. 안분 우회 옵션 C → 결과 카드에서 인가전/인가후 안분 표 숨김

---

## Self-Audit 정정 이력 (2026-05-14)

본 문서 초안 → 1차 코드 실측 재검토에서 발견·정정한 오류·누락:

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| 1 | **오류** | `redevSubject: "right_to_move_in"` | `redevSubject: "right"` | `calc-wizard-asset-redev.ts:24` 실측 유니언 `"" \| "right" \| "apt"` |
| 2 | **오류** | 결과 카드 경로 `components/calc/transfer/result/...` | `components/calc/results/transfer/RedevelopmentDetailCard.tsx` | grep 실측 |
| 3 | **오류** | `LawArticleModal alias` 등록 + `aliases.ts` 추가 | `LawArticleModal legalBasis="..." label="..."` 기존 패턴 그대로 | `RedevelopmentBlock.tsx:381,473` 실측 / `aliases.ts`는 약칭 사전 (모달 무관) |
| 4 | **누락** | `SectionCard`/`InfoCard`/`PreviewCard`/`LawArticleBadge`/`LawArticleLink`/`Badge` 컴포넌트 사용 | 모두 미존재 — 기존 div + Tailwind tone 패턴 차용 (`InheritanceValuationPreviewCard`/`PreHousingDisclosurePreviewCard` 모방) | `components/calc/inputs/` ls 실측 |
| 5 | **누락** | `valuationMeta.method` 유니언 확장 미언급 | 엔진 디자인에 `"successor_member_decree_162_1_4"` 추가 명시 | `transfer-redevelopment.types.ts:247-250` 유니언 실측 |
| 6 | **누락** | `successorMemberApplied?: boolean` 결과 필드 미언급 | `DetailedStatementRedevelopmentBuilders.getBranchLabels()` 분기 신규에 필요 | `DetailedStatementRedevelopmentBuilders.ts:52` 실측 |
| 7 | **누락** | 분기 진입점 `transfer-tax-redevelopment.ts` 가정 | 실제 진입점은 `lib/tax-engine/redevelopment.ts:87 runRedevelopment()` | grep 실측 |

### 2차 정정 (사용자 코드리뷰 환류 — 2026-05-14 PM)

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| F2 | **누락** (환류 ②) | 결과 카드 산식 "준공일 기산" 단일 표기 | 시행령 §162①4호(취득시기) + **소득세법 §104①3호 (주택 1년 미만 70%)** 2종 근거 병기. 입주권 §104①3호 후단이 아닌 **주택 §104①3호 본문** 적용 명시. 사용자 메모의 "§104①2호" 호 번호 오타 → §104①3호로 정정 | law.go.kr §104 2026-05-14 조회 |
| F3 | **누락** (환류 ③) | `redevPostApprovalExpenses` = "추가분담금" 단일 라벨 | 모드별 라벨 분기: 원조합원 "추가분담금 (인가후 비용)" / 승계조합원 "인가후 필요경비 (추가분담금·등기비·중개수수료 등)" — 등기비·중개수수료 포함 명시 | 승계 시점 후속 비용 다양성 |
| F4 | **누락** (환류 ④) | 자동 추정 힌트 boolean 2-state (`acquisitionDate > approvalDate`만 판정) | **3-state** (`"hidden"` / `"recommend"` / `"ambiguous"`) — `acquisitionDate === approvalDate` 경계값(인가일 당일 승계)은 별도 amber 경고 카드 | 회색지대 해석 분쟁 가능성 |
| F5 | **누락** (환류 ⑤) | DoD에 엔진 측 타입 변경 누락 | `valuationMeta.method` 유니언 확장 + `successorMemberApplied?: boolean` + `BRANCH_LABEL_SUCCESSOR_MEMBER` 항목 명시 추가. 사이드바 라벨 + 결과 카드 동시 표기 항목도 명시 | 14지점 ⑫ 동기화 강제 |

### 3차 정정 (모순·UI누락 라운드 — 2026-05-14 PM)

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| U1 | **누락** | 자동 숨김 5건만 명시 | **`asset.expenses` 일반 expenses 필드도 숨김** 추가 (★ 모순 2 후속) | Pre-Do 발견 — redev path 미차감 |
| U2 | **누락** | successor 진입 시 onChange 동반 셋팅 부재 | `redevSubject="apt"` 명시 셋팅 + `redevSettlementDirection="none"`·`redevPreApprovalExpenses="0"`·`redevReceiveOnlyMode="no"`·`useEstimatedAcquisition=false` 1회 셋팅 (zustand onChange, useEffect 금지) | `RedevelopmentBlock.tsx:118` display fallback만 존재 |
| U3 | **누락** | PDF "취득원인 (상속_시가평가액)" UI 매핑 부재 | `asset.acquisitionCause = "inheritance"` 명시 — 사용자가 Step 2 자산 카드에서 선택 (기존 인프라 재사용) | PDF p.576 화면 + AssetForm 실측 |

---

## 후속 PR UI 인터페이스 (참고)

| ID | UI 변경 예상 | 차단 위치 |
|---|---|---|
| 48-D | settlementDirection 활성 + 산식 변경 | validate `direction !== "none"` |
| 48-E | receiveOnly 활성 + 안내 변경 | validate `receiveOnly === "yes"` |
| 48-H | 12억 안분 카드 활성 | (보유 2년 이상 + isOneHousehold=true 조건) |
| 48-I | 다주택 중과 안내 | (multi-house-surcharge 모듈 cross-cutting) |
| 48-J | 환산 토글 활성 + 안내 변경 | validate `useEstimatedAcquisition` |
