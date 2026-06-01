# 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」 — 데이터 어댑터 설계 (엔진 변경 0)

> 계획서: `docs/00-pm/inheritance-besshi-9-buppyo-2-property-valuation.plan.md`
> UI 설계: `inheritance-besshi-9-buppyo-2-property-valuation.ui.design.md`
> 근거: KoreanLaw MCP `get_annexes` (상속세 및 증여세법 시행규칙 [별지 제9호서식 부표 2], 개정 2024.3.22.)

## Context

별지 제9호서식(앞쪽) 신고서(`filing-form-9`) 완료 후, 그 제출서류 목록 "2. 상속인별 상속재산 및 평가명세서(부표 2)"를 화면+PDF로 재현. 사용자 요구: **이미지1·2와 100% 동일, 각 상속인별 N장, A4 가로 + 가로 스크롤**. 기존엔 비공식 통합표(`source-summary/EstateAllocationTable`)만 존재 — 공식 별지 양식 부재.

**본 문서 범위**: 엔진(`lib/tax-engine/`)은 **변경 0**. `lib/calc/besshi-buppyo-2-data.ts` 어댑터 + `inheritance-filing-form-helpers.ts` 공유 헬퍼 확장 = 데이터 레이어 설계. 화면/PDF는 `.ui.design.md`.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 법령/양식 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C-1 | 배우자 단독상속, 협의분할 전체 입력 | 부표2 가·나·계, 작성방법 #2·#4 | 자기일관(actualShareAmount=grossInheritance, total=taxableValueShare) | `besshi-buppyo-2-data.test.ts` | ☐ TODO |
| C-2 | 배우자+자녀2, **협의분할 미입력** | 작성방법 #5 + `feedback_no_silent_apportion_fallback` | 나 행 0개 + 계 엔진 fallback값 + usedLegalShareFallback=true | 동상 | ☐ TODO |
| C-3 | 배우자+자녀1+수유자(legatee), 일부 입력 | 작성방법 #1·#3(수유자 차감) | 수유자 legalShareLabel=null, 매칭 행만 | 동상 | ☐ TODO |
| C-4 | 자녀3+영리법인(사전증여 受) | 부표2 재산구분코드 A22, §3의2 | 법인 장 본래상속 0행·나 A22 행·계 가산증여(A22) | 동상 | ☐ TODO |
| C-5 | 배우자+자녀2, 사전증여 有(상속인 受) | 작성방법 #3, 상증법 §13 | 나 사전증여 행 A21 ↔ 계 가산증여 A21 **동일 소스 자기일관**(P2-1) | 동상 | ☐ TODO |
| AN-R1 | 법정상속재산가액 산식 정합 | 작성방법 #3 | 손계산 대조(단순케이스 정확 일치) | 동상 | ☐ TODO |
| AN-R2 | 평가기준코드 공식 8종 일치 | KoreanLaw 검증표(§법령근거) | C-1 정정 회귀(`07 저당권특례`·`08 기준시가`) | 동상 | ☐ TODO |

**규칙**: 행≥1 충족. 사용자 추가 케이스 → 먼저 행 추가 → 코드.

---

## 법령 근거

KoreanLaw MCP 검증 본문 (별지 제9호서식 부표 2, 개정 2024.3.22.) 작성방법:

```
#1 피상속인과의 관계 = 상속인 기준("자")
#2 법정상속지분율 = 해당 상속인 지분 ÷ 총상속지분
#3 법정상속재산가액 = [(부표1 ⑫총상속재산가액 합계 + 가산하는 증여재산가액)
     − (상속인 외 수유자 유증재산 + 비과세재산 계 + 공과금 + 채무)] × 법정상속지분율
#4 실제상속지분율 = 실제상속재산가액 ÷ 총상속재산가액
#5 실제상속재산가액 = 협의분할로 실제 취득한 금액 (협의분할서 첨부)
#6 사업자등록번호(계좌번호,지분) = 부동산은 해당 상속인의 실제 상속지분
```

