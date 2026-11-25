/**
 * PSA-SU — 결과 카드·PDF «입력이 필요했던 칸» 문구 (`propertyDemolishedVerdictLines` — 카드·PDF 공용).
 * 읽은 칸이 하나도 없으면 «없음(…)»이 아니라 **왜 더 묻지 않았는가**를 상황별로 사실대로 말한다 — 별도합산 유지 · 날짜만으로 확정 · 앞의 답으로 확정 · 철거일 불명.
 * 시료는 실제 판정(`judgePropertyDemolishedLand`)의 echo다(합성 echo 아님).
 */
import { describe, expect, it } from "vitest";
import { judgePropertyDemolishedLand } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedJudgeInput } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_ASK_FIELD_NAME, PROPERTY_DEMOLISHED_FOLD_REASON_LABEL, propertyDemolishedVerdictLines } from "../../../lib/calc/property-demolished-verdict-text";
import { parseISO } from "../../../lib/tax-engine/utc-date";

const judge = (over: Partial<PropertyDemolishedJudgeInput> & { s: string; r?: string }) =>
  judgePropertyDemolishedLand({
    taxBaseDate: parseISO(over.s),
    removedOn: over.r ? parseISO(over.r) : undefined,
    kind: over.kind ?? "building",
    facts: over.facts ?? {},
    landArea: 300,
    ...over,
  } as PropertyDemolishedJudgeInput);
const required = (v: ReturnType<typeof judge>) => propertyDemolishedVerdictLines(v).find((l) => l.key === "required")?.text;

describe("«입력이 필요했던 칸» — 읽은 칸이 없을 때 사유별 문구", () => {
  it("날짜만으로 확정(36개월 밖 · 2016.6.1. 전) → «철거일(과세기준일)만으로 결과가 정해져 더 묻지 않음»", () => {
    expect(required(judge({ s: "2026-06-01", r: "2023-05-31" }))).toBe("철거일(과세기준일)만으로 결과가 정해져 더 묻지 않음");
    expect(required(judge({ s: "2015-06-01", r: "2015-01-01" }))).toBe("철거일(과세기준일)만으로 결과가 정해져 더 묻지 않음");
  });

  it("앞의 답으로 확정(건축물 · 일반 1년 밖 · 3년 안 = 종류로 기간 접힘) → «앞의 답(또는 철거일)으로 결과가 정해져 더 묻지 않음»", () => {
    expect(required(judge({ s: "2026-06-01", r: "2025-05-31", kind: "building" }))).toBe("앞의 답(또는 철거일)으로 결과가 정해져 더 묻지 않음");
  });

  it("별도합산 유지인데 묻는 칸이 없는 시행본(2017 · 주택) → «이 과세기준일 시행본에는 확인할 요건 칸이 없음»", () => {
    const v = judge({ s: "2017-06-01", r: "2017-01-01", kind: "house" });
    expect(v.kind).toBe("holds");
    expect(required(v)).toBe("이 과세기준일 시행본에는 확인할 요건 칸이 없음");
  });

  it("직접 호출에서 입력 부족 — 엔진 echo `inputAt`이 날짜 결함과 종류 미선택을 가른다(L-4 후속)", () => {
    const dateText = "철거일 또는 과세기준일을 확인할 수 없거나 철거일이 과세기준일 뒤여서 요건 칸을 읽지 못함";
    const kindText = `${PROPERTY_ASK_FIELD_NAME.demolishedKind}(주택·건축물)가 입력되지 않아 요건 칸을 읽지 못함`;
    // 날짜 결함 — 철거일 없음 · 철거일이 과세기준일 뒤 · 읽을 수 없는 날짜
    for (const v of [judge({ s: "2026-06-01" }), judge({ s: "2026-06-01", r: "2026-12-31" }), judge({ s: "2026-06-01", r: "2026-02-30" })]) {
      expect(v.foldReason).toBe("input");
      expect(v.inputAt).toBe("date");
      expect(required(v)).toBe(dateText);
    }
    // 날짜 결함이 종류 미선택보다 먼저(사슬 0단계) — 둘 다 비면 date
    expect(judge({ s: "2026-06-01", kind: "" as never }).inputAt).toBe("date");
    // 날짜는 유효하고 한시 기간 안인데 종류만 비었다 — 철거일을 탓하지 않는다
    const noKind = judge({ s: "2026-06-01", r: "2026-01-01", kind: "" as never });
    expect(noKind.foldReason).toBe("input");
    expect(noKind.inputAt).toBe("demolishedKind");
    expect(required(noKind)).toBe(kindText);
    expect(required(noKind)).not.toContain("철거일");
    expect(PROPERTY_DEMOLISHED_FOLD_REASON_LABEL.input).toContain("철거일·과세기준일");
  });

  it("`inputAt`은 입력 부족 접힘에만 붙는다 — 다른 접힘·성립에는 키 없음", () => {
    expect("inputAt" in judge({ s: "2026-06-01", r: "2023-05-31" })).toBe(false); // 날짜만으로 기간 접힘
    expect("inputAt" in judge({ s: "2026-06-01", r: "2026-01-01", facts: { permit: "no" } })).toBe(false); // 허가 접힘
    expect("inputAt" in judge({ s: "2017-06-01", r: "2017-01-01", kind: "house" })).toBe(false); // 성립
  });

  it("옛 저장 결과(echo에 `inputAt` 없음) → 두 사유를 함께 말하는 종전 문구 — 어느 한쪽으로 단정하지 않는다", () => {
    const legacy = { ...judge({ s: "2026-06-01" }) };
    delete (legacy as { inputAt?: unknown }).inputAt;
    expect(required(legacy)).toBe("철거일·철거된 것의 종류·과세기준일 중 확인할 수 없는 것이 있거나 철거일이 과세기준일 뒤여서 요건 칸을 읽지 못함");
  });

  it("읽은 칸이 있으면 짧은 이름을 · 로 이은 종전 표기 그대로(결과 카드·낭독 한 줄이 같은 이름 맵)", () => {
    const v = judge({ s: "2026-06-01", r: "2026-01-01", facts: { permit: "no" } });
    expect(required(v)).toBe(PROPERTY_ASK_FIELD_NAME.demolishedPermit);
    const full = judge({ s: "2026-06-01", r: "2026-01-01", facts: { permit: "yes", otherUse: "no" }, buildingFloorArea: 100, zoningDistrict: "commercial" });
    expect(required(full)).toBe(`${PROPERTY_ASK_FIELD_NAME.demolishedPermit} · ${PROPERTY_ASK_FIELD_NAME.demolishedOtherUse} · ${PROPERTY_ASK_FIELD_NAME.buildingFloorArea}`);
  });
});
