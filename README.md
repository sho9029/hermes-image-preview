# Image Preview for Hermes Desktop

A desktop plugin for Hermes that displays inline previews of images submitted for image analysis and provides an interactive full-screen viewer with zoom and pan capabilities.

## Features

- **Inline previews**: Renders input images directly inside active and completed image-analysis tool rows.
- **Broad source support**: Handles remote URLs, base64 data URIs, and local file paths without cropping or distortion.
- **Full-screen inspection**: Opens an overlay viewer with smooth drag-to-pan and 25%–800% zoom controls.
- **Zero telemetry**: Operates entirely client-side with no tracking, external analytics, or background requests.

## Installation

<a href="hermes://plugin/install?repo=sho9029/hermes-image-preview&enable=1">Install in Hermes</a>

Alternatively, navigate to **Settings → Plugins → Install from Git** and enter:

```text
sho9029/hermes-image-preview
```

Select the **Desktop** component and enable the plugin when prompted.

### Manual Installation

Copy `plugin.js` to the designated plugin directory:

```text
$HERMES_HOME/desktop-plugins/hermes-image-preview/plugin.js
```

Hermes Desktop automatically detects and loads the plugin. If it does not appear, invoke **Reload desktop plugins** from the command palette.

## Usage

1. Submit an image to Hermes for analysis.
2. Expand the resulting **Analyzed image** tool row to view the preview.
3. Click the preview image to open the full-screen viewer.

### Viewer Controls

| Action | Control |
| :--- | :--- |
| Zoom in / out | Mouse wheel, `+` / `-`, or toolbar buttons |
| Reset zoom | `0` or **Reset** button |
| Pan viewport | Drag while zoomed (>100%) |
| Close viewer | Click backdrop, press `Escape`, or click `×` |

## Privacy and Scope

The plugin is strictly scoped to `vision_analyze` tool rows. It inspects only the arguments necessary to resolve the image source and does not access conversation logs, user profiles, or other tool executions. Local images are read solely through the Hermes Desktop local-file bridge upon expanding the tool row.

## Compatibility

Tested on Hermes Desktop `v0.21.1 (+753)` on Windows.

Because the plugin attaches to rendered tool rows via internal component instances, future updates to the Hermes UI layout may require compatibility updates.

## Development

The plugin is distributed as standard, unbundled ESM:

```powershell
node --check plugin.js
```

Changes saved to `plugin.js` are hot-reloaded automatically by Hermes Desktop.

## License

[MIT](LICENSE)
