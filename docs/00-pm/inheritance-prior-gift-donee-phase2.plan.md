# 상속세 사전증여 입력 재설계 Phase 2 — 영리법인 토글 제거·기납부 증여세 자동계산 (donee-phase2)

> 작성: 2026-05-31 (effort max) · 대상: `GiftRowEditor.tsx` + `HeirComposition.tsx` + 신규 자동계산 헬퍼
> 선행: `inheritance-prior-gift-donee-redesign`(`9d9990c`) — 수증자 단일화 Phase 1
> 트리거: 사용자 추가 수정 4건 (이미지 25~27) + 인터뷰 3답변

---

## 0. 인터뷰 확정 (3답변 — 설계 기준)

| Q | 답변 | 적용 |
|---|---|---|
| Q1 자동계산 범위 | **단순 1건 독립** | `(증여재산가액 − §53 관계별공제) × §56 누진세율`. 동일인 합산·§57 할증·§69 신고공제 미반영 |
| Q2 법인 영리/비영리 | **영리법인 여부 체크박스 신설** | Step1 corporate Heir에 `isForProfit` 플래그. 비영리법인 구분 |
| Q3 §3의2② 면제 입력 | **자동계산값으로 산출세액 상당액 대체** | 영리법인 수증자 선택 시 `corporateGiftComputedTax = 자동계산값`. 이미지27 입력란 제거 |

---

## 1. 도메인 규칙 (Phase 1 계승 + Phase 2 확장)

1. **증여인 = 항상 피상속인** (고정·비노출).
2. **수증인 = Step1 heirs 전체 중 드롭다운 선택** — 상속인 + 비상속인(수유자) + **영리법인 포함**.
   - Phase 1에서 corporate를 드롭다운에서 제외했으나, Phase 2는 **영리법인도 드롭다운에 포함**(영리법인 토글 폐지).
3. **영리법인 여부는 Step1에서 결정** — 사전증여 행에서 토글로 판단하지 않음.
4. **기납부 증여세 = 자동계산(수정 가능)** — 단순 1건 독립 산식.

---

## 2. 현행 문제 (이미지 25~27)

1. **영리법인 토글 잔존** (이미지25 증여1·이미지27): 사전증여 행마다 "수증인 = 영리법인" ToggleCard + `CorporateGiftFields`(산출세액 상당액·과세표준·영리법인 수증자 select) — Step1 정보와 중복·혼란.
2. **수증인 입력 이원화**: 영리법인은 토글, 그 외는 드롭다운 → 일관성 없음.
3. **기납부 증여세 수동 입력**: 사용자가 §53 공제·§56 세율 직접 계산해야 함 (이미지26 22m을 손계산).
4. **Phase 1 미반영 잔재**: 증여1이 영리법인 토글 ON이라 옛 입력란 표시 (증여2만 새 UI) → 토글 자체 폐지로 해소.

---

## 3. 재설계

### 3.1 Phase 2-A — 영리법인 토글 제거 + Step1 영리법인 체크 + 수증인 드롭다운 통일

#### (a) Step1 `HeirComposition.tsx` — corporate Heir에 "영리법인 여부" 체크 신설
- corporate relation 편집기(부표 5 영리법인 명세 인접)에 `ToggleCard`("영리법인 여부", tone violet) 신설.
- `Heir.isForProfit?: boolean` 신규 (타입 확장). 기본 `undefined`=영리법인(기존 호환 — 기존 corporate Heir 동작 보존).
- 체크 ON(또는 미설정)=영리법인(§3의2②), OFF=비영리법인(§3의2② 미적용·일반 비상속인 5년 합산).

#### (b) `GiftRowEditor.tsx` — 영리법인 토글·CorporateGiftFields 완전 제거
- "수증인 = 영리법인" ToggleCard(`185~196`) 삭제.
- `CorporateGiftFields` import·렌더 삭제 → **파일 삭제**(재사용처 0).
- `handleCorporateToggle`·`prevRef`·`isCorporate` 분기 삭제.

