#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { Octokit } from '@octokit/rest';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const program = new Command();
const pkg = require('../package.json');

// Initialize clients
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function fetchPullRequests(owner, repo) {
  const spinner = ora('Fetching pull requests...').start();
  try {
    const { data: pulls } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 30
    });
    spinner.succeed('Pull requests fetched successfully');
    return pulls;
  } catch (error) {
    spinner.fail('Failed to fetch pull requests');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function generateSummary(selectedPRs) {
  const spinner = ora('Generating release summary...').start();
  try {
    const prDetails = selectedPRs.map(pr => ({
      title: pr.title,
      body: pr.body || '',
      number: pr.number,
      url: pr.html_url
    }));

    const prompt = `Generate a concise and organized summary of the following changes for a release PR. Group related changes into sections:

${JSON.stringify(prDetails, null, 2)}

Format the response in markdown with sections and bullet points. Keep it professional and user-friendly.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    spinner.succeed('Summary generated successfully');
    return response.choices[0].message.content;
  } catch (error) {
    spinner.fail('Failed to generate summary');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function createReleasePR(owner, repo, summary, selectedPRs, sourceBranch, targetBranch) {
  const spinner = ora('Creating release PR...').start();
  try {
    const prList = selectedPRs.map(pr => 
      `- [#${pr.number}](${pr.html_url}) - ${pr.title} by @${pr.user.login} (${new Date(pr.created_at).toLocaleDateString()})`
    ).join('\n');

    const body = `${summary}\n\n## Included Pull Requests\n${prList}`;

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: `Release ${new Date().toISOString().split('T')[0]}`,
      head: sourceBranch,
      base: targetBranch,
      body,
      draft: true
    });

    spinner.succeed('Release PR created successfully');
    return pr;
  } catch (error) {
    spinner.fail('Failed to create release PR');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function run() {
  if (!process.env.GITHUB_TOKEN || !process.env.OPENAI_API_KEY) {
    console.error(chalk.red('Error: GITHUB_TOKEN and OPENAI_API_KEY environment variables are required'));
    process.exit(1);
  }

  const { owner, repo } = await inquirer.prompt([
    {
      type: 'input',
      name: 'owner',
      message: 'Enter repository owner:',
      validate: input => input.length > 0
    },
    {
      type: 'input',
      name: 'repo',
      message: 'Enter repository name:',
      validate: input => input.length > 0
    }
  ]);

  const pulls = await fetchPullRequests(owner, repo);
  
  const { selectedPRs } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPRs',
      message: 'Select pull requests to include in the release:',
      choices: pulls.map(pr => ({
        name: `#${pr.number} - ${pr.title}`,
        value: pr
      })),
      validate: input => input.length > 0
    }
  ]);

  const summary = await generateSummary(selectedPRs);

  console.log(chalk.cyan('\nGenerated Summary:'));
  console.log(summary);

  const { confirm, sourceBranch, targetBranch } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Would you like to create a release PR with this summary?'
    },
    {
      type: 'input',
      name: 'sourceBranch',
      message: 'Enter source branch name:',
      when: answers => answers.confirm,
      validate: input => input.length > 0
    },
    {
      type: 'input',
      name: 'targetBranch',
      message: 'Enter target branch name:',
      when: answers => answers.confirm,
      validate: input => input.length > 0
    }
  ]);

  if (confirm) {
    const pr = await createReleasePR(owner, repo, summary, selectedPRs, sourceBranch, targetBranch);
    console.log(chalk.green('\nSuccess! Release PR created:'), pr.html_url);
  }
}

program
  .name('git-release-ai')
  .description('AI-powered GitHub release automation tool')
  .version(pkg.version)
  .action(run)
  .parse(process.argv);
