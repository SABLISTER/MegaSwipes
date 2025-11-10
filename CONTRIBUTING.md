# Contributing to MegaSwipes

Thank you for your interest in contributing to MegaSwipes! We appreciate your effort and want to make the contribution process as smooth as possible.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Process](#development-process)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the Repository**: Click the 'Fork' button at the top right of the repository page
2. **Clone Your Fork**: 
   ```bash
   git clone https://github.com/YOUR_USERNAME/MegaSwipes.git
   cd MegaSwipes
   ```
3. **Add Upstream Remote**:
   ```bash
   git remote add upstream https://github.com/SABLISTER/MegaSwipes.git
   ```
4. **Install Dependencies**: Follow the setup instructions in the README.md

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear Title**: Use a descriptive title
- **Description**: Detailed description of the issue
- **Steps to Reproduce**: Step-by-step instructions
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Environment**: OS, browser, version numbers, etc.
- **Screenshots**: If applicable
- **Code Samples**: Minimal reproducible example

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear Title**: Use a descriptive title
- **Description**: Detailed description of the suggested enhancement
- **Use Case**: Why this enhancement would be useful
- **Examples**: Code examples or mockups if applicable
- **Alternatives**: Any alternative solutions you've considered

### Code Contributions

1. **Find or Create an Issue**: Check existing issues or create a new one describing what you plan to work on
2. **Discuss**: Comment on the issue to ensure your approach aligns with the project goals
3. **Implement**: Make your changes following our guidelines
4. **Test**: Ensure all tests pass and add new tests for your changes
5. **Submit**: Open a pull request

## Development Process

### Setting Up Development Environment

```bash
# Install dependencies
# [Add your specific commands]

# Run in development mode
# [Add your specific commands]

# Run tests
# [Add your specific commands]

# Run linter
# [Add your specific commands]
```

### Branch Naming Convention

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/add-pinch-gesture`)
- `fix/` - Bug fixes (e.g., `fix/swipe-threshold-bug`)
- `docs/` - Documentation changes (e.g., `docs/update-api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/optimize-event-handlers`)
- `test/` - Test additions or modifications (e.g., `test/add-swipe-tests`)

### Making Changes

1. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**: Write clear, concise, and well-documented code

3. **Follow Style Guidelines**: Ensure your code matches the project's coding style

4. **Write Tests**: Add or update tests to cover your changes

5. **Run Tests**: Make sure all tests pass
   ```bash
   # [Add test command]
   ```

6. **Update Documentation**: Update relevant documentation if needed

## Style Guidelines

### Code Style

- Follow the existing code style in the project
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Avoid deep nesting

### Documentation Style

- Use clear, concise language
- Include code examples where appropriate
- Keep formatting consistent
- Update all relevant documentation sections

### Testing Guidelines

- Write unit tests for new features
- Ensure tests are independent and repeatable
- Use descriptive test names
- Aim for good code coverage
- Test edge cases and error conditions

## Commit Messages

Write clear and meaningful commit messages following these guidelines:

### Format

```
<type>: <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat: add pinch gesture support

Implemented pinch gesture detection with configurable sensitivity.
Added tests and documentation for the new feature.

Closes #123
```

```
fix: correct swipe threshold calculation

Fixed a bug where the swipe threshold was not being calculated
correctly on high-DPI displays.

Fixes #456
```

## Pull Request Process

1. **Update Your Branch**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push Your Changes**:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**:
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template

4. **PR Requirements**:
   - Clear title and description
   - Reference related issues
   - All tests passing
   - Code reviewed by maintainers
   - Documentation updated if needed
   - No merge conflicts

5. **Address Feedback**:
   - Respond to review comments
   - Make requested changes
   - Push updates to your branch

6. **Merge**:
   - Once approved, a maintainer will merge your PR
   - Your contribution will be credited

## Review Process

- PRs are typically reviewed within 2-3 business days
- Maintainers may request changes or ask questions
- Be patient and respectful during the review process
- Feel free to ask for clarification if needed

## Recognition

Contributors will be recognized in:
- The project's README
- Release notes
- GitHub's contributor graph

## Questions?

If you have questions about contributing, feel free to:
- Open an issue with the `question` label
- Start a discussion in GitHub Discussions
- Contact the maintainers

Thank you for contributing to MegaSwipes! 🎉
