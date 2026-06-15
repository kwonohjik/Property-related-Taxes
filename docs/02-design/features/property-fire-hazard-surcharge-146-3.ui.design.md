# 재산세 화재위험 건축물 소방분 중과 (§146③2호·2의2호) — UI 설계

> 엔진 설계: `property-fire-hazard-surcharge-146-3.engine.design.md`
> UI 동기화: 재산세 8지점(`components/calc/property/shared.ts` 집약 + Zod)
> 담당: `property-tax-ui-senior`

## 1. 사용자 시나리오

1. 물건 유형 **건축물** 선택 → 공시가격(기준시가) 입력.
2. **건축물 유형**(buildingType: 일반/골프장/고급오락장/공장) 라디오 직하에, 신규 **화재위험 등급** 라디오 노출(건축물 한정).
3. 일반 / 화재위험(×2) / 대형 화재위험(×3) 중 자기분류 — 각 hint에 시행령 §138 대표 예시. "대형 요건 충족 시 대형 선택" 안내.
4. 계산 → 결과 부가세 섹션 "지역자원시설세"에 중과 적용 시 base → ×N → 최종 표기.

## 2. 동기화 지점 매핑 (8 + Zod)

| # | 지점 | 파일·위치 | 작업 |
|---|---|---|---|
| ① | FormState | `property/shared.ts:61` 인근 | `fireHazardClass: string;` |
| ② | INITIAL_FORM | `property/shared.ts:84` 인근 | `fireHazardClass: "none",` |
| 상수 | 라벨+예시 | `property/shared.ts` (BUILDING_TYPE_LABELS 옆) | `FIRE_HAZARD_OPTIONS: {value,label,description}[]` (label만이 아니라 hint=description 포함 — RadioCardGroup options 직결) |
| ③ | normalize | **해당 없음**(component-local) |
| ④ | API 변환 | `property/shared.ts` `buildPropertyTaxRequestBody` (buildingType 전송부 인근) | building + ≠"none" 시 `body.fireHazardClass` |
| ⑤ | UI 위젯 | `property/Step0.tsx:158`(buildingType RadioCardGroup 직후, building 게이트 내) | `RadioCardGroup`(rose) |
| ⑥ | 사이드바 | **해당 없음** |
| ⑦ | 결과 카드 | `results/PropertyTaxResultView.tsx:283`(지역자원시설세 TaxRow) | 중과 시 base→×N→최종 |
| ⑧ | Validation | `property/shared.ts:99` validateStep | enum이라 형식 안전·기본 none → 차단 없음 |
| ⑫ | Zod | `lib/validators/property-input.ts` | `fireHazardClass: z.enum([...]).optional()` + building 외 refine |

## 3. ⑤ 입력 위젯 (Step0.tsx — 건축물 분기)

```
┌─ 건축물 (form.objectType === "building") ──────────────┐
│ [건축물 유형]   ◉일반 ○골프장 ○고급오락장 ○공장   (기존) │
│ ── 신규: 화재위험 등급 (소방분 중과 §146③2호·2의2호) ── │
│ ◉ 일반                                                  │
│ ○ 화재위험 건축물 (소방분 ×2)                            │
│    4~10층·학원·극장·유흥장·숙박·공장·창고·주유소·위험물 등 │
│ ○ 대형 화재위험 건축물 (소방분 ×3)                       │
│    11층↑·대형마트·백화점·호텔·복합상영관·3만㎡↑ 복합건축물 │
│    ※ 대형 요건 충족 시 '대형'을 선택 (시행령 §138① 단서)  │
└────────────────────────────────────────────────────────┘
```
- **배치**: 기존 buildingType 블록(`{form.objectType === "building" && (...)}`, Step0.tsx:147-158) **직후 별도 building-게이트 블록**으로 추가(`isOneHousehold`/`priorYearPublishedPrice`가 각각 독립 게이트 블록인 패턴과 동일).
- `RadioCardGroup`(tone=`rose` — 지역·위험 정보), `layout="stack"`(예시 hint 길어 세로).
- option value ↔ enum 정확 매핑(`enum-verification`): `none`/`fire_hazard`/`large_fire_hazard`.
- `FIRE_HAZARD_OPTIONS`(`{value,label,description}[]`) 상수로 options 일괄 렌더(하드코딩 금지) — `description`이 RadioCardGroup 각 카드 hint로 표시.

