# 사례 37 — 조합원입주권 양도 + 토지 출자 + 청산금 불입 + 취득실거래가 불명(환산) UI Design

> **범위**: 사례 37 (양도코리아 PDF) — `subject="right"` + `originalAssetType="land"` + `useEstimatedAcquisition=true`
> **파생 계획서**: `.claude/plans/case-37-redev-right-land-contribution-estimated.md` (rev3)
> **UI 시니어 담당**: 14지점 ①~⑭ 동기화 + 컴포넌트 설계
> **작성일**: 2026-05-15

---

## 1. 사용자 시나리오

### 1.1 진입 경로 (이미지 2 → land 활성화)

```
Step 1 — 자산 목록
  └─ 자산 추가 → assetKind = "right_to_move_in" (조합원입주권)
  └─ 자산 카드 상단:
       취득일(acquisitionDate): 2007-04-09  ← 출자한 토지 취득일
       양도일(saleDate):       2023-03-02  ← 입주권 양도 잔금일
       양도가액(transferPrice): 520,000,000
       취득원인: purchase
       취득가액 산정 방식 라디오: 환산취득가 (useEstimatedAcquisition=true)
         ↑ 사용자가 명시 선택. 기본은 실가 — 본 PR은 환산만 지원

Step 1 자산 카드 내 재개발 섹션 (RedevelopmentBlock.tsx)
  ├─ [1] 양도 대상: "입주권(관리처분 후)" (subject="right")   ← 기존 고정
  ├─ [2] 출자 자산:
  │       ○ 주택 출자 (housing) — 기존 기본
  │       ● 토지 출자 (land)    ← 본 PR disabled 해제
  ├─ [3] 인가 법령 근거: 도정법 §74 (기본)
  ├─ [4] 관리처분 인가일(approvalDate): 2014-10-23
  ├─ [5] 권리가액(redevRightsValue): 300,000,000
  ├─ [6] 청산금 방향(settlementDirection): 불입 (pay)
  ├─ [7] 청산금 금액(redevSettlementAmount): 100,000,000
  │     (redevSettlementSaleDate는 receive 전용 — pay 분기에서 hidden)
  │     (redevPreApprovalExpenses는 land+est 분기에서 hidden — 본 PR 강제 0,
  │      PDF 사례 37 정합. 후속 PR에서 실비 입력 노출 검토)
  └─ 자산 상단 [환산취득가 토글 ON] → RedevelopmentValuationSection 노출

Step 1 자산 카드 내 환산 섹션 (RedevelopmentValuationSection.tsx)
  land 분기 진입:
  ├─ 안내 카드 (amber): "토지 출자 + 취득실거래가 불명 — §166③ 토지분 비율 환산"
  ├─ 입력 ①: 취득당시 토지 기준시가 (redevLandStdPriceAtAcq) = 100,000,000
  ├─ 입력 ②: 관리처분 직전 토지 기준시가 (redevLandStdPriceAtApproval) = 150,000,000
  ├─ 경고 카드 (violet): §99①1호 시점 모호성 안내
  └─ 미리보기 카드 (useMemo):
       환산취득가: 200,000,000
       개산공제:    3,000,000
       인가전 LTHD: 13,580,000 (7년 14% — §95② 별표2 [비고] 1호)
       인가후 LTHD: 0 (별표2 [비고] 1호 — 권리 양도 LTHD 배제)

Step 2, 3: 보유 상황, 감면·공제 — 기존 흐름과 동일

계산 버튼 → 결과 화면
  DetailedStatementRedevelopmentBuilders:
    land 분기 산식 노출
  FilingFormTableRedevRows:
    redev-right-land-pay 3열 (합계 / 인가전 / 인가후)
    인가후 분 LTHD=0 rose 주석
```

### 1.2 케이스 enumerate (`feedback_ui_input_path_enumeration`)

```
출자 자산 토글
├─ housing (기본, disabled=false) → 기존 PHD/라목 입력 카드 노출 (변경 0)
└─ land (신규 활성화)
   └─ useEstimatedAcquisition 토글
      ├─ false → validate에서 "토지 실거래 취득가는 후속 PR" 메시지 차단
      └─ true  → 신규 2필드 노출
                 ├─ redevLandStdPriceAtAcq: CurrencyInput "취득당시 토지 기준시가"
                 ├─ redevLandStdPriceAtApproval: CurrencyInput "관리처분 직전 토지 기준시가"
                 ├─ §99①1호 시점 경고 카드 (violet)
                 └─ 미리보기 카드 (환산취득가 + 개산공제 + LTHD 인가전/인가후)
```

