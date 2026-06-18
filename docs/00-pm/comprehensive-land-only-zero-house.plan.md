# 종부세 "주택 0채" 허용 — 토지전용(사례10·11) 입력 흐름 정비 (B안)

> 작성 기준: 2026-06-18 · 전 file:line은 실제 코드 확인(grep/Read) 완료, 추정 없음.

## 1. 배경 / 문제

종부세 엔진은 **주택 없이 토지(종합합산·별도합산)만** 있는 경우를 이미 완전 지원한다.
근거 anchor: `__tests__/tax-engine/comprehensive-land-case10-11.test.ts:18`

```ts
const BASE = { assessmentYear: 2022, isOneHouseOwner: false, properties: [] };
…calculateComprehensiveTax(input({ landAggregateParcels: AGG }))  // 사례10 전 칸 통과
```

엔진 `comprehensive-tax.ts:427-430` 은 `isSubjectToHousingTax = taxBase > 0` 이 false여도
경고만 push하고 **early-return 하지 않으며**, 토지분 계산은 별도로 진행된다.

**그러나 UI/검증 계층이 "최소 1채"를 강제**하여 토지전용 사용자가 막힌다:

| 계층 | 강제 지점 | 결과 |
|---|---|---|
| Zod | `lib/validators/comprehensive-input.ts:359-361` `properties.min(1)` | **API가 `properties:[]` 거부 (진짜 차단점)** |
| UI 목록 | `components/calc/PropertyListInput.tsx:88` `canRemove = length>1` | 마지막 1채 삭제 단추 미노출 |
| UI 목록 | `PropertyListInput.tsx:110` `closeModal` `length<=1` 가드 | 마지막 1채는 비워도 자동 제거 안 됨 |

→ 현재 토지전용 사용자는 **유령 주택 1칸을 공시가격 0으로 비워둔 채** 우회해야 하고
(숫자 결과는 맞지만), 결과 화면에 빈 주택분 섹션이 노출된다.

## 2. 목표

1. 주택 목록을 **0채까지 허용** (마지막 1채 삭제 가능).
2. 0채일 때 Step2에 **빈 상태 안내** + "주택 추가" 노출.
3. 결과 뷰: **주택 0채면 주택분 섹션(과세표준·세액·납부할세액 카드) 숨김**.
4. **회귀 0** — 저가 1주택(`taxBase=0`이지만 주택 1채 존재)의 "납세의무 없음" 안내는 **유지**.

### 비범위 (Non-goals)

- **엔진 변경 없음** — `properties:[]` 이미 지원.
- **토지 입력 UI 변경 없음** — Step4 토글(`hasAggregateLand`/`hasSeparateLand`) 그대로.
- **기본 초기화는 1채 유지** (`store:231` `properties:[makeProperty()]`) — 대부분 주택 보유.
  0채는 사용자가 명시적으로 삭제할 때만 도달.

## 3. 핵심 설계 결정

### 3-1. 0채 숨김 게이트 = "주택 존재 여부"이지 `isSubjectToHousingTax` 아님 ★

`isSubjectToHousingTax = taxBase > 0`(`comprehensive-tax.ts:427`)는
**0채**와 **저가 1주택(기본공제 이하)** 을 구분하지 못한다.

- 저가 1주택 → 주택분 과세표준 섹션을 **"납세의무 없음" 안내와 함께 보여줘야** 함 (현행 유지).
- 0채 → 주택분 섹션 자체를 **숨겨야** 함.

따라서 결과 뷰 주택분 숨김 조건은 **`result.properties.length === 0`** 으로 한다.

**검증 완료 (회귀 안전 근거)**:
- `result.properties = propertyResults`(`comprehensive-tax.ts:688`)이고 `propertyResults`는
  `for (const prop of input.properties)` 루프의 `.push()`(`:315`)로 구성 — **합산배제 주택도 무조건 push**
  (`isExcluded`는 `totalPropertyTaxAmount` 집계에만 영향, `:312-315`). 따라서
  **`result.properties.length === input.properties.length` 항상 성립** → 1주택 전부배제도 length 1 유지
  (게이트가 "있는 주택"을 잘못 숨기지 않음). 0채 입력만 `[]`.