## 4. ⑦ 결과 카드 (PropertyTaxResultView.tsx:283)

현행:
```tsx
{surtax.regionalResourceTax > 0 && (
  <TaxRow label="지역자원시설세" amount={surtax.regionalResourceTax} sub />
)}
```
변경 — 중과 적용 시(`surtax.fireHazardMultiplier` 존재) base→×N→최종 분해:
```tsx
{surtax.regionalResourceTax > 0 && (
  surtax.fireHazardMultiplier ? (
    <>
      <TaxRow label="소방분 (기본세율 §146③1호)" amount={surtax.regionalResourceTaxBeforeSurcharge!} sub />
      <TaxRow
        label={`화재위험 중과 ×${surtax.fireHazardMultiplier} (§146③${surtax.fireHazardMultiplier === 3 ? "2의2호" : "2호"})`}
        amount={surtax.regionalResourceTax}
        sub
      />
    </>
  ) : (
    <TaxRow label="지역자원시설세" amount={surtax.regionalResourceTax} sub />
  )
)}
```
- 중과 미적용(none·비건축물)은 기존 단일 행 유지(`fireHazardMultiplier` undefined).
- 금액 칸 `text-right font-mono tabular-nums`(기존 TaxRow 컨벤션 — `amount-column-align`).
- 배율·조문(2호/2의2호)은 `fireHazardMultiplier`에서 파생(dual-truth 차단 — 하드코딩 금지).

## 5. ⑫ Zod refine (property-input.ts)

`buildingType` building-게이트 refine 패턴 차용:
```ts
fireHazardClass: z.enum(["none", "fire_hazard", "large_fire_hazard"]).optional(),
// superRefine:
if (data.fireHazardClass && data.fireHazardClass !== "none" && data.objectType !== "building") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["fireHazardClass"],
    message: "fireHazardClass는 objectType이 'building'일 때만 적용됩니다.",
  });
}
```

## 6. ④ API 변환 / ⑧ Validation

```ts
// buildPropertyTaxRequestBody — building + ≠none 만 전송
if (form.objectType === "building" && form.fireHazardClass && form.fireHazardClass !== "none") {
  body.fireHazardClass = form.fireHazardClass;
}
```
- validateStep: enum 기본값 "none" → 항상 유효, 차단 없음(UI 통과↔validate 모순 0).
- 3중 패턴: UI 기본 none = API 미전송 = 엔진 미지정(×1) 일치.

## 7. E2E (Playwright)

`e2e/property-fire-hazard-surcharge.spec.ts`:
- **E2E-1**: 건축물 1억 + 대형 화재위험 → 결과 "화재위험 중과 ×3" + 지역자원시설세 276,900.
- **E2E-2**: 건축물 1억 + 일반 → 중과 표기 없음 + 92,300.
- **E2E-3**: 주택 선택 → 화재위험 등급 라디오 미노출.
- Network body `fireHazardClass` 도달 확인.

## 8. 체크리스트 (DoD)

- [ ] ①②④⑤⑦⑧⑫ + 라벨 상수 동기화 (③⑥⑭ 해당없음/자동)
- [ ] `RadioCardGroup`(rose, native radio 금지)·option value↔enum 일치
- [ ] 건축물 한정 노출 게이트(`objectType === "building"`)
- [ ] 결과 카드 `fireHazardMultiplier` 게이트 + 배율/조문 파생(하드코딩 금지)
- [ ] UI통과↔validate 모순 0 (기본 none 양쪽 통과)
- [ ] `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/property-tax.test.ts` 통과
- [ ] 브라우저/E2E 확인: 건축물→화재위험 라디오→Network body→결과 중과 표기
