# 상속세 사전증여 수증자 단일화 — 설계 문서 (donee-redesign)

> Plan: `docs/00-pm/inheritance-prior-gift-donee-redesign.plan.md`
> 성격: 엔진 변경 0 (순수 매핑 헬퍼 2종 + 상속세 모드 UI 재구성). 폼 키·엔진 산식 불변.
> 대상 파일: `components/calc/prior-gift/GiftRowEditor.tsx` + 매핑 헬퍼 신규

---

## Context

상속세 모드 사전증여 행에서 `doneeRelation`(수증인과의 관계)·`doneeId`(수증자)·`isHeir`(상속인에게 증여) 3필드가 중복·역순. 도메인 규칙(증여인=피상속인 고정, 수증인=Step1 heirs 중 선택)에 따라 `doneeId` 단일 입력으로 통일하고 나머지를 파생.

---

## ★ 케이스 인벤토리 (필수 — 비면 Do 진입 금지)

| # | doneeId | Heir.relation | → isHeir | → beneficiaryType | → doneeRelation | UI 노출 | §13 |
|---|---|---|---|---|---|---|---|
| C1 | 선택 | spouse | true | heir | spouse | doneeId + 요약 | 10년 |
| C2 | 선택 | child | true | heir | lineal_descendant | doneeId + 요약 | 10년 |
| C3 | 선택 | lineal_ascendant | true | heir | lineal_ascendant_adult | doneeId + 요약 | 10년 |
| C4 | 선택 | legatee | false | legatee | undefined | doneeId + 요약 | 5년 |
| C5 | (영리법인) | corporate | false | corporate | undefined | 영리법인 토글 전담(select 제외) | 5년 |
| C6 | 미선택 | — | 수동 | 미설정 | 수동 | isHeir 토글 → doneeRelation select | 토글 |
| C7 | 선택 | sibling/other | true | heir | other_relative | doneeId + 요약 | 10년 |
| C8 | heirs 0 | — | 수동 | 미설정 | 수동 | C6과 동일 fallback | 토글 |

---

## 법령 근거

- §13①1호 (상속인 10년 합산) / §13①2호 (비상속인 5년 합산)
- §53 증여재산공제 (배우자 6억·직계존비속 5천(미성년 2천)·기타친족 1천)
- §3의2② + 집행기준 28-0-1 (영리법인 면제) — 영리법인 토글 전담

---

## 신규 헬퍼 (순수 함수 — 엔진/UI 공용 단일 진실)

### H1. `deriveDoneeRelationFromHeir(relation: HeirRelation): DonorRelation | undefined`

| 입력 relation | 출력 DonorRelation | §53 |
|---|---|---|
| spouse | spouse | 6억 |
| child | lineal_descendant | 5천(미성년 2천) |
| lineal_ascendant | lineal_ascendant_adult | 5천 |
| sibling / other | other_relative | 1천 |
| legatee / corporate | undefined | 공제 대상 아님 |

- exhaustive switch (7종) — 누락 시 TS `never` 경고.
- 미성년 직계존속(`lineal_ascendant_minor`)·미성년 직계비속은 본 PR 미도출 (성인 기준 제안값, 후속).

### H2. `deriveBeneficiaryTypeFromHeir(h: Heir): "heir" | "legatee" | "corporate"`

> ⚠️ **정정 (6차 검토 K)**: `relation`만 보면 기존 `deriveIsHeirFromHeir`(`h.isHeir` prop 우선)과 어긋남.
> `isHeir=false`인 일반 relation Heir에서 `isHeir=false` ↔ `beneficiaryType="heir"` 모순 →
> 엔진 cutoff(common:295 isHeir→5년) vs 분류(inheritance-tax:252 beneficiaryType="heir"→상속인) 충돌.
> **`Heir` 객체를 받아 `deriveIsHeirFromHeir`과 일관화**:

```ts
function deriveBeneficiaryTypeFromHeir(h: Heir): "heir" | "legatee" | "corporate" {
  if (h.relation === "corporate") return "corporate";
  if (!deriveIsHeirFromHeir(h)) return "legatee"; // legatee OR isHeir prop=false → 비상속인 5년
  return "heir";                                   // deriveIsHeirFromHeir=true → 상속인 10년
}
```