### 3-2. 완전 빈 입력(0채 + 토지 0) 방지

Zod `properties.min(1)` 을 `.min(0)` 으로 완화하되, **주택·토지 모두 없는 빈 계산**을 막기 위해
schema에 `superRefine` 추가: 주택 ≥1 **또는** 토지(`landAggregate*`/`landSeparate*` 중 유효 입력) ≥1.

## 4. 변경 지점 (검증된 file:line)

### A. Zod 완화 — `lib/validators/comprehensive-input.ts` (핵심)

- `:359-361` `properties.min(1)` → **`.min(0)`** + 주석 갱신.
- 말미 `.refine()` 체인(`:529` 이후, 마지막 refine 뒤)에 **새 `.refine()` 1건** 추가 —
  주택·토지 동시 부재 차단. **API 변환이 토지 미보유 시 land 필드를 `undefined`/생략**함을 검증
  (`comprehensive-api.ts:365-396` — `landAggregate`는 `hasAggregateLand && totalOfficialValue>0`일 때만 객체,
  `landSeparate`는 `length>0`일 때만, parcels는 모드 ON일 때만) → 아래 판정이 정확:
  ```ts
  .refine(
    (v) =>
      v.properties.length > 0 ||
      v.landAggregate !== undefined ||
      (v.landSeparate?.length ?? 0) > 0 ||
      (v.landAggregateParcels?.length ?? 0) > 0 ||
      (v.landSeparateParcels?.length ?? 0) > 0,
    { message: "주택 또는 토지를 1건 이상 입력해주세요.", path: ["properties"] },
  )
  ```
- 기존 refine 체인(`:529` 상호배타·`:543` C-15·`:557~` 토지 상호배타)은 properties 비어있음을 가정하지 않음 — 확인 완료.
- `:472-476` `priorHouseReductionRates`/`Ownership`/`priorHouseValues` 는 `.optional()` — 0채 영향 없음.

### B. 0채 허용 — `components/calc/PropertyListInput.tsx`

- `:88` `const canRemove = properties.length > 1;` → **`properties.length >= 1`**
  (1채여도 삭제 단추 노출 → 0채 도달 가능). `:156` 분기 자동 반영.
- **`:107-113` `closeModal` 은 변경하지 않는다 (가드 `<= 1` 유지).** ★정정
  - 이유: 0채는 **명시적 삭제 단추로만** 도달(§2 Non-goal 일치). closeModal을 `< 1`로 풀면
    초기 빈 주택(`store:231`)을 열었다 닫기만 해도 침묵 소멸하는 surprise 발생.
  - 빈 카드 자동 제거(추가 직후 닫기)는 그때 `length>1`이므로 현행 가드로 그대로 동작 — 회귀 없음.
- **빈 상태 안내 추가**: `PropertyListTableView`는 `length===0`이면 `return null`
  (`PropertyListTableView.tsx:138`) → 테이블 자리에 대체 안내 카드 렌더.
  문구 예: "보유 주택이 없습니다. 토지만 보유한 경우 다음 단계(토지 정보)에서 입력하세요."
  (sky tone 정보 카드, CLAUDE.md 색상 카드 패턴.) "주택 추가" 버튼(`:180-186`)은 length 무관 항상 렌더 — 0채에서도 노출 ✓.

### C. Step2 안내 — `app/calc/comprehensive-tax/page.tsx`

- `:101` `isMultiHouse = properties.length > 1` — 0채에서 false, 안전(변경 불요).
- `validateOneHouseConsistency`(`comprehensive-api.ts:166`)는 `normalHouseCount>=2`만 차단
  → 0채 + 1세대1주택 토글 ON이어도 차단 안 됨. 엔진은 `properties.length===1`만
  `oneHouseTreatment` 적용(`comprehensive-tax.ts:217 등`) → 0채면 무시. **안전.**
- (선택) 0채 + 1세대1주택 토글 ON 시 안내 또는 토글 자동 무력화 — UX 다듬기, 별도.

### D. 결과 뷰 0채 주택분 숨김 — `components/calc/results/ComprehensiveTaxResultView.tsx`

