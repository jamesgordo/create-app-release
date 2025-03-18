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

// Setup graceful exit handlers
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

// Display exit instructions
console.log(chalk.cyan('Press Ctrl+C or q to exit at any time'));

process.stdin.on('data', (key) => {
  // Ctrl+C or 'q' to exit
  if (key === '\u0003' || key.toLowerCase() === 'q') {
    console.log(chalk.yellow('\nExiting gracefully...'));
    process.exit(0);
  }
});

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
 * Get the latest release pull request
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object|null>} Latest release PR or null
 */
async function getLatestReleasePR(owner, repo) {
  try {
    const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });

    for await (const { data } of iterator) {
      // SemVer regex pattern: matches X.Y.Z with optional pre-release and build metadata
      const semverPattern =
        /\b(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?\b/;

      const recentReleasePR = data.find((pr) => semverPattern.test(pr.title));
      if (recentReleasePR) {
        return recentReleasePR;
      }
    }
    return null;
  } catch (error) {
    console.error(chalk.red('Failed to fetch latest release PR:', error.message));
    return null;
  }
}

/**
 * Extract PR numbers from release PR description
 * @param {string} description - PR description
 * @returns {Set<number>} Set of PR numbers
 */
function extractPRNumbersFromDescription(description) {
  if (!description) return new Set();

  // Match PR numbers in various formats like #123, (#123), or just plain 123 in PR lists
  const prMatches = description.match(/#\d+|\(#\d+\)|(?<=PR:?\s*)\d+/g) || [];

  return new Set(prMatches.map((match) => parseInt(match.replace(/[^0-9]/g, ''))));
}

/**
 * Fetch repositories the user has contributed to, including personal and organization repos
 * @returns {Promise<Array>} List of repositories
 */
async function fetchUserRepositories() {
  const spinner = ora('Fetching your repositories...').start();
  try {
    // Get authenticated user info
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const username = user.login;

    // Get user's repositories (both owned and contributed to)
    const repos = [];

    // Fetch user's own repositories
    const userReposIterator = octokit.paginate.iterator(
      octokit.rest.repos.listForAuthenticatedUser,
      {
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      }
    );

    for await (const { data: userRepos } of userReposIterator) {
      repos.push(
        ...userRepos.map((repo) => ({
          name: `${repo.owner.login}/${repo.name}`,
          fullName: `${repo.owner.login}/${repo.name}`,
          owner: repo.owner.login,
          repoName: repo.name,
          updatedAt: new Date(repo.updated_at),
          pushedAt: new Date(repo.pushed_at || repo.updated_at),
          isPersonal: repo.owner.login === username,
          activityScore: 0, // Will be calculated based on user activity
        }))
      );

      // Limit to 100 repositories to avoid excessive API calls
      if (repos.length >= 100) break;
    }

    // Get recent user activity for each repository (limited to top 15 to avoid API rate limits)
    const topRepos = repos.slice(0, 15);
    spinner.text = 'Analyzing your recent activity...';

    // Process repositories in parallel with rate limiting
    await Promise.all(
      topRepos.map(async (repo, index) => {
        // Add delay to avoid hitting rate limits
        await new Promise((resolve) => setTimeout(resolve, index * 100));

        try {
          // Check for user's recent commits
          const { data: commits } = await octokit.rest.repos
            .listCommits({
              owner: repo.owner,
              repo: repo.repoName,
              author: username,
              per_page: 100,
            })
            .catch(() => ({ data: [] }));

          // Check for user's recent PRs
          const { data: prs } = await octokit.rest.pulls
            .list({
              owner: repo.owner,
              repo: repo.repoName,
              state: 'all',
              per_page: 100,
            })
            .catch(() => ({ data: [] }));

          // Calculate activity score based on recency and count
          const now = new Date();
          let score = 0;

          // Add points for recent commits
          commits.forEach((commit) => {
            const daysAgo = (now - new Date(commit.commit.author.date)) / (1000 * 60 * 60 * 24);
            score += Math.max(30 - daysAgo, 0); // More points for more recent commits
          });

          // Add points for PRs authored or reviewed by user
          prs.forEach((pr) => {
            if (pr.user.login === username) {
              const daysAgo = (now - new Date(pr.updated_at)) / (1000 * 60 * 60 * 24);
              score += Math.max(20 - daysAgo, 0); // Points for authoring PRs
            }
          });

          // Update the repository's activity score
          repo.activityScore = score;
        } catch (error) {
          // Silently continue if we hit API limits or other issues
        }
      })
    );

    // Sort repositories by activity score first, then by pushed date
    repos.sort((a, b) => {
      if (a.activityScore !== b.activityScore) {
        return b.activityScore - a.activityScore; // Higher score first
      }
      return b.pushedAt - a.pushedAt; // Then by most recent push
    });

    spinner.succeed(`Found ${repos.length} repositories, sorted by your recent activity`);
    return repos;
  } catch (error) {
    spinner.fail('Failed to fetch repositories');
    console.error(chalk.red(`Error: ${error.message}`));
    return [];
  }
}

/**
 * Fetch closed pull requests from the repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseBranch - Base branch name
 * @returns {Promise<Array>} List of pull requests
 */
async function fetchPullRequests(owner, repo, baseBranch) {
  const spinner = ora('Fetching pull requests...').start();
  try {
    // Get the latest release PR first
    const latestReleasePR = await getLatestReleasePR(owner, repo);

    const includedPRNumbers = extractPRNumbersFromDescription(latestReleasePR?.body);
    const pulls = [];
    const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });

    for await (const { data } of iterator) {
      // Filter PRs that are merged after the last release, not included in it, and merged to the target branch
      const relevantPRs = data.filter((pr) => {
        // Skip PRs that aren't merged
        if (!pr.merged_at) return false;

        // Skip PRs that aren't targeting the specified branch
        if (pr.base && pr.base.ref !== baseBranch) return false;

        const isAfterLastRelease = latestReleasePR
          ? new Date(pr.merged_at) >= new Date(latestReleasePR.merged_at)
          : true;

        return (
          isAfterLastRelease &&
          !includedPRNumbers.has(`#${pr.number}`) &&
          pr.id !== latestReleasePR?.id
        );
      });
      pulls.push(...relevantPRs);
    }

    const excludedCount = includedPRNumbers.size;
    const message = latestReleasePR
      ? `Found ${pulls.length} new merged pull requests (excluding ${excludedCount} PRs from last release)`
      : `Found ${pulls.length} merged pull requests`;

    spinner.succeed(message);
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

1. Group the changes by type (e.g., Features, Bug Fixes, Improvements) and list them down in bullet points. 
  1.1 Make each type is an h3 header with a corresponding emoji prefix.
  1.2 For each type, make each bullet point concise and easy to read and understand for non-tech people.
  1.3 Don't link the bullet points to a pull requests
2. The last section should be a list of pull requests included in the release. Format: "#<number> - <title> by [@<author>](<authorUrl>) (<date>)".
3. Don't add Release Summary title/heading.

Pull Requests to summarize:
${JSON.stringify(prDetails, null, 2)}

Keep the summary concise, clear, and focused on the user impact. Use professional but easy-to-understand language.`;

    const model = program.opts().openaiModel || 'gpt-4o';
    const response = await openai.chat.completions.create({
      model,
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
  // Get command line options
  const options = program.opts();

  // Initialize GitHub token
  const { githubToken } = await initializeTokens();

  // Get OpenAI token from command line or fallback to configuration
  let openaiToken = options.openaiKey;
  if (!openaiToken) {
    const tokens = await initializeTokens();
    openaiToken = tokens.openaiToken;
  }

  // Initialize clients with tokens
  octokit = new Octokit({
    auth: githubToken,
  });

  openai = new OpenAI({
    apiKey: openaiToken,
    baseURL: options.openaiBaseUrl,
  });

  // Fetch repositories the user has contributed to
  const userRepos = await fetchUserRepositories();

  // Prepare repository choices
  const repoChoices =
    userRepos.length > 0
      ? userRepos.map((repo) => ({
          name: repo.fullName + (repo.isPersonal ? ' (personal)' : ''),
          value: { owner: repo.owner, repo: repo.repoName },
        }))
      : [];

  // Add option for manual entry
  repoChoices.push({ name: '-- Enter repository manually --', value: 'manual' });

  let repoInfo = { owner: '', repo: '' };
  const { repoSelection } = await inquirer.prompt([
    {
      type: 'list',
      name: 'repoSelection',
      message: 'Select a repository:',
      choices: repoChoices,
      pageSize: 5,
    },
  ]);

  // Handle manual repository entry
  if (repoSelection === 'manual') {
    const manualEntry = await inquirer.prompt([
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
    repoInfo = manualEntry;
  } else {
    repoInfo = repoSelection;
  }

  const { owner, repo } = repoInfo;

  const { sourceBranch, targetBranch } = await inquirer.prompt([
    {
      type: 'input',
      name: 'sourceBranch',
      message: 'Enter source branch name:',
      validate: (input) => input.length > 0,
    },
    {
      type: 'input',
      name: 'targetBranch',
      message: 'Enter target branch name:',
      validate: (input) => input.length > 0,
    },
  ]);

  // Get the latest release version for the repository
  let suggestedVersion = '1.0.0';
  try {
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 100,
    });

    if (releases && releases.length > 0) {
      // Extract version from tag_name (removing any 'v' prefix)
      const latestTag = releases[0].tag_name.replace(/^v/, '');
      const [major, minor, patch] = latestTag.split('.');
      suggestedVersion = `${major}.${minor}.${parseInt(patch) + 1}`;
    }
  } catch (error) {
    console.log(chalk.yellow(`Could not fetch latest release version: ${error.message}`));
  }

  const pulls = await fetchPullRequests(owner, repo, sourceBranch);

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

  const { version, confirm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: `Enter the version number for this release (suggested: ${suggestedVersion}):`,
      default: suggestedVersion,
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

const description = `AI-powered GitHub release automation tool

Options:
  --openai-key <key>        Set OpenAI API key directly (alternative to env/git config)
  --openai-model <model>    Set OpenAI model to use (default: "gpt-4")
                           Examples: gpt-4, gpt-3.5-turbo
  --openai-base-url <url>   Set custom OpenAI API base URL
                           Example: https://custom-openai-endpoint.com/v1

Environment Variables:
  GITHUB_TOKEN              GitHub personal access token
  OPENAI_API_KEY            OpenAI API key (if not using --openai-key)

Git Config:
  github.token              GitHub token in git config
  openai.token              OpenAI token in git config (if not using --openai-key)
`;

program
  .name('create-app-release')
  .description(description)
  .version(pkg.version)
  .option('--openai-base-url <url>', 'Set custom OpenAI API base URL')
  .option('--openai-model <model>', 'Set OpenAI model to use (default: "gpt-4")')
  .option('--openai-key <key>', 'Set OpenAI API key directly (alternative to env/git config)')
  .action(run)
  .parse(process.argv);
