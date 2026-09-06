import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEventList, createDefaultProject, normalizeProject } from '../lib/groove.ts';

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const initializer = page.match(/const \[project, setProject\][\s\S]*?const projectRef/);

assert.ok(initializer, 'Home project state initializer must remain discoverable');
assert.match(initializer[0], /useState<Project>\(\(\) => createDefaultProject\(\)\)/);
assert.doesNotMatch(initializer[0], /localStorage/);
assert.match(page, /const restored = normalizeProject\(JSON\.parse\(stored\)\);/);
assert.match(page, /setProject\(restored\);/);
assert.match(page, /setSelection\(\(current\) => \(\{ \.\.\.current, variation: restored\.currentVariation \}\)\);/);

const visibleProjectState = (project) => ({
  name: project.name,
  seed: project.seed,
  variation: project.currentVariation,
  chain: project.chain,
  eventCount: buildEventList(project).length,
});

const serverProject = createDefaultProject();
const firstClientProject = createDefaultProject();
const restoredProject = normalizeProject({
  ...serverProject,
  name: 'Saved Loop',
  seed: 271828,
  currentVariation: 'C',
  chain: ['C', 'C', 'A', 'D'],
});

assert.deepEqual(visibleProjectState(serverProject), visibleProjectState(firstClientProject), 'server and first client state must match');
assert.notDeepEqual(visibleProjectState(serverProject), visibleProjectState(restoredProject), 'fixture must exercise saved-state differences');
assert.equal(restoredProject.currentVariation, 'C');
assert.equal(buildEventList(restoredProject).length, 205);

console.log('hydration regression PASS: deterministic first render; local restore deferred to mount effect');