| Heir | deriveIsHeirFromHeir | → beneficiaryType |
|---|---|---|
| relation=corporate | false | corporate |
| relation=legatee | false | legatee |
| relation=spouse/child/… + isHeir 미설정 | true | heir |
| relation=spouse/child/… + isHeir=false (드묾) | false | legatee (일관) |

→ `isHeir`·`beneficiaryType` **항상 일관** (둘 다 deriveIsHeirFromHeir 기준).

배치: `lib/calc/prior-gift-donee-derive.ts` (신규, 순수) 또는 기존 `GiftRowEditor` 인접. UI·anchor 공용.

---

## UI 변경 명세 (`GiftRowEditor.tsx` — 상속세 모드 `showIsHeir=true` 전용)

### 렌더 순서 (영리법인 토글 OFF 기준)

```
헤더 (증여 N · 삭제 · 배지)
① 영리법인 토글 (showIsHeir)
② 증여일
③ 수증자 doneeId select  ← 신규 최상단 (corporate Heir 제외)
   ├─ doneeId 선택됨:
   │   └─ ④ 요약 배지 (read-only): "{관계라벨} ({이름}) · {상속인|비상속인} · §13①{1|2}호 {10|5}년 합산"
   └─ doneeId 미선택("선택 안 함"):
       ├─ ⑤ isHeir 토글 ("상속인에게 증여")     ← doneeRelation보다 위 (2차검토 G)
       └─ ⑥ doneeRelation select ("수증인과의 관계")
⑦ 증여재산가액
⑧ 기납부 증여세
⑨ 부표1 메타
```

영리법인 토글 ON(`isCorporate`) 시: ③④⑤⑥ 전부 숨김, `CorporateGiftFields`(자체 doneeId)만 (기존 동작).

### 조건부 렌더 규칙 표

| 컴포넌트 | 렌더 조건 |
|---|---|
| ③ doneeId select | `showIsHeir && !isCorporate && heirs.length > 0` |
| ③ select 옵션 | `heirs.filter(h => h.relation !== "corporate")` (corporate 제외) |
| ④ 요약 배지 | `showIsHeir && !isCorporate && !!gift.doneeId && !!matchedHeir` |
| ④' orphan 안내 | `showIsHeir && !isCorporate && !!gift.doneeId && !matchedHeir` |
| ⑤ isHeir 토글 | `showIsHeir && !isCorporate && !gift.doneeId` (미선택·heirs 0 시) |
| ⑥ doneeRelation select | `showIsHeir && !isCorporate && !gift.doneeId` (⑤와 동시, ⑤ 아래) |

> heirs.length===0 (C8): ③ 미노출 → !gift.doneeId 자동 true → ⑤⑥ 노출 (수동 경로). 별도 분기 불필요.

> ⚠️ **orphan doneeId 가드 (8차 검토 O)**: `matchedHeir = heirs.find(h => h.id === gift.doneeId)`.
> Step1에서 상속인 삭제 시 `gift.doneeId`는 남고 `matchedHeir`는 undefined가 됨.
> 이때 ④ 요약 배지(heir 정보 의존) 대신 **④' amber 안내** 노출:
> "⚠️ 지정한 수증자가 상속인 목록에서 삭제됨 — 수증자를 다시 선택하세요." (select는 value="" 표시).
> 엔진 측 orphan doneeId는 기존 정리 로직(`prune-orphan-heir`)이 처리하나, UI는 사용자 재선택 유도.
> select `value`는 `matchedHeir ? gift.doneeId : ""` 로 바인딩(없는 option value 방지).

### onChange (handleDoneeSelect) — 기존 함수(`GiftRowEditor.tsx:101`) 확장, 4필드 동시 patch

> 기존 `handleDoneeSelect`(`:101`)는 이미 `doneeId`+`isHeir` 동시 set 중(`:115`). **beneficiaryType·doneeRelation 2필드 추가**.

