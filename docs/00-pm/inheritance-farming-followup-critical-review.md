# 영농상속공제 후속 작업 계획서 — 비판적 재검토

> **대상**: 2026-05-21 작성 3개 문서
> - `inheritance-farming-ui-integration.plan.md`
> - `inheritance-farming-administrative-district.prd.md`
> - `inheritance-farming-remaining-prs.plan.md` 부록 A
>
> **검토 방식**: 실제 코드(`components/`·`lib/`) grep 결과 vs 계획서 가정 대조
> **검토일**: 2026-05-21

---

## 1. 치명적 오류 (Blocker)

### C1. UI-E1 작업량 과대 추정 — 신규 컴포넌트 불필요

**계획서 가정** (§3-3):
> `components/calc/inheritance/AssetLocationField.tsx` 신규 (또는 기존 위젯 확장)
> 작업량: 3~4h

**실제 코드**:
```typescript
// components/calc/PropertyValuationForm.tsx:128
const [addrValue, setAddrValue] = useState<AddressValue>({ ... });

// line 163-172
<AddressSearch
  value={addrValue}
  onChange={(v) => {
    setAddrValue(v);
    // ... name 동기화만
  }}
/>
```

`AddressValue`는 이미 `lat: string`·`lng: string` 포함. **AddressSearch는 좌표를 이미 반환**.

**비판**:
- 신규 `AssetLocationField` 컴포넌트 불필요
- 기존 `AddressSearch` onChange에 `onUpdate({ estateLatLng: { lat: parseFloat(v.lat), lng: parseFloat(v.lng) } })` 추가만 하면 끝
- **실제 작업량: 30분~1h** (PropertyValuationForm onChange 콜백 한 블록 추가)

**정정**: UI-E1 §3-3 신규 컴포넌트 제안 폐기. 기존 AddressSearch 통합으로 단순화.

---

### C2. PropertyValuationForm 좌표 휘발 버그 (사전 발견 못 함)

**실제 코드 (line 128)**:
```typescript
const [addrValue, setAddrValue] = useState<AddressValue>({ ... });
```

→ `addrValue`는 **컴포넌트 local state**. `EstateItem`에 저장 안 됨.

**결과**:
- 사용자가 주소 검색 → 좌표 표시 (line 290 "좌표: ...")
- **페이지 리로드 / sessionStorage 직렬화 후 좌표 손실**
- 자산 카드 재렌더 시 빈 AddressSearch

**비판**: 본 버그는 PR-E 인프라(`dd7e2fc`) 이전에도 존재. UI-E1 통합 시 동시 수정 필수. 계획서가 이를 명시 안 함.

**정정**: UI-E1 §3-4 통합 지점에 다음 항목 추가:
- `EstateItem`에 `estateAddress?: { road?, jibun?, building?, detail?, pnu? }` 필드 신규 (또는 기존 `name`에 통합)
- `addrValue` local state 폐기 → `item.estateAddress` 직접 read/write

이 변경은 **별도 PR 또는 UI-E1에 포함**해야 좌표 통합 후 회귀가 안정.

---

### C3. StockValuationForm은 AddressSearch 미사용 — corporate_stock 좌표 입력 경로 없음

**계획서 가정** (§2-2):
> StockValuationForm 자산 카드에도 CorporateNonBusinessAssetsSection 통합

**실제 코드**:
```bash
$ grep "AddressSearch\|addrValue" components/calc/StockValuationForm.tsx
# 결과 0건
```

**비판**:
- StockValuationForm은 상장·비상장 주식 전용 — 주소 입력 없음
- corporate_stock 자산의 좌표(법인 본점)는 어디서 입력?
- 시행령 §16②1호나는 자산 소재지 기준. **법인 영농 주식의 경우 거주지 30km 자동 검증 자체가 무의미** (corporate 트랙은 거주 요건 없음 — §16②2호)
- 그러나 `EstateItem.estateLatLng`은 corporate_stock에도 정의되어 있어 혼란

**정정**:
- UI-E1에서 corporate_stock에는 `estateLatLng` 입력 위젯 미노출 (이미 `farming-residence-check.ts`에서 corporate_stock은 좌표 무관 처리됨 ✓)
- 계획서 §3-4 분기 조건 명확화: `LAND_BASED.includes(item.farmingCategory)` AND `item.farmingCategory !== "corporate_stock"`

---

## 2. 중대 오류 (Major)

### M1. 컴포넌트명 부정확

**계획서 §2-2**:
> 5. (상속 모드) `EstateItemHeirAllocationToggle` — 기존

