# 별지 제9호서식 부표 2 — 상속인이 아닌 자 서식 미작성 수정 계획서

> 2026-06-02 · feature: `inheritance-buppyo-2-non-heir-exclusion`
> 선행: 부표2 금액 정합·오버플로 별지 분할 (`e3849d8` master 머지 완료)
> 소관: `inheritance-gift-tax-ui-senior`(어댑터·Section). **엔진·계산 변경 0 — 시트 생성 대상 필터.**
> **근거: 사용자 첨부 이미지(M 주식회사=영리법인·홍 손녀딸=수유자 시트 생성됨) + 작성방법(상속인별).**

---

## 0. 배경 — 사용자 지적

부표2 「상속인별 상속재산 및 평가명세서」는 **상속인별** 서식이나, 현재 `buildBuppyo2Data`가 `heirs` 전원에 시트를 생성 → **상속인이 아닌 자**에게도 시트가 만들어짐:

- 이미지: **상속인 ④ M 주식회사**(`relation="corporate"`, 영리법인 수증자) · **상속인 ⑤ 홍 손녀딸**(`relation="legatee"`, 비상속인 수유자) 시트 생성.
- 요구: **상속인이 아닌 자(수유자·영리법인)는 이 서식을 작성하지 말 것** → 해당 시트 미생성.

---

## 1. 상속인 판정 기준 (단일 진실 재사용)

`HeirRelation`(inheritance-gift.types.ts:531-539):

| 상속인 (시트 생성) | 비상속인 (시트 미생성) |
|---|---|
| `spouse`·`child`·`lineal_ascendant`·`sibling`·`other` | `legatee`(수유자)·`corporate`(영리법인) · `isHeir === false` |

- **이미 동일 판정이 존재** — `inheritance-deduction-suggest.ts:277-285`:
  ```ts
  h.relation === "legatee" || h.relation === "corporate" || h.isHeir === false
  ```
- `Heir.isHeir?: boolean`(inheritance-gift.types.ts:557) — 자연인이라도 명시적 비상속인 가능.
- **정책**(`single-source-engine-helper` · `feedback_enum_substring_match_forbidden`): 위 인라인 판정을 **공유 헬퍼 `isStatutoryHeir(heir)`로 추출**해 `buildBuppyo2Data`·`deduction-suggest` 양쪽이 재사용. exact 비교(substring 금지).

```ts
// lib/calc/heir-allocation-summary.ts (sortHeirs 옆 — buildBuppyo2Data가 이미 import)
export function isStatutoryHeir(h: Heir): boolean {
  return (
    h.relation !== "legatee" &&
    h.relation !== "corporate" &&
    h.isHeir !== false
  );
}
```

---

## 2. 현재 동작 (file:line)

- `lib/calc/besshi-buppyo-2-data.ts`:
  - `const sorted = sortHeirs(heirs);` (142) — 전원
  - `totalGross = Σ sorted.grossInheritance` (153-156) — ⑦ 실제상속지분율 분모
  - `return sorted.map((heir) => {...})` (164) — **전원 시트 생성** ← 수정 지점
- `BesshiBuppyo2Section.tsx`: 렌더 가드 `heirAllocationResult && heirs.length > 0`. data가 비면(상속인 0명) 빈 섹션.
- PDF·화면은 `buildBuppyo2Data` 결과(배열)만 소비 → 배열 필터 시 자동 반영(별도 변경 0).

---

## 3. 수정 항목

### 3-1. 어댑터 `lib/calc/besshi-buppyo-2-data.ts`
- `const sorted = sortHeirs(heirs);` → `const sorted = sortHeirs(heirs).filter(isStatutoryHeir);` (상속인만 — 필터 1회).
- **`totalGross`·시트·번호 모두 `sorted`(상속인만) 기준** → ⑦ 실제상속지분율 분모 = 상속인 합(D-1 결정). 배우자 ⑦ = 3,300M ÷ 6,180M ≈ **0.534**, 상속인 합 = 1.
- 상속인 번호(①②③)는 filter 후 배열 index로 자동 재부여(상속인만 1~N).

### 3-2. 공유 헬퍼 `lib/calc/heir-allocation-summary.ts`
- `isStatutoryHeir(heir)` 신설(§1). `deduction-suggest.ts`의 인라인 3조건을 이 헬퍼 호출로 치환(단일 진실, 회귀 0 — 동일 로직).

