// The one file that imports Motion, re-exporting only what's used, so an animation's dynamic
// `import('./motionLib')` loads just that (the package's own namespace kept all of it: 66 kB
// gzipped). A new Motion function an animation needs is added here.
export { animate } from 'motion';
