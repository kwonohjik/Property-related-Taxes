# 상속세 사전증여 입력 재설계 — 수증자 단일화 (donee-redesign)

> 작성: 2026-05-31 · 대상: 상속세 모드 사전증여 행 입력 (`GiftRowEditor.tsx`)
> 트리거: 사용자 지적 (이미지 21~23) — 수증인과의 관계·수증자·상속인에게 증여 3필드의 중복·순서 역전·증여세 전용 필드 노출

---

## 1. 도메인 규칙 (사용자 확정 — 설계의 단일 기준)

상속세 모드에서 사전증여 행에 입력되는 항목의 **불변 규칙**:

1. **증여인(donor)은 항상 피상속인(decedent)**.
   - 사전증여 = 피상속인이 생전에 한 증여. 증여자는 자명하므로 **입력 불필요**.
2. **수증인(donee)은 상속인 또는 상속인 외의 자** — 모두 **Step1에서 입력한 상속인 등(`heirs[]`)** 중에서 선택.
   - 상속인(spouse·child·lineal_ascendant·sibling·other) + 비상속인(legatee 수유자·corporate 영리법인)이 모두 Step1 `heirs[]`에 들어 있음.
   - 따라서 수증인 지정은 **`doneeId` select(Step1 heirs 목록) 하나로 충분**.
3. 수증인과의 관계·상속인 여부는 **선택된 `doneeId`의 `Heir.relation`에서 전부 자동 도출** 가능.

> 결론: 상속세 모드 사전증여에서 사용자가 직접 입력할 "수증인" 관련 항목은 **`doneeId`(Step1 heirs 선택) 단 하나**. 나머지(`doneeRelation`·`isHeir`)는 파생.

---

## 2. 현행 구조의 문제 (정밀 분석 결과)

### 2.1 네 필드의 실제 엔진 역할 (실측 — `PriorGift` 타입·엔진 grep 확인)

| UI 필드 | 폼 키 | 타입 | 엔진 사용처 | 본질 |
|---|---|---|---|---|
| 수증인과의 관계 | `doneeRelation` | `DonorRelation` (배우자/직계존속(성인)/직계존속(미성년)/직계비속/기타친족) | `inheritance-deduction-suggest.ts:198` §53 증여재산공제 **제안값** | **증여세 모드 전용 레거시** |
| 수증자(상속인·수유자) | `doneeId` | `Heir.id` | `inheritance-tax.ts:257`(배우자 합산)·`inheritance-allocation.ts:247`(인별 배부) | 상속세 인별 배부 키 |
| 상속인에게 증여 | `isHeir` | `boolean` (`@deprecated`) | `inheritance-gift-common.ts:295`·`inheritance-gift-tax-credit.ts:180` §13 cutoff(10/5년) | §13 합산 게이트 (레거시) |
| (UI 비노출) | `beneficiaryType` | `"heir"\|"legatee"\|"corporate"` | `inheritance-tax.ts:252` (`beneficiaryType==="heir"` 우선, undefined 시 `isHeir` fallback) | **§13 분류 우월 키** |

> ⚠️ **중대 — `beneficiaryType` 누락 금지** (1차 검토 정정): `PriorGift.beneficiaryType`(타입 48행)은 `isHeir`(`@deprecated` 17행)를 대체하는 우월 키.
> 엔진 `inheritance-tax.ts:252`는 `g.beneficiaryType === "heir" || (g.beneficiaryType === undefined && g.isHeir)`로 판정.
> **`doneeId` 선택 시 `isHeir`·`doneeRelation`뿐 아니라 `beneficiaryType`도 동시 도출**해야 cutoff·합산이 일관됨.
> 단 `isHeir`도 일부 엔진(`common.ts:295` cutoff·`credit:180`)이 여전히 직접 읽으므로 **둘 다 set**(이중 안전).

### 2.2 결함 3가지 (사용자 지적 — 모두 검증 완료)

1. **순서 역전**: 현재 렌더 순서 `증여일 → doneeRelation → doneeId → isHeir`.
   논리 흐름(수증인 선택 → 관계·합산여부 자동)과 정반대. `isHeir`(게이트)가 맨 아래.
2. **`doneeRelation` 중복**: `doneeId` 선택 시 `Heir.relation`으로 관계 자동 도출 가능. 별도 입력은 정보 중복.
3. **증여세 전용 필드의 상속세 노출**: `doneeRelation` select(`GiftRowEditor.tsx:218`)가 `showIsHeir`/`showGiftPhaseA` 조건 없이 **무조건 렌더** → 상속세 모드에 증여재산공제 관계 select가 노출되어 혼란.

