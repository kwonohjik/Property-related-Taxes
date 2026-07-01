# 비사업용 토지 "무조건 사업용 의제" — UI 과대표현 수정 계획

작성일 2026-07-01 · 대상: 양도세 자산 카드 > 비사업용 토지 정밀 판정 > 무조건 사업용 토지 판정(§168-14③)

---

## 1. 배경 — 검증된 사실 (추정 아님)

### 엔진은 정확 ✅
`lib/tax-engine/non-business-land/unconditional-exemption.ts` 의 `checkUnconditionalExemption()` 는
날짜·지역·지목 조건을 **실제로** 검사한다. 공익수용(③3호) 예:

- `:88-97` 가목 — `publicNoticeDate <= 2006-12-31` 이면 의제
- `:99-107` 나목 — `acquisitionDate <= addYears(publicNoticeDate, -5)` (고시일 5년 이전 취득) 이면 의제
- 둘 다 아니면 **의제 성립 안 함 → 지목별 판정으로 진행**

KoreanLaw 현행(MST 286211, 시행 2026-07-01) 대조 완료 — 가·나목·5년 모두 법령 일치.
같은 파일의 ③1호(상속≤2006 + 양도≤2009)·③2호(20년)·③1의2호(직계존속 8년자경, 도시지역 제외)·
④호(도시농지 종중/상속)·이농(≤2006+양도≤2009)·종중(취득≤2005) 도 각각 날짜/지목/지역 조건을 실제로 검사한다.

### UI는 과대표현 ⚠️ (이번 수정 대상)
배너와 지목별 비활성이 **토글 ON 여부만** 보고 결정된다 — 엔진 판정을 참조하지 않음.

| 위치 | 현재 코드 | 문제 |
|---|---|---|
| `UnconditionalExemptionSection.tsx:14-22` | `anyExempt` = 8개 `nblExempt*` 토글 OR | 날짜 조건 무시 |
| `UnconditionalExemptionSection.tsx:34` | `hasExemption = anyExempt(asset)` | ↑ 그대로 |
| `UnconditionalExemptionSection.tsx:43-47` | `hasExemption &&` "엔진이 무조건 사업용으로 판정합니다 … 지목별 판정을 건너뜁니다" 배너 | 조건 미충족에도 확정 문구 |
| `NblSectionContainer.tsx:60-68` | `anyExempt` **중복 정의** (동일 8토글 OR) | 이중 소스 |
| `NblSectionContainer.tsx:104` | `anyExempt ? "opacity-50 pointer-events-none"` | 조건 미충족에도 지목별 입력 잠금 |

**결과 (이미지 23~26 시나리오)**: 공익수용 토글 ON + 사업인정고시일 2017-04-23 입력 시,
취득일이 2012-04-23 이후이면 엔진은 의제하지 **않고** 지목별 판정을 돌린다. 그런데 UI는
"무조건 사업용·지목별 건너뜀"이라 표시하고 지목별 입력칸을 비활성화 → 사용자는 사업용 확정으로
오인하고, 엔진이 실제로 필요로 하는 지목별 입력을 채우지 못한다.

동일 불일치가 날짜/지역 조건 붙는 나머지 토글(③1호·③1의2호·④호·이농·종중)에도 적용된다.

---

## 2. 이미지 23~26 반영

이미지는 위 문제 화면을 보여준다 — 무조건 사업용 판정 섹션의 **파란 배너**, **공익사업으로 수용 토글 +
사업인정고시일 날짜칸**, 그리고 그 아래 **회색 처리(비활성)된 지목별 판정 영역**. 본 수정은:

1. 배너를 **엔진 실제 판정** 기준으로 전환 — 요건 충족 시에만 "사업용 확정", 미충족 시 "지목별 판정 진행" 안내.
2. 지목별 영역 비활성을 **실제 의제 성립 시에만** 적용.
3. 공익수용 등 날짜 토글에 **토글별 요건 충족/미충족 뱃지**를 붙여, 사용자가 입력한 고시일·취득일이
   요건을 만족하는지 즉시 확인.

