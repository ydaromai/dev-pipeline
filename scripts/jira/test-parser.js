#!/usr/bin/env node
/**
 * Test parser for task breakdown markdown (Epic/Story/Task).
 *
 * Validates that the markdown is being parsed correctly before sending to Jira.
 *
 * Usage:
 *   node scripts/jira/test-parser.js
 *   node scripts/jira/test-parser.js --file=docs/dev_plans/item-level-forecast-breakdown.md
 */

import { readFileSync } from 'fs';
import { join } from 'path';

class MarkdownParser {
  constructor(content) {
    this.content = content;
    this.lines = content.split('\n');
  }
  
  parse() {
    const result = {
      epic: null,
      stories: [],
    };
    
    let currentStory = null;
    let currentTask = null;
    let currentSection = null;
    let descriptionLines = [];
    
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      
      // Epic
      if (line.match(/^## EPIC:/)) {
        const match = line.match(/^## EPIC: (.+)/);
        if (match) {
          result.epic = {
            id: 'EPIC-1',
            summary: match[1],
            description: '',
            assignee: null,
            priority: null,
            labels: [],
            estimate: null,
          };
          currentSection = 'epic';
          descriptionLines = [];
        }
      }
      
      // Story
      else if (line.match(/^## STORY \d+:/)) {
        if (currentStory) {
          result.stories.push(currentStory);
        }
        const match = line.match(/^## STORY (\d+): (.+)/);
        if (match) {
          currentStory = {
            id: `STORY-${match[1]}`,
            summary: match[2],
            description: '',
            assignee: null,
            priority: null,
            labels: [],
            estimate: null,
            tasks: [],
          };
          currentSection = 'story';
          descriptionLines = [];
        }
      }
      
      // Task
      else if (line.match(/^### TASK [\d.]+:/)) {
        if (currentTask) {
          currentStory.tasks.push(currentTask);
        }
        const match = line.match(/^### TASK ([\d.]+): (.+)/);
        if (match) {
          currentTask = {
            id: `TASK-${match[1]}`,
            summary: match[2],
            description: '',
            assignee: null,
            estimate: null,
            labels: [],
            dependencies: [],
            subtasks: [],
          };
          currentSection = 'task';
          descriptionLines = [];
        }
      }
      
      // Metadata parsing
      else if (line.match(/^\*\*Assignee:\*\*/)) {
        const match = line.match(/^\*\*Assignee:\*\* (.+)/);
        if (match && currentSection) {
          const assignee = match[1].trim();
          if (currentSection === 'epic' && result.epic) result.epic.assignee = assignee;
          else if (currentSection === 'story' && currentStory) currentStory.assignee = assignee;
          else if (currentSection === 'task' && currentTask) currentTask.assignee = assignee;
        }
      }
      
      else if (line.match(/^\*\*Time Estimate:\*\*/)) {
        const match = line.match(/^\*\*Time Estimate:\*\* (.+)/);
        if (match && currentSection) {
          const estimate = match[1].trim();
          if (currentSection === 'story' && currentStory) currentStory.estimate = estimate;
          else if (currentSection === 'task' && currentTask) currentTask.estimate = estimate;
        }
      }
      
      else if (line.match(/^\*\*Labels:\*\*/)) {
        const match = line.match(/^\*\*Labels:\*\* (.+)/);
        if (match && currentSection) {
          const labels = match[1].split(',').map(l => l.trim().replace(/`/g, ''));
          if (currentSection === 'epic' && result.epic) result.epic.labels = labels;
          else if (currentSection === 'story' && currentStory) currentStory.labels = labels;
          else if (currentSection === 'task' && currentTask) currentTask.labels = labels;
        }
      }
    }
    
    // Push final items
    if (currentTask) currentStory.tasks.push(currentTask);
    if (currentStory) result.stories.push(currentStory);
    
    return result;
  }
}

const DEFAULT_FILE = 'docs/dev_plans/item-level-forecast-breakdown.md';

function main() {
  console.log('🧪 Testing Markdown Parser\n');
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  const relativePath = fileArg ? fileArg.slice('--file='.length) : DEFAULT_FILE;
  const filePath = join(process.cwd(), relativePath);
  console.log(`📄 Reading: ${filePath}\n`);
  
  const content = readFileSync(filePath, 'utf8');
  const parser = new MarkdownParser(content);
  const data = parser.parse();
  
  // Summary statistics
  console.log('📊 Parse Results:\n');
  console.log('═'.repeat(60));
  
  // Epic
  if (data.epic) {
    console.log(`\n📦 EPIC: ${data.epic.id}`);
    console.log(`   Summary: ${data.epic.summary}`);
    console.log(`   Assignee: ${data.epic.assignee || 'N/A'}`);
    console.log(`   Priority: ${data.epic.priority || 'N/A'}`);
    console.log(`   Labels: ${data.epic.labels.join(', ') || 'None'}`);
  }
  
  // Stories
  console.log(`\n📄 STORIES: ${data.stories.length}`);
  console.log('─'.repeat(60));
  
  let totalTasks = 0;
  let totalEstimate = 0;
  
  data.stories.forEach((story, idx) => {
    console.log(`\n${idx + 1}. ${story.id}: ${story.summary}`);
    console.log(`   Estimate: ${story.estimate || 'N/A'}`);
    console.log(`   Labels: ${story.labels.join(', ') || 'None'}`);
    console.log(`   Tasks: ${story.tasks.length}`);
    
    totalTasks += story.tasks.length;
    
    // Parse estimate
    if (story.estimate) {
      const match = story.estimate.match(/(\d+)\s*hours?/);
      if (match) totalEstimate += parseInt(match[1]);
    }
    
    story.tasks.forEach((task, taskIdx) => {
      console.log(`     ${taskIdx + 1}. ${task.id}: ${task.summary.substring(0, 60)}...`);
      console.log(`        Estimate: ${task.estimate || 'N/A'}`);
    });
  });
  
  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📈 SUMMARY:');
  console.log(`   Epic:      1`);
  console.log(`   Stories:   ${data.stories.length}`);
  console.log(`   Tasks:     ${totalTasks}`);
  console.log(`   ─────────────`);
  console.log(`   TOTAL:     ${1 + data.stories.length + totalTasks} issues`);
  console.log(`\n   Estimated Hours: ${totalEstimate}h`);
  
  // Validation
  console.log('\n✅ VALIDATION:');
  const issues = [];
  
  if (!data.epic) {
    issues.push('❌ No Epic found');
  }
  
  if (data.stories.length === 0) {
    issues.push('❌ No Stories found');
  }
  
  data.stories.forEach(story => {
    if (story.tasks.length === 0) {
      issues.push(`⚠️  ${story.id} has no tasks`);
    }
    
    if (!story.estimate) {
      issues.push(`⚠️  ${story.id} missing time estimate`);
    }
  });
  
  if (issues.length === 0) {
    console.log('   ✅ All checks passed!');
    console.log('   ✅ Ready to import to Jira');
  } else {
    console.log(`   Found ${issues.length} issues:\n`);
    issues.forEach(issue => console.log(`   ${issue}`));
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('\n💡 Next Steps:');
  console.log('   1. Review the parsed structure above');
  console.log(`   2. Run: node scripts/jira/jira-import.js --file=${relativePath} --dry-run`);
  console.log('   3. If dry-run looks good: --create\n');
}

main();
