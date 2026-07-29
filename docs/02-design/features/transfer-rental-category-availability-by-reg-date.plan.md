# 수정 계획서 — 임대 구분 버튼 등록시기별 자동 활성/비활성

> §155⑳ 임대주택 카드(`RentalUnitCard`)의 "임대 구분" 라디오에서, 입력된 등록일에 따라
> **엔진이 결정적으로 배제(REG_DATE_GATE)하는 유형을 자동 disabled** 처리한다.
> 작성일 2026-07-26 · 대상 `components/calc/transfer/RentalUnitCard.tsx`

---

## 1. 요구 (Think Before Coding)

사용자 요청: "임대등록 시기에 따라 임대 구분 선택 버튼도 액티브하게 보여줬으면 좋겠다."

현재: 세무서 사업자등록일·지자체 임대사업자등록신청일을 입력해도 "임대 구분"의 5개 버튼
(장기일반 / 단기 6년 / 기존사업자(나목) / 미분양(라목) / 구 임대주택법)은 **항상 전부 클릭 가능**.
등록시기상 성립 불가능한 유형을 선택하면 판정배지·validation에서만 뒤늦게 REG_DATE_GATE로 걸린다.

목표: 등록일로 **결정적으로 배제되는 유형을 사전에 disabled**(회색·클릭불가) + 사유 표시 →
성립 가능한 유형만 액티브하게 보이도록.

---

## 2. 법령·엔진 근거 (단일 소스 재사용 — 추정 금지)

비활성 기준은 **새로 만들지 않고** 엔진이 이미 강제하는 `REG_DATE_GATE`를 그대로 반영한다.
근거 상수는 `lib/tax-engine/rental-article/rules.ts`의 `RA_CUT`, 게이트는 `check.ts`
`checkArticleGates`(실측 확인):

| 유형(rentalCategory) | 도출 목 | 등록일 게이트 (check.ts) | 판정 필드 |
|---|---|---|---|
| `short_6y` 단기 6년 | 아·자 | `regDateMin = RA_CUT.Y2025_06_04` → `effTs < 2025-06-04` 이면 `REG_DATE_GATE` (check.ts:186) | 등록기준일 = max(세무서, 지자체) |
| `existing_business` 기존사업자(나목) | 나 | `bizRegDateMax = RA_CUT.Y2003_10_29` → 세무서 등록일 `> 2003-10-29` 이면 `REG_DATE_GATE` (check.ts:187-189) | 세무서 §168 사업자등록일 단독 |
| `long_general` 장기일반 | 가·마·다·바 | 등록일-단독 배제 게이트 **없음** (경계는 목 분기·의무기간·아파트에만 영향) | — |
| `unsold_08_09` 미분양(라목) | 라 | 게이트는 `saleWindow`(최초 분양계약일 2008-06-11~2009-06-30)로, **등록일이 아닌 별도 필드**(`firstSaleContractDate`)에서 판정 (check.ts:191-194) | 최초 분양계약일 |
| `pre_2018` 구 임대주택법 | 구법 | 등록일 게이트 **없음** | — |

→ **등록일 2필드만으로 결정적 배제 가능한 유형은 `short_6y`·`existing_business` 2개뿐.**
나머지 3개(`long_general`·`unsold_08_09`·`pre_2018`)는 등록일 단독으로 배제 근거가 없으므로
**항상 활성 유지**한다(법 근거 없이 불리 적용 금지 — `feedback_no_unfavorable_application_without_legal_basis`).

### 화면 예시 검증 (첨부 이미지 = 2009-08-12 / 2009-08-31)

- 등록기준일 = 2009-08-31 → `short_6y`: 2025-06-04 미만 → **disabled**
- 세무서 등록일 = 2009-08-12 > 2003-10-29 → `existing_business`: **disabled**
- 장기일반·미분양(라목)·구 임대주택법 → **활성** ✅ (요청과 일치)

---

## 3. 판정 시점 규칙 (미입력 시 조기 차단 금지)

"판정에 필요한 날짜가 확정되기 전에는 비활성화하지 않는다"를 원칙으로 한다:

- `existing_business` (나목): **세무서 등록일 단독**으로 판정 → 세무서 등록일이 입력되고
  `> 2003-10-29` 일 때만 disabled. 미입력이면 활성 유지.