게이트: **`result.properties.length > 0`** (3-1 참조). 기존 토지 패턴
`{result.aggregateLandTax && (<PrintSection>…)}`(`:737`·`:746`)과 동일하게 **PrintSection 래퍼 레벨에서** 막는다.

- **PrintSection 래퍼 게이팅 (주 수정)** — 아래 3개를 `{result.properties.length > 0 && ( … )}` 로 감싼다:
  - `:697-699` `housing-tax-base`
  - `:701-704` `housing-tax`
  - `:732-734` `housing-payable-calc`
  (래퍼를 감싸면 빈 PrintSection 잔여 wrapper도 생기지 않음 — 내부 `return null`보다 깔끔.)
- **`availablePrintIds` useMemo (`:644-663`)** — deps `[result]` 유지(formData 미참조). 두 줄 조건화:
  - `:647` `s.add("housing-tax-base")` → `if (result.properties.length > 0) s.add("housing-tax-base")`
  - `:659` `s.add("housing-payable-calc")` → `if (result.properties.length > 0) s.add("housing-payable-calc")`
  - `:648` `housing-tax`는 이미 `if (result.isSubjectToHousingTax)` 게이트 — 0채 자동 제외. 변경 불요.
- `:264-269` `HousingTaxSection` 내부 — 이미 `!isSubjectToHousingTax` 시 null → 0채 자동 숨김. **변경 불요.**
- `:568-595` `GrandTotalSection` — 이미 `isSubjectToHousingTax` 게이트로 주택분 행 숨김(`:580`). **변경 불요.**
- `:198` `HousingTaxBaseSection` 내부 `return null` — PrintSection 게이팅 시 불필요. (선택적 방어로만.)
- 토지 섹션(`AggregateLandSection:465`·`SeparateLandSection:523`)은 이미 `if(!land) return null` — 영향 없음.

**범위 결정 필요 (확인 항목, 추정 아님)**:
- `:654` `filing-form-main`(별지 서식, 주택분 중심) — 0채 토지전용에서 빈 서식 노출. 숨길지 결정 필요.
  `filingLandArea/BuildingArea`(`:614-615`)는 `formData.properties[0]?.… ?? ""` 라 **크래시는 없음**(확인 완료),
  표시 적절성만 판단. (`ComprehensiveFilingFormSection`의 토지 포함 여부 미검증 → Do 단계에서 확인 후 결정.)
- **서버 PDF 채널**(`ResultPdfDocument` 계열) — 0채 입력 + 로그인 저장 후 PDF 출력 시 주택분 렌더가
  `properties[0]` 가정으로 깨지는지 **미검증**. Do 전 grep 확인 필요(리스크 §8에 등재).

### E. 엔진 경고 정돈 (선택 — 충실도)

- `comprehensive-tax.ts:429` 는 0채에도 `"주택분 종합부동산세 납세의무가 없습니다 (기본공제 이하)."` push.
  토지전용 사용자에겐 어색 → **0채면 push 스킵** (`if (!isSubjectToHousingTax && input.properties.length > 0)`).
  엔진 1줄 변경이며 저가 1주택 경고는 유지. 범위 포함 여부는 구현 시 확정.

### F. 변경 불요(검증 완료) — 회귀 안전 지점

| 지점 | 확인 |
|---|---|
| `comprehensive-tax.ts:217/242/275/294/489` 1주택 판정 | 전부 `input.properties.length === 1` 비교 — 0채면 false → `oneHouseTreatment` 미적용. **`properties[0]` 직접 접근·length 나눗셈 없음** |
| `comprehensive-tax.ts:428-430` `!isSubjectToHousingTax` | warning push만, **early-return 아님** → 토지분 계산 계속 |
| `store:314-320` `removeProperty` | 가드 없는 `filter` — 이미 0채 가능 |
| `store:484-489` merge `properties.map` | 빈 배열 보존, 재복원 없음 → sessionStorage `[]` 유지 |
| `comprehensive-api.ts:236` 변환 `properties.map` | 빈 → `[]` 안전 |
| `comprehensive-api.ts:405-440` `allPriorAssessed = length>0 && …` | 0채 → false → prior* 전부 `undefined` |
| `comprehensive-api.ts:471-483` `properties[0]?.` | 옵셔널 체이닝 — 안전 |
| `ComprehensiveTaxResultView:614-615` `formData.properties[0]?.` | 옵셔널 체이닝 → `""` — 크래시 없음 |
| 검증 4종 `:87/114/133/166` | `for-of`/`filter`/`some` — 빈 배열 안전 |