---

## 3. 설계 원칙

- **엔진 단일 진실 재사용** (memory `feedback_ui_engine_dual_truth_avoidance` ★★★): UI에서 날짜 판정을
  재구현하지 않는다. 아래 순수·client-safe 함수를 그대로 import 한다.
  - `buildUnconditionalExemption(asset, parseDate)` — `form-mapper-helpers.ts:93` (export 확인)
  - `getLandCategoryGroup(landType)` — `land-category.ts:37` (export 확인, 빈 landType → `"unknown"`)
  - `checkUnconditionalExemption(input, categoryGroup)` — `unconditional-exemption.ts:31`
  - 셋 다 server-only import 없음(date-fns + type만) → 클라이언트 사용 안전 (검증 완료)
- **UI-only 변경**: 엔진 input/result·Zod 스키마·validate 불변. 신규 폼 필드 없음 →
  **14 동기화 지점 해당 없음**. 순수 표시 로직 교체.
- **이중 정의 제거**: `anyExempt` 가 두 파일에 중복 → 컨테이너에서 1회 계산해 하위로 전달.

---

## 4. 변경 항목

### 4-1. 신규 헬퍼 `components/calc/transfer/nbl/unconditional-exemption-status.ts`

```ts
// 엔진 판정을 UI에서 재사용하는 얇은 어댑터 (단일 소스, 재구현 없음)
export interface NblExemptionEval {
  anyToggleOn: boolean;                 // 8토글 중 하나라도 ON (기존 anyExempt 대체)
  isExempt: boolean;                    // 엔진 실제 판정 — 하나라도 요건 충족
  matched?: { reason; detail; legalBasis }; // 성립한 첫 사유 (배너 상세 문구)
  perToggle: Record<ToggleKey, {        // ON 토글별 상태 (뱃지용)
    qualifies: boolean;                 // 해당 토글 단독으로 의제 성립 여부
    requirementHint: string;            // 미충족 시 요건 설명 (정적 텍스트)
  } | undefined>;                       // undefined = 토글 OFF
}

export function evaluateUnconditionalExemption(
  asset: Record<string, unknown>,
  transferDate: string,
): NblExemptionEval
```

내부 로직:
1. `parseDate` (기존 프로젝트 date 파서 재사용) 로 문자열 → Date.
2. `categoryGroup = getLandCategoryGroup(asset.nblLandType ?? "")`.
3. `uncond = buildUnconditionalExemption(asset, parseDate)`.
4. 최소 input 구성: `{ unconditionalExemption: uncond, transferDate, acquisitionDate: parseDate(asset.acquisitionDate), zoneType: asset.nblZoneType || "undesignated" }`
   → `checkUnconditionalExemption(input, categoryGroup)` 로 **aggregate** isExempt/matched 산출.
5. **per-toggle**: ON 토글 각각에 대해 "그 토글만 true 인 uncond 사본" 으로 `checkUnconditionalExemption`
   재호출(8회 이하, 순수·저비용) → 토글별 `qualifies` 판정. 엔진 로직 그대로 사용(재구현 없음).
