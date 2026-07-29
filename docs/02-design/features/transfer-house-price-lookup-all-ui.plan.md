# 양도소득세 탭 전체 개별주택가격 조회 버튼 — 수정 계획서 (v2)

> v1 오류 정정: 재사용 컴포넌트 신규 생성(X) → **기존 `StandardPriceInput` 재사용**. 인벤토리 완료/미완료 판정 재감사(Companion·PostDeemed 이미 완료). referenceDate 오류 정정.

## 1. v1 대비 정정 사항 (코드 실측)

| 항목 | v1 오류 | v2 정정 |
|---|---|---|
| 재사용 컴포넌트 | 신규 `HousePriceLookupButton` 생성 제안 | **`components/calc/inputs/StandardPriceInput.tsx` 이미 존재** — `propertyKind: house_individual\|house_apart` 시 연도 select + "공시가격 조회" 버튼 + 총액 입력 + 고시일/경계 경고까지 내장. `useStandardPriceLookup` 래핑. **이걸 재사용**한다(신규 생성 금지). |
| 인벤토리 완결성 | Companion 블록 3종 누락 | Companion 3종(house price)·PostDeemed는 **이미 `StandardPriceInput` 사용 = 완료**. v1이 PostDeemed를 ❌로 오판. |
| HouseVal 최초공시 연도 | `inheritanceDate` | **`inhHouseValFirstDisclosureDate \|\| "2005-04-30"`**(`HOUSE_FIRST_DISCLOSURE_DATE`). 상속개시일은 pre-2005라 조회 불가 — 최초공시(2005) 연도 기준이어야 함. |
| 기존 인라인 구현 | — | 커밋 `d9f91b38`의 `PreHousingDisclosureSection` 인라인 버튼은 `StandardPriceInput`과 중복 구현(비-DRE). **StandardPriceInput로 리팩터**해 일원화(단일 소스 정책). |

## 2. StandardPriceInput 재사용 방식 (주택)

```tsx
<StandardPriceInput
  propertyKind={isApart ? "house_apart" : "house_individual"}
  totalPrice={asset.<field>}
  onTotalPriceChange={(v) => onChange({ <field>: v })}
  jibun={asset.addressJibun || undefined}
  dong={asset.addressDong || undefined}   // house_apart 세대 식별(선택)
  ho={asset.addressHo || undefined}
  referenceDate={<시점 날짜>}               // 연도 자동(getDefaultPriceYear housing 4.29 컷오프)
  label="<라벨>"
  required
/>
```
- house(단독·공동)는 `isAreaMode=false` → 총액 직접입력 + 연도 select + 조회 버튼 렌더. 면적/단가 칸 없음.
- 기존 `CurrencyInput`(+ 있으면 `FieldCard` 래퍼)을 이 컴포넌트로 치환. 엔진 전달값은 동일 `totalPrice` 필드 → **API/엔진 무변경**.

## 3. 대상 필드 전수 인벤토리 (재감사)

### 3.1 ✅ 이미 `StandardPriceInput` 사용 (완료 — 작업 불필요)
| 컴포넌트 | 비고 |
|---|---|
| `CompanionAcqPurchaseBlock` (2) | 나대지+신축 companion 취득 주택가격 |
| `CompanionAcqInheritanceBlock` (2) | companion 상속 취득 주택가격 |
| `CompanionSaleModeBlock` (1) | companion 매각모드 |
| `inheritance/PostDeemedInputs` (1) | estate item 개별/공동주택가격(부수토지 포함), dong/ho 전달 |

### 3.2 ❌ 미완료 (plain `CurrencyInput` → `StandardPriceInput` 치환 필요)
| # | 컴포넌트 | 필드 | referenceDate |
|---|---|---|---|
| 1 | `PreHousingDisclosureSection` | `phdFirstDisclosureHousingPrice` | `phdFirstDisclosureDate` (인라인→StandardPriceInput 리팩터) |
| 2 | `PreHousingDisclosureSection` | `phdTransferHousingPrice` | `transferDate` (동상) |
| 3 | `MixedUsePreHousingDisclosureSection` | `phdFirstDisclosureHousingPrice` | `phdFirstDisclosureDate` |
| 4 | `MixedUsePreHousingDisclosureSection` | `mixedTransferHousingPrice` | `transferDate` |
| 5 | `MixedUseAssetMajorStdPrice` | `mixedTransferHousingPrice` | `transferDate` |
| 6 | `MixedUseAssetMajorStdPrice` | `mixedAcqHousingPrice` | `acquisitionDate` |
| 7 | `MixedUseLegacyStdPrice` | `mixedTransferHousingPrice` | `transferDate` |
| 8 | `MixedUseLegacyStdPrice` | `mixedAcqHousingPrice` | `acquisitionDate` |
| 9 | `RedevelopmentValuationSection` | `redevManagementDisposalHousingPrice` | `redevApprovalDate` |
| 10 | `RedevelopmentValuationSection` | `redevAcquisitionHousingPrice` | `acquisitionDate` |
| 11 | `RedevelopmentValuationSection` | `redevFirstDisclosureHousingPrice` | `redevFirstDisclosureDate` |
| 12 | `inheritance/HouseValuationSection` | `inhHouseValHousePriceAtTransfer` | `transferDate` |
| 13 | `inheritance/HouseValuationSection` | `inhHouseValHousePriceAtFirst` | `inhHouseValFirstDisclosureDate \|\| "2005-04-30"` |

