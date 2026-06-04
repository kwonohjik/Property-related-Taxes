# 부표 5 영리법인 주주 명세 — ⑦ 구분 드롭다운 상속인 연동 (Plan)

> 작성 2026-06-05 · 세목: 상속세 · 조문: 상증법 §3의2② (mst 276123, 시행 20260102)
> 짝 문서(Do 진입 시): `docs/02-design/features/inheritance-corporate-shareholder-heir-dropdown.ui.design.md`
> 정책 참조: [[feedback_korean_law_citation_verify]] · [[mirror-pattern]] · [[feedback_store_default_vs_ui_display_fallback]] · [[feedback_api_zod_schema_sync]] · [[feedback_explicit_prop_mapping_strip]] · [[pre-do-anchor-verification]] · [[feedback_no_internal_id_in_result]]
> **설계 결정 확정 (사용자 2026-06-05)**: ⑦ 구분 드롭다운 = **법령 4종 전수** (입력된 상속인 이름 목록 + 상속인의 배우자 + 상속인의 직계비속 + 직계비속의 배우자). 구분 선택 시 **성명·주민등록번호 자동채움**.

---

## 0. 요약 (TL;DR)

부표 5(영리법인 면제 명세) "나. 상속인·직계비속 주주 명세"의 **⑦ 구분** 드롭다운을 개선한다.

- **현행**: 고정 4개 enum 옵션(상속인 / 상속인의 배우자 / 상속인의 직계비속 / 직계비속의 배우자). 사용자가 ⑧ 성명·⑨ 주민등록번호를 매번 수동 입력.
- **변경**: ⑦ 구분 드롭다운을 **2그룹 optgroup**으로 구성.
  - **그룹 1 — 입력된 상속인**: 폼에 입력된 자연인 상속인을 **이름으로 나열**(관계 라벨 병기, 예: `홍길동 (배우자)`). 선택 시 ⑧ 성명·⑨ 주민등록번호 **자동채움**.
  - **그룹 2 — 기타 관계**: 상속인의 배우자 / 상속인의 직계비속 / 직계비속의 배우자 (상속인이 *아닌* 친족 — 수동 입력).
- **법령 정합 핵심**: §3의2②의 "상속인"은 **폼에 입력된 상속인 그 자체**다(배우자·직계비속은 이미 상속인이므로 별도 generic 옵션 불필요 — 이름 목록으로 흡수). 나머지 3종은 상속인이 아닌 친족. **이 4종 외의 주주는 §3의2② 납세의무자가 아니므로 명세에서 제외**(외부 주주). "기타 친족" 같은 비법정 범주는 추가하지 않는다.
- **엔진 무변경**: 영리법인 면제 계산은 주주의 `id`·`shareRatio`만 사용. `relation`/`name`/`residentNumber`는 부표 5 신고서 표시 전용 → 본 작업은 **순수 UI + 표시 데이터 연동**이며 세액 결과는 불변.

---

## 1. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-05)

> 추정 인용 금지([[feedback_korean_law_citation_verify]]). 조문 전문 직접 조회로 확정.
> 상증법 mst=**276123**(공포 20251001, 시행 20260102).

### §3의2② (상속세 납부의무 — 영리법인 주주 환원) 원문

> ② 특별연고자 또는 수유자가 **영리법인**인 경우로서 그 영리법인의 주주 또는 출자자(이하 "주주등")  중 **상속인, 상속인의 배우자, 상속인의 직계비속 또는 그 직계비속의 배우자**가 있는 경우에는 대통령령으로 정하는 바에 따라 계산한 **지분상당액**을 그 [상속인, 상속인의 배우자, 상속인의 직계비속 또는 그 직계비속의 배우자]가 납부할 의무가 있다.