- `short_6y` (아·자): **등록기준일 = max(세무서, 지자체)** 필요 → **둘 다 입력**되고
  max < 2025-06-04 일 때만 disabled. 하나라도 미입력이면 활성 유지(판정 불가 상태 = 열어둠).

---

## 4. 구현 (Surgical Changes)

### 4-1. 엔진 도메인에 파생 함수 추가 (단일 소스)

`lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts`에
`RA_CUT` 재사용 순수 함수 신설(UI가 import — dual-truth 회피, `single-source-engine-helper`):

```ts
import { RA_CUT } from "../../rental-article/rules";

export type CategoryAvailability = { available: boolean; reason?: string };

/**
 * 등록일 2필드로 결정적으로 배제되는 임대 구분 유형을 disabled 처리하기 위한 판정.
 * 배제 기준은 check.ts checkArticleGates의 REG_DATE_GATE와 1:1(단일 소스).
 * 판정 불가(날짜 미입력)면 available=true(조기 차단 금지).
 */
export function deriveCategoryAvailability(
  businessRegistrationDate: Date | null,
  rentalRegistrationDate: Date | null,
): Record<RentalCategory, CategoryAvailability> {
  const bizTs = businessRegistrationDate?.getTime();
  const bizValid = bizTs != null && !Number.isNaN(bizTs);
  // 가드-내로잉 필수: deriveEffectiveRegDate 시그니처는 Pick<RentalUnitInput,…> = non-null Date 2개
  // (types.ts:43,45). Date|null을 직접 넘기면 TS2322. ternary 내부에서 두 값이 Date로 좁혀짐.
  const effRegDate =
    businessRegistrationDate && rentalRegistrationDate
      ? deriveEffectiveRegDate({ businessRegistrationDate, rentalRegistrationDate })
      : null;
  const effTs = effRegDate?.getTime() ?? null;

  // 나목: 세무서 등록일 단독 판정
  const existingBusiness: CategoryAvailability =
    bizValid && bizTs > RA_CUT.Y2003_10_29
      ? { available: false, reason: "기존사업자(나목)는 세무서 사업자등록 2003.10.29 이전 등록분만 해당합니다." }
      : { available: true };

  // 아·자(단기 6년): 등록기준일 = max(세무서, 지자체) 확정 시에만 판정
  const short6y: CategoryAvailability =
    effTs != null && effTs < RA_CUT.Y2025_06_04
      ? { available: false, reason: "단기 6년(아·자목)은 2025.6.4 이후 등록분만 해당합니다." }
      : { available: true };

  return {
    long_general: { available: true },
    short_6y: short6y,
    existing_business: existingBusiness,
    unsold_08_09: { available: true },
    pre_2018: { available: true },
  };
}
```

- `RentalCategory`는 eligibility.ts에 이미 import됨(eligibility.ts:31·types.ts:29) → 신규 import 불필요.

### 4-2. UI — 옵션별 disabled + 사유 (RadioCardGroup 기존 지원 활용)

`RadioCardGroup`은 이미 `option.disabled`(opacity-60·cursor-not-allowed·input disabled)·`testId`(→data-testid) 지원(실측 RadioCardGroup.tsx:99·100·181-193). 신규 컴포넌트 불필요.

**disabled 규칙 = `!available && value !== 현재선택`** — 등록시기로 배제되는 유형은 disabled, 단 **현재 선택 중인 유형은 disable 대상에서 제외**한다. 이 "선택 제외" 가드는 §4-3 auto-reset이 커버하지 못하는 **mount 시점(이력/마이그레이션으로 stale 선택 로드)의 disabled+checked limbo**를 방지하는 안전장치다(useEffect 금지라 mount는 auto-reset 불가·저장된 결과를 조용히 바꾸지 않아 reload 일관성 유지). 정상 편집 흐름에선 auto-reset(§4-3)이 이미 선택을 유효값으로 바꿔놓으므로 이 가드는 **보이지 않는다**.

`RentalUnitCard.tsx`:

```tsx
// 파생 (useMemo — 표시 전용, store 미러링 금지)
const categoryAvail = useMemo(
  () => deriveCategoryAvailability(
    unit.businessRegistrationDate ? new Date(unit.businessRegistrationDate) : null,
    unit.rentalRegistrationDate ? new Date(unit.rentalRegistrationDate) : null,
  ),
  [unit.businessRegistrationDate, unit.rentalRegistrationDate],
);

// 임대 구분 options — 선택 중(unit.rentalCategory)인 값은 disable 제외(mount-limbo 방지) + E2E testId 부여
const CATEGORY_OPTS = [
  { value: "long_general",      label: "장기일반" },
  { value: "short_6y",          label: "단기 6년" },
  { value: "existing_business", label: "기존사업자(나목)" },
  { value: "unsold_08_09",      label: "미분양(라목)" },
  { value: "pre_2018",          label: "구 임대주택법" },
] as const;

options={CATEGORY_OPTS.map((o) => ({
  value: o.value,
  label: o.label,
  testId: `rental-category-${o.value}-${index}`,
  disabled: !categoryAvail[o.value].available && o.value !== unit.rentalCategory,
}))}
```

disabled 사유는 라디오 하단에 캡션으로 표기(사유별 개별 `<p>` — 다중 disabled 시 한 줄 concat 방지):

```tsx
{Object.values(categoryAvail).some((a) => !a.available) && (
  <div className="px-1 space-y-0.5">
    {Object.values(categoryAvail)
      .filter((a) => !a.available)
      .map((a, k) => (
        <p key={k} className="text-caption text-muted-foreground">※ {a.reason}</p>
      ))}
  </div>
)}
```
- 사유 dedup 불필요: 두 disabled 유형(short_6y·existing_business)의 reason 문구가 서로 달라 진짜 중복이 없다. `filter(!a.available)`가 `{available:true}`(reason undefined)를 배제하므로 안전.

### 4-3. auto-reset — 날짜 변경으로 선택이 무효화되면 유효 유형으로 자동 복원 (onChange 이벤트 구동, useEffect 금지)

날짜를 바꾸어 **현재 선택된 유형이 무효**가 되면 선택을 안전 유형(`long_general` — 항상 활성)으로
**자동 복원**한다. `useEffect → store` 미러링이 아니라 두 DateInput의 `onChange` 이벤트에서 처리한다
(CLAUDE.md의 onChange 교차필드 동기화 허용 — `mirror-pattern`·`feedback_useeffect_store_mirror_forbidden`):

```tsx
function setRegDate(key: "businessRegistrationDate" | "rentalRegistrationDate", v: string) {
  const next = { ...unit, [key]: v };
  const avail = deriveCategoryAvailability(
    next.businessRegistrationDate ? new Date(next.businessRegistrationDate) : null,
    next.rentalRegistrationDate ? new Date(next.rentalRegistrationDate) : null,
  );
  // 무효화된 현재 선택만 복원 — 그 외 필드는 그대로. long_general은 등록일 단독 배제 게이트가 없어 항상 유효.
  if (!avail[next.rentalCategory].available) next.rentalCategory = "long_general";
  onChange(next);
}
```
→ RentalUnitCard.tsx의 두 DateInput `onChange`(현재 `set("businessRegistrationDate", v)`·:125 / `set("rentalRegistrationDate", v)`·:133)를 `setRegDate("businessRegistrationDate", v)` / `setRegDate("rentalRegistrationDate", v)`로 교체.

**mount 시점은 auto-reset이 못 덮는다**(onChange가 안 fire됨) → §4-2 "선택 제외" 가드가 그 gap의 안전장치.
두 장치의 역할 분담: **auto-reset = 편집 중 능동 복원**, **선택-제외 가드 = stale 로드 시 limbo 방지**.

- **orphan 필드 주의**: auto-reset로 `short_6y`/`existing_business` → `long_general` 전환 시 이전 유형 전용 필드
  (`acquisitionOfficialPrice`·`firstSaleContractDate`·`isNationalSizeHousing` 등)가 state에 잔존할 수 있다.
  무해(long_general validation이 `standardPriceAtRentalStart`·`requirementsConfirmed`를 재요구해 self-correct,
  UI 조건부 노출이 해당 필드를 숨김) → **의도적으로 정리하지 않음**(surgical — 요청 범위 밖 state 삭제 회피).

---

## 5. 14 동기화 지점 영향 (신규 엔진 필드 없음 — UI 한정)