## 5. 14 동기화 지점 관점

필드 **추가**가 아니라 제약 **완화**이므로 대부분 N/A. 실제 영향:

- ④ API 변환 — 빈 배열 안전(F). 무변경.
- ⑦ 결과 카드 — 0채 주택분 숨김(D). **변경.**
- ⑧ Validation — `validateOneHouseConsistency` 등 안전(C). 무변경.
- ⑫ Zod — `min(1)→min(0)` + 신규 `.refine()`(주택 또는 토지)(A). **변경.**
- ⑬⑭ body spread / route 매핑 — `properties` 기존 키, 무변경.

## 6. 테스트 계획

- **기존 유지**: `comprehensive-land-case10-11.test.ts` (엔진 `properties:[]` anchor — 회귀 가드).
- **신규 단위**: `comprehensive-api` 변환 + Zod — `properties:[] + landAggregateParcels` 입력이
  `.min(0)` 통과하고 변환 결과 `properties:[]` 유지하는지.
- **신규 Zod refine**: 주택 0 + 토지 0 → 이슈 발생 / 주택 0 + 토지 1 → 통과.
- **신규 RTL**: `ComprehensiveTaxResultView` — `result.properties:[]`(토지만) 시
  주택분 과세표준·세액·payable 카드 **미렌더**, 토지 섹션 **렌더**, GrandTotal에 주택분 행 없음.
- **신규 RTL 회귀**: 저가 1주택(`properties.length===1`, `isSubjectToHousingTax=false`) 시
  주택분 과세표준 섹션 "납세의무 없음" 안내 **유지**(0채 숨김과 구분).
- **E2E** (`e2e/comprehensive-*.spec.ts` 패턴): 주택 0채(**초기 1채에서 삭제 단추 클릭** — closeModal 변경 없으므로
  "추가→빈 카드 닫기"로는 0채 미도달, 명시적 삭제만 경로) → Step4 토지 입력
  → 계산 → 결과에서 주택분 섹션 부재 + 토지분 표시 확인.

## 7. 작업 순서 (Do)

1. Zod 완화 + 신규 `.refine()` (A) — Pre-Do anchor: `properties:[]+land` 통과 단위 테스트 먼저 작성→실패 확인.
2. `PropertyListInput` 0채 허용 + 빈 상태 안내 (B).
3. 결과 뷰 주택분 0채 게이트 + PrintSection/availablePrintIds (D).
4. (선택) 엔진 경고 정돈 (E).
5. RTL/E2E 테스트 (6).
6. `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/comprehensive-*` · 결과 뷰 RTL · 전체 `npm test`.
7. 브라우저 수동 확인(토지전용 흐름) 또는 E2E spec 통과로 충족.

## 8. 리스크 / 주의

- **0채 숨김을 `isSubjectToHousingTax`로 게이트하면 저가 1주택 안내가 사라지는 회귀** → 반드시
  `properties.length` 기준 (3-1). RTL 회귀 테스트로 고정.
- **완전 빈 입력 방지**(3-2) 누락 시 0채+0토지가 빈 결과를 산출 → superRefine 필수.
- sessionStorage에 0채 `[]` 저장 후 reload 시 merge가 재복원하지 않음은 확인됨(F) — 단 구버전
  세션 호환 회귀는 E2E로 1회 확인.
- **서버 PDF 채널 미검증** — `ResultPdfDocument`(종부세 분리 렌더)가 0채에서 `properties[0]` 가정으로
  깨질 수 있음. **Do 첫 단계에서 `grep "properties\[0\]" components/calc/results/comprehensive-filing/ + PDF 문서`
  로 확인** 후, 깨지면 옵셔널 체이닝/0채 가드 추가. (화면 흐름과 독립 채널이므로 별도 점검.)
- `filing-form-main` 0채 노출 적절성(§D 범위 결정)은 Do 단계에서 `ComprehensiveFilingFormSection` 토지 포함
  여부 확인 후 결정 — 현재는 크래시 없음만 확정.