### 2.3 근본 원인

`doneeRelation`은 **증여세 독립 계산**(§53 증여재산공제 관계)용 레거시 필드. 이후 상속세 모드에 `doneeId`(2-B `41693d9`)가 추가됐으나 `doneeRelation` 정리를 안 해 **두 필드가 상속세 모드에 공존**. 설계 부채.

---

## 3. 재설계 (방안 A — 수증자 단일화)

### 3.1 상속세 모드 사전증여 행 — 신규 필드 순서·노출

```
[헤더] 증여 N · 삭제 · (이력기반/영리법인 배지)
① 영리법인 토글 (showIsHeir) ........................ 유지 (CorporateGiftFields가 doneeId 처리)
② 증여일 (giftDate) ................................ 유지
③ 수증자 (doneeId) — Step1 heirs select ............ 【최상단 이동 · 1차 입력】
   ↳ 선택 시: 관계·isHeir 자동 도출 안내 배지
   ↳ "선택 안 함 (인별 배부 생략)" 허용 (자동 안분 fallback 금지 정책 — 미지정은 합산만)
④ (자동 표시) 수증인 관계·상속인 여부 — read-only 요약 .. doneeId 선택 시
   ↳ "배우자 (김마누라) · 상속인 · §13①1호 10년 합산" (heir)
   ↳ "수유자 (홍손녀딸) · 비상속인 · §13①2호 5년 합산" (legatee)
⑤ isHeir 토글 ("상속인에게 증여") ................... doneeId 미선택 시에만 노출 【§13 게이트 — 관계보다 위】
⑥ doneeRelation select ("수증인과의 관계") .......... doneeId 미선택 시에만 노출 (§53 제안 fallback)
⑦ 증여재산가액 (giftAmount) ........................ 유지
⑧ 기납부 증여세 (giftTaxPaid) ...................... 유지
⑨ 부표1 메타 ...................................... 유지
```

> ⚠️ **⑤·⑥ 순서 정정 (2차 검토 G — 사용자 핵심 지적)**: doneeId 미선택 경로에서도 `isHeir`("상속인에게 증여")가 `doneeRelation`("수증인과의 관계")보다 **위**.
> 논리: 먼저 §13 합산 게이트(상속인/비상속인 → 10/5년) → 그 다음 관계(§53 제안). 사용자 지적 "이미지23이 수증인과의 관계 위에 위치" 직접 반영.

핵심 변화:
- **`doneeId`(수증자)를 증여일 직후 최상단으로** — "증여인=피상속인, 수증인=Step1 heirs 중 선택" 도메인 규칙 직접 반영.
- **`doneeId` 지정 시**: `doneeRelation`·`isHeir` select/토글을 **숨기고**, 대신 자동 도출 결과를 read-only 요약 배지로 표시.
- **`doneeId` 미지정(인별 배부 생략) 시에만**: 기존 `doneeRelation` select + `isHeir` 토글 노출 (§53 제안·§13 게이트 수동 경로 보존 — 회귀 0).

### 3.2 `Heir.relation → {DonorRelation, beneficiaryType}` 매핑 (single-source 헬퍼 신규)

`lib/calc/` 또는 `GiftRowEditor` 인접에 순수 매핑 함수 2종 신설 ([[single-source-engine-helper]] 정책):

```ts
// Heir.relation → DonorRelation (§53 증여재산공제 관계 도출)
function deriveDoneeRelationFromHeir(relation: HeirRelation): DonorRelation | undefined {
  switch (relation) {
    case "spouse": return "spouse";                    // 배우자 6억
    case "child": return "lineal_descendant";          // 직계비속 5천(미성년 2천)
    case "lineal_ascendant": return "lineal_ascendant_adult"; // 직계존속 5천
    case "sibling":
    case "other": return "other_relative";             // 기타 친족 1천
    case "legatee":
    case "corporate": return undefined;                // 비친족·법인 — §53 공제 대상 아님
  }
}

// Heir → beneficiaryType (§13 분류 우월 키 — 1차 검토 신규 / 6차 검토 K로 Heir 객체 시그니처 정정)
// ★ relation만 보면 deriveIsHeirFromHeir(isHeir prop 우선)과 어긋남 → Heir 객체 받아 일관화
function deriveBeneficiaryTypeFromHeir(h: Heir): "heir" | "legatee" | "corporate" {
  if (h.relation === "corporate") return "corporate"; // §13①2호 5년 + §3의2②
  if (!deriveIsHeirFromHeir(h)) return "legatee";      // legatee OR isHeir prop=false → 비상속인 5년
  return "heir";                                        // deriveIsHeirFromHeir=true → 상속인 10년
}
```