기존 필드(`businessRegistrationDate`·`rentalRegistrationDate`·`rentalCategory`)만 사용. 대부분 지점 무영향.

| 지점 | 영향 | 조치 |
|---|---|---|
| ① 폼 타입 | 무 | rentalCategory 유니온 그대로 |
| ④ API 변환 | 무 | rentalCategory 그대로 전달 |
| ⑤ UI 위젯 | **변경** | 4-2 (disabled 규칙·testId·사유 캡션) + 4-3 (auto-reset `setRegDate` — onChange 이벤트 구동) |
| ⑧ validation | 무 (충돌 없음) | **정정**: `transfer-tax-validate-rental-exception.ts`(:45-86)는 도출 목별 **필드 존재만** 검사하고 REG_DATE_GATE는 **차단하지 않는다**. REG_DATE_GATE 판정은 엔진 `checkEligibility`가 **결과 계산 시** 수행 → failReason으로 결과에 "특례 미적용" 표시(check.ts:186·eligibility.ts:245-251). UI disabling은 이 always-denied 선택이 새로 만들어지는 것을 **사전 차단하는 UX 개선**일 뿐 validation과 층이 다르다 → 충돌 불가. auto-reset(§4-3)으로 선택은 편집 중 항상 유효 유형으로 복원되고, mount 시엔 선택-제외 가드(§4-2)로 표시만 유지 → validation article 분기와 항상 정합 |
| ⑨~⑭ Zod/Route | 무 | — |

**핵심**: UI disabled 조건 = 엔진 `checkArticleGates`의 REG_DATE_GATE 조건(rules.ts `RA_CUT` 단일 소스). validation(⑧)은 REG_DATE_GATE를 검사하지 않으므로 "UI 통과 ↔ validate 차단" 모순이 **구조적으로 발생 불가**. 무효 선택은 엔진 결과에서 특례 미적용으로 판정(오답 없음).

---

## 6. 검증 (Goal-Driven)

- [ ] `deriveCategoryAvailability` 단위 테스트(eligibility 테스트 파일에 append):
  - biz 2009-08-12 → `existing_business.available === false`
  - eff 2009-08-31 → `short_6y.available === false`
  - **경계 포함**(strict 부등호 방향 고정): biz 2003-10-29 → `existing_business === true` / eff 2025-06-04 → `short_6y === true`
  - **경계 인접**(하드닝): biz 2003-10-30 → `existing_business === false` / eff 2025-06-03 → `short_6y === false`
  - biz만 입력(rental 미입력) → `short_6y.available === true` (조기 차단 금지)
  - 미입력 전부 → 5개 모두 available
- [ ] **auto-reset 단언**(UI 레벨 — E2E 또는 RTL): `short_6y`가 선택된 상태에서 2009 날짜를 **입력**(onChange)하면
  rentalCategory가 `long_general`로 복원되고, short_6y·existing_business 라디오는 `toBeDisabled()`.
- [ ] **mount-limbo 가드 단언**: `short_6y` 선택 + 2009 날짜가 이미 채워진 상태로 **초기 렌더**(이력 로드 모사)되면
  short_6y 라디오는 `disabled`가 **아니어야** 하고(선택-제외 가드) 사유 캡션이 노출. testid: `rental-category-{value}-{index}`.
- [ ] `npx tsc --noEmit` 0건 (§4-1 가드-내로잉으로 TS2322 회피 확인)
- [ ] `npx vitest run __tests__/tax-engine/transfer/` (§155⑳ 회귀) 통과
- [ ] E2E 또는 브라우저 수동: long_general 선택 상태에서 2009 날짜 입력 시 단기 6년·기존사업자(나목) 회색화, 나머지 3개 활성 확인(memory `feedback_browser_verify_with_playwright`)

---

## 7. 범위 밖 (Simplicity First — 하지 않을 것)

- `unsold_08_09`(라목)을 등록일로 추정 비활성화하지 않음 — 게이트는 최초 분양계약일(별도 필드)이며,
  등록일 단독 배제 근거 없음(불리 오적용 위험).
- `pre_2018`(구법) 비활성 게이트 신설하지 않음 — 엔진에 등록일 게이트 없음.
- 의무임대기간·기준시가 상한 등 **비-날짜 요건**은 판정배지·validation 기존 흐름 유지(이번 범위 아님).
