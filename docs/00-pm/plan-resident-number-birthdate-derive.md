# 계획서 — 상속인 주민등록번호 필수화 + 생년월일·성별 자동 도출

> 작성일: 2026-06-08 · 대상: 상속세 상속인/수유자 입력 카드 (`HeirComposition.tsx`)
> 요청: 주민번호 입력을 필수로, 주민번호 앞부분에서 생년월일을 도출해 미성년자 판정에 사용, 중복인 생년월일 입력 필드 삭제

---

## 1. 배경 (요청 요약)

이미지(2. 자녀 카드)에서:
- **주민등록번호 (선택)** → **(필수)** 로 변경
- **생년월일 (미성년자 여부 판별용)** 별도 DateInput → 주민번호와 중복이므로 **삭제**
- 미성년자 여부는 주민번호 앞 6자리(YYMMDD) 기준으로 자동 판정

---

## 2. 현황 실측 (코드 기준, 추정 아님)

### 2.1 Heir 타입 (`lib/tax-engine/types/inheritance-gift.types.ts:672~720`)
```
name?: string
residentNumber?: string   // 현재 선택, 신고서 인적사항 칸 채우기용
birthDate?: string        // 현재 선택, 자동 미성년 판정용
isDisabled?: boolean
gender?: "male" | "female" // 장애인 공제 기대여명 산정용
isMinorOverride?: boolean  // 3-state 수동 override
```

### 2.2 `birthDate`가 실제로 쓰이는 곳 — **미성년 판정만이 아님**
| 용도 | 위치 | 법령 |
|---|---|---|
| 미성년자 공제 (19세 미만) | `personal-deduction-calc.ts:132`, `resolveMinorBeneficiary` (`inheritance-gift-common.ts:474`) | §20①2호 |
| **연로자 공제 (65세 이상)** | `personal-deduction-calc.ts:191~194` | §20①3호 |
| **장애인 공제 (나이 → 기대여명)** | `personal-deduction-calc.ts` (gender + age) | §20①4호 |
| 세대생략 미성년 40% 할증 | `inheritance-gift-common.ts` | §27 |
| 사전증여 미성년 fallback | `prior-gift/MinorAtGiftToggleBlock.tsx` | §53 |
| 동거가족·가업·동거주택 | 각 섹션 | §20·§23의2 등 |

→ 즉 birthDate는 미성년뿐 아니라 **만 나이 전반(연로자·장애인 기대여명)** 의 단일 입력원. 단순 삭제가 아니라 "도출원을 주민번호로 교체"가 본질.

### 2.3 핵심 인사이트 — 주민번호로 birthDate **+ gender** 동시 도출 가능
주민번호 7번째 자리(성별·세기 코드)로 **출생연도 세기 + 성별**까지 결정된다:

| 7번째 자리 | 세기 | 성별 |
|---|---|---|
| 1, 2 | 1900년대 | 남 / 여 |
| 3, 4 | 2000년대 | 남 / 여 |
| 5, 6 | 1900년대 (외국인) | 남 / 여 |
| 7, 8 | 2000년대 (외국인) | 남 / 여 |
| 9, 0 | 1800년대 | 남 / 여 |

→ 주민번호 하나로 `birthDate`(YYYY-MM-DD) **와** `gender` 둘 다 채울 수 있음.
   현재 "장애인 성별" 별도 라디오(`HeirComposition.tsx:354~373`)도 **중복 제거 가능**(부가 효과).

### 2.4 현재 검증 (`lib/calc/inheritance-validate.ts`)
- `residentNumber`·`birthDate` 자체에 대한 필수/형식 검증 **없음** (둘 다 선택)
- `isDisabled === true && !gender` 일 때만 차단 (`:345`)

---

## 3. 제안 변경안 (요청대로 구현 시)

### A. 주민번호 파싱 유틸 신규 — `lib/tax-engine/resident-number.ts` (또는 `lib/calc/`)
```ts
// 순수 함수, 단일 출처
parseResidentNumber(rrn: string): {
  birthDate: string;          // "YYYY-MM-DD"
  gender: "male" | "female";
  valid: boolean;
} | null
```
- 하이픈·공백 제거 후 13자리 검증
- 앞 6자리 → YYMMDD, 7번째 → 세기·성별
- **월(01–12)·일 유효성·미래일자 차단** (잘못된 생년월일 방어)

### B. UI (`HeirComposition.tsx`)
1. 주민번호 라벨 `(선택)` → `(필수)`, 형식 검증 메시지
2. 주민번호 onChange → `parseResidentNumber` → `birthDate`·`gender` 동시 set (단일 진실)
3. **생년월일 DateInput 블록 삭제** (`:248~258` 부근)
4. 장애인 성별 라디오: 주민번호에서 자동 채워지면 **읽기전용 표시**(또는 제거)
5. 미성년 자동판정(`autoIsMinor`)은 그대로 — 입력원만 birthDate(주민번호 도출)로 유지

