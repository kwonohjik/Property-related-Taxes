# 사례 48 — 승계조합원 준공 후 양도 (Successor Member, Post-Completion Transfer)

> **출처**: `재개발-승계조합원.pdf` (양도코리아 사례집 책 사례 47, 페이지 574~578)
> **법령**: 소득세법 §95②·§104①, 시행령 §162①4호·§166⑤, 사전-2019-법령해석재산-0649 (2020.02.11.)
> **선행 작업**: 사례 45 (12억 안분), 사례 46 (청산금 수령 단독), 사례 47 (청산금 동시신고)
> **case 번호**: case_48 (책 번호 47 — 우리 코드 case_47은 사례 47에 이미 점유됨)

---

## 0. 사실관계

| 항목 | 값 |
|---|---|
| 원조합원 | 아버지 (관리처분계획인가일 2016.2.20., 원조합원) |
| 피상속인 사망일 | 2020.4.15. |
| 승계자 | 별도세대 아들 (갑氏) — 상속으로 입주권 승계 |
| 신축아파트 준공일(사용승인일) | 2022.12.2. |
| 양도일 | 2023.2.16. |
| 양도가액 | 920,000,000 |
| 상속세 신고시 입주권 평가액 | 450,000,000 |
| 승계 이후 추가분담금 | 150,000,000 |
| 갑氏 보유주택 | 본 아파트 외 없음 |
| 조정대상지역 | 아니오 |

**핵심 법리** (PDF 본문 정리):
1. 관리처분계획인가일 **이후** 입주권을 승계(상속·증여·매매)취득한 자 = **승계조합원**
2. 승계조합원이 취득하는 아파트의 **취득시기 = 사용검사필증 교부일(준공일)**
3. 따라서 1세대1주택 비과세·LTHD·세율의 **보유기간 기산일 = 준공일(2022.12.2.)**
4. 준공일 ~ 양도일 = 약 2개월 → 1년 미만 단기양도 70%
5. LTHD 미적용, 1세대1주택 비과세 미해당
6. 별도세대 상속이므로 §154⑧ 피상속인 보유기간 통산 **불가**

---

## 1. 양도코리아 검증 anchor

| 항목 | PDF 값 |
|---|---|
| 양도가액 | 920,000,000 |
| 취득가액 (상속 시가평가액) | 450,000,000 |
| 기타필요경비 (추가분담금) | 150,000,000 |
| 전체 양도차익 | 320,000,000 |
| 과세대상 양도차익 | 320,000,000 (비과세 0) |
| 장기보유특별공제 | 0 (1년 미만) |
| 양도소득기본공제 | 2,500,000 |
| 과세표준 | 317,500,000 |
| 세율 | 70% (1년 미만 단기) |
| 산출세액 | **222,250,000** |
| 지방소득세 (7%) | **22,225,000** |
| 합계 | **244,475,000** |

세율 자가 검증: 317,500,000 × 70% = 222,250,000 ✅

---

## 2. 현행 엔진 갭 분석 (재확인 — 2026-05-14)

### 2.1 이미 존재하는 인프라 (실측)
- `RedevelopmentInfo.isSuccessorRightToMoveIn` — **입주권 양도 시** 승계조합원 LTHD 0 처리에만 사용 (`transfer-tax-helpers.ts:464`)
- `redevelopment_apt` propertyType + `subject`(apt/right_to_move_in) 토글
- 사례 44~47 기존 분기 (원조합원 가정)
- `resolveLTHDStartDate(input: TransferTaxInput): Date` 단일 인자 시그니처 (`transfer-tax-finalize.ts:229`) — 사례 35 용도변경 분기 1건만 처리. 다필지 모드는 무시(`transfer-tax-rate-calc.ts:704`에서 `acquisitionDate` 직접 사용).
- `transfer-tax-redevelopment.ts:192` 에서 `lthdStartDate: resolveLTHDStartDate(input)` 호출 — 재개발 분기는 이미 통합됨

### 2.2 ⚠️ 결정적 갭: `completionDate` 필드 미존재
**`RedevelopmentInfo`에 `completionDate`(준공일/사용승인일) 필드가 존재하지 않는다.**
- `approvalDate` (관리처분 인가일) — 있음
- `settlementSaleDate` (청산금 수령 시 소유권이전 고시일 + 1일, 양도일 의제) — 있음. **준공일과 다른 개념.**
- `firstDisclosureDate` (개별주택가격 최초공시일) — 있음. 준공일과 다른 개념.
- **`completionDate` (준공일/사용검사필증 교부일) — 없음.** 본 PR에서 신설 필수.

→ `types/transfer-redevelopment.types.ts`에 `completionDate?: Date` 신규.
→ UI에 `redevCompletionDate: string` 폼 필드 + DateInput 신규.

