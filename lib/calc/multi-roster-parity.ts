/**
 * 다건(연간 합산) — 같은 신고의 다른 양도 건과 **건별 명부가 어긋나는지** 대조한다 (결정 #40·#41).
 *
 * 다건은 건마다 「다른 보유 주택 목록」을 따로 받는다(Q-9 — 세대 단위 공유는 별건). 주택 수는 건마다 **그 양도일 현재**로 센다
 * (소득세법 시행령 §154① 「양도일 현재 국내에 1주택」). 그런데 같은 신고의 다른 건과 대조하지 않아 다음 모순이 경고 없이 나갔다:
 *   · 누락형 — 아직 보유 중이던 뒤 건을 앞 건 명부에서 빠뜨리면 두 건 모두 비과세(과소)
 *   · 잔존형 — 이미 판 앞 건이 뒤 건 명부에 남으면 두 건 모두 과세(과대)
 *   · 같은 날 양도(§154⑨) — 서로를 명부에 넣어 둘 다 과세, 서로 비워 둘 다 비과세(어느 순서로도 나오지 않는 값)
 *
 * **상대 건을 명부에 자동으로 넣거나 저장하지 않는다**(자동 안분 fallback 금지) — 읽어서 알리거나, 명백한 모순만 막는다.
 * 순수 함수이며 store에 쓰지 않는다. 입력에서 매번 다시 계산하므로 결과 화면도 같은 함수를 읽는다(저장 없음).
 *
 * ⚠️ 범위 밖: §104⑤ 크로스 재계산 경로(`cross-104-5-recalc`)는 이번 대조를 타지 않는다.
 */
import { housesOwnedAtTransfer, resolveHouseholdHousingCount } from "@/lib/calc/household-house-count";
import { sameDayOrderMayDecide } from "@/lib/calc/same-day-transfer-order";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export type MultiRosterIssueKind =
  | "missing_house"
  | "missing_house_empty_roster"
  | "lingering_house"
  | "missing_presale"
  | "same_day_all_single"
  | "same_day_symmetric";

