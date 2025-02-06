#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { Octokit } from '@octokit/rest';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { createRequire } from 'module';

// Initialize utilities
const exec = promisify(execCallback);
const require = createRequire(import.meta.url);

// Load environment variables
config();

// Initialize CLI program
const program = new Command();
const pkg = require('../package.json');

/**
 * Get token from git config
 * @param {string} key - Git config key
 * @returns {Promise<string|null>} Token value or null if not found
 */
async function getGitConfigToken(key) {
  try {
    const { stdout } = await exec(`git config --global ${key}`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Configure and get API token with support for environment variables, git config, and user input
 * @param {Object} config - Token configuration object
 * @param {string} config.envKey - Environment variable key
 * @param {string} config.gitKey - Git config key
 * @param {string} config.name - Service name (e.g., 'GitHub', 'OpenAI')
 * @param {string} config.createUrl - URL where users can create new tokens
 * @param {string} [config.additionalInfo] - Additional information to display
 * @returns {Promise<string>} The configured token
 */
async function configureToken({ envKey, gitKey, name, createUrl, additionalInfo = '' }) {
  const token = process.env[envKey] || (await getGitConfigToken(gitKey));

  if (token) return token;

  console.log(
    chalk.yellow(`\nNo ${name} token found. Let's set one up.\n`) +
      chalk.cyan(`Create a new token at: ${createUrl}`)
  );

  if (additionalInfo) {
    console.log(chalk.cyan(additionalInfo));
  }

  const { newToken } = await inquirer.prompt([
    {
      type: 'password',
      name: 'newToken',
      message: `Enter your ${name} token:`,
      validate: (input) => input.length > 0 || 'Token is required',
    },
  ]);

  try {
    await exec(`git config --global ${gitKey} "${newToken}"`);
    console.log(chalk.green(`${name} token saved successfully!`));
    return newToken;
  } catch (error) {
    console.error(chalk.red(`Failed to save ${name} token:`), error.message);
    process.exit(1);
  }
}

// Initialize API clients
let octokit;
let openai;

/**
 * Initialize GitHub and OpenAI tokens
 * @returns {Promise<Object>} Object containing both tokens
 */
async function initializeTokens() {
  const githubToken = await configureToken({
    envKey: 'GITHUB_TOKEN',
    gitKey: 'github.token',
    name: 'GitHub',
    createUrl: 'https://github.com/settings/tokens/new',
    additionalInfo: "Make sure to enable the 'repo' scope.",
  });

  const openaiToken = await configureToken({
    envKey: 'OPENAI_API_KEY',
    gitKey: 'openai.token',
    name: 'OpenAI',
    createUrl: 'https://platform.openai.com/api-keys',
  });

  return { githubToken, openaiToken };
}

/**
 * Fetch closed pull requests from the repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Array>} List of pull requests
 */
async function fetchPullRequests(owner, repo) {
  const spinner = ora('Fetching pull requests...').start();
  try {
    const { data: pulls } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
    });
    spinner.succeed(`Found ${pulls.length} pull requests`);
    return pulls;
  } catch (error) {
    spinner.fail('Failed to fetch pull requests');
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Generate an AI-powered release summary from selected pull requests
 * @param {Array} selectedPRs - List of selected pull requests
 * @returns {Promise<string>} Generated release summary
 */
async function generateSummary(selectedPRs) {
  const spinner = ora('Generating release summary...').start();
  try {
    const prDetails = selectedPRs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      authorUrl: `https://github.com/${pr.user.login}`,
      date: new Date(pr.created_at).toLocaleDateString(),
      url: pr.html_url,
    }));

    const prompt = `Create a release summary for the following pull requests. The summary should have two parts:

1. Add Release Summary as H1 header
2. Group the changes by type (e.g., Features, Bug Fixes, Improvements) and list them down in bullet points. 
  2.1 Make each type is an h3 header with a corresponding emoji prefix.
  2.2 For each type, make each bullet point concise and easy to read and understand for non-tech people.
  2.3 Don't link the bullet points to a pull requests
3. The last section should be a list of pull requests included in the release. Format: "#<number> - <title> by [@<author>](<authorUrl>) (<date>)".

Pull Requests to summarize:
${JSON.stringify(prDetails, null, 2)}

Keep the summary concise, clear, and focused on the user impact. Use professional but easy-to-understand language.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    // Validate response structure
    if (!response?.choices?.length || !response.choices[0]?.message?.content) {
      throw new Error(
        'Invalid API response structure. Expected response.choices[0].message.content'
      );
    }

    spinner.succeed('Summary generated successfully');
    return response.choices[0].message.content;
  } catch (error) {
    spinner.fail('Failed to generate summary');

    // Handle specific API response errors
    if (error.message.includes('Invalid API response')) {
      console.error(
        chalk.red('Error: The AI service returned an unexpected response format.\n') +
          chalk.yellow('This might be due to:') +
          '\n- Service temporarily unavailable' +
          '\n- Rate limiting' +
          '\n- Model configuration issues\n' +
          chalk.cyan('Please try again in a few moments.')
      );
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }

    // Provide fallback option
    const { useFallback } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useFallback',
        message: 'Would you like to use a simple list format instead?',
        default: true,
      },
    ]);

    if (useFallback) {
      return selectedPRs
        .map((pr) => {
          const date = new Date(pr.created_at).toLocaleDateString();
          return `#${pr.number} - ${pr.title} (by [@${pr.user.login}](https://github.com/${pr.user.login}) on ${date})`;
        })
        .join('\n');
    }

    process.exit(1);
  }
}