### 2.3 본 사례의 분기 판정 (자동 vs 명시)
**관리처분 후 취득** 시그널:
- `acquisitionDate (2020.4.15.) > approvalDate (2016.2.20.)`

자동 판정 가능하지만 silent 분기는 위험 (`feedback_no_silent_apportion_fallback` 정책). → **명시 토글 + 자동 추정 보조 안내** 패턴.

### 2.4 LTHD/세율 기산일 정책
**원조합원** (현행): 보유기간 = 원종전부동산 취득일 ~ 양도일
**승계조합원 (본 사례)**: 보유기간 = **준공일 ~ 양도일**

근거: 사전-2019-법령해석재산-0649 + §95② 단서 + 시행령 §162①4호 (취득시기)

→ `resolveLTHDStartDate()`에 신규 분기 추가
→ ⚠️ **세율 holdingMonthsTotal**도 동일 기산일 사용 — `transfer-tax-rate-calc.ts:285-286`에서 1년/2년 미만 특례세율 판정 위치 확인 필요. 현재 `acquisitionDate` 직접 참조 가능성 → `getEffectiveAcquisitionDate(input)` 헬퍼로 통합 필수.

---

## 3. 데이터 모델 (14 동기화 지점) — 재설계

### 3.0 필드 최소화 결정 (개선)
당초 4필드(`completionDate`, `isSuccessorMember`, `successionDate`, `successionCause`) → **2필드로 축소**:
- ❌ `successionDate` 제거 — `asset.acquisitionDate`와 동일 (상속개시일=취득일). 중복 필드 금지.
- ❌ `successionCause` 제거 — `asset.acquisitionCause`로 이미 표현 가능 (현행 자산 폼에 `inheritance`/`gift`/`purchase` 입력 경로 존재). 중복 금지.
- ✅ `completionDate` 신규 (준공일 — 기산 핵심)
- ✅ `isSuccessorMember` 신규 (명시 토글 — silent 자동 분기 금지)

### ① TransferTaxInput / RedevelopmentInfo 신규 필드

```ts
// lib/tax-engine/types/transfer-redevelopment.types.ts
interface RedevelopmentInfo {
  // ... 기존 필드
  /** 신축APT 사용검사필증 교부일(준공일). 승계조합원 LTHD/세율 기산일.
   *  시행령 §162①4호. 사전-2019-법령해석재산-0649. */
  completionDate?: Date;
  /** 승계조합원 여부 — 관리처분 후 입주권을 상속·증여·매매로 승계취득.
   *  true 시 LTHD/세율 기산일 = completionDate. */
  isSuccessorMember?: boolean;
}
```

### ② FormData (AssetForm) 신규 필드

```ts
redevCompletionDate: string;            // YYYY-MM-DD
redevIsSuccessorMember: "yes" | "no";   // 기본 "no"
```

### ③ initial / normalize
- `redevCompletionDate: ""`, `redevIsSuccessorMember: "no"`
- normalize: trim. boolean 변환 없음 (yes/no enum 유지)

### ④ API 변환 (`lib/calc/transfer-tax-api.ts`)
```ts
completionDate: asset.redevCompletionDate || undefined,  // ISO string
isSuccessorMember: asset.redevIsSuccessorMember === "yes",
```

### ⑤ UI 위젯 (`RedevelopmentBlock.tsx`)
- 신규 ToggleCard "조합원 구분" (rose tone): `원조합원` / `승계조합원`
- 승계조합원 ON 시:
  - `DateInput` 준공일 (`redevCompletionDate`)
  - 안내 카드(violet): 사전-2019-법령해석재산-0649 인용
  - **자동 추정 힌트** (조건부 노출): `acquisitionDate > approvalDate` 이면 "관리처분일 이후 취득이 감지되었습니다. 승계조합원 모드 사용을 권장합니다." (silent 자동 적용 금지 — 안내만)

### ⑥ 사이드바 합계
- 승계조합원 ON: 자산 메타 라벨 `재개발 신축APT (승계조합원, 준공일 기산)` 표기

### ⑦ 결과 카드 (`RedevelopmentDetailCard`)
- 분기 시 보유기간 산식: `양도일 - 준공일 = N개월`
- LTHD 산식: `LTHD = 0 (보유 1년 미만, 준공일 2022.12.2. 기산)`
- 세율 산식: `70% × 과세표준 (1년 미만, 준공일 기산)`
- 신규 라벨 상수: `BRANCH_LABEL_SUCCESSOR_MEMBER`

