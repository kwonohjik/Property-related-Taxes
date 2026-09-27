/**
 * 「상증법」§4의2④ — **§39 3경로 밖으로 새지 않는다**는 결정의 코드 가드.
 *
 * 계획서 §8-E가 「④는 §39 외 유형에 배선하지 않는다」고 결정했다. 근거는
 * 「법인세법」§17①(자본거래 수익 익금불산입)이다 — ④의 요건 「영리법인이 증여받은 재산 또는
 * 이익에 대하여 법인세가 **부과**되는 경우」는 불균등 자본거래에서 원칙적으로 성립하지 않고,
 * 같은 항 제1호 단서(채무의 **출자전환** 시 시가 초과 발행금액)로만 열린다.
 *
 * 결정은 구현이 아니다 — 폼 상태는 유형을 바꿔도 남는다(`set({ type })`가 머지). §39 화면에서
 * 켠 ④ 토글이 다른 유형의 페이로드에 실리면, 그 유형 엔진이 나중에 ④를 읽게 되는 순간
 * **아무도 켠 적 없는 배제**가 조용히 발동한다. 이 파일이 그 경로를 막는다.
 *
 * 긍정 짝([TG4S-1])이 없으면 「전부 strip」이라는 과잉 수정이 초록으로 통과한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, DEEMED_TYPE_META, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

/** §39 화면에서 ④ 토글을 전부 켜 둔 **stale** 폼 */
const STALE: Partial<DeemedFormState> = {
  ciIssuerGainCorporateTaxed: true,
  ciDoneeIsShareholderOfIssuer: true,
  ciAllocIssuerGainCorporateTaxed: true,
};

/** ④가 배선된 유형 — 계획서 §7·§8-A (단건·cap-table·전환주식) */
const WIRED = ["capital_increase", "capital_increase_allocation", "convertible_stock"] as const;
/**
 * `free_loan_aggregated`는 **폼 유형이 아니다** — `free_loan` 화면의 다건 토글(`loanLoans`)이
 * 만드는 페이로드다(`gift-deemed-api.ts:118`). 모집단에서 빼고, 그 분기는 [TG4S-3]이 따로 덮는다.
 */
const ALL = (Object.keys(DEEMED_TYPE_META) as DeemedFormState["type"][]).filter(
  (t) => t !== "free_loan_aggregated",
);
const OTHERS = ALL.filter((t) => !(WIRED as readonly string[]).includes(t as string));

const payloadOf = (type: DeemedFormState["type"]) =>
  JSON.stringify(buildDeemedGiftInput({ ...INITIAL_DEEMED, ...STALE, type } as DeemedFormState));

describe("§4의2④ 배선 범위 — §39 3경로 밖으로 새지 않는다", () => {
  it("[TG4S-0] 모집단: 배선 3종이 전부 유형 목록에 있고, 나머지가 비어 있지 않다", () => {
    for (const t of WIRED) expect(ALL).toContain(t);
    expect(OTHERS.length).toBeGreaterThan(0);
  });

  it.each(WIRED)("[TG4S-1] 긍정 짝: %s — stale 토글이 페이로드에 실린다(배선 증명)", (type) => {
    expect(payloadOf(type)).toContain('"issuerGainCorporateTaxed":true');
  });

  it.each(OTHERS)("[TG4S-2] %s — stale ④ 토글이 페이로드에 실리지 않는다", (type) => {
    const p = payloadOf(type);
    expect(p).not.toContain("issuerGainCorporateTaxed");
    expect(p).not.toContain("doneeIsShareholderOfIssuer");
  });

  it("[TG4S-3] free_loan 다건 토글 → free_loan_aggregated 페이로드에도 실리지 않는다", () => {
    const raw = buildDeemedGiftInput({ ...INITIAL_DEEMED, ...STALE, type: "free_loan", loanLoans: [] } as DeemedFormState);
    expect(raw.type).toBe("free_loan_aggregated"); // 분기에 실제로 들어갔다는 전제
    const p = JSON.stringify(raw);
    expect(p).not.toContain("issuerGainCorporateTaxed");
    expect(p).not.toContain("doneeIsShareholderOfIssuer");
  });

  /**
   * 행동 단언([TG4S-2])은 각 유형의 **기본 분기**만 지난다. 페이로드 생성 지점이 여럿인 유형
   * (`convertible_bond` 4 · `specific_corp` 4 · `capital_decrease` 3 · `merger` 2)은 나머지 분기가
   * 가드 밖에 있었다 — 뮤테이션 SM4(§38 비주식 분기로 누출)가 실제로 살아남았다.
   * 분기마다 픽스처를 맞추면 새 분기가 생길 때 또 뒤처지므로, 여기서는 **소속 case**로 본다.
   *
   * ⚠️ 주석 줄은 세지 않는다 — 정적 가드가 제 설명 주석을 잡는 함정.
   */
  it("[TG4S-4] 구조: ④ 필드는 배선 3종의 case 블록 안에서만 조립된다 (전 분기)", () => {
    const FIELDS = /\b(issuerGainCorporateTaxed|doneeIsShareholderOfIssuer)\s*:/;
    const offenders: string[] = [];
    for (const file of ["lib/calc/gift-deemed-api.ts", "lib/calc/gift-deemed-api-phase3.ts"]) {
      const lines = readFileSync(join(process.cwd(), file), "utf-8").split("\n");
      let currentCase = "(case 밖)";
      lines.forEach((line, i) => {
        const c = line.match(/^\s*case "([a-z_]+)"/);
        if (c) currentCase = c[1];
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
        if (FIELDS.test(line) && !(WIRED as readonly string[]).includes(currentCase)) {
          offenders.push(`${file}:${i + 1} (case "${currentCase}")`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
