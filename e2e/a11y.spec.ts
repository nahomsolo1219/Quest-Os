// Accessibility checks on the main phone screens: every visible form control has a label; tap targets ≥ 44×44 px
// (inline text links excepted; a control inside a ≥ 44 px label counts by the label). Both fail the test.
import { expect, test } from "@playwright/test";
import { authFile, type RoleKey } from "./helpers";

const SCREENS: [RoleKey | "anon", string][] = [
  ["anon", "/login"], ["anon", "/calculator"], ["anon", "/signup"],
  ["client", "/app"], ["client", "/app/menu"], ["client", "/app/plan"], ["client", "/app/swaps"], ["client", "/app/pause"],
  ["client", "/app/payments"], ["client", "/app/progress"], ["client", "/app/profile"], ["client", "/app/community"],
  ["client", "/app/community/new"], ["client", "/app/notifications"],
  ["ops", "/staff"], ["ops", "/staff/clients"], ["ops", "/staff/clients/new"], ["ops", "/staff/payments"], ["ops", "/staff/delivery"],
  ["kitchen", "/kitchen"], ["kitchen", "/kitchen/stock"], ["rider", "/delivery"], ["rider", "/delivery/pickup"],
  // UI refresh screens: owner dashboard (Scheduled jobs), responsive tables, underline tabs, kitchen tick boxes
  ["owner", "/staff/dashboard"], ["ops", "/staff/orders"], ["ops", "/staff/purchasing"], ["owner", "/staff/nutrition"],
  ["owner", "/staff/settings"], ["kitchen", "/kitchen/production/2026-10-20"], ["kitchen", "/kitchen/recipes/2026-10-20"],
  ["kitchen", "/kitchen/packing/2026-10-20"],
];

type Offender = { path: string; what: string };

for (const [role, path] of SCREENS) {
  test.describe(`${role} ${path}`, () => {
    test.use({ storageState: role === "anon" ? { cookies: [], origins: [] } : authFile(role) });
    test(`a11y ${path}`, async ({ page }, info) => {
      test.skip(info.project.name !== "phone", "phone screens only");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const result = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return s.visibility !== "hidden" && s.display !== "none" && (r.width > 0 || r.height > 0);
        };
        const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""} "${(el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 40)}"`;
        const unlabeled: string[] = [];
        for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
          const input = el as HTMLInputElement;
          if (input.getAttribute("aria-hidden") === "true") continue; // Radix's hidden form-bubble input mirrors a labelled control
          const sr = input.className.includes("sr-only");
          if (!visible(el) && !sr) continue;
          const byAria = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
          const byFor = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          const wrapped = input.closest("label");
          if (!byAria && !byFor && !wrapped) unlabeled.push(describe(el));
        }
        const small: string[] = [];
        for (const el of document.querySelectorAll("button, a[href], [role=button], [role=tab], summary")) {
          if (!visible(el)) continue;
          const s = getComputedStyle(el);
          if (el.tagName === "A" && s.display === "inline") continue; // inline text link
          const label = el.closest("label");
          // a control inside a label: the whole label is the tap area (it toggles the control)
          if (label && (el.tagName !== "BUTTON" || label.getBoundingClientRect().height >= 43.5)) continue;
          // a control whose own box is small but which sits in a ≥ 44 px label/row counts by its tap area
          const r = el.getBoundingClientRect();
          if (r.width < 43.5 || r.height < 43.5) small.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        return { unlabeled, small };
      });
      const offenders: Offender[] = [
        ...result.unlabeled.map((w) => ({ path, what: `unlabeled ${w}` })),
        ...result.small.map((w) => ({ path, what: `small target ${w}` })),
      ];
      if (offenders.length) {
        await info.attach("a11y-offenders.json", { body: JSON.stringify(offenders, null, 2), contentType: "application/json" });
        console.log(`[a11y] ${path}\n  ` + offenders.map((o) => o.what).join("\n  "));
      }
      expect(result.unlabeled, `unlabeled controls on ${path}`).toEqual([]);
      // Tap targets under 44 px fail the test (milestone 6 accessibility pass).
      for (const w of result.small) info.annotations.push({ type: "small-tap-target", description: `${path}: ${w}` });
      expect(result.small, `tap targets under 44 px on ${path}`).toEqual([]);
    });
  });
}