**확정 사실**:
1. 납세의무자(= 부표 5 주주 명세 행) 범위는 **정확히 4종**: 상속인 / 상속인의 배우자 / 상속인의 직계비속 / 직계비속의 배우자.
2. **"상속인"** 범주 = 그 상속(피상속인)의 실제 상속인 = 우리 폼의 입력된 상속인. (피상속인의 배우자·자녀는 민법상 상속인이므로 이 범주에 흡수됨 → 별도 generic "상속인" 옵션 불요.)
3. 위 4종에 해당하지 않는 주주(외부 주주·기타 친족)는 **납세의무 없음 → 명세에서 제외**. 비법정 "기타 친족" 범주는 신고서 ⑦ 구분에 표기할 근거가 없다.
4. 지분상당액(⑪) = `[면제세액(⑤) − 유증가액(④)×10%] × 지분율(⑩)` — `relation`·`name`과 무관.

---

## 2. 현행 구현 실측 (file:line 검증 완료)

| 구성요소 | 위치 | 현행 |
|---|---|---|
| 타입 `ShareholderInfo` | `lib/tax-engine/types/inheritance-gift.types.ts:658-678` | `relation`(4-enum)·`name`·`residentNumber?`·`shareRatio`·`id` |
| 주주 입력 UI | `components/calc/inheritance/CorporateHeirFields.tsx:13-18, 46-62` | `SHAREHOLDER_RELATION_LABEL` 고정 4-enum `<select>`, 성명·주민번호 수동 `<input>` |
| 상속인 목록 보유 | `components/calc/HeirComposition.tsx:511, 549` | `heirs: Heir[]` 보유. `HeirEditor`에 `heir`만 전달(목록 미전달) |
| CorporateHeirFields 호출 | `HeirComposition.tsx:383` | `<CorporateHeirFields heir={heir} set={set} />` — **상속인 목록 미주입** |
| Zod 스키마 | `lib/validators/property-valuation-input.ts:486-509` | shareholders 배열(relation 4-enum, name `min(1)`, shareRatio `0~1`, 합 ≤1 refine) |
| 결과 표시 | `components/calc/results/CorporateExemptionSection.tsx:39-44, 293/295/297` | `SHAREHOLDER_RELATION_LABEL[sh.relation]` + `sh.name` + `sh.residentNumber` |
| 엔진 계산 | `lib/tax-engine/inheritance-corporate-exemption.ts:171-177` | `sh.id`·`sh.shareRatio`만 사용 (relation·name 미사용) |
| 엔진 input 조립 | `lib/tax-engine/inheritance-tax.ts:612` | `corporateHeir?.shareholders ?? []` 그대로 전달 |
| API 변환 | `lib/calc/inheritance-api.ts` | shareholders 미참조 — Heir 객체 통째 spread (Zod가 strip 게이트) |

**핵심 결론**: 엔진·API 변환·validate 합 검증은 무변경. 변경은 (a) 타입에 상속인 참조 필드 1개 추가, (b) Zod에 동 필드 추가(침묵 strip 방지), (c) UI 드롭다운 재구성 + 상속인 목록 thread, (d) 결과 표시 보강(선택).

---

## 3. 변경 설계

### 3-1. 데이터 모델 — `heirRef` 추가 (추천안)

`ShareholderInfo`에 입력 상속인 참조 필드를 추가한다:

```ts
export interface ShareholderInfo {
  id: string;
  relation: "heir" | "heir_spouse" | "lineal_descendant_of_heir" | "spouse_of_lineal_descendant";
  /** ⑦에서 "입력된 상속인"을 선택한 경우 그 Heir.id. 미설정 = 기타 관계(수동 입력). */
  heirRef?: string;          // ← 신규
  name: string;
  residentNumber?: string;
  shareRatio: number;
}
```

**드롭다운 ⑦ 동작**:
- 그룹 1(입력된 상속인) 옵션 선택 → `set({ heirRef: heir.id, relation: "heir", name: heir.name?.trim() || RELATION_LABELS[heir.relation], residentNumber: heir.residentNumber })`
  (선택 시점에 성명·주민번호를 **스냅샷 복사** — 신고서 안정성 확보. 동시에 `heirRef` 보관. ⚠️ 이름 미입력 상속인은 **관계 라벨로 fallback** 저장 — Zod `name.min(1)` 위반 방지(D-3 정합). 빈 문자열 저장 금지.)
- 그룹 2(기타 관계) 옵션 선택 → `set({ heirRef: undefined, relation: <선택값>, name: "", residentNumber: undefined })` (수동 입력 활성. ⑧ 성명 미입력 시 validate 차단).

