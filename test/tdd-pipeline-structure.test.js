/**
 * Structural validation tests for the TDD pipeline (/tdd-fullpipeline).
 *
 * Verifies that:
 * - commands/tdd-fullpipeline.md has all 8 stages, gates, orchestrator state, error recovery, completion report
 * - commands/tdd-design-brief.md references PRD, outputs design brief, has Mock App Requirements, critic review
 * - commands/tdd-mock-analysis.md references Playwright, 3 viewports, outputs UI contract, DOM/ARIA/data-testid
 * - commands/tdd-test-plan.md references TP-{N}, contract sections, tiered specs
 * - commands/tdd-develop-tests.md references self-health gate, tiers, blind agent constraint
 * - pipeline-config-template.yaml has tdd section with required keys
 * - Cross-file consistency between tdd-fullpipeline.md and all TDD command files
 *
 * Run: node --test test/tdd-pipeline-structure.test.js
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

const tddFullpipelinePath = join(ROOT, 'commands', 'tdd-fullpipeline.md');
const tddDesignBriefPath = join(ROOT, 'commands', 'tdd-design-brief.md');
const tddMockAnalysisPath = join(ROOT, 'commands', 'tdd-mock-analysis.md');
const tddTestPlanPath = join(ROOT, 'commands', 'tdd-test-plan.md');
const tddDevelopTestsPath = join(ROOT, 'commands', 'tdd-develop-tests.md');
const configTemplatePath = join(ROOT, 'pipeline', 'templates', 'pipeline-config-template.yaml');

assert.ok(existsSync(tddFullpipelinePath), `commands/tdd-fullpipeline.md not found at ${tddFullpipelinePath}`);
assert.ok(existsSync(tddDesignBriefPath), `commands/tdd-design-brief.md not found at ${tddDesignBriefPath}`);
assert.ok(existsSync(tddMockAnalysisPath), `commands/tdd-mock-analysis.md not found at ${tddMockAnalysisPath}`);
assert.ok(existsSync(tddTestPlanPath), `commands/tdd-test-plan.md not found at ${tddTestPlanPath}`);
assert.ok(existsSync(tddDevelopTestsPath), `commands/tdd-develop-tests.md not found at ${tddDevelopTestsPath}`);
assert.ok(existsSync(configTemplatePath), `pipeline-config-template.yaml not found at ${configTemplatePath}`);

const tddFullpipeline = readFileSync(tddFullpipelinePath, 'utf8');
const tddDesignBrief = readFileSync(tddDesignBriefPath, 'utf8');
const tddMockAnalysis = readFileSync(tddMockAnalysisPath, 'utf8');
const tddTestPlan = readFileSync(tddTestPlanPath, 'utf8');
const tddDevelopTests = readFileSync(tddDevelopTestsPath, 'utf8');
const configTemplate = readFileSync(configTemplatePath, 'utf8');

// ---------------------------------------------------------------------------
// 8.1.2: commands/tdd-fullpipeline.md structure
// ---------------------------------------------------------------------------

describe('commands/tdd-fullpipeline.md structure', () => {
  it('starts with # /tdd-fullpipeline', () => {
    assert.ok(
      tddFullpipeline.startsWith('# /tdd-fullpipeline'),
      'tdd-fullpipeline.md should start with "# /tdd-fullpipeline"'
    );
  });

  it('has all 8 stage sections', () => {
    const expectedStages = [
      '## Stage 1:',
      '## Stage 2:',
      '## Stage 3:',
      '## Stage 4:',
      '## Stage 5:',
      '## Stage 6:',
      '## Stage 7:',
      '## Stage 8:',
    ];
    for (const stage of expectedStages) {
      assert.ok(
        tddFullpipeline.includes(stage),
        `tdd-fullpipeline.md should contain "${stage}"`
      );
    }
  });

  it('has gates for all 8 stages', () => {
    const expectedGates = [
      'GATE 1',
      'GATE 2',
      'GATE 3',
      'GATE 4',
      'GATE 5',
      'GATE 6',
      'GATE 7',
      'GATE 8',
    ];
    for (const gate of expectedGates) {
      assert.ok(
        tddFullpipeline.includes(gate),
        `tdd-fullpipeline.md should contain "${gate}"`
      );
    }
  });

  it('has orchestrator state with TDD-specific fields', () => {
    const stateFields = ['brief_path', 'contract_path', 'test_plan_path'];
    for (const field of stateFields) {
      assert.ok(
        tddFullpipeline.includes(field),
        `tdd-fullpipeline.md orchestrator state should include "${field}"`
      );
    }
  });

  it('has error recovery section covering all 8 stages', () => {
    assert.ok(
      tddFullpipeline.includes('Error Recovery'),
      'tdd-fullpipeline.md should have an Error Recovery section'
    );
    for (let i = 1; i <= 8; i++) {
      assert.ok(
        tddFullpipeline.includes(`Stage ${i} interrupted`),
        `Error recovery should cover Stage ${i} interrupted`
      );
    }
  });

  it('has completion report section', () => {
    assert.ok(
      tddFullpipeline.includes('Completion'),
      'tdd-fullpipeline.md should have a Completion section'
    );
  });

  it('Stage 1 references req2prd.md', () => {
    assert.ok(
      tddFullpipeline.includes('req2prd.md'),
      'Stage 1 should reference req2prd.md'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.3: commands/tdd-design-brief.md structure
// ---------------------------------------------------------------------------

describe('commands/tdd-design-brief.md structure', () => {
  it('file exists', () => {
    assert.ok(
      existsSync(tddDesignBriefPath),
      'commands/tdd-design-brief.md should exist'
    );
  });

  it('references the PRD', () => {
    assert.ok(
      tddDesignBrief.includes('PRD'),
      'tdd-design-brief.md should reference the PRD'
    );
  });

  it('outputs to docs/tdd/<slug>/design-brief.md', () => {
    assert.ok(
      tddDesignBrief.includes('docs/tdd/') && tddDesignBrief.includes('design-brief.md'),
      'tdd-design-brief.md should output to docs/tdd/<slug>/design-brief.md'
    );
  });

  it('has Mock App Requirements section', () => {
    assert.ok(
      tddDesignBrief.includes('Mock App Requirements'),
      'tdd-design-brief.md should have a "Mock App Requirements" section'
    );
  });

  it('has critic review step', () => {
    assert.ok(
      tddDesignBrief.includes('Critic Review') || tddDesignBrief.includes('Ralph Loop'),
      'tdd-design-brief.md should have a critic review step'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.4: commands/tdd-mock-analysis.md structure
// ---------------------------------------------------------------------------

describe('commands/tdd-mock-analysis.md structure', () => {
  it('file exists', () => {
    assert.ok(
      existsSync(tddMockAnalysisPath),
      'commands/tdd-mock-analysis.md should exist'
    );
  });

  it('references Playwright', () => {
    assert.ok(
      tddMockAnalysis.includes('Playwright'),
      'tdd-mock-analysis.md should reference Playwright'
    );
  });

  it('references 3 viewport widths (375, 768, 1280)', () => {
    assert.ok(
      tddMockAnalysis.includes('375'),
      'tdd-mock-analysis.md should reference viewport width 375'
    );
    assert.ok(
      tddMockAnalysis.includes('768'),
      'tdd-mock-analysis.md should reference viewport width 768'
    );
    assert.ok(
      tddMockAnalysis.includes('1280'),
      'tdd-mock-analysis.md should reference viewport width 1280'
    );
  });

  it('outputs to docs/tdd/<slug>/ui-contract.md', () => {
    assert.ok(
      tddMockAnalysis.includes('docs/tdd/') && tddMockAnalysis.includes('ui-contract.md'),
      'tdd-mock-analysis.md should output to docs/tdd/<slug>/ui-contract.md'
    );
  });

  it('extracts DOM structure', () => {
    assert.ok(
      tddMockAnalysis.includes('DOM structure') || tddMockAnalysis.includes('DOM Structure'),
      'tdd-mock-analysis.md should extract DOM structure'
    );
  });

  it('references ARIA roles', () => {
    assert.ok(
      tddMockAnalysis.includes('ARIA roles') || tddMockAnalysis.includes('ARIA role'),
      'tdd-mock-analysis.md should reference ARIA roles'
    );
  });

  it('references data-testid', () => {
    assert.ok(
      tddMockAnalysis.includes('data-testid'),
      'tdd-mock-analysis.md should reference data-testid'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.5: commands/tdd-test-plan.md structure
// ---------------------------------------------------------------------------

describe('commands/tdd-test-plan.md structure', () => {
  it('file exists', () => {
    assert.ok(
      existsSync(tddTestPlanPath),
      'commands/tdd-test-plan.md should exist'
    );
  });

  it('references TP-{N} or TP- traceability IDs', () => {
    assert.ok(
      tddTestPlan.includes('TP-{N}') || tddTestPlan.includes('TP-'),
      'tdd-test-plan.md should reference TP-{N} or TP- traceability IDs'
    );
  });

  it('has Performance Contracts section', () => {
    assert.ok(
      tddTestPlan.includes('Performance Contracts'),
      'tdd-test-plan.md should have a "Performance Contracts" section'
    );
  });

  it('has Accessibility Contracts section', () => {
    assert.ok(
      tddTestPlan.includes('Accessibility Contracts'),
      'tdd-test-plan.md should have an "Accessibility Contracts" section'
    );
  });

  it('has Error Contracts section', () => {
    assert.ok(
      tddTestPlan.includes('Error Contracts'),
      'tdd-test-plan.md should have an "Error Contracts" section'
    );
  });

  it('has Data Flow Contracts section', () => {
    assert.ok(
      tddTestPlan.includes('Data Flow Contracts'),
      'tdd-test-plan.md should have a "Data Flow Contracts" section'
    );
  });

  it('references tiered specifications (Tier 1 / Tier 2)', () => {
    assert.ok(
      tddTestPlan.includes('Tier 1'),
      'tdd-test-plan.md should reference Tier 1'
    );
    assert.ok(
      tddTestPlan.includes('Tier 2'),
      'tdd-test-plan.md should reference Tier 2'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.6: commands/tdd-develop-tests.md structure
// ---------------------------------------------------------------------------

describe('commands/tdd-develop-tests.md structure', () => {
  it('file exists', () => {
    assert.ok(
      existsSync(tddDevelopTestsPath),
      'commands/tdd-develop-tests.md should exist'
    );
  });

  it('references self-health gate (red_count)', () => {
    assert.ok(
      tddDevelopTests.includes('red_count'),
      'tdd-develop-tests.md should reference self-health gate with red_count'
    );
  });

  it('references Tier 1 and Tier 2', () => {
    assert.ok(
      tddDevelopTests.includes('Tier 1'),
      'tdd-develop-tests.md should reference Tier 1'
    );
    assert.ok(
      tddDevelopTests.includes('Tier 2'),
      'tdd-develop-tests.md should reference Tier 2'
    );
  });

  it('references blind agent or context restriction', () => {
    assert.ok(
      tddDevelopTests.includes('blind agent') ||
      tddDevelopTests.includes('BLIND AGENT') ||
      tddDevelopTests.includes('context restriction') ||
      tddDevelopTests.includes('dev plan is NOT read'),
      'tdd-develop-tests.md should reference blind agent or context restriction'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.7: pipeline-config-template.yaml -- tdd section
// ---------------------------------------------------------------------------

describe('pipeline-config-template.yaml -- tdd section', () => {
  it('contains max_mock_routes', () => {
    assert.ok(
      configTemplate.includes('max_mock_routes'),
      'Config template tdd section should contain max_mock_routes'
    );
  });

  it('contains self_health_gate', () => {
    assert.ok(
      configTemplate.includes('self_health_gate'),
      'Config template tdd section should contain self_health_gate'
    );
  });

  it('contains max_test_adjustment_pct', () => {
    assert.ok(
      configTemplate.includes('max_test_adjustment_pct'),
      'Config template tdd section should contain max_test_adjustment_pct'
    );
  });

  it('contains metrics_dir', () => {
    assert.ok(
      configTemplate.includes('metrics_dir'),
      'Config template tdd section should contain metrics_dir'
    );
  });
});

// ---------------------------------------------------------------------------
// 8.1.8: cross-file consistency
// ---------------------------------------------------------------------------

describe('cross-file consistency', () => {
  it('tdd-fullpipeline.md references tdd-design-brief.md', () => {
    assert.ok(
      tddFullpipeline.includes('tdd-design-brief.md'),
      'tdd-fullpipeline.md should reference tdd-design-brief.md'
    );
  });

  it('tdd-fullpipeline.md references tdd-mock-analysis.md', () => {
    assert.ok(
      tddFullpipeline.includes('tdd-mock-analysis.md'),
      'tdd-fullpipeline.md should reference tdd-mock-analysis.md'
    );
  });

  it('tdd-fullpipeline.md references tdd-test-plan.md', () => {
    assert.ok(
      tddFullpipeline.includes('tdd-test-plan.md'),
      'tdd-fullpipeline.md should reference tdd-test-plan.md'
    );
  });

  it('tdd-fullpipeline.md references tdd-develop-tests.md', () => {
    assert.ok(
      tddFullpipeline.includes('tdd-develop-tests.md'),
      'tdd-fullpipeline.md should reference tdd-develop-tests.md'
    );
  });

  it('config keys match between command files and config template', () => {
    // max_mock_routes is used in tdd-mock-analysis.md and defined in config template
    assert.ok(
      tddMockAnalysis.includes('max_mock_routes'),
      'tdd-mock-analysis.md should reference max_mock_routes'
    );
    assert.ok(
      configTemplate.includes('max_mock_routes'),
      'Config template should define max_mock_routes'
    );

    // self_health_gate is used in tdd-develop-tests.md and defined in config template
    assert.ok(
      tddDevelopTests.includes('self_health_gate'),
      'tdd-develop-tests.md should reference self_health_gate'
    );
    assert.ok(
      configTemplate.includes('self_health_gate'),
      'Config template should define self_health_gate'
    );
  });
});
