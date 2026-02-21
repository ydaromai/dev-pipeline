import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = join(__dirname, '..', 'pipeline', 'agents');

// ---------------------------------------------------------------------------
// Discover all critic agent files
// ---------------------------------------------------------------------------
const agentFiles = readdirSync(AGENTS_DIR)
  .filter(f => f.endsWith('-critic.md'))
  .sort();

const REQUIRED_SECTIONS = [
  '## Role',
  '## When Used',
  '## Inputs You Receive',
  '## Review Checklist',
  '## Output Format',
  '## Pass/Fail Rule',
  '## Guidelines',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Critic agent discovery', () => {
  it('finds at least 6 critic agent files', () => {
    assert.ok(
      agentFiles.length >= 6,
      `Expected at least 6 critic files, found ${agentFiles.length}: ${agentFiles.join(', ')}`
    );
  });

  it('includes all expected critic agents', () => {
    const expected = [
      'product-critic.md',
      'dev-critic.md',
      'devops-critic.md',
      'qa-critic.md',
      'security-critic.md',
      'designer-critic.md',
    ];
    for (const file of expected) {
      assert.ok(
        agentFiles.includes(file),
        `Missing expected critic file: ${file}`
      );
    }
  });
});

describe('Critic agent structure validation', () => {
  for (const file of agentFiles) {
    const agentName = basename(file, '.md');
    const content = readFileSync(join(AGENTS_DIR, file), 'utf8');

    describe(agentName, () => {
      it('starts with a top-level heading', () => {
        const firstLine = content.split('\n').find(l => l.trim().length > 0);
        assert.ok(
          firstLine.startsWith('# '),
          `${file} should start with "# " heading, got: "${firstLine}"`
        );
      });

      for (const section of REQUIRED_SECTIONS) {
        it(`has "${section}" section`, () => {
          assert.ok(
            content.includes(section),
            `${file} is missing required section: ${section}`
          );
        });
      }

      it('has PASS/FAIL verdict in output format', () => {
        assert.ok(
          content.includes('Verdict: PASS | FAIL') || content.includes('Verdict: PASS/FAIL'),
          `${file} output format should include "Verdict: PASS | FAIL"`
        );
      });

      it('has Critical findings section in output format', () => {
        assert.ok(
          content.includes('Critical (must fix)'),
          `${file} should have "Critical (must fix)" in output format`
        );
      });

      it('has Warnings section in output format', () => {
        assert.ok(
          content.includes('Warnings (should fix)'),
          `${file} should have "Warnings (should fix)" in output format`
        );
      });

      it('has Notes section in output format', () => {
        assert.ok(
          content.includes('Notes (informational)'),
          `${file} should have "Notes (informational)" in output format`
        );
      });

      it('defines pass/fail rule correctly', () => {
        assert.ok(
          content.includes('FAIL') && content.includes('Critical'),
          `${file} pass/fail rule should reference Critical findings`
        );
        assert.ok(
          content.includes('PASS') && content.includes('Warnings'),
          `${file} pass/fail rule should reference Warnings`
        );
      });

      it('has review checklist items', () => {
        const checklistItems = content.match(/^- \[ \] /gm);
        assert.ok(
          checklistItems && checklistItems.length >= 5,
          `${file} should have at least 5 checklist items, found ${checklistItems ? checklistItems.length : 0}`
        );
      });

      it('has output checklist items with pass/fail marks', () => {
        const outputChecklist = content.match(/\[x\/✗[\/N\/A]*\]/g);
        assert.ok(
          outputChecklist && outputChecklist.length >= 5,
          `${file} should have at least 5 output checklist items with [x/✗] marks, found ${outputChecklist ? outputChecklist.length : 0}`
        );
      });

      it('has a summary section in output format', () => {
        assert.ok(
          content.includes('### Summary'),
          `${file} should have "### Summary" in output format`
        );
      });
    });
  }
});

describe('Designer Critic conditional activation', () => {
  const designerContent = readFileSync(join(AGENTS_DIR, 'designer-critic.md'), 'utf8');

  it('mentions has_frontend in the Role section', () => {
    const roleSection = designerContent.split('## When Used')[0];
    assert.ok(
      roleSection.includes('has_frontend'),
      'Designer Critic Role section should mention has_frontend conditional activation'
    );
  });

  it('specifies skip behavior when has_frontend is false', () => {
    assert.ok(
      designerContent.includes('skip this review entirely'),
      'Designer Critic should specify skip behavior when has_frontend is false'
    );
  });

  it('includes N/A in checklist marks', () => {
    assert.ok(
      designerContent.includes('[x/✗/N/A]'),
      'Designer Critic should use [x/✗/N/A] checklist marks'
    );
  });

  it('has accessibility checklist section', () => {
    assert.ok(
      designerContent.includes('### Accessibility'),
      'Designer Critic should have Accessibility checklist section'
    );
  });

  it('mentions WCAG', () => {
    assert.ok(
      designerContent.includes('WCAG'),
      'Designer Critic should reference WCAG accessibility standards'
    );
  });

  it('has Accessibility Summary table in output format', () => {
    assert.ok(
      designerContent.includes('Accessibility Summary'),
      'Designer Critic should have Accessibility Summary table in output format'
    );
  });
});