### ⑧ Validation (`lib/calc/transfer-tax-validate-redev.ts`)
- 차단 해제(현재 `라인 51-54`):
  ```ts
  // 변경 전: 무조건 차단
  if (acquisitionDate < approvalDate) return "후속 PR";

  // 변경 후: 승계조합원이 아닐 때만 차단
  const isSuccessor = asset.redevIsSuccessorMember === "yes";
  if (!isSuccessor && acquisitionDate < approvalDate) {
    return `${label}: 인가일은 취득일 이후여야 합니다. 승계조합원이면 "승계조합원 모드"를 ON 하세요.`;
  }
  ```
- 승계 모드 ON 시 신규 검증:
  - `redevCompletionDate` 필수
  - `completionDate ≥ approvalDate` (준공일 < 인가일 비정상)
  - `completionDate ≤ transferDate` (준공일 > 양도일 비정상)
  - `acquisitionDate ≥ approvalDate` (관리처분 후 승계 — 정상 케이스)
  - subject === "apt" only (subject === "right_to_move_in"은 기존 `isSuccessorRightToMoveIn` 경로)
  - settlementDirection === "none" only (청산금 동시는 후속 PR — 48-D/E)
  - `useEstimatedAcquisition === false` only (승계 시 상속 평가액·증여 평가액·매매가가 곧 취득가액 — 환산 불필요. 후속 PR로 분리)

### ⑨⑩ Zod enum 동기화
- `redevIsSuccessorMember`: enum `["yes", "no"]` 추가 (메인 + 컴패니언 schema)
- `redevCompletionDate`: ISO date string 검증 (기존 `redevApprovalDate` 패턴 차용)

### ⑪ acquisitionDate fallback
- 승계 모드라도 자산 `acquisitionDate` 이미 입력됨 (상속개시일). fallback 불필요.

### ⑫ Zod 입력 객체 정의 (RedevelopmentInfo schema)
- `completionDate`: optional ISO date
- `isSuccessorMember`: optional boolean

### ⑬ `callTransferTaxAPI` body spread
- 명시 spread 확인 (자동 spread 시 누락 가능 — `feedback_api_zod_schema_sync` 정책)

### ⑭ Route handler 엔진 매핑
- `coerceDates(redev, [..., "completionDate"])` 추가
- `transfer-tax-redevelopment.ts` input 파라미터에 `completionDate`·`isSuccessorMember` 전달

---

## 4. 엔진 구현 핵심

### 4.1 validate 차단 해제

`lib/calc/transfer-tax-validate-redev.ts:51-54`
```ts
// 변경 전 (차단):
if (acquisitionDate < approvalDate) {
  return `${label}: 인가일은 취득일 이후여야 합니다. (승계조합원 인가 후 취득은 후속 지원 예정)`;
}

// 변경 후 (분기):
const isSuccessor = asset.redevIsSuccessorMember === "yes";
if (!isSuccessor && acquisitionDate < approvalDate) {
  return `${label}: 인가일은 취득일 이후여야 합니다. 승계조합원이면 "승계조합원 모드"를 ON 하세요.`;
}
if (isSuccessor) {
  if (!asset.redevSuccessionDate) return `${label}: 승계 취득일은 필수입니다.`;
  const succDate = new Date(asset.redevSuccessionDate);
  if (succDate < approvalDate) {
    return `${label}: 승계 취득일은 관리처분계획인가일 이후여야 합니다. (관리처분 전 취득은 원조합원)`;
  }
  // subject="apt" 만 본 PR 지원 (입주권 승계 양도는 기존 isSuccessorRightToMoveIn 경로)
  if (asset.redevSubject !== "apt") {
    return `${label}: 승계조합원 + 입주권 양도는 별도 경로(입주권 단독 양도)로 신고하세요.`;
  }
  // 청산금 동시신고 + 승계조합원은 후속 PR
  if (asset.redevReceiveOnlyMode === "yes" || /* settlement direction 동시 */ false) {
    return `${label}: 승계조합원 + 청산금 동시신고는 후속 PR.`;
  }
}
```

### 4.2 보유기간 기산일 분기 (`resolveLTHDStartDate` — 단일 인자)

`lib/tax-engine/transfer-tax-finalize.ts:229` (실제 시그니처 확인 완료)
```ts
export function resolveLTHDStartDate(input: TransferTaxInput): Date {
  // 사례 48 — 승계조합원 + 신축APT 양도 (신규, 사례 35보다 먼저 평가)
  if (
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate
  ) {
    return input.redevelopment.completionDate;
  }

  // 사례 35 — 주택→상가 용도변경 (기존)
  if (!input.houseToCommercialConversion) return input.acquisitionDate;
  if (!input.wasMultiHouseAtConversion) return input.acquisitionDate;
  return input.conversionDate ?? input.acquisitionDate;
}
```

### 4.2.1 ⚠️ 세율 holdingMonthsTotal도 같은 기산일 사용

