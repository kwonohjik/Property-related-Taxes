# 사전증여 수증자 "기타" 상속인 오판정 + 모달 요약 삭제 수정 계획

> 상태: Plan (코드 미수정) · 작성 2026-06-13
> 발견 경로: 사전증여 테이블+모달 전환([[prior-gift-table-view.plan.md]]) 후 사용자 화면 검토
> 권장: **이슈 1·2는 테이블 전환 PR(feat/prior-gift-table-modal)과 분리한 별도 PR** — 이슈 1은 Step1 상속인 구성·엔진 §13 판정 영역으로 테이블 전환과 무관

---

## 이슈 1 — "기타(other)" 수증자가 상속인(§13①1호 10년)으로 오판정 ★ 핵심

### 현상
수증자 select에서 "기타 (윤며느리)" 선택 → 배지 **"기타 (윤며느리) · 상속인 · §13①1호 10년 합산"**.
며느리는 민법상 상속인이 아니므로 **비상속인 → §13①2호 5년**이어야 함.

### 원인 (실측)
| 지점 | 파일:line | 동작 |
|---|---|---|
| 비상속인 판정 | `lib/calc/prior-gift-donee-derive.ts:22-24` | `isNonHeirRelation` = `legatee`·`corporate`만 true. **"other"는 false**(상속인 취급) |
| isHeir 추론 | `:30-33` | `h.isHeir` 미설정 시 `!isNonHeirRelation(relation)` → "other"는 `true`(상속인) |
| beneficiaryType | `:48-56` | `deriveIsHeirFromHeir=true` → "heir" → §13①1호 10년 |
| 추가 시 isHeir | `components/calc/HeirComposition.tsx:152-159` `handleAdd` | "기타(other)" 추가 시 `isHeir` **미설정**(undefined) → 위 추론으로 상속인 |

→ Step1에서 "기타(other)"로 추가한 Heir는 `isHeir` 미설정 → 수증자 지정 시 `deriveBeneficiaryTypeFromHeir`="heir" → 10년.

### 영향 범위 분석 (수정 안전성 — 버그 과대주장 금지 검증 완료)
- **`isHeir === false`는 이미 전 엔진의 일관된 "비상속인" 게이트**:
  - 법정상속분: `lib/tax-engine/inheritance-legal-share.ts:38` — `h.isHeir !== false` 조건으로 **isHeir=false 제외**.
  - §13 가산: `lib/tax-engine/inheritance-tax.ts:296` — `beneficiaryType==="heir" || (undefined && g.isHeir)` 판정. isHeir=false면 가산 제외(비상속인 5년 경로).
- **대습상속인은 영향 없음**: `HeirComposition.tsx:161-165` `handleAddSubstitute`도 `relation="other"`지만 `substituteGroupId` 발급 + `isHeir` 미설정 → `isHeir !== false`로 상속인 유지(`inheritance-legal-share.ts:137` 동일 게이트).
- ★ **트레이드오프 — 4촌 이내 방계혈족(상속 4순위)**: picker "상속인" 2단계는 4종(spouse·child·lineal_ascendant·sibling)뿐 → **4순위 방계는 "기타"로 입력할 수밖에 없음**. "기타"를 일괄 비상속인으로 강제하면 이들이 깨짐([[feedback_design_law_cases]] 법령 케이스 전수).
- **HeirEditor에 isHeir 입력 UI 없음**: `components/calc/HeirEditor.tsx:149-175` — relation 변경만 제공, 상속인 여부 직접 입력 없음.

### 수정 방향 — ✅ 옵션 A 확정 (사용자 결정 2026-06-13)

