# create-app-release

An AI-powered GitHub release automation tool that helps you create release pull requests with automatically generated summaries using OpenAI's GPT-4 model. The tool intelligently groups your changes and creates professional release notes, making the release process smoother and more efficient.

## Features

- 🤖 AI-powered release notes generation using GPT-4
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
