import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Entry = { id: string; type: string; title: string; name: string; tags?: string[] };

const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as {
  entries: Record<string, Entry>;
};
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    for (const story of stories) {
      const phone = story.tags?.includes('phone') ?? false;

      test(`${story.title} › ${story.name}`, async ({ browser }) => {
        const context = await browser.newContext(
          phone
            ? { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }
            : { viewport: { width: 1280, height: 800 } },
        );
        const page = await context.newPage();
        const problems: string[] = [];
        page.on('pageerror', (e) => problems.push(`error: ${e.message}`));
        page.on('response', (r) => {
          if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
            problems.push(`${r.status()} ${r.url()}`);
        });

        // a11y.manual: the addon's own axe run would collide with this one.
        await page.goto(
          `/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme};a11y.manual:!true`,
        );
        await page.locator('#storybook-root > :not(script)').first().waitFor();
        // Let springs settle (sheets, the palette) before checking.
        await page.waitForTimeout(700);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        const violations = results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );

        expect(problems, 'errors while rendering').toEqual([]);
        expect(violations, 'axe').toEqual([]);
        await context.close();
      });
    }
  });
}
