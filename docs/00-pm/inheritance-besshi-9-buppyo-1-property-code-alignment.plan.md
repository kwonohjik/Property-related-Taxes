# 별지 제9호서식 부표 1 — 재산종류코드 정합화 계획서 (v2)

> 2026-05-21 · feature: `inheritance-besshi-9-buppyo-1-property-code-alignment`
> 선행: PR-D KoreanLaw MCP 별지 검증 (`e87be7c`)
> 변경 이력: v1 → v2 (비판 검토 C3-1~C3-7 + CC 공통 반영)
> 소관: `inheritance-gift-tax-ui-senior` (UI 라벨) · `inheritance-gift-tax-senior` (enum 정합)

## 0. 사전 검증 (v2 신규)

### 0-1. 사용자 needs 검증 (CC-1)

본 PR 은 신고서 양식 완성도 목표. 실제 사용자 가치:
- (a) 신고서 PDF 출력 시 부표 1·2 양식과 정합
- (b) 세무사·전문가 사용자 (일반 사용자는 enum 차이 인지 못함)

→ 일반 사용자 needs 낮음. **세무사 사용자 needs 우선 검증**. ROI 의문 시 본 PR 무기한 보류 가능.

### 0-2. KoreanLaw MCP 본문 재검증 (CC-2)

PR-D 에서 `get_annexes` 1회 호출로 부표 1 양식 확보. 본 PR 진입 전:
- [ ] 부표 1 작성방법 본문 전체 재인용
- [ ] 재산종류코드 14 종 명확 매핑 (현재 12 + 13·14는 별도 인용 필요)
- [ ] 재산구분코드 A11~B22 본문 인용 (현재 작성방법 1 추출)

## 1. 비판 검토 반영 사항 (v2)

### 1-1. 토지I/II 분리 vs Toggle 대안 평가 (C3-1)

**v1**: 토지I (순수토지) / 토지II (부수토지) 별도 enum 값.

**v2 평가**:

| 옵션 | 장점 | 단점 |
|---|---|---|
| (A) enum 분리 | 양식 정합. 자동 매핑 | 사용자가 구분 어려움 — "내 토지가 일반건물 부수토지인가?" |
| (B) 단일 enum + toggle | 사용자 편의 ("부수토지" 체크박스) | UI 분기·자동 매핑 추가 작업 |
| (C) 단일 enum + 자동 추론 | 가장 단순 | 자동 추론 신뢰도 낮음 — 일반건물 동시 입력 케이스 검출 어려움 |

**v2 권장**: **옵션 B**. enum은 기존 `real_estate_land` 유지 + `PriorGift.isAttachedLandToBuilding?: boolean` 신규. 부표 매핑 시 boolean → 02/03 코드 변환.

→ enum 신규 6 값 중 토지I/II 2 값 폐기. **신규 enum 4 값으로 축소** (개별주택·오피스텔·부동산권리·가상자산·서화·골동품 → 5 값. 추가 점진 도입 권장 — §2-2).

### 1-2. 점진 도입 평가 (C3-2)

**v1**: 6 신규 enum 값 일괄 도입.

**v2 분할**:

| Phase | 신규 값 | 사용 빈도 | 우선순위 |
|---|---|---|---|
| **본 PR** | 04 개별주택 · 06 오피스텔·상업용 · 08 부동산 권리 | 中 (실제 상속재산에서 빈도 높음) | 1 |
| 후속 PR1 | 13 가상자산 | 低 (2026 이후 사용 증가 예상) | 2 |
| 후속 PR2 | 14 서화·골동품 | 極低 (재산종류 14 + 부표 8 별도) | 3 |

→ **본 PR enum 신규 3 값** (가상자산·서화·골동품 분리).

### 1-3. EstatePropertyKindCode enum 폐기 → 매핑 함수 (C3-3)

**v1**: A11~B22 12 코드 enum 신설.

**v2**: **매핑 함수 1개로 대체**.

```ts
function inferPropertyKindCode(gift: PriorGift): EstatePropertyKindCode {
  if (gift.beneficiaryType === "corporate") return "A22";  // 상속인 외
  if (gift.isHeir) return "A21";                            // 상속인
  // ... 조특법 §30의5/§30의6 분기 등
  return "A22";
}
```

타입 인플레이션 회피. enum 신설 없이 string literal type + 매핑 함수.

→ **본 PR 데이터 모델 변경 0** (코드는 표시 시 자동 추론).

### 1-4. legacy 마이그레이션 보수적 — 자동 변환 폐기 (C3-4)