- ⚠️ **`beneficiaryType`은 `Heir` 객체 입력** (deriveDoneeRelation은 relation만으로 충분): `deriveIsHeirFromHeir`(isHeir prop 우선)과 동일 기준이라야 cutoff(isHeir)·분류(beneficiaryType) 모순 방지. 상세 §디자인 H2.
- ⚠️ **미성년 직계존속(`lineal_ascendant_minor`) 자동 도출 불가**: `Heir.relation`에 성인/미성년 구분 없음. 조부모가 미성년인 경우는 사실상 없어 `lineal_ascendant_adult`로 단일화(실무 무영향). 케이스 인벤토리에 명시.
- ⚠️ **직계비속 미성년(`child` + 미성년)**: §53 공제 5천→2천 차이. `Heir.birthDate`로 증여일 기준 미성년 판정 가능하나, 본 PR scope에서는 §53 **제안값**(사용자 수정 가능)이므로 성인 기준 도출 + 안내. 정밀 판정은 후속.
- ⚠️ **`HeirRelation` exhaustive**: `deriveDoneeRelationFromHeir`는 7개 enum switch exhaustive(누락 시 TS `never` 경고). `deriveBeneficiaryTypeFromHeir`는 corporate→`deriveIsHeirFromHeir` 분기로 전수 커버.

### 3.3 onChange 동기화 (useEffect 미러링 금지 — [[mirror-pattern]])

`handleDoneeSelect`에서 `doneeId` + `isHeir` + `doneeRelation` **3필드 동시 patch** (단일 onChange, store 직접 write):

```ts
function handleDoneeSelect(heirId: string) {
  if (!heirId) { set({ doneeId: undefined }); return; } // 미선택 — doneeRelation/isHeir 수동 경로 복귀
  const heir = (heirs ?? []).find((h) => h.id === heirId);
  if (!heir) { set({ doneeId: heirId }); return; }
  set({
    doneeId: heirId,
    isHeir: deriveIsHeirFromHeir(heir),                  // 기존 헬퍼 재사용 (레거시 cutoff fallback 안전)
    beneficiaryType: deriveBeneficiaryTypeFromHeir(heir), // 신규 — §13 분류 우월 키 (Heir 객체, isHeir 일관)
    doneeRelation: deriveDoneeRelationFromHeir(heir.relation), // 신규 — §53 제안 자동
  });
}
```

> useEffect → store 미러링 금지. onChange 단일 지점에서 **4필드 동시 patch**(doneeId·isHeir·beneficiaryType·doneeRelation) (CLAUDE.md 정책).
> ⚠️ `beneficiaryType="corporate"`는 corporateGiftComputedTax 등 추가 입력이 필요하므로 **doneeId select에서 corporate Heir 선택은 영리법인 토글 경로로 위임**(§3.5 참조) — handleDoneeSelect는 heir·legatee만 처리.

### 3.5 영리법인 수증자 경계 (1차 검토 정정 — D)

영리법인은 §3의2② 면제·corporateGiftComputedTax 등 추가 입력이 필요해 **별도 영리법인 토글**(`handleCorporateToggle`, `CorporateGiftFields`)이 전담. 신규 doneeId select와의 경계:

- **doneeId select 옵션에서 `corporate` Heir 제외**: corporate 수증자는 영리법인 토글로만 입력 (토글 ON 시 `CorporateGiftFields`가 자체 doneeId select 제공 — 기존 동작 유지).
- doneeId select 옵션 = `heirs.filter(h => h.relation !== "corporate")` (상속인 + 수유자 legatee만).
- 영리법인 토글 ON(`isCorporate`) 시 → doneeId select·doneeRelation·isHeir 모두 숨김 (기존 `!isCorporate` 가드 유지).
- 검증: 영리법인 토글 ON↔OFF 사이클에서 doneeId 경로 데이터 보존(prevRef) 회귀 0.

### 3.6 "선택 안 함" vs 도메인 규칙 긴장 해소 (1차 검토 정정 — E·F)