**표시 단일 진실 ([[mirror-pattern]])**: ⑧⑨ 표시값은 `heirRef`가 살아 있으면 **연결된 상속인의 현재값을 live-derive**, 없으면 스냅샷(`sh.name`) fallback:
```ts
const linked = heirRef ? allHeirs.find(h => h.id === sh.heirRef) : undefined;
const displayName = linked?.name ?? sh.name;          // 상속인 이름 수정 시 자동 반영
const displayRrn  = linked?.residentNumber ?? sh.residentNumber;
```
- `heirRef` 설정 시 ⑧⑨ 입력칸은 **read-only**(자동채움, 사용자 수정 불가) — 데이터 일관성 우선.
- 상속인이 나중에 삭제되면 `heirRef` dangling → 스냅샷값으로 graceful 표시(행 유지, 경고 배지).

> **대안(미채택)**: `heirRef` 없이 선택 즉시 name/rrn만 복사하고 relation="heir" 고정. 단순하지만 (a) 어느 상속인을 가리키는지 추적 불가, (b) 상속인 이름 수정 시 stale. → `heirRef` 보관안 채택.

### 3-2. 드롭다운 UI (CorporateHeirFields.tsx)

```
⑦ 구분 ▼
┌──────────────────────────┐
│ ── 입력된 상속인 ──         │  ← <optgroup label="입력된 상속인">
│   홍길동 (배우자)           │     value="heir:<id>"
│   김철수 (자녀)             │
│   이영희 (자녀)             │
│ ── 기타 관계 ──            │  ← <optgroup label="기타 관계">
│   상속인의 배우자           │     value="heir_spouse"
│   상속인의 직계비속         │     value="lineal_descendant_of_heir"
│   직계비속의 배우자         │     value="spouse_of_lineal_descendant"
└──────────────────────────┘
```

- **공유 상수 모듈 신설 (구조 — G1)**: 필요한 라벨·집합(`RELATION_LABELS`·`HEIR_RELATIONS`·`SPECIAL_RELATIONS`)이 `HeirComposition.tsx:25/55/64`에 **모두 미export `const`**이고, `RELATION_LABELS`는 `gift-tax-form-shared.tsx:84`(`DonorRelation`용)와 **동명 충돌**. → 3개 const ad-hoc export 대신 **`components/calc/inheritance/heir-relation-meta.ts`** 신설: 충돌 회피명 `HEIR_RELATION_LABELS: Record<HeirRelation,string>` + `HEIR_RELATIONS` + `SPECIAL_RELATIONS` export. `HeirComposition`·`CorporateHeirFields` 양쪽이 import(HeirComposition 내부 const는 re-export 또는 치환). 잘못된 상수명 `HEIR_RELATION_LABEL`(단수) 사용 금지 — 실존 안 함.
- **그룹 1 대상 상속인 필터** (엔진 패턴 정합 — `inheritance-tax.ts:664` "corporate·legatee·isHeir=false 제외"): 자연인 상속인만 = `HEIR_RELATIONS.includes(heir.relation) && heir.isHeir !== false`. `HEIR_RELATIONS = ["spouse","child","lineal_ascendant","sibling","other"]`는 `SPECIAL_RELATIONS = ["legatee","corporate"]`를 **이미 둘 다 제외**. 즉 corporate·legatee 모두 그룹1 비대상. `legatee` 포함 여부는 §4 D-1 결정사항(기본 제외 = 본 필터).
- 옵션 라벨 문자열: `${heir.name?.trim() || HEIR_RELATION_LABELS[heir.relation]} (${HEIR_RELATION_LABELS[heir.relation]})` — 이름 미입력 상속인은 관계 라벨로 fallback ([[feedback_no_internal_id_in_result]] 준수, `heir-…` id 노출 금지).
- 그룹 1이 비어 있으면(입력된 자연인 상속인 0명) optgroup 생략, 그룹 2만 노출 + "상속인을 먼저 추가하면 자동채움됩니다" hint.
- `<select>` value 인코딩: 그룹1 = `"heir:" + heir.id`, 그룹2 = enum 그대로. onChange에서 `value.startsWith("heir:")`면 `value.slice(5)`로 id 추출(Heir id는 `heir-<ts>-<n>` 형식 — 콜론 미포함, 파싱 안전). 그룹2는 enum 직접 매칭.
- controlled select **value 바인딩**(G3): `value={sh.heirRef ? "heir:" + sh.heirRef : sh.relation}` — 연결 행은 해당 상속인 옵션, 미연결 행은 enum 옵션이 선택 상태로 복원. legacy 미연결 heir 행(§3-5)은 어느 옵션과도 미매칭 → placeholder 빈 옵션 표시.
- **⑦ 라벨 vs 신고서 표기 차이 (의도)**: 드롭다운은 "홍길동 (배우자)"로 표시하지만, 부표 5 신고서 ⑦ 구분 칸은 §3의2② **법정 범주 "상속인"**(`SHAREHOLDER_RELATION_LABEL["heir"]`)으로 출력된다. 드롭다운=사람 선택 편의, 신고서=법정 구분 — **의도된 차이**(향후 버그 오인 금지).

