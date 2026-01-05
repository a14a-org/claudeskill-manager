# Contributing to Claude Skill Sync

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/claudeskill-manager.git`
3. Install dependencies: `yarn install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js 20.6+ (server requires `--env-file` flag)
- Node.js 18+ (CLI only)
- Yarn 1.x

### Running Locally

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Start the server (Terminal 1)
cp .env.example .env
yarn dev:server

# Run the CLI (Terminal 2)
yarn dev:cli
```

### Project Structure

```
packages/
├── core/      # Shared encryption & skill parsing logic
├── cli/       # Command-line interface
└── server/    # API server
```

## Making Changes

### Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic

### Commit Messages

Write clear, concise commit messages:

```
feat: add new sync conflict resolution
fix: handle empty skill files gracefully
docs: update API documentation
refactor: simplify encryption flow
```

Prefix types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Testing

```bash
# Run all tests
yarn test

# Run type checking
yarn typecheck

# Run linting
yarn lint
```

Please ensure all tests pass before submitting a pull request.

## Pull Request Process

1. **Update documentation** - If your change affects usage, update the README
2. **Test your changes** - Run `yarn test` and `yarn typecheck`
3. **Create a pull request** with a clear description of:
   - What the change does
   - Why the change is needed
   - How to test the change
4. **Wait for review** - A maintainer will review your PR

### PR Title Format

Use the same format as commit messages:

```
feat: add offline mode support
fix: resolve sync race condition
```

## Reporting Issues

### Bug Reports

Include:
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs

### Feature Requests

Include:
- Clear description of the feature
- Use case / why it's needed
- Possible implementation approach (optional)

## Security

If you discover a security vulnerability, please do NOT open a public issue. Instead, email the maintainers directly. See [SECURITY.md](SECURITY.md) for details.

## Questions?

Open a [discussion](https://github.com/a14a-org/claudeskill-manager/discussions) for questions or ideas that aren't bugs or feature requests.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
