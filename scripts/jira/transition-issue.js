#!/usr/bin/env node
/**
 * Transition a JIRA issue to a new status or add a comment.
 * Loads .env.jira from project root if JIRA vars are not set.
 *
 * Usage:
 *   node scripts/jira/transition-issue.js <issueKey> <transitionName>
 *   node scripts/jira/transition-issue.js MVP-123 "In Progress"
 *   node scripts/jira/transition-issue.js MVP-123 Done
 *   node scripts/jira/transition-issue.js MVP-123 comment "Your comment text"
 *   node scripts/jira/transition-issue.js --help
 *
 * Flags:
 *   --help, -h          Show help message
 *
 * Features:
 *   - Automatic retry with exponential backoff
 *   - Better error messages with suggestions
 *   - Auto-loads .env.jira configuration
 *   - Add comments to issues
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.jira');

function loadEnvJira() {
  if (process.env.JIRA_API_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) return;
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

/** Sleep helper for retry logic */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retry a function with exponential backoff */
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message && (err.message.includes('429') || err.message.includes('rate limit'));
      const is503 = err.message && err.message.includes('503');
      
      if ((is429 || is503) && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Rate limited, retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

/** Show help text */
function showHelp() {
  console.log(`
🔄 JIRA Issue Transition & Comment Tool

Transition a JIRA issue to a new status or add a comment.

USAGE:
  node scripts/jira/transition-issue.js <issueKey> <transitionName>
  node scripts/jira/transition-issue.js <issueKey> comment "<comment text>"

ARGUMENTS:
  issueKey           JIRA issue key (e.g., MVP-123)
  transitionName     Target status (e.g., "In Progress", "Done")
  comment            Add a comment to the issue (use "comment" as second arg)

EXAMPLES:
  # Mark issue as in progress
  node scripts/jira/transition-issue.js MVP-123 "In Progress"

  # Mark issue as done
  node scripts/jira/transition-issue.js MVP-123 Done

  # Add a comment to an issue
  node scripts/jira/transition-issue.js MVP-123 comment "🔗 Pull Request: https://github.com/user/repo/pull/42"

ENVIRONMENT VARIABLES:
  JIRA_API_URL       JIRA instance URL (e.g., https://company.atlassian.net)
  JIRA_EMAIL         Your JIRA email
  JIRA_API_TOKEN     Your JIRA API token

  Set these in .env.jira in the project root.

FEATURES:
  ✅ Automatic retry with exponential backoff
  ✅ Better error messages with suggestions
  ✅ Auto-loads .env.jira configuration
  ✅ Add comments to issues
`);
}

const apiUrl = process.env.JIRA_API_URL;
const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

const issueKey = process.argv[2];
const transitionName = (process.argv[3] || '').trim();

if (!issueKey || !transitionName) {
  console.error('❌ Error: Missing required arguments\n');
  console.error('Usage: node scripts/jira/transition-issue.js <issueKey> <transitionName>');
  console.error('Example: node scripts/jira/transition-issue.js MVP-123 "In Progress"\n');
  console.error('Run with --help for more information');
  process.exit(1);
}

if (!apiUrl || !email || !apiToken) {
  console.error('❌ Missing JIRA environment variables:\n');
  if (!apiUrl) console.error('  - JIRA_API_URL');
  if (!email) console.error('  - JIRA_EMAIL');
  if (!apiToken) console.error('  - JIRA_API_TOKEN');
  console.error('\n💡 Set these in .env.jira in the project root or export them.\n');
  process.exit(1);
}

const baseUrl = `${apiUrl.replace(/\/$/, '')}/rest/api/3`;
const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

async function getIssue(key) {
  return await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/issue/${key}?fields=status`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`JIRA API ${res.status}: ${errorText}`);
    }
    return await res.json();
  });
}

async function getTransitions(key) {
  return await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/issue/${key}/transitions`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`JIRA API ${res.status}: ${errorText}`);
    }
    const data = await res.json();
    return data.transitions || [];
  });
}

async function transition(key, transitionName) {
  // Get current issue status
  const issue = await getIssue(key);
  const currentStatus = issue.fields.status.name;
  
  // Get available transitions
  const transitions = await getTransitions(key);
  const nameLower = transitionName.toLowerCase();
  const t = transitions.find(
    (x) => x.name.toLowerCase() === nameLower || (x.to && x.to.name && x.to.name.toLowerCase() === nameLower)
  );
  
  // Already at target status — treat as success (idempotent)
  if (currentStatus.toLowerCase() === nameLower) {
    console.log(`ℹ️  ${key} is already in "${currentStatus}" — no transition needed`);
    return;
  }

  if (!t) {
    const names = transitions.map((x) => x.name || (x.to && x.to.name)).filter(Boolean);

    // Better error message
    console.error(`\n❌ Cannot transition ${key} to "${transitionName}"\n`);
    console.error(`Reason: Transition not available from current status`);
    console.error(`Current status: ${currentStatus}`);
    console.error(`Available transitions: ${names.join(', ') || 'None'}\n`);
    console.error(`Suggestions:`);
    console.error(`  - Check if the issue workflow allows this transition`);
    console.error(`  - Verify the transition name is correct`);
    console.error(`  - You may need to transition through intermediate states\n`);

    throw new Error(`Transition "${transitionName}" not available. Current: ${currentStatus}, Available: ${names.join(', ')}`);
  }
  
  // Execute transition with retry
  await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/issue/${key}/transitions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ transition: { id: t.id } }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`JIRA API ${res.status}: ${errorText}`);
    }
  });
}

/**
 * Add a comment to a JIRA issue
 * @param {string} key - Issue key (e.g., MVP-123)
 * @param {string} commentText - Comment text to add
 */
async function addComment(key, commentText) {
  await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/issue/${key}/comment`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: commentText,
                },
              ],
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`JIRA API ${res.status}: ${errorText}`);
    }
    return await res.json();
  });
}

async function main() {
  try {
    // Check if this is a comment command
    if (transitionName.toLowerCase() === 'comment') {
      const commentText = process.argv.slice(4).join(' ') || process.argv[4];
      if (!commentText) {
        console.error('❌ Error: Comment text is required\n');
        console.error('Usage: node scripts/jira/transition-issue.js <issueKey> comment "Your comment"');
        process.exit(1);
      }
      await addComment(issueKey, commentText);
      console.log(`✅ ${issueKey} ← comment added`);
    } else {
      await transition(issueKey, transitionName);
      console.log(`✅ ${issueKey} → ${transitionName}`);
    }
  } catch (err) {
    console.error(`❌ Failed:`, err.message);
    process.exit(1);
  }
}

main();