**실제 코드**:
```typescript
// components/calc/PropertyValuationForm.tsx:20
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
```

**정정**: `EstateItemHeirAllocationToggle` → `HeirAllocationToggleSection`.

### M2. UI-E1 시간 추정 자체 모순

계획서 §6 진행 순서:
- UI-E1 (3~4h) — AssetLocationField 신규 + Vworld 응답 좌표 조사

그러나:
- AddressSearch 좌표 반환 이미 확인됨 (실측)
- 신규 컴포넌트 불필요 (C1)
- 사전 조사도 30분 내 완료 가능 (이미 본 비판에서 완료)

**실제 작업량: 1~2h** (AddressSearch 통합 + EstateItem.estateLatLng 저장 + sessionStorage 호환 점검 + anchor 5건).

### M3. "사용자 boolean=false를 자동 통과가 덮어쓴다" 정책의 UX 위험

**계획서 §4-6**:
> 자동 true → 사용자 boolean=false 덮어쓰기. `checkFarmingResidenceCompliance` 결과는 true (자동 우선)

**비판**:
- 사용자가 의도적으로 false를 체크한 경우(예: "법령 해석상 어렵다고 판단", "30km 이내이지만 일시 거주") 자동이 덮어씀
- 법령 정확성 우선 시 사용자 명시 입력 무시는 위험 — 세무 계산 결과의 신뢰성 저해
- UI에서 "자동 검증 통과 (사용자 false 무시)" 경고만으로는 불충분 — 사용자가 자신의 입력이 무시됨을 모를 수 있음

**정정 방안**:
- **옵션 A**: 사용자 명시 입력 항상 우선 (자동 결과는 안내만, 토글 자동 변경 안 함)
- **옵션 B**: 자동 결과를 토글에 자동 적용 + "사용자 직접 수정 시 자동 미반영" UI 표시
- **옵션 C**: 현재 정책 유지 + 명확한 경고 카드

**권장**: 옵션 A. `farming-residence-check.ts`의 현재 정책(자동 우선) 자체를 재검토 필요. PR-E 인프라 변경 동반.

---

## 3. 일반 오류 (Minor)

### m1. 행정구역 매트릭스 작업량 과소

**PRD §6 Phase 1**: KoreanLaw MCP 검증 + 정적 인접 매트릭스 데이터 수집 — 4~6h

**실제 추정**:
- 행정안전부 표준 행정구역 데이터 다운로드 + 파싱: 1~2h
- KoreanLaw MCP §16②1호나 해석례 5건+ 조사: 2~3h
- 250 시·군·구 × 평균 5 인접 = 1,250 엔트리 수작업/스크립트: 6~10h
- 광역시·도 경계 OR 정책 결정 + 검토: 1~2h

**실제 작업량: 10~17h**. 계획서 4~6h은 과소.

### m2. Vworld 역지오코딩 정확도 미검증

**PRD §4-2**: Vworld 역지오코딩 API (UI-E1과 동일 키 재사용)

**비판**:
- Vworld 역지오코딩이 "서울특별시 강남구" 형식으로 정확히 반환하는지 미검증
- 일부 좌표에서 동/리 수준만 반환 가능 — 시·군·구 매핑 별도 처리 필요
- API rate limit (일 30,000건?) 정확한 수치 미인용

**정정**: Phase 1 사전 조사에 Vworld 역지오코딩 응답 샘플 5건+ 첨부 항목 추가.

### m3. PR-F 부록 §16⑭ 결격소득 해석 불확실

**부록 A 신규 데이터 모델**:
```typescript
// §16⑭ 결격소득은 상속인별 분리
hasDisqualifyingIncome?: boolean;
```

**비판**:
- 시행령 §16⑭ 원문: "피상속인 또는 상속인" — "피상속인 1명 + 상속인 1명 이상 중 누구라도" 해석 가능
- 상속인별 분리 가능 여부는 KoreanLaw MCP 해석례 0건이면 보수적으로 "1명이라도 해당 시 전체 배제"
- 부록 A가 이 해석을 "분리 가능"으로 단정 — 사전 검증 없음

**정정**: 부록 A §A-2에 KoreanLaw MCP §16⑭ 해석례 사전 검증 항목 추가. 분리 불가 시 부록 A 자체 폐기.

### m4. ResidenceCheckPreviewCard 5분기 부정확

**UI 계획서 §4-3**:
| decedentMet / heirMet | minDistance | 카드 |
| true / true | 둘 다 ≤30 | emerald |

