# 수정 계획서 — 계산 이력 비즈니스 키 dedup (피상속인 기준 1건 유지)

> 증상(이미지11): 상속세 입력 중간에 저장 버튼을 누를 때마다 같은 의뢰인(김코리아)·같은 상속개시일인데 **별도 record가 계속 누적**.
> 인터뷰 확정(2026-06-09): ① 피상속인 키 = **주민번호 우선 + 이름·상속개시일 폴백** · ② 기존 중복 = **수동 삭제(과거 record 무변경)** · ③ 범위 = **전 세목 비즈니스 키**.

## 1. 근본 원인 (실측)

저장 dedup 키가 **content/input 해시**라, 입력 중간 저장 시 내용이 매번 달라져 새 record가 생긴다.

- 자동저장 `useAutoSaveCalculation`(`:73`) → `saveOrUpdateByContent` — 키 `(userId, taxType, clientId, contentHash)`(`calculation-repository.ts:99·112`).
- 수동저장 `makeRunManualSave`(`save-handler-builders.ts:58`) → 결과 있으면 `saveOrUpdateByContent`, 없으면 `saveDraftByContent`(키 `inputHash`).
- `contentHash`/`inputHash`는 입력·결과 전체를 해싱(`content-hash.ts`, id 정규화 후) → **동일 의뢰인·동일 피상속인이라도 입력이 한 글자라도 다르면 다른 해시 → 신규 record**.

→ 의뢰인(clientId)이 같아도 contentHash가 달라 중복. **content 기반 dedup으로는 "같은 대상 1건 유지"를 보장 못 한다.**

## 2. 해결 — 비즈니스 키 dedup (graceful fallback)

세목별 **업무상 식별값(business key)**을 dedup 키로 사용. 키가 도출되면 그 키로 1건을 update, 도출 불가면 현행 content dedup으로 폴백(무회귀).

### 2.1 비즈니스 키 정의 (세목별)

`title-generator.ts`가 이미 추출하는 식별값과 **동일 소스**로 구성(title ↔ dedup 키 정합, 드리프트 방지).

| 세목 | 비즈니스 키 구성 | 식별 필드 (실측) | 상태 |
|---|---|---|---|
| **상속세** | `rrn:{주민번호숫자}` **또는** `nd:{이름}|{상속개시일}` | `decedentResidentNumber` → `decedentName`+`deathDate` | ✅ 검증(`inheritance/shared.ts:22-25` top-level) |
| 양도세 | `addr:{주소}|{양도일}` | `assets[0].addressRoad‖addressJibun` + `transferDate` | ✅ 검증(`title-generator.extractAddress/extractTransferDate`) |
| 취득세 | `addr:{주소}|{취득일}` | `road‖jibun` + **`acquisitionDate`**(`acquisition/shared.ts:108`) | ✅ 검증(필드명 `acquisitionDate` — `targetDate` 아님). 주소 top-level/중첩 여부만 Do 확인 |
| 재산세 | `addr:{주소}` (연도 필드 없음) | `jibun‖road`(`property/shared.ts`) — **과세연도 입력 필드 부재**(과세기준일 6/1 고정) | ✅ 검증. 연도 없이 주소만으로 키(물건 1건) |
| 주식양도세 | `sec:{종목명}|{양도일}` | `securityName` + `transferDate`/lots | ✅ 검증(`title-generator.extractStockSecurityName/extractStockTransferDate`) |
| 증여세 | **(키 없음 — content 폴백)** | `GiftTaxForm` inline FormState에 **수증자/증여자 이름·주민 필드 부재**(관계 기반) | ✅ 실측 확정 — content dedup 폴백 유지 |
| 종부세 | **(키 없음 — content 폴백)** | 폼에 명확한 납세자·연도 식별 필드 부재 | ✅ 실측 확정 — content dedup 폴백 유지 |