---

## 2. 14개 동기화 지점 전체 매핑 표

| # | 지점 | 파일 | 변경 내용 | 현황 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset-redev.ts` | `redevLandStdPriceAtAcq: string` + `redevLandStdPriceAtApproval: string` 2필드 추가 (기존 `redevCompletionDate` 다음) | 미존재 → 추가 필요 |
| ② | initial value | `lib/stores/calc-wizard-asset-factory.ts` (`createInitialAssetForm` 또는 해당 redev 초기화 위치) | 신규 2필드 `""` 기본값 | 미존재 → 추가 필요 |
| ③ | normalize fallback | 동일 factory (`normalizeAsset` 또는 redev normalize) | `redevLandStdPriceAtAcq: existing ?? ""` — sessionStorage 마이그레이션 호환 | 미존재 → 추가 필요 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-helpers.ts` `buildRedevelopmentPayload` (~L682) | `landStdPriceAtAcq: asset.redevLandStdPriceAtAcq ? parseAmount(...) : undefined` + `landStdPriceAtApproval: ...` 추가 (originalAssetType="land" 분기 내) | 미존재 → 추가 필요 |
| ⑤ | UI 위젯 | `components/calc/transfer/RedevelopmentBlock.tsx` | `disabled: o.value === "land"` 제거 1줄 | L168 존재 → 제거 필요 |
| ⑤ | UI 위젯 | `components/calc/transfer/RedevelopmentValuationSection.tsx` | `originalAssetType==="land"` 분기 신규 — 입력 2종 + 경고 카드 + 미리보기 | 미존재 → 추가 필요 |
| ⑥ | 사이드바 합계 | `components/calc/sidebar/*` | 변경 없음 — 사이드바 메타는 redev 분기 내 변경 없음 | 회귀 0 |
| ⑦ | 결과 카드 | `components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts` | `originalAssetType="land"` + `subject="right"` 분기 산식 빌더 추가: "권리가액 × (취득기준시가 / 관리처분 직전 기준시가)" + LTHD split 표시 | 미존재 → 추가 필요 |
| ⑦ | 결과 카드 | `components/calc/results/transfer/FilingFormTableRedevRows.ts` | ColumnMode `redev-right-land-pay` 추가 + `fillRedevRightLandPayBranchData` 신규 + 인가후 분 LTHD=0 rose 주석 | 미존재 → 추가 필요 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-redev.ts` | `originalAssetType === "land"` 분기 처리: (a) `useEstimatedAcquisition=false` 시 후속 PR 차단 메시지 (b) `useEstimatedAcquisition=true` 시 `redevLandStdPriceAtAcq > 0` + `redevLandStdPriceAtApproval > 0` 필수 검증. 현재 `originalAssetType !== "housing"` 전체 차단(L54) 제거 후 세분화 | L54 전체 차단 → 세분화 필요 |
| ⑨ | Zod enum 메인 | `lib/api/transfer-tax-schema.ts` L313 | `originalAssetType: z.enum(["land", "housing"]).optional()` — 이미 land 포함. 변경 없음 | 기존 OK |
| ⑩ | Zod enum 컴패니언 | 동일 schema (refine L359) | `subject='apt' 시 originalAssetType 필수` refine — subject="right" 미적용이므로 변경 없음 | 기존 OK |
| ⑪ | acquisitionDate fallback | `app/api/calc/transfer/route.ts` | assetKind=right_to_move_in 동일 처리 — 변경 없음 | 기존 OK |
| ⑫ | Zod 입력 객체 정의 | `lib/api/transfer-tax-schema.ts` L303~L368 (redevelopment z.object) | **`landStdPriceAtAcq: z.number().int().nonnegative().optional()`** + **`landStdPriceAtApproval: z.number().int().nonnegative().optional()`** 2 필드 추가 — 누락 시 침묵 stripping | 미존재 → 추가 필요 ★★★ |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` L614 | `...(redevPayload !== undefined ? { redevelopment: redevPayload } : {})` — redevPayload 자체에 신규 필드 포함되면 자동 spread됨. buildRedevelopmentPayload(④) 수정으로 충족 | ④ 수정으로 자동 충족 |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/transfer/route.ts` L401 | `...(data.redevelopment ? { redevelopment: { ...data.redevelopment, ... } } : {})` — spread 패턴이므로 Zod 통과 후 신규 number 필드는 자동 포함. Date 변환 불필요(number 필드) | spread 패턴으로 자동 충족 — Zod ⑫만 추가하면 됨 |

### ⑫⑬⑭ 정밀 파일·라인 위치 (5절 참조)

---

## 3. 컴포넌트 변경 명세

### 3.1 RedevelopmentBlock.tsx

**변경 위치**: L168

```diff
-   disabled: o.value === "land",
+   disabled: false,   // 사례 37: 토지 출자 활성화 (subject="right" 지원)
```

**추가 조건**: `originalAssetType==="land"` 선택 시 `RedevelopmentValuationSection`에서 `housing` 입력 섹션 자동 숨김(props 통해 전달).

**파일 크기 확인**: 현재 756줄 — 1줄 변경이므로 800줄 정책 안전.

---

### 3.2 RedevelopmentValuationSection.tsx — land 분기 신규

**현재 파일**: 263줄 (housing 전용 로직)
**변경 후 예상**: 263 + ~130줄 = ~393줄 → 800줄 정책 안전. 분할 불필요.

**컴포넌트 내부 props 수신**:

```ts
interface Props {
  asset: AssetForm;
  onChange: (partial: Partial<AssetForm>) => void;
}
```

**land 분기 활성화 조건**: `asset.redevOriginalAssetType === "land"` (또는 빈 문자열이지만 land 라디오 선택됨).

**노출 구조 (land 분기 진입 시)**:

```
① 안내 헤더 카드 (amber tone)
  제목: 토지 출자 — §166③ 비율 환산
  내용: "출자한 자산이 토지인 경우, 취득실거래가 불명 시 시행령 §166③에 따라
         '권리가액 × (취득당시 토지 기준시가 / 관리처분 직전 토지 기준시가)'로
         환산취득가를 산정합니다. (사례 37)"

② FieldCard "취득당시 토지 기준시가"
  입력: CurrencyInput → redevLandStdPriceAtAcq
  hint: "취득일 당시 토지 기준시가 총액(원). §166③ 분자.
         (㎡당 단가 + 면적 자동 곱셈은 후속 PR — 본 PR은 총액 직접 입력)"
  법조문 링크 배지: 시행령 §166③

③ FieldCard "관리처분 직전 토지 기준시가"
  입력: CurrencyInput → redevLandStdPriceAtApproval
  hint: "관리처분계획 인가일 직전 공시된 토지 기준시가(원) — §166③ 분모"
  법조문 링크 배지: 시행령 §166③

④ 경고 카드 (violet tone) — §99①1호 시점 모호성
  내용: "취득일이 공시기준일(매년 1.1) 사이에 위치할 경우, 일반적으로 직전 공시
         (예: 취득일 2007.4.9 → 2007.1.1 공시)를 적용합니다.
         양도코리아 사례 37처럼 그 이전 공시(2006.1.1: 1억원)를 사용하는 경우
         해당 값을 직접 입력하세요. (소법 §99①1호 — 자동 안분 fallback 없음)"
  tone: violet (거주·자격 tone — 시점 해석 의존)

⑤ 미리보기 카드 (useMemo — 순수 계산, store 미러링 금지)
  조건: redevLandStdPriceAtAcq > 0 && redevLandStdPriceAtApproval > 0 && rightsValue > 0
  표시:
    환산취득가:       W 원  (권리가액 × 취득당시 / 관리처분 직전)
    개산공제(§163⑥): W 원  (취득당시 기준시가 × 3%)
    인가전 양도차익 예상: W 원  (권리가액 - 환산취득가 - 개산공제)
    인가전 분 LTHD:   W 원  (보유기간 = 취득일~인가일, 별표2 표1)
    인가후 분 LTHD:   0원  ← rose 배지 "§95② 별표2 [비고] 1호 — 권리 양도 LTHD 배제"
```

**housing 분기 (기존)**: `originalAssetType !== "land"` 조건으로 기존 PHD 패턴 입력 계속 노출.

---

### 3.3 숨김 처리 명세 (land 분기 시 hiding)

`originalAssetType==="land"` 진입 시 다음 필드를 렌더링에서 제외:

**PHD 패턴 입력 7종 (housing 전용)**:
- `redevLandPricePerSqmAtAcq` (취득시 토지 ㎡당 단가)
- `redevBuildingStdPriceAtAcq` (취득시 건물 기준시가)
- `redevLandPricePerSqmAtFirst` (최초공시 당시 토지 ㎡당 단가)
- `redevBuildingStdPriceAtFirst` (최초공시 당시 건물 기준시가)
- `redevManagementDisposalHousingPrice` (관리처분 인가일 라목값 D)
- `redevAcquisitionHousingPrice` (취득당시 라목값 — 본문 미발동 시)
- `redevFirstDisclosureDate` + `redevFirstDisclosureHousingPrice` (§164⑦ 본문 트리거)

**거주월수 4종 (표2 거주분 LTHD 비대상 — subject="right")**:
- `redevPriorHouseResidenceMonths`
- `redevNewHouseResidenceMonths`
- `redevPriorResidenceStartDate` / `redevPriorResidenceEndDate`
- `redevNewResidenceStartDate` / `redevNewResidenceEndDate`

**기타 land+pay+est 분기 hidden 필드 (Critical 2 a 결정)**:
- `redevSettlementSaleDate` — receive 전용. pay 분기에서 hidden.
- `redevPreApprovalExpenses` — **본 PR 강제 0** (PDF 사례 37 정합). UI 입력 hidden + API 변환 시 0 강제 + validate에서 land+est 시 무시. 후속 PR(L-PAY-ACT 등)에서 실비 입력 노출 검토.
- `redevReceiveOnlyMode` / `redevExemptionEligibleAtApproval` — receive 전용.
- `redevIsSuccessorMember` / `redevCompletionDate` — apt 전용 (사례 48).

**land+pay+est 분기 노출 유지 필드 (High 4 — A 선택)**:
- `redevPostApprovalExpenses` — **노출 유지** (기존 housing 분기와 동일 가시성). 인가후 분 부담금·등기비·취득세 등 실비 입력 가능. PDF 사례 37은 0 입력 → anchor L37-4 검증. land+est 분기에서도 기존 housing 분기와 동일한 입력 위젯·hint·tone 사용.

주의: 표1 보유분 LTHD는 자동 산정됨. UI 결과 카드에 명시 표시 필요.

---

### 3.4 DetailedStatementRedevelopmentBuilders.ts — land 분기 산식

**현재 파일**: 534줄 — 추가 ~60줄 예상 → 594줄, 800줄 정책 안전.

**분기 진입 조건**: `r.originalAssetType === "land" && r.subject === "right"` (엔진 결과 echo 필드)

**산식 표기 규칙** (한국어 풀어쓰기, 변수 약어 금지):

```
인가전 분:
  양도가액(의제): 권리가액 300,000,000
- 환산취득가:    200,000,000
  = 권리가액 300,000,000 × (취득기준시가 100,000,000 / 관리처분 직전 기준시가 150,000,000)
- 개산공제(§163⑥): 3,000,000
  = 취득기준시가 100,000,000 × 3%
= 인가전 양도차익: 97,000,000

인가후 분:
  양도가액: 520,000,000
- 권리가액: 300,000,000
- 청산금 불입액: 100,000,000
= 인가후 양도차익: 120,000,000

LTHD:
  인가전 분: 97,000,000 × 14% (보유 7년, §95② 별표2 표1)
  인가후 분: 0 (§95② 별표2 [비고] 1호 — 관리처분 인가 전 토지/건물분에 한정)
```

**엔진 결과 echo 필드 의존**: 엔진 시니어가 `redevelopmentDetail` 서브 객체에 다음을 부착해야 함:
- `convertedAcquisition` (환산취득가)
- `estimatedDeduction` (개산공제)
- `landStdPriceAtAcq` (취득기준시가 — 산식 표시용)
- `landStdPriceAtApproval` (관리처분 직전 기준시가 — 산식 표시용)
- `preApprovalLTHD` (인가전 분 LTHD)
- `postApprovalLTHD` (인가후 분 LTHD — 항상 0)
- `lthdHoldingStartDate` (LTHD 보유기간 기산일)
- `lthdHoldingEndDate` (LTHD 보유기간 종료일)

---

### 3.5 FilingFormTableRedevRows.ts — ColumnMode 신규

**현재 파일**: 344줄 — 추가 ~80줄 예상 → ~424줄, 800줄 정책 안전.

**신규 ColumnMode**: `redev-right-land-pay`

열 구조:
```
합계 열 | 인가전 분 열 | 인가후 분 열
```

**3열 분기 활성화 조건**: `subject="right"` + `originalAssetType="land"` + `settlementDirection="pay"`

**사례 36 mirror 패턴** (`project_case_redev_right_lthd_split`):
- `redev-right-pay` ColumnMode 구조 그대로 차용
- 단, 산식 라벨만 land 전용으로 교체 (환산 방식이 다름)
- 인가후 분 LTHD=0 rose 주석: "§95② 별표2 [비고] 1호 — 관리처분 인가 전 토지·건물분에 한정"

**신규 함수**: `fillRedevRightLandPayBranchData(r, setNum, setStr, setRoseNote)`

---

## 4. 3중 패턴 명세 (`mirror-pattern`)

`feedback_useeffect_store_mirror_forbidden` + `feedback_validation_sync_8th_point` 적용.

### 4.1 `redevLandStdPriceAtAcq` / `redevLandStdPriceAtApproval`

| 레이어 | 동작 | fallback 규칙 |
|---|---|---|
| UI display | `CurrencyInput value={asset.redevLandStdPriceAtAcq}` | 빈 문자열이면 placeholder 표시 (자동 안분 금지) |
| API 변환 (④) | `asset.redevLandStdPriceAtAcq ? parseAmount(asset.redevLandStdPriceAtAcq) : undefined` | 빈 문자열 → undefined (엔진에 0 전달 금지) |
| validate (⑧) | `originalAssetType==="land" && useEstimatedAcquisition` 시 `parseAmount(redevLandStdPriceAtAcq) <= 0` 이면 에러 차단 | 자동 안분 fallback 금지 |

**useEffect → store 미러링 금지**: 미리보기 카드는 `useMemo`로 순수 계산. store write 없음.

### 4.2 `redevOriginalAssetType` fallback 3중 패턴 (기존 유지)

| 레이어 | fallback |
|---|---|
| UI | `asset.redevOriginalAssetType \|\| "housing"` (RadioCardGroup 기본값) |
| API 변환 (④) | `(asset.redevOriginalAssetType \|\| "housing") as "land" \| "housing"` — `buildRedevelopmentPayload` L709 기존 패턴 유지 |
| validate (⑧) | `const originalAssetType = asset.redevOriginalAssetType \|\| "housing"` — L28 기존 패턴 유지 |

---

## 5. ⑫⑬⑭ 파일·라인 위치 정밀 보고

### ⑫ Zod 입력 객체 정의 — `lib/api/transfer-tax-schema.ts`

- **위치**: L303~L368 (redevelopment z.object 블록)
- **현재 마지막 필드**: `priorHouseHoldingMonths: z.number().int().nonnegative().optional()` (**grep 확인: L348**)
- **추가 위치**: `.refine(...)` 직전, `priorHouseHoldingMonths` (L348) 다음 줄에 2 필드 추가

```ts
// 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
landStdPriceAtAcq: z.number().int().nonnegative().optional(),
landStdPriceAtApproval: z.number().int().nonnegative().optional(),
```

- **누락 위험**: Zod는 unknown key를 strip하므로 이 2 필드가 schema에 없으면 `buildRedevelopmentPayload`가 아무리 올바르게 빌드해도 `parsed.data.redevelopment`에서 사라짐 (침묵 stripping).

### ⑬ callTransferTaxAPI body spread — `lib/calc/transfer-tax-api.ts`

- **위치**: L614
- **현재 코드**: `...(redevPayload !== undefined ? { redevelopment: redevPayload } : {}),`
- **변경 필요 여부**: 없음. `redevPayload`는 `buildRedevelopmentPayload(primary)` 반환값이므로 ④에서 `landStdPriceAtAcq`/`landStdPriceAtApproval`를 포함하면 자동으로 spread됨.
- **단, ④ 변경 필수**: `buildRedevelopmentPayload` (~L682)에 신규 2필드 매핑 추가.

### ⑭ Route handler 엔진 input 매핑 — `app/api/calc/transfer/route.ts`

- **위치**: L401
- **현재 코드**:
  ```ts
  ...(data.redevelopment ? {
    redevelopment: {
      ...data.redevelopment,
      approvalDate: new Date(data.redevelopment.approvalDate),
      settlementSaleDate: toOptionalDate(data.redevelopment.settlementSaleDate),
      firstDisclosureDate: toOptionalDate(data.redevelopment.firstDisclosureDate),
      completionDate: toOptionalDate(data.redevelopment.completionDate)
    }
  } : {}),
  ```
- **변경 필요 여부**: 없음. `...data.redevelopment` spread 패턴으로 Zod 통과 후 `landStdPriceAtAcq`/`landStdPriceAtApproval`는 number 필드이므로 별도 Date 변환 없이 자동 포함됨.
- **필수 선행 조건**: ⑫ Zod schema에 필드 추가 완료 후라야 route까지 도달함.

---

## 6. 엔진 시니어에게 요청할 사항 (Do 단계 Step 1 위임)

다음 사항은 본 UI 디자인 문서에서 발견한 엔진 타입 불일치로, 엔진 시니어가 선처리해야 UI 작업(Step 2)이 가능합니다.

### 6.1 RedevelopmentInfo 타입 주석 수정 필요

**현재** (`lib/tax-engine/types/transfer-redevelopment.types.ts` L112~119):
```
/**
 * 출자 자산 종류 — subject="apt" 시 의미 있음.
 * subject="right" 시 무시.
 */