**비판**:
- `decedentMet=true`는 사용자 override 가능 (자동 false + 사용자 명시 true). 카드 라벨이 "둘 다 ≤30km"라고 단정 시 사용자 혼동
- minDistance=null과 met=false의 의미 차이 미명시 (좌표 미입력 vs 좌표 입력 + 30km 초과)

**정정**: 5분기 라벨에 "(자동 검증) / (사용자 명시) / (좌표 미입력)" 출처 명시 필요.

### m5. 14지점 점검 "⚠️ 확인 필요" 미해결

**UI 계획서 §5**:
| ④ API 변환 | ⚠️ 확인 필요 |
| ⑧ Validation | ⚠️ 확인 필요 |

**비판**: 계획서 작성 단계에서 grep으로 확정 가능. "확인 필요" 잔류는 계획서 미완성.

**정정**: 본 비판 검토 시점에 직접 grep:

```bash
grep -n "estateLatLng\|fishingAnchorLatLng\|corporateNonBusinessAssets\|corporateTotalAssets" lib/calc/ -r
```

미확인 — 작업 진입 전 grep 의무화.

---

## 4. 누락 사항

### N1. sessionStorage 마이그레이션 호환

- PR-C·E에서 EstateItem에 신규 optional 필드 4종 추가 (corporateNonBusinessAssets·corporateTotalAssets·estateLatLng·fishingAnchorLatLng)
- 기존 sessionStorage에 저장된 폼 데이터는 undefined로 자동 호환 ✓
- 그러나 PropertyValuationForm.tsx의 `addrValue` local state가 sessionStorage에 직렬화 안 됨 → UI-E1에서 EstateItem에 통합 시 마이그레이션 hook 필요?

**정정**: UI-E1 §3-5에 sessionStorage 호환 점검 anchor (E1-6 신규) 추가.

### N2. 결과 카드 (⑦) 노출 정책

UI 계획서 §5 ⑦:
> 자동차감 적용 시 결과 카드에서 corporateNonBusinessAssets 정보 표시 (선택적)

**비판**: "선택적"이 무책임. 결과 카드는 사용자에게 가장 중요한 검증 지점.

**정정**: 명확한 표시 정책 명시:
- 사업무관자산 차감 적용 시 결과 카드에 "차감 비율 N.NN% (사업무관자산 합 N억 / 총자산 N억)" 표시 의무
- corporate_stock 자산 평가가액 옆 "(차감 전 N억 → 차감 후 N억)" 비교 표시

### N3. UI 시니어 에이전트 호출 누락

영농상속공제 UI 통합은 `inheritance-gift-tax-ui-senior` 영역. 계획서가 에이전트 호출 의무화 안 함.

**정정**: 각 UI 작업 진입 시 `inheritance-gift-tax-ui-senior` Plan 단계 동시 호출 명시.

### N4. 브라우저 수동 확인 절차 미상세

UI 계획서 §7 Definition of Done:
> 브라우저 수동 확인 — 폼 입력 → 좌표 저장 → 거주지 자동 검증 미리보기 노출

**비판**: 시나리오 단계가 모호. 구체적 단계 누락.

**정정**: 다음 단계를 §7에 명시:
1. `npm run dev` 후 `/calc/inheritance-tax` 진입
2. Step1 영농 자산 1건 추가 (farmingCategory="farmland")
3. AddressSearch로 자산 주소 검색 → 좌표 자동 저장 확인
4. Step4 영농상속공제 토글 ON → 거주지 좌표 입력
5. 자동 검증 미리보기 카드 노출 확인 (5분기)
6. F5 새로고침 → 좌표·미리보기 유지 확인 (sessionStorage)
7. 결과 페이지 → 사업무관자산 차감 비율 표시 확인 (corporate_stock 시)

---

## 5. 정책 충돌

### P1. mirror-pattern vs 자동 미리채움

UI 계획서 §4-4:
> 자동 검증 결과를 사용자 boolean 토글에 미리채움

**충돌**: CLAUDE.md `feedback_useeffect_store_mirror_forbidden` — useEffect로 store 미러링 금지.

**해결**:
- useEffect 미사용 → onChange 시점에 직접 자동 결과 반영
- 사용자 명시 변경 시 자동 미러링 중단
- **이 정책은 옵션 A (사용자 명시 우선)으로 자연 해결**

### P2. 자동 안분 fallback 금지 vs 자동 검증 통과