**v1**: `real_estate_land` → `real_estate_land_pure` 자동 변환.

**v2**: 자동 변환 **폐기**. 부수토지 케이스 누락 위험 회피.
- legacy `real_estate_land` 값 그대로 보존
- 라벨 매핑 시: `real_estate_land` → "02/03 토지 (부수토지 여부 미지정)"
- 사용자가 새로 입력 시에만 `isAttachedLandToBuilding` 토글 활성

→ **마이그레이션 코드 불필요**. 회귀 위험 0.

### 1-5. KoreanLaw 본문 인용 (C3-5) — §0-2 강제

### 1-6. 작업량 정정 (C3-6)

v1 ~210 → **v2 ~280**.

### 1-7. 우선순위 모순 정정 (C3-7)

**v1**: "부표 5 의 enum 의존" — 부정확. 부표 5 영리법인 정보와 부표 1 재산종류는 직접 의존성 없음.

**v2 정정**: **본 PR 독립**. 다른 계획서와 평행 진행 가능.

### 1-8. anchor 코드 스켈레톤 (CC-3) — §6

## 2. KoreanLaw 본문 (부표 1 양식, v2 재인용 강제)

```
재산종류코드 (14종):
01 현금
02 토지I (순수토지)
03 토지II (일반건물 부수토지)
04 개별주택 (부수토지 포함)
05 공동주택 (부수토지 포함)
06 오피스텔·상업용건물 (부수토지 포함)
07 일반건물 (부수토지 제외)
08 부동산을 취득할 수 있는 권리
09 유가증권 (상장)
10 유가증권 (비상장)
11 금융재산 (현금, 유가증권 제외)
12 기타재산
13 가상자산
14 서화·골동품 등

재산구분코드 (12종):
A11 상속재산 (상속인)
A12 상속재산 (상속인 외)
A13 상속개시 전 처분재산
A21 증여재산 가산 (상속인)
A22 증여재산 가산 (상속인 외)
A23 증여재산 가산 (창업자금 — 조특법 §30의5)
A24 증여재산 가산 (가업승계 — 조특법 §30의6)
B11 비과세재산 (금양임야)
B12 비과세재산 (공공단체 유증)
B13 비과세재산 (기타)
B21 과세가액불산입 (공익법인 출연재산)
B22 과세가액불산입 (공익신탁재산)
```

## 3. 변경 범위 (v2 — 축소)

### 3-1. `GiftPriorPropertyCategory` enum 확장 — 신규 3 값 (v2)

```ts
export type GiftPriorPropertyCategory =
  | "cash"                          // 01 (기존)
  | "real_estate_land"              // 02/03 (기존 유지, toggle 분기)
  | "real_estate_individual_house"  // 04 (NEW)
  | "real_estate_apartment"         // 05 (기존)
  | "real_estate_officetel"         // 06 (NEW)
  | "real_estate_building"          // 07 (기존)
  | "real_estate_acquisition_right" // 08 (NEW)
  | "listed_stock"                  // 09 (기존)
  | "unlisted_stock"                // 10 (기존)
  | "financial"                     // 11 (기존)
  | "deposit"                       // 11 보조 (기존 유지 — 마이그레이션 0)
  | "other";                        // 12 (기존)
```

**v1 제거**: `real_estate_land_pure` · `real_estate_land_attached` · `virtual_asset` · `artwork` (점진 도입 후속).

### 3-2. `PriorGift.isAttachedLandToBuilding?: boolean` 신규 (v2)

토지 부수토지 토글 — `real_estate_land` 선택 시 활성:
- true → 부표 03 토지II
- false → 부표 02 토지I
- undefined → "토지 (구분 미지정)" 라벨

### 3-3. 라벨 매핑 — toggle 대응

```ts
function getPropertyCategoryLabel(gift: PriorGift): string {
  if (gift.propertyCategory === "real_estate_land") {
    if (gift.isAttachedLandToBuilding === true) return "03 토지II (일반건물 부수토지)";
    if (gift.isAttachedLandToBuilding === false) return "02 토지I (순수토지)";
    return "02/03 토지 (부수토지 여부 미지정)";
  }
  return GIFT_PRIOR_CATEGORY_LABELS[gift.propertyCategory ?? "other"];
}
```

### 3-4. `EstatePropertyKindCode` 매핑 함수 (enum 폐기 — C3-3)