/**
 * Create a release pull request with the generated summary
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} summary - Generated release summary
 * @param {Array} selectedPRs - List of selected pull requests
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} version - Release version
 * @returns {Promise<Object>} Created pull request data
 */
async function createReleasePR(
  owner,
  repo,
  summary,
  selectedPRs,
  sourceBranch,
  targetBranch,
  version
) {
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
      draft: true,
    });

    spinner.succeed(`Release PR #${pr.number} created successfully`);
    return pr;
  } catch (error) {
    spinner.fail('Failed to create release PR');
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

async function run() {
  // Initialize tokens sequentially
  const { githubToken, openaiToken } = await initializeTokens();

  // Initialize clients with tokens
  octokit = new Octokit({
    auth: githubToken,
  });

  openai = new OpenAI({
    apiKey: openaiToken,
  });

  const { owner, repo } = await inquirer.prompt([
    {
      type: 'input',
      name: 'owner',
      message: 'Enter repository owner:',
      validate: (input) => input.length > 0,
    },
    {
      type: 'input',
      name: 'repo',
      message: 'Enter repository name:',
      validate: (input) => input.length > 0,
    },
  ]);

  const pulls = await fetchPullRequests(owner, repo);

  const { selectedPRs } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPRs',
      message: 'Select pull requests to include in the release:',
      choices: pulls.map((pr) => ({
        name: `#${pr.number} - ${pr.title}`,
        value: pr,
      })),
      validate: (input) => input.length > 0,
    },
  ]);

  const { summaryType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'summaryType',
      message: 'How would you like to summarize the pull requests?',
      choices: [
        { name: 'Use AI to generate a summary', value: 'ai' },
        { name: 'Simply list the selected pull requests', value: 'list' },
      ],
    },
  ]);

  let summary;
  if (summaryType === 'ai') {
    summary = await generateSummary(selectedPRs);
  } else {
    summary = selectedPRs
      .map((pr) => {
        const date = new Date(pr.created_at).toLocaleDateString();
        return `#${pr.number} - ${pr.title} (by [@${pr.user.login}](https://github.com/${pr.user.login}) on ${date})`;
      })
      .join('\n');
  }

  console.log(chalk.cyan('\nSummary:'));
  console.log(summary);

  const { version, confirm, sourceBranch, targetBranch } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: 'Enter the version number for this release (e.g., 1.2.3):',
      validate: (input) => {
        // Validate semantic versioning format (x.y.z)
        const semverRegex = /^\d+\.\d+\.\d+$/;
        if (!semverRegex.test(input)) {
          return 'Please enter a valid version number in the format x.y.z (e.g., 1.2.3)';
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Would you like to create a release PR with this summary?',
    },
    {
      type: 'input',
      name: 'sourceBranch',
      message: 'Enter source branch name:',
      when: (answers) => answers.confirm,
      validate: (input) => input.length > 0,
    },
    {
      type: 'input',
      name: 'targetBranch',
      message: 'Enter target branch name:',
      when: (answers) => answers.confirm,
      validate: (input) => input.length > 0,
    },
  ]);

  if (confirm) {
    const pr = await createReleasePR(
      owner,
      repo,
      summary,
      selectedPRs,
      sourceBranch,
      targetBranch,
      version
    );
    console.log(chalk.green('\nSuccess! Release PR created:'), pr.html_url);
  }
}

program
  .name('git-release-ai')
  .description('AI-powered GitHub release automation tool')
  .version(pkg.version)
  .action(run)
  .parse(process.argv);
