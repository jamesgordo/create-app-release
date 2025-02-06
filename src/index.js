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
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const program = new Command();
const pkg = require('../package.json');

async function checkAndConfigureGitHubToken() {
  // Check for existing token in environment
  let token = process.env.GITHUB_TOKEN;

  // If no token, check git config
  if (!token) {
    try {
      const { stdout } = await exec('git config --global github.token');
      token = stdout.trim();
    } catch (error) {
      // Token not found in git config
    }
  }

  // If still no token, prompt user
  if (!token) {
    console.log(chalk.yellow('No GitHub token found. Let\'s set one up.'));
    console.log(chalk.cyan('You can create a new token at: https://github.com/settings/tokens/new'));
    console.log(chalk.cyan('Make sure to enable the \'repo\' scope.'));

    const { newToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newToken',
        message: 'Enter your GitHub token:',
        validate: input => input.length > 0
      }
    ]);

    // Save token to git config
    try {
      await exec(`git config --global github.token "${newToken}"`);
      console.log(chalk.green('GitHub token saved successfully!'));
      token = newToken;
    } catch (error) {
      console.error(chalk.red('Failed to save GitHub token:'), error.message);
      process.exit(1);
    }
  }

  return token;
}

// Initialize clients
let octokit;
let openai;

// Initialize tokens in correct order
async function initializeTokens() {
  const githubToken = await checkAndConfigureGitHubToken();
  const openaiToken = await checkAndConfigureOpenAIToken();
  return { githubToken, openaiToken };
}

async function checkAndConfigureOpenAIToken() {
  // Check for existing token in environment
  let token = process.env.OPENAI_API_KEY;

  // If no token, check git config
  if (!token) {
    try {
      const { stdout } = await exec('git config --global openai.token');
      token = stdout.trim();
    } catch (error) {
      // Token not found in git config
    }
  }

  // If still no token, prompt user
  if (!token) {
    console.log(chalk.yellow('\nNo OpenAI token found. Let\'s set one up.'));
    console.log(chalk.cyan('You can create a new token at: https://platform.openai.com/api-keys'));

    const { newToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newToken',
        message: 'Enter your OpenAI token:',
        validate: input => input.length > 0
      }
    ]);

    // Save token to git config
    try {
      await exec(`git config --global openai.token "${newToken}"`);
      console.log(chalk.green('OpenAI token saved successfully!'));
      token = newToken;
    } catch (error) {
      console.error(chalk.red('Failed to save OpenAI token:'), error.message);
      process.exit(1);
    }
  }

  return token;
}

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
      author: pr.user.login,
      authorUrl: `https://github.com/${pr.user.login}`,
      date: new Date(pr.created_at).toLocaleDateString(),
      url: pr.html_url,
    }));

    const prompt = `Create a release summary for the following pull requests. The summary should have two parts:

1. A bullet-point list of key changes, grouped by type (e.g., Features, Bug Fixes, Improvements).
2. List of pull requests included in the release. Format: "#<number> - <title> by [@<author>](<authorUrl>) (<date>)".

Pull Requests to summarize:
${JSON.stringify(prDetails, null, 2)}

Keep the summary concise, clear, and focused on the user impact. Use professional but easy-to-understand language.`;

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

async function createReleasePR(owner, repo, summary, selectedPRs, sourceBranch, targetBranch, version) {
  const spinner = ora('Creating release PR...').start();
  try {
    const body = `# Release Summary

${summary}`;

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: `Release: Version ${version}`,
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
  // Initialize tokens sequentially
  const { githubToken, openaiToken } = await initializeTokens();
  
  // Initialize clients with tokens
  octokit = new Octokit({
    auth: githubToken
  });

  openai = new OpenAI({
    apiKey: openaiToken
  });

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

  const { summaryType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'summaryType',
      message: 'How would you like to summarize the pull requests?',
      choices: [
        { name: 'Use AI to generate a summary', value: 'ai' },
        { name: 'Simply list the selected pull requests', value: 'list' }
      ]
    }
  ]);

  let summary;
  if (summaryType === 'ai') {
    summary = await generateSummary(selectedPRs);
  } else {
    summary = selectedPRs.map(pr => {
      const date = new Date(pr.created_at).toLocaleDateString();
      return `#${pr.number} - ${pr.title} (by [@${pr.user.login}](https://github.com/${pr.user.login}) on ${date})`;
    }).join('\n');
  }

  console.log(chalk.cyan('\nSummary:'));
  console.log(summary);

  const { version, confirm, sourceBranch, targetBranch } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: 'Enter the version number for this release (e.g., 1.2.3):',
      validate: input => {
        // Validate semantic versioning format (x.y.z)
        const semverRegex = /^\d+\.\d+\.\d+$/;
        if (!semverRegex.test(input)) {
          return 'Please enter a valid version number in the format x.y.z (e.g., 1.2.3)';
        }
        return true;
      }
    },
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
    const pr = await createReleasePR(owner, repo, summary, selectedPRs, sourceBranch, targetBranch, version);
    console.log(chalk.green('\nSuccess! Release PR created:'), pr.html_url);
  }
}

program
  .name('git-release-ai')
  .description('AI-powered GitHub release automation tool')
  .version(pkg.version)
  .action(run)
  .parse(process.argv);