> **핵심 원칙**: 비즈니스 키가 **도출 가능한 세목만**(상속·양도·취득·재산·주식) 키 dedup, **도출 불가(증여·종부세, 또는 식별 미입력)면 현행 content dedup** → 어떤 세목도 회귀 없음. 상속세(통증 지점)는 즉시 해결.

### 2.2 키 정규화 규칙
- 주민번호: `replace(/\D/g, "")` 숫자만. **13자리 완성 시에만** `rrn:` 키 사용. 미완성(부분 입력)·미입력이면 **name+deathDate 폴백**. ★ 부분 RRN("8001"→"800101…")을 키로 쓰면 입력 중 매 저장마다 키가 바뀌어 중복 재발 → 고치려는 시나리오 자체 훼손(STEP3 모순 #5). 완성 게이트로 차단.
- 이름: `trim()`. 날짜: `formatDate`(title-generator 재사용)로 정규화.
- 주소: `trim()`. 양도일/취득일/연도: 문자열 그대로.
- 키 prefix(`rrn:`·`nd:`·`addr:`·`sec:`)로 세목 내 충돌 방지. 빈 구성요소만 있으면(이름·주소 등 전부 빈값) → **null 반환(content 폴백)**.

## 3. 설계 — 시그니처·저장 흐름

### 3.1 `extractBusinessKey` (신규, 순수 함수)
```ts
// lib/storage/business-key.ts (신규)
import { formatDate } from "./title-generator"; // export 추가 필요
export function extractBusinessKey(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>,
): string | null {
  switch (taxType) {
    case "inheritance": {
      const rrn = String(inputData.decedentResidentNumber ?? "").replace(/\D/g, "");
      if (rrn.length === 13) return `rrn:${rrn}`; // 완성 시에만 — 부분 입력 churn 방지(#5)
      const name = String(inputData.decedentName ?? "").trim();
      const death = formatDate(inputData.deathDate as string) ?? "";
      return name || death ? `nd:${name}|${death}` : null;
    }
    case "transfer": { /* addr:{extractAddress}|{extractTransferDate} */ }
    case "stock_transfer": { /* sec:{extractStockSecurityName}|{extractStockTransferDate} */ }
    case "acquisition": { /* addr:{extractAddress}|{formatDate(inputData.acquisitionDate)} */ }
    case "property": { /* addr:{extractAddress} (연도 필드 없음 — 주소만) */ }
    default: return null; // gift·comprehensive → content 폴백 (인적 식별 필드 부재, 실측 확정)
  }
}
```
> `formatDate`·`extractAddress`·`extractTransferDate`·`extractStockSecurityName`/`extractStockTransferDate`는 title-generator에서 **export해 재사용**(단일 소스). title-generator의 비-export 헬퍼는 export로 승격.

### 3.2 `CalculationRecord`에 `businessKey?` 추가
```ts
// lib/storage/types.ts
export interface CalculationRecord {
  // ...
  contentHash?: string;
  inputHash?: string;
  businessKey?: string; // 신규 — 세목별 업무 식별 키 (null이면 content dedup)
}
```
> db.ts 인덱스 추가 **불필요**(contentHash와 동일 — 세목 범위 in-memory scan ≤200건 μs). 스키마 버전 bump 없이 optional 필드만 추가(Dexie는 스키마 외 필드 저장 허용).

### 3.3 `saveOrUpdateByBusinessKey` (신규 repo 메서드)
```ts
async saveOrUpdateByBusinessKey(input): Promise<{ id; created }> {
  const key = extractBusinessKey(input.taxType, input.inputData);
  if (!key) {
    // 폴백 — 키 도출 불가: 현행 동작 유지
    return input.resultData && Object.keys(input.resultData).length > 0
      ? this.saveOrUpdateByContent(input)
      : this.saveDraftByContent(input);
  }
  const candidates = /* [userId+taxType+createdAt] range scan */;
  const targetClientId = input.clientId ?? null;
  const existing = candidates.find(
    (r) => r.businessKey === key && (r.clientId ?? null) === targetClientId
  );
  if (existing) {
    const incomingResult = input.resultData ?? {};
    const hasIncomingResult = Object.keys(incomingResult).length > 0;
    // ★ draft 저장(빈 결과)이 기존 계산 결과를 덮어쓰지 않도록 보존
    const nextResult = hasIncomingResult ? incomingResult : existing.resultData;
    await db.calculations.update(existing.id, {
      inputData: input.inputData,
      resultData: nextResult,
      title: input.title,
      taxLawVersion: input.taxLawVersion,
      businessKey: key,
      contentHash: await computeContentHash(input.inputData, nextResult),
      inputHash: await computeInputHash(input.inputData),
      updatedAt: new Date().toISOString(),
    });
    return { id: existing.id, created: false };
  }
  // 신규 — businessKey 포함 add (200건 상한 동일 적용)
}
```

### 3.4 라우팅 (양 저장 경로 단일화)
- `useAutoSaveCalculation`(`:73`): `saveOrUpdateByContent` → `saveOrUpdateByBusinessKey`.
- `makeRunManualSave`(`save-handler-builders.ts:72-94`): draft·final 분기를 `saveOrUpdateByBusinessKey` 단일 호출로 통합(키 있으면 1건 update, 없으면 내부에서 draft/final 폴백). `deleteDraftsByInput`은 **키 없는 세목 폴백 경로에서만** 유지.

### 3.5 결과 보존 규칙 (핵심 — §3.3 ★)
- 키 매칭 update 시 **빈 결과(draft)는 기존 결과를 덮어쓰지 않음**(`nextResult` 가드). 입력만 갱신, 마지막 계산 결과 보존.
- 결과 있는 저장은 input+result 모두 갱신.
- → 입력 중간 저장(납부세액 "-") 여러 번 → **1건 유지**(input 갱신), 계산 완료 시 같은 1건에 result 반영.

## 4. 케이스 매트릭스 (설계 §6과 동일 번호)

| # | 시나리오 | businessKey | 목표 |
|---|---|---|---|
| C1 | 상속 RRN13 입력 후 중간 저장 ×3 | `rrn:...` 동일 | **1건** update (현행 3건) |
| C2 | RRN無, 이름+상속개시일 중간 저장 ×3 | `nd:이름|날짜` 동일 | **1건** |
| C3 | 부분 RRN("8001") 저장 → 이름 키로 | RRN<13 → `nd:` | 1건 (churn 방지) |
| C4 | draft(result無) → final(result有) → draft | 동일 키 | 1건, final 결과 보존(§3.5) |
| C5 | RRN 다른 피상속인 2명 | 키 2종 | 2건 ✓ |
| C6 | 같은 피상속인·다른 clientId(의뢰인 분리) | 키 동일·client 다름 | 2건 ✓ |
| C7 | 이름·RRN 전무 | null | content 폴백(무회귀) |
| C8 | 증여세·종부세 | null | content 폴백(무회귀) |
| C9 | 양도 같은 물건+양도일 ×N | `addr:..|..` | 1건 |

## 5. 동기화 지점 (저장 계층)

| 지점 | 변경 |
|---|---|
| `lib/storage/business-key.ts` | **신규** — extractBusinessKey |
| `lib/storage/title-generator.ts` | 헬퍼 export 승격(formatDate·extractAddress 등) — 동작 불변 |
| `lib/storage/types.ts` | `CalculationRecord.businessKey?` 추가 |
| `lib/storage/calculation-repository.ts` | `saveOrUpdateByBusinessKey` 신규 + 인터페이스 |
| `lib/storage/use-auto-save-calculation.ts` | 호출을 byBusinessKey로 |
| `components/calc/shared/save-handler-builders.ts` | draft/final → byBusinessKey 단일화 |

> 엔진·UI·결과뷰 무변경. 저장 계층 한정.

## 6. 테스트 설계 (anchor)

신규 `__tests__/lib/storage/business-key-dedup.test.ts` (설계 §8과 동일 번호):
- B-1 `extractBusinessKey`: 상속(rrn13/nd/null)·양도(addr)·취득(addr+acqDate)·재산(addr)·주식(sec)·증여→null·종부→null.
- B-2 (C1): RRN13으로 draft 저장 ×3 → record **1건**, 마지막 input 반영.
- B-3 (C3): RRN<13(부분) → `nd:` 키, ×3 → 1건(churn 방지).
- B-4 (C4): draft(빈 결과) → final(result) → draft → 1건, **result 보존**(덮어쓰기 방지).
- B-5 (C5): 다른 RRN 2종 → 2건.
- B-6 (C6): 같은 키·다른 clientId → 2건.
- B-7 (C7/C8): 식별 미입력·증여/종부 → content 폴백(기존 saveOrUpdateByContent/saveDraftByContent 동작).
- 회귀: 기존 `content-hash-id-normalization`·dedup 테스트 통과(폴백 경로 무변경).

## 7. 리스크 / 한계 / Out of scope
- **R-1 (식별값 정정 시 orphan, C8)**: 주민번호·이름 수정하면 키가 바뀌어 신규 record 생성, 기존은 남음. **변형: name+deathDate로 저장한 뒤 RRN을 13자리 완성하면 `nd:`→`rrn:` 키 전환으로 신규 1건 발생**(직전 nd: record orphan). 빈도 낮음 → 수동 삭제. (키 변경 추적은 OOS.)
- **R-5 (재산세 연도 무관)**: 재산세 키=주소만(연도 입력 필드 부재) → 같은 물건은 항상 1건. 과세연도별 비교 이력 보존 불가(폼에 연도 입력 자체가 없어 현행도 동일). 의도된 동작.
- **R-2 (기존 중복 무변경)**: 인터뷰 확정 — 이미 쌓인 3건은 자동 통합 안 함, 사용자가 삭제 버튼으로 정리. 신규 저장부터 1건 유지.
- **R-3 (증여세·종부세 키 미정의)**: 현행 content dedup 폴백 유지(무회귀). 인적 식별 필드 확정 시 `extractBusinessKey`에 추가(후속).
- **R-4 (시나리오 비교 collapse)**: 같은 대상·다른 가정 2계산은 1건으로 합쳐짐(사용자가 "1건 유지" 선택한 의도된 동작). 비교 필요 시 별도 의뢰인/대상으로 분리.
- **OOS**: 기존 중복 자동 통합, 키 변경 추적, gift/comprehensive 인적 키.

## 8. Pre-Do probe
- **P-1 (RED)**: 같은 `decedentResidentNumber`로 `saveDraftByContent` ×3 → 현행 record **3건** 확인 → byBusinessKey 전환 후 **1건**.
- **P-2 (결과 보존)**: draft→final→draft 순서에서 final result가 마지막 draft로 덮이지 않음 확인.
- **P-3 (필드 실측 — STEP1 완료)**: 취득세=`acquisitionDate`·재산세=연도 필드 부재(주소만)·증여세/종부세=인적 식별 필드 부재(폴백) 확정. 잔여: 취득세 주소가 inputData top-level(`road`/`jibun`)인지 중첩인지만 Do 확인.

## 9. DoD
- [ ] `extractBusinessKey` 단일 소스(title-generator 헬퍼 재사용).
- [ ] 상속세 주민번호/이름+상속개시일 키로 1건 유지(B-1~B-5).
- [ ] draft 빈 결과가 기존 result 미덮어씀(B-3).
- [ ] 키 미도출 세목 content 폴백 무회귀(B-6).
- [ ] 양도/취득/재산/주식 키 적용(필드 실측 후), 증여/종부 폴백.
- [ ] `tsc` 0 + 신규 anchor + 전체 `npm test` + E2E(상속세 중간 저장 ×3 → 이력 1건).
