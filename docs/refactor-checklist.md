# Refactor Checklist

- [x] Fix existing lint failures and format drift.
- [x] Move shared app state types out of UI components.
- [x] Centralize map constants, tile URLs, source IDs, layer IDs, default view, and DEM limits.
- [x] Centralize tile/projection coordinate helpers.
- [x] Extract MapLibre layer setup and basemap visibility handling.
- [x] Extract peak and parent marker lifecycle handling.
- [x] Extract pure prominence transition decisions from the React effect.
- [x] Extract URL query parsing and syncing from the map component.
- [x] Split elevation overlay rendering/detection into a dedicated hook.
- [ ] Split island detection from canvas rendering more deeply.
- [ ] Add focused unit tests for projection helpers, island detection, and prominence transitions.
- [ ] Consider code splitting or manual chunks for the large MapLibre bundle.