### 3-3. 상속인 목록 thread (HeirComposition → CorporateHeirFields)

- `HeirComposition`(`heirs` 보유) → `HeirEditor`에 `allHeirs={heirs}` 추가 전달 (line 549 map).
- `HeirEditor` 시그니처에 `allHeirs: Heir[]` 추가 → `<CorporateHeirFields heir={heir} set={set} allHeirs={allHeirs} />` (line 383).
- `CorporateHeirFields` props에 `allHeirs: Heir[]` 추가. 자기 자신(corporate heir) 제외 + 자연인 필터링은 컴포넌트 내부에서.

### 3-4. 신규 주주 추가 기본값

- `addShareholder()` 기존 기본값은 `relation: "heir"`(`CorporateHeirFields.tsx:168`, heirRef 없음). 신 드롭다운엔 generic "상속인" 옵션이 없으므로 이 기본값은 **표현 불가** → 변경 필수.
- 신 기본값: 입력된 자연인 상속인(§3-2 필터)이 ≥1명이면 **첫 상속인 자동 연결**(`heirRef` + 스냅샷), 없으면 `relation: "heir_spouse"` 수동 모드로 시작. ([[feedback_store_default_vs_ui_display_fallback]] — factory·normalize·UI 3중 일치.)

### 3-5. Legacy 데이터 마이그레이션 (normalize)

기존 sessionStorage에 저장된 주주 행은 `relation: "heir"`이면서 `heirRef`가 없을 수 있다(구 default). 신 드롭다운엔 매칭 옵션이 없어 `<select>` value가 미매칭 → 브라우저가 첫 옵션으로 silent 대체될 위험(데이터 깨짐). normalize에서 처리:

1. `relation === "heir" && !heirRef`인 행 → 저장된 `name`으로 입력 상속인 목록 **name-match 시도** → 매칭되면 `heirRef` 자동 보강.
2. name-match 실패 → 행 유지하되 ⑦ 셀에 **"상속인 (미연결)" 경고 배지** + 드롭다운 placeholder(빈 선택)로 재선택 유도. 자동 행 삭제·강제 enum 변환 금지.
3. `heir_spouse`/`lineal_descendant_of_heir`/`spouse_of_lineal_descendant` 기존 행 → 무변경(하위호환).

> **name-match edge (영향 낮음)**: 동명이인 상속인은 첫 매칭으로 link, 무명(이름 미입력) 상속인은 매칭 불가 → 모두 "미연결" 경고로 graceful 처리. `heirRef`는 **표시 전용**(엔진 id·shareRatio만 사용)이라 잘못 link돼도 세액 영향 0 — 사용자 재선택으로 정정.

---

## 4. 결정 필요 사항 (Design 단계 확정)

