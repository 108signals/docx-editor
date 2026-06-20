import { defineConfig, devices } from '@playwright/test';

// Which projects did the CLI ask for (`--project=x` or `--project x`)? Empty
// means "all projects".
const requestedProjects = process.argv.reduce<string[]>((acc, arg, i) => {
  if (arg.startsWith('--project=')) acc.push(arg.slice('--project='.length));
  else if (arg === '--project') acc.push(process.argv[i + 1]);
  return acc;
}, []);

// The collaboration example backs only `collab-comment-id.spec.ts`, which runs
// under the default `chromium` project. Boot its dev server only when that
// project is in scope so project-scoped runs — notably the release publish-path
// parity smoke gate (`--project=parity`) — don't pay for an unrelated server.
const collabServerNeeded = requestedProjects.length === 0 || requestedProjects.includes('chromium');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use 4 workers locally for faster execution, 1 in CI for stability
  workers: process.env.CI ? 1 : 4,
  // Default timeout of 30s per test (can override with --timeout flag)
  timeout: 30000,
  // Expect timeout for assertions
  expect: {
    timeout: 5000,
  },
  reporter: [
    ['list'],
    // Only generate HTML report in CI or when explicitly requested
    ...(process.env.CI || process.env.HTML_REPORT ? [['html', { open: 'never' }] as const] : []),
  ],

  use: {
    baseURL: 'http://localhost:5173',
    // Only trace/screenshot on failure to speed up passing tests
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Faster action timeouts
    actionTimeout: 10000,
    navigationTimeout: 15000,
    // Grant clipboard permissions for copy/paste tests
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // React-only specs run against the React demo (port 5173).
      testIgnore: ['**/parity/**', '**/vue/**', '**/nuxt/**'],
    },
    {
      name: 'vue',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/vue/**/*.spec.ts'],
    },
    {
      // Smoke specs for the Nuxt module demo (port 3002).
      name: 'nuxt',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/nuxt/**/*.spec.ts'],
    },
    {
      // Parity specs target both adapters via the `parityCases` fixture.
      // The fixture file is excluded from `testMatch` so Playwright doesn't
      // treat it as a spec.
      name: 'parity',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/parity/**/*.spec.ts'],
    },
  ],

  /* Run dev servers before tests */
  webServer: [
    {
      command: 'bun run dev:react',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
    },
    {
      command: 'bun run dev:vue',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
    },
    {
      // Nuxt dev is slower to boot than Vite — allow extra startup time.
      command: 'bun run dev:nuxt',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    ...(collabServerNeeded
      ? [
          {
            command: "bun run --filter './examples/collaboration' dev",
            url: 'http://localhost:5273',
            reuseExistingServer: !process.env.CI,
            timeout: 60 * 1000,
          },
        ]
      : []),
  ],

  /* Output directory for screenshots */
  outputDir: './screenshots/test-results',
});