```ts
type EstatePropertyKindCode = "A21" | "A22" | "A23" | "A24" | /* ... */;

function inferPropertyKindCode(gift: PriorGift, specialTreatment?: "startup" | "family_business"): EstatePropertyKindCode {
  if (specialTreatment === "startup") return "A23";
  if (specialTreatment === "family_business") return "A24";
  if (gift.beneficiaryType === "corporate") return "A22";
  return gift.isHeir ? "A21" : "A22";
}
```

→ enum 정의는 type literal로 표현. 별도 enum 신설 없음.

### 3-5. UI — toggle 위젯

PriorGiftInput.tsx `propertyCategory` select 옆에 (또는 아래에) `real_estate_land` 선택 시 노출:

```tsx
{gift.propertyCategory === "real_estate_land" && (
  <ToggleCard
    tone="sky"
    variant="chip"
    title="일반건물의 부수토지"
    description="토지II (03) — 부수토지 여부에 따라 신고서 부표 코드 변경"
    checked={gift.isAttachedLandToBuilding === true}
    onCheckedChange={(v) => set({ isAttachedLandToBuilding: v })}
  />
)}
```

## 4. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | GiftPriorPropertyCategory 3 값 추가 + isAttachedLandToBuilding | 본 PR |
| ② initial | undefined 유지 (기존 fallback) | — |
| ③ normalize | **마이그레이션 0** (v2 — 자동 변환 폐기) | — |
| ④ API 변환 | spread 자동 | — |
| ⑤ UI 위젯 | PriorGiftInput select 옵션 3개 추가 + toggle 위젯 | 본 PR |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | InheritanceFilingFormTable 라벨 매핑 + isAttachedLandToBuilding 반영 | 본 PR |
| ⑧ Validation | enum 자동 (Zod) | — |
| ⑨ Zod enum | priorGiftSchema.propertyCategory 신규 3 값 + isAttachedLandToBuilding optional | 본 PR |
| ⑩~⑭ | — | — |

## 5. 케이스 매트릭스

| # | 시나리오 | 입력 | 기대 라벨 |
|---|---|---|---|
| P1 | 신규 — 개별주택 | propertyCategory="real_estate_individual_house" | "04 개별주택 (부수토지 포함)" |
| P2 | 신규 — 오피스텔 | "real_estate_officetel" | "06 오피스텔·상업용건물 (부수토지 포함)" |
| P3 | 신규 — 부동산 권리 | "real_estate_acquisition_right" | "08 부동산을 취득할 수 있는 권리" |
| P4 | 토지 + 부수토지 토글 ON | real_estate_land + isAttachedLandToBuilding=true | "03 토지II (일반건물 부수토지)" |
| P5 | 토지 + 부수토지 토글 OFF | real_estate_land + isAttachedLandToBuilding=false | "02 토지I (순수토지)" |
| P6 | 토지 + 토글 미설정 (legacy) | real_estate_land + isAttachedLandToBuilding=undefined | "02/03 토지 (부수토지 여부 미지정)" |
| P7 (회귀) | 기존 cash | propertyCategory="cash" | "01 현금" — 무변화 |
| P8 (회귀) | legacy deposit | propertyCategory="deposit" | "11 금융재산 (예금)" — 무변화 |
| P9 | inferPropertyKindCode — 자연인 상속인 | isHeir=true | "A21" |
| P10 | inferPropertyKindCode — 영리법인 | beneficiaryType="corporate" | "A22" |
| P11 | inferPropertyKindCode — 창업자금 | specialTreatment="startup" | "A23" |

## 6. anchor 검증 (코드 스켈레톤 — CC-3)