`transfer-tax-rate-calc.ts:285-286`에서 `holdingMonthsTotal < 12` 단기세율 분기. **현재 `acquisitionDate` 직접 사용 가능성** → 그대로면 본 사례 70% 미적용 위험.

→ `getEffectiveAcquisitionDate(input)` 통합 헬퍼 도입:
```ts
// transfer-tax-finalize.ts (신규)
export function getEffectiveAcquisitionDate(input: TransferTaxInput): Date {
  return resolveLTHDStartDate(input);  // LTHD·세율 모두 동일 기산
}
```
세율 계산 진입 시 `input.acquisitionDate` 대신 본 헬퍼 사용. Do 단계 진입 전 `transfer-tax-redevelopment.ts:resolveHoldingPeriod` 등 보유기간 산정 호출지 grep 검증 필수.

### 4.3 1세대1주택 비과세 판정

- 승계조합원 모드: 보유기간 = 양도일 − 준공일 < 2년 → §155 비과세 미해당 자동
- §154⑧ (피상속인 보유기간 통산): **별도세대** 상속이므로 통산 배제 (현행 로직 그대로 — `inheritance.sameHouseholdAtInheritance=false`)

### 4.4 취득가액 처리

승계조합원의 신축APT 취득가액 구성:
1. **상속 시가평가액 450,000,000** = 입주권 승계 취득가
2. **추가분담금 150,000,000** = 승계 이후 납부분 → 양도코리아는 "기타필요경비"로 계상

→ 본 사례에서는 단순히:
- `acquisitionPrice` 입력란: 450,000,000 (상속 평가액)
- `expenses` 입력란: 150,000,000 (추가분담금)
- 별도 청산금 로직 미사용 (준공 후 양도이므로 settlement 없음)

**결정**: 추가분담금은 기존 `expenses` 필드 재사용 (UI 라벨만 "추가분담금" 분기 표시). 별도 필드 신설 X.

### 4.5 세율

`acquisitionDate` (원: 2020.4.15.) 대신 `lthdStartDate`(준공일 2022.12.2.) 기준으로 1년 미만 70% 단기세율 적용 → `transfer-tax-rate-calc.ts`의 holding period 계산도 `lthdStartDate` 사용 확인 필요. 현재 코드는 `acquisitionDate` 직접 사용일 가능성 있으므로 **`getEffectiveAcquisitionDate(input)` 헬퍼**로 통합.

---

## 5. UI 변경

### 5.1 `RedevelopmentBlock.tsx`
- 신규 ToggleCard (rose tone, §⑧ 신규 섹션): "조합원 구분 — 원조합원 / 승계조합원"
- ON 시 추가 입력:
  - `DateInput` 승계 취득일
  - `RadioCardGroup` 승계 취득원인 (상속·증여·매매)
  - 안내 카드 (violet): "관리처분계획인가일 이후 입주권을 승계받은 경우. 신축APT 보유기간은 준공일부터 기산됩니다. (사전-2019-법령해석재산-0649)"

### 5.2 결과 카드 (`RedevelopmentDetailCard`)
- 승계조합원 분기 시:
  - "보유기간 기산일: 준공일 2022.12.2." 명시
  - "양도일까지: 약 2개월 → 1년 미만 70% 적용"
- 산식 라벨에 `BRANCH_LABEL_SUCCESSOR_MEMBER` 추가

### 5.3 사이드바
- 자산 메타: "재개발 신축APT (승계조합원, 준공일 기산)"

---

## 6. 케이스 매트릭스 (Plan→Design 강제 표)

| ID | subject | isSuccessor | direction | receiveOnly | 결과 |
|---|---|---|---|---|---|
| **48-A** (본 PDF) | apt | yes | none | no | 본 사례 — 준공일 기산, 1년 미만 70% |
| 48-B | apt | yes | none | no | 준공 후 1년 이상 2년 미만 (60%) — 회귀 anchor |
| 48-C | apt | yes | none | no | 준공 후 2년 이상 (기본세율, LTHD 적용) — 회귀 anchor |
| 48-D | apt | yes | pay | no | 승계조합원 + 청산금 납부 → **후속 PR** (validate 차단) |
| 48-E | apt | yes | receive | yes | 승계조합원 + 청산금 수령 단독 → **후속 PR** (validate 차단) |
| 48-F | right_to_move_in | yes | n/a | n/a | 입주권 자체 양도 (기존 `isSuccessorRightToMoveIn` 경로 — 본 PR 미변경) |
| 48-G | apt | no | none | no | 원조합원 — 기존 사례 44 회귀 보호 |
| 48-H | apt | yes | none | no | 1세대1주택 비과세 12억 초과 (사례 45) — **후속 PR** (별도 PR) |
| 48-I | apt | yes | none | no | 다주택 중과 — **후속 PR** |