도메인 규칙은 "수증인은 항상 Step1 heirs 중 선택"이나, 다음 두 케이스로 **"선택 안 함" 옵션은 유지**(자동 안분 fallback 금지 + 회귀 보존):

- **heirs.length === 0** (F): Step1 상속인 미입력 → doneeId select 자체가 노출 불가. 이때 doneeRelation·isHeir 수동 경로로 fallback (기존 동작).
- **인별 배부 생략 의도**: 사용자가 합산만 하고 인별 배부를 원치 않는 경우. "선택 안 함" 허용 + 안내 배지(기존 sky tone "수증자 지정 시 ② 사전증여 열 반영").

긴장 해소 원칙: 도메인 규칙은 **권장**(안내)으로 표현하되 **강제 차단 안 함**. "선택 안 함"은 "미입력 상태"로 두고 ② 인별 배부 0 + 안내. (validation 차단은 자동 안분 fallback 금지 정책상 과도 — 합산은 정상 동작).

### 3.7 orphan doneeId 가드 (통합 검토 — 디자인 O 동기화)

`doneeId` 지정 후 Step1에서 해당 상속인을 삭제하면 `gift.doneeId`는 남고 매칭 Heir는 사라짐(orphan). UI 가드:
- `matchedHeir = heirs.find(h => h.id === gift.doneeId)`. undefined면 요약 배지 대신 **amber 안내**("수증자가 삭제됨 — 다시 선택") + select `value=""`.
- 엔진 측 orphan은 기존 정리 로직(`prune-orphan-heir`)이 처리. UI는 재선택 유도. anchor A8.

---

## 4. 케이스 인벤토리 (Do 진입 전 ≥1행 필수 — 비면 진입 금지)

| # | doneeId | Heir.relation | 도출 isHeir | 도출 beneficiaryType | 도출 doneeRelation | UI 노출 | §13 cutoff | 비고 |
|---|---|---|---|---|---|---|---|---|
| C1 | 선택(배우자) | spouse | true | heir | spouse | doneeId + 요약배지 | 10년 | 배우자 합산(inheritance-tax:257) |
| C2 | 선택(자녀) | child | true | heir | lineal_descendant | doneeId + 요약배지 | 10년 | 인별 배부 ② |
| C3 | 선택(직계존속) | lineal_ascendant | true | heir | lineal_ascendant_adult | doneeId + 요약배지 | 10년 | 미성년 구분 무영향 |
| C4 | 선택(수유자) | legatee | false | legatee | undefined | doneeId + 요약배지 | 5년 | §13①2호 비상속인 |
| C5 | **영리법인** | corporate | false | corporate | undefined | **영리법인 토글 경로(doneeId select에서 제외)** | 5년 | CorporateGiftFields 전담(§3.5) |
| C6 | **미선택** | — | 수동(토글) | 미설정(isHeir fallback) | 수동(select) | doneeRelation+isHeir 노출 | 토글값 | 인별 배부 생략·§53 제안 수동 |
| C7 | 형제/기타 | sibling/other | true | heir | other_relative | doneeId + 요약배지 | 10년 | 기타 친족 |
| C8 | **heirs 0** | — | 수동(토글) | 미설정 | 수동(select) | doneeRelation+isHeir 노출 | 토글값 | Step1 미입력 → C6과 동일 fallback(§3.6) |

> C6·C8(미선택·heirs 0)이 회귀 보존 핵심 — 기존 동작(수동 doneeRelation·isHeir) 100% 유지.
> C5(영리법인)는 doneeId select에서 제외 — 영리법인 토글 전담(§3.5).

---

## 5. 영향 범위 / 비영향 (회귀 0 보장)

### 변경
- `components/calc/prior-gift/GiftRowEditor.tsx` — 필드 순서·조건부 노출·handleDoneeSelect 3필드 patch·요약 배지
- `lib/calc/` (또는 인접) — `deriveDoneeRelationFromHeir` 매핑 헬퍼 신규 + anchor