```ts
import { getPropertyCategoryLabel, inferPropertyKindCode } from "@/components/calc/results/inheritance-filing-form-helpers";

describe("부표 1 재산종류코드 정합화", () => {
  it("ANCHOR-P1: 04 개별주택 라벨", () => {
    const gift = { propertyCategory: "real_estate_individual_house" } as PriorGift;
    expect(getPropertyCategoryLabel(gift)).toBe("04 개별주택 (부수토지 포함)");
  });

  it("ANCHOR-P4: 토지II 토글 ON", () => {
    const gift = { propertyCategory: "real_estate_land", isAttachedLandToBuilding: true } as PriorGift;
    expect(getPropertyCategoryLabel(gift)).toBe("03 토지II (일반건물 부수토지)");
  });

  it("ANCHOR-P5: 토지I 토글 OFF", () => {
    const gift = { propertyCategory: "real_estate_land", isAttachedLandToBuilding: false } as PriorGift;
    expect(getPropertyCategoryLabel(gift)).toBe("02 토지I (순수토지)");
  });

  it("ANCHOR-P6 (회귀): legacy 토지 — 토글 미설정", () => {
    const gift = { propertyCategory: "real_estate_land" } as PriorGift;
    expect(getPropertyCategoryLabel(gift)).toBe("02/03 토지 (부수토지 여부 미지정)");
  });

  it("ANCHOR-P8 (회귀): legacy deposit 무변화", () => {
    const gift = { propertyCategory: "deposit" } as PriorGift;
    expect(getPropertyCategoryLabel(gift)).toBe("11 금융재산 (예금)");
  });

  it("ANCHOR-P10: 영리법인 → A22 자동 추론", () => {
    const gift = { beneficiaryType: "corporate", isHeir: false } as PriorGift;
    expect(inferPropertyKindCode(gift)).toBe("A22");
  });

  it("ANCHOR-P11: 창업자금 → A23 (조특법 §30의5)", () => {
    const gift = { isHeir: true } as PriorGift;
    expect(inferPropertyKindCode(gift, "startup")).toBe("A23");
  });
});
```

## 7. Out-of-Scope (점진 도입)

- 13 가상자산 enum 추가 — 후속 마이크로 PR
- 14 서화·골동품 enum 추가 + 부표 8 별도 컴포넌트 — 후속 별도 PR
- 부표 1·2 본문 자체 컴포넌트 (사전증여 외 상속재산 명세 표시) — 별도 PR
- 부표 5 영리법인 면제 명세 — 독립 계획서 (계획서 2)
- 상속세 모드 모달 활성화 — 독립 계획서 (계획서 1)

## 8. 작업량 (v2 정정)

| 항목 | 변경 |
|---|---|
| GiftPriorPropertyCategory enum 신규 3 값 | ~5줄 |
| PriorGift.isAttachedLandToBuilding 옵션 | ~5줄 |
| getPropertyCategoryLabel · inferPropertyKindCode 헬퍼 | ~50줄 |
| Zod priorGiftSchema 확장 | ~10줄 |
| PriorGiftInput select 옵션 + toggle 위젯 | ~40줄 |
| InheritanceFilingFormTable 라벨 매핑 적용 | ~20줄 |
| anchor 11건 (P1~P11, 코드 스켈레톤 §6) | ~150줄 |
| **합계** | **~280줄** (v1 210 → v2 280) |

## 9. Definition of Done (v2 강화)

- [ ] **사용자 needs 검증** (§0-1) — 세무사 사용자 가치 확인
- [ ] **KoreanLaw MCP 본문 재인용** (§0-2) — 재산종류 14종·재산구분 12종 본문
- [ ] GiftPriorPropertyCategory 신규 3 값 (개별주택·오피스텔·부동산권리)
- [ ] PriorGift.isAttachedLandToBuilding 옵션 + toggle UI
- [ ] getPropertyCategoryLabel · inferPropertyKindCode 헬퍼
- [ ] Zod priorGiftSchema 확장
- [ ] PriorGiftInput select + toggle 위젯
- [ ] InheritanceFilingFormTable 라벨 매핑
- [ ] anchor P1~P11 통과
- [ ] P7·P8 (legacy 회귀) 보호
- [ ] **마이그레이션 코드 없음** (자동 변환 폐기)
- [ ] `npx tsc --noEmit` 0건
- [ ] **브라우저 수동 확인** — 미수행 시 명시

## 10. 우선순위 (v2 정정 — C3-7)

본 PR은 **독립**. 계획서 1·2 와 평행 진행 가능. 의존성 없음.

권장 순서 (작업량·위험 기준):
1. **본 PR** (부표 1 enum) — 마이크로 PR (~280줄), 위험 낮음
2. 계획서 1 (모달 활성화) — UI 변경 (~400줄), 사용자 needs 검증 후 진입
3. 계획서 2 (부표 5) — 데이터 모델 변경 (~940줄 / 2 PR 분할), §0 §3의2② 범위 확정 후 진입

## 11. 위험·되돌리기

- **위험 1**: 세무사 사용자 needs 부족 시 작업 가치 0
- **위험 2**: enum 추가 → 기존 사용자 데이터 호환성 — v2 마이그레이션 폐기로 위험 0
- **위험 3**: toggle UI 사용자 혼동 — description 명확 + ⓘ hint 표시
- **되돌리기**: enum 신규 값 제거 + helper 함수 revert — 영향 범위 작음