본 PR 범위: **48-A, 48-B, 48-C, 48-G** (정상 분기 + 회귀). 나머지 D~I는 validate 차단 + 별도 PR.

---

## 7. anchor 작성

`__tests__/tax-engine/transfer/redevelopment/case-48-successor-member.test.ts`

```ts
describe("사례 48 — 승계조합원 준공 후 양도", () => {
  const baseInput = {
    propertyType: "redevelopment_apt",
    transferPrice: 920_000_000,
    acquisitionPrice: 450_000_000,
    expenses: 150_000_000,
    acquisitionDate: new Date("2020-04-15"),
    transferDate: new Date("2023-02-16"),
    redevelopment: {
      subject: "apt",
      approvalDate: new Date("2016-02-20"),
      completionDate: new Date("2022-12-02"),
      isSuccessorMember: true,
      successionDate: new Date("2020-04-15"),
      successionCause: "inheritance",
      settlementDirection: "none",
    },
    inheritance: { sameHouseholdAtInheritance: false },
    // ... 1세대1주택 미해당
  };

  it("48-A: 양도차익 320,000,000", () => {
    expect(result.totalGain).toBe(320_000_000);
  });
  it("48-A: LTHD 0 (1년 미만)", () => {
    expect(result.longTermHoldingDeduction).toBe(0);
  });
  it("48-A: 과세표준 317,500,000", () => {
    expect(result.taxBase).toBe(317_500_000);
  });
  it("48-A: 세율 70%", () => {
    expect(result.taxRate).toBe(0.7);
  });
  it("48-A: 산출세액 222,250,000", () => {
    expect(result.calculatedTax).toBe(222_250_000);
  });
  it("48-A: 지방소득세 22,225,000", () => {
    expect(result.localIncomeTax).toBe(22_225_000);
  });
  it("48-A: 보유기간 기산일 = 준공일", () => {
    expect(result.lthdStartDate).toEqual(new Date("2022-12-02"));
  });
});

describe("48-B/C: 회귀 anchor", () => {
  // 준공 후 1~2년: 60%
  // 준공 후 2년 이상: 기본세율 + LTHD 적용
});

describe("48-G: 원조합원 회귀", () => {
  // 사례 44 동일 결과 보존
});
```

**Pre-Do anchor** (메모리 정책 `feedback_pre_anchor_verification` 준수):
- 48-A 산출세액 222,250,000 anchor 우선 작성 → 실패 확인 → 분기 구현 → 통과 → 디자인 환류

---

## 8. PDCA 단계별 작업

### Plan (현 단계)
- [x] PDF 분석
- [x] 갭 분석 (validate 차단 위치 식별)
- [x] 케이스 매트릭스 작성
- [x] anchor 목표값 확정

### Design (다음)
- [ ] `docs/02-design/features/case-48-successor-member.engine.design.md` (template 복사)
- [ ] 케이스 인벤토리 표 9건 enumerate
- [ ] 14 동기화 지점 체크리스트
- [ ] cross-cutting anchor (사례 44/45 회귀)

### Do
- [ ] anchor 우선 작성 (실패 확인)
- [ ] 엔진: RedevelopmentInfo 3필드 추가
- [ ] 엔진: `resolveLTHDStartDate` 분기
- [ ] 엔진: `getEffectiveAcquisitionDate` 헬퍼 통합
- [ ] validate: 차단 해제 + 신규 검증
- [ ] UI: ToggleCard + DateInput + RadioCardGroup
- [ ] 14 동기화 지점 (⑨⑩⑪⑫⑬⑭ 자가 grep)
- [ ] anchor 통과 확인

### Check
- [ ] `ui-engine-sync-checker` 실행
- [ ] `tax-qa-lead` 실행
- [ ] 브라우저 수동 확인 (Network 탭 신규 필드 확인)
- [ ] 사례 44/45/46/47 회귀 0건

### Act
- [ ] 메모리 등재 (`project_case_48_redev_successor_member.md`)
- [ ] MEMORY.md 인덱스 추가
- [ ] 후속 PR 표 등재 (48-D/E 청산금 + 48-H 12억 + 48-I 중과)

---

## 9. 리스크 & 후속

### 본 PR 명시 제외
- **48-D, 48-E**: 승계조합원 + 청산금 동시신고 (validate 차단 + 후속 PR)
- **48-F**: 입주권 자체 양도 시 승계조합원은 기존 `isSuccessorRightToMoveIn` 경로 사용 — 본 PR 미변경
- **48-H**: 승계조합원 + 12억 초과 (사례 45 + 48 cross-cutting)
- **48-I**: 승계조합원 + 다주택 중과