코드표 (부표1·2 공유):
- **재산구분코드 12종**: A11 상속재산(상속인) / A12 상속재산(상속인 외) / A13 상속개시전 처분재산 / A21 증여가산(상속인) / A22 증여가산(상속인 외) / A23 창업자금(조특§30의5) / A24 가업승계(조특§30의6) / B11 금양임야 / B12 공공단체유증 / B13 비과세기타 / B21 공익법인출연 / B22 공익신탁
- **재산종류코드 14종**: 01 현금 / 02 토지I(순수) / 03 토지II(부수) / 04 개별주택 / 05 공동주택 / 06 오피스텔·상업용 / 07 일반건물 / 08 부동산취득권리 / 09 유가증권(상장) / 10 유가증권(비상장) / 11 금융재산 / 12 기타재산 / 13 가상자산 / 14 서화·골동품
- **평가기준코드 8종**: 01 매매거래가액(§60) / 02 감정가액(§60) / 03 수용보상가액(§60) / 04 경매공매가액(§60) / 05 유사매매사례가액(§60) / 06 현금등가액(§60) / 07 저당권등평가특례(§66) / 08 기준시가등보충적평가(§61~65)

> ⚠️ 코드 라벨은 본 검증표가 **단일 출처**. 재작성 금지(`enum-verification-before-mapping`·`korean-law-citation-verify`).

---

## 어댑터 input (기존 result/입력 소비 — 신규 엔진 input 0)

```ts
// lib/calc/besshi-buppyo-2-data.ts
buildBuppyo2Data(
  result: InheritanceTaxResult,   // heirAllocationResult.perHeir 소비
  heirs: Heir[],                  // sortHeirs 순서·relation·name
  estateItems: EstateItem[],      // 본래상속 행 + heirAllocations
  priorGifts: PriorGift[],        // 사전증여 행(A21~A24) + 계 가산증여
): Buppyo2HeirData[]              // N장 = sortHeirs(heirs) 전원 (perHeir가 전 heirs 커버 — inheritance-allocation.ts L483/L586). 데이터 0 영리법인도 전원 렌더(D-2 "N=상속인수" 준수, 빈 시트 허용 — 구성 누락 오해 방지)
```

## 어댑터 result 타입

```ts
interface Buppyo2HeirData { heirId: string; sectionA: Buppyo2SectionA; itemRows: Buppyo2ItemRow[]; sectionTotal: Buppyo2SectionTotal; }

interface Buppyo2SectionA {           // 가. 상속인별 상속현황
  relation: string;                   // HEIR_RELATION_TO_DECLARANT_LABEL (단일 출처·7키 전 relation 커버. 신규 라벨맵 신설 금지)
  name: string;
  residentId?: string;                // 미수집 → 공란
  address?: string;                   // 미수집 → 공란
  legalShareLabel: string | null;     // "1/3" (legatee·corporate=null)
  legalShareAmount: number | null;    // 작성방법 #3 (AN-R1 확정)
  actualShareRatio: number;           // grossInheritance ÷ Σgross
  actualShareAmount: number;          // perHeir.grossInheritance
}
interface Buppyo2ItemRow {            // 나. 상속재산명세 (본래상속 + 사전증여 2원)
  kindCode: "A11"|"A12"|"A21"|"A22"|"A23"|"A24";
  typeCode: string;                   // 01~14
  locationOrName: string;             // name.trim() || CATEGORY_LABEL (내부 id 금지)
  isOverseasAsset: boolean;           // 미수집 → false
  overseasCountry?: string;
  ownershipShareLabel?: string;       // 부동산 지분(작성방법 #6)
  quantityOrArea: number | null;      // areaSqm || allocation.areaM2 || quantityCount
  unitPrice: number | null;           // 미수집 → null (상장주식 listedStockAvgPrice 예외)
  valuatedAmount: number;             // 본래=allocation.amount / 사전증여=PriorGift.giftAmount (실측 확정)
  valuationMethodCode: string;        // 본래=01~08(toEstateItemValuationMethodCode) / 사전증여="08" 고정(증여 부표1 동일)
}
interface Buppyo2SectionTotal {       // 계 (12행)
  grossEstateValue: number;           // = grossInheritance
  presumedAmount: number;             // = presumedAmount
  nonTaxableTotal: number | null;     // 세부 3종 미분리 → null(공란)
  exclusionTotal: number | null;      // 세부 3종 미분리 → null(공란)
  priorGift13: number; priorGift30_5: number; priorGift30_6: number; // 계 가산증여 3행 직접(UI 무산술). §13=Σ(A21+A22)·§30의5=Σ(A23)·§30의6=Σ(A24). priorGifts[] 단일 소스
  total: number;                      // = taxableValueShare
}
```

## 공유 헬퍼 (`inheritance-filing-form-helpers.ts` 확장 ~170줄)

