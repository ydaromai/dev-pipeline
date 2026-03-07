/**
 * Structural validation tests for expert builder agent files.
 *
 * Verifies that every *-expert.md in pipeline/agents/builders/ follows the
 * standard section format, has required elements (Role, When Activated,
 * Domain Knowledge, Anti-Patterns, Definition of Done), and that the
 * routing table in execute.md references all existing builder files.
 *
 * Run: node --test test/builder-agents-structure.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILDERS_DIR = join(__dirname, '..', 'pipeline', 'agents', 'builders');
const EXECUTE_MD = join(__dirname, '..', 'commands', 'execute.md');

assert.ok(
  existsSync(BUILDERS_DIR),
  `Builders directory not found: ${BUILDERS_DIR}`
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_BUILDERS = [
  'frontend-expert.md',
  'backend-expert.md',
  'data-expert.md',
  'security-expert.md',
  'infra-expert.md',
  'data-analyst-expert.md',
  'ml-expert.md',
];

const REQUIRED_SECTIONS = [
  '## Role',
  '## When Activated',
  '## Domain Knowledge',
  '## Anti-Patterns to Avoid',
  '## Definition of Done',
];

const VALID_DOMAINS = [
  'Security',
  'ML',
  'Data Analytics',
  'Infra',
  'Data',
  'Frontend',
  'Backend',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBuilderFiles() {
  return readdirSync(BUILDERS_DIR)
    .filter(f => f.endsWith('-expert.md'))
    .sort();
}

function readBuilder(filename) {
  return readFileSync(join(BUILDERS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Builder agent discovery', () => {
  it('finds at least 7 builder agent files', () => {
    const files = getBuilderFiles();
    assert.ok(files.length >= 7, `Expected >= 7 builder files, found ${files.length}`);
  });

  it('includes all expected builder agents', () => {
    const files = getBuilderFiles();
    for (const expected of EXPECTED_BUILDERS) {
      assert.ok(files.includes(expected), `Missing expected builder: ${expected}`);
    }
  });
});

describe('Builder agent structure validation', () => {
  for (const filename of EXPECTED_BUILDERS) {
    describe(filename.replace('.md', ''), () => {
      const content = readBuilder(filename);

      it('starts with a top-level heading', () => {
        assert.match(content, /^# /m);
      });

      for (const section of REQUIRED_SECTIONS) {
        it(`has "${section}" section`, () => {
          assert.ok(
            content.includes(section),
            `Missing required section: ${section}`
          );
        });
      }

      it('has at least 3 subsections under Domain Knowledge', () => {
        const domainStart = content.indexOf('## Domain Knowledge');
        const nextSection = content.indexOf('\n## ', domainStart + 1);
        const domainContent = content.slice(domainStart, nextSection > -1 ? nextSection : undefined);
        const subsections = (domainContent.match(/^### /gm) || []).length;
        assert.ok(subsections >= 3, `Expected >= 3 Domain Knowledge subsections, found ${subsections}`);
      });

      it('has at least 3 checklist items in Definition of Done', () => {
        const dodStart = content.indexOf('## Definition of Done');
        const dodContent = content.slice(dodStart);
        const items = (dodContent.match(/^- \[ \]/gm) || []).length;
        assert.ok(items >= 3, `Expected >= 3 Definition of Done items, found ${items}`);
      });

      it('has Anti-Patterns section with at least 3 items', () => {
        const apStart = content.indexOf('## Anti-Patterns to Avoid');
        const nextSection = content.indexOf('\n## ', apStart + 1);
        const apContent = content.slice(apStart, nextSection > -1 ? nextSection : undefined);
        const items = (apContent.match(/^- /gm) || []).length;
        assert.ok(items >= 3, `Expected >= 3 anti-patterns, found ${items}`);
      });

      it('has Foundation Mode section', () => {
        assert.ok(
          content.includes('## Foundation Mode'),
          'Missing Foundation Mode section'
        );
      });
    });
  }
});

describe('Builder agent negative validations', () => {
  it('no builder file is empty', () => {
    for (const f of getBuilderFiles()) {
      const content = readBuilder(f);
      assert.ok(content.trim().length > 100, `${f} appears to be empty or too short`);
    }
  });

  it('no builder file has duplicate section headings', () => {
    for (const f of getBuilderFiles()) {
      const content = readBuilder(f);
      const headings = content.match(/^## .+$/gm) || [];
      const unique = new Set(headings);
      assert.equal(
        headings.length,
        unique.size,
        `${f} has duplicate section headings: ${headings.filter((h, i) => headings.indexOf(h) !== i)}`
      );
    }
  });
});

describe('Cross-file consistency — builders', () => {
  it('execute.md routing table references all expected builder files', () => {
    const executeContent = readFileSync(EXECUTE_MD, 'utf-8');
    for (const filename of EXPECTED_BUILDERS) {
      assert.ok(
        executeContent.includes(filename.replace('.md', '')),
        `execute.md does not reference builder: ${filename}`
      );
    }
  });

  it('every builder file in directory is referenced in execute.md', () => {
    const executeContent = readFileSync(EXECUTE_MD, 'utf-8');
    for (const filename of getBuilderFiles()) {
      const name = filename.replace('.md', '');
      assert.ok(
        executeContent.includes(name),
        `Builder file ${filename} exists but is not referenced in execute.md`
      );
    }
  });

  it('execute.md lists all valid domain values', () => {
    const executeContent = readFileSync(EXECUTE_MD, 'utf-8');
    assert.ok(
      executeContent.includes('**Valid domain values:**'),
      'execute.md missing valid domain values list'
    );
    for (const domain of VALID_DOMAINS) {
      assert.ok(
        executeContent.includes(`\`${domain}\``),
        `execute.md missing valid domain: ${domain}`
      );
    }
  });

  it('execute.md has error handling for missing persona files', () => {
    const executeContent = readFileSync(EXECUTE_MD, 'utf-8');
    assert.ok(
      executeContent.includes('persona file is not found'),
      'execute.md missing error handling for missing persona files'
    );
  });

  it('execute.md has error handling for invalid Domain field values', () => {
    const executeContent = readFileSync(EXECUTE_MD, 'utf-8');
    assert.ok(
      executeContent.includes('does not match one of the valid domain values'),
      'execute.md missing validation for invalid Domain field'
    );
  });

  it('task-breakdown-definition-template.md includes Domain field', () => {
    const templateContent = readFileSync(
      join(__dirname, '..', 'pipeline', 'templates', 'task-breakdown-definition-template.md'),
      'utf-8'
    );
    assert.ok(
      templateContent.includes('**Domain**'),
      'Task breakdown template missing Domain field'
    );
  });
});
