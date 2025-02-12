# create-app-release

[![NPM Version](https://img.shields.io/npm/v/create-app-release.svg)](https://www.npmjs.com/package/create-app-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An AI-powered GitHub release automation tool that helps you create release pull requests with automatically generated summaries using various LLM providers. The tool intelligently groups your changes and creates professional release notes, making the release process smoother and more efficient.

## Features

- 🤖 AI-powered release notes generation using GPT-4
- 🔄 Flexible LLM support:
  - OpenAI models (GPT-4o, GPT-3.5-turbo)
  - Deepseek models
  - QwenAI models
  - Local LLM deployments
- 📦 Zero configuration - works right out of the box
- 🔑 Secure token management through git config
- 🎯 Interactive pull request selection
- ✨ Professional markdown formatting
- 📝 Smart categorization of changes
- 🌟 User-friendly CLI interface

## Prerequisites

- Node.js 14 or higher
- Git installed and configured
- GitHub account with repository access
- OpenAI account (for GPT-4 access)

## Usage

Run the tool directly using npx:

```bash
npx create-app-release
```

On first run, the tool will guide you through:

1. Setting up your GitHub token (stored in git config)
2. Configuring your OpenAI API key (stored in git config)
3. Selecting pull requests for the release
4. Reviewing the AI-generated summary
5. Creating the release pull request

### Token Setup

You'll need two tokens to use this tool:

1. **GitHub Token** - Create at [GitHub Token Settings](https://github.com/settings/tokens/new)

   - Required scope: `repo`
   - Will be stored in git config as `github.token`

2. **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Will be stored in git config as `openai.token`

### Command-Line Options

Customize the tool's behavior using these command-line options:

```bash
# Set OpenAI API key directly (alternative to env/git config)
--openai-key <key>

# Choose OpenAI model (default: "gpt-4o")
--openai-model <model>
# Examples: gpt-4o, gpt-3.5-turbo, deepseek-r1, qwen2.5

# Set custom OpenAI API base URL
--openai-base-url <url>
# Examples:
# - Deepseek: https://api.deepseek.com/v1
# - QwenAI: https://api.qwen.ai/v1
# - Local: http://localhost:8000/v1
# - Custom: https://custom-openai-endpoint.com/v1

# Full example with different providers:

# Using Deepseek
npx create-app-release --openai-base-url https://api.deepseek.com/v1 --openai-key your_deepseek_key --openai-model deepseek-chat

# Using QwenAI
npx create-app-release --openai-base-url https://api.qwen.ai/v1 --openai-key your_qwen_key --openai-model qwen-14b-chat

# Using Local LLM
npx create-app-release --openai-base-url http://localhost:8000/v1 --openai-model local-model
```

### Environment Variables (Optional)

Tokens can also be provided via environment variables:

```bash
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
```

## Example Output

The tool generates professional release notes in this format:

```markdown
### 🚀 Features

- Enhanced user authentication system
- New dashboard analytics

### 🐛 Bug Fixes

- Fixed memory leak in background tasks
- Resolved login issues on Safari

### 🔧 Improvements

- Optimized database queries
- Updated dependencies

### Pull Requests

#123 - Add user authentication by [@username](https://github.com/username) (2024-02-01)
#124 - Fix memory leak by [@dev](https://github.com/dev) (2024-02-02)
```

## License

MIT

## Author

[James Gordo](https://github.com/jamesgordo)
