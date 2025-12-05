# Contributing to react-native-tour-pilot

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/anthropics/react-native-tour-pilot.git
   cd react-native-tour-pilot
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Build the library**

   ```bash
   yarn build
   ```

4. **Run TypeScript checks**

   ```bash
   yarn typescript
   ```

5. **Run linting**

   ```bash
   yarn lint
   ```

## Project Structure

```
react-native-tour-pilot/
├── src/
│   ├── index.ts           # Main entry point, exports
│   ├── types.ts           # TypeScript type definitions
│   ├── TourProvider.tsx   # Main provider component
│   ├── TourStep.tsx       # Step wrapper component
│   ├── useTourControl.ts  # Control hooks
│   └── eventEmitter.ts    # Event system
├── lib/                   # Built output (generated)
├── example/               # Example app (optional)
└── ...config files
```

## Making Changes

### Code Style

- We use ESLint and Prettier for code formatting
- Run `yarn lint` before committing
- Follow existing code patterns and naming conventions

### TypeScript

- All code must be written in TypeScript
- Ensure proper type definitions for all public APIs
- Avoid using `any` when possible

### Commits

- Use clear, descriptive commit messages
- Follow conventional commits format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `chore:` for maintenance tasks
  - `refactor:` for code refactoring

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes
6. Push to your fork
7. Open a Pull Request

### PR Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots for UI changes
- Update documentation if needed
- Add tests for new functionality

## Reporting Issues

When reporting issues, please include:

- React Native version
- Library version
- Platform (iOS/Android)
- Steps to reproduce
- Expected vs actual behavior
- Code samples if applicable

## Feature Requests

We welcome feature requests! Please:

- Check if the feature already exists or is planned
- Describe the use case clearly
- Explain why this would benefit other users

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
