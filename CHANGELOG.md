# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-03-18

### Added

- Auto suggest repositories based on recent activities
- Added filter for listed pull requests for easy tracking
- Dynamic release version suggestion based on previous releases
- Added suggestion for source and target branches

### Changed

- Updated release summary generation to exclude heading

## [1.1.0] - 2025-02-12

### Added

- Added support for multiple LLM providers:
  - OpenAI models (default)
  - Deepseek models
  - QwenAI models
  - Local LLM deployments
- New command-line options for LLM configuration:
  - `--openai-key`: Set API key directly
  - `--openai-model`: Choose model (e.g., gpt-4o, deepseek-r1, qwen2.5)
  - `--openai-base-url`: Set custom API base URL for different providers
- Enhanced help information with detailed options and provider-specific examples

## [1.0.2] - 2025-02-09

### Changed

- Added smart filtering to exclude PRs already included in previous releases

## [1.0.1] - 2025-02-07

### Changed

- Enhanced pull request fetching to retrieve all closed pull requests using pagination

## [1.0.0] - 2025-02-06

### Added

- Initial release of `create-app-release`
- AI-powered release notes generation using GPT-4
- Interactive pull request selection
- GitHub token management through git config
- OpenAI API key management through git config
- Automatic categorization of changes (Features, Bug Fixes, Improvements)
- Professional markdown formatting for release notes
- Support for environment variables (`GITHUB_TOKEN` and `OPENAI_API_KEY`)
- Command-line interface using Commander.js
- Progress indicators and colorful console output
- Error handling and user-friendly messages
- Support for Node.js >= 14.0.0

### Dependencies

- @octokit/rest - GitHub API client
- openai - OpenAI API client
- commander - Command-line interface
- inquirer - Interactive prompts
- chalk - Terminal styling
- ora - Terminal spinners
- dotenv - Environment variable management

[1.2.0]: https://github.com/jamesgordo/create-app-release/releases/tag/v1.2.0
[1.1.0]: https://github.com/jamesgordo/create-app-release/releases/tag/v1.1.0
[1.0.0]: https://github.com/jamesgordo/create-app-release/releases/tag/v1.0.0
