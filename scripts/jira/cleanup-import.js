#!/usr/bin/env node
/**
 * JIRA Import Cleanup Tool
 * 
 * Delete issues from a failed or incorrect import using batch ID.
 * 
 * Usage:
 *   node scripts/jira/cleanup-import.js --list
 *   node scripts/jira/cleanup-import.js --batch=<batchId>
 *   node scripts/jira/cleanup-import.js --file=<dev-plan-path>
 *   node scripts/jira/cleanup-import.js --help
 * 
 * Flags:
 *   --list              List recent imports from history
 *   --batch=<id>        Delete all issues with this batch ID
 *   --file=<path>       Delete issues from the import of this file
 *   --yes               Skip confirmation prompt
 *   --help, -h          Show this help message
 * 
 * Environment Variables:
 *   JIRA_API_URL - Jira instance URL
 *   JIRA_EMAIL - Your Jira email
 *   JIRA_API_TOKEN - Your Jira API token
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

/** Load .env.jira from project root */
function loadEnvJira() {
  if (process.env.JIRA_API_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) return;
  const envPath = join(process.cwd(), '.env.jira');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch (_) { /* ignore */ }
}
loadEnvJira();

const config = {
  apiUrl: process.env.JIRA_API_URL,
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
};

/** Validate config */
function validateConfig() {
  const missing = [];
  if (!config.apiUrl) missing.push('JIRA_API_URL');
  if (!config.email) missing.push('JIRA_EMAIL');
  if (!config.apiToken) missing.push('JIRA_API_TOKEN');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nSet them in .env.jira or export them.');
    process.exit(1);
  }
}

/** Parse command line arguments */
function parseArgs() {
  const args = {
    list: false,
    batch: null,
    file: null,
    yes: false,
    help: false,
  };
  
  process.argv.slice(2).forEach(arg => {
    if (arg === '--list') {
      args.list = true;
    } else if (arg.startsWith('--batch=')) {
      args.batch = arg.slice('--batch='.length);
    } else if (arg.startsWith('--file=')) {
      args.file = arg.slice('--file='.length);
    } else if (arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  });
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }
  
  if (!args.list && !args.batch && !args.file) {
    console.error('❌ Error: One of --list, --batch, or --file required\n');
    console.error('Run with --help for usage information');
    process.exit(1);
  }
  
  return args;
}

/** Show help text */
function showHelp() {
  console.log(`
🧹 JIRA Import Cleanup Tool

Delete issues from a failed or incorrect import using batch ID.

USAGE:
  node scripts/jira/cleanup-import.js [command]

COMMANDS:
  --list              List recent imports from history
  --batch=<id>        Delete all issues with this batch ID
  --file=<path>       Delete issues from the import of this file
  --yes, -y           Skip confirmation prompt
  --help, -h          Show this help message

EXAMPLES:
  # List recent imports
  node scripts/jira/cleanup-import.js --list

  # Delete issues from a specific batch
  node scripts/jira/cleanup-import.js --batch=abc123

  # Delete issues from a dev plan import
  node scripts/jira/cleanup-import.js --file=docs/dev_plans/breakdown.md

  # Skip confirmation prompt
  node scripts/jira/cleanup-import.js --batch=abc123 --yes

SAFETY:
  - Always shows issue count before deletion
  - Requires confirmation unless --yes is used
  - Only deletes issues with the batch label
  - Cannot be undone

ENVIRONMENT VARIABLES:
  JIRA_API_URL        JIRA instance URL
  JIRA_EMAIL          Your JIRA email
  JIRA_API_TOKEN      Your JIRA API token

  Set these in .env.jira in the project root.
`);
}