```ts
function handleDoneeSelect(heirId: string) {
  if (!heirId) { set({ doneeId: undefined }); return; }   // 미선택 — 수동 경로 복귀 (isHeir/doneeRelation 유지)
  const heir = (heirs ?? []).find((h) => h.id === heirId);
  if (!heir) { set({ doneeId: heirId }); return; }
  set({
    doneeId: heirId,
    isHeir: deriveIsHeirFromHeir(heir),                    // 기존(:114) — cutoff fallback 안전
    beneficiaryType: deriveBeneficiaryTypeFromHeir(heir),  // 신규 — 우월 키 (Heir 객체, isHeir 일관)
    doneeRelation: deriveDoneeRelationFromHeir(heir.relation),  // 신규 — §53 제안
  });
}
```

- useEffect → store 미러링 금지 ([[mirror-pattern]]). onChange 단일 지점 4필드 patch.
- corporate Heir는 select 옵션에서 제외되므로 handleDoneeSelect는 heir·legatee만 수신.

### ④ 요약 배지 표시 산식

```
관계라벨 = HEIR_RELATION_LABEL[heir.relation]   (배우자/자녀/직계존속/형제자매/기타/수유자)
이름     = heir.name
상속인구분 = beneficiaryType === "heir" ? "상속인" : "비상속인"
cutoff   = beneficiaryType === "heir" ? "§13①1호 10년" : "§13①2호 5년"
→ "{관계라벨} ({이름}) · {상속인구분} · {cutoff} 합산"
```

violet tone read-only 배지. doneeId 변경 시 자동 갱신(파생값이므로 별도 state 없음).

---

## Silent fallback / 자동 안분 후보 식별

- ❌ 자동 안분 없음. "선택 안 함"은 미입력 상태 — ② 인별 배부 0 + sky tone 안내(기존 유지).
- doneeId 미선택 시 isHeir·doneeRelation 수동 입력 (자동 채움 금지).
- doneeId 선택 시 파생 4필드는 **사용자 명시 액션(select)** 결과이므로 자동 안분 fallback 정책 위반 아님.

---

## 테스트 약속 (Pre-Do anchor 우선 — [[pre-do-anchor-verification]])

| anchor | 케이스 | 검증 |
|---|---|---|
| A1 | H1 매핑 7종 exhaustive | spouse→spouse … legatee/corporate→undefined |
| A2 | H2 매핑 | corporate→corporate, legatee→legatee, isHeir=false 일반→legatee, 그 외→heir (deriveIsHeirFromHeir 일관) |
| A3 | handleDoneeSelect (C1·C4) | doneeId 선택 → 4필드 동시 set (RTL) |
| A4 | C6·C8 회귀 | doneeId 미선택/heirs 0 → ⑤isHeir·⑥doneeRelation 노출 순서 |
| A5 | §53 제안 회귀 | doneeId 경로 set된 doneeRelation이 suggestPriorGiftDeductionTotal 반영 |
| A6 | C5 영리법인 | doneeId select 옵션에 corporate 미노출 + 토글 무변경 |
| A7 | 증여세 모드 회귀 | showGiftPhaseA=true → doneeRelation select 유지(§53 핵심) |
| A8 | orphan doneeId 가드 | doneeId 있고 matchedHeir 없음 → ④' amber 안내 노출 + select value="" |

---

## UI 통합 위임 (8지점 — UI 디자인 문서에서 상세)

엔진 input/result 변경 0이므로 14지점 중 ①~④·⑨~⑭ 무영향. 변경은 ⑤(UI 위젯)에 집중:
- ⑤ UI 위젯: 순서 재배치·조건부 렌더·요약 배지 (본 문서 핵심)
- ⑥ 사이드바: 무영향 (사전증여 합계는 giftAmount 기반, 불변)
- ⑦ 결과 카드: 무영향 (doneeId per-heir 배부는 기존 `41693d9`·`1debbda` 동작)
- ⑧ validation: "선택 안 함" 차단 안 함 (자동 안분 fallback 금지 정책)

상세 UI 명세는 `inheritance-prior-gift-donee-redesign.ui.design.md` 참조.