**CorporateGiftFields 3입력란 제거 후 처리 (추가 검토 — 사용자 지적):**
| 기존 입력란(이미지27) | 폼 키 | 제거 후 처리 |
|---|---|---|
| 증여세 산출세액 상당액 | `corporateGiftComputedTax` | **자동계산 대체** (Phase 2-B) — corporate 수증자 선택 시 자동 set |
| **증여세 과세표준 (선택)** | `giftTaxBase` | **★ 입력란 영구 제거** — 영리법인은 §53 공제 0 → 과세표준 = giftAmount. 엔진 `inheritance-tax.ts:397 g.giftTaxBase ?? g.giftAmount` fallback이 이미 존재 → `giftTaxBase` 미설정(undefined)으로 두면 자동으로 giftAmount 사용. **자동계산 taxBase(=giftAmount)와 동일** → 별도 입력 불필요 확정 |
| 영리법인 수증자 select | `doneeId` | **수증자 드롭다운 통일 흡수** (3.1-c) — corporate Heir도 드롭다운에 포함 |

> ✅ 실측: CorporateGiftFields 3입력란이 모두 자동화/통합되므로 영리법인 사전증여도 **증여일·증여재산가액·수증자 드롭다운**만 입력하면 충분(자연인과 동일 UX).

#### (c) 수증자 드롭다운에 corporate 포함 (Phase 1 제외 해제)
- `heirs.filter(h => h.relation !== "corporate")` → `heirs` 전체 (corporate 포함).
- corporate Heir 옵션 라벨: "영리법인 (M주식회사)" 또는 "비영리법인 (…)" — `isForProfit`로 구분 표기.

#### (d) `deriveBeneficiaryTypeFromHeir` 확장 — 영리/비영리 분기
```ts
function deriveBeneficiaryTypeFromHeir(h: Heir): "heir" | "legatee" | "corporate" {
  if (h.relation === "corporate") {
    return h.isForProfit === false ? "legatee" : "corporate"; // 비영리 → 일반 비상속인(§3의2② 미적용)
  }
  if (!deriveIsHeirFromHeir(h)) return "legatee";
  return "heir";
}
```
> 엔진 변경 0: `inheritance-tax.ts:238`은 `beneficiaryType==="corporate"`로 §3의2② 경로 판정. 비영리는 "legatee"로 도출되어 자동 분기.

#### (d-1) ★ relation vs beneficiaryType 이원 구조 (1차 검토 A1 — 중대)

`relation==="corporate"` 판정이 **27곳**(엔진 협의분할/법정상속분/배부 제외 + UI 결과표). `isForProfit` 추가 시 **두 축을 명확히 분리**:

| 판정 축 | 기준 | 비영리법인(corporate+isForProfit=false) 처리 |
|---|---|---|
| **상속재산 협의분할·법정상속분·배부 제외** | `relation === "corporate"` (27곳, 불변) | corporate로 제외 (비영리도 상속인 아님 → 정당) |
| **§3의2② 면제 적용** | `beneficiaryType === "corporate"` (`inheritance-tax.ts:238·393`) | legatee로 도출 → §3의2② 미적용 (의도) |
| **사전증여 §13 cutoff** | `isHeir`(5년) | 비상속인 5년 |

> **원칙**: `isForProfit`는 `relation`을 바꾸지 않음(corporate 유지) — `beneficiaryType` 도출에만 영향. 즉 비영리법인도 상속재산 협의분할/법정상속분 제외(relation 기준)는 영리법인과 동일하되, **사전증여 §3의2② 면제만 미적용**. 27곳 `relation==="corporate"` 판정은 **무변경**(회귀 0).
> ⚠️ Do 단계 grep 점검: `relation==="corporate"` 27곳 중 §3의2② 관련(면제 발동)은 `beneficiaryType` 기준으로 이미 분리됐는지 재확인. 협의분할/배부 제외는 relation 유지가 정답.

### 3.2 Phase 2-B — 기납부 증여세 자동계산

#### (a) 신규 순수 헬퍼 `autoComputePriorGiftTax` (single-source)
`calcRelationDeduction`(§53)·`calcInheritanceGiftTax`(§56) 재사용:
```ts
function autoComputePriorGiftTax(
  giftAmount: number,
  doneeRelation: DonorRelation | undefined,
): number {
  if (giftAmount <= 0) return 0;
  // §53 공제 (doneeRelation 없으면 0 — 영리법인·수유자·비친족)
  const deduction = doneeRelation
    ? calcRelationDeduction({ donorRelation: doneeRelation, priorUsedDeduction: 0 }, giftAmount).relationDeduction
    : 0;
  const taxBase = Math.max(0, giftAmount - deduction);
  if (taxBase < 500_000) return 0;           // §55 단서 (50만원 미만 비과세)
  return calcInheritanceGiftTax(taxBase, DEFAULT_INHERITANCE_GIFT_BRACKETS); // §56 누진
}
```