### 3-3. 렌더 가드 `BesshiBuppyo2Section.tsx`
- `buildBuppyo2Data` 결과 `data.length === 0`(상속인 0명, 전원 수유자·법인) 시 **`return null`**(빈 부표2 섹션 미표시). 기존 가드에 `&& data.length > 0` 추가(data 산출 후 위치 조정).

### 3-4. PDF — 변경 0
- `InheritanceBuppyo2PdfDocument`는 필터된 `data` 소비 → 비상속인 Page 자동 제외.

---

## 4. 케이스 매트릭스 + anchor

### 4-1. 신규/갱신 anchor (`besshi-buppyo-2-data.test.ts`)
| ID | 케이스 | 기대 | 기존 영향 |
|---|---|---|---|
| **B2-1** | fixture 5인(배우자·자2·손녀(legatee)·법인(corporate)) | `data.length === 3` (상속인만), `EXAMPLE_HEIRS.length===5`와 분리 | ❌ 갱신(현 `===5`) |
| **NH-1** | 비상속인 시트 미생성 | `data.find(granddaughter)`·`find(corporate)` === undefined | 신규 |
| **NH-2** | 상속인 시트 보존 | 배우자·son·son2 시트 존재, ⑥⑧ 값 불변 | 신규 |
| **NH-3** | ⑦ 분모 = 상속인만 | 배우자 actualShareRatio ≈ 3,300M ÷ Σ상속인(6,180M) ≈ 0.534, Σ⑦(상속인)=1 | 신규 |
| **B2-6** | legatee/corporate legalShareLabel null | **삭제/대체** → NH-1(미생성)로 | ❌ 갱신(byId crash) |
| **B2-9** | corp A22·spouse A21 사전증여 행 | corp 미생성 → **spouse A21만** 검증 | ❌ 갱신(corp 부분 제거) |
| **A-CORP** | legatee·corporate ⑧ | **삭제/대체** → NH-1 | ❌ 갱신(byId crash) |
| 기타(B2-2·3·4·5·7·8·10·11·12·13·14·15·A-*) | data 순회/배우자 기준 | 상속인 3인 순회 — 회귀 0 | 영향 없음 |

> `byId`(`:31`)가 `!`로 undefined 은폐 → 비상속인 id 조회 테스트는 crash. B2-6·A-CORP를 "미생성" 단언으로 대체.

---

## 5. 변경 파일 + 14 동기화 지점

| 파일 | 변경 |
|---|---|
| `lib/calc/heir-allocation-summary.ts` | `isStatutoryHeir` 헬퍼 신설 |
| `lib/calc/besshi-buppyo-2-data.ts` | `sorted.filter(isStatutoryHeir).map` (totalGross 전원 유지) |
| `lib/calc/inheritance-deduction-suggest.ts` | 인라인 3조건 → `isStatutoryHeir` 호출(단일 진실) |
| `components/.../BesshiBuppyo2Section.tsx` | `data.length===0` 시 `return null` |
| `__tests__/calc/besshi-buppyo-2-data.test.ts` | B2-1·B2-6·B2-9·A-CORP 갱신 + NH-1/2/3 신규 |

- **엔진·타입·Zod·route·validate·PDF 변경 0.** 14지점 중 **④(어댑터)·⑤⑦(표시)** 만. 신규 입력 0.

---

## 6. 확인 필요 (Do 진입 전)

| ID | 항목 | 기본 가정 |
|---|---|---|
| **D-1** | ⑦ 실제상속지분율 분모(`totalGross`) | ✅ **결정: 상속인만 합산** (2026-06-02). `sorted` filter가 totalGross에도 적용 → 배우자 ⑦ 49.4%→53.4%, 상속인 합=1 |
| **D-2** | 상속인 0명(전원 수유자·법인) 시 | 부표2 섹션 `return null`(미표시) |
| **D-3** | `deduction-suggest` 인라인→헬퍼 치환 범위 | 본 PR에서 동시 치환(단일 진실). 회귀 0 확인 |

---

## 7. 정책 준수

- **단일 진실** (`single-source-engine-helper`): `isStatutoryHeir` 1곳, 부표2·deduction-suggest 공유. 판정 중복 정의 금지.
- **enum exact 비교** (`feedback_enum_substring_match_forbidden`): `relation !== "legatee" && !== "corporate"` exact, substring 금지.
- **추정 금지**: 판정 기준은 `deduction-suggest.ts:277-285` 실측 인용. D-1(⑦ 분모)은 "확인 필요".
- 회귀 전수: 커밋 전 `npm test` 전체(B2-1·6·9·A-CORP 갱신 외 0).
</content>
