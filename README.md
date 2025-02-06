# create-app-release

An AI-powered GitHub release automation tool that helps you create release pull requests with automatically generated summaries using OpenAI's GPT model.

## Features

- Fetch recent closed pull requests from your GitHub repository
- Interactive selection of pull requests to include in the release
- AI-powered summary generation that groups related changes
- Automatic creation of draft release pull requests
- Professional markdown formatting for release notes
- User-friendly command-line interface

## Prerequisites

- Node.js (v14 or higher)
- GitHub Personal Access Token with repo permissions
- OpenAI API Key

## Installation

```bash
npm install -g create-app-release
```

## Setup

1. Create a `.env` file in your project root with the following variables:

```env
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
```

## Usage

```bash
git-release-ai
```

The tool will guide you through the following steps:

1. Enter the repository owner and name
2. Select pull requests to include in the release
3. Review the AI-generated summary
4. Specify source and target branches
5. Create a draft release pull request

## Dependencies

- @octokit/rest - GitHub API client
- openai - OpenAI API client
- commander - Command-line interface
- inquirer - Interactive prompts
- chalk - Terminal styling
- ora - Terminal spinners
- dotenv - Environment variable management

## License

MIT
