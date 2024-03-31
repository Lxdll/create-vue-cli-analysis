#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import * as fs from 'node:fs'
import * as path from 'node:path'

import { parseArgs } from 'node:util'

import prompts from 'prompts'
import { red, green, bold } from 'kolorist'

import ejs from 'ejs'

import * as banners from './utils/banners'

import renderTemplate from './utils/renderTemplate'
import { postOrderDirectoryTraverse, preOrderDirectoryTraverse } from './utils/directoryTraverse'
import generateReadme from './utils/generateReadme'
import getCommand from './utils/getCommand'
import getLanguage from './utils/getLanguage'
import renderEslint from './utils/renderEslint'

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(projectName)
}

function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

/**
 * 判断一个文件名是否存在，是否可以跳过是否要覆盖的提问
 * @param dir 文件名称
 * @returns boolean
 */
function canSkipEmptying(dir: string) {
  // 该文件名不存在，可以跳过
  if (!fs.existsSync(dir)) {
    return true
  }

  const files = fs.readdirSync(dir)
  // 如果文件夹中没有文件，可以跳过
  if (files.length === 0) {
    return true
  }
  // 如果文件夹中只有一个文件，并且是 .git 文件时，可以跳过
  if (files.length === 1 && files[0] === '.git') {
    return true
  }

  return false
}

// 将一个文件夹删除
function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return
  }

  // 递归删除一个文件夹中所有内容，如果遇到文件夹，递归进去把里面文件删除了
  postOrderDirectoryTraverse(
    dir,
    (dir) => fs.rmdirSync(dir),
    (file) => fs.unlinkSync(file)
  )
}

