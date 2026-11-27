import { readdir, readFile, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const required = [
  'README.md', 'frontend/index.html', 'frontend/config.example.js',
  'frontend/js/app.js', 'frontend/js/auth/auth-service.js',
  'frontend/js/modules/project-wizard.js', 'frontend/js/modules/questionnaires.js',
  'supabase/config.toml', 'supabase/seed.sql',
  'supabase/functions/username-login/index.ts',
  'supabase/functions/create-employee/index.ts',
  'supabase/functions/admin-employee-action/index.ts',
  'supabase/functions/bootstrap-admin/index.ts',
  'docs/ADMIN_SETUP.md', 'docs/SECURITY.md', 'docs/TESTING.md'
];
for (const path of required) await access(join(root, path));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

const frontendJs = (await walk(join(root, 'frontend'))).filter(path => path.endsWith('.js'));
assert.ok(frontendJs.length >= 10, 'Expected modular frontend JavaScript files');
for (const path of frontendJs) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Syntax check failed for ${relative(root, path)}:\n${result.stderr}`);
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /(?:SUPABASE_)?SERVICE_ROLE_KEY\s*[:=]|service_role\s*[:=]/i,
    `Privileged credential identifier found in browser source: ${relative(root, path)}`);
}

const migrations = (await walk(join(root, 'supabase/migrations')))
  .filter(path => path.endsWith('.sql')).sort();
assert.ok(migrations.length >= 6, 'Expected all ordered SQL migrations');
const sql = (await Promise.all(migrations.map(path => readFile(path, 'utf8')))).join('\n');
for (const requiredSql of [
  "'BD_STANDARD_15'", "'TECH_COMPANY_35'", "'TECH_SELF_45'",
  'accept_available_project', 'approve_project_completion',
  'eligible_amount_paise', 'row level security', 'create policy',
  'project-brochures'
]) assert.ok(sql.toLowerCase().includes(requiredSql.toLowerCase()), `Missing SQL invariant: ${requiredSql}`);

const wizard = await readFile(join(root, 'frontend/js/modules/project-wizard.js'), 'utf8');
assert.match(wizard, /activeQuestionPages\(wizard\.service,wizard\.answers\)/,
  'Wizard should recalculate conditional question visibility');
assert.match(wizard, /ITEMIZED SCOPE & PRICING/, 'Brochure should show itemized pricing when available');
assert.match(wizard, /project-brochures/, 'Brochure version should use private project storage');

const config = await readFile(join(root, 'frontend/config.example.js'), 'utf8');
assert.match(config, /YOUR_PROJECT_REF/);
assert.match(config, /YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY/);
assert.doesNotMatch(config, /eyJ[A-Za-z0-9_-]{20,}\./, 'A live-looking JWT must not be bundled');

console.log(`Webnest Nexus smoke checks passed: ${frontendJs.length} frontend JS files, ${migrations.length} migrations, required setup and security files.`);
console.log('Note: this is a static smoke check, not a Supabase/Edge Function/RLS integration test.');