/** Load import history */
function loadImportHistory() {
  const historyPath = join(process.cwd(), '.jira-import-history.json');
  if (!existsSync(historyPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(historyPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

/** Prompt user for confirmation */
async function confirm(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n${question} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

/** JIRA API client */
class JiraClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = `${config.apiUrl}/rest/api/3`;
    this.auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  }
  
  async makeRequest(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      let errorText = await response.text();
      // Redact auth credentials from error messages
      if (this.auth) {
        errorText = errorText.replace(new RegExp(this.auth, 'g'), '[REDACTED]');
      }
      throw new Error(`JIRA API error (${response.status}): ${errorText}`);
    }
    
    if (response.status === 204) {
      return null; // No content (successful delete)
    }
    
    return await response.json();
  }
  
  async searchIssuesByLabel(label) {
    const jql = `labels = "${label}"`;
    const result = await this.makeRequest('GET', `/search?jql=${encodeURIComponent(jql)}&maxResults=1000`);
    return result.issues || [];
  }
  
  async deleteIssue(issueKey) {
    await this.makeRequest('DELETE', `/issue/${issueKey}`);
  }
}

/** List recent imports */
function listImports() {
  const history = loadImportHistory();
  const entries = Object.entries(history);
  
  if (entries.length === 0) {
    console.log('\n📭 No import history found.\n');
    return;
  }
  
  console.log('\n📋 Recent Imports:\n');
  
  entries.forEach(([filePath, data], index) => {
    const date = new Date(data.importDate).toLocaleString();
    console.log(`${index + 1}. ${filePath}`);
    console.log(`   Epic: ${data.epicKey}`);
    console.log(`   Date: ${date}`);
    console.log(`   Batch: ${data.batchId}`);
    console.log(`   Issues: ${data.issueCount}`);
    console.log();
  });
  
  console.log('💡 To clean up an import:');
  console.log('   node scripts/jira/cleanup-import.js --batch=<batchId>');
  console.log('   node scripts/jira/cleanup-import.js --file=<filePath>\n');
}

/** Delete issues by batch ID */
async function deleteByBatch(batchId, skipConfirm) {
  validateConfig();
  
  const label = `import-batch-${batchId}`;
  console.log(`\n🔍 Searching for issues with label: ${label}...\n`);
  
  const client = new JiraClient(config);
  
  try {
    const issues = await client.searchIssuesByLabel(label);
    
    if (issues.length === 0) {
      console.log('❌ No issues found with this batch ID.\n');
      process.exit(1);
    }
    
    console.log(`Found ${issues.length} issue(s):\n`);
    issues.forEach(issue => {
      console.log(`  - ${issue.key}: ${issue.fields.summary}`);
    });
    console.log();
    
    // Confirm deletion
    if (!skipConfirm) {
      const confirmed = await confirm(`⚠️  Delete all ${issues.length} issue(s)?`);
      if (!confirmed) {
        console.log('\n❌ Deletion cancelled.\n');
        process.exit(0);
      }
    }
    
    console.log('\n🗑️  Deleting issues...\n');
    
    for (const issue of issues) {
      try {
        await client.deleteIssue(issue.key);
        console.log(`  ✅ Deleted: ${issue.key}`);
      } catch (error) {
        console.log(`  ❌ Failed to delete ${issue.key}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Cleanup complete!\n');
    
  } catch (error) {
    console.error(`\n❌ Cleanup failed: ${error.message}\n`);
    process.exit(1);
  }
}

/** Delete issues by file path */
async function deleteByFile(filePath, skipConfirm) {
  const history = loadImportHistory();
  const importData = history[filePath];
  
  if (!importData) {
    console.log(`\n❌ No import history found for file: ${filePath}\n`);
    console.log('💡 Run with --list to see available imports.\n');
    process.exit(1);
  }
  
  console.log(`\n📄 Import found for: ${filePath}`);
  console.log(`   Epic: ${importData.epicKey}`);
  console.log(`   Date: ${new Date(importData.importDate).toLocaleString()}`);
  console.log(`   Batch: ${importData.batchId}`);
  console.log(`   Issues: ${importData.issueCount}\n`);
  
  await deleteByBatch(importData.batchId, skipConfirm);
}

/** Main execution */
async function main() {
  const args = parseArgs();
  
  if (args.list) {
    listImports();
    return;
  }
  
  if (args.batch) {
    await deleteByBatch(args.batch, args.yes);
    return;
  }
  
  if (args.file) {
    await deleteByFile(args.file, args.yes);
    return;
  }
}

main();