6. 미충족 토글의 `requirementHint` 는 정적 서술 텍스트(예: 공익수용 = "사업인정고시일이 2006.12.31.
   이전이거나, 취득일이 고시일로부터 5년 이전이어야 사업용으로 확정됩니다"). 판정이 아닌 안내문이라 dual-truth 아님.
7. 날짜 파싱 실패(양도일·취득일 미입력) 시 해당 조건은 자동 미충족 → `isExempt=false` (지목별 유지). 가드.

### 4-2. `NblSectionContainer.tsx`
- 상단에 `const exemptionStatus = useMemo(() => evaluateUnconditionalExemption(asset, transferDate ?? ""), [asset, transferDate])`.
- `:60-68` 로컬 `anyExempt` **삭제**.
- `:101` `<UnconditionalExemptionSection asset={asset} onAssetChange={onAssetChange} status={exemptionStatus} />` (prop 추가).
- `:104` `className={exemptionStatus.isExempt ? "opacity-50 pointer-events-none" : undefined}`.

### 4-3. `UnconditionalExemptionSection.tsx`
- Props에 `status: NblExemptionEval` 추가. `:14-22` 로컬 `anyExempt` **삭제**, `:34` `hasExemption` 제거.
- **배너 3-state** (`:43-47` 교체):
  - `status.isExempt` → 확정 배너(파랑/초록): "엔진이 무조건 사업용으로 판정합니다 — {matched.detail} ({matched.legalBasis}). 아래 지목별 판정을 건너뜁니다."
  - `status.anyToggleOn && !status.isExempt` → 안내 배너(amber): "선택한 사유가 아직 요건을 충족하지 않아 아래 지목별 판정으로 진행합니다. 입력한 날짜를 확인하세요."
  - 그 외 → 배너 없음.
- **토글별 뱃지**: 각 ToggleCard children 하단(날짜칸 아래)에 `status.perToggle[key]` 가 존재하면
  `qualifies` → 초록 "요건 충족 · 사업용 확정" / 미충족 → amber "요건 미충족 · {requirementHint}".
  (공익수용·상속·종중·이농 등 날짜 입력 있는 토글 우선. 날짜 없는 토글(20년·8년자경·공장인접·④호)은
  엔진이 지목/지역만 보므로 뱃지 텍스트를 그에 맞게.)

---

## 5. 검증 (Definition of Done)

- [ ] **vitest 유닛** `__tests__/.../unconditional-exemption-status.test.ts` (신규):
  - 공익수용 고시일 2005-01-01 → `isExempt=true` (가목)
  - 공익수용 고시일 2017-04-23 + 취득일 2010-01-01 → `isExempt=true` (나목, 5년 이전)
  - 공익수용 고시일 2017-04-23 + 취득일 2015-01-01 → `isExempt=false`, perToggle.qualifies=false
  - 지목 미선택 + 상속 토글 ON → `isExempt=false` (categoryGroup="unknown")
- [ ] **Playwright E2E** `e2e/transfer-nbl-unconditional.spec.ts` (신규 또는 기존 확장):
  - 공익수용 미충족 케이스 → 배너 amber, 지목별 Select **활성**(pointer-events 유지), 뱃지 "요건 미충족"
  - 공익수용 충족 케이스 → 배너 확정, 지목별 **비활성**
  - (memory `feedback_browser_verify_with_playwright` ★★★ — 수동 안내 금지)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/non-business-land/` 회귀 0건 (엔진 불변이므로 기존 통과 유지)
- [ ] 기존 NBL E2E 회귀 baseline 대조

---

## 6. Scope Out (이번에 건드리지 않음)

- 엔진 판정 로직·법령 상수·`NonBusinessLandInput`/`Result`·Zod 스키마·`validate` — **전부 불변**.
- 다필지(§168의11⑤)·복합용도 등 별개 갭.
- `mapAssetToNblInput` 은 지목 미선택 시 null 반환하므로 UI에서 직접 사용하지 않고,
  하위 빌더(`buildUnconditionalExemption`)만 재사용.

---

## 7. 리스크 / 주의

- **per-toggle 격리 재호출**: `checkUnconditionalExemption` 은 첫 매치 반환 방식. 토글 1개만 true 인
  사본으로 호출하면 그 조문 분기만 평가되므로 토글별 판정이 정확. (공유 컨텍스트인 지목·지역·날짜는 유지)
- **양도일 전파**: `UnconditionalExemptionSection` 은 현재 `transferDate` 를 받지 않음 → 컨테이너에서
  이미 보유한 값을 status 계산에 사용(하위엔 status만 전달, transferDate 직접 전달 불필요).
- **memory 반영**: 완료 시 `project_transfer_nbl_ui_engine_exemption_mismatch` 를 "✅수정"으로 갱신.