**옵션 A — "기타" 기본 비상속인 + HeirEditor 상속인 토글**
- `HeirComposition.tsx:152` `handleAdd`: `relation==="other"`일 때 `isHeir: false` 기본 설정.
- `HeirEditor.tsx`: "기타" 관계 Heir 편집 시 **"상속인 여부" ToggleCard** 신설(4순위 방계 등 상속인 = ON, `isHeir: true` 명시 set). `ToggleCard` 사용([[feedback_toggle_card_visibility]], tone violet, OFF=비상속인 5년 / ON=상속인 10년).
- ★ **토글 노출 조건 = `relation==="other" && !substituteGroupId`** — 대습상속인(relation="other" 공유)은 항상 상속인이므로 토글 미노출(비상속인 오설정 차단). 다른 관계도 미노출(relation 자동 판정 — 노이즈 방지).
- ★ **`changeHeirRelation`(HeirEditor.tsx:55) isHeir 전이 규칙 추가 (Critical — 1회차 검토 #1)**: 현행 함수는 isHeir를 전혀 처리하지 않음(실측). 전이 규칙 없으면 ① 자녀→"기타" 변경 시 isHeir 미설정 잔존(상속인 추론 — handleAdd 기본값 우회) ② "기타"(isHeir=false)→자녀 변경 시 **false 잔존 → 자녀가 §13 5년·법정상속분 제외 처리(치명)**. 규칙: `newRelation==="other"` 진입 시 `isHeir=false` / "other" 이탈 시 `isHeir=undefined`(관계 추론 복원). 기존 정리 패턴(substituteGroupId 등 `:102-107`) 동형.
- 장점: 일반 케이스(며느리·사위 등) 자동 5년 + 4순위 방계 수동 상속인 지원. 법령 케이스 전수 충족([[feedback_design_law_cases]]).
- 동기화: 토글 onChange → `Heir.isHeir` 직접 set(useEffect 미러링 금지 [[feedback_useeffect_store_mirror_forbidden]]).
- **기존 엔진 anchor가 이 데이터 모델의 증거**: `__tests__/tax-engine/inheritance/non-heir-prior-gift-allocation.test.ts:52-57`이 이미 `{relation:"other", isHeir:false}`=윤며느리(비상속인), `:108-109` isHeir 미설정 "other"=사촌(방계 상속인)으로 모델링 — **엔진·derive는 이미 정답, 갭은 UI 입력 경로뿐**.

**(미채택) 옵션 B — "기타"=항상 비상속인**: 4순위 방계 미지원으로 탈락.
**(미채택) 옵션 C — 사전증여에서만 조정**: §13·법정상속분 단일 진실(Heir.isHeir)과 dual-truth 위험으로 탈락.

### 영향 지점 (수정 시 동기화)
1. `HeirComposition.tsx:152` `handleAdd` — "기타" isHeir=false 기본값.
2. `HeirEditor.tsx` — isHeir 토글 UI(`relation==="other" && !substituteGroupId` 한정) + `changeHeirRelation` isHeir 전이 규칙(진입 false / 이탈 undefined).
3. `prior-gift-donee-derive.ts` — **무변경**(isHeir prop 우선 로직이 이미 올바름. isHeir=false면 자동 비상속인).
4. ★ `GiftRowEditor.tsx:264` 수증자 select 옵션 라벨 — `isNonHeirRelation(h.relation)`(relation 기반) → "기타"+isHeir=false도 "— 비상속인" 미표시. 요약 배지(`:282` derive 기반 "비상속인 5년")와 **동일 화면 표시 모순** → `!deriveIsHeirFromHeir(h)`로 교체(corporate 제외 조건 유지). 교체 후 `isNonHeirRelation` UI 사용처 0(실측: GiftRowEditor:264 단일) → import 수동 제거([[feedback_800line_split_export_preservation]] --fix 함정 — 한 라인 한 named).
5. ★ `lib/tax-engine/deductions/inheritance-deductions.ts:457` — `realHeirs` 필터가 relation 기반(legatee·corporate만 제외). isHeir=false "기타"가 §21② 배우자단독 판정(`:460` isSpouseOnly)에 포함되어 legal-share 게이트(`inheritance-legal-share.ts:38`)와 **엔진 내 게이트 불일치**. `h.isHeir !== false` 추가 검토 — **numeric 영향은 Pre-Do anchor로 실증 후 수정 판단**([[feedback_numeric_impact_verify_before_bug_claim]]: 배우자+비상속인기타만 구성 시 isSpouseOnly 변화 → §21 일괄공제 5억 허용/배제 차이 가능).
6. (선택) `HeirTableView.tsx` — "기타" 행에 상속인/비상속인 상태 배지(토글 결과 한눈 식별).
7. 검증: 기존 anchor 회귀 — `non-heir-prior-gift-allocation.test.ts`(데이터 모델 증거·무변경 기대) · `inheritance-change-heir-relation.test.ts:84`(other→legatee 전이 — 전이 규칙 추가로 갱신 대상) · `substitute-heir-*.test.ts`(대습 회귀). 신규 anchor: "기타" 추가 기본 5년·법정상속분 제외 / 토글 ON 10년·법정상속분 포함 / 자녀→기타→자녀 왕복 시 isHeir undefined 복원.
8. **기존 sessionStorage 데이터 — 마이그레이션 불필요** (아래 §기존 데이터 정책).
9. (기존 동작 명시) `inheritance-validate.ts:336` — heirs.length 기반 차단만 존재. "기타" 1명(비상속인)뿐이면 통과·법정상속분 빈 집합 = legatee-only 구성과 동일한 기존 동작. 신규 차단 불필요.

### 기존 데이터 정책 — ✅ 마이그레이션 불필요
- 신규 "기타" 추가만 `isHeir=false` 기본. **기존 sessionStorage "기타" Heir(isHeir 미설정)는 무변경** → 여전히 상속인 추론.
- 단 옵션 A의 HeirEditor 토글로 **기존 "기타" Heir도 편집 카드에서 비상속인으로 전환 가능** → normalize 일괄 마이그레이션(파괴적·4순위 방계 의도 데이터 훼손 위험) 불필요.
- ★ 토글 checked는 `deriveIsHeirFromHeir(heir)` **derive 기반** — 기존 "기타"(undefined)는 ON으로 표시(추론=상속인과 일치). `=== true` 비교 시 undefined가 OFF 표시되어 표시↔실제 모순([[feedback_store_default_vs_ui_display_fallback]]).
- 화면의 윤며느리(기존 데이터): 편집 카드 토글 OFF 또는 삭제 후 재추가로 해소.

---

## 이슈 2 — 모달 하단 "증여가액" 요약 삭제 (단순)

### 현상
편집 모달 맨 하단에 "증여가액 250,000,000" 요약 미리보기. 불필요(DialogTitle + 사이드바 `AggregationSummary` 합계로 충분).

### 수정
- `components/calc/prior-gift/GiftRowEditor.tsx` 끝부분 요약 블록 삭제:
  ```tsx
  {/* 요약 미리보기 */}
  {gift.giftAmount > 0 && (
    <div className="...flex justify-between">
      <span>증여가액</span>
      <span>{formatKRW(gift.giftAmount)}</span>
    </div>
  )}
  ```
- `formatKRW` import 제거(`CurrencyInput` import 블록 — 삭제 후 미사용. 한 named만 제거, [[feedback_800line_split_export_preservation]] --fix 함정 주의).
- 검증: tsc 0 · 사전증여 E2E 회귀(요약 블록 의존 spec 없음 확인).

### 영향
- 카드/모달 공통 렌더라 **전체 삭제**(증여세 모드 포함). 사이드바 합계가 대체.
- 엔진·타입·API 무관(순수 표시 제거).

---

## 작업 순서 (승인 후)
1. 이슈 1 옵션 확정(A/B) + 기존 데이터 정책.
2. (이슈 1) Pre-Do anchor: "기타" isHeir=false → 5년·법정상속분 제외 / 4순위 방계 isHeir=true → 상속인. 먼저 실패 확보.
3. 이슈 1 구현 (HeirComposition + 옵션 A 시 HeirEditor 토글).
4. 이슈 2 구현 (GiftRowEditor 요약 삭제).
5. 검증: tsc · lint · inheritance vitest 회귀 · 신규 anchor · E2E(기타 수증자 5년 배지 / 4순위 방계).
6. 별도 PR(feat/prior-gift-donee-classification 등)로 ship.