export interface MultiRosterIssue {
  kind: MultiRosterIssueKind;
  /** 명부가 어긋난 건(= 이 건의 명부를 고쳐야 한다) */
  propertyId: string;
  /** 계산을 막는가 — 명백한 모순만 true. */
  blocking: boolean;
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface View {
  item: PropertyItem;
  kind: string | undefined;
  transferDate: string;
  acquisitionDate: string;
  /** 정규화한 소재지(도로명 또는 지번). 없으면 "". */
  address: string;
}

function norm(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

function viewOf(item: PropertyItem): View | null {
  const a = item.form.assets?.[0];
  const td = item.form.transferDate;
  if (!a || !td || !DATE_RE.test(td) || !a.acquisitionDate || !DATE_RE.test(a.acquisitionDate)) return null;
  return {
    item,
    kind: a.assetKind,
    transferDate: td,
    acquisitionDate: a.acquisitionDate,
    address: norm(a.addressRoad) || norm(a.addressJibun),
  };
}

/** 명부 행이 그 양도 건의 주택에 대응하는가 — 취득일이 같고, 둘 다 소재지가 있으면 소재지도 같아야 한다. */
function rowMatches(row: HouseEntry, q: View): boolean {
  if (!row.acquisitionDate || row.acquisitionDate !== q.acquisitionDate) return false;
  const rowAddress = norm(row.addressRoad) || norm(row.addressJibun);
  if (rowAddress && q.address && rowAddress !== q.address) return false;
  return true;
}

/** 두 건이 같은 주택인지(지분을 나눠 다른 날 판 경우): 확실히 같다 / 확실히 다르다 / 알 수 없다. */
function sameHouseStatus(a: View, b: View): "same" | "different" | "unknown" {
  if (!a.address || !b.address) return "unknown";
  return a.address === b.address ? "same" : "different";
}

const label = (v: View) => `"${v.item.propertyLabel}"`;

export function collectMultiRosterIssues(properties: readonly PropertyItem[]): MultiRosterIssue[] {
  const views = properties.map(viewOf).filter((v): v is View => v !== null);
  const houses = views.filter((v) => v.kind === "housing");
  const issues: MultiRosterIssue[] = [];

  // ── ① 앞뒤 건 대조 (#41) — 건 P의 명부가 P 양도일 현재 기준으로 같은 신고의 다른 건과 맞는가 ──
  for (const p of houses) {
    const f = p.item.form;
    const rows = f.houses ?? [];
    const counted = housesOwnedAtTransfer(rows, p.transferDate, p.kind);
    for (const q of views) {
      if (q === p) continue;
      const status = sameHouseStatus(p, q);
      if (status === "same") continue; // 같은 주택의 지분 분할 양도 — 대조에서 뺀다
      if (q.kind === "housing") {
        const heldAtP = q.acquisitionDate < p.transferDate && q.transferDate > p.transferDate;
        const soldBeforeP = q.transferDate < p.transferDate;
        if (heldAtP && !rows.some((r) => rowMatches(r, q))) {
          // 명부가 비어 있고 「없음」까지 확인했는데 같은 신고에 그날 아직 보유 중인 다른 주택 건이 있다 — 짝을 추정할 필요가 없는 모순이다.
          // 소재지로 다른 주택임을 확인할 수 있을 때만 막는다(알 수 없으면 비차단 고지로 맞춘다).
          const emptyConfirmed =
            rows.length === 0 && f.householdNoOtherHousesConfirmed === true && !f.legacyHouseCountPrecedence;
          const blocking = emptyConfirmed && status === "different";
          issues.push({
            kind: emptyConfirmed ? "missing_house_empty_roster" : "missing_house",
            propertyId: p.item.propertyId,
            blocking,
            message:
              `${label(p)}의 양도일(${p.transferDate}) 현재 ${label(q)}(취득일 ${q.acquisitionDate}, 양도일 ${q.transferDate})은 아직 보유 중인 주택인데 ` +
              `${label(p)}의 「다른 보유 주택 목록」에 없습니다. 주택 수는 건마다 그 양도일 현재로 세므로(소득세법 시행령 §154①) ` +
              `목록에서 빠지면 ${label(p)}의 비과세·중과 판정이 달라질 수 있습니다.` +
              (emptyConfirmed ? ` 「다른 보유 주택이 없습니다」 확인과도 맞지 않습니다.` : "") +
              ` 같은 주택을 지분 등으로 나눠 입력했다면 한 건으로 합치세요.`,
          });
        } else if (soldBeforeP && counted.some((r) => rowMatches(r, q))) {
          issues.push({
            kind: "lingering_house",
            propertyId: p.item.propertyId,
            blocking: false,
            message:
              `${label(q)}(양도일 ${q.transferDate})은 ${label(p)}의 양도일(${p.transferDate}) 전에 이미 양도한 주택인데 ` +
              `${label(p)}의 「다른 보유 주택 목록」에 남아 있어 양도일 현재 보유 주택으로 세었습니다. ` +
              `이미 판 주택은 목록에서 빼야 ${label(p)}의 판정이 맞습니다(소득세법 시행령 §154① 「양도일 현재」).`,
          });
        }
      } else if (q.kind === "presale_right") {
        // 분양권(§89②) — 앞 주택 건 양도일 현재 보유 중이던 분양권을 그 건의 분양권·입주권 목록에서 빠뜨렸는가.
        const heldAtP = q.acquisitionDate < p.transferDate && q.transferDate > p.transferDate;
        const listed = (f.presaleRights ?? []).some((r) => r.acquisitionDate === q.acquisitionDate);
        if (heldAtP && !listed) {
          issues.push({
            kind: "missing_presale",
            propertyId: p.item.propertyId,
            blocking: false,
            message:
              `${label(q)}(분양권, 취득일 ${q.acquisitionDate}, 양도일 ${q.transferDate})은 ${label(p)}의 양도일(${p.transferDate}) 현재 보유 중인 권리인데 ` +
              `${label(p)}의 「분양권·입주권」 목록에 없습니다. 목록에서 빠지면 주택 양도 비과세를 배제하는 소득세법 §89② 판정이 빠집니다.`,
          });
        }
      }
    }
  }

  // ── ② 같은 날 양도하는 주택 건 (#40) — §154⑨ 양도 순서 ──
  const byDate = new Map<string, View[]>();
  for (const v of houses) byDate.set(v.transferDate, [...(byDate.get(v.transferDate) ?? []), v]);
  for (const [date, group] of byDate) {
    if (group.length < 2) continue;
    const counts = group.map((v) =>
      resolveHouseholdHousingCount({
        primaryKind: v.kind,
        declared: parseInt(v.item.form.householdHousingCount) || 0,
        houses: v.item.form.houses,
        transferDate: v.transferDate,
        legacyPrecedence: v.item.form.legacyHouseCountPrecedence ?? false,
      }),
    );
    const ones = group.filter((_, i) => counts[i] === 1);
    if (ones.length >= 2) {
      // 같은 날 양도하는 주택이 둘 이상인데 각 건이 모두 「세대 주택 1채」로 계산된다 — 어느 순서로도 둘 다 1주택일 수는 없다.
      if (ones.some((v) => sameDayOrderMayDecide(v.item.form))) {
        const names = ones.map(label).join("·");
        for (const v of ones) {
          issues.push({
            kind: "same_day_all_single",
            propertyId: v.item.propertyId,
            blocking: true,
            message:
              `${names}은(는) 같은 날(${date}) 양도하는 주택인데 건마다 세대 주택이 1채로만 계산됩니다. ` +
              `2개 이상의 주택을 같은 날 양도하면 거주자가 선택하는 순서대로 양도한 것으로 보므로(${TRANSFER.SAME_DAY_TRANSFER_ORDER}) 둘 다 1주택일 수 없습니다. ` +
              `나중에 양도한 것으로 선택하는 주택의 「다른 보유 주택 목록」에 먼저 양도하는 주택을 넣고 「같은 날 양도 · 먼저 양도」를 고르세요. ` +
              `같은 주택을 지분 등으로 나눠 입력했다면 한 건으로 합치세요.`,
          });
        }
      }
    } else if (counts.every((c) => c === counts[0]) && counts[0] !== 1) {
      // 건마다 주택 수가 같고 1채가 아니다(과대 방향) — 서로를 명부에 넣었을 가능성이 크다. 막지 않고 알린다.
      const names = group.map(label).join("·");
      for (const v of group) {
        issues.push({
          kind: "same_day_symmetric",
          propertyId: v.item.propertyId,
          blocking: false,
          message:
            `${names}은(는) 같은 날(${date}) 양도하는 주택이고 건마다 세대 주택 수가 ${counts[0]}채로 같습니다. ` +
            `같은 날 양도하는 주택은 거주자가 선택한 순서대로 양도한 것으로 보므로(${TRANSFER.SAME_DAY_TRANSFER_ORDER}) 먼저 양도하는 주택은 나중 주택의 명부에서 빠집니다. ` +
            `나중에 양도하는 주택의 「다른 보유 주택 목록」에서 먼저 양도하는 주택에 「같은 날 양도 · 먼저 양도」를 고르면 판정이 달라질 수 있습니다(확인 필요).`,
        });
      }
    }
  }

  // 같은 문구가 건 수만큼 반복되지 않게 — 같은 (종류, 건, 문구)는 한 번만.
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.kind}|${i.propertyId}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 계산을 막는 모순 — 첫 번째 사유(없으면 null). `validateMultiSettings`가 쓴다. */
export function multiRosterBlockMessage(properties: readonly PropertyItem[]): string | null {
  return collectMultiRosterIssues(properties).find((i) => i.blocking)?.message ?? null;
}

/** 비차단 고지 — 설정 단계와 결과 화면이 같은 입력에서 다시 계산해 보여 준다(저장하지 않는다). */
export function multiRosterNotices(properties: readonly PropertyItem[]): MultiRosterIssue[] {
  return collectMultiRosterIssues(properties).filter((i) => !i.blocking);
}