| # | 항목 | 기본안 | 비고 |
|---|---|---|---|
| D-1 | 그룹1에 `legatee`(수유자) 포함? | **제외** | §3의2②는 "상속인" 명시. 수유자는 §3의2①로 직접 과세. 단, 수유자가 영리법인 주주인 edge 존재 → 사용자 확인 |
| D-2 | `heirRef` 연결 시 ⑧⑨ read-only? | **read-only(자동채움 잠금)** | 일관성 우선. "수정 허용"으로 전환 가능 |
| D-3 | 이름 없는 상속인 선택 시 Zod `name.min(1)` | name fallback = 관계 라벨로 채워 통과 | 빈 문자열 저장 금지 |
| D-4 | 상속인 삭제로 dangling `heirRef` | 스냅샷 표시 + 경고 배지, 행 유지 | 자동 행 삭제 금지 |
| D-5 | legacy `relation:"heir"` + heirRef 없는 저장 행 | name-match로 heirRef 보강, 실패 시 "미연결" 경고 + 재선택 유도 (§3-5) | normalize 처리. 강제 enum 변환 금지 |

---

## 5. Touch Point 동기화 (상속세 — 8 클라이언트 + API)

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 타입 `ShareholderInfo` | `types/inheritance-gift.types.ts:658` | `heirRef?: string` 추가 |
| ② | initial / factory | `CorporateHeirFields.tsx` `addShareholder` | 기본 상속인 자동 연결 (§3-4) |
| ③ | normalize | (sessionStorage 호환) | `heirRef` optional + **legacy `relation:"heir"` 행 name-match 마이그레이션**(§3-5) — 단순 무영향 아님 |
| ④ | API 변환 | `lib/calc/inheritance-api.ts` | Heir spread 경유 — 무변경(Zod가 통과 게이트) |
| ⑤ | UI 위젯 | `CorporateHeirFields.tsx` + `HeirComposition.tsx`(thread `allHeirs`) + `HeirEditor`(props 추가) | optgroup 드롭다운·자동채움·read-only·목록 주입 |
| ⑥ | 사이드바 합계 | — | 해당 없음 (지분율 합만 기존 표시 유지) |
| ⑦ | 결과 카드 | `CorporateExemptionSection.tsx:293/295/297` | 연결 상속인 live name **권장 반영** — `heirs?` prop + `heirById`(line 50/70) **이미 보유** → `heirById.get(sh.heirRef)?.name ?? sh.name`. 추가 threading 불요 |
| ⑧ | Validation | `property-valuation-input.ts:486` Zod | `heirRef: z.string().optional()` 추가 (⚠️ 침묵 strip 방지) + name fallback(D-3). **cross-field refine 금지** — `relation==="heir"`라도 `heirRef` 필수화하지 않음(legacy 미연결 행 하위호환, §3-5) |
| ⑨ | 엔진 input | `inheritance-tax.ts:612` / `inheritance-corporate-exemption.ts` | **무변경** (id·shareRatio만 사용) |

**⚠️ 침묵 strip 경고** ([[feedback_api_zod_schema_sync]] · [[feedback_explicit_prop_mapping_strip]]): `heirRef`를 Zod shareholders 객체에 추가하지 않으면 `z.object`가 **침묵 strip** → API 왕복 후 소실. ⑧ 필수.

---

## 6. 케이스 인벤토리 (Do 진입 전 행≥1 필수)

| # | 시나리오 | ⑦ 선택 | 기대 ⑧⑨ | 기대 relation/heirRef | 세액 영향 |
|---|---|---|---|---|---|
| C-1 | 입력 상속인(배우자) 연결 | `heir:<배우자 id>` | 배우자 성명·주민번호 자동·read-only | relation=heir, heirRef set | 불변 |
| C-2 | 입력 상속인(자녀) 연결 | `heir:<자녀 id>` | 자녀 성명·주민번호 자동 | relation=heir, heirRef set | 불변 |
| C-3 | 상속인의 배우자(수동) | `heir_spouse` | 빈칸·수동 입력 | relation=heir_spouse, heirRef undefined | 불변 |
| C-4 | 상속인의 직계비속(수동) | `lineal_descendant_of_heir` | 수동 | 〃 | 불변 |
| C-5 | 직계비속의 배우자(수동) | `spouse_of_lineal_descendant` | 수동 | 〃 | 불변 |
| C-6 | 입력 상속인 0명 | 그룹1 생략, 그룹2만 | 수동 | — | 불변 |
| C-7 | 이름 없는 상속인 연결(D-3) | `heir:<id>` | name fallback=관계 라벨 | Zod 통과 | 불변 |
| C-8 | 연결 후 상속인 삭제(D-4) | dangling | 스냅샷 + 경고 배지 | heirRef dangling | 불변 |
| C-9 | 지분율 합 >100% | 임의 | 기존 refine 경고 유지 | — | (검증 차단) |

