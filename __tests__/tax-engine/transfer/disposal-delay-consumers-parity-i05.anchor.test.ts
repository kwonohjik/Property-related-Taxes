/**
 * I-05 (2026-11 리뷰) — 시행령 §155⑱ 처분기한 예외 사유의 소비처 parity 격자 + 소스 스캔 가드.
 *
 * 정본 `resolveDisposalDelay`(§155① 요건 B · 구 §167의10①8호)와 §89①4호 나목(`resolveNaDisposalDelay`)이 같은 사유·같은 양도일에서
 * 같은 결론을 내야 한다. 종전에는 나목이 정본을 거치지 않아 60칸 중 22칸이 갈렸다(D-06). 다른 점은 하나뿐이다 — 나목은
 * 「그 방법으로 양도」 요건이 실독으로 확인된 2016.3.16. 전 양도분에 그 요건을 걸지 않는다(결정 Q-2 (b) — 확인 필요 고지).
 *
 * 소스 스캔: 주석을 걷어 낸 엔진 본문에서 `disposalDelayReason`을 읽는 파일은 정본 leaf를 부르거나 아래 허용 목록(값을 정본 소비처로
 * 넘기기만 하거나 이미 정본이 적용 여부를 정한 뒤 라벨을 읽는 곳)에 있어야 한다 — ⑱을 새로 읽는 소비처가 연혁을 빠뜨리지 않게.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  NA_DELAY_METHOD_VERIFIED_FROM,
  resolveDisposalDelay,
  resolveNaDisposalDelay,
  isDisposalDelayReasonAvailable,
} from "@/lib/tax-engine/data/temporary-two-house-delay-era";
import type { TemporaryTwoHouseDelayReason } from "@/lib/tax-engine/types/transfer.types";

const REASONS: (TemporaryTwoHouseDelayReason | undefined)[] = [
  undefined, "kamco", "auction", "public_sale", "cash_settlement_suit", "expropriation_suit",
];
const DATES = ["2011-06-01", "2015-12-01", "2016-03-16", "2019-06-01", "2020-02-11", "2021-06-01", "2022-02-14", "2022-02-15", "2024-01-01"];

describe("I-05 ⑱ parity 격자 — §155①·구 8호 정본 ↔ 나목", () => {
  const cells = REASONS.flatMap((reason) => DATES.flatMap((d) => [true, false].map((method) => ({ reason, d, method }))));
  it.each(cells)("$reason · $d · 방법 $method", ({ reason, d, method }) => {
    const transferDate = new Date(d);
    const base = resolveDisposalDelay({ reason, disposedByThatMethod: method, transferDate });
    const na = resolveNaDisposalDelay({ reason, disposedByThatMethod: method, transferDate });
    if (transferDate.getTime() >= NA_DELAY_METHOD_VERIFIED_FROM.getTime()) {
      expect(na.applied).toBe(base.applied);
      expect(na.eraUnverified).toBeUndefined();
    } else {
      // 2016.3.16. 전 — 호가 시행 중이면 사유만으로 성립(확인 필요) · 정본이 성립하면 나목도 성립
      expect(na.applied).toBe(reason !== undefined && isDisposalDelayReasonAvailable(reason, transferDate));
      if (base.applied) expect(na.applied).toBe(true);
    }
  });
});

describe("I-05 소스 스캔 — ⑱ 사유를 읽는 엔진 파일", () => {
  /** 정본 leaf를 부르지 않아도 되는 곳 — 값을 정본 소비처로 넘기거나, 정본이 정한 뒤 라벨만 읽는다. */
  const ALLOWED = new Set([
    "lib/tax-engine/transfer-tax-exemption.ts", // `timing.delay.applied`(정본) 뒤 라벨
    "lib/tax-engine/one-house/original-member-right.ts", // `judgeTemporaryTwoHouseTiming`으로 넘김
    "lib/tax-engine/one-house/requirement-review.ts", // 정본 상태(waived) 뒤 라벨
    "lib/tax-engine/one-house/temp-two-house-counterfactual.ts", // 사유 유무만 보고 정본 판정을 다시 부름
    "lib/tax-engine/one-house/merge-deeming.ts", // `judgeTemporaryTwoHouseTiming`으로 넘김
  ]);
  const TYPES = /\/types\//;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  };
  walk("lib/tax-engine");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const readers = files.filter((f) => !TYPES.test(f) && /[dD]isposalDelayReason\b/.test(strip(fs.readFileSync(f, "utf8"))));

  it("모든 소비처가 정본 leaf를 부르거나 허용 목록에 있다", () => {
    const offenders = readers.filter(
      (f) => !ALLOWED.has(f) && !/resolveDisposalDelay|resolveNaDisposalDelay|naDisposalDelay\b/.test(strip(fs.readFileSync(f, "utf8"))),
    );
    expect(offenders).toEqual([]);
  });
  it("허용 목록이 낡지 않았다(목록의 파일이 실제로 사유를 읽는다)", () => {
    for (const f of ALLOWED) expect(readers).toContain(f);
  });
});