### 비영향 (변경 없음 — 실측 확인 완료)
- **엔진**: `isHeir`·`beneficiaryType`·`doneeId`·`doneeRelation` 폼 키 의미 불변. 엔진은 동일 값 수신 → 계산 결과 동일.
- **증여세 모드** (`showGiftPhaseA=true`, `showIsHeir=false` — `PriorGiftInput.tsx:186-187` 상호 배타 확인): `doneeId`/`isHeir` UI 없음 → `doneeRelation` select가 §53 공제 핵심 입력으로 **그대로 유지**. 본 재설계는 **상속세 모드(`mode==="inheritance"` → `showIsHeir=true`)에만** 적용.
- **§53 제안** (`suggestPriorGiftDeductionTotal`): doneeRelation을 계속 읽음 — doneeId 경로에서 자동 set되므로 입력 소스만 바뀌고 산식 불변.
- **Zod/API** (`property-valuation-input.ts`): ✅ **실측 확인 완료** — `priorGiftSchema`에 `isHeir`(401행)·`doneeRelation`(405행)·`doneeId`(420행)·`beneficiaryType`(421행) **모두 정의됨(strip 없음)**. 신규 폼 키 0이므로 14지점 ⑫⑬⑭ 무영향.
- **영리법인 토글**(`handleCorporateToggle`·`CorporateGiftFields`): doneeId select에서 corporate 제외(§3.5)하므로 기존 경로 무변경.

---

## 6. Pre-Do anchor (구현 전 RED 확보 — [[pre-do-anchor-verification]])

1. `deriveDoneeRelationFromHeir` 매핑 7종 exhaustive (spouse→spouse, child→lineal_descendant, lineal_ascendant→lineal_ascendant_adult, sibling/other→other_relative, legatee/corporate→undefined)
2. `deriveBeneficiaryTypeFromHeir(h: Heir)` (corporate→corporate, deriveIsHeirFromHeir=false→legatee, 그 외→heir — isHeir 일관)
3. `handleDoneeSelect` 통합: doneeId 선택 → doneeRelation·isHeir·beneficiaryType 4필드 동시 set (RTL fireEvent)
4. C6·C8 회귀: doneeId 미선택/heirs 0 → doneeRelation select·isHeir 토글 노출 + 수동 입력 동작
5. §53 제안 회귀: doneeId 경로로 set된 doneeRelation이 suggestPriorGiftDeductionTotal에 정상 반영
6. C5 영리법인 회귀: doneeId select 옵션에 corporate Heir 미노출 + 영리법인 토글 경로 무변경

---

## 7. Do 진입 전 확인 항목 (실측 완료 — 1차 검토 반영)

- [x] ✅ Zod 스키마 정의 확인 — `priorGiftSchema` isHeir(401)·doneeRelation(405)·doneeId(420)·beneficiaryType(421) 모두 정의됨(strip 없음)
- [x] ✅ 증여세 모드 doneeRelation 필수 확인 — `showIsHeir`/`showGiftPhaseA` `mode` 기반 상호 배타(`PriorGiftInput.tsx:186-187`). gift 모드는 doneeRelation이 §53 핵심 입력 → 유지
- [x] ✅ `beneficiaryType` 우월 키 발견 — `inheritance-tax.ts:252` 사용. 매핑 헬퍼·handleDoneeSelect에 반영
- [ ] `Heir.birthDate` 미성년 판정 — 본 PR scope **제외** 명시 (§53 제안값이므로 성인 기준 + 안내). 후속(§9)
- [ ] `HeirRelation` enum 전체(7종) 매핑 누락 없는지 — exhaustive switch + anchor (Pre-Do)

---

## 8. Definition of Done

- [ ] 매핑 헬퍼 2종 + anchor (각 7종 exhaustive)
- [ ] 필드 순서 재배치 (doneeId 최상단, isHeir·doneeRelation 조건부)
- [ ] doneeId 선택 시 **4필드**(doneeId·isHeir·beneficiaryType·doneeRelation) 동시 patch + 요약 배지 / 미선택 시 수동 경로 보존
- [ ] doneeId select 옵션에서 corporate Heir 제외 (영리법인 토글 전담)
- [ ] 증여세 모드 무영향 확인 (showGiftPhaseA 회귀 anchor)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run test:inheritance` 회귀 0
- [ ] 브라우저(또는 e2e) 확인 — doneeId 선택 시 관계/토글 숨김·요약 표시
- [ ] commit/push (단일 또는 헬퍼+UI 2분리)

---

## 9. 미해결·후속 (별도 PR)

- **§53 미성년 직계비속 정밀 판정**: `Heir.birthDate` + 증여일로 미성년 시 공제 2천만(현재 성인 5천만 제안). 본 PR는 제안값이므로 성인 기준 + 안내, 정밀화는 후속.
- **UI amber 안내 버그** (이미지 18: §54④ 1호 ON인데 "최소값 기준" 표시) — 무관 별도 PR.
