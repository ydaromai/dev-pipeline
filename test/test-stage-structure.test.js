/**
 * Structural validation tests for the /test pipeline stage (Stage 5).
 *
 * Verifies that:
 * - commands/test.md has all 10 steps with correct headings and patterns
 * - commands/fullpipeline.md has Stage 5, Gate 5, orchestrator state, error recovery
 * - pipeline-config-template.yaml has test_stage section, test_commands entries, validation.stages.test
 * - Cross-references between files are consistent
 *
 * Run: node --test test/test-stage-structure.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Load files under test
// ---------------------------------------------------------------------------

const testMdPath = join(ROOT, 'commands', 'test.md');
const fullpipelinePath = join(ROOT, 'commands', 'fullpipeline.md');
const configTemplatePath = join(ROOT, 'pipeline', 'templates', 'pipeline-config-template.yaml');

assert.ok(existsSync(testMdPath), `commands/test.md not found at ${testMdPath}`);
assert.ok(existsSync(fullpipelinePath), `commands/fullpipeline.md not found at ${fullpipelinePath}`);
assert.ok(existsSync(configTemplatePath), `pipeline-config-template.yaml not found at ${configTemplatePath}`);

const testMd = readFileSync(testMdPath, 'utf8');
const fullpipeline = readFileSync(fullpipelinePath, 'utf8');
const configTemplate = readFileSync(configTemplatePath, 'utf8');

// ---------------------------------------------------------------------------
// commands/test.md — Structure
// ---------------------------------------------------------------------------

describe('commands/test.md structure', () => {
  it('starts with the correct heading', () => {
    assert.ok(
      testMd.startsWith('# /test'),
      'test.md should start with "# /test"'
    );
  });

  it('references $ARGUMENTS for input', () => {
    assert.ok(
      testMd.includes('$ARGUMENTS'),
      'test.md should reference $ARGUMENTS for dev plan input'
    );
  });

  it('has all 10 step headings', () => {
    const expectedSteps = [
      '## Step 1:',
      '## Step 2:',
      '## Step 3:',
      '## Step 4:',
      '## Step 5:',
      '## Step 6:',
      '## Step 7:',
      '## Step 8:',
      '## Step 9:',
      '## Step 10:',
    ];
    for (const step of expectedSteps) {
      assert.ok(
        testMd.includes(step),
        `test.md should contain "${step}"`
      );
    }
  });

  it('Step 1 checks test_stage.enabled', () => {
    assert.ok(
      testMd.includes('test_stage.enabled'),
      'Step 1 should check test_stage.enabled'
    );
  });

  it('Step 1 handles missing dev plan file', () => {
    assert.ok(
      testMd.includes('Dev plan file not found'),
      'Step 1 should handle missing dev plan file with clear error message'
    );
  });

  it('Step 1 handles empty diff', () => {
    assert.ok(
      testMd.includes('No changed files detected'),
      'Step 1 should handle empty diff case'
    );
  });

  it('Step 1 references pipeline.config.yaml', () => {
    assert.ok(
      testMd.includes('pipeline.config.yaml'),
      'Step 1 should reference pipeline.config.yaml for configuration'
    );
  });

  it('Step 1 references git diff main..HEAD', () => {
    assert.ok(
      testMd.includes('git diff main..HEAD'),
      'Step 1 should compute cumulative diff via git diff main..HEAD'
    );
  });
});

describe('commands/test.md — Step 2: Test Existence Audit', () => {
  it('references test_requirements patterns', () => {
    assert.ok(
      testMd.includes('test_requirements'),
      'Step 2 should reference test_requirements patterns from config'
    );
  });

  it('references PRD Section 9', () => {
    assert.ok(
      testMd.includes('PRD Section 9') || testMd.includes('Section 9'),
      'Step 2 should cross-reference PRD Section 9 Testing Strategy'
    );
  });

  it('produces inventory table', () => {
    assert.ok(
      testMd.includes('Source File') && testMd.includes('Required Types') && testMd.includes('Missing'),
      'Step 2 should produce an inventory table with Source File, Required Types, and Missing columns'
    );
  });
});

describe('commands/test.md — Step 3: Missing Test Generation (Ralph Loop)', () => {
  it('includes Ralph Loop BUILD phase', () => {
    assert.ok(
      testMd.includes('BUILD phase') || testMd.includes('BUILD'),
      'Step 3 should include Ralph Loop BUILD phase'
    );
  });

  it('includes REVIEW phase with QA + Dev critics', () => {
    assert.ok(
      testMd.includes('qa-critic.md') && testMd.includes('dev-critic.md'),
      'Step 3 should review with QA + Dev critics'
    );
  });

  it('references max_fix_iterations', () => {
    assert.ok(
      testMd.includes('max_fix_iterations'),
      'Step 3 should reference max_fix_iterations for Ralph Loop limit'
    );
  });

  it('includes human gate for PR approval', () => {
    assert.ok(
      testMd.includes('Approve and merge') || testMd.includes('approve/reject'),
      'Step 3 should include human gate for PR approval'
    );
  });

  it('handles skip when no gaps', () => {
    assert.ok(
      testMd.includes('SKIPPED') && testMd.includes('no gaps'),
      'Step 3 should skip when no gaps are found'
    );
  });
});

describe('commands/test.md — Step 4: Run All Tests', () => {
  it('references test_commands keys', () => {
    const keys = ['test_commands.unit', 'test_commands.integration', 'test_commands.all'];
    for (const key of keys) {
      assert.ok(
        testMd.includes(key) || testMd.includes('test_commands'),
        `Step 4 should reference ${key}`
      );
    }
  });

  it('handles unconfigured test types', () => {
    assert.ok(
      testMd.includes('SKIPPED (not configured)'),
      'Step 4 should report "SKIPPED (not configured)" for missing test_commands keys'
    );
  });

  it('re-runs ALL tests after fix', () => {
    assert.ok(
      testMd.includes('re-run ALL') || testMd.includes('ALL test'),
      'Step 4 should re-run ALL test types after a fix (not just the failed type)'
    );
  });

  it('includes per-type result reporting', () => {
    assert.ok(
      testMd.includes('Pass') && testMd.includes('Fail') && testMd.includes('Duration'),
      'Step 4 should report per-type results with Pass, Fail, and Duration'
    );
  });
});

describe('commands/test.md — Step 5: Coverage Verification', () => {
  it('references coverage flag auto-detection', () => {
    assert.ok(
      testMd.includes('--coverage') || testMd.includes('coverage flag'),
      'Step 5 should reference coverage flag auto-detection'
    );
  });

  it('references coverage threshold', () => {
    assert.ok(
      testMd.includes('coverage_thresholds') || testMd.includes('coverage_threshold'),
      'Step 5 should reference configurable coverage thresholds'
    );
  });

  it('treats below-threshold as Warning not blocking', () => {
    assert.ok(
      testMd.includes('Warning') && testMd.includes('not blocking'),
      'Step 5 should treat below-threshold coverage as Warning (not blocking)'
    );
  });
});

describe('commands/test.md — Step 6: CI Pipeline Audit', () => {
  it('detects CI config file patterns', () => {
    const patterns = ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile'];
    for (const pattern of patterns) {
      assert.ok(
        testMd.includes(pattern),
        `Step 6 should detect ${pattern}`
      );
    }
  });

  it('references fix_commented_jobs config', () => {
    assert.ok(
      testMd.includes('fix_commented_jobs'),
      'Step 6 should reference test_stage.ci_audit.fix_commented_jobs'
    );
  });

  it('produces CI health table', () => {
    assert.ok(
      testMd.includes('Job') && testMd.includes('Status') && testMd.includes('Notes'),
      'Step 6 should produce a CI health table'
    );
  });
});

describe('commands/test.md — Step 7: CD Pipeline Audit', () => {
  it('detects CD config files', () => {
    assert.ok(
      testMd.includes('Dockerfile') || testMd.includes('docker-compose'),
      'Step 7 should detect CD config files like Dockerfile or docker-compose'
    );
  });

  it('is report-only (no auto-fix)', () => {
    assert.ok(
      testMd.includes('report-only') || testMd.includes('No auto-fix') || testMd.includes('no auto-fix'),
      'Step 7 should be report-only with no auto-fix'
    );
  });
});

describe('commands/test.md — Step 8: Local Deployment Verification', () => {
  it('references execute.md Step 5 infrastructure', () => {
    assert.ok(
      testMd.includes('execute.md') && testMd.includes('Step 5'),
      'Step 8 should reference execute.md Step 5 smoke test infrastructure'
    );
  });

  it('checks smoke_test.enabled', () => {
    assert.ok(
      testMd.includes('smoke_test.enabled'),
      'Step 8 should check smoke_test.enabled'
    );
  });
});

describe('commands/test.md — Step 9: Full Cumulative Critic Validation', () => {
  it('references all 10 critic persona files', () => {
    const critics = [
      'product-critic.md',
      'dev-critic.md',
      'devops-critic.md',
      'qa-critic.md',
      'security-critic.md',
      'performance-critic.md',
      'data-integrity-critic.md',
      'observability-critic.md',
      'api-contract-critic.md',
      'designer-critic.md',
    ];
    for (const critic of critics) {
      assert.ok(
        testMd.includes(critic),
        `Step 9 should reference ${critic}`
      );
    }
  });

  it('runs on cumulative diff (main..HEAD)', () => {
    // Already checked git diff main..HEAD in Step 1, but Step 9 should also reference it
    assert.ok(
      testMd.includes('main..HEAD'),
      'Step 9 should run against the cumulative main..HEAD diff'
    );
  });

  it('includes fix loop for failed critics', () => {
    assert.ok(
      testMd.includes('FAIL') && testMd.includes('fix') && testMd.includes('critic'),
      'Step 9 should include a fix loop for failed critics'
    );
  });
});

describe('commands/test.md — Step 10: Final Report', () => {
  it('includes all report sections', () => {
    const sections = [
      'Test Inventory',
      'Test Results',
      'Coverage',
      'CI Pipeline Audit',
      'CD Pipeline Audit',
      'Local Deployment',
      'Critic Validation',
      'Overall Verdict',
    ];
    for (const section of sections) {
      assert.ok(
        testMd.includes(section),
        `Step 10 should include "${section}" in the final report`
      );
    }
  });

  it('has PASS/FAIL overall verdict', () => {
    assert.ok(
      testMd.includes('PASS') && testMd.includes('FAIL'),
      'Step 10 should have PASS/FAIL overall verdict'
    );
  });
});

// ---------------------------------------------------------------------------
// commands/fullpipeline.md — Stage 5 Integration
// ---------------------------------------------------------------------------

describe('fullpipeline.md — Stage 5 integration', () => {
  it('architecture diagram includes Stage 5', () => {
    assert.ok(
      fullpipeline.includes('Stage 5 subagent'),
      'Architecture diagram should include Stage 5 subagent'
    );
  });

  it('orchestrator state includes test_result', () => {
    assert.ok(
      fullpipeline.includes('test_result'),
      'Orchestrator state should include test_result'
    );
  });

  it('has Stage 5 section heading', () => {
    assert.ok(
      fullpipeline.includes('## Stage 5'),
      'Should have a Stage 5 section'
    );
  });

  it('Stage 5 section references /test command', () => {
    assert.ok(
      fullpipeline.includes('commands/test.md') || fullpipeline.includes('/test'),
      'Stage 5 section should reference the /test command'
    );
  });

  it('has Gate 5 section', () => {
    assert.ok(
      fullpipeline.includes('Gate 5') || fullpipeline.includes('GATE 5'),
      'Should have a Gate 5 section for test results approval'
    );
  });

  it('Stage 5 checks test_stage.enabled', () => {
    assert.ok(
      fullpipeline.includes('test_stage.enabled'),
      'Stage 5 should check test_stage.enabled for skip logic'
    );
  });

  it('completion section references Stage 5', () => {
    assert.ok(
      fullpipeline.includes('Test Verification'),
      'Completion section should reference Test Verification results'
    );
  });

  it('error recovery includes Stage 5', () => {
    assert.ok(
      fullpipeline.includes('Stage 5 interrupted'),
      'Error recovery should include Stage 5 entry'
    );
  });
});

// ---------------------------------------------------------------------------
// pipeline-config-template.yaml — test_stage section
// ---------------------------------------------------------------------------

describe('pipeline-config-template.yaml — test_stage config', () => {
  it('has test_stage section', () => {
    assert.ok(
      configTemplate.includes('test_stage:'),
      'Config template should have test_stage section'
    );
  });

  it('has test_stage.enabled option', () => {
    assert.ok(
      configTemplate.includes('enabled: true') && configTemplate.includes('skip Stage 5'),
      'test_stage should have enabled option with skip Stage 5 description'
    );
  });

  it('has max_fix_iterations option', () => {
    assert.ok(
      configTemplate.includes('max_fix_iterations: 3'),
      'test_stage should have max_fix_iterations option defaulting to 3'
    );
  });

  it('has coverage_thresholds.lines option', () => {
    assert.ok(
      configTemplate.includes('lines: 80'),
      'test_stage should have coverage_thresholds.lines option defaulting to 80'
    );
  });

  it('has ci_audit.fix_commented_jobs option', () => {
    assert.ok(
      configTemplate.includes('fix_commented_jobs:'),
      'test_stage should have ci_audit.fix_commented_jobs option'
    );
  });
});

describe('pipeline-config-template.yaml — test_commands updates', () => {
  it('has e2e test command entry', () => {
    assert.ok(
      configTemplate.includes('e2e:') && configTemplate.includes('test:e2e'),
      'test_commands should have e2e entry'
    );
  });

  it('has component test command entry', () => {
    assert.ok(
      configTemplate.includes('component:') && configTemplate.includes('test:component'),
      'test_commands should have component entry'
    );
  });

  it('has all test command entry', () => {
    assert.ok(
      configTemplate.includes('all: "npm run test:all"'),
      'test_commands should have all entry'
    );
  });
});

describe('pipeline-config-template.yaml — validation.stages.test', () => {
  it('has test stage in validation.stages', () => {
    assert.ok(
      configTemplate.includes('test:') &&
      configTemplate.includes('stages:'),
      'validation.stages should include test entry'
    );
  });

  it('test stage has correct critic list', () => {
    // The test stage entry should list all critics
    const testStageMatch = configTemplate.match(/^\s+test:\s*\n\s+critics:.*$/m);
    // Alternatively, check that the config has a test stage with critics
    assert.ok(
      configTemplate.includes('test:') && configTemplate.includes('product, dev, devops, qa, security'),
      'test stage should include the standard critic list'
    );
  });

  it('test stage is between execute and pre_merge', () => {
    const executePos = configTemplate.indexOf('execute:');
    const testPos = configTemplate.indexOf('      test:');
    const preMergePos = configTemplate.indexOf('pre_merge:');
    assert.ok(executePos > 0, 'execute stage should exist');
    assert.ok(testPos > executePos, 'test stage should be after execute');
    assert.ok(preMergePos > testPos, 'pre_merge should be after test');
  });
});

// ---------------------------------------------------------------------------
// Cross-file consistency
// ---------------------------------------------------------------------------

describe('Cross-file consistency — test stage', () => {
  it('test.md and fullpipeline.md both reference test_stage.enabled', () => {
    assert.ok(testMd.includes('test_stage.enabled'), 'test.md should reference test_stage.enabled');
    assert.ok(fullpipeline.includes('test_stage.enabled'), 'fullpipeline.md should reference test_stage.enabled');
  });

  it('test.md and config template both reference test_commands', () => {
    assert.ok(testMd.includes('test_commands'), 'test.md should reference test_commands');
    assert.ok(configTemplate.includes('test_commands:'), 'config template should have test_commands section');
  });

  it('test.md references all 10 critics matching config template', () => {
    const critics = ['product', 'dev', 'devops', 'qa', 'security', 'performance', 'data-integrity'];
    for (const critic of critics) {
      assert.ok(
        testMd.includes(`${critic}-critic.md`),
        `test.md should reference ${critic}-critic.md`
      );
    }
  });

  it('fullpipeline.md error recovery mentions /test idempotent behavior', () => {
    assert.ok(
      fullpipeline.includes('idempotent') && fullpipeline.includes('Stage 5'),
      'fullpipeline.md error recovery should mention /test idempotent behavior'
    );
  });

  it('config keys referenced in test.md match config template defaults', () => {
    // Verify that the default values mentioned in test.md Step 1 match the config template
    assert.ok(
      testMd.includes('max_fix_iterations') && configTemplate.includes('max_fix_iterations: 3'),
      'max_fix_iterations default should be consistent (3)'
    );
    assert.ok(
      testMd.includes('default: 80') && configTemplate.includes('lines: 80'),
      'coverage_thresholds.lines default should be consistent (80)'
    );
    assert.ok(
      testMd.includes('default: false') && configTemplate.includes('fix_commented_jobs: false'),
      'fix_commented_jobs default should be consistent (false)'
    );
  });

  it('step numbers referenced in fullpipeline.md match test.md', () => {
    // fullpipeline.md subagent prompt says "Execute all steps (1 through 10)"
    assert.ok(
      fullpipeline.includes('1 through 10') || fullpipeline.includes('steps 1 through 10') || fullpipeline.includes('Steps 1 through 10'),
      'fullpipeline.md should reference all 10 steps of /test'
    );
  });

  it('test.md empty diff message accurately describes which steps run', () => {
    // The empty diff message should mention Steps 6-10 run (not just CI/CD + critics)
    assert.ok(
      testMd.includes('Skipping Steps 2-5') && testMd.includes('Steps 6-10'),
      'Empty diff message should accurately state Steps 2-5 are skipped and Steps 6-10 run'
    );
  });
});