async function init() {
  console.log()
  /**
   * 展示 Vue.js - The Progressive JavaScript Framework
   * 这里判断系统是否可以支持渐变字，如果支持，就使用渐变，不支持就用原始的字
   */
  console.log(
    process.stdout.isTTY && process.stdout.getColorDepth() > 8
      ? banners.gradientBanner
      : banners.defaultBanner
  )
  console.log()

  // 获取当前操作的绝对路径（该文件所在的位置，不拼该文件名称）
  const cwd = process.cwd()

  // possible options:
  // --default
  // --typescript / --ts
  // --jsx
  // --router / --vue-router
  // --pinia
  // --with-tests / --tests (equals to `--vitest --cypress`)
  // --vitest
  // --cypress
  // --nightwatch
  // --playwright
  // --eslint
  // --eslint-with-prettier (only support prettier through eslint for simplicity)
  // --vue-devtools / --devtools
  // --force (for force overwriting)

  // 第一个是 node 的存储地址
  // 第二个是当前文件的绝对路径（完整）
  const args = process.argv.slice(2)

  // alias is not supported by parseArgs
  const options = {
    typescript: { type: 'boolean' },
    ts: { type: 'boolean' },
    'with-tests': { type: 'boolean' },
    tests: { type: 'boolean' },
    'vue-router': { type: 'boolean' },
    router: { type: 'boolean' },
    'vue-devtools': { type: 'boolean' },
    devtools: { type: 'boolean' }
  } as const

  // 使用 node 中 util 提供的 parseArgs 解析命令行参数
  const { values: argv, positionals } = parseArgs({
    args,
    options,
    strict: false
  })

  // 判断传入了哪些 feature flag，传入了之后，就在后面的提问中不出现了
  // if any of the feature flags is set, we would skip the feature prompts
  const isFeatureFlagsUsed =
    typeof (
      argv.default ??
      (argv.ts || argv.typescript) ??
      argv.jsx ??
      (argv.router || argv['vue-router']) ??
      argv.pinia ??
      (argv.tests || argv['with-tests']) ??
      argv.vitest ??
      argv.cypress ??
      argv.nightwatch ??
      argv.playwright ??
      argv.eslint ??
      argv['eslint-with-prettier'] ??
      (argv.devtools || argv['vue-devtools'])
    ) === 'boolean'

  // 取用户要创建的项目的名称
  let targetDir = positionals[0]
  // 如果用户没有传入要创建的项目名称，那么默认为 vue-project
  const defaultProjectName = !targetDir ? 'vue-project' : targetDir
  // 如果要创建的名称重复了，是否要强制覆盖已有的文件
  const forceOverwrite = argv.force

  // 国际化
  const language = getLanguage()

  let result: {
    projectName?: string
    shouldOverwrite?: boolean
    packageName?: string
    needsTypeScript?: boolean
    needsJsx?: boolean
    needsRouter?: boolean
    needsPinia?: boolean
    needsVitest?: boolean
    needsE2eTesting?: false | 'cypress' | 'nightwatch' | 'playwright'
    needsEslint?: boolean
    needsPrettier?: boolean
    needsDevTools?: boolean
  } = {}

  try {
    // Prompts:
    // - Project name:
    //   - whether to overwrite the existing directory or not?
    //   - enter a valid package name for package.json
    // - Project language: JavaScript / TypeScript
    // - Add JSX Support?
    // - Install Vue Router for SPA development?
    // - Install Pinia for state management?
    // - Add Cypress for testing?
    // - Add Nightwatch for testing?
    // - Add Playwright for end-to-end testing?
    // - Add ESLint for code quality?
    // - Add Prettier for code formatting?
    // - Add Vue DevTools 7 extension for debugging? (experimental)
    result = await prompts(
      [
        // 项目名称
        {
          name: 'projectName',
          type: targetDir ? null : 'text',
          message: language.projectName.message,
          initial: defaultProjectName,
          onState: (state) => (targetDir = String(state.value).trim() || defaultProjectName)
        },

        // 通过上一步输入的项目名称，判断文件名是否已经存在，或者文件夹是这个名字，但是没有文件
        // 就可以跳过该提问
        {
          name: 'shouldOverwrite',
          type: () => (canSkipEmptying(targetDir) || forceOverwrite ? null : 'toggle'),
          message: () => {
            const dirForPrompt =
              targetDir === '.'
                ? language.shouldOverwrite.dirForPrompts.current
                : `${language.shouldOverwrite.dirForPrompts.target} "${targetDir}"`

            return `${dirForPrompt} ${language.shouldOverwrite.message}`
          },
          initial: true,
          // 是
          active: language.defaultToggleOptions.active,
          // 否
          inactive: language.defaultToggleOptions.inactive
        },

        // 覆盖检测
        {
          name: 'overwriteChecker',
          type: (prev, values) => {
            // 如果存在了同名的文件，用户选择不覆盖，那么抛出错误
            if (values.shouldOverwrite === false) {
              // 【操作取消】
              throw new Error(red('✖') + ` ${language.errors.operationCancelled}`)
            }
            return null
          }
        },

        // 包名称检查
        // 判断项目的名称是否一个合法的包名称，如果不是一个合法的
        // 把转换完的名称作为默认包名称，并且让用户确认，用户可以用这个修改过的，也可以重新输入
        {
          name: 'packageName',
          type: () => (isValidPackageName(targetDir) ? null : 'text'),
          message: language.packageName.message,
          initial: () => toValidPackageName(targetDir),
          validate: (dir) => isValidPackageName(dir) || language.packageName.invalidMessage
        },

        // 是否需要 TypeScript
        {
          name: 'needsTypeScript',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsTypeScript.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 JSX
        {
          name: 'needsJsx',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsJsx.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 vue-router
        {
          name: 'needsRouter',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsRouter.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 Pinia
        {
          name: 'needsPinia',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsPinia.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 vitest
        {
          name: 'needsVitest',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsVitest.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 e2e 测试
        {
          name: 'needsE2eTesting',
          type: () => (isFeatureFlagsUsed ? null : 'select'),
          hint: language.needsE2eTesting.hint,
          message: language.needsE2eTesting.message,
          initial: 0,
          choices: (prev, answers) => [
            // 【不需要】
            {
              title: language.needsE2eTesting.selectOptions.negative.title,
              value: false
            },
            // 【同时支持基于 Cypress Component Testing 的单元测试】
            {
              title: language.needsE2eTesting.selectOptions.cypress.title,
              description: answers.needsVitest
                ? undefined
                : language.needsE2eTesting.selectOptions.cypress.desc,
              value: 'cypress'
            },
            // 【同时支持基于 Nightwatch Component Testing 的单元测试】
            {
              title: language.needsE2eTesting.selectOptions.nightwatch.title,
              description: answers.needsVitest
                ? undefined
                : language.needsE2eTesting.selectOptions.nightwatch.desc,
              value: 'nightwatch'
            },
            // 【playwright】
            {
              title: language.needsE2eTesting.selectOptions.playwright.title,
              value: 'playwright'
            }
          ]
        },

        // 是否需要 Eslint
        {
          name: 'needsEslint',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsEslint.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 Prettier
        {
          name: 'needsPrettier',
          type: (prev, values) => {
            if (isFeatureFlagsUsed || !values.needsEslint) {
              return null
            }
            return 'toggle'
          },
          message: language.needsPrettier.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        },

        // 是否需要 Dev Tools
        {
          name: 'needsDevTools',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: language.needsDevTools.message,
          initial: false,
          active: language.defaultToggleOptions.active,
          inactive: language.defaultToggleOptions.inactive
        }
      ],

      // 中途退出，提示【操作取消】
      {
        onCancel: () => {
          throw new Error(red('✖') + ` ${language.errors.operationCancelled}`)
        }
      }
    )
  } catch (cancelled) {
    console.log(cancelled.message)
    process.exit(1)
  }

  // `initial` won't take effect if the prompt type is null
  // so we still have to assign the default values here
  const {
    projectName,
    packageName = projectName ?? defaultProjectName,
    shouldOverwrite = argv.force,
    needsJsx = argv.jsx,
    needsTypeScript = argv.ts || argv.typescript,
    needsRouter = argv.router || argv['vue-router'],
    needsPinia = argv.pinia,
    needsVitest = argv.vitest || argv.tests,
    needsEslint = argv.eslint || argv['eslint-with-prettier'],
    needsPrettier = argv['eslint-with-prettier'],
    needsDevTools = argv.devtools || argv['vue-devtools']
  } = result

  const { needsE2eTesting } = result
  const needsCypress = argv.cypress || argv.tests || needsE2eTesting === 'cypress'
  const needsCypressCT = needsCypress && !needsVitest
  const needsNightwatch = argv.nightwatch || needsE2eTesting === 'nightwatch'
  const needsNightwatchCT = needsNightwatch && !needsVitest
  const needsPlaywright = argv.playwright || needsE2eTesting === 'playwright'

  // 要创建的文件夹的路径
  const root = path.join(cwd, targetDir)

  // 如果存在该文件夹，并且要强制覆盖
  if (fs.existsSync(root) && shouldOverwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) { // 不存在就新建
    fs.mkdirSync(root)
  }

  // 【正在初始化项目 [路径]】
  console.log(`\n${language.infos.scaffolding} ${root}...`)

  const pkg = { name: packageName, version: '0.0.0' }
  // 写入包的名称和版本
  fs.writeFileSync(path.resolve(root, 'package.json'), JSON.stringify(pkg, null, 2))

  // todo:
  // work around the esbuild issue that `import.meta.url` cannot be correctly transpiled
  // when bundling for node and the format is cjs
  // const templateRoot = new URL('./template', import.meta.url).pathname
  // 模版的文件夹
  const templateRoot = path.resolve(__dirname, 'template')
  const callbacks = []
  const render = function render(templateName) {
    const templateDir = path.resolve(templateRoot, templateName)
    renderTemplate(templateDir, root, callbacks)
  }

  /**
   * 基于各种配置，像目标文件夹中写入各种文件
   */

  // Render base template
  render('base')

  // Add configs.
  if (needsJsx) {
    render('config/jsx')
  }
  if (needsRouter) {
    render('config/router')
  }
  if (needsPinia) {
    render('config/pinia')
  }
  if (needsVitest) {
    render('config/vitest')
  }
  if (needsCypress) {
    render('config/cypress')
  }
  if (needsCypressCT) {
    render('config/cypress-ct')
  }
  if (needsNightwatch) {
    render('config/nightwatch')
  }
  if (needsNightwatchCT) {
    render('config/nightwatch-ct')
  }
  if (needsPlaywright) {
    render('config/playwright')
  }
  if (needsTypeScript) {
    render('config/typescript')

    // Render tsconfigs
    render('tsconfig/base')
    // The content of the root `tsconfig.json` is a bit complicated,
    // So here we are programmatically generating it.
    const rootTsConfig = {
      // It doesn't target any specific files because they are all configured in the referenced ones.
      files: [],
      // All templates contain at least a `.node` and a `.app` tsconfig.
      references: [
        {
          path: './tsconfig.node.json'
        },
        {
          path: './tsconfig.app.json'
        }
      ]
    }
    if (needsCypress) {
      render('tsconfig/cypress')
      // Cypress uses `ts-node` internally, which doesn't support solution-style tsconfig.
      // So we have to set a dummy `compilerOptions` in the root tsconfig to make it work.
      // I use `NodeNext` here instead of `ES2015` because that's what the actual environment is.
      // (Cypress uses the ts-node/esm loader when `type: module` is specified in package.json.)
      // @ts-ignore
      rootTsConfig.compilerOptions = {
        module: 'NodeNext'
      }
    }
    if (needsCypressCT) {
      render('tsconfig/cypress-ct')
      // Cypress Component Testing needs a standalone tsconfig.
      rootTsConfig.references.push({
        path: './tsconfig.cypress-ct.json'
      })
    }
    if (needsPlaywright) {
      render('tsconfig/playwright')
    }
    if (needsVitest) {
      render('tsconfig/vitest')
      // Vitest needs a standalone tsconfig.
      rootTsConfig.references.push({
        path: './tsconfig.vitest.json'
      })
    }
    if (needsNightwatch) {
      render('tsconfig/nightwatch')
      // Nightwatch needs a standalone tsconfig, but in a different folder.
      rootTsConfig.references.push({
        path: './nightwatch/tsconfig.json'
      })
    }
    if (needsNightwatchCT) {
      render('tsconfig/nightwatch-ct')
    }
    fs.writeFileSync(
      path.resolve(root, 'tsconfig.json'),
      JSON.stringify(rootTsConfig, null, 2) + '\n',
      'utf-8'
    )
  }

  // Render ESLint config
  if (needsEslint) {
    renderEslint(root, {
      needsTypeScript,
      needsCypress,
      needsCypressCT,
      needsPrettier,
      needsPlaywright
    })
    render('config/eslint')
  }

  if (needsPrettier) {
    render('config/prettier')
  }

  if (needsDevTools) {
    render('config/devtools')
  }
  // Render code template.
  // prettier-ignore
  const codeTemplate =
    (needsTypeScript ? 'typescript-' : '') +
    (needsRouter ? 'router' : 'default')
  render(`code/${codeTemplate}`)

  // Render entry file (main.js/ts).
  if (needsPinia && needsRouter) {
    render('entry/router-and-pinia')
  } else if (needsPinia) {
    render('entry/pinia')
  } else if (needsRouter) {
    render('entry/router')
  } else {
    render('entry/default')
  }

  // An external data store for callbacks to share data
  const dataStore = {}
  // Process callbacks
  for (const cb of callbacks) {
    await cb(dataStore)
  }

  // EJS template rendering
  preOrderDirectoryTraverse(
    root,
    () => { },
    (filepath) => {
      if (filepath.endsWith('.ejs')) {
        const template = fs.readFileSync(filepath, 'utf-8')
        const dest = filepath.replace(/\.ejs$/, '')
        const content = ejs.render(template, dataStore[dest])

        fs.writeFileSync(dest, content)
        fs.unlinkSync(filepath)
      }
    }
  )

  // Cleanup.

  // We try to share as many files between TypeScript and JavaScript as possible.
  // If that's not possible, we put `.ts` version alongside the `.js` one in the templates.
  // So after all the templates are rendered, we need to clean up the redundant files.
  // (Currently it's only `cypress/plugin/index.ts`, but we might add more in the future.)
  // (Or, we might completely get rid of the plugins folder as Cypress 10 supports `cypress.config.ts`)

  if (needsTypeScript) {
    // Convert the JavaScript template to the TypeScript
    // Check all the remaining `.js` files:
    //   - If the corresponding TypeScript version already exists, remove the `.js` version.
    //   - Otherwise, rename the `.js` file to `.ts`
    // Remove `jsconfig.json`, because we already have tsconfig.json
    // `jsconfig.json` is not reused, because we use solution-style `tsconfig`s, which are much more complicated.
    preOrderDirectoryTraverse(
      root,
      () => { },
      (filepath) => {
        if (filepath.endsWith('.js')) {
          const tsFilePath = filepath.replace(/\.js$/, '.ts')
          if (fs.existsSync(tsFilePath)) {
            fs.unlinkSync(filepath)
          } else {
            fs.renameSync(filepath, tsFilePath)
          }
        } else if (path.basename(filepath) === 'jsconfig.json') {
          fs.unlinkSync(filepath)
        }
      }
    )

    // Rename entry in `index.html`
    const indexHtmlPath = path.resolve(root, 'index.html')
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8')
    // 将 html 中的入口文件重名名为 ts 后缀的
    fs.writeFileSync(indexHtmlPath, indexHtmlContent.replace('src/main.js', 'src/main.ts'))
  } else {
    // Remove all the remaining `.ts` files
    preOrderDirectoryTraverse(
      root,
      () => { },
      (filepath) => {
        if (filepath.endsWith('.ts')) {
          fs.unlinkSync(filepath)
        }
      }
    )
  }

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

  // README generation
  // 写入 README 文件
  fs.writeFileSync(
    path.resolve(root, 'README.md'),
    generateReadme({
      projectName: result.projectName ?? result.packageName ?? defaultProjectName,
      packageManager,
      needsTypeScript,
      needsVitest,
      needsCypress,
      needsNightwatch,
      needsPlaywright,
      needsNightwatchCT,
      needsCypressCT,
      needsEslint
    })
  )

  // 【项目初始化完成，可执行以下命令：】
  console.log(`\n${language.infos.done}\n`)
  if (root !== cwd) {
    const cdProjectName = path.relative(cwd, root)
    console.log(
      `  ${bold(green(`cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName}`))}`
    )
  }
  console.log(`  ${bold(green(getCommand(packageManager, 'install')))}`)
  if (needsPrettier) {
    console.log(`  ${bold(green(getCommand(packageManager, 'format')))}`)
  }
  console.log(`  ${bold(green(getCommand(packageManager, 'dev')))}`)
  console.log()
}

init().catch((e) => {
  console.error(e)
})