originalAssetType?: "land" | "housing";
```

**수정 필요**: 사례 37은 `subject="right"` + `originalAssetType="land"` 조합. 주석의 `subject="right" 시 무시` 제거 + 토지 출자 입주권 분기(사례 37) 설명 추가.

### 6.2 신규 엔진 input 필드 추가 필요

`RedevelopmentInfo`에 다음 필드 추가 (UI 폼 → 엔진 전달용):

```ts
/** §166③ 분자 — 취득당시 토지 기준시가 (원). land 출자 + 환산 시 필수. */
landStdPriceAtAcq?: number;

/** §166③ 분모 — 관리처분 직전 토지 기준시가 (원). land 출자 + 환산 시 필수. */
landStdPriceAtApproval?: number;
```

### 6.3 신규 엔진 result echo 필드 (결과 카드 표시용)

`redevelopmentDetail` 서브 객체 또는 result 별도 필드에 다음 추가 요청 (중복 제거 정정):
- `convertedAcquisition?: number` (환산취득가 — 산식 표시)
- `estimatedDeduction?: number` (개산공제 — 산식 표시)
- `landStdPriceAtAcq?: number` (분자 echo — 결과 산식 표시)
- `landStdPriceAtApproval?: number` (분모 echo — 결과 산식 표시)
- `preApprovalLTHD?: number`
- `postApprovalLTHD?: number` (항상 0 — 별표2 [비고] 1호)
- `lthdHoldingStartDate?: Date`
- `lthdHoldingEndDate?: Date`

---

## 7. validate 변경 명세 (⑧)

**현재** (`lib/calc/transfer-tax-validate-redev.ts` L54):
```ts
if (originalAssetType !== "housing") {
  return `${label}: 출자 자산은 본 PR에서 "주택 출자"만 지원합니다. (토지 출자는 후속 PR)`;
}
```

**변경 후 (세분화)**:

```ts
if (originalAssetType === "land") {
  // 토지 출자 — subject="right" + land 조합만 사례 37에서 지원
  if (subject !== "right") {
    return `${label}: 토지 출자 + 완공 APT 양도(subject="apt") 조합은 후속 PR에서 지원합니다. (사례 40~43)`;
  }
  if (!asset.useEstimatedAcquisition) {
    return `${label}: 토지 출자 + 실거래취득가 모드(환산 OFF)는 후속 PR에서 지원합니다. 취득가액 불명 시 환산취득가 토글을 ON으로 전환하세요. (L-PAY-ACT 후속)`;
  }
  // 환산 모드 — 2필드 필수
  if (parseAmount(asset.redevLandStdPriceAtAcq) <= 0) {
    return `${label}: 토지 출자 환산 모드 — 취득당시 토지 기준시가를 입력하세요. (시행령 §166③ 분자)`;
  }
  if (parseAmount(asset.redevLandStdPriceAtApproval) <= 0) {
    return `${label}: 토지 출자 환산 모드 — 관리처분 직전 토지 기준시가를 입력하세요. (시행령 §166③ 분모)`;
  }
  // land 분기 검증 통과 — housing 전용 검증(라목값 등) 건너뜀
  return null;   // ← early return (housing 전용 로직 skip)
}
if (originalAssetType !== "housing") {
  return `${label}: 출자 자산 종류가 올바르지 않습니다. (지원: housing | land)`;
}
// housing 전용 로직 계속 ...
```

**3중 패턴 동기화 확인**:
- UI: `originalAssetType==="land"` 시 PHD/라목 입력 숨김 + 신규 2필드 표시
- API(④): `originalAssetType="land"` 분기 → `landStdPriceAtAcq`/`landStdPriceAtApproval` 매핑
- validate(⑧): `originalAssetType==="land"` 시 land 전용 2필드 검증 + housing 전용 로직 early return

---

## 8. 회귀 안전망

- 기존 `redevOriginalAssetType || "housing"` fallback 유지 → housing 기본 동작 보존
- `disabled: false` 변경은 land 선택 가능성만 열어줌 — housing 선택 기본값 유지
- validate land 분기 early return 이후 housing 로직 불변 → 기존 housing 사례(44~48) 회귀 0
- FilingFormTableRedevRows.ts ColumnMode 추가는 신규 진입 시에만 → 기존 `redev-right-pay`/`redev-4split` 회귀 0
- sessionStorage 마이그레이션: normalize에서 `redevLandStdPriceAtAcq: existing ?? ""` → 기존 사용자 state 보존

---

## 9. Do 단계 시퀀셜 위임 순서

```
Step 1 (엔진 시니어):
  - lib/tax-engine/types/transfer-redevelopment.types.ts 수정
    · originalAssetType 주석 수정 (subject="right" 시 무시 → 사례 37 지원)
    · landStdPriceAtAcq / landStdPriceAtApproval 필드 추가
    · 결과 echo 필드 (convertedAcquisition / estimatedDeduction / preApprovalLTHD 등)
  - lib/tax-engine/redevelopment-land-contribution.ts 신규 (~200줄)
  - lib/tax-engine/transfer-tax.ts 라우터 분기 추가
  - lib/tax-engine/legal-codes/transfer.ts 상수 추가 (barrel — REDEVELOPMENT 객체 내 LTHD_RIGHT_TABLE1_ANNOTATION 1개만)
  - anchor 테스트 작성 + 통과 확인

