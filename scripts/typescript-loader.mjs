import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const SOURCE_EXTENSIONS = ['.ts', '.tsx']

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      throw error
    }

    for (const extension of SOURCE_EXTENSIONS) {
      try {
        return await nextResolve(`${specifier}${extension}`, context)
      } catch {
        continue
      }
    }

    throw error
  }
}

export async function load(url, context, nextLoad) {
  if (!SOURCE_EXTENSIONS.some((extension) => url.endsWith(extension))) {
    return nextLoad(url, context)
  }

  const source = await readFile(new URL(url), 'utf8')
  const transformed = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: true,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: false,
    },
    fileName: url,
  })

  return {
    format: 'module',
    source: transformed.outputText,
    shortCircuit: true,
  }
}
