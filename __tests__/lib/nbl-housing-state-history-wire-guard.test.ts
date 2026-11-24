/**
 * 게이트 — E3-③ A(주택부수토지 소유기간 중 주택 신축·멸실 이력) **침묵 소실 grep 가드** + **④⑤⑧ 단일 술어 가드**.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §11.1 «침묵 소실 grep 게이트» · §5 (자체 지목 조건 금지)
 *
 * 왜 소스를 읽는가: 중첩 칸 `houseFootprintBefore`는 ⑫ 행 스키마·③ 정규화·④ 와이어 어디서든 빠지면 침묵으로 strip/소실된다(TS 미감지 — 14지점 ⑫⑬⑭).
 * 그리고 E3-②에서 «⑧이 엔진 술어를 안 불러» 결함이 났다 — ④⑤⑧이 같은 지목 축 술어를 부르고 자체 지목·용도지역 조건을 쓰지 않음을 정적으로 고정한다.
 *
 * mutation 대응: ⑫ 행 스키마에서 `houseFootprintBefore` 삭제 → FIELD 가드 · ④⑤⑧ 중 한 곳이 `=== "housing_site"` 사용 → SINGLE 가드 · ④ 술어를 `nblOtherStateHistoryApplies`로 되돌림 → WIRE 가드.
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
const PREVIEW = "lib/calc/nbl-other-state-history-preview.ts"; // ⑤ 미리보기
const VALIDATE_SH = "lib/calc/transfer-tax-validate-nbl-state-history.ts"; // ⑧
const VALIDATE = "lib/calc/transfer-tax-validate-nbl.ts"; // ⑧ 호출
const SECTION = "components/calc/transfer/nbl/OtherLandStateHistorySection.tsx"; // ⑤
const HOUSING_SECTION = "components/calc/transfer/nbl/HousingLandDetailSection.tsx"; // ⑤ 마운트
const SCHEMA = "lib/api/transfer-tax-schema-nbl.ts"; // ⑫
const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts"; // ⑭
const TABLE = "components/calc/NblStateHistoryPeriodTable.tsx"; // ⑦

describe("FIELD — 중첩 칸 `houseFootprintBefore`는 ①③④⑤⑫⑭ 어디서도 빠지지 않는다(침묵 strip·소실)", () => {
  it.each([
    ["① 폼 타입", TYPE],
    ["③ 복원 정규화", MIGRATE],
    ["④ 와이어 행", SCOPE],
    ["⑤ 위젯(입력 칸)", SECTION],
    ["⑤ 미리보기·정착면적 결함", PREVIEW],
    ["⑫ Zod 행 스키마", SCHEMA],
    ["⑭ 매퍼", MAPPER],
  ])("%s — %s", (_n, p) => {
    expect(src(p)).toMatch(/houseFootprintBefore/);
  });

  it("⑫ 행 스키마는 `houseFootprintBefore: z.string().optional()` — 거울 없음(직접 API 400 없음 · Q-10 (가))", () => {
    expect(src(SCHEMA)).toMatch(/houseFootprintBefore:\s*z\.string\(\)\.optional\(\)/);
  });

  it("⑧ 점프 앵커 리터럴 접두 — `nblOtherStateEvents.${i}.houseFootprintBefore`(정적 게이트 transfer-validation-field-anchor-coverage가 `${…}`를 `*`로 읽는다)", () => {
    expect(src(VALIDATE_SH)).toMatch(/fieldError\(`nblOtherStateEvents\.\$\{[^}]+\}\.houseFootprintBefore`/);
    expect(src(SECTION)).toMatch(/`nblOtherStateEvents\.\$\{[^}]+\}\.houseFootprintBefore`/);
  });
});

describe("SINGLE — ④⑤⑧은 같은 지목 축 술어를 읽고 자체 지목·용도지역 조건을 쓰지 않는다", () => {
  it.each([
    ["④ 와이어·술어 파일", SCOPE],
    ["④ 전송", REQUEST],
    ["⑤ 미리보기", PREVIEW],
    ["⑤ 위젯", SECTION],
    ["⑧ 검증", VALIDATE_SH],
  ])("%s — `=== \"housing_site\"` · `isUrbanResidentialCommercialIndustrial(` 직접 조건 없음", (_n, p) => {
    const s = src(p);
    expect(s).not.toMatch(/===\s*["']housing_site["']/);
    expect(s).not.toMatch(/isUrbanResidentialCommercialIndustrial\(/);
  });

  it("⑤ 마운트(HousingLandDetailSection)는 `nblStateHistoryApplies`로 게이트한다", () => {
    expect(src(HOUSING_SECTION)).toMatch(/nblStateHistoryApplies\(asset\)/);
  });

  it("④ `stateHistoryWireFields`·⑧ `validateNblStateHistory`는 `nblStateHistoryApplies`(디스패처)로 게이트한다 — 기타토지 술어(`nblOtherStateHistoryApplies`)만 읽으면 주택이 빠진다(D5·D2·D3)", () => {
    const wire = src(SCOPE).slice(src(SCOPE).indexOf("export function stateHistoryWireFields"));
    expect(wire).toMatch(/!nblStateHistoryApplies\(asset\)/);
    expect(src(VALIDATE_SH)).toMatch(/!nblStateHistoryApplies\(asset\)/);
    expect(src(VALIDATE_SH)).not.toMatch(/nblOtherStateHistoryApplies/);
  });

  it("술어 정의는 소비표 술어를 **직접** 부른다 — `consumesHousingStateHistory`(주택) · 기타토지는 주택을 명시 제외", () => {
    const s = src(SCOPE);
    expect(s).toMatch(/export function nblHousingStateHistoryApplies[\s\S]*?consumesHousingStateHistory\(asset\.nblLandType\)/);
    expect(s).toMatch(/export function nblOtherStateHistoryApplies[\s\S]*?!consumesHousingStateHistory\(asset\.nblLandType\)/);
  });

  it("주택 술어는 기타토지 전용 칸(`nblOtherUseParcels` · `nblOtherHasBuilding`)·의제 사유를 읽지 않는다(D5 · 의제 교차 X10)", () => {
    const body = src(SCOPE).match(/export function nblHousingStateHistoryApplies[\s\S]*?\n}\n/)![0];
    expect(body).not.toMatch(/nblOtherUseParcels|nblOtherHasBuilding|nblDeemed|hasDeemedTransferReason|isDeemedTransferApplicable/);
  });
});

describe("WIRE — ⑧ 정착면적 규칙은 엔진 leaf(`houseFootprintIssue`)와 `eventClosesHouseInterval`을 직접 부른다(자체 비교 금지)", () => {
  it("scope(⑧·⑤ 공용 `housePriorFootprintIssueOf`)가 leaf를 직접 호출한다", () => {
    const s = src(SCOPE);
    expect(s).toMatch(/houseFootprintIssue\(/);
    expect(s).toMatch(/eventClosesHouseInterval\(/);
  });

  it("⑧ 호출 위치 — `validateNblDetailedJudgment`가 정착면적 필수 규칙 **뒤**에 주택 이력 검증을 부른다(V-10 · 화면 순서)", () => {
    const s = src(VALIDATE);
    const footprintRule = s.indexOf('fieldError("nblHousingFootprint"');
    const historyCall = s.indexOf("nblHousingStateHistoryApplies(asset)");
    expect(footprintRule).toBeGreaterThan(0);
    expect(historyCall).toBeGreaterThan(footprintRule);
  });

  it("⑭ 매퍼는 철거 행에서 `eventClosesHouseInterval`로 정착면적을 운반한다(엔진 소관 — 이 가드는 UI ④와 같은 술어임을 고정)", () => {
    expect(src(MAPPER)).toMatch(/eventClosesHouseInterval\(/);
    expect(src(SCOPE)).toMatch(/eventClosesHouseInterval\(/);
  });

  it("⑦ 결과 구간표는 구간 echo(`buildingKind`) 키로 주택 변형을 가른다 — 키 부재(기타토지)는 종전", () => {
    expect(src(TABLE)).toMatch(/buildingKind\s*===\s*["']house["']/);
  });
});