describe('Product Critic analytics items', () => {
  const content = readFileSync(join(AGENTS_DIR, 'product-critic.md'), 'utf8');

  it('has analytics events checklist item', () => {
    assert.ok(
      content.includes('Analytics events defined'),
      'Product Critic should have analytics events checklist item'
    );
  });

  it('has tracking traceability checklist item', () => {
    assert.ok(
      content.includes('Tracking requirements traceable'),
      'Product Critic should have tracking traceability checklist item'
    );
  });

  it('has analytics guideline', () => {
    assert.ok(
      content.includes('analytics/tracking events'),
      'Product Critic should have analytics guideline'
    );
  });

  it('analytics items are conditional on PRD Section 11', () => {
    assert.ok(
      content.includes('Section 11'),
      'Product Critic analytics items should reference PRD Section 11'
    );
  });
});

describe('Dev Critic analytics items', () => {
  const content = readFileSync(join(AGENTS_DIR, 'dev-critic.md'), 'utf8');

  it('has analytics instrumentation checklist item', () => {
    assert.ok(
      content.includes('Analytics events instrumented'),
      'Dev Critic should have analytics instrumentation checklist item'
    );
  });

  it('has PII checklist item', () => {
    assert.ok(
      content.includes('No PII in analytics payloads'),
      'Dev Critic should have PII in analytics checklist item'
    );
  });

  it('has non-blocking analytics checklist item', () => {
    assert.ok(
      content.includes("Analytics calls don't block"),
      'Dev Critic should have non-blocking analytics checklist item'
    );
  });

  it('PII guideline is Critical severity', () => {
    assert.ok(
      content.includes('PII in analytics payloads is Critical'),
      'Dev Critic should flag PII in analytics as Critical'
    );
  });

  it('missing analytics guideline is Warning severity', () => {
    assert.ok(
      content.includes('Missing analytics instrumentation is a Warning'),
      'Dev Critic should flag missing analytics as Warning'
    );
  });
});

describe('Pipeline config template', () => {
  const content = readFileSync(
    join(__dirname, '..', 'pipeline', 'templates', 'pipeline-config-template.yaml'),
    'utf8'
  );

  it('has has_frontend flag', () => {
    assert.ok(
      content.includes('has_frontend:'),
      'Config template should have has_frontend flag'
    );
  });

  it('has_frontend defaults to false', () => {
    assert.ok(
      content.includes('has_frontend: false'),
      'has_frontend should default to false'
    );
  });

  it('includes designer in prd2plan critics', () => {
    const prd2planSection = content.split('prd2plan:')[1].split('\n')[1];
    assert.ok(
      prd2planSection.includes('designer'),
      'prd2plan stage should include designer critic'
    );
  });

  it('includes designer in execute critics', () => {
    const executeSection = content.split('execute:')[1].split('\n')[1];
    assert.ok(
      executeSection.includes('designer'),
      'execute stage should include designer critic'
    );
  });

  it('includes designer in pre_merge critics', () => {
    const preMergeSection = content.split('pre_merge:')[1].split('\n')[1];
    assert.ok(
      preMergeSection.includes('designer'),
      'pre_merge stage should include designer critic'
    );
  });

  it('does not include designer in req2prd critics', () => {
    const req2prdSection = content.split('req2prd:')[1].split('prd2plan:')[0];
    assert.ok(
      !req2prdSection.includes('designer'),
      'req2prd stage should NOT include designer critic'
    );
  });

  it('does not include designer in plan2jira critics', () => {
    const plan2jiraSection = content.split('plan2jira:')[1].split('execute:')[0];
    assert.ok(
      !plan2jiraSection.includes('designer'),
      'plan2jira stage should NOT include designer critic'
    );
  });
});

describe('PRD template analytics section', () => {
  const content = readFileSync(
    join(__dirname, '..', 'pipeline', 'templates', 'prd-template.md'),
    'utf8'
  );

  it('has Tracking & Analytics Events subsection', () => {
    assert.ok(
      content.includes('### Tracking & Analytics Events'),
      'PRD template should have Tracking & Analytics Events subsection'
    );
  });

  it('is under Section 11 (Success Metrics)', () => {
    const section11Pos = content.indexOf('## 11. Success Metrics');
    const section12Pos = content.indexOf('## 12. Open Questions');
    const trackingPos = content.indexOf('### Tracking & Analytics Events');
    assert.ok(section11Pos > 0, 'Section 11 should exist');
    assert.ok(trackingPos > section11Pos, 'Tracking section should be after Section 11');
    assert.ok(trackingPos < section12Pos, 'Tracking section should be before Section 12');
  });

  it('has event table template', () => {
    assert.ok(
      content.includes('Event Name') && content.includes('Trigger') && content.includes('Maps to Metric'),
      'PRD template should have event table with Event Name, Trigger, and Maps to Metric columns'
    );
  });
});
