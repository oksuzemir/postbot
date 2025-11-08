// Make this file a module to avoid global duplicate declarations in some setups
export {};

/// <reference types="@figma/plugin-typings" />

declare global {
  // 'var' reduces redeclare block-scoped conflicts across environments
  var __html__: string;
}
