# create-vue-cli-analysis

create vue 最新脚手架 源码分析 (基于版本 3.10.2)

## debug

```bash
cd create-vue-3.10.2
pnpm install
```

1. 在最外层的 index.ts 文件中的 init() 函数打个断点

2. 在 vscode 中启动一个 JavaScript Debug Terminal -> 然后执行

```bash
npx tsx index.ts
```