### C. 검증 (`inheritance-validate.ts`)
- 자연인 관계(spouse/child/lineal_ascendant/sibling/other/legatee)에 대해 `residentNumber` 필수 + 형식 검증
- 법인(corporate)은 사업자번호 별도 → 제외

### D. 동기화 지점 (14지점 中 영향)
- ① 폼 상태 / ② initial / ③ normalize — birthDate를 직접 입력받지 않고 파생 (factory 일관성)
- ⑧ validation — 주민번호 필수·형식
- 엔진 input은 **변경 없음** (여전히 birthDate·gender를 받음 → 도출만 UI에서)

---

## 4. ⚠️ 다른 의견 / 리스크 / 대안 (검토 요망)

요청 방향은 UX·중복 제거 측면에서 타당하나, 아래 3가지를 **결정**해 주셔야 합니다.

### 의견 1 — "전체 주민번호 필수"는 과한 개인정보 수집 (권고: 절충)
- 세금 *계산기*에서 계산에 필요한 정보는 **생년월일 6자리 + 성별 1자리 = 앞 7자리**뿐.
  뒷 6자리(검증번호 포함)는 계산에 전혀 불필요.
- **대안 A (권고)**: 입력은 13자리 받되 **앞 7자리만 파싱**하고 뒷자리 유효성(체크섬)은 검증하지 않음 — "신고서 인적사항 칸"용도 + 계산용도 양립.
- **대안 B**: `생년월일(YYMMDD) + 성별코드(1자리)`만 받는 전용 입력(뒷자리 미수집) — 프라이버시 최소수집 원칙에 가장 부합. 단 신고서 출력 시 주민번호 전체 칸은 비게 됨.

### 의견 2 — birthDate **완전 삭제**는 fallback을 없애 입력 불가 케이스 발생
- 외국인등록번호·뒷자리 모름·해외거주 상속인 등 **주민번호를 못 적는 케이스** 존재.
- 프로젝트 정책(메모리 `feedback_no_silent_apportion_fallback`·`feedback_three_state_optional_mode_toggle`)상 "단일 입력원 강제"보다 **주민번호 우선 자동도출 + birthDate 보조입력 유지**가 안전.
- **권고**: 생년월일 필드를 *완전 삭제*하기보다,
  - 주민번호 입력 시 → birthDate/gender 자동 채움 + 생년월일 칸 **숨김/읽기전용**
  - 주민번호 미입력/외국인 → 생년월일 직접입력 fallback 노출
  - = "삭제"가 아니라 "주민번호가 1순위, 생년월일은 보조" 3-state.

### 의견 3 — 필수화 범위는 "미성년·공제 관련 관계"로 한정
- **배우자**는 미성년·연로자 공제 대상이 아님(§20). 배우자에게 주민번호 강제는 불필요한 마찰.
- **권고**: 주민번호 필수는 *전 관계 일괄*보다, 신고서 출력을 쓰는 사용자에게는 전체 권장 / 계산만 하는 사용자에게는 "장애인 ON" 등 필요한 경우만 차단하는 **조건부**가 UX 친화적.
- 단, 신고서 양식(별지 제9호 등) 완성도를 우선하면 전 관계 필수도 합리적 — **목적(계산 vs 신고서 재현)에 따라 결정**.

---

## 5. 권고 종합안

| 항목 | 요청안 | 권고안 |
|---|---|---|
| 주민번호 | 전체 필수 | 입력 필수, **앞 7자리만 파싱**(뒷자리 체크섬 검증 안 함) |
| birthDate/gender | birthDate만 도출 | **birthDate + gender 동시 도출** (장애인 성별 중복도 제거) |
| 생년월일 입력 | 완전 삭제 | 주민번호 입력 시 숨김, **외국인·미입력 fallback로 유지** |
| 필수 범위 | 전 관계 | 자연인 전 관계(법인 제외), 배우자는 권장 |

---

## 6. 작업 항목 (결정 후 착수)

1. `parseResidentNumber` 순수 유틸 + anchor 테스트 (세기·성별·유효성·잘못된 날짜)
2. `HeirComposition.tsx`: 주민번호 onChange 도출, 생년월일 블록 처리(숨김/fallback), 장애인 성별 자동
3. `inheritance-validate.ts`: 주민번호 필수·형식(범위 결정 반영)
4. factory/normalize: birthDate·gender 파생 일관성 (③ normalize, ② initial)
5. 엔진 input 변경 0 확인 + `npx tsc --noEmit` + `npx vitest run __tests__/tax-engine/inheritance/`
6. E2E: 주민번호 입력 → 미성년 자동판정 → 결과 (`e2e/*.spec.ts`)

> 엔진 산식·결과 표시는 변경 없음(birthDate/gender 도출원만 교체). 따라서 위험도 중간, 영향은 UI·validation 국한.