```ts
export const ESTATE_ITEM_TYPE_CODE: Record<AssetCategory, string>; // 01~14 (Record로 누락 컴파일 차단)
export function toEstateItemTypeCode(category: AssetCategory): string;
export function toEstateItemValuationMethodCode(item: EstateItem, vr: PropertyValuationResult | undefined): string; // 증여 부표1 toValuationMethodCode 재사용(vr.method + cash→06). 구현 정정: (item) → (item, vr), result.valuationResults estateItemId 매칭, 미매칭 "08"
export function inferEstateItemKindCode(heir: Heir): "A11" | "A12";        // legatee·corporate→A12
```
`GiftTaxValuationFormTable` private `toPropertyTypeCode`/`toValuationMethodCode` → 공유 함수 교체·private 제거(import 사이트=자기뿐, 무영향. 단 **증여 부표1 회귀 anchor 필수**).

---

## 도출 알고리즘 (단계별)

heir별 (sortHeirs 순서):
1. **가 섹션**: relation=라벨, name. legalShareLabel/Amount = `computeLegalShares(heirs)`(legatee·corporate→null). actualShareAmount=`perHeir.grossInheritance`, actualShareRatio=÷Σgross.
2. **나 본래상속 행**: estateItems 순회 → `heirAllocations`에서 heirId 매칭분만. kindCode=`inferEstateItemKindCode(heir)`, typeCode=`toEstateItemTypeCode`, valuationMethodCode=`toEstateItemValuationMethodCode`, valuatedAmount=allocation.amount. **미입력 자산 = 행 생략(공란)**.
3. **나 사전증여 행**: priorGifts 순회 → `doneeId===heirId` 매칭분만. kindCode=`inferPropertyKindCode(gift, specialTreatment)`(A21~A24), typeCode=`toPriorGiftPropertyTypeCode`, valuatedAmount=`giftAmount`, valuationMethodCode="08"(고정).
4. **계 섹션**: grossEstateValue=grossInheritance, presumedAmount, nonTaxableTotal/exclusionTotal=null(세부 미분리), **priorGift13/30_5/30_6 = priorGifts[] 그룹합**(§13=A21+A22·§30의5=A23·§30의6=A24, 공식 계 3행 직접 — UI 무산술, 나 행과 동일 소스 자기일관), total=taxableValueShare.

`lib/calc/`에서 `heir-allocation-summary.ts`·`inheritance-legal-share.ts`(`computeLegalShares`) import 허용. `lib/tax-engine/` 내부 중간 함수 직접 import 금지.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 위험 | 정책 |
|---|---|---|
| 나 본래상속 행 (협의분할 미입력) | 법정상속분 자동안분 유혹 | **금지**(`feedback_no_silent_apportion_fallback`) → 행 생략. **가 섹션 actualShareAmount + 계 합계는 엔진 법정상속분 fallback값** (라벨 "실제상속재산가액"이나 fallback임을 안내 배지로 명시 — 가·계 동일 적용) |
| 법정상속재산가액 (AN-R1) | `taxableEstateValue×지분율` 근사 단정 | 단순케이스 정확·복합케이스 발산 명시. AN-R1 손계산 대조 후 분기 |
| 비과세·과세불산입 세부 3종 | 합산값을 세부에 임의 배분 | **금지** → 세부 행 공란(D-4). 단일 합계도 비표시 |
| 가산증여 A21 | 엔진 perHeir vs priorGifts 2원 | priorGifts 단일 소스(P2-1). perHeir은 교차검증만 |

---

## 테스트 약속

- 케이스 인벤토리 C-1~C-5 + AN-R1/R2 각 anchor 1개 이상 (`__tests__/calc/besshi-buppyo-2-data.test.ts`).
- **Pre-Do anchor 우선**(`pre-do-anchor-verification`): AN-1(자기일관·R1 손계산), AN-2(나 행 필터), AN-3(코드 단일출처). 실패 메시지로 디자인 환류.
- **증여 부표1 회귀**: 공유 헬퍼 교체 전후 `GiftTaxValuationFormTable` 출력 동일 — 기존 anchor + `npm test` 전체.
- PDF/금액 anchor는 원단위 `toBe()`.

---

## UI 통합 위임

- 화면·PDF·testid·마운트 = `inheritance-besshi-9-buppyo-2-property-valuation.ui.design.md`.
- 14개 동기화 지점 중 **⑤·⑦만 해당**(엔진 변경 0·신규 입력 0). 나머지 12개 N/A — UI 설계 §동기화 표 참조.