### 모법 인용 검증 (KoreanLaw MCP 권장)
- 소득세법 §95② 단서
- 시행령 §162①4호 (취득시기)
- 시행령 §166⑤
- 사전-2019-법령해석재산-0649 (2020.02.11.)
- 본문 문구 정확 인용 확인 (모법 §·항·호 표기)

### 파일 크기 점검
- `transfer-tax-validate-redev.ts` 현재 ~80줄 → +20줄 여유 충분
- `redevelopment.ts` 분기 추가 시 800줄 초과 여부 사전 측정
- `RedevelopmentBlock.tsx` 분기 추가 시 800줄 초과 여부 사전 측정

---

## 10. 예상 변경 파일 (재산정)

| 파일 | 변경 | 줄수 추정 |
|---|---|---|
| `lib/tax-engine/types/transfer-redevelopment.types.ts` | RedevelopmentInfo 2필드(`completionDate`/`isSuccessorMember`) | +10 |
| `lib/tax-engine/redevelopment.ts` | spread/passthrough 2필드 | +6 |
| `lib/tax-engine/transfer-tax-finalize.ts` | resolveLTHDStartDate 분기 + getEffectiveAcquisitionDate 신규 | +20 |
| `lib/tax-engine/transfer-tax-redevelopment.ts` | 승계조합원 분기 LTHD/세율 통합 헬퍼 적용 | +15 |
| `lib/tax-engine/transfer-tax-rate-calc.ts` | 단기세율 분기에 getEffectiveAcquisitionDate 적용 | +10 |
| `lib/stores/calc-wizard-store.ts` (또는 types) | AssetForm 2필드 추가 + initial | +6 |
| `lib/calc/transfer-tax-api.ts` | API 변환 2필드 | +8 |
| `lib/calc/transfer-tax-validate-redev.ts` | 차단 해제 + 승계 모드 검증 5건 | +35 |
| `app/api/calc/transfer/route.ts` | Zod RedevelopmentInfo 2필드 + coerceDates 1필드 + body spread | +12 |
| `components/calc/transfer/RedevelopmentBlock.tsx` | ToggleCard + DateInput + 안내 카드 + 자동 추정 힌트 | +90 |
| `components/calc/transfer/result/RedevelopmentDetailCard.tsx` | 승계 분기 라벨 + 산식 | +25 |
| `components/calc/transfer/Sidebar*.tsx` | 자산 메타 라벨 | +5 |
| `__tests__/tax-engine/transfer/redevelopment/case-48-successor-member.test.ts` | 신규 anchor 22건 | +250 |
| **합계** | | **~492줄** |

⚠️ `transfer-tax-redevelopment.ts` 현재 줄수 측정 → +15줄 후 800줄 정책 여유 확인 필수 (Pre-Do 0번 단계).

---

## 11. 결정 사항 (Plan 종결 — 2026-05-14 재확인)

1. **case 번호**: case_48 (책 사례 47 — 코드 case_47은 이미 사례 47에 점유됨)
2. **본 PR 범위**: 48-A(본 PDF) + 48-B/C(회귀) + 48-G(원조합원 회귀). 청산금·12억·중과 cross-cutting 제외.
3. **anchor 패턴**: 산출세액 222,250,000 / 지방세 22,225,000 toBe (양도연도 세율표 자가 검증 — 외부 산출값 추종 금지, 메모리 정책 `feedback_transfer_year_tax_rate`)
4. **추가분담금 처리**: 기존 `expenses` 필드 재사용. 별도 필드 신설 X. UI 라벨만 분기.
5. **신규 필드**: `completionDate` / `isSuccessorMember` **2종** (4종에서 축소 — `acquisitionDate`·`acquisitionCause` 재사용으로 중복 회피)
6. **기산일 헬퍼**: `getEffectiveAcquisitionDate(input)` 도입으로 **LTHD + 세율 보유기간** 모두 동일 기산. 세율 계산 진입지 grep 검증 필수.
7. **자동 분기 금지**: `acquisitionDate > approvalDate` 자동 추정은 안내 힌트로만 노출. 실제 분기 활성은 `isSuccessorMember=yes` 명시 토글로만 (`feedback_no_silent_apportion_fallback` 정책).

## 12. Pre-Do 검증 체크리스트 (정책 `feedback_pre_anchor_verification`)

Do 진입 전 다음을 순서대로 수행:

1. [ ] anchor 48-A 산출세액 222,250,000 toBe 1건만 우선 작성 → 실행 → 실패 메시지 확보
2. [ ] 실패 메시지가 "현재 acquisitionDate 기산으로 LTHD 적용/세율 기본세율 적용"이어야 함 → 디자인 환류 확인
3. [ ] `transfer-tax-redevelopment.ts:160-200` 보유기간 산정 위치 정확히 식별 (`holdingMonths` / `holdingYears` 변수 추적)
4. [ ] `transfer-tax-rate-calc.ts:280-290` 단기세율 분기 입력 변수 확인 (`acquisitionDate` 직접 참조 vs `lthdStartDate` 참조)
5. [ ] 통합 헬퍼 `getEffectiveAcquisitionDate` 적용 범위 확정 (LTHD만 / LTHD+세율 모두)
6. [ ] 1세대1주택 비과세 판정 함수(`one-house-tax` 모듈)의 보유기간 기산 — 별도세대 상속이므로 본 사례에서는 § 154⑧ 미적용으로 비과세 자동 미해당. 검증 anchor 1건 추가 (`exemption.applied === false`).

---

## 12.5 Pre-Do 실행 결과 (2026-05-14) — ★ 추가 갭 발견

anchor `case-48-successor-member.test.ts` 작성 → vitest 실행 → 8 tests 중 5 fail / 3 pass.

| anchor | 기대 | 실제 | 진단 |
|---|---|---|---|
| 양도차익 | 320,000,000 | **470,000,000** | **+150M expenses 미차감** ★ |
| 과세표준 | 317,500,000 | 467,500,000 | 누적 |
| 산출세액 | 222,250,000 | **161,060,000** | `467.5M × 40% − 25,940,000` = 기본세율 누진 + expenses 누락 |
| 지방세 | 22,225,000 | 16,106,000 | 누적 |
| 세액합계 | 244,475,000 | 177,166,000 | 누적 |
| LTHD = 0 | ✅ PASS | — | 보유 < 3년 우연 일치 (acquisitionDate 기산 시 2.8년) |
| 비과세 미해당 | ✅ PASS | — | 보유 < 2년 정상 |

### ⚠️ 결정적 추가 갭 (계획서 초안 누락)

**계획서 결정 #4 정정**: "추가분담금 처리: 기존 `expenses` 필드 재사용" → **`expenses`는 redevelopment 분기에서 차감되지 않음**. `redevelopment.ts`는 `preApprovalExpenses`/`postApprovalExpenses`만 사용.

PDF 양도코리아 양도소득금액 계산명세서 재해석:
- 자산종류 = **"일반주택(3)"** (재개발 안분 표시 아님)
- "기타 필요경비 150,000,000" — 단순 expenses 차감
- 920M − 450M − 150M = 320M (단순 산식, 인가전/인가후 안분 없음)

**→ 핵심 통찰**: 승계조합원 + 신축APT 양도는 **재개발 인가전/인가후 안분 산식을 거치지 않는 별도 경로**. 양도코리아도 단순 housing 양도처럼 처리.

### 디자인 환류 — 분기 처리 옵션

| 옵션 | 처리 | 장점 | 단점 |
|---|---|---|---|
| **A. Bypass** | `isSuccessorMember=true` 시 redevelopment 안분 우회 → housing 경로 (`expenses` 차감 + 보유기간만 준공일 기산) | PDF 산식 정확 일치, 변경 최소 | propertyType="redevelopment_apt"인데 분기 우회 — 모순 가능성 |
| **B. 안분 단순화** | redevelopment 분기 내에서 `isSuccessorMember=true` 시 단일 산식(인가전·인가후 합산 0, 단순 차감)로 강제 | 분기 일관성 유지 | redevelopment.ts에 추가 분기 — 복잡도 증가 |
| **C. 권장: 양도코리아 동치** | redevelopment 진입 자체를 막지 않되, runRedevelopment 내부에서 `isSuccessorMember=true` 진입 시 `preApprovalGain=0` + `postApprovalGain=transferPrice − rightsValue − postApprovalExpenses` 단일 산식 | UI 메뉴는 재개발 유지(사용자 경험), 산식은 PDF 일치 | 청산금 cross-cutting 후속 분기 인터페이스 명확화 필요 |

→ **옵션 C 채택**. UI 메뉴 = 재개발/재건축, 엔진 산식 = 단일 차감(PDF 양도코리아 정합).
   - `rightsValue` 입력 = 상속 시가평가액 (450M)
   - `postApprovalExpenses` 입력 = 추가분담금 (150M)
   - `preApprovalExpenses` = 0 (강제)
   - 양도차익 = transferPrice − rightsValue − postApprovalExpenses (단순)
   - LTHD 기산일 = completionDate (이전 결정 유지)
   - 세율 holdingMonths 기산일 = completionDate (이전 결정 유지)

### 추가분담금 입력 매핑 정정

