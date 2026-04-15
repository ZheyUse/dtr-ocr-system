// Type declarations for importing CSS and static assets in TypeScript
// Prevents "Cannot find module" errors for side-effect imports like `import './index.css'`.

declare module '*.css';
declare module '*.module.css';
declare module '*.scss';
declare module '*.module.scss';
declare module '*.sass';
declare module '*.less';

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.svg';