#### (b) 산출값 라우팅
| 수증자 유형 | 자동계산값 → 어느 필드 | 비고 |
|---|---|---|
| 상속인·수유자(자연인) | `giftTaxPaid` 제안 | §28 증여세액공제용 (실제 납부 산출세액) |
| 영리법인(corporate+isForProfit) | `corporateGiftComputedTax` (§3의2② 산출세액 상당액) | `giftTaxPaid=0`(§4의2③ 비과세) 유지 |
| 비영리법인(corporate+!isForProfit) | `giftTaxPaid` 제안 (legatee 동등) | §3의2② 미적용 |

#### (c) mirror-pattern — 자동 제안 + 수정 가능 (useEffect 미러링 금지)

**자동계산 트리거 조건 (3차 검토 B3 정정)** — `giftAmount > 0` AND **§53 관계 확정**(아래 둘 중 하나):
- (경로 1) `doneeId` 선택 → `doneeRelation` 파생 → 자동계산 (P1·P2·P3·P4·P5·P7·P8)
- (경로 2) `doneeId` 미선택 + `doneeRelation` **수동 선택** → 그 값으로 자동계산 (P6 — 누락 방지)
- 관계 미확정(doneeId·doneeRelation 둘 다 없음) → 자동계산 불가 → 수동 입력만

세부:
- 자동계산값은 위 트리거의 onChange 시점에 동시 set (사용자 명시 액션 기반 — 자동 안분 fallback 정책 위반 아님).
- ★ **단일 `userTouchedTax` 플래그(카드-local useRef)를 자연인 `giftTaxPaid`·영리법인 `corporateGiftComputedTax` 공통 관리**(통합 비교 E1·디자인 D1): 두 값은 같은 "세액 입력란"의 두 라우팅이므로 한 플래그로 자동 덮어쓰기 제어 → 영리법인 산출세액 상당액도 수정 가능(이미지26 요구 충족).
- 사용자가 세액 입력란을 **수동 수정한 이후엔 자동 덮어쓰기 금지**(Phase 1 `prevRef` 패턴 차용).
- 미수정 상태에서 `giftAmount`·`doneeId`·`doneeRelation`(수동) 변경 시 자동 재계산. 수정 후엔 사용자값 고정.
- UI: 자동계산값 옆 "🧮 자동계산 (수정 가능)" 안내 배지 + 수정 시 배지 제거.

> ⚠️ 설계 정밀화 지점(D 단계): "사용자 터치 추적"을 useRef vs 명시 [자동계산] 버튼 중 택1. Design에서 확정.

#### (d) 영리법인 선택 시 "기납부 증여세" 입력란 표시 전환 (추가 검토)
- 영리법인 수증자(corporate+isForProfit): `giftTaxPaid=0`(§4의2③ 비과세), 자동계산값은 `corporateGiftComputedTax`로 라우팅.
- → "기납부 증여세" 입력란을 **"§3의2② 산출세액 상당액 (자동)"** 라벨로 전환하고 자동계산값 read-only 표시(혼란 방지).
- 자연인·비영리법인: "기납부 증여세 (자동계산·수정 가능)" 유지.

### 3.3 추가 검토 — 부표1 메타 입력란 (사용자 지적: 불필요 입력란)

이미지25의 **부표1**(증여재산 및 평가명세서 별지 제10호서식 부표1 — 재산종류코드·자산명칭·소재지·법인명)은:
- **상속세 계산 영향 0** (신고서 표시용 메타).
- 상속세 결과 화면·신고서 사전증여 명세(②③ 컬럼)에 사용 → 제거 시 신고서 정보 손실.
- **확정 (사용자 결정 2026-05-31): (나) 기본 접힘(collapse)**. "▸ 신고서 부표1 표시 (선택 입력)" 펼침 토글로 감싸고 기본 닫힘. 펼치면 기존 입력란(재산종류코드·자산명칭·소재지) 그대로. 필수 입력(증여일·가액·수증자)과 시각 분리.
- print 시 자동 펼침([[print-only-css-toggle]]) — 신고서 PDF 출력 시 내용 보존.

---

## 4. 케이스 인벤토리 (Do 진입 전 ≥1행 필수)