CLAUDE.md `feedback_no_silent_apportion_fallback`:
> 빈값 자동 채우기 금지. 미입력은 검증 오류로 차단

**충돌 검토**: 자동 검증 통과는 "boolean 자동 결정"이지 빈값 fallback이 아님 → 위반 아님 ✓

---

## 6. 종합 권장 사항

### 6-1. 작업량 재추정

| 작업 | 계획서 추정 | 실제 추정 (실측 후) |
|---|---|---|
| UI-C | 1~2h | **1~2h** ✓ (정확) |
| UI-E1 | 3~4h | **1~2h** (C1·M2 정정) |
| UI-E2 | 3~4h | **3~4h** ✓ (정확) |
| UI-E3 | 1~2h | **1~2h** ✓ (정확) |
| 행정구역 Phase 1 | 4~6h | **10~17h** (m1 정정) |
| 행정구역 Phase 2~5 | 8~10h | **8~10h** ✓ |
| PR-F 부록 A | 6~9h | **8~12h** (KoreanLaw 검증 추가) |

### 6-2. 진입 우선순위 재조정

```
UI-C (1~2h, 단순)
  ↓
[PR-E 인프라 정책 재검토] — M3 옵션 A 적용 가능성 (자동 우선 → 명시 우선)
  ↓
UI-E1 + 좌표 휘발 버그 수정 (C2, 2~3h)
  ↓
UI-E2 + UI-E3 통합 (4~5h)
  ↓
[행정구역 PRD Phase 1 KoreanLaw MCP 검증] — 10~17h
  ↓
... 나머지 Phase
```

### 6-3. 필수 사전 작업

1. **KoreanLaw MCP 검증** (행정구역 PRD Phase 1 + PR-F 부록 A §16⑭)
2. **PR-E 정책 재검토** (M3 자동 우선 vs 명시 우선)
3. **좌표 휘발 버그 수정** (C2 — addrValue → EstateItem 직접 read/write)
4. **14지점 ④⑧ grep 확정** (m5)

### 6-4. 계획서 자체 정정 필요 항목

- UI 계획서 §3-3: AssetLocationField 신규 제안 삭제 → AddressSearch 확장으로 단순화
- UI 계획서 §2-2: `EstateItemHeirAllocationToggle` → `HeirAllocationToggleSection`
- UI 계획서 §4-3: 5분기 라벨에 출처(자동/명시/미입력) 명시
- UI 계획서 §5: ④⑧ "확인 필요" → grep 결과 확정 후 ✅
- UI 계획서 §7: 브라우저 수동 확인 7단계 명시
- 행정구역 PRD §6: Phase 1 시간 4~6h → 10~17h
- 행정구역 PRD §4-2: Vworld 역지오코딩 응답 샘플 5건 첨부 항목 추가
- PR-F 부록 A §A-2: §16⑭ KoreanLaw MCP 사전 검증 의무화

---

## 7. 결론

### 7-1. 계획서 품질 평가

| 항목 | 평가 | 비고 |
|---|---|---|
| 법령 인용 정확성 | ⚠️ 부분 | §16②1호나는 인용 / §16⑭ 해석 미검증 |
| 작업량 추정 | ❌ 부정확 | UI-E1 과대 / 행정구역 Phase 1 과소 |
| 실제 코드 사전 검증 | ❌ 미수행 | C1·C2·C3 모두 grep 한 번으로 발견 가능 |
| 14지점 동기화 | ⚠️ 부분 | ⑤⑦은 명확 / ④⑧ "확인 필요" 잔류 |
| 정책 충돌 검토 | ⚠️ 부분 | mirror-pattern은 명시 / M3 자동 우선 정책 미검토 |
| 위험 요소 식별 | ✅ 양호 | 800줄 정책·Vworld 의존성 등 식별됨 |

### 7-2. 계획서 사용 권고

- **계획서 그대로 진행 금지** — 본 비판 정정 사항 반영 필수
- 진입 전 KoreanLaw MCP 검증 + grep 확정 + 정책 재검토 의무화
- UI-C는 정정 적은 편 → 단독 진행 가능
- UI-E1~E3 + 행정구역 PRD는 본 비판 통합 후 v2 작성 권장

### 7-3. 후속 액션

1. 본 비판 검토 문서(`inheritance-farming-followup-critical-review.md`)를 계획서들의 §0 참조 문서로 추가
2. UI 통합 계획서·행정구역 PRD·부록 A에 본 비판 정정 사항 반영 (v2)
3. UI-C부터 진입 시 본 비판 §1·§2 정정 사항 사전 확인