Step 2 (UI 시니어 — 본 문서 실행):
  ① lib/stores/calc-wizard-asset-redev.ts — 2필드 추가
  ② initial value 추가
  ③ normalize fallback 추가
  ④ lib/calc/transfer-tax-api-helpers.ts buildRedevelopmentPayload — 2필드 매핑
  ⑤ RedevelopmentBlock.tsx — disabled 제거 1줄
  ⑤ RedevelopmentValuationSection.tsx — land 분기 섹션 추가
  ⑦ DetailedStatementRedevelopmentBuilders.ts — land 산식 빌더
  ⑦ FilingFormTableRedevRows.ts — redev-right-land-pay ColumnMode
  ⑧ transfer-tax-validate-redev.ts — land 분기 세분화
  ⑫ lib/api/transfer-tax-schema.ts — landStdPriceAt{Acq,Approval} 추가
```

---

## 10. Definition of Done 자가 점검 (UI 시니어)

- [ ] 디자인 문서 본 파일 완료 (14지점 표 + 컴포넌트 명세 + 케이스 enumerate)
- [ ] 엔진 시니어로부터 Step 1 완료 보고 수령 후 UI Step 2 시작
- [ ] ⑫ `landStdPriceAtAcq`/`landStdPriceAtApproval` Zod schema 추가 확인
- [ ] ① ~ ⑧ 전 지점 구현 완료
- [ ] validate land 분기 early return + housing 로직 불변
- [ ] `useEffect → store` 미러링 없음 — 미리보기 카드 `useMemo` 순수
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/` 통과 (L37-1~L37-10 + 회귀)
- [ ] 브라우저 수동 확인: land 선택 → 2필드 입력 → 결과 LTHD 13,580,000 + 산출세액 56,409,600
- [ ] Network 탭 request body에 `landStdPriceAtAcq: 100000000`, `landStdPriceAtApproval: 150000000` 확인
