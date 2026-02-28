// Ambient CSS Module type declaration for Jest (mirrors src/client/vite-env.d.ts)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