→ **미완료 13필드 / 6개 컴포넌트** (jibun 전 컴포넌트 `asset.addressJibun` 접근 가능 — 실측).

## 4. 레이아웃 고려 (신규 검토)

`StandardPriceInput`은 **자체 레이아웃**(연도 select + 조회 버튼 1행 → 총액 input)을 가진다. 반면 최근 개편한 2열 그리드(이미지14·22, `stacked` FieldCard)는 컴팩트하다.

- **결정 필요(§7-1)**: 2열 그리드 셀에 `StandardPriceInput`을 넣으면 셀 높이가 커진다. (A) 그대로 수용(연도 선택 UX 이득) vs (B) `FieldCard` 래퍼 유지하며 `StandardPriceInput`을 children으로(라벨 중복 주의, `hideLabel`/`label=""` 활용). 
- `PreHousingDisclosureSection`·`MixedUsePreHousingDisclosureSection`은 현재 2열 그리드 → 치환 시 셀 높이 증가 감안. `label` 중복 방지(FieldCard label vs StandardPriceInput label 택1).

## 5. 엣지 케이스·정책
- **취득 필드는 이미 공시된 시점에만 노출**(3차 검토 정정): #6·#8(mixed 취득)은 `!usePreHousingDisclosure`(PHD OFF=취득 당시 공시됨)일 때만, #10(redev 취득)은 `취득일 ≥ 최초공시일` 게이팅 시에만 렌더 → **조회 일반적 성공**(pre-2005 미공시 케이스는 PHD/§164⑦ 경로로 빠져 취득 필드 자체가 숨김). v1/v2 초안의 "pre-2005 조회 실패" 우려는 대부분 무효. (혹 미공시분 조회 시 실패 메시지 표시·차단 아님.)
- **house_apart(공동주택)**: `dong`/`ho` 전달 시 정확. PHD `housingType`·PostDeemed `kind`로 propertyKind 분기. mixed/redev는 개별주택 가정(house_individual) — 아파트 겸용/재개발은 best-effort.
- **평가기준일 경계 경고**: StandardPriceInput 내장(`isNoticeAfterReference`) — 취득/양도 시점 미고시 자동 경고(추가 이득).
- **엔진/API/validation 무변경**: `totalPrice`=기존 필드 write, 신규 필드 0 → 14 동기화 지점 무관.

## 6. 변경 파일 (6개, 신규 0)
| 파일 | 필드 |
|---|---|
| `PreHousingDisclosureSection.tsx` | 인라인 버튼 → StandardPriceInput 리팩터(2) |
| `mixed-use/MixedUsePreHousingDisclosureSection.tsx` | 2 |
| `mixed-use/MixedUseAssetMajorStdPrice.tsx` | 2 |
| `mixed-use/MixedUseLegacyStdPrice.tsx` | 2 |
| `RedevelopmentValuationSection.tsx` | 3 |
| `inheritance/HouseValuationSection.tsx` | 2 |

## 7. 미결/결정 필요
1. **레이아웃**(§4): 2열 그리드에 StandardPriceInput 직접 수용(A) vs FieldCard children 래핑(B). 권장=B(라벨·그리드 일관 유지, `hideLabel`).
2. **PreHousingDisclosureSection 리팩터**: `d9f91b38` 인라인 버튼을 StandardPriceInput로 대체할지(일관성 vs 이미 동작). 권장=대체(연도 select 이득·단일 소스).
3. **상속 경로 포함**(#12·#13 HouseValuation): 양도세 탭 내 상속주택 양도 계산이므로 포함 가정. 제외 시 2필드 스킵.
4. **취득 필드(#6·#8·#10)**: 이미 공시된 시점에만 노출(§5 정정)이라 실효성 있음 → 노출 유지(별도 결정 불요). ~~pre-2005 우려~~ 철회.

## 8. Definition of Done
- [ ] 신규 컴포넌트 0 — 전부 기존 `StandardPriceInput` 재사용
- [ ] 미완료 13필드 `StandardPriceInput` 치환, 각 `propertyKind`·`referenceDate` 정확(§3.2 표)
- [ ] `PreHousingDisclosureSection` 인라인 버튼 제거·StandardPriceInput 대체(결정 시)
- [ ] HouseVal 최초공시 referenceDate = `inhHouseValFirstDisclosureDate || "2005-04-30"` (v1 오류 반영)
- [ ] `npx tsc --noEmit` 0건 / ESLint clean / 800줄(현 최대 576, 여유)
- [ ] 회귀 E2E 통과 + 각 사이트 "공시가격 조회" 노출 assert
- [ ] 겸용·재개발·상속 대표 스크린샷
- [ ] 엔진/API/validation 무변경 확인(신규 필드 0)
