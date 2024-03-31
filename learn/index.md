## 记录学习 create-vue 脚手架学习到的内容

### 主函数 index.js 中学习到的东西

1. 判断控制台是否支持渐变字

```JavaScript
process.stdout.isTTY && process.stdout.getColorDepth() > 8
```

2. 可以使用 node 中 util 提供的 `parseArgs` 解析命令行的参数

3. 使用 `prompts` 进行用户选项的询问

4. 在存在相同名称的文件夹之后，使用递归处理删除，即 overwrite。如果遇到文件，直接删除，如果遇到文件夹，递归进去，将其中的文件都删除后，再删除文件夹。

```JavaScript
// 将一个文件夹删除
function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return
  }

  // 递归删除一个文件夹中所有内容，如果遇到文件夹，递归进去把里面文件删除了
  postOrderDirectoryTraverse(
    dir,
    // 删除文件夹调用的方法
    (dir) => fs.rmdirSync(dir),
    // 删除文件调用的方法
    (file) => fs.unlinkSync(file)
  )
}

export function postOrderDirectoryTraverse(dir, dirCallback, fileCallback) {
  for (const filename of fs.readdirSync(dir)) {
    if (filename === '.git') {
      continue
    }
    const fullpath = path.resolve(dir, filename)
    if (fs.lstatSync(fullpath).isDirectory()) {
      // 如果本身是一个文件，递归进去将其中的文件都删除掉
      postOrderDirectoryTraverse(fullpath, dirCallback, fileCallback)
      dirCallback(fullpath)
      continue
    }
    fileCallback(fullpath)
  }
}
```

5. 将文件模版写到文件夹中调用的方法 - `renderTemplate` <br />
   主要是在做各种配置文件的合并，和各种文件的处理

```JavaScript
/**
 * Renders a template folder/file to the file system,
 * by recursively copying all files under the `src` directory,
 * with the following exception:
 *   - `_filename` should be renamed to `.filename`
 *   - Fields in `package.json` should be recursively merged
 * @param {string} src source filename to copy
 * @param {string} dest destination filename of the copy operation
 */
// src: 模版文件的地址 dest：要写入的地址
function renderTemplate(src, dest, callbacks) {
  const stats = fs.statSync(src)

  // 如果是一个文件，递归往里面写
  if (stats.isDirectory()) {
    // skip node_module
    if (path.basename(src) === 'node_modules') {
      return
    }

    // if it's a directory, render its subdirectories and files recursively
    fs.mkdirSync(dest, { recursive: true })
    for (const file of fs.readdirSync(src)) {
      renderTemplate(path.resolve(src, file), path.resolve(dest, file), callbacks)
    }
    return
  }

  const filename = path.basename(src)

  // 合并 package.json
  if (filename === 'package.json' && fs.existsSync(dest)) {
    // merge instead of overwriting
    const existing = JSON.parse(fs.readFileSync(dest, 'utf8'))
    const newPackage = JSON.parse(fs.readFileSync(src, 'utf8'))
    const pkg = sortDependencies(deepMerge(existing, newPackage))
    fs.writeFileSync(dest, JSON.stringify(pkg, null, 2) + '\n')
    return
  }

  // 合并 extensions.json
  if (filename === 'extensions.json' && fs.existsSync(dest)) {
    // merge instead of overwriting
    const existing = JSON.parse(fs.readFileSync(dest, 'utf8'))
    const newExtensions = JSON.parse(fs.readFileSync(src, 'utf8'))
    const extensions = deepMerge(existing, newExtensions)
    fs.writeFileSync(dest, JSON.stringify(extensions, null, 2) + '\n')
    return
  }

  // 合并 settings.json
  if (filename === 'settings.json' && fs.existsSync(dest)) {
    // merge instead of overwriting
    const settings = JSON.parse(fs.readFileSync(dest, 'utf8'))
    const newSettings = JSON.parse(fs.readFileSync(src, 'utf8'))
    const extensions = deepMerge(settings, newSettings)
    fs.writeFileSync(dest, JSON.stringify(settings, null, 2) + '\n')
    return
  }

  // 如果是以_开头的，都命名为.
  if (filename.startsWith('_')) {
    // rename `_file` to `.file`
    dest = path.resolve(path.dirname(dest), filename.replace(/^_/, '.'))
  }

  // 处理 .gitignore 文件
  if (filename === '_gitignore' && fs.existsSync(dest)) {
    // append to existing .gitignore
    const existing = fs.readFileSync(dest, 'utf8')
    const newGitignore = fs.readFileSync(src, 'utf8')
    fs.writeFileSync(dest, existing + '\n' + newGitignore)
    return
  }

  // data file for EJS templates
  if (filename.endsWith('.data.mjs')) {
    // use dest path as key for the data store
    dest = dest.replace(/\.data\.mjs$/, '')

    // Add a callback to the array for late usage when template files are being processed
    callbacks.push(async (dataStore) => {
      const getData = (await import(pathToFileURL(src).toString())).default

      // Though current `getData` are all sync, we still retain the possibility of async
      dataStore[dest] = await getData({
        oldData: dataStore[dest] || {}
      })
    })

    return // skip copying the data file
  }

  fs.copyFileSync(src, dest)
}
```

6. 判断一个项目使用了什么样的包管理器

```JavaScript
  // Instructions:
  // Supported package managers: pnpm > yarn > bun > npm
  // 判断包管理器是啥
  const userAgent = process.env.npm_config_user_agent ?? ''
  const packageManager = /pnpm/.test(userAgent)
    ? 'pnpm'
    : /yarn/.test(userAgent)
      ? 'yarn'
      : /bun/.test(userAgent)
        ? 'bun'
        : 'npm'
```
