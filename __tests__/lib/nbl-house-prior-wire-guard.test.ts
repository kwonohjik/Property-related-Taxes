/**
 * 게이트 — E3-③ B(기타토지 철거 행 «철거된 건축물 = 주택») **침묵 소실 grep 가드** + **④⑤⑧ 단일 술어 가드**.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §11.3 «침묵 소실 grep 게이트» · §5 (자체 지목·용도지역 조건 금지) · §7 H9~H11
 *
 * 왜 소스를 읽는가: 중첩 칸 `buildingKindBefore`는 ⑫ 행 스키마·③ 정규화·④ 와이어 어디서든 빠지면 침묵으로 strip/소실된다(TS 미감지 — 14지점 ⑫⑬⑭). 그리고 수도권 칸은 «값이 서버에 안 닿는» 침묵(BP1)이 위험이라
 * ④ 전송 · ⑤ 노출 · ⑧ H10이 **같은 엔진 술어**(와이어 사건 인자)를 부르는지 정적으로 고정한다.
 *
 * mutation 대응: ⑫ 행 스키마에서 `buildingKindBefore` 삭제 → FIELD · ⑯ `housePriorNeedsMetropolitanOf`가 폼 저장 events를 읽음 → SINGLE ·
 *   ⑰ ④ `metro` 게이트에서 술어 제거 → SINGLE(request) · ⑱ ⑧ H10 제거 → SINGLE(validate) · ⑲ ⑧ H10이 술어 없이 항상 요구 → SINGLE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p: string) => strip(readFileSync(join(ROOT, p), "utf-8"));

const TYPE = "lib/stores/calc-wizard-asset-nbl-other.ts"; // ①
const MIGRATE = "lib/stores/calc-wizard-asset-migrate-nbl.ts"; // ③
const SCOPE = "lib/calc/nbl-other-state-history-scope.ts"; // ④ 술어·와이어 행
const REQUEST = "lib/calc/non-business-land-request.ts"; // ④ 전송
const PREVIEW = "lib/calc/nbl-other-state-history-preview.ts"; // ⑤ 미리보기 맥락
const VALIDATE_SH = "lib/calc/transfer-tax-validate-nbl-state-history.ts"; // ⑧
const SECTION = "components/calc/transfer/nbl/OtherLandStateHistorySection.tsx"; // ⑤
const KIND_FIELD = "components/calc/transfer/nbl/OtherLandBuildingKindField.tsx"; // ⑤ 종류 카드
const SCHEMA = "lib/api/transfer-tax-schema-nbl.ts"; // ⑫
const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts"; // ⑭
const FORM_MAPPER = "lib/tax-engine/non-business-land/form-mapper.ts"; // ⑭ 수도권 게이트
const TABLE = "components/calc/NblStateHistoryPeriodTable.tsx"; // ⑦

describe("FIELD — 중첩 칸 `buildingKindBefore`는 ①③④⑤⑫⑭ 어디서도 빠지지 않는다(침묵 strip·소실)", () => {
  it.each([
    ["① 폼 타입", TYPE],
    ["③ 복원 정규화", MIGRATE],
    ["④ 와이어 행", SCOPE],
    ["⑤ 위젯 종류 카드", KIND_FIELD],
    ["⑤ 미리보기(판정 맥락 사건)", PREVIEW],
    ["⑫ Zod 행 스키마", SCHEMA],
    ["⑭ 매퍼", MAPPER],
  ])("%s — %s", (_n, p) => {
    expect(src(p)).toMatch(/buildingKindBefore/);
  });

  it("⑫ 행 스키마는 enum 단일 소스(`NBL_STATE_BUILDING_KIND_VALUES`) + `\"\"` 허용 + optional — 허용값 밖은 400", () => {
    expect(src(SCHEMA)).toMatch(/buildingKindBefore:\s*z\.enum\(NBL_STATE_BUILDING_KIND_VALUES\)\.or\(z\.literal\(""\)\)\.optional\(\)/);
  });

  it("③ 복원 정규화는 `\"house\"`만 보존하고 철거 행(단일 술어 `eventCarriesBuildingKind`)에서만 남긴다 · 키 없던 행에 키를 만들지 않는다", () => {
    const s = src(MIGRATE);
    expect(s).toMatch(/eventCarriesBuildingKind\(kind\)\s*&&\s*r\.buildingKindBefore\s*===\s*["']house["']/);
    expect(s).toMatch(/\.\.\.\(buildingKind\s*\?\s*\{\s*buildingKindBefore:\s*buildingKind\s*\}\s*:\s*\{\}\)/);
  });

  it("④ 와이어 행은 주택 구간을 닫는 행에서만 종류 칸을 싣는다(주택 카드는 싣지 않는다 — A 바이트 동일)", () => {
    expect(src(SCOPE)).toMatch(/closesHouse\s*&&\s*tailKind\s*!==\s*["']house["']\s*\?\s*\{\s*buildingKindBefore:\s*["']house["']/);
  });
});

describe("SINGLE — 수도권 칸은 엔진 술어(와이어 사건 인자)를 ④ 전송 · ⑤ 노출·맥락 · ⑧ H10이 같은 래퍼로 읽는다", () => {
  it("`housePriorNeedsMetropolitanOf`는 엔진 술어를 직접 호출하고 사건은 `stateHistoryWireFields` 결과다(폼 저장 events 금지 — X27·P16)", () => {
    const body = src(SCOPE).match(/export function housePriorNeedsMetropolitanOf[\s\S]*?\n}\n/)![0];
    expect(body).toMatch(/housePriorNeedsMetropolitan\(/);
    expect(body).toMatch(/stateHistoryWireFields\(asset\)\.nblOtherStateEvents/);
    expect(body).not.toMatch(/asset\.nblOtherStateEvents/);
  });

  it("④ 전송: `metro` 게이트 = 소비표 지목 ∨ B 술어 — 한쪽만 읽으면 수도권 값이 비워져 서버가 보수적 3배로 읽는다(BP1)", () => {
    expect(src(REQUEST)).toMatch(/metro:\s*consumesMetropolitanArea\(asset\.nblLandType\)\s*\|\|\s*housePriorNeedsMetropolitanOf\(asset\)/);
    expect(src(REQUEST)).toMatch(/nblIsMetropolitanArea:\s*consumes\.metro\s*\?/);
  });

  it("⑭ 서버 매퍼도 같은 엔진 술어로 수도권을 읽는다(전송 ≡ 매퍼)", () => {
    expect(src(FORM_MAPPER)).toMatch(/housePriorNeedsMetropolitan\(landType,\s*zoneType,\s*priorEvents\)/);
  });

  it("⑤ 위젯은 술어로만 수도권 칸을 노출한다(자체 용도지역 조건 금지)", () => {
    const s = src(SECTION);
    expect(s).toMatch(/housePriorNeedsMetropolitanOf\(asset\)/);
    expect(s).toMatch(/needsMetro\s*&&/);
    expect(s).not.toMatch(/isUrbanResidentialCommercialIndustrial\(|metropolitanChangesHousingMultiplier\(/);
  });

  it("⑧ H10은 술어가 참일 때만 요구하고 의제 사유(엔진 `stateHistoryDeemedBlocks` 래퍼)가 있으면 건너뛴다 · 필드 앵커 `nblIsMetropolitanArea`", () => {
    const s = src(VALIDATE_SH);
    const fn = s.match(/function housePriorMetropolitanError[\s\S]*?\n}\n/)![0];
    expect(fn).toMatch(/!housePriorNeedsMetropolitanOf\(asset\)\s*\|\|\s*stateHistoryDeemedBlocksOf\(asset\)/);
    expect(fn).toMatch(/fieldError\("nblIsMetropolitanArea"/);
    expect(s).not.toMatch(/isUrbanResidentialCommercialIndustrial\(/);
  });

  it("⑧ H9(B)는 `housePriorFootprintIssueOf`(엔진 leaf `houseFootprintIssue` — 의제면 null) · 구조 규칙 H11은 ⑫와 같은 leaf(`stateEventSequenceIssue`)에 **와이어 사건**을 넘긴다", () => {
    const s = src(VALIDATE_SH);
    expect(s).toMatch(/housePriorFootprintIssueOf\(asset,\s*i\)/);
    expect(s).toMatch(/stateEventSequenceIssue\(stateHistoryWireFields\(asset\)\.nblOtherStateEvents/);
    const scope = src(SCOPE);
    expect(scope).toMatch(/houseFootprintIssue\(events\[i\]\.houseFootprintBefore,\s*i,\s*asset\.acquisitionArea,\s*house\s*\?\s*["']house["']\s*:\s*["']building["']\)/);
    expect(scope).toMatch(/stateHistoryDeemedBlocksOf\(asset\)\s*\|\|\s*!eventClosesHouseInterval/);
  });

  it("⑤ 종류 카드·정착면적 칸은 철거 행 술어(`eventCarriesBuildingKind`·`eventClosesHouseInterval`)로만 노출한다 — `kind === \"building_removed\"` 리터럴 금지", () => {
    const s = src(SECTION);
    expect(s).toMatch(/showKindField\s*=\s*!house\s*&&\s*eventCarriesBuildingKind\(ev\.kind\)/);
    expect(s).toMatch(/closesHouse\s*=\s*eventClosesHouseInterval\(events,\s*i,\s*tailKind\)/);
    expect(s).not.toMatch(/kind\s*===\s*["']building_removed["']/);
  });
});

describe("⑦ 결과 구간표 — 주택 구간 행만 변형(echo `buildingKind`) · 표 전체 변형은 꼬리가 주택일 때(A)뿐", () => {
  it("꼬리 구간 echo로 A를 가르고 주택 행은 `isHouse`로 가른다", () => {
    const s = src(TABLE);
    expect(s).toMatch(/const house\s*=\s*intervals\.length\s*>\s*0\s*&&\s*isHouse\(intervals\[intervals\.length\s*-\s*1\]\)/);
    expect(s).toMatch(/const mixedHouse\s*=\s*!house\s*&&\s*intervals\.some\(isHouse\)/);
  });
});
