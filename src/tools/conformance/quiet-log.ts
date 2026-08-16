/**
 * Import FIRST from the CLI entry point. The session logger reads
 * `LOG_LEVEL` when `shared/config` loads; the default is `debug`, which
 * drowns the verdict lines in every wire frame. The wire is still captured —
 * that is what the recorder is for. Set `LOG_LEVEL` explicitly to override.
 */
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