---

## 7. Anchor 계획 ([[pre-do-anchor-verification]])

> **Pre-Do 우선 anchor 1건**: C-1(상속인 연결 → 자동채움 + Zod 왕복 시 `heirRef` 보존)을 먼저 실패 확보 후 구현.

- `__tests__/lib/validators/corporate-shareholder-heir-link.test.ts` (Zod — 기존 패턴 `estate-item-schema-roundtrip.test.ts`·`inheritance-deduction-schema-preserve.test.ts`와 동일 위치):
  - `heirRef` 포함 shareholder가 parse 후 **보존**(strip 안 됨) — C-1
  - `heirRef` 없는 기존 데이터 정상 통과(하위호환) — C-3
  - name fallback: 이름 없는 상속인 연결 시 `name.min(1)` 통과 — C-7
- `__tests__/tax-engine/inheritance/corporate-exemption-per-corporate.test.ts`(기존 파일) 회귀: 기존 anchor 전수 **세액 불변** 확인 (relation·heirRef 추가가 계산 무영향) — C-1~C-9 세액 동일.
- 컴포넌트(RTL) `__tests__/components/calc/results/corporate-exemption-section.test.tsx`(기존) + 신규 CorporateHeirFields 테스트: optgroup 2그룹 렌더 + 상속인 옵션 선택 시 ⑧⑨ 자동채움 read-only — C-1/C-6.
- 전체 회귀: `npm test` (공유 모듈 영향 — Do 시점 PASS 총수 측정·유지. 회귀 0건이 게이트이며 stale 숫자 단정 금지).

---

## 8. 리스크 / 회피

- **R-1 침묵 strip**: `heirRef` Zod 누락 → API 왕복 소실. → ⑧에 추가 + anchor로 왕복 보존 검증(C-1).
- **R-2 stale 이름**: 스냅샷만 쓰면 상속인 이름 수정 시 불일치. → live-derive + 스냅샷 fallback(§3-1).
- **R-3 dangling ref**: 상속인 삭제. → 경고 배지 + 행 유지, 자동 삭제 금지(D-4).
- **R-4 id 노출**: 옵션/결과에 `heir-...` id 노출 금지([[feedback_no_internal_id_in_result]]) → 이름·관계 라벨만.
- **R-5 세액 변동**: 엔진 무변경 보장 — relation/name/heirRef 모두 계산 비참조. anchor로 불변 lock(§7).

---

## 9. 작업 순서 (PDCA Do — 시퀀셜)

1. (엔진 시니어 영역) 타입 `heirRef?` 추가(①) + Zod `heirRef`(cross-field refine 없음) + name fallback(⑧) + Pre-Do anchor C-1 실패 확보.
2. (UI 시니어 영역) 공유 상수 모듈 `heir-relation-meta.ts` 신설(§3-2 G1) → 상속인 목록 thread(⑤: HeirComposition→HeirEditor→CorporateHeirFields) → optgroup 드롭다운 + 자동채움 + read-only + addShareholder 기본값(②) + **legacy 행 normalize 마이그레이션(§3-5, ③)**.
3. 결과 표시 live-derive(⑦, 권장 — `heirById` 기보유) — 미적용해도 스냅샷 동작.
4. Check: `ui-engine-sync-checker`(8지점) + `tax-qa-lead`(상속세) + 브라우저(Playwright E2E: 옵션 선택→자동채움→Network body `heirRef` 확인).
5. Act: 회귀 0건 확인 후 디자인 환류.

**완료 게이트**: 케이스 C-1~C-9 anchor GREEN · `npx tsc --noEmit` 0 · `npm test` 회귀 0 · 브라우저 E2E 통과.
