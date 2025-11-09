// Make this file a module to avoid global duplicate declarations in some setups
export {};

/// <reference types="@figma/plugin-typings" />

declare global {
  // 'var' reduces redeclare block-scoped conflicts across environments
  var __html__: string;
}

// allow importing .html files as strings when bundling (esbuild/webpack)
declare module '*.html' {
  const value: string;
  export default value;
}

declare module '*.html' {
  const content: string;
  export default content;
}