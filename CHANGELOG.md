# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-XX-XX

### Added

- Initial release
- Multi-tour support with unique tour keys
- Three mask shapes: `circle`, `rectangle`, `rounded-rectangle`
- Portal-based rendering for better modal/bottom-sheet compatibility
- Event system for tour lifecycle (`start`, `stop`, `stepChange`)
- Custom tooltip component support
- Custom step number badge support
- `useTourControl` hook for tour-specific control with callbacks
- `useIsTourActive` hook to check if any tour is active
- `useActiveTour` hook to get the current tour key
- `walkthroughable` HOC for making components highlightable
- Full TypeScript support
- Backwards compatibility with `copilot` prop name
- Configurable animations with easing functions
- Auto-scroll to steps in ScrollView
- Android back button handling
- Cross-platform support (iOS & Android)

### Features

- **Multi-tour Support**: Run multiple independent tours in your app
- **Mask Shapes**: Circle for FABs, rectangle, or rounded-rectangle
- **Event System**: Subscribe to `start`, `stop`, `stepChange` events
- **Portal Rendering**: Optional @gorhom/portal integration
- **TypeScript First**: Full type definitions included