| # | 수증자 | isForProfit | beneficiaryType | doneeRelation | giftAmount | 자동계산 | → 필드 |
|---|---|---|---|---|---|---|---|
| P1 | 배우자 | — | heir | spouse | 760m | (760m−600m)×§56 = **22,000,000** | giftTaxPaid (이미지26 일치) |
| P2 | 자녀 | — | heir | lineal_descendant | 500m | (500m−50m)×§56 = 80,000,000 | giftTaxPaid |
| P3 | 영리법인 | true(기본) | corporate | undefined | 700m | (700m−0)×§56 = **150,000,000** | corporateGiftComputedTax (이미지25 일치) · giftTaxBase는 미설정(undefined)→엔진 ??giftAmount=700m · giftTaxPaid=0 |
| P4 | 비영리법인 | false | legatee | undefined | 700m | (700m−0)×§56 = 150,000,000 | giftTaxPaid (§3의2② 미적용) |
| P5 | 수유자 | — | legatee | undefined | 300m | (300m−0)×§56 = 50,000,000 | giftTaxPaid |
| P6 | 미선택 | — | 수동(isHeir) | other_relative(수동) | 300m | 경로2 (300m−10m)×§56 = **48,000,000**. 관계 미선택 시만 수동 | giftTaxPaid |
| P7 | 자동값 사용자 수정 | — | — | — | 760m | 자동 22m → 사용자 20m 수정 | 20m 고정 (덮어쓰기 금지) |
| P8 | 기타친족 | — | heir | other_relative | 100m | (100m−10m)×§56 = 9,000,000 | giftTaxPaid |

> P1·P3가 이미지 검증 anchor (22m·150m 원단위 일치).

---

## 5. 영향 범위 / 비영향

### 변경
- `lib/tax-engine/types/inheritance-gift.types.ts` — `Heir.isForProfit?: boolean` 추가
- `lib/calc/prior-gift-donee-derive.ts` — `deriveBeneficiaryTypeFromHeir` 영리/비영리 분기
- `lib/calc/prior-gift-auto-tax.ts` (신규) — `autoComputePriorGiftTax` 순수 헬퍼
- `components/calc/HeirComposition.tsx` — corporate Heir "영리법인 여부" 체크
- `components/calc/prior-gift/GiftRowEditor.tsx` — 토글·CorporateGiftFields 제거 + 자동계산 통합
- `lib/validators/property-valuation-input.ts` — Heir 스키마에 `isForProfit` (strip 방지, 14지점 ⑫)

### 비영향 (실측 확인 완료)
- **엔진 계산**: `beneficiaryType`·`corporateGiftComputedTax`·`giftTaxPaid` 폼 키 의미 불변. 엔진 산식 무변경.
- **증여세 모드**(`showGiftPhaseA`): 자동계산은 상속세 모드 전용. 증여세 모드 doneeRelation·기존 동작 유지.
- **§3의2② 엔진**(`inheritance-tax.ts:388~`): `beneficiaryType==="corporate"` 판정 그대로. 비영리는 legatee로 도출되어 자동 제외.
- **결과표 ⑩a/b/c**(`heir-allocation-summary.ts:392·420`): `relation==="corporate"` 기준 행 표시. 비영리법인도 corporate 행에 나오나 엔진 면제 필터(`beneficiaryType==="corporate"`)로 §3의2② 면제 0 → **일관**(A2). 단 비영리법인 corporate 행에 면제 0 표시 시 "비영리법인 — §3의2② 미적용" 안내 배지 권장(혼란 방지).
- **27곳 `relation==="corporate"` 판정**(협의분할·법정상속분·배부 제외): isForProfit 무관 corporate 유지 → 무변경(회귀 0).
- **`CorporateGiftFields`**: ✅ 실측 — `GiftRowEditor.tsx:18·192`에서만 사용(다른 재사용처 0). 제거 시 파일 orphan → **파일 삭제**. Step1 부표5는 `HeirComposition` 자체 구현이라 무관.
- **이력 자동조회 영리법인 import**(`allowCorporateImport`·`enableCorporateOption`·`candidateToPriorGift(asCorporate)`): ✅ 유지. 토글과 별개 경로. import된 corporate gift는 `corporateGiftComputedTax=c.computedTax`(이력 확정값) → **자동계산보다 우선**(mirror: sourceCalculationId 있으면 자동 덮어쓰기 금지). import는 `doneeId` 미설정(337행) → 새 드롭다운에서 사용자 수동 매핑.
- **Heir 스키마**: ⚠️ 실측 — `heirSchema`(`:476`)에 `isForProfit` **없음** → 추가 필요(14지점 ⑫, strip 방지). `corporateGiftComputedTax`(496)·`businessRegistrationNumber`(498)는 정의됨.

---

## 6. Pre-Do anchor (RED 우선)

