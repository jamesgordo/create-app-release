# create-app-release

[![NPM Version](https://img.shields.io/npm/v/create-app-release.svg)](https://www.npmjs.com/package/create-app-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An AI-powered GitHub release automation tool that helps you create release pull requests with automatically generated summaries using various LLM providers. The tool intelligently groups your changes and creates professional release notes, making the release process smoother and more efficient.

## Features

- 🤖 AI-powered release notes generation.
- 🔄 **Flexible LLM Support**: Seamlessly switch between OpenAI, Google Gemini, and any OpenAI-compatible API.
  - **OpenAI**: `gpt-4o`, `gpt-3.5-turbo`.
  - **Google Gemini**: `gemini-pro` via API key or local `gemini-cli`.
  - **OpenAI-Compatible**: Supports providers like Deepseek, QwenAI, or local LLMs via a custom base URL.
- 📦 Zero configuration - works right out of the box.
- 🔑 Secure token management through `git config`.
- 🎯 Interactive pull request selection.
- ✨ Professional markdown formatting.
- 📝 Smart categorization of changes.
- 🌟 User-friendly CLI interface.

## Prerequisites

- Node.js 14 or higher
- Git installed and configured
- A GitHub account with repository access
- An account with an AI provider (e.g., OpenAI, Google Gemini) if using an API key.

## Usage

Run the tool directly using npx:

```bash
npx create-app-release
```

On the first run, the tool will guide you through setting up the necessary tokens and configurations.

### Token Setup

You will need a **GitHub Token** and an API key for your chosen AI provider.

1.  **GitHub Token** - Create at [GitHub Token Settings](https://github.com/settings/tokens/new)
    - Required scope: `repo`
    - Stored in git config as `github.token`

2.  **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
    - Required if using the `openai` provider.
    - Stored in git config as `openai.token`

3.  **Gemini API Key** - Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
    - Required if using the `gemini` provider.
    - Stored in git config as `gemini.token`

### Command-Line Options

#### General Options

`--ai-provider <provider>`
: Select the AI provider.
: **Options**: `openai`, `gemini`, `gemini-cli`.
: If not specified, you will be prompted to choose.

---

#### OpenAI Provider (`--ai-provider openai`)

`--openai-key <key>`
: Set your OpenAI API key directly.

`--openai-model <model>`
: Choose the OpenAI model (default: `"gpt-4o"`).

`--openai-base-url <url>`
: Set a custom base URL for OpenAI-compatible APIs (e.g., Deepseek, QwenAI, local LLMs).
: **Examples**:
: - `https://api.deepseek.com/v1`
: - `https://api.qwen.ai/v1`
: - `http://localhost:8000/v1`

---

#### Gemini Provider (`--ai-provider gemini`)

`--gemini-key <key>`
: Set your Gemini API key directly.

`--gemini-model <model>`
: Set the Gemini model to use (default: `"gemini-pro"`).

---

#### Gemini CLI Provider (`--ai-provider gemini-cli`)

This option uses a local `gemini` command-line tool, which must be installed and available in your system's `PATH`. The script will execute the `gemini` command, passing the prompt to its standard input. No API key is required for this provider option.

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
