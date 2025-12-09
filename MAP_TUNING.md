# Map tuning

Adjust the clustering, layout, and animation feel in `src/mapConstants.js`:

- `PIN_DIAMETER`, `CLUSTER_COLLISION_PADDING`: screen-space hit size for collision-based clustering.
- `HONEYCOMB_MAX`, `LARGE_CLUSTER_SAMPLE`: how many pins render in honeycomb clusters and how many surround a `+`.
- `CLICK_TO_SPLIT_DELTA`: zoom increment when the user taps a cluster or `+`.
- `ANIMATION_TIMING`: ms for enter/exit/move/label fades.
- `LABEL_*` values: padding, gap, and max label width for decluttering. To pull labels closer, lower `LABEL_HORIZONTAL_GAP` / `LABEL_VERTICAL_GAP` and `LABEL_MARGIN` (but keep enough to avoid icon overlap).

Interaction zoom targets live in `src/MapView.jsx` (`MAP_CLICK_TARGET_ZOOM`) if deeper zoom-on-click is desired.