1. `autoComputePriorGiftTax`: P1 배우자 760m → 22,000,000 (이미지26)
2. `autoComputePriorGiftTax`: P3 영리법인 700m → 150,000,000 (이미지25)
3. `autoComputePriorGiftTax`: P2·P5·P8 (자녀·수유자·기타친족)
4. `autoComputePriorGiftTax`: §55 단서 (taxBase < 50만원 → 0)
5. `deriveBeneficiaryTypeFromHeir`: corporate+isForProfit=false → legatee / +true(또는 미설정) → corporate
6. GiftRowEditor: 영리법인 토글 제거 확인 (queryByText("수증인 = 영리법인") null)
7. GiftRowEditor: corporate Heir가 수증자 드롭다운에 포함 (Phase 1 제외 해제 회귀)
8. 자동계산 라우팅: corporate 선택 → corporateGiftComputedTax set·giftTaxPaid=0·giftTaxBase undefined / 자연인 → giftTaxPaid set
9. P7: 자연인 giftTaxPaid 수동 수정 후 giftAmount 변경 시 덮어쓰기 금지
10. A10: 영리법인 corporateGiftComputedTax 수동 수정 후 giftAmount 변경 시 덮어쓰기 금지(userTouchedTax 공유)
11. P6 경로2: doneeId 미선택 + doneeRelation 수동(other_relative) 300m → 48,000,000

---

## 7. Do 진입 전 확인 항목 (추정 금지 — 실측)

- [x] ✅ `calcRelationDeduction`(gift-deductions.ts:58)·`calcInheritanceGiftTax`(inheritance-gift-common.ts:47)·`DEFAULT_INHERITANCE_GIFT_BRACKETS` 재사용 확인
- [x] ✅ 자동계산 = 이미지 검증값 일치 (P1 22m·P3 150m 손검산 완료)
- [x] ✅ `CorporateGiftFields` 재사용처 0 (GiftRowEditor 전용) → 제거 시 파일 삭제. 부표5는 HeirComposition 자체
- [x] ✅ `heirSchema`에 `isForProfit` 없음 → 추가 필요(⑫)
- [x] ✅ import 모달(allowCorporateImport·asCorporate) 별개 경로 유지 — import 확정값이 자동계산보다 우선(mirror)
- [ ] `Heir.isForProfit` 추가 시 `inheritance-corporate-exemption.ts`·부표5 build 경로가 corporate relation만 의존하는지(isForProfit 무관) 재확인 (D 단계 grep)

---

## 8. Definition of Done

- [ ] `Heir.isForProfit` 타입·Zod(heirSchema)·Step1 체크 UI
- [ ] 영리법인 토글·CorporateGiftFields **파일 삭제** (GiftRowEditor)
- [ ] CorporateGiftFields 3입력란 처리: 산출세액→자동 / **과세표준(giftTaxBase)→제거·undefined(엔진 fallback)** / 수증자→드롭다운
- [ ] 수증자 드롭다운 corporate 포함 + 영리/비영리 라벨
- [ ] `autoComputePriorGiftTax` 헬퍼 + anchor (P1·P3 이미지 일치 원단위)
- [ ] 자동계산 라우팅 (corporate→corporateGiftComputedTax·giftTaxPaid=0 / 자연인→giftTaxPaid) + 수정 가능(mirror)
- [ ] 영리법인 선택 시 "기납부 증여세"→"§3의2② 산출세액 상당액(자동)" 라벨 전환
- [ ] 부표1 메타 처리 (사용자 결정: 유지/접힘/제거)
- [ ] `deriveBeneficiaryTypeFromHeir` 영리/비영리 분기 + anchor
- [ ] `npx tsc --noEmit` 0 / `npm run test:inheritance` 회귀 0
- [ ] 브라우저(e2e) 확인 — 토글 사라짐·드롭다운 통일·자동계산 22m·수정 가능
- [ ] commit/push

---

## 9. 미해결·후속 (별도 PR)

- **비영리법인 정밀 과세**(§48 공익법인 과세가액 불산입 등): 본 PR은 legatee 동등(5년·§3의2② 미적용)으로 단순화. 정밀화 후속.
- **§53 미성년 직계비속 정밀 판정**(Heir.birthDate): 자동계산은 성인 기준 §53. 후속.
- **자동계산 동일인 합산·§57 할증·§69 공제**: Q1 단순 1건 독립 확정. 정밀 모드는 후속(필요 시).
- UI amber "최소값 기준" 표시 버그 / 증여세 ⑫a=0 진단 (무관 별도).