| 위치 | 정정 전 (계획서 초안) | 정정 후 (Pre-Do 환류) |
|---|---|---|
| AssetForm | `expenses` | `redevSettlementAmount=0` + `redevPostApprovalExpenses=150,000,000` (또는 추가분담금 전용 필드) |
| RedevelopmentInfo | `postApprovalExpenses` (기존) | `postApprovalExpenses` 그대로 — 신규 필드 X |
| UI 라벨 | "기타 필요경비" | "승계 이후 추가분담금" (분기 라벨 변경) |

### 신규 anchor 1건 추가 권장

```ts
it("redevelopmentDetail.preApproval.gain = 0 (승계조합원 분기는 안분 우회)", () => {
  expect(result.redevelopmentDetail?.preApproval.gain).toBe(0);
});
it("redevelopmentDetail.postApproval.gain = 320,000,000 (단순 차감)", () => {
  expect(result.redevelopmentDetail?.postApproval.gain).toBe(320_000_000);
});
```

### Pre-Do 가치 입증

본 anchor 우선 작성으로 **계획서 결정 #4(expenses 재사용) 오류**를 Do 진입 **이전에** 발견. 만약 Pre-Do 없이 Do 진입했다면:
1. 신규 필드 2종 추가 + UI 작업 완료 후 anchor 실행 → 양도차익 470M 발견
2. expenses 미차감 원인 추적 → redevelopment 분기 구조 재학습
3. 디자인 환류 + Do 일부 롤백
→ **메모리 정책 `feedback_pre_anchor_verification` 효용 재확인** (예상 절약 ~30분).

---

## 13. 정정 이력 (Self-Audit 2026-05-14)

본 계획서 초안 → 1차 재검토에서 발견·정정한 오류·개선:

| # | 분류 | 초안 | 정정 | 근거 |
|---|---|---|---|---|
| 1 | **오류** | `completionDate` 이미 존재 가정 | 신규 추가 필요 — `RedevelopmentInfo`에 없음 | grep `completionDate` 0건 (types/transfer-redevelopment.types.ts) |
| 2 | **오류** | `resolveLTHDStartDate(input, ...)` 가변 인자 | 단일 인자 `(input)` — 시그니처 일치 | `transfer-tax-finalize.ts:229` 실측 |
| 3 | **오류** | 세율 분기 미고려 (LTHD만 변경) | 세율 holdingMonthsTotal도 동일 기산 — 통합 헬퍼 도입 | `transfer-tax-rate-calc.ts:285-286` 단기세율 분기 |
| 4 | **개선** | 4신규 필드 (`isSuccessorMember`/`successionDate`/`successionCause`/`completionDate`) | 2필드로 축소 (succession* 제거 — `acquisitionDate`/`acquisitionCause` 재사용) | DRY · 중복 필드 정책 |
| 5 | **개선** | 자동 추정 분기 가능 표현 | 명시 토글만 — 자동은 안내 힌트로만 | `feedback_no_silent_apportion_fallback` |
| 6 | **개선** | `settlementSaleDate`와 `completionDate` 혼동 가능성 | 명시 구분 — settlementSaleDate=소유권이전 고시일+1(청산금 양도일), completionDate=사용검사필증 교부일(준공일) | `redevelopment.ts:198` |
| 7 | **개선** | Pre-Do anchor 단순 권고 | Pre-Do 6단계 체크리스트 명시 | `feedback_pre_anchor_verification` |
| 8 | **개선** | 1세대1주택 비과세 anchor 누락 | 비과세 자동 미해당 anchor 1건 추가 | §154⑧ 별도세대 통산 배제 |
| 9 | **개선** | 환산 모드 사용 가능 표현 | 승계 모드 + 환산은 후속 PR로 명시 차단 | 상속 평가액 = 취득가액 직접 입력이 정상 경로 |
| 10 | **★ 오류 (Pre-Do 발견)** | 추가분담금 = `expenses` 필드 재사용 | redevelopment 분기는 `expenses` 미차감. `postApprovalExpenses` 사용 필수 | Pre-Do 실행: 양도차익 470M (150M 누락) |
| 11 | **★ 오류 (Pre-Do 발견)** | redevelopment 인가전/인가후 안분 산식 통과 가정 | 승계조합원 + 신축APT는 안분 우회 단순 산식 (옵션 C) | PDF 자산종류 "일반주택(3)" 표기 |

---

**다음 액션**: 사용자 승인 후 Design 단계 진입 (`docs/02-design/features/case-48-successor-member.engine.design.md` 작성). 그 전 Pre-Do 6단계 체크리스트 1~2번(anchor 우선 실패 확인)을 먼저 수행 권장.

---

**다음 액션**: 사용자 승인 후 Design 단계 진입 (`docs/02-design/features/case-48-successor-member.engine.design.md` 작성)
